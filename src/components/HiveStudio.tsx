import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { BrandMark } from './BrandMark';
import { ICONS, PANEL_PROPS, STUDIO_TOOLS, TOOLS, clamp, usePersisted, type StudioShellProps } from './studio/shared';

/**
 * Hive Studio: the interface that replaces the tiled Dockview layout when the Hive theme is selected.
 *
 *   rail      labelled tool buttons + connection state (no top bar)
 *   drawer    one tool panel at a time, resizable; the same panels the classic layout uses
 *   stage     the viewport, full height
 *   filmstrip recent generations under the stage
 *   composer  prompt editor + Generate, docked at the bottom
 *
 * The panels are injected (`panels`) so this file does not depend on Workspace.tsx.
 */

export type HiveStudioProps = StudioShellProps;

const KEYS = {
  tool: 'sc_hive_tool_v1',
  studio: 'sc_hive_studio_panel_v1',
  drawer: 'sc_hive_drawer_width_v1',
  composerOpen: 'sc_hive_composer_open_v1',
  composerHeight: 'sc_hive_composer_height_v1',
};

/* -- component ------------------------------------------------------------ */

export const HiveStudio: React.FC<HiveStudioProps> = ({
  panels, isGenerating, onGenerate, onCancel, queuedCount, isConnected, isReconnecting, modelCount,
  resolveImageUrl, onOpenImage, onOpenSettings, onOpenShortcuts, onOpenConsole, onOpenPalette, onOpenDiagnostics, onUseSimplified,
}) => {
  const history = useAppStore((s) => s.history);
  const activeImage = useAppStore((s) => s.activeImage);
  const prompt = useAppStore((s) => s.prompt);

  const [activeTool, setActiveTool] = usePersisted<string | null>(KEYS.tool, 'params');
  const [studioPanel, setStudioPanel] = usePersisted<string | null>(KEYS.studio, null);
  const [drawerWidth, setDrawerWidth] = usePersisted<number>(KEYS.drawer, 400);
  const [composerOpen, setComposerOpen] = usePersisted<boolean>(KEYS.composerOpen, true);
  const [composerHeight, setComposerHeight] = usePersisted<number>(KEYS.composerHeight, 280);
  const [viewerOpen, setViewerOpen] = useState(false);

  const tool = TOOLS.find((t) => t.id === activeTool) || null;
  const activePanelKey = tool ? (tool.panel ?? studioPanel) : null;

  // Panels stay mounted once opened, so search text, scroll position and unsaved edits survive switching tools.
  const [visited, setVisited] = useState<string[]>(() => (activePanelKey ? [activePanelKey] : []));
  useEffect(() => {
    if (activePanelKey) setVisited((prev) => (prev.includes(activePanelKey) ? prev : [...prev, activePanelKey]));
  }, [activePanelKey]);

  const toggleTool = (id: string) => setActiveTool((current) => (current === id ? null : id));
  const openTool = useCallback((id: string) => setActiveTool(id), [setActiveTool]);

  /* drawer resize */
  const drag = useRef<{ axis: 'x' | 'y'; start: number; base: number } | null>(null);
  const onDragStart = (axis: 'x' | 'y', base: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { axis, start: axis === 'x' ? e.clientX : e.clientY, base };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.axis === 'x') setDrawerWidth(clamp(d.base + (e.clientX - d.start), 320, 760));
    else setComposerHeight(clamp(d.base - (e.clientY - d.start), 200, 640));
  };
  const onDragEnd = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  /* image-open requests that target the generation viewer show it as an overlay in this layout */
  useEffect(() => {
    const open = () => setViewerOpen(true);
    window.addEventListener('swarm-open-generation-viewer', open);
    return () => window.removeEventListener('swarm-open-generation-viewer', open);
  }, []);
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen]);

  const recent = useMemo(
    () => [...(history || [])].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 40),
    [history],
  );

  const summary = (prompt || '').replace(/\s+/g, ' ').trim();
  const status = isReconnecting ? 'reconnecting' : isConnected ? 'online' : 'offline';
  const statusText = isReconnecting ? 'Reconnecting to SwarmUI' : isConnected ? 'Connected to SwarmUI' : 'SwarmUI is not connected';

  const Preview = panels.preview;
  const Prompt = panels.promptpills;
  const Viewer = panels.generationviewer;
  const drawerOpen = Boolean(tool);
  const showLauncher = tool?.id === 'studio' && !studioPanel;

  return (
    <div className="hs-root">
      {/* ---- rail ---- */}
      <nav className="hs-rail" aria-label="Tools">
        <button type="button" className="hs-brand" onClick={onOpenDiagnostics} title={`${statusText} - open diagnostics`} aria-label={`${statusText}. Open diagnostics`}>
          <BrandMark size={40} busy={isGenerating} />
          <span className={`hs-status is-${status}`} />
        </button>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`hs-rail-btn ${activeTool === t.id ? 'is-active' : ''}`}
            aria-pressed={activeTool === t.id}
            title={`${t.label}: ${t.hint}`}
            onClick={() => toggleTool(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <div className="hs-rail-spacer" />
        <button type="button" className="hs-rail-btn is-small" onClick={onOpenPalette} title="Command palette (Ctrl+K)" aria-label="Command palette">{ICONS.command}</button>
        <button type="button" className="hs-rail-btn is-small" onClick={onOpenConsole} title="Diagnostics console" aria-label="Diagnostics console">{ICONS.terminal}</button>
        <button type="button" className="hs-rail-btn is-small" onClick={onOpenShortcuts} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">{ICONS.keyboard}</button>
        <button type="button" className="hs-rail-btn is-small" onClick={onUseSimplified} title="Switch to the simplified layout" aria-label="Simplified layout">{ICONS.simple}</button>
        <button type="button" className="hs-rail-btn is-small" onClick={onOpenSettings} title="Settings and appearance" aria-label="Settings">{ICONS.settings}</button>
      </nav>

      {/* ---- drawer ---- */}
      <aside className={`hs-drawer ${drawerOpen ? '' : 'is-closed'}`} style={{ width: drawerWidth }} aria-label={tool ? tool.label : 'Tool drawer'} aria-hidden={!drawerOpen}>
        <header className="hs-drawer-head">
          {tool?.id === 'studio' && studioPanel && (
            <button type="button" className="hs-icon-btn" onClick={() => setStudioPanel(null)} title="Back to studio tools" aria-label="Back to studio tools">{ICONS.back}</button>
          )}
          <div className="hs-drawer-titles">
            <div className="hs-drawer-title">{tool?.id === 'studio' && studioPanel ? (STUDIO_TOOLS.find((s) => s.panel === studioPanel)?.label || tool.label) : tool?.label}</div>
            <div className="hs-drawer-sub">{tool?.id === 'studio' && studioPanel ? 'Studio' : tool?.hint}</div>
          </div>
          <div className="hs-drawer-actions">
            <button type="button" className="hs-icon-btn" onClick={() => setDrawerWidth((w) => (w < 520 ? 640 : 400))} title="Make the drawer wider or narrower" aria-label="Toggle drawer width">{ICONS.wide}</button>
            <button type="button" className="hs-icon-btn" onClick={() => setActiveTool(null)} title="Close drawer" aria-label="Close drawer">{ICONS.close}</button>
          </div>
        </header>
        <div className="hs-drawer-body">
          {showLauncher && (
            <div className="hs-launcher" role="list">
              {STUDIO_TOOLS.map((s) => (
                <button key={s.panel} type="button" role="listitem" className="hs-launch-card" onClick={() => setStudioPanel(s.panel)}>
                  <span className="hs-launch-title">{s.label}</span>
                  <span className="hs-launch-hint">{s.hint}</span>
                </button>
              ))}
            </div>
          )}
          {visited.map((key) => {
            const Panel = panels[key];
            if (!Panel) return null;
            return (
              <div key={key} className={`hs-panel-host ${key === activePanelKey && drawerOpen ? '' : 'is-hidden'}`}>
                <Panel {...PANEL_PROPS} />
              </div>
            );
          })}
        </div>
      </aside>
      {drawerOpen && (
        <div
          className="hs-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer"
          title="Drag to resize"
          onPointerDown={onDragStart('x', drawerWidth)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
      )}

      {/* ---- stage ---- */}
      <main className="hs-main">
        <section className="hs-stage" aria-label="Viewport">
          {Preview && <div className="hs-panel-fill"><Preview {...PANEL_PROPS} /></div>}
        </section>

        {recent.length > 0 && (
          <div className="hs-filmstrip" role="list" aria-label="Recent generations">
            {recent.map((item: any) => {
              const src = resolveImageUrl(item.imageUrl);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`hs-frame ${activeImage === src ? 'is-active' : ''}`}
                  onClick={() => onOpenImage(item)}
                  title={String(item.prompt || '').slice(0, 160) || 'Open image'}
                >
                  <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                </button>
              );
            })}
            <button type="button" className="hs-frame-more" onClick={() => openTool('history')} title="Open the full history">All history</button>
          </div>
        )}

        {/* ---- composer ---- */}
        <section className="hs-composer" aria-label="Prompt composer">
          {composerOpen && (
            <>
              <div
                className="hs-composer-resize"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize prompt editor"
                title="Drag to resize"
                onPointerDown={onDragStart('y', composerHeight)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              />
              <div className="hs-composer-editor" style={{ height: composerHeight }}>
                {Prompt && <Prompt {...PANEL_PROPS} />}
              </div>
            </>
          )}
          <div className="hs-composer-bar">
            <button type="button" className="hs-composer-toggle" onClick={() => setComposerOpen((v) => !v)} aria-expanded={composerOpen} title={composerOpen ? 'Collapse the prompt editor' : 'Open the prompt editor'}>
              <span className={`hs-chevron ${composerOpen ? 'is-open' : ''}`}>{ICONS.chevron}</span>
              Prompt
            </button>
            <div className={`hs-composer-summary ${summary ? '' : 'is-empty'}`} title={summary || undefined}>
              {summary || 'Describe what to generate'}
            </div>
            <div className="hs-composer-meta" title={statusText}>
              <span className={`hs-meta-dot is-${status}`} />
              <span>{isReconnecting ? 'Reconnecting' : isConnected ? `${modelCount} models` : 'Offline'}</span>
              {queuedCount > 0 && <span className="hs-queue">{queuedCount} {queuedCount === 1 ? 'job' : 'jobs'}</span>}
            </div>
            <button
              type="button"
              className={`sc-generate-button hs-generate ${isGenerating ? 'is-cancel' : ''}`}
              onClick={isGenerating ? onCancel : onGenerate}
              title={isGenerating ? 'Cancel the active generation' : 'Generate from the current prompt and parameters'}
            >
              {isGenerating ? ICONS.stop : ICONS.spark}
              <span>{isGenerating ? 'Stop' : 'Generate'}</span>
            </button>
          </div>
        </section>
      </main>

      {viewerOpen && Viewer && (
        <div className="hs-overlay" onClick={() => setViewerOpen(false)}>
          <div className="hs-overlay-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Generation viewer">
            <header className="hs-overlay-head">
              <span className="hs-drawer-title">Generation viewer</span>
              <button type="button" className="hs-icon-btn" onClick={() => setViewerOpen(false)} title="Close (Esc)" aria-label="Close">{ICONS.close}</button>
            </header>
            <div className="hs-overlay-body"><Viewer {...PANEL_PROPS} /></div>
          </div>
        </div>
      )}
    </div>
  );
};
