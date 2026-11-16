import {EmailMessage} from 'cloudflare:email';
import config from '../../config/communications.json';

const recipient='joshdwall@gmail.com';
const sender='howdy@youareinthegame.com';
const central=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const utcDay=date=>date.toISOString().slice(0,10);
const region=new Intl.DisplayNames(['en'],{type:'region'});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

async function sendDigest(env, timestamp, test=false){
 const now=new Date(timestamp);
 const today=utcDay(now);
 const day=utcDay(new Date(timestamp-86400000));
 const previous=utcDay(new Date(timestamp-172800000));
 const db=env.VISITORS;
 const [countries,survey]=await db.batch([
  db.prepare(`SELECT a.country, SUM(v.first_day=?) AS added, SUM(v.first_day=?) AS prior
    FROM worldmap_visitors v JOIN worldmap_areas a ON v.area_key=a.area_key
    WHERE v.excluded=0 AND v.first_day IN (?,?) GROUP BY a.country ORDER BY added DESC,a.country`).bind(day,previous,day,previous),
  db.prepare(`SELECT answer, COUNT(*) AS total, SUM(answered_at>=? AND answered_at<?) AS added
    FROM discovery_responses GROUP BY answer`).bind(day+' 00:00:00',today+' 00:00:00')
 ]);
 const rows=countries.results;
 const counts=new Map(survey.results.map(row=>[row.answer,row]));
 const replies=config.polls[0].options.map(option=>({...option,...counts.get(option.id)}));
 const unknown=survey.results.filter(row=>!replies.some(option=>option.id===row.answer));
 const allReplies=[...replies,...unknown.map(row=>({...row,label:row.answer,color:'#6bd4c8'}))];
 const total=rows.reduce((sum,row)=>sum+row.added,0);
 const dailyVotes=survey.results.reduce((sum,row)=>sum+row.added,0);
 const totalVotes=survey.results.reduce((sum,row)=>sum+row.total,0);
 let messages;
 try{
  messages=(await db.prepare('SELECT subject, sender, received_at FROM visitor_digest_messages WHERE received_at>=? AND received_at<? ORDER BY received_at DESC').bind(day+'T00:00:00',today+'T00:00:00').all()).results;
 }catch(error){if(!String(error.message).includes('no such table'))throw error;}
 const countryName=code=>/^[A-Z]{2}$/.test(code)?region.of(code):code||'Unknown';
 const html=`<!doctype html><html><body style="margin:0;background:#071524;color:#e5faff;font:16px Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:30px 20px">
 <img src="https://youareinthegame.com/img/worldmap-earth-v1.webp" width="84" alt="Earth" style="display:block;margin-bottom:12px">
 <p style="color:#65e3cc;text-transform:uppercase;letter-spacing:2px">PlatypusShroom · World Map</p>
 <h1 style="color:#fff;margin:8px 0">Visitor report</h1><p>${day} UTC${test?' · Test email':''}</p>
 <h2 style="color:#65e3cc">+${total} new unique browsers</h2>
 <table width="100%" cellpadding="8" style="background:#10263d;border-collapse:collapse;color:#e5faff"><tr><th align="left">Country</th><th align="right">New</th><th align="right">Prior day</th></tr>
 ${rows.map(row=>`<tr><td>${escape(countryName(row.country))}</td><td align="right" style="color:#65e3cc">+${row.added}</td><td align="right">${row.prior}</td></tr>`).join('')||'<tr><td colspan="3">No new unique browsers</td></tr>'}</table>
 <h2 style="color:#65e3cc">How did you find us?</h2><p>${dailyVotes} new replies · ${totalVotes} all-time</p>
 <ul>${allReplies.map(row=>`<li><span style="color:${row.color}">●</span> ${escape(row.label)} · +${row.added||0} new · ${row.total||0} total</li>`).join('')}</ul>
 <h2 style="color:#65e3cc">New messages</h2>
 ${day<'2026-11-17'?'<p>Message tracking began November 16. Earlier messages are outside this report.</p>':''}${messages?(messages.length?`<ul>${messages.map(m=>`<li>${escape(m.subject)} · ${escape(m.sender)}</li>`).join('')}</ul>`:'<p>No new recorded messages.</p>'):'<p>Message reporting is not connected for this period.</p>'}
 <p><a href="https://youareinthegame.com/worldmap/" style="color:#65e3cc">Open Visitors world map</a></p></div></body></html>`;
 const subject=(test?'[Test] ':'')+'PlatypusShroom visitor report | '+day;
 const raw=['From: PlatypusShroom <'+sender+'>','To: '+recipient,'Subject: '+subject,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',''+btoa(String.fromCharCode(...new TextEncoder().encode(html)))].join('\r\n');
 await env.EMAIL.send(new EmailMessage(sender,recipient,raw));
}

async function deliverDaily(env,timestamp){
  const day=utcDay(new Date(timestamp-86400000));
  const claimed=await env.VISITORS.prepare('INSERT OR IGNORE INTO visitor_digest_deliveries(day) VALUES(?)').bind(day).run();
  if(!claimed.meta.changes)return;
  try{
   await sendDigest(env,timestamp);
  }catch(error){
   await env.VISITORS.prepare('DELETE FROM visitor_digest_deliveries WHERE day=? AND sent_at IS NULL').bind(day).run();
   throw error;
  }
  await env.VISITORS.prepare('UPDATE visitor_digest_deliveries SET sent_at=? WHERE day=?').bind(new Date().toISOString(),day).run();
  console.log('Visitor digest accepted for '+day);
}

export default {
 async fetch(request,env){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/test')return new Response(null,{status:404});
  const auth=request.headers.get('Authorization');
  if(!env.TEST_TOKEN||auth!=='Bearer '+env.TEST_TOKEN)return new Response(null,{status:403});
  const catchUp=new URL(request.url).searchParams.has('catch-up');
  if(catchUp)await deliverDaily(env,Date.now());
  else await sendDigest(env,Date.now(),true);
  return new Response('Digest accepted by mail provider');
 },
 async scheduled(event,env){
  const parts=Object.fromEntries(central.formatToParts(event.scheduledTime).map(p=>[p.type,p.value]));
  if(parts.hour!=='07'||parts.minute!=='30')return;
  await deliverDaily(env,event.scheduledTime);
 }
};
