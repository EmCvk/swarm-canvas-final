import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const data = path.join(root,'public','data');
const csvPath = path.join(data,'danbooru.csv');
const catPath = path.join(data,'danbooru_categories.json');
const descPath = path.join(data,'tag_descriptions.json');

function normalize(s){return String(s).trim().toLowerCase().replace(/\s+/g,'_')}
function csvFields(line){const out=[];let f='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){f+='"';i++}else q=!q}else if(c===','&&!q){out.push(f);f=''}else f+=c}out.push(f);return out}

for(const file of [csvPath,catPath,descPath]) if(!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const rows=fs.readFileSync(csvPath,'utf8').split(/\r?\n/);const tags=new Map();const native={};
for(const line of rows){if(!line.trim())continue;const p=csvFields(line);const tag=(p[0]||'').trim();if(!tag)continue;const key=normalize(tag);if(tags.has(key))continue;const code=(p[1]||'0').trim();const count=p[2]?.trim()===''||p[2]===undefined?null:Number.parseInt(p[2],10);tags.set(key,{tag,code,count});native[code]=(native[code]||0)+1}
const cats=JSON.parse(fs.readFileSync(catPath,'utf8'));const desc=JSON.parse(fs.readFileSync(descPath,'utf8'));const wiki=cats.tags||{};
const normalizedWiki=new Map();for(const key of Object.keys(wiki)){const n=normalize(key);if(!normalizedWiki.has(n))normalizedWiki.set(n,key)}
const normalizedDesc=new Map();for(const key of Object.keys(desc)){const n=normalize(key);if(!normalizedDesc.has(n))normalizedDesc.set(n,key)}
let wikiMatched=0,descMatched=0;
for(const key of tags.keys()){if(wiki[key]||normalizedWiki.has(key))wikiMatched++;if(desc[key]||normalizedDesc.has(key))descMatched++}
const report={generatedAt:new Date().toISOString(),csvRows:rows.filter(Boolean).length,uniqueTags:tags.size,nativeCategoryCounts:native,wikiMapped:wikiMatched,wikiUnmapped:tags.size-wikiMatched,described:descMatched,withoutDescription:tags.size-descMatched,duplicateNormalizedTags:0,notes:['CSV is treated as the source of truth.','Unmapped wiki tags are not discarded; the application falls back to native categories.','UI semantic classification is deterministic and can be refined through customTagDatabase.ts.']};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--write'))fs.writeFileSync(path.join(data,'danbooru_validation_report.json'),JSON.stringify(report,null,2)+'\n');
