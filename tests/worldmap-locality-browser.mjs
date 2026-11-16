import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startReviewServer} from './helpers/local-review-server.mjs';

const server=await startReviewServer({worldmap:true});
const browser=await chromium.launch();
const locations=[
 {id:'first',city:'Wichita',region:'Kansas',country:'US',lat:38.5,lng:-98,count:5},
 {id:'second',city:'Nearby',region:'Kansas',country:'US',lat:38.5,lng:-98,count:4},
 {id:'third',city:'Newton',region:'Kansas',country:'US',lat:38.5,lng:-97.9,count:2}
];
try {
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://challenges.cloudflare.com/**',route=>route.abort());
  await page.route('**/api/worldmap',route=>route.fulfill({json:{ok:true,uniqueBy:'browser',points:locations,totals:{visitors:11,countries:1}}}));
  await page.route('**/assets/worldmap/globe.gl.min.js',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text())+'\nwindow.Globe=new Proxy(window.Globe,{construct(target,args){return window.testGlobe=new target(...args);}});'});
  });
  await page.goto(server.url+'/worldmap/');
  await page.waitForSelector('#globe[data-ready=true]');
  const size=()=>page.evaluate(()=>window.testGlobe.pointRadius()(window.testGlobe.pointsData()[0]));
  const initial=await size();
  for(let i=0;i<15;i++)await page.locator('#zoomIn').click();
  await page.waitForFunction(()=>window.testGlobe.pointOfView().altitude<.02);
  assert((await size())<initial/10);
  const position=await page.evaluate(()=>{
   const g=window.testGlobe;
   const marker=g.pointsData()[0];
   return g.getScreenCoords(marker.lat,marker.lng,g.pointAltitude()(marker)/2);
  });
  const box=await page.locator('#globe').boundingBox();
  if(mobile)await page.touchscreen.tap(box.x+position.x,box.y+position.y);
  else await page.mouse.click(box.x+position.x,box.y+position.y);
  await page.locator('#nearbyPegs').waitFor({state:'visible',timeout:3000});
  const current=await page.locator('#nearbyPegs').inputValue();
  const alternate=current==='first'?'second':'first';
  await page.locator('#nearbyPegs').selectOption(alternate);
  assert.match(await page.locator('#pegSelection').textContent(),alternate==='first'?/Wichita, Kansas.*5 visitors/:/Nearby, Kansas.*4 visitors/);
  assert.deepEqual(errors,[]);
  await page.close();
 }
} finally {
 await browser.close();await server.close();
}
