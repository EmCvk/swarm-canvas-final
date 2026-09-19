import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Command,
  History,
  LayoutGrid,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Wand2,
  X,
  Maximize2,
} from 'lucide-react';

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action: () => void | Promise<void>;
}

export const defaultCommandIcons = {
  generate: Wand2,
  pause: Pause,
  play: Play,
  refresh: RefreshCw,
  models: LayoutGrid,
  history: History,
  settings: Settings,
  fit: Maximize2,
  search: Search,
  done: Check,
  command: Command,
  sparkles: Sparkles,
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;

    return items.filter((item) =>
      `${item.label} ${item.description ?? ''} ${item.id}`.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) =>
          filteredItems.length ? (index + 1) % filteredItems.length : 0,
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) =>
          filteredItems.length ? (index - 1 + filteredItems.length) % filteredItems.length : 0,
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const item = filteredItems[selectedIndex];
        if (!item) return;
        onClose();
        void item.action();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredItems, onClose, open, selectedIndex]);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-zinc-950/98 shadow-2xl ring-1 ring-white/10"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--sc-info)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search commands..."
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="sc-action-button sc-action-info rounded-md p-1.5 text-zinc-500 hover:text-zinc-200"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-sm text-zinc-300">No commands found</div>
              <div className="mt-1 text-xs text-zinc-600">Try another search term.</div>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon ?? Command;
              const selected = index === selectedIndex;

              return (
                <button
                  type="button"
                  key={item.id}
                  data-command-index={index}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    onClose();
                    void item.action();
                  }}
                  className={`sc-action-button flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${
                    selected
                      ? 'bg-white/8 text-zinc-100'
                      : 'bg-transparent text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      selected
                        ? 'bg-[var(--sc-gold)]/15 text-[var(--sc-gold)]'
                        : 'bg-white/5 text-zinc-500'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    {item.description && (
                      <span className="mt-0.5 block truncate text-xs text-zinc-600">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {selected && <span className="text-[10px] font-mono text-zinc-600">↵</span>}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-zinc-600">
          <span>↑↓ navigate · Enter run · Esc close</span>
          <span className="font-mono">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
