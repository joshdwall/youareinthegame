import { costumeIdForSlug } from '../costumes/publicSlug.js';
/**
 * Public apex: pick upcoming animation at cycle START (page load + after each
 * activation reset). Character clicks before threshold use that animation's
 * clickEffect. Threshold fires activate(upcoming) IMMEDIATELY — no blank
 * ghost pre-flash, no await fetch/decode at threshold time.
 *
 * Click semantics while the next costume's preview is still decoding:
 * every character click still counts once toward the threshold and paints an
 * interrobang (U+203D) immediately. Those clicks do not advance the costume
 * cursor and do not start extra prepares — one in-flight selection is the
 * latest intent, and visible interrobangs swap to that costume when it is ready.
 * The following costume's images are decoded in the background so the mark is rare.
 */
import { eligibleOrdered, pickAnimation } from '../loot/LootTable.js';
import { linkedOnlyAnimations } from './linkedOnlyAnimations.js';
import { log, info, debug, warn, error } from '../../js/log.js';
import {
  activate,
  previewClick,
  resolveClickEffect,
  preloadActivationAssets
} from '../../effects/activation/ActivationEngine.js';
import { spawnInterrobangPreview, upgradePendingCostumePreviews } from '../../effects/activation/pendingCostumePreview.js';
import { createDefaultSporeExplosion } from '../../effects/spore/defaultSpore.js';
import { mountOverlayProps } from '../../effects/activation/mountOverlayProps.js';
import { GHOST_CONFIG } from '../../effects/spore/ghost/config.js';
import { resolvePlacementsForAnimation } from '../../effects/activation/defaultPlacements.js';

let cachedConfig = null;
const nextSecondaryByCharacter = new Set();
let cacheAt = 0;
/** @type {string | null} */
let cachedConfigEtag = null;
/** @type {object | null} */
let hookedEffect = null;
const CACHE_MS = 15_000;
// Cambio embeds this same entry point with a private, in-memory test pool.
function isCambioEditorFrame() {
  try {
    const frame = window.frameElement;
    if (!frame) return false;
    if (!/^\/cambio\/?$/.test(window.parent.location.pathname)) return false;
    return frame.id === 'cambioPlaytestFrame' || frame.id === 'cambioLiveFrame';
  } catch {
    return false;
  }
}
function readPlaytestConfig() {
  try {
    if (!isCambioEditorFrame()) return null;
    return window.frameElement.cambioPlaytestConfig || null;
  } catch { /* Ordinary public page or cross-origin embed. */ }
  return null;
}
const playtestConfig = readPlaytestConfig();
function readLinkedAnimationId(search) {
  const match = /^\?([a-z0-9]+)$/i.exec(search);
  return match?.[1].toLowerCase() || '';
}
const linkedAnimationId = playtestConfig || typeof location === 'undefined'
  ? ''
  : readLinkedAnimationId(location.search);
let playtestCursor = { index: -1, lastPlayedId: null, lastId: null };

/** @type {{ id: string, anim: object, prepared?: object } | null} */
let upcoming = null;
/** Last completed activation id (memory). Not the upcoming pick. */
let lastPlayedId = null;


const SELECTION_CURSOR_KEY = 'yaitg.selectionCursor';
/** Cursor schema v2: lastPlayedId is the animation that finished activating — NOT the upcoming pick.
 *  Writing upcoming.id as lastId (v1) caused reloads to skip the queued anim (stuck on ghost when
 *  cowboy was upcoming). v1 blobs are ignored so visitors start clean. */
const SELECTION_CURSOR_VERSION = 2;

/** @returns {{ index: number, lastPlayedId: string|null, lastId: string|null }} */
export function readSelectionCursor() {
  if (playtestConfig) return playtestCursor;
  try {
    if (typeof localStorage === 'undefined') {
      return { index: -1, lastPlayedId: null, lastId: null };
    }
    const raw = localStorage.getItem(SELECTION_CURSOR_KEY);
    if (!raw) return { index: -1, lastPlayedId: null, lastId: null };
    const parsed = JSON.parse(raw);
    // Drop v1 cursors (lastId meant "upcoming") — they skip the queued animation on reload.
    if (Number(parsed?.v) !== SELECTION_CURSOR_VERSION) {
      return { index: -1, lastPlayedId: null, lastId: null };
    }
    const index = Number.isFinite(Number(parsed?.index)) ? Math.floor(Number(parsed.index)) : -1;
    const lastPlayedId =
      parsed?.lastPlayedId != null
        ? String(parsed.lastPlayedId)
        : parsed?.lastId != null
          ? String(parsed.lastId)
          : null;
    return { index, lastPlayedId, lastId: lastPlayedId };
  } catch {
    return { index: -1, lastPlayedId: null, lastId: null };
  }
}

/**
 * Persist last-played cursor. Prefer lastPlayedId; lastId kept as alias for older readers.
 * @param {{ index?: number, lastPlayedId?: string|null, lastId?: string|null }} cursor
 */
export function writeSelectionCursor(cursor) {
  if (playtestConfig) {
    playtestCursor = { ...cursor, lastId: cursor.lastPlayedId };
    return;
  }
  try {
    if (typeof localStorage === 'undefined') return;
    const lastPlayedId =
      cursor?.lastPlayedId != null
        ? String(cursor.lastPlayedId)
        : cursor?.lastId != null
          ? String(cursor.lastId)
          : null;
    localStorage.setItem(
      SELECTION_CURSOR_KEY,
      JSON.stringify({
        v: SELECTION_CURSOR_VERSION,
        index: Number.isFinite(Number(cursor?.index)) ? Math.floor(Number(cursor.index)) : -1,
        lastPlayedId,
        lastId: lastPlayedId
      })
    );
  } catch (_) {}
}

/**
 * Mark an animation as finished (activation complete). Next pickUpcoming advances past this id.
 * Must NOT be called when merely selecting the upcoming pick.
 * @param {string|null|undefined} playedId
 * @param {number} [playedIndex]
 */
export function recordPlayed(playedId, playedIndex = -1) {
  lastPlayedId = playedId != null && playedId !== '' ? String(playedId) : null;
  const prev = readSelectionCursor();
  const index = Number.isFinite(Number(playedIndex)) && Number(playedIndex) >= 0
    ? Math.floor(Number(playedIndex))
    : prev.index;
  writeSelectionCursor({ lastPlayedId, index });
  try {
    if (typeof window !== 'undefined') {
      window.__yaitgSelectionCursor = readSelectionCursor();
    }
  } catch (_) {}
}


/** Prepared payload for the current upcoming (placements, elements, urls). */
let prepared = null;

export async function fetchAnimationConfig(force = false) {
  if (playtestConfig) {
    cachedConfig = playtestConfig;
    return cachedConfig;
  }
  const now = Date.now();
  if (!force && cachedConfig && now - cacheAt < CACHE_MS) return cachedConfig;
  try {
    const headers = {};
    if (!force && cachedConfigEtag) headers['If-None-Match'] = cachedConfigEtag;
    const r = await fetch('/api/animations', { credentials: 'same-origin', headers, cache: force ? 'no-cache' : 'default' });
    if (r.status === 304 && cachedConfig) {
      cacheAt = now;
      return cachedConfig;
    }
    const data = await r.json();
    if (r.ok && data.ok) {
      const badge = globalThis.document?.getElementById('tapSporeBadge');
      const visitors = globalThis.document?.getElementById('visitorsLink');
      if (badge) badge.disabled = data.settings?.tapSporeBadgeEnabled === false;
      if (visitors) {
        visitors.hidden = data.settings?.visitorsEnabled === false;
        const image = visitors.querySelector('img');
        if (image) {
          const labeled = !data.settings?.visitorsImage && data.settings?.visitorsLabelEnabled !== false;
          const source = data.settings?.visitorsImage || (labeled
            ? '/img/visitors-earth-labeled.webp' : '/img/visitors-earth-v2.webp');
          image.width = labeled ? 54 : 36;
          image.height = labeled ? 39 : 36;
          if (image.getAttribute('src') !== source) image.src = source;
        }
      }
      cachedConfig = data;
      cachedConfigEtag = r.headers.get('etag');
      cacheAt = now;
      return data;
    }
  } catch (e) {
    warn('animation config fetch failed', e);
  }
  return cachedConfig;
}

export function forceIdFromQuery() {
  try {
    const u = new URL(location.href);
    const id = u.searchParams.get('force');
    if (!id) return null;
    const host = location.hostname;
    if (host === '127.0.0.1' || host === 'localhost' || host.endsWith('.local')) return id;
    if (document.documentElement.dataset.yaitgAllowForce === '1') return id;
    return null;
  } catch {
    return null;
  }
}

export function getUpcoming() {
  return upcoming;
}

export function getPrepared() {
  return prepared;
}

export function setUpcomingForTests(pick) {
  upcoming = pick;
  prepared = null;
}

/** @param {string|null} id */
export function setLastPlayedForTests(id) {
  lastPlayedId = id != null && id !== '' ? String(id) : null;
}

export function clearSelectionCursorForTests() {
  lastPlayedId = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SELECTION_CURSOR_KEY);
  } catch (_) {}
}

function resolveForcePick(config) {
  const forceId = forceIdFromQuery();
  if (!forceId || !config?.animations) return null;
  const anim = config.animations.find((a) => a.id === forceId);
  return anim ? { id: forceId, anim } : null;
}

function isGhostPick(pick) {
  return pick?.id === 'ghost' || pick?.anim?.playMode === 'legacy-ghost';
}

/** Identity of the preview a click should show. Revision bumps force a quiet rebuild. */
function previewKeyFor(pick) {
  if (!pick?.id) return '';
  const rev = cachedConfig?.costumeLibraryRevision ?? '';
  const updated = cachedConfig?.updatedAt ?? '';
  const secondary = nextSecondaryByCharacter.has(pick.id) ? 's' : 'p';
  return `${pick.id}:${secondary}:${rev}:${updated}`;
}

/**
 * True when the upcoming costume already has decoded preview art.
 * A same-costume refresh keeps the current art up so clicks never go blank.
 */
function costumePreviewReady(pick = upcoming) {
  if (!pick?.id || !prepared?.ready || prepared.id !== pick.id) return false;
  return prepared.usesSecondary === nextSecondaryByCharacter.has(pick.id);
}

function previewAnimationFor(pick) {
  if (!pick?.anim) return null;
  const fx = resolveClickEffect(pick.anim);
  if (!isGhostPick(pick) && fx.type === 'ghost-spores') {
    return { ...pick.anim, clickEffect: { type: 'composite-spores' } };
  }
  return pick.anim;
}

function selectPick(config, { openingRound = false } = {}) {
  const forced = resolveForcePick(config);
  if (linkedAnimationId) {
    const anim = config?.animations?.find((entry) =>
      entry.id === linkedAnimationId && entry.live && !entry.archived
    );
    const direct = [...(config?.animations || []), ...(config?.directAnimations || [])].find(entry =>
      !entry.archived && (entry.id === linkedAnimationId || entry.id.replaceAll('-', '') === linkedAnimationId)
    );
    const preferred = costumeIdForSlug(linkedAnimationId);
    const alias = [...(config?.animations || []), ...(config?.directAnimations || [])]
      .find(entry => preferred !== linkedAnimationId && entry.id === preferred && !entry.archived);
    const linked = alias || anim || direct || linkedOnlyAnimations.get(linkedAnimationId);
    return linked ? { id: linked.id, anim: linked } : null;
  }
  if (forced) return forced;
  if (!config) return null;
  const cursor = readSelectionCursor();
  const lastId = lastPlayedId || cursor.lastPlayedId || cursor.lastId;
  const pick = pickAnimation(config, { lastId, cursorIndex: cursor.index });
  const opening = openingRound && config.settings?.openingAnimationId;
  const featured = opening && config.animations?.find((anim) =>
    anim.id === opening && anim.live && !anim.archived
  );
  return (featured ? { id: featured.id, anim: featured } : pick) || null;
}

let prepareFlight = null;
let prepareFlightKey = '';
const warmedCostumeKeys = new Set();
let warmChain = Promise.resolve();

function revealPendingCostume() {
  if (!costumePreviewReady(upcoming)) return;
  const creature = typeof document !== 'undefined' ? document.getElementById('mainCreature') : null;
  const baseSrc = prepared.kind === 'ghost' || prepared.anim?.replacesCreature
    ? null
    : (creature?.getAttribute?.('src') || '/img/mushroom-platypus.png');
  upgradePendingCostumePreviews({
    animation: previewAnimationFor(upcoming),
    compositeElements: prepared.compositeElements || [],
    baseSrc
  });
}

function collectAnimUrls(anim, creature) {
  if (!anim) return [];
  if (isGhostPick({ id: anim.id, anim })) {
    return [
      GHOST_CONFIG.ASSETS.OVERLAY_IMAGE,
      GHOST_CONFIG.ASSETS.SPORE_IMAGE,
      creature?.getAttribute?.('src') || '/img/mushroom-platypus.png'
    ].filter(Boolean);
  }
  const placementsById = resolvePlacementsForAnimation(placementsFor(cachedConfig, anim.id), anim.id);
  const groups = [anim.elements || []];
  if (anim.secondaryCostume?.elements?.length) groups.push(anim.secondaryCostume.elements);
  const urls = [];
  for (const elements of groups) {
    const animForBuild = { ...anim, elements };
    urls.push(...assetUrls(animForBuild, buildCompositeElements(animForBuild, placementsById), creature));
  }
  return [...new Set(urls.filter(Boolean))];
}

function enqueueWarm(anim, creature) {
  if (!anim?.id) return;
  const token = `${anim.id}:${cachedConfig?.costumeLibraryRevision ?? ''}:${cachedConfig?.updatedAt ?? ''}`;
  if (warmedCostumeKeys.has(token)) return;
  warmedCostumeKeys.add(token);
  const urls = collectAnimUrls(anim, creature);
  const profile = isGhostPick({ id: anim.id, anim }) ? 'ghost' : (anim.id || 'composite');
  warmChain = warmChain.then(() => preloadActivationAssets(urls, profile)).catch(() => {
    warmedCostumeKeys.delete(token);
  });
}

/** Decode the following costume (and a small live pool) so the handoff rarely needs ‽. */
function scheduleLookahead(creature) {
  const config = cachedConfig;
  if (upcoming?.anim) enqueueWarm(upcoming.anim, creature);
  if (!config || linkedAnimationId) return;
  const cursor = readSelectionCursor();
  const next = pickAnimation(config, {
    lastId: upcoming?.id || lastPlayedId,
    cursorIndex: cursor.index
  });
  if (next?.anim) enqueueWarm(next.anim, creature);
  const pool = eligibleOrdered(config);
  if (config.settings?.selectionMode === 'weighted' || pool.length <= 6) {
    for (const anim of pool.slice(0, 8)) enqueueWarm(anim, creature);
  }
}

function placementsFor(config, animId) {
  return config?.placementsByAnimation?.[animId]?.elements || {};
}

async function loadPlacementsFallback(animId) {
  try {
    const placeRes = await fetch('/content/cambio-placements.json');
    if (placeRes.ok) {
      const pj = await placeRes.json();
      const fromSeed = pj?.byAnimation?.[animId]?.elements || {};
      if (Object.keys(fromSeed).length) return fromSeed;
    }
  } catch (_) {}
  return resolvePlacementsForAnimation(null, animId);
}

function buildCompositeElements(anim, placementsById) {
  return (anim.elements || []).filter(el => (placementsById[el.id] || el.placement)?.shown !== false).map((el) => {
    const src = el.src
      ? (el.src.startsWith('/') || el.src.startsWith('http')
          ? el.src
          : '/' + el.src.replace(/^\//, ''))
      : null;
    return {
      id: el.id,
      src,
      role: el.role || null,
      anchor: el.anchor || null,
      defaultWidthFrac: el.defaultWidthFrac,
      placement: placementsById[el.id] || el.placement || null
    };
  });
}

function assetUrls(anim, compositeElements, creature) {
  const urls = [];
  if (creature?.getAttribute?.('src')) urls.push(creature.getAttribute('src'));
  else urls.push('/img/mushroom-platypus.png');
  for (const el of compositeElements || []) {
    if (el.src) urls.push(el.src);
  }
  for (const el of anim?.elements || []) {
    const src = el.src?.startsWith('/') || el.src?.startsWith('http')
      ? el.src
      : '/' + (el.src || '').replace(/^\//, '');
    if (src) urls.push(src);
  }
  return [...new Set(urls.filter(Boolean))];
}

/**
 * Resolve placements + preload images/CSS for the upcoming animation.
 * Must finish before threshold so activate() is synchronous-start.
 */
export async function prepareUpcoming(creature) {
  const pick = upcoming;
  if (!pick) return null;
  const key = previewKeyFor(pick);
  if (
    prepared?.ready &&
    prepared.previewKey === key &&
    prepared.id === pick.id &&
    prepared.usesSecondary === nextSecondaryByCharacter.has(pick.id)
  ) {
    revealPendingCostume();
    return prepared;
  }
  if (prepareFlight && prepareFlightKey === key) return prepareFlight;
  prepareFlightKey = key;
  const run = prepareUpcomingBody(creature, pick);
  prepareFlight = run.finally(() => {
    if (prepareFlightKey === key) prepareFlight = null;
  });
  return prepareFlight;
}

async function prepareUpcomingBody(creature, pick) {
  const config = cachedConfig;
  if (!pick || (upcoming && upcoming.id !== pick.id)) return null;
  const { id: animId, anim } = pick;
  const ghost = isGhostPick(pick);

  // Ensure ghost has sporeBody element definition even if runtime-config omitted it
  // (seed/defaults still supply placements.objectActions).
  let animForBuild = anim;
  if (ghost && !(anim.elements || []).length) {
    animForBuild = {
      ...anim,
      elements: [{
        id: 'ghostBody',
        role: 'sporeBody',
        anchor: 'mouth',
        src: GHOST_CONFIG.ASSETS.SPORE_IMAGE || '/assets/animations/ghostremake/spore.png',
        defaultWidthFrac: 1
      }]
    };
  }

  let placementsById = placementsFor(config, animId);
  // If API/KV returned placements for other anims but not this one, still fall back.
  if (!Object.keys(placementsById).length) {
    placementsById = await loadPlacementsFallback(animId);
  } else if (ghost && !placementsById.ghostBody) {
    // Partial KV (cowboy only): merge code/seed ghost defaults for missing keys
    const fb = await loadPlacementsFallback(animId);
    placementsById = { ...fb, ...placementsById };
  }
  placementsById = resolvePlacementsForAnimation(placementsById, animId);
  const secondaryElements = anim.secondaryCostume?.elements;
  const usesSecondary = !!secondaryElements?.length && nextSecondaryByCharacter.has(animId);
  if (!secondaryElements?.length) nextSecondaryByCharacter.delete(animId);
  if (usesSecondary) {
    animForBuild = { ...animForBuild, elements: secondaryElements };
    placementsById = Object.fromEntries(secondaryElements.map(item => [item.id, item.placement]));
  }

  const compositeElements = buildCompositeElements(animForBuild, placementsById);
  const elements = (animForBuild.elements || []).filter(el => (placementsById[el.id] || el.placement)?.shown !== false).map((el) => ({
    ...el,
    placement: placementsById[el.id] || el.placement
  }));

  const urls = ghost
    ? [
        GHOST_CONFIG.ASSETS.OVERLAY_IMAGE,
        GHOST_CONFIG.ASSETS.SPORE_IMAGE,
        creature?.getAttribute?.('src') || '/img/mushroom-platypus.png',
        ...compositeElements.map((e) => e.src)
      ].filter(Boolean)
    : assetUrls(animForBuild, compositeElements, creature);

  await preloadActivationAssets([...new Set(urls)], ghost ? 'ghost' : (animId || 'composite'));

  if (!upcoming || upcoming.id !== pick.id) return null;
  prepared = {
    transitionId:config?.placementsByAnimation?.[animId]?.transitionId||anim.animationPreset?.transition||'lightning',
    kind: ghost ? 'ghost' : 'composite',
    ready: true,
    usesSecondary,
    previewKey: previewKeyFor(upcoming),
    id: animId,
    anim: animForBuild,
    placementsById,
    elements,
    compositeElements,
    urls
  };
  exposeUpcoming();
  revealPendingCostume();
  scheduleLookahead(creature);
  return prepared;
}

/**
 * Pick (or re-pick) the upcoming animation for this cycle + preload its assets.
 */
export async function pickUpcoming({ forceRefresh = false, creature = null, openingRound = false } = {}) {
  const config = await fetchAnimationConfig(forceRefresh);
  applyClickThresholdFromConfig(hookedEffect || (typeof window !== 'undefined' ? window.__yaitgEffect : null), config);
  const pick = selectPick(config, { openingRound });
  // Do not record a pick as played — only activation complete advances the cursor.
  // Do not write upcoming.id into the cursor — that skipped the queued animation on reload.
  if (!pick) {
    upcoming = null;
    prepared = null;
  } else if (!costumePreviewReady(pick)) {
    upcoming = pick;
    if (prepared && (prepared.id !== pick.id || prepared.usesSecondary !== nextSecondaryByCharacter.has(pick.id))) {
      prepared = null;
    }
  } else {
    upcoming = pick;
  }
  exposeUpcoming();
  try {
    if (typeof window !== 'undefined') {
      window.__yaitgSelectionCursor = readSelectionCursor();
    }
  } catch (_) {}
  const cre = creature || (typeof document !== 'undefined' ? document.getElementById('mainCreature') : null);
  if (upcoming) await prepareUpcoming(cre);
  else prepared = null;
  return upcoming;
}

/**
 * One config refresh after activation. Same single /api/animations read the
 * handoff used to block on. If the published pool changed, the latest pick
 * replaces the optimistic one; clicks do not each run this.
 */
async function settleNextCostume(creature) {
  try {
    const config = await fetchAnimationConfig(true);
    applyClickThresholdFromConfig(hookedEffect, config);
    const next = selectPick(config, { openingRound: false });
    if (!next) {
      upcoming = null;
      prepared = null;
      exposeUpcoming();
    } else {
      const sameReady = prepared?.ready
        && prepared.id === next.id
        && prepared.usesSecondary === nextSecondaryByCharacter.has(next.id);
      upcoming = next;
      if (!sameReady && prepared && (prepared.id !== next.id || prepared.usesSecondary !== nextSecondaryByCharacter.has(next.id))) {
        prepared = null;
      }
      exposeUpcoming();
    }
    if (upcoming) await prepareUpcoming(creature);
    else prepared = null;
    return upcoming;
  } catch (err) {
    error('Next costume preparation failed', err);
    return upcoming;
  }
}

function exposeUpcoming() {
  try {
    window.__yaitgUpcoming = upcoming;
    window.__yaitgPrepared = prepared;
  } catch (_) {}
}

export function ensurePublicOverlayDom(creature) {
  if (!creature) return null;
  let rig = document.getElementById('creatureRig');
  let overlay = document.getElementById('overlayLayer');
  if (rig && overlay) return { rig, overlay, creature };
  // The rig ships in first-paint markup; reuse it and only add the overlay.
  // Creating a second #creatureRig nested the character away from the rig
  // that callers look up by id, so costume mounting threw on insertBefore.
  if (rig && rig.contains(creature)) {
    overlay = document.createElement('div');
    overlay.id = 'overlayLayer';
    overlay.className = 'public-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.opacity = '0';
    rig.appendChild(overlay);
    return { rig, overlay, creature };
  }

  const parent = creature.parentElement;
  rig = document.createElement('div');
  rig.id = 'creatureRig';
  rig.className = 'creature-rig';
  // Keep the float clock continuous. Copying `animation` onto a new node
  // otherwise restarts at the 0% keyframe (translateY(0)) and the character
  // jumps down from the top of its bob.
  const cs = getComputedStyle(creature);
  const running = cs.animationName && cs.animationName !== 'none';
  const fromAnim = running
    ? (creature.getAnimations?.() || []).find((a) => a.animationName === 'float')
      || (creature.getAnimations?.() || [])[0]
    : null;
  const continueAt = fromAnim && Number.isFinite(fromAnim.currentTime) ? fromAnim.currentTime : null;
  parent.insertBefore(rig, creature);
  rig.appendChild(creature);
  if (running) {
    rig.style.animation = cs.animation;
    const toAnim = (rig.getAnimations?.() || []).find((a) => a.animationName === 'float')
      || (rig.getAnimations?.() || [])[0];
    if (toAnim && continueAt != null) toAnim.currentTime = continueAt;
    creature.style.animation = 'none';
  }
  overlay = document.createElement('div');
  overlay.id = 'overlayLayer';
  overlay.className = 'public-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.opacity = '0';
  rig.appendChild(overlay);
  return { rig, overlay, creature };
}

export function ensureMarkerLayer() {
  let rig = document.getElementById('creatureRig');
  if (!rig) {
    const creature = document.getElementById('mainCreature');
    if (creature) ensurePublicOverlayDom(creature);
    rig = document.getElementById('creatureRig');
  }
  if (!rig) return null;
  let markers = document.getElementById('markerLayer');
  if (markers) return markers;
  markers = document.createElement('div');
  markers.id = 'markerLayer';
  markers.className = 'cambio-markers';
  markers.setAttribute('aria-hidden', 'true');
  rig.appendChild(markers);
  return markers;
}

function exposeCambioStage() {
  if (!isCambioEditorFrame()) return;
  try {
    window.__yaitgCambioStage = { ensurePublicOverlayDom, ensureMarkerLayer };
  } catch (_) {}
}
exposeCambioStage();

/**
 * Hook SporeBaseEffect:
 * - pick + preload upcoming at install (cycle start)
 * - character click spores → previewClick(upcoming)
 * - threshold → IMMEDIATE activate(upcoming) for EVERY profile (ghost + composite)
 *   via the same OverlayPlayer path in ActivationEngine
 */

/** Apply live click-threshold settings onto the SporeBaseEffect instance. */
export function applyClickThresholdFromConfig(effect, config) {
  if (!effect?.applyLiveClickThreshold) return;
  const settings = config?.settings || cachedConfig?.settings;
  if (settings) effect.applyLiveClickThreshold(settings);
}

export function installThresholdLootHook(effect) {
  if (!effect || effect.__lootHooked) return;
  effect.__lootHooked = true;
  hookedEffect = effect;
  applyClickThresholdFromConfig(effect, cachedConfig);

  let previewDuringBurst = null;
  const setBurstPreview = preview => { previewDuringBurst = preview; };

  effect.createSporeExplosion = function patchedCreate(x, y, opts) {
    const fallback = (xx, yy) => createDefaultSporeExplosion(xx, yy, this.container, opts);
    if (opts?.decorOnly || this.isActivationInteractionBusy?.()) {
      if (previewDuringBurst) return previewDuringBurst(x, y);
      const opacity = Number.isFinite(Number(opts?.opacity))
        ? Number(opts.opacity)
        : this.getInteractionDecorOpacity?.() ?? 0.8;
      return createDefaultSporeExplosion(x, y, this.container, { opacity });
    }
    const up = upcoming;
    const fx = up?.anim ? resolveClickEffect(up.anim) : null;
    const ghost = isGhostPick(up);
    if (up?.anim && !ghost && fx?.type === 'image-spores' && !fx.sporeImage) return fallback(x, y);
    // Clicks never advance the costume and never start another prepare.
    // One in-flight selection serves every click. If its art is not decoded,
    // paint ‽ now and swap those same nodes when it is.
    if (!costumePreviewReady(up)) {
      return spawnInterrobangPreview({
        host: this.container,
        container: this.container,
        creature: this.creature,
        x,
        y,
        animation: previewAnimationFor(up)
      });
    }
    const animation = previewAnimationFor(up);
    const prep = prepared;
    return previewClick({
      container: this.container,
      creature: this.creature,
      animation,
      compositeElements: prep.compositeElements || buildCompositeElements(animation, prep.placementsById || {}),
      x,
      y,
      sporeHost: this.container,
      fallback: null
    });
  };

  /**
   * Threshold entry — EVERY animation (ghost + composite) activates IMMEDIATELY
   * through ActivationEngine / OverlayPlayer. Same lifecycle; profiles are data.
   */
  effect.triggerLightningReset = async function patchedTrigger() {
    if (this.lightningSequenceActive || this.finaleInProgress) return;

    const pick = linkedAnimationId ? upcoming : resolveForcePick(cachedConfig) || upcoming;
    if (!pick) {
      this.stormLevel = 0;
      this.clickCount = 0;
      this.resetVisuals();
      this.calculateResetThreshold();
      void pickUpcoming({ forceRefresh: true, creature: this.creature }).catch(err => error('Costume refresh failed', err));
      return;
    }
    const ghost = isGhostPick(pick);

    this.clearAllTimers?.();
    this.lightningSequenceActive = true;
    this.finaleInProgress = true;
    this.hideOverlay?.();

    const creature = this.creature;
    const container = this.container;
    const { rig, overlay } = ensurePublicOverlayDom(creature);

    let nextRound;
    const prepareNextRound=()=>{
      if(nextRound)return nextRound;
      if (prepared?.anim?.secondaryCostume?.elements?.length && !prepared.usesSecondary) {
        nextSecondaryByCharacter.add(pick.id);
      } else {
        nextSecondaryByCharacter.delete(pick.id);
      }
      if (!linkedAnimationId) recordPlayed(ghost?'ghost':pick?.id,Number.isFinite(pick?.index)?pick.index:(ghost?0:-1));
      // Choose the next costume from the config already in memory so the
      // handoff does not wait on /api/animations. Art that was warmed during
      // this round is decoded immediately; otherwise clicks show ‽.
      const optimistic = selectPick(cachedConfig, { openingRound: false });
      if (!optimistic) {
        upcoming = null;
        prepared = null;
        exposeUpcoming();
      } else if (
        prepared?.ready &&
        prepared.id === optimistic.id &&
        prepared.usesSecondary === nextSecondaryByCharacter.has(optimistic.id)
      ) {
        upcoming = optimistic;
        exposeUpcoming();
      } else {
        upcoming = optimistic;
        prepared = null;
        exposeUpcoming();
        void prepareUpcoming(creature).catch(err => error('Next costume preparation failed', err));
      }
      nextRound = settleNextCostume(creature);
      return nextRound;
    };

    try {
      if (!prepared?.ready || prepared.id !== pick.id) {
        upcoming = pick;
        await prepareUpcoming(creature);
      }
      const prep = prepared;
      if (!prep) throw new Error('Costume preparation unavailable');
      if (!ghost) {
        mountOverlayProps(overlay, { creature, creatureRig: rig, elements: prep.elements, placementsById: prep.placementsById });
      }
      overlay.style.opacity = '0';
      if (ghost) {
        await activate({
          animation:pick?.anim||{},
          transitionId:prep?.transitionId,
          container,
          creature,
          creatureRig: rig,
          sporeHost: container,
          profile: 'ghost',
          composite: {
            baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
            elements: prep?.compositeElements || []
          },
          assetsPreloaded: true,
          onSporePhase: setBurstPreview,
          onResetStart:prepareNextRound
        });
      } else {
        const placementsById = prep.placementsById || {};
        await activate({
          animation:pick?.anim||{},
          transitionId:prep?.transitionId,
          container,
          creature,
          creatureRig: rig,
          sporeHost: container,
          profile: 'composite',
          flashHost: overlay,
          composite: {
            baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
            elements: prep.compositeElements || buildCompositeElements(pick.anim, placementsById)
          },
          spore: { count: 8, scale: 0.32, durationMs: 1800, distancePx: 140 },
          assetsPreloaded: true,
          onSporePhase: setBurstPreview,
          onResetStart:prepareNextRound
        });
      }
    } catch (err) {
      error('Costume activation failed', err);
      this.stormLevel = 0;
      this.resetVisuals();
    }

    // Reset host: keep opacity 0 (never '') so a cleared host cannot flash opaque.
    overlay.innerHTML = '';
    overlay.style.opacity = '0';
    overlay.classList.remove('activation-flash-host');

    this.clickCount = 0;
    applyClickThresholdFromConfig(this, cachedConfig);
    this.calculateResetThreshold?.();
    this.lightningSequenceActive = false;
    this.finaleInProgress = false;
    this.stormLevel = 0;
    // ActivationEngine has already completed the one visible reset fade.
    // Never start a second, invisible cooldown on an already-light background.
    this.__stormResetFadeUntil = 0;
    if (this.creature) {
      this.creature.className = this.creature.className.replace(/storm-level-\d+/g, '');
    }
    // SporeBaseEffect no longer owns the climax overlay; clear any stale ref.
    if (this.effectOverlay && !this.effectOverlay.isConnected) {
      this.effectOverlay = null;
    } else if (this.effectOverlay) {
      this.effectOverlay.className = this.effectOverlay.className.replace(/storm-level-\d+/g, '');
      this.effectOverlay.style.opacity = '0';
    }

    await prepareNextRound();
  };

  // Legacy SporeBaseEffect climax path is unused when activate() owns every profile.
  // Keep legacy completion hooks from advancing the costume twice.
  effect.endLightningSequence = function patchedEnd() {
    // Composite + ghost both finish inside activate(); ignore leftover calls.
  };

  const origFinale = effect.onFinaleComplete?.bind(effect);
  if (origFinale) {
    effect.onFinaleComplete = async function patchedFinale() {
      // activate() already recorded + picked; only run base cleanup if still needed.
      try {
        await origFinale();
      } catch (_) {}
    };
  }

  // Cycle start: pick + preload; always ensure shared overlay DOM (ghost + composite).
  (async () => {
    await pickUpcoming({ creature: effect.creature, openingRound: true });
    if (effect.creature) {
      ensurePublicOverlayDom(effect.creature);
    }
  })().catch(() => {});
}

export default {
  fetchAnimationConfig,
  applyClickThresholdFromConfig,
  installThresholdLootHook,
  ensurePublicOverlayDom,
  pickUpcoming,
  prepareUpcoming,
  getUpcoming,
  getPrepared,
  setUpcomingForTests,
  setLastPlayedForTests,
  clearSelectionCursorForTests,
  recordPlayed,
  readSelectionCursor,
  writeSelectionCursor,
  forceIdFromQuery
};
