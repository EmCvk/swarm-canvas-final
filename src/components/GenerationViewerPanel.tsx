import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Copy, Download, ExternalLink, FolderOpen, GitBranch, Info, Maximize2, RefreshCw, Star, Check } from 'lucide-react';
import { useAppStore, HistoryItem } from '../store/useAppStore';
import { emitToast } from '../utils/toast';
import { swarmClient } from '../api/swarmClient';

function resolveViewerImageUrl(url: string, serverUrl: string): string {
  if (!url) return '';
  const clean = url.trim();
  if (/^(data:|blob:|https?:\/\/|asset:|http:\/\/tauri)/i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${serverUrl.replace(/\/+$/, '')}${clean}`;
  return `${serverUrl.replace(/\/+$/, '')}/${clean.replace(/^\/+/, '')}`;
}

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/7 bg-black/15 p-2 min-w-0">
    <div className="text-[8px] uppercase tracking-wider text-zinc-600 mb-0.5">{label}</div>
    <div className="text-[10px] text-zinc-200 break-words select-text">{value}</div>
  </div>
);

export const GenerationViewerPanel: React.FC<any> = () => {
  const {
    generationViewerItem,
    history,
    projectHistory,
    galleryHistory,
    serverUrl,
    setParams,
    setComparisonImage,
    useGenerationParams,
    toggleFavorite,
    setModel,
    rerollFromHistory,
    branchFromHistory,
    settings,
  } = useAppStore(useShallow((s) => ({
    generationViewerItem: s.generationViewerItem,
    history: s.history,
    projectHistory: s.projectHistory,
    galleryHistory: s.galleryHistory,
    serverUrl: s.serverUrl,
    setParams: s.setParams,
    setComparisonImage: s.setComparisonImage,
    useGenerationParams: s.useGenerationParams,
    toggleFavorite: s.toggleFavorite,
    setModel: s.setModel,
    rerollFromHistory: s.rerollFromHistory,
    branchFromHistory: s.branchFromHistory,
    settings: s.settings,
  })));

  const item = useMemo(() => {
    if (!generationViewerItem) return null;
    const pools: HistoryItem[][] = [history, projectHistory, galleryHistory];
    for (const pool of pools) {
      const match = pool.find((entry) => entry.id === generationViewerItem.id);
      if (match) return match;
    }
    return generationViewerItem;
  }, [generationViewerItem, history, projectHistory, galleryHistory]);

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0b0d12] text-zinc-600 text-xs font-mono">
        Select a generation from History or Gallery.
      </div>
    );
  }

  const imageSrc = resolveViewerImageUrl(item.imageUrl, serverUrl);
  const model = item.params?.model || 'Unknown';
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); emitToast(`${label} copied`, 'success'); }
    catch (error) { emitToast(`Could not copy ${label}: ${error instanceof Error ? error.message : String(error)}`, 'error'); }
  };

  const openFolder = async () => {
    try {
      let path = '';
      if (item.localProjectFile && item.localProjectRoot) {
        path = `${item.localProjectRoot.replace(/[\\/]+$/, '')}\\${item.localProjectFile.replace(/^[/\\]+/, '').replace(/\//g, '\\')}`;
      } else {
        path = await swarmClient.resolveOutputImagePath(settings.outputFolderPath || undefined, item.serverPath || item.imageUrl);
      }
      await swarmClient.revealFilesystemPath(path);
    } catch (error) {
      emitToast(`Could not open image folder: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  return (
    <div className="sc-generation-viewer h-full min-h-0 flex flex-col bg-[#0b0d12] text-zinc-300 overflow-hidden">
      <div className="shrink-0 px-3 py-2.5 border-b border-white/8 bg-[#11141a] flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-400/20 flex items-center justify-center"><Info className="w-4 h-4 text-amber-300" /></div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">Generation Viewer</div>
          <div className="text-[9px] font-mono text-zinc-600 truncate">{item.id} · {item.batchId}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => toggleFavorite(item.id)} className="p-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-amber-300 cursor-pointer" title="Favorite">
            <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <button type="button" onClick={() => setComparisonImage(imageSrc)} className="p-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer" title="Set as comparison image">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setParams({ activeImage: imageSrc })} className="p-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer" title="View in main canvas">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] gap-3">
          <div className="min-h-[280px] rounded-xl border border-white/10 bg-black/30 flex items-center justify-center overflow-hidden">
            {imageSrc ? <img src={imageSrc} alt="Generation" className="max-w-full max-h-[72vh] object-contain" /> : <span className="text-zinc-600 font-mono text-xs">No image source</span>}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Model" value={<button type="button" onClick={() => setModel(model)} className="text-left hover:text-amber-200 cursor-pointer break-all">{model}</button>} />
              <Field label="Seed" value={String(item.params?.seed ?? '')} />
              <Field label="Steps" value={String(item.params?.steps ?? '')} />
              <Field label="CFG" value={String(item.params?.cfgScale ?? '')} />
              <Field label="Dimensions" value={`${item.params?.width ?? '?'} × ${item.params?.height ?? '?'}`} />
              <Field label="Sampler" value={item.params?.sampler || '—'} />
              <Field label="Scheduler" value={item.params?.scheduler || '—'} />
              <Field label="Created" value={item.createdAt} />
            </div>
            <Field label="Storage" value={item.localProjectFile ? `Local Project · ${item.localProjectFile}` : item.serverOrigin ? `Stability Matrix / SwarmUI · ${item.serverPath || 'output'}` : 'Current Session'} />
            {item.parentId && <Field label="Parent" value={`${item.parentId} · ${item.relation || 'variation'}`} />}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => useGenerationParams(item)} className="px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-400/20 text-[9px] text-emerald-300 hover:text-white cursor-pointer flex items-center gap-1"><Check className="w-3 h-3" />Use Params</button>
              <button type="button" onClick={() => rerollFromHistory(item)} className="px-2 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-400/20 text-[9px] text-cyan-300 hover:text-white cursor-pointer flex items-center gap-1"><RefreshCw className="w-3 h-3" />Reroll</button>
              <button type="button" onClick={() => branchFromHistory(item)} className="px-2 py-1.5 rounded-md bg-violet-500/10 border border-violet-400/20 text-[9px] text-violet-300 hover:text-white cursor-pointer flex items-center gap-1"><GitBranch className="w-3 h-3" />Branch</button>
              <button type="button" onClick={() => void openFolder()} className="px-2 py-1.5 rounded-md bg-sky-500/10 border border-sky-400/20 text-[9px] text-sky-300 hover:text-white cursor-pointer flex items-center gap-1"><FolderOpen className="w-3 h-3" />Open Folder</button>
              <button type="button" onClick={() => void copy(item.imageUrl, 'Image reference')} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-400 hover:text-white cursor-pointer flex items-center gap-1"><Copy className="w-3 h-3" />Copy Ref</button>
              <button type="button" onClick={() => { const a = document.createElement('a'); a.href = imageSrc; a.download = `${item.id}.png`; a.click(); }} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-400 hover:text-white cursor-pointer flex items-center gap-1"><Download className="w-3 h-3" />Download</button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <section className="rounded-xl border border-indigo-500/15 bg-indigo-950/5 overflow-hidden">
            <div className="px-3 py-2 border-b border-indigo-500/10 text-[9px] uppercase tracking-wider text-indigo-300 font-semibold">Positive Prompt</div>
            <div className="p-3 text-[11px] leading-relaxed font-mono text-zinc-200 whitespace-pre-wrap select-text">{item.prompt || '(empty)'}</div>
          </section>
          <section className="rounded-xl border border-rose-500/15 bg-rose-950/5 overflow-hidden">
            <div className="px-3 py-2 border-b border-rose-500/10 text-[9px] uppercase tracking-wider text-rose-300 font-semibold">Negative Prompt</div>
            <div className="p-3 text-[11px] leading-relaxed font-mono text-zinc-300 whitespace-pre-wrap select-text">{item.negativePrompt || '(empty)'}</div>
          </section>
        </div>

        <details className="rounded-xl border border-white/8 bg-black/10" open>
          <summary className="cursor-pointer px-3 py-2 text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Raw SwarmUI Metadata</summary>
          <pre className="p-3 max-h-80 overflow-auto text-[9px] leading-relaxed font-mono text-zinc-500 whitespace-pre-wrap select-text">{item.rawMetadata || 'No raw metadata was stored for this generation.'}</pre>
        </details>
      </div>
    </div>
  );
};

export default GenerationViewerPanel;
