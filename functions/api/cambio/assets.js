/**
 * POST /api/cambio/assets — multipart or JSON { key, contentType, base64 }
 * Quota: warn 60% / block 80% of R2 free tier (metered in KV).
 */
import { requireAccess, json } from '../../_shared/cambio-auth.js';
import { readR2Quota, writeR2Quota, r2Allowed } from '../../_shared/runtime-config.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  if (!env.YAITG_ASSETS_R2) {
    return json({ ok: false, error: 'r2_missing' }, 500);
  }

  const ct = request.headers.get('content-type') || '';
  let key;
  let contentType = 'application/octet-stream';
  let bytes;

  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    const animId = String(form.get('animationId') || '').replace(/[^a-z0-9_-]/gi, '');
    const rawName = String(file?.name || `upload-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    key = String(form.get('key') || (animId ? `${animId}/${rawName}` : rawName));
    if (!file || typeof file.arrayBuffer !== 'function') {
      return json({ ok: false, error: 'file_required' }, 400);
    }
    contentType = file.type || contentType;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }
    key = String(body.key || '').replace(/^\/+/, '');
    if (!key || !body.base64) return json({ ok: false, error: 'key_and_base64_required' }, 400);
    contentType = body.contentType || contentType;
    const bin = atob(body.base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }

  key = key.replace(/\.\./g, '').replace(/^\/+/, '');
  if (!key.startsWith('animations/')) key = `animations/${key}`;

  const quota = await readR2Quota(env);
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const existing=await env.YAITG_ASSETS_R2.get(key);
  if(existing){const oldHash=existing.customMetadata?.sha256||[...new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');if(oldHash!==sha256)return json({ok:false,error:'Asset key is immutable; upload under a new version or hash'},409);return json({ok:true,key,url:`/api/assets/${key}`,bytes:bytes.byteLength,sha256,reused:true});}
  const gate = r2Allowed(quota, 'classA', bytes.byteLength);
  if (!gate.ok) return json({ ok: false, ...gate }, 429);

  await env.YAITG_ASSETS_R2.put(key, bytes, {
    customMetadata: {sha256},
    httpMetadata: { contentType }
  });
  quota.classA += 1;
  quota.storageBytes += bytes.byteLength;
  await writeR2Quota(env, quota);

  return json({
    ok: true,
    key,
    url: `/api/assets/${key}`,
    bytes: bytes.byteLength,
    sha256,
    warn: gate.warn,
    quota
  });
}
