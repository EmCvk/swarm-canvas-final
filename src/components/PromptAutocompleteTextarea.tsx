import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { danbooru } from '../api/danbooruService';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  'aria-label'?: string;
};

type TokenRange = { query: string; replaceStart: number; replaceEnd: number };

function getTokenRange(value: string, caret: number): TokenRange {
  const safeCaret = Math.max(0, Math.min(value.length, caret));
  const leftComma = value.lastIndexOf(',', safeCaret - 1);
  const leftNewline = value.lastIndexOf('\n', safeCaret - 1);
  const delimiterStart = Math.max(leftComma, leftNewline);
  const segmentStart = delimiterStart + 1;
  const rightComma = value.indexOf(',', safeCaret);
  const rightNewline = value.indexOf('\n', safeCaret);
  const rightDelimiters = [rightComma, rightNewline].filter((x) => x >= 0);
  const segmentEnd = rightDelimiters.length ? Math.min(...rightDelimiters) : value.length;
  const leadingWhitespace = value.slice(segmentStart, safeCaret).match(/^\s*/)?.[0].length ?? 0;
  const fragment = value.slice(segmentStart + leadingWhitespace, safeCaret).trim();
  return { query: fragment.replace(/[_-]+/g, ' '), replaceStart: segmentStart + leadingWhitespace, replaceEnd: segmentEnd };
}

/** Text editor with local Danbooru-index autocomplete applied to the token at the caret. */
export function PromptAutocompleteTextarea({ value, onChange, placeholder, className, rows = 4, 'aria-label': ariaLabel }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestIdRef = useRef(0);
  const suppressAutocompleteQueryRef = useRef<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const tokenRange = useMemo(() => getTokenRange(value, caret), [value, caret]);

  useEffect(() => {
    const query = tokenRange.query.trim();
    const normalizedQuery = query.toLowerCase();
    if (suppressAutocompleteQueryRef.current) {
      const shouldSuppress = normalizedQuery === suppressAutocompleteQueryRef.current;
      suppressAutocompleteQueryRef.current = null;
      if (shouldSuppress) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
    }
    const requestId = ++requestIdRef.current;
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await danbooru.getTags('All', 'All', query, 10);
        if (!active || requestId !== requestIdRef.current) return;
        const unique = [...new Set((results || []).filter((tag) => typeof tag === 'string' && tag.trim()))].slice(0, 10);
        setSuggestions(unique);
        setSelectedIndex(0);
        setOpen(unique.length > 0);
      } catch {
        if (active && requestId === requestIdRef.current) { setSuggestions([]); setOpen(false); }
      }
    }, 160);
    return () => { active = false; clearTimeout(timer); };
  }, [tokenRange.query]);

  useEffect(() => {
    if (!open || suggestions.length === 0) { setSuggestionPosition(null); return; }
    const updatePosition = () => {
      const rect = textareaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const openAbove = below < 150 && above > below;
      const maxHeight = Math.max(90, Math.min(260, openAbove ? above : below));
      setSuggestionPosition({ left: Math.max(4, Math.min(rect.left, window.innerWidth - Math.min(rect.width, window.innerWidth - 8) - 4)), top: openAbove ? Math.max(4, rect.top - maxHeight - 6) : Math.min(window.innerHeight - maxHeight - 4, rect.bottom + 4), width: Math.max(180, Math.min(rect.width, window.innerWidth - 8)), maxHeight });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [open, suggestions.length]);

  const chooseSuggestion = useCallback((tag: string) => {
    const currentCaret = textareaRef.current?.selectionStart ?? caret;
    const range = getTokenRange(value, currentCaret);
    const next = value.slice(0, range.replaceStart) + tag + value.slice(range.replaceEnd);
    const nextCaret = range.replaceStart + tag.length;
    suppressAutocompleteQueryRef.current = tag.replace(/[_-]+/g, ' ').trim().toLowerCase();
    onChange(next);
    setCaret(nextCaret);
    setOpen(false);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) { el.focus(); el.setSelectionRange(nextCaret, nextCaret); }
    });
  }, [caret, onChange, value]);

  return <div className="relative min-h-0 min-w-0 w-full flex-1 flex flex-col">
    <textarea
      ref={textareaRef}
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      onChange={(event) => { onChange(event.target.value); setCaret(event.target.selectionStart); }}
      onClick={(event) => setCaret(event.currentTarget.selectionStart)}
      onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
      onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (open && suggestions.length && event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % suggestions.length); return; }
        if (open && suggestions.length && event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
        if (open && suggestions.length && (event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) { event.preventDefault(); chooseSuggestion(suggestions[selectedIndex] || suggestions[0]); return; }
        if (event.key === 'Escape') setOpen(false);
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={className}
    />
    {open && suggestions.length > 0 && suggestionPosition && createPortal(<div role="listbox" style={{ position: 'fixed', left: suggestionPosition.left, top: suggestionPosition.top, width: suggestionPosition.width, maxHeight: suggestionPosition.maxHeight }} className="z-[2000] overflow-y-auto rounded-lg border border-[var(--sc-border-strong)] bg-[var(--sc-surface-1)] p-1 shadow-2xl">
      {suggestions.map((tag, index) => <button key={`${tag}-${index}`} type="button" role="option" aria-selected={index === selectedIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(tag)} className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] ${index === selectedIndex ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-surface-2)]'}`}>{tag.replace(/_/g, ' ')}</button>)}
      <div className="px-2.5 py-1 text-[9px] text-[var(--sc-text-dim)]">↑ / ↓ to navigate · Enter to complete · Esc to dismiss</div>
    </div>, document.body)}
  </div>;
}
