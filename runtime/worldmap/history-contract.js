export const HISTORY_KEY='worldmap:cloudflare-history:v1';
export const HISTORY_HOSTS=Object.freeze(['youareinthegame.com','www.youareinthegame.com']);
export const DAY=86400000;
export function validateHistory(snapshot){
 if(snapshot?.schemaVersion!==1||snapshot.metric!=='visits'||!['cloudflare-web-analytics','cloudflare-edge-analytics'].includes(snapshot.source)||snapshot.granularity!=='country')throw Error('Unsupported history source or metric');
 if(!Array.isArray(snapshot.hosts)||snapshot.hosts.length!==2||!HISTORY_HOSTS.every(h=>snapshot.hosts.includes(h)))throw Error('History must be scoped to the public site hosts');
 const start=Date.parse(snapshot.coverage?.start),end=Date.parse(snapshot.coverage?.end),fetched=Date.parse(snapshot.fetchedAt);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||!Number.isFinite(fetched)||snapshot.coverage.complete!==true)throw Error('Incomplete history coverage');
 const validCount=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
 const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 const inCoverage=date=>Date.parse(date)<end&&Date.parse(date)+DAY>start;
 if(!Array.isArray(snapshot.rows)||!Array.isArray(snapshot.dailyTotals)||snapshot.rows.length>100000)throw Error('Invalid history rows');
 const unique=new Set();for(const row of snapshot.rows){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||!/^[A-Z]{2}$/.test(row.country)||!validCount(row.count))throw Error('Invalid history country/date/count');const key=row.date+':'+row.country;if(unique.has(key))throw Error('Duplicate history bucket');unique.add(key);if(row.date<snapshot.coverage.start.slice(0,10)||row.date>snapshot.coverage.end.slice(0,10))throw Error('History row outside coverage');}
 for(const row of snapshot.rows)if(!validDate(row.date)||!inCoverage(row.date))throw Error('Invalid country bucket coverage');
 const dates=new Set();for(const row of snapshot.dailyTotals){if(!validDate(row.date)||!inCoverage(row.date)||!validCount(row.count)||dates.has(row.date))throw Error('Invalid daily history total');dates.add(row.date);}
 return snapshot;
}
export function historyForRange(snapshot,range='all'){
 validateHistory(snapshot);if(!['7','30','all'].includes(String(range)))throw Error('Choose 7 days, 30 days or all history');
 const end=new Date(Date.parse(snapshot.coverage.end)-1),endDay=Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate());
 const requestedStart=range==='all'?snapshot.coverage.start:new Date(endDay-(Number(range)-1)*DAY).toISOString();const start=requestedStart>snapshot.coverage.start?requestedStart:snapshot.coverage.start;
 const totals=new Map();for(const row of snapshot.rows)if(row.date>=start.slice(0,10)&&row.date<=snapshot.coverage.end.slice(0,10))totals.set(row.country,(totals.get(row.country)||0)+row.count);
 const countryTotals=[...totals].filter(([,count])=>count>0).map(([country,count])=>({country,count})).sort((a,b)=>b.count-a.count||a.country.localeCompare(b.country));
 const reportedTotal=snapshot.dailyTotals.filter(r=>r.date>=start.slice(0,10)&&r.date<=snapshot.coverage.end.slice(0,10)).reduce((sum,r)=>sum+r.count,0),breakdownTotal=countryTotals.reduce((sum,r)=>sum+r.count,0);
 return {countryTotals,reportedTotal,breakdownTotal,difference:reportedTotal-breakdownTotal,coverage:{...snapshot.coverage,start,end:snapshot.coverage.end,requestedRange:String(range),limitedByAvailableHistory:range!=='all'&&start>requestedStart},days:Math.floor((endDay-Date.parse(start.slice(0,10)))/DAY)+1};
}
