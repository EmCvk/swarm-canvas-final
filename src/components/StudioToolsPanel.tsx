import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Grid3X3, ImagePlus, Code2, FileJson, Link2, Layers3, ChevronDown,
  Copy, Check, Upload, Sparkles, Dices, Settings2, RefreshCw, Minus, Plus,
  SlidersHorizontal, Play, Info, X
} from 'lucide-react';
import { PromptPreset, useAppStore } from '../store/useAppStore';
import { InfoPopover } from './InfoPopover';

interface Props {
  api?: any;
  containerApi?: any;
  params?: any;
}

type AxisKey = 'steps' | 'cfgScale' | 'width' | 'height' | 'sampler' | 'scheduler' | 'seed';

const AXIS_LABELS: Record<AxisKey, string> = {
  steps: 'Steps',
  cfgScale: 'CFG Scale',
  width: 'Width',
  height: 'Height',
  sampler: 'Sampler',
  scheduler: 'Scheduler',
  seed: 'Seed',
};

const THEME = {
  panel: 'sc-tool-panel',
  surface: 'sc-tool-card',
  control: 'sc-tool-control',
  button: 'sc-tool-button',
};

const parseValues = (raw: string, key: AxisKey): Array<string | number> => {
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  if (['steps', 'cfgScale', 'width', 'height', 'seed'].includes(key)) {
    return parts.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  }
  return parts;
};

const expandPromptMatrix = (input: string): string[] => {
  const match = input.match(/\{([^{}|]+\|[^{}]+)\}/);
  if (!match) return [input];
  const options = match[1].split('|').map((x) => x.trim()).filter(Boolean);
  const head = input.slice(0, match.index);
  const tail = input.slice((match.index ?? 0) + match[0].length);
  return options.flatMap((option) => expandPromptMatrix(`${head}${option}${tail}`));
};

const Collapsible: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, description, icon, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`${THEME.surface} sc-animate-in`}>
      <button type="button" className="sc-tool-section-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="sc-tool-section-icon">{icon}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-semibold text-[13px] text-[var(--sc-text)]">{title}</span>
          <span className="block text-[11px] text-[var(--sc-text-muted)] mt-0.5 leading-relaxed">{description}</span>
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-[var(--sc-text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--sc-text-muted)] -rotate-90 transition-transform" />}
      </button>
      {open && <div className="sc-tool-section-body sc-animate-expand">{children}</div>}
    </section>
  );
};

export const StudioToolsPanel: React.FC<Props> = () => {
  const {
    prompt, negativePrompt, setPrompt, setNegativePrompt,
    width, height, steps, cfgScale, seed, sampler, scheduler,
    queueVariantGenerations, history, useGenerationParams,
    modelsList, model, promptPresets, savePromptPreset,
    settings, updateSettings, updateControlNet
  } = useAppStore(useShallow((s) => ({
    prompt: s.prompt, negativePrompt: s.negativePrompt, setPrompt: s.setPrompt, setNegativePrompt: s.setNegativePrompt,
    width: s.width, height: s.height, steps: s.steps, cfgScale: s.cfgScale, seed: s.seed, sampler: s.sampler, scheduler: s.scheduler,
    queueVariantGenerations: s.queueVariantGenerations, history: s.history, useGenerationParams: s.useGenerationParams,
    modelsList: s.modelsList, model: s.model, promptPresets: s.promptPresets || [], savePromptPreset: s.savePromptPreset,
    settings: s.settings, updateSettings: s.updateSettings, updateControlNet: s.updateControlNet,
  })));

  const [axis1, setAxis1] = useState<{ key: AxisKey; values: string }>({ key: 'cfgScale', values: '4, 6, 8' });
  const [axis2, setAxis2] = useState<{ key: AxisKey; values: string }>({ key: 'steps', values: '20, 28, 36' });
  const [axis3, setAxis3] = useState<{ key: AxisKey; values: string }>({ key: 'sampler', values: 'euler_ancestral' });
  const [matrixExpression, setMatrixExpression] = useState(prompt || 'masterpiece, {red|blue} hair, {smile|serious}');
  const [matrixTarget, setMatrixTarget] = useState<'positive' | 'negative'>('positive');
  const [imageUrl, setImageUrl] = useState('');
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [imageStrength, setImageStrength] = useState(0.75);
  const [selectedHistoryId, setSelectedHistoryId] = useState(history[0]?.id || '');
  const [variationCount, setVariationCount] = useState(4);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [copied, setCopied] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [syntaxTarget, setSyntaxTarget] = useState<'positive' | 'negative'>('positive');

  useEffect(() => {
    if (!selectedHistoryId && history[0]) setSelectedHistoryId(history[0].id);
  }, [history, selectedHistoryId]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items || []).find((x) => x.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setImageUrl(String(reader.result || ''));
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', onPaste as EventListener);
    return () => window.removeEventListener('paste', onPaste as EventListener);
  }, []);

  const selectedHistory = useMemo(() => history.find((h) => h.id === selectedHistoryId) || history[0] || null, [history, selectedHistoryId]);
  const metadata = useMemo(() => selectedHistory ? JSON.stringify({
    id: selectedHistory.id,
    batchId: selectedHistory.batchId,
    createdAt: selectedHistory.createdAt,
    timestamp: selectedHistory.timestamp,
    prompt: selectedHistory.prompt,
    negativePrompt: selectedHistory.negativePrompt,
    params: selectedHistory.params,
    imageUrl: selectedHistory.imageUrl,
  }, null, 2) : '{}', [selectedHistory]);

  const axes = [axis1, axis2, axis3];
  const axisCount = axes.reduce((n, axis) => n * Math.max(1, parseValues(axis.values, axis.key).length), 1);

  const queueMatrix = () => {
    const values = axes.map((axis) => parseValues(axis.values, axis.key));
    const variants: Array<Record<string, any>> = [];
    for (const v1 of (values[0].length ? values[0] : [''])) {
      for (const v2 of (values[1].length ? values[1] : [''])) {
        for (const v3 of (values[2].length ? values[2] : [''])) {
          const variant: Record<string, any> = {};
          [[axis1, v1], [axis2, v2], [axis3, v3]].forEach(([axis, value]) => {
            if (value === '') return;
            variant[(axis as typeof axis1).key] = value;
          });
          variants.push(variant);
        }
      }
    }
    queueVariantGenerations(variants.slice(0, 64));
  };

  const queuePromptMatrix = () => {
    const expanded = expandPromptMatrix(matrixExpression).slice(0, 64);
    queueVariantGenerations(expanded.map((text) => matrixTarget === 'positive' ? { prompt: text } : { negativePrompt: text }));
  };

  const queueVariations = () => {
    if (!selectedHistory) return;
    const variants = Array.from({ length: Math.min(16, Math.max(1, variationCount)) }, () => ({
      prompt: selectedHistory.prompt,
      negativePrompt: selectedHistory.negativePrompt || '',
      model: selectedHistory.params.model,
      width: selectedHistory.params.width ?? width,
      height: selectedHistory.params.height ?? height,
      steps: selectedHistory.params.steps,
      cfgScale: selectedHistory.params.cfgScale ?? cfgScale,
      sampler: selectedHistory.params.sampler ?? sampler,
      scheduler: selectedHistory.params.scheduler ?? scheduler,
      seed: Math.floor(Math.random() * 2147483647),
    }));
    queueVariantGenerations(variants);
  };

  const insertSyntax = (snippet: string) => {
    if (syntaxTarget === 'positive') setPrompt(prompt.trim() ? `${prompt.trim()}, ${snippet}` : snippet);
    else setNegativePrompt(negativePrompt.trim() ? `${negativePrompt.trim()}, ${snippet}` : snippet);
  };

  const handleImage = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const copyMetadata = async () => {
    await navigator.clipboard?.writeText(metadata);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const applyHistory = () => {
    if (selectedHistory) useGenerationParams(selectedHistory);
  };

  const linkPresetToModel = () => {
    const preset = (promptPresets || []).find((p) => p.id === selectedPresetId);
    if (!preset || !model) return;
    try {
      const links = JSON.parse(localStorage.getItem('swarm_model_preset_links_v1') || '{}');
      links[model] = preset.id;
      localStorage.setItem('swarm_model_preset_links_v1', JSON.stringify(links));
    } catch { /* noop */ }
  };

  const unlinkPresetFromModel = () => {
    if (!model) return;
    try {
      const links = JSON.parse(localStorage.getItem('swarm_model_preset_links_v1') || '{}');
      delete links[model];
      localStorage.setItem('swarm_model_preset_links_v1', JSON.stringify(links));
    } catch { /* noop */ }
  };

  const saveCurrentPromptPreset = () => {
    const name = presetName.trim() || `${model || 'Model'} ${syntaxTarget === 'positive' ? 'Prompt' : 'Negative'}`;
    savePromptPreset(name, syntaxTarget === 'positive' ? prompt : negativePrompt, syntaxTarget);
    setPresetName('');
  };

  return (
    <div className={THEME.panel}>
      <div className="sc-tool-panel-header">
        <div>
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><span>Studio Tools</span><InfoPopover content="Optional advanced tools live here so the main workspace stays focused. Every section can be collapsed independently." /></div>
          <div className="text-[11px] text-[var(--sc-text-muted)] mt-1">Matrix generation, image guidance, syntax, metadata and model workflows.</div>
        </div>
      </div>

      <Collapsible title="Generation Matrix" description={`Queue a parameter grid without changing your current workspace. Maximum 64 jobs per matrix. Current size: ${Math.min(64, axisCount)}.`} icon={<Grid3X3 className="w-4 h-4" />} defaultOpen>
        {[axis1, axis2, axis3].map((axis, index) => {
          const setAxis = index === 0 ? setAxis1 : index === 1 ? setAxis2 : setAxis3;
          return (
            <div key={index} className="grid grid-cols-[120px_1fr] gap-2 mb-2">
              <select className={THEME.control} value={axis.key} onChange={(e) => setAxis({ ...axis, key: e.target.value as AxisKey })}>
                {(Object.keys(AXIS_LABELS) as AxisKey[]).map((key) => {
                  const otherKeys = axes.filter((_, i) => i !== index).map((a) => a.key);
                  return <option key={key} value={key} disabled={otherKeys.includes(key)}>{AXIS_LABELS[key]}</option>;
                })}
              </select>
              <input className={THEME.control} value={axis.values} onChange={(e) => setAxis({ ...axis, values: e.target.value })} placeholder="Comma-separated values" />
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="text-[11px] text-[var(--sc-text-muted)]">Axis product: <strong className="text-[var(--sc-text)]">{axisCount}</strong> variants</div>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-info`} onClick={queueMatrix}><Grid3X3 className="w-3.5 h-3.5" /> Queue Matrix</button>
        </div>
      </Collapsible>

      <Collapsible title="Prompt Matrix & Syntax" description="Expand {choice A|choice B} alternatives, insert advanced syntax, and queue the combinations." icon={<Code2 className="w-4 h-4" />}>
        <div className="flex gap-2 mb-2">
          <select className={THEME.control} value={matrixTarget} onChange={(e) => setMatrixTarget(e.target.value as any)}><option value="positive">Positive prompt</option><option value="negative">Negative prompt</option></select>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-info`} onClick={queuePromptMatrix}><Play className="w-3.5 h-3.5" /> Queue Matrix</button>
        </div>
        <textarea className={`${THEME.control} min-h-24 resize-y`} value={matrixExpression} onChange={(e) => setMatrixExpression(e.target.value)} />
        <div className="text-[11px] text-[var(--sc-text-muted)] mt-2">Expands to {Math.min(64, expandPromptMatrix(matrixExpression).length)} variants.</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {['{red|blue}', '<lora:model:1>', '(tag:1.2)', 'BREAK', 'AND', '<segment:yolo-face>', '[tag]'].map((snippet) => (
            <button type="button" key={snippet} className="sc-tool-chip" onClick={() => insertSyntax(snippet)}><Code2 className="w-3 h-3" />{snippet}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <select className={THEME.control} value={syntaxTarget} onChange={(e) => setSyntaxTarget(e.target.value as any)}><option value="positive">Insert into Positive</option><option value="negative">Insert into Negative</option></select>
          <InfoPopover content="Syntax inserts are plain prompt text. You can still edit or remove them from the prompt editor after insertion." />
        </div>
      </Collapsible>

      <Collapsible title="Image Guidance" description="Paste, drag or load a reference image and send it to ControlNet Unit 1. Strength maps to the unit weight." icon={<ImagePlus className="w-4 h-4" />}>
        <div
          className={`sc-tool-dropzone ${isImageDragOver ? 'is-dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsImageDragOver(true); }}
          onDragLeave={() => setIsImageDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsImageDragOver(false); handleImage(e.dataTransfer.files?.[0]); }}
        >
          <ImagePlus className="w-5 h-5" />
          <div><strong>Drop an image here</strong><div>or paste from the clipboard</div></div>
          <label className={`${THEME.button} sc-action-button sc-action-neutral cursor-pointer`}><Upload className="w-3.5 h-3.5" /> Browse<input className="hidden" type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} /></label>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className={`${THEME.button} sc-action-button sc-action-success`} disabled={!imageUrl} onClick={() => updateControlNet('1', { enabled: true, image: imageUrl, weight: imageStrength })}><Layers3 className="w-3.5 h-3.5" /> Send to ControlNet 1</button>
          {imageUrl && <button type="button" className={`${THEME.button} sc-action-button sc-action-neutral`} onClick={() => setImageUrl('')}><X className="w-3.5 h-3.5" /> Clear</button>}
        </div>
        {imageUrl && <div className="mt-3 grid grid-cols-[160px_1fr] gap-3 items-start"><div className="aspect-square rounded-lg overflow-hidden bg-black"><img src={imageUrl} alt="Reference preview" className="w-full h-full object-contain" /></div><div><label className="sc-tool-label">Guidance strength <span>{Math.round(imageStrength * 100)}%</span></label><input type="range" min="0" max="1" step="0.05" value={imageStrength} onChange={(e) => setImageStrength(Number(e.target.value))} className="w-full"/><p className="text-[11px] text-[var(--sc-text-muted)] mt-2">The reference stays local until you explicitly send it to a ControlNet unit.</p></div></div>}
      </Collapsible>

      <Collapsible title="Raw Metadata Inspector" description="Inspect exactly what SwarmCanvas recorded for a generated image, copy it, or load those parameters back into the workspace." icon={<FileJson className="w-4 h-4" />}>
        <div className="flex gap-2 mb-2">
          <select className={`${THEME.control} flex-1`} value={selectedHistory?.id || ''} onChange={(e) => setSelectedHistoryId(e.target.value)}>
            {history.slice(0, 100).map((item) => <option key={item.id} value={item.id}>{item.createdAt} · {item.params.model}</option>)}
          </select>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-info`} onClick={copyMetadata}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy JSON'}</button>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-neutral`} onClick={applyHistory} disabled={!selectedHistory}><RefreshCw className="w-3.5 h-3.5" /> Load</button>
        </div>
        <pre className="sc-tool-code">{metadata}</pre>
      </Collapsible>

      <Collapsible title="Seed Variations" description="Take any history item and queue multiple parameter-identical variations with fresh seeds." icon={<Dices className="w-4 h-4" />}>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${THEME.control} min-w-0 flex-1`} value={selectedHistory?.id || ''} onChange={(e) => setSelectedHistoryId(e.target.value)}>{history.slice(0, 100).map((item) => <option key={item.id} value={item.id}>{item.createdAt} · {item.params.model}</option>)}</select>
          <div className="flex items-center gap-1"><button type="button" className="sc-tool-step" onClick={() => setVariationCount((n) => Math.max(1, n - 1))}><Minus className="w-3 h-3" /></button><span className="sc-tool-step-value">{variationCount}</span><button type="button" className="sc-tool-step" onClick={() => setVariationCount((n) => Math.min(16, n + 1))}><Plus className="w-3 h-3" /></button></div>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-info`} onClick={queueVariations} disabled={!selectedHistory}><Dices className="w-3.5 h-3.5" /> Queue Variations</button>
        </div>
      </Collapsible>

      <Collapsible title="Model-linked Presets" description="Associate an existing prompt preset with the active model. Automatic application is opt-in in Settings." icon={<Link2 className="w-4 h-4" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div><div className="sc-tool-label">Active model</div><select className={THEME.control} value={model} onChange={(e) => useAppStore.getState().setModel(e.target.value)}>{modelsList.slice(0, 500).map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}</select></div>
          <div><div className="sc-tool-label">Prompt preset</div><select className={THEME.control} value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}><option value="">Choose preset…</option>{(promptPresets || []).map((p: PromptPreset) => <option key={p.id} value={p.id}>{p.name} · {p.target}</option>)}</select></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" className={`${THEME.button} sc-action-button sc-action-info`} onClick={linkPresetToModel} disabled={!model || !selectedPresetId}><Link2 className="w-3.5 h-3.5" /> Link</button>
          <button type="button" className={`${THEME.button} sc-action-button sc-action-neutral`} onClick={unlinkPresetFromModel} disabled={!model}><X className="w-3.5 h-3.5" /> Unlink</button>
          <label className="sc-tool-check"><input type="checkbox" checked={settings.autoApplyModelPreset} onChange={(e) => updateSettings({ autoApplyModelPreset: e.target.checked })} /> Auto-apply on model change</label>
        </div>
        <div className="flex gap-2 mt-3"><input className={`${THEME.control} flex-1`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Optional new preset name"/><button type="button" className={`${THEME.button} sc-action-button sc-action-neutral`} onClick={saveCurrentPromptPreset}><Sparkles className="w-3.5 h-3.5" /> Save Current</button></div>
      </Collapsible>

      <Collapsible title="Context-aware Parameters" description="Quick guidance based on the active model family. This stays out of the main parameter stack until you need it." icon={<Settings2 className="w-4 h-4" />}>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="sc-tool-note"><div className="flex items-center gap-2"><SlidersHorizontal className="w-3.5 h-3.5" /><strong>Dimensions</strong><InfoPopover content="Changing width or height changes the latent canvas. Larger outputs generally require more memory and time." /></div><p>Current {width} × {height}. Keep the aspect ratio intentional when comparing matrix results.</p></div>
          <div className="sc-tool-note"><div className="flex items-center gap-2"><GaugeIcon /><strong>Sampling</strong><InfoPopover content="Steps and CFG control sampling behavior; compare them in a matrix rather than changing them blindly." /></div><p>{steps} steps · CFG {cfgScale} · {sampler} · {scheduler}</p></div>
          <div className="sc-tool-note"><div className="flex items-center gap-2"><Dices className="w-3.5 h-3.5" /><strong>Seed</strong></div><p>{seed === -1 ? 'Random seed mode' : `Fixed seed ${seed}`}. Variations create independent seeds without changing your base prompt.</p></div>
          <div className="sc-tool-note"><div className="flex items-center gap-2"><Info className="w-3.5 h-3.5" /><strong>Model</strong></div><p>{model || 'No model selected'}. Linked presets can be applied automatically when enabled.</p></div>
        </div>
      </Collapsible>
    </div>
  );
};

const GaugeIcon: React.FC = () => <SlidersHorizontal className="w-3.5 h-3.5" />;
