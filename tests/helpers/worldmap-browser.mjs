import assert from 'node:assert/strict';
export async function verifyWorldmap(page,base,{screenshotDir}={}){
 await page.setExtraHTTPHeaders({'user-agent':'Worldmap verification browser'});await page.goto(base+'/worldmap/',{waitUntil:'networkidle'});await page.waitForSelector('#globe[data-ready="true"]');await page.waitForFunction(()=>document.querySelector('#visitorTotal').textContent!=='—');
 const count=await page.locator('#visitorTotal').innerText(),initial=Number(count.replaceAll(',',''));assert(initial>=1,'This browser should have an approximate origin');
 for(let i=0;i<3;i++)await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#visitorTotal').innerText(),count,'Refreshes must not add visitors');
 await page.locator('#rotateGlobe').click();assert.equal(await page.locator('#rotateGlobe').getAttribute('aria-pressed'),'false');await page.locator('#zoomIn').click();await page.locator('#resetGlobe').click();await page.locator('#areaList button').first().click();assert.match(await page.locator('#areaSelection').innerText(),/visitor/);
 if(screenshotDir)await page.screenshot({path:screenshotDir+'/worldmap-desktop.png',fullPage:true});
 await page.locator('#excludeBrowser').click();await page.waitForFunction(expected=>Number(document.querySelector('#visitorTotal').textContent.replaceAll(',',''))===expected,initial-1);assert.equal(await page.locator('#countingLabel').innerText(),'This browser is excluded.');
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#visitorTotal').textContent!=='—');assert.equal(Number((await page.locator('#visitorTotal').innerText()).replaceAll(',','')),initial-1);
 await page.locator('#excludeBrowser').click();await page.waitForFunction(expected=>document.querySelector('#visitorTotal').textContent===expected,count);assert.equal(await page.locator('#countingLabel').innerText(),'One browser. One visitor.');
 await page.setViewportSize({width:390,height:844});await page.locator('#globe[data-ready="true"]').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout should not overflow horizontally');if(screenshotDir)await page.screenshot({path:screenshotDir+'/worldmap-mobile.png',fullPage:true});
 await page.locator('#excludeBrowser').click();await page.waitForFunction(()=>document.querySelector('#countingLabel').textContent==='This browser is excluded.');
 return {globeRendered:true,refreshesDeduplicated:true,exclusionRemovesOwnCount:true,preferencePersists:true,reenableRestoresOneCount:true,mobile:true,verificationBrowserExcluded:true};
}
