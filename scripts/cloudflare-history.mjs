const typeRef=`kind name ofType { kind name ofType { kind name } }`;
const clean=text=>String(text).replace(/[a-f0-9]{32,64}/gi,'[identifier]');
export async function auditCloudflareHistory({tokens,account,save}){
 const report={auditedAt:new Date().toISOString(),host:'youareinthegame.com',credentials:[]};
 for(const credential of tokens.filter(t=>t.value)){
  const request=async(path,body)=>{const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+credential.value,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error('HTTP '+r.status);return data;};
  const gql=async(query,variables={})=>request('/graphql',{query,variables});
  const row={credential:credential.name};report.credentials.push(row);
  try{
   const zones=await request('/zones?name=youareinthegame.com');const zone=zones.result?.find(z=>z.name==='youareinthegame.com');row.zoneFound=!!zone;
   try{const sites=await request(`/accounts/${account}/rum/site_info/list?per_page=100`);const site=sites.result?.find(s=>s.ruleset?.zone_name==='youareinthegame.com'||s.rules?.some(r=>['youareinthegame.com','www.youareinthegame.com'].includes(r.host)));row.rumSiteFound=!!site;if(site){row.siteCreated=site.created;row.sitePaused=site.ruleset?.enabled===false;}}
   catch(e){row.siteListError=clean(e.message);}
   if(!zone)throw Error('Site zone not found');
   const settingsQuery=`query($a:string!,$z:string!){
    viewer{
     accounts(filter:{accountTag:$a}){settings{rumPageloadEventsAdaptiveGroups{enabled availableFields maxPageSize maxDuration notOlderThan}}}
     zones(filter:{zoneTag:$z}){settings{
      httpRequests1dGroups{enabled availableFields maxPageSize maxDuration notOlderThan}
      httpRequestsAdaptiveGroups{enabled availableFields maxPageSize maxDuration notOlderThan}
     }}
    }
   }`;
   const settings=await gql(settingsQuery,{a:account,...(zone?{z:zone.id}:{})});row.settings=settings.data?.viewer;row.errors=settings.errors?.map(e=>clean(e.message));
   const schema=await gql(`query($aType:String!,$zType:String!){account:__type(name:$aType){fields{name type{${typeRef}} args{name type{${typeRef}}}}} zone:__type(name:$zType){fields{name type{${typeRef}} args{name type{${typeRef}}}}}}`,{aType:'account',zType:'zone'});
   row.schemaErrors=schema.errors?.map(e=>clean(e.message));
   const namesQuery=await gql('{__schema{types{name}}}');row.typeNames=(namesQuery.data?.__schema?.types||[]).map(t=>t.name).filter(n=>/^(account|zone)$|rumPageloadEventsAdaptiveGroups|httpRequests1dGroups|httpRequestsAdaptiveGroups/i.test(n)).slice(0,120);row.schemaShape={keys:Object.keys(schema),dataKeys:Object.keys(schema.data||{})};
   const fields=[...(schema.data?.account?.fields||[]),...(schema.data?.zone?.fields||[])].filter(f=>['rumPageloadEventsAdaptiveGroups','httpRequests1dGroups','httpRequestsAdaptiveGroups'].includes(f.name));
   row.fields=fields;
   const leaf=t=>t?.ofType?leaf(t.ofType):t?.name;row.types={};
   const names=[...new Set(fields.flatMap(f=>[leaf(f.type),...f.args.map(a=>leaf(a.type))]).filter(n=>n&&!['Int','String','Time','Date','string'].includes(n)))];
   for(const name of names){const j=await gql(`query($n:String!){__type(name:$n){name kind fields{name type{${typeRef}}} inputFields{name type{${typeRef}}} enumValues{name}}}`,{n:name});if(j.data?.__type)row.types[name]=j.data.__type;}
   for(const type of Object.values({...row.types})){for(const field of type.fields||[]){if(!['sum','dimensions','uniq','avg'].includes(field.name))continue;const name=leaf(field.type);if(!name||row.types[name])continue;const j=await gql(`query($n:String!){__type(name:$n){name fields{name type{${typeRef}}}}}`,{n:name});if(j.data?.__type)row.types[name]=j.data.__type;}}
  }catch(e){row.error=clean(e.message);}
 }
 save('cloudflare-history-audit.json',report);console.log('Cloudflare analytics discovery complete:',report.credentials.map(r=>({credential:r.credential,zoneFound:r.zoneFound,rumSiteFound:r.rumSiteFound,error:r.error,errors:r.errors})));return report;
}

import {HISTORY_HOSTS,HISTORY_KEY,DAY,validateHistory} from '../runtime/worldmap/history-contract.js';
export async function collectHistory({gql,account,now=new Date()}){
 const settings=await gql('query($a:string!){viewer{accounts(filter:{accountTag:$a}){settings{rumPageloadEventsAdaptiveGroups{enabled maxDuration notOlderThan maxPageSize}}}}}',{a:account});
 const limits=settings.viewer.accounts[0]?.settings.rumPageloadEventsAdaptiveGroups;if(!limits?.enabled)throw Error('Web Analytics history unavailable');
 const end=now.toISOString(),start=new Date(Math.ceil((+now-limits.notOlderThan*1000)/DAY)*DAY).toISOString(),rows=[],dailyTotals=[];let property;let sampled=false,maxInterval=1;
 const query=async(from,to,selection,order,siteTag)=>{
  const filter={datetime_geq:from,datetime_lt:to,requestHost_in:HISTORY_HOSTS,...(siteTag?{siteTag}:{})};
  const data=await gql(`query($a:string!,$f:AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!,$l:uint64!){viewer{accounts(filter:{accountTag:$a}){rumPageloadEventsAdaptiveGroups(limit:$l,filter:$f,orderBy:[${order}]){${selection}}}}}`,{a:account,f:filter,l:limits.maxPageSize});
  const groups=data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups;if(!Array.isArray(groups)||groups.length>=limits.maxPageSize)throw Error('Incomplete or truncated analytics response');return groups;
 };
 const chunks=[];for(let t=Date.parse(start);t<+now;t+=28*DAY)chunks.push([new Date(t).toISOString(),new Date(Math.min(t+28*DAY,+now)).toISOString()]);
 const properties=new Set();for(const [from,to]of chunks){for(const group of await query(from,to,'dimensions{siteTag requestHost} sum{visits}','sum_visits_DESC')){if(!HISTORY_HOSTS.includes(group.dimensions.requestHost))throw Error('Unexpected analytics host');if(group.sum.visits>0)properties.add(group.dimensions.siteTag);}}
 if(properties.size!==1)throw Error('Expected one active Web Analytics property; found '+properties.size);property=[...properties][0];
 for(const [from,to]of chunks){
  for(const g of await query(from,to,'dimensions{date countryName} sum{visits} avg{sampleInterval}','date_ASC,countryName_ASC',property)){const interval=g.avg?.sampleInterval||1;maxInterval=Math.max(maxInterval,interval);sampled ||= interval>1;rows.push({date:g.dimensions.date,country:/^[A-Z]{2}$/.test(g.dimensions.countryName)?g.dimensions.countryName:'ZZ',count:g.sum.visits});}
  for(const g of await query(from,to,'dimensions{date} sum{visits}','date_ASC',property))dailyTotals.push({date:g.dimensions.date,count:g.sum.visits});
 }
 // Normalize unknown country groups without losing their counts.
 const merged=new Map();for(const row of rows){const key=row.date+row.country;const old=merged.get(key);if(old)old.count+=row.count;else merged.set(key,{...row});}
 return validateHistory({schemaVersion:1,source:'cloudflare-web-analytics',dataset:'rumPageloadEventsAdaptiveGroups',metric:'visits',granularity:'country',hosts:[...HISTORY_HOSTS],fetchedAt:end,coverage:{start,end,complete:true,timezone:'UTC'},sampling:{sampled,maxInterval,note:'Adaptive analytics; country and overall totals are queried independently.'},rows:[...merged.values()],dailyTotals});
}
export async function syncHistory({token,account,cf,namespace,save}){
 const gql=async(query,variables)=>{const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||j.errors?.length)throw Error('Analytics query failed: '+(j.errors||[]).map(e=>clean(e.message)).join('; '));return j.data;};
 const snapshot=await collectHistory({gql,account});
 await cf(`/accounts/{account}/storage/kv/namespaces/${namespace}/bulk`,'PUT',[{key:HISTORY_KEY,value:JSON.stringify(snapshot)}]);save('cloudflare-history.json',snapshot);console.log('Historical visits synchronized:',snapshot.rows.length,'country/day buckets');return snapshot;
}
