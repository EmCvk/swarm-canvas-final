import type { CategorizationMode, SortMode } from '../workers/tagDatabaseWorker';
import type { BuilderFilter, BuilderTaxonomyId } from './promptBuilderTaxonomies';
export type { CategorizationMode, SortMode };

export interface TagDetail {
  tag: string;
  subCategory: string;
  postCount: number | null;
  description?: string;
  nativeCategory?: string;
  nativeCategoryCode?: string;
  wikiCategory?: string | null;
  uiCategory?: string;
  uiSubCategory?: string;
  uiSubSubCategory?: string | null;
  secondaryUiCategories?: Array<{ parent: string; sub: string; subSub?: string }>;
  classificationConfidence?: number;
  classificationSources?: string[];
  modeParent?: string;
  modeSub?: string;
}

export interface AutocompleteItem { name: string; category?: string; count?: number | null }
interface Stats { parentCategories: string[]; parentCounts: Record<string, number>; subCounts: Record<string, Record<string, number>>; totalTags: number }
interface Pending { resolve: (value:any)=>void; reject: (reason:any)=>void }

export type RemoteTagCategory = 'general' | 'artist' | 'copyright' | 'character' | 'meta' | 'unknown';
export type RemoteTagCategoryCounts = Partial<Record<Exclude<RemoteTagCategory, 'unknown'>, number | null>>;

export interface RemoteTag {
  id: number;
  name: string;
  category: number;
  categoryName: RemoteTagCategory;
  postCount: number;
  hasArtist: boolean;
  isDeprecated?: boolean;
}

export interface RemoteTagPage {
  tags: RemoteTag[];
  totalCount: number | null;
  page: number;
  limit: number;
  hasMore: boolean;
}

export type RemotePostFeed = 'newest' | 'hot' | 'popular-day' | 'popular-week' | 'popular-month' | 'popular-year';

export interface RemotePostQueryOptions {
  /** Anchor date used by the historical popular feeds (YYYY-MM-DD). */
  date?: string;
  /** Additional positive post-search tags. */
  includeTags?: string[];
  /** Additional negative post-search tags. */
  excludeTags?: string[];
}

export interface RemotePost {
  id: number;
  createdAt?: string;
  score?: number;
  favCount?: number;
  rating?: string;
  imageWidth?: number;
  imageHeight?: number;
  fileUrl?: string;
  largeFileUrl?: string;
  previewFileUrl?: string;
  source?: string;
  tagString?: string;
  md5?: string;
  tagStringArtist?: string;
  tagStringCharacter?: string;
  tagStringCopyright?: string;
  tagStringGeneral?: string;
  tagStringMeta?: string;
  uploader?: string;
  parentId?: number | null;
}

export interface RemoteWikiPage {
  title: string;
  body?: string;
  otherNames?: string[];
}


export interface BuilderGroup { parent: string; sub: string; leaf?: string; count: number }
export interface BuilderTagResult {
  tag: string;
  postCount: number | null;
  description?: string | null;
  nativeCategory?: string;
  wikiCategory?: string | null;
  uiCategory?: string | null;
  uiSubCategory?: string | null;
  uiSubSubCategory?: string | null;
  secondaryUiCategories?: Array<{ parent: string; sub: string; subSub?: string }>;
  classificationConfidence?: number;
  classificationSources?: string[];
  isNsfw?: boolean;
}
export interface BuilderTagsPage {
  tags: BuilderTagResult[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
export interface BuilderHealth {
  uniqueTags: number;
  nsfwTags: number;
  sfwTags: number;
  semanticPlacements: number;
  multiPlacement: number;
  lowConfidence: number;
  fallback: number;
  nativeCounts?: Record<string, number>;
}

const DANBOORU_ORIGIN = 'https://danbooru.donmai.us';

function danbooruCategoryName(category: number): RemoteTagCategory {
  switch (category) {
    case 1: return 'artist';
    case 3: return 'copyright';
    case 4: return 'character';
    case 5: return 'meta';
    case 0: return 'general';
    default: return 'unknown';
  }
}

function encodeTagQuery(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '_');
}

async function fetchDanbooruJsonWithMeta<T>(path: string, signal?: AbortSignal): Promise<{ data: T; totalCount: number | null }> {
  const response = await fetch(`${DANBOORU_ORIGIN}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Danbooru HTTP ${response.status}`);
  const header = response.headers.get('x-total-count') || response.headers.get('x-total') || null;
  const totalCount = header != null && Number.isFinite(Number(header)) ? Number(header) : null;
  return { data: await response.json() as T, totalCount };
}

async function fetchDanbooruJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const result = await fetchDanbooruJsonWithMeta<T>(path, signal);
  return result.data;
}

function mapRemoteTag(raw: any): RemoteTag {
  const category = Number(raw?.category ?? -1);
  return {
    id: Number(raw?.id ?? 0),
    name: String(raw?.name ?? ''),
    category,
    categoryName: danbooruCategoryName(category),
    postCount: Number(raw?.post_count ?? 0),
    hasArtist: Boolean(raw?.has_artist),
    isDeprecated: Boolean(raw?.is_deprecated),
  };
}

function mapRemotePost(raw: any): RemotePost {
  return {
    id: Number(raw?.id ?? 0),
    createdAt: typeof raw?.created_at === 'string' ? raw.created_at : undefined,
    score: Number.isFinite(Number(raw?.score)) ? Number(raw.score) : undefined,
    favCount: Number.isFinite(Number(raw?.fav_count)) ? Number(raw.fav_count) : undefined,
    rating: typeof raw?.rating === 'string' ? raw.rating : undefined,
    imageWidth: Number.isFinite(Number(raw?.image_width)) ? Number(raw.image_width) : undefined,
    imageHeight: Number.isFinite(Number(raw?.image_height)) ? Number(raw.image_height) : undefined,
    fileUrl: typeof raw?.file_url === 'string' ? raw.file_url : undefined,
    largeFileUrl: typeof raw?.large_file_url === 'string' ? raw.large_file_url : undefined,
    previewFileUrl: typeof raw?.preview_file_url === 'string' ? raw.preview_file_url : undefined,
    source: typeof raw?.source === 'string' ? raw.source : undefined,
    tagString: typeof raw?.tag_string === 'string' ? raw.tag_string : undefined,
    md5: typeof raw?.md5 === 'string' ? raw.md5 : undefined,
    tagStringArtist: typeof raw?.tag_string_artist === 'string' ? raw.tag_string_artist : undefined,
    tagStringCharacter: typeof raw?.tag_string_character === 'string' ? raw.tag_string_character : undefined,
    tagStringCopyright: typeof raw?.tag_string_copyright === 'string' ? raw.tag_string_copyright : undefined,
    tagStringGeneral: typeof raw?.tag_string_general === 'string' ? raw.tag_string_general : undefined,
    tagStringMeta: typeof raw?.tag_string_meta === 'string' ? raw.tag_string_meta : undefined,
    uploader: typeof raw?.uploader_name === 'string' ? raw.uploader_name : (typeof raw?.uploader === 'string' ? raw.uploader : undefined),
    parentId: raw?.parent_id == null ? null : Number(raw.parent_id),
  };
}

class DanbooruService {
  private worker: Worker;
  private pending = new Map<number,Pending>();
  private nextId = 1;
  private remoteWikiCache = new Map<string, RemoteWikiPage | null>();
  private remoteCategoryCountsCache: RemoteTagCategoryCounts | null = null;
  private loaded = false;
  private callbacks = new Set<() => void>();
  private stats: Stats = { parentCategories: [], parentCounts: {}, subCounts: {}, totalTags: 0 };

  constructor() {
    this.worker = new Worker(new URL('../workers/tagDatabaseWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent) => {
      const { id, success, data, error } = event.data;
      const pending = this.pending.get(id); if (!pending) return;
      this.pending.delete(id); if (success) pending.resolve(data); else pending.reject(new Error(error || 'Tag worker request failed'));
    };
    this.worker.onerror = event => console.error('[Danbooru] worker error', event);
    void this.init();
  }
  private request<T>(type: string, payload: Record<string,any> = {}): Promise<T> {
    return new Promise<T>((resolve,reject) => { const id=this.nextId++; this.pending.set(id,{resolve,reject}); this.worker.postMessage({id,type,payload}); });
  }
  private async init() { try { this.stats=await this.request<Stats>('INIT'); this.loaded=true; for(const cb of this.callbacks)cb(); this.callbacks.clear(); } catch(error){ console.error('[Danbooru] failed to load local tag database',error); } }
  public isReady(){return this.loaded}
  public onLoaded(cb:()=>void){if(this.loaded)cb();else this.callbacks.add(cb);return()=>this.callbacks.delete(cb)}
  public getParentCategories(){return this.stats.parentCategories}
  public getSubCategories(parent:string){return ['All',...Object.keys(this.stats.subCounts[parent]||{}).filter(s=>s!=='All')]}
  public getParentCount(parent:string){return this.stats.parentCounts[parent]??0}
  public getSubCount(parent:string,sub:string){return this.stats.subCounts[parent]?.[sub]??0}
  public getPostCount(_tag:string):number|null{return null}
  public async getTags(parent:string,sub:string,search='',limit=300){return this.request<string[]>('GET_TAGS',{parent,sub,search,limit})}
  public async getTagDetail(tag:string,currentParent?:string,currentSub?:string):Promise<TagDetail>{
    const detail=await this.request<any>('GET_DETAIL',{tag,currentParent,currentSub});
    if(!detail)return{tag,subCategory:currentSub||currentParent||'General',postCount:null};
    return {tag:detail.tag,subCategory:detail.modeSub,postCount:detail.postCount,description:detail.description||undefined,nativeCategory:detail.nativeCategory,nativeCategoryCode:detail.nativeCategoryCode,wikiCategory:detail.wikiCategory,uiCategory:detail.uiCategory,uiSubCategory:detail.uiSubCategory,uiSubSubCategory:detail.uiSubSubCategory,secondaryUiCategories:detail.secondaryUiCategories,classificationConfidence:detail.classificationConfidence,classificationSources:detail.classificationSources,modeParent:detail.modeParent,modeSub:detail.modeSub};
  }
  public async searchAutocomplete(query:string,limit=8){const items=await this.request<Array<{name:string;category:string;count:number|null}>>('SEARCH',{query,limit});return items.map(item=>({name:item.name,category:item.category,count:item.count}))}
  public async getRandomTags(parent:string,count=2){return this.request<string[]>('GET_RANDOM_TAGS',{parent,count})}
  public async getTagDetails(tags:string[]){return this.request<Array<Partial<TagDetail> & {tag:string; nativeCategory?:string; nativeCategoryCode?:string; postCount?:number|null}>>('GET_DETAILS',{tags})}
  public async setCategorizationMode(mode:CategorizationMode){this.stats=await this.request<Stats>('SET_MODE',{mode})}

  public async getBuilderGroups(taxonomy: BuilderTaxonomyId = 'prompt_flow', sfwFilter: BuilderFilter = 'all'): Promise<{ taxonomy: BuilderTaxonomyId; sfwFilter: BuilderFilter; totalTags: number; placementTotal: number; groups: BuilderGroup[] }> {
    return this.request('GET_BUILDER_GROUPS', { taxonomy, sfwFilter });
  }

  public async getBuilderHealth(sfwFilter: BuilderFilter = 'all'): Promise<BuilderHealth> {
    return this.request('GET_BUILDER_HEALTH', { sfwFilter });
  }

  public async getBuilderTags(options: {
    taxonomy?: BuilderTaxonomyId;
    sfwFilter?: BuilderFilter;
    parent?: string;
    sub?: string;
    leaf?: string;
    search?: string;
    sort?: SortMode;
    page?: number;
    limit?: number;
  } = {}): Promise<BuilderTagsPage> {
    return this.request('GET_BUILDER_TAGS', {
      taxonomy: options.taxonomy || 'prompt_flow',
      sfwFilter: options.sfwFilter || 'all',
      parent: options.parent || 'All',
      sub: options.sub || '',
      leaf: options.leaf || '',
      search: options.search || '',
      sort: options.sort || 'popularity',
      page: options.page || 1,
      limit: options.limit || 120,
    });
  }
  public async getRemoteTagCategoryCounts(signal?: AbortSignal): Promise<RemoteTagCategoryCounts> {
    if (this.remoteCategoryCountsCache) return this.remoteCategoryCountsCache;
    const categories: Array<{ key: Exclude<RemoteTagCategory, 'unknown'>; code: number }> = [
      { key: 'general', code: 0 },
      { key: 'artist', code: 1 },
      { key: 'copyright', code: 3 },
      { key: 'character', code: 4 },
      { key: 'meta', code: 5 },
    ];
    const counts: RemoteTagCategoryCounts = {};
    await Promise.all(categories.map(async ({ key, code }) => {
      try {
        const params = new URLSearchParams();
        params.set('search[category]', String(code));
        params.set('search[hide_empty]', 'false');
        params.set('limit', '1');
        const result = await fetchDanbooruJsonWithMeta<any[]>(`/tags.json?${params.toString()}`, signal);
        counts[key] = result.totalCount;
      } catch (error) {
        if ((error as any)?.name === 'AbortError') throw error;
        counts[key] = null;
      }
    }));
    this.remoteCategoryCountsCache = counts;
    return counts;
  }

  public async searchRemoteTagsPage(query = '', options: { category?: number; order?: 'count' | 'name' | 'date'; limit?: number; page?: number; signal?: AbortSignal } = {}): Promise<RemoteTagPage> {
    const params = new URLSearchParams();
    const cleaned = query.trim();
    if (cleaned) params.set('search[name_matches]', cleaned.includes('*') ? cleaned : `${cleaned}*`);
    if (options.category !== undefined) params.set('search[category]', String(options.category));
    params.set('search[hide_empty]', 'false');
    const limit = Math.min(1000, Math.max(1, Math.floor(options.limit ?? 1000)));
    const page = Math.max(1, Math.floor(options.page ?? 1));
    params.set('limit', String(limit));
    params.set('page', String(page));
    // Danbooru's tag listing orders are nested under search[order], not a top-level order parameter.
    params.set('search[order]', options.order ?? 'count');
    const result = await fetchDanbooruJsonWithMeta<any[]>(`/tags.json?${params.toString()}`, options.signal);
    const tags = Array.isArray(result.data) ? result.data.map(mapRemoteTag).filter((tag) => Boolean(tag.name)) : [];
    const totalCount = result.totalCount;
    return { tags, totalCount, page, limit, hasMore: totalCount != null ? page * limit < totalCount : tags.length >= limit };
  }

  public async searchRemoteTags(query = '', options: { category?: number; order?: 'count' | 'name' | 'date'; limit?: number; page?: number; signal?: AbortSignal } = {}): Promise<RemoteTag[]> {
    const result = await this.searchRemoteTagsPage(query, options);
    return result.tags;
  }

  public async getRemotePosts(
    tag: string | null,
    page = 1,
    limit = 48,
    signal?: AbortSignal,
    feed: RemotePostFeed = 'newest',
    options: RemotePostQueryOptions = {},
  ): Promise<RemotePost[]> {
    const params = new URLSearchParams();
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, Math.floor(page));
    params.set('limit', String(safeLimit));
    params.set('page', String(safePage));

    const includeTags = [
      tag ? encodeTagQuery(tag) : '',
      ...(options.includeTags || []).map(encodeTagQuery),
    ].filter(Boolean);
    const excludeTags = (options.excludeTags || []).map(encodeTagQuery).filter(Boolean);
    const buildTagQuery = (extra: string[] = []) => [...includeTags, ...extra, ...excludeTags.map((value) => `-${value}`)].join(' ').trim();
    const normalizedTagQuery = buildTagQuery();
    const anchorDate = options.date || new Date().toISOString().slice(0, 10);

    if (feed === 'popular-day' || feed === 'popular-week' || feed === 'popular-month') {
      const scale = feed.slice('popular-'.length);
      params.set('scale', scale);
      params.set('date', anchorDate);
      if (normalizedTagQuery) params.set('search[tags]', normalizedTagQuery);
      const raw = await fetchDanbooruJson<any[]>(`/explore/posts/popular.json?${params.toString()}`, signal);
      return Array.isArray(raw) ? raw.map(mapRemotePost).filter((post) => post.id > 0) : [];
    }

    if (feed === 'popular-year') {
      // The public popular explorer provides day/week/month scales. For a calendar-year
      // view we use Danbooru's date range metatag plus score ordering, which lets the user
      // inspect a specific historical year rather than a rolling one-year window.
      const year = /^\d{4}/.test(anchorDate) ? anchorDate.slice(0, 4) : String(new Date().getFullYear());
      const yearlyQuery = [`date:${year}-01-01..${year}-12-31`, ...includeTags, ...excludeTags.map((value) => `-${value}`), 'order:score'].join(' ').trim();
      params.set('tags', yearlyQuery);
      params.delete('page');
      params.set('page', String(safePage));
      const raw = await fetchDanbooruJson<any[]>(`/posts.json?${params.toString()}`, signal);
      return Array.isArray(raw) ? raw.map(mapRemotePost).filter((post) => post.id > 0) : [];
    }

    if (normalizedTagQuery) params.set('tags', normalizedTagQuery);
    params.set('random', 'false');
    params.set('order', feed === 'hot' ? 'rank' : 'id_desc');

    const raw = await fetchDanbooruJson<any[]>(`/posts.json?${params.toString()}`, signal);
    return Array.isArray(raw) ? raw.map(mapRemotePost).filter((post) => post.id > 0) : [];
  }

  public async getPopularPosts(feed: Exclude<RemotePostFeed, 'newest' | 'hot'>, page = 1, limit = 48, signal?: AbortSignal, tag?: string): Promise<RemotePost[]> {
    const params = new URLSearchParams();
    const safePage = Math.max(1, Math.floor(page));
    params.set('limit', String(Math.min(100, Math.max(1, limit))));
    params.set('page', String(safePage));
    const scale = feed === 'popular-year' ? null : feed.slice('popular-'.length);
    if (scale) {
      params.set('scale', scale);
      if (tag?.trim()) params.set('search[tags]', encodeTagQuery(tag));
      const raw = await fetchDanbooruJson<any[]>(`/explore/posts/popular.json?${params.toString()}`, signal);
      return Array.isArray(raw) ? raw.map(mapRemotePost).filter((post) => post.id > 0) : [];
    }
    const year = new Date().getFullYear();
    const tagQuery = `${tag ? encodeTagQuery(tag) + ' ' : ''}date:${year}-01-01..${year}-12-31 order:score`;
    params.set('tags', tagQuery.trim());
    const raw = await fetchDanbooruJson<any[]>(`/posts.json?${params.toString()}`, signal);
    return Array.isArray(raw) ? raw.map(mapRemotePost).filter((post) => post.id > 0) : [];
  }

  public async getRemoteTagDetails(tag: string, signal?: AbortSignal): Promise<RemoteTag | null> {
    const rows = await this.searchRemoteTags(tag, { limit: 20, order: 'count', signal });
    const normalized = encodeTagQuery(tag);
    return rows.find((row) => row.name === normalized) || rows[0] || null;
  }

  public async getRemoteWiki(tag: string, signal?: AbortSignal): Promise<RemoteWikiPage | null> {
    const normalized = encodeTagQuery(tag);
    if (this.remoteWikiCache.has(normalized)) return this.remoteWikiCache.get(normalized) || null;
    try {
      const raw = await fetchDanbooruJson<any>(`/wiki_pages/${encodeURIComponent(normalized)}.json`, signal);
      if (!raw) { this.remoteWikiCache.set(normalized, null); return null; }
      const page = {
        title: String(raw?.title || normalized),
        body: typeof raw?.body === 'string' ? raw.body : undefined,
        otherNames: Array.isArray(raw?.other_names) ? raw.other_names.map(String) : undefined,
      };
      this.remoteWikiCache.set(normalized, page);
      return page;
    } catch (error) {
      if ((error as any)?.name === 'AbortError') throw error;
      return null;
    }
  }

  public getRemoteTagUrl(tag: string): string {
    return `${DANBOORU_ORIGIN}/tags/${encodeURIComponent(encodeTagQuery(tag))}`;
  }

  public getRemotePostUrl(id: number): string {
    return `${DANBOORU_ORIGIN}/posts/${encodeURIComponent(String(id))}`;
  }

  public async setSortMode(sort:SortMode){await this.request('SET_SORT',{sort})}
}
export const danbooru=new DanbooruService();
