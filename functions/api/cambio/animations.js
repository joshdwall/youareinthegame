/**
 * POST /api/cambio/animations — create
 * GET  /api/cambio/animations — list full (Access)
 */
import { requireAccess, json } from '../../_shared/cambio-auth.js';
import { readRuntimeConfig, writeRuntimeConfig } from '../../_shared/runtime-config.js';
import { livePercents } from '../../_shared/loot-table.js';
import {validateAnimationDraft} from '../../../runtime/costumes/contracts.js';

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `anim-${Date.now().toString(36)}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  const { config, source } = await readRuntimeConfig(env);
  return json({
    ok: true,
    source,
    animations: config.animations,
    tiers: config.tiers,
    flags: config.flags,
    seasons: config.seasons,
    livePercents: livePercents(config)
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const { config } = await readRuntimeConfig(env);
  let id = String(body.id || slugify(body.label || body.name)).trim();
  if (!id) return json({ ok: false, error: 'id_required' }, 400);
  if (config.animations.some((a) => a.id === id)) {
    return json({ ok: false, error: 'id_exists' }, 409);
  }
  const tier = body.tier || 'common';
  const multiplier = typeof body.multiplier === 'number' ? body.multiplier : 1;
  const tierW = config.tiers?.[tier]?.weight ?? 100;
  const weight = typeof body.weight === 'number' ? body.weight : tierW * multiplier;
  const anim = {
    id,
    label: body.label || body.name || id,
    live: false,
    archived: false,
    editable: true,
    placementEditable: true,
    tier,
    multiplier,
    weight,
    type: body.type || 'character-overlay-activation',
    playMode: body.playMode || 'character-overlay',
    overlayFlashMode: body.overlayFlashMode || 'composite',
    elements: Array.isArray(body.elements) ? body.elements : [],
    transitionsAvailable: body.transitionsAvailable || ['lightning', 'none'],
    preloadedAccessories: false,
    previewObjectActions: body.previewObjectActions === true
  };
  if(body.clickEffect)anim.clickEffect=body.clickEffect;
  if(body.animationPreset)anim.animationPreset=body.animationPreset;
  try{validateAnimationDraft(anim);}catch(e){return json({ok:false,error:e.message},422);}
  config.animations.push(anim);
  const saved = await writeRuntimeConfig(env, config);
  return json({ ok: true, animation: anim, config: saved }, 201);
}
