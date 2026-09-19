import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { danbooru } from '../api/danbooruService';
import {
  X,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Edit3,
  Code,
  Tag as TagIcon,
  MousePointer,
} from 'lucide-react';

export interface PromptAutosuggestTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  target?: 'positive' | 'negative';
}

interface ParsedPill {
  id: string;
  text: string;
  weight: number;
  enabled: boolean;
  category: 'general' | 'artist' | 'character' | 'copyright' | 'meta' | 'lora' | 'custom';
}

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  general: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300', dot: 'bg-sky-400' },
  character: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  copyright: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', dot: 'bg-purple-400' },
  artist: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-400' },
  meta: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', dot: 'bg-rose-400' },
  lora: { bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/40', text: 'text-fuchsia-300', dot: 'bg-fuchsia-400' },
  custom: { bg: 'bg-zinc-800/80', border: 'border-zinc-600/50', text: 'text-zinc-200', dot: 'bg-zinc-400' },
};

function parsePromptStringToPills(promptStr: string): ParsedPill[] {
  if (!promptStr || !promptStr.trim()) return [];

  const rawTokens = promptStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return rawTokens.map((token, index) => {
    let cleanText = token;
    let weight = 1.0;

    const weightedMatch = token.match(/^\((.+?):([0-9.]+)\)$/);
    if (weightedMatch) {
      cleanText = weightedMatch[1].trim();
      weight = parseFloat(weightedMatch[2]) || 1.0;
    } else {
      let parenCount = 0;
      while (cleanText.startsWith('(') && cleanText.endsWith(')')) {
        parenCount++;
        cleanText = cleanText.slice(1, -1).trim();
      }
      if (parenCount > 0) {
        weight = Number((1 + parenCount * 0.1).toFixed(2));
      } else {
        let bracketCount = 0;
        while (cleanText.startsWith('[') && cleanText.endsWith(']')) {
          bracketCount++;
          cleanText = cleanText.slice(1, -1).trim();
        }
        if (bracketCount > 0) {
          weight = Number(Math.max(0.1, 1 - bracketCount * 0.1).toFixed(2));
        }
      }
    }

    let category: ParsedPill['category'] = 'general';
    if (cleanText.startsWith('<lora:') || cleanText.startsWith('<lyco:')) {
      category = 'lora';
    }

    return {
      id: `${index}-${cleanText}`,
      text: cleanText,
      weight,
      enabled: true,
      category,
    };
  });
}

function serializePillsToPrompt(pills: ParsedPill[]): string {
  return pills
    .filter((p) => p.enabled !== false && p.text.trim())
    .map((p) => {
      const clean = p.text.trim();
      if (p.weight === 1.0) return clean;
      if (clean.startsWith('<') && clean.endsWith('>')) return clean;
      return `(${clean}:${Number(p.weight.toFixed(2))})`;
    })
    .join(', ');
}

export const PromptAutosuggestTextarea: React.FC<PromptAutosuggestTextareaProps> = ({
  value,
  onChange,
  placeholder = 'Type tags or paste prompt with commas...',
  target = 'positive',
}) => {
  const isNegative = target === 'negative';

  const [hoveredPillIndex, setHoveredPillIndex] = useState<number | null>(null);
  const [pillRect, setPillRect] = useState<DOMRect | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [scrollWeightEnabled, setScrollWeightEnabled] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pills = useMemo(() => parsePromptStringToPills(value), [value]);

  const updatePills = (newPills: ParsedPill[]) => {
    onChange(serializePillsToPrompt(newPills));
  };

  const addTagText = (rawText: string) => {
    const textToInsert = rawText.trim();
    if (!textToInsert) return;

    const parsedNew = parsePromptStringToPills(textToInsert);
    const existing = parsePromptStringToPills(value);
    updatePills([...existing, ...parsedNew]);
    setInputValue('');
    setShowDropdown(false);
  };

  useEffect(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query || query.length < 2 || isRawMode) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        if (danbooru && typeof danbooru.getTags === 'function') {
          const results = await danbooru.getTags('All', 'All', query, 8);
          if (active) {
            setSuggestions(results || []);
            setShowDropdown(Boolean(results && results.length > 0));
            setSelectedIndex(0);
          }
        }
      } catch {
        if (active) setSuggestions([]);
      }
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inputValue, isRawMode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && suggestions[selectedIndex]) {
        addTagText(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        addTagText(inputValue);
      }
      return;
    }

    if (e.key === 'Tab') {
      if (showDropdown && suggestions[selectedIndex]) {
        e.preventDefault();
        addTagText(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        e.preventDefault();
        addTagText(inputValue);
      }
      return;
    }

    if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (e.key === 'ArrowUp' && showDropdown) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (e.key === 'Escape') {
      setShowDropdown(false);
      return;
    }

    if (e.key === 'Backspace' && !inputValue && pills.length > 0) {
      updatePills(pills.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && (pasted.includes(',') || pasted.includes('\n'))) {
      e.preventDefault();
      addTagText(pasted);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (inputValue.trim()) {
        addTagText(inputValue);
      }
      setShowDropdown(false);
    }, 200);
  };

  const handlePillWheel = (e: React.WheelEvent, index: number) => {
    if (!scrollWeightEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newPills = [...pills];
    const currentWeight = newPills[index].weight;
    newPills[index].weight = Math.min(3.0, Math.max(0.1, Number((currentWeight + delta).toFixed(2))));
    updatePills(newPills);
  };

  const removePill = (index: number) => {
    updatePills(pills.filter((_, i) => i !== index));
  };

  const togglePillEnabled = (index: number) => {
    const newPills = [...pills];
    newPills[index].enabled = !newPills[index].enabled;
    updatePills(newPills);
  };

  const startEditPill = (index: number) => {
    setEditingIndex(index);
    const p = pills[index];
    setEditingText(p.weight !== 1.0 ? `(${p.text}:${p.weight})` : p.text);
  };

  const finishEditPill = (index: number) => {
    if (editingText.trim()) {
      const parsed = parsePromptStringToPills(editingText);
      if (parsed.length > 0) {
        const newPills = [...pills];
        newPills[index] = {
          ...newPills[index],
          text: parsed[0].text,
          weight: parsed[0].weight,
        };
        updatePills(newPills);
      }
    }
    setEditingIndex(null);
    setEditingText('');
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPills = [...pills];
    const [moved] = newPills.splice(draggedIndex, 1);
    newPills.splice(index, 0, moved);
    updatePills(newPills);
    setDraggedIndex(index);
  };

  return (
    <div
      style={{ resize: 'both' }}
      className={`flex flex-col min-w-[200px] min-h-[90px] h-full w-full rounded border transition-all ${
        isNegative
          ? 'bg-[#141014] border-rose-900/40 focus-within:border-rose-700/60'
          : 'bg-[#10121a] border-indigo-900/40 focus-within:border-indigo-600/60'
      } text-xs overflow-auto relative`}
    >
      <div className="flex items-center justify-between px-2 py-1 bg-[#161822] border-b border-[#242838] select-none shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-gray-400">
            {pills.length} pills
          </span>
          <button
            type="button"
            onClick={() => setScrollWeightEnabled(!scrollWeightEnabled)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition ${
              scrollWeightEnabled
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-600/40'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-700/50'
            }`}
            title="Toggle wheel-scroll tag weight adjustment on hover"
          >
            <MousePointer className="w-2.5 h-2.5" />
            <span>Scroll W: {scrollWeightEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsRawMode(!isRawMode)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition ${
              isRawMode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-[#202434] hover:text-white'
            }`}
            title="Toggle Raw Text Mode"
          >
            {isRawMode ? <TagIcon className="w-2.5 h-2.5" /> : <Code className="w-2.5 h-2.5" />}
            {isRawMode ? 'Pills' : 'Raw'}
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#202434]"
            title="Copy prompt"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1 text-gray-400 hover:text-rose-400 rounded hover:bg-[#202434]"
            title="Clear prompt"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isRawMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full flex-1 p-2 bg-transparent text-gray-200 text-xs font-mono outline-none resize-none"
        />
      ) : (
        <div
          className="flex-1 overflow-auto p-1.5 flex flex-wrap content-start items-center gap-1 cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {pills.map((pill, index) => {
            const styles = CATEGORY_STYLES[pill.category] || CATEGORY_STYLES.general;
            const isEditing = editingIndex === index;

            if (isEditing) {
              return (
                <input
                  key={pill.id}
                  autoFocus
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEditPill(index);
                    if (e.key === 'Escape') setEditingIndex(null);
                  }}
                  onBlur={() => finishEditPill(index)}
                  className="px-2 py-0.5 text-xs bg-[#1e2232] text-white rounded border border-indigo-500 outline-none w-28 font-mono"
                />
              );
            }

            return (
              <div
                key={pill.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={() => setDraggedIndex(null)}
                onWheel={(e) => handlePillWheel(e, index)}
                onMouseEnter={(e) => {
                  setHoveredPillIndex(index);
                  setPillRect(e.currentTarget.getBoundingClientRect());
                }}
                onMouseLeave={() => {
                  if (hoveredPillIndex === index) setHoveredPillIndex(null);
                }}
                className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] select-none transition-all ${
                  pill.enabled
                    ? `${styles.bg} ${styles.border} ${styles.text}`
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 opacity-60 line-through'
                } hover:border-indigo-400`}
                title={
                  scrollWeightEnabled
                    ? 'Mouse scroll over pill to adjust weight (+/- 0.05). Double-click to edit.'
                    : 'Double-click to edit.'
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} shrink-0`} />

                <span
                  onDoubleClick={() => startEditPill(index)}
                  className="cursor-pointer max-w-48 truncate"
                >
                  {pill.text}
                </span>

                {pill.weight !== 1.0 && (
                  <span className="px-1 py-0.2 rounded bg-black/50 font-mono text-[10px] text-zinc-300">
                    {pill.weight.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}

          {hoveredPillIndex !== null && pills[hoveredPillIndex] && pillRect && createPortal(
              <div
                onMouseEnter={() => setHoveredPillIndex(hoveredPillIndex)}
                onMouseLeave={() => setHoveredPillIndex(null)}
                style={{
                  position: 'fixed',
                  top: pillRect.bottom + 4,
                  left: pillRect.left,
                  zIndex: 999999,
                }}
                className="flex items-center gap-1 bg-[#1a1c26] border border-indigo-500/50 shadow-[0_10px_30px_rgba(0,0,0,0.8)] rounded-md px-2 py-1 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newPills = [...pills];
                    newPills[hoveredPillIndex].weight = Math.min(3.0, Number((newPills[hoveredPillIndex].weight + 0.05).toFixed(2)));
                    updatePills(newPills);
                  }}
                  className="p-1 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded transition-colors"
                  title="Increase weight (+0.05)"
                >
                  <Plus className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newPills = [...pills];
                    newPills[hoveredPillIndex].weight = Math.max(0.1, Number((newPills[hoveredPillIndex].weight - 0.05).toFixed(2)));
                    updatePills(newPills);
                  }}
                  className="p-1 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded transition-colors"
                  title="Decrease weight (-0.05)"
                >
                  <Minus className="w-3 h-3" />
                </button>

                <div className="h-3 w-px bg-zinc-700 mx-0.5" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePillEnabled(hoveredPillIndex);
                  }}
                  className="p-1 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded transition-colors"
                  title={pills[hoveredPillIndex].enabled ? 'Mute/Bypass pill' : 'Enable pill'}
                >
                  {pills[hoveredPillIndex].enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-zinc-400" />}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditPill(hoveredPillIndex);
                  }}
                  className="p-1 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded transition-colors"
                  title="Edit pill text"
                >
                  <Edit3 className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePill(hoveredPillIndex);
                    setHoveredPillIndex(null);
                  }}
                  className="p-1 hover:bg-rose-900 text-zinc-200 hover:text-rose-200 rounded transition-colors"
                  title="Delete pill"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>,
              document.body
            )}

          <div className="relative flex-1 min-w-28">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              placeholder={pills.length === 0 ? placeholder : 'Add tag...'}
              className="w-full bg-transparent text-gray-200 text-xs outline-none py-0.5 px-1 placeholder:text-gray-600"
            />

            {showDropdown && suggestions.length > 0 && inputRef.current && createPortal(
              <div
                ref={dropdownRef}
                style={{
                  position: 'fixed',
                  top: inputRef.current.getBoundingClientRect().top - 4,
                  left: inputRef.current.getBoundingClientRect().left,
                  width: Math.max(260, inputRef.current.getBoundingClientRect().width),
                  transform: 'translateY(-100%)',
                }}
                className="max-h-48 overflow-y-auto rounded-lg bg-[#141620] border border-[#2b2f3a] shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-[999999] py-1"
              >
                {suggestions.map((item, idx) => (
                  <div
                    key={item}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTagText(item);
                    }}
                    className={`px-3 py-1.5 text-xs cursor-pointer truncate ${
                      idx === selectedIndex ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-[#1e2230]'
                    }`}
                  >
                    {item.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>,
              document.body
            )}
          </div>
        </div>
      )}
    </div>
  );
};