import {stableId} from './worldmap-actions.mjs';
const HOUR=3600000;
/** Provider observations are a separate view from logical operation counts, never summed together. */
export async function collectWorldmapUsage({gql,account,namespace,database,tracker,now=Date.now()}){
 const end=Math.floor(now/HOUR)*HOUR-HOUR,start=end-24*HOUR;
 const datasets=[
  {name:'workersInvocationsAdaptive',filterType:'AccountWorkersInvocationsAdaptiveFilter_InputObject',filter:{},dimensions:'datetimeHour',sums:'requests',scope:stableId('account:'+account),scopeLabel:'account-wide',metrics:{requests:'workers-observed'}},
  {name:'kvOperationsAdaptiveGroups',filterType:'AccountKvOperationsAdaptiveGroupsFilter_InputObject',filter:{namespaceId:namespace},dimensions:'datetimeHour actionType',sums:'requests',scope:stableId('kv:'+namespace),scopeLabel:'site namespace',kv:true},
  {name:'d1AnalyticsAdaptiveGroups',filterType:'AccountD1AnalyticsAdaptiveGroupsFilter_InputObject',filter:{databaseId:database},dimensions:'datetimeHour',sums:'rowsRead rowsWritten',scope:stableId('d1:'+database),scopeLabel:'visitor database',metrics:{rowsRead:'d1-rows-read-observed',rowsWritten:'d1-rows-written-observed'}}
 ];
 const report={window:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},datasets:[]};
 for(const spec of datasets){
  if(spec.filter.databaseId===undefined&&spec.name.startsWith('d1'))throw Error('Visitor database usage binding missing');
  const query=`query($a:string!,$f:${spec.filterType}!){viewer{accounts(filter:{accountTag:$a}){groups:${spec.name}(limit:10000,filter:$f,orderBy:[datetimeHour_ASC]){dimensions{${spec.dimensions}} sum{${spec.sums}} avg{sampleInterval}}}}}`;
  const data=await gql(query,{a:account,f:{datetime_geq:new Date(start).toISOString(),datetime_lt:new Date(end).toISOString(),...spec.filter}});
  const groups=data.viewer.accounts[0]?.groups;if(!Array.isArray(groups)||groups.length>=10000)throw Error('Incomplete provider usage response');
  const totals=new Map();
  const metricRows=spec.kv?[['kv-reads-observed','worldmap.provider.kv.read'],['kv-writes-observed','worldmap.provider.kv.write'],['data-connector-crud','worldmap.provider.kv.other']]:Object.entries(spec.metrics).map(([metric,providerId])=>[providerId,'worldmap.provider.'+spec.name+'.'+metric]);
  for(let atMs=start;atMs<end;atMs+=HOUR)for(const [providerId,op]of metricRows)totals.set([atMs,providerId,op].join('|'),{atMs,providerId,op,actual:0});
  let maxInterval=1;const actionTypes=new Set();
  for(const group of groups){
   const atMs=Date.parse(group.dimensions.datetimeHour);if(!Number.isFinite(atMs)||atMs<start||atMs>=end)throw Error('Provider usage outside requested hour window');
   maxInterval=Math.max(maxInterval,group.avg?.sampleInterval||1);
   const values=spec.kv?{requests:group.sum.requests}:group.sum;
   for(const [metric,value]of Object.entries(values)){
    if(!Number.isFinite(value)||value<0)throw Error('Invalid provider usage count');
    let providerId=spec.metrics?.[metric];
    if(spec.kv){const action=String(group.dimensions.actionType).toLowerCase();actionTypes.add(action);providerId=/read|get/.test(action)?'kv-reads-observed':/write|put/.test(action)?'kv-writes-observed':null;if(!providerId&&value>0)providerId='data-connector-crud';}
    if(!providerId)continue;const op=spec.kv?'worldmap.provider.kv.'+(providerId==='kv-reads-observed'?'read':providerId==='kv-writes-observed'?'write':'other'):'worldmap.provider.'+spec.name+'.'+metric;
    const key=[atMs,providerId,op].join('|');const old=totals.get(key);if(old)old.actual+=value;else totals.set(key,{atMs,providerId,op,actual:value});
   }
  }
  for(const row of totals.values())tracker.observe({...row,scope:spec.scope,detail:{source:'cloudflare-graphql',dataset:spec.name,scope:spec.scopeLabel,measurement:'provider observation',sampled:maxInterval>1,maxSampleInterval:maxInterval,windowMinutes:60}});
  report.datasets.push({dataset:spec.name,scope:spec.scopeLabel,hourBuckets:totals.size,sampled:maxInterval>1,maxSampleInterval:maxInterval,actionTypes:[...actionTypes]});
 }
 return report;
}
