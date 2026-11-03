import fs from 'node:fs';
import {MUSHROOM_RIG,compileBundle} from '../../runtime/costumes/contracts.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const save=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function fingerprint(a,c){return createHash('sha256').update(JSON.stringify({description:a.description,seed:a.seed,removeWhiteBackground:a.removeWhiteBackground,width:c.width,height:c.height,steps:c.steps,cfg:c.cfgScale,model:c.generatorModel,modelSha256:c.modelSha256,guideStrength:a.guideStrength,guideHash:a.guide?createHash('sha256').update(fs.readFileSync(path.join(ROOT,a.guide))).digest('hex'):null,sourceHash:a.source?createHash('sha256').update(fs.readFileSync(path.join(ROOT,a.source))).digest('hex'):null})).digest('hex');}
async function verifyModel(model,c){const h=createHash('sha256');for await(const b of fs.createReadStream(model))h.update(b);if(h.digest('hex')!==c.modelSha256)throw Error('Model SHA256 mismatch');}
export function validate(p){
  const id=/^[a-z][a-z0-9-]{0,63}$/;
  if(p.schemaVersion!==1||!id.test(p.id)||typeof p.label!=='string'||!p.label.trim())throw Error('Invalid costume identity');
  if(!Array.isArray(p.accessories)||!p.accessories.length)throw Error('Add at least one accessory');
  const seen=new Set();
  for(const a of p.accessories){
    if(!id.test(a.id)||seen.has(a.id))throw Error('Accessory IDs must be unique safe names');seen.add(a.id);
    if(typeof a.description!=='string'||!a.description.trim()||a.description.length>2000)throw Error('Accessory description required (max 2000 characters)');
    if(!['head','bill-top','bill-bottom','mouth','eye-left','eye-right','eyes','handL','handR','bill'].includes(a.anchor))throw Error('Unknown attachment point');
    if(!Number.isSafeInteger(a.seed)||a.seed<0)throw Error('Use a nonnegative integer seed');
    if(typeof a.removeWhiteBackground!=='boolean')throw Error('Set removeWhiteBackground explicitly');
    const s=a.placement;
    if(!s||!Number.isFinite(s.scale)||s.scale<=0||s.scale>3||!Number.isFinite(s.rotation)||typeof s.flipX!=='boolean')throw Error('Invalid placement');
    for(const k of ['objectAnchor','characterAnchor'])for(const xy of ['x','y'])if(!Number.isFinite(s[k]?.[xy])||s[k][xy]<-1||s[k][xy]>2)throw Error('Invalid anchor');
    for(const xy of ['x','y'])if(s.objectAnchor[xy]<0||s.objectAnchor[xy]>1)throw Error('Object anchor must be inside image');
    if(a.source&&(path.isAbsolute(a.source)||a.source.split(/[\\/]/).includes('..')))throw Error('Source must be inside workshop');
    if(a.guide&&(path.isAbsolute(a.guide)||a.guide.split(/[\\/]/).includes('..')))throw Error('Guide must be inside workshop');
    if(a.guide&&(!Number.isFinite(a.guideStrength)||a.guideStrength<=0||a.guideStrength>0.7))throw Error('Guide strength must be >0 and <=0.7');
  }return p;
}
export function makePrompt(a){return {prompt:`${a.description}, single isolated accessory only, centered, entire object visible, front-facing orthographic view, textured ink illustration, muted colors, dark blue gray outlines, plain pure white background, generous margin`,negativePrompt:'person, character, animal, face, head, body, mannequin, wearing, scenery, text, lettering, watermark, collage, multiple objects, cropped, photorealistic, cast shadow'};}
export function toSite(p){validate(p);return {animation:{id:p.id,label:p.label,editable:true,placementEditable:true,live:false,archived:false,playMode:'character-overlay',type:'character-overlay-activation',overlayFlashMode:'composite',tier:'common',multiplier:1,weight:100,transitionsAvailable:['lightning','none'],clickEffect:{type:'composite-spores',count:16,scale:0.18},elements:p.accessories.map(a=>({id:a.id,anchor:a.anchor,src:`assets/animations/${p.id}/${a.id}.png`,defaultWidthFrac:a.placement.scale,flipX:a.placement.flipX}))},placements:{transitionId:'lightning',elements:Object.fromEntries(p.accessories.map(a=>[a.id,{...a.placement,transition:null}]))}};}
function run(exe,args,log){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:ROOT,windowsHide:true,shell:false});let tail='';const out=fs.createWriteStream(log,{flags:'a'});const consume=b=>{out.write(b);tail=(tail+b).slice(-2000);};child.stdout.on('data',consume);child.stderr.on('data',consume);child.on('error',e=>{out.end();reject(e);});child.on('close',code=>{out.end();code===0?resolve():reject(Error(`Process exited ${code}: ${tail}`));});});}
async function ollama(c,prompt){const u=new URL(c.ollamaUrl);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('Only local Ollama is allowed');const r=await fetch(new URL('/api/generate',u),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:c.ollamaModel,prompt,stream:false,keep_alive:0,format:'json',options:{temperature:0,num_predict:200,num_ctx:2048}}),signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`Ollama HTTP ${r.status}`);return r.json();}
export async function main(command='doctor',projectFile='costume.json'){
  if(command==='ingest'){
    const rig=read(path.join(ROOT,'character-rig.json'));
    const inbox=path.join(ROOT,'inbox');fs.mkdirSync(inbox,{recursive:true});let count=0;
    for(const folder of fs.readdirSync(inbox,{withFileTypes:true}).filter(d=>d.isDirectory())){
      const id=folder.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      if(!/^[a-z][a-z0-9-]{0,63}$/.test(id))throw Error(`Rename inbox folder to a safe costume name: ${folder.name}`);
      const dest=path.join(ROOT,'costumes',`${id}.json`);if(fs.existsSync(dest)){console.log('Already imported; edit existing costume:',id);continue;}
      const accessories=fs.readdirSync(path.join(inbox,folder.name)).filter(n=>/\.(png|jpe?g|bmp)$/i.test(n)).map((name,i)=>{
        const itemId=path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        const head=/hat|crown|helmet/.test(itemId),eyes=/glasses|goggles/.test(itemId),bandana=/bandana|scarf/.test(itemId);
        const anchor=head?'head':eyes?'eyes':bandana?'bill-top':'mouth';
        const placement=head?structuredClone(rig.presetPlacements.head):{objectAnchor:{x:.5,y:bandana?.14:.5},characterAnchor:rig.anchors[anchor],scale:bandana?.46:eyes?.22:.35,rotation:0,flipX:false};
        return {id:itemId,description:`Imported ${itemId.replaceAll('-',' ')}`,source:path.posix.join('inbox',folder.name,name),anchor,seed:4200+i,removeWhiteBackground:false,placement};
      });
      if(!accessories.length)continue;save(dest,validate({schemaVersion:1,id,label:folder.name,accessories}));count++;console.log('Imported costume:',dest);
    }
    console.log(`${count} costume(s) imported. Stock images should already have transparency; adjust cutout and placement settings before batch processing.`);return;
  }
  if(command==='batch'){
    const folders=path.join(ROOT,'costumes');if(!fs.existsSync(folders))throw Error('Add costume JSON files to costumes/ first');
    const files=fs.readdirSync(folders).filter(f=>f.endsWith('.json')).sort();if(!files.length)throw Error('No costumes found');
    const results=[];
    for(const file of files){try{for(const action of ['prompts','run','export'])await main(action,path.join('costumes',file));results.push({file,status:'exported-for-review'});}catch(e){results.push({file,status:'failed',error:e.message});}}
    save(path.join(ROOT,'jobs',`batch-${Date.now()}.json`),results);console.log(results);if(results.some(r=>r.status==='failed'))process.exitCode=1;return;
  }
  const c={...read(path.join(ROOT,'config.json')),...(fs.existsSync(path.join(ROOT,'config.local.json'))?read(path.join(ROOT,'config.local.json')):{})},p=validate(read(path.resolve(ROOT,projectFile)));
  c.generatorExe=process.env.COSTUME_GENERATOR_EXE||c.generatorExe;c.generatorModel=process.env.COSTUME_GENERATOR_MODEL||c.generatorModel;
  const exe=path.resolve(ROOT,c.generatorExe),model=path.resolve(ROOT,c.generatorModel);
  const dir=path.join(ROOT,'jobs',p.id);fs.mkdirSync(dir,{recursive:true});
  if(command==='doctor'){
    let models=[];try{const r=await fetch(new URL('/api/tags',c.ollamaUrl),{signal:AbortSignal.timeout(5000)});models=(await r.json()).models.map(m=>m.name);}catch(e){console.log('Ollama unavailable:',e.message);}
    console.log(JSON.stringify({models,generatorExists:fs.existsSync(exe),modelBytes:fs.existsSync(model)?fs.statSync(model).size:0,expectedModelBytes:c.modelExpectedBytes},null,2));return;
  }
  if(command==='prompts'){
    const prompts=Object.fromEntries(p.accessories.map(a=>[a.id,makePrompt(a)]));
    save(path.join(dir,'prompts.json'),prompts);
    // Suggestions never replace the fixed accessory-only prompt or placements.
    try{const r=await ollama(c,`Return JSON with key suggestions containing three short material or color variations for these accessory descriptions. Do not describe a wearer: ${p.accessories.map(a=>a.description).join('; ')}`);save(path.join(dir,'ollama-suggestions.json'),{model:c.ollamaModel,response:JSON.parse(r.response)});console.log('Local suggestions saved.');}catch(e){console.log('Suggestions skipped:',e.message);}
    console.log('Fixed prompts saved:',dir);return;
  }
  if(command==='run'){
    let modelVerified=false;
    const statePath=path.join(dir,'queue.json');let state=fs.existsSync(statePath)?read(statePath):{};
    const lock=path.join(ROOT,'queue.lock');let fd;try{fd=fs.openSync(lock,'wx');fs.writeSync(fd,String(process.pid));}catch{throw Error('Queue already running. If it crashed, rename queue.lock before restarting.');}
    try{for(const a of p.accessories){
      const sig=fingerprint(a,c);
      if(state[a.id]?.signature===sig&&state[a.id].status==='ready'&&fs.existsSync(state[a.id].file)){console.log('Already prepared:',a.id);continue;}
      const stamp=Date.now(),raw=path.join(dir,`${a.id}-${stamp}-raw.png`),ready=path.join(dir,`${a.id}-${stamp}.png`);
      for(let attempt=1;attempt<=c.maxAttempts;attempt++){
        state[a.id]={signature:sig,status:'running',attempt,raw,file:ready};save(statePath,state);
        try{
          if(a.source){fs.copyFileSync(path.join(ROOT,a.source),raw);}
          else{
            if(!fs.existsSync(exe)||!fs.existsSync(model)||fs.statSync(model).size!==c.modelExpectedBytes)throw Error('Generator/model is missing or download is incomplete; run doctor');
            if(!modelVerified){await verifyModel(model,c);modelVerified=true;}
            const q=makePrompt(a);
            const guideArgs=a.guide?['--init-img',path.join(ROOT,a.guide),'--strength',String(a.guideStrength)]:[];
            await run(exe,['-m',model,'-p',q.prompt,'-n',q.negativePrompt,'-o',raw,'--width',String(c.width),'--height',String(c.height),'--steps',String(c.steps),'--cfg-scale',String(c.cfgScale),'--seed',String(a.seed),'--backend',c.backend,'--vae-on-cpu','--clip-on-cpu',...guideArgs],path.join(dir,`${a.id}-${stamp}-generator.log`));
          }
          await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'prepare.ps1'),'-InputFile',raw,'-OutputFile',ready,'-RemoveWhite',String(a.removeWhiteBackground).toLowerCase()],path.join(dir,`${a.id}-${stamp}-prepare.log`));
          state[a.id]={...state[a.id],status:'ready',needsVisualReview:true};save(statePath,state);console.log('Prepared for review:',a.id);break;
        }catch(e){state[a.id]={...state[a.id],status:'failed',error:e.message};save(statePath,state);console.error(`${a.id} attempt ${attempt}: ${e.message}`);if(attempt===c.maxAttempts||/Foreground fills|No foreground|no transparency|download is incomplete|SHA256 mismatch/.test(e.message))throw e;await sleep(c.retrySeconds*1000);}
      }
      await sleep(c.cooldownSeconds*1000);
    }}finally{fs.closeSync(fd);fs.unlinkSync(lock);}return;
  }
  if(command==='export'){
    const state=read(path.join(dir,'queue.json')),site=toSite(p),out=path.join(ROOT,'exports',`${p.id}-${Date.now()}`);fs.mkdirSync(out,{recursive:true});
    for(const a of p.accessories){const s=state[a.id];if(s?.status!=='ready'||s.signature!==fingerprint(a,c)||!fs.existsSync(s.file))throw Error('Prepare all accessories with current settings before export');const dest=path.join(out,'assets','animations',p.id,`${a.id}.png`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(s.file,dest);}
    save(path.join(out,'animation.draft.json'),site.animation);save(path.join(out,'placements.draft.json'),{byAnimation:{[p.id]:site.placements}});
    save(path.join(out,'review.json'),{live:false,needsVisualReview:true,note:'Draft fragments; merge through Cambio/current validation. Never replace entire live configuration.'});
    fs.copyFileSync(path.join(ROOT,'character.png'),path.join(out,'character.png'));
    const base=fs.readFileSync(path.join(ROOT,'character.png')),w=base.readUInt32BE(16),h=base.readUInt32BE(20);
    const images=p.accessories.map(a=>{const s=a.placement,data=fs.readFileSync(state[a.id].file).toString('base64');return `<image href="data:image/png;base64,${data}" x="${-s.objectAnchor.x*512}" y="${-s.objectAnchor.y*512}" width="512" height="512" preserveAspectRatio="none" transform="translate(${s.characterAnchor.x*w} ${s.characterAnchor.y*h}) rotate(${s.rotation}) scale(${s.scale*w/512*(s.flipX?-1:1)} ${s.scale*w/512})"/>`;}).join('');
    fs.writeFileSync(path.join(out,'preview.svg'),`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Draft costume placement preview" viewBox="-100 -160 ${w+200} ${h+320}"><rect x="-100" y="-160" width="${w+200}" height="${h+320}" fill="#b7bec7"/><image href="data:image/png;base64,${base.toString('base64')}" width="${w}" height="${h}"/>${images}</svg>`);
    await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'render-preview.ps1'),'-ExportDir',out],path.join(out,'preview-render.log'));
    
    const version=p.version||1;
    const canonicalAssets=p.accessories.map(a=>{const bytes=fs.readFileSync(state[a.id].file),sha256=createHash('sha256').update(bytes).digest('hex');return {id:(p.id+'-'+a.id).slice(0,60),version,src:'/api/assets/animations/costumes/'+sha256+'.png',sha256,width:512,height:512,bytes:bytes.length,pivot:a.placement.objectAnchor,provenance:a.source?'Operator stock accessory prepared locally':'Local diffusion artwork; model SHA256 '+c.modelSha256+'; seed '+a.seed};});
    const bundle={schemaVersion:1,assets:canonicalAssets,costume:{id:p.id,version,label:p.label,rig:'mushroom-platypus@1',preset:p.preset||'gentle-burst@1',elements:p.accessories.map((a,i)=>{const point=a.anchor==='bill'?'mouth':a.anchor,anchor=MUSHROOM_RIG.anchors[point],placement={...a.placement,layer:a.placement.layer||'foreground',order:i};if(anchor){placement.attachment={rig:'mushroom-platypus@1',point};placement.offset={x:placement.characterAnchor.x-anchor.x,y:placement.characterAnchor.y-anchor.y};delete placement.characterAnchor;}return {id:a.id,asset:canonicalAssets[i].id+'@'+version,placement};})}};
    compileBundle(bundle);save(path.join(out,'costume.bundle.json'),bundle);save(path.join(out,'upload-manifest.json'),{files:p.accessories.map((a,i)=>({asset:canonicalAssets[i].id+'@'+version,file:'assets/animations/'+p.id+'/'+a.id+'.png',sha256:canonicalAssets[i].sha256}))});
console.log('Draft exported:',out);return;
  }
  throw Error('Commands: doctor, prompts, run, export, ingest, batch');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv[2],process.argv[3]).catch(e=>{console.error(e.message);process.exitCode=1;});
