import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ExternalLink, Image as ImageIcon, Info, Loader2, Search, Tag, UserRound, X,
  Flame, Trophy, CalendarDays, Copy, Maximize2, MinusCircle, PlusCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { danbooru, RemotePost, RemotePostFeed, RemoteTag, RemoteWikiPage } from '../api/danbooruService';
import { emitToast } from '../utils/toast';
import { openUrl } from '@tauri-apps/plugin-opener';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';


export const openTagImageBrowserPopup = async () => {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    emitToast('Tag Image Browser popup is available in the Tauri desktop app.', 'warning');
    return;
  }
  try {
    const label = `tag-image-browser-${Date.now()}`;
    const popup = new WebviewWindow(label, {
      url: '/?popup=tag-image-browser',
      title: 'SwarmCanvas — Tag & Image Browser',
      width: 1450,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      resizable: true,
      center: true,
    });
    void popup.once('tauri://created', () => {
      emitToast('Tag & Image Browser opened.', 'success');
    });
    void popup.once('tauri://error', (event) => {
      console.error('[TagImageBrowser] popup error:', event);
      emitToast(`Tag Image Browser popup failed: ${typeof event === 'object' ? JSON.stringify(event) : String(event)}`, 'error');
    });
  } catch (error) {
    console.error('[TagImageBrowser] Could not open popup:', error);
    emitToast(`Could not open Tag Image Browser popup: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
};

async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      await openUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('[TagImageBrowser] External URL open failed:', error);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const CATEGORY_OPTIONS: Array<{ value: 'all' | 'artists' | 'characters' | 'copyrights' | 'general' | 'meta'; label: string; code?: number }> = [
  { value: 'all', label: 'All' },
  { value: 'artists', label: 'Artists', code: 1 },
  { value: 'characters', label: 'Characters', code: 4 },
  { value: 'copyrights', label: 'Copyrights', code: 3 },
  { value: 'general', label: 'General', code: 0 },
  { value: 'meta', label: 'Meta', code: 5 },
];

type TagSort = 'count-desc' | 'count-asc' | 'alpha' | 'newest-tag' | 'random';
type CategoryFilterState = 'off' | 'include' | 'exclude';
type CategoryFilterMap = Record<'artist' | 'character' | 'copyright' | 'general' | 'meta', CategoryFilterState>;

const EMPTY_CATEGORY_FILTERS: CategoryFilterMap = { artist: 'off', character: 'off', copyright: 'off', general: 'off', meta: 'off' };

const FEED_OPTIONS: Array<{ value: RemotePostFeed; label: string; icon: React.ReactNode; description: string }> = [
  { value: 'newest', label: 'Newest', icon: <CalendarDays className="w-3.5 h-3.5" />, description: 'Newest posts for the selected tag' },
  { value: 'hot', label: 'Hot', icon: <Flame className="w-3.5 h-3.5" />, description: 'Danbooru rank / hot ordering' },
  { value: 'popular-day', label: 'Popular · Day', icon: <Trophy className="w-3.5 h-3.5" />, description: 'Official daily popular list' },
  { value: 'popular-week', label: 'Popular · Week', icon: <Trophy className="w-3.5 h-3.5" />, description: 'Official weekly popular list' },
  { value: 'popular-month', label: 'Popular · Month', icon: <Trophy className="w-3.5 h-3.5" />, description: 'Official monthly popular list' },
  { value: 'popular-year', label: 'Popular · Year', icon: <Trophy className="w-3.5 h-3.5" />, description: 'Highest-scoring posts from the selected calendar year' },
];

interface StoredTagBrowserState {
  category?: (typeof CATEGORY_OPTIONS)[number]['value'];
  tagSort?: TagSort;
  tagPage?: number;
  feed?: RemotePostFeed;
  popularAnchorDate?: string;
  postFilterTokens?: Array<{ value: string; exclude: boolean }>;
  categoryFilters?: CategoryFilterMap;
  postFilterInput?: string;
}

function readStoredTagBrowserState(): StoredTagBrowserState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('swarmcanvas.tagImageBrowser.state');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredTagBrowserState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const CATEGORY_STYLES: Record<string, string> = {
  artist: 'bg-violet-500/10 text-violet-300 border-violet-400/20',
  character: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/20',
  copyright: 'bg-rose-500/10 text-rose-300 border-rose-400/20',
  general: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20',
  meta: 'bg-amber-500/10 text-amber-300 border-amber-400/20',
  unknown: 'bg-zinc-500/10 text-zinc-400 border-zinc-400/20',
};

function formatCount(value: number | undefined): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
}

function stripWikiHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function ratingLabel(rating?: string): string {
  return rating ? rating.toUpperCase() : '?';
}

function appendTag(current: string, tag: string): string {
  const trimmed = current.trim();
  if (!trimmed) return tag;
  return `${trimmed.replace(/[,\s]+$/, '')}, ${tag}`;
}

const RemotePostModal: React.FC<{ post: RemotePost | null; tag: string | null; onClose: () => void }> = ({ post, tag, onClose }) => {
  if (!post) return null;
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); emitToast(`${label} copied`, 'success'); } catch { emitToast(`Could not copy ${label}`, 'error'); }
  };
  const tagGroups = [
    ['Artists', post.tagStringArtist],
    ['Characters', post.tagStringCharacter],
    ['Copyrights', post.tagStringCopyright],
    ['General', post.tagStringGeneral],
    ['Meta', post.tagStringMeta],
  ] as Array<[string, string | undefined]>;
  const src = post.largeFileUrl || post.fileUrl || post.previewFileUrl || '';
  return (
    <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#11141a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold"><Info className="w-4 h-4 text-violet-300" /> Danbooru Post #{post.id}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 min-h-0 flex items-center justify-center">
              {src ? <img src={src} alt={`Danbooru post ${post.id}`} className="max-w-full max-h-[62vh] object-contain" /> : <div className="p-12 text-zinc-600">No image URL returned.</div>}
            </div>
            <div className="space-y-2 text-[10px] font-mono">
              <div className="grid grid-cols-2 gap-2">
                <InfoCell label="ID" value={String(post.id)} />
                <InfoCell label="Rating" value={ratingLabel(post.rating)} />
                <InfoCell label="Score" value={String(post.score ?? 0)} />
                <InfoCell label="Favorites" value={String(post.favCount ?? 0)} />
                <InfoCell label="Dimensions" value={post.imageWidth && post.imageHeight ? `${post.imageWidth} × ${post.imageHeight}` : 'Unknown'} />
                <InfoCell label="Created" value={post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Unknown'} />
                {post.uploader && <InfoCell label="Uploader" value={post.uploader} />}
                {post.parentId != null && <InfoCell label="Parent" value={String(post.parentId)} />}
              </div>
              {tag && <InfoCell label="Opened from tag" value={tag.replace(/_/g, ' ')} />}
              {post.source && <InfoCell label="Source" value={post.source} link />}
              <div className="flex gap-1.5 pt-1">
                <button type="button" onClick={() => void copy(post.tagString || '', 'All tags')} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer"><Copy className="w-3 h-3" />Copy tags</button>
                <button type="button" onClick={() => void openExternalUrl(danbooru.getRemotePostUrl(post.id))} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer"><ExternalLink className="w-3 h-3" />Danbooru</button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {tagGroups.map(([name, value]) => value ? (
              <details key={name} className="rounded-lg border border-white/10 bg-black/20">
                <summary className="cursor-pointer px-3 py-2 text-[10px] text-zinc-300 font-semibold">{name} <span className="text-zinc-600 font-normal">({value.split(' ').filter(Boolean).length})</span></summary>
                <div className="px-3 pb-3 text-[10px] leading-relaxed text-zinc-400 break-words select-text">{value.replace(/_/g, ' ')}</div>
              </details>
            ) : null)}
          </div>
        </div>
      </div>
    </div>
  );
};

function localDateInputValue(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function categoryField(post: RemotePost, category: keyof CategoryFilterMap): string {
  switch (category) {
    case 'artist': return post.tagStringArtist || '';
    case 'character': return post.tagStringCharacter || '';
    case 'copyright': return post.tagStringCopyright || '';
    case 'general': return post.tagStringGeneral || '';
    case 'meta': return post.tagStringMeta || '';
  }
}

function matchesCategoryFilters(post: RemotePost, filters: CategoryFilterMap): boolean {
  for (const category of Object.keys(filters) as Array<keyof CategoryFilterMap>) {
    const state = filters[category];
    if (state === 'off') continue;
    const hasCategory = Boolean(categoryField(post, category).trim());
    if (state === 'include' && !hasCategory) return false;
    if (state === 'exclude' && hasCategory) return false;
  }
  return true;
}

function buildCalendarRange(feed: RemotePostFeed, anchor: string): { start: string; end: string; label: string } {
  const base = anchor ? new Date(`${anchor}T12:00:00`) : new Date();
  const yyyy = base.getFullYear();
  const pad = (v: number) => String(v).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (feed === 'popular-year') {
    const start = new Date(yyyy, 0, 1);
    const end = new Date(yyyy, 11, 31);
    return { start: fmt(start), end: fmt(end), label: String(yyyy) };
  }
  if (feed === 'popular-month') {
    const start = new Date(yyyy, base.getMonth(), 1);
    const end = new Date(yyyy, base.getMonth() + 1, 0);
    return { start: fmt(start), end: fmt(end), label: start.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) };
  }
  if (feed === 'popular-week') {
    const day = base.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(base);
    start.setDate(base.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: fmt(start), end: fmt(end), label: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}` };
  }
  const exact = new Date(yyyy, base.getMonth(), base.getDate());
  return { start: fmt(exact), end: fmt(exact), label: exact.toLocaleDateString() };
}

const InfoCell: React.FC<{ label: string; value: string; link?: boolean }> = ({ label, value, link }) => (
  <div className="rounded-lg bg-black/20 border border-white/5 p-2 min-w-0">
    <span className="block text-[8px] uppercase tracking-wider text-zinc-600 mb-0.5">{label}</span>
    {link ? <button type="button" onClick={() => void openExternalUrl(value)} className="text-violet-300 hover:text-violet-200 break-all text-left cursor-pointer">{value}</button> : <span className="text-zinc-300 break-words">{value}</span>}
  </div>
);

export const TagImageBrowserPanel: React.FC<any> = () => {
  const { prompt, negativePrompt, setPrompt, setNegativePrompt, setActiveContextMenu } = useAppStore(useShallow((s) => ({
    prompt: s.prompt,
    negativePrompt: s.negativePrompt,
    setPrompt: s.setPrompt,
    setNegativePrompt: s.setNegativePrompt,
    setActiveContextMenu: s.setActiveContextMenu,
  })));

  const TAG_PAGE_SIZE = 100;
  const POST_PAGE_SIZE = 48;
  const initialStoredState = useMemo(() => readStoredTagBrowserState(), []);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]['value']>(initialStoredState.category || 'artists');
  const [tagSort, setTagSort] = useState<TagSort>(initialStoredState.tagSort || 'count-desc');
  const [remoteTags, setRemoteTags] = useState<RemoteTag[]>([]);
  const [selectedTag, setSelectedTag] = useState<RemoteTag | null>(null);
  const [tagPage, setTagPage] = useState(Number.isFinite(initialStoredState.tagPage) && (initialStoredState.tagPage || 1) > 0 ? Math.floor(initialStoredState.tagPage || 1) : 1);
  const [tagPageDraft, setTagPageDraft] = useState(String(Number.isFinite(initialStoredState.tagPage) && (initialStoredState.tagPage || 1) > 0 ? Math.floor(initialStoredState.tagPage || 1) : 1));
  const [hasMoreTags, setHasMoreTags] = useState(true);
  const [feed, setFeed] = useState<RemotePostFeed>(initialStoredState.feed || 'newest');
  const [popularAnchorDate, setPopularAnchorDate] = useState(initialStoredState.popularAnchorDate || localDateInputValue());
  const [postFilterTokens, setPostFilterTokens] = useState<Array<{ value: string; exclude: boolean }>>(Array.isArray(initialStoredState.postFilterTokens) ? initialStoredState.postFilterTokens : []);
  const [postFilterInput, setPostFilterInput] = useState(initialStoredState.postFilterInput || '');
  const [categoryFilters, setCategoryFilters] = useState<CategoryFilterMap>({ ...EMPTY_CATEGORY_FILTERS, ...(initialStoredState.categoryFilters || {}) });
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [posts, setPosts] = useState<RemotePost[]>([]);
  const [wiki, setWiki] = useState<RemoteWikiPage | null>(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [postPage, setPostPage] = useState(1);
  const [postPageDraft, setPostPageDraft] = useState('1');
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<RemotePost | null>(null);
  const [tagInfoExpanded, setTagInfoExpanded] = useState(true);
  const tagListRef = useRef<HTMLElement | null>(null);
  const seenPostIdsRef = useRef<Set<number>>(new Set());
  const postPageAbortRef = useRef<AbortController | null>(null);
  const restoringBrowserStateRef = useRef(true);

  const activeCategoryFilterKeys = useMemo(
    () => (Object.keys(categoryFilters) as Array<keyof CategoryFilterMap>).filter((key) => categoryFilters[key] !== 'off'),
    [categoryFilters],
  );
  // Once a type filter is active, fetch all tag categories from Danbooru so an
  // exclusion such as "without artists" can actually reveal non-artist tags.
  // Without this, the selected category tab (e.g. Artists) would make exclusion
  // filters appear to return an empty list because the server had already limited
  // the result set to Artists.
  const currentCategoryCode = useMemo(() => {
    if (activeCategoryFilterKeys.length > 0) return undefined;
    return CATEGORY_OPTIONS.find((item) => item.value === category)?.code;
  }, [category, activeCategoryFilterKeys]);
  const filteredPosts = useMemo(() => posts.filter((post) => matchesCategoryFilters(post, categoryFilters)), [posts, categoryFilters]);
  const visibleRemoteTags = useMemo(() => {
    const included = (Object.keys(categoryFilters) as Array<keyof CategoryFilterMap>)
      .filter((key) => categoryFilters[key] === 'include');
    const excluded = (Object.keys(categoryFilters) as Array<keyof CategoryFilterMap>)
      .filter((key) => categoryFilters[key] === 'exclude');
    return remoteTags.filter((tag) => {
      const tagCategory = tag.categoryName as keyof CategoryFilterMap;
      if (excluded.includes(tagCategory)) return false;
      return included.length === 0 || included.includes(tagCategory);
    });
  }, [remoteTags, categoryFilters]);

  useEffect(() => {
    if (!selectedTag || tagLoading || !remoteTags.length) return;
    if (!visibleRemoteTags.some((tag) => tag.id === selectedTag.id)) {
      setSelectedTag(null);
    }
  }, [selectedTag, visibleRemoteTags, tagLoading, remoteTags.length]);
  const historicalRange = useMemo(() => buildCalendarRange(feed, popularAnchorDate), [feed, popularAnchorDate]);
  const positivePostTags = postFilterTokens.filter((item) => !item.exclude).map((item) => item.value);
  const negativePostTags = postFilterTokens.filter((item) => item.exclude).map((item) => item.value);

  const cycleCategoryFilter = (key: keyof CategoryFilterMap) => {
    setCategoryFilters((prev) => {
      const current = prev[key];
      const next: CategoryFilterState = current === 'off' ? 'include' : current === 'include' ? 'exclude' : 'off';
      return { ...prev, [key]: next };
    });
  };

  const addPostFilterToken = (raw: string) => {
    const parts = raw.trim().split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return;
    setPostFilterTokens((prev) => {
      const next = [...prev];
      for (const part of parts) {
        const exclude = part.startsWith('-');
        const value = (exclude ? part.slice(1) : part).trim().toLowerCase().replace(/\s+/g, '_');
        if (!value || next.some((item) => item.exclude === exclude && item.value === value)) continue;
        next.push({ value, exclude });
      }
      return next;
    });
    setPostFilterInput('');
    setShowTagSuggestions(false);
  };

  const removePostFilterToken = (index: number) => setPostFilterTokens((prev) => prev.filter((_, i) => i !== index));

  useEffect(() => {
    if (restoringBrowserStateRef.current) {
      restoringBrowserStateRef.current = false;
    } else {
      setTagPage(1);
    }
  }, [category, tagSort, postFilterInput, activeCategoryFilterKeys.join('|')]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const state: StoredTagBrowserState = { category, tagSort, tagPage, feed, popularAnchorDate, postFilterTokens, categoryFilters, postFilterInput };
      window.localStorage.setItem('swarmcanvas.tagImageBrowser.state', JSON.stringify(state));
    }
    setTagPageDraft(String(tagPage));
    tagListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setTagLoading(true); setError(null);
      const tagLookup = postFilterInput.trim().replace(/^[-+]/, '');
      void danbooru.searchRemoteTags(tagLookup, {
        category: currentCategoryCode,
        order: tagSort === 'alpha' ? 'name' : tagSort === 'newest-tag' ? 'date' : 'count',
        page: tagPage,
        limit: TAG_PAGE_SIZE,
        signal: controller.signal,
      }).then((rows) => {
        if (controller.signal.aborted) return;
        let sorted: RemoteTag[];
        if (tagSort === 'random') {
          sorted = [...rows];
          for (let i = sorted.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
          }
        } else {
          sorted = [...rows].sort((a, b) => {
            if (tagSort === 'alpha') return a.name.localeCompare(b.name);
            if (tagSort === 'count-asc') return a.postCount - b.postCount || a.name.localeCompare(b.name);
            if (tagSort === 'newest-tag') return b.id - a.id;
            return b.postCount - a.postCount || a.name.localeCompare(b.name);
          });
        }
        setRemoteTags(sorted);
        setHasMoreTags(rows.length >= TAG_PAGE_SIZE);
        if (selectedTag && currentCategoryCode !== undefined && selectedTag.category !== currentCategoryCode) setSelectedTag(null);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : String(err)); setRemoteTags([]); setHasMoreTags(false); }
      }).finally(() => { if (!controller.signal.aborted) setTagLoading(false); });
    }, postFilterInput.trim() ? 280 : 80);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [postFilterInput, currentCategoryCode, tagSort, tagPage]);

  const postQueryKey = useMemo(() => JSON.stringify({ tag: selectedTag?.name || '', feed, date: popularAnchorDate, positivePostTags, negativePostTags }), [selectedTag?.name, feed, popularAnchorDate, positivePostTags.join('|'), negativePostTags.join('|')]);

  const loadPostPage = async (requestedPage: number, options?: { resetSeen?: boolean }) => {
    const safePage = Math.max(1, Math.floor(requestedPage));
    postPageAbortRef.current?.abort();
    const controller = new AbortController();
    postPageAbortRef.current = controller;
    setPostLoading(true);
    setError(null);
    try {
      const rows = await danbooru.getRemotePosts(selectedTag?.name || null, safePage, POST_PAGE_SIZE, controller.signal, feed, {
        date: popularAnchorDate,
        includeTags: positivePostTags,
        excludeTags: negativePostTags,
      });
      const unique = Array.from(new Map(rows.filter((post) => post.id > 0).map((post) => [post.id, post])).values());
      const pageIds = new Set(unique.map((post) => post.id));
      if (options?.resetSeen || safePage === 1) seenPostIdsRef.current = new Set();
      if (safePage > 1 && unique.length > 0 && Array.from(pageIds).every((id) => seenPostIdsRef.current.has(id))) {
        setHasMorePosts(false);
        emitToast('Danbooru returned a duplicate page; pagination stopped to prevent repeated posts.', 'warning');
        return;
      }
      unique.forEach((post) => seenPostIdsRef.current.add(post.id));
      setPosts(unique);
      setPostPage(safePage);
      setPostPageDraft(String(safePage));
      setHasMorePosts(unique.length >= POST_PAGE_SIZE);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setHasMorePosts(false);
    } finally {
      if (postPageAbortRef.current === controller) {
        postPageAbortRef.current = null;
        if (!controller.signal.aborted) setPostLoading(false);
      }
    }
  };

  useEffect(() => () => {
    postPageAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    seenPostIdsRef.current = new Set();
    postPageAbortRef.current?.abort();
    postPageAbortRef.current = null;
    setPosts([]);
    setPostPage(1);
    setHasMorePosts(true);
    setWiki(null);
    setWikiLoading(Boolean(selectedTag));
    const controller = new AbortController();
    const tagName = selectedTag?.name || '';
    setPostLoading(true); setError(null);
    void Promise.all([
      danbooru.getRemotePosts(tagName || null, 1, POST_PAGE_SIZE, controller.signal, feed, {
        date: popularAnchorDate,
        includeTags: positivePostTags,
        excludeTags: negativePostTags,
      }),
      selectedTag ? danbooru.getRemoteWiki(selectedTag.name, controller.signal) : Promise.resolve(null),
    ]).then(([postRows, wikiRow]) => {
      if (controller.signal.aborted) return;
      const unique = Array.from(new Map(postRows.filter((post) => post.id > 0).map((post) => [post.id, post])).values());
      unique.forEach((post) => seenPostIdsRef.current.add(post.id));
      setPosts(unique);
      setPostPage(1);
      setPostPageDraft('1');
      setHasMorePosts(unique.length >= POST_PAGE_SIZE);
      setWiki(wikiRow);
    }).catch((err: unknown) => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : String(err)); setHasMorePosts(false); } })
      .finally(() => { if (!controller.signal.aborted) { setPostLoading(false); setWikiLoading(false); } });
    return () => controller.abort();
  }, [postQueryKey]);

  const insertTag = (tag: string, negative: boolean) => {
    if (negative) setNegativePrompt(appendTag(negativePrompt, tag)); else setPrompt(appendTag(prompt, tag));
  };

  const handlePostContextMenu = (e: React.MouseEvent, post: RemotePost) => {
    e.preventDefault(); e.stopPropagation();
    setActiveContextMenu({
      x: e.clientX, y: e.clientY, title: `Danbooru Post #${post.id}`,
      items: [
        { label: 'View Post Info', icon: <Info className="w-3.5 h-3.5 text-violet-300" />, action: () => setSelectedPost(post) },
        { label: 'Insert selected tag → Positive', icon: <Tag className="w-3.5 h-3.5 text-emerald-300" />, action: () => selectedTag && insertTag(selectedTag.name, false) },
        { label: 'Insert selected tag → Negative', icon: <Tag className="w-3.5 h-3.5 text-rose-300" />, action: () => selectedTag && insertTag(selectedTag.name, true) },
        { label: 'Open Post on Danbooru', icon: <ExternalLink className="w-3.5 h-3.5" />, action: () => void openExternalUrl(danbooru.getRemotePostUrl(post.id)) },
      ],
    });
  };

  const activeFeed = FEED_OPTIONS.find((entry) => entry.value === feed)!;

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0c0e13] text-xs text-zinc-300">
      <div className="shrink-0 border-b border-white/10 bg-[#12151c] px-3 py-2.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-400/20"><ImageIcon className="w-4 h-4 text-violet-300" /></span>
          <div className="min-w-0"><div className="font-semibold text-zinc-100">Tag & Image Browser</div><div className="text-[10px] text-zinc-600">Live Danbooru tags, posts, categories and rankings</div></div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => void openExternalUrl('https://danbooru.donmai.us/tags')} className="p-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer" title="Open Danbooru tag browser"><ExternalLink className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => void openTagImageBrowserPopup()} className="p-1.5 rounded-md bg-violet-500/10 border border-violet-400/20 text-violet-300 hover:text-white cursor-pointer" title="Open Tag & Image Browser in a separate window"><Maximize2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {FEED_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => setFeed(option.value)} title={option.description}
              className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[9px] cursor-pointer transition ${feed === option.value ? 'bg-violet-500/12 border-violet-400/25 text-violet-200' : 'bg-black/20 border-white/8 text-zinc-500 hover:text-zinc-200'}`}>
              {option.icon}{option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(180px,1fr)_auto] gap-2">
          <div className="relative min-w-0">
            <div className="min-h-9 flex items-center flex-wrap gap-1 pl-2 pr-2 py-1.5 rounded-lg bg-black/30 border border-white/10 focus-within:border-violet-400/30">
              <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              {postFilterTokens.map((token, index) => <button key={`${token.exclude ? '-' : '+'}${token.value}`} type="button" onClick={() => removePostFilterToken(index)} title="Remove filter" className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-mono cursor-pointer ${token.exclude ? 'bg-rose-500/10 border-rose-400/20 text-rose-300' : 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'}`}><span>{token.exclude ? '-' : '+'}</span>{token.value.replace(/_/g, ' ')}<X className="w-2.5 h-2.5 opacity-60" /></button>)}
              {selectedTag && <button type="button" onClick={() => setSelectedTag(null)} title="Clear selected tag" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-400/20 text-violet-300 text-[9px] font-mono cursor-pointer">tag:{selectedTag.name.replace(/_/g, ' ')}<X className="w-2.5 h-2.5" /></button>}
              <input value={postFilterInput} onChange={(e) => { setPostFilterInput(e.target.value); setShowTagSuggestions(true); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addPostFilterToken(postFilterInput); } else if (e.key === 'Backspace' && !postFilterInput && postFilterTokens.length) removePostFilterToken(postFilterTokens.length - 1); }} onFocus={() => setShowTagSuggestions(true)} onBlur={() => window.setTimeout(() => setShowTagSuggestions(false), 120)} placeholder="Add tag filters… use -dog to exclude" className="min-w-[120px] flex-1 bg-transparent outline-none text-[10px] text-zinc-200 placeholder:text-zinc-600" />
            </div>
            {showTagSuggestions && postFilterInput.trim() && remoteTags.length > 0 && <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[#11141a] shadow-2xl overflow-hidden">{remoteTags.slice(0, 8).map((tag) => <button key={`suggest-${tag.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addPostFilterToken(`${postFilterInput.trim().startsWith('-') ? '-' : ''}${tag.name}`)} className="w-full px-2.5 py-2 flex items-center gap-2 text-left hover:bg-white/5 cursor-pointer"><span className="font-mono text-[9px] text-zinc-200 truncate">{tag.name.replace(/_/g, ' ')}</span><span className="ml-auto text-[8px] text-zinc-600">{formatCount(tag.postCount)}</span></button>)}</div>}
          </div>
          <select value={tagSort} onChange={(e) => setTagSort(e.target.value as TagSort)} className="px-2 py-2 rounded-lg bg-black/30 border border-white/10 text-[10px] font-mono text-zinc-300 outline-none">
            <option value="count-desc">Tag count ↓</option><option value="count-asc">Tag count ↑</option><option value="alpha">A–Z</option><option value="newest-tag">Newest tag</option><option value="random">Random</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[8px] uppercase tracking-wider text-zinc-600 mr-1">Tag types</span>
          {CATEGORY_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => { setCategory(option.value); setSelectedTag(null); }} className={`px-2 py-1 rounded-md border text-[9px] cursor-pointer ${category === option.value ? 'bg-violet-500/12 border-violet-400/25 text-violet-200' : 'bg-black/20 border-white/8 text-zinc-500 hover:text-zinc-200'}`}>{option.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[8px] uppercase tracking-wider text-zinc-600 mr-1">Tag type filters</span>
          {(['artist','character','copyright','general','meta'] as const).map((key) => { const state = categoryFilters[key]; const label = key === 'copyright' ? 'Copyright' : key[0].toUpperCase() + key.slice(1); return <button key={key} type="button" onClick={() => cycleCategoryFilter(key)} title="Click: include · click again: exclude · click again: clear" className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] cursor-pointer ${state === 'include' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : state === 'exclude' ? 'bg-rose-500/10 border-rose-400/20 text-rose-300' : 'bg-black/20 border-white/8 text-zinc-500 hover:text-zinc-200'}`}>{state === 'include' ? <PlusCircle className="w-2.5 h-2.5" /> : state === 'exclude' ? <MinusCircle className="w-2.5 h-2.5" /> : null}{label}</button>; })}
          <span className="text-[8px] text-zinc-600">include → exclude → off</span>
        </div>
        {feed.startsWith('popular-') && <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 border border-white/5"><span className="text-[8px] uppercase tracking-wider text-zinc-600">Historical popular date</span><input type="date" value={popularAnchorDate} onChange={(e) => setPopularAnchorDate(e.target.value)} className="px-2 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] text-zinc-200 outline-none"/><span className="text-[9px] font-mono text-zinc-500">{historicalRange.label}</span><span className="text-[8px] text-zinc-700">{historicalRange.start} → {historicalRange.end}</span></div>}
      </div>

      {error && <div className="shrink-0 px-3 py-2 bg-rose-950/30 border-b border-rose-500/20 text-rose-300 text-[10px] font-mono">{error}</div>}

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(190px,30%)_1fr]">
        <aside ref={tagListRef} className="min-h-0 overflow-y-auto border-r border-white/5 p-2">
          <div className="px-2 py-1.5 flex items-center justify-between text-[9px] uppercase tracking-wider text-zinc-600 font-semibold"><span>{visibleRemoteTags.length.toLocaleString()} tags shown · page {tagPage}{hasMoreTags ? '+' : ''}</span>{tagLoading && <Loader2 className="w-3 h-3 animate-spin" />}</div>
          <div className="space-y-1">
            {visibleRemoteTags.map((tag) => <button key={tag.id || tag.name} type="button" onClick={() => { setSelectedTag(tag); setTagInfoExpanded(true); }} className={`w-full text-left px-2.5 py-2 rounded-lg border transition cursor-pointer ${selectedTag?.name === tag.name ? 'bg-violet-500/10 border-violet-400/25' : 'bg-white/[0.015] border-transparent hover:bg-white/[0.045]'}`}>
              <div className="flex items-center gap-2 min-w-0"><span className="shrink-0">{tag.categoryName === 'artist' ? <UserRound className="w-3 h-3 text-violet-300" /> : <Tag className="w-3 h-3 text-zinc-600" />}</span><span className="truncate font-mono text-[10px] text-zinc-200">{tag.name.replace(/_/g, ' ')}</span><span className="ml-auto shrink-0 font-mono text-[9px] text-zinc-500">{formatCount(tag.postCount)}</span></div>
              <div className="mt-1 flex items-center gap-1.5 pl-5"><span className={`px-1 py-0.5 rounded border text-[7px] uppercase tracking-wider ${CATEGORY_STYLES[tag.categoryName] || CATEGORY_STYLES.unknown}`}>{tag.categoryName}</span>{tag.hasArtist && <span className="text-[8px] text-violet-400">artist-linked</span>}</div>
            </button>)}
            {!tagLoading && !remoteTags.length && <div className="px-3 py-10 text-center text-[10px] text-zinc-600">No remote tags matched this search.</div>}
          </div>
          <div className="sticky bottom-0 mt-2 pt-2 border-t border-white/5 bg-[#0c0e13]">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setTagPage(1)} disabled={tagPage <= 1 || tagLoading} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-500 hover:text-white disabled:opacity-30 cursor-pointer">First</button>
              <button type="button" onClick={() => setTagPage((value) => Math.max(1, value - 1))} disabled={tagPage <= 1 || tagLoading} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-500 hover:text-white disabled:opacity-30 cursor-pointer">Prev</button>
              <input aria-label="Tag page" type="number" min="1" value={tagPageDraft} onChange={(e) => setTagPageDraft(e.target.value)} onBlur={() => setTagPage(Math.max(1, Number(tagPageDraft) || 1))} onKeyDown={(e) => { if (e.key === 'Enter') { setTagPage(Math.max(1, Number(tagPageDraft) || 1)); (e.currentTarget as HTMLInputElement).blur(); } }} className="w-14 px-2 py-1.5 rounded-md bg-black/30 border border-white/10 text-[9px] text-zinc-200 text-center outline-none" />
              <button type="button" onClick={() => setTagPage((value) => value + 1)} disabled={!hasMoreTags || tagLoading} className="ml-auto px-2 py-1.5 rounded-md bg-violet-500/10 border border-violet-400/20 text-[9px] text-violet-300 hover:text-white disabled:opacity-30 cursor-pointer">Next</button>
            </div>
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{activeFeed.icon}{activeFeed.label}<span className="text-zinc-700">{filteredPosts.length.toLocaleString()} shown / {posts.length.toLocaleString()} loaded</span></div><div className="text-[9px] text-zinc-700 mt-0.5">{activeFeed.description}</div></div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => void loadPostPage(1, { resetSeen: true })} disabled={postLoading || postPage <= 1} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-500 hover:text-white disabled:opacity-30 cursor-pointer">First</button>
              <button type="button" onClick={() => void loadPostPage(postPage - 1)} disabled={postLoading || postPage <= 1} className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-500 hover:text-white disabled:opacity-30 cursor-pointer">Prev</button>
              <input aria-label="Post page" type="number" min="1" value={postPageDraft} onChange={(e) => setPostPageDraft(e.target.value)} onBlur={() => { const next = Math.max(1, Number(postPageDraft) || 1); void loadPostPage(next); }} onKeyDown={(e) => { if (e.key === 'Enter') { const next = Math.max(1, Number(postPageDraft) || 1); void loadPostPage(next); (e.currentTarget as HTMLInputElement).blur(); } }} className="w-14 px-2 py-1.5 rounded-md bg-black/30 border border-white/10 text-[9px] text-zinc-200 text-center outline-none" />
              <span className="text-[8px] text-zinc-600">{hasMorePosts ? '+ next' : 'end'}</span>
              <button type="button" onClick={() => void loadPostPage(postPage + 1)} disabled={postLoading || !hasMorePosts} className="px-2 py-1.5 rounded-md bg-violet-500/10 border border-violet-400/20 text-[9px] text-violet-300 hover:text-white disabled:opacity-30 cursor-pointer">Next</button>
            </div>
          </div>

          {selectedTag && <div className="rounded-xl border border-white/10 bg-[#11141a] p-3 mb-3">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => setTagInfoExpanded((value) => !value)} className="min-w-0 flex-1 text-left cursor-pointer" aria-expanded={tagInfoExpanded}>
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-zinc-100 break-all">{selectedTag.name.replace(/_/g, ' ')}</h3><span className={`px-1.5 py-0.5 rounded border text-[8px] uppercase tracking-wider ${CATEGORY_STYLES[selectedTag.categoryName] || CATEGORY_STYLES.unknown}`}>{selectedTag.categoryName}</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[9px] font-mono text-zinc-500"><span>{selectedTag.postCount.toLocaleString()} posts</span><span>Danbooru ID {selectedTag.id}</span>{selectedTag.hasArtist && <span className="text-violet-400">artist-linked</span>}</div>
              </button>
              <div className="flex items-center gap-1 shrink-0"><button type="button" onClick={() => insertTag(selectedTag.name, false)} className="px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 hover:bg-emerald-500/15 cursor-pointer">+ Positive</button><button type="button" onClick={() => insertTag(selectedTag.name, true)} className="px-2 py-1.5 rounded-md bg-rose-500/10 border border-rose-400/20 text-rose-300 hover:bg-rose-500/15 cursor-pointer">+ Negative</button><button type="button" onClick={() => void openExternalUrl(danbooru.getRemoteTagUrl(selectedTag.name))} className="p-1.5 rounded-md bg-white/5 border border-white/10 text-zinc-400 hover:text-white cursor-pointer" title="Open tag on Danbooru"><ExternalLink className="w-3.5 h-3.5" /></button></div>
            </div>
            {tagInfoExpanded && <div className="mt-3 rounded-lg bg-black/20 border border-white/5 p-2"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-600 font-semibold mb-1.5"><Info className="w-3 h-3" /> Tag info <span className="text-zinc-700">· click header to collapse</span></div>{wikiLoading ? <div className="text-[9px] text-zinc-600">Loading wiki…</div> : wiki?.body ? <div className="text-[10px] leading-relaxed text-zinc-400">{stripWikiHtml(wiki.body).slice(0, 1200)}</div> : <div className="text-[9px] text-zinc-600">No wiki description available for this tag.</div>}</div>}
          </div>}

          {postLoading && !posts.length ? <div className="py-16 text-center text-zinc-600 text-[10px]"><Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />Fetching images from Danbooru…</div> : !filteredPosts.length ? <div className="py-16 text-center text-zinc-600 text-[10px]">No posts match the current tag/type filters.</div> : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredPosts.map((post) => {
              const imageSrc = post.previewFileUrl || post.largeFileUrl || post.fileUrl;
              if (!imageSrc) return null;
              return <article key={post.id} onContextMenu={(e) => handlePostContextMenu(e, post)} className="group rounded-lg overflow-hidden border border-white/7 bg-[#11141a]">
                <button type="button" onClick={() => setSelectedPost(post)} className="block w-full aspect-square bg-black/30 cursor-pointer" title={`View Danbooru post ${post.id}`}>
                  <img src={imageSrc} alt={`Danbooru post ${post.id}`} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.015] transition-transform duration-150" />
                </button>
                <div className="p-1.5"><div className="flex items-center justify-between text-[8px] font-mono text-zinc-500"><span>#{post.id}</span><span className="text-zinc-600">{ratingLabel(post.rating)}</span></div><div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-zinc-600"><span>score {post.score ?? 0}</span><span>fav {post.favCount ?? 0}</span>{post.imageWidth && post.imageHeight && <span>{post.imageWidth}×{post.imageHeight}</span>}</div><div className="mt-1.5 flex items-center gap-1"><button type="button" onClick={() => insertTag(selectedTag?.name || '', false)} disabled={!selectedTag} className="flex-1 px-1.5 py-1 rounded bg-emerald-500/8 border border-emerald-400/15 text-[8px] text-emerald-300 disabled:opacity-30 cursor-pointer">+ Pos</button><button type="button" onClick={() => void openExternalUrl(danbooru.getRemotePostUrl(post.id))} className="p-1 rounded bg-white/5 border border-white/10 text-zinc-500 hover:text-white cursor-pointer" title="Open post on Danbooru"><ExternalLink className="w-3 h-3" /></button></div></div>
              </article>;
            })}
          </div>}
        </section>
      </div>
      <RemotePostModal post={selectedPost} tag={selectedTag?.name || null} onClose={() => setSelectedPost(null)} />
    </div>
  );
};
