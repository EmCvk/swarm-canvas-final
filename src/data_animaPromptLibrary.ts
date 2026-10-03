export interface PromptBuilderTag {
  id: string;
  label: string;
  section: string;
  path: string[];
  description?: string;
  aliases?: string[];
  safeForNegative?: boolean;
}

export interface PromptBuilderSection {
  id: string;
  label: string;
  hint: string;
  tags: PromptBuilderTag[];
}

const tags = (section: string, path: string[], labels: string[]): PromptBuilderTag[] => labels.map((label) => ({
  id: `${section}:${path.join('/')}:${label}`,
  label,
  section,
  path,
}));

const section = (id: string, label: string, hint: string, groups: Record<string, string[]>, subgroups: Record<string, Record<string, string[]>> = {}): PromptBuilderSection => {
  const flat: PromptBuilderTag[] = [];
  for (const [group, labels] of Object.entries(groups)) flat.push(...tags(id, [group], labels));
  for (const [group, children] of Object.entries(subgroups)) {
    for (const [child, labels] of Object.entries(children)) flat.push(...tags(id, [group, child], labels));
  }
  return { id, label, hint, tags: flat };
};

export const SECTIONS: PromptBuilderSection[] = [
  section('quality', 'Quality & meta', 'Quality, rating, source, score and metadata controls.', {
    'Quality': ['masterpiece', 'best quality', 'high quality', 'good quality', 'normal quality', 'absurdres', 'highres', 'ultra detailed', 'highly detailed'],
    'Score': ['score_9', 'score_8', 'score_7', 'score_6', 'score_5', 'score_4', 'score_3', 'score_2', 'score_1'],
    'Rating': ['safe', 'sensitive', 'questionable', 'explicit'],
    'Source': ['official art', 'anime screenshot', 'game cg', 'novel illustration', 'promotional art', 'concept art'],
    'Era': ['year 2026', 'year 2025', 'year 2024', 'year 2023', 'newest', 'recent', 'retro style', '90s aesthetic', '80s aesthetic'],
    'Format': ['illustration', 'wallpaper', 'cover art', 'key visual', 'character reference', 'reference sheet', 'turnaround'],
  }),

  section('subject', 'Subject & count', 'Explicitly define subject count, species and scene focus.', {
    'Count': ['solo', 'duo', 'trio', 'group', 'crowd', '1girl', '1boy', '1other', '2girls', '2boys', '2others', '3girls', '3boys', 'multiple girls', 'multiple boys', 'multiple characters'],
    'Subject': ['human', 'humanoid', 'character focus', 'character portrait', 'animal focus', 'creature focus', 'object focus', 'landscape focus', 'vehicle focus'],
    'Relationship': ['solo focus', 'couple', 'friends', 'siblings', 'parent and child', 'team', 'rivals', 'group portrait'],
    'Species': ['human', 'elf', 'demon', 'angel', 'fairy', 'mermaid', 'vampire', 'werewolf', 'dragon', 'catgirl', 'foxgirl', 'wolfgirl', 'rabbit girl', 'kemonomimi'],
  }),

  section('identity', 'Character identity', 'Character, series, role, archetype and identity descriptors.', {
    'Origin': ['original', 'original character', 'fan character', 'alternate universe', 'alternate costume', 'alternate hairstyle', 'genderbend', 'aged up', 'aged down'],
    'Role': ['protagonist', 'hero', 'villain', 'antihero', 'sidekick', 'teacher', 'student', 'office worker', 'artist', 'musician', 'athlete', 'warrior', 'mage', 'knight', 'princess', 'prince', 'maid', 'waitress', 'doctor', 'scientist'],
    'Design': ['signature outfit', 'iconic outfit', 'character sheet', 'reference sheet', 'full character reference', 'front view reference', 'side view reference', 'back view reference'],
    'Age': ['child', 'teenager', 'young adult', 'adult', 'elderly', 'mature female', 'mature male'],
  }),

  section('hair', 'Hair', 'A large hair taxonomy covering structure, styling, texture, color and ornaments.', {}, {
    'Length': {
      'Short': ['short hair', 'very short hair', 'pixie cut', 'buzz cut', 'undercut', 'shaved head'],
      'Medium': ['medium hair', 'shoulder-length hair', 'chin-length hair', 'neck-length hair', 'bob cut', 'hime cut'],
      'Long': ['long hair', 'very long hair', 'waist-length hair', 'hip-length hair', 'floor-length hair'],
    },
    'Bangs': {
      'Shape': ['bangs', 'blunt bangs', 'straight bangs', 'side-swept bangs', 'curtained hair', 'asymmetrical bangs', 'choppy bangs', 'wispy bangs', 'hair between eyes', 'hair over one eye'],
    },
    'Style': {
      'Ties': ['ponytail', 'high ponytail', 'low ponytail', 'side ponytail', 'twin ponytails', 'twintails', 'short ponytail', 'high twin tails', 'low twin tails'],
      'Braids': ['braid', 'single braid', 'side braid', 'french braid', 'dutch braid', 'fishtail braid', 'crown braid', 'braided ponytail'],
      'Updos': ['hair bun', 'double bun', 'messy bun', 'chignon', 'updo', 'half updo', 'half-up half-down'],
      'Special': ['ahoge', 'antenna hair', 'drill hair', 'ringlets', 'hair horns', 'hair flaps', 'floating hair', 'windblown hair'],
    },
    'Texture': {
      'Shape': ['straight hair', 'wavy hair', 'curly hair', 'messy hair', 'spiky hair', 'fluffy hair', 'feathered hair', 'voluminous hair', 'wet hair'],
    },
    'Color': {
      'Natural': ['black hair', 'brown hair', 'dark brown hair', 'blonde hair', 'dirty blonde hair', 'red hair', 'auburn hair', 'orange hair', 'white hair', 'gray hair'],
      'Fantasy': ['pink hair', 'blue hair', 'cyan hair', 'purple hair', 'violet hair', 'green hair', 'teal hair', 'silver hair', 'lavender hair'],
      'Patterns': ['gradient hair', 'multicolored hair', 'two-tone hair', 'streaked hair', 'colored tips', 'split-color hair'],
    },
    'Ornaments': {
      'Accessories': ['hair ornament', 'hair ribbon', 'hair bow', 'hairclip', 'hairpin', 'hair flower', 'hairband', 'headband', 'tiara'],
    },
  }),

  section('face', 'Face, eyes & expression', 'Fine-grained facial structure, eyes, gaze, mouth, emotion and face accessories.', {}, {
    'Eyes': {
      'Shape': ['large eyes', 'small eyes', 'round eyes', 'narrow eyes', 'almond eyes', 'upturned eyes', 'downturned eyes', 'sleepy eyes', 'half-closed eyes', 'closed eyes', 'sparkling eyes'],
      'Color': ['blue eyes', 'light blue eyes', 'cyan eyes', 'green eyes', 'emerald eyes', 'brown eyes', 'amber eyes', 'golden eyes', 'red eyes', 'pink eyes', 'purple eyes', 'violet eyes', 'gray eyes', 'black eyes', 'white eyes'],
      'Details': ['heterochromia', 'vertical pupils', 'slit pupils', 'constricted pupils', 'dilated pupils', 'glowing eyes', 'empty eyes', 'symbol-shaped pupils', 'eyeliner', 'long eyelashes', 'thick eyelashes'],
    },
    'Brows': {
      'Shape': ['raised eyebrows', 'furrowed brow', 'thick eyebrows', 'thin eyebrows', 'arched eyebrows', 'confused eyebrows'],
    },
    'Mouth': {
      'Shape': ['closed mouth', 'open mouth', 'small mouth', 'parted lips', 'smile', 'grin', 'smirk', 'frown', 'pout', 'biting lip', 'tongue out'],
    },
    'Expression': {
      'Positive': ['happy', 'smile', 'laughing', 'cheerful', 'excited', 'confident expression', 'gentle smile', 'playful expression'],
      'Neutral': ['neutral expression', 'serious', 'calm', 'stoic', 'deadpan', 'indifferent'],
      'Negative': ['sad', 'melancholic', 'crying', 'angry', 'furious', 'worried', 'afraid', 'embarrassed', 'shy', 'surprised', 'confused', 'disappointed'],
    },
    'Gaze': {
      'Direction': ['looking at viewer', 'looking away', 'looking up', 'looking down', 'looking to the side', 'sideways glance', 'eye contact', 'closed eyes'],
    },
    'Face details': {
      'Marks': ['freckles', 'mole', 'beauty mark', 'blush', 'face markings', 'facial scar', 'bandage on face', 'makeup'],
    },
    'Accessories': {
      'Eyewear': ['glasses', 'round glasses', 'square glasses', 'sunglasses', 'monocle', 'eyepatch'],
      'Piercings': ['earrings', 'stud earrings', 'hoop earrings', 'multiple piercings', 'lip piercing', 'nose piercing'],
    },
  }),

  section('body', 'Body & anatomy', 'Fine-grained body descriptors, skin, proportions, anatomy, limbs, chest, hips, ears, wings and tails.', {}, {
    'Body type': {
      'Build': ['slender', 'petite', 'average build', 'curvy', 'athletic', 'muscular', 'toned', 'lean', 'stocky', 'broad build', 'tall', 'short'],
      'Proportion': ['long legs', 'short legs', 'long torso', 'short torso', 'broad shoulders', 'narrow shoulders', 'narrow waist', 'thick waist', 'wide hips', 'narrow hips', 'hourglass figure', 'pear-shaped body', 'inverted triangle body'],
    },
    'Skin': {
      'Tone': ['pale skin', 'fair skin', 'light brown skin', 'brown skin', 'dark skin', 'tan', 'tanned skin', 'freckled skin'],
      'Surface': ['smooth skin', 'soft skin', 'glossy skin', 'wet skin', 'sweaty skin', 'sun-kissed skin'],
      'Marks': ['birthmark', 'mole', 'scars', 'skin blemish', 'stretch marks', 'tattoo', 'body paint', 'tribal tattoo'],
    },
    'Chest & torso': {
      'Shape': ['flat chest', 'small breasts', 'medium breasts', 'large breasts', 'cleavage', 'broad chest', 'defined chest', 'muscular torso'],
      'Attributes': ['collarbone', 'visible collarbone', 'covered chest', 'exposed shoulders'],
    },
    'Waist & hips': {
      'Shape': ['narrow waist', 'defined waist', 'wide waist', 'wide hips', 'narrow hips', 'curvy hips', 'thick thighs', 'slim thighs'],
    },
    'Butt & lower body': {
      'Shape': ['rounded butt', 'flat butt', 'curvy lower body', 'athletic lower body', 'wide hips', 'thick thighs', 'slim legs', 'long legs', 'short legs'],
    },
    'Arms & hands': {
      'Arms': ['slender arms', 'muscular arms', 'long arms', 'short arms', 'defined forearms', 'bare arms', 'covered arms'],
      'Hands': ['small hands', 'large hands', 'delicate hands', 'holding hands', 'open hand', 'closed fist', 'spread fingers', 'interlaced fingers', 'pointing finger'],
    },
    'Legs & feet': {
      'Legs': ['long legs', 'short legs', 'slender legs', 'muscular legs', 'thick thighs', 'thigh gap', 'kneeling legs'],
      'Feet': ['barefoot', 'small feet', 'large feet', 'pointed toes', 'toes visible', 'feet together', 'crossed ankles'],
    },
    'Ears': {
      'Human': ['ears visible', 'ear', 'earlobe', 'earring'],
      'Fantasy': ['pointy ears', 'elf ears', 'animal ears', 'cat ears', 'fox ears', 'wolf ears', 'rabbit ears', 'horse ears', 'deer ears', 'bat ears'],
    },
    'Horns & antlers': {
      'Horns': ['horns', 'small horns', 'large horns', 'curved horns', 'straight horns', 'ram horns', 'demon horns', 'antlers'],
    },
    'Wings': {
      'Type': ['wings', 'angel wings', 'demon wings', 'bird wings', 'bat wings', 'butterfly wings', 'fairy wings', 'dragon wings', 'mechanical wings'],
      'Pose': ['spread wings', 'folded wings', 'outstretched wings', 'one wing raised', 'wing feathers', 'large wings', 'small wings'],
    },
    'Tail': {
      'Animal': ['tail', 'cat tail', 'fox tail', 'wolf tail', 'rabbit tail', 'dog tail', 'horse tail', 'dragon tail', 'demon tail'],
      'Fantasy': ['fluffy tail', 'multiple tails', 'nine tails', 'long tail', 'short tail', 'spaded tail', 'forked tail', 'serpentine tail'],
    },
    'Body features': {
      'Special': ['animal nose', 'snout', 'fangs', 'sharp teeth', 'claws', 'hooves', 'webbed hands', 'webbed feet', 'scales', 'fur', 'feathers', 'gills'],
    },
  }),

  section('actions', 'Actions & interactions', 'Keep actions separate from anatomy: movement, body-part actions, contact, object use and mature actions.', {}, {
    'Full body': {
      'Movement': ['walking', 'running', 'jumping', 'dancing', 'spinning', 'falling', 'flying', 'floating', 'swimming', 'stretching'],
      'Activity': ['eating', 'drinking', 'reading', 'writing', 'cooking', 'singing', 'playing guitar', 'fighting'],
    },
    'Chest & torso': {
      'Movement / contact': ['touching chest', 'touching breasts', 'covering chest', 'holding chest', 'squeezing breasts', 'adjusting shirt', 'pulling shirt', 'shirt buttons', 'open jacket'],
    },
    'Hips & lower body': {
      'Movement / contact': ['touching hips', 'touching thighs', 'hand on hip', 'hands on hips', 'crossing legs', 'uncrossing legs', 'adjusting skirt'],
    },
    'Head & face': {
      'Gesture': ['looking at viewer', 'looking away', 'looking up', 'looking down', 'looking back', 'head tilt', 'hair flip', 'touching face', 'touching hair', 'biting lip'],
    },
    'Arms & hands': {
      'Gesture / contact': ['waving', 'pointing', 'salute', 'peace sign', 'thumbs up', 'arms crossed', 'arms behind back', 'arms behind head', 'hands together', 'clasped hands', 'reaching', 'touching'],
      'Object use': ['holding book', 'holding phone', 'holding umbrella', 'holding cup', 'holding weapon', 'holding flowers'],
    },
    'Legs & feet': {
      'Movement': ['walking', 'running', 'jumping', 'kicking', 'crossed legs', 'knees together', 'one leg raised'],
    },
    'Character interaction': {
      'Contact': ['hugging', 'holding hands', 'handshake', 'hand on shoulder', 'facing each other', 'back-to-back', 'side by side'],
    },
    'Clothing interaction': {
      'Adjust / expose': ['adjusting clothes', 'pulling clothes', 'lifting skirt', 'lifting shirt', 'open jacket', 'open shirt', 'removing clothes'],
    },
  }),

  section('nsfw', 'NSFW & adult', 'Expanded adult-domain library. Classification stays separate from ordinary anatomy, pose and action taxonomies.', {}, {
    'Nudity & exposure': {
      'Clothing state': ['nude', 'naked', 'topless', 'bottomless', 'no panties', 'no bra', 'exposed breasts', 'upskirt', 'pantyshot', 'undressing'],
    },
    'Adult anatomy': {
      'Body': ['nipples', 'areola', 'penis', 'pussy', 'vagina', 'clitoris', 'anus', 'testicles', 'scrotum', 'genitals', 'erection'],
    },
    'Adult actions': {
      'Sexual activity': ['sex', 'sexual intercourse', 'penetration', 'masturbation', 'fellatio', 'cunnilingus', 'groping', 'fingering', 'handjob', 'footjob', 'orgasm', 'ejaculation'],
    },
    'Adult poses': {
      'Positions': ['missionary', 'cowgirl position', 'doggystyle', 'spooning', 'standing sex', 'prone bone', 'upright straddle', 'legs over head'],
    },
    'Erotic attire & objects': {
      'Clothing': ['lingerie', 'microbikini', 'crotchless pants', 'pasties', 'maebari'],
      'Objects': ['dildo', 'vibrator', 'sex toy', 'condom', 'lubricant'],
    },
    'BDSM & restraint': {
      'Restraint': ['bondage', 'bdsm', 'shibari', 'spanking', 'bound wrists', 'bound arms', 'bit gag'],
    },
  }),

  section('clothing', 'Clothing & accessories', 'Build outfits piece-by-piece: garments, uniforms, footwear, accessories and fantasy attire.', {}, {
    'Tops': {
      'Shirts': ['shirt', 't-shirt', 'long-sleeved shirt', 'short-sleeved shirt', 'dress shirt', 'button-up shirt', 'blouse', 'crop top', 'tank top', 'turtleneck'],
      'Knitwear': ['sweater', 'turtleneck sweater', 'cardigan', 'hoodie', 'sweater vest'],
    },
    'Outerwear': {
      'Jackets': ['jacket', 'leather jacket', 'denim jacket', 'bomber jacket', 'blazer', 'suit jacket', 'track jacket'],
      'Coats': ['coat', 'trench coat', 'long coat', 'winter coat', 'pea coat', 'cape', 'cloak', 'poncho'],
    },
    'Dresses': {
      'Styles': ['dress', 'evening dress', 'summer dress', 'sundress', 'formal dress', 'maid dress', 'gothic dress', 'lolita dress', 'qipao', 'kimono', 'yukata'],
    },
    'Bottoms': {
      'Pants': ['pants', 'jeans', 'wide pants', 'baggy pants', 'skinny jeans', 'shorts', 'cargo pants', 'leggings', 'jogger pants'],
      'Skirts': ['skirt', 'mini skirt', 'long skirt', 'pleated skirt', 'pencil skirt', 'flared skirt', 'asymmetrical skirt'],
    },
    'Legwear': {
      'Socks': ['socks', 'ankle socks', 'knee socks', 'thighhighs', 'striped socks', 'white socks', 'black socks'],
      'Hosiery': ['stockings', 'pantyhose', 'fishnet stockings', 'sheer stockings', 'lace-trimmed stockings'],
    },
    'Footwear': {
      'Casual': ['sneakers', 'canvas shoes', 'loafers', 'slip-on shoes', 'boots', 'ankle boots'],
      'Formal': ['heels', 'high heels', 'pumps', 'dress shoes', 'oxford shoes', 'mary jane shoes'],
      'Other': ['sandals', 'flip-flops', 'platform shoes', 'thigh-high boots', 'knee-high boots'],
    },
    'Uniforms': {
      'School': ['school uniform', 'sailor uniform', 'serafuku', 'school blazer', 'school skirt', 'school cardigan'],
      'Work': ['business suit', 'office uniform', 'nurse uniform', 'lab coat', 'military uniform', 'chef uniform', 'police uniform'],
    },
    'Accessories': {
      'Head': ['hat', 'beret', 'cap', 'beanie', 'cowboy hat', 'sun hat', 'hair ribbon', 'headband', 'tiara', 'crown', 'veil'],
      'Neck': ['scarf', 'necklace', 'choker', 'tie', 'bow tie', 'ribbon'],
      'Hands': ['gloves', 'fingerless gloves', 'bracelet', 'wristband', 'watch', 'ring'],
      'Bags': ['backpack', 'handbag', 'shoulder bag', 'tote bag', 'messenger bag', 'purse', 'school bag'],
    },
    'Fantasy & historical': {
      'Armor': ['armor', 'plate armor', 'leather armor', 'chainmail', 'gauntlets', 'shoulder armor', 'helmet'],
      'Historical': ['medieval clothing', 'victorian clothing', 'traditional clothing', 'traditional japanese clothing', 'military uniform', 'royal attire'],
    },
    'Swim & sport': {
      'Swimwear': ['swimsuit', 'one-piece swimsuit', 'bikini', 'school swimsuit', 'rash guard', 'swim cap'],
      'Sportswear': ['sports uniform', 'jersey', 'tracksuit', 'gym clothes', 'tennis outfit', 'cheerleader uniform'],
    },
  }),

  section('pose', 'Pose, gesture & interaction', 'Detailed body actions, hand gestures, interaction and movement.', {}, {
    'Standing': {
      'Stance': ['standing', 'contrapposto', 'wide stance', 'legs together', 'crossed legs', 'one leg raised', 'on one leg'],
    },
    'Sitting': {
      'Positions': ['sitting', 'sitting on chair', 'sitting on floor', 'sitting on bed', 'cross-legged', 'kneeling', 'seiza', 'squatting'],
    },
    'Movement': {
      'Action': ['walking', 'running', 'jumping', 'dancing', 'spinning', 'falling', 'flying', 'floating', 'skipping', 'stretching'],
      'Dynamic': ['dynamic pose', 'motion blur', 'action pose', 'midair', 'windblown pose', 'foreshortened pose'],
    },
    'Arms & hands': {
      'Gesture': ['arms crossed', 'arms behind back', 'arms behind head', 'hands on hips', 'hand on own hip', 'hands together', 'clasped hands', 'waving', 'peace sign', 'pointing', 'finger to lips', 'salute', 'thumbs up', 'fist'],
      'Interaction': ['holding', 'holding book', 'holding phone', 'holding umbrella', 'holding cup', 'holding weapon', 'holding flowers', 'touching face', 'touching hair', 'reaching'],
    },
    'Head': {
      'Gesture': ['head tilt', 'looking over shoulder', 'looking back', 'looking down', 'looking up', 'turning head', 'hair flip'],
    },
    'Pair & group': {
      'Interaction': ['hugging', 'holding hands', 'hand on shoulder', 'back-to-back', 'facing each other', 'side by side', 'group pose', 'team pose'],
    },
  }),

  section('composition', 'Composition & framing', 'Shot size, framing, subject placement and visual composition.', {}, {
    'Shot size': {
      'Close': ['extreme close-up', 'close-up', 'face focus', 'headshot', 'bust', 'portrait'],
      'Medium': ['upper body', 'cowboy shot', 'medium shot', 'waist up', 'knee up'],
      'Wide': ['full body', 'wide shot', 'long shot', 'very wide shot', 'establishing shot'],
    },
    'Layout': {
      'Placement': ['centered composition', 'off-center composition', 'symmetrical composition', 'asymmetrical composition', 'rule of thirds', 'leading lines', 'negative space', 'balanced composition'],
      'Depth': ['foreground', 'middle ground', 'background', 'layered composition', 'depth', 'overlapping subjects'],
    },
    'Orientation': {
      'Frame': ['portrait orientation', 'landscape orientation', 'square composition', 'vertical composition', 'horizontal composition'],
    },
    'Group framing': {
      'Subjects': ['two-shot', 'group shot', 'crowd shot', 'multiple subjects', 'character lineup', 'ensemble shot'],
    },
  }),

  section('camera', 'Camera & perspective', 'Camera angle, viewpoint, lens cues, focus and depth.', {}, {
    'Angle': {
      'Vertical': ['eye-level', 'from above', 'from below', 'high angle', 'low angle', 'bird\'s-eye view', 'worm\'s-eye view'],
      'Horizontal': ['front view', 'side view', 'profile', 'three-quarter view', 'rear view', 'back view'],
      'Dutch': ['dutch angle', 'tilted camera', 'dynamic camera angle'],
    },
    'Lens': {
      'Focal length': ['wide-angle', 'ultra wide-angle', 'fisheye', 'telephoto', 'long lens', 'macro lens'],
    },
    'Focus': {
      'Depth': ['depth of field', 'shallow depth of field', 'deep depth of field', 'bokeh', 'foreground blur', 'background blur', 'sharp focus', 'soft focus', 'focus on face', 'focus on eyes'],
    },
    'Perspective': {
      'Geometry': ['perspective', 'foreshortening', 'forced perspective', 'vanishing point', 'dramatic perspective', 'distorted perspective'],
    },
    'Photography': {
      'Style': ['portrait photography', 'fashion photography', 'street photography', 'cinematic photography', 'studio photography', 'candid shot', 'snapshot'],
    },
  }),

  section('environment', 'Environment & setting', 'Locations, architecture, time, weather and world context.', {}, {
    'Interior': {
      'Rooms': ['bedroom', 'living room', 'kitchen', 'bathroom', 'classroom', 'library', 'office', 'studio', 'dormitory', 'hotel room', 'greenhouse'],
      'Public': ['cafe', 'restaurant', 'bar', 'shop', 'bookstore', 'museum', 'theater', 'train station', 'airport', 'hospital'],
    },
    'Urban': {
      'City': ['city', 'downtown', 'night city', 'street', 'alley', 'rooftop', 'skyscraper', 'shopping district', 'residential street', 'subway'],
    },
    'Nature': {
      'Landscape': ['forest', 'jungle', 'mountain', 'hill', 'valley', 'meadow', 'field', 'desert', 'beach', 'ocean', 'lake', 'river', 'waterfall', 'cave'],
      'Garden': ['garden', 'park', 'flower field', 'cherry blossoms', 'bamboo forest', 'autumn leaves', 'snowy forest'],
    },
    'Architecture': {
      'Structures': ['castle', 'palace', 'temple', 'shrine', 'church', 'cathedral', 'ruins', 'bridge', 'tower', 'mansion', 'cottage', 'village'],
    },
    'Time': {
      'Day': ['morning', 'sunrise', 'daytime', 'afternoon', 'golden hour', 'sunset', 'dusk'],
      'Night': ['night', 'midnight', 'moonlit night', 'blue hour', 'starry sky'],
    },
    'Weather': {
      'Conditions': ['clear sky', 'cloudy sky', 'overcast', 'rain', 'drizzle', 'heavy rain', 'snow', 'blizzard', 'fog', 'mist', 'storm', 'thunderstorm', 'wind'],
    },
    'Season': {
      'Seasons': ['spring', 'summer', 'autumn', 'winter', 'cherry blossom season', 'snow season'],
    },
  }),

  section('lighting', 'Lighting & atmosphere', 'Light source, direction, color, intensity and atmospheric effects.', {}, {
    'Source': {
      'Natural': ['sunlight', 'moonlight', 'starlight', 'daylight', 'sunset light', 'golden hour'],
      'Artificial': ['neon lights', 'street lights', 'candlelight', 'lamplight', 'fluorescent light', 'spotlight', 'stage lighting', 'screen light'],
    },
    'Direction': {
      'Placement': ['backlighting', 'front lighting', 'side lighting', 'top lighting', 'underlighting', 'rim lighting', 'hair light'],
    },
    'Quality': {
      'Softness': ['soft lighting', 'hard lighting', 'diffused light', 'soft shadows', 'hard shadows', 'dramatic lighting', 'cinematic lighting', 'studio lighting'],
    },
    'Effects': {
      'Atmosphere': ['volumetric lighting', 'god rays', 'light rays', 'light shafts', 'glow', 'bloom', 'lens flare', 'ambient light', 'colored lighting'],
      'Particles': ['dust particles', 'floating particles', 'sparkles', 'fireflies', 'smoke', 'steam', 'haze', 'fog'],
    },
  }),

  section('color', 'Color, palette & mood', 'Palette, contrast, saturation and emotional color language.', {}, {
    'Palette': {
      'Basic': ['monochrome', 'limited palette', 'pastel colors', 'vibrant colors', 'muted colors', 'earth tones', 'neon colors', 'duotone'],
      'Warm': ['warm palette', 'red theme', 'orange theme', 'yellow theme', 'golden palette'],
      'Cool': ['cool palette', 'blue theme', 'cyan theme', 'green theme', 'purple theme'],
      'Pink': ['pink theme', 'rose palette', 'magenta palette'],
    },
    'Contrast': {
      'Range': ['high contrast', 'low contrast', 'strong contrast', 'soft contrast', 'black and white', 'dark theme', 'bright theme'],
    },
    'Mood': {
      'Calm': ['serene', 'dreamy', 'peaceful atmosphere', 'quiet atmosphere', 'cozy atmosphere', 'nostalgic'],
      'Dramatic': ['dramatic atmosphere', 'mysterious atmosphere', 'ominous atmosphere', 'melancholic atmosphere', 'tense atmosphere'],
      'Energetic': ['energetic atmosphere', 'joyful atmosphere', 'festive atmosphere', 'romantic atmosphere', 'playful atmosphere'],
    },
  }),

  section('style', 'Rendering, medium & style', 'Rendering language, linework, medium and visual finish.', {}, {
    'Anime': {
      'Rendering': ['anime coloring', 'cel shading', 'flat color', 'soft shading', 'detailed shading', 'gradient shading', 'rim shading'],
      'Linework': ['lineart', 'clean lineart', 'sharp lines', 'thin lines', 'thick lines', 'colored lineart', 'sketch lines'],
    },
    'Illustration': {
      'Medium': ['illustration', 'digital painting', 'concept art', 'comic', 'manga', 'ink drawing', 'watercolor', 'gouache', 'oil painting', 'painterly'],
    },
    'Texture': {
      'Finish': ['textured', 'paper texture', 'canvas texture', 'grain', 'film grain', 'rough brushwork', 'smooth rendering'],
    },
    'Detail': {
      'Density': ['highly detailed', 'intricate details', 'fine details', 'micro details', 'simple details', 'minimalist'],
    },
    'Realism': {
      'Treatment': ['realistic lighting', 'semi-realistic', 'stylized', 'photorealistic', 'cinematic realism', 'graphic style'],
    },
  }),

  section('details', 'Materials, surfaces & scene details', 'Fine environmental, fabric, surface and material cues.', {}, {
    'Architecture': {
      'Surfaces': ['brick wall', 'concrete', 'marble', 'stone', 'wood', 'wood grain', 'tile', 'glass', 'metal', 'rust'],
      'Features': ['window', 'curtains', 'door', 'stairs', 'railing', 'balcony', 'bookshelf', 'floorboards'],
    },
    'Nature details': {
      'Plants': ['plants', 'flowers', 'roses', 'sunflowers', 'lilies', 'vines', 'moss', 'grass', 'leaves', 'petals'],
      'Water': ['water droplets', 'raindrops', 'wet pavement', 'puddle', 'ripples', 'splash', 'reflection'],
    },
    'Fabric': {
      'Texture': ['fabric texture', 'lace', 'silk', 'satin', 'velvet', 'denim', 'leather', 'wool', 'cotton', 'mesh', 'embroidery'],
    },
    'Objects': {
      'Interior': ['table', 'chair', 'desk', 'lamp', 'candles', 'books', 'clock', 'mirror', 'vase', 'picture frame'],
      'Decor': ['ornaments', 'statue', 'painting', 'poster', 'signage', 'neon sign', 'banners', 'flowers'],
    },
  }),

  section('objects', 'Props, vehicles & scene objects', 'Concrete objects that give the scene an actionable context.', {}, {
    'Everyday': {
      'Personal': ['phone', 'smartphone', 'camera', 'headphones', 'book', 'notebook', 'pen', 'umbrella', 'cup', 'bottle', 'wallet', 'keys'],
      'Furniture': ['chair', 'sofa', 'bed', 'desk', 'table', 'bench', 'bookshelf', 'piano'],
    },
    'Food': {
      'Meals': ['coffee', 'tea', 'cake', 'bread', 'fruit', 'ice cream', 'ramen', 'pizza', 'lunch', 'dinner'],
    },
    'Vehicles': {
      'Road': ['car', 'sports car', 'motorcycle', 'bicycle', 'bus', 'taxi', 'truck'],
      'Rail & air': ['train', 'subway train', 'tram', 'airplane', 'helicopter', 'spaceship'],
      'Water': ['boat', 'ship', 'sailboat', 'yacht'],
    },
    'Weapons & tools': {
      'Fantasy': ['sword', 'katana', 'spear', 'bow', 'staff', 'magic wand', 'shield', 'dagger'],
      'Tools': ['hammer', 'wrench', 'scissors', 'brush', 'microphone'],
    },
  }),

  section('creature', 'Creature & fantasy anatomy', 'Non-human anatomy, species traits and creature design components.', {}, {
    'Mammal': {
      'Traits': ['animal ears', 'animal tail', 'fur', 'paws', 'whiskers', 'fangs', 'claws', 'snout', 'fluffy tail'],
    },
    'Bird': {
      'Traits': ['bird wings', 'feathers', 'beak', 'talons', 'bird tail', 'crest', 'flight'],
    },
    'Reptile': {
      'Traits': ['scales', 'reptile tail', 'dragon wings', 'horns', 'claws', 'slit pupils', 'serpentine body'],
    },
    'Aquatic': {
      'Traits': ['fins', 'gills', 'webbed hands', 'webbed feet', 'fish tail', 'mermaid tail', 'tentacles', 'aquatic creature'],
    },
    'Fantasy': {
      'Traits': ['angel', 'demon', 'fairy', 'elf', 'vampire', 'werewolf', 'dragon', 'ghost', 'spirit', 'monster'],
    },
    'Mechanical': {
      'Traits': ['robot', 'android', 'cyborg', 'mechanical limbs', 'mechanical wings', 'robotic eyes', 'armor plating'],
    },
  }),

  section('effects', 'Special effects & visual phenomena', 'Magic, particles, motion and visual phenomena.', {}, {
    'Magic': {
      'Energy': ['magic', 'magical energy', 'magic circle', 'glowing aura', 'energy beam', 'energy field', 'spellcasting', 'summoning'],
      'Elements': ['fire magic', 'water magic', 'ice magic', 'wind magic', 'lightning magic', 'earth magic', 'dark magic', 'holy magic'],
    },
    'Motion': {
      'Dynamics': ['motion blur', 'speed lines', 'afterimage', 'flying debris', 'wind effect', 'hair in motion', 'cloth in motion'],
    },
    'Particles': {
      'Ambient': ['sparkles', 'glitter', 'dust', 'smoke', 'steam', 'mist', 'snowflakes', 'petals', 'leaves', 'fireflies'],
    },
    'Optical': {
      'Camera': ['lens flare', 'bloom', 'chromatic aberration', 'light leak', 'film grain', 'vignette', 'depth haze'],
    },
  }),

  section('negative-quality', 'Negative quality & artifacts', 'Negative tags for common generation defects and image artifacts.', {}, {
    'Quality': {
      'Low quality': ['worst quality', 'low quality', 'lowres', 'bad quality', 'poor quality', 'unfinished'],
      'Image defects': ['blurry', 'out of focus', 'jpeg artifacts', 'compression artifacts', 'aliasing', 'moire', 'noise', 'grainy', 'pixelated', 'oversaturated', 'underexposed', 'overexposed'],
    },
    'Anatomy': {
      'Body': ['bad anatomy', 'bad proportions', 'deformed', 'distorted body', 'disfigured', 'extra limbs', 'missing limbs', 'fused limbs', 'malformed body'],
      'Hands': ['bad hands', 'extra fingers', 'missing fingers', 'fused fingers', 'deformed fingers', 'extra hands', 'missing hands', 'bad arms', 'bad feet'],
      'Face': ['distorted face', 'deformed face', 'bad face', 'asymmetrical face', 'bad eyes', 'cross-eyed', 'misaligned eyes', 'bad mouth'],
    },
    'Image cleanup': {
      'Overlay': ['watermark', 'signature', 'text', 'logo', 'username', 'copyright text', 'timestamp', 'border', 'frame'],
      'Composition': ['cropped', 'out of frame', 'cut off', 'duplicate', 'cloned', 'tiling', 'split screen'],
    },
  }),

  section('negative-structure', 'Negative structure & unwanted content', 'Negative structure controls for unwanted layouts, objects, subjects and visual noise.', {}, {
    'Layout': {
      'Panels': ['multiple views', 'split screen', 'contact sheet', 'comic panel', 'multiple panels', 'collage', 'storyboard'],
      'Framing': ['bad framing', 'bad perspective', 'awkward composition', 'empty background', 'messy background'],
    },
    'Subjects': {
      'Unwanted': ['extra character', 'duplicate character', 'background character', 'unwanted person', 'unwanted object', 'floating object', 'extra animal'],
    },
    'Anatomy': {
      'Problems': ['poorly drawn face', 'poorly drawn hands', 'poorly drawn feet', 'bad proportions', 'long neck', 'broken limbs', 'twisted limbs'],
    },
    'Text': {
      'Unwanted': ['speech bubble', 'caption', 'subtitle', 'sign text', 'illegible text', 'gibberish text', 'watermark', 'logo'],
    },
  }),
];

export const PROMPT_BUILDER_TAG_COUNT = SECTIONS.reduce((sum, s) => sum + s.tags.length, 0);
