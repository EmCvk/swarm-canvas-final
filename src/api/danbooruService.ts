import type { CategorizationMode, SortMode } from '../workers/tagDatabaseWorker';
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

class DanbooruService {
  private worker: Worker;
  private pending = new Map<number,Pending>();
  private nextId = 1;
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
  public async setCategorizationMode(mode:CategorizationMode){this.stats=await this.request<Stats>('SET_MODE',{mode})}
  public async setSortMode(sort:SortMode){await this.request('SET_SORT',{sort})}
}
export const danbooru=new DanbooruService();
