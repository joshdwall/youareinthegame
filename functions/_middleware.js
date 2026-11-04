import {recordActionCore as recordAction} from '../runtime/shared/global-action-tracker/core.mjs';
/**
 * Block the project's default pages.dev apex so production content is not
 * reachable without a custom domain. Named preview / deployment-hash aliases
 * (e.g. preview-….youareinthegame-web.pages.dev, <hash>.….pages.dev) pass
 * through so Access-gated `wrangler pages deploy --branch` previews work.
 * Custom domains (youareinthegame.com, www, app) always pass through.
 */
import {recordWorldmapVisit} from './_shared/worldmap.js';
export async function onRequest(context) {
  recordAction({kind:'worker.invoke',calledBy:'youareinthegame',purpose:'serve-request',workerId:'youareinthegame-web',module:'worldmap',surface:'pages-function'});
  const host = new URL(context.request.url).hostname.toLowerCase();
  if (host === 'youareinthegame-web.pages.dev') {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-yaitg-pages-dev': 'blocked'
      }
    });
  }
  const original=await context.next();const response=new Response(original.body,original);response.headers.set('x-yaitg-function','1');
  const url=new URL(context.request.url);
  if(context.request.method==='GET'&&['/','/worldmap','/worldmap/'].includes(url.pathname)&&response.status===200&&(response.headers.get('content-type')||'').includes('text/html')&&!host.startsWith('app.')){
    try{const value=await recordWorldmapVisit(context.request,context.env);if(value){const result=new Response(response.body,response);result.headers.append('set-cookie',value);result.headers.set('cache-control','private, no-store');return result;}}catch{ /* The game remains available if optional visitor counting is unavailable. */ }
  }
  return response;
}
