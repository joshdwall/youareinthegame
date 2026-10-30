/**
 * Shared character-overlay activation engine.
 * Play / threshold → transition + overlay flash + spore replicas + reset.
 * Ghost uses image overlay + FireworkManager (apex-compatible assets/timings).
 * Cowboy (and future) uses composite flash + composite-replica spores.
 */
import { FireworkManager } from '../spore/finale.js';
import { GHOST_CONFIG } from '../spore/ghost/config.js';
import { buildCharacterComposite, measureCreatureBox } from './CharacterComposite.js';

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
 * @param {object} [opts.composite] - { baseSrc, elements:[{id,src,placement}] }
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
    spore = {},
    signal = null
  } = opts;

  if (!container || !creature) throw new Error('activation: container and creature required');
  const flashParent = creatureRig || container;

  await ensureStylesheet(GHOST_CONFIG.STYLESHEETS.EFFECT);
  await ensureStylesheet(GHOST_CONFIG.STYLESHEETS.FINALE);

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
  } else if (profile === 'composite' && composite) {
    flashLayer = document.createElement('div');
    flashLayer.className = 'activation-flash-layer effect-overlay';
    flashLayer.style.cssText = [
      'position:absolute',
      `left:${boxInContainer.left}px`,
      `top:${boxInContainer.top}px`,
      `width:${boxInContainer.width}px`,
      `height:${boxInContainer.height}px`,
      'opacity:0',
      'pointer-events:none',
      'z-index:5'
    ].join(';');
    const comp = buildCharacterComposite({
      baseSrc: composite.baseSrc,
      elements: composite.elements,
      box: { width: boxInContainer.width, height: boxInContainer.height },
      scale: 1
    });
    comp.style.position = 'absolute';
    comp.style.left = '0';
    comp.style.top = '0';
    flashLayer.appendChild(comp);
    flashParent.appendChild(flashLayer);
  } else {
    throw new Error(`activation: unknown profile ${profile}`);
  }

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
    flashLayer?.remove();
    return { ok: false, aborted: true };
  }

  // Spores
  const sporeDone = new Promise((resolve) => {
    if (profile === 'ghost') {
      fireworkManager = new FireworkManager(GHOST_CONFIG.FIREWORKS);
      const launchX = window.innerWidth / 2 + GHOST_CONFIG.FIREWORKS.LAUNCH_OFFSET_X;
      const launchY = window.innerHeight / 2 + GHOST_CONFIG.FIREWORKS.LAUNCH_OFFSET_Y;
      fireworkManager.launch(launchX, launchY, sporeHost, () => resolve());
      // Safety timeout if callback never fires
      track(setTimeout(resolve, 6000));
    } else {
      // Composite replicas — radial burst of mini composites
      const count = spore.count ?? 8;
      const miniScale = spore.scale ?? 0.32;
      const durationMs = spore.durationMs ?? 1800;
      const spread = spore.spreadPx ?? 140;
      const cx = boxInContainer.left + boxInContainer.width / 2;
      const cy = boxInContainer.top + boxInContainer.height / 2;
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        const dist = spread * (0.55 + Math.random() * 0.55);
        const node = buildCharacterComposite({
          baseSrc: composite.baseSrc,
          elements: composite.elements,
          box: { width: boxInContainer.width, height: boxInContainer.height },
          scale: miniScale * (0.85 + Math.random() * 0.3)
        });
        node.classList.add('activation-spore');
        const w = parseFloat(node.style.width);
        const h = parseFloat(node.style.height);
        node.style.left = `${cx - w / 2}px`;
        node.style.top = `${cy - h / 2}px`;
        node.style.opacity = '0.95';
        node.style.zIndex = '8';
        node.style.transition = `transform ${durationMs}ms ease-out, opacity ${durationMs}ms ease-out`;
        sporeHost.appendChild(node);
        requestAnimationFrame(() => {
          node.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 40}px) rotate(${(Math.random() - 0.5) * 40}deg)`;
          node.style.opacity = '0';
        });
      }
      track(setTimeout(resolve, durationMs + 80));
    }
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

  // Reset
  clearTimers();
  hideFlash();
  flashLayer?.remove();
  flashLayer = null;
  sporeHost.querySelectorAll('.activation-spore, .firework-spore').forEach((n) => n.remove());
  flashParent.querySelectorAll('.activation-flash-layer, #effectOverlay').forEach((n) => n.remove());
  container.querySelectorAll('.activation-flash-layer, #effectOverlay').forEach((n) => n.remove());

  return { ok: true };
}

export default { runActivation };
