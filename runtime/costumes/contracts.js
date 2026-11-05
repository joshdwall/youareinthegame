/** Shared authoring contract. No network, DOM, credentials or provider dependencies. */
export const LIMITS=Object.freeze({elements:24,clones:24,actions:6,assetBytes:8_000_000,dimension:8192});
export const ACTION_TYPES=Object.freeze(['fire','textProjectile','sway','bounce','spin','recoil','fade','particles']);
export const LAYERS=Object.freeze(['behind-character','foreground']);
export const PHASES=Object.freeze(['equip','idle','interact','activation','exit']);
export const MUSHROOM_RIG=Object.freeze({id:'mushroom-platypus',version:1,width:709,height:470,anchors:{head:{x:.48798449304854485,y:-.07305050626728364},'bill-top':{x:.5,y:.5},mouth:{x:.4949264790076918,y:.7959222378465736},'bill-bottom':{x:.5,y:.99},'eye-left':{x:.42,y:.477},'eye-right':{x:.565,y:.477},eyes:{x:.4925,y:.477},handL:{x:.05,y:.5},handR:{x:.95,y:.5}},coverage:{bandana:[{x:.27,y:.5},{x:.73,y:.5},{x:.5,y:1.08}]}});
export const PRESETS=Object.freeze({
 'classic-lightning@1':{id:'classic-lightning',version:1,transition:'lightning',phases:{equipMs:0,activationMinMs:2000,activationMaxMs:3000,exitMs:150},spores:{trajectory:'fireworks',count:8,scale:null,durationMs:null,spreadPx:null}},
 'gentle-burst@1':{id:'gentle-burst',version:1,transition:'none',phases:{equipMs:180,activationMinMs:600,activationMaxMs:600,exitMs:180},spores:{trajectory:'burst',count:8,scale:.15,durationMs:1600,spreadPx:140}}
});
const clone=x=>JSON.parse(JSON.stringify(x));
export const ref=x=>`${x.id}@${x.version}`;
const validId=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(x);
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const point=(x,min=0,max=1)=>x&&finite(x.x,min,max)&&finite(x.y,min,max);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
export const stable=x=>JSON.stringify(x,(_key,value)=>object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
function requireOk(test,message){if(!test)throw Error(message);}
export function safeAssetSource(src){return typeof src==='string'&&!/[\\\u0000-\u001f]/.test(src)&&!src.includes('..')&&/^\/?(?:assets\/|img\/|effects\/|api\/assets\/)[a-zA-Z0-9_./@-]+(?:\?[a-zA-Z0-9_=&.-]+)?$/.test(src);}
export function validateActions(actions=[]){
 requireOk(Array.isArray(actions)&&actions.length<=LIMITS.actions,'At most six actions per accessory');
 for(const a of actions){requireOk(object(a)&&ACTION_TYPES.includes(a.type),'Unsupported action type');requireOk(!a.phase||PHASES.includes(a.phase),'Unsupported action phase');requireOk(!a.appliesTo||(Array.isArray(a.appliesTo)&&a.appliesTo.every(t=>['spore','activation'].includes(t))),'Unsupported action target');
  if(a.point)requireOk(point(a.point),'Action point must be normalized');
  if(a.durationMs!==undefined)requireOk(finite(a.durationMs,50,10000),'Action duration must be 50-10000ms');
  if(a.rate!==undefined)requireOk(finite(a.rate,.1,20),'Action rate exceeds limits');
  if(a.amplitude!==undefined)requireOk(finite(a.amplitude,0,50),'Action amplitude exceeds limits');
  if(a.count!==undefined)requireOk(Number.isInteger(a.count)&&finite(a.count,1,12),'Particle count exceeds limits');
  if(a.type==='textProjectile')requireOk(typeof a.text==='string'&&a.text.length>0&&a.text.length<=64,'Text action requires 1-64 characters');
  if(a.sprite!==undefined)requireOk(a.type==='fire'&&safeAssetSource(a.sprite),'Projectile sprite must be a site asset on a fire action');
  if(a.spriteWidthPx!==undefined)requireOk(a.sprite!==undefined&&finite(a.spriteWidthPx,8,64),'Projectile sprite width must be 8–64 px');
 }
 return actions;
}
export function resolvePlacement(raw={},rig=MUSHROOM_RIG){
 const p={...raw};
 if(p.attachment){
  requireOk(p.attachment.rig===ref(rig),'Unknown rig version');const name=p.attachment.point==='bill'?'mouth':p.attachment.point;
  const a=rig.anchors[name];requireOk(a,'Unknown rig anchor');const offset=p.offset||{x:0,y:0};requireOk(point(offset,-2,2),'Invalid anchor offset');
  // A characterAnchor explicitly saved by the legacy editor is a manual override.
  p.characterAnchor=p.characterAnchor||{x:a.x+offset.x,y:a.y+offset.y};
 }
 return {...p,objectAnchor:p.objectAnchor||{x:.5,y:.5},characterAnchor:p.characterAnchor||{x:p.x??.5,y:p.y??.35},scale:p.scale??p.widthFrac??.3,rotation:p.rotation??p.rotationDeg??0,flipX:!!p.flipX,layer:p.layer||'foreground',order:p.order??0};
}
export function validatePlacement(raw,rig=MUSHROOM_RIG){
 const p=resolvePlacement(raw,rig);requireOk(point(p.objectAnchor),'Invalid accessory pivot');requireOk(point(p.characterAnchor,-2,3),'Invalid character attachment');requireOk(finite(p.scale,.01,3),'Scale must be .01-3 character widths');requireOk(finite(p.rotation,-3600,3600),'Invalid rotation');requireOk(LAYERS.includes(p.layer),'Unsupported layer');requireOk(Number.isInteger(p.order)&&finite(p.order,-100,100),'Invalid layer order');requireOk(!p.mask,'Masks require an additional supported renderer; no mask is silently ignored');validateActions(p.objectActions||[]);return p;
}
export function editorPlacement(raw,rig=MUSHROOM_RIG){const p=resolvePlacement(raw,rig);return {...p,characterAnchor:{...p.characterAnchor}};}
export function normalizeEditedPlacement(raw,rig=MUSHROOM_RIG){
 const p=validatePlacement(raw,rig);
 if(p.attachment){const a=rig.anchors[p.attachment.point==='bill'?'mouth':p.attachment.point];p.offset={x:p.characterAnchor.x-a.x,y:p.characterAnchor.y-a.y};delete p.characterAnchor;}
 return p;
}
export function resolvePreset(input){
 const preset=typeof input==='string'?PRESETS[input]:input||PRESETS['classic-lightning@1'];
 requireOk(object(preset)&&validId(preset.id)&&Number.isInteger(preset.version)&&preset.version>0,'Unknown animation preset');
 requireOk(['lightning','none'].includes(preset.transition),'Unsupported transition');
 const p=preset.phases,s=preset.spores;requireOk(object(p)&&object(s),'Preset phases and spores are required');
 for(const k of ['equipMs','activationMinMs','activationMaxMs','exitMs'])requireOk(finite(p[k],0,10000),'Invalid phase timing');
 requireOk(p.activationMaxMs>=p.activationMinMs,'Invalid activation duration range');
 requireOk(['burst','fireworks'].includes(s.trajectory),'Unsupported spore trajectory');requireOk(Number.isInteger(s.count)&&finite(s.count,0,LIMITS.clones),'Spore count exceeds limits');
 if(s.scale!==null)requireOk(finite(s.scale,.03,.5),'Invalid spore scale');if(s.durationMs!==null)requireOk(finite(s.durationMs,200,6000),'Invalid spore duration');if(s.spreadPx!==null)requireOk(finite(s.spreadPx,0,600),'Invalid spore spread');
 return clone(preset);
}
export function validateAsset(a){requireOk(object(a)&&validId(a.id)&&Number.isInteger(a.version)&&a.version>0,'Invalid asset identity/version');requireOk(safeAssetSource(a.src),'Asset must use a safe site asset path');requireOk(/^[a-f0-9]{64}$/.test(a.sha256||''),'Asset SHA256 required');requireOk(Number.isInteger(a.width)&&finite(a.width,1,LIMITS.dimension)&&Number.isInteger(a.height)&&finite(a.height,1,LIMITS.dimension),'Invalid asset dimensions');requireOk(Number.isInteger(a.bytes)&&finite(a.bytes,1,LIMITS.assetBytes),'Asset size exceeds limit');requireOk(point(a.pivot||{x:.5,y:.5}),'Invalid asset pivot');requireOk(typeof a.provenance==='string'&&a.provenance.length>0&&a.provenance.length<=2000,'Asset provenance required');return a;}
export function validateBundle(bundle,library={assets:[],rigs:[MUSHROOM_RIG],presets:Object.values(PRESETS)}){
 requireOk(object(bundle)&&bundle.schemaVersion===1,'Unsupported costume bundle version');
 const c=bundle.costume;requireOk(object(c)&&validId(c.id)&&Number.isInteger(c.version)&&c.version>0&&typeof c.label==='string'&&c.label.trim().length>0&&c.label.length<=80,'Invalid costume identity');
 requireOk(Array.isArray(bundle.assets)&&bundle.assets.length<=LIMITS.elements,'Invalid asset collection');
 const assets=new Map((library.assets||[]).map(a=>[ref(a),a]));
 for(const a of bundle.assets){validateAsset(a);const old=assets.get(ref(a));requireOk(!old||stable(old)===stable(a),'Asset version is immutable; create a new version');assets.set(ref(a),clone(a));}
 const rigs=[MUSHROOM_RIG,...(library.rigs||[])];const rig=rigs.find(r=>ref(r)===c.rig);requireOk(rig,'Unknown costume rig');
 const presets={...PRESETS,...Object.fromEntries((library.presets||[]).map(p=>[ref(p),p]))};
 if(bundle.preset){const key=ref(bundle.preset);const v=resolvePreset(bundle.preset);requireOk(!presets[key]||stable(presets[key])===stable(v),'Preset version is immutable');presets[key]=v;}
 const preset=resolvePreset(presets[c.preset]);requireOk(presets[c.preset],'Unknown preset reference');
 requireOk(Array.isArray(c.elements)&&c.elements.length>0&&c.elements.length<=LIMITS.elements,'Costume requires 1-24 accessories');
 const ids=new Set();const elements=c.elements.map(e=>{requireOk(validId(e.id)&&!ids.has(e.id),'Accessory instance IDs must be unique');ids.add(e.id);const a=assets.get(e.asset);requireOk(a,'Missing asset reference: '+e.asset);const p=validatePlacement({...e.placement,objectAnchor:e.placement?.objectAnchor||a.pivot},rig);return {id:e.id,asset:e.asset,src:a.src,anchor:e.placement?.attachment?.point||'manual',defaultWidthFrac:p.scale,placement:p};});
 return {bundle:clone(bundle),assets:[...assets.values()],rig,preset,elements};
}
export function compileBundle(bundle,library){const v=validateBundle(bundle,library);return {animation:{id:bundle.costume.id,label:bundle.costume.label,version:bundle.costume.version,editable:true,placementEditable:true,live:false,archived:false,type:'character-overlay-activation',playMode:'character-overlay',overlayFlashMode:'composite',tier:'common',weight:100,multiplier:1,animationPreset:v.preset,costumeRef:ref(bundle.costume),rigRef:ref(v.rig),elements:v.elements.map(({placement,...e})=>({...e,placement})),clickEffect:{type:'composite-spores',count:16,scale:.15},transitionsAvailable:['lightning','none'],previewObjectActions:false},placements:{transitionId:v.preset.transition,elements:Object.fromEntries(v.elements.map(e=>[e.id,normalizeEditedPlacement(e.placement,v.rig)]))},resolved:v};}
export function validateAnimationDraft(a){requireOk(validId(a.id)&&typeof a.label==='string'&&a.label.length<=80,'Invalid animation identity');requireOk(Array.isArray(a.elements)&&a.elements.length<=LIMITS.elements&&(!a.live||a.elements.length>0),'Invalid animation elements');if(a.animationPreset)resolvePreset(a.animationPreset);for(const e of a.elements){requireOk(typeof e.id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(e.id)&&safeAssetSource(e.src),'Invalid accessory asset');if(e.placement)validatePlacement(e.placement);}return a;}
