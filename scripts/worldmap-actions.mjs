import crypto from 'node:crypto';
import {createActionClient} from '../runtime/shared/action-handler/http-client.mjs';
import {recordActionCore,getActionSnapshotCore} from '../runtime/shared/global-action-tracker/core.mjs';
const DAY=86400000;
export const stableId=text=>crypto.createHash('sha256').update(text).digest('hex');
export function createWorldmapActions({baseUrl,token,repo,runId,attempt='1',stage='sync',visibility='private',fetchImpl=fetch,now=()=>Date.now()}){
 const ledgerFetch=async(url,options)=>{const response=await fetchImpl(url,options);if(!response.ok){const body=await response.clone().json().catch(()=>null);throw Error('Action ledger HTTP '+response.status+(body?.error?': '+String(body.error).replace(/[a-f0-9]{32,64}/gi,'[identifier]').slice(0,300):''));}return response;};
 const counters=new Map(),observations=[],client=createActionClient({baseUrl,token,fetchImpl:ledgerFetch});
 const context={repo,runId:String(runId),attempt:String(attempt),stage,visibility};
 function record(providerId,op,actual=1,period='day'){
  if(!Number.isFinite(actual)||actual<0)throw Error('Invalid usage count');
  const atMs=now(),bucket=period==='month'?new Date(atMs).toISOString().slice(0,7):period==='5min'?Math.floor(atMs/300000):period==='hour'?new Date(atMs).toISOString().slice(0,13):new Date(atMs).toISOString().slice(0,10),key=[providerId,op,period,bucket].join(':');
  const old=counters.get(key);if(old)old.actual+=actual;else counters.set(key,{providerId,op,actual,period,atMs});
  recordActionCore({kind:'connector.call',calledBy:'youareinthegame',purpose:op,module:'worldmap',surface:'github-runner',meta:{provider:providerId,count:actual}});
 }
 function observe({providerId,op,actual,atMs,scope,detail}){
  if(!Number.isFinite(actual)||actual<0)throw Error('Invalid provider observation');
  observations.push({id:stableId(['provider-window',providerId,op,scope,atMs].join(':')),providerId,op,actual,atMs,period:'day',mode:'snapshot',visibility:'private',reason:JSON.stringify({...detail,capturedAtMs:now()})});
 }
 function events(){return [...[...counters.entries()].map(([key,e])=>({...e,id:stableId([repo,runId,attempt,stage,key].join(':')),mode:'snapshot',reason:JSON.stringify({source:'logical operation count',trackingOnly:true,capturedAtMs:now()})})),...observations].map(e=>({actor:'youareinthegame',repo,visibility:context.visibility,workflow:stage,runId:context.runId,...e}));}
 async function github(route){record('github-api','worldmap.github.request',1,'hour');const response=await fetchImpl('https://api.github.com/'+route,{headers:{accept:'application/vnd.github+json','user-agent':'worldmap-actions',...(process.env.GITHUB_TOKEN?{authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('GitHub usage API HTTP '+response.status);return response.json();}
 async function registerJob(store){
  if(context.runId.startsWith('local-')){context.visibility=process.env.GITHUB_REPOSITORY_VISIBILITY==='public'?'public':'private';record('github-actions','worldmap.local.runner.minutes',0,'month');return;}
  const key='worldmap:actions:job:'+new Date(now()).toISOString().slice(0,10)+':'+runId+':'+attempt;
  const existing=await store.get(key);if(existing){context.visibility=existing.visibility;return;}
  const repository=await github('repos/'+repo);context.visibility=repository.private?'private':'public';
  await store.put(key,{repo,runId:String(runId),attempt:String(attempt),visibility:context.visibility},{completed:false});
 }
 async function completedJobs(store){
  for(let d=0;d<7;d++)for(const key of await store.list('worldmap:actions:job:'+new Date(now()-d*DAY).toISOString().slice(0,10)+':')){
   if(key.metadata?.completed)continue;const saved=await store.get(key.name);if(!saved)continue;
   const data=await github('repos/'+saved.repo+'/actions/runs/'+saved.runId+'/attempts/'+saved.attempt+'/jobs?per_page=100');
   if(data.jobs.length===100)throw Error('GitHub job page requires pagination');
   const rows=data.jobs.filter(j=>j.status==='completed'&&j.started_at&&j.completed_at);
   const entries=rows.map(j=>({id:stableId('github-job:'+j.id),providerId:'github-actions',op:'worldmap.runner.minutes',actual:Math.ceil(Math.max(0,Date.parse(j.completed_at)-Date.parse(j.started_at))/60000),period:'month',atMs:Date.parse(j.started_at),repo:saved.repo,visibility:saved.visibility,actor:'youareinthegame',workflow:j.name,runId:saved.runId,reason:'Completed GitHub-hosted job duration rounded per job; visibility captured during execution'}));
   for(let i=0;i<entries.length;i+=100)await client.countBatch(entries.slice(i,i+100));
   if(data.jobs.length&&data.jobs.every(j=>j.status==='completed'))await store.put(key.name,saved,{completed:true});
  }
 }
 async function flush(store){
  const key='worldmap:actions:batch:'+new Date(now()).toISOString().slice(0,10)+':'+runId+':'+attempt+':'+stage;
  record('unrouted-actions','worldmap.tracker.delivery',1,'month');
  const existing=await store.get(key);if(existing?.delivered)return {ok:true,delivered:0,visibility:context.visibility,trackingOnly:true,replayed:false};const pendingCurrent=existing||{events:events()};await store.put(key,pendingCurrent,{delivered:false});
  for(let i=0;i<pendingCurrent.events.length;i+=100)await client.countBatch(pendingCurrent.events.slice(i,i+100));
  let delivered=pendingCurrent.events.length;
  for(let d=0;d<7;d++)for(const item of await store.list('worldmap:actions:batch:'+new Date(now()-d*DAY).toISOString().slice(0,10)+':')){
   if(item.name===key||item.metadata?.delivered)continue;const pending=await store.get(item.name);if(!pending?.events)continue;
   for(let i=0;i<pending.events.length;i+=100){await client.countBatch(pending.events.slice(i,i+100));delivered+=Math.min(100,pending.events.length-i);}
   await store.put(item.name,{delivered:true,eventCount:pending.events.length},{delivered:true});
  }
  if(store.billable)record('cloudflare-api','worldmap.cloudflare.request',1,'5min');
  const finalCounters=events().filter(e=>!e.op.startsWith('worldmap.provider.'));let tailError;
  try{for(let i=0;i<finalCounters.length;i+=100)await client.countBatch(finalCounters.slice(i,i+100));}catch(error){tailError=error;}
  const latest=new Map(pendingCurrent.events.map(e=>[e.id,e]));for(const event of finalCounters)latest.set(event.id,event);
  await store.put(key,tailError?{events:[...latest.values()]}:{delivered:true,eventCount:latest.size},{delivered:!tailError});if(tailError)throw tailError;
  return {ok:true,delivered,visibility:context.visibility,trackingOnly:true,bufferedEvents:getActionSnapshotCore().ringSize};
 }
 async function run(op,fn){record('unrouted-actions',op+'.started',1,'month');try{const result=await fn();record('unrouted-actions',op+'.completed',1,'month');return result;}catch(error){record('unrouted-actions',op+'.failed',1,'month');throw error;}}
 return {record,observe,events,github,registerJob,completedJobs,flush,context,run};
}
export function actionStore(cf,namespace){
 const base='/accounts/{account}/storage/kv/namespaces/'+namespace;
 return {billable:true,
  async get(key){try{return JSON.parse(await cf(base+'/values/'+encodeURIComponent(key),'GET',undefined,true));}catch(e){if(/HTTP 404/.test(e.message))return null;throw e;}},
  put:(key,value,metadata)=>cf(base+'/bulk','PUT',[{key,value:JSON.stringify(value),metadata}]),
  async list(prefix){const rows=[];let cursor='';for(let page=0;page<20;page++){const response=await cf(base+'/keys?limit=1000&prefix='+encodeURIComponent(prefix)+(cursor?'&cursor='+encodeURIComponent(cursor):''),'GET',undefined,false,true);rows.push(...response.result);cursor=response.result_info?.cursor;if(!cursor)return rows;}throw Error('Tracking queue listing exceeds safe page bound');}
 };
}
