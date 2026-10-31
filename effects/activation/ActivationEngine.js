/**
 * Shared character-overlay activation engine.
 * Play / threshold → transition + overlay flash + spore replicas + reset.
 * Ghost uses image overlay + FireworkManager (apex-compatible assets/timings).
 * Cowboy (and future) flashes accessories on the LIVE character via flashHost
 * (same mount/placement path as edit mode) + mini composite-replica spores.
 * Never draws a second full-size base character during the flash.
 */
import { FireworkManager } from '../spore/finale.js';
import { GHOST_CONFIG } from '../spore/ghost/config.js';
import { buildCharacterComposite, measureCreatureBox } from './CharacterComposite.js';
import { runObjectActions } from './objectActions.js';
import { resolveClickEffect } from './clickEffect.js';

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
export async function preloadActivationAssets(urls = []) {
  await Promise.all([
    ensureStylesheet(GHOST_CONFIG.STYLESHEETS.EFFECT),
    ensureStylesheet(GHOST_CONFIG.STYLESHEETS.FINALE),
    ensureStylesheet('/effects/activation/activation.css')
  ]);
  const unique = [...new Set((urls || []).filter(Boolean))];
  await Promise.all(unique.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => {
      // decode when available so first paint is not blank
      if (img.decode) {
        img.decode().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    };
    img.src = src;
  })));
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

  // Clean prior activation leftovers
  flashParent.querySelectorAll('.activation-flash-layer, .activation-spore, #effectOverlay').forEach((n) => n.remove());
  container.querySelectorAll('.activation-flash-layer, .activation-spore, #effectOverlay').forEach((n) => n.remove());
  sporeHost.querySelectorAll('.firework-spore, .activation-spore').forEach((n) => n.remove());

  const boxInContainer = measureCreatureBox(creature, flashParent);
  let flashLayer = null;
  let flashOwned = false; // true when we created the layer and may remove it
  let flickerInterval = null;
  let fireworkManager = null;

  const showFlash = () => {
    if (!flashLayer) return;
    const ov = GHOST_CONFIG.OVERLAY;
    if (Math.random() > ov.SHOW_PROBABILITY) return;
    if (flickerInterval) {
      clearInterval(flickerInterval);
      timers.delete(flickerInterval);
    }
    const opacity = ov.MIN_OPACITY + Math.random() * (ov.MAX_OPACITY - ov.MIN_OPACITY);
    flashLayer.style.transition = `opacity ${ov.FADE_IN_MS}ms ease`;
    flashLayer.style.opacity = String(opacity);
    if (ov.FLICKER_ENABLED) {
      flickerInterval = setInterval(() => {
        const fo = ov.FLICKER_MIN_OPACITY + Math.random() * (ov.FLICKER_MAX_OPACITY - ov.FLICKER_MIN_OPACITY);
        flashLayer.style.opacity = String(fo);
      }, ov.FLICKER_SPEED_MS);
      timers.add(flickerInterval);
    }
  };

  const hideFlash = () => {
    if (!flashLayer) return;
    const ov = GHOST_CONFIG.OVERLAY;
    if (flickerInterval) {
      clearInterval(flickerInterval);
      timers.delete(flickerInterval);
      flickerInterval = null;
    }
    flashLayer.style.transition = `opacity ${ov.FADE_OUT_MS}ms ease`;
    flashLayer.style.opacity = '0';
  };

  const cleanupFlashLayer = () => {
    hideFlash();
    if (!flashLayer) return;
    if (flashOwned) {
      flashLayer.remove();
    } else {
      flashLayer.classList.remove('activation-flash-host');
      // Keep opacity 0 until caller clears accessory children (avoids a final opaque flash).
      flashLayer.style.opacity = '0';
      flashLayer.style.transition = '';
      // Caller clears accessory children; do not remove the live overlay host.
    }
    flashLayer = null;
  };

  // Build flash overlay
  if (profile === 'ghost') {
    flashLayer = document.createElement('img');
    flashLayer.id = 'effectOverlay';
    flashLayer.className = 'effect-overlay activation-flash-layer';
    flashLayer.src = GHOST_CONFIG.ASSETS.OVERLAY_IMAGE;
    flashLayer.alt = 'Ghost Overlay';
    flashLayer.draggable = false;
    // Match creature box inside rig so flash tracks the floating character (Cambio + apex-shaped hosts).
    flashLayer.style.cssText = [
      `left:${boxInContainer.left}px`,
      `top:${boxInContainer.top}px`,
      `width:${boxInContainer.width}px`,
      'height:auto',
      'opacity:0',
      'animation:none' /* parent rig already floats */
    ].join(';');
    flashParent.appendChild(flashLayer);
  } else if (profile === 'composite') {
    // Flash accessories ON the live character — never a second full-size base.
    // Caller mounts props via the same edit-mode path (mountProps) into flashHost.
    if (!flashHost) {
      throw new Error('activation: composite profile requires flashHost (live overlay with accessories)');
    }
    if (!composite) {
      throw new Error('activation: composite profile requires composite (for mini spores)');
    }
    flashLayer = flashHost;
    flashOwned = false;
    flashLayer.classList.add('activation-flash-host');
    flashLayer.style.opacity = '0';
    flashLayer.style.pointerEvents = 'none';
    flashLayer.style.transition = 'none';
  } else {
    throw new Error(`activation: unknown profile ${profile}`);
  }
  if (profile === 'ghost') flashOwned = true;

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

  const sporeDone = new Promise((resolve) => {
    if (profile === 'ghost') {
      fireworkManager = new FireworkManager(fw);
      fireworkManager.launch(launchX, launchY, sporeHost, () => resolve());
      track(setTimeout(resolve, 6000));
      return;
    }

    // Cowboy (composite): mini replicas via the SAME FireworkManager origin/timing/physics.
    // Prior path used character-local coords on the page container (wrong space), z-index under
    // the creature-rig, and a short radial fade — spores launched but were effectively invisible.
    const charBox = { width: boxInContainer.width, height: boxInContainer.height };
    const fwComposite = {
      ...fw,
      SPORE_COUNT: spore.count ?? fw.SPORE_COUNT,
      createSporeElement(sporeInst, dims) {
        // Size similar to ghost spore sprites (BASE_WIDTH × character aspect)
        const targetW = dims?.width ?? (fw.BASE_WIDTH * sporeInst.size);
        const scale = targetW / Math.max(1, charBox.width);
        const node = buildCharacterComposite({
          baseSrc: composite.baseSrc,
          elements: composite.elements,
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
        const sporeIndex = sporeInst?.id ?? Math.floor(Math.random() * 1000);
        const ctrl = runObjectActions({
          root: node,
          elements: composite.elements || [],
          target: 'spore',
          sporeIndex
        });
        node.__actionStop = ctrl.stop;
        return node;
      }
    };
    fireworkManager = new FireworkManager(fwComposite);
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
  flashParent.querySelectorAll('.activation-flash-layer, #effectOverlay').forEach((n) => n.remove());
  container.querySelectorAll('.activation-flash-layer, #effectOverlay').forEach((n) => n.remove());

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
  const baseScale = fx.scale || 0.18;
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
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      const rotation = 360 + Math.random() * 720;
      node.style.setProperty('--tx', tx + 'px');
      node.style.setProperty('--ty', ty + 'px');
      node.style.setProperty('--rotation', rotation + 'deg');

      const w = charBox.width * scale;
      const h = charBox.height * scale;
      node.style.left = (x - w / 2) + 'px';
      node.style.top = (y - h / 2) + 'px';

      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      node.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

      const ctrl = runObjectActions({
        root: node,
        elements: compositeElements,
        target: 'spore',
        sporeIndex: layer * perLayer + i
      });
      node.__actionStop = ctrl.stop;
      sporeHost.appendChild(node);
      setTimeout(() => {
        try { node.__actionStop?.(); } catch (_) {}
        node.remove();
      }, (duration + delay) * 1000 + 50);
    }
  }
  return { ok: true, type: 'composite-spores' };
}

function spawnImageBurst(host, x, y, src, count) {
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));
  const sw = 76, sh = 50;
  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const spore = document.createElement('img');
      spore.src = src;
      spore.className = 'spore';
      spore.draggable = false;
      const baseAngle = (Math.PI * 2 * i) / perLayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      spore.style.setProperty('--tx', Math.cos(angle) * velocity + 'px');
      spore.style.setProperty('--ty', Math.sin(angle) * velocity + 'px');
      spore.style.setProperty('--rotation', (360 + Math.random() * 720) + 'deg');
      spore.style.left = (x - sw / 2) + 'px';
      spore.style.top = (y - sh / 2) + 'px';
      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;
      host.appendChild(spore);
      setTimeout(() => spore.remove(), (duration + delay) * 1000 + 50);
    }
  }
}

export { resolveClickEffect };
export default { runActivation, activate, previewClick, resolveClickEffect, preloadActivationAssets };
