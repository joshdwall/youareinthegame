import {WORLDMAP_SETTINGS as settings} from '/runtime/worldmap/settings.js';
const $=id=>document.getElementById(id),number=new Intl.NumberFormat(),countries=new Intl.DisplayNames(['en'],{type:'region'}),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_VIEW=Object.freeze({lat:38.5,lng:-98,altitude:2.3});
const CACHE_KEY='worldmap:history-display:v2';let lastRead=0;
let globe,points=[],rotating=!reduced,visitorRequest;const country=code=>{try{return countries.of(code)||code;}catch{return code;}};
const excluded=()=>document.cookie.split(';').some(c=>c.trim()==='yaitg_worldmap_exclude=1');
function preference(){const value=excluded();$('excludeBrowser').textContent=value?'Count this browser':'Don’t count this browser';$('countingLabel').textContent=value?'This browser is excluded.':'Your browser’s counting preference';}
function select(point){$('areaSelection').textContent=`${point.region?point.region+', ':''}${country(point.country)} · ${number.format(point.count)} ${(point.count===1?'visitor':'visitors')+' in this approximate area'}.`;globe?.pointOfView({lat:point.lat,lng:point.lng,altitude:1.6},reduced?0:700);if(globe){rotating=false;rotation();}}
function rotation(){if(globe)globe.controls().autoRotate=rotating;$('rotateGlobe').textContent=rotating?'Pause rotation':'Start rotation';$('rotateGlobe').setAttribute('aria-pressed',String(rotating));}
function render(data){
 points=data.points;$('areaSelection').textContent='Choose a blue pin to explore an area.';$('visitorTotal').textContent=number.format(data.totals.visitors);$('countryTotal').textContent=number.format(data.totals.countries);$('mapStatus').textContent=data.stale?'Showing the latest saved counts.':data.preview?'Preview globe':'';$('emptyMap').hidden=points.length>0;
 $('areaList').replaceChildren();for(const point of data.points){const li=document.createElement('li'),button=document.createElement('button'),label=document.createElement('span'),count=document.createElement('strong'),small=document.createElement('small');button.type='button';label.textContent=point.region||country(point.country);small.textContent=point.region?country(point.country)+' · Approximate area':'Approximate area';label.appendChild(small);count.textContent=number.format(point.count);button.setAttribute('aria-label',`${country(point.country)}, ${point.count} unique browsers. Show area on globe`);button.append(label,count);button.addEventListener('click',()=>select(point));li.appendChild(button);$('areaList').appendChild(li);}
 if(globe)globe.pointColor(()=>'#69bce5').pointsData(points).labelsData(points.slice(0,100));
}
function readCache(){try{const value=JSON.parse(localStorage.getItem(CACHE_KEY));return value?.data?.ok&&value.data.metric==='visits'&&Array.isArray(value.data.points)&&value.data.totals&&Number.isFinite(value.data.totals.visitors)&&Date.now()-value.savedAt>=0&&Date.now()-value.savedAt<settings.browserCacheSeconds*1000?value:null;}catch{return null;}}
async function refreshHistory(force) {
 const cached = force ? null : readCache();
 let data = cached?.data;
 if (!data) {
  const response = await fetch('/api/worldmap?source=cloudflare&range=all', {cache: force ? 'reload' : 'default'});
  data = await response.json();
  if (!response.ok || !data.ok) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({savedAt: Date.now(), data})); } catch {}
 }
 const total = $('historyTotal');
 total.textContent = 'Historical visits (Cloudflare): ' + number.format(data.totals.visitors);
 total.hidden = false;
}
async function refresh(force = false) {
 visitorRequest?.abort();
 const request = new AbortController();
 visitorRequest = request;
 $('refreshMap').disabled = true;
 try {
  const response = await fetch('/api/worldmap', {cache: force ? 'reload' : 'default', signal: request.signal});
  const data = await response.json();
  if (!response.ok || !data.ok || data.uniqueBy !== 'browser') throw Error('Visitor counts unavailable');
  if (request.signal.aborted) return;
  render(data);
  lastRead = Date.now();
 } catch {
  if (!request.signal.aborted) $('mapStatus').textContent = 'Visitor counts are temporarily unavailable. Please try again.';
 } finally {
  if (visitorRequest === request) $('refreshMap').disabled = false;
 }
}
async function startGlobe(){try{
 if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
 const land=await(await fetch('/assets/worldmap/countries.geojson')).json();if(typeof window.Globe!=='function')throw Error('Globe component unavailable');
 const host=$('globe');globe=new window.Globe(host,{rendererConfig:{antialias:true,alpha:true}}).backgroundColor('#00000000').showAtmosphere(true).atmosphereColor('#75abc1').atmosphereAltitude(.14).showGraticules(true).polygonsData(land.features).polygonCapColor(()=> '#7ab5a0').polygonSideColor(()=> '#567c6c').polygonStrokeColor(()=> '#c6d5bb').polygonCapCurvatureResolution(1).polygonAltitude(.012).polygonsTransitionDuration(0).pointLat('lat').pointLng('lng').pointColor(()=> '#69bce5').pointAltitude(d=>Math.min(.17,.035+Math.log2(d.count+1)*.012)).pointRadius(d=>Math.min(1.3,.3+Math.sqrt(d.count)*.1)).pointsTransitionDuration(reduced?0:500).pointLabel(d=>{const node=document.createElement('div');node.className='globe-tooltip';node.textContent=`${d.region?d.region+', ':''}${country(d.country)} · ${number.format(d.count)} ${d.count===1?'visitor':'visitors'}`;return node;}).onPointClick(select).labelLat('lat').labelLng('lng').labelText(d=>String(d.count)).labelColor(()=> '#ffe5bc').labelAltitude(d=>Math.min(.19,.05+Math.log2(d.count+1)*.012)).labelSize(1.5).labelDotRadius(.15).labelResolution(2);
 globe.globeMaterial().color.set('#15374a');globe.globeMaterial().shininess=8;globe.renderer().setPixelRatio(Math.min(devicePixelRatio,1.5));globe.controls().enablePan=false;globe.controls().autoRotateSpeed=.35;globe.controls().minDistance=150;globe.controls().maxDistance=600;globe.pointOfView({...DEFAULT_VIEW},0);host.dataset.initialView=JSON.stringify(globe.pointOfView());
 const resize=()=>{globe.width(host.clientWidth).height(host.clientHeight);};new ResizeObserver(resize).observe(host);resize();rotation();globe.pointsData(points).labelsData(points.slice(0,100));host.dataset.ready='true';
 }catch{globe?.pauseAnimation();$('globe').hidden=true;$('globeFallback').hidden=false;document.querySelector('.globe-controls').hidden=true;document.querySelector('.globe-hint').hidden=true;}}
function zoom(delta){if(!globe)return;const view=globe.pointOfView();globe.pointOfView({...view,altitude:Math.max(.6,Math.min(4,view.altitude+delta))},reduced?0:250);}
$('zoomIn').onclick=()=>zoom(-.4);$('zoomOut').onclick=()=>zoom(.4);$('rotateGlobe').onclick=()=>{rotating=!rotating;rotation();};$('resetGlobe').onclick=()=>globe?.pointOfView({...DEFAULT_VIEW},reduced?0:600);$('refreshMap').onclick=()=>{void refresh(true);void refreshHistory(true).catch(()=>{});};
$('globe').addEventListener('keydown',event=>{if(!globe)return;const view=globe.pointOfView(),keys={ArrowLeft:[0,-12],ArrowRight:[0,12],ArrowUp:[8,0],ArrowDown:[-8,0]};if(keys[event.key]){event.preventDefault();rotating=false;rotation();globe.pointOfView({...view,lat:Math.max(-85,Math.min(85,view.lat+keys[event.key][0])),lng:view.lng+keys[event.key][1]},reduced?0:120);}else if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?.4:-.4);}});
$('excludeBrowser').onclick=async()=>{const button=$('excludeBrowser');button.disabled=true;try{const response=await fetch('/api/worldmap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({excluded:!excluded()})}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Could not change counting preference');preference();$('excludeStatus').textContent=data.excluded?'This browser’s count has been removed. Future visits here won’t add one.':'This browser can be counted again.';if(!data.excluded)await fetch('/worldmap/',{cache:'no-store'});await refresh(true);}catch(error){$('excludeStatus').textContent=error.message;}finally{button.disabled=false;}};
document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&!event.target.closest('a,button,input,textarea,select,summary,#globe'))event.preventDefault();});
function refreshWhenDue() {
 if (Date.now() - lastRead < settings.browserCacheSeconds * 1000) return;
 void refresh();
 void refreshHistory(false).catch(() => {});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)globe?.pauseAnimation();else{globe?.resumeAnimation();refreshWhenDue();}});setInterval(()=>{if(!document.hidden)refreshWhenDue();},Math.min(60000,settings.browserCacheSeconds*1000));preference();void refresh();void refreshHistory(false).catch(()=>{});void startGlobe();
