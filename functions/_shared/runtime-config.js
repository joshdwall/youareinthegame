import {readCostumeLibrary,writeCostumeLibrary,verifyCostumeAssets} from './costume-library.js';
import {validateAnimationDraft,compileBundle,stable} from '../../runtime/costumes/contracts.js';
export const RUNTIME_KV_KEY = 'cambio:runtime-config';
export const PLACEMENTS_KV_KEY = 'cambio:placements';
export const R2_QUOTA_KV_KEY = 'cambio:r2-quota';

/** Free-tier R2 caps (bytes / ops per month). Warn 60% / block 80%. */
export const R2_FREE = {
  storageBytes: 10_000_000_000,
  classAOpsPerMonth: 1_000_000,
  classBOpsPerMonth: 10_000_000,
  warnAt: 0.6,
  blockAt: 0.8,
  maxObjectBytes: 8_000_000
};

/** Built-in seed (mirrors content/runtime-config.json). Used when KV empty and fetch of static fails. */
export const BUILTIN_SEED = {
  schemaVersion: 1,
  // Stable seed timestamp so public ETags do not churn on every cold read.
  updatedAt: '2026-10-01T00:00:00.000Z',
  tiers: {
    common: { label: 'Common', weight: 100 },
    uncommon: { label: 'Uncommon', weight: 40 },
    rare: { label: 'Rare', weight: 10 },
    legendary: { label: 'Legendary', weight: 1 }
  },
  flags: { noRepeatTwice: false },
  settings: {
    // Was build-time GHOST_CONFIG LIGHTNING MIN=5 MAX=10; live defaults half (min floor 3).
    clickThresholdMin: 3,
    clickThresholdMax: 5,
    // Dark→light background fade on reset (was ANIMATIONS.STORM_RESET_DURATION 1500). Flash stays instant.
    stormResetDurationMs: 1500,
    // alternate = round-robin by order; weighted = loot table. Live-editable in Cambio.
    selectionMode: 'alternate',
    // Default click-spore opacity (0..1) while activation/fade is running.
    interactionOpacityDuringAnimation: 0.8
  },
  seasons: [],
  animations: [
    {
      id: 'cowboy',
      label: 'Cowboy',
      editable: true,
      placementEditable: true,
      live: true,
      archived: false,
      playMode: 'character-overlay',
      elements: [
        { id: 'hat', anchor: 'head', src: 'assets/animations/cowboy/hat.webp?v=cowboy-connectors-1', defaultWidthFrac: 0.55 },
        { id: 'mustache', anchor: 'bill', src: 'assets/animations/cowboy/mustache.webp?v=cowboy-connectors-1', defaultWidthFrac: 0.38 },
        { id: 'pistolL', anchor: 'handL', src: 'assets/animations/cowboy/revolver-l.webp?v=cowboy-connectors-1', defaultWidthFrac: 0.28, flipX: false },
        { id: 'pistolR', anchor: 'handR', src: 'assets/animations/cowboy/revolver-r.webp?v=cowboy-connectors-1', defaultWidthFrac: 0.28, flipX: false }
      ],
      transitionsAvailable: ['lightning', 'none'],
      preloadedAccessories: false,
      type: 'character-overlay-activation',
      overlayFlashMode: 'composite',
      tier: 'legendary',
      multiplier: 1,
      weight: 1,
      order: 1,
      previewObjectActions: false
    }
  ]
};

export function normalizeConfig(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const seed = BUILTIN_SEED;
  const seedSettings = seed.settings || {
    clickThresholdMin: 3,
    clickThresholdMax: 5,
    stormResetDurationMs: 1500,
    selectionMode: 'alternate',
    interactionOpacityDuringAnimation: 0.8
  };
  const rawSettings = base.settings && typeof base.settings === 'object' ? base.settings : {};
  let clickThresholdMin = Number(rawSettings.clickThresholdMin ?? seedSettings.clickThresholdMin);
  let clickThresholdMax = Number(rawSettings.clickThresholdMax ?? seedSettings.clickThresholdMax);
  let stormResetDurationMs = Number(
    rawSettings.stormResetDurationMs ?? seedSettings.stormResetDurationMs
  );
  if (!Number.isFinite(clickThresholdMin) || clickThresholdMin < 3) clickThresholdMin = 3;
  if (!Number.isFinite(clickThresholdMax) || clickThresholdMax < clickThresholdMin) {
    clickThresholdMax = Math.max(clickThresholdMin, seedSettings.clickThresholdMax);
  }
  if (!Number.isFinite(stormResetDurationMs) || stormResetDurationMs < 200) {
    stormResetDurationMs = 1500;
  }
  clickThresholdMin = Math.floor(clickThresholdMin);
  clickThresholdMax = Math.floor(clickThresholdMax);
  stormResetDurationMs = Math.floor(stormResetDurationMs);

  let selectionMode = String(
    rawSettings.selectionMode ?? seedSettings.selectionMode ?? 'alternate'
  );
  if (selectionMode !== 'weighted' && selectionMode !== 'alternate') {
    selectionMode = 'alternate';
  }

  let interactionOpacityDuringAnimation = Number(
    rawSettings.interactionOpacityDuringAnimation ??
      seedSettings.interactionOpacityDuringAnimation ??
      0.8
  );
  if (!Number.isFinite(interactionOpacityDuringAnimation)) {
    interactionOpacityDuringAnimation = 0.8;
  }
  interactionOpacityDuringAnimation = Math.min(
    1,
    Math.max(0, interactionOpacityDuringAnimation)
  );

  const seedAnims = seed.animations || [];
  let animations =
    Array.isArray(base.animations) && base.animations.length
      ? base.animations
      : seedAnims;
  animations = animations.map((a, i) => {
    if (!a || typeof a !== 'object') return a;
    const o = Number(a.order);
    const order = Number.isFinite(o) ? o : i;
    const out = { ...a, order };
    // Unlock ghost placement/objectActions editing (Cambio OA editor); keep archive-protected in UI.
    if (out.id === 'ghost') {
      out.editable = true;
      out.placementEditable = true;
      const seedGhost = seedAnims.find((s) => s && s.id === 'ghost');
      if ((!Array.isArray(out.elements) || !out.elements.length) && seedGhost?.elements?.length) {
        out.elements = seedGhost.elements.map((el) => ({ ...el }));
      }
    }
    return out;
  });

  return {
    schemaVersion: base.schemaVersion || 1,
    updatedAt: base.updatedAt || seed.updatedAt || '2026-10-01T00:00:00.000Z',
    tiers: base.tiers || seed.tiers,
    flags: { noRepeatTwice: false, ...(base.flags || {}) },
    settings: {
      clickThresholdMin,
      clickThresholdMax,
      stormResetDurationMs,
      selectionMode,
      openingAnimationId: typeof rawSettings.openingAnimationId === 'string'
        && /^[a-z][a-z0-9-]{0,63}$/.test(rawSettings.openingAnimationId)
        ? rawSettings.openingAnimationId : null,
      interactionOpacityDuringAnimation,
      tapSporeBadgeEnabled: rawSettings.tapSporeBadgeEnabled !== false,
      visitorsEnabled: rawSettings.visitorsEnabled !== false,
      visitorsLabel: typeof rawSettings.visitorsLabel === 'string'
        ? rawSettings.visitorsLabel.trim().slice(0, 60) || 'Visitors'
        : 'Visitors'
    },
    seasons: Array.isArray(base.seasons) ? base.seasons : [],
    animations
  };
}

export async function readRuntimeConfig(env) {
  if (env?.YAITG_SESSION_KV) {
    try {
      const raw = await env.YAITG_SESSION_KV.get(RUNTIME_KV_KEY, 'json');
      if (raw) return { config: await withCostumes(env,normalizeConfig(raw)), source: 'kv' };
    } catch (_) { /* fall through */ }
  }
  return { config: await withCostumes(env,normalizeConfig(BUILTIN_SEED)), source: 'seed' };
}

async function withCostumes(env,config){const library=await readCostumeLibrary(env);const all=new Map(config.animations.map(a=>[a.id,a]));for(const a of library.animations)all.set(a.id,a);return {...config,animations:[...all.values()],costumeLibraryRevision:library.revision};}

export async function writeRuntimeConfig(env, config) {
  if (!env?.YAITG_SESSION_KV) throw new Error('kv_missing');
  const library=await readCostumeLibrary(env);
  if(config.costumeLibraryRevision!==undefined&&config.costumeLibraryRevision!==library.revision)throw Error('Costume library changed; reload before saving');
  const costumes=(config.animations||[]).filter(a=>a.costumeRef);
  for(const a of costumes){validateAnimationDraft(a);const authored=library.costumes[a.costumeRef];if(!authored)throw Error('Unregistered costume version');const expected=new Map(authored.costume.elements.map(e=>[e.id,e.asset]));if(a.elements.length!==expected.size||a.elements.some(e=>expected.get(e.id)!==e.asset||library.assets.find(x=>`${x.id}@${x.version}`===e.asset)?.src!==e.src))throw Error('Accessory versions must change through a new costume version');if(`${a.animationPreset?.id}@${a.animationPreset?.version}`!==authored.costume.preset)throw Error('Preset changes require a new costume version');const canonical=compileBundle(authored,library).animation.animationPreset;if(stable(a.animationPreset)!==stable(canonical))throw Error('Preset content is immutable; create a new preset version');const prior=library.animations.find(x=>x.id===a.id);if(prior?.publishedAt)a.publishedAt=prior.publishedAt;else delete a.publishedAt;if(a.live||a.directLink===true){const refs=new Set(a.elements.map(e=>e.asset));const assets=library.assets.filter(x=>refs.has(`${x.id}@${x.version}`));if(assets.length!==refs.size)throw Error('Unresolved accessory version');await verifyCostumeAssets(env,assets);}}
  for(const a of costumes)if(a.live&&!a.publishedAt)a.publishedAt=new Date().toISOString();
  if(JSON.stringify(costumes)!==JSON.stringify(library.animations)){library.animations=costumes;await writeCostumeLibrary(env,library);}
  const normalized = normalizeConfig({
    ...config,
    animations:(config.animations||[]).filter(a=>!a.costumeRef),
    updatedAt: new Date().toISOString()
  });
  await env.YAITG_SESSION_KV.put(RUNTIME_KV_KEY, JSON.stringify(normalized));
  return withCostumes(env,normalized);
}

export function publicView(config) {
  const live = (config.animations || []).filter((a) => a.live && !a.archived);
  return {
    schemaVersion: config.schemaVersion,
    updatedAt: config.updatedAt,
    tiers: config.tiers,
    flags: config.flags,
    settings: config.settings || {
      clickThresholdMin: 3,
      clickThresholdMax: 5,
      stormResetDurationMs: 1500,
      selectionMode: 'alternate',
      interactionOpacityDuringAnimation: 0.8
    },
    seasons: config.seasons,
    directAnimations: (config.animations || []).filter(a => a.directLink === true && !a.live && !a.archived),
    animations: live
  };
}

export function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function readR2Quota(env) {
  const key = monthKey();
  let row = null;
  try {
    row = await env.YAITG_SESSION_KV?.get(R2_QUOTA_KV_KEY, 'json');
  } catch (_) {}
  if (!row || row.month !== key) {
    row = { month: key, storageBytes: 0, classA: 0, classB: 0 };
  }
  return row;
}

export async function writeR2Quota(env, row) {
  await env.YAITG_SESSION_KV.put(R2_QUOTA_KV_KEY, JSON.stringify(row));
}

/** Asset GET misses share one KV write per minute. Cache hits never call this. */
export async function writeR2QuotaCoalesced(env, row, cache) {
  const marker = new Request('https://yaitg.internal/r2-quota-flush');
  if (cache && await cache.match(marker)) return { wrote: false };
  await writeR2Quota(env, row);
  const put = cache?.put(marker, new Response('', { headers: { 'cache-control': 'max-age=60' } }));
  if (put) await put;
  return { wrote: true };
}

/**
 * @param {'classA'|'classB'} kind
 * @param {number} [bytesDelta] storage change for puts/deletes
 */
export function r2Allowed(quota, kind, bytesDelta = 0) {
  const f = R2_FREE;
  const nextStorage = quota.storageBytes + bytesDelta;
  const nextA = quota.classA + (kind === 'classA' ? 1 : 0);
  const nextB = quota.classB + (kind === 'classB' ? 1 : 0);
  const ratios = {
    storage: nextStorage / f.storageBytes,
    classA: nextA / f.classAOpsPerMonth,
    classB: nextB / f.classBOpsPerMonth
  };
  const maxRatio = Math.max(ratios.storage, ratios.classA, ratios.classB);
  if (bytesDelta > f.maxObjectBytes) {
    return { ok: false, error: 'r2_object_too_large', maxRatio, ratios };
  }
  if (maxRatio >= f.blockAt) {
    return { ok: false, error: 'r2_quota_block', maxRatio, ratios };
  }
  return {
    ok: true,
    warn: maxRatio >= f.warnAt,
    maxRatio,
    ratios
  };
}
