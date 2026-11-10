import { worldmapData, recordWorldmapVisit } from '../_shared/worldmap.js';
import { worldmapHistory } from '../_shared/worldmap-history.js';

export const onRequestGet = (context) =>
  new URL(context.request.url).searchParams.get('source') === 'cloudflare'
    ? worldmapHistory(context)
    : worldmapData(context);

/**
 * POST /api/worldmap?visit=1 — same-origin visit beacon (keeps HTML cacheable).
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.searchParams.get('visit') !== '1') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return new Response(JSON.stringify({ ok: false, error: 'Same-origin request required' }), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  const host = url.hostname.toLowerCase();
  if (host.startsWith('app.')) {
    return new Response(JSON.stringify({ ok: true, recorded: false }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  try {
    const value = await recordWorldmapVisit(request, env);
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    };
    if (value) headers['set-cookie'] = value;
    return new Response(JSON.stringify({ ok: true, recorded: Boolean(value) }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ ok: true, recorded: false }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
