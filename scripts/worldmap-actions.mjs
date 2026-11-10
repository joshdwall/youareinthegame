import crypto from 'node:crypto';
import {createActionClient} from '../runtime/shared/action-handler/http-client.mjs';
import {recordActionCore,getActionSnapshotCore} from '../runtime/shared/global-action-tracker/core.mjs';
const PENDING_KEY='worldmap:actions:pending:v1';
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
 async function pendingKeys(store){const row=await store.get(PENDING_KEY);return Array.isArray(row?.keys)?row.keys:[];}
 async function rememberKey(store,key){const keys=await pendingKeys(store);if(keys.includes(key))return;keys.push(key);await store.put(PENDING_KEY,{keys:keys.slice(-40)});}
 async function dropKey(store,key){const keys=(await pendingKeys(store)).filter(name=>name!==key);await store.put(PENDING_KEY,{keys});}
 async function registerJob(store){
  if(context.runId.startsWith('local-')){context.visibility=process.env.GITHUB_REPOSITORY_VISIBILITY==='public'?'public':'private';record('github-actions','worldmap.local.runner.minutes',0,'month');return;}
  const key='worldmap:actions:job:'+new Date(now()).toISOString().slice(0,10)+':'+runId+':'+attempt;
  const existing=await store.get(key);if(existing){context.visibility=existing.visibility;return;}
  const repository=await github('repos/'+repo);context.visibility=repository.private?'private':'public';
  await store.put(key,{repo,runId:String(runId),attempt:String(attempt),visibility:context.visibility,completed:false},{completed:false});
  await rememberKey(store,key);
 }
 async function completedJobs(store){
  for(const key of await pendingKeys(store)){
   if(!key.startsWith('worldmap:actions:job:'))continue;
   const saved=await store.get(key);if(!saved){await dropKey(store,key);continue;}
   if(saved.completed){await dropKey(store,key);continue;}
   const data=await github('repos/'+saved.repo+'/actions/runs/'+saved.runId+'/attempts/'+saved.attempt+'/jobs?per_page=100');
   if(data.jobs.length===100)throw Error('GitHub job page requires pagination');
   const rows=data.jobs.filter(j=>j.status==='completed'&&j.started_at&&j.completed_at);
   const entries=rows.map(j=>({id:stableId('github-job:'+j.id),providerId:'github-actions',op:'worldmap.runner.minutes',actual:Math.ceil(Math.max(0,Date.parse(j.completed_at)-Date.parse(j.started_at))/60000),period:'month',atMs:Date.parse(j.started_at),repo:saved.repo,visibility:saved.visibility,actor:'youareinthegame',workflow:j.name,runId:saved.runId,reason:'Completed GitHub-hosted job duration rounded per job; visibility captured during execution'}));
   for(let i=0;i<entries.length;i+=100)await client.countBatch(entries.slice(i,i+100));
   if(data.jobs.length&&data.jobs.every(j=>j.status==='completed')){await store.put(key,{...saved,completed:true},{completed:true});await dropKey(store,key);}
  }
 }
 async function flush(store){
  const key='worldmap:actions:batch:'+new Date(now()).toISOString().slice(0,10)+':'+runId+':'+attempt+':'+stage;
  record('unrouted-actions','worldmap.tracker.delivery',1,'month');
  const existing=await store.get(key);if(existing?.delivered)return {ok:true,delivered:0,visibility:context.visibility,trackingOnly:true,replayed:false};const pendingCurrent=existing?.events?existing:{events:events(),delivered:false};await store.put(key,pendingCurrent,{delivered:false});await rememberKey(store,key);
  for(let i=0;i<pendingCurrent.events.length;i+=100)await client.countBatch(pendingCurrent.events.slice(i,i+100));
  let delivered=pendingCurrent.events.length;
  for(const itemName of await pendingKeys(store)){
   if(!itemName.startsWith('worldmap:actions:batch:')||itemName===key)continue;const pending=await store.get(itemName);if(!pending?.events||pending.delivered){if(pending?.delivered)await dropKey(store,itemName);continue;}
   for(let i=0;i<pending.events.length;i+=100){await client.countBatch(pending.events.slice(i,i+100));delivered+=Math.min(100,pending.events.length-i);}
   await store.put(itemName,{delivered:true,eventCount:pending.events.length},{delivered:true});await dropKey(store,itemName);
  }
  if(store.billable)record('cloudflare-api','worldmap.cloudflare.request',1,'5min');
  const finalCounters=events().filter(e=>!e.op.startsWith('worldmap.provider.'));let tailError;
  try{for(let i=0;i<finalCounters.length;i+=100)await client.countBatch(finalCounters.slice(i,i+100));}catch(error){tailError=error;}
  const latest=new Map(pendingCurrent.events.map(e=>[e.id,e]));for(const event of finalCounters)latest.set(event.id,event);
  await store.put(key,tailError?{events:[...latest.values()],delivered:false}:{delivered:true,eventCount:latest.size},{delivered:!tailError});if(!tailError)await dropKey(store,key);if(tailError)throw tailError;
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
  async list(){throw Error('KV prefix list is disabled. Replay uses worldmap:actions:pending:v1 exact keys.');}
 };
}
