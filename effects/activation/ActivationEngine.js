/**
 * Shared character-overlay activation engine.
 * Play / threshold → OverlayPlayer flash + spore replicas + reset.
 * Ghost + cowboy (+ future) share ONE OverlayPlayer lifecycle; profiles are data.
 * Cowboy flashes accessories on the LIVE character via flashHost
 * (same mount/placement path as edit mode) + mini composite-replica spores.
 * Never draws a second full-size base character during the flash.
 * Owned flash layers are always created fresh per run and removed on cleanup.
 */
import { FireworkManager } from '../spore/finale.js';
import { GHOST_CONFIG } from '../spore/ghost/config.js';
import { fadeStormResetToLight } from './fadeStormReset.js';
import { buildCharacterComposite, measureCreatureBox } from './CharacterComposite.js';
import { runObjectActions } from './objectActions.js';
import { resolveClickEffect } from './clickEffect.js';
import { computeClampedBurstDelta } from '../spore/sporeBurstMath.js';
import { OVERLAY_PROFILES } from './overlayProfiles.js';
import {
  preloadAndDecode,
  clearOwnedFlashLayers,
  createImageFlashLayer,
  bindFlashHost,
  createOverlayPlayer
} from './OverlayPlayer.js';

const loadedSheets = new Set();

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureStylesheet(href) {
  if (loadedSheets.has(href)) return;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes(href) || l.getAttribute('href') === href)) {
    loadedSheets.add(href);
    return;
  }
  await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.activationStylesheet = '1';
    link.onload = () => { loadedSheets.add(href); resolve(); };
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

/**
 * Preload stylesheets + images used by activation. Call at cycle start so
 * threshold activate() can flash overlay from frame one with no await gap.
 */
export async function preloadActivationAssets(urls = [], profileId = 'ghost') {
  const profile = OVERLAY_PROFILES[profileId] || OVERLAY_PROFILES.ghost;
  await Promise.all((profile.stylesheets || []).map((href) => ensureStylesheet(href)));
  await preloadAndDecode(urls);
}

function bodyFlash(classExtra = '') {

  const el = document.createElement('div');
  el.className = `lightning-flash${classExtra ? ' ' + classExtra : ''}`;
  document.body.appendChild(el);
  return el;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container - .container stage
 * @param {HTMLElement} opts.creature - #mainCreature
 * @param {HTMLElement} [opts.sporeHost] - where spores append (default container)
 * @param {'ghost'|'composite'} opts.profile
 * @param {object} [opts.composite] - { baseSrc, elements } — used for mini spores only when profile=composite
 * @param {HTMLElement} [opts.flashHost] - existing overlay host (e.g. #overlayLayer with accessories
 *   already mounted via edit-mode mountProps). When set, flash flickers THIS host — no duplicate base.
 * @param {object} [opts.spore] - overrides { count, scale, durationMs }
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ok:boolean}>}
 */
export async function runActivation(opts) {
  const {
    container,
    creature,
    creatureRig = null,
    sporeHost = container,
    profile = 'ghost',
    composite = null,
    flashHost = null,
    spore = {},
    signal = null,
    assetsPreloaded = false
  } = opts;

  if (!container || !creature) throw new Error('activation: container and creature required');
  const flashParent = creatureRig || container;

  // Stylesheets + images must be ready BEFORE first flash frame.
  // Cycle-start prepareUpcoming calls preloadActivationAssets; skip awaits at threshold.
  if (!assetsPreloaded) {
    const urls = profile === 'composite' && composite
      ? [composite.baseSrc, ...(composite.elements || []).map((e) => e.src)]
      : [GHOST_CONFIG.ASSETS.OVERLAY_IMAGE];
    await preloadActivationAssets(urls);
  }

  const timers = new Set();
  const track = (id) => { timers.add(id); return id; };
  const clearTimers = () => {
    timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    timers.clear();
  };
  const aborted = () => signal?.aborted;

  // Clean prior OWNED flash leftovers only (never delete a foreign host by id).
  clearOwnedFlashLayers(flashParent, container);
  sporeHost.querySelectorAll('.firework-spore, .activation-spore').forEach((n) => n.remove());

  const boxInContainer = measureCreatureBox(creature, flashParent);
  const overlayProfile = OVERLAY_PROFILES[profile] || OVERLAY_PROFILES.ghost;
  let overlayPlayer = null;
  let fireworkManager = null;

  // Build flash overlay via OverlayPlayer — identical lifecycle for every profile.
  if (profile === 'ghost') {
    const layer = createImageFlashLayer({
      parent: flashParent,
      src: overlayProfile.imageSrc || GHOST_CONFIG.ASSETS.OVERLAY_IMAGE,
      box: boxInContainer,
      alt: 'Ghost Overlay',
      matchCreatureFloat: true
    });
    overlayPlayer = createOverlayPlayer({ layer, owned: true, flash: overlayProfile.flash });
  } else if (profile === 'composite') {
    // Flash accessories ON the live character — never a second full-size base.
    if (!flashHost) {
      throw new Error('activation: composite profile requires flashHost (live overlay with accessories)');
    }
    if (!composite) {
      throw new Error('activation: composite profile requires composite (for mini spores)');
    }
    const layer = bindFlashHost(flashHost);
    overlayPlayer = createOverlayPlayer({ layer, owned: false, flash: overlayProfile.flash });
  } else {
    throw new Error(`activation: unknown profile ${profile}`);
  }

  const showFlash = () => overlayPlayer?.show();
  const hideFlash = () => overlayPlayer?.hide();
  const cleanupFlashLayer = () => {
    overlayPlayer?.cleanup();
    overlayPlayer = null;
  };

  // Lightning sequence (same timing envelope as SporeBaseEffect)
  const L = GHOST_CONFIG.LIGHTNING;
  const sequenceDuration = L.SEQUENCE_MIN_MS + Math.random() * (L.SEQUENCE_MAX_MS - L.SEQUENCE_MIN_MS);
  const endTime = Date.now() + sequenceDuration;

  await new Promise((resolve) => {
    const tick = () => {
      if (aborted() || Date.now() >= endTime) {
        hideFlash();
        resolve();
        return;
      }
      const flash = bodyFlash();
      showFlash();
      const flashDuration = L.FLASH_MIN_MS + Math.random() * (L.FLASH_MAX_MS - L.FLASH_MIN_MS);
      track(setTimeout(() => {
        flash.remove();
        hideFlash();
      }, flashDuration));
      const nextDelay = L.FLASH_GAP_MIN_MS + Math.random() * (L.FLASH_GAP_MAX_MS - L.FLASH_GAP_MIN_MS);
      track(setTimeout(tick, nextDelay));
    };
    tick();
  });

  if (aborted()) {
    clearTimers();
    cleanupFlashLayer();
    return { ok: false, aborted: true };
  }

  // Spores — assets already preloaded before flash (cycle start or activate entry)
  const fw = GHOST_CONFIG.FIREWORKS;
  const launchX = window.innerWidth / 2 + fw.LAUNCH_OFFSET_X;
  const launchY = window.innerHeight / 2 + fw.LAUNCH_OFFSET_Y;

  // Object-action elements: same data shape for every character (placements → composite.elements).
  // Ghost image spores and cowboy composites both run runObjectActions from this list.
  const actionElements = Array.isArray(composite?.elements) ? composite.elements : [];
  const sporeBodyEl = actionElements.find((e) => e?.role === 'sporeBody' || e?.id === 'ghostBody')
    || actionElements.find((e) => e?.placement?.objectActions?.length)
    || null;
  const imageSporeSrc = sporeBodyEl?.src
    || (profile === 'ghost' ? (fw.SPORE_IMAGE || GHOST_CONFIG.ASSETS.SPORE_IMAGE) : null);

  const sporeDone = new Promise((resolve) => {
    const charBox = { width: boxInContainer.width, height: boxInContainer.height };
    const fwLaunch = {
      ...fw,
      SPORE_COUNT: spore.count ?? fw.SPORE_COUNT,
      createSporeElement(sporeInst, dims) {
        const sporeIndex = sporeInst?.id ?? Math.floor(Math.random() * 1000);
        let node;

        if (profile === 'composite') {
          // Mini character replicas (cowboy etc.)
          const targetW = dims?.width ?? (fw.BASE_WIDTH * sporeInst.size);
          const scale = targetW / Math.max(1, charBox.width);
          node = buildCharacterComposite({
            baseSrc: composite.baseSrc,
            elements: actionElements,
            box: charBox,
            scale
          });
          node.classList.add('activation-spore');
          node.style.position = 'absolute';
          node.style.width = `${charBox.width * scale}px`;
          node.style.height = `${charBox.height * scale}px`;
          node.style.zIndex = '25';
          node.style.opacity = '1';
          node.style.overflow = 'visible';
        } else {
          // Image spore (ghost): single sprite + OA anchors from placements data
          const w = dims?.width ?? (fw.BASE_WIDTH * sporeInst.size);
          const h = dims?.height ?? (fw.BASE_HEIGHT * sporeInst.size);
          node = document.createElement('div');
          node.classList.add('activation-spore');
          node.style.position = 'absolute';
          node.style.width = `${w}px`;
          node.style.height = `${h}px`;
          node.style.zIndex = '25';
          node.style.opacity = '1';
          node.style.overflow = 'visible';
          const img = document.createElement('img');
          img.src = imageSporeSrc || fw.SPORE_IMAGE;
          img.draggable = false;
          img.dataset.elementId = sporeBodyEl?.id || 'ghostBody';
          img.alt = '';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.display = 'block';
          img.style.pointerEvents = 'none';
          node.appendChild(img);
        }

        const ctrl = runObjectActions({
          root: node,
          elements: actionElements,
          target: 'spore',
          sporeIndex
        });
        node.__actionStop = ctrl.stop;
        return node;
      }
    };
    fireworkManager = new FireworkManager(fwLaunch);
    fireworkManager.launch(launchX, launchY, sporeHost, () => resolve());
    track(setTimeout(resolve, 6000));
  });

  // Final flash (apex parity)
  track(setTimeout(() => {
    const finalFlash = bodyFlash('final-reset');
    finalFlash.style.transition = `opacity ${GHOST_CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION}ms ease-out`;
    finalFlash.style.opacity = '1';
    finalFlash.offsetHeight;
    requestAnimationFrame(() => { finalFlash.style.opacity = '0'; });
    track(setTimeout(() => finalFlash.remove(), GHOST_CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION + 500));
  }, GHOST_CONFIG.ANIMATIONS.FIREWORKS_DELAY_BEFORE_FINAL));

  await sporeDone;

  // Reset — remove owned flash layers; leave live character + flashHost structure untouched
  clearTimers();
  try { fireworkManager?.destroy?.(); } catch (_) { /* ignore */ }
  fireworkManager = null;
  cleanupFlashLayer();
  sporeHost.querySelectorAll('.activation-spore, .firework-spore, .activation-click-spore').forEach((n) => {
    try { n.__actionStop?.(); } catch (_) {}
    n.remove();
  });
  // Only owned layers — never strip a live flashHost or SporeBaseEffect by bare id.
  clearOwnedFlashLayers(flashParent, container);

  // Gradual dark→light fade (activation flash stayed instant above)
  const liveFade = (typeof window !== 'undefined' && window.__yaitgEffect?.__liveStormResetMs)
    || GHOST_CONFIG.ANIMATIONS.STORM_RESET_DURATION;
  fadeStormResetToLight(container, {
    durationMs: liveFade,
    backgroundColor: GHOST_CONFIG.VISUALS.BACKGROUND_COLOR
  });

  return { ok: true };
}


/**
 * Alias: full threshold activation for an animation.
 * Same as runActivation — prefer this name at call sites that pair with previewClick.
 */
export async function activate(opts) {
  return runActivation(opts);
}

/**
 * Per-click preview burst for the upcoming animation (character clicks only).
 * Background clicks should keep using plain/default spores.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.creature
 * @param {object} opts.animation - animation def (with optional clickEffect)
 * @param {Array} [opts.compositeElements] - [{id,src,placement}] for composite-spores
 * @param {number} opts.x - click x relative to container
 * @param {number} opts.y - click y relative to container
 * @param {HTMLElement} [opts.sporeHost]
 * @param {function} [opts.fallback] - called for ghost-spores (e.g. effect.createSporeExplosion)
 */
export function previewClick(opts) {
  const {
    container,
    creature,
    animation,
    compositeElements = [],
    x,
    y,
    sporeHost = container,
    fallback = null
  } = opts;

  const fx = resolveClickEffect(animation);

  if (fx.type === 'ghost-spores' || fx.type === 'image-spores') {
    // When previewObjectActions is on, prefer our image burst so textProjectile can run.
    // Otherwise keep legacy fallback (SporeBaseEffect.createSporeExplosion) unchanged.
    if (animation?.previewObjectActions === true) {
      const img = fx.sporeImage || '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png';
      spawnImageBurst(sporeHost, x, y, img, fx.count || 16, {
        runObjectActions: true,
        elements: compositeElements
      });
      return { ok: true, type: fx.type, via: 'image-actions' };
    }
    if (typeof fallback === 'function') {
      fallback(x, y);
      return { ok: true, type: fx.type, via: 'fallback' };
    }
    // Minimal image burst if no fallback provided
    const img = fx.sporeImage || '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png';
    spawnImageBurst(sporeHost, x, y, img, fx.count || 16);
    return { ok: true, type: fx.type, via: 'image' };
  }

  // composite-spores: mini replicas of base + accessories
  const box = measureCreatureBox(creature, container);
  const charBox = { width: box.width, height: box.height };
  const count = fx.count || 16;
  const baseScale = fx.scale || 0.15;
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));

  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const scale = baseScale * (0.75 + Math.random() * 0.5);
      const node = buildCharacterComposite({
        baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
        elements: compositeElements,
        box: charBox,
        scale
      });
      node.classList.add('spore', 'activation-click-spore');
      node.style.position = 'absolute';
      node.style.pointerEvents = 'none';
      node.style.zIndex = '20';
      node.style.overflow = 'visible';

      const baseAngle = (Math.PI * 2 * i) / perLayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      const w = charBox.width * scale;
      const h = charBox.height * scale;
      const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
        width: w,
        height: h,
        host: sporeHost
      });
      const rotation = 360 + Math.random() * 720;
      node.style.setProperty('--tx', tx + 'px');
      node.style.setProperty('--ty', ty + 'px');
      node.style.setProperty('--rotation', rotation + 'deg');

      node.style.left = (x - w / 2) + 'px';
      node.style.top = (y - h / 2) + 'px';

      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      node.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

      // Object actions (guns etc.) only on preview when animation.previewObjectActions === true (default false).
      // Real activate()/runActivation always runs object actions.
      if (animation?.previewObjectActions === true) {
        const ctrl = runObjectActions({
          root: node,
          elements: compositeElements,
          target: 'spore',
          sporeIndex: layer * perLayer + i
        });
        node.__actionStop = ctrl.stop;
      }
      sporeHost.appendChild(node);
      setTimeout(() => {
        try { node.__actionStop?.(); } catch (_) {}
        node.remove();
      }, (duration + delay) * 1000 + 50);
    }
  }
  return { ok: true, type: 'composite-spores' };
}

function spawnImageBurst(host, x, y, src, count, opts = {}) {
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));
  const sw = 76, sh = 50;
  const runActions = opts.runObjectActions === true;
  const actionElements = runActions && Array.isArray(opts.elements) ? opts.elements : [];
  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'spore activation-spore';
      wrap.style.position = 'absolute';
      wrap.style.width = `${sw}px`;
      wrap.style.height = `${sh}px`;
      wrap.style.overflow = 'visible';
      wrap.style.pointerEvents = 'none';
      wrap.style.zIndex = '20';
      const spore = document.createElement('img');
      spore.src = src;
      spore.draggable = false;
      spore.dataset.elementId = 'ghostBody';
      spore.alt = '';
      spore.style.width = '100%';
      spore.style.height = '100%';
      spore.style.display = 'block';
      wrap.appendChild(spore);
      const baseAngle = (Math.PI * 2 * i) / perLayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
        width: sw,
        height: sh,
        host
      });
      wrap.style.setProperty('--tx', tx + 'px');
      wrap.style.setProperty('--ty', ty + 'px');
      wrap.style.setProperty('--rotation', (360 + Math.random() * 720) + 'deg');
      wrap.style.left = (x - sw / 2) + 'px';
      wrap.style.top = (y - sh / 2) + 'px';
      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      wrap.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;
      if (runActions && actionElements.length) {
        const ctrl = runObjectActions({
          root: wrap,
          elements: actionElements,
          target: 'spore',
          sporeIndex: layer * perLayer + i
        });
        wrap.__actionStop = ctrl.stop;
      }
      host.appendChild(wrap);
      setTimeout(() => {
        try { wrap.__actionStop?.(); } catch (_) {}
        wrap.remove();
      }, (duration + delay) * 1000 + 50);
    }
  }
}

export { resolveClickEffect };
export default { runActivation, activate, previewClick, resolveClickEffect, preloadActivationAssets };
