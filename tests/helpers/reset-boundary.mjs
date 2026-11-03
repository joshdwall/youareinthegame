
export async function verifyResetBoundary(page,url){
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__yaitgEffect&&window.__yaitgPrepared?.ready);
 return page.evaluate(async()=>{
  const effect=window.__yaitgEffect,container=effect.container;const results=[];
  for(let cycle=0;cycle<2;cycle++){
   const previous=window.__yaitgUpcoming.id;effect.__liveStormResetMs=400;
   const threshold=effect.resetThreshold-effect.clickCount;for(let i=0;i<threshold;i++)effect.onSporeClick(160,160);
   const started=performance.now();let fadeEnd=null,normalAt=null,finalDeadline=null;
   const end=e=>{if(e.target===container&&e.propertyName==='background-color')fadeEnd=performance.now();};container.addEventListener('transitionend',end);
   while(effect.isActivationInteractionBusy()){
    const final=document.querySelector('.lightning-flash.final-reset');if(final&&finalDeadline===null)finalDeadline=performance.now()+parseFloat(getComputedStyle(final).transitionDuration)*1000;const color=getComputedStyle(container).backgroundColor;
    if(color==='rgb(122, 181, 160)'&&normalAt===null&&performance.now()-started>1000)normalAt=performance.now();
    if(performance.now()-started>12000)throw Error('Round remained busy beyond reset deadline');
    await new Promise(requestAnimationFrame);
   }
   const unlocked=performance.now();container.removeEventListener('transitionend',end);
   effect.onSporeClick(160,160);if(effect.clickCount!==1)throw Error('First click after lighting reset did not count');
   if(window.__yaitgUpcoming.id===previous)throw Error('Next costume was not prepared during fade');
   const gap=Math.max(0,unlocked-(fadeEnd??normalAt??unlocked),finalDeadline===null?0:unlocked-finalDeadline);if(gap>100)throw Error('Extra post-fade lock: '+gap+'ms');
   results.push({played:previous,next:window.__yaitgUpcoming.id,postFadeLockMs:Math.round(gap),firstClickCount:effect.clickCount});
  }return results;
 });
}
