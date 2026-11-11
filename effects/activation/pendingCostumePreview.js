/**
 * Stand-in for a costume click-preview whose images are not decoded yet.
 *
 * The mark is U+203D INTERROBANG. Each click paints immediately. When that
 * costume's assets become ready, still-visible marks swap in place to the
 * real preview. Swapping does not spawn a second burst and does not advance
 * the costume cursor.
 */
import { buildCharacterComposite } from './CharacterComposite.js';
import { measureCreatureBox } from './CharacterComposite.js';
import { resolveClickEffect } from './clickEffect.js';
import { computeClampedBurstDelta } from '../spore/sporeBurstMath.js';
import { GHOST_CONFIG } from '../spore/ghost/config.js';

const pending = new Set();

export function resetPendingCostumePreviewsForTests() {
  for (const node of pending) node.remove();
  pending.clear();
}

export function pendingCostumePreviewCount() {
  let n = 0;
  for (const node of pending) if (node.isConnected) n += 1;
  return n;
}

function burstSpec(animation) {
  const fx = resolveClickEffect(animation);
  const scale = Number.isFinite(fx.scale) && fx.scale > 0 ? fx.scale : 0.15;
  return { fx, count: fx.count || 16, scale };
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host
 * @param {HTMLElement} [opts.container]
 * @param {HTMLElement} [opts.creature]
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {object|null} [opts.animation]
 */
export function spawnInterrobangPreview({ host, container, creature, x, y, animation = null }) {
  if (!host) return { ok: false, type: 'interrobang', count: 0 };
  const { count, scale } = burstSpec(animation);
  const measured = creature ? measureCreatureBox(creature, container || host) : { width: 0, height: 0 };
  const charW = measured.width > 8 ? measured.width : 220;
  const charH = measured.height > 8 ? measured.height : 220;
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));
  let spawned = 0;

  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const itemScale = scale * (0.75 + Math.random() * 0.5);
      const w = Math.max(36, charW * itemScale);
      const h = Math.max(36, charH * itemScale);
      const node = document.createElement('div');
      node.className = 'spore costume-preview-pending';
      node.dataset.costumePending = '1';
      node.dataset.boxW = String(charW);
      node.dataset.boxH = String(charH);
      node.dataset.itemScale = String(itemScale);
      node.setAttribute('aria-hidden', 'true');
      node.style.position = 'absolute';
      node.style.pointerEvents = 'none';
      node.style.zIndex = '20';
      node.style.overflow = 'visible';
      node.style.display = 'grid';
      node.style.placeItems = 'center';
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;

      const mark = document.createElement('span');
      mark.className = 'costume-preview-mark';
      mark.textContent = '\u203D';
      const fontPx = Math.max(28, Math.round(Math.min(w, h) * 0.72));
      mark.style.cssText = [
        `font:${fontPx}px/1 Georgia,"Palatino Linotype",Palatino,"Times New Roman",serif`,
        'font-weight:700',
        'color:#14120b',
        'text-shadow:0 0 1px #fff,1px 0 #fff,-1px 0 #fff,0 1px #fff,0 -1px #fff',
        'user-select:none',
        '-webkit-user-select:none',
        'pointer-events:none'
      ].join(';');
      node.appendChild(mark);

      const angle = ((Math.PI * 2 * i) / perLayer) + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, { width: w, height: h, host });
      node.style.setProperty('--tx', `${tx}px`);
      node.style.setProperty('--ty', `${ty}px`);
      node.style.setProperty('--rotation', `${360 + Math.random() * 720}deg`);
      node.style.left = `${x - w / 2}px`;
      node.style.top = `${y - h / 2}px`;
      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      node.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;
      host.appendChild(node);
      pending.add(node);
      spawned += 1;
      const ttl = (duration + delay) * 1000 + 50;
      setTimeout(() => {
        pending.delete(node);
        node.remove();
      }, ttl);
    }
  }
  return { ok: true, type: 'interrobang', count: spawned };
}

/**
 * Replace still-visible interrobang bursts with the costume that just became ready.
 * @param {object} opts
 * @param {object} opts.animation
 * @param {Array} [opts.compositeElements]
 * @param {string|null} [opts.baseSrc]
 */
export function upgradePendingCostumePreviews({ animation, compositeElements = [], baseSrc = null }) {
  const fx = resolveClickEffect(animation);
  const imageSrc = fx.sporeImage || GHOST_CONFIG.ASSETS.SPORE_IMAGE;
  for (const node of [...pending]) {
    if (!node.isConnected) {
      pending.delete(node);
      continue;
    }
    node.replaceChildren();
    node.classList.remove('costume-preview-pending');
    node.dataset.costumePending = '0';
    if (fx.type === 'ghost-spores' || fx.type === 'image-spores') {
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = '';
      img.draggable = false;
      img.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;';
      node.appendChild(img);
    } else {
      const boxW = Number(node.dataset.boxW) || 220;
      const boxH = Number(node.dataset.boxH) || 220;
      const itemScale = Number(node.dataset.itemScale) || 0.15;
      const composite = buildCharacterComposite({
        baseSrc,
        elements: compositeElements,
        box: { width: boxW, height: boxH },
        scale: itemScale
      });
      composite.style.position = 'absolute';
      composite.style.left = '0';
      composite.style.top = '0';
      node.appendChild(composite);
    }
    pending.delete(node);
  }
}
