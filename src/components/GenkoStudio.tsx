import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { BrandMark } from './BrandMark';
import {
  Filmstrip, ICONS, PANEL_PROPS, STUDIO_TOOLS, ViewerOverlay, clamp, usePersisted, useRecentHistory,
  useViewerOverlay, type PanelMap, type StudioShellProps,
} from './studio/shared';

/**
 * Genko: a manuscript-paper interface where the app is split into full-screen pages instead of tiles or drawers.
 *
 *   Draw     prompt, viewport, storyboard strip and the settings frame
 *   Library  the model browser gets a whole page (big cards), with Civitai beside it
 *   Archive  history and gallery side by side
 *   Studio   the companion tools
 *
 * The page switcher and Generate live in a title strip that is always visible. The look comes from the pages
 * mangaka draw on: pale-blue guide grid, ink-black frames, red-pencil corrections.
 */

export type GenkoStudioProps = StudioShellProps;

type PageId = 'draw' | 'library' | 'archive' | 'studio';
const PAGES: Array<{ id: PageId; label: string; hint: string }> = [
  { id: 'draw', label: 'Draw', hint: 'Prompt, viewport and settings' },
  { id: 'library', label: 'Library', hint: 'Models, LoRAs and Civitai' },
  { id: 'archive', label: 'Archive', hint: 'History and gallery' },
  { id: 'studio', label: 'Studio', hint: 'Companion tools' },
];

const SIDE_TABS: Array<{ id: string; label: string; panel: string }> = [
  { id: 'params', label: 'Settings', panel: 'params' },
  { id: 'adetailer', label: 'Detailer', panel: 'adetailer' },
  { id: 'controlnet', label: 'Control', panel: 'controlnet' },
];

const KEYS = {
  page: 'sc_genko_page_v1',
  sideTab: 'sc_genko_side_tab_v1',
  sideW: 'sc_genko_side_w_v1',
  promptH: 'sc_genko_prompt_h_v1',
  civitaiOpen: 'sc_genko_civitai_open_v1',
  civitaiW: 'sc_genko_civitai_w_v1',
  studio: 'sc_genko_studio_panel_v1',
};

/** Mounts a panel the first time it is shown and keeps it alive (hidden) afterwards. */
const Lazy: React.FC<{ panels: PanelMap; k: string; active: boolean }> = ({ panels, k, active }) => {
  const [everActive, setEverActive] = useState(active);
  useEffect(() => { if (active) setEverActive(true); }, [active]);
  const Panel = panels[k];
  if (!Panel || !everActive) return null;
  return (
    <div className={`sx-panel-host ${active ? '' : 'is-hidden'}`}>
      <Panel {...PANEL_PROPS} />
    </div>
  );
};

const Frame: React.FC<{ title: string; className?: string; style?: React.CSSProperties; actions?: React.ReactNode; children: React.ReactNode; label?: string }> = ({ title, className = '', style, actions, children, label }) => (
  <section className={`gk-frame ${className}`} style={style} aria-label={label || title}>
    <header className="gk-frame-head">
      <span className="gk-frame-title">{title}</span>
      {actions && <div className="gk-frame-actions">{actions}</div>}
    </header>
    <div className="gk-frame-body">{children}</div>
  </section>
);

export const GenkoStudio: React.FC<GenkoStudioProps> = ({
  panels, isGenerating, onGenerate, onCancel, queuedCount, isConnected, isReconnecting, modelCount,
  resolveImageUrl, onOpenImage, onOpenSettings, onOpenShortcuts, onOpenConsole, onOpenPalette, onOpenDiagnostics, onUseSimplified,
}) => {
  const progressPercent = useAppStore((s) => s.progressPercent);
  const { recent, activeImage } = useRecentHistory(40);

  const [page, setPage] = usePersisted<PageId>(KEYS.page, 'draw');
  const [sideTab, setSideTab] = usePersisted<string>(KEYS.sideTab, 'params');
  const [sideW, setSideW] = usePersisted<number>(KEYS.sideW, 400);
  const [promptH, setPromptH] = usePersisted<number>(KEYS.promptH, 230);
  const [civitaiOpen, setCivitaiOpen] = usePersisted<boolean>(KEYS.civitaiOpen, true);
  const [civitaiW, setCivitaiW] = usePersisted<number>(KEYS.civitaiW, 460);
  const [studioPanel, setStudioPanel] = usePersisted<string | null>(KEYS.studio, null);
  const [viewerOpen, setViewerOpen] = useViewerOverlay();

  // Pages mount when first visited and then stay alive, so the viewport and search boxes keep their state.
  const [visited, setVisited] = useState<PageId[]>(() => [page]);
  useEffect(() => { setVisited((prev) => (prev.includes(page) ? prev : [...prev, page])); }, [page]);

  /* Alt+1..4 switches page. AltGr (Ctrl+Alt) types characters on many layouts, so it is ignored. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const index = /^[1-4]$/.test(e.key) ? Number(e.key) - 1 : -1;
      if (index >= 0) { e.preventDefault(); setPage(PAGES[index].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPage]);

  /* resize handles */
  const drag = useRef<{ kind: 'side' | 'prompt' | 'civitai'; start: number; base: number } | null>(null);
  const onDragStart = (kind: 'side' | 'prompt' | 'civitai', base: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, start: kind === 'prompt' ? e.clientY : e.clientX, base };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'prompt') setPromptH(clamp(d.base + (e.clientY - d.start), 130, 520));
    else if (d.kind === 'side') setSideW(clamp(d.base - (e.clientX - d.start), 320, 640));
    else setCivitaiW(clamp(d.base - (e.clientX - d.start), 340, 720));
  };
  const onDragEnd = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
  };

  const status = isReconnecting ? 'reconnecting' : isConnected ? 'online' : 'offline';
  const statusText = isReconnecting ? 'Reconnecting' : isConnected ? 'SwarmUI ready' : 'SwarmUI offline';
  const pct = clamp(Math.round(progressPercent || 0), 0, 100);
  const Preview = panels.preview;
  const Prompt = panels.promptpills;
  const shown = (id: PageId) => page === id;

  return (
    <div className="gk-root">
      {/* ---- title strip: always visible ---- */}
      <header className="gk-title">
        <div className="gk-brand">
          <BrandMark size={34} busy={isGenerating} />
          <span className="gk-brand-name">SwarmCanvas</span>
          <span className="gk-brand-kana" lang="ja" aria-hidden="true">原稿</span>
        </div>
        <nav className="gk-tabs" role="tablist" aria-label="Pages">
          {PAGES.map((p, i) => (
            <button key={p.id} type="button" role="tab" aria-selected={page === p.id} className={`gk-tab ${page === p.id ? 'is-active' : ''}`} onClick={() => setPage(p.id)} title={`${p.label} (Alt+${i + 1}): ${p.hint}`}>
              <span className="gk-tab-no">{i + 1}</span>{p.label}
            </button>
          ))}
        </nav>
        <div className="gk-spacer" />
        <button type="button" className="gk-status" onClick={onOpenDiagnostics} title={`${statusText} - open diagnostics`}>
          <i className={`gk-lamp is-${status}`} aria-hidden="true" />
          <span>{statusText}{isConnected ? ` · ${modelCount} models` : ''}</span>
          {queuedCount > 0 && <b className="gk-queue">{queuedCount} {queuedCount === 1 ? 'job' : 'jobs'}</b>}
        </button>
        <div className="gk-utils">
          <button type="button" className="gk-util" onClick={onOpenPalette} title="Command palette (Ctrl+K)" aria-label="Command palette">{ICONS.command}</button>
          <button type="button" className="gk-util" onClick={onOpenConsole} title="Diagnostics console" aria-label="Diagnostics console">{ICONS.terminal}</button>
          <button type="button" className="gk-util" onClick={onOpenShortcuts} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">{ICONS.keyboard}</button>
          <button type="button" className="gk-util" onClick={onUseSimplified} title="Switch to the simplified layout" aria-label="Simplified layout">{ICONS.simple}</button>
          <button type="button" className="gk-util" onClick={onOpenSettings} title="Settings and appearance" aria-label="Settings">{ICONS.settings}</button>
        </div>
        <button
          type="button"
          className={`sc-generate-button gk-generate ${isGenerating ? 'is-cancel' : ''}`}
          onClick={isGenerating ? onCancel : onGenerate}
          title={isGenerating ? 'Cancel the active generation' : 'Generate from the current prompt and parameters (Ctrl+Enter)'}
        >
          {isGenerating ? ICONS.stop : ICONS.spark}
          <span>{isGenerating ? 'Stop' : 'Generate!'}</span>
        </button>
        <div className={`gk-ink ${isGenerating ? 'is-on' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isGenerating ? pct : 0} aria-label="Generation progress"><i style={{ width: `${isGenerating ? pct : 0}%` }} /></div>
      </header>

      <div className="gk-pages">
        {/* ================= Draw ================= */}
        {visited.includes('draw') && (
          <section className={`gk-page gk-draw ${shown('draw') ? '' : 'is-hidden'}`} aria-label="Draw">
            <div className="gk-main">
              <Frame title="Prompt" className="gk-prompt-frame" style={{ height: promptH }}>
                {Prompt && <div className="gk-fill"><Prompt {...PANEL_PROPS} /></div>}
              </Frame>
              <div className="gk-hresize" role="separator" aria-orientation="horizontal" aria-label="Resize prompt frame" title="Drag to resize"
                onPointerDown={onDragStart('prompt', promptH)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
              <Frame title="Viewport" className="gk-stage-frame">
                {Preview && <div className="gk-fill"><Preview {...PANEL_PROPS} /></div>}
              </Frame>
              <div className="gk-story" aria-label="Storyboard of recent generations">
                <Filmstrip items={recent} activeImage={activeImage} resolveImageUrl={resolveImageUrl} onOpenImage={onOpenImage} onMore={() => setPage('archive')} numbered className="gk-strip" />
              </div>
            </div>
            <div className="gk-vresize" role="separator" aria-orientation="vertical" aria-label="Resize settings frame" title="Drag to resize"
              onPointerDown={onDragStart('side', sideW)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
            <Frame
              title="Settings"
              className="gk-side-frame"
              style={{ width: sideW }}
              label="Settings"
              actions={
                <div className="gk-minitabs" role="tablist" aria-label="Settings tabs">
                  {SIDE_TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={sideTab === t.id} className={`gk-minitab ${sideTab === t.id ? 'is-active' : ''}`} onClick={() => setSideTab(t.id)}>{t.label}</button>
                  ))}
                </div>
              }
            >
              {SIDE_TABS.map((t) => <Lazy key={t.id} panels={panels} k={t.panel} active={shown('draw') && sideTab === t.id} />)}
            </Frame>
          </section>
        )}

        {/* ================= Library ================= */}
        {visited.includes('library') && (
          <section className={`gk-page gk-library ${shown('library') ? '' : 'is-hidden'}`} aria-label="Library">
            <Frame
              title="Models"
              className="gk-grow"
              actions={!civitaiOpen ? <button type="button" className="gk-link" onClick={() => setCivitaiOpen(true)}>Show Civitai</button> : undefined}
            >
              <Lazy panels={panels} k="extranetworks" active={shown('library')} />
            </Frame>
            {civitaiOpen && (
              <>
                <div className="gk-vresize" role="separator" aria-orientation="vertical" aria-label="Resize Civitai frame" title="Drag to resize"
                  onPointerDown={onDragStart('civitai', civitaiW)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
                <Frame title="Civitai" style={{ width: civitaiW }} actions={<button type="button" className="gk-link" onClick={() => setCivitaiOpen(false)}>Hide</button>}>
                  <Lazy panels={panels} k="civitailibrary" active={shown('library') && civitaiOpen} />
                </Frame>
              </>
            )}
          </section>
        )}

        {/* ================= Archive ================= */}
        {visited.includes('archive') && (
          <section className={`gk-page gk-archive ${shown('archive') ? '' : 'is-hidden'}`} aria-label="Archive">
            <Frame title="History" className="gk-grow"><Lazy panels={panels} k="history" active={shown('archive')} /></Frame>
            <Frame title="Gallery" className="gk-grow"><Lazy panels={panels} k="gallery" active={shown('archive')} /></Frame>
          </section>
        )}

        {/* ================= Studio ================= */}
        {visited.includes('studio') && (
          <section className={`gk-page gk-studio ${shown('studio') ? '' : 'is-hidden'}`} aria-label="Studio">
            <Frame title="Tools" className="gk-toolsframe">
              <div className="gk-toollist" role="list">
                {STUDIO_TOOLS.map((s) => (
                  <button key={s.panel} type="button" role="listitem" className={`gk-toolitem ${studioPanel === s.panel ? 'is-active' : ''}`} onClick={() => setStudioPanel(s.panel)}>
                    <span className="gk-toolitem-title">{s.label}</span>
                    <span className="gk-toolitem-hint">{s.hint}</span>
                  </button>
                ))}
              </div>
            </Frame>
            <Frame title={STUDIO_TOOLS.find((s) => s.panel === studioPanel)?.label || 'Pick a tool'} className="gk-grow">
              {!studioPanel && (
                <div className="gk-empty">
                  <BrandMark size={52} className="gk-empty-mark" />
                  <div className="gk-empty-title">Choose a tool from the list</div>
                  <p>Helpers for prompts, scenes and characters live here. Everything you open stays ready while you switch pages.</p>
                </div>
              )}
              {STUDIO_TOOLS.map((s) => <Lazy key={s.panel} panels={panels} k={s.panel} active={shown('studio') && studioPanel === s.panel} />)}
            </Frame>
          </section>
        )}
      </div>

      <ViewerOverlay panels={panels} open={viewerOpen} onClose={() => setViewerOpen(false)} />
    </div>
  );
};
