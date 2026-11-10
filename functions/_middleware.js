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
  const original = await context.next();
  const response = new Response(original.body, original);
  response.headers.set('x-yaitg-function', '1');
  return response;
}
