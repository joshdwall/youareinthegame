/**
 * GET/PUT /api/cambio/placements
 * Runtime SSOT: KV key cambio:placements (git seed is content/cambio-placements.json).
 * Requires Cloudflare Access JWT on app host (edge-enforced); Function also rejects missing assertion outside local.
 */
const KV_KEY = 'cambio:placements';

function corsHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
}

function hasAccessAssertion(request) {
  const jwt = request.headers.get('cf-access-jwt-assertion');
  const email = request.headers.get('cf-access-authenticated-user-email');
  return Boolean(jwt || email);
}

function allowUnauthedHost(url) {
  // Local wrangler only
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

async function readSeed(env) {
  // Pages serves static seed; Function cannot read filesystem — clients always have seed.
  // KV holds overrides.
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!allowUnauthedHost(url) && !hasAccessAssertion(request)) {
    // Still allow GET of seed-shaped empty when Access sits in front; if we got here without JWT, deny.
    return new Response(JSON.stringify({ ok: false, error: 'access_required' }), { status: 401, headers: corsHeaders() });
  }
  let placements = null;
  try {
    if (env.YAITG_SESSION_KV) {
      const raw = await env.YAITG_SESSION_KV.get(KV_KEY, 'json');
      if (raw) placements = raw;
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: corsHeaders() });
  }
  return new Response(JSON.stringify({ ok: true, source: placements ? 'kv' : 'none', placements }), { headers: corsHeaders() });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!allowUnauthedHost(url) && !hasAccessAssertion(request)) {
    return new Response(JSON.stringify({ ok: false, error: 'access_required' }), { status: 401, headers: corsHeaders() });
  }
  if (!env.YAITG_SESSION_KV) {
    return new Response(JSON.stringify({ ok: false, error: 'kv_missing' }), { status: 500, headers: corsHeaders() });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: corsHeaders() });
  }
  if (!body || typeof body !== 'object' || !body.byAnimation) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_shape' }), { status: 400, headers: corsHeaders() });
  }
  const placements = {
    schemaVersion: 1,
    updatedAt: body.updatedAt || new Date().toISOString(),
    byAnimation: body.byAnimation
  };
  await env.YAITG_SESSION_KV.put(KV_KEY, JSON.stringify(placements));
  return new Response(JSON.stringify({ ok: true, placements }), { headers: corsHeaders() });
}
