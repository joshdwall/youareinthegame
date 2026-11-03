import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
export async function startReviewServer({worldmap=false}={}){
 const rows=new Map(),objects=new Map();
 const env={YAITG_SESSION_KV:{async get(k){return rows.has(k)?JSON.parse(rows.get(k)):null;},async put(k,v){rows.set(k,v);}},YAITG_ASSETS_R2:{async get(k){const v=objects.get(k);return v?{...v,arrayBuffer:async()=>v.bytes.buffer.slice(v.bytes.byteOffset,v.bytes.byteOffset+v.bytes.byteLength)}:null;},async put(k,bytes,options){objects.set(k,{bytes:Buffer.from(bytes),...options});}}};
 if(worldmap){const {worldmapDatabase}=await import('./worldmap-db.mjs');env.YAITG_WORLDMAP_DB=worldmapDatabase().db;env.YAITG_SESSION_SECRET='local-test-secret-only';}
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   if(url.pathname.startsWith('/api/assets/')){const item=objects.get(url.pathname.slice('/api/assets/'.length));res.writeHead(item?200:404,{'content-type':item?.httpMetadata?.contentType||'text/plain'});res.end(item?.bytes);return;}
   const routes={'/api/worldmap':'worldmap','/api/animations':'animations','/api/cambio/costumes':'cambio/costumes','/api/cambio/runtime-config':'cambio/runtime-config','/api/cambio/placements':'cambio/placements','/api/cambio/assets':'cambio/assets','/api/cambio/animations':'cambio/animations'};
   const name=routes[url.pathname];if(!name){res.writeHead(404);res.end('{}');return;}
   const mod=await import(`../../functions/api/${name}.js`),fn=mod['onRequest'+req.method[0]+req.method.slice(1).toLowerCase()];
   const chunks=[];for await(const c of req)chunks.push(c);
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await fn({request,env});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
  if(worldmap&&path.extname(file)==='.html'){
   const request=new Request(url,{headers:req.headers});Object.defineProperty(request,'cf',{value:{latitude:'40.71',longitude:'-74.01',country:'US'}});
   const {onRequest}=await import('../../functions/_middleware.js');const response=await onRequest({request,env,next:async()=>new Response(fs.readFileSync(file),{headers:{'content-type':'text/html'}})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:e.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve)),rows};
}
