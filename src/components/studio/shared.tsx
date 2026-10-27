import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Pieces shared by the studio-style layouts (Hive, Tower, Genko). Each layout is a standalone component that
 * receives the app's panels and callbacks, so none of them depend on Workspace.tsx.
 */

export type PanelMap = Record<string, React.ComponentType<any>>;

export interface StudioShellProps {
  panels: PanelMap;
  isGenerating: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  queuedCount: number;
  isConnected: boolean;
  isReconnecting: boolean;
  modelCount: number;
  resolveImageUrl: (url?: string) => string;
  onOpenImage: (item: any) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenConsole: () => void;
  onOpenPalette: () => void;
  onOpenDiagnostics: () => void;
  onUseSimplified: () => void;
}

/** Props the Dockview panels expect; the panels ignore them, so empty stand-ins are enough outside Dockview. */
export const PANEL_PROPS = { api: {} as any, containerApi: {} as any, params: {} };

export function usePersisted<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue];
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const Svg: React.FC<{ children: React.ReactNode; size?: number; stroke?: number }> = ({ children, size = 22, stroke = 1.7 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const ICONS = {
  params: (<Svg><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></Svg>),
  models: (<Svg><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Svg>),
  adetailer: (<Svg><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="11" r="3" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></Svg>),
  controlnet: (<Svg><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5" /></Svg>),
  history: (<Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>),
  gallery: (<Svg><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5L20 16" /></Svg>),
  civitai: (<Svg><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.3 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.3-3.4-8.5s1.1-6.1 3.4-8.5z" /></Svg>),
  studio: (<Svg><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></Svg>),
  settings: (<Svg size={20}><circle cx="12" cy="12" r="3" /><path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>),
  keyboard: (<Svg size={20}><rect x="3" y="6.5" width="18" height="11" rx="2.5" /><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8" /></Svg>),
  terminal: (<Svg size={20}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17" /></Svg>),
  command: (<Svg size={20}><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15zm0 0H9m0 0H6.5A2.5 2.5 0 1 0 9 17.5V15z" /></Svg>),
  simple: (<Svg size={20}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 4v16" /></Svg>),
  chevron: (<Svg size={16}><path d="M6 14l6-6 6 6" /></Svg>),
  close: (<Svg size={16}><path d="M6 6l12 12M18 6L6 18" /></Svg>),
  back: (<Svg size={16}><path d="M15 6l-6 6 6 6" /></Svg>),
  wide: (<Svg size={16}><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></Svg>),
  spark: (<Svg size={18}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" /></Svg>),
  stop: (<Svg size={18}><rect x="6.5" y="6.5" width="11" height="11" rx="2" /></Svg>),
  plus: (<Svg size={14} stroke={2}><path d="M12 5v14M5 12h14" /></Svg>),
  minus: (<Svg size={14} stroke={2}><path d="M5 12h14" /></Svg>),
  swap: (<Svg size={16}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></Svg>),
  dice: (<Svg size={16}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="2.6" /></Svg>),
  reuse: (<Svg size={16}><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" /></Svg>),
  seedFrom: (<Svg size={16}><path d="M12 20V10M12 10l-4 4M12 10l4 4M6 4h12" /></Svg>),
  panelLeft: (<Svg size={16}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></Svg>),
  panelRight: (<Svg size={16}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M14.5 4.5v15" /></Svg>),
  more: (<Svg size={16}><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6" /></Svg>),
  lamp: (<Svg size={16}><circle cx="12" cy="12" r="4" fill="currentColor" /></Svg>),
};

export interface Tool { id: string; label: string; hint: string; panel: string | null; icon: React.ReactNode }

export const TOOLS: Tool[] = [
  { id: 'params', label: 'Settings', hint: 'Model, size, sampler, seed and the other generation parameters', panel: 'params', icon: ICONS.params },
  { id: 'models', label: 'Models', hint: 'Checkpoints, LoRAs, embeddings and wildcards', panel: 'extranetworks', icon: ICONS.models },
  { id: 'adetailer', label: 'Detailer', hint: 'ADetailer passes that fix faces and hands', panel: 'adetailer', icon: ICONS.adetailer },
  { id: 'controlnet', label: 'Control', hint: 'ControlNet units', panel: 'controlnet', icon: ICONS.controlnet },
  { id: 'history', label: 'History', hint: 'Everything generated in this project', panel: 'history', icon: ICONS.history },
  { id: 'gallery', label: 'Gallery', hint: 'Browse saved images', panel: 'gallery', icon: ICONS.gallery },
  { id: 'civitai', label: 'Civitai', hint: 'Browse and download from Civitai', panel: 'civitailibrary', icon: ICONS.civitai },
  { id: 'studio', label: 'Studio', hint: 'Prompt and composition helpers', panel: null, icon: ICONS.studio },
];

/** The prompt editor is deliberately not listed: every layout already shows it, and a second instance would duplicate it. */
export const STUDIO_TOOLS: Array<{ panel: string; label: string; hint: string }> = [
  { panel: 'studioutils', label: 'Studio tools', hint: 'General helpers for prompts and images' },
  { panel: 'artdirector', label: 'Art director', hint: 'Suggestions to improve a prompt' },
  { panel: 'scenestager', label: 'Scene stager', hint: 'Lay out a scene visually' },
  { panel: 'characterdossier', label: 'Character dossier', hint: 'Keep character details consistent' },
  { panel: 'latentsynthesizer', label: 'Latent synthesizer', hint: 'Blend and shape latents' },
  { panel: 'morphscheduler', label: 'Prompt morph', hint: 'Change the prompt across sampling steps' },
  { panel: 'tagsynergy', label: 'Tag synergy', hint: 'See which tags work well together' },
  { panel: 'tagrarity', label: 'Tag rarity', hint: 'How common each tag is' },
  { panel: 'wildcardslot', label: 'Wildcard slots', hint: 'Roll wildcards like a slot machine' },
  { panel: 'tagimages', label: 'Tag images', hint: 'Example images for a tag' },
  { panel: 'imagesearch', label: 'Image search', hint: 'Search images by text' },
];

/** Newest-first list of recent generations, plus the image currently shown in the viewport. */
export function useRecentHistory(limit = 40): { recent: any[]; activeImage: string | null } {
  const history = useAppStore((s) => s.history);
  const activeImage = useAppStore((s) => s.activeImage);
  const recent = useMemo(
    () => [...(history || [])].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limit),
    [history, limit],
  );
  return { recent, activeImage };
}

/** Panels stay mounted once opened, so search text, scroll position and unsaved edits survive switching tools. */
export function useVisitedPanels(activeKey: string | null): string[] {
  const [visited, setVisited] = useState<string[]>(() => (activeKey ? [activeKey] : []));
  useEffect(() => {
    if (activeKey) setVisited((prev) => (prev.includes(activeKey) ? prev : [...prev, activeKey]));
  }, [activeKey]);
  return visited;
}

/** Opens (and closes with Esc) the docked Generation Viewer as an overlay, since these layouts have no dock. */
export function useViewerOverlay(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('swarm-open-generation-viewer', show);
    return () => window.removeEventListener('swarm-open-generation-viewer', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return [open, setOpen];
}

export const PanelStack: React.FC<{ panels: PanelMap; visited: string[]; activeKey: string | null; shown: boolean }> = ({ panels, visited, activeKey, shown }) => (
  <>
    {visited.map((key) => {
      const Panel = panels[key];
      if (!Panel) return null;
      return (
        <div key={key} className={`sx-panel-host ${key === activeKey && shown ? '' : 'is-hidden'}`}>
          <Panel {...PANEL_PROPS} />
        </div>
      );
    })}
  </>
);

export const ViewerOverlay: React.FC<{ panels: PanelMap; open: boolean; onClose: () => void }> = ({ panels, open, onClose }) => {
  const Viewer = panels.generationviewer;
  if (!open || !Viewer) return null;
  return (
    <div className="sx-overlay" onClick={onClose}>
      <div className="sx-overlay-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Generation viewer">
        <header className="sx-overlay-head">
          <span className="sx-overlay-title">Generation viewer</span>
          <button type="button" className="sx-overlay-close" onClick={onClose} title="Close (Esc)" aria-label="Close">{ICONS.close}</button>
        </header>
        <div className="sx-overlay-body"><Viewer {...PANEL_PROPS} /></div>
      </div>
    </div>
  );
};

/** Small thumbnail strip used by every layout. `numbered` adds frame numbers (Genko). */
export const Filmstrip: React.FC<{
  items: any[];
  activeImage: string | null;
  resolveImageUrl: (url?: string) => string;
  onOpenImage: (item: any) => void;
  onMore?: () => void;
  numbered?: boolean;
  className?: string;
}> = ({ items, activeImage, resolveImageUrl, onOpenImage, onMore, numbered, className = '' }) => {
  if (!items.length) return null;
  return (
    <div className={`sx-filmstrip ${className}`} role="list" aria-label="Recent generations">
      {items.map((item, i) => {
        const src = resolveImageUrl(item.imageUrl);
        return (
          <button
            key={item.id}
            type="button"
            role="listitem"
            className={`sx-frame ${activeImage === src ? 'is-active' : ''}`}
            onClick={() => onOpenImage(item)}
            title={String(item.prompt || '').slice(0, 160) || 'Open image'}
          >
            <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            {numbered && <span className="sx-frame-no">{i + 1}</span>}
          </button>
        );
      })}
      {onMore && <button type="button" className="sx-frame-more" onClick={onMore} title="Open the full history">All</button>}
    </div>
  );
};
