/**
 * Block all *.pages.dev hosts for youareinthegame-web.
 * Custom domains (youareinthegame.com, www, app) pass through.
 * Previews stay off at the Pages project setting; this is defense in depth.
 */
export async function onRequest(context) {
  const host = new URL(context.request.url).hostname.toLowerCase();
  if (host === 'youareinthegame-web.pages.dev' || host.endsWith('.youareinthegame-web.pages.dev')) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-yaitg-pages-dev': 'blocked'
      }
    });
  }
  return context.next();
}
