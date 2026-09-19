import { CategoryPath, normalizeTag } from '../api/tagTaxonomy';

export interface ClassificationResult {
  primary: CategoryPath;
  secondary: CategoryPath[];
  confidence: number;
  sources: string[];
  isNsfw: boolean;
}

// Normalize strings for uniform lookup (replaces spaces with underscores, strips trailing punctuation)
export function cleanKey(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[:"']/g, '')
    .replace(/[\s-]+/g, '_');
}

const NSFW_EXACT_MAP: Record<string, string> = {
  nude: 'Nudity & Exposure',
  naked: 'Nudity & Exposure',
  topless: 'Nudity & Exposure',
  bottomless: 'Nudity & Exposure',
  completely_nude: 'Nudity & Exposure',
  no_panties: 'Nudity & Exposure',
  no_bra: 'Nudity & Exposure',
  exposed_breasts: 'Nudity & Exposure',
  exposed_pussy: 'Nudity & Exposure',
  exposed_anus: 'Nudity & Exposure',
  upskirt: 'Nudity & Exposure',
  pantyshot: 'Nudity & Exposure',
  cameltoe: 'Nudity & Exposure',
  undressing: 'Nudity & Exposure',
  clothes_lift: 'Nudity & Exposure',
  skirt_lift: 'Nudity & Exposure',
  shirt_lift: 'Nudity & Exposure',
  public_indecency: 'Nudity & Exposure',

  sex: 'Sex Acts',
  intercourse: 'Sex Acts',
  penetration: 'Sex Acts',
  masturbation: 'Sex Acts',
  fellatio: 'Sex Acts',
  blowjob: 'Sex Acts',
  cunnilingus: 'Sex Acts',
  paizuri: 'Sex Acts',
  creampie: 'Sex Acts',
  fingering: 'Sex Acts',
  handjob: 'Sex Acts',
  footjob: 'Sex Acts',
  oral: 'Sex Acts',
  oral_invitation: 'Sex Acts',
  licking_penis: 'Sex Acts',
  bukkake: 'Sex Acts',
  gangbang: 'Sex Acts',
  groping: 'Sex Acts',
  self_fondle: 'Sex Acts',
  crotch_grab: 'Sex Acts',
  female_orgasm: 'Sex Acts',
  ahegao: 'Sex Acts',
  moaning: 'Sex Acts',
  rape_face: 'Sex Acts',

  missionary: 'Sexual Positions',
  cowgirl_position: 'Sexual Positions',
  doggystyle: 'Sexual Positions',
  spooning: 'Sexual Positions',
  standing_sex: 'Sexual Positions',
  prone_bone: 'Sexual Positions',
  upright_straddle: 'Sexual Positions',
  m_legs: 'Sexual Positions',
  legs_over_head: 'Sexual Positions',
  symmetrical_docking: 'Sexual Positions',
  asymmetrical_docking: 'Sexual Positions',

  pussy: 'Adult Anatomy & Fluids',
  penis: 'Adult Anatomy & Fluids',
  vagina: 'Adult Anatomy & Fluids',
  clitoris: 'Adult Anatomy & Fluids',
  anus: 'Adult Anatomy & Fluids',
  anal: 'Adult Anatomy & Fluids',
  nipples: 'Adult Anatomy & Fluids',
  areola: 'Adult Anatomy & Fluids',
  erection: 'Adult Anatomy & Fluids',
  testicles: 'Adult Anatomy & Fluids',
  scrotum: 'Adult Anatomy & Fluids',
  cervix: 'Adult Anatomy & Fluids',
  cum: 'Adult Anatomy & Fluids',
  ejaculation: 'Adult Anatomy & Fluids',
  facial_cum: 'Adult Anatomy & Fluids',
  internal_cumshot: 'Adult Anatomy & Fluids',

  crotchless_pants: 'Erotic Attire & Fetish',
  ass_cutout: 'Erotic Attire & Fetish',
  leotard_aside: 'Erotic Attire & Fetish',
  bikini_aside: 'Erotic Attire & Fetish',
  swimsuit_aside: 'Erotic Attire & Fetish',
  open_fly: 'Erotic Attire & Fetish',
  pantyhose_pull: 'Erotic Attire & Fetish',
  maebari: 'Erotic Attire & Fetish',
  pasties: 'Erotic Attire & Fetish',
  slingshot_swimsuit: 'Erotic Attire & Fetish',
  virgin_killer_sweater: 'Erotic Attire & Fetish',
  dildo: 'Erotic Attire & Fetish',
  vibrator: 'Erotic Attire & Fetish',
  sex_toy: 'Erotic Attire & Fetish',
  condom: 'Erotic Attire & Fetish',
  lubricant: 'Erotic Attire & Fetish',

  bondage: 'BDSM & Restraint',
  bdsm: 'BDSM & Restraint',
  shibari: 'BDSM & Restraint',
  spanking: 'BDSM & Restraint',
  bit_gag: 'BDSM & Restraint',
  cleave_gag: 'BDSM & Restraint',
  bound_wrists: 'BDSM & Restraint',
  bound_arms: 'BDSM & Restraint',
  chain_leash: 'BDSM & Restraint',
};

// Normalized SFW Dictionary matching all YAML keys
export const SFW_EXACT_MAP: Record<string, { parent: string; sub: string }> = {
  // Person -> Object
  '1girl': { parent: 'Person', sub: 'Object' },
  '1boy': { parent: 'Person', sub: 'Object' },
  '2girls': { parent: 'Person', sub: 'Object' },
  '2boys': { parent: 'Person', sub: 'Object' },
  '3girls': { parent: 'Person', sub: 'Object' },
  '3boys': { parent: 'Person', sub: 'Object' },
  girl: { parent: 'Person', sub: 'Object' },
  boy: { parent: 'Person', sub: 'Object' },
  solo: { parent: 'Person', sub: 'Object' },
  multiple_girls: { parent: 'Person', sub: 'Object' },
  little_girl: { parent: 'Person', sub: 'Object' },
  little_boy: { parent: 'Person', sub: 'Object' },
  shota: { parent: 'Person', sub: 'Object' },
  loli: { parent: 'Person', sub: 'Object' },
  kawaii: { parent: 'Person', sub: 'Object' },
  mesugaki: { parent: 'Person', sub: 'Object' },
  adorable_girl: { parent: 'Person', sub: 'Object' },
  bishoujo: { parent: 'Person', sub: 'Object' },
  gyaru: { parent: 'Person', sub: 'Object' },
  sisters: { parent: 'Person', sub: 'Object' },
  ojousama: { parent: 'Person', sub: 'Object' },
  female: { parent: 'Person', sub: 'Object' },
  mature_female: { parent: 'Person', sub: 'Object' },
  mature: { parent: 'Person', sub: 'Object' },
  male: { parent: 'Person', sub: 'Object' },
  milf: { parent: 'Person', sub: 'Object' },
  otoko_no_ko: { parent: 'Person', sub: 'Object' },
  crossdressing: { parent: 'Person', sub: 'Object' },

  // Person -> Identity
  lifeguard: { parent: 'Person', sub: 'Identity' },
  boxer: { parent: 'Person', sub: 'Identity' },
  scientist: { parent: 'Person', sub: 'Identity' },
  athletes: { parent: 'Person', sub: 'Identity' },
  office_lady: { parent: 'Person', sub: 'Identity' },
  monk: { parent: 'Person', sub: 'Identity' },
  nun: { parent: 'Person', sub: 'Identity' },
  nurse: { parent: 'Person', sub: 'Identity' },
  stewardess: { parent: 'Person', sub: 'Identity' },
  student: { parent: 'Person', sub: 'Identity' },
  waitress: { parent: 'Person', sub: 'Identity' },
  teacher: { parent: 'Person', sub: 'Identity' },
  police: { parent: 'Person', sub: 'Identity' },
  soldier: { parent: 'Person', sub: 'Identity' },
  cheerleader: { parent: 'Person', sub: 'Identity' },
  spy: { parent: 'Person', sub: 'Identity' },
  assassin: { parent: 'Person', sub: 'Identity' },
  samurai: { parent: 'Person', sub: 'Identity' },
  ninja: { parent: 'Person', sub: 'Identity' },
  maid: { parent: 'Person', sub: 'Identity' },
  detective: { parent: 'Person', sub: 'Identity' },
  chef: { parent: 'Person', sub: 'Identity' },
  doctor: { parent: 'Person', sub: 'Identity' },
  knight: { parent: 'Person', sub: 'Identity' },
  miko: { parent: 'Person', sub: 'Identity' },
  idol: { parent: 'Person', sub: 'Identity' },
  priest: { parent: 'Person', sub: 'Identity' },
  cleric: { parent: 'Person', sub: 'Identity' },

  // Person -> Anime Role
  hatsune_miku: { parent: 'Person', sub: 'Anime Role' },
  pikachu: { parent: 'Person', sub: 'Anime Role' },
  witch: { parent: 'Person', sub: 'Anime Role' },
  vampire: { parent: 'Person', sub: 'Anime Role' },
  magical_girl: { parent: 'Person', sub: 'Anime Role' },
  elf: { parent: 'Person', sub: 'Anime Role' },
  fairy: { parent: 'Person', sub: 'Anime Role' },
  furry: { parent: 'Person', sub: 'Anime Role' },
  mermaid: { parent: 'Person', sub: 'Anime Role' },
  cat_girl: { parent: 'Person', sub: 'Anime Role' },
  fox_girl: { parent: 'Person', sub: 'Anime Role' },
  kitsune: { parent: 'Person', sub: 'Anime Role' },
  bunny_girl: { parent: 'Person', sub: 'Anime Role' },
  angel: { parent: 'Person', sub: 'Anime Role' },
  devil: { parent: 'Person', sub: 'Anime Role' },
  succubus: { parent: 'Person', sub: 'Anime Role' },
  cyborg: { parent: 'Person', sub: 'Anime Role' },

  // Person -> Age, Skin, Figure
  toddler: { parent: 'Person', sub: 'Age' },
  child: { parent: 'Person', sub: 'Age' },
  teenager: { parent: 'Person', sub: 'Age' },
  adult: { parent: 'Person', sub: 'Age' },
  elder: { parent: 'Person', sub: 'Age' },
  skinny: { parent: 'Person', sub: 'Figure' },
  plump: { parent: 'Person', sub: 'Figure' },
  curvy: { parent: 'Person', sub: 'Figure' },
  slender: { parent: 'Person', sub: 'Figure' },
  muscular: { parent: 'Person', sub: 'Figure' },
  chibi: { parent: 'Person', sub: 'Figure' },
  white_skin: { parent: 'Person', sub: 'Skin' },
  pale_skin: { parent: 'Person', sub: 'Skin' },
  dark_skin: { parent: 'Person', sub: 'Skin' },
  tan: { parent: 'Person', sub: 'Skin' },
  tanlines: { parent: 'Person', sub: 'Skin' },

  // Person -> Anatomy
  straight_hair: { parent: 'Person', sub: 'Hair' },
  short_hair: { parent: 'Person', sub: 'Hair' },
  long_hair: { parent: 'Person', sub: 'Hair' },
  ponytail: { parent: 'Person', sub: 'Hair' },
  twintails: { parent: 'Person', sub: 'Hair' },
  braid: { parent: 'Person', sub: 'Hair' },
  bangs: { parent: 'Person', sub: 'Hair' },
  ahoge: { parent: 'Person', sub: 'Hair' },
  hair_bun: { parent: 'Person', sub: 'Hair' },
  blue_eyes: { parent: 'Person', sub: 'Eyes' },
  red_eyes: { parent: 'Person', sub: 'Eyes' },
  brown_eyes: { parent: 'Person', sub: 'Eyes' },
  green_eyes: { parent: 'Person', sub: 'Eyes' },
  closed_eyes: { parent: 'Person', sub: 'Eyes' },
  heterochromia: { parent: 'Person', sub: 'Eyes' },
  slit_pupils: { parent: 'Person', sub: 'Pupils' },
  cat_ears: { parent: 'Person', sub: 'Ears' },
  fox_ears: { parent: 'Person', sub: 'Ears' },
  horns: { parent: 'Person', sub: 'Ears' },
  small_breasts: { parent: 'Person', sub: 'Chest' },
  medium_breasts: { parent: 'Person', sub: 'Chest' },
  large_breasts: { parent: 'Person', sub: 'Chest' },
  cleavage: { parent: 'Person', sub: 'Chest' },
  flat_chest: { parent: 'Person', sub: 'Chest' },
  wings: { parent: 'Person', sub: 'Wings' },

  // Apparel
  suit: { parent: 'Apparel', sub: 'Formal wear' },
  tuxedo: { parent: 'Apparel', sub: 'Formal wear' },
  kimono: { parent: 'Apparel', sub: 'Formal wear' },
  yukata: { parent: 'Apparel', sub: 'Casual wear' },
  dress: { parent: 'Apparel', sub: 'Skirt' },
  skirt: { parent: 'Apparel', sub: 'Skirt' },
  miniskirt: { parent: 'Apparel', sub: 'Skirt' },
  pleated_skirt: { parent: 'Apparel', sub: 'Skirt' },
  pants: { parent: 'Apparel', sub: 'Pants' },
  jeans: { parent: 'Apparel', sub: 'Pants' },
  shorts: { parent: 'Apparel', sub: 'Pants' },
  shirt: { parent: 'Apparel', sub: 'Shirt' },
  t_shirt: { parent: 'Apparel', sub: 'Shirt' },
  blouse: { parent: 'Apparel', sub: 'Shirt' },
  hoodie: { parent: 'Apparel', sub: 'Shirt' },
  sweater: { parent: 'Apparel', sub: 'Coat' },
  jacket: { parent: 'Apparel', sub: 'Coat' },
  coat: { parent: 'Apparel', sub: 'Coat' },
  swimsuit: { parent: 'Apparel', sub: 'Swimwear' },
  bikini: { parent: 'Apparel', sub: 'Swimwear' },
  school_swimsuit: { parent: 'Apparel', sub: 'Swimwear' },
  school_uniform: { parent: 'Apparel', sub: 'Uniform' },
  serafuku: { parent: 'Apparel', sub: 'Uniform' },
  sailor: { parent: 'Apparel', sub: 'Uniform' },
  socks: { parent: 'Apparel', sub: 'Socks' },
  thighhighs: { parent: 'Apparel', sub: 'Socks' },
  kneehighs: { parent: 'Apparel', sub: 'Socks' },
  pantyhose: { parent: 'Apparel', sub: 'Socks' },
  shoes: { parent: 'Apparel', sub: 'Shoes' },
  boots: { parent: 'Apparel', sub: 'Boots' },
  sneakers: { parent: 'Apparel', sub: 'Shoes' },
  loafers: { parent: 'Apparel', sub: 'Shoes' },
  high_heels: { parent: 'Apparel', sub: 'Shoes' },
  gloves: { parent: 'Apparel', sub: 'Gloves' },
  glasses: { parent: 'Apparel', sub: 'Glasses' },
  sunglasses: { parent: 'Apparel', sub: 'Glasses' },
  eyepatch: { parent: 'Apparel', sub: 'Glasses' },
  mask: { parent: 'Apparel', sub: 'Mask' },
  hat: { parent: 'Apparel', sub: 'Hat' },
  beret: { parent: 'Apparel', sub: 'Hat' },
  cap: { parent: 'Apparel', sub: 'Hat' },
  hairband: { parent: 'Apparel', sub: 'Hair accessories' },
  hair_ribbon: { parent: 'Apparel', sub: 'Hair accessories' },
  choker: { parent: 'Apparel', sub: 'Neckline' },
  necklace: { parent: 'Apparel', sub: 'Neckline' },
  necktie: { parent: 'Apparel', sub: 'Neckline' },
  bowtie: { parent: 'Apparel', sub: 'Neckline' },
  scarf: { parent: 'Apparel', sub: 'Scarf' },
  earrings: { parent: 'Apparel', sub: 'Earrings' },
  ring: { parent: 'Apparel', sub: 'Jewelry' },
  bracelet: { parent: 'Apparel', sub: 'Jewelry' },

  // Facial expression and action
  smile: { parent: 'Facial expression and action', sub: 'Smile' },
  grin: { parent: 'Facial expression and action', sub: 'Smile' },
  smirk: { parent: 'Facial expression and action', sub: 'Smile' },
  happy: { parent: 'Facial expression and action', sub: 'Smile' },
  crying: { parent: 'Facial expression and action', sub: 'Cry' },
  tears: { parent: 'Facial expression and action', sub: 'Cry' },
  sad: { parent: 'Facial expression and action', sub: 'Cry' },
  angry: { parent: 'Facial expression and action', sub: 'Angry' },
  frown: { parent: 'Facial expression and action', sub: 'Unhappy' },
  blush: { parent: 'Facial expression and action', sub: 'Other expressions' },
  shy: { parent: 'Facial expression and action', sub: 'Other expressions' },
  embarrassed: { parent: 'Facial expression and action', sub: 'Other expressions' },
  expressionless: { parent: 'Facial expression and action', sub: 'Other expressions' },
  standing: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  sitting: { parent: 'Facial expression and action', sub: 'Leg actions' },
  kneeling: { parent: 'Facial expression and action', sub: 'Leg actions' },
  lying: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  walking: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  running: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  jumping: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  dancing: { parent: 'Facial expression and action', sub: 'Basic Actions' },
  waving: { parent: 'Facial expression and action', sub: 'Hand actions' },
  pointing: { parent: 'Facial expression and action', sub: 'Hand actions' },
  salute: { parent: 'Facial expression and action', sub: 'Hand actions' },
  hands_on_hips: { parent: 'Facial expression and action', sub: 'Hand actions (Put somewhere)' },
  peace_sign: { parent: 'Facial expression and action', sub: 'Hand actions' },
  v: { parent: 'Facial expression and action', sub: 'Hand actions' },

  // Image
  masterpiece: { parent: 'Image', sub: 'Quality' },
  best_quality: { parent: 'Image', sub: 'Quality' },
  highres: { parent: 'Image', sub: 'Quality' },
  absurdres: { parent: 'Image', sub: 'Quality' },
  lowres: { parent: 'Image', sub: 'Quality' },
  monochrome: { parent: 'Image', sub: 'Art style' },
  greyscale: { parent: 'Image', sub: 'Art style' },
  sketch: { parent: 'Image', sub: 'Sketch' },
  lineart: { parent: 'Image', sub: 'Art style' },
  traditional_media: { parent: 'Image', sub: 'Brush' },
  'watercolor_(medium)': { parent: 'Image', sub: 'Brush' },
  oil_painting: { parent: 'Image', sub: 'Realistic' },
  realistic: { parent: 'Image', sub: 'Realistic' },
  simple_background: { parent: 'Image', sub: 'Background' },
  white_background: { parent: 'Image', sub: 'Background' },
  black_background: { parent: 'Image', sub: 'Background' },
  transparent_background: { parent: 'Image', sub: 'Background' },
  gradient_background: { parent: 'Image', sub: 'Background' },
  cinematic_lighting: { parent: 'Image', sub: 'Lighting' },
  rim_light: { parent: 'Image', sub: 'Lighting' },
  volumetric_lighting: { parent: 'Image', sub: 'Lighting' },

  // Environment
  spring: { parent: 'Environment', sub: 'Season' },
  summer: { parent: 'Environment', sub: 'Season' },
  autumn: { parent: 'Environment', sub: 'Season' },
  winter: { parent: 'Environment', sub: 'Season' },
  day: { parent: 'Environment', sub: 'Weather' },
  night: { parent: 'Environment', sub: 'Weather' },
  sunset: { parent: 'Environment', sub: 'Weather' },
  rain: { parent: 'Environment', sub: 'Weather' },
  snow: { parent: 'Environment', sub: 'Weather' },
  sky: { parent: 'Environment', sub: 'Sky' },
  cloud: { parent: 'Environment', sub: 'Cloud' },
  clouds: { parent: 'Environment', sub: 'Cloud' },
  sun: { parent: 'Environment', sub: 'Weather' },
  moon: { parent: 'Environment', sub: 'Sky' },
  stars: { parent: 'Environment', sub: 'Sky' },
  starry_sky: { parent: 'Environment', sub: 'Sky' },
  nature: { parent: 'Environment', sub: 'Nature' },
  ocean: { parent: 'Environment', sub: 'Water' },
  sea: { parent: 'Environment', sub: 'Water' },
  beach: { parent: 'Environment', sub: 'Water' },
  water: { parent: 'Environment', sub: 'Water' },
  forest: { parent: 'Environment', sub: 'Nature' },
  mountain: { parent: 'Environment', sub: 'Nature' },

  // Scene
  outdoors: { parent: 'Scene', sub: 'Outdoor' },
  indoors: { parent: 'Scene', sub: 'Indoor' },
  city: { parent: 'Scene', sub: 'City' },
  cityscape: { parent: 'Scene', sub: 'City' },
  street: { parent: 'Scene', sub: 'City' },
  room: { parent: 'Scene', sub: 'Indoor' },
  bedroom: { parent: 'Scene', sub: 'Indoor' },
  classroom: { parent: 'Scene', sub: 'Indoor' },
  kitchen: { parent: 'Scene', sub: 'Indoor' },
  bathroom: { parent: 'Scene', sub: 'Bathroom' },
  bed: { parent: 'Scene', sub: 'Furniture' },
  chair: { parent: 'Scene', sub: 'Furniture' },
  table: { parent: 'Scene', sub: 'Furniture' },
  tatami: { parent: 'Scene', sub: 'Floor' },

  // Items
  weapon: { parent: 'Items', sub: 'Weapon' },
  sword: { parent: 'Items', sub: 'Weapon' },
  katana: { parent: 'Items', sub: 'Weapon' },
  gun: { parent: 'Items', sub: 'Weapon' },
  knife: { parent: 'Items', sub: 'Weapon' },
  'bow_(weapon)': { parent: 'Items', sub: 'Weapon' },
  shield: { parent: 'Items', sub: 'Weapon' },
  food: { parent: 'Items', sub: 'Food' },
  cake: { parent: 'Items', sub: 'Food' },
  tea: { parent: 'Items', sub: 'Food' },
  coffee: { parent: 'Items', sub: 'Food' },
  book: { parent: 'Items', sub: 'Study supplies' },
  phone: { parent: 'Items', sub: 'Digital devices' },
  guitar: { parent: 'Items', sub: 'Musical Instruments' },
  flower: { parent: 'Items', sub: 'Plant' },
  tree: { parent: 'Items', sub: 'Plant' },
  cat: { parent: 'Items', sub: 'Animal' },
  dog: { parent: 'Items', sub: 'Animal' },
  fox: { parent: 'Items', sub: 'Animal' },
  bird: { parent: 'Items', sub: 'Animal' },

  // Camera
  looking_at_viewer: { parent: 'Camera', sub: 'Protagonist action' },
  looking_away: { parent: 'Camera', sub: 'Protagonist action' },
  looking_back: { parent: 'Camera', sub: 'Protagonist action' },
  'close-up': { parent: 'Camera', sub: 'Close-up' },
  portrait: { parent: 'Camera', sub: 'Camera' },
  upper_body: { parent: 'Camera', sub: 'Camera' },
  full_body: { parent: 'Camera', sub: 'Camera' },
  cowboy_shot: { parent: 'Camera', sub: 'Camera' },
  from_above: { parent: 'Camera', sub: 'Camera angle' },
  from_below: { parent: 'Camera', sub: 'Camera angle' },
  from_side: { parent: 'Camera', sub: 'Camera angle' },
  from_behind: { parent: 'Camera', sub: 'Camera angle' },
  depth_of_field: { parent: 'Camera', sub: 'Effect' },
  bokeh: { parent: 'Camera', sub: 'Effect' },

  // Negative Prompt
  worst_quality: { parent: 'Negative Prompt', sub: 'Image' },
  low_quality: { parent: 'Negative Prompt', sub: 'Image' },
  bad_anatomy: { parent: 'Negative Prompt', sub: 'Person' },
  bad_hands: { parent: 'Negative Prompt', sub: 'Person' },
  missing_fingers: { parent: 'Negative Prompt', sub: 'Person' },
  extra_digits: { parent: 'Negative Prompt', sub: 'Person' },
  blurry: { parent: 'Negative Prompt', sub: 'Image' },
  watermark: { parent: 'Negative Prompt', sub: 'Image' },
  signature: { parent: 'Negative Prompt', sub: 'Image' },
};

const NSFW_PATTERN = /(nsfw|nude|naked|topless|bottomless|completely_nude|crotchless|nipples|areola|pussy|penis|vagina|clitoris|anus|anal|cervix|dildo|vibrator|sex|sexual|penetration|intercourse|masturbation|fellatio|blowjob|cunnilingus|paizuri|creampie|ejaculation|cumshot|facial_cum|fingering|handjob|footjob|oral_invitation|licking_penis|bukkake|gangbang|female_orgasm|ahegao|rape_face|moaning|shibari|bondage|bdsm|tentacle_sex|internal_cumshot|undressing|clothes_lift|skirt_lift|shirt_lift|spanking|groping|self_fondle|crotch_grab|no_panties|no_bra|exposed_)/i;

export function classifyTagDetailed(
  tag: string,
  _nativeCategory?: string,
  nativeCode?: string,
  _wikiCategory?: string | null,
  _count?: number | null,
  _description?: string | null
): ClassificationResult {
  const norm = normalizeTag(tag);
  const clean = cleanKey(norm);

  const isNsfw = clean in NSFW_EXACT_MAP || NSFW_PATTERN.test(clean);

  // 1. Explicit NSFW Hit
  if (clean in NSFW_EXACT_MAP) {
    return {
      primary: { parent: 'NSFW & Adult', sub: NSFW_EXACT_MAP[clean] },
      secondary: [],
      confidence: 0.99,
      sources: ['nsfw_taxonomy'],
      isNsfw: true,
    };
  }

  // 2. Pattern-based NSFW Fallback
  if (isNsfw) {
    let sub = 'Sex Acts';
    if (/(nude|naked|topless|bottomless|exposed|lift|undressing|no_panties|no_bra)/.test(clean)) {
      sub = 'Nudity & Exposure';
    } else if (/(pussy|penis|vagina|clitoris|anus|nipples|areola|cum|ejaculation|testicles)/.test(clean)) {
      sub = 'Adult Anatomy & Fluids';
    } else if (/(missionary|doggystyle|cowgirl|straddle|docking|prone_bone)/.test(clean)) {
      sub = 'Sexual Positions';
    } else if (/(crotchless|cutout|pasties|dildo|vibrator|toy)/.test(clean)) {
      sub = 'Erotic Attire & Fetish';
    } else if (/(bdsm|shibari|bondage|spanking|restraint|gag)/.test(clean)) {
      sub = 'BDSM & Restraint';
    }

    return {
      primary: { parent: 'NSFW & Adult', sub },
      secondary: [],
      confidence: 0.94,
      sources: ['semantic_nsfw_rule'],
      isNsfw: true,
    };
  }

  // 3. Exact SFW Dictionary Hit
  if (SFW_EXACT_MAP[clean]) {
    const hit = SFW_EXACT_MAP[clean];
    return {
      primary: { parent: hit.parent, sub: hit.sub },
      secondary: [],
      confidence: 0.99,
      sources: ['sfw_taxonomy'],
      isNsfw: false,
    };
  }

  // 4. Danbooru Metadata Fallbacks
  if (nativeCode === '1') {
    return { primary: { parent: 'Image', sub: 'Artist style' }, secondary: [], confidence: 0.95, sources: ['native_code'], isNsfw: false };
  }
  if (nativeCode === '3' || nativeCode === '4') {
    return { primary: { parent: 'Person', sub: 'Anime Role' }, secondary: [], confidence: 0.95, sources: ['native_code'], isNsfw: false };
  }
  if (nativeCode === '5') {
    return { primary: { parent: 'Image', sub: 'Quality' }, secondary: [], confidence: 0.95, sources: ['native_code'], isNsfw: false };
  }

  // 5. Pattern-Matching Routing
  if (/^(looking_|stare|eye_contact|facing_)/.test(clean)) {
    return { primary: { parent: 'Camera', sub: 'Protagonist action' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(from_above|from_below|from_side|from_behind|dutch_angle|angle|view$)/.test(clean)) {
    return { primary: { parent: 'Camera', sub: 'Camera angle' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(shot$|portrait|full_body|upper_body|cowboy_shot|panorama)/.test(clean)) {
    return { primary: { parent: 'Camera', sub: 'Camera' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(close-up|macro|focus$)/.test(clean)) {
    return { primary: { parent: 'Camera', sub: 'Close-up' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(hair|bangs|braid|ponytail|twintails|ahoge|bob_cut|hime_cut)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Hair' }, secondary: [], confidence: 0.92, sources: ['rule'], isNsfw: false };
  }
  if (/(eyes|pupils|sclera)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Eyes' }, secondary: [], confidence: 0.92, sources: ['rule'], isNsfw: false };
  }
  if (/(ears|horns|antlers)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Ears' }, secondary: [], confidence: 0.92, sources: ['rule'], isNsfw: false };
  }
  if (/(breasts|cleavage|pectorals|chest)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Chest' }, secondary: [], confidence: 0.92, sources: ['rule'], isNsfw: false };
  }
  if (/(wings)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Wings' }, secondary: [], confidence: 0.92, sources: ['rule'], isNsfw: false };
  }
  if (/(skin|tan|tanlines|tattoo)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Skin' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(girl|boy|solo|girls|boys|people|count)/.test(clean)) {
    return { primary: { parent: 'Person', sub: 'Object' }, secondary: [], confidence: 0.95, sources: ['rule'], isNsfw: false };
  }
  if (/(dress|skirt)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Skirt' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(pants|shorts|jeans|bloomers|buruma)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Pants' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(shirt|blouse|hoodie|sweater|tank_top|crop_top)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Shirt' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(jacket|coat|blazer|cape|cloak)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Coat' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(swimsuit|bikini)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Swimwear' }, secondary: [], confidence: 0.95, sources: ['rule'], isNsfw: false };
  }
  if (/(uniform|maid|nurse|miko|sailor)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Uniform' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(socks|thighhighs|kneehighs|pantyhose|stockings)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Socks' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(boots|shoes|sneakers|loafers|sandals|heels)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Shoes' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(hat|cap|beret|helmet)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Hat' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(glasses|eyewear|sunglasses|goggles|eyepatch|mask)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Glasses' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(gloves|mittens)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Gloves' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(choker|necklace|necktie|bowtie|scarf)/.test(clean)) {
    return { primary: { parent: 'Apparel', sub: 'Neckline' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/^holding_/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Hand actions (Holding)' }, secondary: [], confidence: 0.95, sources: ['rule'], isNsfw: false };
  }
  if (/(smile|grin|laugh|smirk|happy)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Smile' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(cry|tears|sad)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Cry' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(angry|glare|rage|frown)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Angry' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(standing|walking|running|jumping|lying|afloat|posing)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Basic Actions' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(sitting|kneeling|squatting|legs_|feet)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Leg actions' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(arms_|hands_|hand_|finger|pointing|waving)/.test(clean)) {
    return { primary: { parent: 'Facial expression and action', sub: 'Hand actions' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(sky|cloud|clouds|sun|moon|stars|weather|rain|snow|night|dusk|sunset)/.test(clean)) {
    return { primary: { parent: 'Environment', sub: 'Weather' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(sea|ocean|beach|lake|water|waterfall|waves)/.test(clean)) {
    return { primary: { parent: 'Environment', sub: 'Water' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(forest|mountain|cliff|nature|tree|trees)/.test(clean)) {
    return { primary: { parent: 'Environment', sub: 'Nature' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(indoor|indoors|room|bedroom|classroom|kitchen|bathroom|bed|couch)/.test(clean)) {
    return { primary: { parent: 'Scene', sub: 'Indoor' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(outdoor|outdoors|city|street|bridge|ruins|park|building)/.test(clean)) {
    return { primary: { parent: 'Scene', sub: 'Outdoor' }, secondary: [], confidence: 0.88, sources: ['rule'], isNsfw: false };
  }
  if (/(weapon|sword|katana|gun|knife|blade|axe|shield)/.test(clean)) {
    return { primary: { parent: 'Items', sub: 'Weapon' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(food|cake|tea|coffee|bread|candy|fruit|apple|meat)/.test(clean)) {
    return { primary: { parent: 'Items', sub: 'Food' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(flower|flowers|rose|blossom|plant|leaf)/.test(clean)) {
    return { primary: { parent: 'Items', sub: 'Plant' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(cat|dog|fox|wolf|rabbit|bunny|animal|creature)/.test(clean)) {
    return { primary: { parent: 'Items', sub: 'Animal' }, secondary: [], confidence: 0.9, sources: ['rule'], isNsfw: false };
  }
  if (/(hanfu|tang_style|song_style|ming_style|shan|pibo|mamian)/.test(clean)) {
    return { primary: { parent: 'Hanfu', sub: 'Coat' }, secondary: [], confidence: 0.95, sources: ['rule'], isNsfw: false };
  }

  return {
    primary: { parent: 'Person', sub: 'Object' },
    secondary: [],
    confidence: 0.5,
    sources: ['fallback'],
    isNsfw: false,
  };
}