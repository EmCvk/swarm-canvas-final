export type CategorizationMode = 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
export type SortMode = 'alphabetical' | 'popularity';

export interface TagDetail {
  tag: string;
  subCategory: string;
  postCount: number | null;
  description?: string;
}

export interface AutocompleteItem {
  name: string;
  category?: string;
  count?: number;
}

const DEFAULT_STAGES: Record<string, Record<string, string[]>> = {
  '1. Subject & Count': {
    'Counts': ['1girl', '2girls', '3girls', 'multiple_girls', '1boy', '2boys', 'solo', 'group', 'couple'],
    'Subjects': ['girl', 'boy', 'woman', 'man', 'bishoujo', 'elf', 'angel', 'demon', 'cyborg'],
  },
  '2. Characters & Series': {
    'Vocaloid': ['hatsune_miku', 'megurine_luka', 'kagamine_rin', 'kagamine_len'],
    'Touhou': ['hakurei_reimu', 'kirisame_marisa', 'remilia_scarlet', 'flandre_scarlet', 'izayoi_sakuya'],
    'Genshin': ['raiden_shogun', 'ganyu', 'kamisato_ayaka', 'furina', 'hu_tao', 'nahida', 'yelan'],
    'Hololive': ['houshou_marine', 'gawr_gura', 'usada_pekora', 'shirakami_fubuki'],
  },
  '3. Animals & Creatures': {
    'Features': ['cat_ears', 'fox_ears', 'wolf_ears', 'dog_ears', 'animal_ears', 'cat_tail', 'fox_tail', 'wings'],
    'Creatures': ['cat', 'dog', 'butterfly', 'bird', 'dragon', 'fox', 'rabbit'],
  },
  '4. Face & Hair': {
    'Hair Style': ['long_hair', 'short_hair', 'twintails', 'ponytail', 'braid', 'messy_hair', 'bob_cut'],
    'Hair Color': ['blonde_hair', 'black_hair', 'silver_hair', 'white_hair', 'blue_hair', 'pink_hair', 'red_hair'],
    'Eyes': ['blue_eyes', 'red_eyes', 'green_eyes', 'brown_eyes', 'amber_eyes', 'purple_eyes', 'heterochromia'],
    'Expression': ['smile', 'grin', 'blush', 'open_mouth', 'parted_lips', 'winking', 'closed_eyes', 'looking_at_viewer'],
  },
  '5. Body & Physiology': {
    'Physique': ['slender', 'petite', 'tall', 'curvy', 'cleavage', 'toned', 'abs'],
    'Details': ['mole', 'freckles', 'fangs', 'pointy_ears', 'navel', 'collarbone'],
  },
  '6. Wardrobe & Outfit': {
    'Everyday': ['school_uniform', 'serafuku', 'sailor_suit', 'blazer', 'pleated_skirt', 'white_shirt', 't-shirt'],
    'Dresses': ['dress', 'sundress', 'black_dress', 'white_dress', 'maid_apron', 'gothic_lolita'],
    'Traditional': ['kimono', 'yukata', 'haori', 'cheongsam'],
    'Swimwear': ['bikini', 'swimsuit', 'school_swimsuit', 'one-piece_swimsuit'],
    'Footwear': ['boots', 'thighhighs', 'knee_socks', 'black_stockings', 'sneakers', 'sandals', 'barefoot'],
  },
  '7. Pose & Action': {
    'Stances': ['standing', 'sitting', 'lying', 'kneeling', 'squatting', 'leaning_forward'],
    'Gestures': ['peace_sign', 'hand_on_hip', 'waving', 'arms_behind_back', 'adjusting_hair', 'holding_hands'],
  },
  '8. Props & Weapons': {
    'Objects': ['sword', 'katana', 'gun', 'knife', 'staff', 'umbrella', 'book', 'cup', 'phone'],
  },
  '9. Environment & Setting': {
    'Nature': ['forest', 'beach', 'ocean', 'mountains', 'cherry_blossoms', 'garden', 'sky', 'clouds'],
    'Urban': ['cityscape', 'street', 'room', 'classroom', 'cafe', 'bedroom', 'balcony', 'shrine'],
    'Time & Weather': ['day', 'night', 'sunset', 'sunlight', 'moonlight', 'starry_sky', 'rain', 'snow'],
  },
  '10. Camera & Composition': {
    'Framing': ['portrait', 'upper_body', 'cowboy_shot', 'full_body', 'close-up', 'profile'],
    'Angles': ['from_above', 'from_below', 'dutch_angle', 'depth_of_field', 'blurry_background'],
  },
  '11. Style & Aesthetics': {
    'Quality': ['masterpiece', 'best_quality', 'high_quality', 'absurdres', 'extremely_detailed'],
    'Vibes': ['retro', 'cyberpunk', 'fantasy', 'surreal', 'vintage', 'cinematic_lighting'],
  },
  '12. Artists': {
    'Popular': ['krenz_cushart', 'wlop', 'mika_pikazo', 'citemark', 'tiv', 'reDrop', 'ask_(askzy)'],
  },
  '13. Themes, Lore & Adult': {
    'Mood': ['dark', 'bright', 'mysterious', 'melancholy', 'romantic', 'peaceful'],
  },
};

class DanbooruDirectService {
  private stages: Record<string, Record<string, string[]>> = DEFAULT_STAGES;
  private allTagsList: string[] = [];
  private postCounts = new Map<string, number>();
  private descriptions = new Map<string, string>();
  private loaded = false;
  private loadListeners: Array<() => void> = [];
  private sortMode: SortMode = 'alphabetical';

  constructor() {
    this.init();
  }

  public isReady(): boolean {
    return this.loaded;
  }

  public onLoaded(cb: () => void): () => void {
    if (this.loaded) {
      cb();
    } else {
      this.loadListeners.push(cb);
    }
    return () => {
      this.loadListeners = this.loadListeners.filter((l) => l !== cb);
    };
  }

  private notifyLoaded() {
    this.loaded = true;
    this.loadListeners.forEach((l) => {
      try {
        l();
      } catch {}
    });
  }

  public async init(): Promise<void> {
    try {
      const catRes = await fetch('/data/danbooru_categories.json');
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData && typeof catData === 'object') {
          const sanitized: Record<string, Record<string, string[]>> = {};
          Object.entries(catData).forEach(([macroKey, subObj]) => {
            if (/^\d+$/.test(macroKey) || macroKey === 'tags' || macroKey === 'categories') return;
            if (subObj && typeof subObj === 'object') {
              sanitized[macroKey] = {};
              Object.entries(subObj as Record<string, any>).forEach(([subKey, val]) => {
                if (/^\d+$/.test(subKey)) return;
                if (Array.isArray(val)) {
                  sanitized[macroKey][subKey] = val.map((x) => String(x).trim());
                } else if (val && typeof val === 'object') {
                  sanitized[macroKey][subKey] = Object.values(val).flat().map((x) => String(x).trim());
                } else {
                  sanitized[macroKey][subKey] = [];
                }
              });
            }
          });
          if (Object.keys(sanitized).length > 0) {
            this.stages = { ...DEFAULT_STAGES, ...sanitized };
          }
        }
      }
    } catch {}

    try {
      const descRes = await fetch('/data/tag_descriptions.json');
      if (descRes.ok) {
        const descData = await descRes.json();
        Object.entries(descData).forEach(([k, v]) => {
          this.descriptions.set(k.toLowerCase().replace(/\s+/g, '_'), String(v));
        });
      }
    } catch {}

    try {
      const csvRes = await fetch('/data/danbooru.csv');
      if (csvRes.ok) {
        const text = await csvRes.text();
        const lines = text.split('\n');
        const bulk: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(',');
          if (parts.length >= 1) {
            const raw = parts[0].trim().replace(/\s+/g, '_');
            const clean = raw.toLowerCase();
            const count = parts[2] ? parseInt(parts[2], 10) : (parts[1] ? parseInt(parts[1], 10) : 1000);
            this.postCounts.set(clean, isNaN(count) ? 1000 : count);
            bulk.push(raw);
          }
        }

        if (bulk.length > 0) {
          this.allTagsList = bulk;
        }
      }
    } catch (e) {
      console.warn('Failed loading danbooru.csv directly:', e);
    }

    this.notifyLoaded();
  }

  public getParentCategories(): string[] {
    return Object.keys(this.stages);
  }

  public getSubCategories(parent: string): string[] {
    const pData = this.stages[parent];
    if (!pData || typeof pData !== 'object') return ['All'];
    return ['All', ...Object.keys(pData)];
  }

  public getParentCount(parent: string): number {
    const pData = this.stages[parent];
    if (!pData || typeof pData !== 'object') return 0;
    const unique = new Set<string>();
    Object.values(pData).forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((t) => unique.add(String(t)));
    });
    return unique.size;
  }

  public getSubCount(parent: string, sub: string): number {
    const pData = this.stages[parent];
    if (!pData || typeof pData !== 'object') return 0;
    if (sub === 'All') return this.getParentCount(parent);
    return Array.isArray(pData[sub]) ? pData[sub].length : 0;
  }

  public getPostCount(tag: string): number | null {
    return this.postCounts.get(tag.toLowerCase().replace(/\s+/g, '_')) ?? null;
  }

  public async getTags(parent: string, sub: string, search = '', limit = 300): Promise<string[]> {
    let list: string[] = [];
    const pData = this.stages[parent];

    // If searching across all database tags or query is typed
    if (search.trim() && search.length >= 2 && this.allTagsList.length > 0) {
      const q = search.toLowerCase().replace(/\s+/g, '_');
      const matched = this.allTagsList.filter((t) => t.toLowerCase().includes(q));
      if (this.sortMode === 'popularity') {
        matched.sort((a, b) => (this.getPostCount(b) || 0) - (this.getPostCount(a) || 0));
      } else {
        matched.sort((a, b) => a.localeCompare(b));
      }
      return matched.slice(0, limit);
    }

    if (pData && typeof pData === 'object') {
      if (sub === 'All' || !sub) {
        const set = new Set<string>();
        Object.values(pData).forEach((tags) => {
          if (Array.isArray(tags)) tags.forEach((t) => set.add(String(t)));
        });
        list = Array.from(set);
      } else if (Array.isArray(pData[sub])) {
        list = [...pData[sub]].map(String);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase().replace(/\s+/g, '_');
      list = list.filter((t) => t.toLowerCase().includes(q));
    }

    if (this.sortMode === 'popularity') {
      list.sort((a, b) => (this.getPostCount(b) || 0) - (this.getPostCount(a) || 0));
    } else {
      list.sort((a, b) => a.localeCompare(b));
    }

    return list.slice(0, limit);
  }

  public async getTagDetail(tag: string, currentParent?: string, currentSub?: string): Promise<TagDetail> {
    const clean = tag.toLowerCase().replace(/\s+/g, '_');
    return {
      tag,
      subCategory: currentSub && currentSub !== 'All' ? currentSub : (currentParent || 'General'),
      postCount: this.getPostCount(clean),
      description: this.descriptions.get(clean) || `Danbooru keyword: ${tag.replace(/_/g, ' ')}.`,
    };
  }

  public async searchAutocomplete(query: string, limit = 8): Promise<AutocompleteItem[]> {
    const res = await this.getTags('1. Subject & Count', 'All', query, limit);
    return res.map((name) => ({
      name,
      count: this.getPostCount(name) || 0,
    }));
  }

  public async getRandomTags(stage: string, count = 2): Promise<string[]> {
    const all = await this.getTags(stage, 'All', '', 9999);
    if (!all.length) return [];
    return [...all].sort(() => 0.5 - Math.random()).slice(0, count);
  }

  public async setCategorizationMode(_mode: CategorizationMode): Promise<void> {}

  public async setSortMode(mode: SortMode): Promise<void> {
    this.sortMode = mode;
  }
}

export const danbooru = new DanbooruDirectService();