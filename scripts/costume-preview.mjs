import fs from 'node:fs';
import path from 'node:path';
const cfg=JSON.parse(fs.readFileSync('config/costume-preview.json'));
const evidence=path.resolve('.preview-evidence');fs.mkdirSync(evidence,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2));
const sensitive=new Set([process.env.INFISICAL_CLIENT_ID,process.env.INFISICAL_CLIENT_SECRET].filter(Boolean));
const redact=s=>{let x=String(s);for(const v of sensitive)if(v)x=x.replaceAll(v,'[redacted]');return x;};
let infToken,cfToken,account,site,common,actions,actionsStore,usageProject;const usage={builds:0,deploys:0,cfApiCalls:0,wranglerCalls:0,startedAt:new Date().toISOString()};
const workspace='41982513-3430-4531-a227-9aa124fe024d';
async function inf(p,body){const r=await fetch('https://app.infisical.com'+p,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(infToken?{authorization:'Bearer '+infToken}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Infisical HTTP '+r.status);return r.json();}
async function secrets(folder){const q=new URLSearchParams({projectId:workspace,environment:'prod',secretPath:folder,viewSecretValue:'true',expandSecretReferences:'true',includeImports:'true'});const data=await inf('/api/v4/secrets?'+q);const rows=[...(data.imports||[]).flatMap(i=>i.secrets||[]),...(data.secrets||[])];const out=Object.fromEntries(rows.map(s=>[s.secretKey,s.secretValue]));for(const v of Object.values(out))if(v)sensitive.add(v);return out;}
async function cf(p,method='GET',body,raw=false,meta=false){usage.cfApiCalls++;actions?.record('cloudflare-api','worldmap.cloudflare.request',1,'5min');const r=await fetch('https://api.cloudflare.com/client/v4'+p.replaceAll('{account}',account),{method,headers:{authorization:'Bearer '+cfToken,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(raw){if(!r.ok)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status}`);return r.text();}const j=await r.json();if(!r.ok||j.success===false)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status} (${(j.errors||[]).map(e=>e.code).join(',')})`);return meta?j:j.result;}
const apiBase=()=>`/accounts/{account}/pages/projects/${cfg.project}`;
async function main(){
 const login=await inf('/api/v1/auth/universal-auth/login',{clientId:process.env.INFISICAL_CLIENT_ID,clientSecret:process.env.INFISICAL_CLIENT_SECRET});infToken=login.accessToken;sensitive.add(infToken);
 common=await secrets('/cloudflare');site=await secrets('/sites/youareinthegame');cfToken=common.CHATGPT_CLOUDFLARE_API_TOKEN||common['agents-write']||site['site.youareinthegame.cloudflare.api_token'];account=site['site.youareinthegame.cloudflare.account_id']||common.CLOUDFLARE_ACCOUNT_ID;
 if(!cfToken||!account)throw Error('Required deployment/Access credentials missing');
 if(process.argv.includes('--usage-audit')){const {auditWorldmapUsage}=await import('./worldmap-usage-audit.mjs');await auditWorldmapUsage({account,token:cfToken,save});return;}
 if(process.argv.includes('--history-audit')){const {auditCloudflareHistory}=await import('./cloudflare-history.mjs');await auditCloudflareHistory({account,save,tokens:[{name:'shared',value:common.CHATGPT_CLOUDFLARE_API_TOKEN},{name:'agents',value:common['agents-write']},{name:'site',value:site['site.youareinthegame.cloudflare.api_token']}]});return;}
 const envivo=await secrets('/envivo'),actionToken=envivo['connector.envivo.data.cli_token'];if(!actionToken)throw Error('Shared action-handler credential missing');
 const {createWorldmapActions,actionStore}=await import('./worldmap-actions.mjs');const actionStage=process.argv.includes('--shared-actions-rollout')?'shared-rollout':process.argv.includes('--production-only')?'production-check':process.argv.includes('--history-sync')?'history-sync':'preview-deploy';
 actions=createWorldmapActions({baseUrl:'https://envivo-data.joshdwall.workers.dev/enVivo/api/data',token:actionToken,repo:process.env.GITHUB_REPOSITORY||'joshdwall/youareinthegame',runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT||'1',stage:actionStage});
 usageProject=await cf(apiBase());const production=process.env.GITHUB_REF_NAME==='main';let actionNamespace;if(production)actionNamespace=usageProject.deployment_configs?.production?.kv_namespaces?.YAITG_SESSION_KV?.namespace_id;else actionNamespace=(await cf('/accounts/{account}/storage/kv/namespaces?per_page=1000')).find(n=>n.title===cfg.previewNamespace)?.id;
 if(!actionNamespace)throw Error('Tracking outbox namespace missing');actionsStore=actionStore(cf,actionNamespace);await actions.registerJob(actionsStore);actions.record('unrouted-actions','worldmap.'+actionStage+'.started',1,'month');
 if(process.argv.includes('--shared-actions-rollout')){let personalSecrets={};try{personalSecrets=await secrets('/sites/personal-website');}catch{}const githubSecrets=await secrets('/github'),githubToken=githubSecrets.ENVIVO_GITHUB_WRITE_TOKEN;if(!githubToken)throw Error('Shared source credential missing');const {rolloutSharedActions}=await import('./shared-action-rollout.mjs');await actions.run('worldmap.shared.rollout',()=>rolloutSharedActions({githubToken,cloudflareToken:cfToken,cloudflareTokens:[{name:'agents',value:common['agents-write']},{name:'personal-site',value:personalSecrets['site.personal-website.cloudflare.api_token']}],account,dataToken:actionToken,record:actions.record,save}));return;}
 if(process.argv.includes('--history-sync')){
  const branch=process.env.GITHUB_REF_NAME;if(branch!=='main'&&!branch?.startsWith('costume/'))throw Error('Unexpected history sync branch');
  let namespace;if(branch==='main'){const project=await cf(apiBase());namespace=project.deployment_configs?.production?.kv_namespaces?.YAITG_SESSION_KV?.namespace_id;}else{const spaces=await cf('/accounts/{account}/storage/kv/namespaces?per_page=1000');namespace=spaces.find(x=>x.title===cfg.previewNamespace)?.id;}
  if(!namespace)throw Error('History namespace missing');const {syncHistory}=await import('./cloudflare-history.mjs');await actions.run('worldmap.history.refresh',()=>syncHistory({token:common.CHATGPT_CLOUDFLARE_API_TOKEN,account,cf,namespace,save,tracker:actions}));return;
 }

 if(process.argv.includes('--production-only')){
  if(process.env.GITHUB_REF_NAME!=='main')throw Error('Production verification must run on main');
  let ready=false;for(let i=0;i<40;i++){const p=await cf(apiBase());const d=p.canonical_deployment;if(d?.deployment_trigger?.metadata?.commit_hash===process.env.GITHUB_SHA&&d.latest_stage?.status==='success'){ready=true;break;}await new Promise(r=>setTimeout(r,10000));}if(!ready)throw Error('Approved production commit has not finished deploying');
  const cambioTarget = 'https://app.youareinthegame.com/cambio/?animation=chef';
  for (const host of ['youareinthegame.com', 'www.youareinthegame.com']) {
   const redirect = await fetch('https://' + host + '/cambio/?animation=chef', { redirect: 'manual' });
   if (redirect.status !== 308 || redirect.headers.get('location') !== cambioTarget) throw Error('Incorrect Cambio redirect on ' + host);
  }
  const adminApi = await fetch('https://youareinthegame.com/api/cambio/runtime-config', { redirect: 'manual' });
  if (adminApi.status !== 404) throw Error('Public host serves the Cambio API');
  const url='https://youareinthegame.com';for(const path of ['/','/api/animations']){const r=await fetch(url+path,{headers:{'user-agent':'YAITG automated monitor'}});if(r.status!==200)throw Error('Production HTTP check failed: '+path);}
  const {chromium}=await import('playwright'),b=await chromium.launch();try{const page=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const {verifyResetBoundary}=await import('../tests/helpers/reset-boundary.mjs');const results=await verifyResetBoundary(page,url);if(errors.length)throw Error(errors.join('; '));save('production.json',{url,commit:process.env.GITHUB_SHA,resetCycles:results,browserErrors:errors});await page.screenshot({path:path.join(evidence,'production.png')});console.log('Production reset verification passed:',url);}finally{await b.close();}return;
 }
 throw Error('Select a public verification or history operation');
}
try{await main();}catch(e){save('failure.json',{error:redact(e.message)});console.error(redact(e.message));process.exitCode=1;}finally{
 if(actions&&actionsStore){
  try{await actions.completedJobs(actionsStore);}catch(e){save('action-jobs-failure.json',{error:redact(e.message)});process.exitCode=1;}
  if(process.argv.includes('--history-sync')||!process.argv.some(arg=>arg==='--browser-only'||arg==='--production-only'))try{
   const {collectWorldmapUsage}=await import('./worldmap-provider-usage.mjs');const production=process.env.GITHUB_REF_NAME==='main',bindings=usageProject.deployment_configs?.[production?'production':'preview']||{};
   const namespace=bindings.kv_namespaces?.YAITG_SESSION_KV?.namespace_id,database=bindings.d1_databases?.YAITG_WORLDMAP_DB;const gql=async(query,variables)=>{actions.record('cloudflare-api','worldmap.usage.analytics.request',1,'5min');actions.record('cloudflare-analytics','worldmap.usage.analytics.request',1,'5min');const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+cfToken,'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok||data.errors?.length)throw Error('Provider usage query failed: '+(data.errors||[]).map(e=>String(e.message).replace(/[a-f0-9]{32,64}/gi,'[id]')).join('; '));return data.data;};
   save('provider-usage-coverage.json',await collectWorldmapUsage({gql,account,namespace,database:database?.id||database?.database_id,tracker:actions}));
  }catch(e){save('provider-usage-failure.json',{error:redact(e.message)});console.error('Provider usage: '+redact(e.message));process.exitCode=1;}
  try{save('action-delivery.json',await actions.flush(actionsStore));}catch(e){save('action-delivery.json',{ok:false,pending:true,error:redact(e.message)});console.error('Action tracking delivery pending: '+redact(e.message));process.exitCode=1;}
 }
 usage.finishedAt=new Date().toISOString();const stage=process.argv.includes('--browser-only')?'browser':process.argv.includes('--production-only')?'production':'deploy';save('usage-'+stage+'.json',usage);let aggregate={...usage};if(stage==='browser'&&fs.existsSync(path.join(evidence,'usage-deploy.json'))){const deploy=JSON.parse(fs.readFileSync(path.join(evidence,'usage-deploy.json')));aggregate.startedAt=deploy.startedAt;for(const field of ['builds','deploys','cfApiCalls','wranglerCalls'])aggregate[field]+=deploy[field];}save('usage.json',aggregate);if(infToken){try{await inf('/api/v1/auth/token/revoke',{accessToken:infToken});}catch{console.error('Temporary token revocation could not be confirmed.');}}}

