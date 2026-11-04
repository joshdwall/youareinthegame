import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
/** Approved shared rollout: private source remains in the runner temp directory, never public artifacts. */
export async function rolloutSharedActions({githubToken,cloudflareToken,cloudflareTokens=[],account,dataToken,record,save}){
 const lock=JSON.parse(fs.readFileSync('config/action-runtime-lock.json'));
 if(!/^[a-f0-9]{40}$/.test(lock.revision))throw Error('Shared runtime must pin an approved commit');
 const revision=lock.revision,folder=fs.mkdtempSync(path.join(os.tmpdir(),'shared-action-rollout-'));
 record('github-api','worldmap.shared.source.request',1,'hour');
 const response=await fetch('https://api.github.com/repos/'+lock.sourceRepo+'/tarball/'+revision,{headers:{authorization:'Bearer '+githubToken,'user-agent':'worldmap-shared-rollout',accept:'application/vnd.github+json'},signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('Pinned shared source download HTTP '+response.status);
 const archive=path.join(folder,'source.tgz'),source=path.join(folder,'source');fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));fs.mkdirSync(source);
 const run=(exe,args,phase,env={})=>{if(process.platform==='win32'&&exe==='npx'){args=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npx-cli.js'),...args];exe=process.execPath;}const result=spawnSync(exe,args,{cwd:source,encoding:'utf8',env:{...process.env,...env},maxBuffer:8e6});if(result.status!==0)throw Error('Shared '+phase+' failed: '+String(result.stderr||result.stdout||result.error?.message||'').slice(-1800).replace(/[a-f0-9]{32,64}/gi,'[identifier]'));return result.stdout;};
 run('tar',['-xzf',archive,'--strip-components=1','-C',source],'source extraction');
 for(const [file,digest]of Object.entries(lock.files))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')!==digest)throw Error('Shared source digest mismatch');
 const tests=['tests/data-platform','tests/action-handler'].flatMap(dir=>fs.readdirSync(path.join(source,dir)).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join(dir,f)));
 run(process.execPath,['--test','--test-reporter=dot',...tests],'tracking tests');
 const headers={'content-type':'application/json','X-Envivo-Tenant':'joshdwall','X-Envivo-Data-Cli':dataToken};
 const report={sourceRevision:revision,testsPassed:true,environments:{}};
 for(const environment of ['preview','production']){
  const worker=environment==='preview'?'envivo-data-preview':'envivo-data',base='https://'+worker+'.joshdwall.workers.dev/enVivo/api/data';
  const status=async()=>{try{const r=await fetch(base+'/_actions',{headers,signal:AbortSignal.timeout(20000)});return r.ok?await r.json():null;}catch{return null;}};
  const before=await status();const ready=data=>data?.sourceRevision===revision&&data.capabilities?.revisionedSnapshots&&data.capabilities?.trackingOnly;
  let deployed=false;if(!ready(before)){
   const config=environment==='preview'?'workers/envivo-data/wrangler.preview.toml':'workers/envivo-data/wrangler.toml',text=fs.readFileSync(path.join(source,config),'utf8');
   const workerAccount=text.match(/^\s*account_id\s*=\s*"([a-f0-9]{32})"/mi)?.[1]||account;
   if(environment==='preview'&&(/\[\[routes\]\]|^\s*routes?\s*=/m.test(text)||!text.includes('name = "envivo-data-preview"')))throw Error('Unsafe shared preview config');
   record('unrouted-actions','worldmap.shared.'+environment+'.deploy',1,'month');
   const candidates=[{name:'shared',value:cloudflareToken},...cloudflareTokens].filter((entry,index,list)=>entry.value&&list.findIndex(other=>other.value===entry.value)===index);let lastError;
   for(const credential of candidates){try{run('npx',['--yes','wrangler@4.28.0','deploy','--config',config,'--keep-vars','--var','DATA_SQL:1','--var','ACTION_HANDLER_REVISION:'+revision],environment+' Worker deploy',{CLOUDFLARE_API_TOKEN:credential.value,CLOUDFLARE_ACCOUNT_ID:workerAccount});deployed=true;console.log('Shared '+environment+' Worker deployed using '+credential.name+' credential.');break;}catch(error){lastError=error;if(!/No access|Authentication|permission|code:.*10000|code:.*10090/i.test(error.message))throw error;console.log('Shared '+environment+' service denied '+credential.name+' credential; trying existing fallback.');}}
   if(!deployed)throw lastError||Error('No shared Worker deployment credential available');
  }
  let current;for(let attempt=0;attempt<15;attempt++){current=await status();if(ready(current))break;await new Promise(resolve=>setTimeout(resolve,2000));}if(!ready(current))throw Error('Shared '+environment+' revision/auth verification failed');
  const event={id:'worldmap-shared-verification-'+revision+'-'+environment,providerId:'unrouted-actions',actual:1,op:'worldmap.shared.endpoint.verify',repo:'joshdwall/youareinthegame',visibility:'public',actor:'worldmap-rollout',period:'month',reason:'One real endpoint verification, replayed to prove idempotency'};
  for(let attempt=0;attempt<2;attempt++){const r=await fetch(base+'/_actions',{method:'POST',headers,body:JSON.stringify({events:[event]}),signal:AbortSignal.timeout(30000)}),data=await r.json();if(!r.ok||!data.ok||!data.results?.length||(attempt===1&&!data.results[0].duplicate))throw Error('Shared '+environment+' batch replay failed');}
  report.environments[environment]={deployed,revisionVerified:true,batchReplayVerified:true};
 }
 save('shared-action-rollout.json',report);console.log('Shared preview and production action tracking verified.');return report;
}
