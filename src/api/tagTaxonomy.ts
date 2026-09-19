// Shared taxonomy. danbooru.csv is the source of truth for the complete tag set/counts.
// danbooru_categories.json supplies Danbooru wiki-group information.
// customTagDatabase.ts is only a small manual semantic override layer.
import { CUSTOM_CATEGORIES } from './customTagDatabase';

export interface CategoryPath { parent: string; sub: string; subSub?: string }
export interface TagRecord {
  tag: string; normalizedTag: string; postCount: number | null;
  nativeCategory: string; nativeCategoryCode: string; wikiCategory: string | null;
  uiCategory: string; uiSubCategory: string; uiSubSubCategory: string | null;
  description: string | null; isMeaningless: boolean;
}

export const PROMPT_FLOW_MAPPING: Record<string,string[]> = {
  '1. Subject & Count':['Character Count','People','Groups','Family Relationships','Gender Nonconformity','Transgender','Jobs'],
  '2. Characters & Series':[],
  '3. Animals & Creatures':['Felines & Big Cats','Canines, Wolves & Foxes','Equines & Farm Mammals','Rodents & Small Mammals','Bears & Wild Mammals','Birds & Winged Animals','Aquatic & Marine Life','Reptiles & Amphibians','Insects & Arthropods','Mythical Beasts & Dragons','Monsters & Fantasy Entities'],
  '4. Face & Hair':['Face Tags','Eyes Tags','Hair Styles','Hair Color','Hair','Ears Tags','Makeup'],
  '5. Body & Physiology':['Breasts Tags','Body Parts','Shoulders','Hands','Feet','Ass','Pussy','Skin Color','Wings','Covering','Nudity'],
  '6. Wardrobe & Outfit':['Attire','Neck And Neckwear','Headwear','Eyewear','Handwear','Legwear','Sleeves','Accessories','Fashion Style','Sexual Attire','Prints'],
  '7. Pose & Action':['Posture','Gestures','Holding Tags','Verbs And Gerunds','Dances','Sports'],
  '8. Props & Weapons':['Sex Objects','Technology','Audio Tags','Food Tags','Cards','Board Games'],
  '9. Environment & Setting':['Locations','Real World Locations','Backgrounds','Doors And Gates','Flowers','Water','Fire','Holidays And Celebrations'],
  '10. Camera & Composition':['Image Composition','Focus Tags','Artistic License','Lighting','Colors','Patterns'],
  '11. Style & Aesthetics':['Visual Aesthetic','Fine Art Parody','Drawing Software','Pixiv Projects','Video Game','Role-Playing Games','Fighting Games','Visual Novel Games','Shooter Games','Platform Games'],
  '12. Artists':[],
  '13. Themes, Lore & Adult':['Symbols','Text','Phrases','Japanese Dialects','Year Tags','Sex Acts','Sexual Positions','Bdsm And Torture','Censorship','Simulated Sex Acts','Companies And Brand Names','History','Theme','Subjective','Metatags','General Concepts (50k+)','General Concepts (10k+)','General Concepts (<10k)','General Concepts (Other)']
};

export const DANBOORU_WIKI_GROUPS: Record<string,string[]> = {
  'Quality & Meta':['Metatags'],
  'Attire & Clothing':['Attire','Neck And Neckwear','Accessories','Headwear','Eyewear','Handwear','Fashion Style','Sleeves','Legwear','Prints','Sexual Attire'],
  'Face & Hair':['Face Tags','Eyes Tags','Hair Styles','Hair','Makeup','Ears Tags','Hair Color'],
  'Body & Anatomy':['Breasts Tags','Body Parts','Hands','Wings','Shoulders','Feet','Ass','Pussy','Skin Color','Covering'],
  'Poses & Actions':['Holding Tags','Verbs And Gerunds','Posture','Gestures','Dances','Sports'],
  'Composition & Style':['Image Composition','Artistic License','Lighting','Colors','Visual Aesthetic','Focus Tags','Patterns'],
  'Locations & Scenery':['Locations','Real World Locations','Backgrounds','Doors And Gates','Water','Fire'],
  'Animals & Nature':['Felines & Big Cats','Canines, Wolves & Foxes','Equines & Farm Mammals','Rodents & Small Mammals','Bears & Wild Mammals','Birds & Winged Animals','Aquatic & Marine Life','Reptiles & Amphibians','Insects & Arthropods','Mythical Beasts & Dragons','Monsters & Fantasy Entities','Flowers'],
  'Food & Beverage':['Food Tags'],
  'Sex & Erotica':['Sex Acts','Sex Objects','Sexual Positions','Bdsm And Torture','Nudity','Censorship','Simulated Sex Acts'],
  'Video Games':['Role-Playing Games','Visual Novel Games','Fighting Games','Shooter Games','Platform Games','Video Game'],
  'Text & Lore':['Symbols','Text','Phrases','Japanese Dialects','Year Tags'],
  'Audio & Music':['Audio Tags'],
  'Society & Culture':['Companies And Brand Names','Holidays And Celebrations','Jobs','History','Cards','Board Games','Drawing Software','Technology','Pixiv Projects','Fine Art Parody','Theme','Subjective'],
  'Native Categories':['General','Artist','Character','Copyright','Meta']
};

export const PURE_CREATURE_SUBCATS: Record<string,string[]> = {
  'Felines & Big Cats':['cat','kitten','lion','tiger','leopard','cheetah','panther','jaguar','lynx','cougar'],
  'Canines, Wolves & Foxes':['dog','puppy','hound','canine','wolf','fox','coyote','jackal','dingo','hyena'],
  'Equines & Farm Mammals':['horse','stallion','mare','foal','pony','donkey','mule','zebra','cow','bull','calf','sheep','goat','pig','deer','elk','moose','camel','llama','alpaca'],
  'Rodents & Small Mammals':['rabbit','bunny','hare','mouse','rat','hamster','guinea_pig','gerbil','squirrel','chipmunk','ferret','weasel','otter','badger','raccoon','tanuki','hedgehog','bat'],
  'Bears & Wild Mammals':['bear','polar_bear','grizzly','panda','red_panda','elephant','rhino','hippo','giraffe','monkey','ape','gorilla','chimpanzee','lemur','kangaroo','koala'],
  'Birds & Winged Animals':['bird','avian','chick','chicken','rooster','hen','duck','goose','swan','crow','raven','pigeon','dove','sparrow','owl','eagle','hawk','falcon','penguin','flamingo','parrot'],
  'Aquatic & Marine Life':['fish','shark','whale','dolphin','orca','seal','walrus','octopus','squid','jellyfish','crab','lobster','shrimp','eel','manta_ray','stingray','starfish','seahorse'],
  'Reptiles & Amphibians':['snake','serpent','python','viper','cobra','lizard','gecko','chameleon','iguana','turtle','tortoise','crocodile','alligator','frog','toad','salamander','axolotl','newt','dinosaur'],
  'Insects & Arthropods':['insect','bug','butterfly','moth','caterpillar','bee','wasp','hornet','ant','beetle','ladybug','dragonfly','grasshopper','cricket','mantis','spider','scorpion','centipede','snail','slug','worm'],
  'Mythical Beasts & Dragons':['dragon','wyvern','drake','hydra','phoenix','griffin','gryphon','hippogriff','pegasus','unicorn','cerberus','chimera','basilisk','kraken','leviathan','behemoth','fenrir','gargoyle'],
  'Monsters & Fantasy Entities':['monster','creature','demon','devil','angel','ghost','spirit','undead','zombie','skeleton','vampire','werewolf','slime','golem','goblin','orc','troll','ogre','mimic','youkai','oni','tengu','kappa','harpy','centaur','lamia','mermaid','merman','succubus','incubus','elemental']
};

const MANUAL = new Map<string,CategoryPath>();
for(const [parent,subs] of Object.entries(CUSTOM_CATEGORIES)) for(const [sub,tags] of Object.entries(subs)) for(const tag of tags) MANUAL.set(normalizeTag(tag),{parent,sub});
const LEXICAL:Array<{parent:string;sub:string;words:string[]}>= [
 {parent:'1. Subject & Count',sub:'People',words:['girl','boy','woman','man','male','female','chibi','solo','couple','elf','angel','demon','vampire','maid','witch','princess','queen','knight','samurai','ninja','vtuber','femboy','trap']},
 {parent:'4. Face & Hair',sub:'Hair Styles',words:['hair','bangs','ponytail','braid','twintails','ahoge','bun','bob']},
 {parent:'4. Face & Hair',sub:'Eyes Tags',words:['eyes','pupil','sclera','iris','wink']},
 {parent:'4. Face & Hair',sub:'Face Tags',words:['smile','grin','smirk','pout','frown','mouth','lips','teeth','fang','tongue','blush','freckles','mole','tears']},
 {parent:'5. Body & Physiology',sub:'Breasts Tags',words:['breast','breasts','cleavage','nipple','underboob','sideboob']},
 {parent:'5. Body & Physiology',sub:'Body Parts',words:['arm','hand','finger','leg','thigh','knee','foot','feet','toe','navel','belly','waist','hips','back','collarbone']},
 {parent:'5. Body & Physiology',sub:'Wings',words:['wing','wings']},
 {parent:'6. Wardrobe & Outfit',sub:'Attire',words:['shirt','blouse','top','sweater','hoodie','skirt','pants','shorts','jeans','dress','robe','kimono','yukata','jacket','coat','cape','cloak','uniform','costume']},
 {parent:'6. Wardrobe & Outfit',sub:'Headwear',words:['hat','cap','beret','beanie','helmet','tiara','crown','headband','veil']},
 {parent:'6. Wardrobe & Outfit',sub:'Eyewear',words:['glasses','sunglasses','eyepatch','mask']},
 {parent:'6. Wardrobe & Outfit',sub:'Legwear',words:['socks','thighhighs','pantyhose','stockings']},
 {parent:'6. Wardrobe & Outfit',sub:'Accessories',words:['jewelry','necklace','earrings','bracelet','ring','belt','ribbon','bow']},
 {parent:'7. Pose & Action',sub:'Posture',words:['standing','sitting','lying','kneeling','squatting','leaning','floating','flying','falling','jumping','walking','running']},
 {parent:'7. Pose & Action',sub:'Gestures',words:['pointing','reaching','touching','grabbing','waving','peace','salute']},
 {parent:'7. Pose & Action',sub:'Verbs And Gerunds',words:['eating','drinking','reading','writing','sleeping','cooking','fighting','swimming','dancing']},
 {parent:'8. Props & Weapons',sub:'Technology',words:['phone','smartphone','camera','computer','laptop','robot','mecha','machine']},
 {parent:'8. Props & Weapons',sub:'Audio Tags',words:['guitar','piano','microphone','speaker','music']},
 {parent:'8. Props & Weapons',sub:'Food Tags',words:['food','cake','candy','coffee','tea','fruit','meal']},
 {parent:'9. Environment & Setting',sub:'Locations',words:['room','indoor','bedroom','classroom','kitchen','office','cafe','city','street','building','castle','shrine','temple']},
 {parent:'9. Environment & Setting',sub:'Backgrounds',words:['background','landscape','scenery','sky','cloud','forest','mountain','beach','garden']},
 {parent:'9. Environment & Setting',sub:'Water',words:['water','ocean','sea','lake','river','pool']},
 {parent:'9. Environment & Setting',sub:'Fire',words:['fire','flame','flames','smoke']},
 {parent:'10. Camera & Composition',sub:'Image Composition',words:['portrait','upper_body','full_body','close_up','cowboy_shot','profile','cropped','framed']},
 {parent:'10. Camera & Composition',sub:'Focus Tags',words:['focus','depth_of_field','bokeh','blur','blurry_background']},
 {parent:'10. Camera & Composition',sub:'Lighting',words:['lighting','sunlight','moonlight','shadow','silhouette','glow']},
 {parent:'10. Camera & Composition',sub:'Colors',words:['monochrome','greyscale','colorful','multicolored','rainbow']},
 {parent:'11. Style & Aesthetics',sub:'Visual Aesthetic',words:['masterpiece','best_quality','high_quality','absurdres','cinematic','retro','cyberpunk','fantasy','surreal','vintage']},
 {parent:'13. Themes, Lore & Adult',sub:'Sex Acts',words:['sex','sexual','penetration','masturbation','oral']}
];

export function normalizeTag(tag:string){return tag.trim().toLowerCase().replace(/\s+/g,'_')}
function alpha(tag:string){const c=(tag[0]||'#').toUpperCase();if(c>='A'&&c<='C')return'A-C';if(c>='D'&&c<='F')return'D-F';if(c>='G'&&c<='I')return'G-I';if(c>='J'&&c<='L')return'J-L';if(c>='M'&&c<='O')return'M-O';if(c>='P'&&c<='R')return'P-R';if(c>='S'&&c<='U')return'S-U';if(c>='V'&&c<='Z')return'V-Z';return'0-9 & Other'}
function matches(tag:string,word:string){return tag===word||tag.split('_').includes(word)||tag.startsWith(word+'_')||tag.endsWith('_'+word)}
export function getManualOverride(tag:string){return MANUAL.get(normalizeTag(tag))||null}
export function classifyPromptFlowTag(tag:string,native:string,code:string,wiki:string|null,count:number|null):CategoryPath{
 const manual=getManualOverride(tag);if(manual)return manual;
 if(native==='Artist')return{parent:'12. Artists',sub:alpha(tag)};
 if(native==='Copyright')return{parent:'2. Characters & Series',sub:`Series (${alpha(tag)})`};
 if(native==='Character'){const m=tag.match(/\(([^)]+)\)$/);return{parent:'2. Characters & Series',sub:m?m[1].replace(/_/g,' '):`Characters (${alpha(tag)})`};}
 const t=normalizeTag(tag);
 for(const [sub,words] of Object.entries(PURE_CREATURE_SUBCATS))if(code!=='3'&&words.some(w=>matches(t,w)))return{parent:'3. Animals & Creatures',sub};
 if(wiki)for(const [parent,subs] of Object.entries(PROMPT_FLOW_MAPPING))if(subs.includes(wiki))return{parent,sub:wiki};
 for(const r of LEXICAL)if(r.words.some(w=>matches(t,w)))return{parent:r.parent,sub:r.sub};
 if((count??0)>=50000)return{parent:'13. Themes, Lore & Adult',sub:'General Concepts (50k+)'};
 if((count??0)>=10000)return{parent:'13. Themes, Lore & Adult',sub:'General Concepts (10k+)'};
 if(count!==null)return{parent:'13. Themes, Lore & Adult',sub:'General Concepts (<10k)'};
 return{parent:'13. Themes, Lore & Adult',sub:'General Concepts (Other)'};
}
export function buildPromptFlowHierarchy(records:TagRecord[]){const h:Record<string,Record<string,string[]>>={};for(const p of Object.keys(PROMPT_FLOW_MAPPING))h[p]={};for(const r of records){h[r.uiCategory]??={};h[r.uiCategory][r.uiSubCategory]??=[];h[r.uiCategory][r.uiSubCategory].push(r.tag)}for(const p of Object.keys(h))for(const s of Object.keys(h[p]))h[p][s].sort((a,b)=>a.localeCompare(b));return h}
export function buildWikiGroupHierarchy(records:TagRecord[],wikiToParent:Map<string,string>){const h:Record<string,Record<string,string[]>>={};for(const p of Object.keys(DANBOORU_WIKI_GROUPS)){h[p]={};for(const s of DANBOORU_WIKI_GROUPS[p])h[p][s]=[]}for(const r of records){if(r.wikiCategory&&wikiToParent.has(r.wikiCategory)){const p=wikiToParent.get(r.wikiCategory)!;h[p][r.wikiCategory].push(r.tag)}else{h['Native Categories'][r.nativeCategory]??=[];h['Native Categories'][r.nativeCategory].push(r.tag)}}for(const p of Object.keys(h))for(const s of Object.keys(h[p]))h[p][s].sort((a,b)=>a.localeCompare(b));return h}
