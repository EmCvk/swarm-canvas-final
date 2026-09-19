import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Download, RefreshCw, Search, Upload } from 'lucide-react';
import { civitaiService, CivitaiAssetType } from '../api/civitaiService';
import { ModelItem, useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

const tone = (text: string) => /error|failed|unresolved/i.test(text) ? 'text-rose-300' : /partial|missing|retry/i.test(text) ? 'text-amber-300' : 'text-emerald-300';

export const CivitaiLibraryPanel: React.FC = () => {
  const { modelsList, lorasList, embeddingsList, loadAssets, setCivitaiUrl, refreshCivitaiItem } = useAppStore(useShallow((s) => ({
    modelsList: s.modelsList,
    lorasList: s.lorasList,
    embeddingsList: s.embeddingsList,
    loadAssets: s.loadAssets,
    setCivitaiUrl: s.setCivitaiUrl,
    refreshCivitaiItem: s.refreshCivitaiItem,
  })));
  const [stats, setStats] = useState(civitaiService.getLibraryStats());
  const [unresolved, setUnresolved] = useState(civitaiService.getUnresolvedEntries());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setStats(civitaiService.getLibraryStats());
    setUnresolved(civitaiService.getUnresolvedEntries());
  };

  useEffect(() => { refresh(); }, [modelsList, lorasList, embeddingsList]);

  const unresolvedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return unresolved.filter((entry) => !q || `${entry.filename} ${entry.reason || ''} ${entry.civitaiUrl || ''}`.toLowerCase().includes(q)).slice(0, 100);
  }, [unresolved, query]);

  const exportLibrary = async () => {
    const json = await civitaiService.exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'swarm-canvas-civitai-library.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importLibrary = async (file: File) => {
    setBusy(true);
    try {
      await civitaiService.importLibrary(await file.text());
      await loadAssets();
      refresh();
    } finally { setBusy(false); }
  };

  const resolve = async (entry: any) => {
    const type = entry.type as CivitaiAssetType;
    const key = type === 'model' ? 'modelsList' : type === 'lora' ? 'lorasList' : 'embeddingsList';
    const item = (useAppStore.getState() as any)[key]?.find((x: ModelItem) => x.name === entry.filename) as ModelItem | undefined;
    const url = window.prompt(`Main Civitai URL for ${entry.filename}`, entry.civitaiUrl || 'https://civitai.com/models/');
    if (!item || !url?.trim() || url.trim().endsWith('/')) return;
    await setCivitaiUrl(type, item.name, url.trim());
    await refreshCivitaiItem(type, item.name);
    refresh();
  };

  return <div className="h-full min-h-0 overflow-y-auto p-4 bg-[#121416] text-zinc-100 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-blue-300/80">Library</div>
        <h2 className="text-base font-semibold text-zinc-100">Civitai Metadata</h2>
        <p className="text-[11px] text-zinc-500 mt-0.5">Persistent matches, previews, manual links and unresolved assets.</p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => { setBusy(true); void loadAssets().finally(() => { refresh(); setBusy(false); }); }} className="sc-action-button sc-action-neutral" title="Refresh asset catalog"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /></button>
        <button type="button" onClick={exportLibrary} className="sc-action-button sc-action-info" title="Export metadata library"><Download className="w-3.5 h-3.5" /></button>
        <label className="sc-action-button sc-action-info cursor-pointer" title="Import metadata library"><Upload className="w-3.5 h-3.5" /><input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importLibrary(f); e.currentTarget.value = ''; }} /></label>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {[['Cached', stats.total, ''], ['Matched', stats.matched, 'text-emerald-300'], ['Partial', stats.partial, 'text-amber-300'], ['Unresolved', stats.unresolved, 'text-rose-300'], ['Previews', stats.cachedPreviews, 'text-blue-300']].map(([label,value,cls]) => <div key={label as string} className="rounded-xl bg-white/[0.025] px-3 py-2"><div className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</div><div className={`text-lg font-semibold font-mono ${cls || 'text-zinc-100'}`}>{value}</div></div>)}
    </div>

    <div className="rounded-xl bg-[#181a1c] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-blue-300" /> Asset health</div><div className="text-[10px] text-zinc-500">Persistent browser/Tauri library</div></div>
      <div className="h-2 rounded-full overflow-hidden bg-black/40 flex"><div className="bg-emerald-500" style={{ width: `${Math.min(100, (stats.matched / Math.max(1, stats.total)) * 100)}%` }} /><div className="bg-amber-500" style={{ width: `${Math.min(100, (stats.partial / Math.max(1, stats.total)) * 100)}%` }} /><div className="bg-rose-500" style={{ width: `${Math.min(100, (stats.unresolved / Math.max(1, stats.total)) * 100)}%` }} /></div>
      <div className="flex flex-wrap gap-3 text-[10px] font-mono"><span className="text-emerald-300">● matched</span><span className="text-amber-300">● partial</span><span className="text-rose-300">● unresolved</span></div>
    </div>

    <div className="rounded-xl bg-[#181a1c] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold">Unresolved queue</div><div className="text-[10px] text-zinc-600">{unresolved.length} total</div></div>
      <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unresolved models…" className="w-full pl-7 pr-2 py-2 rounded-lg bg-black/20 text-xs text-zinc-200 outline-none focus:bg-black/30" /></div>
      {unresolvedRows.length === 0 ? <div className="py-8 text-center text-xs text-zinc-600">No unresolved entries match this search.</div> : <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5">{unresolvedRows.map((entry: any) => <div key={`${entry.type}:${entry.filename}`} className="py-2 flex items-center gap-3"><div className="min-w-0 flex-1"><div className="text-[11px] text-zinc-200 truncate" title={entry.filename}>{entry.filename}</div><div className={`text-[9px] ${tone(entry.reason || entry.status)} truncate`}>{entry.failureReason || entry.reason || entry.status || 'unresolved'} · {entry.attempts || 1} attempt(s)</div></div><button type="button" onClick={() => void resolve(entry)} className="sc-action-button sc-action-warning shrink-0">Resolve</button></div>)}</div>}
    </div>

    <div className="rounded-xl bg-[#181a1c] p-3 text-[10px] text-zinc-500 leading-relaxed">
      <div className="text-zinc-300 font-semibold mb-1 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> How matching works</div>
      Exact version/model IDs and file hashes are preferred. Filename search is a fallback. Manual model URLs stored from Extra Networks are treated as authoritative for that asset.
    </div>
  </div>;
};
