import React, { useEffect, useMemo, useState } from 'react';
import { Film, Loader2, Play, RefreshCw, Upload } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

type Engine = 'AnimateDiff' | 'Custom';
type Asset = { url: string; name: string; video: boolean };
const KEY = 'swarm-animation-lab-v3';
const STARTER = '/workflows/animationlab_animatediff_img2vid_api.json';
const clean = (v:string) => v.trim().replace(/\/$/, '');

function load() {
  try { return { engine:'AnimateDiff' as Engine, comfyUrl:'http://127.0.0.1:8188', frames:8, fps:8, width:384, height:512, steps:16, cfg:5, denoise:0.65, seed:-1, prompt:'', negative:'worst quality, low quality, flicker, unstable face, deformed hands', workflow:'' , ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { engine:'AnimateDiff' as Engine, comfyUrl:'http://127.0.0.1:8188', frames:8, fps:8, width:384, height:512, steps:16, cfg:5, denoise:0.65, seed:-1, prompt:'', negative:'worst quality, low quality, flicker, unstable face, deformed hands', workflow:'' }; }
}
function replaceTokens(v:any, s:any, source:string):any {
  if (typeof v === 'string') return v.replace(/__PROMPT__/g,s.prompt).replace(/__NEGATIVE__/g,s.negative).replace(/__SEED__/g,String(s.seed)).replace(/__WIDTH__/g,String(s.width)).replace(/__HEIGHT__/g,String(s.height)).replace(/__FRAMES__/g,String(s.frames)).replace(/__FPS__/g,String(s.fps)).replace(/__DENOISE__/g,String(s.denoise)).replace(/__SOURCE_IMAGE__/g,source);
  if (Array.isArray(v)) return v.map(x=>replaceTokens(x,s,source));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replaceTokens(x,s,source)]));
  return v;
}
function outputs(job:any, base:string):Asset[] {
  const out:any[] = [];
  for (const node of Object.values(job?.outputs || {}) as any[]) for (const f of [...(node?.images||[]), ...(node?.gifs||[]), ...(node?.videos||[])]) {
    if (!f?.filename) continue;
    const q = new URLSearchParams({filename:String(f.filename),subfolder:String(f.subfolder||''),type:String(f.type||'output')});
    const name=String(f.filename), video=/\.(mp4|webm|mov|avi|mkv)$/i.test(name);
    out.push({url:`${base}/view?${q}`,name,video});
  }
  return out;
}
const input='w-full rounded-md border border-[#303541] bg-[#151820] px-2.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-400/70';
export const AnimationLab:React.FC=()=>{
  const store:any=useAppStore();
  const [s,setS]=useState<any>(load);
  const [source,setSource]=useState<string|null>(null);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [selected,setSelected]=useState<Asset|null>(null);
  const [status,setStatus]=useState('Ready. Load the starter workflow, select an image, then generate.');
  const [busy,setBusy]=useState(false);
  const active=source || store.activeImage || store.history?.[0]?.imageUrl || null;
  useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(s));},[s]);
  useEffect(()=>setS((x:any)=>({...x,prompt:x.prompt||store.prompt||'',negative:x.negative||store.negativePrompt||x.negative})),[store.prompt,store.negativePrompt]);
  const thumbs=useMemo(()=>[store.activeImage,...(store.history||[]).map((x:any)=>x.imageUrl)].filter(Boolean).filter((x:any,i:number,a:any[])=>a.indexOf(x)===i).slice(0,10),[store.activeImage,store.history]);
  const upd=(k:string,v:any)=>setS((x:any)=>({...x,[k]:v}));
  const loadStarter=async()=>{try{const r=await fetch(STARTER);if(!r.ok)throw new Error('Starter workflow file is missing.');upd('workflow',await r.text());setStatus('Starter AnimateDiff workflow loaded. Change checkpoint and motion-model filenames if your ComfyUI uses different names.');}catch(e:any){setStatus(e.message);}};
  const test=async()=>{setStatus('Checking ComfyUI…');try{const r=await fetch(clean(s.comfyUrl)+'/system_stats');if(!r.ok)throw new Error('HTTP '+r.status);setStatus('ComfyUI is reachable.');}catch(e:any){setStatus('Connection failed: '+e.message);}};
  const pick=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setSource(String(r.result));r.readAsDataURL(f);};
  const generate=async()=>{
    if(!active){setStatus('Select or generate a source image first.');return;}
    if(!s.workflow.trim()){await loadStarter();setStatus('Starter loaded. Click Generate Animation again.');return;}
    setBusy(true);setAssets([]);setSelected(null);
    try{
      setStatus('Uploading source image to ComfyUI…');
      const blob=await fetch(active).then(r=>{if(!r.ok)throw new Error('Cannot read source image.');return r.blob();});
      const form=new FormData();form.append('image',new File([blob],'animationlab_source.png',{type:blob.type||'image/png'}));form.append('type','input');form.append('overwrite','true');
      const up=await fetch(clean(s.comfyUrl)+'/upload/image',{method:'POST',body:form});const u=await up.json();if(!up.ok||!u.name)throw new Error(u?.error?.message||'Upload failed.');
      const sourceName=u.subfolder?`${u.subfolder}/${u.name}`:u.name;
      setStatus('Queueing animation…');
      let parsed:any;try{parsed=JSON.parse(s.workflow);}catch{throw new Error('Workflow JSON is invalid.');}
      const prepared=replaceTokens(parsed,s,sourceName);const prompt=prepared?.prompt||prepared;
      const q=await fetch(clean(s.comfyUrl)+'/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,client_id:crypto.randomUUID()})});
      const data=await q.json();if(!q.ok||!data.prompt_id)throw new Error(data?.error?.message||data?.error||'ComfyUI did not return a prompt id.');
      const id=data.prompt_id, deadline=Date.now()+600000;
      while(Date.now()<deadline){setStatus('Rendering in ComfyUI…');await new Promise(r=>setTimeout(r,1800));const h=await fetch(clean(s.comfyUrl)+'/history/'+encodeURIComponent(id));if(!h.ok)continue;const all=await h.json();const job=all[id];const found=outputs(job,clean(s.comfyUrl));if(found.length){setAssets(found);setSelected(found[0]);setStatus(`Done. ${found.length} output(s) ready.`);return;}if(job?.status?.status_str==='error')throw new Error('ComfyUI workflow failed. Check the ComfyUI console for the node error.');}
      throw new Error('Timed out waiting for ComfyUI.');
    }catch(e:any){setStatus(e.message||'Generation failed.');}finally{setBusy(false);}
  };
  return <div className="sc-animation-lab h-full w-full min-h-0 flex flex-col">
    <div className="h-12 shrink-0 px-4 flex items-center justify-between border-b border-[#252933] bg-[#101218]">
      <div className="flex items-center gap-2"><Film className="w-4 h-4 text-cyan-300"/><div><div className="text-sm font-semibold">Animation Lab</div><div className="text-[10px] text-zinc-500">Still image → AnimateDiff / ComfyUI</div></div></div>
      <div className="flex gap-2"><button onClick={loadStarter} className="px-2.5 py-1.5 rounded border border-[#303541] text-xs">Load starter</button><button onClick={test} className="px-2.5 py-1.5 rounded border border-cyan-500/30 text-cyan-300 text-xs">Test ComfyUI</button><button disabled={busy} onClick={generate} className="px-3 py-1.5 rounded bg-cyan-400 text-zinc-950 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">{busy?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Play className="w-3.5 h-3.5"/>}{busy?'Rendering…':'Generate Animation'}</button></div>
    </div>
    <div className="min-h-0 flex-1 grid grid-cols-[minmax(300px,1fr)_370px]">
      <div className="min-h-0 flex flex-col border-r border-[#252933]">
        <div className="min-h-0 flex-1 flex items-center justify-center p-5 bg-[radial-gradient(circle_at_center,#151923,#090a0d_70%)]">{selected?selected.video?<video src={selected.url} controls autoPlay loop className="max-h-full max-w-full rounded-lg border border-[#303541]"/>:<img src={selected.url} className="max-h-full max-w-full object-contain rounded-lg border border-[#303541]"/>:active?<img src={active} className="max-h-full max-w-full object-contain rounded-lg border border-[#303541]"/>:<div className="text-zinc-600 text-center">Generate an image in Canvas or upload one.</div>}</div>
        <div className="shrink-0 flex gap-2 overflow-x-auto p-3 border-t border-[#252933]">{thumbs.map((x:any,i:number)=><button key={i} onClick={()=>{setSource(x);setSelected(null)}} className="w-12 h-12 shrink-0 overflow-hidden rounded border border-[#303541]"><img src={x} className="w-full h-full object-cover"/></button>)}<label className="w-12 h-12 shrink-0 rounded border border-dashed border-[#3a3f4c] flex items-center justify-center cursor-pointer"><Upload className="w-4 h-4 text-zinc-500"/><input className="hidden" type="file" accept="image/*" onChange={pick}/></label></div>
        {assets.length>1&&<div className="shrink-0 flex gap-2 overflow-x-auto p-2 border-t border-[#252933]">{assets.map(a=><button key={a.url} onClick={()=>setSelected(a)} className="text-[10px] px-2 py-1 rounded border border-[#303541]">{a.name}</button>)}</div>}
      </div>
      <div className="min-h-0 overflow-y-auto p-4 space-y-4">
        <section className="p-3 rounded-lg border border-[#2a2e38] bg-[#101218] space-y-3"><div className="text-xs font-semibold">Quick Start</div><div className="text-[11px] text-zinc-500 leading-5">1. Start ComfyUI. 2. Click Load starter. 3. Select an Anima image. 4. Test ComfyUI. 5. Generate. The source image is uploaded automatically.</div></section>
        <section className="p-3 rounded-lg border border-[#2a2e38] bg-[#101218] space-y-3"><div className="text-xs font-semibold">Connection & Preset</div><input className={input} value={s.comfyUrl} onChange={e=>upd('comfyUrl',e.target.value)}/><div className="grid grid-cols-2 gap-2">{[['width','Width'],['height','Height'],['frames','Frames'],['fps','FPS'],['steps','Steps'],['cfg','CFG'],['denoise','Denoise'],['seed','Seed']].map(([k,l])=><label key={k} className="text-[10px] text-zinc-500">{l}<input className={input+' mt-1'} type="number" step={k==='denoise'||k==='cfg'?0.05:1} value={s[k]} onChange={e=>upd(k,Number(e.target.value))}/></label>)}</div><div className="text-[10px] text-amber-300/70">4 GB VRAM preset: 384×512, 8 frames, 16 steps, CFG 5, denoise 0.65.</div></section>
        <section className="p-3 rounded-lg border border-[#2a2e38] bg-[#101218] space-y-2"><div className="text-xs font-semibold">Motion Prompt</div><textarea rows={4} className={input} value={s.prompt} onChange={e=>upd('prompt',e.target.value)} placeholder="subtle blinking, gentle breathing, slight head movement, hair moving in a light breeze, slow camera drift"/><textarea rows={3} className={input} value={s.negative} onChange={e=>upd('negative',e.target.value)}/><button onClick={()=>setS((x:any)=>({...x,prompt:store.prompt||x.prompt,negative:store.negativePrompt||x.negative}))} className="text-[10px] text-cyan-300">Sync prompts from Canvas</button></section>
        <section className="p-3 rounded-lg border border-[#2a2e38] bg-[#101218] space-y-2"><div className="flex justify-between"><div className="text-xs font-semibold">ComfyUI API Workflow</div><button onClick={loadStarter} className="text-[10px] text-cyan-300">Reload starter</button></div><textarea rows={16} spellCheck={false} className={input+' font-mono text-[10px]'} value={s.workflow} onChange={e=>upd('workflow',e.target.value)} placeholder="Click Load starter or paste a ComfyUI API-format workflow."/></section>
        <section className="p-3 rounded-lg border border-[#2a2e38] bg-[#101218] flex gap-2 text-xs"><RefreshCw className={busy?'w-4 h-4 animate-spin text-cyan-300':'w-4 h-4 text-zinc-500'}/><span className={status.toLowerCase().includes('failed')||status.toLowerCase().includes('error')?'text-red-300':'text-zinc-400'}>{status}</span></section>
      </div>
    </div>
  </div>;
};
export default AnimationLab;