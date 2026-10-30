/**
 * PATCH /api/cambio/animations/:id — update fields (live, weight, …)
 * DELETE /api/cambio/animations/:id — soft-archive
 * GET /api/cambio/animations/:id
 */
import { requireAccess, json } from '../../../_shared/cambio-auth.js';
import { readRuntimeConfig, writeRuntimeConfig } from '../../../_shared/runtime-config.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  const id = params.id;
  const { config } = await readRuntimeConfig(env);
  const anim = config.animations.find((a) => a.id === id);
  if (!anim) return json({ ok: false, error: 'not_found' }, 404);
  return json({ ok: true, animation: anim });
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  const id = params.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const { config } = await readRuntimeConfig(env);
  const idx = config.animations.findIndex((a) => a.id === id);
  if (idx < 0) return json({ ok: false, error: 'not_found' }, 404);
  const cur = { ...config.animations[idx] };

  // Ghost: placement/elements locked; weight + live + tier/multiplier OK
  const locked = cur.editable === false || cur.placementEditable === false;
  const patch = { ...body };
  if (locked) {
    delete patch.elements;
    delete patch.playMode;
    delete patch.overlayFlashMode;
    delete patch.type;
    delete patch.editable;
    delete patch.placementEditable;
  }
  if (patch.archived === true && id === 'ghost') {
    return json({ ok: false, error: 'cannot_archive_ghost' }, 400);
  }

  const next = { ...cur, ...patch, id: cur.id };
  if (typeof patch.tier === 'string' || typeof patch.multiplier === 'number') {
    if (typeof patch.weight !== 'number') {
      const tierW = config.tiers?.[next.tier]?.weight ?? 100;
      next.weight = tierW * (next.multiplier ?? 1);
    }
  }
  config.animations[idx] = next;
  if (typeof patch.tiers === 'object' && patch.tiers) {
    config.tiers = { ...config.tiers, ...patch.tiers };
  }
  const saved = await writeRuntimeConfig(env, config);
  return json({ ok: true, animation: next, config: saved });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  const id = params.id;
  if (id === 'ghost') return json({ ok: false, error: 'cannot_delete_ghost' }, 400);
  const { config } = await readRuntimeConfig(env);
  const idx = config.animations.findIndex((a) => a.id === id);
  if (idx < 0) return json({ ok: false, error: 'not_found' }, 404);
  // Soft-archive
  config.animations[idx] = {
    ...config.animations[idx],
    archived: true,
    live: false
  };
  const saved = await writeRuntimeConfig(env, config);
  return json({ ok: true, animation: config.animations[idx], config: saved });
}
