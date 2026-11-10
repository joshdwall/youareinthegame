/**
 * GET /api/assets/<key> — public stream from R2.
 * Content-hash object keys are long-cache immutable; Cache API hits skip Class B quota.
 */
import { readR2Quota, writeR2QuotaCoalesced, r2Allowed } from '../../_shared/runtime-config.js';

const HASH_OBJECT = /(?:^|\/)[a-f0-9]{32,}\.(?:png|webp|jpe?g|gif)$/i;

export async function onRequestGet(context) {
  const { env, params, request, waitUntil } = context;
  if (!env.YAITG_ASSETS_R2) {
    return new Response('r2_missing', { status: 500 });
  }
  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!key || key.includes('..')) return new Response('bad_key', { status: 400 });

  const immutable = HASH_OBJECT.test(key);
  const cacheControl = immutable
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=86400';
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL(request.url), { method: 'GET' });

  const cached = await cache?.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('cache-control', cacheControl);
    headers.set('x-yaitg-asset-cache', 'HIT');
    if (request.headers.get('if-none-match') && request.headers.get('if-none-match') === headers.get('etag')) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(cached.body, { status: cached.status, headers });
  }

  const quota = await readR2Quota(env);
  const gate = r2Allowed(quota, 'classB', 0);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, ...gate }), {
      status: 429,
      headers: { 'content-type': 'application/json' }
    });
  }

  const obj = await env.YAITG_ASSETS_R2.get(key);
  if (!obj) return new Response('not_found', { status: 404 });

  quota.classB += 1;
  await writeR2QuotaCoalesced(env, quota, cache);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', cacheControl);
  headers.set('etag', obj.httpEtag);
  headers.set('x-yaitg-asset-cache', 'MISS');
  const response = new Response(obj.body, { headers });
  const put = cache?.put(cacheKey, response.clone());
  if (put) {
    if (typeof waitUntil === 'function') waitUntil(put);
    else await put;
  }
  if (request.headers.get('if-none-match') && request.headers.get('if-none-match') === headers.get('etag')) {
    return new Response(null, { status: 304, headers });
  }
  return response;
}
