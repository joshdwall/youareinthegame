import {WORLDMAP_SETTINGS as settings} from '/runtime/worldmap/settings.js';
const $=id=>document.getElementById(id),number=new Intl.NumberFormat(),countries=new Intl.DisplayNames(['en'],{type:'region'}),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_VIEW=Object.freeze({lat:38.5,lng:-98,altitude:2.3});
let lastRead=0;
let globe,points=[],rotating=!reduced,visitorRequest;const country=code=>{try{return countries.of(code)||code;}catch{return code;}};
function select(point){$('areaSelection').textContent=`${point.region?point.region+', ':''}${country(point.country)} · ${number.format(point.count)} ${(point.count===1?'visitor':'visitors')+' in this approximate area'}.`;globe?.pointOfView({lat:point.lat,lng:point.lng,altitude:1.6},reduced?0:700);if(globe){rotating=false;rotation();}}
function rotation(){if(globe)globe.controls().autoRotate=rotating;$('rotateGlobe').textContent=rotating?'Pause rotation':'Start rotation';$('rotateGlobe').setAttribute('aria-pressed',String(rotating));}
function searchKey(text) {
 return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}
function filterCountries() {
 const query = searchKey($('countrySearch').value.trim());
 const rows = [...$('areaList').children];
 let matches = 0;
 for (const row of rows) {
  row.hidden = !row.dataset.search.includes(query);
  if (!row.hidden) matches++;
 }
 $('countryNoResults').hidden = !rows.length || matches > 0;
}
$('countrySearch').addEventListener('input', () => {
 filterCountries();
 $('areaList').scrollTop = 0;
});
function render(data) {
 points = data.points;
 $('visitorTotal').textContent = number.format(data.totals.visitors);
 $('countryTotal').textContent = number.format(data.totals.countries);
 $('mapStatus').textContent = data.preview ? 'Preview globe' : '';
 $('emptyMap').hidden = points.length > 0;

 // Pins stay at approximate origins. Each country row focuses its busiest area.
 const byCountry = new Map();
 for (const point of points) {
  const entry = byCountry.get(point.country);
  if (entry) {
   entry.count += point.count;
   if (point.count > entry.focus.count) entry.focus = point;
  } else {
   byCountry.set(point.country, {count: point.count, focus: point});
  }
 }
 const rows = [...byCountry.values()].sort((a,b) => b.count - a.count || country(a.focus.country).localeCompare(country(b.focus.country)));
 const list = $('areaList');
 const scrollTop = list.scrollTop;
 list.replaceChildren();
 for (const {count, focus} of rows) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  const name = document.createElement('span');
  const total = document.createElement('strong');
  button.type = 'button';
  name.textContent = country(focus.country);
  row.dataset.search = searchKey(name.textContent + ' ' + focus.country);
  total.textContent = number.format(count);
  button.append(name, total);
  button.addEventListener('click', () => {
   select(focus);
   $('areaSelection').textContent = name.textContent + ' · ' + total.textContent + (count === 1 ? ' unique browser' : ' unique browsers');
  });
  row.appendChild(button);
  list.appendChild(row);
 }
 filterCountries();
 list.scrollTop = scrollTop;
 if (globe) globe.pointsData(points).labelsData(points.slice(0,100));
}
async function refresh() {
 if (visitorRequest) return;
 visitorRequest = true;
 try {
  const response = await fetch('/api/worldmap');
  const data = await response.json();
  if (!response.ok || !data.ok || data.uniqueBy !== 'browser') throw Error('Visitor counts unavailable');
  render(data);
  lastRead = Date.now();
 } catch {
  $('mapStatus').textContent = 'Visitor counts are temporarily unavailable.';
 } finally {
  visitorRequest = false;
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
$('zoomIn').onclick=()=>zoom(-.4);$('zoomOut').onclick=()=>zoom(.4);$('rotateGlobe').onclick=()=>{rotating=!rotating;rotation();};$('resetGlobe').onclick=()=>globe?.pointOfView({...DEFAULT_VIEW},reduced?0:600);
$('globe').addEventListener('keydown',event=>{if(!globe)return;const view=globe.pointOfView(),keys={ArrowLeft:[0,-12],ArrowRight:[0,12],ArrowUp:[8,0],ArrowDown:[-8,0]};if(keys[event.key]){event.preventDefault();rotating=false;rotation();globe.pointOfView({...view,lat:Math.max(-85,Math.min(85,view.lat+keys[event.key][0])),lng:view.lng+keys[event.key][1]},reduced?0:120);}else if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?.4:-.4);}});
document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&!event.target.closest('a,button,input,textarea,select,summary,#globe'))event.preventDefault();});
function refreshWhenDue() {
 if (Date.now() - lastRead < settings.browserCacheSeconds * 1000) return;
 void refresh();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)globe?.pauseAnimation();else{globe?.resumeAnimation();refreshWhenDue();}});setInterval(()=>{if(!document.hidden)refreshWhenDue();},Math.min(60000,settings.browserCacheSeconds*1000));void refresh();void startGlobe();
