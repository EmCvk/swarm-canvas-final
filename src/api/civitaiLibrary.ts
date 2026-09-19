import { invoke } from '@tauri-apps/api/core';
import type { CivitaiAssetType, CivitaiLookupHints, CivitaiMetadataResult } from './civitaiService';

const MEMORY_KEY = 'swarm_civitai_library_v5';
const LEGACY_KEYS = ['swarm_civitai_metadata_v3', 'swarm_civitai_metadata_v4'];
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CivitaiLibraryEntry {
  key: string;
  type: CivitaiAssetType;
  filename: string;
  aliases: string[];
  fingerprints: Record<string, string>;
  civitaiUrl?: string;
  result?: CivitaiMetadataResult;
  previewCacheUrl?: string;
  lastUsedAt?: number;
  lastVerifiedAt?: number;
  status: 'matched' | 'partial' | 'unresolved' | 'manual' | 'temporarily_failed';
  failureReason?: string;
  updatedAt: number;
}

export interface CivitaiLibraryDocument {
  version: 5;
  updatedAt: number;
  entries: Record<string, CivitaiLibraryEntry>;
}

let documentCache: CivitaiLibraryDocument = {
  version: 5,
  updatedAt: Date.now(),
  entries: {},
};
let initialized = false;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let writePromise: Promise<void> = Promise.resolve();

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/');
}

function hashKey(value: string): string {
  let a = 2166136261;
  let b = 2246822519;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 16777619);
    b ^= c + i;
    b = Math.imul(b, 3266489917);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function entryKey(filename: string, type: CivitaiAssetType): string {
  return `${type}:${normalizeName(filename)}`;
}

function fingerprintKeys(hints: CivitaiLookupHints = {}): string[] {
  return [
    hints.sha256 && `sha256:${hints.sha256.toLowerCase()}`,
    hints.blake3 && `blake3:${hints.blake3.toLowerCase()}`,
    hints.crc32 && `crc32:${hints.crc32.toLowerCase()}`,
    hints.autoV3 && `autov3:${hints.autoV3.toLowerCase()}`,
    hints.autoV2 && `autov2:${hints.autoV2.toLowerCase()}`,
    hints.autoV1 && `autov1:${hints.autoV1.toLowerCase()}`,
    hints.hash && `hash:${hints.hash.toLowerCase()}`,
  ].filter(Boolean) as string[];
}

function fingerprintMap(hints: CivitaiLookupHints = {}): Record<string, string> {
  return Object.fromEntries(fingerprintKeys(hints).map((key) => [key, key.split(':').slice(1).join(':')]));
}

function sanitizeDocument(value: unknown): CivitaiLibraryDocument {
  if (!value || typeof value !== 'object') return documentCache;
  const raw = value as Partial<CivitaiLibraryDocument>;
  const entries = raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  return {
    version: 5,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    entries: entries as Record<string, CivitaiLibraryEntry>,
  };
}

async function readDisk(): Promise<CivitaiLibraryDocument | null> {
  if (!isTauri()) return null;
  try {
    const raw = await invoke<string | null>('civitai_cache_read');
    if (!raw) return null;
    return sanitizeDocument(JSON.parse(raw));
  } catch (error) {
    console.warn('[Civitai Library] Disk read unavailable:', error);
    return null;
  }
}

async function writeDisk(document: CivitaiLibraryDocument): Promise<void> {
  if (!isTauri()) return;
  const payload = JSON.stringify(document);
  writePromise = writePromise.then(async () => {
    try {
      await invoke('civitai_cache_write', { payload });
    } catch (error) {
      console.warn('[Civitai Library] Disk write unavailable:', error);
    }
  });
  await writePromise;
}

function readBrowserFallback(): CivitaiLibraryDocument | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) return sanitizeDocument(JSON.parse(raw));

    // One-time migration from the previous metadata cache format.
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const old = JSON.parse(legacy);
      const entries: Record<string, CivitaiLibraryEntry> = {};
      for (const [, value] of Object.entries(old || {})) {
        const oldEntry = value as any;
        if (!oldEntry || !oldEntry.filename || !oldEntry.type) continue;
        const keyName = entryKey(oldEntry.filename, oldEntry.type);
        if (!oldEntry.result) continue;
        entries[keyName] = {
          key: keyName,
          type: oldEntry.type,
          filename: oldEntry.filename,
          aliases: [],
          fingerprints: {},
          result: oldEntry.result,
          lastVerifiedAt: oldEntry.savedAt || Date.now(),
          updatedAt: oldEntry.savedAt || Date.now(),
          status: 'matched',
        };
      }
      return { version: 5, updatedAt: Date.now(), entries };
    }
  } catch (error) {
    console.warn('[Civitai Library] Browser cache read failed:', error);
  }
  return null;
}

function writeBrowserFallback(document: CivitaiLibraryDocument): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(document));
  } catch (error) {
    // Keep a compact browser fallback if quota is reached. Tauri disk storage remains primary.
    console.warn('[Civitai Library] Browser cache write failed:', error);
    try {
      const entries = Object.entries(document.entries).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).slice(0, 200);
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...document, entries: Object.fromEntries(entries) }));
    } catch {}
  }
}

export async function initializeCivitaiLibrary(): Promise<void> {
  if (initialized) return;
  const disk = await readDisk();
  documentCache = disk || readBrowserFallback() || documentCache;
  initialized = true;
  // Migrate browser-only cache to disk on the first Tauri launch.
  if (!disk && isTauri()) await writeDisk(documentCache);
}

function isFresh(entry?: CivitaiLibraryEntry, ttl = CACHE_TTL_MS): boolean {
  if (!entry) return false;
  return Date.now() - (entry.updatedAt || 0) < ttl;
}

function findEntry(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints = {}): CivitaiLibraryEntry | undefined {
  const direct = documentCache.entries[entryKey(filename, type)];
  if (direct) return direct;
  const wanted = new Set(fingerprintKeys(hints));
  if (!wanted.size) return undefined;
  return Object.values(documentCache.entries).find((entry) =>
    entry.type === type && Array.from(wanted).some((key) => entry.fingerprints?.[key]));
}

function schedulePersist(): void {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    documentCache.updatedAt = Date.now();
    writeBrowserFallback(documentCache);
    void writeDisk(documentCache);
  }, 250);
}

export function getEntry(filename: string, type: CivitaiAssetType, hints?: CivitaiLookupHints): CivitaiLibraryEntry | undefined {
  return findEntry(filename, type, hints);
}

export function getMetadata(filename: string, type: CivitaiAssetType, hints?: CivitaiLookupHints): CivitaiMetadataResult | undefined {
  return findEntry(filename, type, hints)?.result;
}

export function getManualUrl(filename: string, type: CivitaiAssetType, hints?: CivitaiLookupHints): string | undefined {
  return findEntry(filename, type, hints)?.civitaiUrl;
}

export function upsertEntry(
  filename: string,
  type: CivitaiAssetType,
  hints: CivitaiLookupHints,
  updates: Partial<CivitaiLibraryEntry>,
): CivitaiLibraryEntry {
  const key = entryKey(filename, type);
  const previous = findEntry(filename, type, hints);
  const entry: CivitaiLibraryEntry = {
    ...(previous || {}),
    key,
    type,
    filename,
    aliases: previous?.aliases || [],
    fingerprints: { ...(previous?.fingerprints || {}), ...fingerprintMap(hints) },
    status: previous?.status || 'unresolved',
    ...updates,
    updatedAt: Date.now(),
  };
  documentCache.entries[key] = entry;
  // When a fingerprint found an older filename key, retire that stale key so
  // renamed/moved files keep one canonical persistent record instead of
  // accumulating duplicates.
  if (previous && previous.key !== key) {
    delete documentCache.entries[previous.key];
  }
  schedulePersist();
  return entry;
}

export function setManualUrl(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints, url: string): void {
  upsertEntry(filename, type, hints, {
    civitaiUrl: url.trim() || undefined,
    status: 'manual',
    failureReason: undefined,
  });
}

export function clearManualUrl(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints): void {
  const entry = findEntry(filename, type, hints);
  if (!entry) return;
  entry.civitaiUrl = undefined;
  if (entry.result) entry.status = 'matched';
  entry.updatedAt = Date.now();
  schedulePersist();
}

export function markUsed(filename: string, type: CivitaiAssetType, hints?: CivitaiLookupHints): void {
  const entry = findEntry(filename, type, hints);
  if (!entry) return;
  entry.lastUsedAt = Date.now();
  entry.updatedAt = Date.now();
  schedulePersist();
}

export function removeEntry(filename: string, type: CivitaiAssetType, hints?: CivitaiLookupHints): boolean {
  const entry = findEntry(filename, type, hints);
  if (!entry) return false;
  delete documentCache.entries[entry.key];
  schedulePersist();
  return true;
}

export function setAlias(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints, alias: string): void {
  const entry = upsertEntry(filename, type, hints, {});
  const normalized = alias.trim();
  entry.aliases = normalized
    ? Array.from(new Set([...entry.aliases, normalized])).slice(0, 20)
    : entry.aliases;
  entry.updatedAt = Date.now();
  schedulePersist();
}

export function removeAlias(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints, alias: string): void {
  const entry = findEntry(filename, type, hints);
  if (!entry) return;
  entry.aliases = entry.aliases.filter((value) => value !== alias);
  entry.updatedAt = Date.now();
  schedulePersist();
}

export function listEntries(): CivitaiLibraryEntry[] {
  return Object.values(documentCache.entries);
}

export function getStats() {
  const entries = listEntries();
  return {
    total: entries.length,
    matched: entries.filter((e) => e.status === 'matched' || e.status === 'manual').length,
    partial: entries.filter((e) => e.status === 'partial').length,
    unresolved: entries.filter((e) => e.status === 'unresolved').length,
    failed: entries.filter((e) => e.status === 'temporarily_failed').length,
    cachedPreviews: entries.filter((e) => e.previewCacheUrl && isFresh(e, PREVIEW_TTL_MS)).length,
  };
}

export function getUnresolvedEntries(): CivitaiLibraryEntry[] {
  return listEntries()
    .filter((e) => e.status === 'unresolved' || e.status === 'temporarily_failed')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getRecentlyUsed(limit = 20): CivitaiLibraryEntry[] {
  return listEntries()
    .filter((e) => e.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
    .slice(0, limit);
}

export async function exportDocument(): Promise<string> {
  await initializeCivitaiLibrary();
  return JSON.stringify(documentCache, null, 2);
}

export async function importDocument(raw: string): Promise<number> {
  const parsed = sanitizeDocument(JSON.parse(raw));
  let imported = 0;
  for (const entry of Object.values(parsed.entries)) {
    if (!entry?.filename || !entry?.type) continue;
    documentCache.entries[entryKey(entry.filename, entry.type)] = entry;
    imported++;
  }
  documentCache.updatedAt = Date.now();
  writeBrowserFallback(documentCache);
  await writeDisk(documentCache);
  return imported;
}

export async function clearDocument(): Promise<void> {
  documentCache = { version: 5, updatedAt: Date.now(), entries: {} };
  try { localStorage.removeItem(MEMORY_KEY); } catch {}
  writeBrowserFallback(documentCache);
  await writeDisk(documentCache);
}

export function setPreviewCacheUrl(filename: string, type: CivitaiAssetType, hints: CivitaiLookupHints, previewUrl: string): void {
  const entry = findEntry(filename, type, hints);
  if (!entry) return;
  entry.previewCacheUrl = previewUrl;
  entry.updatedAt = Date.now();
  schedulePersist();
}

export async function getCacheLocation(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>('civitai_cache_location');
  } catch {
    return null;
  }
}

export function previewCacheKey(url: string): string {
  return hashKey(url);
}

export async function readCachedPreview(url: string): Promise<string | null> {
  if (!url || !isTauri()) return null;
  try {
    const data = await invoke<string | null>('civitai_preview_read', { key: previewCacheKey(url) });
    return typeof data === 'string' && data.startsWith('data:image/') ? data : null;
  } catch {
    return null;
  }
}

export async function writeCachedPreview(url: string, dataUrl: string): Promise<void> {
  if (!url || !dataUrl || !dataUrl.startsWith('data:image/') || !isTauri()) return;
  try {
    await invoke('civitai_preview_write', { key: previewCacheKey(url), data: dataUrl });
  } catch (error) {
    console.warn('[Civitai Library] Preview cache write failed:', error);
  }
}
