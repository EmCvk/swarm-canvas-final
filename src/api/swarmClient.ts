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
const diagnosticSubscribers = new Set<(event: SwarmDiagnosticEvent) => void>();

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
      const res = await fetch('/API/GetNewSession', {
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
            endpoint: '/API/GetNewSession',
            status: res.status
          });
          return activeSessionId;
        }
      }
    } catch (err: any) {
      console.error('[SwarmClient] Session request failed:', err);
      emitDiagnostic({
        level: 'error',
        scope: 'connection',
        message: `Failed to acquire session: ${err?.message || err}`,
        endpoint: '/API/GetNewSession'
      });
    } finally {
      sessionPromise = null;
    }
    activeSessionId = `sess_${Date.now()}`;
    return activeSessionId;
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

class SwarmClientClass {
  private baseUrl = 'http://localhost:7801';

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
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
      const res = await fetch('/API/GetNewSession', {
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
      await fetch('/API/TriggerRefresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
    } catch {}
  }

  public async getT2IParams(): Promise<any> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListT2IParams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session })
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public async listModels(subtype = 'Stable-Diffusion'): Promise<ModelItemResult[]> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListModels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session,
          path: '',
          depth: 100,
          subtype: subtype,
          sortBy: 'Name'
        })
      });

      if (!res.ok) return [];

      const data = await res.json();
      if (data?.error) return [];

      const files = data?.files || data?.models || [];
      if (Array.isArray(files)) {
        return files.map((item: any) => {
          if (typeof item === 'string') {
            return { name: item };
          }

          const rawPreview = item.preview_image || item.preview || item.image;
          let previewUrl: string | undefined = undefined;
          if (rawPreview) {
            if (rawPreview.startsWith('http') || rawPreview.startsWith('data:')) {
              previewUrl = rawPreview;
            } else {
              const clean = rawPreview.replace(/^\/+/, '');
              previewUrl = clean.startsWith('View/') ? `/${clean}` : `/View/${clean}`;
            }
          }

          let triggerWords: string[] | undefined = undefined;
          if (Array.isArray(item.trigger_words)) {
            triggerWords = item.trigger_words;
          } else if (typeof item.trigger_phrase === 'string' && item.trigger_phrase.trim()) {
            triggerWords = item.trigger_phrase.split(',').map((s: string) => s.trim()).filter(Boolean);
          } else if (Array.isArray(item.metadata?.trigger_words)) {
            triggerWords = item.metadata.trigger_words;
          }

          return {
            name: item.name || item.data || item.title || String(item),
            previewUrl,
            description: item.description || item.metadata?.description || undefined,
            triggerWords
          };
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  public async listWildcards(): Promise<string[]> {
    const data = await this.getT2IParams();
    if (data?.wildcards && Array.isArray(data.wildcards)) {
      return data.wildcards;
    }
    const models = await this.listModels('Wildcards');
    return models.map((w) => w.name);
  }

  public async listVAEs(): Promise<string[]> {
    const rawVaes: string[] = ['Automatic', 'None'];
    try {
      const models = await this.listModels('VAE');
      models.forEach((m) => {
        if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
          rawVaes.push(m.name);
        }
      });
    } catch {}
    return deduplicateModelList(rawVaes);
  }

  public async listTextEncoders(): Promise<string[]> {
    const rawEncoders: string[] = ['Automatic', 'None'];
    const subtypes = ['Clip', 'CLIP', 'Text-Encoder', 'TextEncoder', 'text_encoders'];
    for (const sub of subtypes) {
      try {
        const models = await this.listModels(sub);
        if (models && models.length > 0) {
          models.forEach((m) => {
            if (m.name && m.name !== 'Automatic' && m.name !== 'None') {
              rawEncoders.push(m.name);
            }
          });
        }
      } catch {}
    }
    try {
      const t2i = await this.getT2IParams();
      if (t2i?.list && Array.isArray(t2i.list)) {
        for (const p of t2i.list) {
          const id = (p.id || '').toLowerCase();
          if (id === 'cliplmodel' || id === 'clipgmodel' || id === 'clip' || id === 'textencoder') {
            if (Array.isArray(p.values)) {
              p.values.forEach((v: string) => {
                if (v && v !== 'Automatic' && v !== 'None') rawEncoders.push(v);
              });
            }
          }
        }
      }
    } catch {}
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

  public async listServerImages(): Promise<Array<{ url: string; name: string }>> {
    try {
      const session = await getSession();
      const res = await fetch('/API/ListImages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session, path: '', depth: 10 })
      });
      if (res.ok) {
        const data = await res.json();
        const files = data?.files || [];
        return files.map((f: any) => {
          const raw = typeof f === 'string' ? f : f.data || f.name || f.src;
          const clean = raw.replace(/^\/+/, '');
          const url = clean.startsWith('http') || clean.startsWith('data:') ? clean : `/View/${clean.replace(/^(View\/)?/, '')}`;
          return { url, name: clean };
        });
      }
    } catch {}
    return [];
  }

  public async interrupt(sessionId?: string): Promise<boolean> {
    // Capture the target before awaiting anything: a rapid cancel -> queue sequence
    // may rotate the shared session while the interrupt request is in flight.
    const session = sessionId || activeGenerationSessionId || activeSessionId;
    if (!session) return false;
    try {
      const res = await fetch('/API/InterruptJob', {
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
      const configuredBase = this.baseUrl.replace(/\/+$/, '');
      let wsUrl: string;
      // Vite dev server proxies /API websockets to SwarmUI. Packaged/Tauri builds
      // have no Vite proxy, so connect directly to the configured backend instead.
      const isViteDevProxy = typeof window !== 'undefined' && ['1420', '5173'].includes(window.location.port);
      if (isViteDevProxy) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProtocol}//${window.location.host}/API/GenerateText2ImageWS?session_id=${encodeURIComponent(session)}`;
      } else {
        const wsBase = configuredBase.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
        wsUrl = `${wsBase}/API/GenerateText2ImageWS?session_id=${encodeURIComponent(session)}`;
      }
      const ws = new WebSocket(wsUrl);
      activeGenerationSocket = ws;
      let resolved = false;
      const collectedImages: string[] = [];

      ws.onopen = () => {
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

        if (params.vae && params.vae !== 'Automatic' && params.vae !== 'None') {
          cleanPayload.vae = params.vae;
        }

        if (params.textencoder && params.textencoder !== 'Automatic' && params.textencoder !== 'None') {
          cleanPayload.textencoder = params.textencoder;
          cleanPayload.cliplmodel = params.textencoder;
          cleanPayload.clipgmodel = params.textencoder;
          cleanPayload.t5model = params.textencoder;
          cleanPayload.clipmodel = params.textencoder;
        }

        if (params.textencoder2 && params.textencoder2 !== 'Automatic' && params.textencoder2 !== 'None') {
          cleanPayload.textencoder2 = params.textencoder2;
        }

        // SwarmUI YOLO / Segmentation parameters (GenParams verified)
        if (params.yolomodelinternal) {
          cleanPayload.yolomodelinternal = params.yolomodelinternal;
          if (params.segmentsteps !== undefined) cleanPayload.segmentsteps = params.segmentsteps;
          if (params.segmentthresholdmax !== undefined) cleanPayload.segmentthresholdmax = params.segmentthresholdmax;
          if (params.segmentmaskgrow !== undefined) cleanPayload.segmentmaskgrow = params.segmentmaskgrow;
          if (params.segmentmaskblur !== undefined) cleanPayload.segmentmaskblur = params.segmentmaskblur;
          if (params.segmentmaskoversize !== undefined) cleanPayload.segmentmaskoversize = params.segmentmaskoversize;
          if (params.segmentsortorder !== undefined) cleanPayload.segmentsortorder = params.segmentsortorder;
          if (params.savesegmentmask !== undefined) cleanPayload.savesegmentmask = params.savesegmentmask;
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

          if (msg.error) {
            if (!resolved) {
              resolved = true;
              emitDiagnostic({
                level: 'error',
                scope: 'workflow',
                message: `Generation failed: ${msg.error}`
              });
              if (activeGenerationSessionId === session) { activeGenerationSessionId = ''; if (activeGenerationSocket === ws) activeGenerationSocket = null; }
              try { ws.close(1000, 'Generation failed'); } catch {}
              reject(new Error(msg.error));
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