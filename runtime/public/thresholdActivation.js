/**
 * Public apex: pick upcoming animation at cycle START (page load + after each
 * activation reset). Character clicks before threshold use that animation's
 * clickEffect. Threshold fires activate(upcoming) IMMEDIATELY — no blank
 * ghost pre-flash, no await fetch/decode at threshold time.
 */
import { pickAnimation } from '../loot/LootTable.js';
import { log, info, debug, warn, error } from '../../js/log.js';
import {
  activate,
  previewClick,
  resolveClickEffect,
  preloadActivationAssets
} from '../../effects/activation/ActivationEngine.js';
import { mountOverlayProps } from '../../effects/activation/mountOverlayProps.js';
import { GHOST_CONFIG } from '../../effects/spore/ghost/config.js';
import { resolvePlacementsForAnimation } from '../../effects/activation/defaultPlacements.js';

let cachedConfig = null;
let cacheAt = 0;
/** @type {object | null} */
let hookedEffect = null;
const CACHE_MS = 15_000;

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
  const now = Date.now();
  if (!force && cachedConfig && now - cacheAt < CACHE_MS) return cachedConfig;
  try {
    const r = await fetch('/api/animations', { credentials: 'same-origin' });
    const data = await r.json();
    if (r.ok && data.ok) {
      cachedConfig = data;
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
  return !pick || pick.id === 'ghost' || pick.anim?.playMode === 'legacy-ghost';
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
  return (anim.elements || []).map((el) => {
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
  prepared = null;
  const config = cachedConfig;
  const animId = upcoming?.id || 'ghost';
  const ghost = !upcoming || isGhostPick(upcoming);
  const anim = upcoming?.anim || { id: 'ghost', playMode: 'legacy-ghost', elements: [] };

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
        src: GHOST_CONFIG.ASSETS.SPORE_IMAGE || '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png',
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

  const compositeElements = buildCompositeElements(animForBuild, placementsById);
  const elements = (animForBuild.elements || []).map((el) => ({
    ...el,
    placement: placementsById[el.id]
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

  prepared = {
    transitionId:config?.placementsByAnimation?.[animId]?.transitionId||anim.animationPreset?.transition||'lightning',
    kind: ghost ? 'ghost' : 'composite',
    ready: true,
    id: animId,
    anim: animForBuild,
    placementsById,
    elements,
    compositeElements,
    urls
  };
  exposeUpcoming();
  return prepared;
}

/**
 * Pick (or re-pick) the upcoming animation for this cycle + preload its assets.
 */
export async function pickUpcoming({ forceRefresh = false, creature = null } = {}) {
  const config = await fetchAnimationConfig(forceRefresh);
  applyClickThresholdFromConfig(hookedEffect || (typeof window !== 'undefined' ? window.__yaitgEffect : null), config);
  const forced = resolveForcePick(config);
  if (forced) {
    upcoming = forced;
    // Do not record forced as played — only activation complete advances the cursor.
  } else if (!config) {
    upcoming = { id: 'ghost', anim: { id: 'ghost', playMode: 'legacy-ghost' } };
  } else {
    const cursor = readSelectionCursor();
    // Advance past last *played* id (memory wins over storage within a session).
    const lastId = lastPlayedId || cursor.lastPlayedId || cursor.lastId;
    const pick = pickAnimation(config, {
      lastId,
      cursorIndex: cursor.index
    });
    upcoming = pick || { id: 'ghost', anim: { id: 'ghost', playMode: 'legacy-ghost' } };
    // Intentionally do NOT write upcoming.id into the cursor — that skipped the
    // queued animation on reload (cowboy never played → stuck on ghost).
  }
  exposeUpcoming();
  try {
    if (typeof window !== 'undefined') {
      window.__yaitgSelectionCursor = readSelectionCursor();
    }
  } catch (_) {}
  const cre = creature || (typeof document !== 'undefined' ? document.getElementById('mainCreature') : null);
  await prepareUpcoming(cre);
  return upcoming;
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

  const parent = creature.parentElement;
  rig = document.createElement('div');
  rig.id = 'creatureRig';
  rig.className = 'creature-rig';
  const cs = getComputedStyle(creature);
  if (cs.animationName && cs.animationName !== 'none') {
    rig.style.animation = cs.animation;
    creature.style.animation = 'none';
  }
  parent.insertBefore(rig, creature);
  rig.appendChild(creature);
  overlay = document.createElement('div');
  overlay.id = 'overlayLayer';
  overlay.className = 'public-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.opacity = '0';
  rig.appendChild(overlay);
  return { rig, overlay, creature };
}

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

  const origTrigger = effect.triggerLightningReset.bind(effect);
  const origEnd = effect.endLightningSequence.bind(effect);
  const origCreate = effect.createSporeExplosion.bind(effect);

  effect.createSporeExplosion = function patchedCreate(x, y, opts) {
    // During activation flash / running anim / reset fade: always default spores only
    // (no composite preview overlays). onSporeClick already passes decor opacity.
    if (opts?.decorOnly || this.isActivationInteractionBusy?.()) {
      const opacity = Number.isFinite(Number(opts?.opacity))
        ? Number(opts.opacity)
        : (typeof this.getInteractionDecorOpacity === 'function'
            ? this.getInteractionDecorOpacity()
            : 0.8);
      return origCreate(x, y, { opacity, decorOnly: true });
    }
    const up = upcoming;
    if (!up?.anim) return origCreate(x, y, opts);
    const fx = resolveClickEffect(up.anim);
    if (fx.type === 'ghost-spores' || fx.type === 'image-spores') {
      // Default: unchanged image burst. When previewObjectActions, route through
      // previewClick so ghost textProjectile (BOO) runs on click-preview spores.
      if (up.anim?.previewObjectActions === true) {
        const placementsById = prepared?.placementsById || placementsFor(cachedConfig, up.id);
        const elements = prepared?.compositeElements || buildCompositeElements(up.anim, placementsById);
        return previewClick({
          container: this.container,
          creature: this.creature,
          animation: up.anim,
          compositeElements: elements,
          x,
          y,
          sporeHost: this.container,
          fallback: (xx, yy) => origCreate(xx, yy, opts)
        });
      }
      return origCreate(x, y, opts);
    }
    const placementsById = prepared?.placementsById || placementsFor(cachedConfig, up.id);
    const elements = prepared?.compositeElements || buildCompositeElements(up.anim, placementsById);
    return previewClick({
      container: this.container,
      creature: this.creature,
      animation: up.anim,
      compositeElements: elements,
      x,
      y,
      sporeHost: this.container,
      fallback: (xx, yy) => origCreate(xx, yy, opts)
    });
  };

  /**
   * Threshold entry — EVERY animation (ghost + composite) activates IMMEDIATELY
   * through ActivationEngine / OverlayPlayer. Same lifecycle; profiles are data.
   */
  effect.triggerLightningReset = async function patchedTrigger() {
    if (this.lightningSequenceActive || this.finaleInProgress) return;

    const pick = resolveForcePick(cachedConfig) || upcoming;
    const ghost = isGhostPick(pick);

    this.clearAllTimers?.();
    this.lightningSequenceActive = true;
    this.finaleInProgress = true;
    this.hideOverlay?.();

    const creature = this.creature;
    const container = this.container;
    const CONFIG = this.getConfig();
    const { rig, overlay } = ensurePublicOverlayDom(creature);

    if (ghost) {
      if (!prepared?.ready || prepared.kind !== 'ghost') {
        upcoming = pick || { id: 'ghost', anim: { id: 'ghost', playMode: 'legacy-ghost' } };
        await prepareUpcoming(creature);
      }
    } else if (!prepared?.ready || prepared.id !== pick.id || prepared.kind !== 'composite') {
      upcoming = pick;
      await prepareUpcoming(creature);
    }
    const prep = prepared;
    let nextRound;
    const prepareNextRound=()=>{
      if(nextRound)return nextRound;
      recordPlayed(ghost?'ghost':pick?.id,Number.isFinite(pick?.index)?pick.index:(ghost?0:-1));
      upcoming=null;prepared=null;
      nextRound=pickUpcoming({forceRefresh:true,creature}).catch(err=>error('Next costume preparation failed',err));
      return nextRound;
    };

    if (!ghost) {
      const placementsById = prep.placementsById || {};
      const elements = prep.elements || [];
      mountOverlayProps(overlay, { creature, creatureRig: rig, elements, placementsById });
    }
    overlay.style.opacity = '0';

    try {
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
          onResetStart:prepareNextRound
        });
      }
    } catch (err) {
      error(ghost ? 'ghost activation failed' : 'composite activation failed; falling back to legacy ghost', err);
      overlay.innerHTML = '';
      overlay.style.opacity = '0';
      this.lightningSequenceActive = false;
      this.finaleInProgress = false;
      if (!ghost) return origTrigger();
      return;
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
  // Keep hooks as no-ops so a stray origTrigger completion cannot double-pick.
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
    await pickUpcoming({ creature: effect.creature });
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
