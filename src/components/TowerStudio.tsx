import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { BrandMark } from './BrandMark';
import {
  Filmstrip, ICONS, PanelStack, STUDIO_TOOLS, TOOLS, ViewerOverlay, clamp, usePersisted, useRecentHistory,
  useViewerOverlay, useVisitedPanels, type StudioShellProps,
} from './studio/shared';

/**
 * Tower: a control-room layout built for speed. Everything you touch most is on screen at once and nothing hides
 * in a drawer.
 *
 *   vitals bar   link state, model switcher, queue and live progress
 *   left         prompt editor, editable LoRA chips, quick controls, Generate
 *   centre       the viewport and a filmstrip of recent images
 *   right        tabbed libraries and settings (Alt+1..8)
 *   hint bar     the keyboard shortcuts that matter
 *
 * Colours follow aviation display conventions: cyan = selected, green = engaged / ready, amber = caution.
 */

export type TowerStudioProps = StudioShellProps;

const TAB_ORDER = ['models', 'params', 'adetailer', 'controlnet', 'history', 'gallery', 'civitai', 'studio'];
const TABS = TAB_ORDER.map((id) => TOOLS.find((t) => t.id === id)!).filter(Boolean);

const KEYS = {
  tab: 'sc_tower_tab_v1',
  studio: 'sc_tower_studio_v1',
  leftW: 'sc_tower_left_w_v1',
  rightW: 'sc_tower_right_w_v1',
  leftOpen: 'sc_tower_left_open_v1',
  rightOpen: 'sc_tower_right_open_v1',
  hints: 'sc_tower_hints_v1',
};

/* ---------------------------------------------------------------------------
   Prompt helpers: LoRA tokens (<lora:name:weight>) become editable chips.
   --------------------------------------------------------------------------- */

interface LoraToken { name: string; weight: number; start: number; end: number }

export function parseLoras(text: string): LoraToken[] {
  const out: LoraToken[] = [];
  const re = /<lora:([^:>]+?)(?::(-?\d*\.?\d+))?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ name: m[1], weight: m[2] === undefined ? 1 : Number(m[2]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const fmtWeight = (w: number) => String(Number(w.toFixed(2)));

export function setLoraWeight(text: string, token: LoraToken, weight: number): string {
  return `${text.slice(0, token.start)}<lora:${token.name}:${fmtWeight(weight)}>${text.slice(token.end)}`;
}

export function removeLora(text: string, token: LoraToken): string {
  let before = text.slice(0, token.start);
  let after = text.slice(token.end);
  // Take one neighbouring comma with the token so the prompt stays tidy.
  if (/^\s*,\s*/.test(after)) after = after.replace(/^\s*,\s*/, '');
  else before = before.replace(/,\s*$/, '');
  return (before + after).replace(/ {2,}/g, ' ');
}

const ASPECTS: Array<{ label: string; r: number }> = [
  { label: '1:1', r: 1 }, { label: '3:4', r: 3 / 4 }, { label: '2:3', r: 2 / 3 }, { label: '9:16', r: 9 / 16 },
  { label: '4:3', r: 4 / 3 }, { label: '3:2', r: 3 / 2 }, { label: '16:9', r: 16 / 9 },
];
const snap64 = (n: number) => Math.max(256, Math.round(n / 64) * 64);

/* --------------------------------------------------------------------------- small controls */

const NumField: React.FC<{
  label: string; value: number; min: number; max: number; step: number; digits?: number;
  onChange: (n: number) => void; title?: string;
}> = ({ label, value, min, max, step, digits = 0, onChange, title }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) { setDraft(String(value)); return; }
    onChange(Number(clamp(n, min, max).toFixed(digits)));
  };
  const bump = (dir: 1 | -1) => onChange(Number(clamp(value + dir * step, min, max).toFixed(digits)));
  return (
    <div className="tw-field" title={title}>
      <span className="tw-field-label">{label}</span>
      <div className="tw-stepper">
        <button type="button" className="tw-step" aria-label={`Decrease ${label}`} onClick={() => bump(-1)}>{ICONS.minus}</button>
        <input
          className="tw-num"
          type="text"
          inputMode="decimal"
          value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
        />
        <button type="button" className="tw-step" aria-label={`Increase ${label}`} onClick={() => bump(1)}>{ICONS.plus}</button>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------- LoRA chips */

const LoraChips: React.FC = () => {
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const tokens = useMemo(() => parseLoras(prompt || ''), [prompt]);
  if (!tokens.length) return null;
  return (
    <div className="tw-loras" aria-label="LoRAs in the prompt">
      <div className="tw-section-label">LoRAs in prompt <span>{tokens.length}</span></div>
      <div className="tw-lora-list">
        {tokens.map((t, i) => (
          <div className="tw-lora" key={`${t.name}-${t.start}`}>
            <span className="tw-lora-name" title={t.name}>{t.name.split('/').pop()}</span>
            <button type="button" className="tw-lora-btn" aria-label={`Lower weight of ${t.name}`} onClick={() => setPrompt(setLoraWeight(prompt, tokens[i], clamp(t.weight - 0.05, -2, 2)))}>{ICONS.minus}</button>
            <span className="tw-lora-weight" title="Click − / + to change by 0.05">{t.weight.toFixed(2)}</span>
            <button type="button" className="tw-lora-btn" aria-label={`Raise weight of ${t.name}`} onClick={() => setPrompt(setLoraWeight(prompt, tokens[i], clamp(t.weight + 0.05, -2, 2)))}>{ICONS.plus}</button>
            <button type="button" className="tw-lora-btn is-remove" aria-label={`Remove ${t.name} from the prompt`} title="Remove from prompt" onClick={() => setPrompt(removeLora(prompt, tokens[i]))}>{ICONS.close}</button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------- quick controls */

const QuickControls: React.FC<{ resolveImageUrl: (u?: string) => string }> = ({ resolveImageUrl }) => {
  const width = useAppStore((s) => s.width);
  const height = useAppStore((s) => s.height);
  const steps = useAppStore((s) => s.steps);
  const cfgScale = useAppStore((s) => s.cfgScale);
  const seed = useAppStore((s) => s.seed);
  const batchCount = useAppStore((s) => s.batchCount);
  const setParams = useAppStore((s) => s.setParams);
  const setModel = useAppStore((s) => s.setModel);
  const model = useAppStore((s) => s.model);
  const history = useAppStore((s) => s.history);
  const activeImage = useAppStore((s) => s.activeImage);
  const [seedDraft, setSeedDraft] = useState(seed === -1 ? '' : String(seed));
  useEffect(() => setSeedDraft(seed === -1 ? '' : String(seed)), [seed]);

  const current: any = useMemo(
    () => (history || []).find((h: any) => activeImage && resolveImageUrl(h.imageUrl) === activeImage) || null,
    [history, activeImage, resolveImageUrl],
  );

  const ratio = width > 0 && height > 0 ? width / height : 1;
  const applyAspect = (r: number) => {
    const area = width > 0 && height > 0 ? width * height : 1024 * 1024;
    setParams({ width: snap64(Math.sqrt(area * r)), height: snap64(Math.sqrt(area / r)) });
  };
  const commitSeed = (text: string) => {
    const t = text.trim();
    if (t === '') { setParams({ seed: -1 }); return; }
    const n = Math.floor(Number(t));
    if (Number.isFinite(n) && n >= -1) setParams({ seed: n }); else setSeedDraft(seed === -1 ? '' : String(seed));
  };
  const reuseSettings = () => {
    if (!current) return;
    const p = current.params || {};
    const next: Record<string, unknown> = {};
    if (current.prompt != null) next.prompt = current.prompt;
    if (current.negativePrompt != null) next.negativePrompt = current.negativePrompt;
    if (p.steps != null) next.steps = p.steps;
    if (p.cfgScale != null) next.cfgScale = p.cfgScale;
    if (p.seed != null) next.seed = p.seed;
    if (p.width != null) next.width = p.width;
    if (p.height != null) next.height = p.height;
    if (p.sampler) next.sampler = p.sampler;
    if (p.scheduler) next.scheduler = p.scheduler;
    setParams(next as any);
    if (p.model && p.model !== model) setModel(p.model);
  };

  return (
    <div className="tw-quick" aria-label="Quick controls">
      <div className="tw-section-label">Size</div>
      <div className="tw-aspects" role="group" aria-label="Aspect ratio">
        {ASPECTS.map((a) => (
          <button key={a.label} type="button" className={`tw-chip ${Math.abs(ratio - a.r) < 0.03 ? 'is-on' : ''}`} onClick={() => applyAspect(a.r)} title={`Keep the pixel count, change the shape to ${a.label}`}>{a.label}</button>
        ))}
        <button type="button" className="tw-chip is-icon" onClick={() => setParams({ width: height, height: width })} title="Swap width and height" aria-label="Swap width and height">{ICONS.swap}</button>
        <span className="tw-size" title="Width x height in pixels">{width}×{height}</span>
      </div>

      <div className="tw-grid3">
        <NumField label="Steps" value={steps} min={1} max={150} step={1} onChange={(n) => setParams({ steps: n })} />
        <NumField label="CFG" value={cfgScale} min={1} max={30} step={0.5} digits={1} onChange={(n) => setParams({ cfgScale: n })} />
        <NumField label="Batch" value={batchCount} min={1} max={32} step={1} onChange={(n) => setParams({ batchCount: n })} />
      </div>

      <div className="tw-seedrow">
        <div className="tw-field tw-seed">
          <span className="tw-field-label">Seed</span>
          <div className="tw-stepper">
            <input
              className="tw-num is-wide"
              type="text"
              inputMode="numeric"
              placeholder="random"
              value={seedDraft}
              aria-label="Seed"
              onChange={(e) => setSeedDraft(e.target.value)}
              onBlur={(e) => commitSeed(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitSeed((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
            />
            <button type="button" className={`tw-step ${seed === -1 ? 'is-on' : ''}`} onClick={() => setParams({ seed: -1 })} title="Random seed for every generation" aria-label="Random seed">{ICONS.dice}</button>
          </div>
        </div>
      </div>
      <div className="tw-actions">
        <button type="button" className="tw-action" disabled={!current || current.params?.seed == null} onClick={() => current?.params?.seed != null && setParams({ seed: current.params.seed })} title="Use the seed of the image in the viewport">
          {ICONS.seedFrom}<span>Seed from image</span>
        </button>
        <button type="button" className="tw-action" disabled={!current} onClick={reuseSettings} title="Load the prompt, model and parameters of the image in the viewport">
          {ICONS.reuse}<span>Reuse settings</span>
        </button>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------- shell */

export const TowerStudio: React.FC<TowerStudioProps> = ({
  panels, isGenerating, onGenerate, onCancel, queuedCount, isConnected, isReconnecting, modelCount,
  resolveImageUrl, onOpenImage, onOpenSettings, onOpenShortcuts, onOpenConsole, onOpenPalette, onOpenDiagnostics, onUseSimplified,
}) => {
  const model = useAppStore((s) => s.model);
  const modelsList = useAppStore((s) => s.modelsList);
  const setModel = useAppStore((s) => s.setModel);
  const progressPercent = useAppStore((s) => s.progressPercent);
  const currentStep = useAppStore((s) => s.currentStep);
  const steps = useAppStore((s) => s.steps);
  const eta = useAppStore((s) => ((s as any).metrics?.eta ?? (s as any).eta ?? null) as number | null);
  const { recent, activeImage } = useRecentHistory(40);

  const [tab, setTab] = usePersisted<string>(KEYS.tab, 'models');
  const [studioPanel, setStudioPanel] = usePersisted<string | null>(KEYS.studio, null);
  const [leftW, setLeftW] = usePersisted<number>(KEYS.leftW, 400);
  const [rightW, setRightW] = usePersisted<number>(KEYS.rightW, 440);
  const [leftOpen, setLeftOpen] = usePersisted<boolean>(KEYS.leftOpen, true);
  const [rightOpen, setRightOpen] = usePersisted<boolean>(KEYS.rightOpen, true);
  const [showHints, setShowHints] = usePersisted<boolean>(KEYS.hints, true);
  const [viewerOpen, setViewerOpen] = useViewerOverlay();

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];
  const activePanelKey = activeTab.panel ?? studioPanel;
  const visited = useVisitedPanels(activePanelKey);

  /* column resize */
  const drag = useRef<{ side: 'left' | 'right'; start: number; base: number } | null>(null);
  const onDragStart = (side: 'left' | 'right', base: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { side, start: e.clientX, base };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.start;
    if (d.side === 'left') setLeftW(clamp(d.base + dx, 320, 640));
    else setRightW(clamp(d.base - dx, 340, 760));
  };
  const onDragEnd = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
  };

  /* keyboard: Alt+1..8 tabs, Alt+B / Alt+L columns, [ ] or , . to browse images */
  const browse = (dir: 1 | -1) => {
    if (!recent.length) return;
    const index = recent.findIndex((item: any) => resolveImageUrl(item.imageUrl) === activeImage);
    // The strip reads newest to oldest from left to right, so "next" (]) moves towards older images.
    const next = index === -1 ? 0 : clamp(index + dir, 0, recent.length - 1);
    onOpenImage(recent[next]);
  };
  const browseRef = useRef(browse);
  browseRef.current = browse;
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      return !!node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));
    };
    const onKey = (e: KeyboardEvent) => {
      // AltGr (Ctrl+Alt) types characters on many layouts, so never treat it as a shortcut.
      if (e.ctrlKey || e.metaKey) return;
      if (e.altKey && !e.shiftKey) {
        const digit = /^[1-8]$/.test(e.key) ? Number(e.key) : 0;
        if (digit) { e.preventDefault(); setTab(TAB_ORDER[digit - 1]); setRightOpen(true); return; }
        if (e.key.toLowerCase() === 'b') { e.preventDefault(); setLeftOpen((v) => !v); return; }
        if (e.key.toLowerCase() === 'l') { e.preventDefault(); setRightOpen((v) => !v); return; }
        return;
      }
      if (e.altKey || isTyping(e.target)) return;
      if (e.key === '[' || e.key === ',') { e.preventDefault(); browseRef.current(-1); }
      else if (e.key === ']' || e.key === '.') { e.preventDefault(); browseRef.current(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab, setRightOpen, setLeftOpen]);

  const status = isReconnecting ? 'reconnecting' : isConnected ? 'online' : 'offline';
  const statusText = isReconnecting ? 'Reconnecting' : isConnected ? 'SwarmUI ready' : 'SwarmUI offline';
  const Preview = panels.preview;
  const Prompt = panels.promptpills;
  const showLauncher = activeTab.id === 'studio' && !studioPanel;
  const modelOptions = useMemo(() => {
    const names = (modelsList || []).map((m: any) => ({ value: m.name as string, label: String(m.aliases?.[0] || m.name).replace(/\.(safetensors|ckpt|pt|sft|gguf)$/i, '') }));
    if (model && !names.some((n) => n.value === model)) names.unshift({ value: model, label: model.replace(/\.(safetensors|ckpt|pt|sft|gguf)$/i, '') });
    return names;
  }, [modelsList, model]);

  const pct = clamp(Math.round(progressPercent || 0), 0, 100);
  const progressText = isGenerating
    ? `Step ${currentStep || 0}/${steps}  ·  ${pct}%${typeof eta === 'number' && eta > 0 ? `  ·  ~${Math.round(eta)}s` : ''}`
    : 'Idle';

  return (
    <div className="tw-root">
      {/* ---- vitals bar ---- */}
      <header className="tw-vitals">
        <div className="tw-brand"><BrandMark size={26} busy={isGenerating} /><span className="tw-brand-name">SwarmCanvas</span></div>
        <button type="button" className="tw-link" onClick={onOpenDiagnostics} title={`${statusText} - open diagnostics`}>
          <i className={`tw-lamp is-${status}`} aria-hidden="true" />{statusText}
        </button>
        <label className="tw-model" title="Active checkpoint">
          <span>Model</span>
          <select value={model || ''} onChange={(e) => setModel(e.target.value)} aria-label="Active model">
            {modelOptions.length === 0 && <option value="">{isConnected ? 'No models found' : 'Not connected'}</option>}
            {modelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <em>{modelCount}</em>
        </label>
        <div className="tw-readout" title="Jobs waiting to run"><span>Queue</span><b>{queuedCount}</b></div>
        <div className={`tw-progress ${isGenerating ? 'is-on' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isGenerating ? pct : 0} aria-label="Generation progress">
          <div className="tw-meter"><i style={{ width: `${isGenerating ? pct : 0}%` }} /></div>
          <span className="tw-progress-text">{progressText}</span>
        </div>
        <div className="tw-spacer" />
        <div className="tw-tools">
          <button type="button" className="tw-tool" onClick={() => setLeftOpen((v) => !v)} aria-pressed={leftOpen} title="Show or hide the input column (Alt+B)" aria-label="Toggle input column">{ICONS.panelLeft}</button>
          <button type="button" className="tw-tool" onClick={() => setRightOpen((v) => !v)} aria-pressed={rightOpen} title="Show or hide the library column (Alt+L)" aria-label="Toggle library column">{ICONS.panelRight}</button>
          <span className="tw-vsep" />
          <button type="button" className="tw-tool" onClick={onOpenPalette} title="Command palette (Ctrl+K)" aria-label="Command palette">{ICONS.command}</button>
          <button type="button" className="tw-tool" onClick={onOpenConsole} title="Diagnostics console" aria-label="Diagnostics console">{ICONS.terminal}</button>
          <button type="button" className="tw-tool" onClick={() => { setShowHints(true); onOpenShortcuts(); }} title="Keyboard shortcuts (also brings back the hint bar)" aria-label="Keyboard shortcuts">{ICONS.keyboard}</button>
          <button type="button" className="tw-tool" onClick={onUseSimplified} title="Switch to the simplified layout" aria-label="Simplified layout">{ICONS.simple}</button>
          <button type="button" className="tw-tool" onClick={onOpenSettings} title="Settings and appearance" aria-label="Settings">{ICONS.settings}</button>
        </div>
      </header>

      <div className="tw-body">
        {/* ---- inputs ---- */}
        <aside className={`tw-col tw-left ${leftOpen ? '' : 'is-collapsed'}`} style={leftOpen ? { width: leftW } : undefined} aria-label="Inputs">
          <div className="tw-col-inner">
            <div className="tw-prompt">{Prompt && <Prompt {...{ api: {} as any, containerApi: {} as any, params: {} }} />}</div>
            <LoraChips />
            <QuickControls resolveImageUrl={resolveImageUrl} />
            <button
              type="button"
              className={`sc-generate-button tw-generate ${isGenerating ? 'is-cancel' : ''}`}
              onClick={isGenerating ? onCancel : onGenerate}
              title={isGenerating ? 'Cancel the active generation' : 'Generate from the current prompt and parameters (Ctrl+Enter)'}
            >
              {isGenerating ? ICONS.stop : ICONS.spark}
              <span>{isGenerating ? 'Stop' : 'Generate'}</span>
              <kbd>{isGenerating ? 'active' : 'Ctrl+Enter'}</kbd>
            </button>
          </div>
        </aside>
        {leftOpen && (
          <div className="tw-resizer" role="separator" aria-orientation="vertical" aria-label="Resize input column" title="Drag to resize"
            onPointerDown={onDragStart('left', leftW)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
        )}

        {/* ---- stage ---- */}
        <main className="tw-center">
          <section className="tw-stage" aria-label="Viewport">
            {Preview && <div className="tw-fill"><Preview {...{ api: {} as any, containerApi: {} as any, params: {} }} /></div>}
          </section>
          <Filmstrip items={recent} activeImage={activeImage} resolveImageUrl={resolveImageUrl} onOpenImage={onOpenImage} onMore={() => { setTab('history'); setRightOpen(true); }} className="tw-filmstrip" />
        </main>

        {/* ---- library ---- */}
        {rightOpen && (
          <div className="tw-resizer" role="separator" aria-orientation="vertical" aria-label="Resize library column" title="Drag to resize"
            onPointerDown={onDragStart('right', rightW)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
        )}
        <aside className={`tw-col tw-right ${rightOpen ? '' : 'is-collapsed'}`} style={rightOpen ? { width: rightW } : undefined} aria-label="Library">
          <div className="tw-col-inner">
            <div className="tw-tabs" role="tablist" aria-label="Library tabs">
              {TABS.map((t, i) => (
                <button key={t.id} type="button" role="tab" aria-selected={activeTab.id === t.id} className={`tw-tab ${activeTab.id === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} title={`${t.label} (Alt+${i + 1}): ${t.hint}`}>
                  {t.icon}<span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="tw-tabbody" role="tabpanel">
              {showLauncher && (
                <div className="tw-launcher" role="list">
                  {STUDIO_TOOLS.map((s) => (
                    <button key={s.panel} type="button" role="listitem" className="tw-launch" onClick={() => setStudioPanel(s.panel)}>
                      <span className="tw-launch-title">{s.label}</span><span className="tw-launch-hint">{s.hint}</span>
                    </button>
                  ))}
                </div>
              )}
              {activeTab.id === 'studio' && studioPanel && (
                <button type="button" className="tw-back" onClick={() => setStudioPanel(null)}>{ICONS.back}<span>Studio tools</span></button>
              )}
              <div className={`tw-panelarea ${showLauncher ? 'is-empty' : ''}`}>
                <PanelStack panels={panels} visited={visited} activeKey={activePanelKey} shown={rightOpen} />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showHints && (
        <footer className="tw-hints" aria-label="Keyboard shortcuts">
          <span><kbd>Ctrl</kbd><kbd>Enter</kbd> generate</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> commands</span>
          <span><kbd>Alt</kbd><kbd>1</kbd>–<kbd>8</kbd> library tabs</span>
          <span><kbd>[</kbd><kbd>]</kbd> or <kbd>,</kbd><kbd>.</kbd> browse images</span>
          <span><kbd>Alt</kbd><kbd>B</kbd> / <kbd>L</kbd> columns</span>
          <button type="button" className="tw-hints-close" onClick={() => setShowHints(false)} aria-label="Hide shortcut hints" title="Hide (the keyboard button in the top bar brings them back)">{ICONS.close}</button>
        </footer>
      )}

      <ViewerOverlay panels={panels} open={viewerOpen} onClose={() => setViewerOpen(false)} />
    </div>
  );
};
