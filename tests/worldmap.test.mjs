import test from 'node:test';import assert from 'node:assert/strict';import {areaFromCloudflare,recordWorldmapVisit,worldmapData,excludeWorldmapBrowser} from '../functions/_shared/worldmap.js';import {worldmapDatabase} from './helpers/worldmap-db.mjs';
const make=(path='/',cookie='',body,origin='https://youareinthegame.com')=>{const r=new Request('https://youareinthegame.com'+path,{method:body?'POST':'GET',headers:{cookie,'user-agent':'A real browser',...(body?{origin,'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});Object.defineProperty(r,'cf',{value:{latitude:'40.71',longitude:'-74.01',country:'US'}});return r;};
const setup=()=>{const {db,sqlite}=worldmapDatabase();return {env:{YAITG_WORLDMAP_DB:db,YAITG_SESSION_SECRET:'test-only-independent-worldmap-secret'},sqlite};};
test('origins are coarse server-derived areas; unknown and invalid locations do not create fake pins',()=>{assert.deepEqual(areaFromCloudflare({latitude:40.71,longitude:-74.01,country:'US'}),{key:'US:130:105',lat:40.5,lng:-74.5,country:'US',region:''});for(const x of [{},{latitude:null,longitude:null,country:'US'},{latitude:999,longitude:0,country:'US'},{latitude:0,longitude:0,country:'XX'}])assert.equal(areaFromCloudflare(x),null);});
test('refreshes count once and persisted values contain neither IPs nor precise coordinates',async()=>{const {env,sqlite}=setup();const cookie=(await recordWorldmapVisit(make(),env)).split(';')[0];for(let i=0;i<10;i++)assert.equal(await recordWorldmapVisit(make('/',cookie),env),null);const data=await(await worldmapData({request:make('/api/worldmap'),env})).json();assert.equal(data.totals.visitors,1);assert.equal(data.points[0].lat,40.5);const row=sqlite.prepare('SELECT * FROM worldmap_visitors').get();assert.match(row.visitor_hash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(row).includes('40.71'));assert.equal(row.excluded,0);});
test('exclude removes this browser once; repeated toggle/refresh never pads totals',async()=>{const {env}=setup(),cookie=(await recordWorldmapVisit(make(),env)).split(';')[0];for(const excluded of [true,true,false,false]){const r=await excludeWorldmapBrowser({env,request:make('/api/worldmap',cookie,{excluded})});assert.equal(r.status,200);const data=await(await worldmapData({env,request:make('/api/worldmap')})).json();assert.equal(data.totals.visitors,excluded?0:1);}assert.equal((await excludeWorldmapBrowser({env,request:make('/api/worldmap',cookie,{excluded:true},'https://other.example')})).status,403);});
test('excluded browsers and known bots are never recorded',async()=>{const {env,sqlite}=setup();assert.equal(await recordWorldmapVisit(make('/','yaitg_worldmap_exclude=1'),env),null);for(const agent of ['HeadlessChrome','node','undici','curl','YAITG automated monitor']){const request=make();request.headers.set('user-agent',agent);assert.equal(await recordWorldmapVisit(request,env),null);}assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM worldmap_visitors').get().count,0);});
test('daily intake bound stops new writes/counting without changing existing visits',async()=>{const {env,sqlite}=setup();const day=new Date().toISOString().slice(0,10);sqlite.prepare('INSERT INTO worldmap_daily(day,visitors) VALUES(?,10000)').run(day);assert.equal(await recordWorldmapVisit(make(),env),null);assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM worldmap_visitors').get().count,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM worldmap_areas').get().count,0);});
test('crowded globe groups areas without dropping any visitor count',async()=>{const {env,sqlite}=setup();const insert=sqlite.prepare('INSERT INTO worldmap_areas(area_key,lat,lng,country,visitors) VALUES(?,?,?,?,1)');for(let i=0;i<2101;i++)insert.run('fixture-'+i,30.5+Math.floor(i/60),-124.5+i%60,'US');const data=await(await worldmapData({env,request:make('/api/worldmap')})).json();assert(data.gridDegrees>1);assert(data.points.length<=2000);assert.equal(data.totals.visitors,2101);assert.equal(data.points.reduce((sum,p)=>sum+p.count,0),2101);});
test('named cities group by locality while older regional origins keep their counts',async()=>{
 const {env}=setup();
 await recordWorldmapVisit(make(),env);
 for(const [city,latitude,longitude] of [['San Francisco',37.774,-122.419],['SAN FRANCISCO',37.785,-122.401],['Oakland',37.804,-122.271]]){
  const request=new Request('https://youareinthegame.com',{headers:{'user-agent':'A real browser'}});
  Object.defineProperty(request,'cf',{value:{city,latitude,longitude,country:'US',region:'California'}});
  await recordWorldmapVisit(request,env);
 }
 const data=await(await worldmapData({env,request:make('/api/worldmap')})).json();
 assert.equal(data.totals.visitors,4);
 assert.deepEqual(data.points.map(({city,region,count})=>[city,region,count]),[
  ['San Francisco','California',2],[undefined,'',1],['Oakland','California',1]
 ]);
 assert.equal(data.points[0].lat,37.8);
 assert.equal(data.points[0].lng,-122.4);
});
