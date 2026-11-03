import fs from 'node:fs';
export async function provisionWorldmap({cf,primaryToken,fallbackToken,withToken,redactValue,config}){
 const request=async(path,method,body)=>{try{return await withToken(primaryToken,()=>cf(path,method,body));}catch(error){if(!/403|401/.test(error.message)||!fallbackToken||fallbackToken===primaryToken)throw error;return withToken(fallbackToken,()=>cf(path,method,body));}};
 const base='/accounts/{account}/d1/database';let databases;
 try{databases=await request(base+'?per_page=100');}catch{throw Error('D1 access is required for the visitor globe. Neither available runner token could list databases. Add account D1 Edit to the shared token.');}
 const result={};for(const [kind,name]of [['production',config.productionDatabase],['preview',config.previewDatabase]]){
  let db=databases.find(d=>d.name===name);if(!db){if(databases.length>=10)throw Error('D1 free-tier database count bound reached');db=await request(base,'POST',{name});databases.push(db);}const id=db.uuid||db.id;if(!id)throw Error('D1 database identifier missing');redactValue(id);
  const schema=await request(base+'/'+id+'/query','POST',{sql:fs.readFileSync('migrations/worldmap/0001.sql','utf8')});if(schema.some(r=>r.success===false))throw Error('Worldmap schema did not apply');result[kind]={name,id};
 }
 if(result.production.id===result.preview.id)throw Error('Worldmap preview must use a separate database');return result;
}
