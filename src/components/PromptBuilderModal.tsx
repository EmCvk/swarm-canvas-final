import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Dices,
  Download,
  Eraser,
  ExternalLink,
  Heart,
  Info,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { emitToast } from '../utils/toast';
import { danbooru, type BuilderGroup, type BuilderHealth, type BuilderTagResult, type RemoteTag } from '../api/danbooruService';
import { BUILDER_TAXONOMIES, type BuilderFilter, type BuilderTaxonomyId, getSemanticPlacements, getPromptFlowPlacements, getPromptRolePlacements } from '../api/promptBuilderTaxonomies';
import { classifyTagDetailed } from '../tagging/classifier';
import { PROMPT_BUILDER_TAG_COUNT, SECTIONS, type PromptBuilderSection, type PromptBuilderTag } from '../data_animaPromptLibrary';

type BuilderTarget = 'positive' | 'negative';
type BuilderMode = 'add' | 'replace';
type SourceMode = 'curated' | 'local' | 'internet' | 'hybrid';
type ViewMode = 'browse' | 'build';
type SortMode = 'alphabetical' | 'popularity';
type OrderMode = 'manual' | 'anima' | 'semantic' | 'taxonomy';
type FavoriteFolder = 'General' | 'Characters' | 'Appearance' | 'Actions' | 'Pose' | 'Camera' | 'Lighting' | 'Environment' | 'Style' | 'NSFW';

type SavedRecipe = {
  id: string;
  name: string;
  positive: string;
  negative: string;
  folder: FavoriteFolder;
  createdAt: number;
};

type RemoteTagEnriched = RemoteTag & { localDetail?: Partial<BuilderTagResult> };

type BuilderTreeSub = { sub: string; count: number; countKnown?: boolean; leaves: Array<{ leaf: string; count: number }> };
type BuilderTreeParent = { parent: string; label: string; hint: string; count: number; countKnown?: boolean; subs: BuilderTreeSub[] };

type BuilderSearchSuggestion = { label: string; count?: number | null; category?: string; origin?: 'curated' | 'local' | 'internet' };

type DisplayTag = PromptBuilderTag & {
  postCount?: number | null;
  nativeCategory?: string;
  wikiCategory?: string | null;
  classificationConfidence?: number;
  classificationSources?: string[];
  isNsfw?: boolean;
  origin?: 'curated' | 'local' | 'internet';
};

type InspectorDetail = DisplayTag & {
  remote?: RemoteTag;
  wikiBody?: string;
  wikiNames?: string[];
};

const FAVORITES_KEY = 'swarm_prompt_builder_favorites_v2';
const FAVORITE_FOLDERS_KEY = 'swarm_prompt_builder_favorite_folders_v1';
const RECIPES_KEY = 'swarm_prompt_builder_recipes_v2';
const SOURCE_KEY = 'swarm_prompt_builder_source_v1';
const TAXONOMY_KEY = 'swarm_prompt_builder_taxonomy_v1';
const FILTER_KEY = 'swarm_prompt_builder_filter_v1';
const SORT_KEY = 'swarm_prompt_builder_sort_v1';
const VIEW_KEY = 'swarm_prompt_builder_view_v1';
const SCALE_KEY = 'swarm_prompt_builder_scale_v3';
const BUILDER_SCALE_MIN = 90;
const BUILDER_SCALE_MAX = 110;
const BUILDER_SCALE_DEFAULT = 100;

function readBuilderScale() {
  try {
    const value = Number(localStorage.getItem(SCALE_KEY));
    return Number.isFinite(value) ? Math.min(BUILDER_SCALE_MAX, Math.max(BUILDER_SCALE_MIN, Math.round(value / 5) * 5)) : BUILDER_SCALE_DEFAULT;
  } catch {
    return BUILDER_SCALE_DEFAULT;
  }
}

const FAVORITE_FOLDERS: FavoriteFolder[] = ['General', 'Characters', 'Appearance', 'Actions', 'Pose', 'Camera', 'Lighting', 'Environment', 'Style', 'NSFW'];
const LOCAL_PAGE_LIMIT = 300;
const REMOTE_PAGE_LIMIT = 1000;
// Internet semantic browsing does not have to ask Danbooru for impossible
// semantic categories. Instead we sample a bounded set of the live native tag
// index (ordered by popularity) and classify those tags locally. The existing
// service cache makes this a one-time per-page cost for the session.
const REMOTE_CATEGORY_SCAN_PAGES = 4;

const RECIPES: SavedRecipe[] = [
  { id: 'balanced-character', name: 'Balanced character', folder: 'Characters', createdAt: 0, positive: 'masterpiece, best quality, 1girl, solo, long hair, looking at viewer, smile, upper body, detailed background, soft lighting, anime coloring, intricate details', negative: 'worst quality, low quality, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, watermark, text' },
  { id: 'full-body-cinematic', name: 'Full-body cinematic', folder: 'Camera', createdAt: 0, positive: 'masterpiece, best quality, 1girl, full body, standing, dynamic composition, three-quarter view, city, night city, cinematic lighting, rim lighting, depth of field, detailed background, vibrant colors', negative: 'worst quality, low quality, blurry, bad anatomy, bad hands, extra fingers, cropped, out of frame, watermark, text' },
  { id: 'soft-portrait', name: 'Soft portrait', folder: 'Lighting', createdAt: 0, positive: 'masterpiece, best quality, 1girl, portrait, close-up, looking at viewer, gentle smile, detailed eyes, soft lighting, backlighting, bokeh, pastel colors, anime coloring, clean lineart', negative: 'worst quality, low quality, blurry, chromatic aberration, bad anatomy, distorted face, bad hands, watermark, text' },
  { id: 'anime-scene', name: 'Anime scene', folder: 'Style', createdAt: 0, positive: 'masterpiece, best quality, 1girl, solo, standing, school, cherry blossoms, afternoon, warm lighting, wind, leaves, detailed background, anime coloring, cel shading, dynamic composition', negative: 'worst quality, low quality, blurry, bad anatomy, bad hands, duplicate, extra character, watermark, text' },
  { id: 'quiet-interior', name: 'Quiet interior', folder: 'Environment' as FavoriteFolder, createdAt: 0, positive: 'masterpiece, best quality, 1girl, sitting, bedroom, window, books, plants, soft lighting, warm palette, peaceful atmosphere, detailed background, depth of field, soft shading', negative: 'worst quality, low quality, blurry, bad anatomy, bad hands, extra fingers, messy background, watermark, text' },
  { id: 'action', name: 'Action frame', folder: 'Actions', createdAt: 0, positive: 'masterpiece, best quality, 1girl, dynamic pose, jumping, foreshortening, low angle, diagonal composition, dramatic lighting, motion, wind, detailed background, sharp lines, high contrast', negative: 'worst quality, low quality, blurry, bad anatomy, bad hands, extra limbs, fused fingers, deformed, cropped, watermark, text' },
  { id: 'fashion-editorial', name: 'Fashion editorial', folder: 'Style', createdAt: 0, positive: 'masterpiece, best quality, 1girl, full body, formal, business suit, heels, standing, confident expression, centered composition, studio, spotlight, soft shadows, sharp lines, limited palette', negative: 'worst quality, low quality, blurry, bad anatomy, bad hands, extra fingers, distorted face, watermark, text' },
  { id: 'fantasy-landscape', name: 'Fantasy landscape', folder: 'Style', createdAt: 0, positive: 'masterpiece, best quality, landscape, mountain, forest, lake, mist, volumetric lighting, god rays, floating particles, dramatic atmosphere, painterly, intricate details, wide shot', negative: 'worst quality, low quality, blurry, jpeg artifacts, oversaturated, noisy, watermark, text, logo' },
];

const ANIMA_NOTES = {
  base: {
    label: 'Anima + Qwen 3 0.6B Base',
    file: 'qwen_3_06b_base.safetensors',
    note: 'Structured lowercase tags work well as a controlled vocabulary. Keep a space after commas and use spaces instead of underscores for human-readable prompt tokens.',
  },
  qwen35: {
    label: 'Anima + Qwen 3.5 4B',
    file: 'qwen35_4b.safetensors',
    note: 'Keep the tag vocabulary clean, but natural-language scene clauses can be mixed into the structured stack more freely.',
  },
} as const;
type ProfileKey = keyof typeof ANIMA_NOTES;

const SOURCE_OPTIONS: Array<{ id: SourceMode; label: string; description: string }> = [
  { id: 'curated', label: 'Curated Anima', description: 'Hand-organized Anima-oriented library.' },
  { id: 'local', label: 'Local database', description: 'The full bundled Danbooru-derived database and taxonomy index.' },
  { id: 'internet', label: 'Internet / Danbooru', description: 'Live Danbooru native index, sampled on demand and categorized locally into an Anima-friendly taxonomy.' },
  { id: 'hybrid', label: 'Combined', description: 'Curated tags + local database matches in one view.' },
];

function remoteGroupForTag(tag: RemoteTag): { parent: string; sub: string; leaf?: string } {
  const result = classifyTagDetailed(tag.name, tag.categoryName, String(tag.category), null, tag.postCount, null);
  if (tag.categoryName === 'artist') return { parent: 'Native Categories', sub: 'Artist' };
  if (tag.categoryName === 'copyright') return { parent: 'Video Games', sub: 'Copyright / Series' };
  if (tag.categoryName === 'character') return { parent: 'Video Games', sub: 'Characters' };
  if (tag.categoryName === 'meta') return { parent: 'Quality & Meta', sub: 'Danbooru Metadata' };
  const placements = getSemanticPlacements({ tag: tag.name, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null, isNsfw: result.isNsfw });
  const parentMap: Record<string, string> = {
    Subject: 'Society & Culture', Appearance: 'Face & Hair', Attributes: 'Body & Anatomy', Clothing: 'Attire & Clothing',
    Actions: 'Poses & Actions', Pose: 'Poses & Actions', Interaction: 'Poses & Actions', Composition: 'Composition & Style',
    Camera: 'Composition & Style', Environment: 'Locations & Scenery', Scene: 'Locations & Scenery', Objects: 'Society & Culture',
    Style: 'Composition & Style', Concepts: 'Text & Lore', Technical: 'Quality & Meta', 'NSFW & Adult': 'Sex & Erotica',
  };
  const mapped = placements.map((p) => ({ parent: parentMap[p.parent] || 'Society & Culture', sub: p.sub || 'General', leaf: p.leaf }));
  // Prefer a placement that belongs to a concrete Anima group; fall back to the first semantic placement.
  return mapped.find((p) => p.parent !== 'Society & Culture') || mapped[0] || { parent: 'Society & Culture', sub: 'General' };
}

const SOURCE_ORDER: Record<BuilderTaxonomyId, string[]> = {
  prompt_flow: ['Person', 'Apparel', 'Facial expression and action', 'Image', 'Environment', 'Scene', 'Items', 'Camera', 'Hanfu', 'NSFW & Adult', 'Negative Prompt'],
  semantic: ['Subject', 'Appearance', 'Attributes', 'Clothing', 'Actions', 'Pose', 'Interaction', 'Composition', 'Camera', 'Environment', 'Scene', 'Objects', 'Style', 'NSFW & Adult', 'Technical', 'General'],
  anima_roles: ['Character', 'Action & Pose', 'Framing', 'Scene', 'Style', 'Adult', 'Technical', 'General'],
  danbooru_types: ['General', 'Character', 'Meta', 'Artist', 'Copyright'],
  danbooru_groups: ['Quality & Meta', 'Attire & Clothing', 'Face & Hair', 'Body & Anatomy', 'Poses & Actions', 'Composition & Style', 'Locations & Scenery', 'Animals & Nature', 'Food & Beverage', 'Sex & Erotica', 'Video Games', 'Text & Lore', 'Audio & Music', 'Society & Culture', 'Native Categories'],
};

function tokenize(text: string) {
  return text.split(/,(?![^<]*>)/g).map((x) => x.trim()).filter(Boolean);
}

function normalizeToken(text: string) {
  return text.trim().toLowerCase().replace(/_/g, ' ');
}

function normalizePromptLine(line: string, seen: Set<string>) {
  return tokenize(line).map((raw) => raw.trim()).filter(Boolean).map((token) => {
    const key = normalizeToken(token);
    if (seen.has(key)) return '';
    seen.add(key);
    if (/^<\/?(?:lora|lyco):/i.test(token)) return token;
    if (/^(?:AND|BREAK)$/i.test(token)) return token.toUpperCase();
    if (/^score_\d+$/i.test(token)) return token.toLowerCase();
    if (/^\/\*|^\(.*:\d+(?:\.\d+)?\)$/.test(token)) return token;
    return token.toLowerCase().replace(/_/g, ' ');
  }).filter(Boolean).join(', ');
}

function dedupePrompt(text: string) {
  const seen = new Set<string>();
  return text.replace(/\r\n?/g, '\n').split('\n').map((line) => normalizePromptLine(line, seen)).join('\n').trim();
}

function normalizeAnimaPrompt(text: string) {
  // Preserve prompt sections/newlines. The old implementation collapsed all whitespace,
  // which silently destroyed the newline-based prompt-pill layout after Builder actions.
  return dedupePrompt(text);
}

const defaultFavorites = new Set(['masterpiece', 'best quality', 'score_7', 'safe', '1girl', 'solo', 'looking at viewer', 'smile', 'upper body', 'full body', 'detailed background', 'soft lighting', 'anime coloring', 'cel shading', 'depth of field', 'bokeh', 'intricate details', 'bad anatomy', 'bad hands', 'extra fingers', 'blurry', 'watermark', 'text']);

const classifyFolder = (tag: string, isNsfw = false): FavoriteFolder => {
  if (isNsfw) return 'NSFW';
  const clean = normalizeToken(tag);
  if (/(action|walking|running|jumping|touching|holding|hugging|kissing|fighting|dancing)/.test(clean)) return 'Actions';
  if (/(pose|standing|sitting|kneeling|lying|squatting)/.test(clean)) return 'Pose';
  if (/(camera|portrait|shot|angle|focus|bokeh|lens)/.test(clean)) return 'Camera';
  if (/(light|lighting|sunset|backlight|rim)/.test(clean)) return 'Lighting';
  if (/(masterpiece|quality|anime|cinematic|cyberpunk|fantasy|watercolor|sketch)/.test(clean)) return 'Style';
  if (/(hair|eye|face|skin|breast|chest|body|hand|leg|foot)/.test(clean)) return 'Appearance';
  if (/(girl|boy|woman|man|character|elf|demon|angel)/.test(clean)) return 'Characters';
  return 'General';
};

function isNsfwTagForRemote(tag: RemoteTag) {
  const categoryCode = tag.category === 1 ? '1' : tag.category === 3 ? '3' : tag.category === 4 ? '4' : tag.category === 5 ? '5' : '0';
  return classifyTagDetailed(tag.name, tag.categoryName, categoryCode, null, tag.postCount, null).isNsfw;
}

function displayFromCurated(tag: PromptBuilderTag): DisplayTag {
  return { ...tag, origin: 'curated' };
}

function displayFromLocal(tag: BuilderTagResult, path: string[] = []): DisplayTag {
  const exactPath = path.length && path[0] !== 'All' && !path[0].startsWith('__')
    ? path
    : [tag.uiCategory || 'General', tag.uiSubCategory || 'General', ...(tag.uiSubSubCategory ? [tag.uiSubSubCategory] : [])];
  return {
    id: `local:${tag.tag}:${exactPath.join('/')}`,
    label: tag.tag,
    section: 'local',
    path: exactPath,
    description: tag.description || undefined,
    postCount: tag.postCount,
    nativeCategory: tag.nativeCategory,
    wikiCategory: tag.wikiCategory,
    classificationConfidence: tag.classificationConfidence,
    classificationSources: tag.classificationSources,
    isNsfw: tag.isNsfw,
    origin: 'local',
  };
}

function displayFromRemote(tag: RemoteTag, taxonomy: BuilderTaxonomyId): DisplayTag {
  const result = classifyTagDetailed(tag.name, tag.categoryName, tag.category === 1 ? '1' : tag.category === 3 ? '3' : tag.category === 4 ? '4' : tag.category === 5 ? '5' : '0', null, tag.postCount, null);
  const nativeLabel = tag.categoryName === 'artist' ? 'Artist' : tag.categoryName === 'copyright' ? 'Copyright' : tag.categoryName === 'character' ? 'Character' : tag.categoryName === 'meta' ? 'Meta' : 'General';
  const placement = taxonomy === 'semantic'
    ? getSemanticPlacements({ tag: tag.name, nativeCategory: nativeLabel, nativeCategoryCode: String(tag.category), wikiCategory: null, isNsfw: result.isNsfw })[0]
    : taxonomy === 'anima_roles'
      ? getPromptRolePlacements({ tag: tag.name, nativeCategory: nativeLabel, nativeCategoryCode: String(tag.category), wikiCategory: null, isNsfw: result.isNsfw })[0]
      : taxonomy === 'prompt_flow'
        ? getPromptFlowPlacements({ tag: tag.name, nativeCategory: nativeLabel, nativeCategoryCode: String(tag.category), wikiCategory: null, isNsfw: result.isNsfw })[0]
        : taxonomy === 'danbooru_groups'
          ? remoteGroupForTag(tag)
          : { parent: nativeLabel, sub: tag.isDeprecated ? 'Deprecated' : 'Tags' };
  return {
    id: `remote:${tag.id}`,
    label: tag.name,
    section: 'remote',
    path: [placement.parent, placement.sub, ...(placement.leaf ? [placement.leaf] : [])],
    postCount: tag.postCount,
    nativeCategory: nativeLabel,
    isNsfw: result.isNsfw,
    classificationConfidence: result.confidence,
    classificationSources: result.sources,
    origin: 'internet',
  };
}


function rawQueryDebounce(value: string): number { return value.trim() ? 180 : 0; }
export interface PromptBuilderModalProps { open: boolean; onClose: () => void }

export const PromptBuilderModal: React.FC<PromptBuilderModalProps> = ({ open, onClose }) => {
  const isStandalonePopup = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('popup') === 'anima-prompt-builder';

  const [target, setTarget] = useState<BuilderTarget>('positive');
  const [mode, setMode] = useState<BuilderMode>('add');
  const [profile, setProfile] = useState<ProfileKey>('base');
  const [query, setQuery] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [allSearch, setAllSearch] = useState('');
  const [remoteSearchMode, setRemoteSearchMode] = useState<'category' | 'all'>('category');
  const [remoteDiscoveredSubs, setRemoteDiscoveredSubs] = useState<Record<string, string[]>>({});
  const [source, setSource] = useState<SourceMode>(() => (localStorage.getItem(SOURCE_KEY) as SourceMode) || 'local');
  const [taxonomy, setTaxonomy] = useState<BuilderTaxonomyId>(() => (localStorage.getItem(TAXONOMY_KEY) as BuilderTaxonomyId) || 'semantic');
  const [sfwFilter, setSfwFilter] = useState<BuilderFilter>(() => (localStorage.getItem(FILTER_KEY) as BuilderFilter) || 'all');
  const [sort, setSort] = useState<SortMode>(() => (localStorage.getItem(SORT_KEY) as SortMode) || 'popularity');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'browse');
  const [builderScale, setBuilderScale] = useState(readBuilderScale);
  const [activePath, setActivePath] = useState('All');
  const [favoriteFolderFilter, setFavoriteFolderFilter] = useState<'All' | FavoriteFolder>('All');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
      return new Set(Array.isArray(saved) ? saved : [...defaultFavorites]);
    } catch { return new Set(defaultFavorites); }
  });
  const [favoriteFolders, setFavoriteFolders] = useState<Record<string, FavoriteFolder>>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITE_FOLDERS_KEY) || '{}') || {}; } catch { return {}; }
  });
  const [recipes, setRecipes] = useState<SavedRecipe[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECIPES_KEY) || 'null');
      return Array.isArray(saved) ? [...RECIPES, ...saved.map((r) => ({ ...r, folder: FAVORITE_FOLDERS.includes(r.folder) ? r.folder : 'General' }))] : RECIPES;
    } catch { return RECIPES; }
  });
  const [recipeFolder, setRecipeFolder] = useState<FavoriteFolder>('General');
  const [showRecipePanel, setShowRecipePanel] = useState(false);
  const [showBuilderControls, setShowBuilderControls] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCustomTag, setShowCustomTag] = useState(false);
  const [showPromptActions, setShowPromptActions] = useState(false);
  const [showLibraryHealth, setShowLibraryHealth] = useState(false);
  const [showLibraryControls, setShowLibraryControls] = useState(false);
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(() => new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [replaceReady, setReplaceReady] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [orderMode, setOrderMode] = useState<OrderMode>('anima');
  const [builderGroups, setBuilderGroups] = useState<BuilderGroup[]>([]);
  const [builderTotal, setBuilderTotal] = useState(0);
  const [builderPlacementTotal, setBuilderPlacementTotal] = useState(0);
  const [localPage, setLocalPage] = useState(1);
  const [localPageTotal, setLocalPageTotal] = useState(0);
  const [localTags, setLocalTags] = useState<DisplayTag[]>([]);
  const [remoteTags, setRemoteTags] = useState<RemoteTagEnriched[]>([]);
  const [remoteTotalCount, setRemoteTotalCount] = useState<number | null>(null);
  const [remotePage, setRemotePage] = useState(1);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [builderPositivePrompt, setBuilderPositivePrompt] = useState('');
  const [builderNegativePrompt, setBuilderNegativePrompt] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<BuilderSearchSuggestion[]>([]);
  const [searchSuggestionField, setSearchSuggestionField] = useState<'primary' | 'all' | null>(null);
  const searchRequestIdRef = useRef(0);

  const [builderHealth, setBuilderHealth] = useState<BuilderHealth | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [inspectedTag, setInspectedTag] = useState<string | null>(null);
  const [inspectedDetail, setInspectedDetail] = useState<InspectorDetail | null>(null);

  const currentPrompt = target === 'positive' ? builderPositivePrompt : builderNegativePrompt;
  const currentTokens = useMemo(() => tokenize(currentPrompt), [currentPrompt]);
  const selectedSet = useMemo(() => new Set(currentTokens.map(normalizeToken)), [currentTokens]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
      localStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(favoriteFolders));
      localStorage.setItem(SOURCE_KEY, source);
      localStorage.setItem(TAXONOMY_KEY, taxonomy);
      localStorage.setItem(FILTER_KEY, sfwFilter);
      localStorage.setItem(SORT_KEY, sort);
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {}
  }, [favorites, favoriteFolders, source, taxonomy, sfwFilter, sort, viewMode]);

  useEffect(() => { try { localStorage.setItem(SCALE_KEY, String(builderScale)); } catch {} }, [builderScale]);

  useEffect(() => { if (source === 'internet' && taxonomy !== 'danbooru_groups') { setTaxonomy('danbooru_groups'); setActivePath('All'); } }, [source, taxonomy]);

  useEffect(() => {
    try { localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes.filter((r) => r.createdAt !== 0).slice(0, 100))); } catch {}
  }, [recipes]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') { event.preventDefault(); onClose(); }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); document.getElementById('anima-builder-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => setReplaceReady(mode === 'replace'), [mode, target]);

  useEffect(() => {
    if (source !== 'local' && source !== 'hybrid') return;
    let active = true;
    setLoadingLibrary(true);
    setLibraryError(null);
    danbooru.getBuilderGroups(taxonomy, sfwFilter)
      .then((result) => { if (!active) return; setBuilderGroups(result.groups || []); setBuilderTotal(result.totalTags || 0); setBuilderPlacementTotal(result.placementTotal || 0); })
      .catch((error) => { if (active) setLibraryError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoadingLibrary(false); });
    return () => { active = false; };
  }, [source, taxonomy, sfwFilter]);

  useEffect(() => {
    if (source !== 'local' && source !== 'hybrid') return;
    const [parent, sub, leaf] = activePath.split('::');
    if (!parent || parent.startsWith('__')) return;
    let active = true;
    setLoadingLibrary(true);
    setLocalTags([]);
    danbooru.getBuilderTags({ taxonomy, sfwFilter, parent: parent || 'All', sub, leaf, search: query.trim(), sort, page: localPage, limit: LOCAL_PAGE_LIMIT })
      .then((result) => { if (!active) return; setLocalPageTotal(result.total); setLocalTags(result.tags.map((tag) => displayFromLocal(tag, [parent, sub, ...(leaf ? [leaf] : [])]))); })
      .catch((error) => { if (active) { setLocalPageTotal(0); setLocalTags([]); setLibraryError(error instanceof Error ? error.message : String(error)); } })
      .finally(() => { if (active) setLoadingLibrary(false); });
    return () => { active = false; };
  }, [source, taxonomy, sfwFilter, activePath, query, sort, localPage]);

  useEffect(() => setLocalPage(1), [source, taxonomy, sfwFilter, activePath, query, sort]);

  useEffect(() => {
    if (source !== 'internet') {
      setRemoteTags([]);
      setRemotePage(1);
      setRemoteHasMore(false);
      setRemoteTotalCount(null);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const getNativeScanCodes = (parent: string, sub?: string): number[] => {
      if (parent === 'Native Categories') {
        if (sub === 'Artist') return [1];
        if (sub === 'Copyright') return [3];
        if (sub === 'Character') return [4];
        if (sub === 'Meta') return [5];
        if (sub === 'General') return [0];
        return [0, 1, 3, 4, 5];
      }
      if (parent === 'Video Games') return [0, 3, 4];
      if (parent === 'Quality & Meta') return [0, 5];
      return [0];
    };

    const classifyAndFilter = (rows: RemoteTag[], parent: string, sub: string, leaf?: string) => {
      const classified = rows.filter((tag) => {
        const nsfw = isNsfwTagForRemote(tag);
        if (sfwFilter !== 'all' && (sfwFilter === 'nsfw') !== nsfw) return false;
        if (remoteSearchMode === 'all' || parent === 'All' || !parent) return true;
        const placement = remoteGroupForTag(tag);
        return placement.parent === parent
          && (!sub || placement.sub === sub)
          && (!leaf || placement.leaf === leaf);
      });
      const seen = new Set<number>();
      return classified.filter((tag) => {
        if (seen.has(tag.id)) return false;
        seen.add(tag.id);
        return true;
      });
    };

    const timer = window.setTimeout(async () => {
      setLoadingLibrary(true);
      setLibraryError(null);
      try {
        const [activeParent, activeSub, activeLeaf] = activePath.split('::');
        const categoryQuery = categorySearch.trim();
        const globalQuery = allSearch.trim();
        const sortOrder = sort === 'alphabetical' ? 'name' : 'count';

        let candidates: RemoteTag[] = [];
        let hasMore = false;
        let totalCount: number | null = null;

        if (remoteSearchMode === 'all' && globalQuery) {
          const result = await danbooru.searchRemoteTagsPage(globalQuery, {
            limit: REMOTE_PAGE_LIMIT,
            page: remotePage,
            order: sortOrder,
            signal: controller.signal,
          });
          candidates = result.tags;
          hasMore = result.hasMore;
          totalCount = result.totalCount;
        } else if (remoteSearchMode === 'category' && categoryQuery) {
          // Category search is still live, but we also consult any native-index
          // pages already fetched for this category. That avoids the old failure
          // mode where a semantic category depended entirely on a tiny keyword list.
          const [liveResult, ...scanResults] = await Promise.all([
            danbooru.searchRemoteTagsPage(categoryQuery, {
              limit: REMOTE_PAGE_LIMIT,
              page: remotePage,
              order: sortOrder,
              signal: controller.signal,
            }),
            ...getNativeScanCodes(activeParent || 'All', activeSub).map((code) =>
              Promise.all(Array.from({ length: REMOTE_CATEGORY_SCAN_PAGES }, (_, index) =>
                danbooru.searchRemoteTagsPage('', {
                  category: code,
                  limit: REMOTE_PAGE_LIMIT,
                  page: index + 1,
                  order: sortOrder,
                  signal: controller.signal,
                })
              ))
            ),
          ]);
          const merged = new Map<number, RemoteTag>();
          liveResult.tags.forEach((tag) => merged.set(tag.id, tag));
          scanResults.flat().forEach((tag) => merged.set(tag.id, tag));
          candidates = [...merged.values()];
          hasMore = liveResult.hasMore;
          totalCount = liveResult.totalCount;
        } else {
          // Different approach for semantic browsing:
          // scan a bounded popularity window of the native Danbooru index and
          // classify those live tags locally. This does not require Danbooru to
          // understand our custom Anima categories, and it never walks the full
          // ~400k tag universe just to open one category.
          const codes = getNativeScanCodes(activeParent || 'All', activeSub);
          const scanPagesNeeded = remotePage + REMOTE_CATEGORY_SCAN_PAGES - 1;
          const batches = await Promise.all(
            codes.flatMap((code) => Array.from({ length: scanPagesNeeded }, (_, index) =>
              danbooru.searchRemoteTagsPage('', {
                category: code,
                limit: REMOTE_PAGE_LIMIT,
                page: index + 1,
                order: sortOrder,
                signal: controller.signal,
              })
            ))
          );
          const merged = new Map<number, RemoteTag>();
          batches.flatMap((result) => result.tags).forEach((tag) => merged.set(tag.id, tag));
          candidates = [...merged.values()];
          hasMore = batches.some((result) => result.hasMore);
        }

        if (!active) return;

        const classified = classifyAndFilter(candidates, activeParent || 'All', activeSub || '', activeLeaf || undefined);
        const queryFiltered = remoteSearchMode === 'category' && categoryQuery
          ? classified.filter((tag) => {
              const q = categoryQuery.toLowerCase().replace(/[_-]+/g, ' ');
              const name = tag.name.toLowerCase().replace(/[_-]+/g, ' ');
              return name.includes(q);
            })
          : classified;
        const sorted = queryFiltered.sort((a, b) => sort === 'alphabetical' ? a.name.localeCompare(b.name) : b.postCount - a.postCount);
        const offset = remoteSearchMode === 'category' && !categoryQuery ? (remotePage - 1) * REMOTE_PAGE_LIMIT : 0;
        const enriched = sorted.slice(offset, offset + REMOTE_PAGE_LIMIT).map((tag) => ({ ...tag, localDetail: undefined }));
        setRemoteTags(enriched);

        if (remoteSearchMode === 'category' && activeParent && activeParent !== 'All') {
          setRemoteDiscoveredSubs((prev) => {
            const discovered = new Set(prev[activeParent] || []);
            sorted.forEach((tag) => {
              const placement = remoteGroupForTag(tag);
              if (placement.parent === activeParent && placement.sub) discovered.add(placement.sub);
            });
            return { ...prev, [activeParent]: [...discovered].sort((a, b) => a.localeCompare(b)) };
          });
        }

        // In semantic category mode this is the size of the bounded classified
        // live sample. In direct search mode it is Danbooru's reported total.
        setRemoteTotalCount(totalCount ?? sorted.length);
        const categoryWindowHasMore = remoteSearchMode === 'category' && !categoryQuery
          ? sorted.length > offset + REMOTE_PAGE_LIMIT || hasMore
          : false;
        setRemoteHasMore(remoteSearchMode === 'category' && !categoryQuery ? categoryWindowHasMore : hasMore);
      } catch (error) {
        if ((error as any)?.name === 'AbortError') return;
        if (active) {
          setLibraryError(error instanceof Error ? error.message : String(error));
          setRemoteTags([]);
          setRemoteTotalCount(null);
          setRemoteHasMore(false);
        }
      } finally {
        if (active) setLoadingLibrary(false);
      }
    }, rawQueryDebounce(remoteSearchMode === 'all' ? allSearch : categorySearch));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [source, categorySearch, allSearch, sfwFilter, sort, remotePage, taxonomy, activePath, remoteSearchMode]);

  useEffect(() => setRemotePage(1), [source, categorySearch, allSearch, sfwFilter, sort, taxonomy, activePath, remoteSearchMode]);

  useEffect(() => {
    if (source !== 'local' && source !== 'hybrid') { setBuilderHealth(null); return; }
    let active = true;
    danbooru.getBuilderHealth(sfwFilter).then((health) => { if (active) setBuilderHealth(health); }).catch(() => { if (active) setBuilderHealth(null); });
    return () => { active = false; };
  }, [source, sfwFilter]);

  useEffect(() => {
    if (!inspectedTag) { setInspectedDetail(null); return; }
    const local = localTags.find((tag) => normalizeToken(tag.label) === normalizeToken(inspectedTag));
    const remote = remoteTags.find((tag) => normalizeToken(tag.name) === normalizeToken(inspectedTag));
    const curated = SECTIONS.flatMap((s) => s.tags).find((tag) => normalizeToken(tag.label) === normalizeToken(inspectedTag));
    let active = true;
    if (curated) { setInspectedDetail(displayFromCurated(curated)); return () => { active = false; }; }
    if (local) {
      danbooru.getTagDetail(local.label, local.path[0], local.path[1])
        .then(async (detail) => {
          if (!active) return;
          setInspectedDetail({ ...local, description: detail.description, postCount: detail.postCount, nativeCategory: detail.nativeCategory, wikiCategory: detail.wikiCategory, classificationConfidence: detail.classificationConfidence, classificationSources: detail.classificationSources, isNsfw: local.isNsfw });
        })
        .catch(() => { if (active) setInspectedDetail(local); });
    } else if (remote) {
      setInspectedDetail(displayFromRemote(remote, taxonomy));
      void danbooru.getRemoteWiki(remote.name).then((wiki) => {
        if (!active || !wiki) return;
        setInspectedDetail((prev) => prev ? { ...prev, wikiBody: wiki.body, wikiNames: wiki.otherNames } : prev);
      });
    } else {
      const result = classifyTagDetailed(inspectedTag, 'General', '0', null, null, null);
      const strict = taxonomy === 'prompt_flow'
        ? getPromptFlowPlacements({ tag: inspectedTag, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null, isNsfw: result.isNsfw })[0]
        : taxonomy === 'anima_roles'
          ? getPromptRolePlacements({ tag: inspectedTag, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null, isNsfw: result.isNsfw })[0]
          : getSemanticPlacements({ tag: inspectedTag, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null, isNsfw: result.isNsfw })[0];
      setInspectedDetail({ id: `inspect:${inspectedTag}`, label: inspectedTag, section: 'inspect', path: [strict?.parent || 'General', strict?.sub || 'Unclassified', ...(strict?.leaf ? [strict.leaf] : [])], classificationConfidence: result.confidence, classificationSources: result.sources, isNsfw: result.isNsfw });
    }
    return () => { active = false; };
  }, [inspectedTag, localTags, remoteTags, taxonomy]);

  const curatedFilteredSections: PromptBuilderSection[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = sfwFilter === 'all' ? SECTIONS : SECTIONS.map((section) => ({ ...section, tags: section.tags.filter((tag) => {
      const r = classifyTagDetailed(tag.label, 'General', '0', null, null, tag.description || null);
      return sfwFilter === 'nsfw' ? r.isNsfw : !r.isNsfw;
    }) }));
    if (!q) return base;
    return base.map((section) => ({ ...section, tags: section.tags.filter((tag) => `${tag.label} ${tag.path.join(' ')} ${(tag.aliases || []).join(' ')}`.toLowerCase().includes(q)) })).filter((section) => section.tags.length > 0 || section.label.toLowerCase().includes(q));
  }, [query, sfwFilter]);

  const remoteDisplayTags = useMemo(() => remoteTags.map((tag) => displayFromRemote(tag, taxonomy)), [remoteTags, taxonomy]);

  const favoriteTags = useMemo(() => {
    const all = [
      ...SECTIONS.flatMap((section) => section.tags.map(displayFromCurated)),
      ...localTags,
      ...remoteDisplayTags,
    ];
    const seen = new Set<string>();
    return all.filter((tag) => {
      const key = normalizeToken(tag.label);
      if (seen.has(key) || !favorites.has(key)) return false;
      seen.add(key);
      const folder = favoriteFolders[key] || classifyFolder(tag.label, Boolean(tag.isNsfw));
      return favoriteFolderFilter === 'All' || folder === favoriteFolderFilter;
    });
  }, [favorites, favoriteFolders, favoriteFolderFilter, localTags, remoteDisplayTags]);

  const dynamicTags = source === 'internet' ? remoteDisplayTags : localTags;
  const mergedHybridTags = useMemo(() => {
    if (source !== 'hybrid') return dynamicTags;
    const curated = curatedFilteredSections.flatMap((s) => s.tags.map(displayFromCurated));
    const local = dynamicTags;
    const seen = new Set<string>();
    return [...curated, ...local].filter((tag) => {
      const key = normalizeToken(tag.label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [source, dynamicTags, curatedFilteredSections]);

  const activeTags: DisplayTag[] = useMemo(() => {
    if (viewMode === 'build') return [];
    if (activePath === '__favorites__') return favoriteTags;
    if (activePath === '__builder__') return currentTokens.map((token) => ({ id: `current:${token}`, label: token, section: 'current', path: ['Current'], origin: 'curated' as const }));
    if (source === 'curated') {
      if (activePath === 'All' || !activePath) return curatedFilteredSections.flatMap((section) => section.tags.map(displayFromCurated));
      const [sectionId, ...parts] = activePath.split('::');
      const section = curatedFilteredSections.find((s) => s.id === sectionId);
      if (!section) return [];
      if (!parts.length || parts[0] === '') return section.tags.map(displayFromCurated);
      return section.tags.filter((tag) => parts.every((part, index) => tag.path[index] === part)).map(displayFromCurated);
    }
    if (source === 'hybrid') {
      if (activePath === 'All' || !activePath) return mergedHybridTags;
      const [parent, sub, leaf] = activePath.split('::');
      return localTags.filter((tag) => tag.path[0] === parent && (!sub || tag.path[1] === sub) && (!leaf || tag.path[2] === leaf));
    }
    if (source === 'internet') {
      if (remoteSearchMode === 'all' || activePath === 'All' || !activePath) return dynamicTags;
      const [parent, sub, leaf] = activePath.split('::');
      return dynamicTags.filter((tag) => tag.path[0] === parent && (!sub || tag.path[1] === sub) && (!leaf || tag.path[2] === leaf));
    }
    return dynamicTags;
  }, [viewMode, activePath, favoriteTags, currentTokens, source, curatedFilteredSections, dynamicTags, mergedHybridTags, remoteSearchMode]);

  const groupTree = useMemo<BuilderTreeParent[]>(() => {
    if (source === 'curated') {
      return curatedFilteredSections.map((section) => ({ parent: section.id, label: section.label, hint: section.hint, count: section.tags.length, subs: buildCuratedTree(section.tags) }));
    }
    if (source === 'internet') {
      // Internet categories must be stable. Do not derive the navigation tree from
      // the current result page: doing so makes categories disappear whenever the
      // selected category/search returns no matching tags. Counts are only hints;
      // the category itself always remains available for the next remote query.
      const order = SOURCE_ORDER.danbooru_groups;
      const categoryCounts = new Map<string, number>();
      const subCounts = new Map<string, Map<string, number>>();
      for (const tag of remoteDisplayTags) {
        const parent = tag.path[0] || 'Society & Culture';
        const sub = tag.path[1] || 'General';
        categoryCounts.set(parent, (categoryCounts.get(parent) || 0) + 1);
        const subs = subCounts.get(parent) || new Map<string, number>();
        subs.set(sub, (subs.get(sub) || 0) + 1);
        subCounts.set(parent, subs);
      }
      return order.map((parent) => {
        const discovered = remoteDiscoveredSubs[parent] || [];
        const subs = new Map<string, number>(discovered.map((sub) => [sub, 0]));
        for (const [sub, count] of subCounts.get(parent) || []) subs.set(sub, Math.max(subs.get(sub) || 0, count));
        if (parent === 'Native Categories' && !subs.size) subs.set('General', 0);
        return {
          parent,
          label: parent,
          hint: 'Live tags are sampled from Danbooru native index pages, then classified locally.',
          count: categoryCounts.get(parent) || 0,
          countKnown: false,
          subs: [...subs.entries()].map(([sub, count]) => ({ sub, count, countKnown: false, leaves: [] })),
        } as BuilderTreeParent;
      });
    }
    const order = SOURCE_ORDER[taxonomy];
    const map = new Map<string, { parent: string; label: string; hint: string; count: number; countKnown?: boolean; subs: Array<{ sub: string; count: number; countKnown?: boolean; leaves: Array<{ leaf: string; count: number }> }> }>();
    for (const group of builderGroups) {
      const entry = map.get(group.parent) || { parent: group.parent, label: group.parent, hint: '', count: 0, subs: [] };
      entry.count += group.count;
      let subEntry = entry.subs.find((x) => x.sub === group.sub);
      if (!subEntry) { subEntry = { sub: group.sub, count: 0, leaves: [] }; entry.subs.push(subEntry); }
      subEntry.count += group.count;
      if (group.leaf) subEntry.leaves.push({ leaf: group.leaf, count: group.count });
      map.set(group.parent, entry);
    }
    return [...map.values()].sort((a, b) => (order.indexOf(a.parent) < 0 ? 999 : order.indexOf(a.parent)) - (order.indexOf(b.parent) < 0 ? 999 : order.indexOf(b.parent)) || a.parent.localeCompare(b.parent)).map((entry) => ({ ...entry, subs: entry.subs.sort((a, b) => b.count - a.count || a.sub.localeCompare(b.sub)) }));
  }, [source, curatedFilteredSections, remoteDisplayTags, builderGroups, taxonomy, remoteDiscoveredSubs]);

  const currentDiagnostics = useMemo(() => findPromptDiagnostics(currentTokens), [currentTokens]);
  const suggestions = useMemo(() => getSuggestions(currentTokens, activeTags), [currentTokens, activeTags]);

  const setBuilderTargetPrompt = (nextTarget: BuilderTarget, value: string) => {
    if (nextTarget === 'positive') setBuilderPositivePrompt(value);
    else setBuilderNegativePrompt(value);
  };

  useEffect(() => {
    if (!open) {
      setSearchSuggestions([]);
      setSearchSuggestionField(null);
      return;
    }
    const field: 'primary' | 'all' = source === 'internet' && remoteSearchMode === 'all' ? 'all' : 'primary';
    const value = source === 'internet' ? (field === 'all' ? allSearch : categorySearch) : query;
    const trimmed = value.trim();
    const requestId = ++searchRequestIdRef.current;
    setSearchSuggestionField(field);
    if (trimmed.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        if (source === 'internet') {
          const results = await danbooru.searchRemoteTagAutocomplete(trimmed, 50);
          if (requestId !== searchRequestIdRef.current) return;
          const [parent, sub, leaf] = activePath.split('::');
          const filtered = results.filter((tag) => {
            if (sfwFilter !== 'all' && (sfwFilter === 'nsfw') !== isNsfwTagForRemote(tag)) return false;
            if (field === 'all' || !parent || parent === 'All') return true;
            const placement = remoteGroupForTag(tag);
            return placement.parent === parent && (!sub || placement.sub === sub) && (!leaf || placement.leaf === leaf);
          });
          setSearchSuggestions(filtered.slice(0, 12).map((tag) => ({ label: tag.name, count: tag.postCount, category: tag.categoryName, origin: 'internet' })));
          return;
        }

        const curatedPool = SECTIONS.flatMap((section) => section.tags)
          .filter((tag) => {
            if (sfwFilter !== 'all') {
              const detail = classifyTagDetailed(tag.label, 'General', '0', null, null, tag.description || null);
              if ((sfwFilter === 'nsfw') !== detail.isNsfw) return false;
            }
            if (source !== 'curated' && activePath !== 'All' && !activePath.startsWith('__')) {
              const [parent, sub, leaf] = activePath.split('::');
              const display = displayFromCurated(tag);
              if (parent && display.path[0] !== parent) return false;
              if (sub && display.path[1] !== sub) return false;
              if (leaf && display.path[2] !== leaf) return false;
            }
            const haystack = `${tag.label} ${tag.path.join(' ')} ${(tag.aliases || []).join(' ')}`.toLowerCase();
            return haystack.includes(trimmed.toLowerCase()) || haystack.includes(trimmed.toLowerCase().replace(/[_-]+/g, ' '));
          })
          .slice(0, 12)
          .map((tag) => ({ label: tag.label, origin: 'curated' as const }));

        if (source === 'curated') {
          if (requestId === searchRequestIdRef.current) setSearchSuggestions(curatedPool);
          return;
        }

        const [parent, sub, leaf] = activePath.split('::');
        const local = await danbooru.searchBuilderAutocomplete({ taxonomy, sfwFilter, parent: activePath.startsWith('__') ? 'All' : parent || 'All', sub: activePath.startsWith('__') ? '' : sub || '', leaf: activePath.startsWith('__') ? '' : leaf || '', query: trimmed, limit: 12 });
        if (requestId !== searchRequestIdRef.current) return;
        const localSuggestions = local.map((tag) => ({ label: tag.tag, count: tag.postCount, category: tag.nativeCategory, origin: 'local' as const }));
        const merged = [...curatedPool, ...localSuggestions];
        const seen = new Set<string>();
        setSearchSuggestions(merged.filter((item) => { const key = normalizeToken(item.label); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12));
      } catch {
        if (requestId === searchRequestIdRef.current) setSearchSuggestions([]);
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [open, source, taxonomy, sfwFilter, activePath, query, categorySearch, allSearch, remoteSearchMode]);

  const chooseSearchSuggestion = (field: 'primary' | 'all', value: string) => {
    if (source === 'internet') {
      if (field === 'all') { setRemoteSearchMode('all'); setAllSearch(value); setCategorySearch(''); setActivePath('All'); }
      else { setRemoteSearchMode('category'); setCategorySearch(value); setAllSearch(''); }
    } else {
      setQuery(value);
    }
    setSearchSuggestions([]);
    setSearchSuggestionField(null);
  };

  if (!open) return null;

  const sectionRank = (tag: string) => {
    const normalized = normalizeToken(tag);
    const curatedIndex = SECTIONS.findIndex((section) => section.tags.some((candidate) => normalizeToken(candidate.label) === normalized));
    if (orderMode === 'taxonomy' || orderMode === 'semantic') {
      const result = getSemanticPlacements({ tag, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null });
      const parent = result[0]?.parent || 'General';
      const order = ['Subject', 'Appearance', 'Body', 'Clothing', 'Actions', 'Pose', 'Interaction', 'Composition', 'Camera', 'Environment', 'Scene', 'Objects', 'Style', 'Concepts & Lore', 'NSFW & Adult', 'Technical', 'General'];
      return order.indexOf(parent) >= 0 ? order.indexOf(parent) : 999;
    }
    return curatedIndex >= 0 ? curatedIndex : 999;
  };

  const moveCurrentToken = (index: number, direction: -1 | 1) => {
    const next = [...currentTokens]; const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    const value = next.join(', ');
    setBuilderTargetPrompt(target, value);
  };

  const appendTokens = (tokens: string[]) => {
    if (!tokens.length) return;
    const base = mode === 'replace' && replaceReady ? '' : currentPrompt.trim();
    const value = normalizeAnimaPrompt([base, tokens.join(', ')].filter(Boolean).join(', '));
    setBuilderTargetPrompt(target, value);
    if (mode === 'replace') setReplaceReady(false);
  };

  const toggleTag = (tag: string) => {
    const key = normalizeToken(tag);
    if (!key) return;
    const exists = currentTokens.some((token) => normalizeToken(token) === key);
    if (exists) {
      const value = normalizeAnimaPrompt(currentTokens.filter((token) => normalizeToken(token) !== key).join(', '));
      setBuilderTargetPrompt(target, value);
      return;
    }
    if (mode === 'replace' && replaceReady) {
      setBuilderTargetPrompt(target, normalizeAnimaPrompt(tag));
      setReplaceReady(false);
      return;
    }
    appendTokens([tag]);
  };

  const toggleFavorite = (tag: DisplayTag) => {
    const key = normalizeToken(tag.label);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setFavoriteFolders((prev) => ({ ...prev, [key]: prev[key] || classifyFolder(tag.label, Boolean(tag.isNsfw)) }));
  };

  const normalizeCurrent = () => {
    const value = normalizeAnimaPrompt(currentPrompt);
    setBuilderTargetPrompt(target, value);
    emitToast('Prompt normalized for Anima/Qwen spacing', 'success');
  };

  const organizeCurrentPrompt = () => {
    const ordered = [...currentTokens].sort((a, b) => sectionRank(a) - sectionRank(b));
    const value = normalizeAnimaPrompt(ordered.join(', '));
    setBuilderTargetPrompt(target, value);
    emitToast(`Reordered with ${orderMode === 'anima' ? 'Anima' : orderMode === 'semantic' ? 'semantic' : 'taxonomy'} order`, 'success');
  };

  const removeDuplicatesCurrent = () => {
    const value = dedupePrompt(currentPrompt);
    setBuilderTargetPrompt(target, value);
    emitToast('Duplicate tags removed', 'success');
  };

  const clearTarget = () => setBuilderTargetPrompt(target, '');

  const moveBuilderToken = (draftTarget: BuilderTarget, index: number, direction: -1 | 1) => {
    const value = draftTarget === 'positive' ? builderPositivePrompt : builderNegativePrompt;
    const tokens = tokenize(value);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tokens.length) return;
    [tokens[index], tokens[nextIndex]] = [tokens[nextIndex], tokens[index]];
    setBuilderTargetPrompt(draftTarget, tokens.join(', '));
  };

  const removeBuilderToken = (draftTarget: BuilderTarget, index: number) => {
    const value = draftTarget === 'positive' ? builderPositivePrompt : builderNegativePrompt;
    const tokens = tokenize(value);
    if (index < 0 || index >= tokens.length) return;
    tokens.splice(index, 1);
    setBuilderTargetPrompt(draftTarget, tokens.join(', '));
  };

  const copyBuilderDraft = async (label: string, value: string) => {
    const text = value.trim();
    if (!text) { emitToast(`${label} is empty`, 'info'); return; }
    try {
      await navigator.clipboard.writeText(text);
      emitToast(`${label} copied`, 'success');
    } catch {
      emitToast('Clipboard access was unavailable', 'warning');
    }
  };

  const insertRecommendedQuality = () => appendTokens(['masterpiece', 'best quality', 'score_7', 'safe']);
  const insertRecommendedNegative = () => {
    const value = normalizeAnimaPrompt([builderNegativePrompt, 'worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, chromatic aberration'].filter(Boolean).join(', '));
    setBuilderNegativePrompt(value);
  };

  const smartRandomize = () => {
    const pool = (source === 'curated' || source === 'hybrid' ? curatedFilteredSections.flatMap((s) => s.tags.map(displayFromCurated)) : activeTags).filter((tag) => !selectedSet.has(normalizeToken(tag.label)));
    if (!pool.length) { emitToast('No unused tags in the current library view', 'info'); return; }
    const buckets = new Map<string, DisplayTag[]>();
    for (const tag of pool) { const bucket = tag.path[0] || 'General'; if (!buckets.has(bucket)) buckets.set(bucket, []); buckets.get(bucket)!.push(tag); }
    const chosen: DisplayTag[] = [];
    const bucketKeys = [...buckets.keys()];
    for (let i = bucketKeys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucketKeys[i], bucketKeys[j]] = [bucketKeys[j], bucketKeys[i]];
    }
    for (const bucket of bucketKeys.slice(0, 6)) {
      const list = buckets.get(bucket)!;
      chosen.push(list[Math.floor(Math.random() * list.length)]);
    }
    const withoutConflicts = chosen.filter((tag) => !findPromptDiagnostics([...currentTokens, tag.label]).some((issue) => issue.severity === 'warning'));
    appendTokens((withoutConflicts.length ? withoutConflicts : chosen).map((tag) => tag.label));
    emitToast(`Added ${(withoutConflicts.length || chosen.length)} smart-random tags`, 'info');
  };

  const addCustomTag = () => { const value = customTag.trim().replace(/,+$/g, ''); if (!value) return; appendTokens([value]); setCustomTag(''); };

  const applyRecipe = (recipe: SavedRecipe) => { setBuilderPositivePrompt(recipe.positive); setBuilderNegativePrompt(recipe.negative); setActivePreset(recipe.id); emitToast(`Loaded builder recipe: ${recipe.name}`, 'success'); };

  const saveRecipe = () => {
    const name = window.prompt('Save this prompt as:', 'My Anima recipe');
    if (!name?.trim()) return;
    const recipe: SavedRecipe = { id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), folder: recipeFolder, positive: normalizeAnimaPrompt(builderPositivePrompt), negative: normalizeAnimaPrompt(builderNegativePrompt), createdAt: Date.now() };
    setRecipes((prev) => [recipe, ...prev]);
    emitToast(`Saved ${recipe.name}`, 'success');
  };

  const deleteRecipe = (id: string) => setRecipes((prev) => prev.filter((recipe) => recipe.id !== id));
  const exportRecipes = () => {
    const payload = JSON.stringify({ kind: 'swarm-canvas-anima-prompt-recipes', version: 2, recipes: recipes.filter((r) => r.createdAt !== 0) }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `swarmcanvas-anima-recipes-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const toggleParentExpanded = (parent: string) => {
    setExpandedParents((prev) => { const next = new Set(prev); if (next.has(parent)) next.delete(parent); else next.add(parent); return next; });
  };
  const toggleSubExpanded = (parent: string, sub: string) => {
    const key = `${parent}::${sub}`;
    setExpandedSubs((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const selectPath = (path: string) => {
    const [parent, sub] = path.split('::');
    if (path === activePath && parent && parent !== 'All') {
      if (sub) toggleSubExpanded(parent, sub);
      else toggleParentExpanded(parent);
      return;
    }
    setActivePath(path);
    if (source === 'internet') {
      setRemoteSearchMode('category');
      setAllSearch('');
    }
    if (parent && parent !== 'All') setExpandedParents((prev) => new Set(prev).add(parent));
    if (parent && sub) setExpandedSubs((prev) => new Set(prev).add(`${parent}::${sub}`));
  };

  const inspect = (tag: DisplayTag) => { setInspectedTag(tag.label); setShowInspector(true); };
  const browseRelated = () => {
    if (!inspectedDetail) return;
    setViewMode('browse');
    setSource(source === 'curated' ? 'hybrid' : source);
    if (source === 'internet') {
      setRemoteSearchMode('all');
      setAllSearch(inspectedDetail.label);
      setCategorySearch('');
    } else {
      setQuery(inspectedDetail.label);
    }
    setActivePath('All');
  };
  const updateFavoriteFolder = (folder: FavoriteFolder) => {
    if (!inspectedDetail) return;
    const key = normalizeToken(inspectedDetail.label);
    setFavoriteFolders((prev) => ({ ...prev, [key]: folder }));
    setFavorites((prev) => { const next = new Set(prev); next.add(key); return next; });
  };

  const maxLocalPage = Math.max(1, Math.ceil(localPageTotal / LOCAL_PAGE_LIMIT));
    const libraryCountLabel = source === 'curated' ? `${PROMPT_BUILDER_TAG_COUNT.toLocaleString()} curated` : source === 'internet' ? `${remoteTags.length.toLocaleString()} shown · ${remoteTotalCount !== null ? `${remoteTotalCount.toLocaleString()} matching online` : 'live index'}` : `${builderTotal.toLocaleString()} local tags · ${builderPlacementTotal.toLocaleString()} placements`;

  return createPortal(
    <div className={`fixed inset-0 z-[100] ${isStandalonePopup ? 'h-screen w-screen overflow-hidden bg-[var(--sc-surface-0)]' : 'flex items-center justify-center p-3'}`} role="dialog" aria-modal="true" aria-label="Anima Prompt Builder">
      {!isStandalonePopup && <div className="absolute inset-0 bg-black/74 backdrop-blur-sm" onClick={onClose} />}
      <div style={{ zoom: `${builderScale}%` }} className={isStandalonePopup ? 'relative flex h-full w-full flex-col overflow-auto bg-[var(--sc-surface-0)] text-[var(--sc-text)]' : 'relative flex h-[min(94vh,1080px)] w-[min(1540px,98vw)] flex-col overflow-auto rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)] text-[var(--sc-text)] shadow-[0_24px_100px_rgba(0,0,0,.62)] animate-[sc-pop-in_.18s_ease-out]'}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-soft)] bg-[var(--sc-surface-1)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]"><Wand2 className="h-4 w-4" /></span>
                <span>Anima Prompt Builder</span>
                <span className="rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--sc-text-muted)]">{libraryCountLabel}</span>
                <span className="rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--sc-text-muted)]">{sfwFilter === 'all' ? 'Both' : sfwFilter.toUpperCase()}</span>
              </div>
              <div className="mt-1 text-[12px] text-[var(--sc-text-muted)]">Structured browsing, smart prompt assembly, taxonomy switching and live tag lookup.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={profile} onChange={(e) => setProfile(e.target.value as ProfileKey)} className="sc-theme-select h-8 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[13px] outline-none"><option value="base">Qwen 3 0.6B Base</option><option value="qwen35">Qwen 3.5 4B</option></select>
              <div className="flex items-center gap-1.5 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 py-1 sm:flex" title="Prompt Builder UI scale">
                <span className="text-[12px] font-semibold text-[var(--sc-text-dim)]">UI</span>
                <input aria-label="Prompt Builder UI scale" type="range" min={BUILDER_SCALE_MIN} max={BUILDER_SCALE_MAX} step="5" value={builderScale} onChange={(e) => setBuilderScale(Math.min(BUILDER_SCALE_MAX, Math.max(BUILDER_SCALE_MIN, Number(e.target.value))))} className="w-28 accent-amber-500" />
                <span className="w-9 text-right text-[12px] font-mono text-[var(--sc-text-muted)]">{builderScale}%</span>
                <button type="button" onClick={() => setBuilderScale(BUILDER_SCALE_DEFAULT)} className="text-[10px] text-[var(--sc-text-dim)] hover:text-[var(--sc-text)]" title="Reset UI scale">Reset</button>
              </div>
              <button type="button" onClick={() => setShowGuide((v) => !v)} className="sc-icon-button" title="Prompting guide"><BookOpen className="h-4 w-4" /></button>
              <button type="button" onClick={onClose} className="sc-icon-button" title="Close"><X className="h-4 w-4" /></button>
            </div>
          </header>

          {showGuide && <div className="shrink-0 border-b border-[var(--sc-border-soft)] bg-[var(--sc-gold-soft)] px-4 py-3 text-[12px] leading-5 text-[var(--sc-text-secondary)]"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sc-gold-strong)]" /><div><strong className="text-[var(--sc-text)]">{ANIMA_NOTES[profile].label}</strong> · {ANIMA_NOTES[profile].note} <span className="text-[var(--sc-text-dim)]">Encoder: {ANIMA_NOTES[profile].file}</span></div></div></div>}

          <div className="min-h-0 min-w-0 flex-1 grid grid-cols-[minmax(270px,320px)_minmax(0,1fr)_minmax(330px,420px)] overflow-hidden">
            <aside className="min-h-0 min-w-0 overflow-y-auto border-r border-[var(--sc-border-soft)] bg-[var(--sc-surface-1)] p-2.5">
              <section className="sticky top-0 z-20 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)]/98 p-2.5 backdrop-blur">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--sc-text-dim)]" />
                  <input id="anima-builder-search" value={source === 'internet' ? categorySearch : query} onFocus={() => setSearchSuggestionField('primary')} onChange={(e) => source === 'internet' ? (setRemoteSearchMode('category'), setCategorySearch(e.target.value), setAllSearch('')) : setQuery(e.target.value)} placeholder={source === 'internet' ? 'Search selected category…' : 'Search tags, aliases or concepts…'} className="sc-theme-input h-9 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-control-bg)] pl-9 pr-2 text-[13px] outline-none" />
                  {searchSuggestionField === 'primary' && searchSuggestions.length > 0 && <SearchSuggestions items={searchSuggestions} onSelect={(value) => chooseSearchSuggestion('primary', value)} />}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <button type="button" onClick={() => setSfwFilter('sfw')} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${sfwFilter === 'sfw' ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}>SFW</button>
                  <button type="button" onClick={() => setSfwFilter('nsfw')} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${sfwFilter === 'nsfw' ? 'bg-[var(--sc-danger-soft)] text-[var(--sc-danger)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}>NSFW</button>
                  <button type="button" onClick={() => setSfwFilter('all')} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${sfwFilter === 'all' ? 'bg-[var(--sc-info-soft)] text-[var(--sc-info)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}>Both</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => setViewMode('browse')} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${viewMode === 'browse' ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}>Browse</button>
                  <button type="button" onClick={() => setViewMode('build')} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${viewMode === 'build' ? 'bg-[var(--sc-info-soft)] text-[var(--sc-info)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}>Build prompt</button>
                </div>
                <section className="mt-2 rounded-lg border border-[var(--sc-border-soft)] bg-[var(--sc-surface-0)]">
                  <button type="button" onClick={() => setShowLibraryControls((v) => !v)} className="flex w-full items-center justify-between px-2.5 py-2 text-left">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--sc-text-secondary)]"><Settings2 className="h-3 w-3 text-[var(--sc-gold-strong)]" /> Library & filtering</span>
                    {showLibraryControls ? <ChevronDown className="h-3.5 w-3.5 text-[var(--sc-text-dim)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--sc-text-dim)]" />}
                  </button>
                  {showLibraryControls && <div className="border-t border-[var(--sc-border-soft)] p-2">
                    <label className="block text-[12px] font-semibold uppercase tracking-[.11em] text-[var(--sc-text-dim)]">Library source</label>
                    <select value={source} onChange={(e) => { const nextSource = e.target.value as SourceMode; setSource(nextSource); setActivePath('All'); setQuery(''); setCategorySearch(''); setAllSearch(''); setRemoteSearchMode('category'); if (nextSource === 'internet') setTaxonomy('danbooru_groups'); }} className="sc-theme-select mt-1 h-8 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[13px] outline-none">{SOURCE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                    <div className="mt-1 text-[10px] leading-4 text-[var(--sc-text-dim)]">{SOURCE_OPTIONS.find((option) => option.id === source)?.description}</div>
                    <label className="mt-2 block text-[12px] font-semibold uppercase tracking-[.11em] text-[var(--sc-text-dim)]">Taxonomy</label>
                    <select value={taxonomy} onChange={(e) => { setTaxonomy(e.target.value as BuilderTaxonomyId); setActivePath('All'); }} disabled={source === 'curated' || source === 'internet'} className="sc-theme-select mt-1 h-8 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[13px] outline-none disabled:opacity-50">{BUILDER_TAXONOMIES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                    <div className="mt-1 text-[10px] leading-4 text-[var(--sc-text-dim)]">{BUILDER_TAXONOMIES.find((option) => option.id === taxonomy)?.description}</div>
                    <div className="mt-1 text-[10px] leading-4 text-[var(--sc-text-dim)]">Internet mode uses a local Anima classification layer over live Danbooru tags. Categories are loaded on demand; Danbooru's native category is retained as metadata.</div>
                    {activePath === '__favorites__' && <select value={favoriteFolderFilter} onChange={(e) => setFavoriteFolderFilter(e.target.value as 'All' | FavoriteFolder)} className="sc-theme-select mt-2 h-7 w-full rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[11px] outline-none"><option value="All">All favorite folders</option>{FAVORITE_FOLDERS.map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select>}
                  </div>}
                </section>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => selectPath('__favorites__')} className={`rounded-lg px-2 py-2 text-left text-[13px] font-semibold ${activePath === '__favorites__' ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}><Star className="mr-1 inline h-3 w-3" /> Favorites <span className="float-right">{favorites.size}</span></button>
                  <button type="button" onClick={() => selectPath('__builder__')} className={`rounded-lg px-2 py-2 text-left text-[13px] font-semibold ${activePath === '__builder__' ? 'bg-[var(--sc-info-soft)] text-[var(--sc-info)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-muted)]'}`}><Layers3 className="mr-1 inline h-3 w-3" /> Builder tags <span className="float-right">{currentTokens.length}</span></button>
                </div>
              </section>

              <div className="mt-2 flex items-center justify-between rounded-lg border border-[var(--sc-border-soft)] bg-[var(--sc-surface-0)] px-2.5 py-1.5">
                <button type="button" onClick={() => selectPath('All')} className={`text-left text-[13px] font-semibold ${activePath === 'All' ? 'text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-secondary)]'}`}>All categories</button>
                <button type="button" onClick={() => { setExpandedParents(new Set()); setExpandedSubs(new Set()); }} className="text-[10px] text-[var(--sc-text-dim)] hover:text-[var(--sc-text)]">Collapse all</button>
              </div>

              <div className="mt-2 space-y-1">
                {groupTree.map((parent) => {
                  const parentExpanded = expandedParents.has(parent.parent);
                  const parentSelected = activePath === parent.parent || activePath.startsWith(`${parent.parent}::`);
                  return <div key={parent.parent} className="rounded-lg border border-[var(--sc-border-soft)] bg-[var(--sc-surface-0)]">
                    <div className={`flex items-center rounded-lg ${parentSelected ? 'bg-[var(--sc-gold-soft)]/50' : ''}`}>
                      <button type="button" onClick={() => toggleParentExpanded(parent.parent)} className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--sc-text-dim)] hover:text-[var(--sc-text)]" aria-label={parentExpanded ? `Collapse ${parent.label}` : `Expand ${parent.label}`}>{parentExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                      <button type="button" onClick={() => selectPath(parent.parent)} className={`min-w-0 flex-1 px-1 py-2 text-left ${parentSelected ? 'text-[var(--sc-text)]' : 'text-[var(--sc-text-secondary)]'}`}><span className="block truncate text-[12px] font-semibold">{parent.label}</span></button>
                      <span className="pr-2 text-[12px] text-[var(--sc-text-dim)]">{parent.countKnown === false ? '—' : parent.count.toLocaleString()}</span>
                    </div>
                    {parentExpanded && <div className="border-t border-[var(--sc-border-soft)] px-1.5 pb-1.5">
                      <button type="button" onClick={() => selectPath(parent.parent)} className={`mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] ${activePath === parent.parent ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-muted)] hover:bg-[var(--sc-surface-2)]'}`}><span>All {parent.label}</span><span>{parent.countKnown === false ? '—' : parent.count.toLocaleString()}</span></button>
                      {parent.subs.map((sub) => {
                        const subKey = `${parent.parent}::${sub.sub}`;
                        const subExpanded = expandedSubs.has(subKey);
                        const subSelected = activePath === subKey || activePath.startsWith(`${subKey}::`);
                        return <div key={subKey} className="mt-0.5">
                          <div className={`flex items-center rounded-md ${subSelected ? 'bg-[var(--sc-surface-3)]' : ''}`}>
                            {sub.leaves.length > 0 ? <button type="button" onClick={() => toggleSubExpanded(parent.parent, sub.sub)} className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--sc-text-dim)] hover:text-[var(--sc-text)]" aria-label={subExpanded ? `Collapse ${sub.sub}` : `Expand ${sub.sub}`}>{subExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button> : <span className="w-7 shrink-0" />}
                            <button type="button" onClick={() => selectPath(subKey)} className="min-w-0 flex-1 px-1 py-1.5 text-left"><span className="block truncate text-[11px] text-[var(--sc-text-muted)]">{sub.sub}</span></button>
                            <span className="pr-2 text-[10px] text-[var(--sc-text-dim)]">{sub.countKnown === false ? '—' : sub.count.toLocaleString()}</span>
                          </div>
                          {subExpanded && sub.leaves.length > 0 && <div className="ml-3 border-l border-[var(--sc-border-soft)] pl-1.5">{[...sub.leaves].sort((a, b) => b.count - a.count).map((leaf) => { const leafKey = `${subKey}::${leaf.leaf}`; return <button key={leafKey} type="button" onClick={() => selectPath(leafKey)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] ${activePath === leafKey ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-dim)] hover:bg-[var(--sc-surface-2)]'}`}><span className="truncate">{leaf.leaf}</span><span>{leaf.count.toLocaleString()}</span></button>; })}</div>}
                        </div>;
                      })}
                    </div>}
                  </div>;
                })}
              </div>

              {source === 'internet' && !query.trim() && <div className="mt-3 rounded-lg border border-dashed border-[var(--sc-border)] p-3 text-[12px] leading-5 text-[var(--sc-text-dim)]">Internet mode queries Danbooru on demand. Search is fast and paginated; it does not download the entire tag database just to open the builder.</div>}
              {loadingLibrary && <div className="mt-2 flex items-center gap-2 px-2 text-[12px] text-[var(--sc-text-dim)]"><RefreshCw className="h-3 w-3 animate-spin" /> {source === 'internet' ? 'Searching Danbooru…' : 'Loading tag index…'}</div>}
              {libraryError && <div className="mt-2 rounded-lg border border-[var(--sc-danger)]/30 bg-[var(--sc-danger-soft)] p-2 text-[11px] text-[var(--sc-danger)]">{libraryError}</div>}
            </aside>

            <main className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[var(--sc-bg)] p-3">
              <section className="mb-3 rounded-xl border border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)]/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--sc-text)]"><Copy className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Builder-only prompt drafts</div>
                    <div className="mt-1 text-[11px] leading-4 text-[var(--sc-text-muted)]">These are private composition boxes for the Anima Prompt Builder. They never update Prompt Pills, never replace generation prompts, and never trigger generation. Copy the final text and paste it into Prompt Pills when you are ready to generate.</div>
                  </div>
                  <button type="button" onClick={() => { setBuilderPositivePrompt(''); setBuilderNegativePrompt(''); }} className="sc-builder-action"><Trash2 className="h-3 w-3" /> Clear both</button>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <BuilderPromptDraftBox title="Positive prompt" tone="positive" value={builderPositivePrompt} onChange={setBuilderPositivePrompt} tokens={tokenize(builderPositivePrompt)} onMove={(index, direction) => moveBuilderToken('positive', index, direction)} onRemove={(index) => removeBuilderToken('positive', index)} onCopy={() => copyBuilderDraft('Positive prompt', builderPositivePrompt)} />
                  <BuilderPromptDraftBox title="Negative prompt" tone="negative" value={builderNegativePrompt} onChange={setBuilderNegativePrompt} tokens={tokenize(builderNegativePrompt)} onMove={(index, direction) => moveBuilderToken('negative', index, direction)} onRemove={(index) => removeBuilderToken('negative', index)} onCopy={() => copyBuilderDraft('Negative prompt', builderNegativePrompt)} />
                </div>
              </section>

              {viewMode === 'build' ? <BuildMode currentTokens={currentTokens} target={target} setTarget={setTarget} onRemove={toggleTag} onMove={moveCurrentToken} orderMode={orderMode} setOrderMode={setOrderMode} onOrganize={organizeCurrentPrompt} diagnostics={currentDiagnostics} /> : <>
                <div className="mb-3 grid gap-2 sm:grid-cols-4">
                  <Stat label="Current draft tags" value={String(currentTokens.length)} />
                  <Stat label="Library" value={libraryCountLabel} />
                  <Stat label="Duplicates" value={currentDiagnostics.filter((x) => x.code === 'duplicate').length ? `${currentDiagnostics.filter((x) => x.code === 'duplicate').length}` : 'Clean'} tone={currentDiagnostics.some((x) => x.severity === 'warning') ? 'warning' : 'success'} />
                  <Stat label="Source" value={SOURCE_OPTIONS.find((o) => o.id === source)?.label || source} />
                </div>

                <section className="mb-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)]">
                  <button type="button" onClick={() => setShowBuilderControls((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                    <span><span className="text-[13px] font-semibold">Builder controls</span><span className="ml-2 text-[12px] text-[var(--sc-text-dim)]">Work on copy-only drafts</span></span>
                    {showBuilderControls ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  {showBuilderControls && <div className="border-t border-[var(--sc-border-soft)] p-3">
                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-0)] p-1"><button type="button" onClick={() => setTarget('positive')} className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${target === 'positive' ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-muted)]'}`}>Positive</button><button type="button" onClick={() => setTarget('negative')} className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${target === 'negative' ? 'bg-[var(--sc-danger-soft)] text-[var(--sc-danger)]' : 'text-[var(--sc-text-muted)]'}`}>Negative</button><span className="mx-1 h-5 w-px bg-[var(--sc-border)]" /><button type="button" onClick={() => setMode('add')} className={`sc-builder-action ${mode === 'add' ? 'border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)]' : ''}`}><Plus className="h-3 w-3" /> Add</button><button type="button" onClick={() => setMode('replace')} className={`sc-builder-action ${mode === 'replace' ? 'border-[var(--sc-info)] bg-[var(--sc-info-soft)]' : ''}`}><RotateCcw className="h-3 w-3" /> Replace</button></div>
                    <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={insertRecommendedQuality} className="sc-builder-action"><Sparkles className="h-3 w-3" /> Recommended quality</button><button type="button" onClick={insertRecommendedNegative} className="sc-builder-action"><Shield className="h-3 w-3" /> Recommended negative</button><button type="button" onClick={smartRandomize} className="sc-builder-action"><Dices className="h-3 w-3" /> Smart randomize</button><button type="button" onClick={removeDuplicatesCurrent} className="sc-builder-action"><Eraser className="h-3 w-3" /> Deduplicate</button><button type="button" onClick={normalizeCurrent} className="sc-builder-action"><Check className="h-3 w-3" /> Normalize</button><select value={orderMode} onChange={(e) => setOrderMode(e.target.value as OrderMode)} className="sc-theme-select h-7 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[11px] outline-none"><option value="anima">Order: Anima</option><option value="semantic">Order: Semantic</option><option value="taxonomy">Order: Taxonomy</option><option value="manual">Order: Manual</option></select><button type="button" onClick={organizeCurrentPrompt} className="sc-builder-action"><Layers3 className="h-3 w-3" /> Organize</button></div>
                  </div>}
                </section>

                {source === 'internet' && <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-1)] px-3 py-2 text-[11px]"><span className="text-[var(--sc-text-muted)]">Live Danbooru · category-aware, on-demand search.</span><a className="inline-flex items-center gap-1 text-[var(--sc-info)] hover:underline" href="https://danbooru.donmai.us/" target="_blank" rel="noreferrer">Open Danbooru <ExternalLink className="h-3 w-3" /></a></div>}

                <section className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)]">
                  {source === 'internet' && <div className="border-b border-[var(--sc-border-soft)] p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--sc-text-dim)]" /><input value={allSearch} onFocus={() => setSearchSuggestionField('all')} onChange={(e) => { setRemoteSearchMode('all'); setAllSearch(e.target.value); setCategorySearch(''); setRemotePage(1); }} placeholder="Search all Danbooru tags…" className="sc-theme-input h-9 w-full rounded-lg border border-[var(--sc-border)] bg-[var(--sc-control-bg)] pl-9 pr-2 text-[13px] outline-none" />{searchSuggestionField === 'all' && searchSuggestions.length > 0 && <SearchSuggestions items={searchSuggestions} onSelect={(value) => chooseSearchSuggestion('all', value)} />}</div><div className="mt-1 text-[10px] text-[var(--sc-text-dim)]">Searches the live Danbooru index independently of the selected category. Suggestions use the same session cache as tag browsing.</div></div>}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-border-soft)] px-3 py-2.5"><div><div className="text-[13px] font-semibold">{activePath === '__favorites__' ? 'Favorite tags' : activePath === '__builder__' ? 'Builder draft tags' : source === 'curated' ? 'Curated Anima tags' : activePath === 'All' ? 'All tags' : activePath.split('::').join(' / ')}</div><div className="text-[11px] text-[var(--sc-text-muted)]">Click a tag to add/remove it from the selected builder draft. The draft boxes above are the only prompt text controlled here. Click the info icon for taxonomy, confidence, aliases, related data and source details.</div></div><div className="flex items-center gap-2"><select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="sc-theme-select h-7 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[11px] outline-none"><option value="popularity">Popular</option><option value="alphabetical">A–Z</option></select><span className="rounded-full border border-[var(--sc-border)] px-2 py-0.5 text-[12px] text-[var(--sc-text-dim)]">{activeTags.length} shown</span></div></div>
                  {activeTags.length === 0 ? <div className="p-10 text-center text-[12px] text-[var(--sc-text-dim)]">{source === 'internet' ? 'No live matches returned.' : 'No tags in this view.'}</div> : <div key={`${source}|${taxonomy}|${activePath}|${query}|${categorySearch}|${allSearch}|${remoteSearchMode}|${localPage}|${remotePage}|${sfwFilter}|${sort}`} className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">{activeTags.map((tag) => <TagCard key={tag.id} tag={tag} selected={selectedSet.has(normalizeToken(tag.label))} favorite={favorites.has(normalizeToken(tag.label))} onToggle={() => toggleTag(tag.label)} onFavorite={() => toggleFavorite(tag)} onInspect={() => inspect(tag)} />)}</div>}
                </section>

                {source !== 'curated' && source !== 'internet' && maxLocalPage > 1 && activePath !== '__favorites__' && activePath !== '__builder__' && <div className="mt-2 flex items-center justify-between rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-2"><span className="text-[12px] text-[var(--sc-text-dim)]">Page {localPage} / {maxLocalPage} · {localPageTotal.toLocaleString()} matching tags</span><div className="flex gap-1"><button type="button" className="sc-builder-action" disabled={localPage <= 1} onClick={() => setLocalPage((p) => Math.max(1, p - 1))}><ArrowUp className="h-3 w-3 -rotate-90" /> Previous</button><button type="button" className="sc-builder-action" disabled={localPage >= maxLocalPage} onClick={() => setLocalPage((p) => Math.min(maxLocalPage, p + 1))}>Next 1,000 <ArrowDown className="h-3 w-3 -rotate-90" /></button></div></div>}
                {source === 'internet' && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-2"><span className="text-[12px] text-[var(--sc-text-dim)]">Page {remotePage}{remoteTotalCount !== null ? ` / ${Math.max(1, Math.ceil(remoteTotalCount / REMOTE_PAGE_LIMIT)).toLocaleString()}` : ''} · {remoteTags.length.toLocaleString()} shown · live index</span><div className="flex gap-1"><button type="button" className="sc-builder-action" disabled={remotePage <= 1} onClick={() => setRemotePage((p) => Math.max(1, p - 1))}><ArrowUp className="h-3 w-3 -rotate-90" /> Previous</button><button type="button" className="sc-builder-action" disabled={!remoteHasMore} onClick={() => setRemotePage((p) => p + 1)}>Next <ArrowDown className="h-3 w-3 -rotate-90" /></button></div></div>}

                <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)]"><button type="button" onClick={() => setShowSuggestions((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Context-aware suggestions</span>{showSuggestions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showSuggestions && <div className="border-t border-[var(--sc-border-soft)] p-2.5"><div className="mb-2 text-[11px] text-[var(--sc-text-muted)]">Non-destructive suggestions inferred from the current tag stack.</div><div className="flex flex-wrap gap-1.5">{suggestions.length ? suggestions.map((tag) => <button key={`suggest-${tag}`} type="button" onClick={() => toggleTag(tag)} className="rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2.5 py-1 text-[11px] text-[var(--sc-text-secondary)] hover:border-[var(--sc-theme-border)] hover:text-[var(--sc-text)]">+ {tag}</button>) : <span className="text-[12px] text-[var(--sc-text-dim)]">Add a subject, pose, camera or environment tag to unlock suggestions.</span>}</div></div>}</section>

                <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)]"><button type="button" onClick={() => setShowRecipePanel((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-[13px] font-semibold"><BookOpen className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Recipes</span>{showRecipePanel ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showRecipePanel && <div className="border-t border-[var(--sc-border-soft)] p-2"><div className="mb-2 flex items-center gap-2"><span className="text-[12px] text-[var(--sc-text-dim)]">Save folder</span><select value={recipeFolder} onChange={(e) => setRecipeFolder(e.target.value as FavoriteFolder)} className="sc-theme-select h-7 flex-1 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[11px] outline-none">{FAVORITE_FOLDERS.map((folder) => <option key={folder}>{folder}</option>)}</select></div><div className="grid gap-2 sm:grid-cols-2">{recipes.map((recipe) => <div key={recipe.id} className={`rounded-lg border p-2 ${activePreset === recipe.id ? 'border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)]' : 'border-[var(--sc-border)] bg-[var(--sc-surface-2)]'}`}><div className="flex items-center gap-2"><button type="button" onClick={() => applyRecipe(recipe)} className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-[var(--sc-text)]">{recipe.name}</button><span className="rounded-full bg-[var(--sc-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--sc-text-dim)]">{recipe.folder}</span>{recipe.createdAt !== 0 && <button type="button" onClick={() => deleteRecipe(recipe.id)} className="p-1 text-[var(--sc-text-dim)] hover:text-[var(--sc-danger)]"><Trash2 className="h-3 w-3" /></button>}</div><div className="mt-1 truncate text-[11px] text-[var(--sc-text-muted)]">{recipe.positive}</div></div>)}</div></div>}</section>
              </>}
            </main>

            <aside className="min-h-0 overflow-y-auto border-l border-[var(--sc-border-soft)] bg-[var(--sc-surface-1)] p-3">
              <section className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]">
                <button type="button" onClick={() => setShowInspector((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-[13px] font-semibold"><Info className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Tag Inspector</span>{showInspector ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                {showInspector && <div className="border-t border-[var(--sc-border-soft)] p-2.5">{inspectedDetail ? <>
                  <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="break-words text-[12px] font-semibold text-[var(--sc-text)]">{inspectedDetail.label}</div><div className="mt-1 flex flex-wrap gap-1"><Badge>{inspectedDetail.origin || 'unknown'}</Badge><Badge tone={inspectedDetail.isNsfw ? 'danger' : 'success'}>{inspectedDetail.isNsfw ? 'NSFW' : 'SFW'}</Badge>{typeof inspectedDetail.postCount === 'number' && <Badge>{inspectedDetail.postCount.toLocaleString()} posts</Badge>}</div></div><button type="button" onClick={() => toggleTag(inspectedDetail.label)} className="sc-builder-action">{selectedSet.has(normalizeToken(inspectedDetail.label)) ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{selectedSet.has(normalizeToken(inspectedDetail.label)) ? 'Remove' : 'Add'}</button></div>
                  <div className="mt-3 space-y-2 text-[11px]"><InspectorRow label="Path" value={inspectedDetail.path.join(' / ')} /><InspectorRow label="Native type" value={inspectedDetail.nativeCategory || 'Unknown'} /><InspectorRow label="Wiki group" value={inspectedDetail.wikiCategory || 'Not available'} />{typeof inspectedDetail.classificationConfidence === 'number' && <InspectorRow label="Confidence" value={`${Math.round(inspectedDetail.classificationConfidence * 100)}%`} />}{inspectedDetail.classificationSources?.length ? <InspectorRow label="Classifier" value={inspectedDetail.classificationSources.join(', ')} /> : null}</div>
                  {inspectedDetail.description && <div className="mt-3 rounded-lg bg-[var(--sc-surface-2)] p-2 text-[12px] leading-5 text-[var(--sc-text-muted)]">{inspectedDetail.description}</div>}
                  {inspectedDetail.wikiNames?.length ? <div className="mt-2 text-[12px] text-[var(--sc-text-dim)]">Aliases: {inspectedDetail.wikiNames.join(', ')}</div> : null}
                  {inspectedDetail.wikiBody && <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-[var(--sc-surface-2)] p-2 text-[12px] leading-5 text-[var(--sc-text-muted)]">{stripHtml(inspectedDetail.wikiBody)}</div>}
                  <div className="mt-3 grid grid-cols-2 gap-1"><button type="button" onClick={browseRelated} className="sc-builder-action justify-center"><Search className="h-3 w-3" /> Related</button><button type="button" onClick={() => toggleFavorite(inspectedDetail)} className="sc-builder-action justify-center"><Star className="h-3 w-3" /> {favorites.has(normalizeToken(inspectedDetail.label)) ? 'Unfavorite' : 'Favorite'}</button></div>
                  <div className="mt-2 grid grid-cols-2 gap-1"><select value={favoriteFolders[normalizeToken(inspectedDetail.label)] || classifyFolder(inspectedDetail.label, Boolean(inspectedDetail.isNsfw))} onChange={(e) => updateFavoriteFolder(e.target.value as FavoriteFolder)} className="sc-theme-select h-7 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[10px] outline-none"><option value="General">Folder: General</option>{FAVORITE_FOLDERS.filter((f) => f !== 'General').map((folder) => <option key={folder} value={folder}>Folder: {folder}</option>)}</select>{inspectedDetail.remote ? <a className="sc-builder-action justify-center" href={danbooru.getRemoteTagUrl(inspectedDetail.label)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Danbooru</a> : <button type="button" onClick={browseRelated} className="sc-builder-action justify-center"><Search className="h-3 w-3" /> Explore</button>}</div>
                </> : <div className="py-5 text-center text-[12px] text-[var(--sc-text-dim)]">Select the info button on a tag card to inspect it.</div>}</div>}
              </section>

              <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><button type="button" onClick={() => setShowSelectedPanel((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-[13px] font-semibold"><Layers3 className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Builder order · {target}</span>{showSelectedPanel ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showSelectedPanel && <div className="border-t border-[var(--sc-border-soft)] p-2"><div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">{currentTokens.length ? currentTokens.map((token, index) => <div key={`${token}-${index}`} className="group flex items-center gap-1 rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] pl-2 text-[11px] text-[var(--sc-text-secondary)]"><button type="button" onClick={() => inspect({ id: `selected:${token}`, label: token, section: 'selected', path: [], origin: 'curated' })} className="max-w-40 truncate py-1 text-left hover:text-[var(--sc-text)]">{token}</button><button type="button" onClick={() => moveCurrentToken(index, -1)} disabled={index === 0} className="rounded p-1 text-[var(--sc-text-dim)] disabled:opacity-20"><ArrowUp className="h-2.5 w-2.5" /></button><button type="button" onClick={() => moveCurrentToken(index, 1)} disabled={index === currentTokens.length - 1} className="rounded p-1 text-[var(--sc-text-dim)] disabled:opacity-20"><ArrowDown className="h-2.5 w-2.5" /></button><button type="button" onClick={() => toggleTag(token)} className="rounded-r-full p-1 text-[var(--sc-text-dim)] hover:text-[var(--sc-danger)]"><X className="h-2.5 w-2.5" /></button></div>) : <span className="w-full py-5 text-center text-[12px] text-[var(--sc-text-dim)]">No tags yet.</span>}</div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" onClick={normalizeCurrent} className="sc-builder-action justify-center"><RotateCcw className="h-3 w-3" /> Normalize</button><button type="button" onClick={removeDuplicatesCurrent} className="sc-builder-action justify-center"><Check className="h-3 w-3" /> De-duplicate</button><button type="button" onClick={organizeCurrentPrompt} className="sc-builder-action justify-center"><Layers3 className="h-3 w-3" /> Organize</button><button type="button" onClick={clearTarget} className="sc-builder-action justify-center"><Eraser className="h-3 w-3" /> Clear target</button></div></div>}</section>

              <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><button type="button" onClick={() => setShowCustomTag((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="text-[13px] font-semibold">Custom tag</span>{showCustomTag ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showCustomTag && <div className="border-t border-[var(--sc-border-soft)] p-2"><div className="flex gap-1.5"><input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustomTag(); }} placeholder="custom tag or phrase" className="sc-theme-input min-w-0 flex-1 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-control-bg)] px-2 py-1.5 text-[13px] outline-none" /><button type="button" onClick={addCustomTag} className="sc-icon-button"><Plus className="h-3.5 w-3.5" /></button></div></div>}</section>

              <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><button type="button" onClick={() => setShowPromptActions((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="text-[13px] font-semibold">Prompt actions</span>{showPromptActions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showPromptActions && <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--sc-border-soft)] p-2"><button type="button" onClick={saveRecipe} className="sc-builder-action justify-center"><Heart className="h-3 w-3" /> Save recipe</button><button type="button" onClick={exportRecipes} className="sc-builder-action justify-center"><Download className="h-3 w-3" /> Export</button><button type="button" onClick={() => navigator.clipboard?.writeText(currentPrompt).catch(() => {})} className="sc-builder-action justify-center"><Copy className="h-3 w-3" /> Copy active draft</button><button type="button" onClick={() => { setBuilderPositivePrompt(''); setBuilderNegativePrompt(''); }} className="sc-builder-action justify-center"><Trash2 className="h-3 w-3" /> Clear both</button></div>}</section>

              <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><button type="button" onClick={() => setShowDiagnostics((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="flex items-center gap-2 text-[13px] font-semibold"><Settings2 className="h-3.5 w-3.5 text-[var(--sc-gold-strong)]" /> Prompt diagnostics</span>{showDiagnostics ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showDiagnostics && <div className="border-t border-[var(--sc-border-soft)] p-2.5">{currentDiagnostics.length ? <div className="space-y-1.5">{currentDiagnostics.map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded-lg border p-2 text-[11px] ${issue.severity === 'warning' ? 'border-[var(--sc-warning)]/30 bg-[var(--sc-warning-soft)] text-[var(--sc-warning)]' : 'border-[var(--sc-info)]/30 bg-[var(--sc-info-soft)] text-[var(--sc-info)]'}`}><strong>{issue.title}</strong><div className="mt-0.5">{issue.detail}</div></div>)}</div> : <div className="py-3 text-center text-[12px] text-[var(--sc-text-dim)]">No obvious conflicts or duplicate tags.</div>}<div className="mt-2 text-[10px] leading-4 text-[var(--sc-text-dim)]">Diagnostics are advisory. They never block prompt insertion.</div></div>}</section>

              <section className="mt-3 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><button type="button" onClick={() => setShowLibraryHealth((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left"><span className="text-[13px] font-semibold">Library health</span>{showLibraryHealth ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{showLibraryHealth && <div className="border-t border-[var(--sc-border-soft)]"><div className="grid grid-cols-2 gap-1.5 p-2 text-[11px]"><div className="col-span-2 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Local snapshot</div><div className="mt-1 font-semibold">{(builderHealth?.uniqueTags ?? builderTotal).toLocaleString()} indexed tags</div><div className="mt-1 text-[10px] leading-4 text-[var(--sc-text-dim)]">This is the bundled snapshot, not the live Danbooru total. Internet mode searches the current live index on demand.</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">General</div><div className="mt-1 font-semibold">{builderHealth?.nativeCounts?.General?.toLocaleString?.() ?? '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Character</div><div className="mt-1 font-semibold">{builderHealth?.nativeCounts?.Character?.toLocaleString?.() ?? '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Artist</div><div className="mt-1 font-semibold">{builderHealth?.nativeCounts?.Artist?.toLocaleString?.() ?? '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Copyright</div><div className="mt-1 font-semibold">{builderHealth?.nativeCounts?.Copyright?.toLocaleString?.() ?? '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Meta</div><div className="mt-1 font-semibold">{builderHealth?.nativeCounts?.Meta?.toLocaleString?.() ?? '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">NSFW tags</div><div className="mt-1 font-semibold">{builderHealth ? builderHealth.nsfwTags.toLocaleString() : '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Semantic placements</div><div className="mt-1 font-semibold">{builderHealth ? builderHealth.semanticPlacements.toLocaleString() : '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Multi-placement</div><div className="mt-1 font-semibold">{builderHealth ? builderHealth.multiPlacement.toLocaleString() : '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Low confidence</div><div className="mt-1 font-semibold">{builderHealth ? builderHealth.lowConfidence.toLocaleString() : '—'}</div></div><div className="rounded-md bg-[var(--sc-surface-2)] p-2"><div className="text-[10px] text-[var(--sc-text-dim)]">Taxonomy</div><div className="mt-1 truncate font-semibold">{BUILDER_TAXONOMIES.find((x) => x.id === taxonomy)?.label}</div></div></div></div>}</section>
            </aside>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--sc-border-soft)] bg-[var(--sc-surface-1)] px-4 py-2.5"><div className="text-[12px] text-[var(--sc-text-dim)]">/ focuses search · Ctrl/Cmd+Enter closes · builder drafts are copy-only and never change generation · SFW/NSFW can be combined with <strong>Both</strong>.</div><div className="flex items-center gap-2"><button type="button" onClick={() => { setBuilderPositivePrompt(normalizeAnimaPrompt(builderPositivePrompt)); setBuilderNegativePrompt(normalizeAnimaPrompt(builderNegativePrompt)); emitToast('Both builder drafts normalized for Anima', 'success'); }} className="sc-builder-action"><RotateCcw className="h-3 w-3" /> Normalize both</button><button type="button" onClick={onClose} className="rounded-lg bg-[var(--sc-gold)] px-3 py-1.5 text-[12px] font-semibold text-black shadow-sm transition hover:bg-[var(--sc-gold-strong)]">Done</button></div></footer>
        </div>
      </div>
    </div>,
    document.body,
  );
};

function SearchSuggestions({ items, onSelect }: { items: BuilderSearchSuggestion[]; onSelect: (value: string) => void }) {
  return <div className="absolute left-0 right-0 top-10 z-[70] max-h-72 overflow-y-auto rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface-2)] shadow-2xl">
    {items.map((item) => <button key={`${item.origin || 'tag'}:${item.label}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect(item.label)} className="flex w-full items-center justify-between gap-3 border-b border-[var(--sc-border-soft)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--sc-gold-soft)]">
      <span className="min-w-0 truncate text-[12px] text-[var(--sc-text)]">{item.label.replace(/_/g, ' ')}</span>
      <span className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--sc-text-dim)]">{item.category && <span className="max-w-32 truncate">{item.category}</span>}{typeof item.count === 'number' && <span className="tabular-nums">{item.count.toLocaleString()}</span>}</span>
    </button>)}
  </div>;
}

function BuilderPromptDraftBox({
  title,
  tone,
  value,
  onChange,
  tokens,
  onMove,
  onRemove,
  onCopy,
}: {
  title: string;
  tone: 'positive' | 'negative';
  value: string;
  onChange: (value: string) => void;
  tokens: string[];
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onCopy: () => void;
}) {
  const isNegative = tone === 'negative';
  return <div className={`rounded-xl border p-2.5 ${isNegative ? 'border-[var(--sc-danger)]/30 bg-[var(--sc-danger-soft)]/25' : 'border-[var(--sc-theme-border)] bg-[var(--sc-surface-1)]'}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-[var(--sc-text)]">{title}</div>
        <div className="mt-0.5 text-[10px] text-[var(--sc-text-dim)]">{tokens.length.toLocaleString()} tags · builder only</div>
      </div>
      <button type="button" onClick={onCopy} className="sc-builder-action shrink-0"><Copy className="h-3 w-3" /> Copy</button>
    </div>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} placeholder={isNegative ? 'worst quality, low quality, bad anatomy…' : 'masterpiece, best quality, 1girl, ...'} className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[var(--sc-border)] bg-[var(--sc-control-bg)] px-2.5 py-2 text-[13px] leading-5 text-[var(--sc-text)] outline-none focus:border-[var(--sc-theme-border)]" />
    <div className="mt-2 rounded-lg border border-[var(--sc-border-soft)] bg-[var(--sc-surface-0)] p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-[var(--sc-text-dim)]"><span>Reorder tags</span><span>↑ / ↓</span></div>
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {tokens.length ? tokens.map((token, index) => <div key={`${token}-${index}`} className="flex max-w-full items-center gap-0.5 rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] pl-2 text-[10px] text-[var(--sc-text-secondary)]">
          <span className="max-w-40 truncate py-1">{token}</span>
          <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} title="Move up" className="rounded p-1 text-[var(--sc-text-dim)] disabled:opacity-20 hover:text-[var(--sc-text)]"><ArrowUp className="h-2.5 w-2.5" /></button>
          <button type="button" onClick={() => onMove(index, 1)} disabled={index === tokens.length - 1} title="Move down" className="rounded p-1 text-[var(--sc-text-dim)] disabled:opacity-20 hover:text-[var(--sc-text)]"><ArrowDown className="h-2.5 w-2.5" /></button>
          <button type="button" onClick={() => onRemove(index)} title="Remove tag" className="rounded-r-full p-1 text-[var(--sc-text-dim)] hover:text-[var(--sc-danger)]"><X className="h-2.5 w-2.5" /></button>
        </div>) : <span className="py-2 text-[10px] text-[var(--sc-text-dim)]">Select tags above to build this prompt.</span>}
      </div>
    </div>
  </div>;
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' | 'success' }) {
  return <div className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-2.5"><div className="text-[10px] uppercase tracking-[.12em] text-[var(--sc-text-dim)]">{label}</div><div className={`mt-1 truncate text-sm font-semibold ${tone === 'warning' ? 'text-[var(--sc-warning)]' : tone === 'success' ? 'text-[var(--sc-success)]' : 'text-[var(--sc-text)]'}`}>{value}</div></div>;
}

function Badge({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'danger' | 'success' }) {
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${tone === 'danger' ? 'border-[var(--sc-danger)]/30 bg-[var(--sc-danger-soft)] text-[var(--sc-danger)]' : tone === 'success' ? 'border-[var(--sc-success)]/30 bg-[var(--sc-success-soft)] text-[var(--sc-success)]' : 'border-[var(--sc-border)] bg-[var(--sc-surface-2)] text-[var(--sc-text-dim)]'}`}>{children}</span>;
}

function InspectorRow({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><span className="text-[var(--sc-text-dim)]">{label}</span><span className="break-words text-[var(--sc-text-secondary)]">{value}</span></div>; }

function TagCard({ tag, selected, favorite, onToggle, onFavorite, onInspect }: { tag: DisplayTag; selected: boolean; favorite: boolean; onToggle: () => void; onFavorite: () => void; onInspect: () => void }) {
  return <div className={`group relative flex min-h-12 items-stretch overflow-hidden rounded-md border transition-colors ${selected ? 'border-[var(--sc-theme-border)] bg-[var(--sc-gold-soft)]' : tag.isNsfw ? 'border-[var(--sc-danger)]/25 bg-[var(--sc-surface-2)]' : 'border-[var(--sc-border)] bg-[var(--sc-surface-2)] hover:border-[var(--sc-border-strong)] hover:bg-[var(--sc-surface-3)]'}`}>
    <button type="button" onClick={onToggle} className="min-w-0 flex-1 px-2.5 py-2 text-left" title={tag.origin === 'internet' ? `${tag.label} · ${typeof tag.postCount === 'number' ? `${tag.postCount.toLocaleString()} posts` : 'post count unavailable'}` : (tag.description || `Add ${tag.label}`)}>
      <span className={`block truncate text-[12px] ${selected ? 'font-semibold text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text)]'}`}>{tag.label}</span>
      {typeof tag.postCount === 'number' && <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--sc-text-dim)]">{tag.postCount.toLocaleString()} posts</span>}
    </button>
    <div className="flex shrink-0 items-center pr-1">
      <button type="button" onClick={onInspect} className="rounded p-1.5 text-[var(--sc-text-dim)] transition hover:bg-[var(--sc-surface-3)] hover:text-[var(--sc-info)]" title="Inspect tag details"><Info className="h-3 w-3" /></button>
      <button type="button" onClick={onFavorite} className={`rounded p-1.5 transition hover:bg-[var(--sc-surface-3)] ${favorite ? 'text-[var(--sc-gold-strong)]' : 'text-[var(--sc-text-dim)] hover:text-[var(--sc-gold-strong)]'}`} title={favorite ? 'Remove favorite' : 'Favorite tag'}><Star className={`h-3 w-3 ${favorite ? 'fill-current' : ''}`} /></button>
    </div>
  </div>;
}

type CuratedTreeSub = { sub: string; count: number; leaves: Array<{ leaf: string; count: number }> };

function buildCuratedTree(tags: PromptBuilderTag[]): CuratedTreeSub[] {
  const map = new Map<string, Map<string, number>>();
  for (const tag of tags) { const sub = tag.path[0] || 'General'; const leaf = tag.path[1] || ''; if (!map.has(sub)) map.set(sub, new Map()); map.get(sub)!.set(leaf, (map.get(sub)!.get(leaf) || 0) + 1); }
  return [...map.entries()].map(([sub, leaves]) => ({ sub, count: [...leaves.values()].reduce((a, b) => a + b, 0), leaves: [...leaves.entries()].filter(([leaf]) => Boolean(leaf)).map(([leaf, count]) => ({ leaf, count })) }));
}

function stripHtml(input: string) { return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

function getSuggestions(tokens: string[], activeTags: DisplayTag[]) {
  const clean = new Set(tokens.map(normalizeToken));
  const suggestions: string[] = [];
  const add = (value: string) => { if (!clean.has(normalizeToken(value)) && !suggestions.some((x) => normalizeToken(x) === normalizeToken(value))) suggestions.push(value); };
  if (clean.has('portrait') || clean.has('close-up') || clean.has('upper body')) { add('looking at viewer'); add('soft lighting'); add('depth of field'); }
  if (clean.has('full body') || clean.has('standing')) { add('dynamic composition'); add('three-quarter view'); add('detailed background'); }
  if (clean.has('night') || clean.has('night city')) { add('moonlight'); add('rim lighting'); add('bokeh'); }
  if (clean.has('forest') || clean.has('mountain') || clean.has('beach')) { add('wide shot'); add('volumetric lighting'); add('atmospheric perspective'); }
  if (clean.has('formal') || clean.has('business suit')) { add('confident expression'); add('centered composition'); add('studio lighting'); }
  for (const tag of activeTags.filter((x) => x.description && x.description.length > 20).slice(0, 4)) add(tag.label);
  return suggestions.slice(0, 12);
}

type Diagnostic = { code: string; severity: 'warning' | 'info'; title: string; detail: string };
function findPromptDiagnostics(tokens: string[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const keys = tokens.map(normalizeToken);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) out.push({ code: 'duplicate', severity: 'info', title: 'Duplicate tags', detail: `${[...new Set(duplicates)].join(', ')} appears more than once.` });
  const exclusiveGroups: Array<{ label: string; values: string[] }> = [
    { label: 'hair length', values: ['short hair', 'medium hair', 'long hair', 'very long hair'] },
    { label: 'primary eye color', values: ['blue eyes', 'green eyes', 'brown eyes', 'red eyes', 'pink eyes', 'purple eyes', 'gray eyes', 'black eyes'] },
    { label: 'shot size', values: ['close-up', 'portrait', 'upper body', 'cowboy shot', 'full body', 'wide shot'] },
    { label: 'time of day', values: ['morning', 'afternoon', 'daytime', 'sunset', 'dusk', 'night', 'midnight'] },
    { label: 'body count', values: ['solo', 'duo', 'trio', 'group', 'crowd'] },
  ];
  for (const group of exclusiveGroups) { const hits = group.values.filter((value) => keys.includes(value)); if (hits.length > 1) out.push({ code: `conflict:${group.label}`, severity: 'warning', title: `Potential ${group.label} conflict`, detail: `${hits.join(', ')} describe competing choices in the same semantic dimension.` }); }
  return out;
}

function BuildMode({ currentTokens, target, setTarget, onRemove, onMove, orderMode, setOrderMode, onOrganize, diagnostics }: { currentTokens: string[]; target: BuilderTarget; setTarget: (target: BuilderTarget) => void; onRemove: (tag: string) => void; onMove: (index: number, dir: -1 | 1) => void; orderMode: OrderMode; setOrderMode: (mode: OrderMode) => void; onOrganize: () => void; diagnostics: Diagnostic[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const token of currentTokens) {
      const result = classifyTagDetailed(token, 'General', '0', null, null, null);
      const placements = getSemanticPlacements({ tag: token, nativeCategory: 'General', nativeCategoryCode: '0', wikiCategory: null, isNsfw: result.isNsfw });
      const key = placements[0]?.parent || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(token);
    }
    return [...map.entries()];
  }, [currentTokens]);
  return <div className="space-y-3"><section className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[12px] font-semibold">Prompt blueprint</div><div className="mt-1 text-[11px] text-[var(--sc-text-muted)]">Build and inspect the selected builder draft as semantic blocks. Generation prompts are never changed from here.</div></div><div className="flex items-center gap-1"><button type="button" onClick={() => setTarget('positive')} className={`rounded-md px-2 py-1.5 text-[11px] ${target === 'positive' ? 'bg-[var(--sc-gold-soft)] text-[var(--sc-gold-strong)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-dim)]'}`}>Positive</button><button type="button" onClick={() => setTarget('negative')} className={`rounded-md px-2 py-1.5 text-[11px] ${target === 'negative' ? 'bg-[var(--sc-danger-soft)] text-[var(--sc-danger)]' : 'bg-[var(--sc-surface-2)] text-[var(--sc-text-dim)]'}`}>Negative</button></div></div><div className="mt-3 grid gap-2">{groups.length ? groups.map(([group, tokens]) => <div key={group} className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-0)]"><div className="border-b border-[var(--sc-border-soft)] px-3 py-2 text-[12px] font-semibold">{group} <span className="ml-1 text-[10px] font-normal text-[var(--sc-text-dim)]">{tokens.length}</span></div><div className="flex flex-wrap gap-1.5 p-2">{tokens.map((token) => <button key={token} type="button" onClick={() => onRemove(token)} className="rounded-full border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2.5 py-1 text-[11px] text-[var(--sc-text-secondary)] hover:border-[var(--sc-danger)] hover:text-[var(--sc-danger)]">{token}</button>)}</div></div>) : <div className="rounded-xl border border-dashed border-[var(--sc-border)] p-12 text-center text-[12px] text-[var(--sc-text-dim)]">Your target prompt is empty.</div>}</div></section><section className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-3"><div className="text-[12px] font-semibold">Order engine</div><div className="mt-2 flex flex-wrap items-center gap-2"><select value={orderMode} onChange={(e) => setOrderMode(e.target.value as OrderMode)} className="sc-theme-select h-8 rounded-md border border-[var(--sc-border)] bg-[var(--sc-surface-2)] px-2 text-[11px] outline-none"><option value="manual">Manual</option><option value="anima">Anima</option><option value="semantic">Semantic</option><option value="taxonomy">Taxonomy</option></select><button type="button" onClick={onOrganize} className="sc-builder-action"><Layers3 className="h-3 w-3" /> Reorder target</button></div><div className="mt-2 divide-y divide-[var(--sc-border-soft)] rounded-lg border border-[var(--sc-border)]">{currentTokens.map((token, index) => <div key={`${token}-${index}`} className="flex items-center gap-2 px-2 py-2"><span className="w-5 text-[10px] text-[var(--sc-text-dim)]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[11px]">{token}</span><button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} className="p-1 text-[var(--sc-text-dim)] disabled:opacity-20"><ArrowUp className="h-3 w-3" /></button><button type="button" onClick={() => onMove(index, 1)} disabled={index === currentTokens.length - 1} className="p-1 text-[var(--sc-text-dim)] disabled:opacity-20"><ArrowDown className="h-3 w-3" /></button></div>)}</div></section><section className="rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface-1)] p-3"><div className="text-[12px] font-semibold">Compatibility check</div><div className="mt-2 space-y-1.5">{diagnostics.length ? diagnostics.map((issue, i) => <div key={`${issue.code}-${i}`} className="rounded-lg bg-[var(--sc-surface-2)] p-2 text-[11px]"><strong>{issue.title}</strong><div className="mt-0.5 text-[var(--sc-text-muted)]">{issue.detail}</div></div>) : <div className="text-[12px] text-[var(--sc-text-dim)]">No obvious conflicts detected.</div>}</div></section></div>;
}

export default PromptBuilderModal;
