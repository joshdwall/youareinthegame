/**
 * GET /api/animations — public read of live loot-table config.
 * Short cache so next visitors see KV updates without redeploy.
 */
import { readRuntimeConfig, publicView, PLACEMENTS_KV_KEY } from '../_shared/runtime-config.js';
import { livePercents } from '../_shared/loot-table.js';

export async function onRequestGet(context) {
  const { env } = context;
  const { config, source } = await readRuntimeConfig(env);
  const view = publicView(config);
  const percents = livePercents(config);
  let placementsByAnimation = null;
  try {
    const raw = await env.YAITG_SESSION_KV?.get(PLACEMENTS_KV_KEY, 'json');
    if (raw?.byAnimation) placementsByAnimation = raw.byAnimation;
  } catch (_) {}
  return new Response(
    JSON.stringify({ ok: true, source, ...view, livePercents: percents, placementsByAnimation }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=15, stale-while-revalidate=30',
        'access-control-allow-origin': '*'
      }
    }
  );
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
