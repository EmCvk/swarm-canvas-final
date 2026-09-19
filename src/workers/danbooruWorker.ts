// src/workers/danbooruWorker.ts

export interface AutocompleteItem {
  tag: string;
  count: number | null;
  category: string;
}

export interface TagDetail {
  tag: string;
  description: string | null;
  postCount: number | null;
  parentCategory: string;
  subCategory: string;
}

export type CategorizationMode =
  | 'prompt_flow'
  | 'rpg_slots'
  | 'theme_genre'
  | 'danbooru_types'
  | 'danbooru_groups';

export type SortMode = 'alphabetical' | 'popularity';

function isMeaninglessTag(rawTag: string): boolean {
  const t = rawTag.trim().toLowerCase();
  if (!/[a-zA-Z0-9]/.test(t)) return true;
  if (/^[;:](?:[()\/<>=|3dopqstvcixDOPQSTVCIX\-+^~!?_]|>=)+$/.test(t)) return true;
  const kaomoji = new Set([
    'xd', 'dx', 'uwu', '0w0', '0w07', 'orz', 'qwq', 't_t', 'x_x', 'o_o', '-_-',
    'o.o', 'x.x', '^o^', 'v_v', '>3<', 'o3o', ';o;', ';_;', '>_<', '>_o', '>o<',
    '>:)', '>:(', '@_@', '=v=', '=_=', '^q^', '^v^', '^3^', '\\o/', '\\m/', '\\n/', '\\||/'
  ]);
  if (kaomoji.has(t)) return true;
  const maintenance = new Set([
    'duplicate', 'pixel-perfect_duplicate', 'md5_mismatch', 'jpeg_artifacts',
    'scan_artifacts', 'bad_link', 'dead_link', 'check_translation',
    'translation_request', 'artist_request', 'copyright_request',
    'character_request', 'source_request'
  ]);
  if (maintenance.has(t)) return true;
  return false;
}

const PURE_CREATURE_SUBCATS: Record<string, string[]> = {
  'Felines & Big Cats': [
    'cat', 'kitten', 'lion', 'tiger', 'leopard', 'cheetah', 'panther',
    'jaguar', 'lynx', 'cougar', 'ocelot', 'caracal', 'serval'
  ],
  'Canines, Wolves & Foxes': [
    'dog', 'puppy', 'hound', 'canine', 'wolf', 'wolves', 'fox', 'coyote', 'jackal', 'dingo', 'hyena'
  ],
  'Equines & Farm Mammals': [
    'horse', 'stallion', 'mare', 'foal', 'pony', 'donkey', 'mule', 'zebra',
    'cow', 'bull', 'calf', 'cattle', 'ox', 'sheep', 'lamb', 'ram', 'goat',
    'pig', 'piglet', 'swine', 'boar', 'deer', 'stag', 'doe', 'fawn', 'elk', 'moose',
    'reindeer', 'camel', 'llama', 'alpaca'
  ],
  'Rodents & Small Mammals': [
    'rabbit', 'bunny', 'hare', 'mouse', 'mice', 'rat', 'rats',
    'hamster', 'guinea_pig', 'gerbil', 'squirrel', 'chipmunk', 'ferret', 'weasel',
    'otter', 'badger', 'raccoon', 'tanuki', 'hedgehog', 'skunk', 'bat', 'capybara'
  ],
  'Bears & Wild Mammals': [
    'bear', 'polar_bear', 'grizzly', 'panda', 'red_panda',
    'elephant', 'rhino', 'rhinoceros', 'hippo', 'hippopotamus', 'giraffe',
    'monkey', 'ape', 'gorilla', 'chimpanzee', 'lemur', 'primate', 'kangaroo', 'koala'
  ],
  'Birds & Winged Animals': [
    'bird', 'avian', 'chick', 'chicken', 'rooster', 'hen', 'duck', 'duckling',
    'goose', 'geese', 'swan', 'crow', 'raven', 'pigeon', 'dove', 'sparrow',
    'owl', 'eagle', 'hawk', 'falcon', 'seagull', 'penguin',
    'flamingo', 'parrot', 'parakeet', 'cockatoo', 'peacock', 'crane', 'stork', 'pelican', 'heron'
  ],
  'Aquatic & Marine Life': [
    'fish', 'shark', 'whale', 'dolphin', 'orca', 'seal', 'sea_lion',
    'walrus', 'octopus', 'squid', 'jellyfish', 'crab', 'lobster', 'shrimp', 'prawn',
    'eel', 'manta_ray', 'stingray', 'starfish', 'seahorse', 'clam', 'oyster', 'coral'
  ],
  'Reptiles & Amphibians': [
    'snake', 'serpent', 'python', 'viper', 'cobra', 'lizard', 'gecko', 'chameleon',
    'iguana', 'turtle', 'tortoise', 'crocodile', 'alligator', 'frog', 'toad',
    'tadpole', 'salamander', 'axolotl', 'newt', 'dinosaur', 'pterosaur', 'raptor'
  ],
  'Insects & Arthropods': [
    'insect', 'bug', 'butterfly', 'moth', 'caterpillar',
    'bee', 'wasp', 'hornet', 'ant', 'beetle', 'ladybug', 'dragonfly',
    'grasshopper', 'cricket', 'mantis', 'praying_mantis', 'mosquito',
    'spider', 'tarantula', 'scorpion', 'centipede', 'millipede', 'snail', 'slug', 'worm'
  ],
  'Mythical Beasts & Dragons': [
    'dragon', 'wyvern', 'drake', 'eastern_dragon', 'hydra', 'phoenix',
    'griffin', 'gryphon', 'hippogriff', 'pegasus', 'unicorn', 'cerberus', 'chimera',
    'basilisk', 'kraken', 'leviathan', 'behemoth', 'fenrir', 'gargoyle', 'cockatrice', 'qilin'
  ],
  'Monsters & Fantasy Entities': [
    'monster', 'creature', 'demon', 'devil', 'angel', 'ghost', 'spirit', 'undead', 'zombie',
    'skeleton', 'vampire', 'werewolf', 'slime', 'golem', 'goblin', 'orc', 'troll', 'ogre',
    'mimic', 'youkai', 'oni', 'tengu', 'kappa', 'harpy', 'centaur', 'lamia', 'mermaid', 'merman',
    'succubus', 'incubus', 'elemental'
  ]
};

function matchPureCreatureSubcat(tag: string, catCode: string): string | null {
  const t = tag.toLowerCase();
  if (catCode === '3' || t.includes('(series)')) return null;
  if (t.includes('girl') || t.includes('boy') || t.includes('ears') || t.includes('tail') || t.includes('costume') || t.includes('print')) {
    return null;
  }
  if (t === 'open_fly' || t === 'dolphin_shorts' || t.includes('mole_')) return null;

  const parts = new Set(t.split('_'));
  for (const [subcat, keywords] of Object.entries(PURE_CREATURE_SUBCATS)) {
    if (keywords.some((kw) => kw === t || parts.has(kw))) {
      return subcat;
    }
  }
  return null;
}

const PROMPT_FLOW_MAPPING: Record<string, string[]> = {
  '1. Subject & Count': ['Character Count', 'People', 'Groups', 'Family Relationships', 'Gender Nonconformity', 'Transgender', 'Jobs'],
  '2. Characters & Series': [],
  '3. Animals & Creatures': Object.keys(PURE_CREATURE_SUBCATS),
  '4. Face & Hair': ['Face Tags', 'Eyes Tags', 'Hair Styles', 'Hair Color', 'Hair', 'Ears Tags', 'Makeup'],
  '5. Body & Physiology': ['Breasts Tags', 'Body Parts', 'Shoulders', 'Hands', 'Feet', 'Ass', 'Pussy', 'Skin Color', 'Wings', 'Covering', 'Nudity'],
  '6. Wardrobe & Outfit': ['Attire', 'Neck And Neckwear', 'Headwear', 'Eyewear', 'Handwear', 'Legwear', 'Sleeves', 'Accessories', 'Fashion Style', 'Sexual Attire', 'Prints'],
  '7. Pose & Action': ['Posture', 'Gestures', 'Holding Tags', 'Verbs And Gerunds', 'Dances', 'Sports'],
  '8. Props & Weapons': ['Sex Objects', 'Technology', 'Audio Tags', 'Food Tags', 'Cards', 'Board Games'],
  '9. Environment & Setting': ['Locations', 'Real World Locations', 'Backgrounds', 'Doors And Gates', 'Flowers', 'Water', 'Fire', 'Holidays And Celebrations'],
  '10. Camera & Composition': ['Image Composition', 'Focus Tags', 'Artistic License', 'Lighting', 'Colors', 'Patterns'],
  '11. Style & Aesthetics': ['Visual Aesthetic', 'Fine Art Parody', 'Drawing Software', 'Pixiv Projects', 'Video Game', 'Role-Playing Games', 'Fighting Games', 'Visual Novel Games', 'Shooter Games', 'Platform Games'],
  '12. Artists': [],
  '13. Themes, Lore & Adult': ['Symbols', 'Text', 'Phrases', 'Japanese Dialects', 'Year Tags', 'Sex Acts', 'Sexual Positions', 'Bdsm And Torture', 'Censorship', 'Simulated Sex Acts', 'Companies And Brand Names', 'History', 'Theme', 'Subjective', 'Metatags']
};

const DANBOORU_WIKI_GROUPS: Record<string, string[]> = {
  'Quality & Meta': ['Metatags'],
  'Attire & Clothing': ['Attire', 'Neck And Neckwear', 'Accessories', 'Headwear', 'Eyewear', 'Handwear', 'Fashion Style', 'Sleeves', 'Legwear', 'Prints', 'Sexual Attire'],
  'Face & Hair': ['Face Tags', 'Eyes Tags', 'Hair Styles', 'Hair', 'Makeup', 'Ears Tags', 'Hair Color'],
  'Body & Anatomy': ['Breasts Tags', 'Body Parts', 'Hands', 'Wings', 'Shoulders', 'Feet', 'Ass', 'Pussy', 'Skin Color', 'Covering'],
  'Poses & Actions': ['Holding Tags', 'Verbs And Gerunds', 'Posture', 'Gestures', 'Dances', 'Sports'],
  'Composition & Style': ['Image Composition', 'Artistic License', 'Lighting', 'Colors', 'Visual Aesthetic', 'Focus Tags', 'Patterns'],
  'Locations & Scenery': ['Locations', 'Real World Locations', 'Backgrounds', 'Doors And Gates', 'Water', 'Fire'],
  'Animals & Nature': [...Object.keys(PURE_CREATURE_SUBCATS), 'Flowers'],
  'Food & Beverage': ['Food Tags'],
  'Sex & Erotica': ['Sex Acts', 'Sex Objects', 'Sexual Positions', 'Bdsm And Torture', 'Nudity', 'Censorship', 'Simulated Sex Acts'],
  'Video Games': ['Role-Playing Games', 'Visual Novel Games', 'Fighting Games', 'Shooter Games', 'Platform Games', 'Video Game'],
  'Text & Lore': ['Symbols', 'Text', 'Phrases', 'Japanese Dialects', 'Year Tags'],
  'Audio & Music': ['Audio Tags'],
  'Society & Culture': ['Companies And Brand Names', 'Holidays And Celebrations', 'Jobs', 'History', 'Cards', 'Board Games', 'Drawing Software', 'Technology', 'Pixiv Projects', 'Fine Art Parody', 'Theme', 'Subjective']
};

const LEXICAL_STEP_RULES: [string, string[]][] = [
  ['1. Subject & Count', ['girl', 'boy', 'guy', 'woman', 'man', 'female', 'male', 'chibi', 'solo', 'couple', 'hetero', 'yuri', 'yaoi', 'maid', 'witch', 'princess', 'queen', 'nurse', 'nun', 'knight', 'samurai', 'ninja', 'vtuber', 'femboy', 'trap', 'elf', 'demon', 'angel', 'vampire']],
  ['4. Face & Hair', ['hair', 'bangs', 'ponytail', 'braid', 'twintails', 'ahoge', 'bun', 'bob', 'eyes', 'pupil', 'sclera', 'mouth', 'lips', 'teeth', 'fang', 'tongue', 'smile', 'blush', 'grin', 'smirk', 'pout', 'frown', 'tears', 'crying', 'sweat', 'ear', 'mole', 'freckle', 'makeup', 'lipstick', 'eyeshadow', 'wink']],
  ['5. Body & Physiology', ['breasts', 'cleavage', 'nipple', 'areola', 'underboob', 'sideboob', 'chest', 'belly', 'navel', 'stomach', 'abs', 'waist', 'hips', 'back', 'spine', 'collarbone', 'arms', 'armpit', 'hands', 'finger', 'palm', 'legs', 'thigh', 'knees', 'feet', 'toes', 'soles', 'barefoot', 'ass', 'butt', 'crotch', 'pussy', 'penis', 'horns', 'wings', 'tail', 'skin', 'tan']],
  ['6. Wardrobe & Outfit', ['shirt', 'blouse', 'top', 'sweater', 'hoodie', 'cardigan', 'vest', 'skirt', 'pants', 'shorts', 'jeans', 'dress', 'robe', 'kimono', 'yukata', 'jacket', 'coat', 'cape', 'cloak', 'underwear', 'panties', 'bra', 'bikini', 'swimsuit', 'leotard', 'thighhighs', 'socks', 'pantyhose', 'boots', 'shoes', 'sandals', 'sneakers', 'heels', 'hat', 'cap', 'beret', 'beanie', 'helmet', 'tiara', 'crown', 'headband', 'veil', 'glasses', 'sunglasses', 'eyepatch', 'mask', 'gloves', 'sleeves', 'collar', 'choker', 'necktie', 'bowtie', 'scarf', 'jewelry', 'necklace', 'earrings', 'bracelet', 'ring', 'belt', 'ribbon', 'bow', 'costume', 'uniform']],
  ['7. Pose & Action', ['standing', 'sitting', 'lying', 'kneeling', 'squatting', 'leaning', 'floating', 'flying', 'falling', 'jumping', 'walking', 'running', 'pose', 'holding', 'pointing', 'reaching', 'touching', 'grabbing', 'crossed', 'waving', 'peace', 'salute', 'eating', 'drinking', 'reading', 'writing', 'sleeping', 'dancing', 'cooking', 'fighting', 'swimming']],
  ['8. Props & Weapons', ['sword', 'blade', 'katana', 'knife', 'dagger', 'gun', 'pistol', 'rifle', 'shotgun', 'cannon', 'shield', 'bow', 'spear', 'staff', 'wand', 'phone', 'camera', 'book', 'cup', 'glass', 'bottle', 'box', 'bag', 'umbrella', 'parasol', 'clock', 'watch', 'mirror', 'candle', 'lamp', 'computer', 'instrument', 'guitar', 'piano', 'doll', 'plushie', 'pillow', 'bed', 'chair', 'table', 'car', 'vehicle', 'train', 'airplane', 'ship', 'boat', 'mecha', 'robot', 'tank', 'food', 'cake', 'candy']],
  ['9. Environment & Setting', ['room', 'indoor', 'bedroom', 'classroom', 'kitchen', 'office', 'door', 'window', 'floor', 'wall', 'outdoor', 'nature', 'landscape', 'scenery', 'sky', 'cloud', 'sun', 'moon', 'star', 'sunset', 'sunrise', 'tree', 'forest', 'grass', 'field', 'flower', 'mountain', 'beach', 'ocean', 'sea', 'water', 'lake', 'river', 'rain', 'snow', 'city', 'street', 'road', 'building', 'bridge', 'shrine', 'temple', 'castle']],
  ['10. Camera & Composition', ['above', 'below', 'profile', 'view', 'focus', 'angle', 'shot', 'lighting', 'sunlight', 'moonlight', 'shadow', 'silhouette', 'glow', 'sparkle', 'blur', 'bokeh', 'fire', 'flames', 'smoke', 'background', 'border', 'framed', 'cropped', 'monochrome', 'greyscale', 'color']]
];

const DANBOORU_CODE_MAP: Record<string, string> = {
  '0': 'General',
  '1': 'Artist',
  '3': 'Copyright',
  '4': 'Character',
  '5': 'Meta'
};

let activeMode: CategorizationMode = 'prompt_flow';
let activeSort: SortMode = 'alphabetical';

const hierarchies: Record<CategorizationMode, Record<string, Record<string, string[]>>> = {
  prompt_flow: {},
  rpg_slots: {},
  theme_genre: {},
  danbooru_types: {},
  danbooru_groups: {}
};

const tagMetaCaches: Record<CategorizationMode, Map<string, { parent: string; sub: string }>> = {
  prompt_flow: new Map(),
  rpg_slots: new Map(),
  theme_genre: new Map(),
  danbooru_types: new Map(),
  danbooru_groups: new Map()
};

let allCsvTagsList: string[] = [];
let tagDescriptions: Record<string, string> = {};
let tagIndex: AutocompleteItem[] = [];
const tagLookup = new Map<string, { count: number | null; category: string }>();

async function fetchAsset(p1: string, p2: string, type: 'json' | 'text') {
  try {
    const r = await fetch(p1);
    if (r.ok) return type === 'json' ? await r.json() : await r.text();
  } catch {}
  try {
    const r = await fetch(p2);
    if (r.ok) return type === 'json' ? await r.json() : await r.text();
  } catch {}
  return null;
}

function getAlphaBucket(tag: string): string {
  const first = (tag[0] || '#').toUpperCase();
  if (first >= 'A' && first <= 'C') return 'A-C';
  if (first >= 'D' && first <= 'F') return 'D-F';
  if (first >= 'G' && first <= 'I') return 'G-I';
  if (first >= 'J' && first <= 'L') return 'J-L';
  if (first >= 'M' && first <= 'O') return 'M-O';
  if (first >= 'P' && first <= 'R') return 'P-R';
  if (first >= 'S' && first <= 'U') return 'S-U';
  if (first >= 'V' && first <= 'Z') return 'V-Z';
  return '0-9 & Other';
}

function parseCsv(csvText: string) {
  const lines = csvText.split('\n');
  const items: AutocompleteItem[] = [];
  const allTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    const rawTag = parts[0]?.trim();
    if (!rawTag || isMeaninglessTag(rawTag)) continue;

    const catCode = parts[1]?.trim() || '0';
    const categoryName = DANBOORU_CODE_MAP[catCode] || 'General';
    const count = parts[2] ? parseInt(parts[2].trim(), 10) : null;

    allTags.push(rawTag);
    items.push({ tag: rawTag, count: isNaN(count!) ? null : count, category: categoryName });

    const keyNorm = rawTag.toLowerCase().replace(/\s+/g, '_');
    const keySpace = rawTag.toLowerCase().replace(/_/g, ' ');
    tagLookup.set(keyNorm, { count, category: categoryName });
    tagLookup.set(keySpace, { count, category: categoryName });
  }

  allCsvTagsList = allTags;
  tagIndex = items;
}

function buildPromptFlowHierarchy(rawJson: any) {
  const rawTags: Record<string, string> = rawJson?.tags || {};
  const subcatToTags: Record<string, string[]> = {};
  const metaMap = tagMetaCaches['prompt_flow'];
  metaMap.clear();

  for (const [tag, subcat] of Object.entries(rawTags)) {
    if (isMeaninglessTag(tag)) continue;
    if (!subcatToTags[subcat]) subcatToTags[subcat] = [];
    subcatToTags[subcat].push(tag);
  }

  const clean: Record<string, Record<string, string[]>> = {};

  for (const [stepName, subs] of Object.entries(PROMPT_FLOW_MAPPING)) {
    clean[stepName] = {};
    for (const sub of subs) {
      if (stepName === '3. Animals & Creatures') {
        clean[stepName][sub] = [];
      } else {
        clean[stepName][sub] = subcatToTags[sub] ? [...subcatToTags[sub]] : [];
        clean[stepName][sub].forEach((t) => {
          metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: stepName, sub });
        });
      }
    }
  }

  clean['2. Characters & Series'] = {};
  clean['12. Artists'] = {};
  clean['13. Themes, Lore & Adult']['General Concepts (50k+)'] = [];
  clean['13. Themes, Lore & Adult']['General Concepts (10k+)'] = [];
  clean['13. Themes, Lore & Adult']['General Concepts (<10k)'] = [];

  const charSeriesCounts: Record<string, number> = {};
  const charBySeries: Record<string, string[]> = {};
  const charByAlpha: Record<string, string[]> = {};

  for (const item of tagIndex) {
    const rawTag = item.tag;
    const keyNorm = rawTag.toLowerCase().replace(/\s+/g, '_');
    const alpha = getAlphaBucket(rawTag);
    const count = item.count || 0;

    if (item.category === 'Artist') {
      if (!clean['12. Artists'][alpha]) clean['12. Artists'][alpha] = [];
      clean['12. Artists'][alpha].push(rawTag);
      metaMap.set(keyNorm, { parent: '12. Artists', sub: alpha });
      continue;
    }

    if (item.category === 'Copyright') {
      const parentName = '2. Characters & Series';
      const subName = `Series (${alpha})`;
      if (!clean[parentName][subName]) clean[parentName][subName] = [];
      clean[parentName][subName].push(rawTag);
      metaMap.set(keyNorm, { parent: parentName, sub: subName });
      continue;
    }

    if (item.category === 'Character') {
      const match = rawTag.match(/\(([^)]+)\)$/);
      if (match) {
        const s = match[1].replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        charSeriesCounts[s] = (charSeriesCounts[s] || 0) + 1;
        if (!charBySeries[s]) charBySeries[s] = [];
        charBySeries[s].push(rawTag);
      } else {
        if (!charByAlpha[alpha]) charByAlpha[alpha] = [];
        charByAlpha[alpha].push(rawTag);
      }
      continue;
    }

    const creatureSub = matchPureCreatureSubcat(rawTag, '0');
    if (creatureSub) {
      if (!clean['3. Animals & Creatures'][creatureSub]) {
        clean['3. Animals & Creatures'][creatureSub] = [];
      }
      clean['3. Animals & Creatures'][creatureSub].push(rawTag);
      metaMap.set(keyNorm, { parent: '3. Animals & Creatures', sub: creatureSub });
      continue;
    }

    if (metaMap.has(keyNorm)) continue;

    const parts = new Set(keyNorm.split('_'));
    let matched = false;

    for (const [stepName, keywords] of LEXICAL_STEP_RULES) {
      if (keywords.some((kw) => parts.has(kw) || keyNorm.endsWith('_' + kw) || keyNorm.startsWith(kw + '_'))) {
        const subName = clean[stepName] ? Object.keys(clean[stepName])[0] || 'General' : 'General';
        if (!clean[stepName][subName]) clean[stepName][subName] = [];
        clean[stepName][subName].push(rawTag);
        metaMap.set(keyNorm, { parent: stepName, sub: subName });
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (count >= 50000) {
        clean['13. Themes, Lore & Adult']['General Concepts (50k+)'].push(rawTag);
        metaMap.set(keyNorm, { parent: '13. Themes, Lore & Adult', sub: 'General Concepts (50k+)' });
      } else if (count >= 10000) {
        clean['13. Themes, Lore & Adult']['General Concepts (10k+)'].push(rawTag);
        metaMap.set(keyNorm, { parent: '13. Themes, Lore & Adult', sub: 'General Concepts (10k+)' });
      } else {
        clean['13. Themes, Lore & Adult']['General Concepts (<10k)'].push(rawTag);
        metaMap.set(keyNorm, { parent: '13. Themes, Lore & Adult', sub: 'General Concepts (<10k)' });
      }
    }
  }

  // Fallback: If rawJson categories weren't formatted as expected, ensure all CSV tags are mapped into Prompt-Flow categories
  if (Object.keys(rawTags).length === 0 && allCsvTagsList.length > 0) {
    for (const rawTag of allCsvTagsList) {
      const keyNorm = rawTag.toLowerCase().replace(/\s+/g, '_');
      if (metaMap.has(keyNorm)) continue;
      const count = tagLookup.get(keyNorm)?.count || 0;
      const targetSub = count >= 50000 ? 'General Concepts (50k+)' : 'General Concepts (<10k)';
      if (!clean['13. Themes, Lore & Adult'][targetSub]) {
        clean['13. Themes, Lore & Adult'][targetSub] = [];
      }
      clean['13. Themes, Lore & Adult'][targetSub].push(rawTag);
      metaMap.set(keyNorm, { parent: '13. Themes, Lore & Adult', sub: targetSub });
    }
  }

  const topFranchises = Object.entries(charSeriesCounts)
    .filter(([_, cnt]) => cnt >= 150)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  topFranchises.forEach((franchise) => {
    clean['2. Characters & Series'][franchise] = charBySeries[franchise];
    charBySeries[franchise].forEach((t) => {
      metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: '2. Characters & Series', sub: franchise });
    });
  });

  for (const [alpha, tags] of Object.entries(charByAlpha)) {
    const subName = `Chars (${alpha})`;
    clean['2. Characters & Series'][subName] = tags;
    tags.forEach((t) => {
      metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: '2. Characters & Series', sub: subName });
    });
  }

  for (const parent of Object.keys(clean)) {
    for (const sub of Object.keys(clean[parent])) {
      if (clean[parent][sub].length === 0) delete clean[parent][sub];
    }
    if (Object.keys(clean[parent]).length === 0) delete clean[parent];
  }

  hierarchies['prompt_flow'] = clean;
}

function buildDanbooruTypesHierarchy(rawJson: any) {
  const rawTags: Record<string, string> = rawJson?.tags || {};
  const subcatToTags: Record<string, string[]> = {};
  const metaMap = tagMetaCaches['danbooru_types'];
  metaMap.clear();

  for (const [tag, subcat] of Object.entries(rawTags)) {
    if (isMeaninglessTag(tag)) continue;
    if (!subcatToTags[subcat]) subcatToTags[subcat] = [];
    subcatToTags[subcat].push(tag);
  }

  const clean: Record<string, Record<string, string[]>> = {
    'General': {},
    'Character': {},
    'Copyright': {},
    'Artist': {},
    'Meta': {}
  };

  for (const [subName, tags] of Object.entries(subcatToTags)) {
    clean['General'][subName] = tags;
    tags.forEach((t) => {
      metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: 'General', sub: subName });
    });
  }

  const charSeriesCounts: Record<string, number> = {};
  const charBySeries: Record<string, string[]> = {};
  const charByAlpha: Record<string, string[]> = {};
  const artistByAlpha: Record<string, string[]> = {};
  const copyrightByAlpha: Record<string, string[]> = {};
  const metaTagsList: string[] = [];

  for (const item of tagIndex) {
    const rawTag = item.tag;
    const keyNorm = rawTag.toLowerCase().replace(/\s+/g, '_');
    const alpha = getAlphaBucket(rawTag);

    if (item.category === 'Character') {
      const match = rawTag.match(/\(([^)]+)\)$/);
      if (match) {
        const series = match[1].replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        charSeriesCounts[series] = (charSeriesCounts[series] || 0) + 1;
        if (!charBySeries[series]) charBySeries[series] = [];
        charBySeries[series].push(rawTag);
      } else {
        if (!charByAlpha[alpha]) charByAlpha[alpha] = [];
        charByAlpha[alpha].push(rawTag);
      }
    } else if (item.category === 'Artist') {
      if (!artistByAlpha[alpha]) artistByAlpha[alpha] = [];
      artistByAlpha[alpha].push(rawTag);
      metaMap.set(keyNorm, { parent: 'Artist', sub: alpha });
    } else if (item.category === 'Copyright') {
      if (!copyrightByAlpha[alpha]) copyrightByAlpha[alpha] = [];
      copyrightByAlpha[alpha].push(rawTag);
      metaMap.set(keyNorm, { parent: 'Copyright', sub: alpha });
    } else if (item.category === 'Meta') {
      metaTagsList.push(rawTag);
      metaMap.set(keyNorm, { parent: 'Meta', sub: 'Technical & Medium' });
    }
  }

  // Fallback: If rawTags were empty, populate General from allCsvTagsList
  if (Object.keys(rawTags).length === 0 && allCsvTagsList.length > 0) {
    clean['General']['All Tags'] = allCsvTagsList;
  }

  const topSeries = Object.entries(charSeriesCounts)
    .filter(([_, count]) => count >= 150)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  topSeries.forEach((series) => {
    clean['Character'][series] = charBySeries[series];
    charBySeries[series].forEach((t) => {
      metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: 'Character', sub: series });
    });
  });

  for (const [alpha, tags] of Object.entries(charByAlpha)) {
    clean['Character'][alpha] = tags;
    tags.forEach((t) => {
      metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: 'Character', sub: alpha });
    });
  }

  clean['Artist'] = artistByAlpha;
  clean['Copyright'] = copyrightByAlpha;
  clean['Meta'] = { 'Technical & Medium': metaTagsList };

  hierarchies['danbooru_types'] = clean;
}

function buildDanbooruGroupsHierarchy(rawJson: any) {
  const rawTags: Record<string, string> = rawJson?.tags || {};
  const subcatToTags: Record<string, string[]> = {};
  const metaMap = tagMetaCaches['danbooru_groups'];
  metaMap.clear();

  for (const [tag, subcat] of Object.entries(rawTags)) {
    if (isMeaninglessTag(tag)) continue;
    if (!subcatToTags[subcat]) subcatToTags[subcat] = [];
    subcatToTags[subcat].push(tag);
  }

  const clean: Record<string, Record<string, string[]>> = {};

  for (const [parentName, subs] of Object.entries(DANBOORU_WIKI_GROUPS)) {
    clean[parentName] = {};
    for (const sub of subs) {
      if (parentName === 'Animals & Nature' && sub in PURE_CREATURE_SUBCATS) {
        clean[parentName][sub] = [];
      } else {
        clean[parentName][sub] = subcatToTags[sub] ? [...subcatToTags[sub]] : [];
        clean[parentName][sub].forEach((t) => {
          metaMap.set(t.toLowerCase().replace(/\s+/g, '_'), { parent: parentName, sub });
        });
      }
    }
  }

  for (const item of tagIndex) {
    const rawTag = item.tag;
    const keyNorm = rawTag.toLowerCase().replace(/\s+/g, '_');
    const creatureSub = matchPureCreatureSubcat(rawTag, '0');
    if (creatureSub && clean['Animals & Nature']) {
      if (!clean['Animals & Nature'][creatureSub]) clean['Animals & Nature'][creatureSub] = [];
      clean['Animals & Nature'][creatureSub].push(rawTag);
      metaMap.set(keyNorm, { parent: 'Animals & Nature', sub: creatureSub });
    }
  }

  hierarchies['danbooru_groups'] = clean;
}

function getHierarchyStats() {
  const hierarchy = hierarchies[activeMode] || {};
  const specificParents = Object.keys(hierarchy).filter((p) => {
    const pObj = hierarchy[p];
    if (!pObj) return false;
    const set = new Set<string>();
    Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
    return set.size > 0;
  });

  const parentCategories = ['All', ...specificParents];
  const parentCounts: Record<string, number> = {};
  const subCounts: Record<string, Record<string, number>> = {};

  const totalInMode = activeMode === 'danbooru_groups'
    ? specificParents.reduce((acc, p) => {
        const pObj = hierarchy[p] || {};
        const set = new Set<string>();
        Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
        return acc + set.size;
      }, 0)
    : allCsvTagsList.length;

  parentCounts['All'] = totalInMode;
  subCounts['All'] = { 'All': totalInMode };

  specificParents.forEach((parent) => {
    const pObj = hierarchy[parent] || {};
    const set = new Set<string>();
    subCounts[parent] = {};

    Object.entries(pObj).forEach(([sub, arr]) => {
      subCounts[parent][sub] = arr.length;
      arr.forEach((t) => set.add(t));
    });

    parentCounts[parent] = set.size;
    subCounts[parent]['All'] = set.size;
  });

  return { parentCategories, parentCounts, subCounts };
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  if (type === 'INIT') {
    if (payload?.mode) activeMode = payload.mode;
    if (payload?.sort) activeSort = payload.sort;

    const [catRaw, descRaw, csvText] = await Promise.all([
      fetchAsset('/data/danbooru_categories.json', '/danbooru_categories.json', 'json'),
      fetchAsset('/data/tag_descriptions.json', '/tag_descriptions.json', 'json'),
      fetchAsset('/data/danbooru.csv', '/danbooru.csv', 'text')
    ]);

    if (descRaw) tagDescriptions = descRaw;
    if (csvText) parseCsv(csvText);

    buildPromptFlowHierarchy(catRaw);
    buildDanbooruTypesHierarchy(catRaw);
    buildDanbooruGroupsHierarchy(catRaw);

    self.postMessage({ id, success: true, data: getHierarchyStats() });
    return;
  }

  if (type === 'SET_MODE') {
    activeMode = payload.mode;
    self.postMessage({ id, success: true, data: getHierarchyStats() });
    return;
  }

  if (type === 'SET_SORT') {
    activeSort = payload.sort;
    self.postMessage({ id, success: true, data: true });
    return;
  }

  if (type === 'GET_RANDOM_TAGS') {
    const { parent, count = 2 } = payload;
    const hierarchy = hierarchies[activeMode] || {};
    let pool: string[] = [];

    if (parent === 'All' || !hierarchy[parent]) {
      pool = allCsvTagsList.slice(0, 5000);
    } else {
      const set = new Set<string>();
      Object.values(hierarchy[parent]).forEach((arr) => arr.forEach((t) => set.add(t)));
      pool = Array.from(set);
    }

    const picked: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
    }

    self.postMessage({ id, success: true, data: picked });
    return;
  }

  if (type === 'SEARCH') {
    const { query, limit = 8 } = payload;
    const q = (query || '').toLowerCase().trim().replace(/\s+/g, '_');
    const qSpace = q.replace(/_/g, ' ');
    if (!q) {
      self.postMessage({ id, success: true, data: [] });
      return;
    }

    const matches: AutocompleteItem[] = [];
    for (const item of tagIndex) {
      const norm = item.tag.toLowerCase();
      const normSpace = norm.replace(/_/g, ' ');
      if (norm.includes(q) || normSpace.includes(qSpace)) {
        matches.push(item);
        if (matches.length >= limit) break;
      }
    }
    self.postMessage({ id, success: true, data: matches });
    return;
  }

  if (type === 'GET_TAGS') {
    const { parent, sub, search = '', limit = 300 } = payload;
    const hierarchy = hierarchies[activeMode] || {};
    let list: string[] = [];

    if (parent === 'All') {
      if (activeMode === 'danbooru_groups') {
        const set = new Set<string>();
        Object.values(hierarchy).forEach((pObj) => {
          Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
        });
        list = Array.from(set);
      } else {
        list = allCsvTagsList;
      }
    } else if (activeMode === 'danbooru_types' && sub === 'All') {
      list = tagIndex.filter((item) => item.category === parent).map((item) => item.tag);
    } else {
      const pObj = hierarchy[parent];
      if (pObj) {
        if (sub === 'All') {
          const set = new Set<string>();
          Object.values(pObj).forEach((arr) => arr.forEach((t) => set.add(t)));
          list = Array.from(set);
        } else {
          list = pObj[sub] || [];
        }
      }
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase().replace(/\s+/g, '_');
      const qSpace = q.replace(/_/g, ' ');
      list = list.filter((t) => {
        const lower = t.toLowerCase();
        const lowerSpace = lower.replace(/_/g, ' ');
        return lower.includes(q) || lowerSpace.includes(qSpace);
      });
    }

    const sorted = list
      .sort((a, b) => {
        if (activeSort === 'alphabetical') {
          return a.localeCompare(b);
        }
        const countA = tagLookup.get(a.toLowerCase().replace(/\s+/g, '_'))?.count || 0;
        const countB = tagLookup.get(b.toLowerCase().replace(/\s+/g, '_'))?.count || 0;
        return countB - countA;
      })
      .slice(0, limit);

    self.postMessage({ id, success: true, data: sorted });
    return;
  }

  if (type === 'GET_DETAIL') {
    const { tag, currentParent, currentSub } = payload;
    const keyNorm = tag.toLowerCase().replace(/\s+/g, '_');
    const metaMap = tagMetaCaches[activeMode];
    const meta = metaMap.get(keyNorm) || {
      parent: currentParent || 'General',
      sub: currentSub && currentSub !== 'All' ? currentSub : 'General'
    };

    const detail: TagDetail = {
      tag,
      description: tagDescriptions[keyNorm] || null,
      postCount: tagLookup.get(keyNorm)?.count ?? null,
      parentCategory: currentParent || meta.parent,
      subCategory: currentSub && currentSub !== 'All' ? currentSub : meta.sub
    };

    self.postMessage({ id, success: true, data: detail });
    return;
  }

  if (type === 'GET_COUNT') {
    const { tag } = payload;
    const keyNorm = tag.toLowerCase().replace(/\s+/g, '_');
    const count = tagLookup.get(keyNorm)?.count ?? null;
    self.postMessage({ id, success: true, data: count });
  }
};