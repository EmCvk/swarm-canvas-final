import { invoke } from '@tauri-apps/api/core';
export interface GenParams {
  prompt: string;
  negativeprompt?: string;
  model: string;
  vae?: string;
  textencoder?: string;
  textencoder2?: string;
  steps: number;
  cfgscale: number;
  width: number;
  height: number;
  seed: number;
  sampler?: string;
  scheduler?: string;
  session_id?: string;

  // SwarmUI Native YOLO / Segmentation Parameters
  yolomodelinternal?: string;
  segmentsteps?: number;
  segmentthresholdmax?: number;
  segmentmaskgrow?: number;
  segmentmaskblur?: number;
  segmentmaskoversize?: number;
  segmentsortorder?: string;
  savesegmentmask?: boolean;
}

export interface ProgressPayload {
  step: number;
  maxSteps: number;
  max_steps?: number;
  percent: number;
  overall_percent?: number;
  previewUrl?: string;
  preview?: string;
  speed?: number;
  eta?: number;
  stage?: string;
}

export interface ModelItemResult {
  name: string;
  previewUrl?: string;
  description?: string;
  triggerWords?: string[];
}

export interface ServerImageItem {
  /** SwarmUI history path, normalized to a /View/... path or data/remote URL. */
  url: string;
  /** Original history path/name returned by ListImages. */
  name: string;
  /** SwarmUI metadata JSON string when available. */
  metadata?: string;
}

export type SwarmProgressData = ProgressPayload;

export interface SwarmDiagnosticEvent {
  id: string;
  time: string;
  level: 'debug' | 'info' | 'success' | 'warn' | 'error';
  scope: 'connection' | 'assets' | 'queue' | 'workflow' | 'image' | 'system';
  message: string;
  details?: unknown;
  endpoint?: string;
  method?: string;
  status?: number;
  durationMs?: number;
}

let activeSessionId = '';
let activeGenerationSessionId = '';
let activeGenerationSocket: WebSocket | null = null;


function normalizeImageValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  for (const key of ['image', 'preview', 'previewUrl', 'preview_url', 'url', 'src', 'data']) {
    const candidate = normalizeImageValue(obj[key]);
    if (candidate) return candidate;
  }
  return null;
}

function normalizeImagePath(value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;
  if (clean.startsWith('data:') || clean.startsWith('blob:') || /^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/9j/') || clean.startsWith('/9j')) return `data:image/jpeg;base64,${clean}`;
  if (clean.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${clean}`;
  if (clean.length > 500 && !/[\s/]/.test(clean) && /^[A-Za-z0-9+/=]+$/.test(clean)) return `data:image/jpeg;base64,${clean}`;
  const normalized = clean.replace(/^\/+/,'');
  return `/${normalized.startsWith('View/') ? normalized : `View/${normalized}`}`;
}

let sessionPromise: Promise<string> | null = null;
// All-server gallery scans must be globally serialized and deduplicated. SwarmUI's
// ListImages implementation opens/rebuilds per-folder LiteDB metadata stores;
// overlapping requests can race on the same swarm_metadata.ldb file and produce
// file-lock / corrupt-database errors.
let serverImageScanPromise: Promise<ServerImageItem[]> | null = null;
const diagnosticSubscribers = new Set<(event: SwarmDiagnosticEvent) => void>();
let configuredBaseUrl = 'http://localhost:7801';
let t2iParamsCache: { data: any; expiresAt: number } | null = null;
let t2iParamsPromise: Promise<any | null> | null = null;
const T2I_PARAMS_CACHE_MS = 5000;

function isViteDevProxy(): boolean {
  return typeof window !== 'undefined' && ['1420', '5173'].includes(window.location.port);
}

function apiUrl(path: string): string {
  const clean = path.replace(/^\/+|^API\//i, '');
  return isViteDevProxy() ? `/API/${clean}` : `${configuredBaseUrl}/API/${clean}`;
}

function wsApiUrl(path: string, session: string): string {
  const encodedSession = encodeURIComponent(session);
  if (isViteDevProxy()) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/API/${path}?session_id=${encodedSession}`;
  }
  const wsBase = configuredBaseUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}/API/${path}?session_id=${encodedSession}`;
}

function getT2IParamDefinitions(data: any): any[] {
  return Array.isArray(data?.list) ? data.list : [];
}

function advertisedParamIds(data: any): Set<string> {
  return new Set(
    getT2IParamDefinitions(data)
      .map((p: any) => String(p?.id || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

function advertisedModelSubtypeKey(data: any, subtype: string): string | null {
  const models = data?.models;
  if (!models || typeof models !== 'object') return null;
  const target = subtype.trim().toLowerCase();
  return Object.keys(models).find((key) => key.toLowerCase() === target) || null;
}

const DEFAULT_MANUAL_TEXT_ENCODERS = [
  'qwen_3_06b_base.safetensors',
  'qwen35_4b.safetensors',
];

function mapModelEntries(data: any): ModelItemResult[] {
  const files = Array.isArray(data) ? data : (data?.files || data?.models || []);
  if (!Array.isArray(files)) return [];
  return files.map((item: any) => {
    if (typeof item === 'string') return { name: item };

    const rawPreview = item?.preview_image || item?.preview || item?.image;
    let previewUrl: string | undefined;
    if (typeof rawPreview === 'string' && rawPreview.trim()) {
      if (/^(?:https?:\/\/|data:)/i.test(rawPreview)) {
        previewUrl = rawPreview;
      } else {
        const clean = rawPreview.replace(/^\/+/, '');
        previewUrl = clean.startsWith('View/') ? `/${clean}` : `/View/${clean}`;
      }
    }

    let triggerWords: string[] | undefined;
    if (Array.isArray(item?.trigger_words)) {
      triggerWords = item.trigger_words.map((v: unknown) => String(v).trim()).filter(Boolean);
    } else if (typeof item?.trigger_phrase === 'string' && item.trigger_phrase.trim()) {
      triggerWords = item.trigger_phrase.split(',').map((v: string) => v.trim()).filter(Boolean);
    } else if (Array.isArray(item?.metadata?.trigger_words)) {
      triggerWords = item.metadata.trigger_words.map((v: unknown) => String(v).trim()).filter(Boolean);
    }

    return {
      name: item?.name || item?.data || item?.title || String(item),
      previewUrl,
      description: item?.description || item?.metadata?.description || undefined,
      triggerWords,
    };
  }).filter((item: ModelItemResult) => Boolean(item.name));
}

export function emitDiagnostic(event: Omit<SwarmDiagnosticEvent, 'id' | 'time'>) {
  const fullEvent: SwarmDiagnosticEvent = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    ...event,
  };
  diagnosticSubscribers.forEach((cb) => cb(fullEvent));
}

export async function getSession(forceNew = false): Promise<string> {
  if (activeSessionId && !forceNew) return activeSessionId;
  if (sessionPromise && !forceNew) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const res = await fetch(apiUrl('GetNewSession'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.session_id) {
          activeSessionId = String(data.session_id);
          emitDiagnostic({
            level: 'info',
            scope: 'connection',
            message: `Session obtained: ${activeSessionId}`,
            endpoint: apiUrl('GetNewSession'),
            status: res.status
          });
          return activeSessionId;
        }
      } else {
        emitDiagnostic({
          level: 'error',
          scope: 'connection',
          message: `GetNewSession returned HTTP ${res.status}`,
          endpoint: apiUrl('GetNewSession'),
          status: res.status,
        });
      }
    } catch (err: any) {
      console.error('[SwarmClient] Session request failed:', err);
      emitDiagnostic({
        level: 'error',
        scope: 'connection',
        message: `Failed to acquire session: ${err?.message || err}`,
        endpoint: apiUrl('GetNewSession')
      });
    } finally {
      sessionPromise = null;
    }
    throw new Error(`Unable to acquire a SwarmUI session from ${configuredBaseUrl}. Check that SwarmUI is running and reachable.`);
  })();

  return sessionPromise;
}

export function deduplicateModelList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean) continue;

    const normKey = clean.replace(/\\/g, '/').toLowerCase().replace(/\.(safetensors|pt|ckpt|bin)$/i, '');

    if (!seen.has(normKey)) {
      seen.add(normKey);
      result.push(clean);
    }
  }

  return result;
}

let outputStorageBackendState: 'unknown' | 'available' | 'missing' = 'unknown';

async function invokeOutputStorage<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (outputStorageBackendState === 'missing') {
    throw new Error('The running SwarmCanvas Tauri backend is outdated. Close the app and start the current project with `npm run tauri dev` (or rebuild with `npm run tauri build`).');
  }
  try {
    const result = await invoke<T>(command, args);
    outputStorageBackendState = 'available';
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/command .* not found/i.test(message) || /unknown command/i.test(message)) {
      outputStorageBackendState = 'missing';
      throw new Error('The running SwarmCanvas Tauri backend is outdated. Close the app and start the current project with `npm run tauri dev` (or rebuild with `npm run tauri build`).');
    }
    throw error;
  }
}

class SwarmClientClass {
  private baseUrl = 'http://localhost:7801';

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    configuredBaseUrl = this.baseUrl;
    t2iParamsCache = null;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public resolveImageUrl(value?: string): string {
    if (!value) return '';
    const clean = String(value).trim();
    if (!clean) return '';
    if (clean.startsWith('data:') || clean.startsWith('blob:') || /^asset:\/\//i.test(clean) || /^https?:\/\/asset\.localhost/i.test(clean)) return clean;
    if (/^(https?:\/\/)/i.test(clean)) {
      if (!/^(https?:\/\/)(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(clean)) return clean;
      try {
        const u = new URL(clean);
        let path = u.pathname.replace(/^\/+/, '');
        if (/^output\//i.test(path)) path = path.replace(/^output\//i, '');
        if (!/^View\//i.test(path)) path = `View/${path}`;
        return `${this.baseUrl}/${path}${u.search}`;
      } catch { return clean; }
    }
    const normalized = clean.replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^View\//i.test(normalized)) {
      const queryIndex = normalized.indexOf('?');
      const path = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
      const query = queryIndex >= 0 ? normalized.slice(queryIndex) : '';
      return `${this.baseUrl}/${path}${query}`;
    }
    if (/^output\//i.test(normalized)) return `${this.baseUrl}/View/${normalized.replace(/^output\//i, '')}`;
    return `${this.baseUrl}/View/${normalized}`;
  }

  public async resolveOutputImagePath(outputFolder: string | undefined, imageReference: string): Promise<string> {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      return invoke<string>('swarmcanvas_resolve_output_image_path', {
        path: outputFolder || null,
        imageReference,
      });
    }
    throw new Error('Opening the output folder requires the SwarmCanvas desktop app.');
  }

  public async revealFilesystemPath(path: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      await invoke<void>('swarmcanvas_reveal_path', { path });
      return;
    }
    throw new Error('Opening a filesystem folder requires the SwarmCanvas desktop app.');
  }

  public async readOutputImageBytes(outputFolder: string | undefined, imageReference: string): Promise<Uint8Array> {
    return invokeOutputStorage('swarmcanvas_read_output_image_bytes', {
      path: outputFolder || null,
      imageReference,
    });
  }

  public async invalidateLocalOutputImageIndex(outputFolder?: string): Promise<void> {
    await invokeOutputStorage('swarmcanvas_invalidate_output_folder_index', {
      path: outputFolder || null,
    });
  }

  public async getLocalOutputImageCount(outputFolder?: string, refresh = false): Promise<{ root: string; total: number }> {
    return invokeOutputStorage('swarmcanvas_count_output_folder', {
      path: outputFolder || null,
      refresh,
    });
  }

  public async listLocalOutputImagePages(
    outputFolder: string | undefined,
    startPage: number,
    pageCount: number,
    pageSize: number,
  ): Promise<{
    root: string;
    total: number;
    startPage: number;
    pageCount: number;
    pageSize: number;
    images: Array<{ path: string; relativePath: string; name: string; size: number; modifiedAt: number; metadata?: string }>;
  }> {
    return invokeOutputStorage('swarmcanvas_scan_output_folder_pages', {
      path: outputFolder || null,
      startPage,
      pageCount,
      pageSize,
    });
  }

  /** Legacy one-page helper retained for callers that still expect listLocalOutputImages. */
  public async listLocalOutputImages(outputFolder?: string): Promise<{ root: string; images: Array<{ path: string; relativePath: string; name: string; size: number; modifiedAt: number; metadata?: string }> }> {
    const scan = await this.listLocalOutputImagePages(outputFolder, 1, 1, 96);
    return { root: scan.root, images: scan.images };
  }

  /** Remove a generated image from SwarmUI history after it has been safely copied
   * into Local Project storage. This keeps the Local Project toggle an actual
   * storage-location switch instead of leaving a duplicate in Stability Matrix. */
  public async deleteImageFromHistory(path: string): Promise<void> {
    const clean = String(path || '').trim();
    if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return;
    const normalized = clean.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/View\//i, '')
      .replace(/^\/?View\//i, '')
      .replace(/^\/?Output\//i, '');
    const session = await getSession();
    const response = await fetch(apiUrl('DeleteImage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session, path: normalized }),
    });
    if (!response.ok) {
      throw new Error(`SwarmUI image delete returned HTTP ${response.status}.`);
    }
    const data = await response.json().catch(() => null);
    if (data?.success === false || data?.error) {
      throw new Error(String(data.error || 'SwarmUI refused to delete the image.'));
    }
  }

  public subscribeDiagnostics(callback: (event: SwarmDiagnosticEvent) => void): () => void {
    diagnosticSubscribers.add(callback);
    return () => diagnosticSubscribers.delete(callback);
  }

  public async getNewSession(): Promise<string> {
    activeSessionId = '';
    return getSession(true);
  }

  public async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(apiUrl('GetNewSession'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ healthcheck: true }),
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return Boolean(data?.session_id);
    } catch {
      return false;
    }
  }

  public async triggerRefresh(): Promise<void> {
    const session = await getSession();
    try {
      const res = await fetch(apiUrl('TriggerRefresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
      t2iParamsCache = null;
      if (!res.ok) {
        emitDiagnostic({ level: 'warn', scope: 'assets', message: `SwarmUI refresh request returned HTTP ${res.status}`, endpoint: apiUrl('TriggerRefresh'), status: res.status });
      }
    } catch (error) {
      emitDiagnostic({ level: 'warn', scope: 'assets', message: `SwarmUI refresh request failed: ${error instanceof Error ? error.message : String(error)}`, endpoint: apiUrl('TriggerRefresh') });
    }
  }

  public async getT2IParams(): Promise<any> {
    if (t2iParamsCache && t2iParamsCache.expiresAt > Date.now()) return t2iParamsCache.data;
    if (t2iParamsPromise) return t2iParamsPromise;

    t2iParamsPromise = (async () => {
      try {
        const session = await getSession();
        const res = await fetch(apiUrl('ListT2IParams'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session })
        });
        if (!res.ok) {
          emitDiagnostic({ level: 'warn', scope: 'assets', message: `ListT2IParams returned HTTP ${res.status}`, endpoint: apiUrl('ListT2IParams'), status: res.status });
          return null;
        }
        const data = await res.json();
        t2iParamsCache = { data, expiresAt: Date.now() + T2I_PARAMS_CACHE_MS };
        return data;
      } catch (error) {
        emitDiagnostic({ level: 'warn', scope: 'assets', message: `ListT2IParams failed: ${error instanceof Error ? error.message : String(error)}`, endpoint: apiUrl('ListT2IParams') });
        return null;
      } finally {
        t2iParamsPromise = null;
      }
    })();
    return t2iParamsPromise;
  }

  public async listModels(subtype = 'Stable-Diffusion'): Promise<ModelItemResult[]> {
    const data = await this.getT2IParams();

    if (data) {
      const key = advertisedModelSubtypeKey(data, subtype);
      const advertised = key ? data?.models?.[key] : undefined;
      if (Array.isArray(advertised)) {
        return advertised
          .map((item: any) => Array.isArray(item) ? { name: String(item[0] ?? '') } : mapModelEntries([item])[0])
          .filter((item: ModelItemResult | undefined): item is ModelItemResult => Boolean(item?.name));
      }

      // For non-checkpoint catalogs, only query ListModels when the server advertised
      // the subtype. This avoids the Invalid sub-type errors seen on restricted installs.
      if (subtype !== 'Stable-Diffusion' && !key) return [];
      if (subtype === 'Stable-Diffusion' && !key) {
        emitDiagnostic({ level: 'info', scope: 'assets', message: 'Stable-Diffusion model subtype was not present in ListT2IParams; falling back to ListModels for backward compatibility.' });
      }
    } else if (subtype !== 'Stable-Diffusion') {
      return [];
    }

    try {
      const session = await getSession();
      const res = await fetch(apiUrl('ListModels'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, path: '', depth: 100, subtype, sortBy: 'Name' })
      });
      if (!res.ok) return [];
      const response = await res.json();
      if (response?.error) return [];
      return mapModelEntries(response);
    } catch (error) {
      emitDiagnostic({ level: 'warn', scope: 'assets', message: `ListModels(${subtype}) failed: ${error instanceof Error ? error.message : String(error)}`, endpoint: apiUrl('ListModels') });
      return [];
    }
  }

  public async listWildcards(): Promise<string[]> {
    const data = await this.getT2IParams();
    if (Array.isArray(data?.wildcards)) return deduplicateModelList(data.wildcards.map((v: unknown) => String(v)));
    return [];
  }

  public async listVAEs(): Promise<string[]> {
    const rawVaes: string[] = ['Automatic', 'None'];
    const data = await this.getT2IParams();
    const param = getT2IParamDefinitions(data).find((p: any) => String(p?.id || '').toLowerCase() === 'vae' || String(p?.name || '').toLowerCase() === 'vae');
    if (Array.isArray(param?.values)) rawVaes.push(...param.values.map((v: unknown) => String(v)).filter(Boolean));
    const subtype = advertisedModelSubtypeKey(data, 'VAE');
    if (!param && subtype) {
      const models = await this.listModels('VAE');
      rawVaes.push(...models.map((m) => m.name));
    }
    return deduplicateModelList(rawVaes);
  }

  public async listTextEncoders(): Promise<string[]> {
    // SwarmUI does not expose a universal `Text Encoder` model subtype, but
    // Anima-family workflows commonly require a manually chosen Qwen encoder.
    // Keep the known Anima encoders available even when the current backend does
    // not advertise a generic textencoder parameter. Extra backend-advertised
    // choices are appended when available.
    const rawEncoders: string[] = ['Automatic', 'None', ...DEFAULT_MANUAL_TEXT_ENCODERS];
    const data = await this.getT2IParams();

    for (const p of getT2IParamDefinitions(data)) {
      const id = String(p?.id || '').trim().toLowerCase();
      if (id !== 'textencoder' && id !== 'textencoder2') continue;
      if (!Array.isArray(p?.values)) continue;

      for (const value of p.values) {
        let raw = '';
        if (typeof value === 'string') raw = value;
        else if (value && typeof value === 'object') {
          raw = String((value as any).name ?? (value as any).value ?? (value as any).id ?? '');
        }
        raw = raw.split('///')[0].trim();
        if (!raw || raw === 'Automatic' || raw === 'None') continue;
        rawEncoders.push(raw);
      }
    }

    return deduplicateModelList(rawEncoders);
  }

  public async listYoloModels(): Promise<string[]> {
    try {
      const t2i = await this.getT2IParams();
      if (t2i?.list && Array.isArray(t2i.list)) {
        const yoloParam = t2i.list.find((p: any) => p.id === 'yolomodelinternal');
        if (yoloParam?.values && Array.isArray(yoloParam.values) && yoloParam.values.length > 0) {
          return yoloParam.values;
        }
      }
    } catch (e) {
      console.warn('[SwarmClient] Could not fetch yolomodelinternal values:', e);
    }
    return ['face_yolov8m.pt', 'face_yolov8n.pt', 'face_yolov9c.pt', 'hand_yolov8n.pt', 'person_yolov8m-seg.pt'];
  }

  public async listServerImages(): Promise<ServerImageItem[]> {
    if (serverImageScanPromise) return serverImageScanPromise;

    const runScan = async (): Promise<ServerImageItem[]> => {
      type ListImagesResponse = { files?: unknown[]; folders?: unknown[] };

      const session = await getSession();
      const endpoint = apiUrl('ListImages');

      const parseFiles = (data: ListImagesResponse): ServerImageItem[] => {
        const files = Array.isArray(data?.files) ? data.files : [];
        return files
          .map((f: any): ServerImageItem | null => {
            const raw = typeof f === 'string'
              ? f
              : f?.src ?? f?.path ?? f?.name ?? f?.data ?? '';
            if (typeof raw !== 'string' || !raw.trim()) return null;

            const clean = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '');
            const normalized = normalizeImagePath(clean);
            if (!normalized) return null;

            const metadata = typeof f?.metadata === 'string'
              ? f.metadata
              : (f?.metadata && typeof f.metadata === 'object' ? JSON.stringify(f.metadata) : undefined);

            return { url: normalized, name: clean, metadata };
          })
          .filter((item: ServerImageItem | null): item is ServerImageItem => Boolean(item));
      };

      const normalizeFolder = (value: unknown): string =>
        String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

      const isStarredMirror = (folder: string): boolean =>
        folder === 'Starred' || folder.startsWith('Starred/');

      const requestList = async (
        path: string,
        depth: number,
        filter?: string,
      ): Promise<ListImagesResponse | null> => {
        const body: Record<string, unknown> = {
          session_id: session,
          path,
          depth,
          sortBy: 'Date',
          sortReverse: true,
        };
        if (filter) body.filter = filter;

        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            const data = await res.json().catch(() => null) as ListImagesResponse & { error?: unknown } | null;
            if (res.ok && !data?.error) return data || {};

            lastError = data?.error || `HTTP ${res.status}`;
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 750 : 1800));
            }
          } catch (error) {
            lastError = error;
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 750 : 1800));
            }
          }
        }

        emitDiagnostic({
          level: 'warn',
          scope: 'image',
          message: `ListImages(${path || 'root'}${filter ? ` filter=${filter}` : ''}) failed after retries`,
          endpoint,
          details: lastError instanceof Error ? lastError.message : lastError,
        });
        return null;
      };

      try {
        // IMPORTANT: crawl the history tree one folder at a time. The old
        // implementation issued a recursive root scan and then up to four
        // additional ListImages requests concurrently. SwarmUI itself already
        // parallelizes folder metadata reads internally, so frontend concurrency
        // multiplies access to the same LiteDB stores and can race during rebuilds.
        const root = await requestList('', 1);
        if (!root) return [];

        const all: ServerImageItem[] = parseFiles(root);
        const seenUrls = new Set(all.map((item) => item.url));
        const seenFolders = new Set<string>();
        const folderQueue: string[] = [];

        const enqueueFolders = (values: unknown[]) => {
          for (const value of values) {
            const folder = normalizeFolder(value);
            if (!folder || isStarredMirror(folder) || seenFolders.has(folder)) continue;
            seenFolders.add(folder);
            folderQueue.push(folder);
          }
        };

        enqueueFolders(Array.isArray(root.folders) ? root.folders : []);

        let cursor = 0;
        let scannedFolders = 0;
        let cappedFolderCount = 0;

        while (cursor < folderQueue.length) {
          const folder = folderQueue[cursor++];
          scannedFolders += 1;

          const data = await requestList(folder, 1);
          if (!data) continue;

          const direct = parseFiles(data);
          for (const item of direct) {
            if (!seenUrls.has(item.url)) {
              seenUrls.add(item.url);
              all.push(item);
            } else {
              const existingIndex = all.findIndex((x) => x.url === item.url);
              if (existingIndex >= 0 && item.metadata && !all[existingIndex].metadata) {
                all[existingIndex] = item;
              }
            }
          }

          // depth=1 returns direct files plus immediate child folders, so this
          // is a complete, safe breadth-first walk of arbitrary output layouts.
          enqueueFolders(Array.isArray(data.folders) ? data.folders : []);

          // A single folder can still hit MaxImagesInHistory (commonly 100).
          // For standard date folders, split only capped-looking folders by hour
          // using a path-qualified filter. Requests remain SERIALIZED.
          if (direct.length >= 100 && /(?:^|\/)\d{4}-\d{2}-\d{2}$/.test(folder)) {
            cappedFolderCount += 1;
            for (let hour = 0; hour < 24; hour += 1) {
              const hourPrefix = `${folder}/${String(hour).padStart(2, '0')}`;
              const filtered = await requestList(folder, 1, hourPrefix);
              if (!filtered) continue;

              const filteredItems = parseFiles(filtered);
              for (const item of filteredItems) {
                if (!seenUrls.has(item.url)) {
                  seenUrls.add(item.url);
                  all.push(item);
                }
              }
            }
          }
        }

        all.sort((a, b) => b.name.localeCompare(a.name));

        emitDiagnostic({
          level: 'success',
          scope: 'image',
          message: `Server gallery scan found ${all.length} image(s) across ${scannedFolders} folder(s).`,
          endpoint,
          details: {
            rootCount: parseFiles(root).length,
            scannedFolders,
            cappedFolderCount,
            skippedStarredMirror: true,
            serialized: true,
          },
        });

        return all;
      } catch (error) {
        emitDiagnostic({
          level: 'warn',
          scope: 'image',
          message: `ListImages scan failed: ${error instanceof Error ? error.message : String(error)}`,
          endpoint,
        });
        return [];
      }
    };

    serverImageScanPromise = runScan();
    try {
      return await serverImageScanPromise;
    } finally {
      serverImageScanPromise = null;
    }
  }

  public async interrupt(sessionId?: string): Promise<boolean> {
    // Capture the target before awaiting anything: a rapid cancel -> queue sequence
    // may rotate the shared session while the interrupt request is in flight.
    const session = sessionId || activeGenerationSessionId || activeSessionId;
    if (!session) return false;
    try {
      const res = await fetch(apiUrl('InterruptJob'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
      if (activeGenerationSessionId === session && activeGenerationSocket) {
        try { activeGenerationSocket.close(1000, 'Interrupted by user'); } catch {}
      }
      emitDiagnostic({
        level: 'warn',
        scope: 'workflow',
        message: `Interrupt request sent to SwarmUI session ${session}`
      });
      return res.ok;
    } catch {
      if (activeGenerationSessionId === session && activeGenerationSocket) {
        try { activeGenerationSocket.close(1000, 'Interrupted by user'); } catch {}
      }
      return false;
    }
  }

  public async generateImage(
    params: GenParams,
    onProgress: (payload: ProgressPayload) => void
  ): Promise<{ imageUrl: string; images: string[] }> {
    // The queue processor may already have created the exact session it wants to
    // use. Reusing it keeps the stateful session ID aligned with InterruptJob and
    // avoids creating a second, uncancellable session for the same generation.
    const session = params.session_id || await this.getNewSession();
    activeSessionId = session;
    activeGenerationSessionId = session;
    params.session_id = session;

    return new Promise((resolve, reject) => {
      const wsUrl = wsApiUrl('GenerateText2ImageWS', session);
      const ws = new WebSocket(wsUrl);
      activeGenerationSocket = ws;
      let resolved = false;
      let warnedMissingCoreNodes = false;
      let latestBackendError = '';
      const collectedImages: string[] = [];

      ws.onopen = async () => {
        const cleanPayload: Record<string, any> = {
          session_id: params.session_id,
          prompt: params.prompt,
          negativeprompt: params.negativeprompt || '',
          model: params.model,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgscale: params.cfgscale,
          seed: params.seed,
          sampler: params.sampler,
          scheduler: params.scheduler,
          images: 1,
          donotsave: false
        };

        const t2i = t2iParamsCache?.data || await this.getT2IParams();
        const supported = advertisedParamIds(t2i);

        if (params.vae && params.vae !== 'Automatic' && params.vae !== 'None') {
          if (supported.has('vae')) cleanPayload.vae = params.vae;
          else emitDiagnostic({ level: 'info', scope: 'workflow', message: 'VAE override omitted: SwarmUI does not advertise a VAE request parameter for this backend.' });
        }

        if (params.textencoder && params.textencoder !== 'Automatic' && params.textencoder !== 'None') {
          if (supported.has('textencoder')) {
            cleanPayload.textencoder = params.textencoder;
          } else {
            // Keep the user's manual choice in generation metadata, but never
            // send an unsupported parameter that SwarmUI will reject/ignore.
            cleanPayload.extra_metadata = JSON.stringify({
              ...(typeof cleanPayload.extra_metadata === 'object' ? cleanPayload.extra_metadata : {}),
              swarm_canvas_manual_text_encoder: params.textencoder,
            });
            emitDiagnostic({ level: 'warn', scope: 'workflow', message: `Manual text encoder '${params.textencoder}' is selected, but this SwarmUI backend does not advertise a textencoder override parameter. The choice is preserved in metadata and will be applied only when a compatible/custom workflow exposes the encoder input.` });
          }
        }

        if (params.textencoder2 && params.textencoder2 !== 'Automatic' && params.textencoder2 !== 'None' && supported.has('textencoder2')) {
          cleanPayload.textencoder2 = params.textencoder2;
        }

        // SwarmUI YOLO / Segmentation parameters are sent only when advertised by the server.
        if (params.yolomodelinternal && supported.has('yolomodelinternal')) {
          cleanPayload.yolomodelinternal = params.yolomodelinternal;
          if (params.segmentsteps !== undefined && supported.has('segmentsteps')) cleanPayload.segmentsteps = params.segmentsteps;
          if (params.segmentthresholdmax !== undefined && supported.has('segmentthresholdmax')) cleanPayload.segmentthresholdmax = params.segmentthresholdmax;
          if (params.segmentmaskgrow !== undefined && supported.has('segmentmaskgrow')) cleanPayload.segmentmaskgrow = params.segmentmaskgrow;
          if (params.segmentmaskblur !== undefined && supported.has('segmentmaskblur')) cleanPayload.segmentmaskblur = params.segmentmaskblur;
          if (params.segmentmaskoversize !== undefined && supported.has('segmentmaskoversize')) cleanPayload.segmentmaskoversize = params.segmentmaskoversize;
          if (params.segmentsortorder !== undefined && supported.has('segmentsortorder')) cleanPayload.segmentsortorder = params.segmentsortorder;
          if (params.savesegmentmask !== undefined && supported.has('savesegmentmask')) cleanPayload.savesegmentmask = params.savesegmentmask;
        }

        emitDiagnostic({
          level: 'info',
          scope: 'workflow',
          message: `Generation payload dispatched: ${params.model} (${params.steps} steps)`,
          details: cleanPayload
        });

        ws.send(JSON.stringify(cleanPayload));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          const topLevelImage = normalizeImageValue(msg.image);
          if (topLevelImage && !topLevelImage.startsWith('data:')) {
            const normalized = normalizeImagePath(topLevelImage);
            if (normalized && !collectedImages.includes(normalized)) collectedImages.push(normalized);
          }

          if (Array.isArray(msg.images)) {
            for (const img of msg.images) {
              const value = normalizeImageValue(img);
              if (!value || value.startsWith('data:')) continue;
              const normalized = normalizeImagePath(value);
              if (normalized && !collectedImages.includes(normalized)) collectedImages.push(normalized);
            }
          }

          // SwarmUI streams progress under gen_progress. Different backend versions
          // use step/current_step and preview/preview_url; accept all known variants.
          const backendMessage = String(
            msg?.backend_status?.message ||
            msg?.backend_status?.error ||
            msg?.backend_status?.status ||
            '',
          ).trim();
          if (/error|failed|cannot generate|refused to generate|all backends failed|execution error/i.test(backendMessage)) {
            latestBackendError = backendMessage;
          }
          if (!warnedMissingCoreNodes && /missing.*swarm core nodes/i.test(backendMessage)) {
            warnedMissingCoreNodes = true;
            emitDiagnostic({
              level: 'error',
              scope: 'connection',
              message: 'SwarmUI reports that the Comfy backend is missing Swarm core nodes. Generation may be incomplete or some features may be unavailable. Reinstall/restart the self-starting Comfy backend before debugging client payloads.',
              details: msg.backend_status,
            });
          }

          const p = (msg.gen_progress || msg.progress_data || msg.data || msg) as Record<string, any>;
          const hasProgress =
            p.step !== undefined ||
            p.current_step !== undefined ||
            p.current_percent !== undefined ||
            p.overall_percent !== undefined ||
            p.percent !== undefined ||
            p.preview !== undefined ||
            p.preview_url !== undefined ||
            p.previewUrl !== undefined ||
            msg.gen_progress !== undefined;

          if (hasProgress) {
            const step = Number(
              p.step ?? p.current_step ?? p.currentStep ??
              Math.round((Number(p.current_percent ?? p.overall_percent ?? p.percent ?? 0) > 1
                ? Number(p.current_percent ?? p.overall_percent ?? p.percent ?? 0) / 100
                : Number(p.current_percent ?? p.overall_percent ?? p.percent ?? 0)) * params.steps)
            );
            const max = Number(p.max_steps ?? p.maxSteps ?? p.total_steps ?? p.totalSteps ?? params.steps) || params.steps;
            const rawPct = Number(p.overall_percent ?? p.percent ?? p.current_percent ?? (max > 0 ? step / max : 0));
            const percent = Math.max(0, Math.min(100, Math.round(rawPct > 1 ? rawPct : rawPct * 100)));

            const rawPreview = normalizeImageValue(
              p.preview ?? p.preview_url ?? p.previewUrl ?? p.live_preview ?? p.image ?? msg.preview ?? msg.preview_url
            );
            const previewUrl = rawPreview ? normalizeImagePath(rawPreview) || rawPreview : undefined;

            onProgress({
              step: Number.isFinite(step) ? step : 0,
              maxSteps: max,
              max_steps: max,
              percent,
              overall_percent: percent / 100,
              previewUrl,
              preview: previewUrl,
              speed: typeof p.speed === 'number' ? p.speed : Number.isFinite(Number(p.speed)) ? Number(p.speed) : undefined,
              eta: typeof p.eta === 'number' ? p.eta : Number.isFinite(Number(p.eta)) ? Number(p.eta) : undefined,
              stage: p.status || p.stage || p.current_stage || msg.status || (step === 0 ? 'Loading Model' : 'Sampling')
            });
          }

          if (msg.complete === true || msg.status === 'complete' || msg.status === 'done') {
            if (!resolved && collectedImages.length > 0) {
              resolved = true;
              emitDiagnostic({
                level: 'success',
                scope: 'image',
                message: `Generation completed with ${collectedImages.length} image(s)`
              });
              if (activeGenerationSessionId === session) { activeGenerationSessionId = ''; if (activeGenerationSocket === ws) activeGenerationSocket = null; }
              try { ws.close(1000, 'Generation complete'); } catch {}
              resolve({ imageUrl: collectedImages[collectedImages.length - 1], images: collectedImages });
            }
          }

          if (msg.error || latestBackendError && /error|failed|cannot generate|refused to generate|all backends failed|execution error/i.test(backendMessage)) {
            if (!resolved) {
              const errorText = String(msg.error || latestBackendError || backendMessage || 'SwarmUI reported a generation failure.').trim();
              resolved = true;
              emitDiagnostic({
                level: 'error',
                scope: 'workflow',
                message: `Generation failed: ${errorText}`
              });
              if (activeGenerationSessionId === session) { activeGenerationSessionId = ''; if (activeGenerationSocket === ws) activeGenerationSocket = null; }
              try { ws.close(1000, 'Generation failed'); } catch {}
              reject(new Error(errorText));
            }
          }
        } catch (e) {
          console.warn('[SwarmClient] WS parse error:', e);
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          emitDiagnostic({
            level: 'error',
            scope: 'connection',
            message: 'WebSocket connection failed'
          });
          if (activeGenerationSessionId === session) { activeGenerationSessionId = ''; if (activeGenerationSocket === ws) activeGenerationSocket = null; }
          reject(new Error('WebSocket connection to SwarmUI failed.'));
        }
      };

      ws.onclose = () => {
        if (!resolved) {
          resolved = true;
          if (activeGenerationSessionId === session) { activeGenerationSessionId = ''; if (activeGenerationSocket === ws) activeGenerationSocket = null; }
          if (collectedImages.length > 0) {
            resolve({ imageUrl: collectedImages[collectedImages.length - 1], images: collectedImages });
          } else {
            reject(new Error('WebSocket closed without generating output images.'));
          }
        }
      };
    });
  }
}

export const swarmClient = new SwarmClientClass();