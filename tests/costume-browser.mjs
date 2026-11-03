import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startReviewServer} from './helpers/local-review-server.mjs';
const server=await startReviewServer(),browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)console.error(r.status(),r.url());});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});fs.mkdirSync('test-results/costumes',{recursive:true});
try{
 await page.goto(server.url+'/cambio/',{waitUntil:'networkidle'});
 await page.locator('#costumeWorkshop').waitFor();await page.locator('#costumeWorkshop summary').first().click();
 await page.locator('#costumeLoadBandana').click();await page.waitForFunction(()=>document.querySelector('#costumeId').value==='bandit-reusable');
 await page.locator('#costumePreview').click();await page.waitForTimeout(250);await page.locator('#costumeStop').click();
 await page.waitForFunction(()=>!document.querySelector('#costumeSaveDraft').disabled);
 await page.locator('#costumeSaveDraft').click();await page.waitForFunction(()=>document.querySelector('#costumeWorkshopStatus').textContent.startsWith('Saved as draft'));
 const hidden=await page.evaluate(async()=>{const publicData=await(await fetch('/api/animations')).json();return !publicData.animations.some(a=>a.id==='bandit-reusable');});assert(hidden,'Saved draft must stay out of public pool');
 await page.screenshot({path:'test-results/costumes/editor-desktop.png',fullPage:true});
 await page.reload({waitUntil:'networkidle'});assert(await page.getByText('Bandit reusable',{exact:false}).count()||await page.locator('[data-anim-id="bandit-reusable"]').count(),'Saved draft should survive reload');
 await page.setViewportSize({width:390,height:844});await page.locator('#costumeWorkshop summary').first().click();await page.screenshot({path:'test-results/costumes/editor-mobile.png',fullPage:true});
 const lifecycle=await page.evaluate(async()=>{
  const {buildCharacterComposite}=await import('/effects/activation/CharacterComposite.js');const {runBehaviors}=await import('/runtime/costumes/behaviors.js');const {runActivation}=await import('/effects/activation/ActivationEngine.js');const {compileBundle,PRESETS}=await import('/runtime/costumes/contracts.js');
  const bundle=await(await fetch('/content/costume-examples/bandana.json')).json();const compiled=compileBundle(bundle);const el=compiled.resolved.elements[0];el.placement.layer='behind-character';
  const node=buildCharacterComposite({baseSrc:'/img/mushroom-platypus.webp',elements:[el],box:{width:300,height:200}});document.body.appendChild(node);const layerCorrect=node.querySelector('[data-element-id]').style.zIndex==='1';
  const before=node.querySelector('[data-element-id]').style.transform;for(let i=0;i<6;i++){const c=runBehaviors({root:node,elements:[el]});c.stop();}const cleanup=node.querySelectorAll('.costume-motion').length===0&&node.querySelector('[data-element-id]').style.transform===before;node.remove();
  const container=document.createElement('div');container.style.cssText='position:relative;width:300px;height:200px';const img=document.createElement('img');img.src='/img/mushroom-platypus.webp';img.style.width='300px';container.appendChild(img);document.body.appendChild(container);await img.decode();const controller=new AbortController();setTimeout(()=>controller.abort(),100);
  await runActivation({container,creature:img,signal:controller.signal,assetsPreloaded:true,animation:compiled.animation,transitionId:'none',preset:{...PRESETS['gentle-burst@1'],phases:{equipMs:0,activationMinMs:600,activationMaxMs:600,exitMs:0},spores:{...PRESETS['gentle-burst@1'].spores,count:0}},composite:{elements:[el],baseSrc:img.src}});
  const abortCleanup=container.children.length===1;container.remove();return {layerCorrect,cleanup,abortCleanup};
 });assert.deepEqual(lifecycle,{layerCorrect:true,cleanup:true,abortCleanup:true});assert.deepEqual(errors,[]);console.log('PASS costume browser: draft save/reload, hidden public pool, desktop/mobile, layers, repeat cleanup and abort');
}catch(e){console.error('Browser errors:',errors,'Page:',(await page.locator('body').innerText()).slice(-1500));throw e;}finally{await browser.close();await server.close();}
