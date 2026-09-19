import { VisualSceneStager } from './companions/VisualSceneStager';

import { LatentSynthesizer } from './companions/LatentSynthesizer';

import { CharacterDossier } from './companions/CharacterDossier';

import { ArtDirectorCopilot } from './companions/ArtDirectorCopilot';

import { PromptMorphScheduler } from './companions/PromptMorphScheduler';

import { TagSynergyEngine } from './companions/TagSynergyEngine';

import { WildcardSlotMachine } from './companions/WildcardSlotMachine';

import { TagRarityInspector } from './companions/TagRarityInspector';



import * as React from 'react';
import { useEffect, useState, useRef, useMemo, useDeferredValue } from 'react';

import { useShallow } from 'zustand/react/shallow';

import {

  DockviewReact,

  DockviewReadyEvent,

  DockviewApi,

  IDockviewPanelProps

} from 'dockview-react';

import {

  useAppStore,

  SWARM_VALID_SAMPLERS,

  SWARM_VALID_SCHEDULERS,

  ModelItem,

  AppSettings,

  HistoryItem

} from '../store/useAppStore';

import { danbooru, TagDetail } from '../api/danbooruService';

import { PromptAutosuggestTextarea } from './PromptAutosuggestTextarea';

import { CustomContextMenu, ContextMenuItem } from './CustomContextMenu';

import { ModelPlaceholder } from './ModelPlaceholder';

import { DebugConsole } from './DebugConsole';

import { PanelErrorBoundary } from './ErrorBoundary';

import { CommandPalette, defaultCommandIcons, CommandPaletteItem } from './CommandPalette';

import { civitaiService } from '../api/civitaiService';

import { CivitaiLibraryPanel } from './CivitaiLibraryPanel';
import { InfoPopover } from './InfoPopover';
import { StudioToolsPanel } from './StudioToolsPanel';

import { swarmClient, emitDiagnostic } from '../api/swarmClient';

import {

  Wand2, Plus, Clock, Gauge, Command as CommandIcon, ArrowDownUp,

  RotateCw, Search, Layers, Sparkle, LayoutGrid,

  Box, ZoomIn, ZoomOut, Maximize2, Minimize2,

  History as HistoryIcon, Image as ImageIcon,

  Grid, List, Sliders, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,

  Settings, Copy, Trash2, ExternalLink, Download, ArrowUpRight,

  SplitSquareVertical, Globe, Check,

  Dices, Lock, Unlock, AlertTriangle, Zap, Eye, EyeOff, Terminal,

  Star, Info, Volume2, Play, Sparkles, Crop, Type, Move, GripVertical,

  BookOpen, BarChart3, Pause, Palette, PanelLeftClose, PanelLeftOpen,Bookmark

} from 'lucide-react';



/* =========================================================================

   STAGE COLOR MAP & CONTEXT CO-OCCURRENCE DICTIONARY

   ========================================================================= */

const STAGE_COLOR_STYLES: Record<string, { border: string; bg: string; text: string }> = {

  'Person': { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400' },

  'Apparel': { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400' },

  'Facial expression and action': { border: 'border-amber-400/40', bg: 'bg-amber-400/10', text: 'text-amber-300' },

  'Image': { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },

  'Environment': { border: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-400' },

  'Scene': { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400' },

  'Items': { border: 'border-yellow-600/40', bg: 'bg-yellow-600/10', text: 'text-yellow-400' },

  'Camera': { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },

  'Hanfu': { border: 'border-red-600/40', bg: 'bg-red-600/10', text: 'text-red-400' },

  'NSFW & Adult': { border: 'border-pink-500/40', bg: 'bg-pink-500/10', text: 'text-pink-400' },

  'Negative Prompt': { border: 'border-slate-500/40', bg: 'bg-slate-500/10', text: 'text-slate-400' }

};



const CONFLICT_LINTER_RULES = [

  {

    setA: ['closed_eyes', 'eyes_closed', 'blindfold'],

    setB: ['looking_at_viewer', 'looking_away', 'looking_back', 'blue_eyes', 'red_eyes', 'heterochromia'],

    message: 'Closed eyes / blindfold conflicts with visible eye colors or gaze'

  },

  {

    setA: ['short_hair', 'very_short_hair'],

    setB: ['long_hair', 'very_long_hair', 'absurdly_long_hair'],

    message: 'Short hair conflicts with long hair'

  },

  {

    setA: ['indoors', 'indoor'],

    setB: ['outdoors', 'outdoor', 'sky', 'cloudy_sky', 'blue_sky', 'sunlight'],

    message: 'Indoors conflicts with outdoor sky or weather'

  },

  {

    setA: ['day', 'sunlight'],

    setB: ['night', 'moonlight', 'starry_sky'],

    message: 'Daylight conflicts with nighttime/moonlight'

  },

  {

    setA: ['standing'],

    setB: ['sitting', 'lying', 'kneeling', 'squatting'],

    message: 'Standing conflicts with sitting or lying'

  },

  {

    setA: ['monochrome', 'greyscale'],

    setB: ['colorful', 'rainbow', 'multicolored_hair'],

    message: 'Monochrome/greyscale conflicts with colorful tags'

  }

];



const CO_OCCURRENCE_RULES: { triggers: string[]; suggestions: string[] }[] = [

  { triggers: ['swimsuit', 'bikini', 'barefoot'], suggestions: ['beach', 'poolside', 'water', 'sunlight', 'ocean', 'wet'] },

  { triggers: ['school_uniform', 'serafuku', 'blazer'], suggestions: ['classroom', 'school', 'desk', 'pleated_skirt', 'loafers'] },

  { triggers: ['kimono', 'yukata', 'haori'], suggestions: ['geta', 'torii', 'shrine', 'cherry_blossoms', 'tatami'] },

  { triggers: ['maid', 'apron', 'maid_headdress'], suggestions: ['tray', 'tea', 'kitchen', 'indoors', 'serving'] },

  { triggers: ['sitting', 'lying', 'kneeling'], suggestions: ['chair', 'bed', 'couch', 'grass', 'floor'] },

  { triggers: ['sword', 'katana', 'blade'], suggestions: ['holding_sword', 'sheath', 'fighting_stance', 'battlefield'] },

  { triggers: ['gun', 'pistol', 'rifle'], suggestions: ['holding_gun', 'pointing_gun', 'trigger', 'muzzle_flash'] },

  { triggers: ['rain', 'wet'], suggestions: ['umbrella', 'puddle', 'wet_clothes', 'droplets'] },

  { triggers: ['night', 'dark'], suggestions: ['moonlight', 'stars', 'night_sky', 'glowing'] },

  { triggers: ['cat_ears', 'cat_girl'], suggestions: ['cat_tail', 'cat', 'meowing', 'paws'] },

  { triggers: ['fox_ears', 'kitsune'], suggestions: ['fox_tail', 'fox', 'shrine', 'torii'] },

  { triggers: ['dragon', 'dragon_girl'], suggestions: ['dragon_horns', 'dragon_wings', 'dragon_tail', 'fire', 'claws'] }

];



export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {

  const img = e.currentTarget;

  const raw = img.dataset.previewCandidates;

  const candidates = raw ? raw.split('\n').filter(Boolean) : [];

  const index = Number(img.dataset.previewFallbackIndex || '0');

  if (candidates.length && index + 1 < candidates.length) {

    img.dataset.previewFallbackIndex = String(index + 1);

    img.src = candidates[index + 1];

    return;

  }

  const src = img.src;

  if (src.includes('localhost:7801')) {

    img.src = src.replace('localhost:7801', '127.0.0.1:7801');

  } else if (src.includes('127.0.0.1:7801')) {

    img.src = src.replace('127.0.0.1:7801', 'localhost:7801');

  }

};



export const resolveImageUrl = (url?: string): string => {

  if (!url) return '';



  const clean = url.trim();



  // 1. Direct Data URIs or Object Blobs

  if (clean.startsWith('data:') || clean.startsWith('blob:')) {

    return clean;

  }



  // 2. Base64 JPEG or PNG without scheme prefix

  if (clean.startsWith('/9j/') || clean.startsWith('/9j')) {

    return `data:image/jpeg;base64,${clean}`;

  }

  if (clean.startsWith('iVBORw0KGgo')) {

    return `data:image/png;base64,${clean}`;

  }

  if (clean.startsWith('image/')) {

    return `data:${clean}`;

  }



  // Detect raw base64 strings (long strings without URL spaces/newlines)

  if (clean.length > 500 && !clean.includes(' ') && !clean.includes('\n') && /^[A-Za-z0-9+/=]+$/.test(clean)) {

    return `data:image/jpeg;base64,${clean}`;

  }



  // 3. Remote or Local HTTP paths

  const serverUrl = (useAppStore.getState().serverUrl || 'http://localhost:7801').replace(/\/+$/, '');



  if (clean.startsWith('http://') || clean.startsWith('https://')) {

    // External image/CDN URLs (not the local backend) must remain external.

    if (!/^(https?:\/\/)(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(clean)) return clean;

    try {

      const u = new URL(clean);

      let p = u.pathname.replace(/^\/+/, '');

      if (p.toLowerCase().startsWith('output/')) p = p.replace(/^output\//i, '');

      if (!p.startsWith('View/')) return `${serverUrl}/View/${p}${u.search}`;

      return `${serverUrl}/${p}${u.search}`;

    } catch { return clean; }

  }



  let cleanPath = clean.replace(/^\/+/, '');

  if (cleanPath.toLowerCase().startsWith('output/')) {

    cleanPath = cleanPath.replace(/^output\//i, '');

  }

  if (!cleanPath.startsWith('View/')) {

    cleanPath = `View/${cleanPath}`;

  }



  return `${serverUrl}/${cleanPath}`;

};



// Generates a consistent, aesthetic dark-mode badge color scheme for any model name

const getModelColorStyle = (modelName?: string) => {

  if (!modelName) return { bg: 'bg-[#252321]', text: 'text-[#ddd5c9]', border: 'border-white/8' };

  const palettes = [

    { bg: 'bg-[#2d2415]', text: 'text-[#efd18b]', border: 'border-[#b89445]/25' },

    { bg: 'bg-[#172221]', text: 'text-[#b8d9cb]', border: 'border-[#5f9f83]/22' },

    { bg: 'bg-[#242026]', text: 'text-[#cbc2d9]', border: 'border-[#9181ad]/20' },

    { bg: 'bg-[#25211e]', text: 'text-[#dfc2a2]', border: 'border-[#b98d60]/22' },

  ];

  let hash = 0;

  for (let i = 0; i < modelName.length; i++) hash = modelName.charCodeAt(i) + ((hash << 5) - hash);

  return palettes[Math.abs(hash) % palettes.length];

};





const previewObjectUrlCache = new Map<string, string>();



function isDirectRemoteImageUrl(value: string): boolean {

  return /^https?:\/\//i.test(value) && !/^(https?:\/\/)(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(value);

}



const getPreviewSource = (value?: string): string => {

  if (!value) return '';

  const clean = value.trim();

  if (isDirectRemoteImageUrl(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) return clean;

  return resolveImageUrl(clean);

};



const getCachedPreview = async (src: string): Promise<string> => {

  if (!src || typeof window === 'undefined' || !('caches' in window)) return src;

  if (previewObjectUrlCache.has(src)) return previewObjectUrlCache.get(src)!;

  try {

    const cache = await window.caches.open('swarm-canvas-civitai-previews-v1');

    const hit = await cache.match(src);

    if (hit) {

      const url = URL.createObjectURL(await hit.blob());

      previewObjectUrlCache.set(src, url);

      return url;

    }

    const response = await fetch(src, { mode: 'cors' });

    if (response.ok) {

      await cache.put(src, response.clone());

      const url = URL.createObjectURL(await response.blob());

      previewObjectUrlCache.set(src, url);

      return url;

    }

  } catch {

    // CDN CORS can prevent Cache Storage; return the remote URL as a fallback.

  }

  return src;

};



const ModelPreview = React.memo(({ url, urls = [], name, type = 'model', className = '' }: {
  url?: string;
  urls?: string[];
  name: string;
  type?: string;
  className?: string;
}) => {

  const candidates = useMemo(() => Array.from(new Set([url, ...urls].filter(Boolean).map((v) => getPreviewSource(v)))), [url, urls]);

  const [index, setIndex] = useState(0);

  const [src, setSrc] = useState(candidates[0] || '');

  const [loading, setLoading] = useState(Boolean(candidates[0]));



  useEffect(() => {

    setIndex(0);

    setSrc(candidates[0] || '');

    setLoading(Boolean(candidates[0]));

  }, [candidates.join('\n')]);



  useEffect(() => {

    let cancelled = false;

    if (!src) return;

    setLoading(true);

    void getCachedPreview(src).then((cached) => {

      if (!cancelled) {

        setSrc(cached);

        setLoading(false);

      }

    }).catch(() => {

      if (!cancelled) setLoading(false);

    });

    return () => { cancelled = true; };

  }, [src]);



  if (!candidates.length || index >= candidates.length) {

    return <ModelPlaceholder name={name} type={type as any} />;

  }



  return (

    <div className="relative w-full h-full flex items-center justify-center bg-[#111315] overflow-hidden">

      {loading && <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />}

      <img

        key={`${candidates[index]}:${index}`}

        src={src}

        alt={name}

        loading="lazy"

        decoding="async"

        className={className || 'w-full h-full object-cover'}

        onLoad={() => setLoading(false)}

        onError={() => {

          const next = index + 1;

          if (next < candidates.length) {

            setIndex(next);

            setSrc(candidates[next]);

            setLoading(true);

          } else {

            setIndex(candidates.length);

            setLoading(false);

          }

        }}

      />

    </div>

  );

});



export const emitToast = (message: string, tone: 'success' | 'info' | 'warning' | 'error' = 'info') => {

  window.dispatchEvent(new CustomEvent('swarm-toast', { detail: { message, tone } }));

};



/* =========================================================================

   1. VIEWPORT CANVAS

   ========================================================================= */

const PreviewPanel: React.FC<IDockviewPanelProps> = () => {

  const store = useAppStore(useShallow((s) => ({
    activeImage: s.activeImage, livePreview: s.livePreview, isGenerating: s.isGenerating, currentStep: s.currentStep,
    maxSteps: s.maxSteps, progressPercent: s.progressPercent, metrics: s.metrics, setParams: s.setParams,
    comparisonImage: s.comparisonImage, isComparing: s.isComparing, compareSplit: s.compareSplit,
    setIsComparing: s.setIsComparing, setComparisonImage: s.setComparisonImage, setCompareSplit: s.setCompareSplit,
    history: s.history, cancelGeneration: s.cancelGeneration, settings: s.settings, updateSettings: s.updateSettings,
    enqueueAndProcess: s.enqueueAndProcess, queueCurrentGeneration: s.queueCurrentGeneration, startQueueProcessing: s.startQueueProcessing,
    lastFailedJob: s.lastFailedJob, retryFailedJob: s.retryFailedJob, clearFailedJob: s.clearFailedJob,
    setActiveContextMenu: s.setActiveContextMenu, queue: s.queue, activeJob: s.activeJob, emptyBatches: s.emptyBatches,
    isQueuePaused: s.isQueuePaused, setIsQueuePaused: s.setIsQueuePaused,
    prompt: s.prompt, startNewBatch: s.startNewBatch, createNewEmptyBatch: s.createNewEmptyBatch,
    moveJobToBatch: s.moveJobToBatch, duplicateQueuedItem: s.duplicateQueuedItem, addVariationToBatch: s.addVariationToBatch,
    removeBatchFromQueue: s.removeBatchFromQueue, reorderQueue: s.reorderQueue, cancelQueuedJob: s.cancelQueuedJob, clearQueue: s.clearQueue,
  })));

  const {
    activeImage, livePreview, isGenerating, currentStep, maxSteps, progressPercent, metrics, setParams,
    comparisonImage, isComparing, compareSplit, setIsComparing, setComparisonImage, setCompareSplit, history,
    cancelGeneration, settings, updateSettings, enqueueAndProcess, queueCurrentGeneration, startQueueProcessing,
    lastFailedJob, retryFailedJob, clearFailedJob, setActiveContextMenu
  } = store;

  const queue: any[] = store.queue || [];
  const activeJob: any = store.activeJob || null;
  const emptyBatches: string[] = store.emptyBatches || [];



  // 'live' = real-time sampling stream, 'static' = selected image from history/gallery

  const [viewportMode, setViewportMode] = useState<'live' | 'static'>('live');



  // Reset to live view whenever a new generation begins

  useEffect(() => {

    if (isGenerating) {

      setViewportMode('live');

    }

  }, [isGenerating]);



  // Switch to static view when the user clicks any image in history while generating

  const prevActiveImageRef = useRef(activeImage);

  useEffect(() => {

    if (isGenerating && activeImage && activeImage !== prevActiveImageRef.current) {

      setViewportMode('static');

    }

    prevActiveImageRef.current = activeImage;

  }, [activeImage, isGenerating]);



  // During generation: in live mode, show livePreview or fall back to dimmed activeImage with progress overlay

  const displayImage = isGenerating

    ? (viewportMode === 'static' ? activeImage : (livePreview || activeImage))

    : (activeImage || livePreview);



  const [isQueueExpanded, setIsQueueExpanded] = useState(false);

  const [zoom, setZoom] = useState(1);

  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });



  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [isQueueOpen, setIsQueueOpen] = useState(false);

  useEffect(() => {
    const openQueue = () => setIsQueueOpen(true);
    window.addEventListener('swarm-open-queue', openQueue);
    return () => window.removeEventListener('swarm-open-queue', openQueue);
  }, []);

  const [comparisonMode, setComparisonMode] = useState<'vertical' | 'horizontal' | 'side-by-side' | 'fade'>('vertical');

  const [comparisonToolsOpen, setComparisonToolsOpen] = useState(false);

  const [comparisonFade, setComparisonFade] = useState(0.5);

  const [isViewportToolbarCollapsed, setIsViewportToolbarCollapsed] = useState(false);



  const [isCropMode, setIsCropMode] = useState(false);

  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const cropStart = useRef<{ x: number; y: number } | null>(null);



  const handleWheel = (e: React.WheelEvent) => {

    e.preventDefault();

    const delta = e.deltaY < 0 ? 0.15 : -0.15;

    setZoom((prev) => Math.max(0.1, Math.min(10, Number((prev + delta).toFixed(2)))));

  };



  const handleMouseDown = (e: React.MouseEvent) => {

    if (isDraggingSlider) return;

    if (isCropMode && e.button === 0) {

      const rect = canvasContainerRef.current?.getBoundingClientRect();

      if (!rect) return;

      const x = e.clientX - rect.left;

      const y = e.clientY - rect.top;

      cropStart.current = { x, y };

      setCropBox({ x, y, width: 0, height: 0 });

      return;

    }

    if (e.button === 0 || e.button === 1) {

      setIsDragging(true);

      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };

    }

  };



  const handleMouseMove = (e: React.MouseEvent) => {

    if (isCropMode && cropStart.current && canvasContainerRef.current) {

      const rect = canvasContainerRef.current.getBoundingClientRect();

      const currentX = e.clientX - rect.left;

      const currentY = e.clientY - rect.top;



      const x = Math.min(cropStart.current.x, currentX);

      const y = Math.min(cropStart.current.y, currentY);

      const width = Math.abs(currentX - cropStart.current.x);

      const height = Math.abs(currentY - cropStart.current.y);



      setCropBox({ x, y, width, height });

      return;

    }

    if (isDraggingSlider && canvasContainerRef.current) {

      const rect = canvasContainerRef.current.getBoundingClientRect();

      const relativeX = e.clientX - rect.left;

      const pct = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));

      setCompareSplit(Math.round(pct));

      return;

    }

    if (isDragging) {

      setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });

    }

  };



  const handleMouseUp = () => {

    setIsDragging(false);

    setIsDraggingSlider(false);

    cropStart.current = null;

  };



  const resetTransform = () => {

    setZoom(1);

    setPan({ x: 0, y: 0 });

  };



  const fitToScreen = () => {

    setPan({ x: 0, y: 0 });

    if (!canvasContainerRef.current) {

      setZoom(1);

      return;

    }



    const img = canvasContainerRef.current.querySelector('img');

    if (!img || !img.naturalWidth || !img.naturalHeight) {

      setZoom(1);

      return;

    }



    // Leave a clean 32px breathing margin around the canvas edges

    const availableWidth = canvasContainerRef.current.clientWidth - 32;

    const availableHeight = canvasContainerRef.current.clientHeight - 32;



    const scaleX = availableWidth / img.naturalWidth;

    const scaleY = availableHeight / img.naturalHeight;



    // Scale precisely to fill the available canvas without artificial caps

    const optimalScale = Math.min(scaleX, scaleY);

    setZoom(Math.max(0.05, Math.min(10, Number(optimalScale.toFixed(2)))));

  };



  useEffect(() => {

    const handleFitShortcut = () => fitToScreen();

    window.addEventListener('swarm-fit-viewport', handleFitShortcut);

    return () => window.removeEventListener('swarm-fit-viewport', handleFitShortcut);

  }, []);



  const handleViewportContextMenu = (e: React.MouseEvent) => {

    e.preventDefault();

    e.stopPropagation();



    const items: ContextMenuItem[] = [

      {

        label: 'Fit to Screen',

        icon: <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />,

        action: fitToScreen

      },

      {

        label: 'Reset Zoom (1:1 Center)',

        icon: <Maximize2 className="w-3.5 h-3.5" />,

        action: resetTransform

      },

      {

        label: isCropMode ? 'Exit Regional Crop Mode' : 'Enter Regional Guidance Box Mode',

        icon: <Crop className="w-3.5 h-3.5 text-cyan-400" />,

        action: () => {

          setIsCropMode(!isCropMode);

          setCropBox(null);

        }

      }

    ];



    if (displayImage) {

      items.push(

        {

          label: isComparing ? 'Exit A/B Comparison' : 'Enter A/B Split Comparison',

          icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,

          action: () => {

            if (!isComparing && !comparisonImage && history.length > 0) {

              setComparisonImage(history[0].imageUrl);

            }

            setIsComparing(!isComparing);

          }

        },

        {

          label: 'Send to ControlNet Unit 1',

          icon: <Layers className="w-3.5 h-3.5 text-emerald-400" />,

          action: () => {

            useAppStore.getState().updateControlNet('1', { enabled: true, image: displayImage });

          }

        },

        {

          label: 'Open Full Image in New Tab',

          icon: <ExternalLink className="w-3.5 h-3.5" />,

          action: () => window.open(displayImage, '_blank')

        },

        {

          label: 'Download Rendered PNG',

          icon: <Download className="w-3.5 h-3.5" />,

          action: () => {

            const a = document.createElement('a');

            a.href = displayImage;

            a.download = `Swarm_${Date.now()}.png`;

            a.click();

          }

        },

        {

          separator: true,

          label: 'Clear Canvas Output',

          icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,

          danger: true,

          action: () => setParams({ activeImage: null, livePreview: null })

        }

      );

    }



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Viewport Actions', items });

  };



  const totalInQueue = queue.length + (isGenerating || activeJob ? 1 : 0);



  const combinedBatchGroups = useMemo(() => {

    const allJobs: any[] = [];

    if (activeJob) {

      allJobs.push({ ...activeJob, isRunning: true });

    }

    queue.forEach((q: any) => allJobs.push({ ...q, isRunning: false }));



    const groups: { batchId: string; items: any[] }[] = [];

    const map = new Map<string, any[]>();



    allJobs.forEach((job) => {

      const bId = job.batchId || 'batch-unassigned';

      if (!map.has(bId)) {

        const list: any[] = [];

        map.set(bId, list);

        groups.push({ batchId: bId, items: list });

      }

      map.get(bId)!.push(job);

    });



    return groups;

  }, [activeJob, queue]);



  return (

    <div

      ref={canvasContainerRef}

      className="sc-themed-viewport h-full w-full relative flex flex-col items-center justify-center overflow-hidden select-none"

      onWheel={handleWheel}

      onMouseDown={handleMouseDown}

      onMouseMove={handleMouseMove}

      onMouseUp={handleMouseUp}

      onMouseLeave={handleMouseUp}

      onContextMenu={handleViewportContextMenu}

    >

      {displayImage ? (

        <div

          className="absolute transition-transform duration-75 cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto"

          style={{

            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,

            transformOrigin: 'center center'

          }}

        >

          <div className="relative w-[calc(100vw-32px)] h-[calc(100vh-96px)] max-w-full max-h-full select-none flex items-center justify-center">

            <img

              src={resolveImageUrl(displayImage)}

              onError={handleImageError}

              alt="Viewport Output"

              draggable={false}

              style={{ display: 'block' }}

              className={`w-full h-full max-w-full max-h-full object-contain shadow-2xl pointer-events-none rounded transition-all ${

                isGenerating && viewportMode === 'live' && !livePreview

                  ? 'filter contrast-[0.75] brightness-[0.75] blur-[1px]'

                  : isGenerating && livePreview

                  ? 'filter contrast-[1.02] brightness-[1.02]'

                  : ''

              }`}

            />



            {/* Real-Time Live Preview Sampling Badge */}

            {isGenerating && viewportMode === 'live' && (

              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/82 backdrop-blur-md px-3 py-1.5 rounded-lg text-emerald-200 font-mono text-[10px] shadow-lg pointer-events-none">

                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />

                <div className="flex flex-col"><span className="font-semibold">{livePreview ? 'LIVE PREVIEW' : (metrics.stage || 'PREPARING')}</span><span className="text-zinc-400">{currentStep} / {maxSteps} · {progressPercent}%{metrics.speed !== null ? ` · ${metrics.speed} it/s` : ''}</span></div>

              </div>

            )}



            {isComparing && comparisonImage && (

              comparisonMode === 'side-by-side' ? (

                <div className="absolute inset-0 grid grid-cols-2 gap-1 pointer-events-none">

                  <div className="relative overflow-hidden bg-black/20"><img src={resolveImageUrl(displayImage)} alt="Current comparison" loading="lazy" decoding="async" className="w-full h-full object-contain" /></div>

                  <div className="relative overflow-hidden bg-black/20"><img src={resolveImageUrl(comparisonImage)} alt="Comparison image" loading="lazy" decoding="async" className="w-full h-full object-contain" /></div>

                </div>

              ) : comparisonMode === 'fade' ? (

                <div className="absolute inset-0 pointer-events-none rounded overflow-hidden">

                  <img src={resolveImageUrl(comparisonImage)} alt="Comparison image" loading="lazy" decoding="async" className="w-full h-full object-contain" style={{ opacity: comparisonFade }} />

                  <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-200">Fade {Math.round(comparisonFade * 100)}%</div>

                </div>

              ) : (

                <>

                  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded" style={comparisonMode === 'vertical' ? { clipPath: `inset(0 0 0 ${compareSplit}%)` } : { clipPath: `inset(${compareSplit}% 0 0 0)` }}>

                    <img src={resolveImageUrl(comparisonImage)} onError={handleImageError} alt="Comparison View (B)" draggable={false} className="w-full h-full object-contain" />

                  </div>

                  <div

                    onMouseDown={(e) => { e.stopPropagation(); setIsDraggingSlider(true); }}

                    style={comparisonMode === 'vertical' ? { left: `${compareSplit}%`, top: 0, bottom: 0, width: '1px' } : { top: `${compareSplit}%`, left: 0, right: 0, height: '1px' }}

                    className="absolute bg-amber-400 cursor-ew-resize z-30 shadow-[0_0_12px_rgba(197,161,92,0.8)]"

                  >

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-amber-700 flex items-center justify-center text-[9px] font-mono text-white font-bold">{comparisonMode === 'vertical' ? '↔' : '↕'}</div>

                  </div>

                </>

              )

            )}

          </div>

        </div>

      ) : isGenerating ? (

        <div className="flex flex-col items-center justify-center gap-3 text-cyan-400 font-mono text-xs pointer-events-none p-6 text-center select-none">

          <div className="relative flex items-center justify-center">

            <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />

            <span className="absolute w-3 h-3 rounded-full bg-cyan-400 animate-ping" />

          </div>

          <div className="flex flex-col gap-1 items-center">

            <span className="font-bold text-sm text-cyan-300">

              {metrics.stage || 'SAMPLING'}: {currentStep} / {maxSteps} ({progressPercent}%)

            </span>

            <span className="text-[11px] text-zinc-400">

              {livePreview ? 'Streaming preview frames...' : 'Initializing weights & latents...'}

            </span>

          </div>

        </div>

      ) : isGenerating && viewportMode === 'live' ? (

        <div className="flex flex-col items-center justify-center gap-3 text-cyan-400 font-mono text-xs pointer-events-none p-6 text-center select-none">

          <div className="relative flex items-center justify-center">

            <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />

            <span className="absolute w-3 h-3 rounded-full bg-cyan-400 animate-ping" />

          </div>

          <div className="flex flex-col gap-1 items-center">

            <span className="font-bold text-sm text-cyan-300">

              {metrics.stage || 'SAMPLING'}: {currentStep} / {maxSteps} ({progressPercent}%)

            </span>

            <span className="text-[11px] text-zinc-400">

              {currentStep === 0 ? 'Loading weights and preparing latents...' : 'Streaming sampling preview...'}

            </span>

          </div>

        </div>

      ) : (

        <span className="text-neutral-600 text-xs">No image rendered yet</span>

      )}



      {isCropMode && cropBox && cropBox.width > 5 && cropBox.height > 5 && (

        <div

          style={{

            left: `${cropBox.x}px`,

            top: `${cropBox.y}px`,

            width: `${cropBox.width}px`,

            height: `${cropBox.height}px`,

          }}

          className="absolute border-2 border-cyan-400 bg-cyan-500/15 pointer-events-none z-30 shadow-[0_0_12px_rgba(6,182,212,0.4)]"

        >

          <div className="absolute -top-6 left-0 bg-cyan-900/90 border border-cyan-400/50 text-cyan-200 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap">

            Region: {Math.round(cropBox.width)} × {Math.round(cropBox.height)}

          </div>

        </div>

      )}



      {/* Top-Right Glass Toolbar */}

      {isViewportToolbarCollapsed ? (

        <button type="button" onClick={() => setIsViewportToolbarCollapsed(false)} className="absolute top-3.5 right-3.5 z-20 rounded-xl p-2 bg-[#17191b]/90 text-amber-300 shadow-xl backdrop-blur-md hover:bg-[#222426]" title="Expand viewport toolbar">

          <Settings className="w-3.5 h-3.5" />

        </button>

      ) : (

      <div className="absolute top-3.5 right-3.5 flex items-center gap-1 bg-[#17191b]/90 rounded-xl p-1 backdrop-blur-md shadow-2xl z-20">

        {/* Generation Status & Mode Switcher Button (Always accessible during generation) */}

        {isGenerating && (

          <>

            <button

              type="button"

              onClick={() => setViewportMode(viewportMode === 'live' ? 'static' : 'live')}

              className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md ${

                viewportMode === 'live'

                  ? 'bg-amber-500/12 text-amber-300 shadow-[0_0_10px_rgba(6,182,212,0.35)]'

                  : 'bg-indigo-500/30 border-indigo-400 text-indigo-200 hover:text-white animate-pulse'

              }`}

              title={viewportMode === 'live' ? "Showing live preview. Click to inspect static output." : "Showing static image. Click to return to live stream."}

            >

              <span className={`w-2 h-2 rounded-full ${viewportMode === 'live' ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />

              <span>{viewportMode === 'live' ? `Live (${progressPercent}%)` : `Back to Live (${progressPercent}%)`}</span>

            </button>

            <div className="h-3.5 w-px bg-white/10 mx-0.5" />

          </>

        )}



        <button

          onClick={() => setIsQueueOpen((prev) => !prev)}

          className={`p-1.5 rounded-lg cursor-pointer transition flex items-center gap-1.5 text-[11px] font-mono ${

            isQueueOpen

              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'

              : 'hover:bg-white/10 text-zinc-400 hover:text-zinc-200'

          }`}

          title="Toggle Queue"

        >

          <Layers className="w-3.5 h-3.5 text-cyan-400" />

          <span className="font-bold">{totalInQueue}</span>

        </button>



        <div className="h-3.5 w-px bg-white/10 mx-0.5" />



        <button

          onClick={() => updateSettings({ hideProgressBar: !settings.hideProgressBar })}

          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"

          title="Toggle Progress Bar"

        >

          {settings.hideProgressBar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}

        </button>



        <button

          onClick={() => {

            setIsCropMode(!isCropMode);

            setCropBox(null);

          }}

          className={`p-1.5 rounded-lg transition ${

            isCropMode ? 'bg-cyan-600 text-white' : 'hover:bg-white/10 text-zinc-400 hover:text-white'

          }`}

          title="Regional Guidance Box"

        >

          <Crop className="w-3.5 h-3.5" />

        </button>



        <button

          onClick={() => {

            if (!isComparing && !comparisonImage && history.length > 0) {

              setComparisonImage(history[0].imageUrl);

            }

            setIsComparing(!isComparing);

          }}

          className={`p-1.5 rounded-lg transition ${

            isComparing ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-zinc-400 hover:text-white'

          }`}

          title="A/B Split View"

        >

          <SplitSquareVertical className="w-3.5 h-3.5" />

        </button>



        <div className="relative">

          <button type="button" onClick={() => setComparisonToolsOpen((v) => !v)} className={`p-1.5 rounded-lg transition ${comparisonToolsOpen ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-white/10 text-zinc-400 hover:text-zinc-100'}`} title="Comparison modes"><ArrowDownUp className="w-3.5 h-3.5" /></button>

          {comparisonToolsOpen && (

            <div className="absolute top-full right-0 mt-2 w-44 rounded-xl bg-[#181a1c] p-2 shadow-2xl z-50">

              {([['vertical','Vertical Split'],['horizontal','Horizontal Split'],['side-by-side','Side by Side'],['fade','Fade']] as const).map(([value,label]) => (

                <button key={value} type="button" onClick={() => { setComparisonMode(value); setComparisonToolsOpen(false); if (!isComparing && history.length) { setComparisonImage(history[0].imageUrl); setIsComparing(true); } }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition ${comparisonMode === value ? 'bg-amber-500/15 text-amber-200' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>{label}</button>

              ))}

              {comparisonMode === 'fade' && <input type="range" min="0" max="100" value={comparisonFade * 100} onChange={(e) => setComparisonFade(Number(e.target.value)/100)} className="w-full mt-2 accent-amber-500" title="Fade amount" />}

            </div>

          )}

        </div>



        <div className="h-3.5 w-px bg-white/10 mx-0.5" />



        <button onClick={() => setZoom((z) => Math.min(10, z + 0.25))} className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition" title="Zoom In">

          <ZoomIn className="w-3.5 h-3.5" />

        </button>

        <span className="text-[10px] font-mono text-zinc-400 px-1 font-semibold">{Math.round(zoom * 100)}%</span>

        <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))} className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition" title="Zoom Out">

          <ZoomOut className="w-3.5 h-3.5" />

        </button>

        <button onClick={fitToScreen} className="p-1.5 hover:bg-white/10 text-blue-300 rounded-lg transition" title="Fit to Viewport">

          <Minimize2 className="w-3.5 h-3.5" />

        </button>

        <button onClick={resetTransform} className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition" title="Reset (1:1 Native)">

          <Maximize2 className="w-3.5 h-3.5" />

        </button>

        <button type="button" onClick={() => setIsViewportToolbarCollapsed(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-amber-300 transition" title="Collapse viewport toolbar">

          <ChevronUp className="w-3.5 h-3.5" />

        </button>

      </div>

      )}



      {/* Floating Studio Execution Actions */}

      <div className="absolute bottom-5 right-5 flex items-center gap-2 p-1.5 bg-[#090b10]/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md z-30 select-none">

        {isGenerating ? (

          <button

            type="button"

            onClick={cancelGeneration}

            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/40 text-rose-200 hover:text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg transition-all flex items-center gap-1.5"

          >

            <span>Interrupt</span>

          </button>

        ) : (

          <button

            type="button"

            onClick={enqueueAndProcess}

            className="sc-generate-button px-5 py-2 rounded-xl text-xs"

          >

            <Wand2 className="w-4 h-4" />

            <span>Generate</span>

          </button>

        )}



        <InfoPopover content="Adds the current prompt and parameters to the end of the queue. It does not re-enqueue an interrupted active job; jobs that were already waiting remain in their original order." side="top" className="sc-popover-button-trigger">
          <button
            type="button"
            onClick={queueCurrentGeneration}
            className="sc-action-button sc-action-neutral px-3.5 py-2 rounded-xl font-mono text-[11px]"
            title="Add current prompt to background queue"
          >
            <Plus className="w-3.5 h-3.5 text-blue-300" />
            <span>Queue</span>
          </button>
        </InfoPopover>

      </div>



      {/* Floating Viewport Queue Manager */}

      {isQueueOpen && (

        <div

          className={`absolute top-12 right-3 ${

            isQueueExpanded ? 'w-[560px] max-h-[620px]' : 'w-88 max-h-[460px]'

          } sc-queue-hub bg-[#12141c]/95 border border-[#2d3346] rounded-xl shadow-2xl backdrop-blur-md flex flex-col z-30 overflow-hidden text-xs transition-all duration-150`}

        >

          <div className="flex items-center justify-between px-3 py-2 border-b border-[#252a38] bg-[#161824]">

            <div className="flex items-center gap-2">

              <Layers className="w-4 h-4 text-amber-400" />

              <span className="font-semibold text-gray-200">Queue & Batch Hub</span>

              <span className="px-1.5 py-0.2 bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono rounded-full">

                {totalInQueue}

              </span>

            </div>



            <div className="flex items-center gap-1.5">

              <button

                type="button"

                onClick={() => store.createNewEmptyBatch?.()}

                className="sc-action-button sc-action-info px-2 py-0.5 font-mono text-[10px]"

                title="Create an empty batch container to drag jobs into"

              >

                <Plus className="w-2.5 h-2.5" />

                <span>Empty Batch</span>

              </button>



              <button

                type="button"

                onClick={() => store.startNewBatch?.()}

                className="px-2 py-0.5 rounded bg-[#1e2230] hover:bg-indigo-600 border border-[#2e354a] text-gray-300 hover:text-white font-mono text-[10px] cursor-pointer transition flex items-center gap-1"

              >

                <span>+ New Batch</span>

              </button>



              {queue.length > 0 && !isGenerating && (
                <>
                <InfoPopover content="Starts the jobs already in the queue without adding another copy of the current prompt." side="bottom" className="sc-popover-button-trigger">
                  <button
                    type="button"
                    onClick={() => {
                      if (store.isQueuePaused) store.setIsQueuePaused?.(false);
                      void startQueueProcessing();
                    }}
                    className="sc-action-button sc-action-primary px-2 py-0.5 font-mono text-[10px]"
                    title="Start processing queued jobs without adding the current prompt"
                  >
                    <Play className="w-2.5 h-2.5" />
                    <span>Run Queue</span>
                  </button>
                </InfoPopover>
                </>
              )}

              <button

                type="button"

                onClick={() => store.setIsQueuePaused?.(!store.isQueuePaused)}

                className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border transition cursor-pointer ${

                  store.isQueuePaused

                    ? 'bg-amber-900/50 border-amber-600 text-amber-200'

                    : 'bg-[#1e2230] border-[#2e354a] text-gray-400 hover:text-white'

                }`}

              >

                {store.isQueuePaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}

                <span>{store.isQueuePaused ? 'Paused' : 'Active'}</span>

              </button>



              <button

                type="button"

                onClick={() => setIsQueueExpanded(!isQueueExpanded)}

                className={`p-1 rounded border transition cursor-pointer ${

                  isQueueExpanded

                    ? 'bg-indigo-600 border-indigo-500 text-white'

                    : 'bg-[#1e2230] border-[#2e354a] text-gray-400 hover:text-white'

                }`}

              >

                {isQueueExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}

              </button>



              {queue.length > 0 && (

                <button

                  type="button"

                  onClick={() => store.clearQueue && store.clearQueue()}

                  className="p-1 text-gray-400 hover:text-rose-400 rounded cursor-pointer transition"

                >

                  <Trash2 className="w-3.5 h-3.5" />

                </button>

              )}



              <button

                type="button"

                onClick={() => setIsQueueOpen(false)}

                className="p-1 text-gray-400 hover:text-white rounded cursor-pointer transition"

              >

                ✕

              </button>

            </div>

          </div>



          <div className="flex-1 overflow-y-auto p-2.5 divide-y divide-[#1e2230] space-y-2.5">

            {/* Active Running Task */}

            {(isGenerating || activeJob) && (

              <div className="p-2.5 bg-[#161a29] border border-indigo-500/50 rounded-lg space-y-2 shadow-md">

                <div className="flex items-center justify-between">

                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-indigo-300">

                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />

                    RUNNING ({currentStep || 0} / {activeJob?.steps || maxSteps || 28} steps)

                  </span>

                  <div className="flex items-center gap-1.5">

                    <span className="text-[10px] font-mono font-bold text-cyan-400">{progressPercent || 0}%</span>

                    <button

                      type="button"

                      onClick={cancelGeneration}

                      className="px-2 py-0.5 rounded bg-rose-600/30 hover:bg-rose-600 text-rose-200 text-[10px] font-mono cursor-pointer transition"

                    >

                      Interrupt

                    </button>

                  </div>

                </div>



                <p className={`text-gray-200 font-mono text-[11px] select-text leading-snug ${isQueueExpanded ? 'line-clamp-4' : 'truncate'}`}>

                  {activeJob?.prompt || store.prompt || 'Current Task'}

                </p>



                <div className="w-full bg-[#0d0e14] h-1.5 rounded-full overflow-hidden">

                  <div

                    className="bg-blue-500/70 h-full transition-all duration-100"

                    style={{ width: `${progressPercent || 0}%` }}

                  />

                </div>

              </div>

            )}



            {lastFailedJob && !isGenerating && (

              <div className="rounded-xl bg-rose-950/20 px-3 py-2.5 mb-2 shadow-sm">

                <div className="flex items-center gap-2 text-rose-200 text-[10px] font-mono font-bold"><AlertTriangle className="w-3.5 h-3.5" /> LAST GENERATION FAILED</div>

                <div className="mt-1 text-[10px] text-zinc-400 truncate" title={lastFailedJob.prompt}>{lastFailedJob.prompt}</div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">

                  <button type="button" onClick={() => retryFailedJob(false)} className="sc-action-button sc-action-warning">Retry same seed</button>

                  <button type="button" onClick={() => retryFailedJob(true)} className="sc-action-button sc-action-success">Retry new seed</button>

                  <button type="button" onClick={() => setParams({ prompt: lastFailedJob.prompt, negativePrompt: lastFailedJob.negativePrompt, model: lastFailedJob.model, width: lastFailedJob.width, height: lastFailedJob.height, steps: lastFailedJob.steps, cfgScale: lastFailedJob.cfgScale, seed: lastFailedJob.seed, sampler: lastFailedJob.sampler, scheduler: lastFailedJob.scheduler })} className="sc-action-button sc-action-neutral">Edit</button>

                  <button type="button" onClick={clearFailedJob} className="sc-action-button sc-action-danger">Dismiss</button>

                </div>

              </div>

            )}



            {/* Clustered Batches & Empty Containers */}

            {combinedBatchGroups.length === 0 && (!emptyBatches || emptyBatches.length === 0) ? (

              <div className="py-8 text-center text-gray-500 text-[11px] flex flex-col items-center justify-center gap-1.5">

                <Sparkle className="w-4 h-4 text-gray-600" />

                <span>Queue is empty. Click <b>+ Queue</b> or <b>Empty Batch</b> to organize.</span>

              </div>

            ) : (

              <>

                {combinedBatchGroups.map((group, gIdx) => (

                  <div

                    key={group.batchId}

                    onMouseDown={(e) => e.stopPropagation()}

                    onPointerDown={(e) => e.stopPropagation()}

                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}

                    onDrop={(e) => {

                      e.preventDefault();

                      const jobId = e.dataTransfer.getData('application/x-swarm-queue-job') || e.dataTransfer.getData('text/plain');

                      if (jobId && store.moveJobToBatch) {

                        store.moveJobToBatch(jobId, group.batchId);

                      }

                    }}

                    className="pt-2.5 pb-1 flex flex-col gap-1.5 bg-[#141620]/60 p-2 rounded-lg border border-[#232738]"

                  >

                    <div className="flex items-center justify-between pb-1 border-b border-[#1f2334] text-[10px] font-mono">

                      <div className="flex items-center gap-1.5 text-amber-200 font-bold">

                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />

                        <span>Batch #{gIdx + 1} ({group.items.length} items)</span>

                      </div>



                      <div className="flex items-center gap-1">

                        <button

                          type="button"

                          onClick={() => store.addVariationToBatch?.(group.batchId)}

                          className="px-1.5 py-0.2 rounded bg-[#1e2232] hover:bg-indigo-600 text-indigo-200 hover:text-white border border-[#2b3145] transition cursor-pointer flex items-center gap-0.5"

                        >

                          <Plus className="w-2.5 h-2.5" />

                          <span>+ Add Gen</span>

                        </button>

                        <button

                          type="button"

                          onClick={() => store.removeBatchFromQueue?.(group.batchId)}

                          className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer"

                        >

                          <Trash2 className="w-3 h-3" />

                        </button>

                      </div>

                    </div>



                    <div className="space-y-1.5 pt-1">

                      {group.items.map((item: any, itemIdx: number) => {

                        const globalIndex = queue.findIndex((q: any) => q.id === item.id);



                        return (

                          <div

                            key={item.id || itemIdx}

                            onMouseDown={(e) => e.stopPropagation()}

                            onPointerDown={(e) => e.stopPropagation()}

                            onContextMenu={(e) => {

                              if (item.isRunning) return;

                              e.preventDefault();
                              e.stopPropagation();

                              setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Queue Job', items: [

                                { label: 'Edit generation parameters', icon: <Sliders className="w-3.5 h-3.5" />, action: () => setParams({ prompt: item.prompt, negativePrompt: item.negativePrompt, model: item.model, width: item.width, height: item.height, steps: item.steps, cfgScale: item.cfgScale, seed: item.seed, sampler: item.sampler, scheduler: item.scheduler }) },

                                { label: 'Duplicate job', icon: <Copy className="w-3.5 h-3.5" />, action: () => store.duplicateQueuedItem(item.id) },

                                { label: 'Generate variation with new seed', icon: <Dices className="w-3.5 h-3.5" />, action: () => setParams({ prompt: item.prompt, negativePrompt: item.negativePrompt, model: item.model, width: item.width, height: item.height, steps: item.steps, cfgScale: item.cfgScale, seed: Math.floor(Math.random() * 2147483647), sampler: item.sampler, scheduler: item.scheduler }) },

                                { separator: true, label: 'Remove job', icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />, action: () => store.cancelQueuedJob(item.id) },

                              ]});

                            }}

                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (item.isRunning) return;
                              e.dataTransfer.dropEffect = 'move';
                            }}

                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (item.isRunning) return;
                              const draggedId = e.dataTransfer.getData('application/x-swarm-queue-job') || e.dataTransfer.getData('text/plain');
                              if (!draggedId || draggedId === item.id) return;
                              const fromIndex = queue.findIndex((q: any) => q.id === draggedId);
                              const targetIndex = queue.findIndex((q: any) => q.id === item.id);
                              if (fromIndex >= 0 && targetIndex >= 0 && fromIndex !== targetIndex) {
                                store.reorderQueue(fromIndex, targetIndex);
                              }
                            }}

                            className={`sc-queue-timeline-item group flex items-start justify-between gap-2 p-1.5 rounded transition ${

                              item.isRunning ? 'bg-emerald-950/20' : 'hover:bg-white/[0.035]'

                            }`}

                          >

                            <div className="flex items-start gap-2 min-w-0 flex-1">

                              {!item.isRunning && (
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('application/x-swarm-queue-job', item.id);
                                    e.dataTransfer.setData('text/plain', item.id);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  className="sc-queue-drag-handle mt-0.5 shrink-0 p-0.5 rounded text-gray-500 hover:text-amber-300 cursor-grab active:cursor-grabbing"
                                  title="Drag to reorder this job"
                                  aria-label="Drag to reorder queue job"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                              )}

                              <span className={`sc-queue-node ${item.isRunning ? 'sc-queue-node-running' : ''}`}>

                                {item.isRunning ? '●' : `#${globalIndex !== -1 ? globalIndex + 1 : itemIdx + 1}`}

                              </span>

                              <div className="flex flex-col min-w-0 flex-1 gap-0.5">

                                <span className={`text-left text-gray-300 font-mono text-[11px] ${isQueueExpanded ? 'line-clamp-2' : 'truncate'}`}>

                                  {item.prompt}

                                </span>

                              </div>

                            </div>

                            {!item.isRunning && (

                              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition pt-0.5">

                                <button

                                  type="button"

                                  onMouseDown={(e) => e.stopPropagation()}

                                  onPointerDown={(e) => e.stopPropagation()}

                                  onClick={(e) => { e.stopPropagation(); store.duplicateQueuedItem(item.id); }}

                                  className="px-1 py-0.5 hover:bg-[#202434] text-gray-400 hover:text-amber-200 rounded cursor-pointer text-[10px]"

                                  title="Duplicate queued job"

                                >

                                  <Copy className="w-2.5 h-2.5" />

                                </button>

                                <button

                                  type="button"

                                  onMouseDown={(e) => e.stopPropagation()}

                                  onPointerDown={(e) => e.stopPropagation()}

                                  onClick={(e) => { e.stopPropagation(); store.cancelQueuedJob(item.id); }}

                                  className="p-1 text-gray-500 hover:text-rose-400 cursor-pointer transition"

                                  title="Remove queued job"

                                >

                                  <Trash2 className="w-3 h-3" />

                                </button>

                              </div>

                            )}

                          </div>

                        );

                      })}

                    </div>

                  </div>

                ))}



                {/* Empty Batch Drop Containers */}

                {emptyBatches.map((emptyId: string, eIdx: number) => (

                  <div

                    key={emptyId}

                    onDragOver={(e) => e.preventDefault()}

                    onDrop={(e) => {

                      e.preventDefault();

                      const jobId = e.dataTransfer.getData('text/plain');

                      if (jobId && store.moveJobToBatch) {

                        store.moveJobToBatch(jobId, emptyId);

                      }

                    }}

                    className="border border-dashed border-indigo-500/40 bg-indigo-950/10 p-3 rounded-lg text-center flex flex-col items-center justify-center gap-1.5"

                  >

                    <span className="font-mono text-[10px] text-indigo-300">Empty Batch Box #{eIdx + 1} (Drop jobs here)</span>

                    <button

                      type="button"

                      onClick={() => store.removeBatchFromQueue?.(emptyId)}

                      className="text-[10px] font-mono text-rose-400 hover:underline cursor-pointer"

                    >

                      Remove Box

                    </button>

                  </div>

                ))}

              </>

            )}

          </div>

        </div>

      )}



      {/* Analytics Progress Bar */}

      {(isGenerating || metrics.totalTime > 0) && !settings.hideProgressBar && (

        <div className="absolute bottom-20 left-4 right-4 bg-[#121418]/95 border border-[#2b2f3a] p-3 rounded-lg shadow-2xl backdrop-blur-md z-20">

          <div className="flex flex-wrap items-center justify-between text-xs text-gray-300 mb-2 gap-2">

            <div className="flex items-center gap-2 font-mono">

              <span className="bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded text-[11px] font-semibold border border-indigo-500/30">

                {metrics.stage}

              </span>

              <span>{currentStep} / {maxSteps} steps ({progressPercent}%)</span>

            </div>



            <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">

              {metrics.speed !== null && (

                <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-amber-400" /> {metrics.speed} it/s</span>

              )}

              {metrics.eta !== null && isGenerating && (

                <span className="flex items-center gap-1 text-indigo-400 font-semibold"><Clock className="w-3.5 h-3.5" /> ETA: ~{metrics.eta}s</span>

              )}

              <span className="flex items-center gap-1 text-gray-200 font-medium">Total: {metrics.totalTime}s</span>

            </div>

          </div>

          <div className="w-full bg-[#1a1d24] h-2 rounded-full overflow-hidden border border-neutral-800">

            <div className="bg-blue-500/70 h-full transition-all duration-100 ease-out" style={{ width: `${progressPercent}%` }} />

          </div>

        </div>

      )}

    </div>

  );

};



/* =========================================================================

   2. PROMPT & PROMPT-FLOW PIPELINE PANEL

   ========================================================================= */

const PromptPillsPanel: React.FC<IDockviewPanelProps> = () => {

  const {
    prompt, negativePrompt, setPrompt, setNegativePrompt, activeMacroCategory, activeSubCategory, pillSearchQuery,
    setActiveMacroCategory, setActiveSubCategory, setPillSearchQuery, settings, updateSettings, setActiveContextMenu,
    isGenerating, promptPresets, savePromptPreset, deletePromptPreset
  } = useAppStore(useShallow((s) => ({
    prompt: s.prompt, negativePrompt: s.negativePrompt, setPrompt: s.setPrompt, setNegativePrompt: s.setNegativePrompt,
    activeMacroCategory: s.activeMacroCategory, activeSubCategory: s.activeSubCategory, pillSearchQuery: s.pillSearchQuery,
    setActiveMacroCategory: s.setActiveMacroCategory, setActiveSubCategory: s.setActiveSubCategory, setPillSearchQuery: s.setPillSearchQuery,
    settings: s.settings, updateSettings: s.updateSettings, setActiveContextMenu: s.setActiveContextMenu, isGenerating: s.isGenerating,
    promptPresets: s.promptPresets || [], savePromptPreset: s.savePromptPreset, deletePromptPreset: s.deletePromptPreset,
  })));



  const [activeTarget, setActiveTarget] = useState<'positive' | 'negative'>('positive');

  const [currentTags, setCurrentTags] = useState<string[]>([]);

  const [tagDisplayLimit, setTagDisplayLimit] = useState(300);

  const [hoverDetail, setHoverDetail] = useState<TagDetail | null>(null);

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; placeAbove: boolean } | null>(null);

  const [lockedStages, setLockedStages] = useState<Record<string, boolean>>({});



  const [positiveViewMode, setPositiveViewMode] = useState<'pills' | 'text'>('pills');

  const [negativeViewMode, setNegativeViewMode] = useState<'pills' | 'text'>('pills');



  // Prompt Presets Modal State

  const [presetModalTarget, setPresetModalTarget] = useState<'positive' | 'negative' | null>(null);

  const [presetSearch, setPresetSearch] = useState('');

  const [newPresetName, setNewPresetName] = useState('');

  const [previewPreset, setPreviewPreset] = useState<any | null>(null);


  const [scrollWeightEnabled, setScrollWeightEnabled] = useState(true);



  type PromptSlot = { id: string; name: string; positive: string; negative: string; savedAt: number };

  type PromptHistoryEntry = { id: string; positive: string; negative: string; createdAt: number };

  const loadPromptSlots = (): PromptSlot[] => {

    try {

      const parsed = JSON.parse(localStorage.getItem('swarm_prompt_slots_v1') || 'null');

      if (Array.isArray(parsed)) return parsed;

    } catch {}

    return Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: String.fromCharCode(65 + i), positive: '', negative: '', savedAt: 0 }));

  };

  const loadPromptHistory = (): PromptHistoryEntry[] => {

    try {

      const parsed = JSON.parse(localStorage.getItem('swarm_prompt_history_v1') || '[]');

      return Array.isArray(parsed) ? parsed.slice(0, 40) : [];

    } catch { return []; }

  };

  const [promptSlots, setPromptSlots] = useState<PromptSlot[]>(loadPromptSlots);

  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>(loadPromptHistory);

  const [promptToolsOpen, setPromptToolsOpen] = useState<'slots' | 'history' | 'cleanup' | 'diff' | null>(null);

  const [selectedPromptHistoryId, setSelectedPromptHistoryId] = useState<string | null>(null);

  const [cleanupOptions, setCleanupOptions] = useState({ removeDuplicates: true, normalizeSeparators: true, normalizeUnderscores: false, removeEmpty: true, sortTags: false, preserveWeights: true });

  const previousGeneratingRef = useRef(false);



  useEffect(() => {

    try { localStorage.setItem('swarm_prompt_slots_v1', JSON.stringify(promptSlots)); } catch {}

  }, [promptSlots]);



  useEffect(() => {

    try { localStorage.setItem('swarm_prompt_history_v1', JSON.stringify(promptHistory.slice(0, 40))); } catch {}

  }, [promptHistory]);



  useEffect(() => {

    if (isGenerating && !previousGeneratingRef.current) {

      const entry: PromptHistoryEntry = { id: `ph-${Date.now()}`, positive: prompt, negative: negativePrompt, createdAt: Date.now() };

      setPromptHistory((prev) => [entry, ...prev.filter((x) => x.positive !== entry.positive || x.negative !== entry.negative)].slice(0, 40));

    }

    previousGeneratingRef.current = isGenerating;

  }, [isGenerating, prompt, negativePrompt]);



  const savePromptSlot = (slotId: string) => {

    setPromptSlots((prev) => prev.map((slot) => slot.id === slotId ? { ...slot, positive: prompt, negative: negativePrompt, savedAt: Date.now() } : slot));

    emitToast(`Saved prompt slot ${slotId}`, 'success');

  };



  const loadPromptSlot = (slot: PromptSlot) => {

    setPrompt(slot.positive);

    setNegativePrompt(slot.negative);

    setPromptToolsOpen(null);

    emitToast(`Loaded prompt slot ${slot.id}`, 'info');

  };



  const applyPromptHistory = (entry: PromptHistoryEntry) => {

    setPrompt(entry.positive);

    setNegativePrompt(entry.negative);

    setPromptToolsOpen(null);

  };



  const promptTokensForDiff = (text: string) => new Set(text.split(/[\n,]+/).map((t) => t.trim().toLowerCase()).filter(Boolean));



  // Undo / Redo history stacks

  const historyStacks = useRef<{

    positive: { past: string[]; future: string[] };

    negative: { past: string[]; future: string[] };

  }>({

    positive: { past: [], future: [] },

    negative: { past: [], future: [] }

  });



  const handleUndo = (target: 'positive' | 'negative') => {

    const stack = historyStacks.current[target];

    if (stack.past.length === 0) return;

    const currentVal = target === 'positive' ? prompt : negativePrompt;

    const previousVal = stack.past.pop()!;

    stack.future.push(currentVal);

    if (target === 'positive') setPrompt(previousVal);

    else setNegativePrompt(previousVal);

  };



  const handleRedo = (target: 'positive' | 'negative') => {

    const stack = historyStacks.current[target];

    if (stack.future.length === 0) return;

    const currentVal = target === 'positive' ? prompt : negativePrompt;

    const nextVal = stack.future.pop()!;

    stack.past.push(currentVal);

    if (target === 'positive') setPrompt(nextVal);

    else setNegativePrompt(nextVal);

  };



  // 3-way layout switch: 'split' = default (both), 'tags_only' = only tags, 'prompts_only' = only prompts

  const [panelLayoutMode, setPanelLayoutMode] = useState<'split' | 'tags_only' | 'prompts_only'>('split');



  const [promptBoxHeight, setPromptBoxHeight] = useState(settings.bottomPanelHeight ? Math.max(120, settings.bottomPanelHeight - 160) : 180);

  const [positiveWidthPercent, setPositiveWidthPercent] = useState(65);

  const promptContainerRef = useRef<HTMLDivElement>(null);



  const positiveInputRef = useRef<HTMLInputElement>(null);

  const negativeInputRef = useRef<HTMLInputElement>(null);



  const [isTagBrowserCollapsed, setIsTagBrowserCollapsed] = useState(false);

  const [editingIndex, setEditingIndex] = useState<{ target: 'positive' | 'negative'; index: number } | null>(null);

  const [editingText, setEditingText] = useState('');

  const [draggedPill, setDraggedPill] = useState<{ target: 'positive' | 'negative'; index: number } | null>(null);

  const [newTagInput, setNewTagInput] = useState<{ positive: string; negative: string }>({ positive: '', negative: '' });



  const [selectedTokens, setSelectedTokens] = useState<{ positive: Set<number>; negative: Set<number> }>({

    positive: new Set(),

    negative: new Set()

  });

  const [isSelecting, setIsSelecting] = useState(false);

  const selectionAnchorRef = useRef<number | null>(null);



  // Custom ref callback with listener cleanup and performance telemetry

  const bindPillWheelLock = (onWheelFn: (e: WheelEvent) => void) => (node: HTMLElement | null) => {

    if (!node) return;

    if ((node as any).__pillWheelHandler) {

      node.removeEventListener('wheel', (node as any).__pillWheelHandler);

    }

    const listener = (e: WheelEvent) => {

      e.preventDefault();

      e.stopPropagation();

      if ((window as any).__swarm_perf) {

        (window as any).__swarm_perf.mark('PromptPills:WheelWeight', () => onWheelFn(e));

      } else {

        onWheelFn(e);

      }

    };

    (node as any).__pillWheelHandler = listener;

    node.addEventListener('wheel', listener, { passive: false });

  };



  useEffect(() => {

    const handleGlobalMouseUp = () => {

      setIsSelecting(false);

      selectionAnchorRef.current = null;

    };

    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);

  }, []);



  // In-between / before-tag active insertion cursor state

  const [activeInsertion, setActiveInsertion] = useState<{ target: 'positive' | 'negative'; index: number } | null>(null);

  const [insertTagInput, setInsertTagInput] = useState('');



  const pillClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const handleVerticalResizeStart = (e: React.MouseEvent) => {

    e.preventDefault();

    e.stopPropagation();

    const startY = e.clientY;

    const startBoxHeight = promptBoxHeight;

    const currentTrayHeight = useAppStore.getState().settings.bottomPanelHeight || 340;



    document.body.style.cursor = 'row-resize';

    document.body.style.userSelect = 'none';



    let frame = 0;
    let latestEvent: MouseEvent | null = null;
    const applyResize = () => {
      frame = 0;
      if (!latestEvent) return;
      const moveEvent = latestEvent;
      latestEvent = null;
      const deltaY = moveEvent.clientY - startY;
      const nextBoxHeight = Math.max(80, Math.min(window.innerHeight - 200, startBoxHeight + deltaY));
      setPromptBoxHeight(nextBoxHeight);

      if (nextBoxHeight + 160 > currentTrayHeight) {
        const nextTrayHeight = Math.min(window.innerHeight - 150, nextBoxHeight + 160);
        updateSettings({ bottomPanelHeight: nextTrayHeight });
      }
    };
    const onMouseMove = (moveEvent: MouseEvent) => {
      latestEvent = moveEvent;
      if (!frame) frame = requestAnimationFrame(applyResize);
    };



    const onMouseUp = () => {

      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latestEvent = null;
      document.body.style.cursor = '';

      document.body.style.userSelect = '';

      window.removeEventListener('mousemove', onMouseMove);

      window.removeEventListener('mouseup', onMouseUp);

    };



    window.addEventListener('mousemove', onMouseMove);

    window.addEventListener('mouseup', onMouseUp);

  };



  const handleHorizontalSplitStart = (e: React.MouseEvent) => {

    e.preventDefault();

    e.stopPropagation();

    if (!promptContainerRef.current) return;

    const rect = promptContainerRef.current.getBoundingClientRect();



    document.body.style.cursor = 'col-resize';

    document.body.style.userSelect = 'none';



    let frame = 0;
    let latestEvent: MouseEvent | null = null;
    const applyResize = () => {
      frame = 0;
      if (!latestEvent) return;
      const moveEvent = latestEvent;
      latestEvent = null;
      const relativeX = moveEvent.clientX - rect.left;
      const pct = Math.max(15, Math.min(85, (relativeX / rect.width) * 100));
      setPositiveWidthPercent(pct);
    };
    const onMouseMove = (moveEvent: MouseEvent) => {
      latestEvent = moveEvent;
      if (!frame) frame = requestAnimationFrame(applyResize);
    };



    const onMouseUp = () => {

      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latestEvent = null;
      document.body.style.cursor = '';

      document.body.style.userSelect = '';

      window.removeEventListener('mousemove', onMouseMove);

      window.removeEventListener('mouseup', onMouseUp);

    };



    window.addEventListener('mousemove', onMouseMove);

    window.addEventListener('mouseup', onMouseUp);

  };



  const [tagLoadTick, setTagLoadTick] = useState(0);



  useEffect(() => {

    const unsub = danbooru.onLoaded ? danbooru.onLoaded(() => {

      setTagLoadTick((t) => t + 1);

    }) : () => {};



    if (danbooru.getParentCategories().length > 0) {

      setTagLoadTick((t) => t + 1);

    }

    return () => unsub();

  }, []);



  const parentScrollRef = useRef<HTMLDivElement>(null);

  const subScrollRef = useRef<HTMLDivElement>(null);



  const parentCategories = danbooru.getParentCategories();

  const subCategories = danbooru.getSubCategories(activeMacroCategory);



  useEffect(() => {

    if (parentCategories.length > 0 && !parentCategories.includes(activeMacroCategory)) {

      setActiveMacroCategory(parentCategories[0]);

      setActiveSubCategory('All');

    }

  }, [parentCategories, activeMacroCategory, setActiveMacroCategory, setActiveSubCategory]);



  const [hasMoreTags, setHasMoreTags] = useState(false);



  useEffect(() => {

    setTagDisplayLimit(300);

  }, [activeMacroCategory, activeSubCategory, pillSearchQuery]);



  useEffect(() => {

    let active = true;

    // Request 1 extra item to accurately check if more matching tags exist

    danbooru.getTags(activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit + 1).then((tags: string[]) => {

      if (!active) return;

      const list = tags || [];

      if (list.length > tagDisplayLimit) {

        setHasMoreTags(true);

        setCurrentTags(list.slice(0, tagDisplayLimit));

      } else {

        setHasMoreTags(false);

        setCurrentTags(list);

      }

    });

    return () => {

      active = false;

    };

  }, [activeMacroCategory, activeSubCategory, pillSearchQuery, tagDisplayLimit, tagLoadTick, settings.categorizationMode, settings.tagSortOrder]);



  const getPromptTokens = (target: 'positive' | 'negative'): string[] => {

    const text = target === 'positive' ? prompt : negativePrompt;

    if (!text) return [];



    const result: string[] = [];

    const lines = text.split('\n');



    lines.forEach((line, lineIdx) => {

      const lineTokens = line

        .split(',')

        .map((t) => t.trim())

        .filter(Boolean);



      result.push(...lineTokens);

      if (lineIdx < lines.length - 1) {

        result.push('\n');

      }

    });



    return result;

  };



  const setPromptTokens = (target: 'positive' | 'negative', tokens: string[]) => {

    let text = '';

    for (let i = 0; i < tokens.length; i++) {

      const tok = tokens[i];

      if (tok === '\n') {

        text = text.replace(/, $/, '') + '\n';

      } else {

        text += tok;

        if (i < tokens.length - 1 && tokens[i + 1] !== '\n') {

          text += ', ';

        }

      }

    }



    const currentVal = target === 'positive' ? prompt : negativePrompt;

    if (currentVal !== text) {

      const stack = historyStacks.current[target];

      stack.past.push(currentVal);

      if (stack.past.length > 50) stack.past.shift();

      stack.future = [];

    }



    if (target === 'positive') setPrompt(text);

    else setNegativePrompt(text);

  };



  const appendTag = (tag: string, target = activeTarget, weight = 1.0) => {

    const clean = tag === '\n' ? '\n' : (settings.useUnderscores ? tag.toLowerCase().replace(/\s+/g, '_') : tag.replace(/_/g, ' '));

    const token = (tag === '\n' || weight === 1.0) ? clean : `(${clean}:${weight.toFixed(2)})`;



    // 1. If an explicit in-between caret cursor is active, insert right at that position

    if (activeInsertion && activeInsertion.target === target) {

      const tokens = getPromptTokens(target);

      tokens.splice(activeInsertion.index, 0, token);

      setPromptTokens(target, tokens);

      // Advance insertion cursor after the inserted tag so sequential clicks chain correctly

      setActiveInsertion({ target, index: activeInsertion.index + 1 });

      setInsertTagInput('');

      return;

    }



    // 2. If raw textarea is active in text mode and has a cursor selection

    const activeEl = document.activeElement as HTMLTextAreaElement | null;

    if (activeEl && activeEl.tagName === 'TEXTAREA' && (activeEl.value === prompt || activeEl.value === negativePrompt)) {

      const currentVal = target === 'positive' ? prompt : negativePrompt;

      const start = activeEl.selectionStart ?? currentVal.length;

      const end = activeEl.selectionEnd ?? currentVal.length;

      const insertStr = token === '\n' ? '\n' : (start > 0 && !currentVal.slice(0, start).endsWith('\n') && !currentVal.slice(0, start).endsWith(' ') ? `, ${token}` : token);

      const updated = currentVal.slice(0, start) + insertStr + currentVal.slice(end);

      if (target === 'positive') setPrompt(updated);

      else setNegativePrompt(updated);

      return;

    }



    // 3. Default fallback: append to prompt end

    if (tag === '\n') {

      const current = target === 'positive' ? prompt : negativePrompt;

      const updated = current ? `${current.replace(/, $/, '')}\n` : '\n';

      if (target === 'positive') setPrompt(updated);

      else setNegativePrompt(updated);

      return;

    }



    const current = (target === 'positive' ? prompt : negativePrompt).trim();

    const setter = target === 'positive' ? setPrompt : setNegativePrompt;



    if (!current) {

      setter(token);

    } else if (current.endsWith('\n')) {

      setter(`${current}${token}`);

    } else {

      setter(`${current}, ${token}`);

    }

  };



  const insertOperator = (op: string) => {

    const target = activeTarget;

    if (activeInsertion && activeInsertion.target === target) {

      const tokens = getPromptTokens(target);

      tokens.splice(activeInsertion.index, 0, op);

      setPromptTokens(target, tokens);

      setActiveInsertion(null);

      setInsertTagInput('');

      return;

    }



    const targetVal = target === 'positive' ? prompt : negativePrompt;

    const setter = target === 'positive' ? setPrompt : setNegativePrompt;

    const trimmed = targetVal.trim();



    if (op === '\n') {

      setter(trimmed ? `${trimmed.replace(/, $/, '')}\n` : '\n');

      return;

    }



    if (!trimmed) {

      setter(op.trim());

      return;

    }



    if (op === ',') {

      setter(trimmed.endsWith(',') ? trimmed : `${trimmed}, `);

    } else if (op === 'AND' || op === 'BREAK') {

      setter(`${trimmed} ${op} `);

    } else if (op === '()') {

      setter(`${trimmed}, ()`);

    } else if (op === 'LORA') {

      setter(`${trimmed}, <lora:filename:1.0>`);

    }

  };



  const removeTokenFromPrompt = (tokenToRemove: string) => {

    const tokens = getPromptTokens('positive');

    const filtered = tokens.filter(

      (t) => t === '\n' || !t.toLowerCase().includes(tokenToRemove.toLowerCase().replace(/_/g, ' '))

    );

    setPromptTokens('positive', filtered);

  };



  const detectedConflicts = useMemo(() => {

    let found: { message: string; tagA: string; tagB: string }[] = [];

    const measure = () => {

      const lowerPrompt = prompt.toLowerCase();

      CONFLICT_LINTER_RULES.forEach((rule) => {

        const matchedA = rule.setA.find((a) => lowerPrompt.includes(a.replace(/_/g, ' ')));

        const matchedB = rule.setB.find((b) => lowerPrompt.includes(b.replace(/_/g, ' ')));



        if (matchedA && matchedB) {

          found.push({ message: rule.message, tagA: matchedA, tagB: matchedB });

        }

      });

    };



    if ((window as any).__swarm_perf) {

      (window as any).__swarm_perf.mark('PromptPills:ConflictLinter', measure);

    } else {

      measure();

    }



    return found;

  }, [prompt]);



  const suggestedNextTags = useMemo(() => {

    const lowerPrompt = prompt.toLowerCase();

    const suggestions = new Set<string>();



    CO_OCCURRENCE_RULES.forEach((rule) => {

      if (rule.triggers.some((tr) => lowerPrompt.includes(tr))) {

        rule.suggestions.forEach((sg) => {

          if (!lowerPrompt.includes(sg.replace(/_/g, ' '))) {

            suggestions.add(sg);

          }

        });

      }

    });



    return Array.from(suggestions).slice(0, 8);

  }, [prompt]);



  const handleRollStageRandomTags = async (stage: string) => {

    if (lockedStages[stage]) return;

    const picked = await danbooru.getRandomTags(stage, 2);

    if (picked && picked.length > 0) {

      picked.forEach((t: string) => appendTag(t, 'positive', 1.0));

    }

  };



  const handleApplyStageWeight = (_stage: string, weightMult: number) => {

    const tokens = getPromptTokens('positive');

    const updated = tokens.map((token: string) => {

      if (token === '\n' || token === 'BREAK') return token;

      const clean = token.replace(/[\(\):0-9.]/g, '').trim();

      return `(${clean}:${weightMult.toFixed(2)})`;

    });

    setPromptTokens('positive', updated);

  };



  const toggleLockStage = (stage: string) => {

    setLockedStages((prev) => ({ ...prev, [stage]: !prev[stage] }));

  };



  const submitPromptboxEdit = (target: 'positive' | 'negative', index: number) => {

    const tokens = getPromptTokens(target);

    if (editingText.trim()) {

      tokens[index] = editingText.trim();

    } else {

      tokens.splice(index, 1);

    }

    setPromptTokens(target, tokens);

    setEditingIndex(null);

  };



  const handlePromptboxPillContextMenu = (target: 'positive' | 'negative', index: number, tokenText: string, e: React.MouseEvent) => {

    e.preventDefault();

    e.stopPropagation();



    const tokens = [...getPromptTokens(target)];

    const isMulti = selectedTokens[target].has(index) && selectedTokens[target].size > 1;



    if (isMulti) {

      const indices = Array.from(selectedTokens[target]).sort((a, b) => a - b);

      const stepIncrement = settings.tagClickWeightStep ?? 0.2;



      setActiveContextMenu({

        x: e.clientX,

        y: e.clientY,

        title: `Selection (${indices.length} tags)`,

        items: [

          {

            label: `Increase Weight All (+${stepIncrement.toFixed(2)})`,

            icon: <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />,

            action: () => {

              indices.forEach((i) => {

                const tok = tokens[i];

                if (tok === '\n' || tok === 'BREAK') return;

                const match = tok.match(/^\((.*):([0-9.]+)\)$/);

                tokens[i] = match

                  ? `(${match[1]}:${(parseFloat(match[2]) + stepIncrement).toFixed(2)})`

                  : `(${tok}:${(1.0 + stepIncrement).toFixed(2)})`;

              });

              setPromptTokens(target, tokens);

            }

          },

          {

            label: `Decrease Weight All (-${stepIncrement.toFixed(2)})`,

            icon: <ChevronDown className="w-3.5 h-3.5 text-amber-400" />,

            action: () => {

              indices.forEach((i) => {

                const tok = tokens[i];

                if (tok === '\n' || tok === 'BREAK') return;

                const match = tok.match(/^\((.*):([0-9.]+)\)$/);

                tokens[i] = match

                  ? `(${match[1]}:${Math.max(0.1, parseFloat(match[2]) - stepIncrement).toFixed(2)})`

                  : `(${tok}:${Math.max(0.1, 1.0 - stepIncrement).toFixed(2)})`;

              });

              setPromptTokens(target, tokens);

            }

          },

          {

            label: target === 'positive' ? 'Send Selected to Negative' : 'Send Selected to Positive',

            icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,

            action: () => {

              const moving = indices.map((i) => tokens[i]).filter((t) => t !== '\n' && t !== 'BREAK');

              const remaining = tokens.filter((_, i) => !selectedTokens[target].has(i));

              setPromptTokens(target, remaining);

              if (target === 'positive') {

                setNegativePrompt(negativePrompt.trim() ? `${negativePrompt.trim()}, ${moving.join(', ')}` : moving.join(', '));

              } else {

                setPrompt(prompt.trim() ? `${prompt.trim()}, ${moving.join(', ')}` : moving.join(', '));

              }

              setSelectedTokens({ ...selectedTokens, [target]: new Set() });

            }

          },

          {

            separator: true,

            label: `Delete Selected (${indices.length})`,

            danger: true,

            icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,

            action: () => {

              const remaining = tokens.filter((_, i) => !selectedTokens[target].has(i));

              setPromptTokens(target, remaining);

              setSelectedTokens({ ...selectedTokens, [target]: new Set() });

            }

          }

        ]

      });

      return;

    }



    if (tokenText === '\n' || tokenText === 'BREAK') {

      setActiveContextMenu({

        x: e.clientX,

        y: e.clientY,

        title: tokenText === '\n' ? 'Line Break' : 'BREAK Section',

        items: [

          {

            label: 'Remove Break',

            icon: <Trash2 className="w-3.5 h-3.5" />,

            danger: true,

            action: () => {

              tokens.splice(index, 1);

              setPromptTokens(target, tokens);

            }

          }

        ]

      });

      return;

    }



    const isMuted = tokenText.startsWith('/*') && tokenText.endsWith('*/');

    const clean = tokenText.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();

    const stepIncrement = settings.tagClickWeightStep ?? 0.2;



    const items: ContextMenuItem[] = [

      {

        label: 'Insert Line Break Before',

        action: () => {

          tokens.splice(index, 0, '\n');

          setPromptTokens(target, tokens);

        }

      },

      {

        label: 'Insert Line Break After',

        action: () => {

          tokens.splice(index + 1, 0, '\n');

          setPromptTokens(target, tokens);

        }

      },

      {

        separator: true,

        label: isMuted ? `Enable '${clean}'` : `Disable / Comment out '${clean}'`,

        action: () => {

          tokens[index] = isMuted ? clean : `/* ${clean} */`;

          setPromptTokens(target, tokens);

        }

      },

      {

        label: `Increase Weight (+${stepIncrement.toFixed(2)})`,

        action: () => {

          const match = clean.match(/^\((.*):([0-9.]+)\)$/);

          if (match) {

            tokens[index] = `(${match[1]}:${(parseFloat(match[2]) + stepIncrement).toFixed(2)})`;

          } else {

            tokens[index] = `(${clean}:${(1.0 + stepIncrement).toFixed(2)})`;

          }

          setPromptTokens(target, tokens);

        }

      },

      {

        label: `Decrease Weight (-${stepIncrement.toFixed(2)})`,

        action: () => {

          const match = clean.match(/^\((.*):([0-9.]+)\)$/);

          if (match) {

            tokens[index] = `(${match[1]}:${Math.max(0.1, parseFloat(match[2]) - stepIncrement).toFixed(2)})`;

          } else {

            tokens[index] = `(${clean}:${Math.max(0.1, 1.0 - stepIncrement).toFixed(2)})`;

          }

          setPromptTokens(target, tokens);

        }

      },

      {

        label: target === 'positive' ? 'Move to Negative' : 'Move to Positive',

        action: () => {

          tokens.splice(index, 1);

          setPromptTokens(target, tokens);

          if (target === 'positive') {

            setNegativePrompt(negativePrompt.trim() ? `${negativePrompt.trim()}, ${clean}` : clean);

          } else {

            setPrompt(prompt.trim() ? `${prompt.trim()}, ${clean}` : clean);

          }

        }

      },

      {

        separator: true,

        label: `Delete Token`,

        danger: true,

        icon: <Trash2 className="w-3.5 h-3.5" />,

        action: () => {

          tokens.splice(index, 1);

          setPromptTokens(target, tokens);

        }

      }

    ];



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `Pill: ${clean}`, items });

  };



  const handleBrowserPillClick = (tag: string, e: React.MouseEvent) => {

    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    setHoverDetail(null);



    if (e.shiftKey) {

      appendTag(tag, activeTarget, 1.0 + settings.tagClickWeightStep);

    } else {

      appendTag(tag, activeTarget, 1.0);

    }

  };



  const handleTagMouseEnter = (e: React.MouseEvent, tag: string) => {

    const rect = e.currentTarget.getBoundingClientRect();

    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);



    hoverTimeoutRef.current = setTimeout(async () => {

      const placeAbove = rect.bottom + 180 > window.innerHeight;

      const calculatedY = placeAbove ? Math.max(10, rect.top - 190) : rect.bottom + 8;



      setTooltipPos({

        x: Math.min(rect.left, window.innerWidth - 300),

        y: calculatedY,

        placeAbove

      });

      const detail = await danbooru.getTagDetail(tag, activeMacroCategory, activeSubCategory);

      setHoverDetail(detail);

    }, 250);

  };



  const handleTagMouseLeave = () => {

    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    setHoverDetail(null);

  };



  const handleTagRightClick = (e: React.MouseEvent, tag: string) => {

    e.preventDefault();

    e.stopPropagation();



    const clean = settings.useUnderscores ? tag.replace(/\s+/g, '_') : tag.replace(/_/g, ' ');



    const items: ContextMenuItem[] = [

      {

        label: `Append to Positive (+1.0)`,

        icon: <Plus className="w-3.5 h-3.5 text-indigo-400" />,

        action: () => appendTag(tag, 'positive', 1.0)

      },

      {

        label: `Append with High Emphasis (+${(1.0 + settings.tagClickWeightStep).toFixed(2)}x)`,

        icon: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />,

        action: () => appendTag(tag, 'positive', 1.0 + settings.tagClickWeightStep)

      },

      {

        label: `Send to Negative Prompt`,

        icon: <ChevronRight className="w-3.5 h-3.5 text-rose-400" />,

        action: () => appendTag(tag, 'negative', 1.0)

      },

      {

        label: `Copy Raw Tag Name`,

        icon: <Copy className="w-3.5 h-3.5" />,

        action: () => navigator.clipboard.writeText(clean)

      }

    ];



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `Tag: ${clean}`, items });

  };



  const handleWheelHorizontal = (ref: React.RefObject<HTMLDivElement | null>, e: React.WheelEvent) => {

    if (ref.current) ref.current.scrollLeft += e.deltaY;

  };



  const formatCount = (n: number | null) => {

    if (!n) return null;

    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;

    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;

    return n.toString();

  };



  const totalCategoryCount = danbooru.getSubCount(activeMacroCategory, activeSubCategory);



  // Group tokens into lines so clicking empty space on any line places the cursor on that line

  const parseTokenLines = (tokens: string[]) => {

    const lines: Array<{

      lineIndex: number;

      items: Array<{ globalIndex: number; text: string }>;

      breakIndexAfter: number | null;

      lineEndIndex: number;

    }> = [];



    let currentItems: Array<{ globalIndex: number; text: string }> = [];

    let currentLineIdx = 0;



    for (let i = 0; i < tokens.length; i++) {

      const tok = tokens[i];

      if (tok === '\n') {

        lines.push({

          lineIndex: currentLineIdx,

          items: currentItems,

          breakIndexAfter: i,

          lineEndIndex: i,

        });

        currentItems = [];

        currentLineIdx++;

      } else {

        currentItems.push({ globalIndex: i, text: tok });

      }

    }



    lines.push({

      lineIndex: currentLineIdx,

      items: currentItems,

      breakIndexAfter: null,

      lineEndIndex: tokens.length,

    });



    return lines;

  };



  const renderCaretZone = (target: 'positive' | 'negative', index: number, tokens: string[]) => {

    const isThisActive = activeInsertion?.target === target && activeInsertion?.index === index;



    if (isThisActive) {

      return (

        <div key={`caret-input-${index}`} className="inline-flex items-center shrink-0 my-0.5" onClick={(e) => e.stopPropagation()}>

          <input

            type="text"

            autoFocus

            value={insertTagInput}

            onChange={(e) => setInsertTagInput(e.target.value)}

            onKeyDown={(e) => {

              if (e.key === 'Backspace' && !insertTagInput) {

                e.preventDefault();

                if (index > 0) {

                  const updated = [...tokens];

                  updated.splice(index - 1, 1);

                  setPromptTokens(target, updated);

                  setActiveInsertion({ target, index: index - 1 });

                } else {

                  setActiveInsertion(null);

                }

              } else if (e.key === 'Delete' && !insertTagInput) {

                e.preventDefault();

                if (index < tokens.length) {

                  const updated = [...tokens];

                  updated.splice(index, 1);

                  setPromptTokens(target, updated);

                }

              } else if (e.key === 'Enter') {

                e.preventDefault();

                const updated = [...tokens];

                const trimmed = insertTagInput.trim();

                if (e.shiftKey || !trimmed) {

                  if (trimmed) {

                    updated.splice(index, 0, trimmed, '\n');

                  } else {

                    updated.splice(index, 0, '\n');

                  }

                  setPromptTokens(target, updated);

                  setActiveInsertion({ target, index: index + (trimmed ? 2 : 1) });

                  setInsertTagInput('');

                } else {

                  updated.splice(index, 0, trimmed);

                  setPromptTokens(target, updated);

                  setActiveInsertion({ target, index: index + 1 });

                  setInsertTagInput('');

                }

              } else if (e.key === ',') {

                e.preventDefault();

                const trimmed = insertTagInput.replace(/,/g, '').trim();

                if (trimmed) {

                  const updated = [...tokens];

                  updated.splice(index, 0, trimmed);

                  setPromptTokens(target, updated);

                  setActiveInsertion({ target, index: index + 1 });

                  setInsertTagInput('');

                }

              } else if (e.key === 'Escape') {

                setActiveInsertion(null);

                setInsertTagInput('');

              }

            }}

            onBlur={() => {

              if (insertTagInput.trim()) {

                const updated = [...tokens];

                updated.splice(index, 0, insertTagInput.trim());

                setPromptTokens(target, updated);

              }

              setActiveInsertion(null);

              setInsertTagInput('');

            }}

            placeholder="tag (↵ to break)..."

            className="bg-black text-cyan-300 border border-cyan-400 rounded px-2 py-0.5 text-[10px] font-mono outline-none shadow-[0_0_8px_rgba(6,182,212,0.6)] min-w-[120px]"

          />

        </div>

      );

    }



    return (

      <div

        key={`caret-zone-${index}`}

        onMouseDown={(e) => {

          e.preventDefault();

          e.stopPropagation();

          setActiveInsertion({ target, index });

          setInsertTagInput('');

        }}

        className="w-2.5 h-6 -mx-1 flex items-center justify-center cursor-text group/caret z-20 shrink-0 select-none"

        title="Click to insert tag or break here"

      >

        <div className="w-[2px] h-4 bg-white/10 group-hover/caret:bg-cyan-400 group-hover/caret:shadow-[0_0_8px_rgba(6,182,212,0.9)] rounded-full transition-colors pointer-events-none" />

      </div>

    );

  };



  const renderPromptBoxBody = (target: 'positive' | 'negative') => {

    const isPositive = target === 'positive';

    const viewMode = isPositive ? positiveViewMode : negativeViewMode;

    const textVal = isPositive ? prompt : negativePrompt;

    const tokens = getPromptTokens(target);

    const inputRef = isPositive ? positiveInputRef : negativeInputRef;

    const lineRows = parseTokenLines(tokens);



    if (viewMode === 'text') {

      return (

        <PromptAutosuggestTextarea

          value={textVal}

          onChange={isPositive ? setPrompt : setNegativePrompt}

          placeholder={isPositive ? "Type positive tags here... (Shift+Enter for newline)" : "low quality, blurry..."}

          target={target}

        />

      );

    }



    return (

      <div

        tabIndex={0}

        onKeyDown={(e) => {

          const isCtrlOrMeta = e.ctrlKey || e.metaKey;

          if (isCtrlOrMeta && e.key.toLowerCase() === 'z') {

            e.preventDefault();

            if (e.shiftKey) {

              handleRedo(target);

            } else {

              handleUndo(target);

            }

          } else if (isCtrlOrMeta && e.key.toLowerCase() === 'y') {

            e.preventDefault();

            handleRedo(target);

          }

        }}

        onClick={(e) => {

          if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {

            // If clicking empty space at the very bottom of the container, place cursor at the end

            if (!activeInsertion) {

              inputRef.current?.focus();

            }

          }

        }}

        className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto overscroll-contain bg-[#090b10] rounded-xl border border-white/10 select-none min-h-[90px] cursor-text outline-none focus:border-white/20"

      >

        {lineRows.map((row) => (

          <div key={`row-group-${row.lineIndex}`} className="w-full flex flex-col gap-1.5">

            {/* Tag Row: Clean wrapping with uniform gap and no vertical overlap */}

            <div

              onClick={(e) => {

                const targetEl = e.target as HTMLElement;

                if (targetEl.tagName !== 'BUTTON' && targetEl.tagName !== 'INPUT' && !targetEl.closest('.group\\/caret')) {

                  e.stopPropagation();

                  setActiveInsertion({ target, index: row.lineEndIndex });

                  setInsertTagInput('');

                }

              }}

              className="w-full flex flex-wrap items-center gap-1.5 py-0.5 cursor-text relative min-h-[30px]"

            >

              {row.items.map((item) => {

                const idx = item.globalIndex;

                const token = item.text;



                if (token === 'BREAK') {

                  return (

                    <React.Fragment key={`frag-break-kw-${idx}`}>

                      {renderCaretZone(target, idx, tokens)}

                      <div

                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold bg-amber-500/20 border border-amber-500/50 text-amber-300 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"

                        onClick={(e) => {

                          e.stopPropagation();

                          const updated = [...tokens];

                          updated.splice(idx, 1);

                          setPromptTokens(target, updated);

                        }}

                      >

                        <span>BREAK</span>

                      </div>

                    </React.Fragment>

                  );

                }



                const isMuted = token.startsWith('/*') && token.endsWith('*/');

                const isCurrentlyEditing = editingIndex?.target === target && editingIndex?.index === idx;

                const cleanToken = isMuted ? token.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim() : token;

                const weightMatch = cleanToken.match(/^\((.*):([0-9.]+)\)$/);

                const displayLabel = weightMatch ? weightMatch[1] : cleanToken;

                const weightVal = weightMatch ? parseFloat(weightMatch[2]) : 1.0;



                return (

                  <React.Fragment key={`frag-pill-${token}-${idx}`}>

                    {renderCaretZone(target, idx, tokens)}

                    <div

                      draggable={!isCurrentlyEditing && selectedTokens[target].size <= 1}

                      onDragStart={() => setDraggedPill({ target, index: idx })}

                      onDragOver={(e) => {

                        e.preventDefault();

                        if (!draggedPill || draggedPill.target !== target || draggedPill.index === idx) return;

                        const updated = [...tokens];

                        const [moved] = updated.splice(draggedPill.index, 1);

                        updated.splice(idx, 0, moved);

                        setPromptTokens(target, updated);

                        setDraggedPill({ target, index: idx });

                      }}

                      onDragEnd={() => setDraggedPill(null)}

                      onMouseDown={(e) => {

                        if (e.button !== 0) return;

                        e.stopPropagation();

                        setIsSelecting(true);

                        selectionAnchorRef.current = idx;



                        const currentSet = new Set(selectedTokens[target]);

                        if (e.shiftKey && selectionAnchorRef.current !== null) {

                          const start = Math.min(selectionAnchorRef.current, idx);

                          const end = Math.max(selectionAnchorRef.current, idx);

                          for (let i = start; i <= end; i++) currentSet.add(i);

                        } else {

                          if (!currentSet.has(idx)) {

                            currentSet.clear();

                            currentSet.add(idx);

                          }

                        }

                        setSelectedTokens({ ...selectedTokens, [target]: currentSet });

                      }}

                      onMouseEnter={() => {

                        const container = isPositive ? positiveInputRef.current?.closest('.overflow-y-auto') : negativeInputRef.current?.closest('.overflow-y-auto');

                        if (container) (container as HTMLElement).style.overflowY = 'hidden';



                        if (!isSelecting || selectionAnchorRef.current === null) return;

                        const start = Math.min(selectionAnchorRef.current, idx);

                        const end = Math.max(selectionAnchorRef.current, idx);

                        const rangeSet = new Set<number>();

                        for (let i = start; i <= end; i++) rangeSet.add(i);

                        setSelectedTokens({ ...selectedTokens, [target]: rangeSet });

                      }}

                      onMouseLeave={() => {

                        const container = isPositive ? positiveInputRef.current?.closest('.overflow-y-auto') : negativeInputRef.current?.closest('.overflow-y-auto');

                        if (container) (container as HTMLElement).style.overflowY = 'auto';

                      }}

                      ref={bindPillWheelLock((e: WheelEvent) => {

                        if (!scrollWeightEnabled) return;

                        const step = settings.tagClickWeightStep ?? 0.2;

                        const delta = e.deltaY < 0 ? step : -step;

                        const updated = [...tokens];



                        const indicesToUpdate = selectedTokens[target].has(idx) && selectedTokens[target].size > 1

                          ? Array.from(selectedTokens[target])

                          : [idx];



                        indicesToUpdate.forEach((i) => {

                          const tok = tokens[i];

                          if (tok === '\n' || tok === 'BREAK') return;

                          const muted = tok.startsWith('/*') && tok.endsWith('*/');

                          const clean = muted ? tok.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim() : tok;

                          const match = clean.match(/^\((.*):([0-9.]+)\)$/);

                          const base = match ? match[1] : clean;

                          const curW = match ? parseFloat(match[2]) : 1.0;

                          const newW = Math.max(0.1, Math.min(2.5, Number((curW + delta).toFixed(2))));

                          const mod = newW === 1.0 ? base : `(${base}:${newW.toFixed(2)})`;

                          updated[i] = muted ? `/* ${mod} */` : mod;

                        });



                        setPromptTokens(target, updated);

                      })}

                      onDoubleClick={(e) => {

                        e.preventDefault();

                        e.stopPropagation();

                        if (pillClickTimeoutRef.current) {

                          clearTimeout(pillClickTimeoutRef.current);

                          pillClickTimeoutRef.current = null;

                        }

                        setEditingIndex(null);

                        const updated = [...tokens];

                        updated[idx] = isMuted ? cleanToken : `/* ${cleanToken} */`;

                        setPromptTokens(target, updated);

                      }}

                      onClick={(e) => {

                        e.stopPropagation();

                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

                        if (e.clientX - rect.left <= 16) {

                          setActiveInsertion({ target, index: idx });

                          setInsertTagInput('');

                          return;

                        }



                        // Immediate mute toggle on second click of sequence

                        if (e.detail >= 2) {

                          if (pillClickTimeoutRef.current) {

                            clearTimeout(pillClickTimeoutRef.current);

                            pillClickTimeoutRef.current = null;

                          }

                          setEditingIndex(null);

                          const updated = [...tokens];

                          updated[idx] = isMuted ? cleanToken : `/* ${cleanToken} */`;

                          setPromptTokens(target, updated);

                          return;

                        }



                        if (pillClickTimeoutRef.current) {

                          clearTimeout(pillClickTimeoutRef.current);

                        }

                        pillClickTimeoutRef.current = setTimeout(() => {

                          pillClickTimeoutRef.current = null;

                          setEditingIndex({ target, index: idx });

                          setEditingText(token);

                        }, 280);

                      }}

                      onContextMenu={(e) => handlePromptboxPillContextMenu(target, idx, token, e)}

                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono cursor-pointer transition shrink-0 flex items-center gap-1.5 border shadow-sm ${

                        isMuted

                          ? selectedTokens[target].has(idx)

                            ? 'opacity-40 line-through bg-black border-zinc-700 text-zinc-400 ring-1 ring-zinc-500'

                            : 'opacity-35 line-through bg-black border-zinc-800 text-zinc-500'

                          : selectedTokens[target].has(idx)

                          ? 'ring-2 ring-cyan-400 bg-cyan-950/50 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.4)]'

                          : isPositive

                          ? 'bg-[#121624] border-indigo-500/40 text-indigo-200 hover:border-indigo-400 hover:text-white'

                          : 'bg-[#220f17] border-rose-500/40 text-rose-200 hover:border-rose-400 hover:text-white'

                      }`}

                      title="Left click: Edit • Drag: Multiselect • Double click: Disable • Scroll: Weight"

                    >

                      {isCurrentlyEditing ? (

                        <input

                          type="text"

                          autoFocus

                          style={{ width: `${Math.max(editingText.length + 2, 4)}ch` }}

                          value={editingText}

                          onChange={(e) => setEditingText(e.target.value)}

                          onKeyDown={(e) => {

                            if (e.key === 'Enter') submitPromptboxEdit(target, idx);

                            if (e.key === 'Escape') setEditingIndex(null);

                          }}

                          onBlur={() => submitPromptboxEdit(target, idx)}

                          onClick={(e) => e.stopPropagation()}

                          className="bg-transparent text-white p-0 m-0 outline-none border-none text-[11px] font-mono leading-tight"

                        />

                      ) : (

                        <>

                          <span>{displayLabel}</span>

                          {weightMatch && (

                            <span

                              className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold ${

                                weightVal > 1.0

                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'

                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'

                              }`}

                            >

                              {weightVal.toFixed(2)}×

                            </span>

                          )}

                        </>

                      )}

                    </div>

                  </React.Fragment>

                );

              })}



              {/* Caret target at line end before a line break */}

              {row.breakIndexAfter !== null && renderCaretZone(target, row.breakIndexAfter, tokens)}



              {/* Trailing input on the final row */}

              {row.breakIndexAfter === null && (

                <input

                  ref={inputRef}

                  type="text"

                  placeholder="+ Add tag... (Shift+Enter for break)"

                  value={newTagInput[target]}

                  onFocus={() => {

                    setActiveInsertion(null);

                    setInsertTagInput('');

                  }}

                  onChange={(e) => setNewTagInput({ ...newTagInput, [target]: e.target.value })}

                  onKeyDown={(e) => {

                    if ((e.key === 'Backspace' || e.key === 'Delete') && newTagInput[target] === '') {

                      if (selectedTokens[target].size > 0) {

                        e.preventDefault();

                        const updated = tokens.filter((_, i) => !selectedTokens[target].has(i));

                        setPromptTokens(target, updated);

                        setSelectedTokens({ ...selectedTokens, [target]: new Set() });

                        return;

                      }

                    }



                    if (e.key === 'Enter') {

                      e.preventDefault();

                      if (e.shiftKey) {

                        appendTag('\n', target);

                        setNewTagInput({ ...newTagInput, [target]: '' });

                      } else {

                        const tagToAdd = newTagInput[target].replace(/,/g, '').trim();

                        if (tagToAdd) {

                          appendTag(tagToAdd, target, 1.0);

                          setNewTagInput({ ...newTagInput, [target]: '' });

                        }

                      }

                    } else if (e.key === ',') {

                      e.preventDefault();

                      const tagToAdd = newTagInput[target].replace(/,/g, '').trim();

                      if (tagToAdd) {

                        appendTag(tagToAdd, target, 1.0);

                        setNewTagInput({ ...newTagInput, [target]: '' });

                      }

                    } else if (e.key === 'Backspace' && newTagInput[target] === '' && tokens.length > 0) {

                      e.preventDefault();

                      const updated = [...tokens];

                      const removed = updated.pop();

                      setPromptTokens(target, updated);

                      // If the removed token was a line break, place focus back on the merged line

                      if (removed === '\n') {

                        setActiveInsertion({ target, index: updated.length });

                      }

                    }

                  }}

                  className="bg-transparent text-zinc-200 text-[11px] font-mono px-2 py-1 rounded outline-none placeholder:text-zinc-600 min-w-[140px] flex-1 shrink-0"

                />

              )}

            </div>



            {/* Line Break Separator Bar (Independent Full-Width Block) */}

            {row.breakIndexAfter !== null && (

              <div

                className="w-full my-1 flex items-center justify-between group/br cursor-pointer select-none"

                onClick={(e) => {

                  e.stopPropagation();

                  setActiveInsertion({ target, index: row.breakIndexAfter! });

                  setInsertTagInput('');

                }}

              >

                <div className="flex-1 border-b border-dashed border-white/15 group-hover/br:border-cyan-400/50 transition-colors" />

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    const updated = [...tokens];

                    updated.splice(row.breakIndexAfter!, 1);

                    setPromptTokens(target, updated);

                  }}

                  className="px-2 py-0.5 mx-2 text-[9px] font-mono text-zinc-500 hover:text-rose-300 bg-black/80 rounded border border-white/10 hover:border-rose-600/40 flex items-center gap-1 transition-all shrink-0"

                  title="Delete line break (merge lines)"

                >

                  <span>↵ line break</span>

                  <Trash2 className="w-2.5 h-2.5 opacity-60 group-hover/br:opacity-100" />

                </button>

                <div className="flex-1 border-b border-dashed border-white/15 group-hover/br:border-cyan-400/50 transition-colors" />

              </div>

            )}

          </div>

        ))}

      </div>

    );

  };



  return (

    <div

      className="h-full flex flex-col bg-[#07080b] select-none text-xs overflow-hidden"

      style={{ zoom: `${settings.sectionScales.pills}%` }}

    >

      {/* Top Left Layout Mode Selector Bar */}

      <div className="h-8 px-2.5 bg-[#0e1017] border-b border-white/10 flex items-center justify-between shrink-0 z-20">

        <div className="flex items-center gap-1 bg-black/50 border border-white/10 p-0.5 rounded-lg">

          <button

            type="button"

            onClick={() => setPanelLayoutMode('split')}

            className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${

              panelLayoutMode === 'split'

                ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.18)]'

                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'

            }`}

            title="Show both Prompt Boxes and Categorized Tags"

          >

            <span>◫ Both</span>

          </button>

          <button

            type="button"

            onClick={() => setPanelLayoutMode('tags_only')}

            className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${

              panelLayoutMode === 'tags_only'

                ? 'bg-blue-500/12 text-blue-200 border border-blue-400/25 shadow-[0_0_8px_rgba(59,130,246,0.12)]'

                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'

            }`}

            title="Show only Categorized Tag Browser"

          >

            <span>🏷 Tags Only</span>

          </button>

          <button

            type="button"

            onClick={() => setPanelLayoutMode('prompts_only')}

            className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${

              panelLayoutMode === 'prompts_only'

                ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.18)]'

                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'

            }`}

            title="Show only Prompt Boxes"

          >

            <span>✍ Prompts Only</span>

          </button>

        </div>



        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">

          <span className="text-cyan-400 font-semibold">{activeMacroCategory}</span>

          <span>→</span>

          <span className="text-purple-300 font-semibold">{activeSubCategory}</span>

        </div>

      </div>



      <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#111315] border-b border-white/5 shrink-0">

        <div className="flex items-center gap-1">

          <button type="button" onClick={() => setPromptToolsOpen(promptToolsOpen === 'slots' ? null : 'slots')} className={`px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer ${promptToolsOpen === 'slots' ? 'bg-[#3a301f] text-[#efd18f]' : 'text-[#9d978e] hover:bg-white/[0.04] hover:text-[#eeeae2]'}`}>Slots</button>

          <button type="button" onClick={() => setPromptToolsOpen(promptToolsOpen === 'history' ? null : 'history')} className={`px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer ${promptToolsOpen === 'history' ? 'bg-[#2a3033] text-[#b6dbe8]' : 'text-[#9d978e] hover:bg-white/[0.04] hover:text-[#eeeae2]'}`}>History</button>

          <button type="button" onClick={() => setPromptToolsOpen(promptToolsOpen === 'cleanup' ? null : 'cleanup')} className={`px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer ${promptToolsOpen === 'cleanup' ? 'bg-[#3a301f] text-[#efd18f]' : 'text-[#9d978e] hover:bg-white/[0.04] hover:text-[#eeeae2]'}`}>Clean</button>

          <button type="button" onClick={() => setPromptToolsOpen(promptToolsOpen === 'diff' ? null : 'diff')} className={`px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer ${promptToolsOpen === 'diff' ? 'bg-[#253039] text-[#b9dcec]' : 'text-[#9d978e] hover:bg-white/[0.04] hover:text-[#eeeae2]'}`}>Diff</button>

        </div>

        <span className="text-[9px] font-mono text-[#65615b]">{promptHistory.length} saved prompts</span>



        {promptToolsOpen === 'slots' && (

          <div className="absolute left-2 top-full z-50 w-80 p-2 rounded-xl bg-[#1a1c1e] shadow-2xl ring-1 ring-white/10">

            <div className="grid grid-cols-2 gap-1.5">

              {promptSlots.map((slot) => (

                <div key={slot.id} className="rounded-lg bg-white/[0.025] p-2">

                  <div className="flex items-center justify-between gap-2 mb-1">

                    <span className="text-xs font-semibold text-[#eeeae2]">Slot {slot.name}</span>

                    <span className="text-[9px] text-[#65615b]">{slot.savedAt ? new Date(slot.savedAt).toLocaleTimeString() : 'empty'}</span>

                  </div>

                  <div className="text-[9px] text-[#9d978e] truncate mb-2" title={slot.positive}>{slot.positive || 'Empty slot'}</div>

                  <div className="flex gap-1">

                    <button type="button" onClick={() => loadPromptSlot(slot)} className="flex-1 px-2 py-1 rounded bg-[#24272a] hover:bg-[#2d3033] text-[9px] text-[#eeeae2] cursor-pointer">Load</button>

                    <button type="button" onClick={() => savePromptSlot(slot.id)} className="flex-1 px-2 py-1 rounded bg-[#3a301f] hover:bg-[#493b22] text-[9px] text-[#efd18f] cursor-pointer">Save</button>

                  </div>

                </div>

              ))}

            </div>

          </div>

        )}



        {promptToolsOpen === 'history' && (

          <div className="absolute left-2 top-full z-50 w-96 max-h-80 overflow-y-auto p-2 rounded-xl bg-[#1a1c1e] shadow-2xl ring-1 ring-white/10">

            {promptHistory.length === 0 ? <div className="p-5 text-center text-xs text-[#77736b]">No generated prompts saved yet.</div> : promptHistory.map((entry) => (

              <button key={entry.id} type="button" onClick={() => applyPromptHistory(entry)} onMouseEnter={() => setSelectedPromptHistoryId(entry.id)} className={`w-full text-left p-2 rounded-lg mb-1 cursor-pointer ${selectedPromptHistoryId === entry.id ? 'bg-[#282b2e]' : 'hover:bg-white/[0.035]'}`}>

                <div className="flex justify-between gap-2"><span className="text-[10px] text-[#cfc8bd] truncate">{entry.positive || '(empty)'}</span><span className="text-[9px] text-[#625e58] shrink-0">{new Date(entry.createdAt).toLocaleTimeString()}</span></div>

                {entry.negative && <div className="text-[9px] text-[#7f7a72] truncate mt-0.5">− {entry.negative}</div>}

              </button>

            ))}

          </div>

        )}



        {promptToolsOpen === 'cleanup' && (

          <div className="absolute left-24 top-full z-50 w-72 p-3 rounded-xl bg-[#1a1c1e] shadow-2xl ring-1 ring-white/10">

            <div className="text-[10px] uppercase tracking-widest text-[#9d978e] mb-2">Prompt Cleanup</div>

            <div className="space-y-1.5 text-[10px] text-[#cfc8bd]">

              {([['removeDuplicates','Remove duplicates'],['normalizeSeparators','Normalize separators'],['normalizeUnderscores','Normalize underscores'],['removeEmpty','Remove empty tags'],['sortTags','Sort tags'],['preserveWeights','Preserve weights']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-3 cursor-pointer"><span>{label}</span><input type="checkbox" checked={cleanupOptions[key]} onChange={(e) => setCleanupOptions((o) => ({ ...o, [key]: e.target.checked }))} /></label>)}

            </div>

            <button type="button" onClick={() => { const cleaner = (text: string) => { const raw = cleanupOptions.normalizeSeparators ? text.replace(/[，、]+/g, ',') : text; const lines = raw.split('\n'); return lines.map((line) => { let tokens = line.split(',').map((t) => t.trim()).filter(cleanupOptions.removeEmpty ? Boolean : () => true); if (cleanupOptions.removeDuplicates) { const seen = new Set<string>(); tokens = tokens.filter((token) => { const key = token.replace(/^\(+|\)+$/g, '').split(':')[0].trim().toLowerCase().replace(/[\s_]+/g, '_'); if (seen.has(key)) return false; seen.add(key); return true; }); } if (cleanupOptions.normalizeUnderscores) tokens = tokens.map((token) => token.replace(/_/g, ' ')); if (cleanupOptions.sortTags) tokens.sort((a,b) => a.localeCompare(b)); return tokens.join(', '); }).join('\n'); }; setPrompt(cleaner(prompt)); setNegativePrompt(cleaner(negativePrompt)); setPromptToolsOpen(null); emitToast('Prompt cleanup applied', 'success'); }} className="w-full mt-3 px-3 py-1.5 rounded-lg bg-[#3a301f] hover:bg-[#493b22] text-[#efd18f] text-[10px] font-semibold cursor-pointer">Apply cleanup</button>

          </div>

        )}



        {promptToolsOpen === 'diff' && (

          <div className="absolute left-36 top-full z-50 w-[28rem] p-3 rounded-xl bg-[#1a1c1e] shadow-2xl ring-1 ring-white/10">

            {(() => {

              const selected = promptHistory.find((x) => x.id === selectedPromptHistoryId) || promptHistory[0];

              if (!selected) return <div className="text-xs text-[#77736b]">Generate or select a saved prompt first.</div>;

              const renderDiff = (label: string, currentText: string, oldText: string, accent: 'positive' | 'negative') => {

                const current = promptTokensForDiff(currentText);

                const old = promptTokensForDiff(oldText);

                const added = [...current].filter((x) => !old.has(x));

                const removed = [...old].filter((x) => !current.has(x));

                const addClass = accent === 'positive' ? 'bg-[#1a3326] text-emerald-200' : 'bg-[#1a2940] text-blue-200';

                const removeClass = accent === 'positive' ? 'bg-[#361d21] text-rose-200' : 'bg-[#3b2b18] text-amber-200';

                return <div className="space-y-1.5"><div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div><div><div className="text-[8px] text-emerald-300 mb-1">ADDED ({added.length})</div><div className="flex flex-wrap gap-1">{added.length ? added.map((x) => <span key={`${label}-a-${x}`} className={`px-1.5 py-0.5 rounded ${addClass} text-[9px]`}>+ {x}</span>) : <span className="text-[9px] text-zinc-700">none</span>}</div></div><div><div className="text-[8px] text-rose-300 mb-1">REMOVED ({removed.length})</div><div className="flex flex-wrap gap-1">{removed.length ? removed.map((x) => <span key={`${label}-r-${x}`} className={`px-1.5 py-0.5 rounded ${removeClass} text-[9px]`}>− {x}</span>) : <span className="text-[9px] text-zinc-700">none</span>}</div></div></div>;

              };

              return <div className="space-y-4"><div className="text-[10px] uppercase tracking-widest text-[#9d978e]">Current vs {new Date(selected.createdAt).toLocaleTimeString()}</div>{renderDiff('Positive prompt', prompt, selected.positive, 'positive')}{renderDiff('Negative prompt', negativePrompt, selected.negative, 'negative')}</div>;

            })()}

          </div>

        )}

      </div>

      {/* Prompts Section (Visible in 'split' and 'prompts_only') */}

      {panelLayoutMode !== 'tags_only' && (

        <div className={`p-2 bg-[#12141a] flex flex-col shrink-0 gap-1.5 ${panelLayoutMode === 'prompts_only' ? 'flex-1 min-h-0' : 'border-b border-[#232631]'}`}>

          <div

            ref={promptContainerRef}

            style={{ height: panelLayoutMode === 'prompts_only' ? '100%' : `${Math.max(140, promptBoxHeight)}px` }}

            className="flex w-full overflow-hidden select-none gap-1.5 min-h-[140px]"

          >

          {/* Positive Prompt Box */}

          <div

            style={{ width: `${positiveWidthPercent}%` }}

            className={`h-full flex flex-col bg-[#161822] border rounded-md p-1.5 overflow-hidden transition-colors ${

              activeTarget === 'positive' ? 'border-indigo-500/80 shadow-[0_0_8px_rgba(99,102,241,0.2)]' : 'border-[#25293d]'

            }`}

            onClick={() => setActiveTarget('positive')}

          >

            <div className="flex justify-between items-center mb-1 shrink-0">

              <div className="flex items-center gap-1.5">

                <span className={`font-mono text-[11px] font-semibold ${activeTarget === 'positive' ? 'text-indigo-400' : 'text-gray-400'}`}>

                  Positive Prompt

                </span>

                <button

                  type="button"

                  onClick={(e) => { e.stopPropagation(); setPromptToolsOpen(promptToolsOpen === 'cleanup' ? null : 'cleanup'); }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                  title="Deduplicate tags"

                >

                  <Sparkles className="w-2.5 h-2.5" />

                  <span>Clean</span>

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setPresetModalTarget('positive');

                    setPreviewPreset(null);

                    setNewPresetName('');

                  }}

                  className="px-2 py-0.5 bg-cyan-950/40 hover:bg-cyan-600 hover:text-white text-cyan-300 rounded text-[9px] font-mono border border-cyan-500/40 cursor-pointer transition flex items-center gap-1 shadow-xs"

                  title="Save or Load Positive Prompt Presets"

                >

                  <Bookmark className="w-2.5 h-2.5" />

                  <span>Presets</span>

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setPrompt('');

                  }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-rose-900/60 text-gray-400 hover:text-rose-200 rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                  title="Clear Positive Prompt"

                >

                  <Trash2 className="w-2.5 h-2.5" />

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setPositiveViewMode(positiveViewMode === 'pills' ? 'text' : 'pills');

                  }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-[#2e344d] text-gray-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                  title="Toggle between interactive Pills and Raw Textarea"

                >

                  <Type className="w-2.5 h-2.5" />

                  <span>{positiveViewMode === 'pills' ? 'Raw Text' : 'Pills'}</span>

                </button>

              </div>



              <div className="flex items-center gap-1.5 font-mono text-[10px]">

                {positiveViewMode === 'pills' && (

                  <div className="flex items-center bg-[#13151f] border border-[#2b3042] rounded px-1.5 py-0.5 text-gray-400 gap-1">

                    <span className="text-[9px] text-gray-500 uppercase tracking-tight">Step:</span>

                    <select

                      value={settings.tagClickWeightStep ?? 0.2}

                      onChange={(e) => updateSettings({ tagClickWeightStep: parseFloat(e.target.value) })}

                      className="bg-transparent text-indigo-400 hover:text-indigo-300 font-mono text-[10px] outline-none cursor-pointer"

                    >

                      <option value={0.01} className="bg-[#181a22] text-gray-200">±0.01</option>

                      <option value={0.02} className="bg-[#181a22] text-gray-200">±0.02</option>

                      <option value={0.05} className="bg-[#181a22] text-gray-200">±0.05</option>

                      <option value={0.10} className="bg-[#181a22] text-gray-200">±0.10</option>

                      <option value={0.15} className="bg-[#181a22] text-gray-200">±0.15</option>

                      <option value={0.20} className="bg-[#181a22] text-gray-200">±0.20</option>

                      <option value={0.25} className="bg-[#181a22] text-gray-200">±0.25</option>

                    </select>

                  </div>

                )}



                {positiveViewMode === 'pills' && (

                  <button

                    type="button"

                    onClick={(e) => {

                      e.stopPropagation();

                      setScrollWeightEnabled(!scrollWeightEnabled);

                    }}

                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer transition ${

                      scrollWeightEnabled ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' : 'text-gray-500 border-gray-700 bg-black/40'

                    }`}

                  >

                    Scroll W: {scrollWeightEnabled ? 'ON' : 'OFF'}

                  </button>

                )}

                <span className="text-[10px] text-gray-500 font-mono">{prompt.length} chars</span>

              </div>

            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">

              {renderPromptBoxBody('positive')}

            </div>

          </div>



          <div

            onMouseDown={handleHorizontalSplitStart}

            className="w-1.5 bg-[#181b26] hover:bg-indigo-500 active:bg-indigo-400 cursor-col-resize rounded-full transition-colors shrink-0"

          />



          {/* Negative Prompt Box */}

          <div

            style={{ width: `${100 - positiveWidthPercent}%` }}

            className={`h-full flex flex-col bg-[#161822] border rounded-md p-1.5 overflow-hidden transition-colors ${

              activeTarget === 'negative' ? 'border-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.2)]' : 'border-[#25293d]'

            }`}

            onClick={() => setActiveTarget('negative')}

          >

            <div className="flex justify-between items-center mb-1 shrink-0">

              <div className="flex items-center gap-1.5">

                <span className={`font-mono text-[11px] font-semibold ${activeTarget === 'negative' ? 'text-rose-400' : 'text-gray-400'}`}>

                  Negative Prompt

                </span>

                <button

                  type="button"

                  onClick={(e) => { e.stopPropagation(); setPromptToolsOpen(promptToolsOpen === 'cleanup' ? null : 'cleanup'); }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-rose-900/60 text-rose-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                >

                  <Sparkles className="w-2.5 h-2.5" />

                  <span>Clean</span>

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setPresetModalTarget('negative');

                    setPreviewPreset(null);

                    setNewPresetName('');

                  }}

                  className="px-2 py-0.5 bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-300 rounded text-[9px] font-mono border border-rose-500/40 cursor-pointer transition flex items-center gap-1 shadow-xs"

                  title="Save or Load Negative Prompt Presets"

                >

                  <Bookmark className="w-2.5 h-2.5" />

                  <span>Presets</span>

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setNegativePrompt('');

                  }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-rose-900/60 text-gray-400 hover:text-rose-200 rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                  title="Clear Negative Prompt"

                >

                  <Trash2 className="w-2.5 h-2.5" />

                </button>

                <button

                  type="button"

                  onClick={(e) => {

                    e.stopPropagation();

                    setNegativeViewMode(negativeViewMode === 'pills' ? 'text' : 'pills');

                  }}

                  className="px-1.5 py-0.2 bg-[#202434] hover:bg-[#2e344d] text-gray-300 hover:text-white rounded text-[9px] font-mono border border-[#31374d] cursor-pointer transition flex items-center gap-1"

                  title="Toggle between interactive Pills and Raw Textarea"

                >

                  <Type className="w-2.5 h-2.5" />

                  <span>{negativeViewMode === 'pills' ? 'Raw Text' : 'Pills'}</span>

                </button>

              </div>



              <span className="text-[10px] text-gray-500 font-mono">{negativePrompt.length} chars</span>

            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">

              {renderPromptBoxBody('negative')}

            </div>

          </div>

        </div>



        {/* Operator Insert Toolbar */}

        <div className="flex items-center justify-between pt-0.5 shrink-0">

          <div className="flex items-center gap-1 flex-wrap">

            <span className="text-[10px] font-mono text-gray-500 mr-1">Insert:</span>

            <button

              type="button"

              onClick={() => insertOperator('\n')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-cyan-300 rounded font-mono text-[10px] transition cursor-pointer flex items-center gap-1"

              title="Insert a line break (at cursor if active, or at the end)"

            >

              ↵ Line Break

            </button>

            <button

              type="button"

              onClick={() => insertOperator(',')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-gray-300 rounded font-mono text-[10px] transition cursor-pointer"

            >

              , Comma

            </button>

            <button

              type="button"

              onClick={() => insertOperator('BREAK')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-amber-600 hover:text-white border border-[#2d3244] text-amber-300 rounded font-mono text-[10px] transition cursor-pointer font-bold"

              title="Insert BREAK token (at cursor if active, or at the end)"

            >

              BREAK

            </button>

            <button

              type="button"

              onClick={() => insertOperator('AND')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-cyan-300 rounded font-mono text-[10px] transition cursor-pointer"

            >

              AND

            </button>

            <button

              type="button"

              onClick={() => insertOperator('()')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-gray-300 rounded font-mono text-[10px] transition cursor-pointer"

            >

              ( )

            </button>

            <button

              type="button"

              onClick={() => insertOperator('LORA')}

              className="px-2 py-0.5 bg-[#1a1d27] hover:bg-indigo-600 hover:text-white border border-[#2d3244] text-purple-300 rounded font-mono text-[10px] transition cursor-pointer"

            >

              + &lt;lora:&gt;

            </button>

          </div>



          <button

            type="button"

            onClick={() => setIsTagBrowserCollapsed(!isTagBrowserCollapsed)}

            className="px-2.5 py-0.5 bg-[#181a24] hover:bg-[#25293a] border border-[#2e3346] text-indigo-300 rounded font-mono text-[10px] transition cursor-pointer shrink-0 ml-2"

          >

            <span>{isTagBrowserCollapsed ? '▲ Show Tags' : '▼ Cover with Prompts'}</span>

          </button>

        </div>



        {!isTagBrowserCollapsed && (

          <div

            onMouseDown={handleVerticalResizeStart}

            className="h-2.5 w-full flex items-center justify-center cursor-row-resize hover:bg-indigo-600/30 rounded-full transition-colors mt-0.5 shrink-0"

          >

            <div className="w-8 h-1 bg-[#3a4155] rounded-full" />

          </div>

        )}

      </div>

      )}



      {detectedConflicts.length > 0 && (

        <div className="mx-2 mt-2 px-2.5 py-1 bg-amber-950/40 border border-amber-600/50 rounded flex items-center justify-between text-[11px] text-amber-300 shrink-0">

          <div className="flex items-center gap-1.5">

            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />

            <span>{detectedConflicts[0].message}:</span>

            <span className="font-mono underline font-semibold">"{detectedConflicts[0].tagA}"</span>

            <span>vs</span>

            <span className="font-mono underline font-semibold">"{detectedConflicts[0].tagB}"</span>

          </div>

          <div className="flex items-center gap-1">

            <button

              onClick={() => removeTokenFromPrompt(detectedConflicts[0].tagA)}

              className="px-1.5 py-0.2 bg-amber-900/60 hover:bg-amber-800 rounded font-mono text-[10px] text-white cursor-pointer"

            >

              Remove {detectedConflicts[0].tagA}

            </button>

            <button

              onClick={() => removeTokenFromPrompt(detectedConflicts[0].tagB)}

              className="px-1.5 py-0.2 bg-amber-900/60 hover:bg-amber-800 rounded font-mono text-[10px] text-white cursor-pointer"

            >

              Remove {detectedConflicts[0].tagB}

            </button>

          </div>

        </div>

      )}



      {suggestedNextTags.length > 0 && (

        <div className="mx-2 mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 shrink-0">

          <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-0.5 shrink-0 font-semibold">

            <Zap className="w-3 h-3 text-cyan-400" /> Suggested Next:

          </span>

          {suggestedNextTags.map((sug) => (

            <button

              key={sug}

              onMouseDown={(e) => e.preventDefault()}

              onClick={() => appendTag(sug, 'positive', 1.0)}

              className="px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-[10px] hover:bg-cyan-900 hover:text-white cursor-pointer transition shrink-0"

            >

              + {sug.replace(/_/g, ' ')}

            </button>

          ))}

        </div>

      )}



      {panelLayoutMode !== 'prompts_only' && !isTagBrowserCollapsed && (

        <div className="flex-1 flex flex-col min-h-0 bg-[#0c0d12]">

          {/* Macro Category Navigation */}

          <div className="flex items-center bg-[#111318] border-b border-[#20232c] px-1 shrink-0 h-9 z-10">

            <button

              type="button"

              onClick={() => parentScrollRef.current && (parentScrollRef.current.scrollLeft -= 220)}

              className="p-1 text-gray-400 hover:text-white cursor-pointer shrink-0"

            >

              <ChevronLeft className="w-4 h-4" />

            </button>



            <div

              ref={parentScrollRef}

              onWheel={(e) => handleWheelHorizontal(parentScrollRef, e)}

              className="flex-1 flex gap-1.5 overflow-x-auto p-1.5 scrollbar-none scroll-smooth"

            >

              {parentCategories.map((parent: string) => {

                const count = danbooru.getParentCount(parent);

                const isActive = activeMacroCategory === parent;

                const style = STAGE_COLOR_STYLES[parent] || { border: 'border-indigo-500/30', bg: 'bg-indigo-600', text: 'text-indigo-300' };



                return (

                  <button

                    key={parent}

                    onClick={() => {

                      setActiveMacroCategory(parent);

                      setActiveSubCategory('All');

                    }}

                    className={`px-3 py-1 rounded-md text-xs whitespace-nowrap cursor-pointer transition shrink-0 flex items-center gap-1.5 ${

                      isActive

                        ? 'bg-indigo-600 text-white font-semibold shadow-md'

                        : 'bg-[#181a20] border border-[#252833] text-gray-400 hover:text-gray-200'

                    }`}

                  >

                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : style.text.replace('text-', 'bg-')}`} />

                    <span>{parent}</span>

                    <span className={`ml-0.5 text-[11px] ${isActive ? 'text-indigo-200' : 'text-gray-500'}`}>

                      ({count.toLocaleString()})

                    </span>

                  </button>

                );

              })}

            </div>



            <button

              onClick={() => parentScrollRef.current && (parentScrollRef.current.scrollLeft += 220)}

              className="p-1 text-gray-400 hover:text-white cursor-pointer"

            >

              <ChevronRight className="w-4 h-4" />

            </button>

          </div>



          <div className="flex items-center gap-2 p-1.5 border-b border-[#20232c] bg-[#13151b]">

            <div className="relative w-48 shrink-0">

              <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-500" />

              <input

                type="text"

                value={pillSearchQuery}

                onChange={(e) => setPillSearchQuery(e.target.value)}

                placeholder="Filter category tags..."

                className="w-full bg-[#141722] border border-white/10 rounded-lg pl-6 pr-6 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-400 transition"

              />

              {pillSearchQuery && (

                <button

                  type="button"

                  onClick={() => setPillSearchQuery('')}

                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5"

                >

                  ✕

                </button>

              )}

            </div>



            <div className="flex items-center gap-1 shrink-0 border-r border-[#262a36] pr-2">

              <button

                onClick={() => handleRollStageRandomTags(activeMacroCategory)}

                disabled={lockedStages[activeMacroCategory]}

                className={`p-1 rounded cursor-pointer transition flex items-center gap-1 text-[10px] ${

                  lockedStages[activeMacroCategory]

                    ? 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'

                    : 'bg-[#1c1f2b] hover:bg-indigo-600 text-indigo-300 hover:text-white border border-[#2e3346]'

                }`}

              >

                <Dices className="w-3 h-3" />

                <span>Roll</span>

              </button>



              <button

                onClick={() => toggleLockStage(activeMacroCategory)}

                className={`p-1 rounded cursor-pointer transition border border-[#2e3346] ${

                  lockedStages[activeMacroCategory]

                    ? 'bg-amber-600 text-white'

                    : 'bg-[#1c1f2b] hover:bg-[#282d3e] text-gray-400'

                }`}

              >

                {lockedStages[activeMacroCategory] ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}

              </button>



              <button

                onClick={() => handleApplyStageWeight(activeMacroCategory, 1.15)}

                className="px-1.5 py-0.5 bg-[#1c1f2b] hover:bg-indigo-600 hover:text-white text-gray-300 border border-[#2e3346] rounded text-[10px] font-mono cursor-pointer transition"

              >

                1.15x

              </button>

            </div>



            <button

              onClick={() => subScrollRef.current && (subScrollRef.current.scrollLeft -= 220)}

              className="p-0.5 text-gray-400 hover:text-white cursor-pointer shrink-0"

            >

              <ChevronLeft className="w-3.5 h-3.5" />

            </button>



            <div

              ref={subScrollRef}

              onWheel={(e) => handleWheelHorizontal(subScrollRef, e)}

              className="flex-1 flex gap-1 overflow-x-auto scrollbar-none scroll-smooth"

            >

              {subCategories.map((sub: string) => {

                const count = danbooru.getSubCount(activeMacroCategory, sub);

                const isActive = activeSubCategory === sub;

                return (

                  <button

                    key={sub}

                    onClick={() => setActiveSubCategory(sub)}

                    className={`px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap cursor-pointer transition shrink-0 ${

                      isActive

                        ? 'bg-purple-600 text-white font-medium shadow-sm'

                        : 'bg-[#181a20] border border-[#252833] text-gray-400 hover:text-gray-200'

                    }`}

                  >

                    <span>{sub}</span>

                    <span className={`ml-1 ${isActive ? 'text-purple-200' : 'text-gray-500'}`}>

                      ({count.toLocaleString()})

                    </span>

                  </button>

                );

              })}

            </div>



            <button

              onClick={() => subScrollRef.current && (subScrollRef.current.scrollLeft += 220)}

              className="p-0.5 text-gray-400 hover:text-white cursor-pointer shrink-0"

            >

              <ChevronRight className="w-3.5 h-3.5" />

            </button>

          </div>



          <div className="flex-1 p-2 overflow-y-auto content-start flex flex-wrap gap-1.5 bg-[#0a0b0e]">

            {currentTags.length === 0 ? (

              <span className="text-gray-600 m-auto text-xs">

                No tags found under {activeMacroCategory} → {activeSubCategory}.

              </span>

            ) : (

              <>

                {currentTags.map((tag: string) => {

                  const count = danbooru.getPostCount(tag);



                  return (

                    <div

                      key={tag}

                      onMouseDown={(e) => e.preventDefault()}

                      onMouseEnter={(e) => handleTagMouseEnter(e, tag)}

                      onMouseLeave={handleTagMouseLeave}

                      onClick={(e) => handleBrowserPillClick(tag, e)}

                      onContextMenu={(e) => handleTagRightClick(e, tag)}

                      className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-[#16181f] border-[#232733] text-gray-300 hover:border-indigo-500 hover:text-white transition text-xs select-none cursor-pointer"

                    >

                      {settings.showTagPlusPrefix && <span className="text-gray-500 text-[11px]">+</span>}

                      <span>{settings.useUnderscores ? tag.replace(/\s+/g, '_') : tag.replace(/_/g, ' ')}</span>

                      {settings.showTagPostCounts && count && (

                        <span className="text-[10px] font-mono text-gray-500 bg-[#0f1015] px-1 rounded">

                          {formatCount(count)}

                        </span>

                      )}

                    </div>

                  );

                })}



                {hasMoreTags && (

                  <div className="w-full py-2 flex justify-center">

                    <button

                      type="button"

                      onClick={() => setTagDisplayLimit((prev) => prev + 300)}

                      className="px-4 py-1.5 bg-[#141724] hover:bg-cyan-600 hover:text-white border border-cyan-500/30 text-cyan-300 rounded-lg font-mono text-[11px] transition cursor-pointer shadow-md"

                    >

                      + Load More Tags (Showing {currentTags.length}

                      {!pillSearchQuery.trim() ? ` of ${totalCategoryCount.toLocaleString()}` : ''})

                    </button>

                  </div>

                )}

              </>

            )}

          </div>

        </div>

      )}



      {hoverDetail && tooltipPos && (

        <div

          className="fixed z-50 w-72 bg-[#15161d] border border-[#2c303f] rounded-lg shadow-2xl p-3 text-xs text-gray-200 pointer-events-none"

          style={{

            left: tooltipPos.x,

            top: tooltipPos.y

          }}

        >

          <div className="font-bold text-sm text-gray-100 mb-1">{hoverDetail.tag.replace(/_/g, ' ')}</div>

          <div className="flex items-center gap-1.5 mb-2">

            <span className="text-[10px] bg-[#1e2029] text-gray-300 px-1.5 py-0.5 rounded font-mono">

              {hoverDetail.subCategory}

            </span>

            {hoverDetail.postCount && (

              <span className="text-[10px] bg-[#1c2035] text-indigo-300 px-1.5 py-0.5 rounded font-mono">

                {hoverDetail.postCount.toLocaleString()} posts

              </span>

            )}

          </div>

          <p className="text-[11px] text-gray-300 leading-relaxed mb-3 max-h-24 overflow-y-auto">

            {hoverDetail.description || 'No wiki definition available.'}

          </p>

        </div>

      )}



      {/* Detailed Prompt Preset Modal */}

      {presetModalTarget && (

        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none sc-dialog-backdrop">

          <div className="w-[780px] h-[540px] bg-[#0c0e15] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs sc-dialog-card">

            {/* Header */}

            <div className="flex items-center justify-between px-5 py-3.5 bg-[#11141e] border-b border-white/10 font-mono">

              <div className="flex items-center gap-2.5">

                <Bookmark className={`w-4 h-4 ${presetModalTarget === 'positive' ? 'text-cyan-400' : 'text-rose-400'}`} />

                <span className="font-bold text-zinc-100 text-sm">

                  {presetModalTarget === 'positive' ? 'Positive' : 'Negative'} Prompt Presets Library

                </span>

              </div>

              <button

                type="button"

                onClick={() => setPresetModalTarget(null)}

                className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"

              >

                ✕

              </button>

            </div>



            {/* Quick Save Current Bar */}

            <div className="px-5 py-3 bg-[#08090e] border-b border-white/10 flex items-center gap-3 font-mono">

              <span className="text-[11px] text-zinc-400 font-semibold shrink-0">Save Active:</span>

              <input

                type="text"

                value={newPresetName}

                onChange={(e) => setNewPresetName(e.target.value)}

                placeholder="Enter preset title (e.g. Anime Vibrant, Gothic Dark)..."

                className="flex-1 bg-[#121520] border border-white/10 rounded-lg px-3 py-1.5 text-zinc-200 outline-none focus:border-cyan-400 text-xs placeholder:text-zinc-600"

                onKeyDown={(e) => {

                  if (e.key === 'Enter' && newPresetName.trim()) {

                    const text = presetModalTarget === 'positive' ? prompt : negativePrompt;

                    if (text.trim()) {

                      savePromptPreset(newPresetName, text, presetModalTarget);

                      setNewPresetName('');

                    }

                  }

                }}

              />

              <button

                type="button"

                onClick={() => {

                  const text = presetModalTarget === 'positive' ? prompt : negativePrompt;

                  if (!text.trim()) return;

                  savePromptPreset(newPresetName || `Preset ${new Date().toLocaleDateString()}`, text, presetModalTarget);

                  setNewPresetName('');

                }}

                className={`px-4 py-1.5 rounded-lg text-white font-bold text-xs cursor-pointer transition shadow-md flex items-center gap-1.5 ${

                  presetModalTarget === 'positive'

                    ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20'

                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'

                }`}

              >

                <Plus className="w-3.5 h-3.5" />

                <span>Save Current</span>

              </button>

            </div>



            {/* Main Content Split: List & Detailed Inspector */}

            <div className="flex-1 flex min-h-0">

              {/* Left Column: List */}

              <div className="w-[320px] border-r border-white/10 flex flex-col bg-[#0b0c12]">

                <div className="p-2.5 border-b border-white/5">

                  <div className="relative">

                    <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-zinc-500" />

                    <input

                      type="text"

                      value={presetSearch}

                      onChange={(e) => setPresetSearch(e.target.value)}

                      placeholder="Search saved presets..."

                      className="w-full bg-[#121520] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-400"

                    />

                  </div>

                </div>



                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">

                  {promptPresets

                    .filter((p) => p.target === presetModalTarget)

                    .filter((p) => !presetSearch.trim() || p.name.toLowerCase().includes(presetSearch.toLowerCase()) || p.text.toLowerCase().includes(presetSearch.toLowerCase()))

                    .map((preset) => {

                      const isSelected = previewPreset?.id === preset.id;

                      return (

                        <div

                          key={preset.id}

                          onClick={() => setPreviewPreset(preset)}

                          className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col gap-1 ${

                            isSelected

                              ? 'bg-cyan-950/40 border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.2)]'

                              : 'bg-[#121520] border-white/5 hover:border-white/20'

                          }`}

                        >

                          <div className="flex items-center justify-between">

                            <span className="font-semibold text-zinc-200 truncate font-mono text-[11px]">{preset.name}</span>

                            <span className="text-[9px] font-mono text-zinc-500">{preset.tagsCount} tags</span>

                          </div>

                          <p className="text-[10px] text-zinc-400 line-clamp-2 font-mono leading-relaxed">{preset.text}</p>

                        </div>

                      );

                    })}

                  {promptPresets.filter((p) => p.target === presetModalTarget).length === 0 && (

                    <div className="py-16 text-center text-zinc-600 font-mono text-[11px]">

                      No {presetModalTarget} presets saved yet.

                    </div>

                  )}

                </div>

              </div>



              {/* Right Column: Detailed Inspector */}

              <div className="flex-1 p-4 bg-[#08090e] flex flex-col justify-between overflow-hidden">

                {previewPreset ? (

                  <>

                    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">

                      <div className="flex items-center justify-between pb-2 border-b border-white/10">

                        <div>

                          <h3 className="text-sm font-bold text-zinc-100 font-mono">{previewPreset.name}</h3>

                          <span className="text-[10px] text-zinc-500 font-mono">

                            Created {new Date(previewPreset.createdAt).toLocaleString()} • {previewPreset.tagsCount} tags

                          </span>

                        </div>

                        <button

                          type="button"

                          onClick={() => {

                            deletePromptPreset(previewPreset.id);

                            setPreviewPreset(null);

                          }}

                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"

                          title="Delete Preset"

                        >

                          <Trash2 className="w-4 h-4" />

                        </button>

                      </div>



                      <div className="flex-1 flex flex-col gap-1.5 min-h-0 overflow-hidden">

                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Raw Content</span>

                        <div className="flex-1 bg-[#121520] border border-white/10 rounded-xl p-3 text-zinc-300 font-mono text-xs overflow-y-auto leading-relaxed select-text">

                          {previewPreset.text}

                        </div>

                      </div>

                    </div>



                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">

                      <button

                        type="button"

                        onClick={() => navigator.clipboard.writeText(previewPreset.text)}

                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"

                      >

                        <Copy className="w-3.5 h-3.5" />

                        <span>Copy Text</span>

                      </button>



                      <div className="flex items-center gap-2">

                        <button

                          type="button"

                          onClick={() => {

                            if (presetModalTarget === 'positive') {

                              setPrompt(prompt.trim() ? `${prompt.trim()}, ${previewPreset.text}` : previewPreset.text);

                            } else {

                              setNegativePrompt(negativePrompt.trim() ? `${negativePrompt.trim()}, ${previewPreset.text}` : previewPreset.text);

                            }

                            setPresetModalTarget(null);

                          }}

                          className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-mono font-bold transition cursor-pointer"

                        >

                          + Append

                        </button>

                        <button

                          type="button"

                          onClick={() => {

                            if (presetModalTarget === 'positive') setPrompt(previewPreset.text);

                            else setNegativePrompt(previewPreset.text);

                            setPresetModalTarget(null);

                          }}

                          className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition cursor-pointer shadow-lg shadow-cyan-600/25 flex items-center gap-1.5"

                        >

                          <Check className="w-3.5 h-3.5" />

                          <span>Replace & Load</span>

                        </button>

                      </div>

                    </div>

                  </>

                ) : (

                  <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-600 font-mono">

                    <Bookmark className="w-8 h-8 text-zinc-700" />

                    <span>Select a preset from the left list to inspect details.</span>

                  </div>

                )}

              </div>

            </div>

          </div>

        </div>

      )}

    </div>

  );

};







type ExtraFilter = 'all' | 'ready' | 'missing-preview' | 'unresolved' | 'favorites' | 'pinned' | 'recent' | 'new';







const ExtraNetworksPanel: React.FC<IDockviewPanelProps> = () => {

  const {

    modelsList, lorasList, embeddingsList, wildcardsList, loadAssets,

    prompt, setPrompt, setModel, settings, updateSettings, syncCivitaiMetadata, setActiveContextMenu,

    toggleModelFavorite, toggleModelPinned, setModelAlias, setCivitaiUrl, clearCivitaiUrl, refreshCivitaiItem, markModelUsed

  } = useAppStore(useShallow((s) => ({

    modelsList: s.modelsList, lorasList: s.lorasList, embeddingsList: s.embeddingsList, wildcardsList: s.wildcardsList,

    loadAssets: s.loadAssets, prompt: s.prompt, setPrompt: s.setPrompt, setModel: s.setModel, settings: s.settings,

    updateSettings: s.updateSettings, syncCivitaiMetadata: s.syncCivitaiMetadata, setActiveContextMenu: s.setActiveContextMenu,

    toggleModelFavorite: s.toggleModelFavorite, toggleModelPinned: s.toggleModelPinned, setModelAlias: s.setModelAlias,

    setCivitaiUrl: s.setCivitaiUrl, clearCivitaiUrl: s.clearCivitaiUrl, refreshCivitaiItem: s.refreshCivitaiItem, markModelUsed: s.markModelUsed,

  })));



  const [tab, setTab] = useState<'model' | 'lora' | 'embedding' | 'wildcard'>('model');

  const [selectedFolder, setSelectedFolder] = useState<string>('all');

  const [showFolderTree, setShowFolderTree] = useState(true);



  const viewMode = settings.panelViewModes?.extraNetworks || 'cards';

  const setViewMode = (mode: 'cards' | 'compact' | 'list') => {

    updateSettings({

      panelViewModes: {

        ...settings.panelViewModes,

        extraNetworks: mode,

      },

    });

  };

  const [search, setSearch] = useState('');

  const deferredSearch = useDeferredValue(search);

  const [weight, setWeight] = useState(settings.defaultLoraWeight || 1.0);

  const [displayLimit, setDisplayLimit] = useState(100);

  const [filterMode, setFilterMode] = useState<ExtraFilter>('all');

  const [selectedDetails, setSelectedDetails] = useState<ModelItem | null>(null);

  const [libraryStats, setLibraryStats] = useState(civitaiService.getLibraryStats());

  const [libraryUnresolved, setLibraryUnresolved] = useState(civitaiService.getUnresolvedEntries());

  const [libraryPath, setLibraryPath] = useState<string | null>(null);



  useEffect(() => {

    setSelectedFolder('all');

  }, [tab]);



  const [showCivitaiModal, setShowCivitaiModal] = useState(false);

  const [selectedCivitaiCategory, setSelectedCivitaiCategory] = useState<'all' | 'models' | 'loras' | 'embeddings'>('all');

  const [isSyncing, setIsSyncing] = useState(false);

  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; name: string } | null>(null);



  const refreshLibraryUi = () => {

    setLibraryStats(civitaiService.getLibraryStats());

    setLibraryUnresolved(civitaiService.getUnresolvedEntries());

  };



  useEffect(() => {

    void civitaiService.initialize().then(async () => {

      refreshLibraryUi();

      setLibraryPath(await civitaiService.getCacheLocation());

    });

  }, []);



  useEffect(() => {

    setDisplayLimit(100);

  }, [tab, search]);



  const getActiveList = (): ModelItem[] => {

    if (tab === 'model') return modelsList;

    if (tab === 'lora') return lorasList;

    if (tab === 'embedding') return embeddingsList;

    return wildcardsList.map((w) => ({ name: w, previewUrl: undefined }));

  };



  // Extract all distinct folder paths for the active category

  const folderTree = useMemo(() => {

    const list = getActiveList();

    const folderCounts: Record<string, number> = { all: list.length, '/': 0 };



    list.forEach((item) => {

      const parts = item.name.split('/');

      if (parts.length > 1) {

        let path = '';

        for (let i = 0; i < parts.length - 1; i++) {

          path = path ? `${path}/${parts[i]}` : parts[i];

          folderCounts[path] = (folderCounts[path] || 0) + 1;

        }

      } else {

        folderCounts['/'] += 1;

      }

    });



    return folderCounts;

  }, [tab, modelsList, lorasList, embeddingsList, wildcardsList]);



  const filtered = useMemo(() => {

    const list = getActiveList();

    let result = list;



    if (selectedFolder !== 'all') {

      if (selectedFolder === '/') {

        result = result.filter((item) => !item.name.includes('/'));

      } else {

        result = result.filter((item) => item.name.startsWith(`${selectedFolder}/`));

      }

    }



    if (deferredSearch.trim()) {

      const q = deferredSearch.toLowerCase().trim();

      result = result.filter((item) => {

        const haystack = [item.name, ...(item.aliases || []), item.modelId ? String(item.modelId) : '', item.versionId ? String(item.versionId) : '', item.baseModel || '']

          .join(' ')

          .toLowerCase();

        return haystack.includes(q);

      });

    }



    const now = Date.now();

    if (filterMode === 'ready') result = result.filter((item) => (item.civitaiCompleteness || 0) >= 100 || item.civitaiStatus === 'manual');

    if (filterMode === 'missing-preview') result = result.filter((item) => !item.previewUrl && !(item.previewUrls?.length));

    if (filterMode === 'unresolved') result = result.filter((item) => item.civitaiStatus === 'unresolved' || item.civitaiStatus === 'temporarily_failed' || item.civitaiStatus === 'not_found');

    if (filterMode === 'favorites') result = result.filter((item) => item.favorite);

    if (filterMode === 'pinned') result = result.filter((item) => item.pinned);

    if (filterMode === 'recent') result = result.filter((item) => item.lastUsedAt && now - item.lastUsedAt < 7 * 24 * 60 * 60 * 1000);

    if (filterMode === 'new') result = result.filter((item) => item.addedAt && now - item.addedAt < 7 * 24 * 60 * 60 * 1000);



    return result;

  }, [tab, modelsList, lorasList, embeddingsList, wildcardsList, deferredSearch, selectedFolder, filterMode]);



  const displayedItems = useMemo(() => {

    return filtered.slice(0, displayLimit);

  }, [filtered, displayLimit]);



  const extraScrollRef = useRef<HTMLDivElement>(null);

  const [extraViewport, setExtraViewport] = useState({ width: 0, height: 0 });

  const [extraScrollTop, setExtraScrollTop] = useState(0);



  useEffect(() => {

    const node = extraScrollRef.current;

    if (!node) return;

    const update = () => setExtraViewport({ width: node.clientWidth, height: node.clientHeight });

    update();

    const observer = new ResizeObserver(update);

    observer.observe(node);

    return () => observer.disconnect();

  }, []);



  const virtual = useMemo(() => {

    if (viewMode === 'list') return { columns: 1, rowHeight: 56, start: 0, end: displayedItems.length, totalHeight: displayedItems.length * 56 };

    const minCard = viewMode === 'cards' ? 180 : 110;

    const gap = viewMode === 'cards' ? 10 : 6;

    const columns = Math.max(1, Math.floor((Math.max(extraViewport.width, minCard) + gap) / (minCard + gap)));

    const rowHeight = viewMode === 'cards' ? 205 : 128;

    const rows = Math.ceil(displayedItems.length / columns);

    const overscan = 3;

    const first = Math.max(0, Math.floor(extraScrollTop / rowHeight) - overscan);

    const last = Math.min(rows, Math.ceil((extraScrollTop + Math.max(extraViewport.height, rowHeight)) / rowHeight) + overscan);

    return { columns, rowHeight, start: first, end: last, totalHeight: Math.max(rowHeight, rows * rowHeight) };

  }, [viewMode, displayedItems.length, extraViewport.width, extraViewport.height, extraScrollTop]);



  const virtualItems = useMemo(() => {

    if (viewMode === 'list') return displayedItems;

    return displayedItems.slice(virtual.start * virtual.columns, virtual.end * virtual.columns);

  }, [displayedItems, viewMode, virtual.start, virtual.end, virtual.columns]);



  const civitaiStats = useMemo(() => {

    const list = tab === 'model' ? modelsList : tab === 'lora' ? lorasList : tab === 'embedding' ? embeddingsList : [];

    const matched = list.filter((item) => item.civitaiStatus === 'matched' || item.civitaiStatus === 'manual').length;

    return { matched, pending: Math.max(0, list.length - matched) };

  }, [tab, modelsList, lorasList, embeddingsList]);



  const handleItemClick = (item: ModelItem) => {

    if (tab !== 'wildcard') markModelUsed(tab as any, item.name);

    if (tab === 'model') {

      setModel(item.name);



      // If Keyword toggle is enabled, inject model trigger words or clean keyword

      if (settings.autoInjectModelKeywords) {

        const keyword = (item.triggerWords && item.triggerWords.length > 0)

          ? item.triggerWords.join(', ')

          : item.name.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/^[a-zA-Z0-9]+_/g, '').replace(/[_-]/g, ' ') || '';



        if (keyword) {

          const current = prompt.trim();

          if (!current.toLowerCase().includes(keyword.toLowerCase())) {

            setPrompt(current ? `${current}, ${keyword}` : keyword);

          }

        }

      }

      return;

    }



    let token = '';

    if (tab === 'lora') {

      token = `<lora:${item.name}:${weight}>`;

      if (settings.autoInjectModelKeywords && item.triggerWords && item.triggerWords.length > 0) {

        token = `${token}, ${item.triggerWords.join(', ')}`;

      }

    } else if (tab === 'embedding') {

      token = `embedding:${item.name}`;

    } else {

      token = `<wildcard:${item.name}>`;

    }



    setPrompt(prompt.trim() ? `${prompt.trim()}, ${token}` : token);

  };



  const handleCardContextMenu = (e: React.MouseEvent, item: ModelItem) => {

    e.preventDefault();

    e.stopPropagation();

    const isCivitaiAsset = tab !== 'wildcard';

    const type = tab === 'model' ? 'model' : tab === 'lora' ? 'lora' : 'embedding';

    const items: ContextMenuItem[] = [];



    if (tab === 'model') {

      items.push({ label: 'Set as Active Model', icon: <Check className="w-3.5 h-3.5 text-emerald-400" />, action: () => handleItemClick(item) });

    } else {

      items.push({ label: `Insert ${item.name}`, icon: <ArrowUpRight className="w-3.5 h-3.5" />, action: () => handleItemClick(item) });

    }



    if (isCivitaiAsset) {

      items.push({

        label: item.favorite ? 'Remove Favorite' : 'Add to Favorites',

        icon: <Star className={`w-3.5 h-3.5 ${item.favorite ? 'fill-amber-300 text-amber-300' : ''}`} />,

        action: () => toggleModelFavorite(type, item.name),

      });

      items.push({

        label: item.pinned ? 'Unpin Asset' : 'Pin Asset',

        icon: <span className="text-sm">📌</span>,

        action: () => toggleModelPinned(type, item.name),

      });



      if (item.triggerWords?.length) {

        items.push({ label: 'Copy Trigger Words', icon: <Copy className="w-3.5 h-3.5" />, action: () => navigator.clipboard.writeText(item.triggerWords!.join(', ')) });

      }



      items.push({

        label: 'Set Civitai Model URL',

        icon: <Globe className="w-3.5 h-3.5 text-amber-300" />,

        action: async () => {

          const url = window.prompt(`Paste the main Civitai model URL for ${item.name}:`, item.civitaiUrl || 'https://civitai.com/models/');

          if (!url || !url.trim() || url.trim().endsWith('/')) return;

          await setCivitaiUrl(type, item.name, url.trim());

          await refreshCivitaiItem(type, item.name);

          refreshLibraryUi();

        },

      });



      if (item.civitaiUrl) {

        items.push({ label: 'Open Civitai Model', icon: <ExternalLink className="w-3.5 h-3.5" />, action: () => window.open(item.civitaiUrl, '_blank', 'noopener,noreferrer') });

        items.push({ label: 'Clear Civitai URL Override', icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />, action: () => clearCivitaiUrl(type, item.name) });

      }



      items.push({ label: 'Forget Stored Civitai Metadata', icon: <Trash2 className="w-3.5 h-3.5 text-rose-300" />, action: async () => {

        if (!window.confirm(`Forget stored Civitai metadata for ${item.name}? Local model files will not be touched.`)) return;

        civitaiService.removeLibraryEntry(item.name, type);

        civitaiService.clearCache();

        await loadAssets();

        refreshLibraryUi();

      } });

      if (item.modelId || item.versionId || item.air) {

        items.push({ label: 'Copy Civitai IDs / AIR', icon: <Copy className="w-3.5 h-3.5" />, action: () => navigator.clipboard.writeText(item.air || `${item.modelId || ''}${item.versionId ? `@${item.versionId}` : ''}`) });

      }



      items.push({

        label: 'Set Local Alias',

        icon: <Type className="w-3.5 h-3.5" />,

        action: () => {

          const alias = window.prompt(`Add a local search alias for ${item.name}:`, item.aliases?.[0] || '');

          if (alias && alias.trim()) setModelAlias(type, item.name, alias.trim());

        },

      });

      items.push({ label: 'Refresh Civitai Metadata', icon: <RotateCw className="w-3.5 h-3.5" />, action: async () => { await refreshCivitaiItem(type, item.name); refreshLibraryUi(); } });

      items.push({ label: 'Show Model Details', icon: <Info className="w-3.5 h-3.5" />, action: () => setSelectedDetails(item) });

      items.push({ label: 'Set Custom Preview Image (URL)', icon: <ImageIcon className="w-3.5 h-3.5" />, action: () => {

        const url = window.prompt(`Paste preview image URL for ${item.name}:`, item.previewUrl || '');

        if (url?.trim()) {

          const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';

          const current = (useAppStore.getState() as any)[key] as ModelItem[];

          useAppStore.getState().setParams({ [key]: current.map((candidate) => candidate.name === item.name ? { ...candidate, previewUrl: url.trim(), previewUrls: [url.trim(), ...(candidate.previewUrls || [])] } : candidate) } as any);

        }

      }});

    }

    items.push({ label: 'Copy File Name', icon: <Copy className="w-3.5 h-3.5" />, action: () => navigator.clipboard.writeText(item.name) });



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: `${tab.toUpperCase()}: ${item.name}`, items });

  };



  const handleStartCivitaiSync = async () => {

    setIsSyncing(true);

    setSyncProgress(null);

    await syncCivitaiMetadata(selectedCivitaiCategory, (current, total, name) => {

      setSyncProgress({ current, total, name });

    });

    setIsSyncing(false);

    refreshLibraryUi();

    setShowCivitaiModal(false);

  };



  return (

    <div

      className="h-full p-3 bg-[#10131a] flex flex-col gap-2.5 text-xs select-none overflow-hidden"

      style={{ zoom: `${settings.sectionScales.extranetworks}%` }}

    >

      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">

        <div className="flex gap-1 overflow-x-auto scrollbar-none">

          <button

            onClick={() => setTab('model')}

            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'model' ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400'}`}

          >

            Models ({modelsList.length})

          </button>

          <button

            onClick={() => setTab('lora')}

            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'lora' ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400'}`}

          >

            LoRAs ({lorasList.length})

          </button>

          <button

            onClick={() => setTab('embedding')}

            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'embedding' ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400'}`}

          >

            Embeddings ({embeddingsList.length})

          </button>

          <button

            onClick={() => setTab('wildcard')}

            className={`px-2.5 py-0.5 rounded text-xs cursor-pointer ${tab === 'wildcard' ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400'}`}

          >

            Wildcards ({wildcardsList.length})

          </button>

        </div>



        <div className="flex items-center gap-1.5">

          {/* Keyword Injection Toggle */}

          <button

            type="button"

            onClick={() => updateSettings({ autoInjectModelKeywords: !settings.autoInjectModelKeywords })}

            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition cursor-pointer flex items-center gap-1 ${

              settings.autoInjectModelKeywords

                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]'

                : 'bg-[#181a20] border-[#2b2f3a] text-zinc-400 hover:text-zinc-200'

            }`}

            title="Toggle adding keywords/trigger words to prompt box when clicking a model or lora"

          >

            <Sparkles className="w-3 h-3 text-amber-400" />

            <span>Keyword: {settings.autoInjectModelKeywords ? 'ON' : 'OFF'}</span>

          </button>



          <button

            onClick={() => setShowCivitaiModal(true)}

            className="px-2 py-0.5 bg-[#1f2330] hover:bg-amber-800 hover:text-white border border-[#2d3245] text-indigo-300 rounded text-[11px] flex items-center gap-1 cursor-pointer transition shadow-sm"

          >

            <Globe className="w-3 h-3" />

            <span>Civitai Meta</span>

          </button>



          <div className="flex items-center bg-[#0d0e14] border border-white/10 rounded-lg p-0.5">

            <button

              type="button"

              onClick={() => setViewMode('cards')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'cards' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Cards View"

            >

              <Grid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('compact')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'compact' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Compact Dense View"

            >

              <LayoutGrid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('list')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="List View"

            >

              <List className="w-3.5 h-3.5" />

            </button>

          </div>

          <button onClick={() => loadAssets()} title="Refresh model, LoRA and embedding catalogs" aria-label="Refresh asset catalogs" className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">

            <RotateCw className="w-3 h-3" />

          </button>

        </div>

      </div>



      <div className="flex gap-2 items-center">

        <button

          type="button"

          onClick={() => setShowFolderTree(!showFolderTree)}

          className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer ${

            showFolderTree

              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'

              : 'bg-[#181a20] border-[#2b2f3a] text-zinc-400 hover:text-white'

          }`}

          title="Toggle Folder Tree"

        >

          <Layers className="w-3.5 h-3.5" />

          <span>Tree</span>

        </button>



        <div className="relative flex-1">

          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-400" />

          <input

            type="text"

            value={search}

            onChange={(e) => setSearch(e.target.value)}

            placeholder={`Search ${tab}s...`}

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded pl-7 pr-2 py-1 text-xs text-gray-200 outline-none"

          />

        </div>



        <select

          value={filterMode}

          onChange={(e) => setFilterMode(e.target.value as ExtraFilter)}

          className="bg-[#15110b] border border-amber-900/50 rounded px-2 py-1 text-[10px] text-amber-100 outline-none shrink-0"

          title="Filter Extra Networks assets"

        >

          <option value="all">All</option>

          <option value="ready">Metadata Ready</option>

          <option value="missing-preview">Missing Preview</option>

          <option value="unresolved">Unresolved</option>

          <option value="favorites">Favorites</option>

          <option value="pinned">Pinned</option>

          <option value="recent">Recent</option>

        </select>



        <span className="text-[10px] font-mono text-gray-500 shrink-0">

          Showing {Math.min(displayLimit, filtered.length)} of {filtered.length}

        </span>

        {tab !== 'wildcard' && (civitaiStats.matched > 0 || civitaiStats.pending > 0) && (

          <span className="hidden xl:inline text-[10px] font-mono text-zinc-600 shrink-0" title="Civitai metadata status for this catalog">

            Civitai: <span className="text-emerald-400">{civitaiStats.matched}</span>/<span className="text-zinc-500">{civitaiStats.pending}</span>

          </span>

        )}

        {tab !== 'wildcard' && <span className="hidden 2xl:inline text-[10px] font-mono text-zinc-600 shrink-0" title="Persistent local Civitai library">Library: <span className="text-amber-300">{libraryStats.matched}</span> ✓ <span className="text-rose-300">{libraryStats.unresolved}</span> unresolved</span>}



        {tab === 'lora' && (

          <div className="flex items-center gap-1 bg-[#181a20] border border-[#2b2f3a] px-2 rounded">

            <span className="text-[10px] text-gray-400">Weight:</span>

            <input

              type="number"

              step="0.05"

              value={weight}

              onChange={(e) => setWeight(Number(e.target.value))}

              className="w-10 bg-transparent text-xs text-indigo-400 font-mono outline-none"

            />

          </div>

        )}

      </div>



      <div className="flex-1 flex gap-2 overflow-hidden min-h-0">

        {/* Tree View Folder Directory Sidebar */}

        {showFolderTree && (

          <div className="w-48 bg-[#090b10] border border-white/10 rounded-xl p-2 flex flex-col gap-1 overflow-y-auto shrink-0 select-none font-mono text-xs">

            <span className="text-[10px] uppercase font-bold text-zinc-500 px-1 py-0.5 tracking-wider">

              Folders

            </span>



            <button

              type="button"

              onClick={() => setSelectedFolder('all')}

              className={`px-2 py-1 rounded-md text-left text-[11px] truncate flex items-center justify-between transition cursor-pointer ${

                selectedFolder === 'all'

                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30'

                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'

              }`}

            >

              <span>📁 All Assets</span>

              <span className="text-[10px] opacity-60">({folderTree['all'] || 0})</span>

            </button>



            {folderTree['/'] > 0 && (

              <button

                type="button"

                onClick={() => setSelectedFolder('/')}

                className={`px-2 py-1 rounded-md text-left text-[11px] truncate flex items-center justify-between transition cursor-pointer ${

                  selectedFolder === '/'

                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30'

                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'

                }`}

              >

                <span>📂 / (Root)</span>

                <span className="text-[10px] opacity-60">({folderTree['/']})</span>

              </button>

            )}



            {Object.keys(folderTree)

              .filter((f) => f !== 'all' && f !== '/')

              .sort()

              .map((path) => {

                const depth = path.split('/').length - 1;

                const folderName = path.split('/').pop();

                const isSelected = selectedFolder === path;



                return (

                  <button

                    key={path}

                    type="button"

                    onClick={() => setSelectedFolder(path)}

                    style={{ paddingLeft: `${Math.max(8, depth * 12 + 8)}px` }}

                    className={`py-1 pr-2 rounded-md text-left text-[11px] truncate flex items-center justify-between transition cursor-pointer ${

                      isSelected

                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30'

                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'

                    }`}

                    title={path}

                  >

                    <span className="truncate">📁 {folderName}</span>

                    <span className="text-[10px] opacity-60 shrink-0 ml-1">({folderTree[path]})</span>

                  </button>

                );

              })}

          </div>

        )}



        {/* Item Layout Container */}

        <div

          ref={extraScrollRef}

          onScroll={(e) => setExtraScrollTop(e.currentTarget.scrollTop)}

          className="flex-1 min-h-0 overflow-y-auto pr-1 relative"

          onKeyDown={(e) => { if (e.key === 'Home' && !e.ctrlKey) e.currentTarget.scrollTo({ top: 0 }); }}

        >

          <div

            style={{ height: `${virtual.totalHeight}px` }}

            className="relative w-full"

          >

            <div

              className={`${viewMode === 'cards' ? 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5' : viewMode === 'compact' ? 'grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5' : 'flex flex-col gap-1'} absolute inset-x-0 top-0`}

              style={{ transform: `translateY(${virtual.start * virtual.rowHeight}px)` }}

            >

        {virtualItems.map((item) => (

          <div

            key={item.name}

            onClick={() => handleItemClick(item)}

            onContextMenu={(e) => handleCardContextMenu(e, item)}

            className={`group border border-white/10 bg-[#0f1118] hover:border-amber-600/70 cursor-pointer transition shadow-xs flex [content-visibility:auto] [contain-intrinsic-size:220px] ${

              viewMode === 'cards'

                ? 'flex-col rounded-xl overflow-hidden h-auto min-h-[175px]'

                : viewMode === 'compact'

                ? 'flex-col rounded-lg overflow-hidden h-32'

                : 'items-center justify-between p-2 rounded-lg bg-[#0d0f16]'

            }`}

          >

            {viewMode === 'cards' ? (

              <>

                <div className="w-full aspect-4/3 overflow-hidden flex items-center justify-center relative bg-black/40">

                  <ModelPreview

                    url={item.previewUrl}

                    urls={item.previewUrls}

                    name={item.name}

                    type={tab}

                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"

                  />

                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedDetails(item); }} className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-md bg-black/70 text-zinc-300 hover:text-amber-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition" title="View details"><Info className="w-3 h-3" /></button>

                  <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/80 font-mono text-amber-200 px-1.5 py-0.5 rounded border border-amber-800/40 uppercase font-semibold backdrop-blur-xs">

                    {tab}

                  </span>

                  {(item.civitaiStatus === 'matched' || item.civitaiStatus === 'manual') && (

                    <span className="absolute top-1.5 left-1.5 text-[8px] bg-emerald-950/85 font-mono text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/25 uppercase tracking-wide" title={`Civitai metadata ${item.civitaiStatus === 'manual' ? 'linked manually' : 'matched'}${item.civitaiMatchedBy ? ` by ${item.civitaiMatchedBy}` : ''}`}>

                      CIVITAI

                    </span>

                  )}

                  {item.civitaiStatus && item.civitaiStatus !== 'matched' && item.civitaiStatus !== 'manual' && <span className="absolute top-1.5 left-1.5 text-[8px] bg-black/85 font-mono text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/30 uppercase tracking-wide">{item.civitaiStatus.replace('_',' ')}</span>}

                  {item.favorite && <span className="absolute top-1.5 right-1.5 text-amber-300 text-xs">★</span>}

                </div>

                <div className="p-2 flex flex-col justify-center bg-[#16181a] border-t border-white/5 min-w-0 gap-0.5">

                  <span className="font-mono text-zinc-100 text-[11px] font-semibold truncate" title={item.name}>

                    {item.aliases?.[0] || item.name.split('/').pop()?.replace(/\.[^/.]+$/, '')}

                  </span>

                  {item.baseModel && <span className="text-[9px] text-zinc-500 truncate" title={item.baseModel}>Base: {item.baseModel}</span>}

                  {tab !== 'wildcard' && (item.civitaiCompleteness ?? 0) > 0 && (() => { const completeness = item.civitaiCompleteness ?? 0; return (

                    <div className="flex items-center gap-1.5 mt-0.5">

                      <div className="h-1 flex-1 rounded-full bg-white/8 overflow-hidden"><div className={`h-full ${completeness >= 100 ? 'bg-emerald-500' : completeness >= 60 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, completeness)}%` }} /></div>

                      <span className={`text-[8px] font-mono ${completeness >= 100 ? 'text-emerald-300' : completeness >= 60 ? 'text-amber-300' : 'text-blue-300'}`}>{completeness}%</span>

                    </div>

                  ); })()}

                </div>

              </>

            ) : viewMode === 'compact' ? (

              <>

                <div className="w-full flex-1 overflow-hidden flex items-center justify-center relative bg-black/40">

                  <ModelPreview

                    url={item.previewUrl}

                    urls={item.previewUrls}

                    name={item.name}

                    type={tab}

                    className="w-full h-full object-cover"

                  />

                </div>

                <div className="p-1 bg-[#12141d] border-t border-white/5 truncate">

                  <span className="font-mono text-zinc-300 text-[9px] truncate block" title={item.name}>

                    {item.name.split('/').pop()?.replace(/\.[^/.]+$/, '')}

                  </span>

                </div>

              </>

            ) : (

              <>

                <div className="flex items-center gap-2 truncate min-w-0 flex-1">

                  <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-black/50">

                    <ModelPreview

                      url={item.previewUrl}

                      urls={item.previewUrls}

                      name={item.name}

                      type={tab}

                      className="w-full h-full object-cover"

                    />

                  </div>

                  <span className="font-medium text-zinc-300 text-xs truncate">{item.name}</span>

                </div>

                <span className="text-[10px] text-amber-300 font-mono bg-blue-950/30 px-2 py-0.5 rounded shrink-0 ml-2">

                  {tab === 'model' ? 'Select' : '+ Insert'}

                </span>

              </>

            )}

          </div>

        ))}

            </div>

          </div>

        {displayedItems.length < filtered.length && (

          <button

            type="button"

            onClick={() => setDisplayLimit((limit) => Math.min(limit + 100, filtered.length))}

            className="sc-action-button sc-action-info col-span-full w-full shrink-0 rounded-lg px-3 py-2 text-[10px] font-mono transition"

          >

            Show next {Math.min(100, filtered.length - displayedItems.length)} • {filtered.length - displayedItems.length} remaining

          </button>

        )}

        </div>

      </div>



      {selectedDetails && (

        <div className="fixed inset-y-0 right-0 z-999998 w-[min(420px,92vw)] bg-[#0a0805]/98 border-l border-amber-800/40 shadow-2xl backdrop-blur-xl p-4 flex flex-col gap-3 overflow-y-auto">

          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">

            <div className="min-w-0">

              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80">Asset Details</div>

              <div className="font-semibold text-amber-50 text-sm break-words mt-1">{selectedDetails.name}</div>

            </div>

            <button type="button" onClick={() => setSelectedDetails(null)} className="px-2 py-1 rounded border border-white/10 text-zinc-500 hover:text-white hover:bg-white/5">✕</button>

          </div>

          <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40">

            <ModelPreview url={selectedDetails.previewUrl} urls={selectedDetails.previewUrls} name={selectedDetails.name} type={tab} className="w-full h-full object-contain" />

          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">STATUS</span><span className="text-amber-200">{selectedDetails.civitaiStatus || 'not scanned'}</span></div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">COMPLETENESS</span><span className="text-amber-200">{selectedDetails.civitaiCompleteness ?? 0}%</span></div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">MODEL ID</span><span className="text-zinc-200">{selectedDetails.modelId || '—'}</span></div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">VERSION ID</span><span className="text-zinc-200">{selectedDetails.versionId || '—'}</span></div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">VERSION</span><span className="text-zinc-200 truncate block" title={selectedDetails.versionName}>{selectedDetails.versionName || '—'}</span></div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/10"><span className="text-zinc-600 block">BASE MODEL</span><span className="text-zinc-200 truncate block" title={selectedDetails.baseModel}>{selectedDetails.baseModel || '—'}</span></div>

          </div>

          {selectedDetails.civitaiUrl && <button type="button" onClick={() => window.open(selectedDetails.civitaiUrl, '_blank', 'noopener,noreferrer')} className="w-full px-3 py-2 rounded-lg border border-amber-800/50 bg-amber-950/30 text-amber-100 text-[11px] hover:bg-amber-900/30">Open Civitai</button>}

          {selectedDetails.triggerWords?.length ? <div><div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Trigger words</div><div className="text-xs text-zinc-300 leading-relaxed">{selectedDetails.triggerWords.join(', ')}</div></div> : null}

          {selectedDetails.description ? <div><div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Description</div><div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{selectedDetails.description}</div></div> : null}

          {selectedDetails.aliases?.length ? <div><div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Aliases</div><div className="flex flex-wrap gap-1">{selectedDetails.aliases.map((alias) => <span key={alias} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-zinc-300">{alias}</span>)}</div></div> : null}

          {selectedDetails.civitaiError ? <div className="p-2 rounded-lg border border-rose-900/50 bg-rose-950/20 text-[10px] text-rose-300"><span className="font-semibold">Resolver:</span> {selectedDetails.civitaiError}</div> : null}

        </div>

      )}



      {showCivitaiModal && (

        <div className="fixed inset-0 z-999999 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sc-dialog-backdrop">

          <div className="w-[420px] bg-[#090b10] border border-white/10 rounded-2xl shadow-2xl p-5 text-xs text-zinc-200 flex flex-col gap-4 sc-dialog-card">

            <div className="flex justify-between items-center border-b border-white/10 pb-3">

              <span className="flex items-center gap-2 font-bold text-sm text-amber-300 font-mono">

                <Globe className="w-4 h-4 text-amber-400" />

                <span>Civitai Metadata Sync</span>

              </span>

              {!isSyncing && (

                <button

                  onClick={() => setShowCivitaiModal(false)}

                  className="text-zinc-500 hover:text-white p-1 rounded-md transition"

                >

                  ✕

                </button>

              )}

            </div>



            <div className="grid grid-cols-2 gap-2 text-[10px]">

              <button type="button" onClick={async () => { const json = await civitaiService.exportLibrary(); const blob = new Blob([json], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'swarm-canvas-civitai-library.json'; a.click(); URL.revokeObjectURL(a.href); }} className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-amber-950/30 hover:border-amber-800/50 text-zinc-300">Export Library</button>

              <label className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-amber-950/30 hover:border-amber-800/50 text-zinc-300 text-center cursor-pointer">Import Library<input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const input = e.currentTarget; try { const file = input.files?.[0]; if (!file) return; const raw = await file.text(); const imported = await civitaiService.importLibrary(raw); await loadAssets(); refreshLibraryUi(); window.alert(`Imported ${imported} Civitai asset records.`); } catch (error) { window.alert(`Could not import library: ${error instanceof Error ? error.message : 'invalid JSON'}`); } finally { input.value = ''; } }} /></label>

              <button type="button" onClick={async () => { if (!window.confirm('Clear the persistent Civitai metadata and preview cache? This does not delete model files.')) return; await civitaiService.clearLibrary(); civitaiService.clearCache(); await loadAssets(); refreshLibraryUi(); }} className="px-2 py-1.5 rounded-lg border border-rose-900/40 bg-rose-950/10 hover:bg-rose-950/30 text-rose-300">Clear Cache</button>

              <button type="button" onClick={async () => { const path = libraryPath || await civitaiService.getCacheLocation(); if (path) { await navigator.clipboard.writeText(path); window.alert(`Cache path copied:

${path}`); } else { window.alert('The persistent cache path is available only in the desktop/Tauri build.'); } }} className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300">Copy Cache Location</button>

            </div>

            <div className="p-2 rounded-xl border border-amber-900/30 bg-amber-950/10 text-[10px] font-mono text-zinc-400 leading-relaxed">

              <div className="flex items-center justify-between gap-2"><span className="text-amber-300">Persistent library</span><span className="text-zinc-500">{libraryStats.cachedPreviews} cached previews</span></div>

              <div className="mt-1 truncate" title={libraryPath || 'Tauri app-local Civitai cache'}>{libraryPath || 'Desktop cache: app-local data / civitai'}</div>

            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 cursor-pointer">

              <div className="min-w-0"><div className="text-zinc-200 font-semibold">Automatic background Civitai scan</div><div className="text-[9px] text-zinc-500 mt-0.5">After asset refresh, resolve missing/partial metadata in the background. Manual URL overrides still run first.</div></div>

              <input type="checkbox" checked={settings.autoCivitaiScan} onChange={(e) => updateSettings({ autoCivitaiScan: e.target.checked })} className="accent-amber-500 shrink-0" />

            </label>



            <p className="text-zinc-400 text-[11px] leading-relaxed">

              Uses exact file hashes when available, then progressively safer Civitai searches. Missing/unmatched entries can be retried without replacing successful matches.

            </p>



            <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">

              <div className="rounded border border-white/10 bg-white/[0.03] p-1.5"><div className="text-zinc-600">TOTAL</div><div className="text-zinc-200">{libraryStats.total}</div></div>

              <div className="rounded border border-white/10 bg-white/[0.03] p-1.5"><div className="text-zinc-600">MATCHED</div><div className="text-emerald-300">{libraryStats.matched}</div></div>

              <div className="rounded border border-white/10 bg-white/[0.03] p-1.5"><div className="text-zinc-600">PARTIAL</div><div className="text-amber-300">{libraryStats.partial}</div></div>

              <div className="rounded border border-white/10 bg-white/[0.03] p-1.5"><div className="text-zinc-600">ISSUES</div><div className="text-rose-300">{libraryStats.unresolved + libraryStats.failed}</div></div>

            </div>



            {libraryUnresolved.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-rose-900/40 bg-rose-950/10 divide-y divide-white/5">{libraryUnresolved.slice(0, 12).map((entry) => <div key={`${entry.type}:${entry.filename}`} className="flex items-center gap-2 px-2.5 py-2 hover:bg-white/[0.03]"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setShowCivitaiModal(false); setTab(entry.type as any); setSearch(entry.filename.split('/').pop() || entry.filename); setFilterMode('unresolved'); }}><div className="text-[10px] text-zinc-200 truncate">{entry.filename}</div><div className="text-[9px] text-rose-300/80 truncate">{entry.failureReason || entry.status}</div></button><button type="button" className="shrink-0 px-2 py-1 rounded border border-amber-900/50 bg-amber-950/20 text-amber-200 text-[9px]" onClick={async () => { const current = (useAppStore.getState() as any)[entry.type === 'model' ? 'modelsList' : entry.type === 'lora' ? 'lorasList' : 'embeddingsList']?.find((candidate: ModelItem) => candidate.name === entry.filename) as ModelItem | undefined; const url = window.prompt(`Paste the main Civitai model URL for ${entry.filename}:`, entry.civitaiUrl || 'https://civitai.com/models/'); if (!current || !url?.trim() || url.trim().endsWith('/')) return; await setCivitaiUrl(entry.type, entry.filename, url.trim()); await refreshCivitaiItem(entry.type, entry.filename); refreshLibraryUi(); }}>Resolve</button></div>)}</div>}



            <div className="flex flex-col gap-1.5">

              <label className="text-[10px] text-zinc-400 uppercase font-mono tracking-wider">Target Catalog Collection</label>

              <select

                disabled={isSyncing}

                value={selectedCivitaiCategory}

                onChange={(e) => setSelectedCivitaiCategory(e.target.value as any)}

                className="w-full bg-[#12141c] border border-white/10 rounded-xl p-2 text-zinc-200 outline-none font-mono text-xs focus:border-cyan-400 cursor-pointer"

              >

                <option value="all">All Catalogs ({modelsList.length + lorasList.length + embeddingsList.length} items)</option>

                <option value="models">Checkpoints Only ({modelsList.length} items)</option>

                <option value="loras">LoRAs Only ({lorasList.length} items)</option>

                <option value="embeddings">Embeddings Only ({embeddingsList.length} items)</option>

              </select>

            </div>



            {/* Active Sync Progress Window */}

            {isSyncing && (

              <div className="flex flex-col gap-2 p-3 bg-black/60 border border-cyan-500/30 rounded-xl">

                <div className="flex justify-between items-center text-[10px] font-mono">

                  <span className="text-cyan-300 font-semibold truncate max-w-[240px]">

                    {syncProgress?.name ? syncProgress.name.split('/').pop() : 'Connecting to API...'}

                  </span>

                  <span className="text-zinc-400 font-bold">

                    {syncProgress ? `${syncProgress.current} / ${syncProgress.total}` : '0%'}

                  </span>

                </div>



                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">

                  <div

                    className="bg-blue-400/75 h-full transition-all duration-150 shadow-[0_0_10px_rgba(120,166,216,0.20)]"

                    style={{

                      width: syncProgress

                        ? `${Math.round((syncProgress.current / syncProgress.total) * 100)}%`

                        : '5%'

                    }}

                  />

                </div>

              </div>

            )}



            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">

              <button

                disabled={isSyncing}

                onClick={() => setShowCivitaiModal(false)}

                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition cursor-pointer"

              >

                Close

              </button>

              <button

                disabled={isSyncing}

                onClick={handleStartCivitaiSync}

                className="sc-generate-button px-5 py-2 rounded-xl disabled:opacity-50"

              >

                {isSyncing ? 'Fetching...' : 'Sync / Retry Missing'}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

};



/* =========================================================================

   METADATA MODAL

   ========================================================================= */

const MetadataModal: React.FC<{ item: HistoryItem | null; onClose: () => void }> = ({ item, onClose }) => {

  if (!item) return null;



  return (

    <div className="fixed inset-0 z-999999 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sc-dialog-backdrop">

      <div className="w-130 max-h-[85vh] bg-[#141622] border border-[#2d3246] rounded-xl shadow-2xl flex flex-col text-xs text-gray-300 overflow-hidden sc-dialog-card">

        <div className="flex items-center justify-between px-4 py-3 bg-[#191b2a] border-b border-[#252a38]">

          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">

            <Info className="w-4 h-4" />

            <span>Generation Parameters & Metadata</span>

          </div>

          <button onClick={onClose} className="text-gray-500 hover:text-white text-base cursor-pointer">✕</button>

        </div>



        <div className="p-4 overflow-y-auto space-y-3 font-mono">

          <div>

            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Prompt</label>

            <div className="bg-[#0e0f17] p-2.5 rounded border border-[#25293d] text-gray-200 select-text wrap-break-word">

              {item.prompt}

            </div>

          </div>



          {item.negativePrompt && (

            <div>

              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Negative Prompt</label>

              <div className="bg-[#0e0f17] p-2.5 rounded border border-[#25293d] text-gray-400 select-text wrap-break-word">

                {item.negativePrompt}

              </div>

            </div>

          )}



          <div className="grid grid-cols-2 gap-2 text-[11px]">

            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">

              <span className="text-gray-500 block text-[10px]">Model</span>

              <span className="text-indigo-300 break-all">{item.params.model}</span>

            </div>

            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">

              <span className="text-gray-500 block text-[10px]">Seed</span>

              <span className="text-amber-400">{item.params.seed}</span>

            </div>

            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">

              <span className="text-gray-500 block text-[10px]">Steps / CFG</span>

              <span className="text-gray-200">{item.params.steps} steps • CFG {item.params.cfgScale ?? 6.5}</span>

            </div>

            <div className="bg-[#0e0f17] p-2 rounded border border-[#25293d]">

              <span className="text-gray-500 block text-[10px]">Dimensions</span>

              <span className="text-gray-200">{item.params.width} × {item.params.height}</span>

            </div>

          </div>

        </div>



        <div className="px-4 py-2.5 bg-[#191b2a] border-t border-[#252a38] flex justify-end">

          <button

            onClick={() => {

              const fullParams = `${item.prompt}\nNegative prompt: ${item.negativePrompt || ''}\nSteps: ${item.params.steps}, CFG: ${item.params.cfgScale}, Seed: ${item.params.seed}, Model: ${item.params.model}`;

              navigator.clipboard.writeText(fullParams);

            }}

            className="px-3 py-1 bg-amber-800 hover:bg-indigo-500 text-white font-medium rounded text-xs cursor-pointer transition flex items-center gap-1.5"

          >

            <Copy className="w-3.5 h-3.5" />

            <span>Copy Full Parameters</span>

          </button>

        </div>

      </div>

    </div>

  );

};



/* =========================================================================

   4. HISTORY PANEL

   ========================================================================= */

const HistoryPanel: React.FC<IDockviewPanelProps> = () => {

  const { history, sessionStartTime, setParams, useGenerationParams, setComparisonImage, settings, updateSettings, deleteHistoryItem, setActiveContextMenu, toggleFavorite } = useAppStore(useShallow((s) => ({

    history: s.history, sessionStartTime: s.sessionStartTime, setParams: s.setParams, useGenerationParams: s.useGenerationParams,

    setComparisonImage: s.setComparisonImage, settings: s.settings, updateSettings: s.updateSettings, deleteHistoryItem: s.deleteHistoryItem,

    setActiveContextMenu: s.setActiveContextMenu, toggleFavorite: s.toggleFavorite,

  })));

  const viewMode = settings.panelViewModes?.history || 'cards';

  const setViewMode = (mode: 'cards' | 'compact' | 'list') => {

    updateSettings({

      panelViewModes: {

        ...settings.panelViewModes,

        history: mode,

      },

    });

  };

  const [selectedMetaItem, setSelectedMetaItem] = useState<HistoryItem | null>(null);

  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);



  const sessionHistory = useMemo(() => {

    const filtered = history

      .filter((item: any) => {

        const itemTime = item.timestamp || Number(item.id?.split('-')[1]) || 0;

        return itemTime === 0 || !sessionStartTime || itemTime >= sessionStartTime - 3600000;

      })

      .filter((item) => (!showFavoritesOnly ? true : item.isFavorite));



    if (filtered.length === 0 && history.length > 0 && !showFavoritesOnly) {

      return history.slice(0, 100);

    }



    return filtered;

  }, [history, sessionStartTime, showFavoritesOnly]);



  const batchedHistory = useMemo(() => {

    if (!settings.separateBatches) {

      return sessionHistory.map((item) => ({ batchId: item.id, items: [item] }));

    }



    const groups: { batchId: string; items: typeof sessionHistory }[] = [];

    const batchMap = new Map<string, typeof sessionHistory>();



    sessionHistory.forEach((item) => {

      const bId = item.batchId || `batch-${Math.floor((item.timestamp || 0) / 2500)}`;

      if (!batchMap.has(bId)) {

        const list: typeof sessionHistory = [];

        batchMap.set(bId, list);

        groups.push({ batchId: bId, items: list });

      }

      batchMap.get(bId)!.push(item);

    });



    return groups;

  }, [sessionHistory, settings.separateBatches]);



  const handleHistoryContextMenu = (e: React.MouseEvent, item: HistoryItem) => {

    e.preventDefault();

    e.stopPropagation();



    const items: ContextMenuItem[] = [

      {

        label: 'Inspect Generation Info',

        icon: <Info className="w-3.5 h-3.5 text-amber-400" />,

        action: () => setSelectedMetaItem(item)

      },

      {

        label: 'Use generation params',

        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,

        action: () => useGenerationParams(item)

      },

      {

        label: 'Set as Comparison Image (B)',

        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,

        action: () => setComparisonImage(resolveImageUrl(item.imageUrl))

      },

      {

        label: 'View in Viewport Canvas',

        icon: <Maximize2 className="w-3.5 h-3.5" />,

        action: () => setParams({ activeImage: resolveImageUrl(item.imageUrl) })

      },

      {

        separator: true,

        label: 'Delete permanently',

        danger: true,

        icon: <Trash2 className="w-3.5 h-3.5" />,

        action: () => deleteHistoryItem(item.id)

      }

    ];



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Session History Entry', items });

  };



  return (

    <div

      className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 overflow-hidden select-none text-xs relative"

      style={{ zoom: `${settings.sectionScales.history}%` }}

    >

      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5">

        <span className="font-semibold text-gray-300 flex items-center gap-1">

          <HistoryIcon className="w-3.5 h-3.5 text-indigo-400" /> Current Session ({sessionHistory.length})

        </span>

        <div className="flex items-center gap-1.5 relative">

          <button

            onClick={() => setShowFavoritesOnly((prev) => !prev)}

            className={`p-1 rounded cursor-pointer border border-[#2b2f3a] transition flex items-center gap-1 text-[10px] ${

              showFavoritesOnly ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-[#181a20] text-gray-400'

            }`}

          >

            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />

          </button>







          <div className="flex items-center bg-[#0d0e14] border border-white/10 rounded-lg p-0.5">

            <button

              type="button"

              onClick={() => setViewMode('cards')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'cards' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Cards View"

            >

              <Grid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('compact')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'compact' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Compact View"

            >

              <LayoutGrid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('list')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="List Table View"

            >

              <List className="w-3.5 h-3.5" />

            </button>

          </div>

        </div>

      </div>



      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">

        {batchedHistory.length === 0 ? (

          <span className="text-gray-600 m-auto">No generations in this session yet.</span>

        ) : (

          batchedHistory.map((batch, groupIdx) => (

            <div

              key={batch.batchId || groupIdx}

              className="bg-[#14161f] border border-[#262b3c] rounded-xl p-2.5 flex flex-col gap-2 shadow-lg relative"

            >

              {settings.separateBatches && batchedHistory.length > 1 && (

                <div className="flex items-center justify-between pb-1 border-b border-[#202432] text-[10px] font-mono text-indigo-400">

                  <span className="flex items-center gap-1.5">

                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />

                    Batch #{batchedHistory.length - groupIdx} ({batch.items.length} images)

                  </span>

                  <span className="text-gray-500">{batch.items[0]?.createdAt}</span>

                </div>

              )}



              <div

                className={`${

                  viewMode === 'cards'

                    ? 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5'

                    : viewMode === 'compact'

                    ? 'grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2'

                    : 'flex flex-col gap-1.5'

                } items-start`}

              >

                {batch.items.map((item, index) => {

                  const finalImageUrl = resolveImageUrl(item.imageUrl);

                  const modelBaseName = (item.params?.model || 'unknown').split('/').pop()?.replace(/\.[^/.]+$/, '');

                  const modelColor = getModelColorStyle(modelBaseName);



                  return (

                    <div

                      key={item.id || index}

                      onClick={() => setParams({ activeImage: finalImageUrl })}

                      onContextMenu={(e) => handleHistoryContextMenu(e, item)}

                      className={`border border-white/10 bg-[#0c0e15] rounded-xl hover:border-cyan-400/80 cursor-pointer transition shadow-sm flex relative group ${

                        viewMode === 'cards'

                          ? 'flex-col p-2 gap-2 h-auto'

                          : viewMode === 'compact'

                          ? 'flex-col p-1.5 gap-1.5 h-auto'

                          : 'items-center gap-2.5 p-2 w-full'

                      }`}

                    >

                      <div

                        className={`relative overflow-hidden rounded-lg bg-black/40 ${

                          viewMode === 'cards'

                            ? 'w-full aspect-square'

                            : viewMode === 'compact'

                            ? 'w-full aspect-square'

                            : 'w-12 h-12 shrink-0'

                        }`}

                      >

                        <img

                          src={finalImageUrl}

                          onError={handleImageError}
                          loading="lazy"
                          decoding="async"

                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"

                        />

                        <button

                          onClick={(e) => {

                            e.stopPropagation();

                            toggleFavorite(item.id);

                          }}

                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-gray-400 hover:text-amber-400 transition cursor-pointer z-10"

                        >

                          <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />

                        </button>

                      </div>



                      {/* Compact view: Colored Model Tag */}

                      {viewMode === 'compact' && (

                        <div className="w-full overflow-hidden px-0.5">

                          <span

                            className={`block truncate font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded border ${modelColor.bg} ${modelColor.text} ${modelColor.border}`}

                            title={modelBaseName}

                          >

                            {modelBaseName}

                          </span>

                        </div>

                      )}



                      {/* Cards & List view: Full metadata */}

                      {viewMode !== 'compact' && (

                        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                          <span className="text-[11px] text-gray-300 truncate font-mono" title={item.prompt}>

                            {item.prompt}

                          </span>

                          <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 mt-1 pt-1 border-t border-white/5">

                            <span

                              className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold truncate max-w-[120px] ${modelColor.bg} ${modelColor.text} ${modelColor.border}`}

                              title={item.params?.model}

                            >

                              {modelBaseName}

                            </span>

                            <span className="text-zinc-500 text-[9px]">🎲 {item.params?.seed}</span>

                          </div>

                        </div>

                      )}

                    </div>

                  );

                })}

              </div>

            </div>

          ))

        )}

      </div>



      <MetadataModal

        item={selectedMetaItem}

        onClose={() => setSelectedMetaItem(null)}

      />

    </div>

  );

};



/* =========================================================================

   NEW GALLERY PANEL (PAGINATED & SOURCE SWITCHER)

   ========================================================================= */

const GalleryPanel: React.FC<IDockviewPanelProps> = () => {

  const {

    galleryHistory, history, setParams, useGenerationParams, setComparisonImage,

    deleteHistoryItem, setActiveContextMenu, syncServerGallery, settings, updateSettings,

    galleryCurrentPage, setGalleryCurrentPage, toggleFavorite

  } = useAppStore(useShallow((s) => ({

    galleryHistory: s.galleryHistory, history: s.history, setParams: s.setParams, useGenerationParams: s.useGenerationParams,

    setComparisonImage: s.setComparisonImage, deleteHistoryItem: s.deleteHistoryItem, setActiveContextMenu: s.setActiveContextMenu,

    syncServerGallery: s.syncServerGallery, settings: s.settings, updateSettings: s.updateSettings, galleryCurrentPage: s.galleryCurrentPage,

    setGalleryCurrentPage: s.setGalleryCurrentPage, toggleFavorite: s.toggleFavorite,

  })));

  const viewMode = settings.panelViewModes?.gallery || 'cards';

  const setViewMode = (mode: 'cards' | 'compact' | 'list') => {

    updateSettings({

      panelViewModes: {

        ...settings.panelViewModes,

        gallery: mode,

      },

    });

  };



  const [selectedMetaItem, setSelectedMetaItem] = useState<HistoryItem | null>(null);

  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [isSyncingServer, setIsSyncingServer] = useState(false);

  // Switch between App-only local store history or all server image history

  const rawDataset = settings.gallerySource === 'all' ? (galleryHistory || []) : (history || []);



  const filteredGallery = useMemo(() => {

    return rawDataset.filter((item) => (!showFavoritesOnly ? true : item.isFavorite));

  }, [rawDataset, showFavoritesOnly]);



  const pageSize = settings.galleryPageSize || 24;

  const totalPages = Math.ceil(filteredGallery.length / pageSize) || 1;

  const safeCurrentPage = Math.min(galleryCurrentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedItems = filteredGallery.slice(startIndex, startIndex + pageSize);



  const handleGalleryContextMenu = (e: React.MouseEvent, item: HistoryItem) => {

    e.preventDefault();

    e.stopPropagation();



    const items: ContextMenuItem[] = [

      {

        label: 'Inspect Generation Info',

        icon: <Info className="w-3.5 h-3.5 text-amber-400" />,

        action: () => setSelectedMetaItem(item)

      },

      {

        label: 'Use generation params',

        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,

        action: () => useGenerationParams(item)

      },

      {

        label: 'Set as Comparison Image (B)',

        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,

        action: () => setComparisonImage(resolveImageUrl(item.imageUrl))

      },

      {

        label: 'View in Viewport Canvas',

        icon: <Maximize2 className="w-3.5 h-3.5" />,

        action: () => setParams({ activeImage: resolveImageUrl(item.imageUrl) })

      },

      {

        separator: true,

        label: 'Delete permanently',

        danger: true,

        icon: <Trash2 className="w-3.5 h-3.5" />,

        action: () => deleteHistoryItem(item.id)

      }

    ];



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Gallery Entry', items });

  };



  const handleSyncServer = async () => {

    setIsSyncingServer(true);

    await syncServerGallery();

    setIsSyncingServer(false);

  };



  return (

    <div className="h-full p-3 bg-[#121418] flex flex-col gap-2.5 overflow-hidden select-none text-xs">

      <div className="flex items-center justify-between border-b border-[#252a35] pb-1.5 flex-wrap gap-2">

        <span className="font-semibold text-gray-300 flex items-center gap-1">

          <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Gallery ({filteredGallery.length})

        </span>



        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Source Switcher Toggle */}

          <button

            onClick={() => updateSettings({ gallerySource: settings.gallerySource === 'app' ? 'all' : 'app' })}

            className="px-2 py-0.5 bg-[#181a24] hover:bg-amber-800 hover:text-white border border-[#2b2f3a] text-indigo-300 rounded cursor-pointer transition text-[10px] font-mono"

            title="Toggle between App-only history and all Server outputs"

          >

            Source: {settings.gallerySource === 'app' ? 'App Outputs' : 'All Server'}

          </button>



          <button

            onClick={handleSyncServer}

            disabled={isSyncingServer}

            className="px-2 py-0.5 bg-[#181a24] hover:bg-amber-800 hover:text-white border border-[#2b2f3a] text-indigo-300 rounded cursor-pointer transition flex items-center gap-1 text-[10px]"

          >

            <RotateCw className={`w-3 h-3 ${isSyncingServer ? 'animate-spin' : ''}`} />

            <span>{isSyncingServer ? 'Scanning...' : 'Sync'}</span>

          </button>



          <button

            onClick={() => setShowFavoritesOnly((prev) => !prev)}

            className={`p-1 rounded cursor-pointer border border-[#2b2f3a] transition flex items-center gap-1 text-[10px] ${

              showFavoritesOnly ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-[#181a20] text-gray-400'

            }`}

          >

            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />

          </button>



          {/* Page size limit */}

          <select

            value={settings.galleryPageSize || 24}

            onChange={(e) => {

              updateSettings({ galleryPageSize: Number(e.target.value) });

              setGalleryCurrentPage(1);

            }}

            className="bg-[#181a20] border border-[#2b2f3a] text-gray-300 text-[10px] rounded px-1 py-0.5 outline-none font-mono cursor-pointer"

          >

            <option value={12}>12 / p</option>

            <option value={24}>24 / p</option>

            <option value={48}>48 / p</option>

            <option value={96}>96 / p</option>

          </select>



          <div className="flex items-center bg-[#0d0e14] border border-white/10 rounded-lg p-0.5">

            <button

              type="button"

              onClick={() => setViewMode('cards')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'cards' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Cards View"

            >

              <Grid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('compact')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'compact' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="Compact View"

            >

              <LayoutGrid className="w-3.5 h-3.5" />

            </button>

            <button

              type="button"

              onClick={() => setViewMode('list')}

              className={`p-1 rounded cursor-pointer transition ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'}`}

              title="List View"

            >

              <List className="w-3.5 h-3.5" />

            </button>

          </div>

        </div>

      </div>



      <div

        className={`flex-1 overflow-y-auto pr-1 content-start ${

          viewMode === 'cards'

            ? 'grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5'

            : viewMode === 'compact'

            ? 'grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2'

            : 'flex flex-col gap-1.5'

        }`}

      >

        {paginatedItems.length === 0 ? (

          <div className="col-span-full text-center py-8 text-gray-500 flex flex-col items-center gap-2">

            <span>No gallery images found for this view.</span>

            <button

              onClick={handleSyncServer}

              className="px-3 py-1 bg-amber-800/30 hover:bg-amber-800 text-indigo-200 rounded text-xs transition cursor-pointer"

            >

              Scan Server Output Folder

            </button>

          </div>

        ) : (

          paginatedItems.map((item, index) => {

            const finalImageUrl = resolveImageUrl(item.imageUrl);

            const modelBaseName = (item.params?.model || 'unknown').split('/').pop()?.replace(/\.[^/.]+$/, '');

            const modelColor = getModelColorStyle(modelBaseName);



            return (

              <div

                key={item.id || index}

                onClick={() => setParams({ activeImage: finalImageUrl })}

                onContextMenu={(e) => handleGalleryContextMenu(e, item)}

                className={`border border-white/10 bg-[#0c0e15] rounded-xl hover:border-cyan-400 cursor-pointer transition flex relative group shadow-sm ${

                  viewMode === 'cards'

                    ? 'flex-col p-2 gap-2 h-auto'

                    : viewMode === 'compact'

                    ? 'flex-col p-1.5 gap-1.5 h-auto'

                    : 'items-center gap-2.5 p-2 w-full'

                }`}

              >

                <div

                  className={`relative overflow-hidden rounded-lg bg-black/40 ${

                    viewMode === 'cards'

                      ? 'w-full aspect-square'

                      : viewMode === 'compact'

                      ? 'w-full aspect-square'

                      : 'w-12 h-12 shrink-0'

                  }`}

                >

                  <img

                    src={finalImageUrl}

                    onError={handleImageError}

                    alt="thumb"

                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"

                  />

                  <button

                    onClick={(e) => {

                      e.stopPropagation();

                      toggleFavorite(item.id);

                    }}

                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-gray-400 hover:text-amber-400 transition cursor-pointer z-10"

                  >

                    <Star className={`w-3 h-3 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />

                  </button>

                </div>



                {/* Compact view: Colored Model Tag */}

                {viewMode === 'compact' && (

                  <div className="w-full overflow-hidden px-0.5">

                    <span

                      className={`block truncate font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded border ${modelColor.bg} ${modelColor.text} ${modelColor.border}`}

                      title={modelBaseName}

                    >

                      {modelBaseName}

                    </span>

                  </div>

                )}



                {/* Cards & List view: Full metadata */}

                {viewMode !== 'compact' && (

                  <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                    <span className="text-[11px] text-gray-300 truncate font-mono" title={item.prompt}>

                      {item.prompt}

                    </span>

                    <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 mt-1 pt-1 border-t border-white/5">

                      <span

                        className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold truncate max-w-[120px] ${modelColor.bg} ${modelColor.text} ${modelColor.border}`}

                        title={item.params?.model}

                      >

                        {modelBaseName}

                      </span>

                      <span className="text-[9px] text-gray-500 font-mono mt-0.5">{item.createdAt}</span>

                    </div>

                  </div>

                )}

              </div>

            );

          })

        )}

      </div>



      {/* Pagination Footer */}

      {totalPages > 1 && (

        <div className="flex items-center justify-between pt-2 border-t border-[#252a35] text-[11px] font-mono shrink-0">

          <span className="text-gray-400">Page {safeCurrentPage} of {totalPages}</span>

          <div className="flex items-center gap-1">

            <button

              disabled={safeCurrentPage <= 1}

              onClick={() => setGalleryCurrentPage(safeCurrentPage - 1)}

              className="px-2 py-0.5 bg-[#181a20] hover:bg-[#252a36] disabled:opacity-40 border border-[#2b2f3a] rounded text-gray-300 cursor-pointer"

            >

              Prev

            </button>

            <button

              disabled={safeCurrentPage >= totalPages}

              onClick={() => setGalleryCurrentPage(safeCurrentPage + 1)}

              className="px-2 py-0.5 bg-[#181a20] hover:bg-[#252a36] disabled:opacity-40 border border-[#2b2f3a] rounded text-gray-300 cursor-pointer"

            >

              Next

            </button>

          </div>

        </div>

      )}



      <MetadataModal

        item={selectedMetaItem}

        onClose={() => setSelectedMetaItem(null)}

      />

    </div>

  );

};



/* =========================================================================

   5. IMAGE SEARCH, CONTROLNET, ADETAILER, PARAMS

   ========================================================================= */

const ImageSearchPanel: React.FC<IDockviewPanelProps> = () => {

  const { history, setParams, useGenerationParams, setComparisonImage, settings, setActiveContextMenu } = useAppStore(useShallow((s) => ({

    history: s.history, setParams: s.setParams, useGenerationParams: s.useGenerationParams, setComparisonImage: s.setComparisonImage,

    settings: s.settings, setActiveContextMenu: s.setActiveContextMenu,

  })));

  const [query, setQuery] = useState('');



  const filtered = history.filter(

    (h) => h.prompt.toLowerCase().includes(query.toLowerCase()) || h.params.model.toLowerCase().includes(query.toLowerCase())

  );



  const handleSearchContextMenu = (e: React.MouseEvent, item: HistoryItem) => {

    e.preventDefault();

    e.stopPropagation();



    const items: ContextMenuItem[] = [

      {

        label: 'Use generation params',

        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,

        action: () => useGenerationParams(item)

      },

      {

        label: 'Set as Comparison Image (B)',

        icon: <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />,

        action: () => setComparisonImage(item.imageUrl)

      },

      {

        label: 'View in Viewport Canvas',

        icon: <Maximize2 className="w-3.5 h-3.5" />,

        action: () => setParams({ activeImage: item.imageUrl })

      },

    ];



    setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Image Metadata', items });

  };



  return (

    <div

      className="h-full p-3 bg-[#10131a] flex flex-col gap-2.5 text-xs select-none overflow-hidden"

      style={{ zoom: `${settings.sectionScales.imagesearch}%` }}

    >

      <div className="relative">

        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />

        <input

          type="text"

          value={query}

          onChange={(e) => setQuery(e.target.value)}

          placeholder="Search metadata across generated history..."

          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded pl-8 pr-2 py-1 text-xs text-gray-200 outline-none focus:border-indigo-500"

        />

      </div>



      <div className="flex-1 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5 overflow-y-auto pr-1 content-start">

        {filtered.length === 0 ? (

          <span className="text-gray-600 m-auto col-span-full py-8 text-center">No matching items found.</span>

        ) : (

          filtered.map((item) => (

            <div

              key={item.id}

              onClick={() => setParams({ activeImage: resolveImageUrl(item.imageUrl) })}

              onContextMenu={(e) => handleSearchContextMenu(e, item)}

              className="border border-white/10 bg-[#0c0e15] p-2 rounded-xl hover:border-cyan-400 cursor-pointer flex flex-col gap-1.5 transition shadow-sm"

            >

              <div className="w-full aspect-square overflow-hidden rounded-lg bg-black/40">

                <img

                  src={resolveImageUrl(item.imageUrl)}

                  onError={handleImageError}

                  alt="search thumb"
                  loading="lazy"
                  decoding="async"

                  className="w-full h-full object-cover"

                />

              </div>

              <span className="text-[10px] font-mono text-zinc-300 truncate">{item.prompt}</span>

            </div>

          ))

        )}

      </div>

    </div>

  );

};



const ControlNetPanel: React.FC<IDockviewPanelProps> = () => {

  const { controlNetUnits, updateControlNet, settings } = useAppStore(useShallow((s) => ({

    controlNetUnits: s.controlNetUnits, updateControlNet: s.updateControlNet, settings: s.settings,

  })));

  const [activeUnitId, setActiveUnitId] = useState('1');



  const activeUnit = controlNetUnits.find((u) => u.id === activeUnitId) || controlNetUnits[0];



  return (

    <div

      className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none"

      style={{ zoom: `${settings.sectionScales.controlnet}%` }}

    >

      <div className="flex gap-1 border-b border-[#252a35] pb-2">

        {controlNetUnits.map((unit) => (

          <button

            key={unit.id}

            onClick={() => setActiveUnitId(unit.id)}

            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 cursor-pointer ${

              activeUnitId === unit.id ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400'

            }`}

          >

            <span>Unit {unit.id}</span>

            {unit.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}

          </button>

        ))}

      </div>



      <div className="flex justify-between items-center bg-[#181a20] p-2 rounded border border-[#2b2f3a]">

        <label className="font-semibold text-gray-200 flex items-center gap-1.5">

          <Layers className="w-3.5 h-3.5 text-indigo-400" /> Enable Unit {activeUnit.id}

        </label>

        <input

          type="checkbox"

          checked={activeUnit.enabled}

          onChange={(e) => updateControlNet(activeUnit.id, { enabled: e.target.checked })}

          className="accent-indigo-500 w-4 h-4 cursor-pointer"

        />

      </div>



      <div className="grid grid-cols-2 gap-2">

        <div>

          <label className="text-gray-400 block mb-1">Preprocessor</label>

          <select

            value={activeUnit.preprocessor}

            onChange={(e) => updateControlNet(activeUnit.id, { preprocessor: e.target.value })}

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"

          >

            <option value="canny">Canny Edge</option>

            <option value="depth">Depth</option>

            <option value="openpose">OpenPose</option>

            <option value="lineart">LineArt</option>

          </select>

        </div>

        <div>

          <label className="text-gray-400 block mb-1">Control Mode</label>

          <select

            value={activeUnit.controlMode}

            onChange={(e) => updateControlNet(activeUnit.id, { controlMode: e.target.value as any })}

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none"

          >

            <option value="balanced">Balanced</option>

            <option value="prompt_priority">Prompt Priority</option>

            <option value="controlnet_priority">ControlNet Priority</option>

          </select>

        </div>

      </div>



      <div>

        <label className="text-gray-400 flex justify-between">

          <span>Weight</span>

          <span className="font-mono text-indigo-400">{activeUnit.weight}</span>

        </label>

        <input

          type="range"

          min="0"

          max="2"

          step="0.05"

          value={activeUnit.weight}

          onChange={(e) => updateControlNet(activeUnit.id, { weight: Number(e.target.value) })}

          className="w-full mt-1 accent-indigo-500"

        />

      </div>

    </div>

  );

};



const ADetailerPanel: React.FC<IDockviewPanelProps> = () => {

  const { aDetailerUnits, updateADetailer, settings, updateSettings, yoloModelsList } = useAppStore(useShallow((s) => ({

    aDetailerUnits: s.aDetailerUnits, updateADetailer: s.updateADetailer, settings: s.settings, updateSettings: s.updateSettings, yoloModelsList: s.yoloModelsList,

  })));

  const [activeId, setActiveId] = useState('1');



  const unit = aDetailerUnits.find((u) => u.id === activeId) || aDetailerUnits[0];



  return (

    <div

      className="h-full p-3 bg-[#121418] flex flex-col gap-3 text-xs overflow-y-auto select-none"

      style={{ zoom: `${settings.sectionScales.adetailer}%` }}

    >

      {/* Pass tabs */}

      <div className="flex gap-1 border-b border-[#252a35] pb-2">

        {aDetailerUnits.map((u) => (

          <button

            key={u.id}

            onClick={() => setActiveId(u.id)}

            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 cursor-pointer ${

              activeId === u.id ? 'bg-amber-700/70 text-amber-50 font-medium' : 'bg-[#181a20] text-gray-400 hover:text-gray-200'

            }`}

          >

            <span>Pass {u.id}</span>

            {u.enabled && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}

          </button>

        ))}

      </div>



      {/* Enable toggle */}

      <div className="flex justify-between items-center bg-[#181a20] p-2 rounded border border-[#2b2f3a]">

        <label className="font-semibold text-gray-200 flex items-center gap-1.5 cursor-pointer">

          <Sparkle className="w-3.5 h-3.5 text-amber-400" /> Enable Pass {unit.id}

        </label>

        <input

          type="checkbox"

          checked={unit.enabled}

          onChange={(e) => updateADetailer(unit.id, { enabled: e.target.checked })}

          className="accent-indigo-500 w-4 h-4 cursor-pointer"

        />

      </div>



      {/* Model selector */}

      <div>

        <label className="text-gray-400 block mb-1">Model Target (YOLO)</label>

        <select

          value={unit.model}

          onChange={(e) => updateADetailer(unit.id, { model: e.target.value })}

          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none font-mono"

        >

          {yoloModelsList.map((m) => (

            <option key={m} value={m}>{m}</option>

          ))}

        </select>

      </div>



      {/* Per-Pass Positive and Negative Prompt Textareas */}

      <div className="flex flex-col gap-2 border-t border-[#252a35] pt-2">

        <div>

          <label className="text-[11px] font-medium text-indigo-300 flex items-center justify-between mb-1">

            <span>Pass {unit.id} Positive Prompt Override</span>

            <span className="text-[10px] text-gray-500">Appends to pass</span>

          </label>

          <textarea

            rows={2}

            value={unit.prompt || ''}

            onChange={(e) => updateADetailer(unit.id, { prompt: e.target.value })}

            placeholder="e.g., highly detailed face, realistic eyes, soft smile"

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-2 text-xs text-gray-200 placeholder:text-gray-600 outline-none focus:border-indigo-500 font-mono resize-none"

          />

        </div>



        <div>

          <label className="text-[11px] font-medium text-rose-300 flex items-center justify-between mb-1">

            <span>Pass {unit.id} Negative Prompt Override</span>

            <span className="text-[10px] text-gray-500">Optional</span>

          </label>

          <textarea

            rows={1}

            value={unit.negativePrompt || ''}

            onChange={(e) => updateADetailer(unit.id, { negativePrompt: e.target.value })}

            placeholder="e.g., bad eyes, blurry, deformed pupils"

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-2 text-xs text-gray-400 placeholder:text-gray-600 outline-none focus:border-rose-500 font-mono resize-none"

          />

        </div>

      </div>



      {/* Save Before / After Comparison Feature */}

      <div className="flex justify-between items-center bg-[#181a20]/60 p-2 rounded border border-[#252a35]">

        <div className="flex flex-col">

          <span className="text-gray-200 font-medium">Keep Pre-ADetailer Image</span>

          <span className="text-[10px] text-gray-400">Saves both & auto-opens Split View slider</span>

        </div>

        <input

          type="checkbox"

          checked={settings.saveBeforeAfterADetailer}

          onChange={(e) => updateSettings({ saveBeforeAfterADetailer: e.target.checked })}

          className="accent-indigo-500 w-4 h-4 cursor-pointer"

        />

      </div>



      {/* Sliders */}

      <div>

        <label className="text-gray-400 flex justify-between">

          <span>Confidence Threshold</span>

          <span className="font-mono text-indigo-400">{unit.confidence}</span>

        </label>

        <input

          type="range"

          min="0.05"

          max="0.95"

          step="0.05"

          value={unit.confidence}

          onChange={(e) => updateADetailer(unit.id, { confidence: Number(e.target.value) })}

          className="w-full mt-1 accent-indigo-500"

        />

      </div>



      <div>

        <label className="text-gray-400 flex justify-between">

          <span>Denoising Strength</span>

          <span className="font-mono text-indigo-400">{unit.denoiseStrength}</span>

        </label>

        <input

          type="range"

          min="0.1"

          max="0.8"

          step="0.05"

          value={unit.denoiseStrength}

          onChange={(e) => updateADetailer(unit.id, { denoiseStrength: Number(e.target.value) })}

          className="w-full mt-1 accent-indigo-500"

        />

      </div>



      <div>

        <label className="text-gray-400 flex justify-between">

          <span>Inpaint Steps</span>

          <span className="font-mono text-indigo-400">{unit.steps ?? 16}</span>

        </label>

        <input

          type="range"

          min="5"

          max="50"

          step="1"

          value={unit.steps ?? 16}

          onChange={(e) => updateADetailer(unit.id, { steps: Number(e.target.value) })}

          className="w-full mt-1 accent-indigo-500"

        />

      </div>



      {/* Mask Settings */}

      <div className="grid grid-cols-2 gap-2">

        <div>

          <label className="text-gray-400 flex justify-between">

            <span>Mask Grow (px)</span>

            <span className="font-mono text-indigo-400">{unit.maskGrow ?? 4}</span>

          </label>

          <input

            type="number"

            min="0"

            max="64"

            value={unit.maskGrow ?? 4}

            onChange={(e) => updateADetailer(unit.id, { maskGrow: Number(e.target.value) })}

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1 text-gray-200 font-mono mt-1"

          />

        </div>

        <div>

          <label className="text-gray-400 flex justify-between">

            <span>Mask Blur (px)</span>

            <span className="font-mono text-indigo-400">{unit.maskBlur ?? 4}</span>

          </label>

          <input

            type="number"

            min="0"

            max="64"

            value={unit.maskBlur ?? 4}

            onChange={(e) => updateADetailer(unit.id, { maskBlur: Number(e.target.value) })}

            className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1 text-gray-200 font-mono mt-1"

          />

        </div>

      </div>



      <div>

        <label className="text-gray-400 flex justify-between">

          <span>Context Oversize (%)</span>

          <span className="font-mono text-indigo-400">{unit.maskOversize ?? 10}%</span>

        </label>

        <input

          type="range"

          min="0"

          max="50"

          step="5"

          value={unit.maskOversize ?? 10}

          onChange={(e) => updateADetailer(unit.id, { maskOversize: Number(e.target.value) })}

          className="w-full mt-1 accent-indigo-500"

        />

      </div>



      {/* Detection Sorting Order */}

      <div>

        <label className="text-gray-400 block mb-1">Multi-Detection Order</label>

        <select

          value={unit.sortOrder ?? 'largest-smallest'}

          onChange={(e) => updateADetailer(unit.id, { sortOrder: e.target.value as any })}

          className="w-full bg-[#181a20] border border-[#2b2f3a] rounded p-1.5 text-gray-200 outline-none font-mono"

        >

          <option value="largest-smallest">Largest to Smallest</option>

          <option value="smallest-largest">Smallest to Largest</option>

          <option value="left-right">Left to Right</option>

          <option value="right-left">Right to Left</option>

          <option value="top-bottom">Top to Bottom</option>

          <option value="bottom-top">Bottom to Top</option>

        </select>

      </div>



      {/* Mask Debug Export Toggle */}

      <div className="flex justify-between items-center bg-[#181a20]/60 p-2 rounded border border-[#252a35]">

        <div className="flex flex-col">

          <span className="text-gray-200 font-medium">Save Debug Mask</span>

          <span className="text-[10px] text-gray-400">Outputs generated binary segment mask to history</span>

        </div>

        <input

          type="checkbox"

          checked={unit.saveMask ?? false}

          onChange={(e) => updateADetailer(unit.id, { saveMask: e.target.checked })}

          className="accent-indigo-500 w-4 h-4 cursor-pointer"

        />

      </div>

    </div>

  );

};



const ParamsPanel: React.FC<IDockviewPanelProps> = () => {

  const {
    steps, cfgScale, width, height, seed, sampler, scheduler, model, modelsList, vae, vaesList,
    textEncodersList = [], selectedTextEncoders = [], setParams, setModel, loadAssets, history = []
  } = useAppStore(useShallow((s) => ({
    steps: s.steps, cfgScale: s.cfgScale, width: s.width, height: s.height, seed: s.seed, sampler: s.sampler,
    scheduler: s.scheduler, model: s.model, modelsList: s.modelsList, vae: s.vae, vaesList: s.vaesList,
    textEncodersList: s.textEncodersList, selectedTextEncoders: s.selectedTextEncoders, setParams: s.setParams,
    setModel: s.setModel, loadAssets: s.loadAssets, history: s.history,
  })));



  const [collapsed, setCollapsed] = useState({ model: false, dimensions: false, sampler: false });

  const [lockedParams, setLockedParams] = useState<Record<string, boolean>>(() => {

    try { return JSON.parse(localStorage.getItem('swarm_parameter_locks_v1') || '{}'); } catch { return {}; }

  });



  useEffect(() => {

    try { localStorage.setItem('swarm_parameter_locks_v1', JSON.stringify(lockedParams)); } catch {}

  }, [lockedParams]);



  const toggleParamLock = (key: string) => setLockedParams((prev) => ({ ...prev, [key]: !prev[key] }));

  const updateUnlocked = (key: string, value: unknown) => { if (!lockedParams[key]) setParams({ [key]: value } as any); };

  const randomSeed = () => updateUnlocked('seed', Math.floor(Math.random() * 2147483647));

  const reuseLastSeed = () => {

    const previous = (history as HistoryItem[]).find((item) => typeof item.params.seed === 'number' && Number(item.params.seed) >= 0)?.params.seed;

    if (typeof previous === 'number') updateUnlocked('seed', previous);

  };

  const stepSeed = (delta: number) => updateUnlocked('seed', Math.max(0, (Number(seed) >= 0 ? Number(seed) : 0) + delta));

  const LockButton = ({ id }: { id: string }) => (

    <button type="button" onClick={() => toggleParamLock(id)} className={`p-0.5 rounded transition ${lockedParams[id] ? 'text-amber-300 bg-amber-900/20' : 'text-zinc-600 hover:text-zinc-300'}`} title={lockedParams[id] ? `Unlock ${id}` : `Lock ${id}`}>

      {lockedParams[id] ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}

    </button>

  );

  const [isTeDropdownOpen, setIsTeDropdownOpen] = useState(false);

  const [teSearchQuery, setTeSearchQuery] = useState('');

  const teDropdownRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    const handleClickOutside = (e: MouseEvent) => {

      if (teDropdownRef.current && !teDropdownRef.current.contains(e.target as Node)) {

        setIsTeDropdownOpen(false);

      }

    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);



  const handleToggleTextEncoder = (teName: string) => {

    let nextList: string[];

    if (selectedTextEncoders.includes(teName)) {

      nextList = selectedTextEncoders.filter((item: string) => item !== teName);

    } else {

      nextList = [...selectedTextEncoders, teName];

    }



    setParams({

      selectedTextEncoders: nextList,

      textEncoder: nextList[0] || 'Automatic',

      textEncoder2: nextList[1] || 'None',

    });

  };



  return (

    <div className="h-full p-3 flex flex-col gap-2.5 text-xs overflow-y-auto select-none bg-[#090a0f]">

      {/* Checkpoint Selection Card */}

      <div className="bg-[#0f1117] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5 shadow-sm">

        <div className="flex justify-between items-center cursor-pointer" onClick={() => setCollapsed((p) => ({ ...p, model: !p.model }))}>

          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">

            <Box className="w-3.5 h-3.5 text-amber-400" /> Active Model <InfoPopover content="Select the checkpoint used for new generations. Model-linked prompt presets can be applied automatically from Studio Tools." side="right" />

          </span>

          <div className="flex items-center gap-1">

            <button

              onClick={(e) => { e.stopPropagation(); loadAssets(); }}

              className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-cyan-300 transition"

              title="Refresh Models"

            >

              <RotateCw className="w-3 h-3" />

            </button>

            {collapsed.model ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />}

          </div>

        </div>



        {!collapsed.model && (

          <div className="relative">

            <select

              value={model}

              onChange={(e) => setModel(e.target.value)}

              className="w-full bg-[#141722] border border-white/10 hover:border-cyan-500/40 focus:border-cyan-400 rounded-lg p-2.5 text-zinc-100 outline-none font-mono text-xs cursor-pointer transition truncate pr-8"

            >

              {(() => {

                const grouped = (modelsList as ModelItem[]).reduce((acc: Record<string, ModelItem[]>, m: ModelItem) => {

                  const parts = m.name.split('/');

                  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';

                  if (!acc[folder]) acc[folder] = [];

                  acc[folder].push(m);

                  return acc;

                }, {} as Record<string, ModelItem[]>);



                return Object.entries(grouped).map(([folder, items]: [string, ModelItem[]]) => (

                  <optgroup key={folder} label={`📁 ${folder}`} className="bg-[#0f1118] text-amber-400 font-bold">

                    {items.map((m: ModelItem) => (

                      <option key={m.name} value={m.name} className="bg-[#141722] text-zinc-200 font-normal">

                        {m.name.split('/').pop()?.replace(/\.[^/.]+$/, '')}

                      </option>

                    ))}

                  </optgroup>

                ));

              })()}

            </select>



            {/* VAE & Multi-Select Text Encoders */}

            <div className="flex flex-col gap-2.5 pt-2 mt-2 border-t border-white/5 font-mono">

              <div>

                <label className="text-zinc-400 text-[10px] block mb-1">VAE</label>

                <select

                  value={vae}

                  onChange={(e) => setParams({ vae: e.target.value })}

                  className="w-full bg-[#141722] border border-white/10 hover:border-cyan-500/40 focus:border-cyan-400 rounded-lg p-2 text-zinc-200 outline-none text-xs cursor-pointer truncate"

                >

                  {((vaesList && vaesList.length > 0 ? vaesList : ['Automatic', 'None', 'qwen_image_vae.safetensors']) as string[]).map((v: string) => (

                    <option key={v} value={v} className="bg-[#141722] text-zinc-200">

                      {v.split('/').pop()?.replace(/\.[^/.]+$/, '')}

                    </option>

                  ))}

                </select>

              </div>



              {/* Tag Multi-Select Box */}

              <div className="relative flex flex-col gap-1" ref={teDropdownRef}>

                <div className="flex items-center justify-between text-[10px] text-zinc-400">

                  <span>TEXT ENCODERS ({selectedTextEncoders.length} selected)</span>

                  {selectedTextEncoders.length > 0 && (

                    <button

                      type="button"

                      onClick={() => setParams({ selectedTextEncoders: [], textEncoder: 'Automatic', textEncoder2: 'None' })}

                      className="text-zinc-500 hover:text-rose-400 cursor-pointer transition text-[9px]"

                    >

                      Clear

                    </button>

                  )}

                </div>



                {/* Input Container with Embedded Tags */}

                <div

                  onClick={() => setIsTeDropdownOpen(true)}

                  className={`min-h-[38px] w-full bg-[#141722] border rounded-lg p-1.5 flex flex-wrap items-center gap-1.5 cursor-text transition ${

                    isTeDropdownOpen ? 'border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.25)]' : 'border-white/10 hover:border-white/20'

                  }`}

                >

                  {selectedTextEncoders.map((te: string) => {

                    const shortName = te.split('/').pop()?.replace(/\.[^/.]+$/, '') || te;

                    return (

                      <span

                        key={te}

                        className="inline-flex items-center gap-1.5 bg-[#1b2030] text-cyan-200 border border-cyan-500/40 px-2 py-0.5 rounded text-[11px] font-mono shadow-xs select-none"

                      >

                        <span className="truncate max-w-[130px]" title={te}>{shortName}</span>

                        <button

                          type="button"

                          onClick={(e) => {

                            e.stopPropagation();

                            handleToggleTextEncoder(te);

                          }}

                          className="hover:text-rose-300 text-zinc-400 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] cursor-pointer"

                        >

                          ✕

                        </button>

                      </span>

                    );

                  })}



                  <input

                    type="text"

                    value={teSearchQuery}

                    onChange={(e) => {

                      setTeSearchQuery(e.target.value);

                      setIsTeDropdownOpen(true);

                    }}

                    onFocus={() => setIsTeDropdownOpen(true)}

                    placeholder={selectedTextEncoders.length === 0 ? "Select text encoders..." : ""}

                    className="flex-1 min-w-[80px] bg-transparent outline-none text-zinc-200 text-xs placeholder:text-zinc-500 font-mono px-1 py-0.5"

                  />



                  <div className="ml-auto flex items-center pr-1 pointer-events-none text-zinc-500">

                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isTeDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />

                  </div>

                </div>



                {/* Dropdown Menu Overlay */}

                {isTeDropdownOpen && (

                  <div className="absolute top-full left-0 right-0 mt-1 max-h-52 bg-[#0c0e16] border border-white/15 rounded-xl shadow-2xl overflow-y-auto z-50 divide-y divide-white/5 py-1">

                    {(() => {

                      const allAvailable = Array.from(new Set([

                        'qwen_3_06b_base.safetensors',

                        'qwen35_4b.safetensors',

                        ...textEncodersList.filter((t: string) => t !== 'Automatic' && t !== 'None')

                      ]));



                      const filtered = allAvailable.filter((item: string) =>

                        item.toLowerCase().includes(teSearchQuery.toLowerCase())

                      );



                      if (filtered.length === 0) {

                        return (

                          <div className="p-3 text-center text-zinc-500 text-xs font-mono">

                            No matching text encoders found

                          </div>

                        );

                      }



                      return filtered.map((te: string) => {

                        const isChecked = selectedTextEncoders.includes(te);

                        const displayName = te.split('/').pop()?.replace(/\.[^/.]+$/, '') || te;



                        return (

                          <div

                            key={te}

                            onClick={() => handleToggleTextEncoder(te)}

                            className={`px-3 py-2 flex items-center justify-between text-xs font-mono cursor-pointer transition ${

                              isChecked

                                ? 'bg-cyan-950/40 text-cyan-300'

                                : 'text-zinc-300 hover:bg-white/5 hover:text-white'

                            }`}

                          >

                            <div className="flex items-center gap-2 truncate">

                              <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${

                                isChecked

                                  ? 'bg-cyan-500 border-cyan-400 text-black font-extrabold text-[10px]'

                                  : 'border-white/20 bg-black/40'

                              }`}>

                                {isChecked && '✓'}

                              </span>

                              <span className="truncate" title={te}>{displayName}</span>

                            </div>

                            <span className="text-[9px] text-zinc-600 truncate ml-2 font-mono">

                              {te.endsWith('.safetensors') ? '.safetensors' : ''}

                            </span>

                          </div>

                        );

                      });

                    })()}

                  </div>

                )}

              </div>

            </div>

          </div>

        )}

      </div>



      {/* Dimensions & Sampling Card */}

      <div className="bg-[#0f1117] border border-white/10 rounded-xl p-3 flex flex-col gap-3 shadow-sm">

        <div className="flex justify-between items-center cursor-pointer" onClick={() => setCollapsed((p) => ({ ...p, dimensions: !p.dimensions }))}>

          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">

            <Crop className="w-3.5 h-3.5 text-amber-400" /> Dimensions & Steps <InfoPopover content="Width and height define the output canvas. Steps controls the number of sampling iterations." side="right" />

          </span>

          <span className="font-mono text-cyan-300 text-[10px] bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-md font-semibold">

            {width} × {height}

          </span>

        </div>



        {!collapsed.dimensions && (

          <>

            <div className="grid grid-cols-2 gap-2 pt-0.5">

              <div>

                <div className="flex items-center justify-between mb-1"><label className="text-zinc-400 text-[10px] font-mono">WIDTH</label><LockButton id="width" /></div>

                <input

                  type="number"

                  value={width}

                  step="64"

                  onChange={(e) => updateUnlocked('width', Number(e.target.value))}

                  className="w-full bg-[#141722] border border-white/10 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-zinc-100 font-mono font-medium outline-none"

                />

              </div>

              <div>

                <div className="flex items-center justify-between mb-1"><label className="text-zinc-400 text-[10px] font-mono">HEIGHT</label><LockButton id="height" /></div>

                <input

                  type="number"

                  value={height}

                  step="64"

                  onChange={(e) => updateUnlocked('height', Number(e.target.value))}

                  className="w-full bg-[#141722] border border-white/10 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-zinc-100 font-mono font-medium outline-none"

                />

              </div>

            </div>



            <div className="space-y-1.5">

              <div className="flex justify-between items-center">

                <div className="flex items-center gap-1"><span className="text-zinc-400 text-xs">Steps</span><LockButton id="steps" /></div>

                <span className="font-mono text-zinc-200 text-xs font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10">

                  {steps}

                </span>

              </div>

              <input

                type="range"

                min="1"

                max="60"

                value={steps}

                onChange={(e) => updateUnlocked('steps', Number(e.target.value))}

                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"

              />

            </div>



            <div className="space-y-1.5">

              <div className="flex justify-between items-center">

                <div className="flex items-center gap-1"><span className="text-zinc-400 text-xs">CFG Scale</span><LockButton id="cfgScale" /></div>

                <span className="font-mono text-zinc-200 text-xs font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10">

                  {cfgScale}

                </span>

              </div>

              <input

                type="range"

                min="1"

                max="20"

                step="0.5"

                value={cfgScale}

                onChange={(e) => updateUnlocked('cfgScale', Number(e.target.value))}

                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"

              />

            </div>

          </>

        )}

      </div>



      {/* Sampler & Seed Card */}

      <div className="bg-[#0f1117] border border-white/10 rounded-xl p-3 flex flex-col gap-3 shadow-sm">

        <div className="flex justify-between items-center cursor-pointer" onClick={() => setCollapsed((p) => ({ ...p, sampler: !p.sampler }))}>

          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">

            <Sliders className="w-3.5 h-3.5 text-amber-400" /> Sampling & Seed <InfoPopover content="Sampler, scheduler, CFG and seed influence the stochastic sampling process." side="right" />

          </span>

          <span className="font-mono text-zinc-400 text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">

            {seed === -1 ? 'Random' : seed}

          </span>

        </div>



        {!collapsed.sampler && (

          <div className="space-y-2.5 pt-0.5">

            <div className="grid grid-cols-2 gap-2">

              <div>

                <div className="flex items-center justify-between mb-1"><label className="text-zinc-400 text-[10px] font-mono">SAMPLER</label><LockButton id="sampler" /></div>

                <select

                  value={sampler}

                  onChange={(e) => updateUnlocked('sampler', e.target.value)}

                  className="w-full bg-[#141722] border border-white/10 focus:border-cyan-400 rounded-lg p-2 text-zinc-200 font-mono text-xs outline-none cursor-pointer"

                >

                  {SWARM_VALID_SAMPLERS.map((s) => (

                    <option key={s.id} value={s.id} className="bg-[#141722]">{s.label}</option>

                  ))}

                </select>

              </div>

              <div>

                <div className="flex items-center justify-between mb-1"><label className="text-zinc-400 text-[10px] font-mono">SCHEDULER</label><LockButton id="scheduler" /></div>

                <select

                  value={scheduler}

                  onChange={(e) => updateUnlocked('scheduler', e.target.value)}

                  className="w-full bg-[#141722] border border-white/10 focus:border-cyan-400 rounded-lg p-2 text-zinc-200 font-mono text-xs outline-none cursor-pointer"

                >

                  {SWARM_VALID_SCHEDULERS.map((sc) => (

                    <option key={sc} value={sc}>{sc === 'normal' ? 'Automatic' : sc}</option>

                  ))}

                </select>

              </div>

            </div>



            <div>

              <div className="flex items-center justify-between mb-1"><label className="text-zinc-400 text-[10px] font-mono">SEED (-1 = Randomize)</label><LockButton id="seed" /></div>

              <input

                type="number"

                value={seed}

                onChange={(e) => updateUnlocked('seed', Number(e.target.value))}

                className="w-full bg-[#141722] border border-white/10 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs outline-none"

              />

            </div>

            <div className="flex items-center gap-1.5">

              <button type="button" onClick={randomSeed} className="sc-action-button sc-action-neutral" title="Generate a random seed"><Dices className="w-3 h-3" /> Random</button>

              <button type="button" onClick={reuseLastSeed} className="sc-action-button sc-action-info" title="Reuse the most recent non-random seed"><RotateCw className="w-3 h-3" /> Reuse</button>

              <button type="button" onClick={() => stepSeed(-1)} className="sc-action-button sc-action-neutral" title="Decrease seed by 1">−1</button>

              <button type="button" onClick={() => stepSeed(1)} className="sc-action-button sc-action-neutral" title="Increase seed by 1">+1</button>

            </div>

          </div>

        )}

      </div>

    </div>

  );

};



/* =========================================================================

   6. MAIN WORKSPACE CONTAINER

   ========================================================================= */

const withPanelBoundary = (name: string, Component: React.ComponentType<any>) => (props: any) => (

  <PanelErrorBoundary name={name}><Component {...props} /></PanelErrorBoundary>

);



const components = {

  params: withPanelBoundary('Parameters', ParamsPanel),

  preview: withPanelBoundary('Viewport', PreviewPanel),

  extranetworks: withPanelBoundary('Extra Networks', ExtraNetworksPanel),

  civitailibrary: withPanelBoundary('Civitai Library', CivitaiLibraryPanel),
  studioutils: withPanelBoundary('Studio Tools', StudioToolsPanel),

  controlnet: withPanelBoundary('ControlNet', ControlNetPanel),

  adetailer: withPanelBoundary('ADetailer', ADetailerPanel),

  history: withPanelBoundary('History', HistoryPanel),

  gallery: withPanelBoundary('Gallery', GalleryPanel),

  imagesearch: withPanelBoundary('Image Search', ImageSearchPanel),

  scenestager: withPanelBoundary('Visual Scene Stager', VisualSceneStager),

  latentsynthesizer: withPanelBoundary('Latent Synthesizer', LatentSynthesizer),

  characterdossier: withPanelBoundary('Character Dossier', CharacterDossier),

  artdirector: withPanelBoundary('Art Director', ArtDirectorCopilot),

  morphscheduler: withPanelBoundary('Prompt Morph Scheduler', PromptMorphScheduler),

  tagsynergy: withPanelBoundary('Tag Synergy', TagSynergyEngine),

  wildcardslot: withPanelBoundary('Wildcard Slots', WildcardSlotMachine),

  tagrarity: withPanelBoundary('Tag Rarity', TagRarityInspector),

};



if (typeof window !== 'undefined' && !(window as any).__swarm_perf) {

  (window as any).__swarm_perf = {

    timings: {} as Record<string, { count: number; totalTime: number; avgTime: number; maxTime: number; lastTime: number }>,

    mark(name: string, fn: () => void) {

      const start = performance.now();

      fn();

      const duration = performance.now() - start;

      const entry = this.timings[name] || { count: 0, totalTime: 0, avgTime: 0, maxTime: 0, lastTime: 0 };

      entry.count += 1;

      entry.totalTime += duration;

      entry.lastTime = Number(duration.toFixed(2));

      entry.maxTime = Math.max(entry.maxTime, Number(duration.toFixed(2)));

      entry.avgTime = Number((entry.totalTime / entry.count).toFixed(2));

      this.timings[name] = entry;

    }

  };

}



const THEME_LABELS: Record<string, string> = {
  obsidian: 'Obsidian', arctic: 'Arctic', paper: 'Paper', terminal: 'Terminal', midnight: 'Midnight', forest: 'Forest',
  clay: 'Clay', mono: 'Monochrome', contrast: 'High Contrast', nord: 'Nord', dracula: 'Dracula', solarized: 'Solarized',
  rose: 'Rose', coffee: 'Coffeehouse', matrix: 'Matrix', sunset: 'Sunset',
};

export const Workspace: React.FC = () => {

  const {
    settings, updateSettings, setSectionScale, setPrompt, setNegativePrompt, activeContextMenu,
    setActiveContextMenu, isGenerating, isConnected, queue, activeJob, modelsList, cancelGeneration,
    enqueueAndProcess, queueCurrentGeneration
  } = useAppStore(useShallow((s) => ({
    settings: s.settings, updateSettings: s.updateSettings, setSectionScale: s.setSectionScale, setPrompt: s.setPrompt,
    setNegativePrompt: s.setNegativePrompt, activeContextMenu: s.activeContextMenu, setActiveContextMenu: s.setActiveContextMenu,
    isGenerating: s.isGenerating, isConnected: s.isConnected, queue: s.queue, activeJob: s.activeJob, modelsList: s.modelsList,
    cancelGeneration: s.cancelGeneration, enqueueAndProcess: s.enqueueAndProcess, queueCurrentGeneration: s.queueCurrentGeneration,
  })));



  const resolvedTheme = settings.uiTheme === 'cyber_black' ? 'obsidian' : settings.uiTheme === 'classic' ? 'paper' : settings.uiTheme;
  const fontScale = Math.min(140, Math.max(80, Number(settings.fontScale) || 100));
  const themeLabel = THEME_LABELS[resolvedTheme] || resolvedTheme;

  useEffect(() => {
    document.documentElement.style.setProperty('--sc-font-scale', String(fontScale / 100));
    document.documentElement.dataset.uiTheme = resolvedTheme;
    document.documentElement.style.colorScheme = ['arctic', 'paper', 'nord', 'solarized'].includes(resolvedTheme) ? 'light' : 'dark';
  }, [fontScale, resolvedTheme]);

  const queuedCount = queue.length + (activeJob ? 1 : 0);

  const modelCount = modelsList.length;

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({

    bottomTray: false,

  });



  const toggleSectionCollapse = (key: string) => {

    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  };



  const [showConsole, setShowConsole] = useState(false);

  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [isReconnecting, setIsReconnecting] = useState(false);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const probeConnection = async () => {

    if (isReconnecting) return;

    setIsReconnecting(true);

    emitDiagnostic({ level: 'info', scope: 'connection', message: 'Checking backend connection after focus/network activity.' });

    try {

      const healthy = await swarmClient.testConnection();

      useAppStore.setState({ isConnected: healthy });

      if (healthy) {

        emitToast('Backend connection restored', 'success');

        void useAppStore.getState().loadAssets();

      } else {

        emitToast('Backend is still unavailable', 'warning');

      }

    } finally {

      setIsReconnecting(false);

    }

  };



  useEffect(() => {

    const onWake = () => {

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      reconnectTimerRef.current = setTimeout(() => void probeConnection(), 350);

    };

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') onWake(); };

    window.addEventListener('focus', onWake);

    window.addEventListener('online', onWake);

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {

      window.removeEventListener('focus', onWake);

      window.removeEventListener('online', onWake);

      document.removeEventListener('visibilitychange', onVisibilityChange);

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    };

  }, [isReconnecting]);

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: 'success' | 'info' | 'warning' | 'error' }>>([]);

  const [mobileActiveTab, setMobileActiveTab] = useState<'canvas' | 'prompts' | 'params' | 'history'>('canvas');
  const [isPresetStripCollapsed, setIsPresetStripCollapsed] = useState<boolean>(() => localStorage.getItem('swarm_preset_strip_collapsed_v1') === '1');
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('swarm_preset_strip_collapsed_v1', isPresetStripCollapsed ? '1' : '0');
  }, [isPresetStripCollapsed]);



  useEffect(() => {

    const onToast = (event: Event) => {

      const detail = (event as CustomEvent<{ message?: string; tone?: 'success' | 'info' | 'warning' | 'error' }>).detail || {};

      if (!detail.message) return;

      const id = Date.now() + Math.floor(Math.random() * 1000);

      const tone = detail.tone || 'info';

      setToasts((prev) => [...prev.slice(-4), { id, message: detail.message!, tone }]);

      window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4200);

    };

    window.addEventListener('swarm-toast', onToast as EventListener);

    return () => window.removeEventListener('swarm-toast', onToast as EventListener);

  }, []);



  useEffect(() => {

    const onShortcut = (event: KeyboardEvent) => {

      const target = event.target as HTMLElement | null;

      const editing = !!target?.closest('input, textarea, select, [contenteditable="true"]');

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {

        event.preventDefault();

        setShowCommandPalette(true);

        return;

      }

      if (event.key === 'Escape') {

        if (showCommandPalette) setShowCommandPalette(false);

        return;

      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !editing) {

        event.preventDefault();

        void enqueueAndProcess();

      }

      if (event.key.toLowerCase() === 'f' && !editing) {

        // The viewport owns fit-to-screen; dispatch a lightweight command event for it.

        window.dispatchEvent(new Event('swarm-fit-viewport'));

      }

    };

    window.addEventListener('keydown', onShortcut);

    return () => window.removeEventListener('keydown', onShortcut);

  }, [enqueueAndProcess, showCommandPalette]);



  useEffect(() => {

    // Lightweight performance registry. DebugConsole owns actual console subscriptions.

    (window as any).__swarm_perf = {

      timings: {} as Record<string, { count: number; totalTime: number; avgTime: number; maxTime: number; lastTime: number }>,

      mark(name: string, fn: () => void) {

        const start = performance.now();

        fn();

        const duration = performance.now() - start;

        const entry = this.timings[name] || { count: 0, totalTime: 0, avgTime: 0, maxTime: 0, lastTime: 0 };

        entry.count += 1;

        entry.totalTime += duration;

        entry.lastTime = Number(duration.toFixed(2));

        entry.maxTime = Math.max(entry.maxTime, Number(duration.toFixed(2)));

        entry.avgTime = Number((entry.totalTime / entry.count).toFixed(2));

        this.timings[name] = entry;

      }

    };

    return () => {

      delete (window as any).__swarm_perf;

    };

  }, []);



  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);

  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);

  const [showAddMenu, setShowAddMenu] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [activeScaleSection, setActiveScaleSection] = useState<keyof AppSettings['sectionScales']>('pills');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const savedSidebarWidth = useRef(320);



  const [triggerPos, setTriggerPos] = useState({ x: 12, y: 12 });

  const isDraggingTrigger = useRef(false);

  const dragTriggerOffset = useRef({ x: 0, y: 0 });



  useEffect(() => {

    void useAppStore.getState().loadAssets();

  }, []);



  const [bottomHeight, setBottomHeight] = useState(settings.bottomPanelHeight || 340);

  const bottomHeightRef = useRef(settings.bottomPanelHeight || 340);

  const isResizingBottom = useRef(false);



  useEffect(() => {

    const handleGlobalContextMenu = (e: MouseEvent) => {

      const target = e.target as HTMLElement | null;

      if (target?.closest('input, textarea, [contenteditable=\"true\"], select')) return;

      e.preventDefault();

      const items: ContextMenuItem[] = [

        {

          label: 'Clear Positive Prompt',

          icon: <Trash2 className="w-3.5 h-3.5" />,

          action: () => setPrompt('')

        },

        {

          label: 'Clear Negative Prompt',

          icon: <Trash2 className="w-3.5 h-3.5" />,

          action: () => setNegativePrompt('')

        },

        {

          separator: true,

          label: 'Reload Asset Catalogs',

          icon: <RotateCw className="w-3.5 h-3.5" />,

          action: () => useAppStore.getState().loadAssets()

        }

      ];

      setActiveContextMenu({ x: e.clientX, y: e.clientY, title: 'Workspace Actions', items });

    };



    window.addEventListener('contextmenu', handleGlobalContextMenu);

    return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);

  }, [setPrompt, setNegativePrompt, setActiveContextMenu]);



  const onReady = (event: DockviewReadyEvent) => {

    setDockApi(event.api);



    const savedLayout = localStorage.getItem('swarm_dockview_layout');

    if (savedLayout && settings.autoSaveLayout) {

      try {

        event.api.fromJSON(JSON.parse(savedLayout));

        return;

      } catch (e) {

        console.warn('Could not restore dockview layout from cache:', e);

      }

    }



    applyLayoutPreset(settings.activePreset, event.api);

  };



  const applyLayoutPreset = (presetName: AppSettings['activePreset'], api = dockApi) => {

    if (!api) return;

    api.clear();

    let presetBottomHeight = 340;



    if (presetName === 'Prompt Engineer') {

      presetBottomHeight = 520;

      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 280 });

      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: params, direction: 'right' } });

      api.addPanel({ id: 'extranetworks_panel', component: 'extranetworks', title: 'Extra Networks', position: { referencePanel: params, direction: 'within' } });

    } else if (presetName === 'Studio Canvas') {

      presetBottomHeight = 220;

      const preview = api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport' });

      api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', position: { referencePanel: preview, direction: 'left' }, initialWidth: 300 });

    } else if (presetName === 'Multi-ControlNet') {

      presetBottomHeight = 300;

      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 300 });

      const cnet = api.addPanel({ id: 'controlnet_panel', component: 'controlnet', title: 'ControlNet', position: { referencePanel: params, direction: 'right' }, initialWidth: 320 });

      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: cnet, direction: 'right' } });

    } else {

      setBottomHeight(340);

      const params = api.addPanel({ id: 'params_panel', component: 'params', title: 'Parameters', initialWidth: 320 });

      api.addPanel({ id: 'preview_panel', component: 'preview', title: 'Viewport', position: { referencePanel: params, direction: 'right' } });

    }



    bottomHeightRef.current = presetBottomHeight;

    setBottomHeight(presetBottomHeight);

    updateSettings({ activePreset: presetName, bottomPanelHeight: presetBottomHeight });

  };



  const collapsedLayoutRef = useRef<any>(null);



  const toggleLeftSidebar = () => {

    if (!dockApi) return;

    if (!isSidebarCollapsed) {

      const leftPanel = dockApi.getPanel('params_panel') || dockApi.panels.find((p) => p.id !== 'preview_panel');

      const groupApi = leftPanel?.group?.api as any;

      if (!groupApi) return;

      collapsedLayoutRef.current = dockApi.toJSON();

      savedSidebarWidth.current = Math.max(220, Number(groupApi.width) || 320);

      try { groupApi.close(); } catch {

        try { groupApi.setConstraints({ minimumWidth: 0, maximumWidth: 0 }); groupApi.setSize({ width: 0 }); } catch {}

      }

      setIsSidebarCollapsed(true);

    } else {

      const layout = collapsedLayoutRef.current;

      try {

        if (layout) dockApi.fromJSON(layout);

        collapsedLayoutRef.current = null;

      } catch (error) {

        console.warn('[Workspace] Could not restore collapsed sidebar layout:', error);

        applyLayoutPreset(settings.activePreset, dockApi);

      }

      setIsSidebarCollapsed(false);

    }

    requestAnimationFrame(() => {

      try { window.dispatchEvent(new Event('resize')); } catch {}

    });

  };



  useEffect(() => {

    if (!dockApi) return;

    let saveTimer: ReturnType<typeof setTimeout> | null = null;



    const saveLayout = () => {

      if (!settings.autoSaveLayout || isSidebarCollapsed) return;

      try {

        localStorage.setItem('swarm_dockview_layout', JSON.stringify(dockApi.toJSON()));

      } catch {}

    };



    const scheduleSave = () => {

      if (saveTimer) clearTimeout(saveTimer);

      saveTimer = setTimeout(saveLayout, 180);

    };



    const disposable = dockApi.onDidLayoutChange(scheduleSave);

    window.addEventListener('beforeunload', saveLayout);



    return () => {

      disposable.dispose();

      window.removeEventListener('beforeunload', saveLayout);

      if (saveTimer) clearTimeout(saveTimer);

    };

  }, [dockApi, settings.autoSaveLayout, isSidebarCollapsed]);



  const addPanel = (type: string, title: string) => {

    if (!dockApi) return;

    dockApi.addPanel({

      id: `${type}_${Date.now()}`,

      component: type,

      title,

      position: { referencePanel: 'preview_panel', direction: 'within' }

    });

    setShowAddMenu(false);

  };



  const commandItems: CommandPaletteItem[] = useMemo(() => [

    { id: 'generate', label: isGenerating ? 'Stop generation' : 'Generate', description: 'Run the current prompt and parameters', icon: defaultCommandIcons.generate, action: () => { if (isGenerating) cancelGeneration(); else void enqueueAndProcess(); } },

    { id: 'queue-current', label: 'Queue current generation', description: 'Add the current prompt and parameters without starting it', icon: defaultCommandIcons.generate, action: () => queueCurrentGeneration() },

    { id: 'run-queue', label: 'Run queued generations', description: 'Start jobs already in the queue without adding a new one', icon: defaultCommandIcons.play, action: () => void useAppStore.getState().startQueueProcessing() },

    { id: 'toggle-queue', label: queue.length ? 'Open queue controls' : 'Open queue', description: 'Manage, reorder and edit generation jobs', icon: defaultCommandIcons.pause, action: () => window.dispatchEvent(new CustomEvent('swarm-open-queue')) },

    { id: 'refresh', label: 'Reload asset catalogs', description: 'Refresh models, LoRAs, embeddings and metadata', icon: defaultCommandIcons.refresh, action: () => void useAppStore.getState().loadAssets() },

    { id: 'models', label: 'Open Extra Networks', description: 'Browse models, LoRAs, embeddings and wildcards', icon: defaultCommandIcons.models, action: () => addPanel('extranetworks', 'Extra Networks') },

    { id: 'civitai-library', label: 'Open Civitai Library', description: 'Inspect metadata health, unresolved assets and cached previews', icon: defaultCommandIcons.models, action: () => addPanel('civitailibrary', 'Civitai Library') },
    { id: 'studio-tools', label: 'Open Studio Tools', description: 'Generation matrix, image guidance, prompt syntax, metadata and variations', icon: defaultCommandIcons.models, action: () => addPanel('studioutils', 'Studio Tools') },

    { id: 'history', label: 'Open History', description: 'Browse recent generations', icon: defaultCommandIcons.history, action: () => addPanel('history', 'Output History') },

    { id: 'settings', label: 'Open settings', description: 'Preferences and persistence controls', icon: defaultCommandIcons.settings, action: () => setShowSettingsModal(true) },

    { id: 'fit', label: 'Fit viewport', description: 'Fit the current image to the viewport', icon: defaultCommandIcons.fit, action: () => window.dispatchEvent(new Event('swarm-fit-viewport')) },

    { id: 'pause', label: useAppStore.getState().isQueuePaused ? 'Resume queue' : 'Pause queue', description: 'Pause or resume the generation queue', icon: useAppStore.getState().isQueuePaused ? defaultCommandIcons.play : defaultCommandIcons.pause, action: () => useAppStore.getState().setIsQueuePaused(!useAppStore.getState().isQueuePaused) },

  ], [isGenerating, enqueueAndProcess, queueCurrentGeneration, cancelGeneration, queue.length, addPanel]);



  const handleTriggerMouseDown = (e: React.MouseEvent) => {

    isDraggingTrigger.current = true;

    dragTriggerOffset.current = {

      x: e.clientX - triggerPos.x,

      y: e.clientY - triggerPos.y

    };

  };



  useEffect(() => {

    let frame = 0;
    let latestEvent: MouseEvent | null = null;
    const applyPointerMove = () => {
      frame = 0;
      if (!latestEvent) return;
      const e = latestEvent;
      latestEvent = null;

      if (isDraggingTrigger.current) {
        setTriggerPos({
          x: Math.max(0, Math.min(window.innerWidth - 40, e.clientX - dragTriggerOffset.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragTriggerOffset.current.y))
        });
      }

      if (isResizingBottom.current) {
        const newHeight = window.innerHeight - e.clientY;
        const clamped = Math.max(160, Math.min(window.innerHeight - 150, newHeight));
        bottomHeightRef.current = clamped;
        setBottomHeight(clamped);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTrigger.current && !isResizingBottom.current) return;
      latestEvent = e;
      if (!frame) frame = requestAnimationFrame(applyPointerMove);
    };

    const handleMouseUp = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latestEvent = null;
      if (isResizingBottom.current) {
        updateSettings({ bottomPanelHeight: bottomHeightRef.current });
      }
      isDraggingTrigger.current = false;
      isResizingBottom.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);

    window.addEventListener('mouseup', handleMouseUp);

    return () => {

      window.removeEventListener('mousemove', handleMouseMove);

      window.removeEventListener('mouseup', handleMouseUp);

    };

  }, [updateSettings]);



  return (

    <div
      data-ui-theme={resolvedTheme}
      style={{ '--sc-font-scale': fontScale / 100 } as React.CSSProperties}
      className="sc-workspace-shell w-full h-full min-h-0 flex flex-col overflow-hidden font-sans"
    >

      {!isTopBarCollapsed ? (

        <div className={`sc-workspace-topbar h-10 px-3 flex items-center justify-between select-none shrink-0 z-30 border-b ${

          'sc-themed-topbar'

        }`}>

          <div className="sc-workspace-topbar-left flex items-center gap-2.5">

            <button

              onClick={toggleLeftSidebar}

              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs ${

                isSidebarCollapsed

                  ? 'bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(180,120,24,0.18)]'

                  : 'bg-white/5 text-zinc-400 hover:text-white'

              }`}

              title={isSidebarCollapsed ? 'Expand Side Panels' : 'Collapse Side Panels (Maximize Viewport)'}

            >

              {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}

            </button>



            <span className="font-extrabold text-sm tracking-tight text-transparent bg-clip-text bg-linear-to-r from-amber-200 via-amber-400 to-yellow-700">

              SwarmCanvas

            </span>



            <div className="h-4 w-px bg-white/10 mx-1" />



            <div className="sc-preset-strip hidden md:flex items-center gap-1 rounded-lg text-[11px]">

              <button
                type="button"
                onClick={() => setIsPresetStripCollapsed((v) => !v)}
                className="sc-preset-toggle"
                aria-expanded={!isPresetStripCollapsed}
                title={isPresetStripCollapsed ? 'Expand workspace presets' : 'Collapse workspace presets'}
              >
                <span className="text-[10px]">Preset</span>
                <span className="sc-preset-current">{settings.activePreset}</span>
                {isPresetStripCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <div className={`sc-collapse-region sc-collapse-horizontal ${isPresetStripCollapsed ? '' : 'is-open'}`}>
                <div className="sc-collapse-inner">
                  <div className="sc-preset-options" role="group" aria-label="Workspace presets">
                    {(['Default', 'Prompt Engineer', 'Studio Canvas', 'Multi-ControlNet'] as const).map((pr) => (
                      <button key={pr} type="button" onClick={() => applyLayoutPreset(pr)} className={`sc-preset-option ${settings.activePreset === pr ? 'is-active' : ''}`}>
                        {pr}
                    </button>
                    ))}
                  </div>
                </div>
              </div>

              <InfoPopover content="Workspace presets rearrange the Dockview panels for common workflows. Your selected preset is stored with app settings." />
            </div>

          </div>



          <div className="sc-generate-area hidden lg:flex items-center gap-2">

            <div className={isConnected ? 'sc-status sc-status-online' : 'sc-status'} title={isConnected ? 'SwarmUI connection is available' : 'SwarmUI connection status has not been confirmed yet'}>

              <span className="sc-status-dot" />

              <span>{isReconnecting ? 'Reconnecting…' : isConnected ? 'Backend ready' : 'Backend offline'}</span>

            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setShowDiagnostics((v) => !v)} className="sc-action-button sc-action-info rounded-xl text-[10px] font-mono" title="Open system diagnostics">

              <span className={`w-1.5 h-1.5 rounded-full ${isReconnecting ? 'bg-blue-400 animate-pulse' : isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />

              <span>{isReconnecting ? 'Recovering' : isConnected ? 'Healthy' : 'Offline'}</span>

              </button>
              <InfoPopover content="Shows connection state, queue count, model count and Civitai metadata health." />
            </div>

            <InfoPopover content="Search and run workspace commands with Ctrl+K without hunting through the UI." side="bottom" className="sc-popover-button-trigger">
              <button type="button" onClick={() => setShowCommandPalette(true)} className="sc-action-button sc-action-info rounded-xl text-[10px] font-mono" title="Command palette (Ctrl+K)">
                <CommandIcon className="w-3.5 h-3.5 text-amber-300" /> Ctrl+K
              </button>
            </InfoPopover>

            <div className="sc-status sc-status-queue" title={`${queuedCount} generation job${queuedCount === 1 ? '' : 's'} queued/active`}>

              <span className="font-mono">{queuedCount}</span>

              <span>{queuedCount === 1 ? 'job' : 'jobs'}</span>

            </div>

            <InfoPopover content={isGenerating ? 'Stops the active generation and invalidates the old client-side queue processor.' : 'Queues the current prompt and parameters for generation.'} side="bottom" className="sc-popover-button-trigger">
              <button
                onClick={isGenerating ? cancelGeneration : () => void enqueueAndProcess()}
                className={`sc-generate-button ${isGenerating ? 'is-cancel' : ''}`}
                title={isGenerating ? 'Cancel the active generation' : 'Start generation from the current prompt and parameters'}
              >
                {isGenerating ? <Pause className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                <span>{isGenerating ? 'Stop' : 'Generate'}</span>
              </button>
            </InfoPopover>

          </div>



          <div className="sc-workspace-topbar-actions flex items-center gap-2 md:gap-3">

            <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 px-2 py-0.5 rounded-xl">

              <Sliders className="w-3 h-3 text-zinc-400" />

              <select

                value={String(activeScaleSection)}

                onChange={(e) => setActiveScaleSection(e.target.value as any)}

                className="bg-transparent text-[10px] text-zinc-300 font-mono outline-none cursor-pointer"

              >

                <option value="pills">Pills Zoom</option>

                <option value="params">Params Zoom</option>

                <option value="extranetworks">ExtraNet Zoom</option>

                <option value="history">History Zoom</option>

                <option value="controlnet">ControlNet Zoom</option>

                <option value="adetailer">ADetailer Zoom</option>

              </select>

              <InfoPopover content="Section zoom changes the visual density of the selected area only. Use Interface Font Scale in Settings when you want every text size to change together." side="bottom" />

              <input

                type="range"

                min="75"

                max="150"

                step="5"

                value={settings.sectionScales[activeScaleSection] || 100}

                onChange={(e) => setSectionScale(activeScaleSection, Number(e.target.value))}

                className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"

              />

              <span className="text-[10px] text-amber-300 font-mono w-7 text-right">

                {settings.sectionScales[activeScaleSection] || 100}%

              </span>

            </div>



            <div className="relative hidden sm:block">
              <InfoPopover content="Choose a visual theme. Obsidian stays the default; alternate themes change surfaces, contrast and accent language." side="bottom" className="sc-popover-button-trigger">
                <button type="button" onClick={() => setIsThemeMenuOpen((v) => !v)} className="sc-theme-button" aria-expanded={isThemeMenuOpen} title="Theme">
                  <Palette className="w-3.5 h-3.5" />
                  <span>{themeLabel}</span>
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>
              </InfoPopover>

              {isThemeMenuOpen && (
                <div className="sc-theme-menu">
                  {[
                    ['obsidian', 'Obsidian', 'Near-black surfaces with champagne/gold accents. Default workspace theme.'],
                    ['arctic', 'Arctic', 'Bright cool-gray surfaces with restrained steel-blue accents.'],
                    ['paper', 'Paper', 'Warm ivory surfaces with ink-like controls and muted brown accents.'],
                    ['terminal', 'Terminal', 'High-contrast black workspace with restrained green status accents.'],
                    ['midnight', 'Midnight', 'Deep navy surfaces with crisp blue-gray information accents.'],
                    ['forest', 'Forest', 'Deep charcoal/green surfaces with muted sage controls.'],
                    ['clay', 'Clay', 'Warm terracotta and parchment surfaces with dark ink text.'],
                    ['mono', 'Monochrome', 'Pure grayscale UI for maximum separation without accent colors.'],
                    ['contrast', 'High Contrast', 'Near-black and near-white surfaces optimized for legibility.'],
                    ['nord', 'Nord', 'Cool pale interface with slate-blue controls and quiet contrast.'],
                    ['dracula', 'Dracula', 'Deep plum surfaces with lavender primary controls.'],
                    ['solarized', 'Solarized', 'Warm parchment interface with muted blue and gold controls.'],
                    ['rose', 'Rose', 'Dark charcoal-plum interface with dusty rose primary controls.'],
                    ['coffee', 'Coffeehouse', 'Warm espresso surfaces with cream and copper controls.'],
                    ['matrix', 'Matrix', 'Minimal black-and-green terminal-inspired interface.'],
                    ['sunset', 'Sunset', 'Deep plum surfaces with warm peach primary controls.'],
                  ].map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setIsThemeMenuOpen(false); updateSettings({ uiTheme: value as AppSettings['uiTheme'] }); }}
                      className={`sc-theme-option ${resolvedTheme === value ? 'is-active' : ''}`}
                    >
                      <span className="sc-theme-swatch" data-theme-swatch={value} />
                      <span className="min-w-0 text-left">
                        <span className="block text-[11px] font-semibold">{label}</span>
                        <span className="block text-[10px] opacity-70 leading-snug">{description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <InfoPopover content="Open application preferences, font scaling, gallery behavior, tag organization and persistence controls." side="bottom" className="sc-popover-button-trigger">
              <button type="button" onClick={() => setShowSettingsModal(true)} className="sc-topbar-icon-button p-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg cursor-pointer" title="Options">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </InfoPopover>

            <InfoPopover content="Open the live diagnostics console for backend, queue and client-side troubleshooting." side="bottom" className="sc-popover-button-trigger">
              <button type="button" onClick={() => setShowConsole(true)} className="sc-topbar-icon-button p-1.5 bg-white/5 hover:bg-white/10 text-[var(--sc-text-secondary)] rounded-lg cursor-pointer" title="Diagnostics">
                <Terminal className="w-3.5 h-3.5" />
              </button>
            </InfoPopover>



            <div className="relative">

              <button

                onClick={() => setShowAddMenu(!showAddMenu)}

                className="p-1.5 bg-white/5 hover:bg-amber-800 hover:text-white border border-white/10 text-zinc-300 rounded-lg cursor-pointer transition flex items-center gap-1 text-xs"

              >

                <Plus className="w-3.5 h-3.5" />

              </button>



              {showAddMenu && (

                <div className="absolute right-0 top-8 w-52 bg-[#0c0e15] border border-white/15 rounded-xl shadow-2xl py-1 z-50 flex flex-col text-xs text-zinc-200">

                  <button onClick={() => addPanel('adetailer', 'ADetailer')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Sparkle className="w-3.5 h-3.5 text-amber-400" /> ADetailer

                  </button>

                  <button onClick={() => addPanel('controlnet', 'ControlNet')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Layers className="w-3.5 h-3.5 text-indigo-400" /> ControlNet

                  </button>

                  <button onClick={() => addPanel('extranetworks', 'Extra Networks')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Box className="w-3.5 h-3.5 text-emerald-400" /> Extra Networks

                  </button>

                  <button onClick={() => addPanel('civitailibrary', 'Civitai Library')} className="px-3 py-1.5 text-left hover:bg-blue-900/30 hover:text-blue-200 flex items-center gap-2 cursor-pointer">

                    <Globe className="w-3.5 h-3.5 text-blue-300" /> Civitai Library

                  </button>
                  <button onClick={() => addPanel('studioutils', 'Studio Tools')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Studio Tools

                  </button>

                  <button onClick={() => addPanel('history', 'Output History')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <HistoryIcon className="w-3.5 h-3.5 text-amber-400" /> Output History

                  </button>

                  <button onClick={() => addPanel('gallery', 'Gallery')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Gallery

                  </button>

                  <button onClick={() => addPanel('imagesearch', 'Image Search')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> Image Search

                  </button>

                  <div className="h-px bg-white/10 my-1" />

                  <button onClick={() => addPanel('params', 'Parameters')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white cursor-pointer">

                    Parameters

                  </button>

                  <button onClick={() => addPanel('preview', 'Viewport')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white cursor-pointer">

                    Viewport

                  </button>

                  <div className="h-px bg-white/10 my-1" />

                  <span className="px-3 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">

                    Companions

                  </span>

                  <button onClick={() => addPanel('scenestager', 'Scene Stager')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Move className="w-3.5 h-3.5 text-amber-400" /> Visual Scene Stager

                  </button>

                  <button onClick={() => addPanel('latentsynthesizer', 'Synthesizer')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Sliders className="w-3.5 h-3.5 text-purple-400" /> Latent Synthesizer

                  </button>

                  <button onClick={() => addPanel('characterdossier', 'Character Dossier')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <BookOpen className="w-3.5 h-3.5 text-amber-400" /> Character Dossier

                  </button>

                  <button onClick={() => addPanel('artdirector', 'Art Director')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Art Director Co-Pilot

                  </button>

                  <button onClick={() => addPanel('morphscheduler', 'Step Scheduler')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Clock className="w-3.5 h-3.5 text-amber-400" /> Prompt Morph Scheduler

                  </button>

                  <button onClick={() => addPanel('tagsynergy', 'Tag Synergy')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Zap className="w-3.5 h-3.5 text-emerald-400" /> Tag Synergy Engine

                  </button>

                  <button onClick={() => addPanel('wildcardslot', 'Wildcard Slots')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <Dices className="w-3.5 h-3.5 text-amber-400" /> Wildcard Slot Machine

                  </button>

                  <button onClick={() => addPanel('tagrarity', 'Tag Rarity')} className="px-3 py-1.5 text-left hover:bg-amber-800 hover:text-white flex items-center gap-2 cursor-pointer">

                    <BarChart3 className="w-3.5 h-3.5 text-fuchsia-400" /> Tag Frequency Inspector

                  </button>

                </div>

              )}

            </div>

          </div>

        </div>

      ) : (

        <div

          onMouseDown={handleTriggerMouseDown}

          onClick={() => {

            if (!isDraggingTrigger.current) setIsTopBarCollapsed(false);

          }}

          style={{ left: `${triggerPos.x}px`, top: `${triggerPos.y}px` }}

          className="fixed z-50 p-2 bg-[#090b10]/90 border border-white/20 text-amber-400 hover:text-white rounded-xl shadow-2xl backdrop-blur-md cursor-move active:scale-95 transition-transform"

          title="Click to restore top bar"

        >

          <LayoutGrid className="w-4 h-4 pointer-events-none" />

        </div>

      )}



      {/* Main Grid */}

      <div className="flex-1 w-full min-h-0 relative">

        <div className="hidden md:block w-full h-full">

          <DockviewReact components={components} onReady={onReady} className="dockview-theme-dark h-full w-full" />

        </div>



        <div className="md:hidden w-full h-full pb-14 overflow-hidden">

          {mobileActiveTab === 'canvas' && <PreviewPanel api={{} as any} containerApi={{} as any} params={{}} />}

          {mobileActiveTab === 'prompts' && <PromptPillsPanel api={{} as any} containerApi={{} as any} params={{}} />}

          {mobileActiveTab === 'params' && <ParamsPanel api={{} as any} containerApi={{} as any} params={{}} />}

          {mobileActiveTab === 'history' && <HistoryPanel api={{} as any} containerApi={{} as any} params={{}} />}

        </div>

      </div>



      {/* Bottom Tray */}

      <div className={`sc-prompt-tray relative shrink-0 flex flex-col border-t z-30 ${

        'sc-themed-prompt-tray'

      }`}>

        <div

          onMouseDown={(e) => {

            e.preventDefault();

            isResizingBottom.current = true;

          }}

          className="h-2 w-full cursor-row-resize hover:bg-cyan-500/60 active:bg-cyan-500 transition-colors z-40 absolute -top-1 left-0 right-0 sc-resize-handle"

          title="Drag to resize prompt area"

        />



        <div className="sc-prompt-tray-bar flex items-center justify-center shrink-0">

          <button

            type="button"

            onClick={() => toggleSectionCollapse('bottomTray')}

            className="sc-prompt-tray-toggle relative px-3.5 py-1 rounded-full text-[10px] font-mono shadow-lg cursor-pointer transition flex items-center gap-1 bg-black/95 text-amber-300 hover:bg-amber-500/15"

            aria-expanded={!collapsedSections.bottomTray}

            aria-controls="swarm-prompt-tray-content"

            title={collapsedSections.bottomTray ? 'Expand prompt controls' : 'Collapse prompt controls'}

          >

            <span>{collapsedSections.bottomTray ? '▲ Expand Prompts' : '▼ Collapse Prompts'}</span>

          </button>

        </div>



        <div
          id="swarm-prompt-tray-content"
          className={`sc-prompt-collapse-frame w-full overflow-hidden ${collapsedSections.bottomTray ? 'is-collapsed' : 'is-open'}`}
          style={{ height: collapsedSections.bottomTray ? 0 : Math.max(260, bottomHeight || 340) }}
          aria-hidden={collapsedSections.bottomTray}
        >
          <div className="sc-prompt-tray-content w-full h-full flex flex-col overflow-hidden">
            <PromptPillsPanel api={{} as any} containerApi={{} as any} params={{}} />
          </div>
        </div>

      </div>



      {/* Mobile Bottom Navigation Bar */}

      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 sc-mobile-nav flex items-center justify-around z-50 text-[10px] font-medium text-gray-400">

        <button

          type="button"

          onClick={() => setMobileActiveTab('canvas')}

          className={`sc-mobile-nav-item flex flex-col items-center gap-1 ${mobileActiveTab === 'canvas' ? 'is-active' : ''}`}

        >

          <ImageIcon className="w-4 h-4" />

          <span>Canvas</span>

        </button>

        <button

          type="button"

          onClick={() => setMobileActiveTab('prompts')}

          className={`sc-mobile-nav-item flex flex-col items-center gap-1 ${mobileActiveTab === 'prompts' ? 'is-active' : ''}`}

        >

          <Sparkle className="w-4 h-4" />

          <span>Prompts</span>

        </button>

        <button

          type="button"

          onClick={isGenerating ? cancelGeneration : enqueueAndProcess}

          className={`sc-mobile-generate px-3 py-2 -mt-4 rounded-full shadow-2xl flex items-center justify-center text-white ${

            isGenerating ? 'bg-rose-600 animate-pulse' : 'bg-amber-800'

          }`}

        >

          <Wand2 className="w-5 h-5" />

        </button>

        <button

          type="button"

          onClick={() => setMobileActiveTab('params')}

          className={`sc-mobile-nav-item flex flex-col items-center gap-1 ${mobileActiveTab === 'params' ? 'is-active' : ''}`}

        >

          <Sliders className="w-4 h-4" />

          <span>Params</span>

        </button>

        <button

          type="button"

          onClick={() => setMobileActiveTab('history')}

          className={`sc-mobile-nav-item flex flex-col items-center gap-1 ${mobileActiveTab === 'history' ? 'is-active' : ''}`}

        >

          <HistoryIcon className="w-4 h-4" />

          <span>History</span>

        </button>

      </div>



      {/* Settings Modal */}

      {showSettingsModal && (

        <div className="fixed inset-0 z-999999 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sc-settings-modal-backdrop">

          <div className="w-120 max-h-[85vh] overflow-y-auto bg-[#161822] border border-[#2d3246] rounded-xl shadow-2xl p-4 text-xs text-gray-200 flex flex-col gap-3 sc-settings-modal">

            <div className="flex justify-between items-center border-b border-[#252a38] pb-2 font-semibold text-sm text-indigo-400">

              <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Preferences & Customization</span>

              <button onClick={() => setShowSettingsModal(false)} className="text-gray-500 hover:text-white text-base">✕</button>

            </div>



            <div className="sc-settings-section">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="sc-settings-section-title">Interface Font Scale</div>
                  <div className="sc-settings-help">Scales interface text across the workspace without changing generation parameters or image dimensions.</div>
                </div>
                <InfoPopover content="This setting scales the UI typography globally, including compact labels and controls that use fixed pixel sizes." side="left" />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="80"
                  max="140"
                  step="5"
                  value={fontScale}
                  onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
                  className="sc-settings-range flex-1"
                  aria-label="Interface font scale"
                />
                <span className="sc-settings-value">{fontScale}%</span>
                <button type="button" className="sc-settings-reset" onClick={() => updateSettings({ fontScale: 100 })}>Reset</button>
              </div>
            </div>

            <div className="sc-settings-section">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="sc-settings-section-title">Appearance Theme</div>
                  <div className="sc-settings-help">Obsidian is the default. Additional themes intentionally change the surface, contrast and accent system.</div>
                </div>
                <InfoPopover content="Changes the application color system only; generation parameters and saved images are unaffected." side="left" />
              </div>
              <select
                value={resolvedTheme}
                onChange={(e) => updateSettings({ uiTheme: e.target.value as AppSettings['uiTheme'] })}
                className="sc-settings-theme-select"
                aria-label="Appearance theme"
              >
                <option value="obsidian">Obsidian — black / champagne</option>
                <option value="arctic">Arctic — cool light / steel</option>
                <option value="paper">Paper — warm light / ink</option>
                <option value="terminal">Terminal — black / green</option>
                <option value="midnight">Midnight — navy / steel</option>
                <option value="forest">Forest — charcoal / sage</option>
                <option value="clay">Clay — terracotta / parchment</option>
                <option value="mono">Monochrome — grayscale</option>
                <option value="contrast">High Contrast — black / white</option>
                <option value="nord">Nord — pale slate / blue</option>
                <option value="dracula">Dracula — plum / lavender</option>
                <option value="solarized">Solarized — parchment / gold</option>
                <option value="rose">Rose — charcoal / dusty rose</option>
                <option value="coffee">Coffeehouse — espresso / copper</option>
                <option value="matrix">Matrix — black / green</option>
                <option value="sunset">Sunset — plum / peach</option>
              </select>
            </div>

            <div className="sc-settings-section">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="sc-settings-section-title">Model-linked Presets</div>
                  <div className="sc-settings-help">Automatically apply a prompt preset linked to a model when changing the active model.</div>
                </div>
                <InfoPopover content="Links are stored locally per model. Turn this off when model changes should never alter your prompts." side="left" />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={settings.autoApplyModelPreset} onChange={(e) => updateSettings({ autoApplyModelPreset: e.target.checked })} className="accent-amber-500" />
                Auto-apply linked preset
              </label>
            </div>

            <div className="flex flex-col gap-2 p-2.5 bg-[#12141c] border border-indigo-500/30 rounded">

              <span className="font-semibold text-indigo-300">Gallery & Storage Preferences</span>



              <div className="flex items-center justify-between">

                <span className="text-gray-300 text-[11px]">Default Gallery Source:</span>

                <select

                  value={settings.gallerySource || 'app'}

                  onChange={(e) => updateSettings({ gallerySource: e.target.value as any })}

                  className="bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-[11px] text-gray-200 outline-none font-mono"

                >

                  <option value="app">App Generated Outputs Only</option>

                  <option value="all">All Server Outputs</option>

                </select>

              </div>



              <div className="flex items-center justify-between pt-1 border-t border-[#252a38]">

                <span className="text-gray-300 text-[11px]">Images per Page (Pagination):</span>

                <select

                  value={settings.galleryPageSize || 24}

                  onChange={(e) => updateSettings({ galleryPageSize: Number(e.target.value) })}

                  className="bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-[11px] text-gray-200 outline-none font-mono"

                >

                  <option value={12}>12 images</option>

                  <option value={24}>24 images (Default)</option>

                  <option value={48}>48 images</option>

                  <option value={96}>96 images</option>

                </select>

              </div>

            </div>



            <div className="flex flex-col gap-2 p-2.5 bg-[#12141c] border border-[#252938] rounded">

              <span className="font-semibold text-indigo-300">Categorization Engine</span>



              <select

                value={settings.categorizationMode || 'prompt_flow'}

                onChange={async (e) => {

                  const mode = e.target.value as any;

                  updateSettings({ categorizationMode: mode });

                  await danbooru.setCategorizationMode(mode);

                  useAppStore.getState().setActiveMacroCategory('All');

                  useAppStore.getState().setActiveSubCategory('All');

                }}

                className="bg-[#1a1d28] border border-[#2e3346] rounded p-1.5 text-xs text-gray-200 font-semibold outline-none cursor-pointer"

              >

                <option value="prompt_flow">Prompt-Flow Pipeline (Workflow-Centric) — Recommended</option>

                <option value="danbooru_types">Danbooru Official Types (General, Character, Copyright, Artist, Meta)</option>

                <option value="danbooru_groups">Danbooru Wiki Tag Groups (Extension Standard)</option>

              </select>



              <div className="flex items-center justify-between pt-1 border-t border-[#252a38]">

                <span className="text-gray-300 text-[11px]">Tag Sorting Order:</span>

                <select

                  value={settings.tagSortOrder || 'alphabetical'}

                  onChange={async (e) => {

                    const sort = e.target.value as any;

                    updateSettings({ tagSortOrder: sort });

                    await danbooru.setSortMode(sort);

                  }}

                  className="bg-[#1a1d28] border border-[#2e3346] rounded px-2 py-0.5 text-[11px] text-gray-200 outline-none cursor-pointer font-mono"

                >

                  <option value="alphabetical">A–Z Alphabetical</option>

                  <option value="popularity">Popularity (Post Count)</option>

                </select>

              </div>

            </div>



            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">

              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">

                Audio Notifications

              </span>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span className="flex items-center gap-2">

                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />

                  <span>Play sound when batch generation completes</span>

                </span>

                <input

                  type="checkbox"

                  checked={settings.playCompletionSound}

                  onChange={(e) => updateSettings({ playCompletionSound: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4 cursor-pointer"

                />

              </label>

            </div>



            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">

              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Prompt & Tag Customization</span>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Auto-inject LoRA activation words on insert</span>

                <input

                  type="checkbox"

                  checked={settings.autoInjectLoraTrigger}

                  onChange={(e) => updateSettings({ autoInjectLoraTrigger: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Display '+' prefix before tag labels</span>

                <input

                  type="checkbox"

                  checked={settings.showTagPlusPrefix}

                  onChange={(e) => updateSettings({ showTagPlusPrefix: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Display post count badges on pills</span>

                <input

                  type="checkbox"

                  checked={settings.showTagPostCounts}

                  onChange={(e) => updateSettings({ showTagPostCounts: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Format tags with underscores instead of spaces</span>

                <input

                  type="checkbox"

                  checked={settings.useUnderscores}

                  onChange={(e) => updateSettings({ useUnderscores: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>

            </div>



            <div className="flex flex-col gap-2 border-t border-[#252a38] pt-2">

              <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider font-semibold">State & Persistence</span>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Preserve prompts & parameters across browser reloads</span>

                <input

                  type="checkbox"

                  checked={settings.preservePromptsOnReload}

                  onChange={(e) => updateSettings({ preservePromptsOnReload: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>



              <label className="flex items-center justify-between p-2 bg-[#12141c] border border-[#252938] rounded cursor-pointer">

                <span>Auto-save Dockview panel arrangements</span>

                <input

                  type="checkbox"

                  checked={settings.autoSaveLayout}

                  onChange={(e) => updateSettings({ autoSaveLayout: e.target.checked })}

                  className="accent-indigo-500 w-4 h-4"

                />

              </label>



              <button

                onClick={() => {

                  localStorage.removeItem('swarm_canvas_persisted_store');

                  localStorage.removeItem('swarm_dockview_layout');

                  window.location.reload();

                }}

                className="w-full py-1.5 bg-rose-950/50 border border-rose-700/80 text-rose-300 rounded hover:bg-rose-900 transition cursor-pointer mt-2"

              >

                Reset All Stored State & Layout to Default

              </button>

            </div>

          </div>

        </div>

      )}



      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} items={commandItems} />



      {showDiagnostics && (

        <div className="fixed top-12 right-3 z-[999995] w-72 rounded-2xl bg-[#1b1d1f]/98 p-3 shadow-2xl backdrop-blur-xl">

          <div className="flex items-center justify-between mb-2"><div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">System Status</div><button type="button" onClick={() => setShowDiagnostics(false)} className="text-zinc-500 hover:text-zinc-100">✕</button></div>

          <div className="space-y-1.5 text-[10px] font-mono">

            <div className="flex justify-between"><span className="text-zinc-500">Backend</span><span className={isConnected ? 'text-emerald-300' : 'text-rose-300'}>{isConnected ? 'Connected' : 'Disconnected'}</span></div>

            <div className="flex justify-between"><span className="text-zinc-500">Queue</span><span className="text-zinc-200">{queuedCount}</span></div>

            <div className="flex justify-between"><span className="text-zinc-500">Models</span><span className="text-zinc-200">{modelCount}</span></div>

            {(() => { const stats = civitaiService.getLibraryStats(); return <><div className="flex justify-between"><span className="text-zinc-500">Civitai matched</span><span className="text-emerald-300">{stats.matched}</span></div><div className="flex justify-between"><span className="text-zinc-500">Civitai unresolved</span><span className="text-amber-300">{stats.unresolved}</span></div></>; })()}

          </div>

          <button type="button" onClick={() => { setShowConsole(true); setShowDiagnostics(false); }} className="w-full mt-3 rounded-lg px-2 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px]">Open diagnostics console</button>

        </div>

      )}



      {toasts.length > 0 && (

        <div className="fixed right-4 bottom-4 z-[1000001] w-[min(360px,calc(100vw-2rem))] flex flex-col gap-2 pointer-events-none">

          {toasts.map((toast) => <div key={toast.id} className={`pointer-events-auto rounded-xl px-3 py-2.5 shadow-2xl bg-[#1d1f21] ${toast.tone === 'success' ? 'text-emerald-200' : toast.tone === 'warning' ? 'text-amber-200' : toast.tone === 'error' ? 'text-rose-200' : 'text-sky-200'}`}><div className="flex items-start gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0" /><span className="text-[11px] leading-relaxed">{toast.message}</span><button type="button" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))} className="ml-auto text-current opacity-50 hover:opacity-100">✕</button></div></div>)}

        </div>

      )}



      {/* Global Unified Context Menu */}

      {activeContextMenu && (

        <CustomContextMenu

          x={activeContextMenu.x}

          y={activeContextMenu.y}

          title={activeContextMenu.title}

          items={activeContextMenu.items}

          onClose={() => setActiveContextMenu(null)}

        />

      )}



      {/* Diagnostics & Interactive Debug Console Component */}

      <DebugConsole open={showConsole} onClose={() => setShowConsole(false)} />

    </div>

  );

};
