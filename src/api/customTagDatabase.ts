// src/api/customTagDatabase.ts

export const CUSTOM_CATEGORIES: Record<string, Record<string, string[]>> = {
  '1. Subject & Count': {
    'Counts': ['1girl', '2girls', '3girls', 'multiple_girls', '1boy', '2boys', 'solo', 'group', 'couple'],
    'Subjects': ['girl', 'boy', 'woman', 'man', 'bishoujo', 'elf', 'angel', 'demon', 'cyborg'],
  },
  '2. Characters & Series': {
    'Vocaloid': ['hatsune_miku', 'megurine_luka', 'kagamine_rin', 'kagamine_len'],
    'Touhou': ['hakurei_reimu', 'kirisame_marisa', 'remilia_scarlet', 'flandre_scarlet', 'izayoi_sakuya'],
    'Genshin Impact': ['raiden_shogun', 'ganyu', 'kamisato_ayaka', 'furina', 'hu_tao', 'nahida', 'yelan'],
  },
  '3. Animals & Creatures': {
    'Features': ['cat_ears', 'fox_ears', 'wolf_ears', 'dog_ears', 'cat_tail', 'fox_tail', 'wings'],
    'Creatures': ['cat', 'dog', 'bird', 'dragon', 'fox', 'rabbit'],
  },
  '4. Face & Hair': {
    'Hair Style': ['long_hair', 'short_hair', 'twintails', 'ponytail', 'braid', 'messy_hair', 'bob_cut'],
    'Hair Color': ['blonde_hair', 'black_hair', 'silver_hair', 'white_hair', 'blue_hair', 'pink_hair', 'red_hair'],
    'Eyes': ['blue_eyes', 'red_eyes', 'green_eyes', 'brown_eyes', 'amber_eyes', 'purple_eyes', 'heterochromia'],
    'Expression': ['smile', 'grin', 'blush', 'open_mouth', 'winking', 'closed_eyes', 'looking_at_viewer'],
  },
  '5. Body & Physiology': {
    'Physique': ['slender', 'petite', 'tall', 'curvy', 'cleavage', 'toned', 'abs'],
    'Details': ['mole', 'freckles', 'fangs', 'pointy_ears', 'navel', 'collarbone'],
  },
  '6. Wardrobe & Outfit': {
    'Everyday': ['school_uniform', 'serafuku', 'sailor_suit', 'blazer', 'pleated_skirt', 'white_shirt', 't-shirt'],
    'Dresses': ['dress', 'sundress', 'black_dress', 'white_dress', 'maid_apron', 'gothic_lolita'],
    'Swimwear': ['bikini', 'swimsuit', 'school_swimsuit', 'one-piece_swimsuit'],
    'Footwear': ['boots', 'thighhighs', 'knee_socks', 'black_stockings', 'sneakers', 'barefoot'],
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
    'Weather': ['day', 'night', 'sunset', 'sunlight', 'moonlight', 'starry_sky', 'rain', 'snow'],
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

// Add custom descriptions or post counts if desired
export const CUSTOM_DESCRIPTIONS: Record<string, string> = {
  blonde_hair: 'Hair colored yellow, flaxen, golden, or pale-yellow.',
  masterpiece: 'High quality artistic creation generated with extreme care.',
};

export const CUSTOM_POST_COUNTS: Record<string, number> = {
  '1girl': 6000000,
  '2girls': 1000000,
  '1boy': 1400000,
  '2boys': 302000,
  solo: 5000000,
  blonde_hair: 2100000,
  masterpiece: 999999,
};