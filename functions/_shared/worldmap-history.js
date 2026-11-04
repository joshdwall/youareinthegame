import {HISTORY_KEY,historyForRange} from '../../runtime/worldmap/history-contract.js';import {COUNTRY_CENTERS} from '../../runtime/worldmap/country-centers.js';
export async function worldmapHistory({request,env}){
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 try{const snapshot=await env.YAITG_SESSION_KV?.get(HISTORY_KEY,'json');if(!snapshot)return json({ok:false,error:'Cloudflare history has not been synchronized yet. Map visitor counts are available separately.'},503);
  const range=new URL(request.url).searchParams.get('range')||'all',data=historyForRange(snapshot,range);let unmappedCount=0;
  const points=data.countryTotals.map(row=>{const center=COUNTRY_CENTERS[row.country];if(!center)unmappedCount+=row.count;return {id:'cf-'+row.country,...row,region:'',...(center||{}),mapped:!!center};});
  return json({ok:true,mode:'cloudflare',source:snapshot.source,dataset:snapshot.dataset,metric:'visits',metricLabel:'Visits',metricDefinition:'Cloudflare arrivals from an external website or direct link; not unique people or cookie-deduplicated browsers.',granularity:'country',points,totals:{visitors:data.reportedTotal,countries:points.filter(p=>p.country!=='ZZ').length,areas:data.days},coverage:data.coverage,fetchedAt:snapshot.fetchedAt,updatedAt:snapshot.fetchedAt,sampling:snapshot.sampling,reconciliation:{reportedTotal:data.reportedTotal,countryBreakdownTotal:data.breakdownTotal,difference:data.difference,unmappedCount},preview:env.YAITG_WORLDMAP_PREVIEW==='1',stale:Date.now()-Date.parse(snapshot.fetchedAt)>2*3600000});
 }catch(error){return json({ok:false,error:error.message},400);}
}
