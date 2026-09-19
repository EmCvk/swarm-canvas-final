import { buildWikiGroupHierarchy, DANBOORU_WIKI_GROUPS } from '../api/tagTaxonomy';
import type { TagRecord } from '../api/tagTaxonomy';
import { classifyTagDetailed, SFW_EXACT_MAP, cleanKey } from '../tagging/classifier';
import type { ClassificationResult } from '../tagging/classifier';

export interface WorkerAutocompleteItem { name: string; category: string; count: number | null }
export interface WorkerTagDetail extends TagRecord {
  modeParent: string;
  modeSub: string;
  secondaryUiCategories: Array<{ parent: string; sub: string; subSub?: string }>;
  classificationConfidence: number;
  classificationSources: string[];
  isNsfw: boolean;
}

type RichTagRecord = TagRecord & {
  secondaryUiCategories: Array<{ parent: string; sub: string; subSub?: string }>;
  classificationConfidence: number;
  classificationSources: string[];
  isNsfw: boolean;
};

const CODE_MAP: Record<string, string> = { '0': 'General', '1': 'Artist', '3': 'Copyright', '4': 'Character', '5': 'Meta' };
export type CategorizationMode = 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
export type SortMode = 'alphabetical' | 'popularity';
type Mode = CategorizationMode;
type Sort = SortMode;

let mode: Mode = 'prompt_flow';
let sort: Sort = 'alphabetical';
let records: RichTagRecord[] = [];
let lookup = new Map<string, RichTagRecord>();
let hierarchies: Record<Mode, Hierarchy> = { prompt_flow: {}, danbooru_types: {}, danbooru_groups: {} };
let ready = false;

export interface Hierarchy { [parent: string]: { [sub: string]: string[] } }

const PROMPT_FLOW_ORDER = [
  'Person',
  'Apparel',
  'Facial expression and action',
  'Image',
  'Environment',
  'Scene',
  'Items',
  'Camera',
  'Hanfu',
  'NSFW & Adult',
  'Negative Prompt',
];

function csvFields(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

async function asset(path: string, type: 'json' | 'text') {
  const clean = path.replace(/^\//, '');
  const candidates: string[] = [];
  try {
    candidates.push(new URL(`/${clean}`, self.location.origin).toString());
  } catch {}
  candidates.push(`/${clean}`, `./${clean}`);
  let lastError = '';
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return type === 'json' ? await r.json() : await r.text();
      lastError = `HTTP ${r.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Unable to load ${path}${lastError ? ` (${lastError})` : ''}`);
}

function wikiParentMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [parent, subs] of Object.entries(DANBOORU_WIKI_GROUPS)) {
    for (const sub of subs) map.set(sub, parent);
  }
  return map;
}

function nativeHierarchy(): Hierarchy {
  const h: Hierarchy = { General: {}, Artist: {}, Character: {}, Copyright: {}, Meta: {} };
  for (const r of records) {
    const p = r.nativeCategory || 'General';
    h[p] ??= {};
    const sub = r.wikiCategory || (p === 'Meta' ? 'Technical & Medium' : 'All Tags');
    h[p][sub] ??= [];
    h[p][sub].push(r.tag);
  }
  return h;
}

function buildPromptFlowHierarchyFromRecords(): Hierarchy {
  const h: Hierarchy = {};
  for (const p of PROMPT_FLOW_ORDER) {
    h[p] = {};
  }

  for (const r of records) {
    const parent = r.uiCategory || 'Person';
    const sub = r.uiSubCategory || 'General';
    if (!h[parent]) h[parent] = {};
    if (!h[parent][sub]) h[parent][sub] = [];
    h[parent][sub].push(r.tag);
  }

  for (const p of Object.keys(h)) {
    let hasTags = false;
    for (const s of Object.keys(h[p])) {
      if (h[p][s].length > 0) hasTags = true;
      else delete h[p][s];
    }
    if (!hasTags) delete h[p];
  }

  return h;
}

function modeMeta(record: RichTagRecord) {
  if (mode === 'prompt_flow') return { parent: record.uiCategory, sub: record.uiSubCategory };
  if (mode === 'danbooru_types') return { parent: record.nativeCategory, sub: record.wikiCategory || (record.nativeCategory === 'Meta' ? 'Technical & Medium' : 'All Tags') };
  if (record.wikiCategory) {
    const parent = wikiParentMap().get(record.wikiCategory);
    if (parent) return { parent, sub: record.wikiCategory };
  }
  return { parent: 'Native Categories', sub: record.nativeCategory };
}

function buildModeHierarchy(): Hierarchy {
  if (mode === 'prompt_flow') return buildPromptFlowHierarchyFromRecords();
  if (mode === 'danbooru_types') return nativeHierarchy();
  return buildWikiGroupHierarchy(records, wikiParentMap());
}

function stats(sfwFilter: 'all' | 'sfw' | 'nsfw' = 'all') {
  const h = hierarchies[mode] || {};
  const specificParents = PROMPT_FLOW_ORDER.filter((p) => h[p] && Object.values(h[p]).some((a) => a.length > 0));
  for (const p of Object.keys(h)) {
    if (!specificParents.includes(p) && Object.values(h[p]).some((a) => a.length > 0)) {
      specificParents.push(p);
    }
  }

  const parents = ['All', ...specificParents];
  const parentCounts: Record<string, number> = {};
  const subCounts: Record<string, Record<string, number>> = {};

  const filteredRecords = records.filter((r) => {
    if (sfwFilter === 'sfw') return !r.isNsfw;
    if (sfwFilter === 'nsfw') return r.isNsfw;
    return true;
  });

  parentCounts.All = filteredRecords.length;
  subCounts.All = { All: filteredRecords.length };

  for (const p of parents.slice(1)) {
    const set = new Set<string>();
    subCounts[p] = {};

    for (const [s, tags] of Object.entries(h[p] || {})) {
      const activeTags = tags.filter((t) => {
        const r = lookup.get(cleanKey(t));
        if (!r) return true;
        if (sfwFilter === 'sfw') return !r.isNsfw;
        if (sfwFilter === 'nsfw') return r.isNsfw;
        return true;
      });

      subCounts[p][s] = new Set(activeTags).size;
      activeTags.forEach((t) => set.add(t));
    }

    subCounts[p].All = set.size;
    parentCounts[p] = set.size;
  }

  return { parentCategories: parents, parentCounts, subCounts, totalTags: filteredRecords.length };
}

function rebuild(sfwFilter: 'all' | 'sfw' | 'nsfw' = 'all') {
  hierarchies[mode] = buildModeHierarchy();
  return stats(sfwFilter);
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload = {} } = e.data;
  try {
    if (type === 'INIT') {
      mode = payload.mode || mode;
      sort = payload.sort || sort;
      const [catRaw, descRaw, csvText] = await Promise.all([
        asset('/data/danbooru_categories.json', 'json'),
        asset('/data/tag_descriptions.json', 'json'),
        asset('/data/danbooru.csv', 'text'),
      ]);

      if (!catRaw || !catRaw.tags) throw new Error('danbooru_categories.json loaded but has no tags map');
      if (typeof csvText !== 'string' || csvText.length < 10) throw new Error('danbooru.csv failed to load or is empty');

      const wikiTags: Record<string, string> = catRaw?.tags || {};
      const descriptions: Record<string, string> = descRaw || {};
      const next: RichTagRecord[] = [];
      const seen = new Set<string>();

      // 1. Index Danbooru CSV records
      for (const rawLine of csvText.split(/\r?\n/)) {
        if (!rawLine.trim()) continue;
        const parts = csvFields(rawLine);
        const tag = (parts[0] || '').trim();
        if (!tag) continue;
        const key = cleanKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);

        const code = (parts[1] || '0').trim();
        const native = CODE_MAP[code] || 'General';
        const parsed = parts[2] === undefined || parts[2].trim() === '' ? null : Number.parseInt(parts[2].trim(), 10);
        const count = Number.isFinite(parsed as number) ? parsed : null;
        const wiki = wikiTags[tag] ?? wikiTags[key] ?? null;
        const description = descriptions[key] || descriptions[tag] || null;
        const classification: ClassificationResult = classifyTagDetailed(tag, native, code, wiki, count, description);

        next.push({
          tag,
          normalizedTag: key,
          postCount: count,
          nativeCategory: native,
          nativeCategoryCode: code,
          wikiCategory: wiki,
          uiCategory: classification.primary.parent,
          uiSubCategory: classification.primary.sub,
          uiSubSubCategory: classification.primary.subSub || null,
          description,
          isMeaningless: false,
          secondaryUiCategories: classification.secondary,
          classificationConfidence: classification.confidence,
          classificationSources: classification.sources,
          isNsfw: classification.isNsfw ?? false,
        });
      }

      // 2. Inject taxonomy dictionary entries not found in danbooru.csv (Hanfu phrases, custom tags, embeddings)
      for (const [dictTag, mapping] of Object.entries(SFW_EXACT_MAP)) {
        const key = cleanKey(dictTag);
        if (!seen.has(key)) {
          seen.add(key);
          next.push({
            tag: dictTag.replace(/_/g, ' '),
            normalizedTag: key,
            postCount: null,
            nativeCategory: 'General',
            nativeCategoryCode: '0',
            wikiCategory: null,
            uiCategory: mapping.parent,
            uiSubCategory: mapping.sub,
            uiSubSubCategory: null,
            description: null,
            isMeaningless: false,
            secondaryUiCategories: [],
            classificationConfidence: 1.0,
            classificationSources: ['yaml_taxonomy_injection'],
            isNsfw: false,
          });
        }
      }

      records = next;
      lookup = new Map(records.map((r) => [r.normalizedTag, r]));
      for (const r of records) {
        lookup.set(cleanKey(r.tag), r);
      }

      ready = true;
      self.postMessage({ id, success: true, data: rebuild() });
      return;
    }

    if (type === 'SET_MODE') {
      mode = payload.mode as Mode;
      self.postMessage({ id, success: true, data: rebuild(payload.sfwFilter) });
      return;
    }

    if (type === 'SET_SORT') {
      sort = payload.sort as Sort;
      self.postMessage({ id, success: true, data: true });
      return;
    }

    if (!ready) throw new Error('Tag database is not initialized');

    if (type === 'GET_STATS') {
      self.postMessage({ id, success: true, data: stats(payload.sfwFilter) });
      return;
    }

    if (type === 'GET_TAGS') {
      const parent = payload.parent as string;
      const sub = payload.sub as string;
      const q = cleanKey(payload.search || '');
      const limit = payload.limit ?? 300;
      const sfwFilter = payload.sfwFilter as 'all' | 'sfw' | 'nsfw' | undefined;

      let list: string[] = [];
      const h = hierarchies[mode];

      if (parent === 'All') {
        list = records.map((r) => r.tag);
      } else if (h[parent]) {
        if (sub === 'All') {
          list = [...new Set(Object.values(h[parent]).flat())];
        } else {
          // Normalize subcategory match to handle colons and case differences
          const cleanSub = cleanKey(sub);
          const foundKey = Object.keys(h[parent]).find((k) => cleanKey(k) === cleanSub) || sub;
          list = h[parent][foundKey] || [];
        }
      }

      // Filter out NSFW tags when SFW mode is active
      if (sfwFilter === 'sfw') {
        list = list.filter((t) => !lookup.get(cleanKey(t))?.isNsfw);
      } else if (sfwFilter === 'nsfw') {
        list = list.filter((t) => lookup.get(cleanKey(t))?.isNsfw);
      }

      if (q) {
        list = list.filter((t) => {
          const k = cleanKey(t);
          return k.includes(q) || t.toLowerCase().includes(q);
        });
      }

      list = [...new Set(list)];
      list.sort((a, b) =>
        sort === 'alphabetical'
          ? a.localeCompare(b)
          : (lookup.get(cleanKey(b))?.postCount ?? -1) - (lookup.get(cleanKey(a))?.postCount ?? -1)
      );

      self.postMessage({ id, success: true, data: list.slice(0, limit) });
      return;
    }

    if (type === 'SEARCH') {
      const q = cleanKey(payload.query || '');
      const limit = payload.limit ?? 8;
      const sfwFilter = payload.sfwFilter as 'all' | 'sfw' | 'nsfw' | undefined;

      if (!q) {
        self.postMessage({ id, success: true, data: [] });
        return;
      }

      const out: WorkerAutocompleteItem[] = [];
      for (const r of records) {
        if (sfwFilter === 'sfw' && r.isNsfw) continue;
        if (sfwFilter === 'nsfw' && !r.isNsfw) continue;

        if (r.normalizedTag.includes(q) || cleanKey(r.tag).includes(q)) {
          out.push({ name: r.tag, category: r.nativeCategory, count: r.postCount });
          if (out.length >= limit) break;
        }
      }

      self.postMessage({ id, success: true, data: out });
      return;
    }

    if (type === 'GET_DETAIL') {
      const r = lookup.get(cleanKey(payload.tag));
      if (!r) {
        self.postMessage({ id, success: true, data: null });
        return;
      }
      const m = modeMeta(r);
      const detail: WorkerTagDetail = {
        ...r,
        modeParent: payload.currentParent || m.parent,
        modeSub: payload.currentSub && payload.currentSub !== 'All' ? payload.currentSub : m.sub,
        isNsfw: r.isNsfw,
      };
      self.postMessage({ id, success: true, data: detail });
      return;
    }

    if (type === 'GET_COUNT') {
      self.postMessage({ id, success: true, data: lookup.get(cleanKey(payload.tag))?.postCount ?? null });
      return;
    }

    if (type === 'GET_RANDOM_TAGS') {
      const parent = payload.parent as string;
      const count = payload.count ?? 2;
      const sfwFilter = payload.sfwFilter as 'all' | 'sfw' | 'nsfw' | undefined;

      let pool: string[] = [];
      const h = hierarchies[mode];

      if (parent === 'All') pool = records.map((r) => r.tag);
      else pool = [...new Set(Object.values(h[parent] || {}).flat())];

      if (sfwFilter === 'sfw') {
        pool = pool.filter((t) => !lookup.get(cleanKey(t))?.isNsfw);
      } else if (sfwFilter === 'nsfw') {
        pool = pool.filter((t) => lookup.get(cleanKey(t))?.isNsfw);
      }

      const picked: string[] = [];
      for (let i = 0; i < count && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool[idx]);
        pool.splice(idx, 1);
      }
      self.postMessage({ id, success: true, data: picked });
      return;
    }
  } catch (error) {
    self.postMessage({ id, success: false, error: error instanceof Error ? error.message : String(error) });
  }
};