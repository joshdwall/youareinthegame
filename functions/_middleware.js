import { recordActionCore as recordAction } from '../runtime/shared/global-action-tracker/core.mjs';
/**
 * Block the project's default pages.dev apex so production content is not
 * reachable without a custom domain. Named preview / deployment-hash aliases
 * (e.g. preview-….youareinthegame-web.pages.dev, <hash>.….pages.dev) pass
 * through so Access-gated `wrangler pages deploy --branch` previews work.
 * Custom domains (youareinthegame.com, www, app) always pass through.
 *
 * Visitor counting is a same-origin POST beacon to /api/worldmap?visit=1 so
 * HTML documents are not forced private/no-store on first paint.
 */
export async function onRequest(context) {
  recordAction({
    kind: 'worker.invoke',
    calledBy: 'youareinthegame',
    purpose: 'serve-request',
    workerId: 'youareinthegame-web',
    module: 'worldmap',
    surface: 'pages-function'
  });
  const url = new URL(context.request.url);
  const host = url.hostname;
  if (context.env?.YAITG_ADMIN_DEPLOYMENT === '1' && host !== 'app.youareinthegame.com') {
    return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const publicHost = host === 'youareinthegame.com' || host === 'www.youareinthegame.com';
  if (publicHost && (url.pathname === '/cambio' || url.pathname.startsWith('/cambio/'))) {
    const target = new URL('https://app.youareinthegame.com/cambio/');
    target.search = url.search;
    return Response.redirect(target, 308);
  }
  if (publicHost && (url.pathname === '/api/cambio' || url.pathname.startsWith('/api/cambio/'))) {
    return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
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
  const original = await context.next();
  const response = new Response(original.body, original);
  response.headers.set('x-yaitg-function', '1');
  // Shared badge: Pages _headers was merging this file's max-age=60 with /img/*
  // immutable. Overwrite so Cambio and the public site share one short-cached URL.
  if (url.pathname === '/img/tap-for-spores.png') {
    response.headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  return response;
}
