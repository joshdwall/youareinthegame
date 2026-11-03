import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cfg=JSON.parse(fs.readFileSync('config/costume-preview.json'));
const evidence=path.resolve('.preview-evidence');fs.mkdirSync(evidence,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2));
const sensitive=new Set([process.env.INFISICAL_CLIENT_ID,process.env.INFISICAL_CLIENT_SECRET].filter(Boolean));
const redact=s=>{let x=String(s);for(const v of sensitive)if(v)x=x.replaceAll(v,'[redacted]');return x;};
let infToken,cfToken,accessToken,account,site,common;const usage={builds:0,deploys:0,cfApiCalls:0,wranglerCalls:0,startedAt:new Date().toISOString()};
const workspace='41982513-3430-4531-a227-9aa124fe024d';
async function inf(p,body){const r=await fetch('https://app.infisical.com'+p,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(infToken?{authorization:'Bearer '+infToken}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Infisical HTTP '+r.status);return r.json();}
async function secrets(folder){const q=new URLSearchParams({projectId:workspace,environment:'prod',secretPath:folder,viewSecretValue:'true',expandSecretReferences:'true',includeImports:'true'});const data=await inf('/api/v4/secrets?'+q);const rows=[...(data.secrets||[]),...(data.imports||[]).flatMap(i=>i.secrets||[])];const out=Object.fromEntries(rows.map(s=>[s.secretKey,s.secretValue]));for(const v of Object.values(out))if(v)sensitive.add(v);return out;}
async function cf(p,method='GET',body,raw=false){usage.cfApiCalls++;const r=await fetch('https://api.cloudflare.com/client/v4'+p.replaceAll('{account}',account),{method,headers:{authorization:'Bearer '+(p.includes('/access/')&&accessToken?accessToken:cfToken),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(raw){if(!r.ok)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status}`);return r.text();}const j=await r.json();if(!r.ok||j.success===false)throw Error(`Cloudflare ${method} ${redact(p)}: HTTP ${r.status} (${(j.errors||[]).map(e=>e.code).join(',')})`);return j.result;}
function run(exe,args,env={}){const r=spawnSync(exe,args,{encoding:'utf8',env:{...process.env,...env},maxBuffer:20e6});if(r.status!==0)throw Error(`${exe} failed: ${redact(r.stdout||'')} ${redact(r.stderr||'')}`);return r.stdout||'';}
function wrangler(args){usage.wranglerCalls++;return run('npx',['--yes',`wrangler@${cfg.wranglerVersion}`,...args],{CLOUDFLARE_API_TOKEN:cfToken,CLOUDFLARE_ACCOUNT_ID:account});}
const apiBase=()=>`/accounts/{account}/pages/projects/${cfg.project}`;
async function ensurePreviewAccess(apps){
 const domain=`*.${cfg.project}.pages.dev`;
 if(apps.some(a=>a.domain===domain||(a.self_hosted_domains||[]).includes(domain)))return;
 const policies=await cf('/accounts/{account}/access/policies');
 let admin=policies.find(p=>p.name?.toLowerCase()==='admin'&&p.decision==='allow'),template;
 let gameApps=apps,adminBase='/accounts/{account}/access';
 if(!gameApps.some(a=>a.domain?.startsWith('app.youareinthegame.com'))){
 const zones=await cf('/zones?name=youareinthegame.com');
  if(zones.length===1){sensitive.add(zones[0].id);adminBase=`/zones/${zones[0].id}/access`;gameApps=await cf(adminBase+'/apps');}
 }
 const gameAdmin=gameApps.find(a=>a.domain?.startsWith('app.youareinthegame.com'));
 if(gameAdmin){
  template=await cf(`${adminBase}/apps/${gameAdmin.id}`);
  const linked=await cf(`${adminBase}/apps/${gameAdmin.id}/policies`);
  const allow=linked.filter(p=>p.decision==='allow');
  if(!admin&&allow.length===1){const p=allow[0];if(p.include?.some(r=>r.everyone))throw Error('Refusing broad admin allow policy');admin=await cf('/accounts/{account}/access/policies','POST',{name:'YAITG preview Admin',decision:'allow',include:p.include,exclude:p.exclude||[],require:p.require||[]});}
 }
 if(!admin||!template?.allowed_idps?.length)throw Error('Existing game Admin policy and Cloudflare identity providers could not be resolved; Access read permissions/account scope require review. No preview deployed.');
 const tokens=await cf('/accounts/{account}/access/service_tokens');
 const token=tokens.find(t=>t.client_id===common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID);
 if(!token)throw Error('Existing preview service token not found');
 const name='YAITG costume preview automation';
 let service=policies.find(p=>p.name===name&&p.decision==='non_identity'&&p.include?.length===1&&p.include[0].service_token?.token_id===token.id);
 if(!service)service=await cf('/accounts/{account}/access/policies','POST',{name,decision:'non_identity',include:[{service_token:{token_id:token.id}}],exclude:[],require:[]});
 await cf('/accounts/{account}/access/apps','POST',{name:'YAITG costume previews',type:'self_hosted',domain,session_duration:'8h',allowed_idps:template.allowed_idps,auto_redirect_to_identity:template.auto_redirect_to_identity===true,app_launcher_visible:false,policies:[{id:service.id,precedence:1},{id:admin.id,precedence:2}]});
 save('access.json',{domain,adminPolicyReused:true,identityProvidersReused:true,scopedServiceToken:true});
}
function headers(){return {'CF-Access-Client-Id':common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID,'CF-Access-Client-Secret':common.CF_ACCESS_PAGES_PREVIEW_CLIENT_SECRET};}
async function verifyAccess(url){
 const u=new URL(url);if(!u.hostname.endsWith('.'+cfg.project+'.pages.dev'))throw Error('Unexpected preview host');
 const publicResponse=await fetch(new URL('/cambio/',u),{redirect:'manual'});
 const loc=publicResponse.headers.get('location')||'';
 if(![302,303].includes(publicResponse.status)||!loc.includes('/cdn-cgi/access/login'))throw Error('Preview Access protection not confirmed; refusing to expose authoring');
 const checks=[];
 for(const p of ['/','/cambio/','/api/animations']){const r=await fetch(new URL(p,u),{headers:headers(),redirect:'manual'});checks.push({path:p,status:r.status});if(r.status!==200)throw Error(`Protected preview check ${p}: HTTP ${r.status}`);}
 return checks;
}
async function browser(url){
 const {chromium}=await import('playwright');const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900}});const origin=new URL(url).origin;
 await context.route('**/*',route=>route.continue({headers:new URL(route.request().url()).origin===origin?{...route.request().headers(),...headers()}:route.request().headers()}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('#mainCreature');await page.waitForFunction(()=>window.__yaitgEffect&&window.__yaitgPrepared?.ready,{timeout:30000});
 for(let i=0;i<10;i++){await page.locator('#mainCreature').click();await page.waitForTimeout(180);}
 await page.waitForTimeout(8000);await page.screenshot({path:path.join(evidence,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await page.locator('#mainCreature').click();await page.screenshot({path:path.join(evidence,'mobile.png'),fullPage:true});
 await page.goto(new URL('/cambio/',url).href,{waitUntil:'networkidle'});await page.waitForSelector('#costumeWorkshop');await page.locator('#costumeWorkshop summary').first().click();await page.locator('#costumeLoadBandana').click();await page.waitForFunction(()=>document.querySelector('#costumeId').value==='bandit-reusable');
 await page.locator('#costumePreview').click();await page.waitForTimeout(250);await page.locator('#costumeStop').click();await page.waitForFunction(()=>!document.querySelector('#costumeSaveDraft').disabled);await page.screenshot({path:path.join(evidence,'cambio.png'),fullPage:true});
 await browser.close();save('browser.json',{ok:errors.length===0,errors});if(errors.length)throw Error('Preview browser errors: '+errors.join('; '));
}
async function main(){
 const login=await inf('/api/v1/auth/universal-auth/login',{clientId:process.env.INFISICAL_CLIENT_ID,clientSecret:process.env.INFISICAL_CLIENT_SECRET});infToken=login.accessToken;sensitive.add(infToken);
 common=await secrets('/cloudflare');site=await secrets('/sites/youareinthegame');cfToken=common['agents-write']||site['site.youareinthegame.cloudflare.api_token'];account=common.CLOUDFLARE_ACCOUNT_ID||site['site.youareinthegame.cloudflare.account_id'];
 if(!cfToken||!account||!common.CF_ACCESS_PAGES_PREVIEW_CLIENT_ID||!common.CF_ACCESS_PAGES_PREVIEW_CLIENT_SECRET)throw Error('Required deployment/Access credentials missing');
 if(process.argv.includes('--browser-only')){const url=process.env.COSTUME_PREVIEW_URL;await verifyAccess(url);await browser(url);return;}
 const branch=process.env.GITHUB_REF_NAME||'';if(!branch.startsWith('costume/')||branch===cfg.productionBranch)throw Error('Preview workflow must run on a costume feature branch');
 const project=await cf(apiBase());if(project.production_branch!==cfg.productionBranch)throw Error('Unexpected production branch; audit required');
 const prod=project.deployment_configs?.production||{};const prodKv=prod.kv_namespaces?.YAITG_SESSION_KV?.namespace_id;const prodBucket=prod.r2_buckets?.YAITG_ASSETS_R2?.name||prod.r2_buckets?.YAITG_ASSETS_R2?.bucket_name||'youareinthegame-assets';
 if(!prodKv)throw Error('Cannot identify production costume KV for checkpoint');
 const backup={checkpoint:cfg.checkpoint,commit:process.env.GITHUB_SHA,capturedAt:new Date().toISOString(),productionDeployment:project.canonical_deployment?.id||project.latest_deployment?.id,keys:{}};
 for(const key of ['cambio:runtime-config','cambio:placements']){
  try{backup.keys[key]=JSON.parse(await cf(`/accounts/{account}/storage/kv/namespaces/${prodKv}/values/${encodeURIComponent(key)}`,'GET',undefined,true));}catch(e){throw Error('Unable to capture required production baseline key '+key);}
 }
 const assetSources=[...new Set((backup.keys['cambio:runtime-config'].animations||[]).flatMap(a=>(a.elements||[]).map(e=>e.src)).filter(Boolean))];
 if(assetSources.length>cfg.maxAssets)throw Error('Asset inventory exceeds configured free-tier preview bound');
 save('baseline.json',backup);save('asset-manifest.json',{sources:assetSources,staticAssetsPinnedByCheckpoint:true});
 const recent=await cf(apiBase()+'/deployments?env=preview&per_page=25');if(recent.length===25)recent.push(...await cf(apiBase()+'/deployments?env=preview&per_page=25&page=2'));const month=new Date().toISOString().slice(0,7);
 if(recent.filter(d=>(d.created_on||'').startsWith(month)).length>=cfg.maxMonthlyPreviewRuns)throw Error('Monthly preview run budget reached');
 accessToken=site['site.youareinthegame.cloudflare.api_token']||cfToken;const accessApps=await cf('/accounts/{account}/access/apps');
 const previewHost='costume-scalable-workflow.'+cfg.project+'.pages.dev';
 const covers=domain=>domain&&new RegExp('^'+domain.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')+'$').test(previewHost);
 if(!accessApps.some(a=>covers(a.domain)||(a.self_hosted_domains||[]).some(covers)))await ensurePreviewAccess(accessApps);
 const spaces=await cf('/accounts/{account}/storage/kv/namespaces?per_page=1000');let kv=spaces.find(x=>x.title===cfg.previewNamespace);
 if(!kv)kv=await cf('/accounts/{account}/storage/kv/namespaces','POST',{title:cfg.previewNamespace});if(kv.id===prodKv)throw Error('Preview KV must differ from production');sensitive.add(kv.id);sensitive.add(prodKv);
 const buckets=await cf('/accounts/{account}/r2/buckets');if(!(buckets.buckets||buckets).some(x=>x.name===cfg.previewBucket))await cf('/accounts/{account}/r2/buckets','POST',{name:cfg.previewBucket});if(cfg.previewBucket===prodBucket)throw Error('Preview bucket must differ from production');
 for(const [key,value]of Object.entries(backup.keys)){
  let exists=true;try{await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/values/${encodeURIComponent(key)}`,'GET',undefined,true);}catch{exists=false;}
  if(!exists)await cf(`/accounts/{account}/storage/kv/namespaces/${kv.id}/bulk`,'PUT',[{key,value:JSON.stringify(value)}]);
 }
 const previewVars=project.deployment_configs?.preview?.env_vars||{};
 if(!previewVars.YAITG_SESSION_SECRET)await cf(apiBase(),'PATCH',{deployment_configs:{preview:{env_vars:{...previewVars,YAITG_SESSION_SECRET:{type:'secret_text',value:crypto.randomBytes(32).toString('hex')}}}}});
 run('npm',['run','build']);usage.builds++;
 const configFile=path.resolve('.preview-wrangler.toml');const original=fs.readFileSync('wrangler.toml','utf8');
 fs.writeFileSync(configFile,original+`\n[env.preview]\n[env.preview.vars]\nYAITG_RATE_MAX = "120"\nYAITG_RATE_WINDOW_SEC = "3600"\n[[env.preview.kv_namespaces]]\nbinding = "YAITG_SESSION_KV"\nid = "${kv.id}"\n[[env.preview.r2_buckets]]\nbinding = "YAITG_ASSETS_R2"\nbucket_name = "${cfg.previewBucket}"\n`);
 const output=wrangler(['pages','deploy','dist','--project-name',cfg.project,'--branch','costume-scalable-workflow','--commit-hash',process.env.GITHUB_SHA,'--config',configFile]);usage.deploys++;
 const urls=[...output.matchAll(/https:\/\/[a-z0-9-]+\.youareinthegame-web\.pages\.dev/g)].map(m=>m[0]);const url=urls.find(x=>!x.includes('costume-scalable-workflow.'))||urls[0];if(!url)throw Error('Preview deployment URL missing');
 const checks=await verifyAccess(url);save('preview.json',{url,branch,commit:process.env.GITHUB_SHA,isolated:true,checks});
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`url=${url}\n`);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Costume preview\n\n[Open protected preview](${url}) · [Cambio](${url}/cambio/)\n\nProduction remains unchanged. Isolated preview KV/R2. Baseline backup is in the private evidence artifact.\n`);
 console.log('Protected costume preview:',url);
}
try{await main();}catch(e){save('failure.json',{error:redact(e.message)});console.error(redact(e.message));process.exitCode=1;}finally{usage.finishedAt=new Date().toISOString();save('usage.json',usage);if(infToken){try{await inf('/api/v1/auth/token/revoke',{accessToken:infToken});}catch{console.error('Temporary token revocation could not be confirmed.');}}}
