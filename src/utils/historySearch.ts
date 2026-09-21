import { extractPromptLoras } from './promptWeights';

/** Minimal shape a history/gallery item needs to expose for query matching. */
export interface SearchableGenerationItem {
  prompt: string;
  negativePrompt?: string;
  timestamp: number;
  params: {
    model: string;
    seed?: number;
  };
}

interface ParsedTerm {
  field: 'model' | 'lora' | 'seed' | 'tag' | 'before' | 'after' | 'text';
  value: string;
}

/** Splits a query like `model:anima lora:darkbubble seed:1234 silver hair` into typed terms.
 *  Unrecognized `key:value` prefixes are treated as plain text (so a literal colon in a
 *  prompt fragment, e.g. a URL, doesn't get silently swallowed as a broken filter). */
function parseQuery(query: string): ParsedTerm[] {
  const KNOWN_FIELDS = new Set(['model', 'lora', 'seed', 'tag', 'before', 'after']);
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw): ParsedTerm => {
      const colonIdx = raw.indexOf(':');
      if (colonIdx > 0) {
        const field = raw.slice(0, colonIdx).toLowerCase();
        const value = raw.slice(colonIdx + 1);
        if (KNOWN_FIELDS.has(field) && value) {
          return { field: field as ParsedTerm['field'], value };
        }
      }
      return { field: 'text', value: raw };
    });
}

function parseDateBoundary(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

/** True if `item` matches every term in `query`. Empty/whitespace-only queries always match. */
export function matchesGenerationQuery(item: SearchableGenerationItem, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const terms = parseQuery(trimmed);
  const promptLower = (item.prompt || '').toLowerCase();
  const negativeLower = (item.negativePrompt || '').toLowerCase();
  const modelLower = (item.params?.model || '').toLowerCase();
  const loraNames = extractPromptLoras(item.prompt || '').map((l) => (l.loraName || l.base).toLowerCase());
  const tags = promptLower.split(',').map((t) => t.trim()).filter(Boolean);

  return terms.every((term) => {
    switch (term.field) {
      case 'model':
        return modelLower.includes(term.value.toLowerCase());
      case 'lora':
        return loraNames.some((name) => name.includes(term.value.toLowerCase()));
      case 'seed':
        return String(item.params?.seed ?? '') === term.value;
      case 'tag':
        return tags.some((t) => t.includes(term.value.toLowerCase()));
      case 'before': {
        const boundary = parseDateBoundary(term.value);
        return boundary === null ? true : item.timestamp < boundary;
      }
      case 'after': {
        const boundary = parseDateBoundary(term.value);
        return boundary === null ? true : item.timestamp >= boundary;
      }
      case 'text':
      default:
        return (
          promptLower.includes(term.value.toLowerCase()) ||
          negativeLower.includes(term.value.toLowerCase()) ||
          modelLower.includes(term.value.toLowerCase())
        );
    }
  });
}

/** If the query's last (possibly in-progress) word is a `model:`/`lora:`/`tag:` filter,
 *  returns that field and the partial value typed so far, plus the query with that last word
 *  removed (so a chosen suggestion can be appended back cleanly). Returns null for any other
 *  trailing word (including `before:`/`after:`/`seed:`, which don't have a suggestion list). */
export function parseActiveFieldTerm(query: string): { field: 'model' | 'lora' | 'tag'; value: string; prefix: string } | null {
  const match = query.match(/(^|\s)(model|lora|tag):([^\s]*)$/i);
  if (!match) return null;
  const field = match[2].toLowerCase() as 'model' | 'lora' | 'tag';
  const value = match[3];
  const prefix = query.slice(0, query.length - match[0].length + match[1].length);
  return { field, value, prefix };
}

/** Rebuilds the query with the active trailing field term replaced by a chosen suggestion. */
export function applyFieldSuggestion(prefix: string, field: string, chosenValue: string): string {
  const cleanPrefix = prefix ? `${prefix.trimEnd()} ` : '';
  return `${cleanPrefix}${field}:${chosenValue} `;
}
