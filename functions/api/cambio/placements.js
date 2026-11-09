/**
 * GET/PUT /api/cambio/placements
 * Runtime SSOT: KV key cambio:placements (git seed is content/cambio-placements.json).
 * Requires Cloudflare Access JWT on app host (edge-enforced); Function also rejects missing assertion outside local.
 */
import {readCostumeLibrary,writeCostumeLibrary} from '../../_shared/costume-library.js';
import {readRuntimeConfig} from '../../_shared/runtime-config.js';
import {normalizeEditedPlacement,stable} from '../../../runtime/costumes/contracts.js';
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
  const library=await readCostumeLibrary(env);
  placements={...(placements||{schemaVersion:2}),byAnimation:{...(placements?.byAnimation||{}),...library.placements},libraryRevision:library.revision};
  return new Response(JSON.stringify({ ok: true, source: 'kv', placements }), { headers: corsHeaders() });
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
    schemaVersion: 2,
    updatedAt: body.updatedAt || new Date().toISOString(),
    byAnimation: body.byAnimation
  };
  const library=await readCostumeLibrary(env);
  if(body.libraryRevision!==undefined&&body.libraryRevision!==library.revision)return new Response(JSON.stringify({ok:false,error:'Costume library changed; reload before saving'}),{status:409,headers:corsHeaders()});
  try{for(const [id,layout]of Object.entries(placements.byAnimation)){if(!library.animations.some(a=>a.id===id))continue;const elements=Object.fromEntries(Object.entries(layout.elements||{}).map(([key,p])=>[key,normalizeEditedPlacement(p)]));library.placements[id]={...layout,elements};}await writeCostumeLibrary(env,library);}catch(e){return new Response(JSON.stringify({ok:false,error:e.message}),{status:422,headers:corsHeaders()});}
  await env.YAITG_SESSION_KV.put(KV_KEY, JSON.stringify(placements));
  return new Response(JSON.stringify({ ok: true, placements }), { headers: corsHeaders() });
}

/** Save only the selected character, using its persisted layout as the conflict boundary. */
export async function onRequestPatch({ request, env }) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders() });
  if (!allowUnauthedHost(new URL(request.url)) && !hasAccessAssertion(request)) {
    return reply({ ok: false, error: 'access_required' }, 401);
  }
  if (!env.YAITG_SESSION_KV) return reply({ ok: false, error: 'kv_missing' }, 500);
  try {
    const { id, costumeRef, baseline, layout } = await request.json();
    if (typeof id !== 'string' || baseline === undefined || !layout?.elements) {
      return reply({ ok: false, error: 'Invalid placement update' }, 400);
    }
    const library = await readCostumeLibrary(env);
    const costume = library.animations.find(animation => animation.id === id);
    const animation = costume || (await readRuntimeConfig(env)).config.animations.find(entry => entry.id === id);
    if (!animation || animation.archived || animation.editable === false || animation.placementEditable === false) {
      return reply({ ok: false, error: 'Character placements are unavailable' }, 404);
    }
    const raw = await env.YAITG_SESSION_KV.get(KV_KEY, 'json');
    const current = library.placements[id] ?? raw?.byAnimation?.[id] ?? null;
    const saved = {
      transitionId: layout.transitionId,
      elements: Object.fromEntries(Object.entries(layout.elements).map(([key, placement]) => [
        key, normalizeEditedPlacement(placement)
      ]))
    };
    if ((animation.costumeRef ?? null) !== costumeRef) {
      return reply({ ok: false, error: 'This character’s costume was replaced. Reopen it before saving.' }, 409);
    }
    if (stable(current) === stable(saved)) return reply({ ok: true, layout: current });
    if (stable(current) !== stable(baseline)) {
      return reply({ ok: false, error: 'This character’s placements changed in another session. Your edits are still open.' }, 409);
    }
    if (costume) {
      library.placements[id] = saved;
      await writeCostumeLibrary(env, library);
    } else {
      await env.YAITG_SESSION_KV.put(KV_KEY, JSON.stringify({
        ...raw, schemaVersion: 2, updatedAt: new Date().toISOString(),
        byAnimation: { ...raw?.byAnimation, [id]: saved }
      }));
    }
    return reply({ ok: true, layout: saved });
  } catch (e) {
    return reply({ ok: false, error: String(e.message || e) }, 422);
  }
}
