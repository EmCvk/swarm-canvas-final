import { create, type StateCreator } from 'zustand';
import { convertFileSrc } from '@tauri-apps/api/core';
import { persist, createJSONStorage } from 'zustand/middleware';
import { swarmClient, SwarmProgressData, ServerImageItem, emitDiagnostic } from '../api/swarmClient';
import { civitaiService, CivitaiAssetType } from '../api/civitaiService';
import { emitToast } from '../utils/toast';
import { addHistoryItemsToProject, loadProjectEntries, updateProjectEntryMetadata, removeProjectEntries } from '../api/projectStorage';

export interface ModelItem {
  name: string;
  previewUrl?: string;
  previewUrls?: string[];
  triggerWords?: string[];
  description?: string;
  baseModel?: string;
  modelName?: string;
  versionName?: string;
  modelId?: number;
  versionId?: number;
  fileName?: string;
  civitaiMatchedBy?: 'version-id' | 'model-id' | 'hash' | 'filename' | 'model-name' | 'manual-url';
  civitaiConfidence?: number;
  civitaiCompleteness?: number;
  civitaiStatus?: 'idle' | 'matched' | 'partial' | 'unresolved' | 'temporarily_failed' | 'not_found' | 'manual';
  civitaiUrl?: string;
  aliases?: string[];
  favorite?: boolean;
  pinned?: boolean;
  lastUsedAt?: number;
  addedAt?: number;
  sha256?: string;
  blake3?: string;
  crc32?: string;
  autoV1?: string;
  autoV2?: string;
  autoV3?: string;
  hash?: string;
  air?: string;
  civitaiError?: string;
}

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
  target: 'positive' | 'negative';
  createdAt: number;
  tagsCount: number;
}

export interface HistoryItem {
  id: string;
  batchId: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  createdAt: string;
  /** Raw SwarmUI metadata returned by /API/ListImages for server-history entries. */
  rawMetadata?: string;
  /** Whether this entry originated from the SwarmUI server history scan. */
  serverOrigin?: boolean;
  /** Original server history path, before conversion to /View/... . */
  serverPath?: string;
  /** Local Project relative filename, present only for images stored in the Local Project folder. */
  localProjectFile?: string;
  /** Absolute Local Project root used for this file. Preserved so older entries remain addressable after the setting changes. */
  localProjectRoot?: string;
  timestamp: number;
  isFavorite?: boolean;
  /** id of the HistoryItem this generation branched from (reroll / variation / edit), if any. */
  parentId?: string;
  /** How this generation relates to its parent - drives the label shown in the lineage view. */
  relation?: 'variation' | 'branch';
  params: {
    model: string;
    steps: number;
    cfgScale?: number;
    seed?: number;
    width?: number;
    height?: number;
    sampler?: string;
    scheduler?: string;
  };
}

export interface ControlNetUnit {
  id: string;
  enabled: boolean;
  preprocessor: string;
  controlMode: 'balanced' | 'prompt_priority' | 'controlnet_priority';
  weight: number;
  image?: string;
}

export interface ADetailerUnit {
  id: string;
  enabled: boolean;
  model: string;
  confidence: number;
  denoiseStrength: number;
  prompt?: string;
  negativePrompt?: string;
  steps?: number;
  maskGrow?: number;
  maskBlur?: number;
  maskOversize?: number;
  sortOrder?: 'largest-smallest' | 'smallest-largest' | 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';
  saveMask?: boolean;
}

export interface QueueItem {
  id: string;
  batchId: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  vae?: string;
  textEncoder: string;
  textEncoder2: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: string;
  scheduler: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  progress?: number;
  step?: number;
  maxSteps?: number;
  createdAt: number;
  aDetailerUnits?: ADetailerUnit[];
  /** id of the HistoryItem this job branches from, if it was queued via Reroll/Branch. */
  parentId?: string;
  relation?: 'variation' | 'branch';
}

function formatStoreError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) return `${error.name ? `${error.name}: ` : ''}${error.message}`;
    return error.name || 'Error';
  }
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = value.message ?? value.error ?? value.kind ?? value.code;
    if (typeof message === 'string' && message.trim()) return message;
    try {
      const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (serialized && serialized !== '{}') return serialized;
    } catch { /* fall through */ }
    try { return String(error); } catch { /* fall through */ }
  }
  return String(error ?? 'unknown error');
}

export interface AppSettings {
  activePreset: 'Default' | 'Prompt Engineer' | 'Studio Canvas' | 'Multi-ControlNet';
  bottomPanelHeight: number;
  sectionScales: {
    pills: number;
    params: number;
    extranetworks: number;
    history: number;
    controlnet: number;
    adetailer: number;
    imagesearch: number;
  };
  hideProgressBar: boolean;
  categorizationMode: 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
  tagSortOrder: 'alphabetical' | 'popularity';
  autoInjectLoraTrigger: boolean;
  autoInjectModelKeywords: boolean;
  showTagPlusPrefix: boolean;
  showTagPostCounts: boolean;
  useUnderscores: boolean;
  tagClickWeightStep: number;
  preservePromptsOnReload: boolean;
  randomizeSeedOnGen: boolean;
  autoSaveLayout: boolean;
  maxHistoryCount: number;
  defaultLoraWeight?: number;
  separateBatches: boolean;
  autoSwapToLatest: boolean;
  playCompletionSound: boolean;
  completionSoundData: string | null;
  saveBeforeAfterADetailer: boolean;
  autoCivitaiScan: boolean;
  galleryPageSize: number;
  gallerySource: 'session' | 'project' | 'outputs';
  galleryGroupByQueue: boolean;
  saveGeneratedImagesToProject: boolean;
  /** User-selected root folder for SwarmCanvas Local Project output. Empty means the app default. */
  localProjectPath: string;
  projectJpegQuality: number;
  projectJpegMaxDimension: number;
  projectJpegBackground: 'black' | 'white';
  projectJpegFilenamePrefix: string;
  projectImageFormat: 'original' | 'jpg' | 'jpeg' | 'png' | 'webp';
  outputFolderPath: string;
  /** Crash/refresh recovery: when true, a leftover queue from a previous session resumes
   *  processing automatically on launch instead of waiting for the user to confirm. */
  autoResumeQueueOnLaunch: boolean;

  // Panel View Mode Preservations
  panelViewModes: {
    extraNetworks: 'cards' | 'compact' | 'list';
    history: 'cards' | 'compact' | 'list';
    gallery: 'cards' | 'compact' | 'list';
  };

  // UI Theme Checkpoint Switch
  uiTheme: 'obsidian' | 'arctic' | 'paper' | 'terminal' | 'midnight' | 'forest' | 'clay' | 'mono' | 'contrast' | 'nord' | 'dracula' | 'solarized' | 'rose' | 'coffee' | 'matrix' | 'sunset' | 'cyber_black' | 'classic';
  fontScale: number;
  autoApplyModelPreset: boolean;
  hideInlineLorasInPromptBoxes: boolean;
  showPromptSectionHeaders: boolean;
  showPromptSectionStats: boolean;
  showPromptSelectionToolbar: boolean;
  promptSyntaxQuickInsert: boolean;
  doubleClickEditPromptPills: boolean;
  /** Where a History/Gallery image click should open the image. */
  imageOpenTarget: 'viewport' | 'generationviewer';
}

let generationRunToken = 0;
let pendingInterruptPromise: Promise<boolean> | null = null;

export function stripDisabledPromptTags(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
}

function parseMetadataObject(raw?: string): Record<string, any> | null {
  if (!raw || typeof raw !== 'string') return null;
  let value: unknown = raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (typeof value === 'object' && value !== null) return value as Record<string, any>;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? value as Record<string, any> : null;
}

function metadataNumber(value: unknown, fallback?: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function metadataString(value: unknown): string | undefined {
  if (typeof value !== 'string') return value == null ? undefined : String(value);
  const clean = value.trim();
  return clean || undefined;
}

function stableServerImageId(path: string): string {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `server-${(hash >>> 0).toString(36)}`;
}

function inferServerTimestamp(path: string, fallback: number): number {
  const match = path.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})\/(\d{2})(\d{2})(?:\d{2})?(?:[-_]|$)/);
  if (!match) return fallback;
  const parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:00`).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseServerImageMetadata(image: ServerImageItem, fallbackTimestamp: number): {
  prompt?: string;
  negativePrompt?: string;
  timestamp: number;
  isFavorite?: boolean;
  batchId?: string;
  params: HistoryItem['params'];
} {
  const root = parseMetadataObject(image.metadata);
  const rawParams = root?.sui_image_params || root?.params || root || {};
  const extra = root?.sui_extra_data || {};

  const prompt = metadataString(rawParams.prompt ?? rawParams.Prompt ?? extra.original_prompt);
  const negativePrompt = metadataString(rawParams.negativeprompt ?? rawParams.negative_prompt ?? rawParams['Negative Prompt']);
  const timestamp = inferServerTimestamp(image.name, fallbackTimestamp);
  const starredRaw = root?.is_starred ?? rawParams.is_starred ?? extra.is_starred;
  const isFavorite = typeof starredRaw === 'boolean' ? starredRaw : undefined;
  const batchId = metadataString(rawParams.batchId ?? rawParams.batch_id ?? extra.batchId ?? extra.batch_id ?? root?.batchId ?? root?.batch_id);

  return {
    prompt,
    negativePrompt,
    timestamp,
    isFavorite,
    batchId,
    params: {
      model: metadataString(rawParams.model) || 'Unknown',
      steps: metadataNumber(rawParams.steps, 28) || 28,
      cfgScale: metadataNumber(rawParams.cfgscale ?? rawParams.cfg_scale ?? rawParams.cfg),
      seed: metadataNumber(rawParams.seed),
      width: metadataNumber(rawParams.width),
      height: metadataNumber(rawParams.height),
      sampler: metadataString(rawParams.sampler),
      scheduler: metadataString(rawParams.scheduler),
    },
  };
}

export const SWARM_VALID_SAMPLERS = [
  // Euler & Variants
  { id: 'euler', label: 'Euler' },
  { id: 'euler_ancestral', label: 'Euler Ancestral' },
  { id: 'euler_cfg_pp', label: 'Euler CFG++' },

  // ER-SDE & Stochastic Modern Samplers
  { id: 'er_sde', label: 'ER-SDE' },
  { id: 'er_sde_exponential', label: 'ER-SDE (Exponential)' },
  { id: 'dpmpp_sde', label: 'DPM++ SDE' },
  { id: 'dpmpp_sde_gpu', label: 'DPM++ SDE (GPU)' },
  { id: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { id: 'dpmpp_2m_sde_gpu', label: 'DPM++ 2M SDE (GPU)' },
  { id: 'dpmpp_3m_sde', label: 'DPM++ 3M SDE' },
  { id: 'dpmpp_3m_sde_gpu', label: 'DPM++ 3M SDE (GPU)' },

  // DPM++ & Heun
  { id: 'dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { id: 'dpm_2', label: 'DPM 2' },
  { id: 'dpm_2_ancestral', label: 'DPM 2 Ancestral' },
  { id: 'heun', label: 'Heun' },
  { id: 'heunpp2', label: 'Heun++ 2' },
  { id: 'dpm_fast', label: 'DPM Fast' },
  { id: 'dpm_adaptive', label: 'DPM Adaptive' },

  // Multistep & Predictor-Corrector
  { id: 'lms', label: 'LMS' },
  { id: 'uni_pc', label: 'UniPC' },
  { id: 'uni_pc_bh2', label: 'UniPC BH2' },
  { id: 'ipndm', label: 'IPNDM' },
  { id: 'ipndm_v', label: 'IPNDM_V' },

  // Inversion & Accelerated
  { id: 'ddim', label: 'DDIM' },
  { id: 'ddpm', label: 'DDPM' },
  { id: 'lcm', label: 'LCM' },
  { id: 'res_multistep', label: 'Restart MultiStep' },
  { id: 'res_multistep_cfg_pp', label: 'Restart MultiStep CFG++' },
];

export const SWARM_VALID_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'beta',
  'align_your_steps',
  'ays',
  'turbo',
  'kl_optimal',
];

export interface AppState {
  serverUrl: string;
  sessionId: string | null;
  isConnected: boolean;

  history: HistoryItem[];
  galleryHistory: HistoryItem[];
  projectHistory: HistoryItem[];
  /** Total number of files in the configured All Outputs root. Only lightweight index data is cached natively. */
  outputGalleryTotalCount: number;
  /** Highest output page index that has been cached. With direct page jumps this is not a count. */
  outputGalleryLoadedPages: number;
  /** Individual All Outputs pages that are cached; allows instant navigation back to old pages and direct jumps. */
  outputGalleryLoadedPageNumbers: number[];
  /** Page -> already materialized gallery entries for All Outputs. Not persisted. */
  outputGalleryPages: Record<number, HistoryItem[]>;
  galleryCurrentPage: number;
  generationViewerItem: HistoryItem | null;
  emptyBatches: string[];

  prompt: string;
  negativePrompt: string;
  activeMacroCategory: string;
  activeSubCategory: string;
  pillSearchQuery: string;
  hideProgressBar: boolean;
  model: string;
  modelsList: ModelItem[];
  lorasList: ModelItem[];
  embeddingsList: ModelItem[];
  wildcardsList: string[];
  vae: string;
  vaesList: string[];
  textEncoder: string;
  textEncoder2: string;
  selectedTextEncoders: string[];
  textEncodersList: string[];
  yoloModelsList: string[];

  startNewBatch: () => void;
  createNewEmptyBatch: () => void;
  moveJobToBatch: (jobId: string, targetBatchId: string) => void;
  duplicateQueuedItem: (id: string) => void;
  addVariationToBatch: (batchId: string) => void;
  removeBatchFromQueue: (batchId: string) => void;

  isQueuePaused: boolean;
  setIsQueuePaused: (paused: boolean) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;

  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: string;
  scheduler: string;
  batchCount: number;

  activeImage: string | null;
  livePreview: string | null;
  comparisonImage: string | null;
  isComparing: boolean;
  compareSplit: number;

  currentStep: number;
  maxSteps: number;
  progressPercent: number;
  /** Recent live-preview frames for this job, oldest first, so the monitor can scrub back
   *  through the diffusion process instead of only ever showing the latest frame. */
  previewHistory: string[];
  /** When the currently-running job started, for a live elapsed-time readout. */
  generationStartedAt: number | null;
  metrics: {
    stage: string;
    modelLoadTime: number | null;
    speed: number | null;
    eta: number | null;
    totalTime: number;
  };

  isGenerating: boolean;
  queue: QueueItem[];
  activeJob: QueueItem | null;
  lastFailedJob: QueueItem | null;

  controlNetUnits: ControlNetUnit[];
  aDetailerUnits: ADetailerUnit[];
  settings: AppSettings;
  sessionStartTime: number;

  setServerUrl: (url: string) => void;
  setSessionId: (id: string | null) => void;
  setPrompt: (p: string) => void;
  setNegativePrompt: (np: string) => void;
  setActiveMacroCategory: (c: string) => void;
  setActiveSubCategory: (c: string) => void;
  setPillSearchQuery: (q: string) => void;
  setGalleryCurrentPage: (page: number) => void;
  setGenerationViewerItem: (item: HistoryItem | null) => void;

  toggleFavorite: (id: string) => void;
  currentQueueBatchId: string | null;
  /** Set once when a leftover queue is loaded back in after a crash/refresh; null otherwise.
   *  Consumed (set back to null) once the user resumes or discards it, or once auto-resumed. */
  recoveredQueueSize: number | null;
  dismissRecoveredQueue: () => void;
  activeContextMenu: { x: number; y: number; title: string; items: any[] } | null;
  setActiveContextMenu: (menu: { x: number; y: number; title: string; items: any[] } | null) => void;

  setModel: (m: string) => void;
  setParams: (params: Partial<AppState>) => void;
  loadAssets: (forceRefresh?: boolean) => Promise<void>;
  syncServerGallery: (refresh?: boolean) => Promise<void>;
  loadMoreServerGalleryPages: (startPage: number, pageCount?: number) => Promise<void>;
  loadServerGalleryPage: (page: number) => Promise<void>;
  loadProjectGallery: () => Promise<void>;
  saveImagesToProject: (items: HistoryItem[]) => Promise<HistoryItem[]>;
  syncCivitaiMetadata: (
    category: string,
    onProgress: (current: number, total: number, name: string) => void
  ) => Promise<void>;

  setIsComparing: (b: boolean) => void;
  setComparisonImage: (url: string | null) => void;
  setCompareSplit: (n: number) => void;

  queueCurrentGeneration: () => void;
  queueVariantGenerations: (variants: Array<Partial<Pick<QueueItem, 'prompt' | 'negativePrompt' | 'model' | 'vae' | 'textEncoder' | 'textEncoder2' | 'width' | 'height' | 'steps' | 'cfgScale' | 'seed' | 'sampler' | 'scheduler'>>>) => void;
  startQueueProcessing: () => Promise<void>;
  enqueueAndProcess: () => Promise<void>;
  cancelGeneration: () => void;
  cancelQueuedJob: (id: string) => void;
  clearQueue: () => void;
  retryFailedJob: (newSeed?: boolean) => void;
  clearFailedJob: () => void;

  useGenerationParams: (item: HistoryItem) => void;

  /** Generation Graph: id/relation of the HistoryItem the *next* queued generation branches
   *  from. Set by branchFromHistory, consumed and cleared by queueCurrentGeneration. */
  pendingParentId: string | null;
  pendingParentRelation: 'variation' | 'branch' | null;
  setPendingParent: (parent: { id: string; relation: 'variation' | 'branch' } | null) => void;
  /** Re-runs a past generation's exact recipe with a fresh random seed, queued immediately
   *  as a tracked variation (child) of that generation. */
  rerollFromHistory: (item: HistoryItem) => void;
  /** Loads a past generation's recipe into the editable prompt/params (like useGenerationParams)
   *  and marks it as the parent for whatever gets generated next, so the user can freely edit
   *  before generating while still recording the branch. */
  branchFromHistory: (item: HistoryItem) => void;
  /** Walks the parentId chain from `id` back to its root ancestor, returning oldest-first. */
  getLineageAncestors: (id: string) => HistoryItem[];
  /** Direct children of a HistoryItem (generations branched from it), newest first. */
  getLineageChildren: (id: string) => HistoryItem[];

  toggleModelFavorite: (type: CivitaiAssetType, name: string) => void;
  toggleModelPinned: (type: CivitaiAssetType, name: string) => void;
  setModelAlias: (type: CivitaiAssetType, name: string, alias: string) => void;
  setCivitaiUrl: (type: CivitaiAssetType, name: string, url: string) => Promise<void>;
  clearCivitaiUrl: (type: CivitaiAssetType, name: string) => void;
  refreshCivitaiItem: (type: CivitaiAssetType, name: string) => Promise<void>;
  markModelUsed: (type: CivitaiAssetType, name: string) => void;
  updateControlNet: (id: string, updates: Partial<ControlNetUnit>) => void;
  updateADetailer: (id: string, updates: Partial<ADetailerUnit>) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  setSectionScale: (section: keyof AppSettings['sectionScales'], scale: number) => void;
  setCategorizationMode: (mode: AppSettings['categorizationMode']) => void;
  deleteHistoryItem: (id: string) => void;
  removeFromSessionHistory: (id: string) => void;
  promptPresets: PromptPreset[];
  savePromptPreset: (name: string, text: string, target: 'positive' | 'negative') => void;
  deletePromptPreset: (id: string) => void;
}

const createAppStore: StateCreator<AppState> = (set, get) => ({
      serverUrl: 'http://localhost:7801',
      sessionId: null,
      isConnected: false,
      // Deliberately not persisted: the default Gallery source is the current app session.
      // A reload/new app launch starts a fresh gallery session.
      sessionStartTime: Date.now(),
      hideProgressBar: false,

      history: [],
      galleryHistory: [],
      projectHistory: [],
      outputGalleryTotalCount: 0,
      outputGalleryLoadedPages: 0,
      outputGalleryLoadedPageNumbers: [],
      outputGalleryPages: {},
      galleryCurrentPage: 1,
      generationViewerItem: null,
      emptyBatches: [],

      prompt: 'masterpiece, best quality, 1girl, solo',
      negativePrompt: 'worst quality, low quality, bad anatomy, blurry',
      activeMacroCategory: 'Person',
      activeSubCategory: 'All',
      pillSearchQuery: '',

      isQueuePaused: false,
      setIsQueuePaused: (isQueuePaused) => set({ isQueuePaused }),

      reorderQueue: (startIndex: number, endIndex: number) =>
        set((s) => {
          const list = [...s.queue];
          if (
            startIndex < 0 ||
            endIndex < 0 ||
            startIndex >= list.length ||
            endIndex >= list.length ||
            startIndex === endIndex
          ) {
            return {};
          }
          const [moved] = list.splice(startIndex, 1);
          if (!moved) return {};
          list.splice(endIndex, 0, moved);
          return { queue: list };
        }),

      startNewBatch: () => {
        set({ currentQueueBatchId: `batch-${Date.now()}` });
      },

      createNewEmptyBatch: () =>
        set((s) => ({
          emptyBatches: [...(s.emptyBatches || []), `batch-empty-${Date.now()}`],
        })),

      moveJobToBatch: (jobId: string, targetBatchId: string) =>
        set((s) => ({
          queue: s.queue.map((q) => (q.id === jobId ? { ...q, batchId: targetBatchId } : q)),
          emptyBatches: (s.emptyBatches || []).filter((b: string) => b !== targetBatchId),
        })),

      duplicateQueuedItem: (id: string) =>
        set((s) => {
          const item = s.queue.find((q) => q.id === id);
          if (!item) return {};
          const copy: QueueItem = {
            ...item,
            id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            seed: item.seed === -1 ? -1 : item.seed + 1,
            createdAt: Date.now(),
          };
          const idx = s.queue.findIndex((q) => q.id === id);
          const updated = [...s.queue];
          updated.splice(idx + 1, 0, copy);
          return { queue: updated };
        }),

      addVariationToBatch: (batchId: string) => {
        const state = get();
        const targetModel = state.model || (state.modelsList[0]?.name ?? '');
        const cleanPositive = stripDisabledPromptTags(state.prompt);
        const cleanNegative = stripDisabledPromptTags(state.negativePrompt);
        const currentADetailer = state.aDetailerUnits.map((u) => ({ ...u }));

        const newJob: QueueItem = {
          id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          batchId,
          prompt: cleanPositive,
          negativePrompt: cleanNegative,
          model: targetModel,
          vae: state.vae,
          textEncoder: state.textEncoder,
          textEncoder2: state.textEncoder2,
          width: state.width,
          height: state.height,
          steps: state.steps,
          cfgScale: state.cfgScale,
          seed: Math.floor(Math.random() * 2147483647),
          sampler: state.sampler,
          scheduler: state.scheduler,
          status: 'queued',
          progress: 0,
          step: 0,
          maxSteps: state.steps,
          createdAt: Date.now(),
          aDetailerUnits: currentADetailer,
        };

        set((s) => ({
          queue: [...s.queue, newJob],
          emptyBatches: (s.emptyBatches || []).filter((b: string) => b !== batchId),
        }));
      },

      removeBatchFromQueue: (batchId: string) =>
        set((s) => ({
          queue: s.queue.filter((q) => q.batchId !== batchId),
          emptyBatches: (s.emptyBatches || []).filter((b: string) => b !== batchId),
        })),

      model: '',
      modelsList: [],
      lorasList: [],
      embeddingsList: [],
      wildcardsList: [],
      vae: 'Automatic',
      vaesList: ['Automatic', 'None'],
      textEncoder: 'Automatic',
      textEncoder2: 'Automatic',
      selectedTextEncoders: [],
      textEncodersList: ['Automatic', 'None', 'qwen_3_06b_base.safetensors', 'qwen35_4b.safetensors'],
      yoloModelsList: ['face_yolov8n.pt', 'hand_yolov8n.pt', 'face_yolov8m.pt', 'face_yolov9c.pt', 'person_yolov8m-seg.pt'],

      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 6.5,
      seed: -1,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      batchCount: 1,

      activeImage: null,
      livePreview: null,
      comparisonImage: null,
      isComparing: false,
      compareSplit: 50,

      currentStep: 0,
      maxSteps: 28,
      progressPercent: 0,
      previewHistory: [],
      generationStartedAt: null,
      metrics: {
        stage: 'Idle',
        modelLoadTime: null,
        speed: null,
        eta: null,
        totalTime: 0,
      },

      isGenerating: false,
      queue: [],
      activeJob: null,
      lastFailedJob: null,

      controlNetUnits: [
        { id: '1', enabled: false, preprocessor: 'canny', controlMode: 'balanced', weight: 1.0 },
        { id: '2', enabled: false, preprocessor: 'depth', controlMode: 'balanced', weight: 1.0 },
        { id: '3', enabled: false, preprocessor: 'openpose', controlMode: 'balanced', weight: 1.0 },
      ],
      aDetailerUnits: [
        {
          id: '1',
          enabled: false,
          model: 'person_yolov8m-seg.pt',
          confidence: 0.5,
          denoiseStrength: 0.3,
          steps: 16,
          maskGrow: 4,
          maskBlur: 4,
          maskOversize: 10,
          sortOrder: 'largest-smallest',
          saveMask: false,
          prompt: '',
          negativePrompt: '',
        },
        {
          id: '2',
          enabled: false,
          model: 'face_yolov8n.pt',
          confidence: 0.7,
          denoiseStrength: 0.3,
          steps: 16,
          maskGrow: 4,
          maskBlur: 4,
          maskOversize: 10,
          sortOrder: 'largest-smallest',
          saveMask: false,
          prompt: 'masterpiece, best quality, score_7, detailed face,',
          negativePrompt: '',
        },
      ],
      settings: {
        activePreset: 'Default',
        bottomPanelHeight: 340,
        sectionScales: {
          pills: 100,
          params: 100,
          extranetworks: 100,
          history: 100,
          controlnet: 100,
          adetailer: 100,
          imagesearch: 100,
        },
        categorizationMode: 'prompt_flow',
        tagSortOrder: 'alphabetical',
        autoInjectLoraTrigger: true,
        autoInjectModelKeywords: true,
        showTagPlusPrefix: true,
        showTagPostCounts: true,
        useUnderscores: false,
        tagClickWeightStep: 0.2,
        preservePromptsOnReload: true,
        randomizeSeedOnGen: true,
        autoSaveLayout: true,
        maxHistoryCount: 5000,
        defaultLoraWeight: 1.0,
        separateBatches: true,
        autoSwapToLatest: true,
        hideProgressBar: false,
        playCompletionSound: true,
        completionSoundData: null,
        saveBeforeAfterADetailer: false,
        autoCivitaiScan: true,
        galleryPageSize: 24,
        gallerySource: 'session',
        galleryGroupByQueue: false,
        saveGeneratedImagesToProject: false,
        localProjectPath: '',
        projectJpegQuality: 92,
        projectJpegMaxDimension: 2048,
        projectJpegBackground: 'black',
        projectJpegFilenamePrefix: 'SwarmCanvas',
        projectImageFormat: 'jpg',
        outputFolderPath: '',
        autoResumeQueueOnLaunch: false,
        panelViewModes: {
          extraNetworks: 'cards',
          history: 'cards',
          gallery: 'cards',
        },
        uiTheme: 'obsidian',
        fontScale: 100,
        autoApplyModelPreset: false,
        hideInlineLorasInPromptBoxes: true,
        showPromptSectionHeaders: true,
        showPromptSectionStats: true,
        showPromptSelectionToolbar: true,
        promptSyntaxQuickInsert: true,
        doubleClickEditPromptPills: true,
        imageOpenTarget: 'viewport',
      },

      toggleFavorite: (id: string) => {
        const nextProject = get().projectHistory.map((item) =>
          item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
        );
        set((s) => ({
          history: s.history.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
          galleryHistory: s.galleryHistory.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
          projectHistory: nextProject,
        }));
        const changedProjectItem = nextProject.find((item) => item.id === id);
        if (changedProjectItem) {
          void updateProjectEntryMetadata(changedProjectItem).catch((error) => {
            console.warn('[ProjectStorage] Could not persist favorite change:', error);
          });
        }
      },

      activeContextMenu: null,
      setActiveContextMenu: (activeContextMenu) => set({ activeContextMenu }),

      setServerUrl: (url) => { swarmClient.setBaseUrl(url); set({ serverUrl: url }); },
      setSessionId: (id) => set({ sessionId: id }),
      setPrompt: (prompt) => set({ prompt }),
      setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
      setActiveMacroCategory: (activeMacroCategory) => set({ activeMacroCategory }),
      setActiveSubCategory: (activeSubCategory) => set({ activeSubCategory }),
      setPillSearchQuery: (pillSearchQuery) => set({ pillSearchQuery }),
      setGalleryCurrentPage: (galleryCurrentPage) => set({ galleryCurrentPage }),

      setModel: (model) => {
        const linkedPresetId = (() => {
          if (typeof localStorage === 'undefined') return null;
          if (!get().settings.autoApplyModelPreset) return null;
          try {
            const links = JSON.parse(localStorage.getItem('swarm_model_preset_links_v1') || '{}');
            return typeof links?.[model] === 'string' ? links[model] : null;
          } catch { return null; }
        })();
        set((s) => {
          const linked = linkedPresetId ? (s.promptPresets || []).find((p) => p.id === linkedPresetId) : null;
          return {
            model,
            prompt: linked?.target === 'positive' ? linked.text : s.prompt,
            negativePrompt: linked?.target === 'negative' ? linked.text : s.negativePrompt,
          };
        });
      },
      setParams: (params) => set((s) => ({ ...s, ...params })),

      deleteHistoryItem: (id) => {
        const projectItem = get().projectHistory.find((h) => h.id === id);
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
          galleryHistory: s.galleryHistory.filter((h) => h.id !== id),
          projectHistory: s.projectHistory.filter((h) => h.id !== id),
          activeImage: s.activeImage === s.history.find((h) => h.id === id)?.imageUrl ? null : s.activeImage,
        }));
        if (projectItem) {
          void removeProjectEntries([projectItem]).then((next) => set({ projectHistory: next })).catch((error) => {
            console.warn('[ProjectStorage] Could not remove project image:', error);
          });
        }
      },

      removeFromSessionHistory: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
        })),
        promptPresets: [],
      savePromptPreset: (name, text, target) => {
        const tokens = text.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
        const newPreset: PromptPreset = {
          id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim() || `Preset ${new Date().toLocaleDateString()}`,
          text: text.trim(),
          target,
          createdAt: Date.now(),
          tagsCount: tokens.length,
        };
        set((s) => ({ promptPresets: [newPreset, ...(s.promptPresets || [])] }));
      },
      deletePromptPreset: (id) =>
        set((s) => ({ promptPresets: (s.promptPresets || []).filter((p) => p.id !== id) })),

      loadAssets: async (forceRefresh = false) => {
        try {
          if (forceRefresh && get().isGenerating) return;
          swarmClient.setBaseUrl(get().serverUrl || 'http://localhost:7801');
          // Do not force a SwarmUI/Comfy backend refresh during normal app startup,
          // focus recovery, or catalog rehydration. TriggerRefresh can restart or
          // rescan a broken Comfy backend and is only appropriate for an explicit
          // user-requested asset refresh.
          if (forceRefresh) await swarmClient.triggerRefresh().catch(() => {});

          const [models, loras, embeddings, wildcards, vaes, textEncoders, yoloModels] = await Promise.all([
            swarmClient.listModels('Stable-Diffusion').catch(() => []),
            swarmClient.listModels('LoRA').catch(() => []),
            swarmClient.listModels('Embedding').catch(() => []),
            swarmClient.listWildcards().catch(() => []),
            swarmClient.listVAEs().catch(() => []),
            swarmClient.listTextEncoders().catch(() => []),
            swarmClient.listYoloModels().catch(() => []),
          ]);

          const formatItems = (list: any[]): ModelItem[] =>
            (list || []).map((m: any) => ({
              name: m.name,
              previewUrl: m.previewUrl,
              previewUrls: m.previewUrls,
              description: m.description,
              triggerWords: m.triggerWords,
              baseModel: m.baseModel,
              modelName: m.modelName,
              versionName: m.versionName,
              modelId: m.modelId,
              versionId: m.versionId,
              fileName: m.fileName,
              civitaiMatchedBy: m.civitaiMatchedBy,
              civitaiConfidence: m.civitaiConfidence,
              civitaiCompleteness: m.civitaiCompleteness,
              civitaiStatus: m.civitaiStatus,
              civitaiUrl: m.civitaiUrl,
              aliases: m.aliases || [],
              favorite: Boolean(m.favorite),
              pinned: Boolean(m.pinned),
              lastUsedAt: m.lastUsedAt,
              addedAt: m.addedAt,
              sha256: m.sha256, blake3: m.blake3, crc32: m.crc32,
              autoV1: m.autoV1, autoV2: m.autoV2, autoV3: m.autoV3, hash: m.hash, air: m.air,
            }));

          const merge = (fresh: ModelItem[], previous: ModelItem[], type: CivitaiAssetType): ModelItem[] => {
            const previousByName = new Map(previous.map((item) => [item.name.toLowerCase(), item]));
            return fresh.map((item) => {
              const old = previousByName.get(item.name.toLowerCase());
              const persisted = civitaiService.getPersistedMetadata(item.name, type);
              const manualUrl = civitaiService.getCivitaiUrl(item.name, type);
              return {
                ...old, ...item,
                previewUrl: persisted?.previewUrl || item.previewUrl || old?.previewUrl,
                previewUrls: persisted?.previewUrls?.length ? persisted.previewUrls : item.previewUrls || old?.previewUrls,
                triggerWords: persisted?.triggerWords?.length ? persisted.triggerWords : item.triggerWords || old?.triggerWords,
                description: persisted?.description || item.description || old?.description,
                baseModel: persisted?.baseModel || item.baseModel || old?.baseModel,
                modelName: persisted?.modelName || item.modelName || old?.modelName,
                versionName: persisted?.versionName || item.versionName || old?.versionName,
                modelId: persisted?.modelId || item.modelId || old?.modelId,
                versionId: persisted?.versionId || item.versionId || old?.versionId,
                fileName: persisted?.fileName || item.fileName || old?.fileName,
                civitaiMatchedBy: persisted?.matchedBy || item.civitaiMatchedBy || old?.civitaiMatchedBy,
                civitaiConfidence: persisted?.confidence ?? item.civitaiConfidence ?? old?.civitaiConfidence,
                civitaiCompleteness: persisted?.completeness ?? item.civitaiCompleteness ?? old?.civitaiCompleteness,
                civitaiStatus: persisted ? ((persisted.completeness || 0) >= 100 ? 'matched' : 'partial') : item.civitaiStatus || old?.civitaiStatus,
                civitaiUrl: manualUrl || persisted?.civitaiUrl || item.civitaiUrl || old?.civitaiUrl,
                aliases: old?.aliases || item.aliases || [],
                favorite: old?.favorite ?? item.favorite ?? false,
                pinned: old?.pinned ?? item.pinned ?? false,
                lastUsedAt: old?.lastUsedAt ?? item.lastUsedAt,
                addedAt: old?.addedAt ?? item.addedAt ?? Date.now(),
              };
            });
          };

          const formattedModels = formatItems(models);
          const formattedLoras = formatItems(loras);
          const formattedEmbeddings = formatItems(embeddings);

          set((s) => {
            const nextVaes = vaes && vaes.length > 0 ? vaes : s.vaesList;
            const nextTextEncoders = Array.from(new Set([
              'Automatic',
              'None',
              'qwen_3_06b_base.safetensors',
              'qwen35_4b.safetensors',
              ...(textEncoders || []),
              ...(s.textEncodersList || []),
            ]));
            const nextPrimaryTextEncoder = nextTextEncoders.includes(s.textEncoder) ? s.textEncoder : 'Automatic';
            const nextSecondaryTextEncoder = nextTextEncoders.includes(s.textEncoder2) ? s.textEncoder2 : 'Automatic';
            const validSelectedTextEncoders = s.selectedTextEncoders.filter((value) => nextTextEncoders.includes(value));
            return {
              modelsList: formattedModels.length > 0 ? merge(formattedModels, s.modelsList, 'model') : s.modelsList,
              lorasList: formattedLoras.length > 0 ? merge(formattedLoras, s.lorasList, 'lora') : s.lorasList,
              embeddingsList: formattedEmbeddings.length > 0 ? merge(formattedEmbeddings, s.embeddingsList, 'embedding') : s.embeddingsList,
              wildcardsList: wildcards && wildcards.length > 0 ? wildcards.map((w: any) => (typeof w === 'string' ? w : w.name || String(w))) : s.wildcardsList,
              vaesList: nextVaes,
              textEncodersList: nextTextEncoders,
              selectedTextEncoders: validSelectedTextEncoders,
              textEncoder: nextPrimaryTextEncoder,
              textEncoder2: nextSecondaryTextEncoder,
              yoloModelsList: yoloModels && yoloModels.length > 0 ? yoloModels : s.yoloModelsList,
              model: s.model || (formattedModels.length > 0 ? formattedModels[0].name : s.model),
              vae: nextVaes.includes(s.vae) ? s.vae : 'Automatic',
            };
          });
          set({ isConnected: await swarmClient.testConnection() });
        } catch (err) {
          console.error('[Store] Failed to load asset catalogs:', err);
          set({ isConnected: false });
        }
      },

      syncServerGallery: async (refresh = true) => {
        try {
          const configuredPath = get().settings.outputFolderPath || undefined;
          // Count/index first; the native side stores only file-path metadata in memory.
          // No image metadata or image bytes are sent to the WebView at this stage.
          const count = await swarmClient.getLocalOutputImageCount(configuredPath, refresh);
          const pageSize = Math.max(12, get().settings.galleryPageSize || 24);
          set((s) => ({
            galleryHistory: [],
            outputGalleryTotalCount: count.total,
            outputGalleryLoadedPages: 0,
            outputGalleryLoadedPageNumbers: [],
            outputGalleryPages: {},
            galleryCurrentPage: 1,
            settings: { ...s.settings, outputFolderPath: count.root },
          }));

          if (count.total > 0) {
            await get().loadMoreServerGalleryPages(1, 5);
          }

          emitDiagnostic({
            level: 'info',
            scope: 'image',
            message: `All Outputs index ready: ${count.total.toLocaleString()} image(s) in ${count.root}. Initializing first 5 pages (${pageSize} images/page).`,
            details: { total: count.total, root: count.root, initialPages: 5, pageSize },
          });
        } catch (err) {
          console.error('[Store] Failed to scan output folder:', err);
          emitToast(`Output scan failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
      },

      loadMoreServerGalleryPages: async (startPage, pageCount = 5) => {
        try {
          const configuredPath = get().settings.outputFolderPath || undefined;
          const pageSize = Math.max(12, get().settings.galleryPageSize || 24);
          const safeStartPage = Math.max(1, Math.floor(startPage));
          const safePageCount = Math.min(5, Math.max(1, Math.floor(pageCount)));
          const totalPages = Math.max(1, Math.ceil((get().outputGalleryTotalCount || 0) / pageSize));
          const boundedStart = Math.min(safeStartPage, totalPages);

          // Do not rescan pages we already have. This is especially important when the user
          // jumps from page 14 back to page 1 or directly to the final page of a large library.
          const wantedPages = Array.from({ length: safePageCount }, (_, i) => boundedStart + i)
            .filter((page) => page <= totalPages);
          const missingPages = wantedPages.filter((page) => !get().outputGalleryPages[page]);
          if (!missingPages.length) return;

          // Fetch contiguous missing runs in chunks of five. The native scanner supports an
          // arbitrary starting page, so a direct jump does not require loading pages 1..N.
          let runStart = missingPages[0];
          let runEnd = runStart;
          const runs: Array<{ start: number; count: number }> = [];
          for (let i = 1; i < missingPages.length; i += 1) {
            const page = missingPages[i];
            if (page === runEnd + 1 && page - runStart < 5) {
              runEnd = page;
            } else {
              runs.push({ start: runStart, count: runEnd - runStart + 1 });
              runStart = page;
              runEnd = page;
            }
          }
          runs.push({ start: runStart, count: runEnd - runStart + 1 });

          for (const run of runs) {
            const scan = await swarmClient.listLocalOutputImagePages(
              configuredPath,
              run.start,
              run.count,
              pageSize,
            );
            const now = Date.now();
            const existing = get().galleryHistory || [];
            const byPath = new Map(existing.map((item) => [item.serverPath || item.imageUrl, item]));
            const pageBuckets = new Map<number, HistoryItem[]>();

            scan.images.forEach((img, index) => {
              const pageNumber = scan.startPage + Math.floor(index / scan.pageSize);
              const old = byPath.get(img.relativePath);
              const parsedImage: ServerImageItem = {
                url: img.relativePath,
                name: img.relativePath,
                metadata: img.metadata,
              };
              const parsed = parseServerImageMetadata(parsedImage, img.modifiedAt || now - index);
              const filenamePrompt = img.name.replace(/\.[^/.]+$/, '') || 'Output image';

              const item: HistoryItem = {
                ...old,
                id: old?.id || stableServerImageId(img.relativePath),
                batchId: parsed.batchId || old?.batchId || `batch-output-${stableServerImageId(img.relativePath)}`,
                imageUrl: (() => {
                  try { return convertFileSrc(img.path); } catch { return img.relativePath; }
                })(),
                prompt: parsed.prompt || old?.prompt || filenamePrompt,
                negativePrompt: parsed.negativePrompt ?? old?.negativePrompt ?? '',
                isFavorite: parsed.isFavorite ?? old?.isFavorite ?? /(?:^|\/)Starred(?:\/|$)/i.test(img.relativePath),
                createdAt: old?.createdAt || new Date(img.modifiedAt || now - index).toLocaleTimeString(),
                timestamp: img.modifiedAt || old?.timestamp || parsed.timestamp,
                rawMetadata: img.metadata || old?.rawMetadata,
                serverOrigin: true,
                serverPath: img.relativePath,
                params: {
                  model: parsed.params.model !== 'Unknown' ? parsed.params.model : (old?.params.model || 'Unknown'),
                  steps: parsed.params.steps || old?.params.steps || 28,
                  cfgScale: parsed.params.cfgScale ?? old?.params.cfgScale ?? 6.5,
                  seed: parsed.params.seed ?? old?.params.seed ?? -1,
                  width: parsed.params.width ?? old?.params.width ?? 832,
                  height: parsed.params.height ?? old?.params.height ?? 1216,
                  sampler: parsed.params.sampler || old?.params.sampler || 'euler_ancestral',
                  scheduler: parsed.params.scheduler || old?.params.scheduler || 'normal',
                },
              };

              byPath.set(img.relativePath, item);
              const bucket = pageBuckets.get(pageNumber) || [];
              bucket.push(item);
              pageBuckets.set(pageNumber, bucket);
            });

            const merged = [...byPath.values()]
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, Math.max(5000, get().settings.maxHistoryCount || 5000));

            set((s) => {
              const nextPages = { ...s.outputGalleryPages };
              for (const [pageNumber, items] of pageBuckets.entries()) nextPages[pageNumber] = items;
              const nextLoadedNumbers = Array.from(new Set([
                ...(s.outputGalleryLoadedPageNumbers || []),
                ...pageBuckets.keys(),
              ])).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
              const nextLoadedMax = nextLoadedNumbers.length ? Math.max(...nextLoadedNumbers) : 0;
              return {
                galleryHistory: merged,
                outputGalleryPages: nextPages,
                outputGalleryLoadedPageNumbers: nextLoadedNumbers,
                outputGalleryLoadedPages: nextLoadedMax,
                outputGalleryTotalCount: scan.total,
                settings: { ...s.settings, outputFolderPath: scan.root },
              };
            });
          }
        } catch (err) {
          console.error('[Store] Failed to load output gallery pages:', err);
          emitToast(`Output page load failed: ${formatStoreError(err)}`, 'error');
        }
      },

      loadServerGalleryPage: async (page) => {
        const target = Math.max(1, Math.floor(page));
        if (get().outputGalleryPages[target]) return;
        await get().loadMoreServerGalleryPages(target, 1);
      },

      loadProjectGallery: async () => {
        try {
          const entries = await loadProjectEntries(get().settings.localProjectPath);
          set({ projectHistory: entries });
        } catch (error) {
          console.error('[Store] Failed to load local project:', error);
          emitToast(`Project load failed: ${formatStoreError(error)}`, 'error');
        }
      },

      saveImagesToProject: async (items) => {
        if (!items.length) return [];
        try {
          const merged = await addHistoryItemsToProject(items, get().settings);
          set({ projectHistory: merged });
          const savedById = new Map(merged.map((item) => [item.id, item]));
          const saved = items.map((item) => savedById.get(item.id)).filter((item): item is HistoryItem => Boolean(item?.localProjectFile));
          const format = get().settings.projectImageFormat || 'jpg';
          emitToast(`Saved ${saved.length} image${saved.length === 1 ? '' : 's'} (${format.toUpperCase()}) to Local Project.`, 'success');
          return saved;
        } catch (error) {
          console.error('[Store] Failed to save images to local project:', formatStoreError(error), error);
          emitToast(`Local Project save failed: ${formatStoreError(error)}`, 'error');
          throw error;
        }
      },

      syncCivitaiMetadata: async (category, onProgress) => {
        const state = get();
        const targets: { listName: 'modelsList' | 'lorasList' | 'embeddingsList'; type: CivitaiAssetType; items: ModelItem[] }[] = [];
        if (category === 'all' || category === 'models') targets.push({ listName: 'modelsList', type: 'model', items: state.modelsList });
        if (category === 'all' || category === 'loras') targets.push({ listName: 'lorasList', type: 'lora', items: state.lorasList });
        if (category === 'all' || category === 'embeddings') targets.push({ listName: 'embeddingsList', type: 'embedding', items: state.embeddingsList });
        const total = targets.reduce((n, t) => n + t.items.length, 0);
        if (!total) return;
        let processed = 0;

        try {
          await civitaiService.prefetchBySha256(targets.flatMap((t) => t.items.map((item) => ({ filename: item.name, type: t.type, hints: { sha256: item.sha256 } }))));
        } catch (err) {
          console.warn('[Civitai] Bulk hash prefetch failed:', err);
        }

        for (const target of targets) {
          for (const item of target.items) {
            processed += 1;
            onProgress?.(processed, total, item.name);
            const hasUsableMetadata = Boolean(item.modelId || item.versionId || item.baseModel || item.previewUrl || item.triggerWords?.length);
            const manual = civitaiService.getCivitaiUrl(item.name, target.type);
            if (hasUsableMetadata && !manual && item.civitaiCompleteness && item.civitaiCompleteness >= 100) continue;

            set((s) => ({ [target.listName]: s[target.listName].map((x) => x.name === item.name ? { ...x, civitaiStatus: 'idle' } : x) } as any));
            const result = await civitaiService.fetchMetadata(item.name, target.type, { sha256: item.sha256, blake3: item.blake3, crc32: item.crc32, autoV1: item.autoV1, autoV2: item.autoV2, autoV3: item.autoV3, hash: item.hash, modelId: item.modelId, versionId: item.versionId });
            if (result) {
              const completeness = result.completeness ?? 0;
              set((s) => ({ [target.listName]: s[target.listName].map((x) => x.name === item.name ? { ...x, previewUrl: result.previewUrl || x.previewUrl, previewUrls: result.previewUrls?.length ? result.previewUrls : x.previewUrls, triggerWords: result.triggerWords || x.triggerWords, description: result.description || x.description, baseModel: result.baseModel || x.baseModel, modelName: result.modelName || x.modelName, versionName: result.versionName || x.versionName, modelId: result.modelId || x.modelId, versionId: result.versionId || x.versionId, fileName: result.fileName || x.fileName, civitaiMatchedBy: result.matchedBy, civitaiConfidence: result.confidence, civitaiCompleteness: completeness, civitaiStatus: completeness >= 100 ? 'matched' : 'partial', civitaiUrl: manual || result.civitaiUrl || x.civitaiUrl } : x) } as any));
            } else {
              const failure = civitaiService.getUnresolvedEntries().find((f: any) => f.filename === item.name && f.type === target.type);
              set((s) => ({ [target.listName]: s[target.listName].map((x) => x.name === item.name ? { ...x, civitaiStatus: failure?.reason ? 'unresolved' : 'not_found' } : x) } as any));
            }
            // Yield between requests so the rest of the UI remains responsive.
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
      },

      setGenerationViewerItem: (generationViewerItem) => set({ generationViewerItem }),

      setIsComparing: (isComparing) => set({ isComparing }),
      setComparisonImage: (comparisonImage) => set({ comparisonImage }),
      setCompareSplit: (compareSplit) => set({ compareSplit }),

      currentQueueBatchId: null,
      pendingParentId: null,
      pendingParentRelation: null,
      recoveredQueueSize: null,
      dismissRecoveredQueue: () => set({ recoveredQueueSize: null }),

      queueCurrentGeneration: () => {
        const state = get();
        let targetModel = state.model;
        if (!targetModel && state.modelsList.length > 0) {
          targetModel = state.modelsList[0].name;
          set({ model: targetModel });
        }

        const effectiveSeed = state.seed === -1 ? Math.floor(Math.random() * 2147483647) : state.seed;
        const cleanPositive = stripDisabledPromptTags(state.prompt);
        const cleanNegative = stripDisabledPromptTags(state.negativePrompt);
        const currentADetailer = state.aDetailerUnits.map((u) => ({ ...u }));
        const selectedTextEncoder = state.textEncoder;

        const count = Math.max(1, state.batchCount || 1);
        const activeBatchId = get().currentQueueBatchId || `batch-${Date.now()}`;
        const newJobs: QueueItem[] = [];
        const branchParentId = state.pendingParentId || undefined;
        const branchRelation = state.pendingParentRelation || undefined;

        for (let i = 0; i < count; i++) {
          newJobs.push({
            id: `job-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            batchId: activeBatchId,
            prompt: cleanPositive,
            negativePrompt: cleanNegative,
            model: targetModel,
            vae: state.vae,
            textEncoder: selectedTextEncoder,
            textEncoder2: state.textEncoder2,
            width: state.width,
            height: state.height,
            steps: state.steps,
            cfgScale: state.cfgScale,
            seed: state.seed === -1 ? Math.floor(Math.random() * 2147483647) : effectiveSeed + i,
            sampler: state.sampler,
            scheduler: state.scheduler,
            status: 'queued',
            progress: 0,
            step: 0,
            maxSteps: state.steps,
            createdAt: Date.now() + i,
            aDetailerUnits: currentADetailer,
            parentId: branchParentId,
            relation: branchRelation,
          });
        }

        set((s) => ({
          queue: [...s.queue, ...newJobs],
          currentQueueBatchId: activeBatchId,
          emptyBatches: (s.emptyBatches || []).filter((b: string) => b !== activeBatchId),
          pendingParentId: null,
          pendingParentRelation: null,
        }));
      },

      queueVariantGenerations: (variants) => {
        const state = get();
        const targetModel = state.model || state.modelsList[0]?.name || '';
        const activeBatchId = state.currentQueueBatchId || `batch-${Date.now()}`;
        const baseSeed = state.seed === -1 ? null : state.seed;
        const currentADetailer = state.aDetailerUnits.map((u) => ({ ...u }));
        const jobs: QueueItem[] = variants.map((variant, index) => ({
          id: `job-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          batchId: activeBatchId,
          prompt: stripDisabledPromptTags(variant.prompt ?? state.prompt),
          negativePrompt: stripDisabledPromptTags(variant.negativePrompt ?? state.negativePrompt),
          model: variant.model ?? targetModel,
          vae: variant.vae ?? state.vae,
          textEncoder: variant.textEncoder ?? state.textEncoder,
          textEncoder2: variant.textEncoder2 ?? state.textEncoder2,
          width: variant.width ?? state.width,
          height: variant.height ?? state.height,
          steps: variant.steps ?? state.steps,
          cfgScale: variant.cfgScale ?? state.cfgScale,
          seed: variant.seed ?? (baseSeed === null ? Math.floor(Math.random() * 2147483647) : baseSeed + index),
          sampler: variant.sampler ?? state.sampler,
          scheduler: variant.scheduler ?? state.scheduler,
          status: 'queued',
          progress: 0,
          step: 0,
          maxSteps: variant.steps ?? state.steps,
          createdAt: Date.now() + index,
          aDetailerUnits: currentADetailer,
        }));
        if (!jobs.length) return;
        set((s) => ({
          queue: [...s.queue, ...jobs],
          currentQueueBatchId: activeBatchId,
          emptyBatches: (s.emptyBatches || []).filter((b) => b !== activeBatchId),
        }));
      },

      startQueueProcessing: async () => {
        if (get().isGenerating || !get().queue.some((job) => job.status === 'queued')) return;

        const runToken = ++generationRunToken;
        const interruptToAwait = pendingInterruptPromise;
        set({ isGenerating: true });

        // A cancel request is asynchronous on the backend. Wait for that request
        // before opening a new generation session so a rapid cancel -> +Queue
        // sequence cannot overlap the old and new jobs.
        if (interruptToAwait) {
          await interruptToAwait;
          if (generationRunToken !== runToken) return;
        }

        let completedCount = 0;
        let failedCount = 0;

        while (get().queue.some((job) => job.status === 'queued') && generationRunToken === runToken) {
          if (get().isQueuePaused) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          const currentQueue = get().queue;
          const nextIndex = currentQueue.findIndex((job) => job.status === 'queued');
          if (nextIndex < 0) break;
          const nextJob = currentQueue[nextIndex];
          const remainingQueue = currentQueue.filter((_, index) => index !== nextIndex);

          set({
            queue: remainingQueue,
            activeJob: { ...nextJob, status: 'running' },
            livePreview: null,
            previewHistory: [],
            currentStep: 0,
            maxSteps: nextJob.steps,
            progressPercent: 0,
            generationStartedAt: Date.now(),
            metrics: { ...get().metrics, stage: 'Obtaining Session...', totalTime: 0 },
          });

          const startTime = Date.now();

          try {
            const freshSessionId = await swarmClient.getNewSession();
            if (generationRunToken !== runToken) break;
            set({
              sessionId: freshSessionId,
              metrics: { ...get().metrics, stage: 'Sampling' },
            });

            const activePass = (nextJob.aDetailerUnits || []).find((u) => u.enabled);
            const yoloModel = activePass?.model?.trim(); // Keeps 'face_yolov8n.pt'
            const effectiveTextEncoder = nextJob.textEncoder || get().textEncoder;

            // Combine positive and negative prompt with pass-specific overrides
            let effectivePrompt = nextJob.prompt;
            let effectiveNegativePrompt = nextJob.negativePrompt;

            if (activePass) {
              if (activePass.prompt?.trim()) {
                effectivePrompt = `${effectivePrompt}, ${activePass.prompt.trim()}`;
              }
              if (activePass.negativePrompt?.trim()) {
                effectiveNegativePrompt = effectiveNegativePrompt
                  ? `${effectiveNegativePrompt}, ${activePass.negativePrompt.trim()}`
                  : activePass.negativePrompt.trim();
              }
            }

            let progressFrame = 0;
            let pendingProgress: { p: SwarmProgressData; preview: string | null } | null = null;

            const res = await swarmClient.generateImage(
              {
                session_id: freshSessionId,
                prompt: effectivePrompt,
                negativeprompt: effectiveNegativePrompt,
                model: nextJob.model,
                vae: nextJob.vae !== 'Automatic' ? nextJob.vae : undefined,
                textencoder: effectiveTextEncoder !== 'Automatic' && effectiveTextEncoder !== 'None' ? effectiveTextEncoder : undefined,
                textencoder2: nextJob.textEncoder2 && nextJob.textEncoder2 !== 'Automatic' && nextJob.textEncoder2 !== 'None' ? nextJob.textEncoder2 : undefined,
                width: nextJob.width,
                height: nextJob.height,
                steps: nextJob.steps,
                cfgscale: nextJob.cfgScale,
                seed: nextJob.seed,
                sampler: nextJob.sampler,
                scheduler: nextJob.scheduler,

                ...(activePass && yoloModel ? {
                  yolomodelinternal: yoloModel,
                  segmentsteps: activePass.steps ?? Math.max(10, Math.round(nextJob.steps * 0.5)),
                  segmentthresholdmax: activePass.confidence,
                  segmentmaskgrow: activePass.maskGrow ?? 4,
                  segmentmaskblur: activePass.maskBlur ?? 4,
                  segmentmaskoversize: activePass.maskOversize ?? 10,
                  segmentsortorder: activePass.sortOrder ?? 'largest-smallest',
                  savesegmentmask: activePass.saveMask ?? false,
                } : {}),
              } as any,
              (p: SwarmProgressData) => {
                // A stopped generation may still have websocket frames in flight.
                // Keep only the newest progress packet and paint at most once per frame.
                if (generationRunToken !== runToken || get().sessionId !== freshSessionId) return;

                const raw =
                  p.preview ||
                  (p as any).preview_url ||
                  (p as any).previewUrl ||
                  (p as any).image ||
                  (p as any).live_preview ||
                  (p as any).img ||
                  (p as any).data?.preview ||
                  (p as any).data?.image;

                let incomingPreview: string | null = null;
                if (typeof raw === 'string') {
                  incomingPreview = raw.trim() || null;
                } else if (raw && typeof raw === 'object') {
                  const extracted = (raw as any).preview || (raw as any).url || (raw as any).src || (raw as any).data || (raw as any).image;
                  if (typeof extracted === 'string') incomingPreview = extracted.trim() || null;
                }

                pendingProgress = { p, preview: incomingPreview };
                if (progressFrame) return;

                const paint = () => {
                  progressFrame = 0;
                  if (generationRunToken !== runToken || get().sessionId !== freshSessionId) {
                    pendingProgress = null;
                    return;
                  }
                  const latest = pendingProgress;
                  pendingProgress = null;
                  if (!latest) return;
                  set((state) => ({
                    currentStep: typeof latest.p.step === 'number' ? latest.p.step : state.currentStep,
                    maxSteps: typeof latest.p.max_steps === 'number' && latest.p.max_steps > 0 ? latest.p.max_steps : state.maxSteps,
                    progressPercent: typeof latest.p.percent === 'number' ? Math.min(100, Math.round(latest.p.percent > 1 ? latest.p.percent : latest.p.percent * 100)) : state.progressPercent,
                    livePreview: latest.preview || state.livePreview,
                    previewHistory: latest.preview && latest.preview !== state.previewHistory[state.previewHistory.length - 1]
                      ? [...state.previewHistory, latest.preview].slice(-24)
                      : state.previewHistory,
                    metrics: {
                      stage: latest.p.stage || (latest.p.step ? 'Sampling' : state.metrics.stage),
                      modelLoadTime: state.metrics.modelLoadTime,
                      speed: typeof latest.p.speed === 'number' ? Number(latest.p.speed.toFixed(2)) : state.metrics.speed,
                      eta: typeof latest.p.eta === 'number' ? Math.max(0, Math.round(latest.p.eta)) : state.metrics.eta,
                      totalTime: Number(((Date.now() - startTime) / 1000).toFixed(1)),
                    },
                  }));
                };

                if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                  progressFrame = window.requestAnimationFrame(paint);
                } else {
                  paint();
                }
              }
            );

            if (generationRunToken !== runToken) break;

            const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
            const rawImages = res.images && res.images.length > 0 ? res.images : [res.imageUrl];
            const now = Date.now();
            const batchId = nextJob.batchId || `batch-${now}`;

            const newHistoryItems: HistoryItem[] = rawImages.map((imgUrl: string, idx: number) => ({
              id: `hist-${now}-${idx}`,
              batchId,
              imageUrl: imgUrl,
              prompt: nextJob.prompt,
              negativePrompt: nextJob.negativePrompt,
              createdAt: new Date(now).toLocaleTimeString(),
              timestamp: now,
              parentId: nextJob.parentId,
              relation: nextJob.relation,
              params: {
                model: nextJob.model,
                steps: nextJob.steps,
                cfgScale: nextJob.cfgScale,
                seed: nextJob.seed,
                width: nextJob.width,
                height: nextJob.height,
                sampler: nextJob.sampler,
                scheduler: nextJob.scheduler,
              },
            }));

            const shouldAutoSwap = get().settings.autoSwapToLatest;
            const limit = Math.max(1000, get().settings?.maxHistoryCount || 5000);

            const storageSettings = get().settings;
            const shouldStoreInProject = storageSettings.saveGeneratedImagesToProject;
            let storedHistoryItems = newHistoryItems;

            if (shouldStoreInProject) {
              // Wait for the local file to be safely written before deleting the
              // original SwarmUI output. This makes the setting a real storage
              // switch while preserving the server output if local storage fails.
              try {
                const savedItems = await get().saveImagesToProject(newHistoryItems);
                if (savedItems.length === newHistoryItems.length) {
                  storedHistoryItems = newHistoryItems.map((item) => savedItems.find((saved) => saved.id === item.id) || item);
                  await Promise.all(newHistoryItems.map(async (item) => {
                    try {
                      await swarmClient.deleteImageFromHistory(item.imageUrl);
                    } catch (deleteError) {
                      console.warn('[Store] Local Project image saved but original SwarmUI output could not be removed:', deleteError);
                    }
                  }));
                } else {
                  console.warn('[Store] Local Project save was incomplete; retaining original SwarmUI outputs.');
                }
              } catch (storageError) {
                console.error('[Store] Local Project storage failed; retaining normal SwarmUI output:', formatStoreError(storageError), storageError);
                emitToast('Local Project storage failed; the generation was kept in the normal Stability Matrix output folder.', 'error');
                storedHistoryItems = newHistoryItems;
              }
            }

            // The native All Outputs index is intentionally cached. Invalidate it whenever a
            // generation changes the underlying output tree so subsequent progressive pages
            // are based on the current filesystem rather than a stale file list.
            if (storageSettings.gallerySource === 'outputs') {
              void swarmClient.invalidateLocalOutputImageIndex(storageSettings.outputFolderPath || undefined).catch((indexError) => {
                console.warn('[Store] Could not invalidate All Outputs index:', indexError);
              });
            }

            set((s) => ({
              activeImage: shouldAutoSwap && storedHistoryItems.length > 0 ? storedHistoryItems[0].imageUrl : s.activeImage,
              livePreview: null,
              progressPercent: 100,
              metrics: { ...s.metrics, stage: 'Complete', totalTime: duration },
              history: [...storedHistoryItems, ...s.history].slice(0, limit),
              // galleryHistory is reserved for the All Outputs dataset. Session generations
              // stay in `history`, and Local Project generations stay in `projectHistory`.
              galleryHistory: storageSettings.gallerySource === 'outputs' && !shouldStoreInProject
                ? [...storedHistoryItems, ...s.galleryHistory]
                : s.galleryHistory,
              outputGalleryTotalCount: s.settings.gallerySource === 'outputs' && !shouldStoreInProject
                ? s.outputGalleryTotalCount + storedHistoryItems.length
                : s.outputGalleryTotalCount,
            }));

            completedCount += 1;

          } catch (e: any) {
            const errorMessage = formatStoreError(e);
            if (generationRunToken !== runToken) {
              // Cancellation/interruption should never silently destroy the active job.
              // Keep it visible as canceled so the user can retry it explicitly.
              set((s) => ({
                queue: s.queue.some((job) => job.id === nextJob.id)
                  ? s.queue
                  : [{ ...nextJob, status: 'canceled', progress: s.progressPercent, step: s.currentStep, maxSteps: s.maxSteps }, ...s.queue],
                activeJob: null,
              }));
              break;
            }
            console.error('Queue job failure:', errorMessage, e);
            failedCount += 1;
            emitToast(`Generation failed: ${errorMessage}`, 'error');
            set((s) => ({
              // Failed jobs remain in the persistent queue instead of disappearing. They are
              // not automatically retried; the user can inspect/remove/retry them.
              queue: [{ ...nextJob, status: 'failed', progress: s.progressPercent, step: s.currentStep, maxSteps: s.maxSteps }, ...s.queue],
              lastFailedJob: { ...nextJob, status: 'failed', progress: s.progressPercent, step: s.currentStep, maxSteps: s.maxSteps },
              metrics: {
                ...s.metrics,
                stage: `Error: ${errorMessage}`,
              },
            }));
          }
        }

        if (generationRunToken !== runToken) return;

        if (completedCount + failedCount > 1) {
          if (failedCount === 0) {
            emitToast(`Queue finished - ${completedCount} image${completedCount === 1 ? '' : 's'} generated`, 'success');
          } else if (completedCount === 0) {
            emitToast(`Queue finished - all ${failedCount} job${failedCount === 1 ? '' : 's'} failed`, 'error');
          } else {
            emitToast(`Queue finished - ${completedCount} succeeded, ${failedCount} failed`, 'warning');
          }
        }

        set({
          isGenerating: false,
          activeJob: null,
          currentQueueBatchId: null,
          livePreview: null,
          previewHistory: [],
          generationStartedAt: null,
        });

        const currentSettings = get().settings;
        if (currentSettings.playCompletionSound) {
          try {
            if (currentSettings.completionSoundData) {
              new Audio(currentSettings.completionSoundData).play().catch(() => {});
            } else {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
              }
            }
          } catch {}
        }
      },

      enqueueAndProcess: async () => {
        get().queueCurrentGeneration();
        await get().startQueueProcessing();
      },

      cancelGeneration: () => {
        // Invalidate the current client-side processor before interrupting the backend.
        // This prevents an old async generation loop from consuming a newly queued job
        // after the user cancels and immediately presses + Queue.
        generationRunToken += 1;
        const interruptedSession = get().sessionId;

        if (interruptedSession) {
          const request = swarmClient.interrupt(interruptedSession);
          pendingInterruptPromise = request;
          void request.finally(() => {
            if (pendingInterruptPromise === request) pendingInterruptPromise = null;
          });
        } else {
          pendingInterruptPromise = null;
        }

        const interruptedJob = get().activeJob;
        set((s) => ({
          isGenerating: false,
          activeJob: null,
          queue: interruptedJob
            ? [{ ...interruptedJob, status: 'canceled', progress: s.progressPercent, step: s.currentStep, maxSteps: s.maxSteps }, ...s.queue]
            : s.queue,
          sessionId: null,
          livePreview: null,
          previewHistory: [],
          generationStartedAt: null,
          currentQueueBatchId: null,
          currentStep: 0,
          progressPercent: 0,
          metrics: { ...s.metrics, stage: 'Interrupted' },
        }));
        emitToast('Generation cancelled', 'warning');
      },

      cancelQueuedJob: (id) =>
        set((s) => {
          const nextQueue = s.queue.filter((q) => q.id !== id);
          if (nextQueue.length === s.queue.length) return {};
          const removed = s.queue.find((q) => q.id === id);
          const remainingBatchIds = new Set(nextQueue.map((q) => q.batchId).filter(Boolean));
          const nextEmpty = (s.emptyBatches || []).filter((batchId) => batchId !== removed?.batchId || remainingBatchIds.has(batchId));
          return { queue: nextQueue, emptyBatches: nextEmpty };
        }),

      clearQueue: () => set({ queue: [], currentQueueBatchId: null }),

      retryFailedJob: (newSeed = false) => {
        const failed = get().lastFailedJob;
        if (!failed) return;
        const retry: QueueItem = { ...failed, id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: 'queued', progress: 0, step: 0, createdAt: Date.now(), seed: newSeed ? Math.floor(Math.random() * 2147483647) : failed.seed };
        set((s) => ({ queue: [retry, ...s.queue], lastFailedJob: null }));
        if (!get().isGenerating) void get().startQueueProcessing();
      },
      clearFailedJob: () => set({ lastFailedJob: null }),

      toggleModelFavorite: (type, name) => set((s) => {
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        return { [key]: s[key].map((item) => item.name === name ? { ...item, favorite: !item.favorite } : item) } as any;
      }),
      toggleModelPinned: (type, name) => set((s) => {
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        return { [key]: s[key].map((item) => item.name === name ? { ...item, pinned: !item.pinned } : item) } as any;
      }),
      setModelAlias: (type, name, alias) => set((s) => {
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        return { [key]: s[key].map((item) => item.name === name ? { ...item, aliases: Array.from(new Set([...(item.aliases || []), alias.trim()].filter(Boolean))) } : item) } as any;
      }),
      setCivitaiUrl: async (type, name, url) => {
        civitaiService.setCivitaiUrl(name, type, url);
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        set((s) => ({ [key]: s[key].map((item) => item.name === name ? { ...item, civitaiUrl: url, civitaiStatus: 'manual' } : item) } as any));
      },
      clearCivitaiUrl: (type, name) => {
        civitaiService.clearCivitaiUrl(name, type);
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        set((s) => ({ [key]: s[key].map((item) => item.name === name ? { ...item, civitaiUrl: undefined } : item) } as any));
      },
      refreshCivitaiItem: async (type, name) => {
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        const item = (get()[key] as ModelItem[]).find((x) => x.name === name);
        if (!item) return;
        const result = await civitaiService.fetchMetadata(name, type, { sha256: item.sha256, blake3: item.blake3, crc32: item.crc32, autoV1: item.autoV1, autoV2: item.autoV2, autoV3: item.autoV3, hash: item.hash, modelId: item.modelId, versionId: item.versionId });
        if (!result) return;
        set((s) => ({ [key]: s[key].map((x) => x.name === name ? { ...x, previewUrl: result.previewUrl || x.previewUrl, previewUrls: result.previewUrls || x.previewUrls, triggerWords: result.triggerWords || x.triggerWords, description: result.description || x.description, baseModel: result.baseModel || x.baseModel, modelName: result.modelName || x.modelName, versionName: result.versionName || x.versionName, modelId: result.modelId || x.modelId, versionId: result.versionId || x.versionId, civitaiMatchedBy: result.matchedBy, civitaiConfidence: result.confidence, civitaiCompleteness: result.completeness || 0, civitaiStatus: (result.completeness || 0) >= 100 ? 'matched' : 'partial', civitaiUrl: civitaiService.getCivitaiUrl(name, type) || x.civitaiUrl } : x) } as any));
      },
      markModelUsed: (type, name) => set((s) => {
        const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
        return { [key]: s[key].map((item) => item.name === name ? { ...item, lastUsedAt: Date.now() } : item) } as any;
      }),

      useGenerationParams: (item) =>
        set({
          prompt: item.prompt,
          negativePrompt: item.negativePrompt || '',
          model: item.params.model,
          steps: item.params.steps,
          cfgScale: item.params.cfgScale ?? 6.5,
          seed: item.params.seed ?? -1,
          width: item.params.width ?? 832,
          height: item.params.height ?? 1216,
          sampler: item.params.sampler ?? 'euler_ancestral',
          scheduler: item.params.scheduler ?? 'normal',
        }),

      setPendingParent: (parent) => set({
        pendingParentId: parent?.id ?? null,
        pendingParentRelation: parent?.relation ?? null,
      }),

      branchFromHistory: (item) => {
        get().useGenerationParams(item);
        get().setPendingParent({ id: item.id, relation: 'branch' });
        emitToast('Loaded recipe - your next generation will branch from this one', 'info');
      },

      rerollFromHistory: (item) => {
        const newSeed = Math.floor(Math.random() * 2147483647);
        const job: QueueItem = {
          id: `job-${Date.now()}-reroll-${Math.random().toString(36).slice(2, 6)}`,
          batchId: `batch-${Date.now()}`,
          prompt: item.prompt,
          negativePrompt: item.negativePrompt || '',
          model: item.params.model,
          textEncoder: get().textEncoder,
          textEncoder2: get().textEncoder2,
          width: item.params.width ?? 832,
          height: item.params.height ?? 1216,
          steps: item.params.steps,
          cfgScale: item.params.cfgScale ?? 6.5,
          seed: newSeed,
          sampler: item.params.sampler ?? 'euler_ancestral',
          scheduler: item.params.scheduler ?? 'normal',
          status: 'queued',
          progress: 0,
          step: 0,
          maxSteps: item.params.steps,
          createdAt: Date.now(),
          parentId: item.id,
          relation: 'variation',
        };
        set((s) => ({ queue: [...s.queue, job] }));
        void get().startQueueProcessing();
      },

      getLineageAncestors: (id) => {
        const byId = new Map(get().history.map((h) => [h.id, h]));
        const chain: HistoryItem[] = [];
        let current = byId.get(id)?.parentId ? byId.get(byId.get(id)!.parentId!) : undefined;
        const seen = new Set<string>();
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          chain.unshift(current);
          current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        return chain;
      },

      getLineageChildren: (id) => {
        return get().history.filter((h) => h.parentId === id).sort((a, b) => b.timestamp - a.timestamp);
      },

      updateControlNet: (id, updates) =>
        set((s) => ({
          controlNetUnits: s.controlNetUnits.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),

      updateADetailer: (id, updates) =>
        set((s) => ({
          aDetailerUnits: s.aDetailerUnits.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      setSectionScale: (section, scale) =>
        set((s) => ({
          settings: {
            ...s.settings,
            sectionScales: { ...s.settings.sectionScales, [section]: scale },
          },
        })),

      setCategorizationMode: (mode) =>
        set((s) => ({ settings: { ...s.settings, categorizationMode: mode } })),
    });

export const useAppStore = create<AppState>()(
  persist(createAppStore, {
      name: 'swarm_canvas_persisted_store',
      version: 7,
      storage: createJSONStorage(() => localStorage),
      // Persisted settings may come from an older build with only a subset of the current
      // settings keys. A shallow Zustand merge would replace the entire settings object and
      // leave newly introduced keys undefined. Deep-merge the settings tree against the current
      // defaults on every rehydrate so adding/changing a storage path can never blank unrelated
      // settings.
      merge: (persistedState: any, currentState: any) => {
        const persisted = persistedState || {};
        const current = currentState || {};
        return {
          ...current,
          ...persisted,
          settings: {
            ...(current.settings || {}),
            ...(persisted.settings || {}),
            sectionScales: {
              ...((current.settings && current.settings.sectionScales) || {}),
              ...((persisted.settings && persisted.settings.sectionScales) || {}),
            },
            panelViewModes: {
              ...((current.settings && current.settings.panelViewModes) || {}),
              ...((persisted.settings && persisted.settings.panelViewModes) || {}),
            },
          },
        };
      },
      migrate: (persistedState: any) => {
        const next = { ...persistedState, settings: { ...(persistedState?.settings || {}) } };
        if (typeof next.settings.activePreset !== 'string') next.settings.activePreset = 'Default';
        if (typeof next.settings.bottomPanelHeight !== 'number') next.settings.bottomPanelHeight = 340;
        if (!next.settings.sectionScales || typeof next.settings.sectionScales !== 'object') next.settings.sectionScales = {};
        next.settings.sectionScales = { pills: 100, params: 100, extranetworks: 100, history: 100, controlnet: 100, adetailer: 100, imagesearch: 100, ...(next.settings.sectionScales || {}) };
        if (typeof next.settings.hideProgressBar !== 'boolean') next.settings.hideProgressBar = false;
        if (typeof next.settings.categorizationMode !== 'string') next.settings.categorizationMode = 'prompt_flow';
        if (typeof next.settings.tagSortOrder !== 'string') next.settings.tagSortOrder = 'alphabetical';
        if (typeof next.settings.autoInjectLoraTrigger !== 'boolean') next.settings.autoInjectLoraTrigger = true;
        if (typeof next.settings.autoInjectModelKeywords !== 'boolean') next.settings.autoInjectModelKeywords = true;
        if (typeof next.settings.showTagPlusPrefix !== 'boolean') next.settings.showTagPlusPrefix = true;
        if (typeof next.settings.showTagPostCounts !== 'boolean') next.settings.showTagPostCounts = true;
        if (typeof next.settings.useUnderscores !== 'boolean') next.settings.useUnderscores = false;
        if (typeof next.settings.tagClickWeightStep !== 'number') next.settings.tagClickWeightStep = 0.2;
        if (typeof next.settings.preservePromptsOnReload !== 'boolean') next.settings.preservePromptsOnReload = true;
        if (typeof next.settings.randomizeSeedOnGen !== 'boolean') next.settings.randomizeSeedOnGen = true;
        if (typeof next.settings.autoSaveLayout !== 'boolean') next.settings.autoSaveLayout = true;
        if (typeof next.settings.maxHistoryCount !== 'number') next.settings.maxHistoryCount = 5000;
        if (typeof next.settings.separateBatches !== 'boolean') next.settings.separateBatches = true;
        if (typeof next.settings.autoSwapToLatest !== 'boolean') next.settings.autoSwapToLatest = true;
        if (typeof next.settings.playCompletionSound !== 'boolean') next.settings.playCompletionSound = true;
        if (!Object.prototype.hasOwnProperty.call(next.settings, 'completionSoundData')) next.settings.completionSoundData = null;
        if (typeof next.settings.saveBeforeAfterADetailer !== 'boolean') next.settings.saveBeforeAfterADetailer = false;
        if (typeof next.settings.autoCivitaiScan !== 'boolean') next.settings.autoCivitaiScan = true;
        if (typeof next.settings.galleryPageSize !== 'number') next.settings.galleryPageSize = 24;
        if (typeof next.settings.galleryGroupByQueue !== 'boolean') next.settings.galleryGroupByQueue = false;
        if (!next.settings.panelViewModes || typeof next.settings.panelViewModes !== 'object') next.settings.panelViewModes = {};
        next.settings.panelViewModes = { extraNetworks: 'cards', history: 'cards', gallery: 'cards', ...(next.settings.panelViewModes || {}) };
        if (typeof next.settings.fontScale !== 'number') next.settings.fontScale = 100;
        if (typeof next.settings.autoApplyModelPreset !== 'boolean') next.settings.autoApplyModelPreset = false;
        if (typeof next.settings.showPromptSelectionToolbar !== 'boolean') next.settings.showPromptSelectionToolbar = true;
        if (typeof next.settings.promptSyntaxQuickInsert !== 'boolean') next.settings.promptSyntaxQuickInsert = true;
        if (typeof next.settings.doubleClickEditPromptPills !== 'boolean') next.settings.doubleClickEditPromptPills = true;
        if (next.settings.imageOpenTarget !== 'generationviewer' && next.settings.imageOpenTarget !== 'viewport') next.settings.imageOpenTarget = 'viewport';
        const savedTextEncoders = Array.isArray(next.textEncodersList) ? next.textEncodersList.map((value: unknown) => String(value)) : [];
        next.textEncodersList = Array.from(new Set(['Automatic', 'None', 'qwen_3_06b_base.safetensors', 'qwen35_4b.safetensors', ...savedTextEncoders]));
        if (next.settings.uiTheme === 'cyber_black' || next.settings.uiTheme == null) {
          next.settings.uiTheme = 'obsidian';
        } else if (next.settings.uiTheme === 'classic') {
          next.settings.uiTheme = 'paper';
        }
        if (next.settings.gallerySource === 'app') next.settings.gallerySource = 'session';
        if (next.settings.gallerySource === 'all') next.settings.gallerySource = 'outputs';
        if (typeof next.settings.saveGeneratedImagesToProject !== 'boolean') next.settings.saveGeneratedImagesToProject = false;
        if (typeof next.settings.localProjectPath !== 'string') next.settings.localProjectPath = '';
        if (typeof next.settings.projectJpegQuality !== 'number') next.settings.projectJpegQuality = 92;
        if (typeof next.settings.projectJpegMaxDimension !== 'number') next.settings.projectJpegMaxDimension = 2048;
        if (next.settings.projectJpegBackground !== 'black' && next.settings.projectJpegBackground !== 'white') next.settings.projectJpegBackground = 'black';
        if (typeof next.settings.projectJpegFilenamePrefix !== 'string') next.settings.projectJpegFilenamePrefix = 'SwarmCanvas';
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(next.settings.projectImageFormat)) next.settings.projectImageFormat = 'jpg';
        if (typeof next.settings.outputFolderPath !== 'string') next.settings.outputFolderPath = '';
        // Gallery always starts in Current Session on a new app launch. Users can still
        // switch to Local Project or All Outputs for the duration of the current run.
        next.settings.gallerySource = 'session';
        return next;
      },
      partialize: (state: AppState) => ({
        serverUrl: state.serverUrl,
        prompt: state.prompt,
        negativePrompt: state.negativePrompt,
        model: state.model,
        modelsList: state.modelsList,
        lorasList: state.lorasList,
        embeddingsList: state.embeddingsList,
        yoloModelsList: state.yoloModelsList,
        vae: state.vae,
        vaesList: state.vaesList,
        textEncoder: state.textEncoder,
        textEncoder2: state.textEncoder2,
        selectedTextEncoders: state.selectedTextEncoders,
        textEncodersList: state.textEncodersList,
        steps: state.steps,
        cfgScale: state.cfgScale,
        width: state.width,
        height: state.height,
        seed: state.seed,
        sampler: state.sampler,
        scheduler: state.scheduler,
        batchCount: state.batchCount,
        aDetailerUnits: state.aDetailerUnits,
        controlNetUnits: (state.controlNetUnits || []).map((unit) => ({ ...unit, image: unit.image && !unit.image.startsWith('data:') ? unit.image : undefined })),
        settings: state.settings,
        emptyBatches: state.emptyBatches,
        promptPresets: state.promptPresets || [],
        lastFailedJob: state.lastFailedJob,
        // Crash/refresh recovery: jobs that hadn't started yet survive a reload so nothing
        // queued is silently lost. The currently-running job (if any) is folded back in as a
        // queued job too, since the in-progress generation itself cannot survive a reload.
        queue: [
          ...(state.activeJob ? [{ ...state.activeJob, status: 'queued' as const }] : []),
          ...state.queue,
        ].slice(0, 200),
        // Strip heavy base64 data URLs to protect localStorage from hitting the 5MB browser quota
        activeImage: state.activeImage && !state.activeImage.startsWith('data:') ? state.activeImage : null,
        history: (state.history || [])
          .filter((h) => h.imageUrl && !h.imageUrl.startsWith('data:'))
          .slice(0, 50),
        // Server gallery is reloaded from SwarmUI when the All Server source is opened.
        // Do not persist the old 100-item server snapshot as though it were the complete
        // server history; SwarmUI's ListImages endpoint is itself server-limited per request.
        galleryHistory: [],
      }),
      onRehydrateStorage: () => (state) => {
        // Runs once, right after the persisted queue is loaded back in - captures how many
        // jobs survived a crash/refresh so the UI can offer to resume them exactly once,
        // without re-triggering every time the queue changes during normal use afterward.
        if (state) {
          // Gallery is intentionally session-first on every application launch.
          state.settings.gallerySource = 'session';
        }
        if (state && state.queue && state.queue.length > 0) {
          state.recoveredQueueSize = state.queue.length;
        }
      },
    }
  )
);