import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cfg=JSON.parse(fs.readFileSync('config/costume-preview.json'));
const evidence=path.resolve('.preview-evidence');fs.mkdirSync(evidence,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2));
const sensitive=new Set([process.env.INFISICAL_CLIENT_ID,process.env.INFISICAL_CLIENT_SECRET].filter(Boolean));
const redact=s=>{let x=String(s);for(const v of sensitive)if(v)x=x.replaceAll(v,'[redacted]');return x;};
let infToken,cfToken,accessToken,account,site,common,actions,actionsStore,usageProject;const usage={builds:0,deploys:0,cfApiCalls:0,wranglerCalls:0,startedAt:new Date().toISOString()};
const workspace='41982513-3430-4531-a227-9aa124fe024d';
async function inf(p,body){const r=await fetch('https://app.infisical.com'+p,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(infToken?{authorization:'Bearer '+infToken}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Infisical HTTP '+r.status);return r.json();}
async function secrets(folder){const q=new URLSearchParams({projectId:workspace,environment:'prod',secretPath:folder,viewSecretValue:'true',expandSecretReferences:'true',includeImports:'true'});const data=await inf('/api/v4/secrets?'+q);const rows=[...(data.imports||[]).flatMap(i=>i.secrets||[]),...(data.secrets||[])];const out=Object.fromEntries(rows.map(s=>[s.secretKey,s.secretValue]));for(const v of Object.values(out))if(v)sensitive.add(v);return out;}
async function cf(p,method='GET',body,raw=false,meta=false){usage.cfApiCalls++;actions?.record('cloudflare-api','worldmap.cloudflare.request',1,'5min');const r=await fetch('https://api.cloudflare.com/client/v4'+p.replaceAll('{account}',account),{method,headers:{authorization:'Bearer '+(p.includes('/access/')&&accessToken?accessToken:cfToken),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(raw){if(!r.ok)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status}`);return r.text();}const j=await r.json();if(!r.ok||j.success===false)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status} (${(j.errors||[]).map(e=>e.code).join(',')})`);return meta?j:j.result;}
function run(exe,args,env={}){if(process.platform==='win32'&&exe==='npx'){args=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npx-cli.js'),...args];exe=process.execPath;}const r=spawnSync(exe,args,{encoding:'utf8',env:{...process.env,...env},maxBuffer:20e6});if(r.status!==0)throw Error(`${exe} failed: ${redact(r.stdout||'')} ${redact(r.stderr||'')}`);return r.stdout||'';}
function wrangler(args){usage.wranglerCalls++;return run('npx',['--yes',`wrangler@${cfg.wranglerVersion}`,...args],{CLOUDFLARE_API_TOKEN:cfToken,CLOUDFLARE_ACCOUNT_ID:account});}
async function cfList(p){const rows=[];for(let page=1;page<=20;page++){const j=await cf(p+(p.includes('?')?'&':'?')+`per_page=50&page=${page}`,'GET',undefined,false,true);if(!Array.isArray(j.result))throw Error('Unexpected Cloudflare list response');rows.push(...j.result);if(j.result_info?.total_pages?page>=j.result_info.total_pages:j.result.length<50)return rows;}throw Error('Cloudflare list exceeds safe pagination bound');}
const apiBase=()=>`/accounts/{account}/pages/projects/${cfg.project}`;
async function ensurePreviewAccess(apps){
 const domain=`*.${cfg.project}.pages.dev`;
 const existing=apps.find(a=>a.domain===domain||(a.self_hosted_domains||[]).includes(domain));
 if(existing){
  const linked=await cfList(`/accounts/{account}/access/apps/${existing.id}/policies`);
  const tokens=await cfList('/accounts/{account}/access/service_tokens');const token=tokens.find(t=>t.client_id===common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID);
  if(token&&linked.some(p=>p.decision==='non_identity'&&p.include?.some(r=>r.service_token?.token_id===token.id))&&linked.some(p=>p.decision==='allow')&&!linked.some(p=>p.decision==='bypass'))return;
 }
 const policies=await cfList('/accounts/{account}/access/policies');
 let admin=policies.find(p=>['admin','yaitg preview admin'].includes(p.name?.toLowerCase())&&p.decision==='allow'),template;
 let gameApps=apps,adminBase='/accounts/{account}/access';
 if(!gameApps.some(a=>a.domain?.startsWith('app.youareinthegame.com'))){
 const zones=await cf('/zones?name=youareinthegame.com');
  if(zones.length===1){sensitive.add(zones[0].id);adminBase=`/zones/${zones[0].id}/access`;gameApps=await cfList(adminBase+'/apps');}
 }
 const gameAdmin=gameApps.find(a=>a.domain?.startsWith('app.youareinthegame.com'));
 if(gameAdmin){
  template=await cf(`${adminBase}/apps/${gameAdmin.id}`);
  const linked=await cf(`${adminBase}/apps/${gameAdmin.id}/policies`);
  const allow=linked.filter(p=>p.decision==='allow');
  if(!admin&&allow.length===1){const p=allow[0];if(p.include?.some(r=>r.everyone))throw Error('Refusing broad admin allow policy');admin=await cf('/accounts/{account}/access/policies','POST',{name:'YAITG preview Admin',decision:'allow',include:p.include,exclude:p.exclude||[],require:p.require||[]});}
 }
 if(!admin||!template?.allowed_idps?.length)throw Error('Existing game Admin policy and Cloudflare identity providers could not be resolved; Access read permissions/account scope require review. No preview deployed.');
 const tokens=await cfList('/accounts/{account}/access/service_tokens');
 const token=tokens.find(t=>t.client_id===common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID);
 if(!token)throw Error('Existing preview service token not found');
 if(token.expires_at&&new Date(token.expires_at)<new Date())throw Error('Existing preview service token has expired');
 const name='YAITG costume preview automation';
 let service=policies.find(p=>p.name===name&&p.decision==='non_identity'&&p.include?.length===1&&p.include[0].service_token?.token_id===token.id);
 if(!service)service=await cf('/accounts/{account}/access/policies','POST',{name,decision:'non_identity',include:[{service_token:{token_id:token.id}}],exclude:[],require:[]});
 const body={name:'YAITG costume previews',type:'self_hosted',domain,session_duration:'8h',allowed_idps:template.allowed_idps,auto_redirect_to_identity:template.auto_redirect_to_identity===true,app_launcher_visible:false,policies:[{id:service.id,precedence:1},{id:admin.id,precedence:2}]};
 if(existing){
  const linked=await cf(`/accounts/{account}/access/apps/${existing.id}/policies`);
  if(!linked.some(p=>p.id===service.id)&&linked.some(p=>p.decision==='bypass'))throw Error('Existing preview bypass policy requires review');
  if(!linked.some(p=>p.id===service.id))await cf(`/accounts/{account}/access/apps/${existing.id}`,'PUT',{...body,policies:[{id:service.id,precedence:1},...linked.map((p,i)=>({id:p.id,precedence:i+2}))]});
 }else await cf('/accounts/{account}/access/apps','POST',body);
 save('access.json',{domain,adminPolicyReused:true,identityProvidersReused:true,scopedServiceToken:true});
}
function headers(){return {'CF-Access-Client-Id':common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID,'CF-Access-Client-Secret':common.CF_ACCESS_PAGES_PREVIEW_CLIENT_SECRET};}
async function verifyAccess(url){
 const u=new URL(url);if(!u.hostname.endsWith('.'+cfg.project+'.pages.dev'))throw Error('Unexpected preview host');
 const publicResponse=await fetch(new URL('/cambio/',u),{redirect:'manual',headers:{'user-agent':'YAITG automated monitor'}});
 const loc=publicResponse.headers.get('location')||'';
 if(![302,303].includes(publicResponse.status)||!loc.includes('/cdn-cgi/access/login'))throw Error('Preview Access protection not confirmed; refusing to expose authoring');
 const checks=[];
 for(const p of ['/','/cambio/','/api/animations']){const r=await fetch(new URL(p,u),{headers:{...headers(),'user-agent':'YAITG automated monitor'},redirect:'manual'});checks.push({path:p,status:r.status});if(r.status!==200)throw Error(`Protected preview check ${p}: HTTP ${r.status}`);}
 return checks;
}
async function verifyReady(url){let last;for(let attempt=1;attempt<=8;attempt++){try{return await verifyAccess(url);}catch(e){last=e;if(attempt<8)await new Promise(resolve=>setTimeout(resolve,10000));}}throw last;}
async function browser(url){
 const {chromium}=await import('playwright');const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900}});const origin=new URL(url).origin;
 let stage='public load';try{
 await context.route('**/*',route=>route.continue({headers:new URL(route.request().url()).origin===origin?{...route.request().headers(),...headers()}:route.request().headers()}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const {verifyResetBoundary}=await import('../tests/helpers/reset-boundary.mjs');save('reset-boundary.json',await verifyResetBoundary(page,url));
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('#mainCreature');await page.waitForFunction(()=>window.__yaitgEffect&&window.__yaitgPrepared?.ready,{timeout:30000});
 stage='public clicks';for(let i=0;i<10;i++){await page.locator('#mainCreature').click({force:true});await page.waitForTimeout(180);}
 await page.waitForTimeout(8000);await page.screenshot({path:path.join(evidence,'desktop.png'),fullPage:true});
 stage='mobile';await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await page.locator('#mainCreature').click({force:true});await page.screenshot({path:path.join(evidence,'mobile.png'),fullPage:true});
 stage='editor';
 await page.goto(new URL('/cambio/',url).href,{waitUntil:'networkidle'});await page.waitForSelector('#costumeWorkshop');await page.locator('#costumeWorkshop summary').first().click();await page.locator('#costumeLoadBandana').click();await page.waitForFunction(()=>document.querySelector('#costumeId').value==='bandit-reusable');
 await page.locator('#costumePreview').click();await page.waitForTimeout(250);await page.locator('#costumeStop').click();await page.waitForFunction(()=>!document.querySelector('#costumeSaveDraft').disabled);await page.screenshot({path:path.join(evidence,'cambio.png'),fullPage:true});
 stage='stock upload and draft save';await page.locator('#costumeId').fill('verification-bandana');await page.locator('#costumeName').fill('Bandana verification');
 const {default:sharp}=await import('sharp');const stock=await sharp('assets/animations/cowboy/hat.webp').png().toBuffer();await page.locator('#costumeImages').setInputFiles({name:'stock-cowboy-hat.png',mimeType:'image/png',buffer:stock});
 await page.waitForFunction(()=>document.querySelectorAll('#costumeAccessoryEditors fieldset').length===2&&!document.querySelector('#costumeSaveDraft').disabled);
 await page.locator('#costumeSaveDraft').click();await page.waitForFunction(()=>document.querySelector('#costumeWorkshopStatus').textContent.startsWith('Saved as draft'));
 const draftHidden=await page.evaluate(async()=>!(await(await fetch('/api/animations')).json()).animations.some(a=>a.id==='verification-bandana'));if(!draftHidden)throw Error('Verification draft leaked into public pool');
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#costumeWorkshop');
 // The animation list is virtualized in the mobile sidebar. Verify persisted
 // server state after reload rather than requiring an off-screen row to mount.
 await page.waitForFunction(async()=>{const data=await(await fetch('/api/cambio/runtime-config',{cache:'no-store'})).json();const saved=data.config?.animations?.find(a=>a.id==='verification-bandana');return saved?.label==='Bandana verification'&&saved.live===false&&saved.elements?.length===2;},null,{timeout:65000,polling:1000});
 save('draft-verification.json',{uploadedStock:true,savedAndReloaded:true,excludedFromPublicPool:true});
 if(cfg.worldmap){stage='visitor globe';const map=await context.newPage();const {verifyWorldmap}=await import('../tests/helpers/worldmap-browser.mjs');save('worldmap-browser.json',await verifyWorldmap(map,url,{screenshotDir:evidence,requireHistory:true,verifyRouting:true}));await map.close();}
 save('browser.json',{ok:errors.length===0,errors});if(errors.length)throw Error('Preview browser errors: '+errors.join('; '));
 }catch(e){throw Error(`Browser ${stage}: ${e.message}`);}finally{await browser.close();}
}
async function main(){
 const login=await inf('/api/v1/auth/universal-auth/login',{clientId:process.env.INFISICAL_CLIENT_ID,clientSecret:process.env.INFISICAL_CLIENT_SECRET});infToken=login.accessToken;sensitive.add(infToken);
 common=await secrets('/cloudflare');site=await secrets('/sites/youareinthegame');cfToken=common.CHATGPT_CLOUDFLARE_API_TOKEN||common['agents-write']||site['site.youareinthegame.cloudflare.api_token'];account=site['site.youareinthegame.cloudflare.account_id']||common.CLOUDFLARE_ACCOUNT_ID;
 if(!cfToken||!account||!common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID||!common.CF_ACCESS_PAGES_PREVIEW_CLIENT_SECRET)throw Error('Required deployment/Access credentials missing');
 if(process.argv.includes('--usage-audit')){const {auditWorldmapUsage}=await import('./worldmap-usage-audit.mjs');await auditWorldmapUsage({account,token:cfToken,save});return;}
 if(process.argv.includes('--history-audit')){const {auditCloudflareHistory}=await import('./cloudflare-history.mjs');await auditCloudflareHistory({account,save,tokens:[{name:'shared',value:common.CHATGPT_CLOUDFLARE_API_TOKEN},{name:'agents',value:common['agents-write']},{name:'site',value:site['site.youareinthegame.cloudflare.api_token']}]});return;}
 const envivo=await secrets('/envivo'),actionToken=envivo['connector.envivo.data.cli_token'];if(!actionToken)throw Error('Shared action-handler credential missing');
 const {createWorldmapActions,actionStore}=await import('./worldmap-actions.mjs');const actionStage=process.argv.includes('--shared-actions-rollout')?'shared-rollout':process.argv.includes('--browser-only')?'preview-browser':process.argv.includes('--production-only')?'production-check':process.argv.includes('--history-sync')?'history-sync':'preview-deploy';
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
  const url='https://youareinthegame.com';for(const path of ['/','/api/animations']){const r=await fetch(url+path,{headers:{'user-agent':'YAITG automated monitor'}});if(r.status!==200)throw Error('Production HTTP check failed: '+path);}
  const {chromium}=await import('playwright'),b=await chromium.launch();try{const page=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const {verifyResetBoundary}=await import('../tests/helpers/reset-boundary.mjs');const results=await verifyResetBoundary(page,url);if(errors.length)throw Error(errors.join('; '));save('production.json',{url,commit:process.env.GITHUB_SHA,resetCycles:results,browserErrors:errors});await page.screenshot({path:path.join(evidence,'production.png')});console.log('Production reset verification passed:',url);}finally{await b.close();}return;
 }
 if(process.argv.includes('--browser-only')){const url=process.env.COSTUME_PREVIEW_URL;await verifyReady(url);await browser(url);return;}
 const branch=process.env.GITHUB_REF_NAME||'';if(!branch.startsWith('costume/')||branch===cfg.productionBranch)throw Error('Preview workflow must run on a costume feature branch');
 const project=await cf(apiBase());if(project.production_branch!==cfg.productionBranch)throw Error('Unexpected production branch; audit required');
 const prod=project.deployment_configs?.production||{};const prodKv=prod.kv_namespaces?.YAITG_SESSION_KV?.namespace_id;const prodBucket=prod.r2_buckets?.YAITG_ASSETS_R2?.name||prod.r2_buckets?.YAITG_ASSETS_R2?.bucket_name||'youareinthegame-assets';
 if(!prodKv)throw Error('Cannot identify production costume KV for checkpoint');
 const expectedKv=fs.readFileSync('wrangler.toml','utf8').match(/\[\[kv_namespaces\]\][\s\S]*?\bid\s*=\s*"([^"]+)"/)?.[1];if(!expectedKv||prodKv!==expectedKv)throw Error('Configured account/project does not match the checkpoint production KV binding');
 const backup={checkpoint:cfg.checkpoint,commit:process.env.GITHUB_SHA,capturedAt:new Date().toISOString(),productionDeployment:project.canonical_deployment?.id||project.latest_deployment?.id,keys:{}};
 for(const key of ['cambio:runtime-config','cambio:placements']){
  try{backup.keys[key]=JSON.parse(await cf(`/accounts/{account}/storage/kv/namespaces/${prodKv}/values/${encodeURIComponent(key)}`,'GET',undefined,true));}catch(e){throw Error('Unable to capture required production baseline key '+key);}
 }
 const assetSources=[...new Set((backup.keys['cambio:runtime-config'].animations||[]).flatMap(a=>(a.elements||[]).map(e=>e.src)).filter(Boolean))];
 if(assetSources.length>cfg.maxAssets)throw Error('Asset inventory exceeds configured free-tier preview bound');
 save('baseline.json',backup);save('asset-manifest.json',{sources:assetSources,staticAssetsPinnedByCheckpoint:true});
 const recent=[];for(let page=1;page<=40;page++){const batch=await cf(apiBase()+`/deployments?env=preview&per_page=25&page=${page}`);recent.push(...batch);if(batch.length<25)break;if(page===40)throw Error('Deployment budget pagination exceeded');}const month=new Date().toISOString().slice(0,7);
 const previewRuns=recent.filter(d=>(d.created_on||'').startsWith(month)&&d.deployment_trigger?.metadata?.branch==='costume-scalable-workflow').length;
 save('preview-budget.json',{month,previewRuns,limit:cfg.maxMonthlyPreviewRuns});
 if(previewRuns>=cfg.maxMonthlyPreviewRuns)throw Error('Monthly preview run budget reached');
 accessToken=common.CHATGPT_CLOUDFLARE_API_TOKEN||site['site.youareinthegame.cloudflare.api_token']||cfToken;const accessApps=await cfList('/accounts/{account}/access/apps');
 const previewHost='costume-scalable-workflow.'+cfg.project+'.pages.dev';
 const covers=domain=>domain&&new RegExp('^'+domain.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')+'$').test(previewHost);
 await ensurePreviewAccess(accessApps);
 const spaces=await cf('/accounts/{account}/storage/kv/namespaces?per_page=1000');let kv=spaces.find(x=>x.title===cfg.previewNamespace);
 if(!kv)kv=await cf('/accounts/{account}/storage/kv/namespaces','POST',{title:cfg.previewNamespace});if(kv.id===prodKv)throw Error('Preview KV must differ from production');sensitive.add(kv.id);sensitive.add(prodKv);
 const buckets=await cf('/accounts/{account}/r2/buckets');if(!(buckets.buckets||buckets).some(x=>x.name===cfg.previewBucket))await cf('/accounts/{account}/r2/buckets','POST',{name:cfg.previewBucket});if(cfg.previewBucket===prodBucket)throw Error('Preview bucket must differ from production');
 for(const [key,value]of Object.entries(backup.keys)){
  let exists=true;try{await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/values/${encodeURIComponent(key)}`,'GET',undefined,true);}catch{exists=false;}
  if(!exists)await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/bulk`,'PUT',[{key,value:JSON.stringify(value)}]);
 }
 if(cfg.worldmap){const {syncHistory}=await import('./cloudflare-history.mjs');await actions.run('worldmap.history.refresh',()=>syncHistory({token:common.CHATGPT_CLOUDFLARE_API_TOKEN,account,cf,namespace:kv.id,save,tracker:actions}));}
 const previewVars=project.deployment_configs?.preview?.env_vars||{};
 let worldmap;
 if(cfg.worldmap){const {provisionWorldmap}=await import('./worldmap-cloud.mjs');worldmap=await provisionWorldmap({cf,config:cfg.worldmap,primaryToken:cfToken,fallbackToken:common['agents-write'],redactValue:value=>sensitive.add(value),withToken:async(token,fn)=>{const previous=cfToken;cfToken=token;try{return await fn();}finally{cfToken=previous;}}});save('worldmap-bindings.json',worldmap);}
 const sessionMarker='costume:preview-session:v1';let independentSession=false;
 try{independentSession=JSON.parse(await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/values/${encodeURIComponent(sessionMarker)}`,'GET',undefined,true))?.independent===true;}catch{}
 if(!previewVars.YAITG_SESSION_SECRET||!independentSession){await cf(apiBase(),'PATCH',{deployment_configs:{preview:{env_vars:{...previewVars,YAITG_SESSION_SECRET:{type:'secret_text',value:crypto.randomBytes(32).toString('hex')}}}}});await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/bulk`,'PUT',[{key:sessionMarker,value:JSON.stringify({independent:true,createdAt:new Date().toISOString()})}]);}
 run('npm',['run','build']);usage.builds++;
 const configFile=path.resolve('wrangler.toml');const original=fs.readFileSync('wrangler.toml','utf8');
 const productionMap=worldmap&&!original.includes('YAITG_WORLDMAP_DB')?`\n[[d1_databases]]\nbinding = "YAITG_WORLDMAP_DB"\ndatabase_name = "${worldmap.production.name}"\ndatabase_id = "${worldmap.production.id}"\n`:'';
 fs.writeFileSync(configFile,original+productionMap+`\n[env.preview]\n[env.preview.vars]\nYAITG_WORLDMAP_PREVIEW = "1"\nYAITG_RATE_MAX = "120"\nYAITG_RATE_WINDOW_SEC = "3600"\n[[env.preview.kv_namespaces]]\nbinding = "YAITG_SESSION_KV"\nid = "${kv.id}"\n[[env.preview.r2_buckets]]\nbinding = "YAITG_ASSETS_R2"\nbucket_name = "${cfg.previewBucket}"\n`+(worldmap?`\n[[env.preview.d1_databases]]\nbinding = "YAITG_WORLDMAP_DB"\ndatabase_name = "${worldmap.preview.name}"\ndatabase_id = "${worldmap.preview.id}"\n`:''));
 let output;try{output=wrangler(['pages','deploy','dist','--project-name',cfg.project,'--branch','costume-scalable-workflow','--commit-hash',process.env.GITHUB_SHA]);usage.deploys++;}finally{fs.writeFileSync(configFile,original);}
 const deployedProject=await cf(apiBase());const deployedProd=deployedProject.deployment_configs?.production||{},deployedPreview=deployedProject.deployment_configs?.preview||{};
 if(deployedProd.kv_namespaces?.YAITG_SESSION_KV?.namespace_id!==prodKv)throw Error('Production KV binding changed unexpectedly');
 const deployedProdBucket=deployedProd.r2_buckets?.YAITG_ASSETS_R2?.name||deployedProd.r2_buckets?.YAITG_ASSETS_R2?.bucket_name||'youareinthegame-assets';if(deployedProdBucket!==prodBucket)throw Error('Production R2 binding changed unexpectedly');
 if(deployedPreview.kv_namespaces?.YAITG_SESSION_KV?.namespace_id!==kv.id)throw Error('Deployed preview KV binding does not match isolated namespace');
 const boundBucket=deployedPreview.r2_buckets?.YAITG_ASSETS_R2?.name||deployedPreview.r2_buckets?.YAITG_ASSETS_R2?.bucket_name;
 if(boundBucket!==cfg.previewBucket)throw Error('Deployed preview R2 binding does not match isolated bucket');
 if(worldmap){const binding=deployedPreview.d1_databases?.YAITG_WORLDMAP_DB;if((binding?.id||binding?.database_id)!==worldmap.preview.id)throw Error('Preview worldmap D1 binding is not isolated');save('worldmap-isolation.json',{previewD1Separate:true,productionDatabaseUntouched:true});}
 save('isolation.json',{productionKvUnchanged:true,previewKvSeparate:true,previewBucketSeparate:true,previewSessionIndependent:true,checkedAt:new Date().toISOString()});
 const urls=[...output.matchAll(/https:\/\/[a-z0-9-]+\.youareinthegame-web\.pages\.dev/g)].map(m=>m[0]);const url=urls.find(x=>!x.includes('costume-scalable-workflow.'))||urls[0];if(!url)throw Error('Preview deployment URL missing');
 save('deployment.json',{url,branch,commit:process.env.GITHUB_SHA});
 const checks=await verifyReady(url);save('preview.json',{url,branch,commit:process.env.GITHUB_SHA,isolated:true,checks});
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`url=${url}\n`);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Costume preview\n\n[Open protected preview](${url}) · [Cambio](${url}/cambio/)\n\nProduction remains unchanged. Isolated preview KV/R2. Baseline backup is in the private evidence artifact.\n`);
 console.log('Protected costume preview:',url);
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

