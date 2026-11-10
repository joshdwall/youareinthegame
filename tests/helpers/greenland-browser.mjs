import assert from 'node:assert/strict';import sharp from 'sharp';import {geoContains} from 'd3-geo';
export async function verifyGreenland(page,{screenshotDir}={}){
 const land=await page.evaluate(async()=>await(await fetch('/assets/worldmap/countries.geojson')).json()),feature=land.features.find(f=>f.properties.name==='Greenland');const samples=[];
 // Sample land interiors beyond the antialiased coastline.
 for(let lat=61.3;lat<82;lat+=1.3)for(let lng=-65.7;lng<-15;lng+=1.3)if([-1.4,0,1.4].every(dx=>[-1.4,0,1.4].every(dy=>geoContains(feature,[lng+dx,lat+dy]))))samples.push({lat,lng});
 await page.setViewportSize({width:1280,height:1000});
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+24,{timeout:15000});
 // The preceding mobile preference click scrolls to the footer. Restore the
 // viewport before projecting land samples into screenshot coordinates.
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.waitForFunction(()=>scrollY===0&&document.getElementById('globe').getBoundingClientRect().top>=-1,{timeout:15000});
 await page.evaluate(()=>{const g=window.__reviewGlobe;window.__reviewGlobeState={view:g.pointOfView(),points:g.pointsData(),labels:g.labelsData(),rotating:g.controls().autoRotate};g.controls().autoRotate=false;g.pointsData([]).labelsData([]);});
 const results=[];try{for(const lng of [-48,-42,-36]){
  await page.evaluate(lng=>window.__reviewGlobe.pointOfView({lat:72,lng,altitude:1.7},0),lng);await page.waitForTimeout(500);
  const bytes=await page.screenshot(screenshotDir?{path:screenshotDir+'/greenland-'+Math.abs(lng)+'.png'}:{}),{data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const projected=await page.evaluate(samples=>{const bounds=document.getElementById('globe').getBoundingClientRect();return samples.map(p=>{const c=window.__reviewGlobe.getScreenCoords(p.lat,p.lng,.012);return {x:Math.round(c.x+bounds.x),y:Math.round(c.y+bounds.y)};});},samples);
  let checked=0,oceanPixels=0;for(const p of projected){if(p.x<0||p.y<0||p.x>=info.width||p.y>=info.height)continue;const i=(p.y*info.width+p.x)*info.channels,r=data[i],g=data[i+1],b=data[i+2];checked++;if(b>g+7&&b>r+15)oceanPixels++;}assert(checked>200);assert.equal(oceanPixels,0,'Greenland interior should have no ocean-colored mesh holes');results.push({longitude:lng,samples:checked,oceanPixels});}
 }finally{await page.evaluate(()=>{const g=window.__reviewGlobe,s=window.__reviewGlobeState;g.pointOfView(s.view,0).pointsData(s.points).labelsData(s.labels);g.controls().autoRotate=s.rotating;});}
 return {angles:results,landSurfaceStable:true};
}
