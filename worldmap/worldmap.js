import {WORLDMAP_SETTINGS as settings} from '/runtime/worldmap/settings.js';
const $=id=>document.getElementById(id),number=new Intl.NumberFormat(),countries=new Intl.DisplayNames(['en'],{type:'region'}),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_VIEW=Object.freeze({lat:38.5,lng:-98,altitude:2.3});
const MIN_ALTITUDE=.012,MAX_ALTITUDE=5;
let lastRead=0,pegScale=1;
let globe,points=[],rotating=!reduced,visitorRequest,initialGlobeSettled=false;const country=code=>{try{return countries.of(code)||code;}catch{return code;}};
let maxPegCount = 1;
// Warm high-chroma pegs so they read on sage land (#7ab5a0) and teal ocean (#15374a).
// Avoid cool blues/greens that blend into the globe.
const pegColors = [[255, 214, 102], [232, 120, 32], [230, 45, 90]];
function pegColor(count) {
 const fraction = maxPegCount === 1 ? 0 : Math.log(Math.max(1, count)) / Math.log(maxPegCount);
 const step = Math.max(0, Math.min(2, fraction * 2));
 const start = Math.min(1, Math.floor(step));
 const blend = step - start;
 return 'rgb(' + pegColors[start].map((channel, index) =>
  Math.round(channel + (pegColors[start + 1][index] - channel) * blend)).join(',') + ')';
}
function locationName(point) {
 const name = [point.city, point.region, country(point.country)].filter(Boolean).join(', ');
 if (point.city) return name;
 const coordinate = (value,positive,negative) => Math.abs(value).toFixed(1)+'\u00b0'+(value < 0 ? negative : positive);
 return name + ' \u00b7 approximate area near ' + coordinate(point.lat,'N','S') + ', ' + coordinate(point.lng,'E','W');
}
function describePoint(point) {
 return locationName(point) + ' \u00b7 ' + number.format(point.count) + (point.count === 1 ? ' visitor' : ' visitors');
}
function select(point) {
 $('pegSelection').textContent = describePoint(point);
 $('areaSelection').textContent = describePoint(point);
 rotating = false;
 rotation();
}
function selectPeg(point) {
 select(point);
 const picker=$('nearbyPegs');
 const screen=globe.getScreenCoords(point.lat,point.lng,pegHeight(point));
 const nearby=globe.pointsData().filter(other=>{
  const longitudeGap=Math.abs(((other.lng-point.lng+540)%360)-180);
  if(Math.abs(other.lat-point.lat)>20 || (longitudeGap>25 && Math.abs(point.lat)<65))return false;
  const position=globe.getScreenCoords(other.lat,other.lng,pegHeight(other));
  return Math.hypot(position.x-screen.x,position.y-screen.y)<28;
 });
 picker.replaceChildren();
 picker.hidden=nearby.length<2;
 if(picker.hidden)return;
 const placeholder=new Option('Choose a nearby pin','');
 placeholder.disabled=true;
 picker.add(placeholder);
 for(const other of nearby)picker.add(new Option(describePoint(other),other.id));
 picker.value=point.id;
 picker.onchange=()=>select(nearby.find(other=>other.id===picker.value));
}
function pegRadius(point){return Math.min(1.55,.52+Math.sqrt(point.count)*.1)*pegScale;}
function pegHeight(point){return Math.min(.10,.023+Math.log2(point.count+1)*.009)*pegScale;}
function resizePegs({altitude}){
 const scale=Math.min(1,Math.max(.004,Math.pow(2, Math.round(Math.log2(Math.max(MIN_ALTITUDE,altitude))*12)/12)/1.6));
 if(scale===pegScale)return;
 pegScale=scale;
 globe?.pointRadius(pegRadius).pointAltitude(pegHeight);
}
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
 maxPegCount = points.reduce((max, point) => Math.max(max, point.count), 1);
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
   $('nearbyPegs').hidden=true;
   select(focus);
   const view = globe?.pointOfView();
   if (view) globe.pointOfView({ ...view, lat: focus.lat, lng: focus.lng }, reduced ? 0 : 700);
   $('areaSelection').textContent = name.textContent + ' · ' + total.textContent + (count === 1 ? ' unique browser' : ' unique browsers');
  });
  row.appendChild(button);
  list.appendChild(row);
 }
 filterCountries();
 list.scrollTop = scrollTop;
 showPins();
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
// Reveal the finished Earth before requesting visitor data.
const LAND_IMAGE='/img/worldmap-earth-v1.webp';
let landShown=false,pinsShown=false,pinRun=0;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
function markReady(){if(landShown&&pinsShown)$('globe').dataset.ready='true';}
function showPins(){
 if(!globe||!landShown)return;
 const target=points,run=++pinRun;
 if(pinsShown||reduced||!target.length){globe.pointsData(target);pinsShown=true;$('globe').dataset.pins='true';markReady();return;}
 const batch=Math.max(4,Math.ceil(target.length/8));let shown=0;
 const step=()=>{if(run!==pinRun)return;shown=Math.min(target.length,shown+batch);const visible=target.slice(0,shown);globe.pointsData(visible);if(shown<target.length)setTimeout(step,90);else{pinsShown=true;$('globe').dataset.pins='true';markReady();}};
 step();
}
async function landDone(){
 if(landShown)return;
 landShown=true;
 const host=$('globe');
 host.dataset.land='true';
 host.style.opacity='';
 if(!reduced&&host.animate)await host.animate([{opacity:0},{opacity:1}],{duration:550,easing:'ease-out'}).finished.catch(()=>{});
 initialGlobeSettled=true;
 await refresh();
}
function startGlobe(){try{
 if(typeof window.Globe!=='function')throw Error('Globe component unavailable');
 const host=$('globe');host.addEventListener('pointerdown',()=>{rotating=false;rotation();});globe=new window.Globe(host,{rendererConfig:{antialias:true,alpha:true},waitForGlobeReady:false,animateIn:false}).backgroundColor('#00000000').showAtmosphere(true).atmosphereColor('#75abc1').atmosphereAltitude(.14).showGraticules(true).pointLat('lat').pointLng('lng').pointColor(d=>pegColor(d.count)).pointAltitude(pegHeight).pointRadius(pegRadius).pointsTransitionDuration(0).pointLabel(point=>{const label=document.createElement("div");label.className="globe-tooltip";label.textContent=describePoint(point);return label;}).onPointClick(selectPeg).onZoom(resizePegs);
 globe.globeMaterial().color.set('#15374a');globe.globeMaterial().shininess=8;globe.renderer().setPixelRatio(Math.min(devicePixelRatio,1.5));globe.controls().enablePan=false;globe.controls().autoRotateSpeed=.35;globe.controls().minDistance=100*(1+MIN_ALTITUDE);globe.controls().maxDistance=100*(1+MAX_ALTITUDE);globe.pointOfView({...DEFAULT_VIEW},0);host.dataset.initialView=JSON.stringify(globe.pointOfView());
 const resize=()=>{globe.width(host.clientWidth).height(host.clientHeight);};new ResizeObserver(resize).observe(host);resize();rotation();host.dataset.shell='true';
 // Use the ocean globe as a fallback if the land image is delayed.
 const landImage=new Image();landImage.crossOrigin='anonymous';landImage.src=LAND_IMAGE;const landApplied=()=>globe.globeMaterial().map?nextFrame().then(landDone):nextFrame().then(landApplied);nextFrame().then(()=>landImage.decode()).then(()=>{globe.globeImageUrl(LAND_IMAGE);return landApplied();}).catch(landDone);setTimeout(landDone,4000);
 }catch{globe?.pauseAnimation();$('globe').hidden=true;$('globeFallback').hidden=false;document.querySelector('.globe-controls').hidden=true;document.querySelector('.globe-hint').hidden=true;initialGlobeSettled=true;void refresh();}}
function zoom(delta){if(!globe)return;const view=globe.pointOfView();globe.pointOfView({...view,altitude:Math.max(MIN_ALTITUDE,Math.min(MAX_ALTITUDE,view.altitude*delta))},reduced?0:250);}
$('zoomIn').onclick=()=>zoom(.65);$('zoomOut').onclick=()=>zoom(1/.65);$('rotateGlobe').onclick=()=>{rotating=!rotating;rotation();};$('resetGlobe').onclick=()=>globe?.pointOfView({...DEFAULT_VIEW},reduced?0:600);
$('globe').addEventListener('keydown',event=>{if(!globe)return;const view=globe.pointOfView(),keys={ArrowLeft:[0,-12],ArrowRight:[0,12],ArrowUp:[8,0],ArrowDown:[-8,0]};if(keys[event.key]){event.preventDefault();rotating=false;rotation();globe.pointOfView({...view,lat:Math.max(-85,Math.min(85,view.lat+keys[event.key][0])),lng:view.lng+keys[event.key][1]},reduced?0:120);}else if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?1/.65:.65);}});
document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&!event.target.closest('a,button,input,textarea,select,summary,#globe'))event.preventDefault();});
function refreshWhenDue() {
 if (!initialGlobeSettled || Date.now() - lastRead < settings.browserCacheSeconds * 1000) return;
 void refresh();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)globe?.pauseAnimation();else{globe?.resumeAnimation();refreshWhenDue();}});setInterval(()=>{if(!document.hidden)refreshWhenDue();},Math.min(60000,settings.browserCacheSeconds*1000));startGlobe();
