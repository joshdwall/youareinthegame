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
