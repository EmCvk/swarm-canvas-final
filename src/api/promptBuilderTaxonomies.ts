import type { TagRecord, CategoryPath } from './tagTaxonomy';
import { cleanKey } from '../tagging/classifier';

export type BuilderTaxonomyId = 'prompt_flow' | 'semantic' | 'anima_roles' | 'danbooru_types' | 'danbooru_groups';
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
  danbooru_types: ['General', 'Character', 'Meta', 'Artist', 'Copyright'],
  danbooru_groups: ['Quality & Meta', 'Attire & Clothing', 'Face & Hair', 'Body & Anatomy', 'Poses & Actions', 'Composition & Style', 'Locations & Scenery', 'Animals & Nature', 'Food & Beverage', 'Sex & Erotica', 'Video Games', 'Text & Lore', 'Audio & Music', 'Society & Culture', 'Native Categories'],
};
