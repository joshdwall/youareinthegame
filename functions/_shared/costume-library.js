import {MUSHROOM_RIG,PRESETS,compileBundle,validateAnimationDraft,ref} from '../../runtime/costumes/contracts.js';
import {BUILTIN_ASSETS} from '../../runtime/costumes/catalog.js';
export const COSTUME_LIBRARY_KEY='cambio:costume-library:v1';
export async function readCostumeLibrary(env){const stored=await env.YAITG_SESSION_KV?.get(COSTUME_LIBRARY_KEY,'json');return stored||{schemaVersion:1,revision:0,rigs:[MUSHROOM_RIG],presets:Object.values(PRESETS),assets:BUILTIN_ASSETS,costumes:{},animations:[],placements:{}};}
export async function writeCostumeLibrary(env,library){if(!env.YAITG_SESSION_KV)throw Error('Costume storage unavailable');const next={...library,revision:(library.revision||0)+1,updatedAt:new Date().toISOString()};const text=JSON.stringify(next);if(text.length>8_000_000)throw Error('Costume library size limit reached; catalog partitioning is required');await env.YAITG_SESSION_KV.put(COSTUME_LIBRARY_KEY,text);return next;}
export async function verifyCostumeAssets(env,assets){
 for(const a of assets){
  const builtin=BUILTIN_ASSETS.find(x=>ref(x)===ref(a));if(builtin&&builtin.sha256===a.sha256&&builtin.src===a.src)continue;
  const prefix='/api/assets/';if(!a.src.startsWith(prefix))throw Error('Asset must be uploaded or use a registered immutable site asset');
  const key=a.src.slice(prefix.length);const item=await env.YAITG_ASSETS_R2?.get(key);if(!item)throw Error('Missing uploaded asset: '+a.id);
  const bytes=await item.arrayBuffer();if(bytes.byteLength!==a.bytes)throw Error('Asset byte size mismatch: '+a.id);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256)throw Error('Asset content hash mismatch: '+a.id);
 }
}
export async function importCostumeBundle(env,bundle,{commit=false,expectedRevision}={}){
 const library=await readCostumeLibrary(env);if(expectedRevision!==undefined&&library.revision!==expectedRevision){const e=Error('Library changed; reload before saving');e.status=409;throw e;}
 const compiled=compileBundle(bundle,library);const used=new Set(bundle.costume.elements.map(e=>e.asset));await verifyCostumeAssets(env,compiled.resolved.assets.filter(a=>used.has(ref(a))));
 const id=bundle.costume.version===1?bundle.costume.id:`${bundle.costume.id}-v${bundle.costume.version}`;compiled.animation.id=id;
 const storedVersion=library.animations.find(a=>a.costumeRef===ref(bundle.costume));
 if(library.costumes[ref(bundle.costume)]&&storedVersion?.publishedAt){const previous=JSON.stringify(library.costumes[ref(bundle.costume)]);if(previous!==JSON.stringify(bundle))throw Error('Published costume version is immutable; increment its version');}
 validateAnimationDraft(compiled.animation);
 if(!commit)return {valid:true,animation:compiled.animation,placements:compiled.placements,revision:library.revision};
 const legacy=await env.YAITG_SESSION_KV.get('cambio:runtime-config','json');if((legacy?.animations||[]).some(a=>a.id===id&&!a.costumeRef))throw Error('A legacy animation already uses this ID; choose a new costume ID');
 const old=library.animations.find(a=>a.id===id);if(old?.live)throw Error('Published costume versions cannot be overwritten');
 library.assets=compiled.resolved.assets;library.costumes={...library.costumes,[ref(bundle.costume)]:bundle};
  if(bundle.preset&&!library.presets.some(p=>ref(p)===ref(bundle.preset)))library.presets.push(bundle.preset);
 library.animations=[...library.animations.filter(a=>a.id!==id),compiled.animation];library.placements={...library.placements,[id]:compiled.placements};
 const saved=await writeCostumeLibrary(env,library);return {valid:true,saved:true,animation:compiled.animation,placements:compiled.placements,revision:saved.revision};
}
