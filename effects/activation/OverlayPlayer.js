/**
 * OverlayPlayer — ONE standard lifecycle for every culmination overlay.
 *
 * Contract (identical for ghost image + cowboy composite + future):
 *  1. preloadAndDecode(urls) before first flash frame
 *  2. create fresh owned layer OR bind flashHost (composite) per run
 *  3. show/hide/flicker with shared OVERLAY_FLASH timings
 *  4. cleanup: remove owned layers only; leave flashHost structure; opacity 0
 *
 * Never reuse a detached DOM node. Never leave a stale effectOverlay ref.
 */
import { OVERLAY_FLASH } from './overlayProfiles.js';

const OWNED_LAYER_CLASS = 'activation-flash-layer';

/**
 * @param {string[]} urls
 * @returns {Promise<void>}
 */
export async function preloadAndDecode(urls = []) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  await Promise.all(
    unique.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            if (img.decode) {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
          };
          img.src = src;
        })
    )
  );
}

/**
 * Remove leftover owned flash layers from prior runs (never touches bare hosts).
 * @param {...(ParentNode|null|undefined)} roots
 */
export function clearOwnedFlashLayers(...roots) {
  for (const root of roots) {
    if (!root?.querySelectorAll) continue;
    root.querySelectorAll(`.${OWNED_LAYER_CLASS}`).forEach((n) => n.remove());
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.parent - where to append the image layer
 * @param {string} opts.src
 * @param {{ left:number, top:number, width:number, height?:number }} [opts.box]
 * @param {string} [opts.alt]
 * @param {boolean} [opts.matchCreatureFloat=true] - disable self-float when parent rig floats
 * @returns {HTMLImageElement}
 */
export function createImageFlashLayer({ parent, src, box = null, alt = 'Overlay', matchCreatureFloat = true, id = 'effectOverlay' }) {
  if (!parent) throw new Error('OverlayPlayer: parent required for image layer');
  const layer = document.createElement('img');
  layer.className = `effect-overlay ${OWNED_LAYER_CLASS}`;
  layer.dataset.overlayOwned = '1';
  if (id) layer.id = id;
  layer.src = src;
  layer.alt = alt;
  layer.draggable = false;
  layer.style.opacity = '0';
  layer.style.pointerEvents = 'none';
  if (box) {
    layer.style.left = `${box.left}px`;
    layer.style.top = `${box.top}px`;
    layer.style.width = `${box.width}px`;
    layer.style.height = 'auto';
  }
  if (matchCreatureFloat) {
    // Parent creature-rig already runs float — avoid double-bob.
    layer.style.animation = 'none';
  }
  parent.appendChild(layer);
  return layer;
}

/**
 * Bind an existing host (e.g. #overlayLayer with accessories already mounted).
 * @param {HTMLElement} host
 * @returns {HTMLElement}
 */
export function bindFlashHost(host) {
  if (!host) throw new Error('OverlayPlayer: flashHost required for composite');
  host.classList.add('activation-flash-host');
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.transition = 'none';
  return host;
}

/**
 * Create a player bound to one layer for one activation run.
 * @param {object} opts
 * @param {HTMLElement} opts.layer
 * @param {boolean} opts.owned - if true, cleanup() removes the layer
 * @param {object} [opts.flash] - opacity timing (defaults OVERLAY_FLASH)
 */
export function createOverlayPlayer({ layer, owned, flash = OVERLAY_FLASH, secondaryLayers=[] }) {
  const setStyle=(name,value)=>{for(const n of [layer,...secondaryLayers])if(n?.isConnected)n.style[name]=value;};
  let flickerInterval = null;
  const timers = new Set();

  const clearFlicker = () => {
    if (flickerInterval != null) {
      clearInterval(flickerInterval);
      timers.delete(flickerInterval);
      flickerInterval = null;
    }
  };

  return {
    get layer() {
      return layer;
    },
    get owned() {
      return owned;
    },
    /** @returns {boolean} */
    isConnected() {
      return !!(layer && layer.isConnected);
    },
    show() {
      if (!layer?.isConnected) return;
      if (Math.random() > (flash.SHOW_PROBABILITY ?? 1)) return;
      clearFlicker();
      const opacity =
        (flash.MIN_OPACITY ?? 0.3) +
        Math.random() * ((flash.MAX_OPACITY ?? 0.6) - (flash.MIN_OPACITY ?? 0.3));
      setStyle('transition',`opacity ${flash.FADE_IN_MS ?? 50}ms ease`);
      setStyle('opacity',String(opacity));
      if (flash.FLICKER_ENABLED) {
        flickerInterval = setInterval(() => {
          if (!layer.isConnected) return;
          const fo =
            (flash.FLICKER_MIN_OPACITY ?? 0.2) +
            Math.random() *
              ((flash.FLICKER_MAX_OPACITY ?? 0.9) - (flash.FLICKER_MIN_OPACITY ?? 0.2));
          setStyle('opacity',String(fo));
        }, flash.FLICKER_SPEED_MS ?? 80);
        timers.add(flickerInterval);
      }
    },
    hide() {
      if (!layer) return;
      clearFlicker();
      if (!layer.isConnected) return;
      setStyle('transition',`opacity ${flash.FADE_OUT_MS ?? 150}ms ease`);
      setStyle('opacity','0');
    },
    /** End of run: hide; remove if owned; leave host at opacity 0. */
    cleanup() {
      clearFlicker();
      timers.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      timers.clear();
      if (!layer) return;
      if (owned) {
        if (layer.isConnected) layer.remove();
      } else if (layer.isConnected) {
        layer.classList.remove('activation-flash-host');
        layer.style.opacity = '0';
        layer.style.transition = '';
      }
      layer = null;
      secondaryLayers.forEach(n=>n.remove());secondaryLayers=[];
    }
  };
}

export const OVERLAY_OWNED_CLASS = OWNED_LAYER_CLASS;

export default {
  preloadAndDecode,
  clearOwnedFlashLayers,
  createImageFlashLayer,
  bindFlashHost,
  createOverlayPlayer,
  OVERLAY_OWNED_CLASS
};
