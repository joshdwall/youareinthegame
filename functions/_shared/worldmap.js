import {WORLDMAP_SETTINGS} from '../../runtime/worldmap/settings.js';
import {cleanPlaceName, cityAreaKey, nearestLargeCity} from './nearest-city.js';
const COOKIE='yaitg_worldmap',EXCLUDE='yaitg_worldmap_exclude',YEAR=31536000;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(p=>p.trim().split(/=(.*)/s).slice(0,2)).filter(p=>p.length===2));
function cookie(name,value,url,httpOnly=true){const shared=['youareinthegame.com','www.youareinthegame.com'].includes(url.hostname)?'; Domain=youareinthegame.com':'';return `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax${url.protocol==='https:'?'; Secure':''}${httpOnly?'; HttpOnly':''}${shared}`;}
async function hmac(secret,text){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function identity(request,env){const value=cookies(request)[COOKIE];if(!value||!env.YAITG_SESSION_SECRET)return null;const [id,signature]=value.split('.');if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(signature||''))return null;const expected=await hmac(env.YAITG_SESSION_SECRET,'worldmap-cookie:'+id);let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^signature.charCodeAt(i);return difference?null:{id,hash:await hmac(env.YAITG_SESSION_SECRET,'worldmap-visitor:'+id)};}
export function areaFromCloudflare(cf){
 if(!cf||cf.latitude===undefined||cf.longitude===undefined||cf.latitude===null||cf.longitude===null||cf.latitude===''||cf.longitude==='')return null;
 const lat=Number(cf.latitude),lng=Number(cf.longitude),country=cf.country;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180||!/^[A-Z]{2}$/.test(country||'')||['XX','T1'].includes(country))return null;
 const city=cleanPlaceName(cf.city),region=cleanPlaceName(cf.region);
 if(city){
  // Keep one approximate center per named locality without retaining raw coordinates.
  return {key:cityAreaKey(country,region,city),lat:Math.round(lat*10)/10,lng:Math.round(lng*10)/10,country,region,city};
 }
 const nearest=nearestLargeCity(lat,lng,country,region);
 if(nearest)return nearest;
 const y=Math.min(179,Math.floor(lat+90)),x=Math.min(359,Math.floor(lng+180));
 return {key:`${country}:${y}:${x}`,lat:y-89.5,lng:x-179.5,country,region};
}
export async function recordWorldmapVisit(request,env){
 if(!env.YAITG_WORLDMAP_DB||!env.YAITG_SESSION_SECRET||cookies(request)[EXCLUDE]==='1')return null;
 if(/bot|crawler|spider|headless|playwright|monitor|healthcheck|^node$|undici|curl|wget|python-requests|go-http-client/i.test(request.headers.get('user-agent')||'')||Number(request.cf?.botManagement?.score??100)<10)return null;
 if(await identity(request,env))return null;
 const area=areaFromCloudflare(request.cf);if(!area)return null;
 const id=crypto.randomUUID(),hash=await hmac(env.YAITG_SESSION_SECRET,'worldmap-visitor:'+id),day=new Date().toISOString().slice(0,10),db=env.YAITG_WORLDMAP_DB;
 // Versioned city keys store the display-name pair in the existing region column.
 const result=await db.batch([
  db.prepare('INSERT INTO worldmap_daily(day) VALUES(?) ON CONFLICT(day) DO NOTHING').bind(day),
  db.prepare('INSERT INTO worldmap_areas(area_key,lat,lng,country,region) SELECT ?,?,?,?,? WHERE (SELECT visitors FROM worldmap_daily WHERE day=?)<10000 ON CONFLICT(area_key) DO NOTHING').bind(area.key,area.lat,area.lng,area.country,area.city?JSON.stringify([area.region,area.city]):area.region,day),
  db.prepare('INSERT INTO worldmap_visitors(visitor_hash,area_key,first_day) SELECT ?,?,? WHERE (SELECT visitors FROM worldmap_daily WHERE day=?)<10000 ON CONFLICT(visitor_hash) DO NOTHING').bind(hash,area.key,day,day)
 ]);
 if(!result[2]?.meta?.changes)return null;
 const signature=await hmac(env.YAITG_SESSION_SECRET,'worldmap-cookie:'+id);return cookie(COOKIE,id+'.'+signature,new URL(request.url));
}
export async function worldmapData({request,env}){
 if(!env.YAITG_WORLDMAP_DB)return json({ok:false,error:'The visitor globe is not connected yet.'},503);
 const key=new Request(new URL('/api/worldmap?public=3',request.url));const cache=globalThis.caches?.default;const cached=await cache?.match(key);if(cached)return cached;
 const db=env.YAITG_WORLDMAP_DB,totalSql='SELECT COALESCE(SUM(visitors),0) AS visitors,COUNT(*) AS areas,COUNT(DISTINCT country) AS countries FROM worldmap_areas WHERE visitors>0';
 let [points,total]=await db.batch([db.prepare('SELECT area_key AS id,lat,lng,country,region,visitors AS count FROM worldmap_areas WHERE visitors>0 ORDER BY visitors DESC,area_key LIMIT 2001'),db.prepare(totalSql)]),gridDegrees=1;
 // Coarsen crowded views instead of silently dropping less-visited origins.
 for(const step of [2,5,10,20,45,180]){
  if(points.results.length<=2000)break;gridDegrees=step;
  const y=`CAST((lat+90)/${step} AS INTEGER)`,x=`CAST((lng+180)/${step} AS INTEGER)`;
  const sql=`SELECT country||':${step}:'||${y}||':'||${x} AS id,${y}*${step}-90+${step}/2.0 AS lat,${x}*${step}-180+${step}/2.0 AS lng,country,CASE WHEN MIN(region)=MAX(region) AND MIN(area_key NOT LIKE 'city:%')=1 THEN MIN(region) ELSE '' END AS region,SUM(visitors) AS count FROM worldmap_areas WHERE visitors>0 GROUP BY country,${y},${x} ORDER BY count DESC LIMIT 2001`;
  [points,total]=await db.batch([db.prepare(sql),db.prepare(totalSql)]);
 }
 const origins=points.results.map(point=>{
  if(!point.id.startsWith('city:'))return point;
  const [region,city]=JSON.parse(point.region);
  return {...point,region,city};
 });
 const response=json({ok:true,points:origins,totals:total.results[0],approximate:true,uniqueBy:'browser',preview:env.YAITG_WORLDMAP_PREVIEW==='1',updatedAt:new Date().toISOString(),displayLimit:2000,gridDegrees},200,{'cache-control':'public, max-age='+WORLDMAP_SETTINGS.visitorCacheSeconds});await cache?.put(key,response.clone());return response;
}
export async function excludeWorldmapBrowser({request,env}){
 const url=new URL(request.url);if(request.headers.get('origin')!==url.origin)return json({ok:false,error:'Same-origin request required'},403);
 if(!env.YAITG_WORLDMAP_DB)return json({ok:false,error:'Visitor counting is unavailable'},503);
 let body;try{body=await request.json();}catch{return json({ok:false,error:'Invalid request'},400);}if(typeof body.excluded!=='boolean')return json({ok:false,error:'Choose whether to exclude this browser'},400);
 const who=await identity(request,env);if(who)await env.YAITG_WORLDMAP_DB.prepare('UPDATE worldmap_visitors SET excluded=? WHERE visitor_hash=? AND excluded!=?').bind(body.excluded?1:0,who.hash,body.excluded?1:0).run();
 await globalThis.caches?.default?.delete(new Request(new URL('/api/worldmap?public=3',url)));
 return json({ok:true,excluded:body.excluded},200,{'set-cookie':cookie(EXCLUDE,body.excluded?'1':'0',url,false)});
}
