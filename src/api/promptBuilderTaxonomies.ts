import type { TagRecord, CategoryPath } from './tagTaxonomy';
import { cleanKey, classifyTagDetailed } from '../tagging/classifier';
import promptAllInOneDefaultTaxonomy from '../data/promptAllInOneDefaultTaxonomy.json';

export type BuilderTaxonomyId = 'prompt_flow' | 'semantic' | 'anima_roles' | 'prompt_all_in_one' | 'prompt_all_in_one_default' | 'danbooru_types' | 'danbooru_groups';
export type BuilderFilter = 'all' | 'sfw' | 'nsfw';

export interface BuilderTaxonomyDefinition {
  id: BuilderTaxonomyId;
  label: string;
  description: string;
}

export const BUILDER_TAXONOMIES: BuilderTaxonomyDefinition[] = [
  {
    id: 'semantic',
    label: 'Semantic · Strict (recommended)',
    description: 'Strict subject, appearance, body, clothing, action, pose, interaction, scene and technical routing. Tags are placed from their Danbooru wiki category first, with narrow fallbacks only when category metadata is unavailable.',
  },
  {
    id: 'prompt_flow',
    label: 'Prompt Pills · Refined',
    description: 'A Prompt Pills-style flow with the same strict semantic routing, while keeping familiar SwarmCanvas areas such as Person, Apparel, Actions, Image, Environment and Items.',
  },
  {
    id: 'anima_roles',
    label: 'Anima Prompt Roles',
    description: 'A compact Anima-oriented view that groups strict semantic placements into Character, Action & Pose, Framing, Scene, Style, Adult and Technical roles.',
  },
  {
    id: 'prompt_all_in_one',
    label: 'SD WebUI · Prompt All in One',
    description: 'The Prompt All in One extension hierarchy: Person, Apparel, Facial expression and action, Image, Environment, Scene, Items, Camera, Hanfu and Negative Prompt, with broad local classification for the complete tag library.',
  },
  {
    id: 'prompt_all_in_one_default',
    label: 'SD WebUI · Prompt All in One (default.yaml)',
    description: 'Uses the exact groups, subgroup names, and curated tag placements from the bundled Prompt All in One default.yaml, then locally classifies tags not listed in that file into the same hierarchy.',
  },
  {
    id: 'danbooru_types',
    label: 'Danbooru Native Types',
    description: 'Native Danbooru type classification: General, Artist, Character, Copyright and Meta.',
  },
  {
    id: 'danbooru_groups',
    label: 'Danbooru Wiki Groups',
    description: 'Danbooru wiki groups plus semantic routing for native General tags, so the builder never leaves a large uncategorized General bucket.',
  },
];

export interface BuilderPlacement {
  parent: string;
  sub: string;
  leaf?: string;
}

const PATH = {
  subject: 'Subject',
  appearance: 'Appearance',
  body: 'Body',
  clothing: 'Clothing',
  actions: 'Actions',
  pose: 'Pose',
  interaction: 'Interaction',
  composition: 'Composition',
  camera: 'Camera',
  environment: 'Environment',
  scene: 'Scene',
  objects: 'Objects',
  style: 'Style',
  concepts: 'Concepts & Lore',
  technical: 'Technical',
  nsfw: 'NSFW & Adult',
} as const;

const ACTION_WIKI_CATEGORIES = new Set([
  'Gestures',
  'Holding Tags',
  'Verbs And Gerunds',
  'Dances',
  'Sports',
  'Sex Acts',
  'Simulated Sex Acts',
  'Bdsm And Torture',
]);

const POSE_WIKI_CATEGORIES = new Set(['Posture', 'Sexual Positions']);

const CATEGORY_MAP: Record<string, BuilderPlacement> = {
  'Character Count': { parent: PATH.subject, sub: 'People', leaf: 'Character count' },
  'Groups': { parent: PATH.subject, sub: 'People', leaf: 'Group composition' },
  'Birds': { parent: 'Creatures & Animals', sub: 'Birds', leaf: 'Bird / avian' },
  'Cats': { parent: 'Creatures & Animals', sub: 'Felines', leaf: 'Cat / feline' },
  'Dogs': { parent: 'Creatures & Animals', sub: 'Canines', leaf: 'Dog / canine' },
  'Legendary Creatures': { parent: 'Creatures & Animals', sub: 'Mythical creatures', leaf: 'Legendary / mythical creature' },
  'Dances': { parent: PATH.actions, sub: 'Full body', leaf: 'Dance' },
  'Gestures': { parent: PATH.actions, sub: 'Arms & hands', leaf: 'Gesture' },
  'Holding Tags': { parent: PATH.actions, sub: 'Object interaction', leaf: 'Holding / carrying' },
  'Posture': { parent: PATH.pose, sub: 'Full body', leaf: 'Base posture / position' },
  'Sex Acts': { parent: PATH.actions, sub: 'Full body', leaf: 'Adult activity' },
  'Simulated Sex Acts': { parent: PATH.actions, sub: 'Full body', leaf: 'Suggestive / simulated activity' },
  'Sexual Positions': { parent: PATH.pose, sub: 'Full body', leaf: 'Adult / sexual position' },
  'Sex Objects': { parent: PATH.objects, sub: 'Adult objects', leaf: 'Sex object / accessory' },
  'Bdsm And Torture': { parent: PATH.actions, sub: 'Restraint & discipline', leaf: 'BDSM / restraint' },
  'Censorship': { parent: PATH.body, sub: 'Body state', leaf: 'Censorship / covering' },
  'Nudity': { parent: PATH.body, sub: 'Body state', leaf: 'Nudity / exposure' },
  'Verbs And Gerunds': { parent: PATH.actions, sub: 'Full body', leaf: 'Activity / action' },
  'Sports': { parent: PATH.actions, sub: 'Full body', leaf: 'Sport / athletic activity' },
  'People': { parent: PATH.subject, sub: 'People', leaf: 'Count / identity' },
  'Family Relationships': { parent: PATH.subject, sub: 'Relationships', leaf: 'Family / social role' },
  'Gender Nonconformity': { parent: PATH.subject, sub: 'Gender & presentation', leaf: 'Gender expression' },
  'Transgender': { parent: PATH.subject, sub: 'Gender & presentation', leaf: 'Gender identity tags' },
  'Jobs': { parent: PATH.subject, sub: 'Roles & occupations', leaf: 'Occupation' },
  'Face Tags': { parent: PATH.appearance, sub: 'Face', leaf: 'Feature / expression' },
  'Eyes Tags': { parent: PATH.appearance, sub: 'Eyes', leaf: 'Shape / color / detail' },
  'Hair Styles': { parent: PATH.appearance, sub: 'Hair', leaf: 'Style / structure' },
  'Hair': { parent: PATH.appearance, sub: 'Hair', leaf: 'General hair' },
  'Hair Color': { parent: PATH.appearance, sub: 'Hair', leaf: 'Color' },
  'Makeup': { parent: PATH.appearance, sub: 'Face', leaf: 'Makeup' },
  'Ears Tags': { parent: PATH.appearance, sub: 'Ears', leaf: 'Human / fantasy ears' },
  'Skin Color': { parent: PATH.appearance, sub: 'Skin', leaf: 'Color / tone' },
  'Breasts Tags': { parent: PATH.body, sub: 'Chest & torso', leaf: 'Breasts / chest anatomy' },
  'Shoulders': { parent: PATH.body, sub: 'Chest & torso', leaf: 'Shoulders / upper torso' },
  'Hands': { parent: PATH.body, sub: 'Arms & hands', leaf: 'Hands / fingers' },
  'Feet': { parent: PATH.body, sub: 'Legs & feet', leaf: 'Feet / toes' },
  'Body Parts': { parent: PATH.body, sub: 'Body parts', leaf: 'Regional anatomy' },
  'Wings': { parent: PATH.body, sub: 'Fantasy anatomy', leaf: 'Wings' },
  'Covering': { parent: PATH.body, sub: 'Body state', leaf: 'Coverage / concealment' },
  'Ass': { parent: PATH.body, sub: 'Hips & lower body', leaf: 'Buttocks / lower body' },
  'Pussy': { parent: PATH.body, sub: 'Genital anatomy', leaf: 'External anatomy' },
  'Attire': { parent: PATH.clothing, sub: 'Garments', leaf: 'General garments' },
  'Neck And Neckwear': { parent: PATH.clothing, sub: 'Neckwear', leaf: 'Scarves / ties / chokers' },
  'Headwear': { parent: PATH.clothing, sub: 'Headwear', leaf: 'Hats / head coverings' },
  'Eyewear': { parent: PATH.clothing, sub: 'Eyewear', leaf: 'Glasses / eye accessories' },
  'Handwear': { parent: PATH.clothing, sub: 'Handwear', leaf: 'Gloves / hand coverings' },
  'Legwear': { parent: PATH.clothing, sub: 'Legwear', leaf: 'Socks / stockings / hosiery' },
  'Sleeves': { parent: PATH.clothing, sub: 'Garment construction', leaf: 'Sleeves' },
  'Accessories': { parent: PATH.clothing, sub: 'Accessories', leaf: 'Jewelry / bags / ornaments' },
  'Fashion Style': { parent: PATH.clothing, sub: 'Fashion styles', leaf: 'Style / subculture' },
  'Sexual Attire': { parent: PATH.clothing, sub: 'Adult attire', leaf: 'Sexual / fetish attire' },
  'Prints': { parent: PATH.clothing, sub: 'Garment details', leaf: 'Patterns / prints' },
  'Image Composition': { parent: PATH.composition, sub: 'Framing & layout', leaf: 'Composition' },
  'Focus Tags': { parent: PATH.camera, sub: 'Focus & depth', leaf: 'Focus / depth of field' },
  'Artistic License': { parent: PATH.style, sub: 'Stylization', leaf: 'Artistic treatment' },
  'Lighting': { parent: PATH.composition, sub: 'Lighting', leaf: 'Light / shadow' },
  'Colors': { parent: PATH.style, sub: 'Color & palette', leaf: 'Color treatment' },
  'Patterns': { parent: PATH.style, sub: 'Patterns & visual motifs', leaf: 'Pattern' },
  'Visual Aesthetic': { parent: PATH.style, sub: 'Visual aesthetic', leaf: 'Aesthetic / medium' },
  'Fine Art Parody': { parent: PATH.style, sub: 'Art references', leaf: 'Fine art / parody' },
  'Drawing Software': { parent: PATH.style, sub: 'Software / medium', leaf: 'Digital art software' },
  'Pixiv Projects': { parent: PATH.technical, sub: 'Projects & metadata', leaf: 'Pixiv project' },
  'Technology': { parent: PATH.objects, sub: 'Technology', leaf: 'Devices / machinery' },
  'Audio Tags': { parent: PATH.objects, sub: 'Audio & instruments', leaf: 'Music / audio' },
  'Food Tags': { parent: PATH.objects, sub: 'Food & beverage', leaf: 'Food / drink' },
  'Cards': { parent: PATH.objects, sub: 'Games & play', leaf: 'Cards' },
  'Board Games': { parent: PATH.objects, sub: 'Games & play', leaf: 'Board games' },
  'Flowers': { parent: PATH.environment, sub: 'Nature', leaf: 'Flowers / plants' },
  'Water': { parent: PATH.environment, sub: 'Nature', leaf: 'Water / aquatic setting' },
  'Fire': { parent: PATH.environment, sub: 'Atmospheric elements', leaf: 'Fire / flame / smoke' },
  'Locations': { parent: PATH.environment, sub: 'Locations', leaf: 'Place / setting' },
  'Real World Locations': { parent: PATH.environment, sub: 'Locations', leaf: 'Real-world place' },
  'Backgrounds': { parent: PATH.environment, sub: 'Background', leaf: 'Background scenery' },
  'Doors And Gates': { parent: PATH.environment, sub: 'Architecture', leaf: 'Doors / gates' },
  'Holidays And Celebrations': { parent: PATH.environment, sub: 'Events & time', leaf: 'Holiday / celebration' },
  'Companies And Brand Names': { parent: PATH.subject, sub: 'Brands & companies', leaf: 'Brand / company' },
  'Symbols': { parent: PATH.concepts, sub: 'Symbols & text', leaf: 'Symbol' },
  'Text': { parent: PATH.concepts, sub: 'Symbols & text', leaf: 'Text' },
  'Phrases': { parent: PATH.concepts, sub: 'Symbols & text', leaf: 'Phrase / wording' },
  'Japanese Dialects': { parent: PATH.concepts, sub: 'Language', leaf: 'Dialect / speech' },
  'Year Tags': { parent: PATH.environment, sub: 'Events & time', leaf: 'Year / era' },
  'History': { parent: PATH.concepts, sub: 'Lore & history', leaf: 'Historical context' },
  'Theme': { parent: PATH.concepts, sub: 'Themes', leaf: 'Theme' },
  'Subjective': { parent: PATH.concepts, sub: 'Themes', leaf: 'Subjective / qualitative concept' },
  'Metatags': { parent: PATH.technical, sub: 'Metadata', leaf: 'Danbooru metatag' },
  'General Concepts (50k+)': { parent: PATH.concepts, sub: 'General concepts', leaf: '50k+ popularity band' },
  'General Concepts (10k+)': { parent: PATH.concepts, sub: 'General concepts', leaf: '10k+ popularity band' },
  'General Concepts (<10k)': { parent: PATH.concepts, sub: 'General concepts', leaf: '<10k popularity band' },
  'General Concepts (Other)': { parent: PATH.concepts, sub: 'General concepts', leaf: 'Other / low-frequency concept' },
  'Role-Playing Games': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Role-playing games' },
  'Visual Novel Games': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Visual novels' },
  'Fighting Games': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Fighting games' },
  'Shooter Games': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Shooters' },
  'Platform Games': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Platformers' },
  'Video Game': { parent: PATH.subject, sub: 'Games & franchises', leaf: 'Video games' },
  'Audio & Music': { parent: PATH.objects, sub: 'Audio & instruments', leaf: 'Music / audio' },
};

const NSFW_WIKI_TO_PLACEMENT: Record<string, BuilderPlacement> = {
  'Nudity': { parent: PATH.nsfw, sub: 'Nudity & exposure', leaf: 'Exposure / clothing state' },
  'Censorship': { parent: PATH.nsfw, sub: 'Nudity & censorship', leaf: 'Censorship / covering' },
  'Breasts Tags': { parent: PATH.nsfw, sub: 'Adult anatomy', leaf: 'Chest / breasts' },
  'Ass': { parent: PATH.nsfw, sub: 'Adult anatomy', leaf: 'Buttocks / lower body' },
  'Pussy': { parent: PATH.nsfw, sub: 'Adult anatomy', leaf: 'Genital anatomy' },
  'Sex Acts': { parent: PATH.nsfw, sub: 'Sex acts', leaf: 'Sexual activity' },
  'Simulated Sex Acts': { parent: PATH.nsfw, sub: 'Sex acts', leaf: 'Suggestive / simulated activity' },
  'Sexual Positions': { parent: PATH.nsfw, sub: 'Adult poses', leaf: 'Sexual position' },
  'Sex Objects': { parent: PATH.nsfw, sub: 'Adult objects', leaf: 'Sex object / accessory' },
  'Sexual Attire': { parent: PATH.nsfw, sub: 'Adult attire', leaf: 'Sexual / fetish attire' },
  'Bdsm And Torture': { parent: PATH.nsfw, sub: 'BDSM & restraint', leaf: 'Restraint / discipline' },
};

const SEMANTIC_PARENT_ORDER = [
  PATH.subject,
  'Creatures & Animals',
  PATH.appearance,
  PATH.body,
  PATH.clothing,
  PATH.actions,
  PATH.pose,
  PATH.interaction,
  PATH.composition,
  PATH.camera,
  PATH.environment,
  PATH.scene,
  PATH.objects,
  PATH.style,
  PATH.concepts,
  PATH.nsfw,
  PATH.technical,
  'General',
];

const PROMPT_FLOW_PARENT_ORDER = [
  'Person',
  'Animals & Creatures',
  'Body',
  'Apparel',
  'Actions',
  'Pose',
  'Image',
  'Camera',
  'Environment',
  'Scene',
  'Items',
  'Style',
  'NSFW & Adult',
  'Technical',
  'General',
];

function has(t: string, words: string[]) {
  return words.some((word) => {
    const w = cleanKey(word);
    return t === w || t.startsWith(`${w}_`) || t.endsWith(`_${w}`) || t.includes(`_${w}_`);
  });
}

function lexicalActionPlacement(tag: string): BuilderPlacement | null {
  const t = cleanKey(tag);
  const actionVerb = has(t, [
    'adjust', 'adjusting', 'touch', 'touching', 'grab', 'grabbing', 'hold', 'holding', 'carry', 'carrying',
    'caress', 'caressing', 'fondle', 'fondling', 'grope', 'groping', 'squeeze', 'squeezing', 'lift', 'lifting',
    'pull', 'pulling', 'push', 'pushing', 'press', 'pressing', 'rub', 'rubbing', 'slap', 'slapping', 'pinch',
    'biting', 'licking', 'sucking', 'kissing', 'hugging', 'waving', 'pointing', 'salute', 'saluting',
    'covering', 'exposing', 'undressing', 'unbuttoning', 'opening', 'closing', 'reaching', 'crossing', 'crossed', 'clasped',
    'eating', 'drinking', 'reading', 'writing', 'cooking', 'singing', 'sleeping', 'working', 'studying', 'smoking',
    'walking', 'running', 'jumping', 'falling', 'flying', 'floating', 'swimming', 'stretching', 'spinning',
    'skipping', 'crawling', 'climbing', 'riding', 'using', 'playing', 'fighting', 'dancing', 'looking', 'staring',
  ]);
  if (!actionVerb) return null;
  if (has(t, ['looking_at_viewer', 'looking_away', 'looking_up', 'looking_down', 'looking_back', 'looking_over_shoulder', 'staring', 'eye_contact', 'peeking'])) {
    return { parent: PATH.actions, sub: 'Head & face', leaf: 'Gaze / attention' };
  }
  if (has(t, ['holding_hands', 'holding_each_other', 'holding_person', 'hugging', 'kissing', 'facing_each_other', 'back_to_back', 'side_by_side', 'handshake', 'sitting_on_lap'])) {
    return { parent: PATH.actions, sub: 'Character interaction', leaf: 'Contact / relationship' };
  }
  if (has(t, ['arms_crossed', 'arms_behind_head', 'arms_behind_back', 'hands_on_hips', 'hand_on_hip', 'hands_together', 'clasped_hands', 'peace_sign', 'finger_gun', 'thumbs_up', 'waving', 'pointing', 'salute', 'saluting', 'praying'])) {
    return { parent: PATH.actions, sub: 'Arms & hands', leaf: 'Gesture' };
  }
  if (/^(holding|carrying|using|riding|playing_instrument|writing_on)_/.test(t) || has(t, ['holding_sword', 'holding_weapon', 'holding_phone', 'holding_book', 'holding_cup'])) {
    return { parent: PATH.actions, sub: 'Object interaction', leaf: 'Using / holding / carrying' };
  }
  if (has(t, ['shirt', 'skirt', 'dress', 'pants', 'shorts', 'jacket', 'coat', 'lingerie', 'bra', 'stockings', 'pantyhose', 'bikini', 'swimsuit', 'clothes', 'clothing', 'garment'])) {
    return { parent: PATH.actions, sub: 'Clothing interaction', leaf: 'Adjusting / lifting / exposing' };
  }
  const target = firstBodyTarget(t);
  if (target) return { parent: PATH.actions, sub: target, leaf: 'Movement / contact' };
  if (has(t, ['arms_up', 'arms_crossed', 'hands_on_hips', 'hands_together', 'clasped_hands', 'waving', 'pointing', 'salute'])) {
    return { parent: PATH.actions, sub: 'Arms & hands', leaf: 'Gesture' };
  }
  if (has(t, ['eating', 'drinking', 'reading', 'writing', 'cooking', 'singing', 'sleeping', 'working', 'studying', 'smoking'])) {
    return { parent: PATH.actions, sub: 'Full body', leaf: 'Activity' };
  }
  if (has(t, ['walking', 'running', 'jumping', 'falling', 'flying', 'floating', 'swimming', 'stretching', 'spinning', 'skipping', 'crawling', 'climbing', 'dancing', 'fighting'])) {
    return { parent: PATH.actions, sub: 'Full body', leaf: 'Movement / activity' };
  }
  return { parent: PATH.actions, sub: 'Full body', leaf: 'Activity / action' };
}

function commonSpecificPlacement(tag: string): BuilderPlacement | null {
  const t = cleanKey(tag);
  if (has(t, ['short_hair', 'long_hair', 'very_long_hair', 'ponytail', 'braid', 'twintails', 'twintail', 'bangs', 'bob_cut', 'ahoge'])) return { parent: PATH.appearance, sub: 'Hair', leaf: 'Style / structure' };
  if (has(t, ['blonde_hair', 'black_hair', 'brown_hair', 'red_hair', 'pink_hair', 'blue_hair', 'purple_hair', 'green_hair', 'white_hair', 'silver_hair', 'gray_hair'])) return { parent: PATH.appearance, sub: 'Hair', leaf: 'Color' };
  if (has(t, ['blue_eyes', 'green_eyes', 'brown_eyes', 'red_eyes', 'pink_eyes', 'purple_eyes', 'yellow_eyes', 'golden_eyes', 'heterochromia', 'one_eye_closed', 'closed_eyes', 'winking'])) return { parent: PATH.appearance, sub: 'Eyes', leaf: 'Color / shape / expression' };
  if (has(t, ['smile', 'grin', 'smirk', 'frown', 'pout', 'blush', 'freckles', 'mole', 'open_mouth', 'closed_mouth', 'teeth', 'fang', 'tongue', 'tears'])) return { parent: PATH.appearance, sub: 'Face', leaf: 'Expression / detail' };
  if (has(t, ['cat_ears', 'fox_ears', 'wolf_ears', 'dog_ears', 'pointy_ears', 'elf_ears', 'ears'])) return { parent: PATH.appearance, sub: 'Ears', leaf: 'Human / fantasy ears' };
  if (has(t, ['tattoo', 'scar', 'birthmark', 'freckles', 'stretch_mark', 'body_paint'])) return { parent: PATH.appearance, sub: 'Skin', leaf: 'Marks / surface detail' };
  if (has(t, ['dark_skin', 'light_skin', 'pale_skin', 'tan', 'tanlines', 'brown_skin', 'black_skin'])) return { parent: PATH.appearance, sub: 'Skin', leaf: 'Color / tone' };
  return null;
}

function animalPlacement(tag: string): BuilderPlacement | null {
  const t = cleanKey(tag);
  if (has(t, ['cat', 'kitten', 'feline', 'lion', 'tiger', 'leopard', 'panther', 'jaguar', 'lynx'])) return { parent: 'Creatures & Animals', sub: 'Felines', leaf: 'Feline / cat family' };
  if (has(t, ['dog', 'puppy', 'canine', 'wolf', 'fox', 'coyote', 'jackal', 'dingo', 'hyena'])) return { parent: 'Creatures & Animals', sub: 'Canines', leaf: 'Canine / wolf / fox family' };
  if (has(t, ['bird', 'avian', 'chicken', 'duck', 'goose', 'swan', 'crow', 'raven', 'pigeon', 'dove', 'sparrow', 'owl', 'eagle', 'hawk', 'falcon', 'penguin', 'flamingo', 'parrot'])) return { parent: 'Creatures & Animals', sub: 'Birds', leaf: 'Bird / avian' };
  if (has(t, ['dragon', 'wyvern', 'drake', 'hydra', 'phoenix', 'griffin', 'gryphon', 'hippogriff', 'pegasus', 'unicorn', 'cerberus', 'chimera', 'basilisk', 'kraken', 'leviathan', 'behemoth', 'fenrir'])) return { parent: 'Creatures & Animals', sub: 'Mythical creatures', leaf: 'Legendary / mythical creature' };
  return null;
}

function firstBodyTarget(t: string): string | null {
  if (has(t, ['breast', 'breasts', 'nipple', 'nipples', 'cleavage', 'underboob', 'sideboob', 'chest', 'pectorals', 'torso'])) return 'Chest & torso';
  if (has(t, ['pussy', 'vagina', 'vulva', 'clitoris', 'penis', 'cock', 'dick', 'testicle', 'scrotum', 'anus', 'anal', 'crotch', 'groin', 'butt', 'ass', 'buttocks', 'hip', 'hips', 'thigh', 'foreskin', 'labia'])) return 'Hips & lower body';
  if (has(t, ['hair', 'bangs', 'ponytail', 'braid', 'twintail', 'ahoge', 'head', 'face', 'eye', 'eyes', 'mouth', 'lip', 'lips', 'tongue', 'cheek'])) return has(t, ['hair', 'bangs', 'ponytail', 'braid', 'twintail', 'ahoge']) ? 'Hair' : 'Head & face';
  if (has(t, ['hand', 'hands', 'finger', 'fingers', 'arm', 'arms', 'wrist', 'fist', 'elbow'])) return 'Arms & hands';
  if (has(t, ['leg', 'legs', 'knee', 'knees', 'foot', 'feet', 'toe', 'ankle', 'calf'])) return 'Legs & feet';
  return null;
}

function actionPlacement(tag: string, wikiCategory: string | null | undefined): BuilderPlacement | null {
  const t = cleanKey(tag);

  if (wikiCategory === 'Gestures') {
    const target = firstBodyTarget(t);
    return target ? { parent: PATH.actions, sub: target, leaf: 'Gesture / contact' } : { parent: PATH.actions, sub: 'Arms & hands', leaf: 'Gesture' };
  }

  if (wikiCategory === 'Holding Tags') {
    if (has(t, ['holding_hands', 'holding_each_other', 'handshake', 'holding_person'])) return { parent: PATH.actions, sub: 'Character interaction', leaf: 'Hand contact / relationship' };
    return { parent: PATH.actions, sub: 'Object interaction', leaf: 'Holding / carrying' };
  }

  if (wikiCategory === 'Dances') return { parent: PATH.actions, sub: 'Full body', leaf: 'Dance' };
  if (wikiCategory === 'Sports') return { parent: PATH.actions, sub: 'Full body', leaf: 'Sport / athletic activity' };

  if (has(t, ['bondage', 'bdsm', 'shibari', 'bit_gag', 'cleave_gag', 'bound_wrists', 'bound_arms', 'bound_legs', 'restraint', 'leash', 'spanking'])) {
    const target = firstBodyTarget(t);
    return target ? { parent: PATH.actions, sub: target, leaf: 'Restraint / discipline' } : { parent: PATH.actions, sub: 'Restraint & discipline', leaf: 'BDSM / restraint' };
  }

  if (wikiCategory === 'Sex Acts' || wikiCategory === 'Simulated Sex Acts') {
    const target = firstBodyTarget(t);
    if (target) {
      const leaf = wikiCategory === 'Sex Acts' ? 'Adult action / contact' : 'Suggestive / simulated action';
      return { parent: PATH.actions, sub: target, leaf };
    }
    if (has(t, ['kissing', 'hugging', 'threesome', 'gangbang', 'group_sex', 'foursome', 'orgy', 'sex_with'])) {
      return { parent: PATH.actions, sub: 'Character interaction', leaf: 'Adult interaction' };
    }
    return { parent: PATH.actions, sub: 'Full body', leaf: wikiCategory === 'Sex Acts' ? 'Adult activity' : 'Suggestive / simulated activity' };
  }

  if (wikiCategory === 'Bdsm And Torture') {
    const target = firstBodyTarget(t);
    return target ? { parent: PATH.actions, sub: target, leaf: 'Restraint / discipline' } : { parent: PATH.actions, sub: 'Restraint & discipline', leaf: 'BDSM / restraint' };
  }

  if (wikiCategory === 'Verbs And Gerunds') {
    if (has(t, ['looking_at_viewer', 'looking_away', 'looking_up', 'looking_down', 'looking_back', 'staring', 'eye_contact', 'peeking'])) return { parent: PATH.actions, sub: 'Head & face', leaf: 'Gaze / attention' };
    const target = firstBodyTarget(t);
    if (target) return { parent: PATH.actions, sub: target, leaf: 'Movement / contact' };
    if (has(t, ['eating', 'drinking', 'reading', 'writing', 'cooking', 'singing', 'sleeping', 'working', 'studying', 'smoking'])) return { parent: PATH.actions, sub: 'Full body', leaf: 'Activity' };
    if (has(t, ['walking', 'running', 'jumping', 'falling', 'flying', 'floating', 'swimming', 'stretching', 'spinning', 'skipping', 'crawling', 'climbing'])) return { parent: PATH.actions, sub: 'Full body', leaf: 'Movement' };
    if (has(t, ['kissing', 'hugging', 'facing_each_other', 'back_to_back', 'side_by_side', 'sitting_on_lap'])) return { parent: PATH.actions, sub: 'Character interaction', leaf: 'Contact / relationship' };
    if (has(t, ['holding_', 'carrying_', 'using_', 'riding_', 'playing_instrument', 'reading_', 'writing_on_'])) return { parent: PATH.actions, sub: 'Object interaction', leaf: 'Using / holding' };
    return { parent: PATH.actions, sub: 'Full body', leaf: 'Activity / action' };
  }

  return null;
}

function posePlacement(tag: string, wikiCategory: string | null | undefined): BuilderPlacement | null {
  const t = cleanKey(tag);
  if (wikiCategory === 'Sexual Positions') return { parent: PATH.pose, sub: 'Full body', leaf: 'Adult / sexual position' };
  if (wikiCategory !== 'Posture') return null;
  if (has(t, ['standing', 'sitting', 'lying', 'kneeling', 'squatting', 'crouching', 'seiza', 'leaning', 'reclining', 'prostrating'])) return { parent: PATH.pose, sub: 'Full body', leaf: 'Base posture' };
  if (has(t, ['legs_together', 'legs_crossed', 'one_leg_raised', 'legs_up', 'legs_spread', 'knees_together', 'on_one_leg'])) return { parent: PATH.pose, sub: 'Legs & feet', leaf: 'Leg position' };
  if (has(t, ['arms_up', 'arms_behind_head', 'arms_crossed', 'hands_on_hips', 'hands_together', 'clasped_hands'])) return { parent: PATH.pose, sub: 'Arms & hands', leaf: 'Arm / hand position' };
  if (has(t, ['arched_back', 'backbend', 'torso_twist', 'twist', 'leaning_forward', 'leaning_back'])) return { parent: PATH.pose, sub: 'Chest & torso', leaf: 'Torso orientation' };
  if (has(t, ['head_tilt', 'profile', 'three_quarter_view', 'looking_over_shoulder'])) return { parent: PATH.pose, sub: 'Head & face', leaf: 'Head orientation' };
  return { parent: PATH.pose, sub: 'Full body', leaf: 'Posture / position' };
}

function bodyPlacement(tag: string, wikiCategory: string | null | undefined): BuilderPlacement | null {
  const t = cleanKey(tag);
  if (has(t, ['body', 'anatomy', 'physique', 'torso', 'abdomen', 'waist', 'navel', 'belly', 'stomach'])) return { parent: PATH.body, sub: 'Chest & torso', leaf: 'General body / torso' };
  if (wikiCategory === 'Body Parts') {
    if (has(t, ['chest', 'torso', 'breast', 'breasts', 'cleavage', 'nipple', 'pectorals', 'collarbone', 'abdomen', 'abs', 'stomach', 'belly', 'navel'])) return { parent: PATH.body, sub: 'Chest & torso', leaf: 'Regional anatomy' };
    if (has(t, ['shoulder', 'shoulders', 'armpit', 'clavicle'])) return { parent: PATH.body, sub: 'Chest & torso', leaf: 'Shoulder / upper torso anatomy' };
    if (has(t, ['arm', 'arms', 'forearm', 'elbow', 'wrist'])) return { parent: PATH.body, sub: 'Arms & hands', leaf: 'Arm anatomy' };
    if (has(t, ['hand', 'hands', 'finger', 'fingers', 'thumb', 'palm'])) return { parent: PATH.body, sub: 'Arms & hands', leaf: 'Hand / finger anatomy' };
    if (has(t, ['leg', 'legs', 'thigh', 'knee', 'calf'])) return { parent: PATH.body, sub: 'Legs & feet', leaf: 'Leg anatomy' };
    if (has(t, ['foot', 'feet', 'toe', 'ankle'])) return { parent: PATH.body, sub: 'Legs & feet', leaf: 'Foot / toe anatomy' };
    if (has(t, ['hip', 'hips', 'waist', 'butt', 'ass', 'buttocks', 'groin', 'crotch'])) return { parent: PATH.body, sub: 'Hips & lower body', leaf: 'Hip / lower-body anatomy' };
    return { parent: PATH.body, sub: 'Body parts', leaf: 'Other regional anatomy' };
  }
  if (wikiCategory === 'Breasts Tags') return { parent: PATH.body, sub: 'Chest & torso', leaf: 'Breasts / chest anatomy' };
  if (wikiCategory === 'Shoulders') return { parent: PATH.body, sub: 'Chest & torso', leaf: 'Shoulders / upper torso anatomy' };
  if (wikiCategory === 'Hands') return { parent: PATH.body, sub: 'Arms & hands', leaf: 'Hands / fingers anatomy' };
  if (wikiCategory === 'Feet') return { parent: PATH.body, sub: 'Legs & feet', leaf: 'Feet / toes anatomy' };
  if (wikiCategory === 'Wings') return { parent: PATH.body, sub: 'Fantasy anatomy', leaf: 'Wings' };
  if (wikiCategory === 'Covering') return { parent: PATH.body, sub: 'Body state', leaf: 'Coverage / concealment' };
  const specific = commonSpecificPlacement(tag);
  if (specific) return specific;
  const target = firstBodyTarget(t);
  if (!target) return null;
  if (target === 'Hair') return { parent: PATH.appearance, sub: 'Hair', leaf: 'Style / structure' };
  if (target === 'Head & face') return { parent: PATH.appearance, sub: 'Face', leaf: 'Feature / detail' };
  return { parent: PATH.body, sub: target, leaf: 'Anatomy / attribute' };
}

function narrowFallback(tag: string, nativeCategory: string | undefined, wikiCategory: string | null | undefined): BuilderPlacement {
  const t = cleanKey(tag);
  if (nativeCategory === 'Artist') return { parent: PATH.style, sub: 'Artists', leaf: 'Artist tag' };
  if (nativeCategory === 'Character' || nativeCategory === 'Copyright') return { parent: PATH.subject, sub: nativeCategory === 'Character' ? 'Characters' : 'Series & franchises', leaf: 'Identity' };
  if (nativeCategory === 'Meta') return { parent: PATH.technical, sub: 'Metadata', leaf: wikiCategory || 'Meta tag' };
  if (has(t, ['dress', 'skirt', 'pants', 'shirt', 'blouse', 'jacket', 'coat', 'kimono', 'uniform', 'swimsuit', 'bikini', 'stockings', 'pantyhose', 'shoes', 'boots', 'hat', 'gloves', 'necklace', 'earrings', 'tie', 'scarf'])) return { parent: PATH.clothing, sub: 'Garments & accessories', leaf: 'Type' };
  if (has(t, ['portrait', 'upper_body', 'full_body', 'cowboy_shot', 'close_up', 'rule_of_thirds', 'negative_space', 'foreground', 'background'])) return { parent: PATH.composition, sub: 'Framing & layout', leaf: 'Composition' };
  if (has(t, ['camera', 'angle', 'lens', 'fisheye', 'telephoto', 'wide_angle', 'depth_of_field', 'bokeh', 'focus'])) return { parent: PATH.camera, sub: 'Camera & optics', leaf: 'View / lens / focus' };
  if (has(t, ['forest', 'mountain', 'beach', 'ocean', 'city', 'street', 'bedroom', 'classroom', 'kitchen', 'bathroom', 'castle', 'temple', 'shrine', 'weather', 'sunset', 'night', 'day'])) return { parent: PATH.environment, sub: 'Setting', leaf: 'Place / time / weather' };
  if (has(t, ['sword', 'gun', 'knife', 'book', 'phone', 'guitar', 'flower', 'food', 'cup', 'umbrella', 'vehicle', 'car'])) return { parent: PATH.objects, sub: 'Objects & props', leaf: 'Type' };
  if (has(t, ['masterpiece', 'best_quality', 'high_quality', 'cinematic', 'anime_coloring', 'cel_shading', 'watercolor', 'oil_painting', 'lineart', 'sketch', 'cyberpunk', 'fantasy'])) return { parent: PATH.style, sub: 'Visual style', leaf: 'Aesthetic / rendering' };
  if (has(t, ['girl', 'boy', 'woman', 'man', 'solo', 'couple', 'character', 'elf', 'angel', 'demon'])) return { parent: PATH.subject, sub: 'People & characters', leaf: 'Subject / count / identity' };
  return { parent: PATH.concepts, sub: 'General concepts', leaf: 'Other / low-frequency concept' };
}

function contextSpecificPlacement(tag: string): BuilderPlacement | null {
  const t = cleanKey(tag);
  if (has(t, ['night', 'midnight', 'day', 'daytime', 'morning', 'afternoon', 'sunset', 'sunrise', 'dusk', 'dawn'])) {
    return { parent: PATH.environment, sub: 'Events & time', leaf: 'Time of day / season' };
  }
  if (has(t, ['rain', 'raining', 'snow', 'snowing', 'storm', 'fog', 'mist', 'cloud', 'clouds', 'sunlight', 'moonlight'])) {
    return { parent: PATH.environment, sub: 'Weather & atmosphere', leaf: 'Weather / sky condition' };
  }
  if (has(t, ['forest', 'woodland', 'mountain', 'mountains', 'beach', 'ocean', 'sea', 'lake', 'river', 'waterfall', 'garden', 'meadow', 'park'])) {
    return { parent: PATH.environment, sub: 'Nature', leaf: 'Natural setting' };
  }
  if (has(t, ['city', 'cityscape', 'street', 'alley', 'building', 'skyscraper', 'office', 'cafe', 'restaurant', 'bedroom', 'classroom', 'kitchen', 'bathroom', 'temple', 'shrine', 'castle'])) {
    return { parent: PATH.environment, sub: 'Built environment', leaf: 'Location / architecture' };
  }
  return null;
}

function nsfwPlacementForTag(tag: string, wikiCategory: string | null | undefined): BuilderPlacement {
  const t = cleanKey(tag);
  if (wikiCategory && NSFW_WIKI_TO_PLACEMENT[wikiCategory]) {
    // Refine common BDSM and body-specific tags even when Danbooru places them in a broader wiki category.
    if (has(t, ['bondage', 'bdsm', 'shibari', 'bit_gag', 'cleave_gag', 'bound_wrists', 'bound_arms', 'bound_legs', 'restraint', 'leash', 'spanking'])) return { parent: PATH.nsfw, sub: 'BDSM & restraint', leaf: 'Restraint / discipline' };
    return NSFW_WIKI_TO_PLACEMENT[wikiCategory];
  }
  if (has(t, ['nude', 'naked', 'topless', 'bottomless', 'exposed', 'undressing', 'upskirt', 'pantyshot', 'no_panties', 'no_bra', 'clothes_lift', 'shirt_lift', 'skirt_lift', 'see_through'])) return { parent: PATH.nsfw, sub: 'Nudity & exposure', leaf: 'Exposure / clothing state' };
  if (has(t, ['penis', 'pussy', 'vagina', 'vulva', 'clitoris', 'anus', 'areola', 'nipple', 'nipples', 'testicle', 'testicles', 'scrotum', 'labia', 'genital', 'erection', 'cum', 'ejaculation', 'facial_cum', 'cumshot'])) return { parent: PATH.nsfw, sub: 'Adult anatomy & fluids', leaf: has(t, ['cum', 'ejaculation', 'cumshot']) ? 'Fluids / response' : 'Anatomy' };
  if (has(t, ['missionary', 'cowgirl', 'reverse_cowgirl', 'doggystyle', 'spooning', 'standing_sex', 'prone_bone', 'mating_press', 'legs_over_head', 'straddle'])) return { parent: PATH.nsfw, sub: 'Adult poses', leaf: 'Sexual position' };
  if (has(t, ['dildo', 'vibrator', 'sex_toy', 'condom', 'lubricant', 'crotchless', 'pasties', 'maebari', 'microbikini', 'lingerie', 'sex_object'])) return { parent: PATH.nsfw, sub: 'Adult attire & objects', leaf: has(t, ['lingerie', 'crotchless', 'pasties', 'microbikini', 'maebari']) ? 'Sexual / fetish attire' : 'Sex object / accessory' };
  if (has(t, ['bondage', 'bdsm', 'shibari', 'spanking', 'bit_gag', 'cleave_gag', 'bound_wrists', 'bound_arms', 'bound_legs', 'restraint', 'leash'])) return { parent: PATH.nsfw, sub: 'BDSM & restraint', leaf: 'Restraint / discipline' };
  if (has(t, ['sex', 'sexual', 'intercourse', 'penetration', 'masturbation', 'fellatio', 'blowjob', 'cunnilingus', 'paizuri', 'creampie', 'fingering', 'handjob', 'footjob', 'groping', 'fondling', 'orgasm', 'ahegao', 'moaning', 'rimming', 'bukkake', 'gangbang', 'threesome', 'group_sex', 'orgy', 'breast_sucking', 'nipple_suck', 'nipple_penetration'])) return { parent: PATH.nsfw, sub: 'Sex acts', leaf: 'Sexual activity' };
  if (has(t, ['ecchi', 'suggestive', 'risque', 'r18', 'explicit', 'adult_only', 'nsfw'])) return { parent: PATH.nsfw, sub: 'Mature themes', leaf: 'Suggestive / explicit' };
  return { parent: PATH.nsfw, sub: 'Mature themes', leaf: 'Needs specific adult classification' };
}

function semanticPlacement(tag: string, nativeCategory: string | undefined, _nativeCategoryCode: string | undefined, wikiCategory: string | null | undefined, isNsfw = false): BuilderPlacement[] {
  const out: BuilderPlacement[] = [];
  const push = (p: BuilderPlacement | null) => {
    if (!p) return;
    const key = `${p.parent}\u001f${p.sub}\u001f${p.leaf || ''}`;
    if (!out.some((x) => `${x.parent}\u001f${x.sub}\u001f${x.leaf || ''}` === key)) out.push(p);
  };

  // Danbooru wiki categories are the strongest evidence. Do not add broad lexical
  // branches when we already have a specific source category, because that was the
  // source of most irrelevant tags in the old builder.
  if (ACTION_WIKI_CATEGORIES.has(wikiCategory || '')) push(actionPlacement(tag, wikiCategory));
  else if (POSE_WIKI_CATEGORIES.has(wikiCategory || '')) push(posePlacement(tag, wikiCategory));
  else {
    const lexicalAction = lexicalActionPlacement(tag);
    if (lexicalAction) push(lexicalAction);
    else {
      const specificContext = contextSpecificPlacement(tag);
      const animal = animalPlacement(tag);
      // A wiki category that is not explicitly mapped must not force a broad
      // fallback. First try the same narrow, name-based classifiers we use when
      // wiki metadata is absent. This keeps e.g. eye/hair/body tags out of
      // unrelated catch-all branches even when Danbooru has a new/unknown wiki
      // category name in the local snapshot.
      const specificBody = bodyPlacement(tag, wikiCategory);
      if (specificContext) push(specificContext);
      else if (animal) push(animal);
      else if (specificBody) push(specificBody);
      else if (CATEGORY_MAP[wikiCategory || '']) push(CATEGORY_MAP[wikiCategory || '']);
      else if (!wikiCategory) push(narrowFallback(tag, nativeCategory, wikiCategory));
      else if (nativeCategory === 'Artist') push({ parent: PATH.style, sub: 'Artists', leaf: 'Artist tag' });
      else if (nativeCategory === 'Character') push({ parent: PATH.subject, sub: 'Characters', leaf: 'Identity' });
      else if (nativeCategory === 'Copyright') push({ parent: PATH.subject, sub: 'Series & franchises', leaf: 'Identity' });
      else if (nativeCategory === 'Meta') push({ parent: PATH.technical, sub: 'Metadata', leaf: wikiCategory });
      else push(narrowFallback(tag, nativeCategory, wikiCategory));
    }
  }

  // Only add one domain placement for the adult view. This makes NSFW discoverable
  // without polluting anatomy/action branches with unrelated adult tags.
  if (isNsfw) push(nsfwPlacementForTag(tag, wikiCategory));

  if (!out.length) out.push(narrowFallback(tag, nativeCategory, wikiCategory));
  return out;
}

function mapSemanticToPromptFlow(p: BuilderPlacement): BuilderPlacement {
  const map: Record<string, string> = {
    [PATH.subject]: 'Person',
    'Creatures & Animals': 'Animals & Creatures',
    [PATH.appearance]: 'Face & Hair',
    [PATH.body]: 'Body & Physiology',
    [PATH.clothing]: 'Apparel',
    [PATH.actions]: 'Actions',
    [PATH.pose]: 'Pose',
    [PATH.interaction]: 'Actions',
    [PATH.composition]: 'Image',
    [PATH.camera]: 'Camera',
    [PATH.environment]: 'Environment',
    [PATH.scene]: 'Scene',
    [PATH.objects]: 'Items',
    [PATH.style]: 'Style & Aesthetics',
    [PATH.concepts]: 'Themes & Lore',
    [PATH.technical]: 'Technical',
    [PATH.nsfw]: 'NSFW & Adult',
  };
  if (p.parent === PATH.style && p.sub === 'Artists') return { parent: 'Artists', sub: p.sub, leaf: p.leaf };
  if (p.parent === PATH.subject && p.sub === 'Games & franchises') return { parent: 'Characters & Series', sub: p.sub, leaf: p.leaf };
  return { parent: map[p.parent] || p.parent, sub: p.sub, leaf: p.leaf };
}

export function getSemanticPlacements(record: Pick<TagRecord, 'tag' | 'nativeCategory' | 'nativeCategoryCode' | 'wikiCategory'> & { isNsfw?: boolean }): BuilderPlacement[] {
  return semanticPlacement(record.tag, record.nativeCategory, record.nativeCategoryCode, record.wikiCategory, Boolean(record.isNsfw));
}

export function getPromptFlowPlacements(record: Pick<TagRecord, 'tag' | 'nativeCategory' | 'nativeCategoryCode' | 'wikiCategory'> & { isNsfw?: boolean; uiCategory?: string; uiSubCategory?: string; uiSubSubCategory?: string | null; secondaryUiCategories?: Array<{ parent: string; sub: string; subSub?: string }> }): BuilderPlacement[] {
  const strict = semanticPlacement(record.tag, record.nativeCategory, record.nativeCategoryCode, record.wikiCategory, Boolean(record.isNsfw));
  return strict.map(mapSemanticToPromptFlow);
}

type PromptAllInOneRecord = Pick<TagRecord, 'tag' | 'nativeCategory' | 'nativeCategoryCode' | 'wikiCategory'> & {
  isNsfw?: boolean;
  aliases?: string[];
  uiCategory?: string;
  uiSubCategory?: string;
  uiSubSubCategory?: string | null;
  classificationSources?: string[];
  classificationConfidence?: number;
  description?: string | null;
  postCount?: number | null;
};

/** Maps Danbooru wiki groups and the project's stronger local classifier into the
 * Prompt All in One extension's ten-root taxonomy. This is intentionally local:
 * browsing a category never needs to query Danbooru for a made-up semantic tag. */
function promptAllInOneWikiPlacement(category: string | null | undefined, tag: string, isNsfw: boolean): BuilderPlacement | null {
  if (!category) return null;
  const c = cleanKey(category);
  const t = cleanKey(tag);
  const place = (parent: string, sub: string, leaf?: string): BuilderPlacement => ({ parent, sub, leaf });
  const has = (words: string[]) => words.some((w) => t === w || t.startsWith(`${w}_`) || t.endsWith(`_${w}`) || t.includes(`_${w}_`));

  if (/^(character_count|people|groups|family_relationships|gender_nonconformity|transgender|jobs)$/.test(c)) {
    return place('Person', /jobs/.test(c) ? 'Identity' : /relationship|groups/.test(c) ? 'Relationships' : 'Object', category);
  }
  if (/^(face_tags|eyes_tags|hair_styles|hair|hair_color|makeup|ears_tags|skin_color)$/.test(c)) {
    if (/hair/.test(c)) return place('Person', 'Hair', category);
    if (/eyes/.test(c)) return place('Person', 'Eyes', category);
    if (/ears/.test(c)) return place('Person', 'Ears', category);
    if (/skin/.test(c)) return place('Person', 'Skin', category);
    return place('Person', 'Face', category);
  }
  if (/^(breasts_tags|body_parts|shoulders|hands|feet|ass|pussy|wings|covering)$/.test(c)) {
    if (/breasts|shoulders/.test(c) || has(['chest', 'torso', 'breast', 'breasts', 'cleavage', 'abs'])) return place('Person', 'Chest', category);
    if (/hands/.test(c) || has(['hand', 'hands', 'finger', 'fingernail', 'nails', 'claw', 'claws'])) return place('Person', 'Hands', category);
    if (/feet/.test(c) || has(['feet', 'foot', 'toe', 'toes', 'sole', 'soles'])) return place('Person', 'Body parts', category);
    if (/wings/.test(c) || has(['wing', 'wings', 'feather', 'feathers', 'fin', 'fins'])) return place('Person', 'Wings', category);
    if (/covering/.test(c)) return place('Person', 'Body parts', 'Body covering / concealment');
    return place('Person', 'Body parts', category);
  }
  if (/^(attire|neck_and_neckwear|accessories|headwear|eyewear|handwear|fashion_style|sleeves|legwear|prints|sexual_attire)$/.test(c)) {
    if (/headwear/.test(c)) return place('Apparel', 'Headwear', category);
    if (/eyewear/.test(c)) return place('Apparel', 'Eyewear', category);
    if (/handwear/.test(c)) return place('Apparel', 'Handwear', category);
    if (/neck_and_neckwear/.test(c)) return place('Apparel', 'Neckwear', category);
    if (/legwear/.test(c)) return place('Apparel', 'Underwear', category);
    if (/accessories/.test(c)) return place('Apparel', has(['necklace', 'earring', 'bracelet', 'jewel', 'brooch', 'ring', 'pendant']) ? 'Jewelry' : 'Accessories', category);
    if (/fashion_style/.test(c)) return place('Apparel', 'Casual clothing', 'Fashion / subculture');
    if (/sleeves|prints/.test(c)) return place('Apparel', 'Casual clothing', category);
    if (/sexual_attire/.test(c)) return place('Apparel', 'Underwear', category);
    if (has(['dress', 'gown', 'tuxedo', 'suit', 'wedding', 'formal'])) return place('Apparel', 'Formal wear', category);
    if (has(['uniform', 'serafuku', 'sailor', 'military', 'school_uniform'])) return place('Apparel', 'Uniform', category);
    return place('Apparel', 'Casual clothing', category);
  }
  if (/^(gestures|holding_tags|verbs_and_gerunds|dances|sports|posture|sexual_positions|sex_acts|simulated_sex_acts|bdsm_and_torture)$/.test(c)) {
    if (/posture|sexual_positions/.test(c) || has(['standing', 'sitting', 'kneeling', 'squatting', 'bent_over', 'from_behind', 'straddling', 'lying'])) return place('Facial expression and action', 'Pose', category);
    if (/holding_tags/.test(c)) return place('Facial expression and action', 'Other actions', 'Holding / carrying');
    if (/sex_acts|simulated_sex_acts|bdsm/.test(c) || isNsfw) return place('Facial expression and action', 'Other actions', 'Adult / intimate action');
    if (/sports|dances/.test(c)) return place('Facial expression and action', 'Other actions', category);
    if (/gestures/.test(c)) return place('Facial expression and action', 'Other actions', 'Gesture');
    return place('Facial expression and action', 'Other actions', 'Action / activity');
  }
  if (/^(image_composition|artistic_license|lighting|colors|visual_aesthetic|focus_tags|patterns|drawing_software|fine_art_parody|pixiv_projects)$/.test(c)) {
    if (/focus_tags/.test(c) || has(['portrait', 'full_body', 'upper_body', 'from_above', 'from_below', 'from_side', 'from_behind', 'facing_viewer', 'looking_at_viewer', 'dutch_angle', 'wide_shot', 'close-up', 'selfie'])) return place('Camera', 'Camera', category);
    if (/lighting/.test(c)) return place('Image', 'Lighting & effects', category);
    if (/colors|patterns/.test(c)) return place('Image', 'Color & patterns', category);
    if (/composition/.test(c)) return place('Image', 'Composition', category);
    return place('Image', 'Art style', category);
  }
  if (/^(locations|real_world_locations|backgrounds|doors_and_gates|water|fire|flowers|holidays_and_celebrations|year_tags)$/.test(c)) {
    if (/flowers/.test(c)) return place('Items', 'Plant', category);
    if (/water/.test(c)) return place('Environment', 'Water', category);
    if (/fire/.test(c)) return place('Environment', 'Weather & atmosphere', category);
    if (/holidays|year_tags/.test(c)) return place('Environment', 'Season & time', category);
    if (/doors_and_gates/.test(c)) return place('Scene', 'Indoor', 'Architecture');
    if (/backgrounds/.test(c)) return place('Image', 'Background', category);
    if (has(['indoor', 'indoors', 'bedroom', 'bathroom', 'classroom', 'kitchen', 'office', 'room', 'house', 'interior'])) return place('Scene', 'Indoor', category);
    return place('Scene', 'Outdoor', category);
  }
  if (/^(felines|cats|canines|dogs|birds|legendary_creatures|animals|reptiles|insects|aquatic|equines)$/.test(c)) return place('Items', 'Animal', category);
  if (/^(food_tags)$/.test(c)) return place('Items', 'Food', category);
  if (/^(technology|audio_tags|cards|board_games)$/.test(c)) {
    if (/audio/.test(c)) return place('Items', 'Musical instruments', category);
    if (/technology/.test(c)) return place('Items', 'Digital devices', category);
    if (has(['book', 'paper', 'pen', 'pencil', 'scroll', 'card', 'notebook'])) return place('Items', 'Study supplies', category);
    return place('Items', 'Other items', category);
  }
  if (/^(symbols|text|phrases|japanese_dialects|history|theme|subjective|companies_and_brand_names)$/.test(c)) {
    if (/companies/.test(c)) return place('Person', 'Identity', 'Company / brand');
    if (/dialects|phrases/.test(c)) return place('Image', 'Text & lettering', category);
    return place('Image', 'Text & symbols', category);
  }
  if (/^(nudity|sex_objects|sexual_attire|censorship)$/.test(c) || isNsfw) {
    if (has(['nude', 'naked', 'topless', 'bottomless', 'exposed', 'censored', 'censoring', 'mosaic_censoring', 'bar_censor'])) return place('Person', 'Body parts', 'Exposure / censorship');
    if (has(['dildo', 'vibrator', 'sex_toy', 'condom', 'lubricant', 'toy'])) return place('Items', 'Other items', 'Adult accessory');
    if (has(['bikini', 'lingerie', 'underwear', 'panties', 'bra', 'thighhigh'])) return place('Apparel', 'Underwear', category);
    return place('Facial expression and action', 'Other actions', category || 'Adult / intimate action');
  }
  if (/^metatags$/.test(c)) return place('Image', 'Quality', 'Metadata');
  return null;
}

function promptAllInOneDescriptionPlacement(record: PromptAllInOneRecord): BuilderPlacement | null {
  const raw = record.description || '';
  if (raw.trim().length < 18) return null;
  // Wiki snippets can contain long markup-heavy pages; only the opening sentence
  // generally defines a tag. Bound this work so taxonomy indexing stays responsive.
  const d = `_${cleanKey(raw.slice(0, 1600)).replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_')}_`;
  const dTokens = new Set(d.split('_').filter(Boolean));
  const hasD = (words: string[]) => words.some((word) => {
    const key = cleanKey(word).replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_');
    return key.includes('_') ? d.includes(`_${key}_`) : dTokens.has(key);
  });
  const place = (parent: string, sub: string, leaf?: string): BuilderPlacement => ({ parent, sub, leaf });
  const nsfw = Boolean(record.isNsfw);

  // Prefer concrete nouns from the description, not generic wording like
  // "usually depicted". The bundled wiki descriptions cover most of the local
  // General tag index, and are useful for tags whose names alone are ambiguous.
  if (hasD(['hairstyle', 'hairstyles', 'hair_color', 'hair_coloration', 'ponytail', 'braided', 'braid', 'bangs', 'sideburns', 'sidelocks', 'twintails'])) return place('Person', 'Hair', 'Description-derived hair tag');
  if (hasD(['iris', 'pupils', 'sclera', 'eyelashes', 'eyebrows', 'eye_color', 'eye_colour', 'heterochromia', 'eyeshadow', 'eyeliner'])) return place('Person', 'Eyes', 'Description-derived eye tag');
  if (hasD(['facial_feature', 'facial_features', 'mouth', 'nose', 'lips', 'teeth', 'fang', 'freckles', 'mole', 'blush', 'facial_expression', 'smile', 'grin', 'smirk', 'frown', 'tongue', 'beard', 'mustache', 'goatee'])) return place('Person', 'Face', 'Description-derived facial feature');
  if (hasD(['finger', 'fingernail', 'toenail', 'hand', 'wrist', 'palm', 'thumb', 'elbow', 'forearm', 'shoulder', 'armpit', 'foot', 'toe', 'ankle', 'knee', 'thigh', 'calf', 'hip', 'waist', 'abdomen', 'torso', 'chest', 'breast', 'collarbone', 'body_part', 'body_parts', 'anatomy', 'physique', 'vein', 'joint', 'claw', 'claws', 'fangs', 'hoof', 'hooves', 'tail', 'wing', 'wings', 'fin', 'fins', 'gills', 'scales'])) {
    if (hasD(['hair', 'hairstyle'])) return place('Person', 'Hair', 'Description-derived anatomy');
    if (hasD(['hand', 'finger', 'fingernail', 'nail', 'wrist', 'palm', 'thumb', 'claw'])) return place('Person', 'Hands', 'Description-derived anatomy');
    if (hasD(['chest', 'breast', 'torso', 'collarbone'])) return place('Person', 'Chest', 'Description-derived anatomy');
    if (hasD(['wing', 'fin', 'tail', 'gill', 'scale'])) return place('Person', 'Wings', 'Description-derived animal / fantasy anatomy');
    return place('Person', 'Body parts', 'Description-derived anatomy');
  }
  if (hasD(['headwear', 'hat', 'head covering', 'hood', 'helmet', 'crown', 'headband', 'veil', 'bonnet', 'tiara'])) return place('Apparel', 'Headwear', 'Description-derived headwear');
  if (hasD(['eyewear', 'glasses', 'sunglasses', 'goggles', 'eyepatch', 'blindfold', 'gas mask', 'face mask'])) return place('Apparel', 'Eyewear', 'Description-derived eyewear');
  if (hasD(['glove', 'gloves', 'mittens', 'handwear'])) return place('Apparel', 'Handwear', 'Description-derived handwear');
  if (hasD(['footwear', 'shoe', 'shoes', 'boots', 'sandals', 'heels', 'loafers'])) return place('Apparel', 'Footwear', 'Description-derived footwear');
  if (hasD(['hosiery', 'stockings', 'thighhigh', 'thigh_high', 'pantyhose', 'socks', 'kneehigh', 'underwear', 'lingerie', 'panties', 'bra', 'garter', 'negligee', 'sleepwear', 'pajamas'])) return place('Apparel', 'Underwear', 'Description-derived hosiery / undergarment');
  if (hasD(['swimwear', 'swimsuit', 'bikini', 'bathing_suit', 'swim_trunks'])) return place('Apparel', 'Swimwear', 'Description-derived swimwear');
  if (hasD(['uniform', 'school_uniform', 'military_uniform', 'sailor_uniform', 'nurse_uniform', 'police_uniform'])) return place('Apparel', 'Uniform', 'Description-derived uniform');
  if (hasD(['neckwear', 'necktie', 'bowtie', 'choker', 'scarf', 'neckerchief', 'ascot', 'collar', 'necklace'])) return place('Apparel', hasD(['necklace', 'jewelry', 'jewellery', 'pendant', 'brooch']) ? 'Jewelry' : 'Neckwear', 'Description-derived neck accessory');
  if (hasD(['garment', 'clothing', 'clothes', 'apparel', 'outfit', 'dress', 'skirt', 'shirt', 'blouse', 'pants', 'shorts', 'sweater', 'cardigan', 'vest', 'jacket', 'coat', 'cape', 'cloak', 'bodysuit', 'leotard', 'kimono', 'robe', 'sleeve', 'belt', 'bow', 'ribbon', 'frill', 'lace_trim', 'fabric', 'costume', 'apron', 'overalls'])) {
    if (hasD(['dress', 'gown', 'formal', 'wedding', 'tuxedo'])) return place('Apparel', 'Formal wear', 'Description-derived formal garment');
    if (hasD(['uniform'])) return place('Apparel', 'Uniform', 'Description-derived uniform');
    if (hasD(['traditional', 'kimono', 'hanfu', 'hakama', 'yukata'])) return place('Apparel', 'Traditional clothing', 'Description-derived traditional attire');
    return place('Apparel', 'Casual clothing', 'Description-derived garment / accessory');
  }
  if (hasD(['anime character', 'fictional character', 'character from', 'character appearing', 'protagonist of', 'series', 'franchise', 'video game character', 'manga character', 'species of humanoid', 'race in'])) return place('Person', 'Anime Role', 'Description-derived character / franchise');
  if (hasD(['species', 'gender identity', 'gender expression', 'gender nonconformity', 'relationship', 'family relationship', 'age group', 'age difference', 'height difference', 'body type', 'physique'])) return place('Person', hasD(['age']) ? 'Age' : hasD(['relationship', 'family']) ? 'Relationships' : 'Identity', 'Description-derived identity / relation');
  if (hasD(['animal', 'mammal', 'bird', 'reptile', 'amphibian', 'insect', 'arthropod', 'fish', 'marine creature', 'mythical creature', 'dragon', 'canine', 'feline', 'rodent', 'equine', 'creature'])) return place('Items', 'Animal', 'Description-derived animal / creature');
  if (hasD(['flower', 'flowers', 'plant', 'tree', 'leaf', 'leaves', 'vegetation', 'botanical', 'bamboo', 'rose', 'blossom', 'grass', 'moss', 'vine'])) return place('Items', 'Plant', 'Description-derived plant');
  if (hasD(['food', 'beverage', 'drink', 'dish', 'cuisine', 'fruit', 'vegetable', 'cake', 'candy', 'dessert', 'bread', 'meat', 'tea', 'coffee', 'alcoholic drink'])) return place('Items', 'Food', 'Description-derived food / beverage');
  if (hasD(['weapon', 'sword', 'blade', 'firearm', 'gun', 'rifle', 'pistol', 'spear', 'polearm', 'staff used as a weapon', 'dagger', 'axe', 'bow used for archery', 'shield', 'ammunition', 'projectile'])) return place('Items', 'Weapon', 'Description-derived weapon');
  if (hasD(['musical instrument', 'instrument used to produce sound', 'guitar', 'piano', 'microphone', 'headphones', 'audio equipment', 'musical note'])) return place('Items', 'Musical instruments', 'Description-derived instrument / audio equipment');
  if (hasD(['electronic device', 'computer', 'smartphone', 'mobile phone', 'camera device', 'tablet computer', 'controller', 'remote control', 'monitor', 'robot', 'machine', 'machinery', 'technology'])) return place('Items', 'Digital devices', 'Description-derived device / technology');
  if (hasD(['book', 'notebook', 'writing instrument', 'pencil', 'pen', 'paper', 'scroll', 'clipboard', 'school supplies', 'stationery', 'magazine', 'sketchbook'])) return place('Items', 'Study supplies', 'Description-derived writing / study item');
  if (hasD(['vehicle', 'aircraft', 'ship', 'boat', 'watercraft', 'car', 'train', 'motorcycle', 'bicycle', 'spacecraft', 'steering wheel'])) return place('Items', 'Vehicle', 'Description-derived vehicle');
  if (hasD(['furniture', 'chair', 'table', 'desk', 'shelf', 'bookshelf', 'drawer', 'cabinet', 'bed', 'sofa', 'couch', 'stool', 'bench', 'rug', 'carpet', 'pillow', 'blanket', 'kotatsu', 'tatami'])) return place('Scene', 'Indoor', 'Description-derived furniture / interior');
  if (hasD(['building', 'architecture', 'room', 'interior', 'indoor', 'indoors', 'house', 'school building', 'office building', 'street', 'city', 'cityscape', 'bridge', 'castle', 'temple', 'shrine', 'station', 'balcony', 'hallway', 'corridor', 'fence', 'gate', 'floor', 'ceiling', 'wall'])) return place('Scene', hasD(['indoor', 'indoors', 'room', 'interior', 'furniture', 'floor', 'ceiling', 'wall']) ? 'Indoor' : 'Outdoor', 'Description-derived location / architecture');
  if (hasD(['weather', 'wind', 'breeze', 'cloud', 'rain', 'snow', 'storm', 'fog', 'mist', 'sky', 'sunlight', 'moonlight', 'time of day', 'sunset', 'sunrise', 'dawn', 'dusk'])) return place('Environment', 'Weather & atmosphere', 'Description-derived weather / sky / time');
  if (hasD(['water', 'ocean', 'sea', 'lake', 'river', 'waterfall', 'wave', 'underwater', 'puddle', 'watercraft', 'aquatic'])) return place('Environment', 'Water', 'Description-derived water / aquatic environment');
  if (hasD(['nature', 'landscape', 'natural environment', 'forest', 'mountain', 'beach', 'meadow', 'garden', 'cliff', 'rock formation', 'sand dune'])) return place('Environment', 'Nature', 'Description-derived natural environment');
  if (hasD(['camera angle', 'shot type', 'camera shot', 'camera view', 'viewpoint', 'perspective', 'depth of field', 'focus', 'close-up', 'wide shot', 'portrait shot', 'selfie'])) return place('Camera', 'Camera', 'Description-derived framing / view');
  if (hasD(['pose', 'posture', 'gesture', 'body position', 'action of', 'act of', 'movement', 'walking', 'running', 'sitting', 'standing', 'kneeling', 'lying', 'holding', 'carrying', 'touching', 'hugging', 'kissing', 'fighting', 'dancing', 'playing', 'interaction', 'behavior'])) return place('Facial expression and action', /pose|posture|position/.test(d) ? 'Pose' : 'Other actions', 'Description-derived action / pose');
  if (nsfw && hasD(['sexual', 'sex act', 'sexual activity', 'nudity', 'nude', 'exposed', 'genital', 'ejaculation', 'semen', 'urine', 'masturbation', 'bondage', 'fetish'])) return place('Facial expression and action', 'Other actions', 'Description-derived adult / intimate tag');
  if (hasD(['symbol', 'emoticon', 'emoji', 'lettering', 'text overlay', 'speech bubble', 'thought bubble', 'logo', 'watermark', 'signature', 'icon'])) return place('Image', 'Text & symbols', 'Description-derived symbol / graphic');
  if (hasD(['art style', 'artistic style', 'drawing style', 'illustration style', 'rendering style', 'artwork', 'painting technique', 'visual effect', 'texture', 'color palette', 'colour palette', 'pattern', 'monochrome', 'cel shading', 'watercolor', 'line art'])) return place('Image', 'Art style', 'Description-derived visual style');
  if (hasD(['image quality', 'resolution', 'image compression', 'watermark', 'metadata', 'tag used for', 'danbooru tag', 'upload', 'copyright notice', 'username', 'post number', 'timestamp', 'date overlay', 'sequentially numbered'])) return place('Image', 'Quality', 'Description-derived image metadata');

  // Expanded residual routing for the long tail of native General tags. These
  // cues intentionally describe concepts, objects, events and visual effects,
  // rather than relying on Danbooru's non-semantic native General category.
  const tag = cleanKey(record.tag);
  if (hasD(['season', 'seasonal', 'winter', 'summer', 'autumn', 'fall season', 'spring', 'holiday', 'holidays', 'festival', 'celebration', 'new year', 'christmas', 'halloween', 'zodiac', 'year of the', 'historical period'])) return place('Environment', 'Season & time', 'Season / holiday / cultural event');
  if (hasD(['married couple', 'husband and wife', 'wife and wife', 'husbands', 'siblings', 'family relationship', 'romantic relationship', 'mutual affection', 'friends', 'jealous', 'envious', 'possessive of another', 'fear of losing', 'bond between characters'])) return place('Person', 'Relationships', 'Relationship / social dynamic');
  if (hasD(['occupation', 'profession', 'person who', 'someone who', 'singer', 'song cover', 'amateur singer', 'idol', 'pirate', 'delinquent', 'student', 'teacher', 'soldier', 'nurse', 'doctor', 'performer', 'voice actor', 'tokusatsu', 'superhero', 'live action film', 'television series', 'franchise'])) return place('Person', 'Identity', 'Occupation / identity / media role');
  if (hasD(['supernatural ability', 'ability to', 'power to', 'manipulate electricity', 'generate electricity', 'psychic ability', 'mind control', 'telekinesis', 'electrokinesis', 'magical power', 'magic spell', 'superpower', 'special ability', 'alternate form', 'evolutionary family'])) return place('Person', 'Anime Role', 'Ability / lore / alternate form');
  if (hasD(['emotion', 'emotional state', 'feeling of', 'feeling that', 'fear or anxiety', 'unable to accomplish', 'lost a game', 'beaten in battle', 'opposite to victory', 'state of defeat', 'state of mind', 'trancelike state', 'highly suggestible', 'mind control', 'actively being destroyed', 'destruction of'])) return place('Facial expression and action', 'Other actions', 'Emotion / mental state / event');
  if (hasD(['dead or dying', 'death of', 'vital functions', 'injury', 'injuries', 'cuts or tears to the skin', 'wound', 'bruises', 'body is sweating', 'heavy sweating', 'sweat drops', 'rivulets of sweat', 'body odor', 'bodily odors', 'body fluid'])) return place('Person', 'Body parts', 'Body condition / injury / fluid');
  if (hasD(['exposed due to the actions', 'body is exposed', 'sexual activity', 'sexual act', 'after sex', 'sexually explicit', 'erotic', 'fetish', 'genitals', 'anus', 'vulva', 'penis', 'ejaculation', 'fertilization', 'orgasm', 'masturbation', 'bondage'])) return place('Facial expression and action', 'Other actions', 'Adult / intimate concept');
  if (hasD(['ornament', 'ornaments', 'small-scale statue', 'statue modeled after', 'container where waste', 'trash receptacle', 'portable mechanical', 'motorized saw', 'digging tool', 'medical device', 'listen to internal sounds', 'stethoscope', 'marker pen', 'felt-tip pen', 'writing instrument', 'pacifier', 'keyhole', 'hole in a lock', 'pipe used for smoking', 'smoking pipe', 'poker chip', 'game piece', 'gaming accessory', 'mechanical device', 'electronic device', 'piece of equipment', 'tool used to', 'tool for', 'object used for', 'object used to', 'an object used', 'a device used', 'a type of gag', 'a gag with', 'household item'])) {
    if (hasD(['medical device', 'stethoscope', 'medical equipment'])) return place('Items', 'Other items', 'Medical equipment');
    if (hasD(['tool', 'portable mechanical', 'motorized saw', 'weapon', 'blade', 'firearm'])) return place('Items', 'Weapon', 'Tool / mechanical object');
    if (hasD(['writing instrument', 'marker pen', 'felt-tip pen', 'writing', 'stationery', 'notes'])) return place('Items', 'Study supplies', 'Writing / study item');
    return place('Items', 'Other items', 'Object / prop');
  }
  if (hasD(['mineral', 'crystal', 'ordered arrangement of atoms', 'molecules or ions', 'metal structure', 'piece of metal', 'solid brittle object', 'small pieces of broken', 'chemical substance', 'colored liquid', 'powder', 'material consisting of', 'made from glass', 'made of metal', 'gemstone', 'jewel', 'precious stone'])) return place('Items', 'Other items', 'Material / mineral / object');
  if (hasD(['musical instrument', 'collection of drums', 'drum kit', 'trap set', 'song', 'musical group', 'music genre', 'singer who', 'instrument used to produce sound', 'musical equipment', 'audio equipment'])) return place('Items', 'Musical instruments', 'Music / audio equipment');
  if (hasD(['arch is a', 'curved structure', 'roofed, open gallery', 'roofed open gallery', 'porch', 'veranda', 'stone marker placed near a grave', 'tombstone', 'building or structure', 'architectural feature', 'structure used to', 'fence used to', 'flagpole', 'fly flags from', 'tall, metal structure'])) return place('Scene', 'Outdoor', 'Architecture / fixed structure');
  if (hasD(['light fixture', 'neon lights', 'beam of energy', 'laser', 'light effect', 'glowing light', 'lighting effect', 'visual effect', 'energy beam', 'particles of light', 'bright illumination'])) return place('Image', 'Lighting & effects', 'Light / energy / visual effect');
  if (hasD(['picture embedded into', 'pictures having other pictures', 'photo embedded', 'image within an image', 'photo inset', 'image is part of a set', 'image that is part of a sequential', 'number printed', 'text overlay', 'overlay showing the time', 'overlay showing the date', 'image overlay', 'numbered set', 'when you see it'])) return place('Image', 'Composition', 'Inset / embedded image / visual layout');
  if (hasD(['printed on clothing', 'print on clothing', 'pattern on clothing', 'colored in', 'colored with', 'color of', 'color pattern', 'color scheme', 'colored armband', 'garment', 'attire', 'clothing accessory', 'piece of clothing', 'worn on the arm', 'worn around the arm', 'worn around the wrist', 'armband'])) {
    if (hasD(['print', 'pattern', 'color scheme', 'colored in', 'color of'])) return place('Apparel', 'Casual clothing', 'Clothing color / pattern / material');
    return place('Apparel', 'Accessories', 'Clothing accessory');
  }
  if (hasD(['ancient egyptian', 'cultural elements', 'cultural or otherwise', 'traditional culture', 'mythology', 'folklore', 'historical culture', 'religious symbol', 'religious practice', 'chinese zodiac', 'year of birth'])) return place('Person', 'Anime Role', 'Culture / history / lore');
  if (hasD(['deprecated tag', 'see ', 'ambiguous tag', 'may refer to', 'is ambiguous'])) {
    if (/^(?:serval_print|redesign|alternate_form|evolutionary_line|real_life_insert|vocaloid_append|inset|photo_inset|numbered|round_image|timestamp|post_number|cover_image|copyright_notice)$/.test(tag)) return place('Image', 'Composition', 'Image / publication metadata');
    if (/^(?:pirate|delinquent|utaite|tokusatsu|sangvis_ferri|psychic|ancient_egyptian)$/.test(tag)) return place('Person', 'Identity', 'Role / lore / ambiguous wiki tag');
  }
  return null;
}

function promptAllInOneClassifierPlacement(record: PromptAllInOneRecord): BuilderPlacement | null {
  const source = record.classificationSources || [];
  if (!record.uiCategory || source.length === 0 || source.some((s) => /fallback|unclassified/i.test(s))) return null;
  if ((record.classificationConfidence ?? 0) < 0.82) return null;
  const p = record.uiCategory;
  const s = record.uiSubCategory || '';
  const tag = cleanKey(record.tag);
  const place = (parent: string, sub: string, leaf?: string): BuilderPlacement => ({ parent, sub, leaf });
  if (p === 'Person') {
    if (/hair/i.test(s)) return place('Person', 'Hair', s);
    if (/eyes|eye/i.test(s)) return place('Person', 'Eyes', s);
    if (/ears|ear/i.test(s)) return place('Person', 'Ears', s);
    if (/skin/i.test(s)) return place('Person', 'Skin', s);
    if (/chest|breast/i.test(s)) return place('Person', 'Chest', s);
    if (/wing/i.test(s)) return place('Person', 'Wings', s);
    if (/figure|physique|build|age/i.test(s)) return place('Person', /age/i.test(s) ? 'Age' : 'Figure', s);
    if (/identity|role|occupation|series|character/i.test(s)) return place('Person', 'Anime Role', s);
    if (/object|count|people/i.test(s)) return place('Person', 'Object', s);
    return place('Person', 'Body parts', s);
  }
  if (p === 'Apparel') {
    if (/hat|head/i.test(s)) return place('Apparel', 'Headwear', s);
    if (/glasses|eyewear/i.test(s)) return place('Apparel', 'Eyewear', s);
    if (/gloves|handwear/i.test(s)) return place('Apparel', 'Handwear', s);
    if (/neckline|neckwear/i.test(s)) return place('Apparel', 'Neckwear', s);
    if (/socks|legwear/i.test(s)) return place('Apparel', 'Underwear', s);
    if (/shoes|footwear/i.test(s)) return place('Apparel', 'Footwear', s);
    if (/uniform/i.test(s)) return place('Apparel', 'Uniform', s);
    if (/swimwear/i.test(s)) return place('Apparel', 'Swimwear', s);
    if (/skirt|formal|dress/i.test(s) || /dress|gown|tuxedo|wedding/.test(tag)) return place('Apparel', 'Formal wear', s);
    if (/coat|jacket|cape|cloak/i.test(s)) return place('Apparel', 'Casual clothing', s);
    if (/necklace|jewel|accessor/i.test(s)) return place('Apparel', 'Jewelry', s);
    return place('Apparel', 'Casual clothing', s);
  }
  if (p === 'Facial expression and action') {
    if (/smile|happy|laugh/i.test(s)) return place('Facial expression and action', 'Smile', s);
    if (/cry|tear|sad/i.test(s)) return place('Facial expression and action', 'Cry', s);
    if (/angry|unhappy|frown/i.test(s)) return place('Facial expression and action', 'Unhappy', s);
    if (/pose|posture|leg actions/i.test(s)) return place('Facial expression and action', 'Pose', s);
    if (/gaze|look|head|protagonist/i.test(s)) return place('Facial expression and action', 'Protagonist action', s);
    return place('Facial expression and action', 'Other actions', s);
  }
  if (p === 'Camera') {
    if (/protagonist action|gaze/i.test(s)) return place('Facial expression and action', 'Protagonist action', s);
    return place('Camera', 'Camera', s);
  }
  if (p === 'Image') return place('Image', /quality|metadata|resolution/i.test(s) ? 'Quality' : /background/i.test(s) ? 'Background' : /lighting|effect/i.test(s) ? 'Lighting & effects' : 'Art style', s);
  if (p === 'Environment') return place('Environment', /water/i.test(s) ? 'Water' : /season|time|event/i.test(s) ? 'Season & time' : /weather|sky|atmosphere/i.test(s) ? 'Weather & atmosphere' : 'Nature', s);
  if (p === 'Scene') return place('Scene', /indoor|room|floor|furniture/i.test(s) ? 'Indoor' : 'Outdoor', s);
  if (p === 'Items') return place('Items', /weapon/i.test(s) ? 'Weapon' : /animal|creature/i.test(s) ? 'Animal' : /food|beverage/i.test(s) ? 'Food' : /plant|flower/i.test(s) ? 'Plant' : /digital|technology/i.test(s) ? 'Digital devices' : /study|book|writing/i.test(s) ? 'Study supplies' : 'Other items', s);
  if (p === 'Hanfu') return place('Hanfu', 'Traditional outfit', s);
  if (p === 'Negative Prompt') return place('Negative Prompt', /person|anatomy|hand/i.test(s) ? 'Person' : 'Image', s);
  if (p === 'NSFW & Adult') {
    if (/anatomy|fluid/i.test(s)) return place('Person', 'Body parts', 'Adult anatomy');
    if (/attire|fetish/i.test(s)) return place('Apparel', 'Underwear', 'Adult attire');
    if (/position/i.test(s)) return place('Facial expression and action', 'Pose', 'Adult position');
    return place('Facial expression and action', 'Other actions', 'Adult action');
  }
  if (p === 'Style') return place('Image', 'Art style', s);
  if (p === 'Technical') return place('Image', 'Quality', s);
  if (p === 'Subject') return place('Person', /job|occupation|role|character|franchise|series/i.test(s) ? 'Anime Role' : /age|gender|relationship|group/i.test(s) ? 'Identity' : 'Object', s);
  return null;
}

// Prompt All in One evaluates thousands of fixed vocabulary terms for each local tag.
// Their normalized forms never change; memoize these rule tokens so building an index over
// the full Danbooru snapshot does not repeatedly run lower/trim/replace regexes on constants.
const PROMPT_ALL_IN_ONE_RULE_KEY_CACHE = new Map<string, string>();
function promptAllInOneRuleKey(word: string): string {
  const cached = PROMPT_ALL_IN_ONE_RULE_KEY_CACHE.get(word);
  if (cached !== undefined) return cached;
  const normalized = cleanKey(word);
  PROMPT_ALL_IN_ONE_RULE_KEY_CACHE.set(word, normalized);
  return normalized;
}

export function getPromptAllInOnePlacements(record: PromptAllInOneRecord): BuilderPlacement[] {
  const t = cleanKey(record.tag);
  const searchTerms = [t, ...(record.aliases || []).map(cleanKey).filter(Boolean)];
  const searchTokens = new Set<string>();
  const searchPhrases = new Set<string>(searchTerms);
  for (const term of searchTerms) {
    const parts = term.split(/[^a-z0-9]+/).filter(Boolean);
    for (const part of parts) {
      searchTokens.add(part);
      if (part.length > 3 && part.endsWith('s') && !part.endsWith('ss')) searchTokens.add(part.slice(0, -1));
      if (part.length > 4 && part.endsWith('ies')) searchTokens.add(`${part.slice(0, -3)}y`);
    }
    for (let i = 0; i < parts.length; i++) {
      let phrase = '';
      for (let j = i; j < Math.min(parts.length, i + 5); j++) {
        phrase = phrase ? `${phrase}_${parts[j]}` : parts[j];
        searchPhrases.add(phrase);
      }
    }
  }
  const hasTag = (words: string[]) => words.some((word) => {
    const key = promptAllInOneRuleKey(word);
    return searchTokens.has(key) || searchPhrases.has(key);
  });
  const matches = (regex: RegExp) => searchTerms.some((term) => regex.test(term));
  const native = record.nativeCategory || 'General';
  // Strict semantic placement is expensive across the full 140k-tag index. Most tags are
  // already handled by the taxonomy-specific dictionary/lexical rules below, so compute it
  // lazily only if those rules cannot find a placement. This keeps first-use index builds
  // responsive without changing the fallback placement logic.
  let semantic: BuilderPlacement[] | null = null;
  const place = (parent: string, sub: string, leaf?: string): BuilderPlacement => ({ parent, sub, leaf });
  const unique = (items: BuilderPlacement[]) => items.filter((p, i, all) => all.findIndex((x) => x.parent === p.parent && x.sub === p.sub && x.leaf === p.leaf) === i);

  let primary: BuilderPlacement | null = null;
  if (native === 'Artist') primary = place('Image', 'Art style', 'Artist');
  else if (native === 'Character' || native === 'Copyright') primary = place('Person', 'Anime Role', native === 'Character' ? 'Character identity' : 'Series / franchise');
  else if (native === 'Meta') primary = place('Image', 'Quality', 'Metadata');
  else if (/^(?:[1-9][0-9]*(?:girls?|boys?|women|men|others?)|multiple_(?:girls|boys)|solo|duo|trio|group|everyone)$/.test(t) || hasTag(['girl', 'boy', 'woman', 'man', 'female', 'male', 'solo', 'multiple_girls', 'multiple_boys', 'couple', 'people'])) primary = place('Person', 'Object', 'People / count');
  else if (hasTag(['otoko_no_ko', 'femboy', 'trap', 'loli', 'shota', 'child', 'children', 'baby', 'toddler', 'teen', 'teenager', 'adult', 'elderly', 'old', 'young', 'aged_down', 'aged_up', 'androgynous', 'genderless', 'transgender', 'intersex', 'interracial', 'siblings', 'brothers', 'sisters', 'husband_and_wife', 'couple', 'bride', 'groom', 'dancer', 'doll', 'elf', 'angel', 'demon', 'vampire', 'witch', 'alien', 'mermaid', 'yandere', 'tsundere'])) primary = place('Person', hasTag(['child', 'children', 'baby', 'toddler', 'teen', 'teenager', 'adult', 'elderly', 'old', 'young', 'aged_down', 'aged_up']) ? 'Age' : hasTag(['siblings', 'brothers', 'sisters', 'husband_and_wife', 'couple', 'interracial', 'age_difference', 'height_difference', 'size_difference']) ? 'Relationships' : 'Identity', 'Identity / age / relationship');
  else if (hasTag(['occupation', 'student', 'teacher', 'nurse', 'doctor', 'maid', 'waitress', 'police', 'soldier', 'chef', 'scientist', 'office_lady', 'job', 'profession', 'royalty', 'queen', 'king', 'princess', 'knight', 'samurai', 'idol', 'bride', 'dancer', 'staff_only'])) primary = place('Person', 'Identity', 'Role / occupation');
  else if (hasTag(['hair', 'braid', 'braided', 'twin_braids', 'two_side_up', 'one_side_up', 'ponytail', 'twintails', 'bangs', 'ahoge', 'hime_cut', 'bob_cut', 'sidelocks', 'sideburns', 'drill_hair', 'hair_bun', 'hair_flaps', 'single_side_bun', 'twin_drills', 'updo', 'cowlick', 'antenna_hair', 'official_alternate_hairstyle'])) primary = place('Person', 'Hair', 'Style / color');
  else if (hasTag(['eye', 'eyes', 'pupil', 'pupils', 'iris', 'eyelash', 'eyelashes', 'eyebrow', 'eyebrows', 'heterochromia', 'eyeshadow', 'eyeliner', 'eyepatch', 'sclera', 'colored_sclera', 'eye_focus', 'glowing_eyes'])) primary = place('Person', 'Eyes', 'Shape / color / detail');
  else if (hasTag(['mole', 'freckles', 'blush', 'sweat', 'sweating', 'saliva', 'drool', 'drooling', 'spit', 'blood', 'makeup', 'lipstick', 'scar', 'facial_mark', 'facepaint', 'nose', 'mouth', 'lips', 'teeth', 'fang', 'fangs', 'tongue', 'smile', 'grin', 'smirk', 'frown', 'pout', 'expressionless', 'beard', 'mustache', 'snout', 'beak', 'tusks', 'forehead', 'faceless', 'colored_sclera'])) primary = place('Person', 'Face', 'Feature / expression');
  else if (hasTag(['ear', 'ears', 'horn', 'horns', 'antlers', 'antennae', 'antenna', 'whisker', 'whiskers', 'whisker_markings'])) primary = place('Person', 'Ears', 'Ear / head feature');
  else if (hasTag(['skin', 'pale_skin', 'dark_skin', 'tanlines', 'tan', 'tattoo', 'body_paint', 'fur', 'scales', 'feathers', 'feather', 'stitches', 'vein', 'veins', 'injury', 'injured', 'wound', 'wounds', 'bruise', 'bruises', 'bandage', 'bandages', 'prosthesis', 'prosthetic_limb', 'slime', 'goo'])) primary = place('Person', 'Skin', 'Skin / surface / body state');
  else if (hasTag(['skinny', 'slender', 'curvy', 'plump', 'chibi', 'skindentation', 'thick_thighs', 'muscular', 'petite', 'tall', 'short_stature', 'pregnant', 'fat', 'thin', 'body_type', 'toned', 'height_difference', 'size_difference', 'age_difference', 'mini_person'])) primary = place('Person', 'Figure', 'Build / physique / proportions');
  else if (hasTag(['wing', 'wings', 'tail', 'tails', 'two_tails', 'tail_raised', 'tail_lifted', 'tail_up', 'mouse_tail', 'raccoon_tail', 'cow_tail', 'shark_tail', 'fins', 'fin', 'claws', 'claw', 'talons', 'paws', 'paw', 'gills'])) primary = place('Person', 'Wings', 'Fantasy / animal anatomy');
  else if (hasTag(['chest', 'breast', 'breasts', 'cleavage', 'nipple', 'collarbone', 'pectorals', 'torso', 'abs', 'armpits', 'armpit', 'armpit_crease', 'veins', 'veiny'])) primary = place('Person', 'Chest', 'Chest / torso');
  else if (hasTag(['waist', 'hip', 'hips', 'abdomen', 'navel', 'belly', 'stomach', 'midriff', 'groin', 'back', 'spine', 'rib', 'ribs', 'vein', 'joints', 'joint', 'bone', 'bones', 'skull', 'neck', 'throat', 'clavicle'])) primary = place('Person', hasTag(['waist', 'hip', 'hips', 'abdomen', 'navel', 'belly', 'stomach', 'midriff', 'groin']) ? 'Waist' : 'Body parts', 'Torso / body anatomy');
  else if (hasTag(['hand', 'hands', 'finger', 'fingers', 'thumb', 'palm', 'wrist', 'arm', 'arms', 'elbow', 'shoulder', 'shoulders', 'fingernails', 'nails', 'nail_polish', 'toenails', 'black_nails', 'red_nails', 'blue_nails', 'pink_nails', 'green_nails', 'yellow_nails', 'white_nails', 'multicolored_nails', 'bound', 'bound_wrists', 'sharp_fingernails'])) primary = place('Person', 'Hands', 'Arms / hands / nails');
  else if (hasTag(['leg', 'legs', 'thigh', 'knee', 'calf', 'foot', 'feet', 'toe', 'ankle', 'soles', 'lowleg', 'legs_up'])) primary = place('Person', 'Body parts', 'Legs / feet');
  else if (hasTag(['halo', 'hat', 'cap', 'beret', 'beanie', 'helmet', 'tiara', 'crown', 'headband', 'veil', 'bonnet', 'hairband', 'headwear', 'headgear', 'hood', 'hood_up', 'hood_down', 'hooded', 'fur-trimmed_hood', 'blindfold', 'blindfolded'])) primary = place('Apparel', 'Headwear', 'Head accessory / covering');
  else if (hasTag(['glasses', 'sunglasses', 'eyewear', 'monocle', 'goggles', 'gas_mask', 'domino_mask', 'mask', 'masks', 'visor', 'blindfold'])) primary = place('Apparel', 'Eyewear', 'Glasses / face accessory');
  else if (hasTag(['necklace', 'earrings', 'bracelet', 'choker', 'jewelry', 'ring', 'pendant', 'brooch', 'bangle', 'gem', 'gemstone', 'jewel', 'jewels', 'forehead_jewel', 'crown_jewel', 'medal', 'badge', 'pin', 'hair_ornament', 'crescent_pin', 'tassel', 'chain', 'multiple_rings', 'barbell_piercing'])) primary = place('Apparel', 'Jewelry', 'Jewelry / ornament');
  else if (hasTag(['kimono', 'hanfu', 'cheongsam', 'qipao', 'yukata', 'furisode', 'obi', 'traditional_clothes', 'japanese_clothes', 'hakama', 'kariginu', 'habit', 'serafuku', 'sailor_uniform', 'black_serafuku'])) primary = hasTag(['hanfu']) ? place('Hanfu', 'Traditional outfit', 'Hanfu') : place('Apparel', 'Traditional clothing', 'Traditional garment');
  else if (hasTag(['dress', 'gown', 'tuxedo', 'suit', 'formal_wear', 'wedding_dress', 'evening_gown', 'formal_dress', 'bridesmaid', 'bridal', 'microdress'])) primary = place('Apparel', 'Formal wear', 'Dress / formal garment');
  else if (hasTag(['underwear', 'panties', 'bra', 'lingerie', 'pantyhose', 'stockings', 'thighhighs', 'thighhigh', 'single_thighhigh', 'socks', 'kneehighs', 'single_kneehigh', 'legwear', 'garter', 'highleg', 'fundoshi', 'topless', 'pantylines', 'fishnets', 'leggings', 'bloomers', 'buruma', 'sleepwear', 'camisole', 'undershirt', 'bodysuit', 'leotard', 'corset', 'spaghetti_strap'])) primary = place('Apparel', 'Underwear', 'Underwear / hosiery / close-fitting garment');
  else if (hasTag(['swimsuit', 'bikini', 'swimwear', 'one_piece_swimsuit', 'microbikini', 'swim_trunks', 'bathing_suit'])) primary = place('Apparel', 'Swimwear', 'Swimwear');
  else if (hasTag(['shoes', 'shoe', 'boots', 'sneakers', 'sandals', 'heels', 'footwear', 'slippers', 'loafers', 'geta', 'skates'])) primary = place('Apparel', 'Footwear', 'Shoes');
  else if (hasTag(['uniform', 'school_uniform', 'military_uniform', 'sailor_uniform', 'nurse_uniform', 'police_uniform', 'armor', 'full_armor', 'black_armor', 'vambraces', 'greaves', 'faulds', 'pauldron', 'gauntlets', 'bridal_gauntlets', 'single_pauldron'])) primary = place('Apparel', 'Uniform', 'Uniform / armor / protective wear');
  else if (hasTag(['shirt', 'blouse', 'top', 'sweater', 'hoodie', 'skirt', 'pants', 'shorts', 'jeans', 'jacket', 'coat', 'cape', 'cloak', 'robe', 'sleeves', 'gloves', 'scarf', 'tie', 'necktie', 'bowtie', 'bow', 'ribbon', 'belt', 'belts', 'neckerchief', 'ascot', 'sash', 'vest', 'cardigan', 'blazer', 'turtleneck', 'suspenders', 'apron', 'denim', 'costume', 'alternate_costume', 'outfit', 'clothing', 'clothes', 'collar', 'sailor_collar', 'fur_trim', 'playboy_bunny', 'zettai_ryouiki', 'frills', 'frilled_bow', 'lace_trim', 'gold_trim', 'red_trim', 'pom_pom_(clothes)', 'pom_pom', 'insignia', 'bandana', 'scrunchie', 'buckle', 'drawstring', 'strap', 'straps', 'spaghetti_strap', 'cutoffs', 'two-sided_fabric', 'button', 'buttons', 'partially_unbuttoned', 'partially_unzipped', 'hooded_capelet', 'capelet', 'coattails', 'black_vest', 'red_vest', 'green_vest', 'blue_vest'])) primary = place('Apparel', 'Casual clothing', 'Garment / trim / accessory');
  else if (hasTag(['smile', 'grin', 'smirk', 'happy', 'laughing', 'giggle', 'light_smile'])) primary = place('Facial expression and action', 'Smile', 'Positive expression');
  else if (hasTag(['cry', 'crying', 'sad', 'tear', 'tears', 'tearing_up', 'sobbing', 'weeping', 'sniffling'])) primary = place('Facial expression and action', 'Cry', 'Sadness / tears');
  else if (hasTag(['angry', 'anger', 'annoyed', 'furious', 'frown', 'scowl', 'expressionless', 'embarrassed', 'surprised', 'trembling', 'shy'])) primary = place('Facial expression and action', 'Unhappy', 'Negative / other expression');
  else if (hasTag(['looking_at', 'looking_away', 'looking_up', 'looking_down', 'looking_back', 'staring', 'eye_contact', 'gaze', 'facing_viewer', 'facing_away', 'facing_another', 'facing_to_the_side', 'facing_the_viewer', 'selfie', 'self_shot', 'looking_to_the_side'])) primary = place('Facial expression and action', 'Protagonist action', 'Gaze / orientation');
  else if (hasTag(['standing', 'sitting', 'kneeling', 'lying', 'squatting', 'crouching', 'leaning', 'pose', 'posture', 'arms_crossed', 'hands_on_hips', 'bent_over', 'straddling', 'against_wall', 'side_by_side', 'back_to_back', 'from_behind', 'from_side', 'from_above', 'from_below', 'legs_spread', 'on_one_leg', 'arched_back', 'leaning_forward', 'leaning_back', 'reverse_grip'])) primary = place('Facial expression and action', 'Pose', 'Posture / position');
  else if (hasTag(['holding', 'carrying', 'touching', 'grabbing', 'hugging', 'kissing', 'waving', 'pointing', 'eating', 'drinking', 'walking', 'running', 'jumping', 'dancing', 'swimming', 'fighting', 'sleeping', 'reading', 'writing', 'playing', 'action', 'movement', 'restrained', 'gagged', 'bound', 'trembling', 'breath', 'breathing', 'waking_up', 'presenting', 'taking_picture', 'partially_submerged', 'submerged', 'shared_bathing', 'imminent_kiss', 'after_kiss'])) primary = place('Facial expression and action', 'Other actions', 'Action / interaction');
  else if (hasTag(['lowres', 'worstquality', 'bad_quality', 'blurry', 'watermark', 'signature', 'bad_anatomy', 'bad_hands', 'extra_digits', 'missing_fingers', 'cropped', 'jpeg_artifacts', 'low_quality', 'worst_quality', 'quality', 'masterpiece', 'best_quality', 'high_quality', 'absurdres', 'highres', 'high_resolution', 'copyright_notice', 'page_number', 'one-hour_drawing_challenge', 'year_tag'])) primary = place('Image', 'Quality', 'Quality / metadata');
  else if (hasTag(['portrait', 'full_body', 'upper_body', 'cowboy_shot', 'panorama', 'multiple_views', 'letterboxed', 'border', 'white_border', 'black_border', 'frame', 'motion_lines', 'speech_bubble', 'thought_bubble', 'thought_balloon', 'white_background', 'transparent_background', 'background', 'simple_background', 'grey_background', 'gray_background', 'gradient_background', 'two-tone_background', 'letterboxed', 'foreshortening', 'composition', 'outline', 'white_outline', 'jaggy_lines', '4koma', 'comic', 'manga', 'sketch', 'painting', 'retro_artstyle', 'comic', 'meme', 'parody', 'scene_reference', 'reference_inset'])) primary = place('Image', hasTag(['background', 'white_background', 'black_background', 'grey_background', 'gray_background', 'gradient_background', 'wooden_floor', 'tile_floor', 'brick_wall', 'tile_wall']) ? 'Background' : hasTag(['portrait', 'full_body', 'upper_body', 'cowboy_shot', 'panorama', 'multiple_views', 'letterboxed', 'foreshortening']) ? 'Composition' : 'Art style', 'Composition / graphic treatment');
  else if (hasTag(['masterpiece', 'best_quality', 'high_quality', 'absurdres', 'highres', 'resolution', 'quality', 'monochrome', 'grayscale', 'watercolor', 'oil_painting', 'anime_coloring', 'cel_shading', 'lineart', 'sketch', 'science_fiction', 'cyberpunk', 'fantasy', 'retro_artstyle', 'glowing', 'glint', 'sparkle', 'light_particles', 'aura', 'energy', 'lightning', 'shadow', 'sunlight', 'moonlight', 'shiny', 'transparent', 'muted_color', 'gold', 'silver', 'gradient', 'polka_dot', 'plaid', 'striped', 'checkered', 'two-tone', 'pattern', 'paint_splatter', 'confetti', 'steam', 'smoke', 'contrail', 'ripples', 'air_bubble', 'bubble', 'soap_bubbles'])) primary = place('Image', hasTag(['shadow', 'sunlight', 'moonlight', 'glint', 'glowing', 'sparkle', 'light_particles', 'aura', 'energy', 'lightning', 'steam', 'smoke', 'contrail', 'ripples', 'air_bubble', 'bubble', 'soap_bubbles']) ? 'Lighting & effects' : hasTag(['polka_dot', 'plaid', 'striped', 'checkered', 'pattern', 'two-tone']) ? 'Color & patterns' : 'Art style', 'Visual effect / palette / pattern');
  else if (hasTag(['bedroom', 'bathroom', 'kitchen', 'classroom', 'office', 'living_room', 'indoor', 'indoors', 'room', 'floor', 'wall', 'stairs', 'staircase', 'stairway', 'railing', 'fence', 'pillar', 'ceiling', 'bookshelf', 'bench', 'throne', 'locker', 'wardrobe', 'futon', 'tatami', 'wooden_floor', 'tile_floor', 'tile_wall', 'brick_wall', 'chalkboard', 'blackboard', 'window', 'door', 'gate', 'toilet', 'stairs', 'stool', 'armchair', 'couch', 'cushion', 'blanket', 'pillow', 'curtain', 'railing', 'utility_pole', 'chain-link_fence'])) primary = place('Scene', 'Indoor', 'Interior / furniture / architecture');
  else if (hasTag(['street', 'city', 'cityscape', 'castle', 'temple', 'shrine', 'park', 'school', 'station', 'outdoor', 'outdoors', 'building', 'bridge', 'market', 'mountain', 'mountains', 'forest', 'woodland', 'beach', 'ocean', 'sea', 'lake', 'river', 'waterfall', 'garden', 'meadow', 'cliff', 'ruins', 'sand', 'rock', 'rocks', 'bush', 'bushes', 'tree', 'trees', 'bamboo', 'vines', 'maple_leaf', 'leaf', 'leaves', 'rose', 'flower', 'flowers', 'clover', 'lily_pad', 'snowman', 'sky', 'cloud', 'clouds', 'sun', 'moon', 'full_moon', 'crescent_moon', 'weather', 'rain', 'snow', 'night', 'dusk', 'sunset', 'sunrise', 'star_(sky)', 'constellation', 'water', 'puddle', 'waves', 'underwater', 'partially_submerged'])) primary = hasTag(['mountain', 'mountains', 'forest', 'woodland', 'beach', 'ocean', 'sea', 'lake', 'river', 'waterfall', 'garden', 'meadow', 'cliff', 'sand', 'rock', 'rocks', 'bush', 'bushes', 'tree', 'trees', 'bamboo', 'vines', 'maple_leaf', 'leaf', 'leaves', 'rose', 'flower', 'flowers', 'clover', 'lily_pad']) ? place('Environment', 'Nature', 'Landscape / vegetation') : hasTag(['water', 'puddle', 'waves', 'underwater', 'partially_submerged']) ? place('Environment', 'Water', 'Water / aquatic setting') : hasTag(['sky', 'cloud', 'clouds', 'sun', 'moon', 'full_moon', 'crescent_moon', 'weather', 'rain', 'snow', 'night', 'dusk', 'sunset', 'sunrise', 'star_(sky)', 'constellation']) ? place('Environment', 'Weather & atmosphere', 'Sky / weather / time') : place('Scene', 'Outdoor', 'Outdoor location / architecture');
  else if (hasTag(['book', 'notebook', 'pencil', 'paintbrush', 'school_bag', 'backpack', 'bag', 'bags', 'paper', 'pen', 'scroll', 'clipboard', 'chalkboard', 'blackboard', 'letter', 'envelope', 'map', 'page_number'])) primary = place('Items', 'Study supplies', 'Study / writing item');
  else if (hasTag(['computer', 'phone', 'smartphone', 'cellphone', 'laptop', 'tablet', 'camera', 'robot', 'mecha', 'device', 'screen', 'twitter_username', 'artist_name', 'copyright_name', 'speech_bubble', 'headphones', 'controller', 'interface_headset', 'digital_media_player', 'remote_control', 'electric_fan', 'machinery', 'machine', 'cable', 'circuit', 'monitor'])) primary = place('Items', 'Digital devices', 'Device / technology');
  else if (hasTag(['cup', 'plate', 'bowl', 'fork', 'spoon', 'chopsticks', 'teapot', 'glass', 'tableware', 'towel', 'blanket', 'pillow', 'chair', 'couch', 'sofa', 'furniture', 'desk', 'table', 'shelf', 'curtain', 'window', 'door', 'broom', 'bucket', 'box', 'gift_box', 'gift', 'present', 'stuffed_toy', 'plush', 'teddy_bear', 'stuffed_bear', 'balloon', 'clock', 'key', 'lock', 'rope', 'string', 'sack', 'tissue_box', 'bottle', 'vase', 'statue', 'throne', 'locker', 'fan_(electric)', 'scissors', 'needle', 'tape', 'tissue', 'soap', 'money', 'coin', 'cash', 'bell', 'whistle', 'umbrella', 'cigarette', 'cigar', 'lighter', 'candle', 'gift', 'controller', 'magic_circle', 'balloon', 'paper_fan', 'folded_fan', 'fan', 'wand', 'ofuda', 'paper_talisman', 'shikishi', 'gohei', 'anchor', 'sack', 'bucket', 'shell', 'seashell', 'sign', 'banner', 'flag', 'american_flag', 'firearm', 'staff', 'polearm', 'weapon', 'katana', 'sword', 'spear', 'polearm', 'cannon', 'scythe', 'axe', 'lance', 'trident', 'grenade', 'bullet', 'revolver', 'shotgun', 'torpedo', 'explosive', 'kunai', 'fishing_rod', 'sheath', 'sheathed', 'unsheathed', 'holster', 'quiver', 'scope', 'binoculars'])) primary = hasTag(['sword', 'katana', 'spear', 'polearm', 'cannon', 'scythe', 'axe', 'lance', 'trident', 'grenade', 'bullet', 'revolver', 'shotgun', 'torpedo', 'explosive', 'kunai', 'weapon', 'staff', 'firearm', 'sheath', 'sheathed', 'unsheathed', 'holster', 'quiver']) ? place('Items', 'Weapon', 'Weapon / combat item') : hasTag(['book', 'notebook', 'pencil', 'paintbrush', 'paper', 'pen', 'scroll', 'clipboard', 'map', 'page_number', 'letter', 'envelope', 'chalkboard', 'blackboard']) ? place('Items', 'Study supplies', 'Writing / study item') : place('Items', 'Other items', 'Prop / object');
  else if (hasTag(['food', 'cake', 'candy', 'coffee', 'tea', 'fruit', 'rice', 'bread', 'meat', 'drink', 'meal', 'ice_cream', 'doughnut', 'donut', 'wine', 'beer', 'sake', 'sake_bottle', 'wine_bottle', 'beer_can', 'water_bottle', 'doughnuts', 'cooking', 'food'])) primary = place('Items', 'Food', 'Food / beverage');
  else if (hasTag(['sword', 'gun', 'weapon', 'knife', 'rifle', 'bow_(weapon)', 'arrow', 'dagger', 'shield', 'katana', 'polearm', 'staff', 'spear', 'polearm', 'cannon', 'scythe', 'axe', 'lance', 'trident', 'grenade', 'bullet', 'revolver', 'shotgun', 'torpedo', 'explosive', 'kunai', 'sheath', 'sheathed', 'unsheathed'])) primary = place('Items', 'Weapon', 'Weapon / combat item');
  else if (hasTag(['cat', 'dog', 'bird', 'animal', 'fox', 'wolf', 'dragon', 'horse', 'rabbit', 'fish', 'insect', 'monster', 'creature', 'pokemon', 'furry', 'anthro', 'kemono', 'bug', 'snake', 'snakes', 'frog', 'frogs', 'bat_(animal)', 'mouse_(animal)', 'raccoon', 'bear', 'sheep', 'octopus', 'shark', 'starfish', 'butterfly', 'digimon', 'alien', 'skeleton', 'skull', 'teddy_bear', 'stuffed_toy', 'puppet', 'claws', 'antennae', 'antenna', 'fins', 'fin'])) primary = place('Items', 'Animal', 'Animal / creature / plush');
  else if (hasTag(['car', 'train', 'airplane', 'aircraft', 'motorcycle', 'bicycle', 'vehicle', 'ship', 'boat', 'watercraft', 'airship', 'submarine', 'tank', 'flight_deck'])) primary = place('Items', 'Vehicle', 'Transportation');
  else if (hasTag(['star', 'symbol', 'heart', 'cross', 'flower', 'feather', 'ribbon', 'emblem', 'icon', 'logo', 'text', 'lettering', 'signature', 'watermark', 'copyright_notice', 'page_number', 'web_address', 'patreon_username', 'thought_bubble', 'speech_bubble', 'musical_note', 'spoken_heart', 'light_particles', 'sparkle', 'sparkles', 'glint', 'aura', 'magic_circle', 'crescent', 'constellation', 'gemstone', 'blue_gemstone', 'red_gemstone', 'soul_gem'])) primary = place('Image', 'Text & symbols', 'Graphic / symbol / text');

  // Danbooru's native General category is not semantic. Use the actual wiki group
  // and stronger local classifier as fallbacks for tags not caught by common-name rules.
  if (!primary) primary = promptAllInOneWikiPlacement(record.wikiCategory, t, Boolean(record.isNsfw));
  if (!primary) primary = promptAllInOneDescriptionPlacement(record);
  if (!primary) primary = promptAllInOneClassifierPlacement(record);

  if (!primary) {
    semantic = getSemanticPlacements(record);
    const first = semantic.find((p) => p.parent !== PATH.concepts && p.sub !== 'General concepts');
    if (first) {
      const parent = first.parent;
      if (parent === PATH.subject) primary = place('Person', /roles|occupation|series|character/i.test(first.sub) ? 'Anime Role' : /age/i.test(first.sub) ? 'Age' : /relationship|gender/i.test(first.sub) ? 'Identity' : 'Object', first.sub);
      else if (parent === PATH.appearance) primary = place('Person', /hair/i.test(first.sub) ? 'Hair' : /eye/i.test(first.sub) ? 'Eyes' : /ear/i.test(first.sub) ? 'Ears' : /skin/i.test(first.sub) ? 'Skin' : 'Face', first.sub);
      else if (parent === PATH.body) primary = place('Person', /wing/i.test(first.sub) ? 'Wings' : /chest|breast/i.test(first.sub) ? 'Chest' : /hand|arm/i.test(first.sub) ? 'Hands' : /waist|hip|abdomen/i.test(first.sub) ? 'Waist' : 'Body parts', first.sub);
      else if (parent === PATH.clothing) primary = place('Apparel', /formal|dress|gown/i.test(first.sub) ? 'Formal wear' : /headwear|hat/i.test(first.sub) ? 'Headwear' : /footwear|shoe/i.test(first.sub) ? 'Footwear' : /jewel|accessor/i.test(first.sub) ? 'Jewelry' : /underwear|hosiery/i.test(first.sub) ? 'Underwear' : /traditional/i.test(first.sub) ? 'Traditional clothing' : 'Casual clothing', first.sub);
      else if ([PATH.actions, PATH.pose, PATH.interaction].includes(parent as any)) primary = place('Facial expression and action', /smile|face|expression/i.test(first.sub) ? 'Smile' : /gaze|head|look/i.test(first.sub) ? 'Protagonist action' : /pose|posture|position/i.test(first.sub) ? 'Pose' : 'Other actions', first.sub);
      else if (parent === PATH.camera || parent === PATH.composition) primary = place('Camera', /background|color|pattern|lighting|art/i.test(first.sub) ? 'Camera' : 'Camera', first.sub);
      else if (parent === PATH.environment) primary = place('Environment', /water/i.test(first.sub) ? 'Water' : /season|time/i.test(first.sub) ? 'Season & time' : /weather|atmosphere/i.test(first.sub) ? 'Weather & atmosphere' : 'Nature', first.sub);
      else if (parent === PATH.scene) primary = place('Scene', /indoor|room|interior|furniture/i.test(first.sub) ? 'Indoor' : 'Outdoor', first.sub);
      else if (parent === PATH.objects || parent === 'Creatures & Animals') primary = place('Items', /food|beverage/i.test(first.sub) ? 'Food' : /animal|creature|bird|cat|dog/i.test(first.sub) ? 'Animal' : /weapon/i.test(first.sub) ? 'Weapon' : /digital|technology/i.test(first.sub) ? 'Digital devices' : /study|book|writing/i.test(first.sub) ? 'Study supplies' : 'Other items', first.sub);
      else if (parent === PATH.nsfw) primary = place('Facial expression and action', /position|pose/i.test(first.sub) ? 'Pose' : 'Other actions', first.sub);
      else if (parent === PATH.technical) primary = place('Image', 'Quality', first.sub);
      else if (parent === PATH.style) primary = place('Image', 'Art style', first.sub);
    }
  }

  // A remaining tag still receives a navigable Prompt All in One placement. The
  // catch-all is deliberately explicit and small, not a native General bucket.
  if (!primary) {
    if (matches(/(?:^|_)(?:weapon|sword|knife|gun|staff|polearm|spear|axe|katana|cannon|scythe|lance|trident)(?:_|$)/)) primary = place('Items', 'Weapon', 'Weapon / combat item');
    else if (matches(/(?:^|_)(?:nails?|fingernails?|toenails?|claws?|fangs?|teeth|veins?|joints?)(?:_|$)/)) primary = place('Person', 'Body parts', 'Anatomy / detail');
    else if (matches(/(?:^|_)(?:tail|tails|wing|wings|fin|fins|fur|feathers?|scales|gills)(?:_|$)/)) primary = place('Person', 'Wings', 'Animal / fantasy anatomy');
    else if (matches(/(?:^|_)(?:dress|skirt|pants|shirt|coat|jacket|cape|vest|bodysuit|cardigan|serafuku|socks|thighhigh|necktie|bowtie|gloves?|hat|hood|boots|shoes|kimono|hakama|armor|capes?)(?:_|$)/)) primary = place('Apparel', 'Casual clothing', 'Garment / accessory');
    else if (matches(/(?:^|_)(?:background|floor|wall|stairs|fence|railing|building|room|ceiling|window|door|gate|bench|pillar|locker|throne|futon|tatami)(?:_|$)/)) primary = place('Scene', 'Indoor', 'Interior / architecture');
    else if (matches(/(?:^|_)(?:cat|dog|fox|wolf|bear|snake|frog|fish|bird|bat|mouse|sheep|horse|dragon|octopus|shark|butterfly|animal|creature)(?:_|$)/)) primary = place('Items', 'Animal', 'Animal / creature');
    else if (matches(/(?:^|_)(?:rose|flower|tree|leaf|leaves|bamboo|bush|vine|plant|clover|lily|petal|branch|grass|moss)(?:_|$)/)) primary = place('Items', 'Plant', 'Plant / flora');
    else if (matches(/(?:^|_)(?:water|ocean|sea|river|lake|wave|puddle|underwater|rain|snow|moon|sun|sky|cloud|star|sand|rock|mountain|forest|smoke|fire|steam)(?:_|$)/)) primary = place('Environment', 'Nature', 'Natural element / weather');
    else if (matches(/(?:^|_)(?:kiss|hug|holding|grabbing|restrained|gagged|walking|running|sitting|standing|kneeling|lying|facing|looking|waving|pointing|tearing|crying|smiling|laughing|dancing|eating|drinking|sleeping|waking|presenting|peeking)(?:_|$)/)) primary = place('Facial expression and action', 'Other actions', 'Action / interaction');
    else if (matches(/(?:^|_)(?:computer|phone|camera|headphones|controller|machinery|machine|robot|mecha|monitor|screen|device|aircraft|vehicle|train|ship|car|boat|watercraft)(?:_|$)/)) primary = place('Items', 'Digital devices', 'Technology / vehicle');
    else if (matches(/(?:^|_)(?:book|paper|pen|pencil|scroll|map|letter|sign|text|word|number|logo|watermark|signature|bubble|symbol|heart|cross|star|music|note|sound)(?:_|$)/)) primary = place('Image', 'Text & symbols', 'Text / sign / symbol');
    else if (matches(/(?:^|_)(?:color|colour|pattern|striped|plaid|polka|checkered|glowing|light|shadow|aura|energy|sparkle|glint|outline|sketch|manga|comic|anime|painting|artstyle|style|effect)(?:_|$)/)) primary = place('Image', 'Art style', 'Visual style / effect');
    else if (matches(/(?:^|_)(?:age|young|old|child|baby|teen|gender|female|male|girl|boy|woman|man|relationship|siblings|couple|family|identity|interracial|hetero|homo|bisexual|virtual_youtuber|vtuber|inkling|miqo.?te|hyur|erune|draph|bride|groom|yandere|tsundere)(?:_|$)/)) primary = place('Person', 'Identity', 'Identity / relationship / character type');
    else if (matches(/(?:^|_)(?:bow|ribbon|belt|trim|frill|frills|lace|scrunchie|bandana|pom_pom|sash|strap|drawstring|button|buckle|insignia|patch|garter|necktie|bowtie|neckwear|leather|spandex|silk|fabric|denim|satin|latex|wool|fur)(?:_|$)/)) primary = place('Apparel', 'Casual clothing', 'Garment trim / material / accessory');
    else if (matches(/(?:^|_)(?:nail|nails|fingernail|fingernails|toenail|toenails|claw|claws|fang|fangs|teeth|tooth|vein|veins|joint|joints|hoof|hooves|snout|beak|tusk|tusks|armpit|sideburn|goatee|mustache|stubble|beard|hickey|bite_mark)(?:_|$)/)) primary = place('Person', 'Body parts', 'Anatomy / markings');
    else if (matches(/(?:^|_)(?:headgear|headwear|hood|hood_up|hood_down|hooded|blindfold|veil|helmet|headband|antenna|antennae|horn|horns|antler|antlers|antennae|head_wings|fins|hooves)(?:_|$)/)) primary = place('Person', 'Body parts', 'Head / fantasy anatomy');
    else if (matches(/(?:^|_)(?:indoor|outdoor|balcony|corridor|hallway|stairs|staircase|balustrade|railing|fence|wall|floor|ceiling|balcony|porch|rooftop|roof|pillar|column|doorway|gate|pool_ladder|locker|drawer|rug|carpet|bookshelf|bookcase|shelf|shelves|futon|tatami|bench|armchair|stool|cushion|blanket|pillow|bed|toilet|tub|bathtub|sink)(?:_|$)/)) primary = place('Scene', 'Indoor', 'Interior / furniture / architecture');
    else if (matches(/(?:^|_)(?:gift|present|stuffed_toy|plush|teddy_bear|doll|puppet|toy|inflatable_toy|box|gift_box|bucket|sack|bag|bottle|vial|flask|jar|barrel|tissue_box|vase|statue|throne|clock|watch|key|lock|padlock|rope|string|chain|cable|tape|tissue|soap|money|coin|cash|bell|whistle|umbrella|cigarette|cigar|lighter|candle|balloon|skewer|mop|broom|eraser|scissors|needle|sewing_kit|controller|fan|remote_control|drone|surfboard|volleyball|basketball|baseball|skateboard|steering_wheel|anchor|watercraft|aircraft|ship|boat|vehicle)(?:_|$)/)) primary = place('Items', 'Other items', 'Object / prop');
    else if (matches(/(?:^|_)(?:plush|stuffed|teddy|toy|gift|present|object|prop|equipment|gear|tool|instrument|machinery|mechanics|controller|device|machine|robot|mecha|monitor|screen|interface|headphones|microphone|speaker|guitar|piano|music|musical_note|whistle)(?:_|$)/)) primary = place('Items', 'Other items', 'Prop / equipment');
    else if (matches(/(?:^|_)(?:wind|breeze|dust|sand|smoke|mist|fog|steam|misty|rain|snow|storm|lightning|thunder|sunlight|moonlight|moon|sun|sky|cloud|clouds|full_moon|crescent_moon|star_\(sky\)|constellation|weather|water|liquid|waves|ripple|ripples|puddle|underwater|submerged|partially_submerged)(?:_|$)/)) primary = place('Environment', /water|liquid|wave|ripple|puddle|underwater|submerged/.test(t) ? 'Water' : 'Weather & atmosphere', 'Weather / atmosphere / natural element');
    else if (matches(/(?:^|_)(?:sandwich|sandwiched|straddling|behind_another|tied_up|stuck|incoming_attack|after_kiss|imminent_kiss|presenting|peeking|restrained|gagged|bound|sex|sexual|cum|precum|pee|urine|orgasm|ejaculation|overflow|facial|oral|group_sex|shared_bathing|hickey|groping|grinding)(?:_|$)/)) primary = record.isNsfw ? place('Facial expression and action', 'Other actions', 'Adult / intimate action') : place('Facial expression and action', 'Other actions', 'Action / interaction');
    else if (matches(/(?:^|_)(?:virtual_youtuber|vtuber|artist_self_insert|fanbox_username|deviantart_username|patreon_username|twitter_username|user_interface|interface|cover_image|copyright_notice|name_connection|character_connection|creator_connection|company_connection|voice_actor_connection|trait_connection|gameplay_mechanics|video_game|crossover|series_connection|cameo|in_franchise_crossover)(?:_|$)/)) primary = place('Person', 'Anime Role', 'Franchise / creator / character metadata');
    else if (matches(/(?:^|_)(?:interracial|interspecies|hetero|homo|bisexual|genderbend|genderswap|ambiguous_gender|androgynous|otoko_no_ko|femboy|loli|shota|virtual_youtuber|vtuber|inkling|octoling|miqo.?te|hyur|erune|draph|taur|alien|elf|demon|angel|vampire|mermaid|yokai|youkai|oni|tengu|kappa)(?:_|$)/)) primary = place('Person', 'Identity', 'Species / gender / character type');
    else if (matches(/(?:^|_)(?:bow|bows|belt|belts|ribbon|ribbons|frilled_bow|necktie|bowtie|neckerchief|ascot|sash|bandana|scrunchie|pom_pom|trim|frill|frills|lace|spaghetti_strap|strap|straps|drawstring|button|buttons|buckle|insignia|lapel|lapels|pocket|pockets|seam|stitch|stitches|cuff|cuffs|collar|collars|fabric|leather|spandex|silk|wool|velvet|latex|denim)(?:_|$)/)) primary = place('Apparel', 'Casual clothing', 'Garment detail / material / accessory');
    else if (matches(/(?:^|_)(?:single_sock|single_socks|sock|socks|single_thighhigh|thighhigh|thighhighs|kneehigh|kneehighs|leggings|lowleg|footless|panty_peek|pantyshot|underwear|panties|lingerie|negligee|sleepwear|pajamas|pyjamas|nightwear|camisole|spandex|bodysuit|leotard|corset|garter|fishnets)(?:_|$)/)) primary = place('Apparel', 'Underwear', 'Hosiery / undergarment / exposure');
    else if (matches(/(?:^|_)(?:tiles|tile|floor|flooring|wall|brick|stairs|staircase|stairway|rail|railing|fence|balcony|porch|roof|rooftop|hallway|corridor|kotatsu|tatami|futon|drawer|cabinet|wardrobe|rug|carpet|ceiling|pool_ladder|locker|bench|stool|chair|armchair|sofa|couch|throne|bookshelf|bookcase|shelf|pillow|cushion|blanket|toilet|bathtub|bathroom|sink)(?:_|$)/)) primary = place('Scene', 'Indoor', 'Interior / furniture / architecture');
    else if (matches(/(?:^|_)(?:rigging|aircraft|watercraft|ship|boat|car|vehicle|steering_wheel|thruster|thrusters|drone|robot|mecha|machinery|machine|equipment|controller|weapon_mount|flight_deck|surfboard|volleyball|basketball|baseball|football|tennis|badminton|sports_equipment)(?:_|$)/)) primary = place('Items', /ship|boat|aircraft|watercraft|car|vehicle|steering_wheel|thruster|flight_deck/.test(t) ? 'Vehicle' : 'Other items', 'Equipment / vehicle / prop');
    else if (matches(/(?:^|_)(?:trigger_discipline|reverse_grip|aiming|aimed|pointing|firing|shooting|reloading|incoming_attack|attacking|defending|blocking|parrying|tied_up|tied|restrained|gagged|handcuffed|struggle|struggling|sandwiched|behind_another|against_wall|pinned|trapped|bound|captured|presenting|peeking|waking_up|exercising|working_out|dancing|afloat|swimming|climbing|riding|riding_on)(?:_|$)/)) primary = place('Facial expression and action', 'Other actions', 'Action / interaction');
    else if (matches(/(?:^|_)(?:wind|breeze|dust|dust_particles|hot|cold|heat|steam|smoke|mist|fog|rain|snow|storm|lightning|thunder|sunlight|moonlight|full_moon|crescent_moon|sunset|sunrise|sky|cloud|clouds|windy|weather|sand|rock|rocks|rubble|debris|coral|grass|moss|bamboo|vines|footprints|tracks|puddle|ripples|waves|underwater|submerged)(?:_|$)/)) primary = place('Environment', /water|puddle|ripple|wave|underwater|submerged/.test(t) ? 'Water' : /rock|rubble|debris|coral|grass|moss|bamboo|vine|footprint|track|sand/.test(t) ? 'Nature' : 'Weather & atmosphere', 'Natural element / weather / atmosphere');
    else if (matches(/(?:^|_)(?:chinese_zodiac|zodiac|constellation|horoscope|mythology|mythical|magic|magical|spell|curse|cursed|gameplay_mechanics|video_game|in_franchise_crossover|crossover|cameo|name_connection|character_connection|creator_connection|company_connection|voice_actor_connection|trait_connection|artist_self_insert|fanbox_username|deviantart_username|patreon_username|twitter_username|web_address|user_interface|cover_image|copyright_notice|one_hour_drawing_challenge|drawing_challenge)(?:_|$)/)) primary = place('Person', 'Anime Role', 'Lore / franchise / creator metadata');
    else if (matches(/(?:^|_)(?:hetero|homo|intersex|gender|identity|relationship|interracial|interspecies|family|siblings|sisters|brothers|husband_and_wife|age_difference|height_difference|size_difference|pervert|harem|bride|groom|dancer|child|baby|teen|young|old)(?:_|$)/)) primary = place('Person', 'Identity', 'Identity / relationship / age');
    else if (matches(/(?:^|_)(?:dirty|damaged|broken|crack|cracked|scratched|scratch|rusty|rust|worn|weathered|corrupt|corrupted|decay|decayed|injury|injured|bloodied|wound|wounded|stained|muddy)(?:_|$)/)) primary = place('Image', 'Art style', 'Surface condition / damage effect');
    else if (matches(/(?:^|_)(?:tiles|tile|crack|broken|damaged|rigging|triggers|dirty|hot|magic|liquid|object|prop|gear|equipment|tool|accessory|accessories)(?:_|$)/)) primary = place('Items', 'Other items', 'Miscellaneous object / concept');
    else if (matches(/(?:^|_)(?:usernames?|web_address|watermark|signature|subtitles?|page_number|cover_image|copyright_notice|fanbox|deviantart|pixiv|username|post_number|sample|source|artist_comment|translation_request)(?:_|$)/)) primary = place('Image', 'Quality', 'Metadata / publication marker');
    else if (/^[:;=xX>^|_().!?-]+$/.test(t) || matches(/(?:^|_)(?:expressionless|embarrassed|surprised|smug|annoyed|sad|happy|angry|crying|smile|frown|grin|smirk)(?:_|$)/)) primary = place('Person', 'Face', 'Expression / emoticon');
    else if (matches(/(?:^|_)(?:magic|magical|aura|energy|glowing|glint|sparkle|sparkles|light_particles|air_bubble|soap_bubbles|confetti|dust_particles|paint_splatter|different_reflection|reflection|transparent|muted_color|outline|jaggy_lines|toon|retro_artstyle|artstyle|art_style|sketch|comic|manga|style|parody|meme)(?:_|$)/)) primary = place('Image', 'Art style', 'Visual effect / style');
    else if (/\([a-z0-9_]+\)$/.test(t)) {
      if (hasTag(['object', 'basic', 'device', 'equipment', 'prop'])) primary = place('Items', 'Other items', 'Typed object');
      else if (hasTag(['animal', 'creature', 'pokemon'])) primary = place('Items', 'Animal', 'Animal / creature');
      else if (hasTag(['weapon'])) primary = place('Items', 'Weapon', 'Weapon / combat item');
      else if (hasTag(['symbol', 'emoji', 'emoticon'])) primary = place('Image', 'Text & symbols', 'Symbol / emoticon');
      else if (hasTag(['style', 'theme', 'artstyle'])) primary = place('Image', 'Art style', 'Style / theme');
      else if (hasTag(['food', 'drink'])) primary = place('Items', 'Food', 'Food / beverage');
      else if (hasTag(['plant', 'flower'])) primary = place('Items', 'Plant', 'Plant / flora');
      else primary = place('Person', 'Anime Role', 'Named concept / series reference');
    }
  }

  // Long-tail rescue pass: many General tags are named concepts or compound
  // variants, so map their meaningful token to a stable Prompt All in One group.
  // This stays below the curated / wiki / semantic rules to avoid overriding them.
  if (!primary) {
    const dText = cleanKey(record.description || '');
    if (matches(/(?:^|_)(?:side(?:_|$)up_bun|sidetail|short_sidetail|twintail|ponytail|hair_flap|hair_flaps|cowlick|ahoge|hime_cut|bald_spot|hairline|earlobes|long_earlobes)(?:_|$)/)) primary = place('Person', /earlobe/.test(t) ? 'Ears' : 'Hair', 'Hair / head feature');
    else if (matches(/(?:^|_)(?:cheekbones|missing_limb|alternate_pectoral_size|rayman_limbs|underpec|oversized_limbs|long_legs|short_legs|height_chart|height|body_proportions|limb|limbs|trapezius|carapace|membrane|spots|bald_spot)(?:_|$)/)) primary = place('Person', /height|proportion|oversized_limbs|alternate_pectoral_size/.test(t) ? 'Figure' : 'Body parts', 'Anatomy / proportions');
    else if (matches(/(?:^|_)(?:sarong|bandeau|shrug|babydoll|plugsuit|bikesuit|jumpsuit|gakuran|tabard|tunic|surplice|bandaid|bandeau|armband|armlet|bunting|laces|flannel|argyle_cutout|test_plugsuit|white_sarong|white_bandeau|black_bandeau|blue_sarong|blue_shrug|black_shrug|green_gakuran|orange_jumpsuit|blue_jumpsuit|white_babydoll|grey_babydoll|black_bikesuit)(?:_|$)/)) primary = place('Apparel', /bandaid|laces|armband|armlet/.test(t) ? 'Accessories' : /plugsuit|gakuran|surplice|tabard/.test(t) ? 'Uniform' : /babydoll|bandeau/.test(t) ? 'Underwear' : 'Casual clothing', 'Garment / clothing variant');
    else if (matches(/(?:^|_)(?:innertube|fishing_line|fishing_hook|keyring|package|pennant|bulletin_board|heads_up_display|height_chart|missile_pod|kaleidostick|hagoita|kanabou|bishamonten|ultra_ball|poke_ball|wheelbarrow|ashtray|folding_stock|model_kit|laundry_basket|black_pouch|folder|ticket|record|stopwatch|thermometer|mail|whiteboard|buzzer|crime_prevention_buzzer|poster|wanted_poster|p90|panzer_iv|heavy_cruiser|mig_31|boeing_787|nuclear_reactor|movie_projector|leverless_arcade_stick|spike_ball|double_scoop|triple_scoop|corn_cob|green_pepper|mochi_trail|ehoumaki|bocchan_dango|wrapped_lollipop|milk_bath|caramelldansen|card_game|chinese_chess|math)(?:_|$)/)) primary = place('Items', /corn_cob|green_pepper|double_scoop|triple_scoop|mochi_trail|ehoumaki|bocchan_dango|wrapped_lollipop/.test(t) ? 'Food' : /p90|panzer_iv|heavy_cruiser|mig_31|missile_pod|folding_stock|fishing_hook/.test(t) ? 'Weapon' : /record|movie_projector|heads_up_display|leverless_arcade_stick|p90|boeing_787|nuclear_reactor|stopwatch|thermometer|whiteboard|buzzer/.test(t) ? 'Digital devices' : /card_game|chinese_chess|ticket/.test(t) ? 'Other items' : 'Other items', 'Object / equipment / activity prop');
    else if (matches(/(?:^|_)(?:opened_by_self|incoming_punch|fainted|abuse|massage|panty_tug|tug|trample|paddling|snagged|serving|swinging|teleport|zero_gravity|after_bathing|drugged|surrounded|odd_one_out|before_and_after|choice|how_to|good_end|bad_end|flashback|murder|procrastination|memories|symbolism|contrast|comparison|desire_driver|possessed|gasp|grumpy|affectionate|plap|plap|shoejob|plap|plap|plap)(?:_|$)/)) primary = place('Facial expression and action', /grumpy|gasp/.test(t) ? 'Smile' : /teleport|zero_gravity|swinging|paddling|serving|massage|panty_tug|tug|trample|incoming_punch/.test(t) ? 'Other actions' : 'Other actions', 'Action / mood / event');
    else if (matches(/(?:^|_)(?:otaku|wrestler|tour_guide|coach|croupier|army|indian|indian_art|egyptian_art|medieval|kyoto|nerv|holomyth|squidbeak_splatoon|test_plugsuit|self_cosplay|viewer_self_insert|doppelganger|arachne|bakeneko|crocodilian|ferret|snail|ivy|fern|orchard|luna_moth|puma|anaconda|telstar|mojo|gao|whisp|kono_lolicon_domome|era|historical|imperial_japanese_army|picts|native_american|bilingual|onmyouji|kine)(?:_|$)/)) primary = place('Person', /wrestler|tour_guide|coach|croupier|army/.test(t) ? 'Identity' : /fern|orchard|ivy|luna_moth|puma|anaconda|crocodilian|ferret|snail|bakeneko/.test(t) ? 'Object' : 'Anime Role', 'Role / culture / character / lore');
    else if (matches(/(?:^|_)(?:drugs|chemical_structure|chemical|medicine|intravenous_drip|medical_examination|sperm_cell|ovum|urethra|underpec|missing_limb|dissection|membrane|carapace|trapezius|cheekbones|long_earlobes|alternate_muscle_size|body_proportions|heartbeat)(?:_|$)/)) primary = place('Person', /drugs|chemical|intravenous|medical|dissection/.test(t) ? 'Body parts' : 'Body parts', 'Medical / anatomy concept');
    else if (matches(/(?:^|_)(?:red_petals|pink_petals|fern|ivy|orchard|carapace|crocodilian|snail|luna_moth|puma|anaconda|ferret|kine|crocodilian|nebula|soil|cobblestone|storefront|kyoto|veranda|wading_pool|stone_lantern|arch)(?:_|$)/)) primary = place('Environment', /fern|ivy|orchard|red_petals|pink_petals|soil/.test(t) ? 'Nature' : /nebula/.test(t) ? 'Weather & atmosphere' : 'Nature', 'Natural element / landscape');
    else if (matches(/(?:^|_)(?:>_o|odd_one_out|you're_doing_it_wrong|dont_say_lazy|keep_out|like_and_retweet|hashtag|credits|portfolio|how_to|novel_cover|promo_poster|wanted_poster|bulletin_board|before_and_after|round_image|splash_page|photo_inset|through_medium|comparison|contrast|symbolism|chemistry_structure|numbered|39|777|timestamp|ad|record|folder|mail)(?:_|$)/)) primary = place('Image', /credits|portfolio|timestamp|39|777|ad|hashtag|like_and_retweet/.test(t) ? 'Quality' : /bulletin_board|wanted_poster|promo_poster|novel_cover|splash_page|photo_inset|round_image|before_and_after|comparison|contrast/.test(t) ? 'Composition' : 'Text & symbols', 'Image / text / publishing marker');
    else if (matches(/(?:^|_)(?:deformed|chibi|shortstack|alternate_muscle_size|skindentation|figure|body_type|physique|plump|slender|muscular|petite|short_stature)(?:_|$)/)) primary = place('Person', 'Figure', 'Figure / proportions');
    else if (matches(/(?:^|_)(?:urethra|ovum|sperm_cell|clitoral|fertilization|gaping|condom|penis|vulva|anus|sweaty|sweat|multiple_piercings|industrial_piercing|linked_piercing|piercing|cuts|torn|stain|stained|wound|injury|bruise|headless)(?:_|$)/)) primary = place('Person', 'Body parts', 'Anatomy / body state / marking');
    else if (matches(/(?:^|_)(?:romper|tunic|tabard|shawl|gauntlet|armband|armlet|bodystocking|headdress|cloak|cape|uniform|outfit|clothing|apparel|sleeve|dress|skirt|shirt|coat|jacket|boots|shoes|socks|thighhigh|belt|bowtie|neckwear|glove|gloves|handwear|hat|headwear|veil|hood|kimono|hanfu|hakama|apron|necktie|garter|corset|leggings|fishnets|stockings)(?:_|$)/)) primary = place('Apparel', /gauntlet|glove|handwear/.test(t) ? 'Handwear' : /headdress|hat|headwear|veil|hood/.test(t) ? 'Headwear' : /socks|thighhigh|bodystocking|stockings|fishnets|leggings/.test(t) ? 'Underwear' : /hanfu|hakama|kimono/.test(t) ? 'Traditional clothing' : /uniform/.test(t) ? 'Uniform' : /armband|armlet|bowtie|neckwear|belt|headdress/.test(t) ? 'Accessories' : 'Casual clothing', 'Garment / accessory variant');
    else if (matches(/(?:^|_)(?:pole|trash_can|shovel|stethoscope|kiseru|christmas_ornaments|ornament|poker_chip|crate|gamepad|globe|stone_lantern|traffic_cone|reins|coffin|noose|ruler|yarn|hourglass|easel|electric_plug|thermometer|chalice|pacifier|rolling_suitcase|camcorder|chalk|crayon|art_brush|marker|notepad|thread|pendulum|buzzer|traffic_cone|keyhole|tombstone|candlestand|horseshoe_ornament|mini_hakkero)(?:_|$)/)) primary = place('Items', /stethoscope|thermometer/.test(t) ? 'Other items' : /shovel|chainsaw|kanabou|noose/.test(t) ? 'Weapon' : /marker|notepad|ruler|chalk|crayon|art_brush|easel|yarn|thread/.test(t) ? 'Study supplies' : /camcorder|gamepad|electric_plug/.test(t) ? 'Digital devices' : 'Other items', 'Specific prop / tool / equipment');
    else if (matches(/(?:^|_)(?:hypnosis|defeat|death|corruption|come_hither|failure|bad_end|confession|flashback|possessed|fallen_down|levitation|swinging|glomp|wading|weightlifting|affectionate|messy|on_person|audience|friends|jealous|smell|instant_loss|destruction|war|crime|accidental_exposure|assisted_exposure|presenting|exposure|stimulation|gaping|glomp|sick|heartbeat|splash_page)(?:_|$)/)) primary = place('Facial expression and action', /come_hither|affectionate|jealous|friends|confession/.test(t) ? 'Smile' : /weightlifting|wading|swinging|levitation|fallen_down|on_person|glomp/.test(t) ? 'Protagonist action' : 'Other actions', 'Action / mood / event');
    else if (matches(/(?:^|_)(?:pirate|delinquent|utaite|tokusatsu|sangvis_ferri|lalafell|elezen|onmyouji|native_american|asian|bilingual|audience|mascot|vocaloid|psychic|possessed|calico|kine|fortissimo|aestus_estus|bishamonten|ancient_egyptian|festival|friends|wife_and_wife|double_w|relationship|siblings|bride|groom|audience)(?:_|$)/)) primary = place('Person', /wife|friends|relationship|siblings|bride|groom/.test(t) ? 'Relationships' : 'Identity', 'Identity / culture / character concept');
    else if (matches(/(?:^|_)(?:turtle|snail|calico|serval|animal|creature|dragon|fox|wolf|cat|dog|bird|fish|crab|shell|snail|kine|pokemon|lalafell)(?:_|$)/)) primary = place('Items', 'Animal', 'Animal / creature');
    else if (matches(/(?:^|_)(?:winter|summer|festival|christmas|year_of_the|post_apocalypse|ancient_egyptian|native_american|temple|veranda|gym|wading_pool|stone_lantern|globe|tombstone|coffin|traffic_cone|arch)(?:_|$)/)) primary = place('Scene', /gym|wading_pool/.test(t) ? 'Indoor' : 'Outdoor', 'Location / event / built environment');
    else if (matches(/(?:^|_)(?:crystal|shards|thread|ink|stain|torn|shards|material|glass|metal|stone|chalk|yarn|liquid|fluid|crystal|crystals|neon_lights|laser|sunburst|small_sweatdrop|visible_air|pink_petals|shards|globe|yin_yang_orb)(?:_|$)/)) primary = place('Image', /neon_lights|laser|sunburst|small_sweatdrop|visible_air/.test(t) ? 'Lighting & effects' : /ink|chalk|thread|yarn|stain|torn/.test(t) ? 'Art style' : 'Art style', 'Material / texture / visual effect');
    else if (matches(/(?:^|_)(?:timestamp|numbered|round_image|circle_cut|photo_inset|novel_cover|splash_page|inset|comparison|through_medium|when_you_see_it|you're_doing_it_wrong|ad|redesign|alternate_form|evolutionary_line|prototype_design|real_life_insert|cover_image)(?:_|$)/)) primary = place('Image', /timestamp|numbered|ad|cover_image/.test(t) ? 'Quality' : 'Composition', 'Image layout / publication / meta');
    else if (matches(/(?:^|_)(?:drum_set|fortissimo|vocaloid|utaite|song|music|musical|guitar|piano|instrument|audio|speaker|microphone|headphones)(?:_|$)/)) primary = place('Items', 'Musical instruments', 'Music / audio');
    else if (matches(/(?:^|_)(?:gamepad|camcorder|electric_plug|buzzer|controller|phone|computer|camera|tablet|screen|monitor|device|machine|robot|mecha|thermometer)(?:_|$)/)) primary = place('Items', 'Digital devices', 'Device / technology');
    else if (matches(/(?:^|_)(?:white|black|blue|red|green|pink|yellow|purple|orange|brown|gray|grey)_(?:romper|tunic|tabard|shawl|armband|armlet|bodystocking|headdress|uniform|cloak|cape|dress|shirt|skirt|coat|jacket|glove|gauntlet|sleeve|belt|bow|ribbon|sock|stockings|thighhigh|boots|shoes|hat|hood)(?:_|$)/)) primary = place('Apparel', /glove|gauntlet/.test(t) ? 'Handwear' : /hat|hood|headdress/.test(t) ? 'Headwear' : /sock|stockings|thighhigh/.test(t) ? 'Underwear' : 'Casual clothing', 'Color / garment variant');
    else if (dText.includes('ambiguous tag') || dText.startsWith('deprecated tag')) {
      if (matches(/(?:^|_)(?:print|pattern|artstyle|art_style|redesign|alternate_form|evolutionary_line|round_image|inset|novel_cover|splash_page)(?:_|$)/)) primary = place('Image', 'Art style', 'Deprecated / visual tag');
      else if (matches(/(?:^|_)(?:pirate|psychic|utaite|tokusatsu|delinquent|mascot|calico|asian|bilingual)(?:_|$)/)) primary = place('Person', 'Identity', 'Deprecated / ambiguous concept');
      else primary = place('Items', 'Other items', 'Ambiguous tag / object concept');
    }
  }

  primary ||= place('Image', 'Art style', 'Other visual concept');
  const placements = [primary];
  if (record.isNsfw && primary.parent !== 'Negative Prompt') {
    if (primary.parent === 'Person' && !['Object', 'Anime Role', 'Identity'].includes(primary.sub)) placements.push(place('Person', 'Body parts', 'Adult anatomy / body state'));
    else if (primary.parent === 'Apparel') placements.push(place('Apparel', 'Underwear', 'Adult attire / exposure'));
    else if (primary.parent === 'Facial expression and action') placements.push(place('Facial expression and action', 'Other actions', 'Adult action'));
  }
  return unique(placements);
}

export const PROMPT_ALL_IN_ONE_PARENT_ORDER = [
  'Person', 'Apparel', 'Facial expression and action', 'Image', 'Environment', 'Scene', 'Items', 'Camera', 'Hanfu', 'Negative Prompt',
];

/**
 * A separate, default.yaml-faithful taxonomy option. The bundled classifier's explicit
 * dictionary uses the extension's native parent/subgroup vocabulary; the broad Anima
 * classifier is only a fallback for tags outside the curated default.yaml examples.
 * Upstream taxonomy: https://github.com/Physton/sd-webui-prompt-all-in-one
 */
type PromptAllInOneDefaultGroup = { name: string; color?: string | null; tags: string[] };
type PromptAllInOneDefaultParent = { name: string; groups: PromptAllInOneDefaultGroup[] };
const DEFAULT_YAML_PARENTS = (promptAllInOneDefaultTaxonomy as { parents: PromptAllInOneDefaultParent[] }).parents;
const DEFAULT_YAML_PARENT_NAMES = new Set(DEFAULT_YAML_PARENTS.map((parent) => parent.name));
const DEFAULT_YAML_GROUPS = new Map<string, Set<string>>(
  DEFAULT_YAML_PARENTS.map((parent) => [parent.name, new Set(parent.groups.map((group) => group.name))]),
);

/** Exact placements extracted from the user-provided upstream default.yaml. Repeated tags
 * intentionally retain multiple placements, matching the extension's source hierarchy. */
const DEFAULT_YAML_TAG_ENTRIES = (() => {
  const index = new Map<string, { tag: string; placements: BuilderPlacement[] }>();
  for (const parent of DEFAULT_YAML_PARENTS) {
    for (const group of parent.groups) {
      for (const rawTag of group.tags) {
        const key = cleanKey(rawTag);
        if (!key) continue;
        const placement = { parent: parent.name, sub: group.name };
        const entry = index.get(key) || { tag: rawTag, placements: [] };
        if (!entry.placements.some((item) => item.parent === placement.parent && item.sub === placement.sub)) {
          entry.placements.push(placement);
        }
        index.set(key, entry);
      }
    }
  }
  return index;
})();
const DEFAULT_YAML_TAG_PLACEMENTS = new Map(
  [...DEFAULT_YAML_TAG_ENTRIES.entries()].map(([key, entry]) => [key, entry.placements]),
);

/** Exact tags from the supplied extension YAML, including tags not in the bundled Danbooru CSV. */
export function getPromptAllInOneDefaultTaxonomyEntries(): Array<{ tag: string; placements: BuilderPlacement[] }> {
  return [...DEFAULT_YAML_TAG_ENTRIES.values()].map((entry) => ({
    tag: entry.tag,
    placements: entry.placements.map(({ parent, sub }) => ({ parent, sub })),
  }));
}

function mapToDefaultYamlGroup(record: PromptAllInOneRecord, candidate: BuilderPlacement): BuilderPlacement {
  const tag = cleanKey(record.tag || '');
  const description = cleanKey(record.description || '');
  const text = `${tag}_${description}`;
  const matches = (pattern: RegExp) => pattern.test(text);
  let parent = candidate.parent;

  // Translate the broader Swarm Canvas classifier's parent labels into the exact
  // ten-root vocabulary from default.yaml. Do not expose an extra custom root here.
  if (!DEFAULT_YAML_PARENT_NAMES.has(parent)) {
    if (parent === 'Subject' || parent === 'Appearance' || parent === 'Body' || parent === 'Attributes') parent = 'Person';
    else if (parent === 'Creatures & Animals') parent = matches(/animal|creature|bird|cat|dog|fish|insect|pokemon|beast/) ? 'Items' : 'Person';
    else if (parent === 'Clothing') parent = 'Apparel';
    else if (parent === 'Actions' || parent === 'Pose' || parent === 'Interaction' || parent === 'NSFW & Adult') {
      parent = matches(/underwear|lingerie|bikini|swimsuit|panties|thighhigh|clothing|garment|costume/) && !matches(/sex|sexual|nudity|nude|explicit|orgasm|masturbat/) ? 'Apparel'
        : matches(/toy|dildo|vibrator|sex_object/) ? 'Items'
          : 'Facial expression and action';
    } else if (parent === 'Composition' || parent === 'Style' || parent === 'Concepts & Lore' || parent === 'Technical') parent = 'Image';
    else if (parent === 'Environment') parent = 'Environment';
    else if (parent === 'Scene') parent = 'Scene';
    else if (parent === 'Camera') parent = 'Camera';
    else if (parent === 'Objects') parent = 'Items';
    else parent = 'Image';
  }

  const available = DEFAULT_YAML_GROUPS.get(parent);
  if (available?.has(candidate.sub)) return { parent, sub: candidate.sub };

  const choose = (choices: Array<[RegExp, string]>, fallback: string) =>
    choices.find(([pattern]) => matches(pattern))?.[1] || (available?.has(fallback) ? fallback : [...(available || [])][0] || 'Other');

  let sub = candidate.sub;
  if (parent === 'Person') {
    sub = choose([
      [/hair|braid|ponytail|twintail|bangs|ahoge|cowlick|haircut|hair_color|hair_flap/, 'Hair'],
      [/pupil|iris|eyebrow|eyelash|eyeshadow|eyeliner|eye_color|eyes?|sclera|heterochromia/, 'Eyes'],
      [/ear|horn|antler|whisker/, 'Ears'],
      [/eyebrow/, 'Eyebrows'],
      [/pupil/, 'Pupils'],
      [/nose|snout|beak/, 'Nose'],
      [/tongue/, 'Tongue'],
      [/teeth|fang|tusk/, 'Teeth'],
      [/mouth|lip|smile|grin|smirk|frown|mole|freckle|blush|scar|makeup|lipstick|beard|mustache|facepaint|facial_mark|expression/, 'Face'],
      [/nail|fingernail|toenail/, 'Nails'],
      [/wing|tail|fin|gill|scale|claw|paw|hoof/, 'Wings'],
      [/skin|complexion|tan|pigment|tattoo|body_paint/, 'Skin'],
      [/age|child|toddler|teen|adult|elder|young|old|loli|shota/, 'Age'],
      [/face_shape|round_face|oval_face|slender_face|baby_face|heart_shaped_face/, 'Face shape'],
      [/shoulder|collarbone|armpit/, 'Shoulders'],
      [/breast|chest|cleavage|pector|torso/, 'Chest'],
      [/waist|hip|pelvis/, 'Waist'],
      [/abdomen|belly|navel|midriff|groin|stomach/, 'Abdomen'],
      [/figure|physique|muscular|curvy|plump|slender|skinny|height|petite|tall|short_stature|body_type|pregnan/, 'Figure'],
      [/solo|multiple_girls|multiple_boys|[0-9]+girls?|[0-9]+boys?|people|human|female|male|girl|boy|woman|man/, 'Object'],
      [/identity|occupation|job|role|character|franchise|pokemon|witch|demon|elf|angel|vampire|mermaid|monster|hero|series|copyright|artist/, 'Anime Role'],
      [/gender|relationship|sibling|family|couple|crossdress|intersex|transgender|harem/, 'Identity'],
    ], 'Object');
  } else if (parent === 'Apparel') {
    sub = choose([
      [/swimwear|swimsuit|bikini|bathing_suit|swim_trunks/, 'Swimwear'],
      [/school_uniform|military_uniform|uniform|serafuku|sailor_uniform|nurse_uniform|police_uniform|chef_uniform/, 'Uniform'],
      [/sportswear|athletic|gym_uniform|tennis_uniform|baseball_uniform|volleyball_uniform|wrestling_outfit/, 'Sportswear'],
      [/armor|helmet|greaves|pauldron|breastplate|vambrace|gauntlet/, 'Armor'],
      [/boot|thigh_boot|knee_boot|ankle_boot/, 'Boots'],
      [/shoe|footwear|sandal|sneaker|loafer|heel|slipper|geta|skate/, 'Shoes'],
      [/sock|thighhigh|kneehigh|pantyhose|stocking|hosiery|legwear|fishnet|leggings/, 'Socks'],
      [/glove|mittens|handwear/, 'Gloves'],
      [/glasses|eyewear|sunglasses|monocle|goggles|eyepatch|blindfold/, 'Glasses'],
      [/mask|masked|masquerade/, 'Mask'],
      [/hat|cap|beret|beanie|bonnet|tiara|crown|helmet/, 'Hat'],
      [/headwear|headband|veil|hood|head_cover/, 'Headwear'],
      [/hair_accessory|hair_ornament|hair_bow|hairpin|hair_clip|scrunchie/, 'Hair accessories'],
      [/earring|ear_piercing/, 'Earrings'],
      [/necklace|jewelry|bracelet|pendant|brooch|bangle|choker|ring|jewel|gemstone/, 'Jewelry'],
      [/scarf|neckerchief|neckwear/, 'Scarf'],
      [/neckline|necktie|bowtie|tie|collar|choker|ascot/, 'Neckline'],
      [/skirt|dress|gown|pinafore|petticoat|tutu|ballgown/, 'Skirt'],
      [/pants|trousers|shorts|jeans|bloomers|hakama|leggings/, 'Pants'],
      [/shirt|blouse|hoodie|sweatshirt|tank_top|t_shirt|sleeve|sweater|cardigan|vest/, 'Shirt'],
      [/coat|jacket|blazer|parka|cloak|cape|sweater|overcoat/, 'Coat'],
      [/suit|tuxedo|formal|wedding_dress|evening_gown|kimono|cheongsam|qipao|traditional_clothes/, 'Formal wear'],
      [/uniform|costume|cosplay/, 'Uniform'],
      [/lace|frill|ruffle|ribbon_trim|fur_trim|pleated|layered|decorat/, 'Decorate'],
      [/striped|plaid|checkered|polka_dot|pattern|print|floral/, 'Pattern'],
      [/leather|denim|latex|silk|wool|velvet|cotton|fabric|material|spandex/, 'Material'],
      [/belt|bow|ribbon|armband|armlet|bracelet|pin|badge|brooch|accessory|accessories|pouch|bag|strap|buckle/, 'Trinkets'],
      [/formal|suit|tuxedo|gown/, 'Formal wear'],
    ], 'Casual wear');
  } else if (parent === 'Facial expression and action') {
    sub = choose([
      [/smile|grin|giggle|laugh|happy|joy/, 'Smile'],
      [/cry|tears|sobbing|weeping|sniffl/, 'Cry'],
      [/disdain|smirk|sneer|condescend|scorn/, 'Disdain'],
      [/angry|anger|furious|rage|scowl/, 'Angry'],
      [/sad|unhappy|frown|upset|depress|embarrass|shy|surpris|worried/, 'Unhappy'],
      [/hand|finger|wrist|palm|thumb|fist|pointing|waving|gesture/, 'Hand actions'],
      [/holding|carrying|grabbing|grip|weapon|object_in_hand/, 'Hand actions (Holding)'],
      [/putting|placing|setting_down|put_somewhere/, 'Hand actions (Put somewhere)'],
      [/grab|reaching_for|snatching|taking_from/, 'Hand actions (Grab something)'],
      [/leg|foot|feet|kick|stomp|step|walking|running|jumping|kneeling|sitting|standing|squatting/, 'Leg actions'],
      [/pose|posture|looking|gaze|facing|camera|view|framing/, 'Protagonist action'],
      [/basic_action|simple_action|action|movement|activity|interact|hug|kiss|dance|fight|eat|drink|sleep|read|write|play|sex|nude|sexual|censor|nudity/, 'Basic Actions'],
    ], 'Other actions');
  } else if (parent === 'Image') {
    sub = choose([
      [/quality|resolution|lowres|highres|watermark|signature|copyright|metadata|jpeg|compression|bad_anatomy|bad_hands|negative_prompt/, 'Quality'],
      [/background|wallpaper|white_background|transparent_background/, 'Background'],
      [/lighting|lights?|illumination|neon|led|light_source|shadow|glow|glowing|sparkle|aura|energy|lens_flare|bloom/, 'Lighting'],
      [/artist_style|artist|style_of|art_by/, 'Artist style'],
      [/realistic|photoreal|realism|photograph|photo_real/, 'Realistic'],
      [/sketch|rough_drawing|draft/, 'Sketch'],
      [/brush|paintbrush|brushstroke|stroke/, 'Brush'],
      [/color|colour|palette|monochrome|grayscale|gradient|saturation|hue/, 'Color'],
      [/comic|manga|illustration|drawing|painting|render|medium|art_style|style|anime|cartoon|watercolor|oil_paint/, 'Art style'],
      [/art_type|medium|illustration_type|drawing_type/, 'Art type'],
    ], 'Art style');
  } else if (parent === 'Environment') {
    sub = choose([
      [/season|spring|summer|autumn|fall|winter|holiday|festival|christmas|halloween|new_year/, 'Season'],
      [/weather|rain|snow|storm|wind|breeze|thunder|lightning|temperature/, 'Weather'],
      [/water|ocean|sea|lake|river|waterfall|wave|underwater|puddle|aqua|aquatic/, 'Water'],
      [/sky|sun|moon|star|sunset|sunrise|dawn|dusk|night_sky|celestial/, 'Sky'],
      [/cloud/, 'Cloud'],
      [/fog|mist|haze|atmosphere|smoke|steam|dust|windy|air|weather_effect/, 'Atmosphere'],
    ], 'Nature');
  } else if (parent === 'Scene') {
    sub = choose([
      [/bathroom|bathtub|toilet|shower|washroom|restroom/, 'Bathroom'],
      [/bed|bedding|pillow|blanket|mattress|futon|sleeping_area/, 'Bedding'],
      [/floor|flooring|tile_floor|wooden_floor|carpet_floor/, 'Floor'],
      [/furniture|chair|table|desk|sofa|couch|bench|stool|cabinet|shelf|bookshelf|wardrobe|drawer|throne/, 'Furniture'],
      [/city|urban|street|road|town|cityscape|building|skyscraper|downtown/, 'City'],
      [/indoor|indoors|room|interior|house|home|classroom|kitchen|office|bedroom|school|shop|store/, 'Indoor'],
    ], 'Outdoor');
  } else if (parent === 'Items') {
    sub = choose([
      [/weapon|sword|gun|firearm|knife|rifle|pistol|bow_and_arrow|spear|staff|axe|dagger|cannon|grenade|missile/, 'Weapon'],
      [/food|fruit|vegetable|candy|cake|bread|rice|drink|beverage|coffee|tea|meal|ice_cream|chocolate/, 'Food'],
      [/animal|cat|dog|bird|fish|horse|fox|wolf|bear|rabbit|pokemon|creature|insect|reptile|snake|dragon/, 'Animal'],
      [/plant|flower|tree|grass|leaf|leaves|bamboo|rose|mushroom|vine|botanical/, 'Plant'],
      [/musical|instrument|guitar|piano|drum|violin|flute|trumpet|microphone|speaker|headphone|music/, 'Musical Instruments'],
      [/tableware|plate|cup|bowl|fork|spoon|chopstick|teapot|mug|glassware|cutlery/, 'Tableware'],
      [/computer|phone|smartphone|laptop|tablet|screen|monitor|device|electronic|digital|robot|machine|controller|camera|gadget/, 'Digital devices'],
      [/book|notebook|pencil|pen|paper|scroll|clipboard|stationery|school_supply|study/, 'Study supplies'],
    ], 'Other items');
  } else if (parent === 'Camera') {
    sub = choose([
      [/close.?up|macro_shot|extreme_close/, 'Close-up'],
      [/angle|from_above|from_below|pov|point_of_view|overhead_view|bird.?s_eye|worm.?s_eye/, 'Camera angle'],
      [/effect|fisheye|motion_blur|depth_of_field|bokeh|lens_flare|chromatic_aberration|vignette/, 'Effect'],
      [/protagonist_action|gaze|looking|facing|camera_facing/, 'Protagonist action'],
      [/composition|full_body|upper_body|portrait|wide_shot|cowboy_shot|panorama|framing|multiple_views|crop/, 'Other compositions'],
    ], 'Camera');
  } else if (parent === 'Hanfu') {
    // Only place unlisted tags into this root when they are clearly Hanfu-specific.
    if (/hanfu|tang_style|song_style|ming_style|songmo|chest_pleated_skirt|chest_po_skirt|pibo|shan$/.test(text)) {
      sub = choose([[/ming_style|ming_dynasty/, 'Ming style'], [/song_style|song_dynasty|songmo/, 'Song style'], [/tang_style|tang_dynasty/, 'Tang style'], [/pleated_skirt/, 'Pleated skirt'], [/waistband|belt/, 'Waistband'], [/pibo|shawl/, 'Pibo'], [/shan|upper_shan|long_shan/, 'Upper shan']], 'Tang style');
    } else {
      parent = 'Apparel';
      sub = choose([[/dress|gown|formal|kimono|hanfu|traditional|cheongsam|qipao/, 'Formal wear']], 'Style');
    }
  } else if (parent === 'Negative Prompt') {
    sub = choose([[/embedding|textual_inversion|negative_embedding|badhand|bad_hands|bad_prompt/, 'Embeddings'], [/person|human|face|body|anatomy|character/, 'Person']], 'Image');
  }

  const valid = DEFAULT_YAML_GROUPS.get(parent);
  if (valid?.has(sub)) return { parent, sub };
  // Deterministic safe fallback in the selected parent; every resulting subgroup exists in default.yaml.
  return { parent, sub: [...(valid || DEFAULT_YAML_GROUPS.get('Image') || new Set(['Quality']))][0] || 'Quality' };
}

export function getPromptAllInOneDefaultPlacements(record: PromptAllInOneRecord): BuilderPlacement[] {
  const exactKeys = [record.tag, ...(record.aliases || [])].map(cleanKey).filter(Boolean);
  const exact = exactKeys.flatMap((key) => DEFAULT_YAML_TAG_PLACEMENTS.get(key) || []);
  const uniqueExact = exact.filter((placement, index, all) =>
    all.findIndex((item) => item.parent === placement.parent && item.sub === placement.sub) === index,
  );
  if (uniqueExact.length) return uniqueExact.map(({ parent, sub }) => ({ parent, sub }));

  // Worker INIT has already produced a detailed classification for every local record.
  // Reuse it here instead of running the whole classifier a second time per tag.
  const classify: BuilderPlacement = record.uiCategory && record.uiSubCategory
    ? { parent: record.uiCategory, sub: record.uiSubCategory, leaf: record.uiSubSubCategory || undefined }
    : classifyTagDetailed(
      record.tag,
      record.nativeCategory,
      record.nativeCategoryCode,
      record.wikiCategory,
      record.postCount,
      record.description,
    ).primary;

  // In the local database the worker has already run classifyTagDetailed during INIT.
  // Use that cached classification as the default.yaml fallback and let mapToDefaultYamlGroup
  // refine the tag into a valid YAML subgroup. Re-running the much broader Prompt All in One
  // inference for every one of ~140k local tags made the first category request too slow.
  // Remote/partial records without cached classifications still get the richer inference.
  const hasCachedClassification = Boolean(record.uiCategory && record.uiSubCategory);
  const inferred = hasCachedClassification ? [] : getPromptAllInOnePlacements(record);
  const candidates = [...inferred, classify];
  const mapped: BuilderPlacement[] = [];
  for (const candidate of candidates) {
    const resolved = mapToDefaultYamlGroup(record, candidate);
    if (!mapped.some((item) => item.parent === resolved.parent && item.sub === resolved.sub)) mapped.push(resolved);
  }
  if (mapped.length) {
    // Exact repeated placements are preserved above from the supplied YAML. For inferred
    // tags, choose one best placement so they do not appear redundantly in several groups.
    const isGenericPersonObject = (item: BuilderPlacement) => item.parent === 'Person' && item.sub === 'Object';
    const best = mapped.find((item) => !isGenericPersonObject(item)) || mapped[0];
    return [best];
  }

  if (record.nativeCategory === 'Artist') return [{ parent: 'Person', sub: 'Anime Role' }];
  if (record.nativeCategory === 'Character' || record.nativeCategory === 'Copyright') return [{ parent: 'Person', sub: 'Anime Role' }];
  if (record.nativeCategory === 'Meta') return [{ parent: 'Image', sub: 'Quality' }];
  return [{ parent: 'Image', sub: 'Art style' }];
}

export function getPromptRolePlacements(record: Pick<TagRecord, 'tag' | 'nativeCategory' | 'nativeCategoryCode' | 'wikiCategory'> & { isNsfw?: boolean }): BuilderPlacement[] {
  const placements = getSemanticPlacements(record);
  const out: BuilderPlacement[] = [];
  const seen = new Set<string>();
  const push = (p: BuilderPlacement) => {
    const k = `${p.parent}\u001f${p.sub}\u001f${p.leaf || ''}`;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  };
  const characterParents: string[] = [PATH.subject, PATH.appearance, PATH.body, PATH.clothing];
  const actionParents: string[] = [PATH.actions, PATH.pose, PATH.interaction];
  const framingParents: string[] = [PATH.composition, PATH.camera];
  const sceneParents: string[] = [PATH.environment, PATH.scene, PATH.objects];
  for (const p of placements) {
    if (p.parent === PATH.nsfw) push({ parent: 'Adult', sub: p.sub, leaf: p.leaf });
    else if (characterParents.includes(p.parent)) push({ parent: 'Character', sub: p.parent === PATH.body ? `Body · ${p.sub}` : p.sub, leaf: p.leaf });
    else if (actionParents.includes(p.parent)) push({ parent: 'Action & Pose', sub: p.parent === PATH.actions ? `Action · ${p.sub}` : p.sub, leaf: p.leaf });
    else if (framingParents.includes(p.parent)) push({ parent: 'Framing', sub: p.parent === PATH.composition ? p.sub : `Camera · ${p.sub}`, leaf: p.leaf });
    else if (sceneParents.includes(p.parent)) push({ parent: 'Scene', sub: p.parent === PATH.objects ? `Object · ${p.sub}` : p.sub, leaf: p.leaf });
    else if (p.parent === PATH.style) push({ parent: 'Style', sub: p.sub, leaf: p.leaf });
    else if (p.parent === PATH.technical) push({ parent: 'Technical', sub: p.sub, leaf: p.leaf });
    else push({ parent: p.parent, sub: p.sub, leaf: p.leaf });
  }
  return out;
}

export function normalizePlacement(path: CategoryPath): BuilderPlacement {
  return { parent: path.parent || 'General', sub: path.sub || 'General', leaf: path.subSub || undefined };
}

export const BUILDER_PARENT_ORDER: Record<BuilderTaxonomyId, string[]> = {
  semantic: SEMANTIC_PARENT_ORDER,
  prompt_flow: PROMPT_FLOW_PARENT_ORDER,
  anima_roles: ['Character', 'Action & Pose', 'Framing', 'Scene', 'Style', 'Adult', 'Technical', 'General'],
  prompt_all_in_one: PROMPT_ALL_IN_ONE_PARENT_ORDER,
  prompt_all_in_one_default: PROMPT_ALL_IN_ONE_PARENT_ORDER,
  danbooru_types: ['General', 'Character', 'Meta', 'Artist', 'Copyright'],
  danbooru_groups: ['Quality & Meta', 'Attire & Clothing', 'Face & Hair', 'Body & Anatomy', 'Poses & Actions', 'Composition & Style', 'Locations & Scenery', 'Animals & Nature', 'Food & Beverage', 'Sex & Erotica', 'Video Games', 'Text & Lore', 'Audio & Music', 'Society & Culture', 'Native Categories'],
};
