import {MUSHROOM_RIG,PRESETS,compileBundle,resolvePlacement,ref,LIMITS} from '/runtime/costumes/contracts.js';
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'accessory';
async function api(url,body){const r=await fetch(url,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||`Request failed (${r.status})`);return data;}
function element(tag,text,attrs={}){const node=document.createElement(tag);if(text)node.textContent=text;for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;}
export async function mountCostumeWorkshop({onPreview,onSaved}){
 const anchor=document.getElementById('poolHint');if(!anchor)return;
 const details=element('details',null,{class:'card costume-workshop',id:'costumeWorkshop'});details.appendChild(element('summary','Costume workshop'));
 const form=element('div',null,{class:'card-body'});details.appendChild(form);anchor.before(details);
 form.appendChild(element('p','Import a bundle or upload accessory cutouts, choose attachments, then preview and save a draft.'));
 const status=element('p','Loading reusable assets…',{class:'cambio-status','aria-live':'polite',id:'costumeWorkshopStatus'});
 const field=(label,input)=>{const row=element('label',null,{class:'cambio-field'});row.appendChild(element('span',label));row.appendChild(input);form.appendChild(row);return input;};
 const name=field('Costume name',element('input',null,{value:'New costume',maxlength:'48',id:'costumeName'}));
 const id=field('Costume ID',element('input',null,{value:'new-costume',maxlength:'48',id:'costumeId'}));
 const version=field('Version',element('input',null,{type:'number',value:'1',min:'1',max:'9999',id:'costumeVersion'}));
 const preset=element('select',null,{id:'costumePreset'});for(const[k,p]of Object.entries(PRESETS))preset.appendChild(element('option',p.transition==='none'?'Gentle burst (no lightning)':'Classic lightning',{value:k}));preset.value='gentle-burst@1';field('Animation',preset);
 const example=element('button','Load reusable cowboy',{type:'button',class:'btn',id:'costumeLoadExample'});form.appendChild(example);
 const bandanaExample=element('button','Load bandana',{type:'button',class:'btn',id:'costumeLoadBandana'});form.appendChild(bandanaExample);
 const file=field('Import costume bundle',element('input',null,{type:'file',accept:'.json,application/json',id:'costumeBundleFile'}));
 const images=field('Upload accessory images',element('input',null,{type:'file',accept:'image/png,image/webp',multiple:'',id:'costumeImages'}));
 const editors=element('div',null,{id:'costumeAccessoryEditors'});form.appendChild(editors);
 const advanced=element('details');advanced.appendChild(element('summary','Bundle details'));const text=element('textarea',null,{rows:'12','aria-label':'Costume bundle JSON',id:'costumeBundleJson'});advanced.appendChild(text);form.appendChild(advanced);
 const buttons=element('div',null,{class:'cambio-actions'});const preview=element('button','Preview',{type:'button',class:'btn',id:'costumePreview'}),cancel=element('button','Stop preview',{type:'button',class:'btn',id:'costumeStop'}),save=element('button','Save draft',{type:'button',class:'btn primary',id:'costumeSaveDraft'});buttons.append(preview,cancel,save);form.append(buttons,status);
 let library=(await api('/api/cambio/costumes')).library;
 let bundle={schemaVersion:1,assets:[],costume:{id:'new-costume',version:1,label:'New costume',rig:'mushroom-platypus@1',preset:'gentle-burst@1',elements:[]}},controller=null,busy=false,editorInvalid=false;
 const setBusy=v=>{busy=v;preview.disabled=v;save.disabled=v;images.disabled=v;};
 const serialize=()=>{bundle.costume.id=slug(id.value);bundle.costume.label=name.value.trim();bundle.costume.version=Number(version.value);bundle.costume.preset=preset.value;text.value=JSON.stringify(bundle,null,2);};
 const refresh=()=>{
  editorInvalid=false;name.value=bundle.costume.label;id.value=bundle.costume.id;version.value=bundle.costume.version;if(![...preset.options].some(o=>o.value===bundle.costume.preset))preset.appendChild(element('option',bundle.costume.preset,{value:bundle.costume.preset}));preset.value=bundle.costume.preset;editors.replaceChildren();
  for(const item of bundle.costume.elements){
   const group=element('fieldset',null,{class:'costume-accessory'});group.appendChild(element('legend',item.id));
   const select=(title,choices,value,fn)=>{const label=element('label',null,{class:'cambio-field'});label.appendChild(element('span',title));const select=element('select');for(const[k,v]of choices)select.appendChild(element('option',v,{value:k}));select.value=value;select.addEventListener('change',()=>{fn(select.value);serialize();});label.appendChild(select);group.appendChild(label);return select;};
   select('Attachment',[...Object.keys(MUSHROOM_RIG.anchors).map(x=>[x,x]),['manual','Manual placement']],item.placement.attachment?.point||'manual',value=>{if(value==='manual'){item.placement=resolvePlacement(item.placement);delete item.placement.attachment;}else{delete item.placement.characterAnchor;item.placement.attachment={rig:'mushroom-platypus@1',point:value};item.placement.offset={x:0,y:0};}});
   select('Layer',[['foreground','In front'],['behind-character','Behind character']],item.placement.layer||'foreground',value=>item.placement.layer=value);
   const currentMotion=(item.placement.objectActions||[]).find(a=>['sway','bounce','spin','recoil','fade','particles'].includes(a.type));
   select('Motion',[['','None'],...['sway','bounce','spin','recoil','fade','particles'].map(x=>[x,x])],currentMotion?.type||'',value=>{item.placement.objectActions=(item.placement.objectActions||[]).filter(a=>['fire','textProjectile'].includes(a.type));if(value)item.placement.objectActions.push({type:value,phase:'activation',durationMs:1000,amplitude:6,appliesTo:['activation','spore']});});
   const scaleLabel=element('label',null,{class:'cambio-field'});scaleLabel.appendChild(element('span','Width / character width'));const scale=element('input',null,{type:'number',min:'.01',max:'3',step:'.01',value:String(item.placement.scale)});scale.addEventListener('change',()=>{item.placement.scale=Number(scale.value);serialize();});scaleLabel.appendChild(scale);group.appendChild(scaleLabel);editors.appendChild(group);
  }
  serialize();
 };
 const perform=fn=>async()=>{if(busy)return;setBusy(true);try{await fn();}catch(e){status.textContent=e.message;}finally{setBusy(false);}};
 example.addEventListener('click',perform(async()=>{bundle=await (await fetch('/content/costume-examples/cowboy.json')).json();refresh();status.textContent='Reusable cowboy loaded as a draft. Existing cowboy is unchanged.';}));
 bandanaExample.addEventListener('click',perform(async()=>{bundle=await (await fetch('/content/costume-examples/bandana.json')).json();refresh();status.textContent='Locally generated bandana loaded as a draft.';}));
 file.addEventListener('change',perform(async()=>{if(!file.files[0])return;bundle=JSON.parse(await file.files[0].text());compileBundle(bundle,library);refresh();status.textContent='Bundle loaded. Upload any referenced local images, then preview.';}));
 text.addEventListener('change',()=>{try{const next=JSON.parse(text.value);compileBundle(next,library);bundle=next;refresh();status.textContent='Bundle validated locally.';}catch(e){editorInvalid=true;status.textContent=e.message;}});
 name.addEventListener('change',()=>{if(id.value==='new-costume')id.value=slug(name.value);serialize();});
 for(const input of [id,version,preset])input.addEventListener('change',serialize);
 images.addEventListener('change',perform(async()=>{
  const files=[...images.files];if(files.length>LIMITS.elements)throw Error('Upload at most 24 accessories');
  const imported=[];for(const f of files){
   if(f.size>LIMITS.assetBytes||!['image/png','image/webp'].includes(f.type))throw Error('Use PNG/WebP cutouts smaller than 8 MB');
   const buffer=await f.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const bitmap=await createImageBitmap(f);const width=bitmap.width,height=bitmap.height;bitmap.close();
   if(width>LIMITS.dimension||height>LIMITS.dimension)throw Error('Image dimensions exceed 8192px');
   let asset=library.assets.find(a=>a.sha256===hash);
   if(!asset){const ext=f.type==='image/webp'?'webp':'png';const data=new FormData();data.set('file',f);data.set('key',`animations/costumes/${hash}.${ext}`);const r=await fetch('/api/cambio/assets',{method:'POST',credentials:'include',body:data});const uploaded=await r.json();if(!r.ok||!uploaded.ok)throw Error(uploaded.error||'Upload failed');asset={id:slug(f.name.replace(/\.[^.]+$/,''))+'-'+hash.slice(0,8),version:1,src:uploaded.url,sha256:hash,width,height,bytes:f.size,pivot:{x:.5,y:.5},provenance:'Operator-supplied accessory cutout'};}
   imported.push(asset);
  }
  if(bundle.costume.elements.length){for(const a of bundle.assets){const same=imported.find(x=>x.sha256===a.sha256);if(same)a.src=same.src;}status.textContent='Images uploaded. Existing bundle references retained; preview validates their hashes.';}
  else{bundle.assets=imported;bundle.costume.elements=imported.map((a,i)=>{const hat=/hat|helmet|crown/.test(a.id),eyes=/glasses|goggles/.test(a.id),bandana=/bandana|scarf/.test(a.id);const point=hat?'head':eyes?'eyes':bandana?'bill-top':'mouth';return {id:'accessory-'+(i+1),asset:ref(a),placement:{attachment:{rig:'mushroom-platypus@1',point},offset:{x:0,y:0},objectAnchor:{x:.5,y:bandana?.14:.5},scale:hat?1.05:eyes?.22:bandana?.46:.38,rotation:0,flipX:false,layer:'foreground',order:i}};});status.textContent='Accessories ready. Review their attachments and scale.';}
  refresh();
 }));
 preview.addEventListener('click',perform(async()=>{if(editorInvalid)throw Error('Fix bundle JSON before previewing');serialize();compileBundle(bundle,library);const result=await api('/api/cambio/costumes',{bundle,commit:false,expectedRevision:library.revision});controller?.abort();controller=new AbortController();status.textContent='Playing unsaved draft…';await onPreview(result,controller.signal);status.textContent='Preview finished. Review placement before saving.';}));
 cancel.addEventListener('click',()=>{controller?.abort();status.textContent='Preview stopped.';});
 save.addEventListener('click',perform(async()=>{if(editorInvalid)throw Error('Fix bundle JSON before saving');serialize();compileBundle(bundle,library);const result=await api('/api/cambio/costumes',{bundle,commit:true,expectedRevision:library.revision});library=(await api('/api/cambio/costumes')).library;status.textContent='Saved as draft. Use the animation list to edit placement and explicitly enable Live after review.';await onSaved(result);}));
 status.textContent='Ready. New costumes stay draft until explicitly published.';refresh();
}
