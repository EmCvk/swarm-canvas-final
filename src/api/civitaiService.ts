// src/api/civitaiService.ts

export type CivitaiAssetType = 'model' | 'lora' | 'embedding';

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

const CIVITAI_TYPE_MAP: Record<CivitaiAssetType, string> = {
  model: 'Checkpoint',
  lora: 'LORA',
  embedding: 'TextualInversion',
};

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
  return entry.result;
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

function extractModelIdFromUrl(url: string): number | undefined {
  const m = url.match(/civitai\.com\/models\/(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function completenessOf(result: CivitaiMetadataResult | null | undefined): number {
  if (!result) return 0;
  const checks = [Boolean(result.modelId), Boolean(result.versionId), Boolean(result.baseModel), Boolean(result.previewUrl || result.previewUrls?.length), Boolean(result.triggerWords?.length), Boolean(result.description)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function persistMetadata(filename: string, type: CivitaiAssetType, result: CivitaiMetadataResult | null): void {
  const cache = readPersistentCache();
  cache[persistentKey(filename, type)] = {
    type,
    filename,
    savedAt: Date.now(),
    result: result ? { ...result, completeness: completenessOf(result) } : null,
  };
  clearFailure(filename, type);

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
    .replace(/\.[a-z0-9]+$/i, '')
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
  return value.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || value;
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

function collectImages(model: any, version: any): string[] {
  const urls: string[] = [];
  const imageSources = [
    ...(Array.isArray(version?.images) ? version.images : []),
    ...(Array.isArray(model?.images) ? model.images : []),
  ];

  for (const image of imageSources) {
    const url = normalizePreviewUrl(image?.url);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function fetchGalleryPreviewUrls(modelId?: number, versionId?: number, seed: string[] = []): Promise<string[]> {
  const initial = Array.from(new Set(seed.filter(Boolean)));
  const cacheKey = `${modelId || 0}:${versionId || 0}`;
  const cached = previewCache.get(cacheKey);
  if (cached?.length) return Array.from(new Set([...initial, ...cached])).slice(0, 12);

  const queries: string[] = [];
  if (versionId) {
    const params = new URLSearchParams({
      modelVersionId: String(Math.trunc(versionId)),
      limit: '12',
      sort: 'Most Reactions',
    });
    queries.push(`${CIVITAI_API}/images?${params.toString()}`);
  }
  if (modelId) {
    const params = new URLSearchParams({
      modelId: String(Math.trunc(modelId)),
      limit: '12',
      sort: 'Most Reactions',
    });
    queries.push(`${CIVITAI_API}/images?${params.toString()}`);
  }

  const discovered: string[] = [];
  for (const url of queries) {
    const data = await fetchJson<any>(url, undefined, 2);
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const image of items) {
      const preview = normalizePreviewUrl(image?.url);
      if (preview && !discovered.includes(preview)) discovered.push(preview);
      if (discovered.length >= 12) break;
    }
    if (discovered.length >= 12) break;
  }

  const merged = Array.from(new Set([...initial, ...discovered])).slice(0, 12);
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
  const meaningful = tokens(core || clean)
    .filter((t) => !/^(anime|model|checkpoint|lora|embedding|safetensors|base|final|official)$/i.test(t))
    .sort((a, b) => b.length - a.length);

  if (meaningful.length >= 2) {
    result.push(meaningful.slice(0, 6).join(' '));
    result.push(meaningful.slice(-4).join(' '));
  }
  if (meaningful[0]) result.push(meaningful[0]);

  return Array.from(new Set(result)).filter((q) => q.length >= 3).slice(0, 6);
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
    else if (normalizedFile.includes(target) || target.includes(normalizedFile)) best = Math.max(best, 108);
    else if (compactFile.includes(targetCompact) || targetCompact.includes(compactFile)) best = Math.max(best, 104);
    else best = Math.max(best, tokenOverlap(target, normalizedFile) * 100);
  }

  if (modelName) {
    const modelNorm = normalize(modelName);
    const modelCore = stripVersionNoise(modelName);
    if (compact(modelCore) === compact(core)) best = Math.max(best, 115);
    if (modelNorm && (modelNorm.includes(core) || core.includes(modelNorm))) best = Math.max(best, 96);
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
  if (modelNorm.includes(target) || target.includes(modelNorm)) return 96;
  const modelCore = stripVersionNoise(modelName);
  if (compact(modelCore) === compact(core)) return 115;
  return Math.max(tokenOverlap(core, modelName) * 88, tokenOverlap(target, modelName) * 72);
}

function pickVersion(model: any, filename: string): { version: any | null; score: number } {
  const versions = Array.isArray(model?.modelVersions) ? model.modelVersions : [];
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

  return { version: bestVersion, score: bestScore };
}

async function fetchJson<T>(url: string, init?: RequestInit, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init?.headers || {}) },
      });

      if (response.ok) return await response.json() as T;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt >= retries) return null;

      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(5000, retryAfter * 1000)
        : 350 * (2 ** attempt);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    } catch {
      if (attempt >= retries) return null;
      await new Promise((resolve) => window.setTimeout(resolve, 350 * (2 ** attempt)));
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
  if (type === 'lora') return modelType === 'lora';
  return modelType === 'textualinversion' || modelType === 'embedding';
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

  async fetchMetadata(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints = {}): Promise<CivitaiMetadataResult | null> {
    const key = JSON.stringify([filename, type, hints]);
    if (metadataCache.has(key)) return metadataCache.get(key) || null;

    const persisted = getPersistedMetadata(filename, type);
    if (persisted !== undefined) {
      metadataCache.set(key, persisted);
      return persisted;
    }

    try {
      const parsedIds = extractCivitaiIds(filename);
      const resolvedHints = {
        ...hints,
        modelId: hints.modelId || parsedIds.modelId,
        versionId: hints.versionId || parsedIds.versionId,
      };

      const manualUrl = getManualUrl(filename, type);
      if (manualUrl) {
        const manualModelId = extractModelIdFromUrl(manualUrl);
        if (manualModelId) {
          const model = await fetchJson<any>(`${CIVITAI_API}/models/${manualModelId}`);
          if (model?.id && isCompatibleModelType(model, type)) {
            const picked = pickVersion(model, filename);
            const version = picked.version || (Array.isArray(model.modelVersions) ? model.modelVersions[0] : null);
            if (version?.id) {
              const enriched = await enrichVersion(version, model);
              const result = await buildMetadataResult(enriched.model, enriched.version, 'manual-url', 100);
              result.civitaiUrl = manualUrl;
              result.completeness = completenessOf(result);
              metadataCache.set(key, result);
              persistMetadata(filename, type, result);
              return result;
            }
          }
        }
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
          const picked = pickVersion(model, filename);
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
      const civType = CIVITAI_TYPE_MAP[type];
      let best: { model: any; version: any; score: number } | null = null;

      const findBest = (items: any[], current: { model: any; version: any; score: number } | null) => {
        let candidate = current;
        for (const model of items) {
          if (!isCompatibleModelType(model, type)) continue;
          const picked = pickVersion(model, filename);
          if (!picked.version) continue;
          if (!candidate || picked.score > candidate.score) {
            candidate = { model, version: picked.version, score: picked.score };
          }
        }
        return candidate;
      };

      for (const query of queries) {
        let cursor: string | undefined;
        for (let page = 0; page < 3; page++) {
          const pageKey = `${civType}|${query.toLowerCase()}|${cursor || 'first'}`;
          let items = searchCache.get(pageKey);
          if (!items) {
            const params = new URLSearchParams({ query, types: civType, limit: '100' });
            if (cursor) params.set('cursor', cursor);
            const data = await fetchJson<any>(`${CIVITAI_API}/models?${params.toString()}`);
            if (!data) break;
            items = Array.isArray(data.items) ? data.items : [];
            searchCache.set(pageKey, items || []);
            const nextCursorValue = typeof data?.metadata?.nextCursor === 'string' ? data.metadata.nextCursor : '';
            if (nextCursorValue) searchCache.set(`${pageKey}|meta`, [{ __cursor: nextCursorValue }]);
          }

          best = findBest(items || [], best);
          if (best && best.score >= 108) break;

          const cachedCursor = searchCache.get(`${pageKey}|meta`)?.[0]?.__cursor as string | undefined;
          cursor = cachedCursor;
          if (!cursor) break;
        }
        if (best && best.score >= 108) break;
      }

      if (!best || best.score < 100) {
        // Search results can omit older/special model versions. Fetch the full model
        // record for the strongest name candidates before giving up. This is much
        // slower than the normal path, so it is restricted to a small top set.
        const deepCandidates = new Map<number, any>();
        for (const query of queries.slice(0, 3)) {
          for (const allTypes of [civType, '']) {
            const cacheKey = `${allTypes || 'all'}|${query.toLowerCase()}|first`;
            const items = searchCache.get(cacheKey);
            for (const model of items || []) {
              const id = Number(model?.id);
              const nameScore = scoreModelNameOnly(filename, model);
              if (id > 0 && nameScore >= 52) {
                const existing = deepCandidates.get(id);
                if (!existing || scoreModelNameOnly(filename, existing) < nameScore) deepCandidates.set(id, model);
              }
            }
          }
        }

        const orderedDeepCandidates = Array.from(deepCandidates.values())
          .sort((a, b) => scoreModelNameOnly(filename, b) - scoreModelNameOnly(filename, a))
          .slice(0, 6);

        for (const candidate of orderedDeepCandidates) {
          const id = Number(candidate?.id);
          if (!id) continue;
          const fullModel = await fetchJson<any>(`${CIVITAI_API}/models/${id}`);
          if (!fullModel || !isCompatibleModelType(fullModel, type)) continue;
          const picked = pickVersion(fullModel, filename);
          const modelScore = scoreModelNameOnly(filename, fullModel);
          const combined = Math.max(picked.score, modelScore);
          if (picked.version && (!best || combined > best.score)) {
            best = { model: fullModel, version: picked.version, score: combined };
          }
          if (best && best.score >= 108) break;
        }
      }

      if (!best || best.score < 60) {
        for (const query of queries.slice(0, 3)) {
          const fallbackKey = `all|${query.toLowerCase()}|first`;
          let items = searchCache.get(fallbackKey);
          if (!items) {
            const params = new URLSearchParams({ query, limit: '100' });
            const data = await fetchJson<any>(`${CIVITAI_API}/models?${params.toString()}`);
            items = Array.isArray(data?.items) ? data.items : [];
            searchCache.set(fallbackKey, items || []);
          }
          best = findBest(items || [], best);
          if (best && best.score >= 108) break;
        }
      }

      if (best && best.score >= 60) {
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
    }

    rememberFailure(filename, type, 'No confident Civitai match found');

    // Do not cache misses: a temporary API/CORS/rate-limit failure or a newly
    // published Civitai model should be retried on the next manual sync.
    return null;
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
    return {
      total: entries.length,
      matched: entries.filter((e) => (e.result?.completeness || completenessOf(e.result)) >= 100).length,
      partial: entries.filter((e) => (e.result?.completeness || completenessOf(e.result)) > 0 && (e.result?.completeness || completenessOf(e.result)) < 100).length,
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
