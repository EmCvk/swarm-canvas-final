import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { swarmClient, SwarmProgressData } from '../api/swarmClient';
import { civitaiService, CivitaiAssetType } from '../api/civitaiService';
import { emitToast } from '../utils/toast';

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
  gallerySource: 'app' | 'all';
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
  galleryCurrentPage: number;
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
  loadAssets: () => Promise<void>;
  syncServerGallery: () => Promise<void>;
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: 'http://localhost:7801',
      sessionId: null,
      isConnected: false,
      sessionStartTime: (() => {
        const existing = sessionStorage.getItem('swarm_session_start');
        if (existing) return Number(existing);
        const now = Date.now();
        sessionStorage.setItem('swarm_session_start', String(now));
        return now;
      })(),
      hideProgressBar: false,

      history: [],
      galleryHistory: [],
      galleryCurrentPage: 1,
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
        gallerySource: 'app',
        autoResumeQueueOnLaunch: false,
        panelViewModes: {
          extraNetworks: 'cards',
          history: 'cards',
          gallery: 'cards',
        },
        uiTheme: 'obsidian',
        fontScale: 100,
        autoApplyModelPreset: false,
      },

      toggleFavorite: (id: string) =>
        set((s) => ({
          history: s.history.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
          galleryHistory: s.galleryHistory.map((item) =>
            item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
          ),
        })),

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
        const isAnima = model.toLowerCase().includes('anima');
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
            cfgScale: isAnima && s.cfgScale > 5.0 ? 4.0 : s.cfgScale,
            steps: isAnima && s.steps === 20 ? 28 : s.steps,
            sampler: s.sampler,
            scheduler: s.scheduler,
            textEncoder: isAnima && s.textEncodersList.some(t => t.includes('qwen'))
              ? s.textEncodersList.find(t => t.includes('qwen'))!
              : s.textEncoder,
          };
        });
      },
      setParams: (params) => set((s) => ({ ...s, ...params })),

      deleteHistoryItem: (id) =>
        set((s) => ({
          history: s.history.filter((h) => h.id !== id),
          galleryHistory: s.galleryHistory.filter((h) => h.id !== id),
          activeImage: s.activeImage === s.history.find((h) => h.id === id)?.imageUrl ? null : s.activeImage,
        })),

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

      loadAssets: async () => {
        try {
          await swarmClient.triggerRefresh().catch(() => {});

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

          set((s) => ({
            modelsList: formattedModels.length > 0 ? merge(formattedModels, s.modelsList, 'model') : s.modelsList,
            lorasList: formattedLoras.length > 0 ? merge(formattedLoras, s.lorasList, 'lora') : s.lorasList,
            embeddingsList: formattedEmbeddings.length > 0 ? merge(formattedEmbeddings, s.embeddingsList, 'embedding') : s.embeddingsList,
            wildcardsList: wildcards && wildcards.length > 0 ? wildcards.map((w: any) => (typeof w === 'string' ? w : w.name || String(w))) : s.wildcardsList,
            vaesList: vaes && vaes.length > 0 ? vaes : s.vaesList,
            textEncodersList: textEncoders && textEncoders.length > 0 ? textEncoders : s.textEncodersList,
            yoloModelsList: yoloModels && yoloModels.length > 0 ? yoloModels : s.yoloModelsList,
            model: s.model || (formattedModels.length > 0 ? formattedModels[0].name : s.model),
            vae: s.vae || 'Automatic',
            textEncoder: s.textEncoder || 'Automatic',
          }));
          set({ isConnected: await swarmClient.testConnection() });
        } catch (err) {
          console.error('[Store] Failed to load asset catalogs:', err);
          set({ isConnected: false });
        }
      },

      syncServerGallery: async () => {
        try {
          const serverImgs = await swarmClient.listServerImages();
          if (serverImgs.length === 0) return;

          const currentUrls = new Set(get().galleryHistory.map((h) => h.imageUrl));
          const additions: HistoryItem[] = [];
          const now = Date.now();

          serverImgs.forEach((img: { url: string; name: string }, i: number) => {
            if (!currentUrls.has(img.url)) {
              additions.push({
                id: `server-${now}-${i}`,
                batchId: `batch-server-${now}`,
                imageUrl: img.url,
                prompt: img.name.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Server image',
                negativePrompt: '',
                createdAt: new Date().toLocaleTimeString(),
                timestamp: now - i * 1000,
                params: {
                  model: get().model || 'Unknown',
                  steps: 28,
                  cfgScale: 6.5,
                  seed: -1,
                  width: 832,
                  height: 1216,
                  sampler: 'euler_ancestral',
                  scheduler: 'normal',
                },
              });
            }
          });

          if (additions.length > 0) {
            set((s) => ({
              galleryHistory: [...s.galleryHistory, ...additions].slice(0, s.settings.maxHistoryCount || 5000),
            }));
          }
        } catch (err) {
          console.error('[Store] Failed to sync server gallery:', err);
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
        if (get().isGenerating || get().queue.length === 0) return;

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

        while (get().queue.length > 0 && generationRunToken === runToken) {
          if (get().isQueuePaused) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          const currentQueue = get().queue;
          const [nextJob, ...remainingQueue] = currentQueue;

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

            set((s) => ({
              activeImage: shouldAutoSwap && newHistoryItems.length > 0 ? newHistoryItems[0].imageUrl : s.activeImage,
              livePreview: null,
              progressPercent: 100,
              metrics: { ...s.metrics, stage: 'Complete', totalTime: duration },
              history: [...newHistoryItems, ...s.history].slice(0, limit),
              galleryHistory: [...newHistoryItems, ...s.galleryHistory].slice(0, limit),
            }));

            completedCount += 1;

          } catch (e: any) {
            if (generationRunToken !== runToken) break;
            console.error('Queue job failure:', e);
            failedCount += 1;
            emitToast(`Generation failed: ${e?.message || 'unknown error'}`, 'error');
            set((s) => ({
              lastFailedJob: { ...nextJob, status: 'failed', progress: s.progressPercent, step: s.currentStep, maxSteps: s.maxSteps },
              metrics: {
                ...s.metrics,
                stage: `Error: ${e?.message || 'Generation aborted'}`,
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

        set({ isGenerating: false, activeJob: null, sessionId: null, livePreview: null, previewHistory: [], generationStartedAt: null, currentQueueBatchId: null, currentStep: 0, progressPercent: 0, metrics: { ...get().metrics, stage: 'Interrupted' } });
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
    }),
    {
      name: 'swarm_canvas_persisted_store',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any) => {
        const next = { ...persistedState, settings: { ...(persistedState?.settings || {}) } };
        if (typeof next.settings.fontScale !== 'number') next.settings.fontScale = 100;
        if (typeof next.settings.autoApplyModelPreset !== 'boolean') next.settings.autoApplyModelPreset = false;
        if (next.settings.uiTheme === 'cyber_black' || next.settings.uiTheme == null) {
          next.settings.uiTheme = 'obsidian';
        } else if (next.settings.uiTheme === 'classic') {
          next.settings.uiTheme = 'paper';
        }
        return next;
      },
      partialize: (state) => ({
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
        sessionStartTime: state.sessionStartTime,
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
        galleryHistory: (state.galleryHistory || [])
          .filter((h) => h.imageUrl && !h.imageUrl.startsWith('data:'))
          .slice(0, 100),
      }),
      onRehydrateStorage: () => (state) => {
        // Runs once, right after the persisted queue is loaded back in - captures how many
        // jobs survived a crash/refresh so the UI can offer to resume them exactly once,
        // without re-triggering every time the queue changes during normal use afterward.
        if (state && state.queue && state.queue.length > 0) {
          state.recoveredQueueSize = state.queue.length;
        }
      },
    }
  )
);