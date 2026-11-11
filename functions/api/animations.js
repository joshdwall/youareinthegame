/**
 * GET /api/animations — public read of live loot-table config.
 * Short freshness with strong ETag so unchanged clients can 304.
 */
import { readRuntimeConfig, publicView, PLACEMENTS_KV_KEY } from '../_shared/runtime-config.js';
import { livePercents } from '../_shared/loot-table.js';
import { readCostumeLibrary } from '../_shared/costume-library.js';
import { compileBundle } from '../../runtime/costumes/contracts.js';

async function weakEtag(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const dig = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"anim-${hex.slice(0, 32)}"`;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const { config, source } = await readRuntimeConfig(env);
  const view = publicView(config);
  const percents = livePercents(config);
  let placementsByAnimation = null;
  try {
    const raw = await env.YAITG_SESSION_KV?.get(PLACEMENTS_KV_KEY, 'json');
    if (raw?.byAnimation) placementsByAnimation = raw.byAnimation;
  } catch (_) {}
  const library = await readCostumeLibrary(env);
  placementsByAnimation = { ...(placementsByAnimation || {}), ...library.placements };
  for (const key of ['animations', 'directAnimations']) {
    view[key] = view[key].map(({ secondaryCostume: storedSecondary, ...animation }) => {
      const secondaryCostume = library.secondaryCostumes?.[animation.id] ?? storedSecondary;
      const bundle = library.costumes[secondaryCostume?.costumeRef];
      if (!secondaryCostume?.enabled || !bundle?.costume?.elements?.length) return animation;
      const compiled = compileBundle(bundle, library);
      const layout = secondaryCostume.layout?.elements ?? compiled.placements.elements;
      const primaryLayout = placementsByAnimation[animation.id]?.elements;
      const primary = new Map((animation.elements ?? []).map(item => [item.id, item]));
      const elements = compiled.animation.elements.map(item => ({
        ...item,
        placement: {
          ...(layout[item.id] ?? item.placement),
          objectActions: (primaryLayout?.[item.id] ?? primary.get(item.id)?.placement)?.objectActions ?? []
        }
      }));
      return { ...animation, secondaryCostume: { elements } };
    });
  }
  const body = {
    ok: true,
    source,
    ...view,
    livePercents: percents,
    placementsByAnimation,
    costumeLibraryRevision: config.costumeLibraryRevision ?? library.revision ?? null
  };
  const etag = await weakEtag({
    updatedAt: view.updatedAt,
    costumeLibraryRevision: body.costumeLibraryRevision,
    livePercents: percents,
    animations: view.animations,
    directAnimations: view.directAnimations,
    placementsByAnimation
  });
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
    etag,
    vary: 'Accept-Encoding'
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(body), { headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-max-age': '86400'
    }
  });
}
