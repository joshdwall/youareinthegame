/**
 * GET /api/assets/<key> — public stream from R2
 */
import { readR2Quota, writeR2Quota, r2Allowed } from '../../_shared/runtime-config.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.YAITG_ASSETS_R2) {
    return new Response('r2_missing', { status: 500 });
  }
  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!key || key.includes('..')) return new Response('bad_key', { status: 400 });

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
  await writeR2Quota(env, quota);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
}
