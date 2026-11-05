import assert from 'node:assert/strict';
export async function verifyWorldmap(page,base,{screenshotDir,requireHistory=false,verifyRouting=false}={}){
 await page.addInitScript(()=>{let wrapped;Object.defineProperty(window,'Globe',{configurable:true,get:()=>wrapped,set:Original=>{wrapped=new Proxy(Original,{construct(target,args){const instance=Reflect.construct(target,args);window.__reviewGlobe=instance;return instance;}});}});});
 await page.setExtraHTTPHeaders({'user-agent':'Worldmap verification browser'});let historyRequests=0;page.on('request',r=>{if(r.url().includes('/api/worldmap?source=cloudflare'))historyRequests++;});
 await page.goto(base+'/worldmap/',{waitUntil:'networkidle'});await page.waitForSelector('#globe[data-ready="true"]');await page.waitForFunction(()=>document.querySelector('#visitorTotal').textContent!=='—');
 assert.equal(await page.locator('select').count(),0,'Source and period dropdowns must be removed');assert.equal(await page.locator('#historyDetails').count(),0,'Technical history paragraph must be removed');assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).caretColor),'rgba(0, 0, 0, 0)');
 if(verifyRouting){const html=await page.request.get(base+'/worldmap/');assert.equal(html.headers()['x-yaitg-function'],'1');for(const asset of ['/assets/worldmap/countries.geojson','/worldmap/worldmap.js','/img/mushroom-platypus.webp']){const response=await page.request.get(base+asset);assert.equal(response.status(),200);assert.equal(response.headers()['x-yaitg-function'],undefined,'Static asset must bypass Functions: '+asset);}}
 await page.evaluate(()=>window.addEventListener('pointerdown',event=>{window.__plainClickPrevented=event.defaultPrevented;},{once:true}));await page.locator('#map-title').click();assert.equal(await page.evaluate(()=>window.__plainClickPrevented),true,'Plain background/text clicks should not place a caret');
 const history=await(await page.request.get(base+'/api/worldmap?source=cloudflare&range=all')).json();if(requireHistory){assert.equal(history.metric,'visits');assert(history.totals.visitors>0);}
 const view=JSON.parse(await page.locator('#globe').getAttribute('data-initial-view'));assert(Math.abs(view.lat-38.5)<.01&&Math.abs(view.lng+98)<.01,'Globe should initially face Kansas');
 const readVisitors=async()=>{const response=await page.request.get(base+'/api/worldmap');assert.equal(response.status(),200);return (await response.json()).totals.visitors;};const initial=await readVisitors();assert(initial>=1,'Verification browser should have an approximate origin');assert.equal(await page.locator('#metricLabel').innerText(),'Unique browsers');assert.equal(Number((await page.locator('#visitorTotal').innerText()).replaceAll(',','')),initial);assert.equal(await page.locator('.site-header').evaluate(el=>el.offsetHeight),50);
 assert.equal(await page.locator('footer,#historyTotal,#refreshMap,#excludeBrowser,.intro-copy').count(),0);
 const search=page.getByRole('searchbox',{name:'Search countries'});
 const listGeometry=()=>page.locator('#areaList').evaluate(list=>{
  const bounds=list.getBoundingClientRect();
  return {top:bounds.top+scrollY,height:bounds.height,documentHeight:document.documentElement.scrollHeight};
 });
 const beforeSearch=await listGeometry();
 assert.equal(beforeSearch.height,6*44);
 const firstCountry=await page.locator('#areaList li button span').first().innerText();
 await search.fill(firstCountry);
 assert(await page.locator('#areaList li:not([hidden])').count()>=1);
 await search.fill('no-such-country-zzyy');
 assert.equal(await page.locator('#areaList li:not([hidden])').count(),0);
 assert(await page.locator('#countryNoResults').isVisible());assert.deepEqual(await listGeometry(),beforeSearch,'Country search must keep the list and page geometry stable');
 await search.fill('');
 assert.equal(await page.locator('#areaList li[hidden]').count(),0);assert.equal(await page.locator('.totals ~ .country-list #areaList li').count(),Number(await page.locator('#countryTotal').innerText()));
 const denied=await page.request.post(base+'/api/worldmap',{headers:{origin:new URL(base).origin},data:{excluded:true}});assert.equal(denied.status(),405);
 for(let i=0;i<3;i++)await page.reload({waitUntil:'networkidle'});assert.equal(await readVisitors(),initial,'Reload must not add visitors');assert.equal(historyRequests,0,'The globe should not request historical visits');
 await page.locator('#rotateGlobe').click();assert.equal(await page.locator('#rotateGlobe').getAttribute('aria-pressed'),'false');await page.locator('#zoomIn').click();await page.locator('#resetGlobe').click();await page.locator('#areaList button:not([disabled])').first().click();assert.match(await page.locator('#areaSelection').innerText(),/unique browser/);
 if(screenshotDir)await page.screenshot({path:screenshotDir+'/worldmap-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.getElementById('world-map').getBoundingClientRect().top < document.getElementById('visitor-countries').getBoundingClientRect().top));
 await page.getByRole('link',{name:'↓ Countries'}).click();
 await page.waitForFunction(()=>location.hash==='#visitor-countries'&&document.getElementById('countrySearch').getBoundingClientRect().top<innerHeight);
 await page.getByRole('link',{name:'↑ Back to globe'}).click();
 await page.waitForFunction(()=>location.hash==='#world-map'&&document.getElementById('globe').getBoundingClientRect().top>=-1&&document.getElementById('globe').getBoundingClientRect().top<100);await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout should fit');if(screenshotDir)await page.screenshot({path:screenshotDir+'/worldmap-mobile.png',fullPage:true});
 const {verifyGreenland}=await import('./greenland-browser.mjs');const greenland=await verifyGreenland(page,{screenshotDir});
 return {greenland,staticRoutesVerified:verifyRouting,history:history.ok?{source:history.source,metric:history.metric,visits:history.totals.visitors,countries:history.points.length,coverage:history.coverage}:null,globeRendered:true,kansas:true,dropdownsRemoved:true,technicalParagraphRemoved:true,caretSuppressed:true,publicControlsRemoved:true,refreshesDeduplicated:true,publicExclusionDisabled:true,mobile:true};
}
