import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { HistoryItem, AppSettings } from '../store/useAppStore';
import { swarmClient } from './swarmClient';

/**
 * Local Project storage uses ordinary image files on disk, grouped into the same
 * broad structure SwarmUI/Stability Matrix uses (type/user/raw/date). Metadata
 * is embedded in the image itself so files remain portable without a container.
 */
export interface LocalProjectImage {
  filename: string;
  path: string;
  size: number;
  modifiedAt: number;
  metadata?: string;
}

export interface LocalProjectScan {
  root: string;
  images: LocalProjectImage[];
}

export interface LocalProjectWriteResult {
  filename: string;
  path: string;
  size: number;
}

export type ProjectImageFormat = 'original' | 'jpg' | 'jpeg' | 'png' | 'webp';

const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

let storageBackendState: 'unknown' | 'available' | 'missing' = 'unknown';
let storageBackendCheck: Promise<void> | null = null;

function isMissingCommandError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /command .* not found/i.test(message) || /unknown command/i.test(message);
}

function outdatedBackendError(): Error {
  return new Error('The running SwarmCanvas Tauri backend is outdated. Close the app and start the current project with `npm run tauri dev` (or rebuild with `npm run tauri build`).');
}

async function ensureStorageBackend(): Promise<void> {
  if (!isTauriRuntime()) throw new Error('Local Project storage requires the SwarmCanvas desktop app.');
  if (storageBackendState === 'available') return;
  if (storageBackendState === 'missing') throw outdatedBackendError();

  if (!storageBackendCheck) {
    storageBackendCheck = invoke<string>('swarmcanvas_storage_backend_version')
      .then(() => {
        storageBackendState = 'available';
      })
      .catch((error: unknown) => {
        if (isMissingCommandError(error)) storageBackendState = 'missing';
        throw isMissingCommandError(error) ? outdatedBackendError() : error;
      })
      .finally(() => {
        storageBackendCheck = null;
      });
  }

  await storageBackendCheck;
}

async function storageInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await ensureStorageBackend();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isMissingCommandError(error)) {
      storageBackendState = 'missing';
      throw new Error('The running SwarmCanvas Tauri backend is outdated. Close the app and start the current project with `npm run tauri dev` (or rebuild with `npm run tauri build`).');
    }
    if (error instanceof Error) throw error;
    if (typeof error === 'string') throw new Error(error);
    if (error && typeof error === 'object') {
      const value = error as Record<string, unknown>;
      const message = value.message ?? value.error ?? value.kind ?? value.code;
      if (typeof message === 'string' && message.trim()) throw new Error(message);
      try {
        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
        throw new Error(serialized && serialized !== '{}' ? serialized : 'Tauri storage command failed without a message.');
      } catch (serializationError) {
        if (serializationError instanceof Error && serializationError.message) throw serializationError;
        throw new Error(String(error));
      }
    }
    throw new Error(String(error));
  }
}

function isViteDevRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.port === '1420' || window.location.port === '5173';
}

function getFetchCandidates(imageUrl: string): string[] {
  const resolved = swarmClient.resolveImageUrl(imageUrl);
  if (!resolved) return [];
  const candidates = [resolved];

  // In Tauri dev, the direct SwarmUI URL is cross-origin from the Vite WebView and can
  // fail with a generic "Failed to fetch" because of browser CORS rules. The Vite proxy
  // is same-origin to the WebView and forwards /View/* to SwarmUI, so prefer that route.
  if (isViteDevRuntime()) {
    try {
      const url = new URL(resolved);
      if (/^(?:https?:\/\/)(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(url.origin)) {
        candidates.unshift(`${url.pathname}${url.search}`);
      }
    } catch {
      // Keep the direct candidate when the value is not an absolute URL.
    }
  }

  return [...new Set(candidates)];
}

async function fetchImageBlob(imageUrl: string, outputFolder?: string): Promise<Blob> {
  if (isTauriRuntime() && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
    try {
      const bytes = await swarmClient.readOutputImageBytes(outputFolder, imageUrl);
      return new Blob([bytes]);
    } catch (nativeError) {
      // Keep the browser/Vite path as a fallback for remote/custom SwarmUI backends.
      console.debug('[ProjectStorage] Native output read fallback:', nativeError);
    }
  }

  const candidates = getFetchCandidates(imageUrl);
  if (!candidates.length) throw new Error('Generated image has no readable URL.');

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' });
      if (!response.ok) {
        lastError = new Error(`Could not read generated image (${response.status}).`);
        continue;
      }
      return response.blob();
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || 'unknown fetch error');
  throw new Error(`Could not read generated image: ${message}`);
}


function getImageEncoding(format: ProjectImageFormat): { mime: string; extension: string; lossy: boolean } {
  switch (format) {
    case 'original': return { mime: '', extension: '', lossy: false };
    case 'png': return { mime: 'image/png', extension: 'png', lossy: false };
    case 'webp': return { mime: 'image/webp', extension: 'webp', lossy: true };
    case 'jpeg': return { mime: 'image/jpeg', extension: 'jpeg', lossy: true };
    case 'jpg':
    default: return { mime: 'image/jpeg', extension: 'jpg', lossy: true };
  }
}

async function convertBlobToProjectImageBytes(
  blob: Blob,
  maxDimension: number,
  qualityPercent: number,
  background: 'black' | 'white',
  format: ProjectImageFormat,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    const sourceMax = Math.max(bitmap.width, bitmap.height);
    const safeMax = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : sourceMax;
    const scale = Math.min(1, safeMax / Math.max(1, sourceMax));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create a canvas for local project encoding.');

    const encoding = getImageEncoding(format);
    // JPEG has no alpha channel, so give transparent inputs a deterministic background.
    if (format === 'jpg' || format === 'jpeg') {
      ctx.fillStyle = background === 'white' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const quality = Math.min(1, Math.max(0.4, (Number(qualityPercent) || 92) / 100));
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error(`Browser could not encode the image as ${encoding.mime}.`));
      }, encoding.mime, encoding.lossy ? quality : undefined);
    });

    return new Uint8Array(await imageBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

function parseHistoryMetadata(raw?: string): HistoryItem | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HistoryItem>;
    if (!parsed || typeof parsed.id !== 'string' || !parsed.params || typeof parsed.params !== 'object') return null;
    return parsed as HistoryItem;
  } catch {
    return null;
  }
}

export async function getLocalProjectLocation(configuredPath?: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return storageInvoke<string>('swarmcanvas_local_project_location', { path: configuredPath || null });
}

export async function chooseLocalProjectLocation(defaultPath?: string): Promise<string | null> {
  if (!isTauriRuntime()) throw new Error('Local Project storage requires the SwarmCanvas desktop app.');
  return storageInvoke<string | null>('swarmcanvas_choose_local_project_location', { defaultPath: defaultPath || null });
}

export async function scanLocalProject(configuredPath?: string): Promise<LocalProjectScan> {
  if (!isTauriRuntime()) throw new Error('Local Project storage requires the SwarmCanvas desktop app.');
  return storageInvoke<LocalProjectScan>('swarmcanvas_scan_local_project', { path: configuredPath || null });
}

export async function loadProjectEntries(configuredPath?: string): Promise<HistoryItem[]> {
  const scan = await scanLocalProject(configuredPath);
  const entries: HistoryItem[] = [];
  for (const image of scan.images) {
    const parsed = parseHistoryMetadata(image.metadata);
    if (!parsed) continue;
    entries.push({
      ...parsed,
      imageUrl: convertFileSrc(image.path),
      localProjectFile: image.filename,
      localProjectRoot: scan.root,
      serverOrigin: false,
      serverPath: undefined,
      rawMetadata: image.metadata,
    });
  }
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

async function storeOutputFileDirectly(
  item: HistoryItem,
  settings: Pick<AppSettings, 'projectJpegMaxDimension' | 'projectJpegQuality' | 'projectJpegBackground' | 'projectJpegFilenamePrefix' | 'projectImageFormat' | 'localProjectPath' | 'outputFolderPath'>,
  filename: string,
  metadata: string,
): Promise<LocalProjectWriteResult> {
  const stored = await storageInvoke<LocalProjectWriteResult>('swarmcanvas_local_project_store_from_output', {
    path: settings.localProjectPath || null,
    outputFolder: settings.outputFolderPath || null,
    imageReference: item.imageUrl,
    filename,
    metadata,
    format: settings.projectImageFormat || 'jpg',
    maxDimension: Number(settings.projectJpegMaxDimension) || 0,
    qualityPercent: Number(settings.projectJpegQuality) || 92,
    background: settings.projectJpegBackground || 'black',
  });
  return stored;
}

export async function addHistoryItemsToProject(
  items: HistoryItem[],
  settings: Pick<AppSettings, 'projectJpegMaxDimension' | 'projectJpegQuality' | 'projectJpegBackground' | 'projectJpegFilenamePrefix' | 'projectImageFormat' | 'localProjectPath' | 'outputFolderPath'>,
): Promise<HistoryItem[]> {
  if (!isTauriRuntime()) throw new Error('Local Project storage requires the SwarmCanvas desktop app.');

  const savedItems: HistoryItem[] = [];
  const projectRoot = await getLocalProjectLocation(settings.localProjectPath);

  for (const item of items) {
    if (!item?.imageUrl) continue;

    const stamp = new Date(item.timestamp || Date.now());
    const datePart = [stamp.getFullYear(), String(stamp.getMonth() + 1).padStart(2, '0'), String(stamp.getDate()).padStart(2, '0')].join('-');
    const timePart = [String(stamp.getHours()).padStart(2, '0'), String(stamp.getMinutes()).padStart(2, '0'), String(stamp.getSeconds()).padStart(2, '0')].join('');
    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = (settings.projectJpegFilenamePrefix || 'SwarmCanvas')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '') || 'SwarmCanvas';
    const format = settings.projectImageFormat || 'jpg';
    const extension = format === 'original' ? 'jpg' : format;
    const filename = `Text2Img/local/raw/${datePart}/${prefix}_${datePart}_${timePart}_${safeId}.${extension}`;
    const metadata = JSON.stringify({
      ...item,
      imageUrl: '',
      localProjectFile: filename,
      localProjectRoot: projectRoot || undefined,
      serverOrigin: false,
      serverPath: undefined,
    });

    let saved: LocalProjectWriteResult;
    if (!item.imageUrl.startsWith('data:image/') && !item.imageUrl.startsWith('blob:')) {
      // Read/encode/write natively. This avoids pushing multi-megabyte image byte arrays through
      // the Tauri JSON IPC channel and avoids browser CORS/fetch failures for local SwarmUI files.
      saved = await storeOutputFileDirectly(item, settings, filename, metadata);
    } else {
      const sourceBlob = item.imageUrl.startsWith('data:image/')
        ? await (await fetch(item.imageUrl)).blob()
        : await fetchImageBlob(item.imageUrl, settings.outputFolderPath);
      const originalMime = (sourceBlob.type || '').toLowerCase();
      const originalExtension = originalMime.includes('png') ? 'png' : originalMime.includes('webp') ? 'webp' : originalMime.includes('jpeg') || originalMime.includes('jpg') ? 'jpg' : '';
      if (format === 'original' && !originalExtension) {
        throw new Error('Original format is only supported for PNG, JPEG and WebP source images. Choose PNG, JPEG or WebP explicitly for this generation.');
      }
      const effectiveFormat = format === 'original' ? (originalExtension as ProjectImageFormat) : format;
      const imageBytes = format === 'original'
        ? new Uint8Array(await sourceBlob.arrayBuffer())
        : await convertBlobToProjectImageBytes(sourceBlob, settings.projectJpegMaxDimension, settings.projectJpegQuality, settings.projectJpegBackground, effectiveFormat);
      const effectiveFilename = format === 'original' ? filename.replace(/\.[^.]+$/, `.${originalExtension}`) : filename;
      const effectiveMetadata = metadata.replace(filename, effectiveFilename);
      saved = await storageInvoke<LocalProjectWriteResult>('swarmcanvas_local_project_write_image', {
        path: settings.localProjectPath || null,
        filename: effectiveFilename,
        imageBytes: Array.from(imageBytes),
        metadata: effectiveMetadata,
      });
    }

    savedItems.push({
      ...item,
      imageUrl: convertFileSrc(saved.path),
      localProjectFile: saved.filename,
      localProjectRoot: projectRoot || undefined,
      serverOrigin: false,
      serverPath: undefined,
      rawMetadata: metadata.replace(filename, saved.filename),
    });
  }

  const current = await loadProjectEntries(settings.localProjectPath);
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const item of savedItems) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateProjectEntryMetadata(item: HistoryItem): Promise<void> {
  if (!isTauriRuntime() || !item.localProjectFile) return;
  await storageInvoke('swarmcanvas_local_project_write_metadata', {
    path: item.localProjectRoot || undefined,
    filename: item.localProjectFile,
    metadata: JSON.stringify({ ...item, imageUrl: '', serverOrigin: false, serverPath: undefined }),
  });
}

export async function removeProjectEntries(items: Array<Pick<HistoryItem, 'id' | 'localProjectFile' | 'localProjectRoot'>>): Promise<HistoryItem[]> {
  if (!isTauriRuntime()) throw new Error('Local Project storage requires the SwarmCanvas desktop app.');
  for (const item of items) {
    if (item.localProjectFile) {
      await storageInvoke('swarmcanvas_local_project_delete_image', {
        path: item.localProjectRoot || undefined,
        filename: item.localProjectFile,
      });
    }
  }
  const root = items.find((item) => item.localProjectRoot)?.localProjectRoot;
  return loadProjectEntries(root);
}
