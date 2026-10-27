import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { danbooru } from '../api/danbooruService';
import { splitPromptTokens } from '../utils/promptWeights';
import { Copy, Plus, Trash2, X } from 'lucide-react';

type Props = { title: string; value: string; onChange: (value: string) => void; tone: 'positive' | 'negative'; onCopy?: () => void };

function readLines(value: string): string[][] {
  return value.replace(/\r\n?/g, '\n').split('\n').map((line) => splitPromptTokens(line).map((tag) => tag.trim()).filter(Boolean));
}
function writeLines(lines: string[][]): string { return lines.map((line) => line.join(', ')).join('\n'); }

/** Compact pill-oriented prompt editor for Simplified UI. It intentionally omits advanced Prompt Pills tools. */
export function SimplifiedPromptPillEditor({ title, value, onChange, tone, onCopy }: Props) {
  const isNegative = tone === 'negative';
  const lines = useMemo(() => readLines(value), [value]);
  const count = lines.reduce((total, line) => total + line.length, 0);
  const [entry, setEntry] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const entryRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const query = entry.trim().replace(/[_-]+/g, ' ');
    const id = ++requestId.current;
    if (query.length < 2) { setSuggestions([]); setSuggestionsOpen(false); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const found = await danbooru.getTags('All', 'All', query, 8);
        if (!active || id !== requestId.current) return;
        const unique = [...new Set((found || []).filter(Boolean))].slice(0, 8);
        setSuggestions(unique);
        setSelectedSuggestion(0);
        setSuggestionsOpen(unique.length > 0);
      } catch {
        if (active && id === requestId.current) { setSuggestions([]); setSuggestionsOpen(false); }
      }
    }, 160);
    return () => { active = false; clearTimeout(timer); };
  }, [entry]);

  useEffect(() => {
    if (!suggestionsOpen || suggestions.length === 0) { setSuggestionPosition(null); return; }
    const updatePosition = () => {
      const rect = entryRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = Math.max(1, window.innerWidth);
      const width = Math.max(180, Math.min(360, viewportWidth - 16));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openAbove = below < 150 && above > below;
      const maxHeight = Math.max(80, Math.min(220, openAbove ? above : below));
      setSuggestionPosition({ left: Math.max(8, Math.min(rect.left, viewportWidth - width - 8)), top: openAbove ? Math.max(8, rect.top - maxHeight - 4) : Math.min(window.innerHeight - maxHeight - 8, rect.bottom + 4), width, maxHeight });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [suggestionsOpen, suggestions.length]);

  const appendTags = (raw: string) => {
    const incomingLines = readLines(raw).filter((line) => line.length > 0);
    if (!incomingLines.length) return;
    const next = lines.map((line) => [...line]);
    if (!next.length) next.push([]);
    if (raw.includes('\n') || raw.includes('\r')) {
      next[next.length - 1].push(...incomingLines[0]);
      next.push(...incomingLines.slice(1));
    } else {
      next[next.length - 1].push(...incomingLines.flat());
    }
    onChange(writeLines(next));
    setEntry(''); setSuggestions([]); setSuggestionsOpen(false);
    requestAnimationFrame(() => entryRef.current?.focus());
  };

  const removeTag = (lineIndex: number, tagIndex: number) => {
    const next = lines.map((line) => [...line]);
    next[lineIndex].splice(tagIndex, 1);
    onChange(writeLines(next));
  };

  return <section className={`flex min-h-0 flex-1 flex-col rounded-lg border ${isNegative ? 'border-[var(--sc-danger)]/25 bg-[var(--sc-danger-soft)]/15' : 'border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)]/10'}`}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--sc-border-soft)] px-3 py-2">
      <div className="min-w-0"><div className="text-sm font-semibold text-[var(--sc-text)]">{title}</div><div className="text-[10px] text-[var(--sc-text-dim)]">{count.toLocaleString()} tags · simplified pill view</div></div>
      <div className="flex shrink-0 items-center gap-1">{onCopy && <button type="button" onClick={onCopy} className="rounded-md p-1.5 text-[var(--sc-text-dim)] hover:bg-white/5 hover:text-[var(--sc-text)]" title={`Copy ${title}`}><Copy className="h-3.5 w-3.5" /></button>}<button type="button" onClick={() => onChange('')} className="rounded-md p-1.5 text-[var(--sc-text-dim)] hover:bg-rose-500/10 hover:text-rose-300" title={`Clear ${title}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
      {lines.map((line, lineIndex) => <div key={`line-${lineIndex}`} className="mb-2 flex flex-wrap items-center gap-1.5 last:mb-0">
        {line.map((tag, tagIndex) => {
          const disabled = tag.startsWith('/*') && tag.endsWith('*/');
          return <span key={`${tag}-${tagIndex}`} title={tag} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] leading-4 ${isNegative ? 'border-rose-500/20 bg-rose-500/5 text-[var(--sc-text-secondary)]' : 'border-[var(--sc-theme-border)]/50 bg-[var(--sc-surface-2)] text-[var(--sc-text-secondary)]'} ${disabled ? 'opacity-50 line-through' : ''}`}>
            <span className="min-w-0 break-words">{tag.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '')}</span>
            <button type="button" onClick={() => removeTag(lineIndex, tagIndex)} className="shrink-0 rounded-full p-0.5 text-[var(--sc-text-dim)] hover:text-rose-300" title={`Remove ${tag}`} aria-label={`Remove tag ${tag}`}><X className="h-3 w-3" /></button>
          </span>;
        })}
        {line.length === 0 && lines.length > 1 && <span className="text-[9px] text-[var(--sc-text-dim)]">Empty line {lineIndex + 1}</span>}
      </div>)}
      {count === 0 && <div className="py-5 text-center text-[12px] text-[var(--sc-text-dim)]">Add tags below to start your prompt.</div>}
    </div>
    <div className="relative shrink-0 border-t border-[var(--sc-border-soft)] p-2.5">
      <div className="flex items-center gap-2"><input ref={entryRef} value={entry} onFocus={() => setSuggestionsOpen(suggestions.length > 0)} onBlur={() => setSuggestionsOpen(false)} onChange={(event) => setEntry(event.target.value)} onKeyDown={(event) => {
        if (suggestionsOpen && suggestions.length && event.key === 'ArrowDown') { event.preventDefault(); setSelectedSuggestion((index) => (index + 1) % suggestions.length); return; }
        if (suggestionsOpen && suggestions.length && event.key === 'ArrowUp') { event.preventDefault(); setSelectedSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
        if (suggestionsOpen && suggestions[selectedSuggestion] && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); appendTags(suggestions[selectedSuggestion]); return; }
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); appendTags(entry.replace(/,/g, '')); }
        if (event.key === 'Escape') setSuggestionsOpen(false);
      }} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (pasted.includes(',') || pasted.includes('\n')) { event.preventDefault(); appendTags(pasted); } }} placeholder={isNegative ? 'Add a negative tag…' : 'Add a prompt tag…'} className="min-w-0 flex-1 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-control-bg)] px-2.5 py-2 text-[12px] text-[var(--sc-text)] outline-none focus:border-[var(--sc-theme-border)]" /><button type="button" onClick={() => appendTags(entry)} disabled={!entry.trim()} className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2.5 py-2 text-[11px] text-[var(--sc-text)] disabled:opacity-40"><Plus className="mr-1 inline h-3 w-3" /> Add</button></div>
      {suggestionsOpen && suggestions.length > 0 && suggestionPosition && createPortal(
        <div role="listbox" style={{ position: 'fixed', left: suggestionPosition.left, top: suggestionPosition.top, width: suggestionPosition.width, maxHeight: suggestionPosition.maxHeight }} className="z-[2500] overflow-y-auto rounded-lg border border-[var(--sc-border-strong)] bg-[var(--sc-surface-1)] p-1 shadow-2xl">
          {suggestions.map((tag, index) => <button key={`${tag}-${index}`} type="button" role="option" aria-selected={index === selectedSuggestion} onMouseDown={(event) => event.preventDefault()} onClick={() => appendTags(tag)} className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] ${index === selectedSuggestion ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-surface-2)]'}`}>{tag.replace(/_/g, ' ')}</button>)}
          <div className="px-2.5 py-1 text-[9px] text-[var(--sc-text-dim)]">↑ / ↓ navigate · Enter to complete · Esc to dismiss</div>
        </div>, document.body
      )}
    </div>
  </section>;
}
