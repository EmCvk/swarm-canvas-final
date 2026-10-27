// src/api/civitaiService.ts

export type CivitaiAssetType = 'model' | 'lora' | 'embedding';

/** A newer version of an already-matched model, as found by the update check. */
export interface CivitaiUpdateInfo {
  versionId: number;
  versionName: string;
  baseModel?: string;
  url: string;
  checkedAt: number;
}

/** One possible Civitai match offered to the user when the automatic match is missing or wrong. */
export interface CivitaiCandidate {
  modelId: number;
  versionId: number;
  modelName: string;
  versionName: string;
  baseModel?: string;
  modelType?: string;
  /** Rough similarity to the local file name, 0-130. */
  score: number;
  previewUrl?: string;
  url: string;
  /** False when the base model is from another architecture than the rest of the library. */
  baseAllowed: boolean;
}

export interface CivitaiLookupHints {
  sha256?: string;
  blake3?: string;
  crc32?: string;
  autoV1?: string;
  autoV2?: string;
  autoV3?: string;
  hash?: string;
  modelId?: number;
  versionId?: number;
}

export interface CivitaiMetadataBatchItem {
  filename: string;
  type: CivitaiAssetType;
  hints?: CivitaiLookupHints;
}

export interface CivitaiMetadataResult {
  previewUrl?: string;
  previewUrls?: string[];
  triggerWords?: string[];
  description?: string;
  modelId?: number;
  versionId?: number;
  versionName?: string;
  modelName?: string;
  baseModel?: string;
  fileName?: string;
  matchedBy?: 'version-id' | 'model-id' | 'hash' | 'filename' | 'model-name' | 'manual-url';
  confidence?: number;
  civitaiUrl?: string;
  completeness?: number;
}

const CIVITAI_API = 'https://civitai.com/api/v1';
const PERSISTED_CACHE_KEY = 'swarm_civitai_metadata_v4';
const PERSISTED_LIBRARY_KEY = 'swarm_civitai_library_v1';
const PERSISTED_FAILURES_KEY = 'swarm_civitai_failures_v1';
const PERSISTED_CACHE_LIMIT = 1500;
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Civitai files LoCon / DoRA under their own `type` values, but local LoRA folders
// contain all of them. Searching only for `LORA` silently dropped those models.
const CIVITAI_TYPE_MAP: Record<CivitaiAssetType, string[]> = {
  model: ['Checkpoint'],
  lora: ['LORA', 'LoCon', 'DoRA'],
  embedding: ['TextualInversion'],
};
const PERSISTED_API_KEY = 'swarm_civitai_api_key_v1';
const MODEL_FILE_EXT = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf)$/i;
const MIN_REQUEST_GAP_MS = 220;
// A guessed (name-based) match needs at least this score out of ~130. The old bar of 60 accepted
// any two models sharing a common word.
const MIN_FUZZY_SCORE = 78;
const ACCEPTED_BASES_KEY = 'swarm_civitai_accepted_bases_v1';
const MATCHER_VERSION_KEY = 'swarm_civitai_matcher_version';
const MATCHER_VERSION = '2';
const UPDATES_KEY = 'swarm_civitai_updates_v1';
const modelRecordCache = new Map<number, { at: number; model: any }>();

const metadataCache = new Map<string, CivitaiMetadataResult | null>();
const searchCache = new Map<string, any[]>();
const previewCache = new Map<string, string[]>();

type PersistedEntry = {
  type: CivitaiAssetType;
  filename: string;
  savedAt: number;
  result: CivitaiMetadataResult | null;
};

type FailureEntry = { type: CivitaiAssetType; filename: string; savedAt: number; reason: string; attempts: number; failureReason?: string; status?: 'unresolved' | 'temporarily_failed'; civitaiUrl?: string; };
type LibraryLink = { type: CivitaiAssetType; filename: string; civitaiUrl?: string; updatedAt: number; };

function readJsonStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as T : fallback;
  } catch { return fallback; }
}

function writeJsonStore<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function failureKey(filename: string, type: CivitaiAssetType): string { return `${type}:${filename.trim().toLowerCase()}`; }

function rememberFailure(filename: string, type: CivitaiAssetType, reason: string): void {
  const failures = readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {});
  const key = failureKey(filename, type);
  const previous = failures[key];
  failures[key] = { type, filename, savedAt: Date.now(), reason, failureReason: reason, status: /rate|timeout|network|fetch/i.test(reason) ? 'temporarily_failed' : 'unresolved', attempts: (previous?.attempts || 0) + 1, civitaiUrl: getManualUrl(filename, type) };
  writeJsonStore(PERSISTED_FAILURES_KEY, failures);
}

function clearFailure(filename: string, type: CivitaiAssetType): void {
  const failures = readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {});
  delete failures[failureKey(filename, type)];
  writeJsonStore(PERSISTED_FAILURES_KEY, failures);
}

function persistentKey(filename: string, type: CivitaiAssetType): string {
  return `${type}:${filename.trim().toLowerCase()}`;
}

function readPersistentCache(): Record<string, PersistedEntry> {
  try {
    const raw = localStorage.getItem(PERSISTED_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PersistedEntry>;
  } catch {
    return {};
  }
}

function writePersistentCache(cache: Record<string, PersistedEntry>): void {
  try {
    localStorage.setItem(PERSISTED_CACHE_KEY, JSON.stringify(cache));
    return;
  } catch {
    // QuotaExceededError is common when history/galleries are also persisted.
    // Remove oldest entries progressively until the compact metadata cache fits.
  }

  const entries = Object.entries(cache).sort((a, b) => (a[1]?.savedAt || 0) - (b[1]?.savedAt || 0));
  while (entries.length > 50) {
    entries.splice(0, Math.min(50, entries.length - 50));
    try {
      localStorage.setItem(PERSISTED_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
      return;
    } catch {
      // Keep trimming below.
    }
  }
}

function getPersistedMetadata(filename: string, type: CivitaiAssetType): CivitaiMetadataResult | null | undefined {
  const entry = readPersistentCache()[persistentKey(filename, type)];
  if (!entry) return undefined;
  if (!entry.savedAt || Date.now() - entry.savedAt > CACHE_TTL_MS) return undefined;
  // The user's chosen URL is authoritative: a stored result for another model/version is ignored.
  if (conflictsWithManual(filename, type, entry.result)) return undefined;
  // A stored guess that no longer passes the current rules is treated as not fetched.
  if (entry.result?.matchedBy && FUZZY_MATCHES.has(entry.result.matchedBy)
    && ((entry.result.confidence ?? 0) < MIN_FUZZY_SCORE || !baseModelAllowed(entry.result.baseModel))) return undefined;
  return entry.result ? { ...entry.result, completeness: completenessOf(entry.result, type) } : entry.result;
}

function getManualUrl(filename: string, type: CivitaiAssetType): string | undefined {
  return readJsonStore<Record<string, LibraryLink>>(PERSISTED_LIBRARY_KEY, {})[persistentKey(filename, type)]?.civitaiUrl;
}

function saveManualUrl(filename: string, type: CivitaiAssetType, url?: string): void {
  const library = readJsonStore<Record<string, LibraryLink>>(PERSISTED_LIBRARY_KEY, {});
  const key = persistentKey(filename, type);
  if (!url) delete library[key];
  else library[key] = { type, filename, civitaiUrl: url, updatedAt: Date.now() };
  writeJsonStore(PERSISTED_LIBRARY_KEY, library);
}

/** Accepts any Civitai host (civitai.com, civitai.red, ...) and the common link shapes:
 *  /models/<id>[/slug][?modelVersionId=<id>], /model-versions/<id>, /api/download/models/<id>, or a bare number. */
function parseCivitaiUrl(raw: string): { modelId?: number; versionId?: number } {
  const url = String(raw || '').trim();
  if (!url) return {};
  if (/^\d+$/.test(url)) return { modelId: Number(url) };
  const out: { modelId?: number; versionId?: number } = {};
  // AIR URN, e.g. urn:air:anima:lora:civitai:624765@3329023
  const air = url.match(/urn:air:[^:\s]+:[^:\s]+:civitai:(\d+)(?:@(\d+))?/i);
  if (air) {
    out.modelId = Number(air[1]);
    if (air[2]) out.versionId = Number(air[2]);
    return out;
  }
  const model = url.match(/civitai\.[a-z]+\/models\/(\d+)/i);
  if (model) out.modelId = Number(model[1]);
  const versionPath = url.match(/civitai\.[a-z]+\/(?:model-versions|api\/download\/models)\/(\d+)/i);
  if (versionPath) out.versionId = Number(versionPath[1]);
  const versionQuery = url.match(/[?&]modelVersionId=(\d+)/i);
  if (versionQuery) out.versionId = Number(versionQuery[1]);
  return out;
}

function completenessOf(result: CivitaiMetadataResult | null | undefined, _type?: CivitaiAssetType): number {
  if (!result) return 0;
  // Only fields Civitai always provides for a real match count. Trigger words and descriptions are
  // legitimately empty for many checkpoints and style LoRAs, so requiring them left correctly
  // matched assets stuck at 80-83% ("partial") and re-fetched on every sync.
  const checks = [Boolean(result.modelId), Boolean(result.versionId), Boolean(result.baseModel), Boolean(result.previewUrl || result.previewUrls?.length)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function persistMetadata(filename: string, type: CivitaiAssetType, result: CivitaiMetadataResult | null): void {
  if (result && result.matchedBy !== 'manual-url' && conflictsWithManual(filename, type, result)) return;
  const cache = readPersistentCache();
  cache[persistentKey(filename, type)] = {
    type,
    filename,
    savedAt: Date.now(),
    result: result ? { ...result, completeness: completenessOf(result, type) } : null,
  };
  if (result) result.completeness = completenessOf(result, type);
  clearFailure(filename, type);
  familyCache.at = 0;

  const entries = Object.entries(cache);
  if (entries.length > PERSISTED_CACHE_LIMIT) {
    entries.sort((a, b) => (a[1]?.savedAt || 0) - (b[1]?.savedAt || 0));
    for (const [key] of entries.slice(0, entries.length - PERSISTED_CACHE_LIMIT)) {
      delete cache[key];
    }
  }

  writePersistentCache(cache);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(MODEL_FILE_EXT, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function tokens(value: string): string[] {
  return Array.from(new Set(normalize(value).split(' ').filter((t) => t.length >= 2)));
}

function baseFilename(value: string): string {
  return value.split(/[\\/]/).pop()?.replace(MODEL_FILE_EXT, '') || value;
}

function stripVersionNoise(value: string): string {
  return normalize(value)
    .replace(/\b(v\d+(?:\.\d+)*|\d+(?:\.\d+)*v|\d{3,}|fp16|fp32|bf16|pruned|ema|safetensors|checkpoint|model|base|final|official|master)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  aa.forEach((t) => {
    if (bb.has(t)) common++;
  });
  return common / Math.max(aa.size, bb.size);
}

function cleanDescription(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = Array.from(new Set(value.map((v) => String(v).trim()).filter(Boolean)));
  return result.length ? result : undefined;
}

function normalizePreviewUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const clean = url.trim();
  if (!clean) return undefined;

  if (clean.includes('image.civitai.com')) {
    if (/\/width=\d+\//i.test(clean)) return clean.replace(/\/width=\d+\//i, '/width=640/');
    if (/\/original=true\//i.test(clean)) return clean.replace(/\/original=true\//i, '/width=640/');
  }
  return clean;
}

const VIDEO_URL = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
/** Civitai galleries mix videos in with images; a card thumbnail can only show a still image. */
function isVideoEntry(image: any): boolean {
  return image?.type === 'video' || VIDEO_URL.test(String(image?.url || ''));
}

function collectImages(model: any, version: any): string[] {
  const urls: string[] = [];
  const imageSources = [
    ...(Array.isArray(version?.images) ? version.images : []),
    ...(Array.isArray(model?.images) ? model.images : []),
  ];

  for (const image of imageSources) {
    if (isVideoEntry(image)) continue;
    const url = normalizePreviewUrl(image?.url);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

const MAX_PREVIEWS = 16;
async function fetchGalleryPreviewUrls(modelId?: number, versionId?: number, seed: string[] = [], skipCache = false): Promise<string[]> {
  const initial = Array.from(new Set(seed.filter(Boolean)));
  const cacheKey = `${modelId || 0}:${versionId || 0}`;
  if (skipCache) previewCache.delete(cacheKey);
  const cached = previewCache.get(cacheKey);
  if (cached?.length) return Array.from(new Set([...initial, ...cached])).slice(0, MAX_PREVIEWS);

  const build = (key: 'modelVersionId' | 'modelId', id: number, nsfw: boolean) => {
    const params = new URLSearchParams({ [key]: String(Math.trunc(id)), limit: String(MAX_PREVIEWS), sort: 'Most Reactions' });
    // Without this Civitai only returns SFW images, which leaves many models with one or two previews.
    if (nsfw) params.set('nsfw', 'X');
    return `${CIVITAI_API}/images?${params.toString()}`;
  };
  const scopes: Array<['modelVersionId' | 'modelId', number]> = [];
  if (versionId) scopes.push(['modelVersionId', versionId]);
  if (modelId) scopes.push(['modelId', modelId]);

  const discovered: string[] = [];
  for (const [key, id] of scopes) {
    let data = await fetchJson<any>(build(key, id, true), undefined, 2);
    if (!data) data = await fetchJson<any>(build(key, id, false), undefined, 2); // older API behaviour
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const image of items) {
      if (isVideoEntry(image)) continue;
      const preview = normalizePreviewUrl(image?.url);
      if (preview && !discovered.includes(preview)) discovered.push(preview);
      if (discovered.length >= MAX_PREVIEWS) break;
    }
    if (discovered.length >= MAX_PREVIEWS) break;
  }

  const merged = Array.from(new Set([...initial, ...discovered])).slice(0, MAX_PREVIEWS);
  if (merged.length) previewCache.set(cacheKey, merged);
  return merged;
}

function collectFileHashes(file: any): CivitaiLookupHints {
  const hashes = file?.hashes || {};
  return {
    sha256: hashes.SHA256 || hashes.sha256,
    blake3: hashes.BLAKE3 || hashes.blake3,
    crc32: hashes.CRC32 || hashes.crc32,
    autoV1: hashes.AutoV1 || hashes.autov1,
    autoV2: hashes.AutoV2 || hashes.autov2,
    autoV3: hashes.AutoV3 || hashes.autov3,
  };
}

function candidateQueries(filename: string): string[] {
  const stem = baseFilename(filename);
  const camelSpaced = stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const clean = normalize(camelSpaced);
  const core = stripVersionNoise(camelSpaced);
  const noWeight = clean.replace(/\b(?:v\d+|fp16|fp32|bf16|pruned|ema)\b/gi, ' ').replace(/\s+/g, ' ').trim();

  const result = [clean, noWeight, core];
  const ordered = tokens(core || clean)
    .filter((t) => !/^(anime|model|checkpoint|lora|embedding|safetensors|base|final|official)$/i.test(t));
  const meaningful = [...ordered].sort((a, b) => b.length - a.length);

  // Local file names often carry the author's own prefix/suffix; try the leading and
  // trailing token runs in original order as well as the longest tokens.
  if (ordered.length >= 3) {
    result.push(ordered.slice(0, 3).join(' '));
    result.push(ordered.slice(-3).join(' '));
  }
  if (meaningful.length >= 2) {
    result.push(meaningful.slice(0, 6).join(' '));
    result.push(meaningful.slice(-4).join(' '));
  }
  if (meaningful[0]) result.push(meaningful[0]);

  return Array.from(new Set(result)).filter((q) => q.length >= 3).slice(0, 8);
}


function extractCivitaiIds(filename: string): { modelId?: number; versionId?: number } {
  const text = String(filename || '');
  const pairs = [
    /civitai(?::|[_-]?model)?[_-]?(\d+)@(?:version[_-]?)?(\d+)/i,
    /civitai[^0-9]{0,12}(\d+)[^0-9]{1,4}(\d+)/i,
    /(?:model|version)[_-]?(\d{4,})/gi,
  ];
  for (const re of pairs) {
    const match = re.exec(text);
    if (!match) continue;
    if (re === pairs[2]) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) {
        if (/version/i.test(match[0])) return { versionId: n };
        return { modelId: n };
      }
    } else {
      const modelId = Number(match[1]);
      const versionId = Number(match[2]);
      return {
        modelId: Number.isFinite(modelId) ? modelId : undefined,
        versionId: Number.isFinite(versionId) ? versionId : undefined,
      };
    }
  }
  return {};
}

function boundaryContains(hay: string, needle: string): boolean {
  return needle.length > 0 && ` ${hay} `.includes(` ${needle} `);
}

/** How much of the longer name the shorter one covers (0..1), counting only whole-word containment of a
 *  reasonably long string. Plain substring checks let "style" match "Anime Style Mix". */
function meaningfulContainment(aNorm: string, bNorm: string): number {
  const [short, long] = aNorm.length <= bNorm.length ? [aNorm, bNorm] : [bNorm, aNorm];
  const shortCompact = short.replace(/\s+/g, '');
  const longCompact = long.replace(/\s+/g, '');
  if (shortCompact.length < 5 || !longCompact.length) return 0;
  if (!boundaryContains(long, short)) return 0;
  // The part of the longer name that the shorter one does not cover may only be version-like noise
  // ("v2", "final"). A distinctive extra word ("hilde") means these are different models.
  const shortTokens = new Set(tokens(short));
  const extra = tokens(stripVersionNoise(long)).filter((t) => !shortTokens.has(t) && t.length >= 4 && !GENERIC_TOKENS.has(t) && !/^\d+$/.test(t));
  if (extra.length) return 0;
  return shortCompact.length / longCompact.length;
}

const GENERIC_TOKENS = new Set(['anime', 'style', 'lora', 'model', 'art', 'illustration', 'detail', 'details', 'character', 'concept', 'xl', 'sdxl', 'pony', 'illustrious', 'noobai', 'anima', 'checkpoint', 'version', 'final', 'base', 'mix', 'real', 'realistic', 'girl', 'boy']);

/** The most distinctive word(s) of the local file must show up somewhere in the candidate. */
function hasDistinctiveOverlap(filename: string, model: any, version: any): boolean {
  const own = tokens(stripVersionNoise(baseFilename(filename))).filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t) && !/^\d+$/.test(t));
  if (!own.length) return true;
  const candidate = [model?.name, version?.name, ...(version?.files || []).map((f: any) => baseFilename(String(f?.name || '')))]
    .map((v) => normalize(String(v || '')).replace(/\s+/g, ''))
    .join('|');
  return own.some((t) => candidate.includes(t.replace(/\s+/g, '')));
}

const FUZZY_MATCHES = new Set(['filename', 'model-name']);
const isLegacyBase = (base?: string) => /^sd\s?[12](?:[.\s]|$)/i.test(String(base || '').trim());
let familyCache: { at: number; dominant: string | null; exclude: boolean } = { at: 0, dominant: null, exclude: false };

/** Coarse architecture family of a Civitai base-model label, so "Illustrious" and "Anima" are told apart. */
function baseFamily(base?: string): string {
  const b = String(base || '').trim().toLowerCase();
  if (!b) return '';
  if (/^anima(?![a-z])/.test(b)) return 'anima';
  if (/^sd\s?1/.test(b)) return 'sd1';
  if (/^sd\s?2/.test(b)) return 'sd2';
  if (/^sd\s?3/.test(b)) return 'sd3';
  if (/flux/.test(b)) return 'flux';
  if (/pony|illustrious|noobai|animagine|sdxl|\bxl\b/.test(b)) return 'sdxl';
  return b.split(/[\s.]/)[0];
}

/** What the user's own library looks like, judged only from trusted matches (checkpoints, manual URLs, hashes, ids). */
function libraryProfile(): { dominant: string | null; exclude: boolean } {
  if (Date.now() - familyCache.at < 15000) return familyCache;
  const counts = new Map<string, number>();
  let total = 0;
  let legacy = 0;
  let modern = 0;
  for (const entry of Object.values(readPersistentCache())) {
    const r = entry?.result;
    if (!r?.baseModel) continue;
    const trusted = entry.type === 'model' || (r.matchedBy && !FUZZY_MATCHES.has(r.matchedBy));
    if (!trusted) continue;
    const family = baseFamily(r.baseModel);
    if (!family) continue;
    counts.set(family, (counts.get(family) || 0) + 1);
    total++;
    if (isLegacyBase(r.baseModel)) legacy++; else modern++;
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  // A family only "dominates" with enough evidence, so mixed libraries are not restricted.
  const dominant = top && total >= 3 && top[1] / total >= 0.7 ? top[0] : null;
  familyCache = { at: Date.now(), dominant, exclude: modern > legacy };
  return familyCache;
}

function getAcceptedBases(): string[] {
  try { return (localStorage.getItem(ACCEPTED_BASES_KEY) || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean); } catch { return []; }
}

function baseModelAllowed(baseModel?: string): boolean {
  const base = String(baseModel || '').trim();
  if (!base) return true;
  const accepted = getAcceptedBases();
  if (accepted.length) return accepted.some((entry) => base.toLowerCase().includes(entry));
  const profile = libraryProfile();
  const family = baseFamily(base);
  if (profile.dominant && family && family !== profile.dominant) return false;
  return !(isLegacyBase(base) && profile.exclude);
}

/** A manually chosen URL always wins: stored or fetched results for a different model/version are not used. */
function conflictsWithManual(filename: string, type: CivitaiAssetType, result: CivitaiMetadataResult | null | undefined): boolean {
  if (!result) return false;
  const manual = getManualUrl(filename, type);
  if (!manual) return false;
  const ids = parseCivitaiUrl(manual);
  if (ids.versionId && result.versionId && result.versionId !== ids.versionId) return true;
  if (ids.modelId && result.modelId && result.modelId !== ids.modelId) return true;
  return false;
}

/** Removes guessed matches (kept: manual URLs, hash, version-id and model-id matches). Returns how many. */
function purgeGuessedMatches(): number {
  const cache = readPersistentCache();
  let removed = 0;
  for (const [key, entry] of Object.entries(cache)) {
    if (entry?.result?.matchedBy && FUZZY_MATCHES.has(entry.result.matchedBy)) { delete cache[key]; removed++; }
  }
  if (removed) writePersistentCache(cache);
  familyCache = { at: 0, dominant: null, exclude: false };
  return removed;
}

function migrateMatcherOnce(): void {
  try {
    if (localStorage.getItem(MATCHER_VERSION_KEY) === MATCHER_VERSION) return;
    purgeGuessedMatches();
    localStorage.setItem(MATCHER_VERSION_KEY, MATCHER_VERSION);
  } catch {}
}

function scoreVersion(stem: string, cleanCore: string, model: any, version: any): number {
  const target = normalize(stem);
  const core = normalize(cleanCore || stem);
  const targetCompact = compact(stem);
  let best = 0;

  const modelName = String(model?.name || '');
  const versionName = String(version?.name || '');
  if (modelName && compact(modelName) === targetCompact) best = Math.max(best, 130);
  if (versionName && compact(versionName) === targetCompact) best = Math.max(best, 126);
  if (modelName && normalize(modelName) === target) best = Math.max(best, 120);
  if (versionName && normalize(versionName) === target) best = Math.max(best, 116);

  for (const file of version?.files || []) {
    const fileName = baseFilename(String(file?.name || ''));
    const normalizedFile = normalize(fileName);
    const compactFile = compact(fileName);
    if (!normalizedFile) continue;
    if (compactFile === targetCompact) best = Math.max(best, 130);
    else if (normalizedFile === target) best = Math.max(best, 125);
    else {
      const coverage = meaningfulContainment(normalizedFile, target);
      if (coverage >= 0.6) best = Math.max(best, Math.round(70 + 38 * coverage));
      else best = Math.max(best, tokenOverlap(target, normalizedFile) * 100);
    }
  }

  if (modelName) {
    const modelNorm = normalize(modelName);
    const modelCore = stripVersionNoise(modelName);
    if (compact(modelCore) === compact(core)) best = Math.max(best, 115);
    const modelCoverage = modelNorm && core ? meaningfulContainment(modelNorm, core) : 0;
    if (modelCoverage >= 0.6) best = Math.max(best, Math.round(60 + 36 * modelCoverage));
    best = Math.max(best, tokenOverlap(core, modelName) * 88);
  }
  if (versionName) {
    const versionCore = stripVersionNoise(versionName);
    best = Math.max(best, tokenOverlap(core, versionCore) * 84);
  }

  return Math.round(best);
}


function scoreModelNameOnly(filename: string, model: any): number {
  const stem = baseFilename(filename);
  const core = stripVersionNoise(stem);
  const target = normalize(stem);
  const targetCompact = compact(stem);
  const modelName = String(model?.name || '');
  if (!modelName) return 0;
  const modelNorm = normalize(modelName);
  const modelCompact = compact(modelName);
  if (modelCompact === targetCompact) return 130;
  if (modelNorm === target) return 120;
  const coverage = meaningfulContainment(modelNorm, target);
  if (coverage >= 0.6) return Math.round(60 + 36 * coverage);
  const modelCore = stripVersionNoise(modelName);
  if (compact(modelCore) === compact(core)) return 115;
  return Math.max(tokenOverlap(core, modelName) * 88, tokenOverlap(target, modelName) * 72);
}

function pickVersion(model: any, filename: string, enforceBase = true): { version: any | null; score: number } {
  const allVersions = Array.isArray(model?.modelVersions) ? model.modelVersions : [];
  // Skip versions built for an unrelated architecture (e.g. SD 1.5 LoRAs for an Anima/SDXL library).
  const versions = enforceBase ? allVersions.filter((v: any) => baseModelAllowed(v?.baseModel)) : allVersions;
  if (!versions.length) return { version: null, score: 0 };

  const stem = baseFilename(filename);
  const core = stripVersionNoise(stem);
  let bestVersion: any | null = null;
  let bestScore = 0;

  for (const version of versions) {
    const score = scoreVersion(stem, core, model, version);
    if (score > bestScore) {
      bestScore = score;
      bestVersion = version;
    }
  }

  if (enforceBase && bestVersion && bestScore < 100 && !hasDistinctiveOverlap(filename, model, bestVersion)) {
    bestScore = Math.min(bestScore, 40);
  }
  return { version: bestVersion, score: bestScore };
}

// Counts requests that failed for transient reasons (network, timeout, 429, 5xx).
// fetchMetadata compares this before/after a lookup so a rate-limited miss is
// reported as "temporarily failed" instead of "no match".
let transientFailureCount = 0;
let lastRequestAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

function getApiKey(): string {
  try { return (localStorage.getItem(PERSISTED_API_KEY) || '').trim(); } catch { return ''; }
}

function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  throttleChain = next.catch(() => undefined);
  return next;
}

async function fetchJson<T>(url: string, init?: RequestInit, retries = 3): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const apiKey = getApiKey();
      const response = await fetch(url, {
        cache: 'no-store',
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(init?.headers || {}) },
      });

      if (response.ok) return await response.json() as T;
      const transient = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient) return null;
      if (attempt >= retries) { transientFailureCount += 1; return null; }

      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(10000, retryAfter * 1000)
        : 600 * (2 ** attempt);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    } catch {
      if (attempt >= retries) { transientFailureCount += 1; return null; }
      await new Promise((resolve) => window.setTimeout(resolve, 600 * (2 ** attempt)));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return null;
}

async function lookupByHash(hash: string): Promise<CivitaiMetadataResult | null> {
  const clean = String(hash || '').trim().replace(/^0x/i, '');
  if (!clean) return null;

  const data = await fetchJson<any>(`${CIVITAI_API}/model-versions/by-hash/${encodeURIComponent(clean)}`);
  if (!data?.id) return null;

  const model = data.model || {};
  const modelId = Number(data.modelId || model.id) || undefined;
  const versionId = Number(data.id) || undefined;
  const images = await fetchGalleryPreviewUrls(modelId, versionId, collectImages(model, data));
  return {
    previewUrl: images[0],
    previewUrls: images,
    triggerWords: toStringArray(data.trainedWords),
    description: cleanDescription(model.description || data.description),
    modelId,
    versionId,
    versionName: data.name,
    modelName: model.name,
    baseModel: data.baseModel,
    fileName: data.files?.find((f: any) => f.primary)?.name || data.files?.[0]?.name,
    matchedBy: 'hash',
    confidence: 100,
  };
}

async function buildMetadataResult(model: any, version: any, matchedBy: CivitaiMetadataResult['matchedBy'], confidence: number): Promise<CivitaiMetadataResult> {
  const modelId = Number(model?.id || version?.modelId) || undefined;
  const versionId = Number(version?.id) || undefined;
  const images = await fetchGalleryPreviewUrls(modelId, versionId, collectImages(model, version));
  const primaryFile = version?.files?.find((f: any) => f.primary) || version?.files?.[0];
  return {
    previewUrl: images[0],
    previewUrls: images,
    triggerWords: toStringArray(version?.trainedWords),
    description: cleanDescription(model?.description || version?.description),
    modelId,
    versionId,
    versionName: version?.name,
    modelName: model?.name,
    baseModel: version?.baseModel,
    fileName: primaryFile?.name,
    matchedBy,
    confidence,
    civitaiUrl: model?.civitaiUrl,
    completeness: completenessOf({ modelId, versionId, baseModel: version?.baseModel, previewUrl: images[0], previewUrls: images, triggerWords: toStringArray(version?.trainedWords), description: cleanDescription(model?.description || version?.description) }),
  };
}

async function enrichVersion(version: any, model?: any): Promise<{ version: any; model: any }> {
  if (!version?.id) return { version, model };
  const detailed = await fetchJson<any>(`${CIVITAI_API}/model-versions/${Number(version.id)}`);
  if (!detailed) return { version, model };
  return { version: detailed, model: detailed.model || model };
}

function isCompatibleModelType(model: any, type: CivitaiAssetType): boolean {
  const modelType = String(model?.type || '').toLowerCase().replace(/[_\s-]/g, '');
  if (!modelType) return true;
  if (type === 'model') return modelType === 'checkpoint';
  if (type === 'lora') return modelType === 'lora' || modelType === 'locon' || modelType === 'dora';
  return modelType === 'textualinversion' || modelType === 'embedding';
}

async function searchModels(query: string, type: CivitaiAssetType | null, page: number): Promise<any[] | null> {
  const cacheKey = `${type || 'all'}|${query.toLowerCase()}|p${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;
  // nsfw=true is essential: without it Civitai silently hides every NSFW-flagged model
  // from search results, which covers a large share of anime/illustration checkpoints.
  const params = new URLSearchParams({ query, limit: '100', nsfw: 'true' });
  if (type) for (const t of CIVITAI_TYPE_MAP[type]) params.append('types', t);
  if (page > 1) params.set('page', String(page));
  const data = await fetchJson<any>(`${CIVITAI_API}/models?${params.toString()}`);
  if (!data) return null; // do not cache failures
  const items = Array.isArray(data.items) ? data.items : [];
  searchCache.set(cacheKey, items);
  return items;
}

function updateKey(filename: string, type: CivitaiAssetType): string {
  return `${type}:${String(filename || '').replace(/\\/g, '/').trim().toLowerCase()}`;
}

function versionTime(version: any): number {
  const t = Date.parse(String(version?.publishedAt || version?.createdAt || ''));
  return Number.isFinite(t) ? t : 0;
}

/** True when `candidate` was released after `current` (publish time first, id as the tie-breaker). */
function isNewerVersion(candidate: any, current: any): boolean {
  const a = versionTime(candidate);
  const b = versionTime(current);
  if (a && b && a !== b) return a > b;
  return Number(candidate?.id) > Number(current?.id);
}

async function fetchModelRecord(modelId: number): Promise<any | null> {
  const cached = modelRecordCache.get(modelId);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.model;
  const model = await fetchJson<any>(`${CIVITAI_API}/models/${modelId}`);
  if (model?.id) modelRecordCache.set(modelId, { at: Date.now(), model });
  return model?.id ? model : null;
}

export const civitaiService = {
  cleanModelName(filename: string): string {
    return baseFilename(filename)
      .replace(/\.(safetensors|ckpt|pt|bin)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  },

  clearCache() {
    metadataCache.clear();
    searchCache.clear();
    previewCache.clear();
  },

  getPersistedMetadata(filename: string, type: CivitaiAssetType): CivitaiMetadataResult | null | undefined {
    return getPersistedMetadata(filename, type);
  },

  async prefetchBySha256(items: CivitaiMetadataBatchItem[]): Promise<void> {
    const lookup = new Map<string, CivitaiMetadataBatchItem[]>();
    for (const item of items) {
      const sha256 = String(item.hints?.sha256 || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sha256)) continue;
      if (getManualUrl(item.filename, item.type)) continue; // manually chosen metadata is never replaced by sync
      const bucket = lookup.get(sha256) || [];
      bucket.push(item);
      lookup.set(sha256, bucket);
    }

    const hashes = Array.from(lookup.keys());
    if (!hashes.length) return;

    for (let offset = 0; offset < hashes.length; offset += 100) {
      const chunk = hashes.slice(offset, offset + 100);
      try {
        const data = await fetchJson<any[]>(`${CIVITAI_API}/model-versions/by-hash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        }, 2);
        if (!Array.isArray(data)) continue;

        for (const version of data) {
          const model = version?.model || {};
          const files = Array.isArray(version?.files) ? version.files : [];
          const matchedHashes = new Set<string>();
          for (const file of files) {
            const fileSha = String(file?.hashes?.SHA256 || file?.hashes?.sha256 || '').trim().toLowerCase();
            if (fileSha && lookup.has(fileSha)) matchedHashes.add(fileSha);
          }

          for (const hash of matchedHashes) {
            for (const item of lookup.get(hash) || []) {
              if (!isCompatibleModelType(model, item.type)) continue;
              const result = await buildMetadataResult(model, version, 'hash', 100);
              const key = JSON.stringify([item.filename, item.type, item.hints || {}]);
              metadataCache.set(key, result);
              persistMetadata(item.filename, item.type, result);
            }
          }
        }
      } catch (err) {
        console.warn('[Civitai] Bulk SHA256 lookup failed; using per-file fallback:', err);
      }
    }
  },

  /** Fetches more gallery images for the model/version this file is already linked to and stores them. */
  async loadMorePreviews(filename: string, type: CivitaiAssetType): Promise<string[] | null> {
    const stored = getPersistedMetadata(filename, type);
    if (!stored?.modelId && !stored?.versionId) return null;
    const seed = [...(stored.previewUrls || []), ...(stored.previewUrl ? [stored.previewUrl] : [])];
    const urls = await fetchGalleryPreviewUrls(stored.modelId, stored.versionId, seed, true);
    if (!urls.length) return null;
    const updated: CivitaiMetadataResult = { ...stored, previewUrls: urls, previewUrl: stored.previewUrl || urls[0] };
    persistMetadata(filename, type, updated);
    metadataCache.clear();
    return urls;
  },

  /** Newer version info stored by the last update check, or undefined when none / already up to date. */
  getUpdateInfo(filename: string, type: CivitaiAssetType, currentVersionId?: number): CivitaiUpdateInfo | undefined {
    const info = readJsonStore<Record<string, CivitaiUpdateInfo>>(UPDATES_KEY, {})[updateKey(filename, type)];
    if (!info || !currentVersionId || info.versionId === currentVersionId) return undefined;
    return info;
  },

  /**
   * Looks the model up on Civitai and reports whether a newer version exists for the same base architecture
   * (so an SD 1.5 release of the same model is not offered as an "update" for an Anima file).
   * 'unknown' means Civitai could not be reached or the model is gone.
   */
  async checkForUpdate(filename: string, type: CivitaiAssetType, modelId: number, versionId: number, baseModel?: string): Promise<{ status: 'update' | 'current' | 'unknown'; info?: CivitaiUpdateInfo }> {
    const model = await fetchModelRecord(modelId);
    const all = (Array.isArray(model?.modelVersions) ? model.modelVersions : []).filter((v: any) => v?.id);
    if (!all.length) return { status: 'unknown' };
    const current = all.find((v: any) => Number(v.id) === versionId);
    const base = baseModel || current?.baseModel;
    const family = base ? baseFamily(base) : '';
    const comparable = family ? all.filter((v: any) => !v.baseModel || baseFamily(v.baseModel) === family) : all;
    let latest: any = null;
    for (const version of comparable) {
      if (!latest || isNewerVersion(version, latest)) latest = version;
    }
    const store = readJsonStore<Record<string, CivitaiUpdateInfo>>(UPDATES_KEY, {});
    const key = updateKey(filename, type);
    const isUpdate = latest && Number(latest.id) !== versionId && (!current || isNewerVersion(latest, current));
    if (!isUpdate) {
      if (store[key]) { delete store[key]; writeJsonStore(UPDATES_KEY, store); }
      return { status: 'current' };
    }
    const info: CivitaiUpdateInfo = {
      versionId: Number(latest.id),
      versionName: String(latest.name || ''),
      baseModel: latest.baseModel,
      url: `https://civitai.com/models/${modelId}?modelVersionId=${latest.id}`,
      checkedAt: Date.now(),
    };
    store[key] = info;
    writeJsonStore(UPDATES_KEY, store);
    return { status: 'update', info };
  },

  async findCandidates(filename: string, type: CivitaiAssetType, options: { query?: string; limit?: number } = {}): Promise<CivitaiCandidate[]> {
    const custom = String(options.query || '').trim();
    const found = new Map<number, { model: any; version: any; score: number; order: number }>();
    let order = 0;
    const consider = (items: any[]) => {
      for (const model of items) {
        const id = Number(model?.id);
        if (!id || !isCompatibleModelType(model, type)) continue;
        const picked = pickVersion(model, filename, false);
        const version = picked.version || (Array.isArray(model.modelVersions) ? model.modelVersions[0] : null);
        if (!version?.id) continue;
        let score = Math.max(picked.version ? picked.score : 0, scoreModelNameOnly(filename, model));
        if (custom) score = Math.max(score, Math.round(tokenOverlap(normalize(custom), normalize(String(model.name || ''))) * 100));
        const previous = found.get(id);
        if (!previous || score > previous.score) found.set(id, { model, version, score, order: previous?.order ?? order++ });
      }
    };

    const urlIds = custom ? parseCivitaiUrl(custom) : {};
    if (urlIds.modelId || urlIds.versionId) {
      // A pasted link/URN is looked up directly.
      let modelId = urlIds.modelId;
      if (!modelId && urlIds.versionId) {
        const v = await fetchJson<any>(`${CIVITAI_API}/model-versions/${urlIds.versionId}`);
        modelId = Number(v?.modelId) || undefined;
      }
      const fullModel = modelId ? await fetchJson<any>(`${CIVITAI_API}/models/${modelId}`) : null;
      if (fullModel?.id) {
        const wanted = urlIds.versionId ? (fullModel.modelVersions || []).find((v: any) => Number(v?.id) === urlIds.versionId) : null;
        found.set(Number(fullModel.id), { model: fullModel, version: wanted || fullModel.modelVersions?.[0], score: 130, order: 0 });
      }
    } else {
      const queries = custom ? [custom] : candidateQueries(filename).slice(0, 5);
      for (const query of queries) {
        const items = await searchModels(query, type, 1);
        if (items) consider(items);
      }
      for (const query of queries.slice(0, 2)) {
        const items = await searchModels(query, null, 1);
        if (items) consider(items);
      }
    }

    const minScore = custom ? 0 : 25;
    return Array.from(found.values())
      .filter((entry) => entry.version?.id && entry.score >= minScore)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, options.limit || 8)
      .map(({ model, version, score }) => {
        const image = (Array.isArray(version.images) ? version.images : []).find((img: any) => img?.url && !isVideoEntry(img));
        return {
          modelId: Number(model.id),
          versionId: Number(version.id),
          modelName: String(model.name || `Model ${model.id}`),
          versionName: String(version.name || ''),
          baseModel: version.baseModel,
          modelType: model.type,
          score: Math.round(Math.min(130, score)),
          previewUrl: normalizePreviewUrl(image?.url),
          url: `https://civitai.com/models/${model.id}?modelVersionId=${version.id}`,
          baseAllowed: baseModelAllowed(version.baseModel),
        };
      });
  },
  async fetchMetadata(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints = {}, options: { force?: boolean } = {}): Promise<CivitaiMetadataResult | null> {
    const key = JSON.stringify([filename, type, hints]);
    const force = Boolean(options.force);
    if (force) metadataCache.delete(key);
    if (!force && metadataCache.has(key)) return metadataCache.get(key) || null;

    const persisted = getPersistedMetadata(filename, type);
    // Only trust a stored result when it is complete. Partial results (e.g. no preview)
    // used to be returned forever, so Refresh never actually looked anything up again.
    if (!force && persisted && (persisted.completeness ?? 0) >= 100) {
      metadataCache.set(key, persisted);
      return persisted;
    }
    const transientBaseline = transientFailureCount;

    try {
      const parsedIds = extractCivitaiIds(filename);
      const resolvedHints = {
        ...hints,
        modelId: hints.modelId || parsedIds.modelId,
        versionId: hints.versionId || parsedIds.versionId,
      };

      const manualUrl = getManualUrl(filename, type);
      if (manualUrl) {
        // The user chose this link explicitly, so it is trusted: no type check, and a failure is
        // reported with its real reason instead of falling back to guessing by file name.
        const ids = parseCivitaiUrl(manualUrl);
        const failBaseline = transientFailureCount;
        let manualFailure = '';
        if (!ids.modelId && !ids.versionId) {
          manualFailure = `The saved URL is not a recognised Civitai link (${manualUrl}). Use a link like https://civitai.com/models/12345`;
        } else {
          let model: any = null;
          let version: any = null;
          if (ids.versionId) {
            const fetched = await fetchJson<any>(`${CIVITAI_API}/model-versions/${ids.versionId}`);
            if (fetched?.id) { version = fetched; model = fetched.model; }
          }
          const modelId = ids.modelId || Number(version?.modelId) || undefined;
          if (modelId && (!model || !Array.isArray(model.modelVersions) || !version)) {
            const fullModel = await fetchJson<any>(`${CIVITAI_API}/models/${modelId}`);
            if (fullModel?.id) {
              model = fullModel;
              if (!version) {
                const picked = pickVersion(fullModel, filename, false);
                version = picked.version || (Array.isArray(fullModel.modelVersions) ? fullModel.modelVersions[0] : null);
              }
            }
          }
          if (version?.id) {
            const enriched = await enrichVersion(version, model || version.model);
            const result = await buildMetadataResult(enriched.model, enriched.version, 'manual-url', 100);
            result.civitaiUrl = manualUrl;
            metadataCache.set(key, result);
            persistMetadata(filename, type, result);
            return result;
          }
          manualFailure = transientFailureCount > failBaseline
            ? 'Civitai did not answer (network error or rate limit) - retry later'
            : `Civitai returned nothing for ${ids.versionId ? `version ${ids.versionId}` : `model ${modelId}`}. It may be removed, private or login-only: add a Civitai API key in the Civitai Meta window and retry`;
        }
        rememberFailure(filename, type, manualFailure);
        return persisted || null;
      }

      const exactHashes = [
        hints.sha256,
        hints.blake3,
        hints.crc32,
        hints.autoV3,
        hints.autoV2,
        hints.autoV1,
        hints.hash,
      ].filter(Boolean) as string[];

      for (const hash of Array.from(new Set(exactHashes))) {
        const result = await lookupByHash(hash);
        if (result) {
          metadataCache.set(key, result);
          persistMetadata(filename, type, result);
          return result;
        }
      }

      if (Number.isFinite(resolvedHints.versionId) && resolvedHints.versionId! > 0) {
        const version = await fetchJson<any>(`${CIVITAI_API}/model-versions/${Math.trunc(resolvedHints.versionId!)}`);
        if (version?.id) {
          const enriched = await enrichVersion(version, version.model);
          const result = await buildMetadataResult(enriched.model, enriched.version, 'version-id', 100);
          metadataCache.set(key, result);
          persistMetadata(filename, type, result);
          return result;
        }
      }

      if (Number.isFinite(resolvedHints.modelId) && resolvedHints.modelId! > 0) {
        const model = await fetchJson<any>(`${CIVITAI_API}/models/${Math.trunc(resolvedHints.modelId!)}`);
        if (model?.id && isCompatibleModelType(model, type)) {
          const picked = pickVersion(model, filename, false);
          if (picked.version) {
            const enriched = await enrichVersion(picked.version, model);
            const result = await buildMetadataResult(enriched.model, enriched.version, 'model-id', Math.max(78, picked.score));
            metadataCache.set(key, result);
            persistMetadata(filename, type, result);
            return result;
          }
        }
      }

      const queries = candidateQueries(filename);
      let best: { model: any; version: any; score: number } | null = null;
      const seen = new Map<number, any>();

      const findBest = (items: any[], current: { model: any; version: any; score: number } | null) => {
        let candidate = current;
        for (const model of items) {
          if (model?.id) seen.set(Number(model.id), model);
          if (!isCompatibleModelType(model, type)) continue;
          const picked = pickVersion(model, filename);
          if (!picked.version) continue;
          if (!candidate || picked.score > candidate.score) {
            candidate = { model, version: picked.version, score: picked.score };
          }
        }
        return candidate;
      };

      // Pass 1: typed search (checkpoint / LORA+LoCon+DoRA / embedding), two pages per query.
      for (const query of queries) {
        for (let page = 1; page <= 2; page++) {
          const items = await searchModels(query, type, page);
          if (!items) break;
          best = findBest(items, best);
          if ((best && best.score >= 108) || items.length < 100) break;
        }
        if (best && best.score >= 108) break;
      }

      // Pass 2: search ignoring the type filter for the strongest queries. Models are sometimes
      // filed under an unexpected type; isCompatibleModelType still guards the result.
      if (!best || best.score < 100) {
        for (const query of queries.slice(0, 4)) {
          const items = await searchModels(query, null, 1);
          if (items) best = findBest(items, best);
          if (best && best.score >= 108) break;
        }
      }

      // Pass 3: fetch full records for the closest names. Search results can omit older or
      // special versions, so the complete version list is checked for a better file match.
      if (!best || best.score < 100) {
        const ordered = Array.from(seen.values())
          .map((model) => ({ model, nameScore: scoreModelNameOnly(filename, model) }))
          .filter((entry) => entry.nameScore >= 52 && isCompatibleModelType(entry.model, type))
          .sort((a, b) => b.nameScore - a.nameScore)
          .slice(0, 6);

        for (const { model: candidate } of ordered) {
          const id = Number(candidate?.id);
          if (!id) continue;
          const fullModel = await fetchJson<any>(`${CIVITAI_API}/models/${id}`);
          if (!fullModel || !isCompatibleModelType(fullModel, type)) continue;
          const picked = pickVersion(fullModel, filename);
          const combined = Math.max(picked.score, scoreModelNameOnly(filename, fullModel));
          if (picked.version && (!best || combined > best.score)) {
            best = { model: fullModel, version: picked.version, score: combined };
          }
          if (best && best.score >= 108) break;
        }
      }

      if (best && best.score >= MIN_FUZZY_SCORE) {
        const enriched = await enrichVersion(best.version, best.model);
        const result = await buildMetadataResult(
          enriched.model,
          enriched.version,
          best.score >= 100 ? 'filename' : 'model-name',
          Math.min(99, best.score),
        );
        metadataCache.set(key, result);
        persistMetadata(filename, type, result);
        return result;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown lookup error';
      console.warn(`[Civitai] Metadata lookup failed for ${filename}:`, err);
      rememberFailure(filename, type, reason);
      return persisted || null;
    }

    // A partial stored result is better than nothing when the refresh could not improve it.
    if (persisted) {
      metadataCache.set(key, persisted);
      return persisted;
    }

    // Distinguish "Civitai never answered" from "answered, but nothing matched" so rate-limited
    // items stay retryable and are not shown as permanently unresolved.
    rememberFailure(
      filename,
      type,
      transientFailureCount > transientBaseline
        ? 'Network error or rate limit while contacting Civitai - retry later'
        : 'No confident Civitai match found - set the model URL manually',
    );

    // Do not cache misses: a temporary API/CORS/rate-limit failure or a newly
    // published Civitai model should be retried on the next manual sync.
    return null;
  },

  getApiKey,
  getAcceptedBases: () => { try { return localStorage.getItem(ACCEPTED_BASES_KEY) || ''; } catch { return ''; } },
  setAcceptedBases(value: string) {
    try {
      const clean = String(value || '').trim();
      if (clean) localStorage.setItem(ACCEPTED_BASES_KEY, clean); else localStorage.removeItem(ACCEPTED_BASES_KEY);
      familyCache.at = 0;
    } catch {}
  },
  clearGuessedMatches: purgeGuessedMatches,
  setApiKey(value: string) {
    try {
      const clean = String(value || '').trim();
      if (clean) localStorage.setItem(PERSISTED_API_KEY, clean);
      else localStorage.removeItem(PERSISTED_API_KEY);
    } catch {}
  },
  getFailure(filename: string, type: CivitaiAssetType): FailureEntry | undefined {
    return readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {})[failureKey(filename, type)];
  },
  searchUrl(filename: string): string {
    return `https://civitai.com/search/models?query=${encodeURIComponent(civitaiService.cleanModelName(filename))}`;
  },
  normalizePreviewUrl,
  collectFileHashes,
  initialize() { return Promise.resolve(); },
  async getCacheLocation() { return 'Browser localStorage + Cache Storage (swarm-canvas-civitai-previews-v1)'; },

  setCivitaiUrl(filename: string, type: CivitaiAssetType, url: string) {
    saveManualUrl(filename, type, url);
  },
  clearCivitaiUrl(filename: string, type: CivitaiAssetType) {
    saveManualUrl(filename, type);
  },
  getCivitaiUrl(filename: string, type: CivitaiAssetType) {
    return getManualUrl(filename, type);
  },
  recordFailure(filename: string, type: CivitaiAssetType, reason: string) {
    rememberFailure(filename, type, reason);
  },
  getLibraryStats() {
    const cache = readPersistentCache();
    const entries = Object.values(cache).filter((e) => e && e.result);
    const score = (e: PersistedEntry) => completenessOf(e.result, e.type);
    return {
      total: entries.length,
      matched: entries.filter((e) => score(e) >= 100).length,
      partial: entries.filter((e) => score(e) > 0 && score(e) < 100).length,
      unresolved: Object.keys(readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {})).length,
      failed: Object.values(readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {})).filter((e) => e.status === 'temporarily_failed').length,
      cachedPreviews: entries.filter((e) => Boolean(e.result?.previewUrl || e.result?.previewUrls?.length)).length,
    };
  },
  getUnresolvedEntries() {
    return Object.values(readJsonStore<Record<string, FailureEntry>>(PERSISTED_FAILURES_KEY, {}));
  },
  removeLibraryEntry(filename: string, type: CivitaiAssetType) {
    const cache = readPersistentCache();
    delete cache[persistentKey(filename, type)];
    writePersistentCache(cache);
    clearFailure(filename, type);
  },
  clearLibrary() {
    try { localStorage.removeItem(PERSISTED_CACHE_KEY); } catch {}
    try { localStorage.removeItem(PERSISTED_LIBRARY_KEY); } catch {}
    try { localStorage.removeItem(PERSISTED_FAILURES_KEY); } catch {}
  },
  exportLibrary() {
    return JSON.stringify({ metadata: readPersistentCache(), links: readJsonStore(PERSISTED_LIBRARY_KEY, {}), failures: readJsonStore(PERSISTED_FAILURES_KEY, {}) }, null, 2);
  },
  importLibrary(raw: string) {
    const parsed = JSON.parse(raw);
    if (parsed?.metadata && typeof parsed.metadata === 'object') writePersistentCache(parsed.metadata);
    if (parsed?.links && typeof parsed.links === 'object') writeJsonStore(PERSISTED_LIBRARY_KEY, parsed.links);
    if (parsed?.failures && typeof parsed.failures === 'object') writeJsonStore(PERSISTED_FAILURES_KEY, parsed.failures);
    return Object.keys(parsed?.metadata || {}).length;
  },
};

migrateMatcherOnce();
