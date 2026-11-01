/**
 * Public apex: pick upcoming animation at cycle START (page load + after each
 * activation reset). Character clicks before threshold use that animation's
 * clickEffect. Threshold fires activate(upcoming) IMMEDIATELY — no blank
 * ghost pre-flash, no await fetch/decode at threshold time.
 */
import { pickAnimation } from '../loot/LootTable.js';
import {
  activate,
  previewClick,
  resolveClickEffect,
  preloadActivationAssets
} from '../../effects/activation/ActivationEngine.js';
import { mountOverlayProps } from '../../effects/activation/mountOverlayProps.js';
import { fadeStormResetToLight } from '../../effects/activation/fadeStormReset.js';

let cachedConfig = null;
let cacheAt = 0;
/** @type {object | null} */
let hookedEffect = null;
const CACHE_MS = 15_000;

/** @type {{ id: string, anim: object, prepared?: object } | null} */
let upcoming = null;
let lastPickedId = null;


const SELECTION_CURSOR_KEY = 'yaitg.selectionCursor';

/** @returns {{ index: number, lastId: string|null }} */
export function readSelectionCursor() {
  try {
    if (typeof localStorage === 'undefined') return { index: -1, lastId: null };
    const raw = localStorage.getItem(SELECTION_CURSOR_KEY);
    if (!raw) return { index: -1, lastId: null };
    const parsed = JSON.parse(raw);
    const index = Number.isFinite(Number(parsed?.index)) ? Math.floor(Number(parsed.index)) : -1;
    const lastId = parsed?.lastId != null ? String(parsed.lastId) : null;
    return { index, lastId };
  } catch {
    return { index: -1, lastId: null };
  }
}

/** @param {{ index?: number, lastId?: string|null }} cursor */
export function writeSelectionCursor(cursor) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      SELECTION_CURSOR_KEY,
      JSON.stringify({
        index: Number.isFinite(Number(cursor?.index)) ? Math.floor(Number(cursor.index)) : -1,
        lastId: cursor?.lastId != null ? String(cursor.lastId) : null
      })
    );
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
    console.warn('animation config fetch failed', e);
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
  if (pick?.id) lastPickedId = pick.id;
  prepared = null;
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
      return pj?.byAnimation?.[animId]?.elements || {};
    }
  } catch (_) {}
  return {};
}

function buildCompositeElements(anim, placementsById) {
  return (anim.elements || []).map((el) => ({
    id: el.id,
    src: el.src.startsWith('/') || el.src.startsWith('http')
      ? el.src
      : '/' + el.src.replace(/^\//, ''),
    placement: placementsById[el.id] || el.placement
  }));
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
  if (!upcoming || isGhostPick(upcoming)) {
    prepared = { kind: 'ghost', ready: true };
    exposeUpcoming();
    return prepared;
  }
  const config = cachedConfig;
  let placementsById = placementsFor(config, upcoming.id);
  if (!Object.keys(placementsById).length) {
    placementsById = await loadPlacementsFallback(upcoming.id);
  }
  const compositeElements = buildCompositeElements(upcoming.anim, placementsById);
  const elements = (upcoming.anim.elements || []).map((el) => ({
    ...el,
    placement: placementsById[el.id]
  }));
  const urls = assetUrls(upcoming.anim, compositeElements, creature);
  await preloadActivationAssets(urls);
  prepared = {
    kind: 'composite',
    ready: true,
    id: upcoming.id,
    anim: upcoming.anim,
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
    lastPickedId = forced.id;
  } else if (!config) {
    upcoming = { id: 'ghost', anim: { id: 'ghost', playMode: 'legacy-ghost' } };
  } else {
    const cursor = readSelectionCursor();
    const lastId = lastPickedId || cursor.lastId;
    const pick = pickAnimation(config, {
      lastId,
      cursorIndex: cursor.index
    });
    upcoming = pick || { id: 'ghost', anim: { id: 'ghost', playMode: 'legacy-ghost' } };
    lastPickedId = upcoming.id;
    const nextIndex = Number.isFinite(pick?.index) ? pick.index : cursor.index;
    writeSelectionCursor({ index: nextIndex, lastId: upcoming.id });
  }
  exposeUpcoming();
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
 * - threshold → IMMEDIATE activate(upcoming) for composites (no ghost pre-sequence)
 * - ghost keeps original triggerLightningReset timing
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
   * Threshold entry — composites activate IMMEDIATELY (same moment as ghost would
   * start its first flash). Ghost keeps the original lightning→spores path.
   */
  effect.triggerLightningReset = async function patchedTrigger() {
    if (this.lightningSequenceActive || this.finaleInProgress) return;

    const pick = resolveForcePick(cachedConfig) || upcoming;
    if (isGhostPick(pick)) {
      return origTrigger();
    }

    // --- Composite: immediate simultaneous flash+overlay (no blank pre-flash) ---
    this.clearAllTimers?.();
    this.lightningSequenceActive = true;
    this.finaleInProgress = true;
    this.hideOverlay?.();

    const creature = this.creature;
    const container = this.container;
    const CONFIG = this.getConfig();
    const { rig, overlay } = ensurePublicOverlayDom(creature);

    // Ensure prepared (should already be ready from cycle start)
    if (!prepared?.ready || prepared.id !== pick.id || prepared.kind !== 'composite') {
      upcoming = pick;
      await prepareUpcoming(creature);
    }
    const prep = prepared;
    const placementsById = prep.placementsById || {};
    const elements = prep.elements || [];

    // Mount accessories NOW (assets already decoded) — opacity 0 until engine flashes
    mountOverlayProps(overlay, { creature, creatureRig: rig, elements, placementsById });
    overlay.style.opacity = '0';

    try {
      await activate({
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
        spore: { count: 8, scale: 0.32, durationMs: 1800, rangePx: 140 },
        assetsPreloaded: true
      });
    } catch (err) {
      console.error('composite activation failed; falling back to ghost', err);
      overlay.innerHTML = '';
      this.lightningSequenceActive = false;
      this.finaleInProgress = false;
      return origTrigger();
    }

    overlay.innerHTML = '';
    overlay.style.opacity = '';
    overlay.classList.remove('activation-flash-host');

    this.clickCount = 0;
    applyClickThresholdFromConfig(this, cachedConfig);
    this.calculateResetThreshold?.();
    this.lightningSequenceActive = false;
    this.finaleInProgress = false;
    this.stormLevel = 0;
    // Gradual dark→light (prior SporeBaseEffect fade); flash at activation stays instant
    const fadeMs = Number.isFinite(this.__liveStormResetMs)
      ? this.__liveStormResetMs
      : (CONFIG?.ANIMATIONS?.STORM_RESET_DURATION || 1500);
    // Keep clicks decorative through the fade after finale flags clear
    this.markStormResetFade?.(fadeMs);
    fadeStormResetToLight(container, {
      durationMs: fadeMs,
      backgroundColor: CONFIG?.VISUALS?.BACKGROUND_COLOR || '#7ab5a0'
    });
    if (this.creature) {
      this.creature.className = this.creature.className.replace(/storm-level-\d+/g, '');
    }
    if (this.effectOverlay) {
      this.effectOverlay.className = this.effectOverlay.className.replace(/storm-level-\d+/g, '');
    }

    upcoming = null;
    prepared = null;
    await pickUpcoming({ forceRefresh: true, creature });
  };

  // Ghost climax end: after fireworks path, pick next upcoming (+ preload)
  effect.endLightningSequence = function patchedEnd() {
    const pick = resolveForcePick(cachedConfig) || upcoming;
    // If somehow composite reached here, do nothing (trigger already handled)
    if (!isGhostPick(pick)) {
      return;
    }
    lastPickedId = 'ghost';
    origEnd();
    // Pick next after a short delay so finaleComplete can run; also hook onFinaleComplete
  };

  const origFinale = effect.onFinaleComplete?.bind(effect);
  if (origFinale) {
    effect.onFinaleComplete = async function patchedFinale() {
      await origFinale();
      upcoming = null;
      prepared = null;
      await pickUpcoming({ creature: this.creature });
    };
  }

  // Cycle start: pick + preload now (and ensure overlay DOM for composites)
  (async () => {
    await pickUpcoming({ creature: effect.creature });
    if (!isGhostPick(upcoming) && effect.creature) {
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
  forceIdFromQuery
};
