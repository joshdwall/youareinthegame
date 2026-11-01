/**
 * Pluggable objectActions registry.
 * Element schema: objectActions: [{ type, point:{x,y}, direction, pattern, rate, jitter, appliesTo, ... }]
 * Built-ins: fire (muzzle), textProjectile (short-lived text from an anchor).
 * Handlers receive a runtime context and schedule visuals on a host node.
 */

import { clampBurstDelta, getViewportSpreadScale } from '../spore/sporeBurstMath.js';

/** @type {Map<string, Function>} */
const registry = new Map();

/**
 * @param {string} type
 * @param {(ctx: object) => { stop: Function } | void} handler
 */
export function registerAction(type, handler) {
  registry.set(type, handler);
}

export function getAction(type) {
  return registry.get(type) || null;
}

export function listActionTypes() {
  return [...registry.keys()];
}

/**
 * Normalize action list from element placement or manifest element.
 * @param {object} el
 * @returns {object[]}
 */
export function actionsForElement(el) {
  const fromPlacement = el?.placement?.objectActions;
  const fromEl = el?.objectActions;
  const list = Array.isArray(fromPlacement) && fromPlacement.length
    ? fromPlacement
    : (Array.isArray(fromEl) ? fromEl : []);
  return list.filter((a) => a && a.type);
}

/**
 * Run all objectActions that apply to `target` ('spore' | 'activation') on a composite root.
 * @param {object} opts
 * @param {HTMLElement} opts.root - .activation-composite
 * @param {Array} opts.elements - [{id,src,placement,objectActions}]
 * @param {'spore'|'activation'} opts.target
 * @param {number} [opts.sporeIndex]
 * @returns {{ stop: Function }}
 */
export function runObjectActions({ root, elements = [], target = 'spore', sporeIndex = 0 }) {
  const stoppers = [];
  // Collect fire-capable guns for alternate pattern coordination per root
  const fireSlots = [];

  for (const el of elements) {
    const actions = actionsForElement(el);
    for (const action of actions) {
      const applies = action.appliesTo || ['spore', 'activation'];
      if (!applies.includes(target)) continue;
      const handler = registry.get(action.type);
      if (!handler) continue;
      if (action.type === 'fire') {
        fireSlots.push({ el, action });
        continue;
      }
      const ctrl = handler({ root, el, action, target, sporeIndex });
      if (ctrl?.stop) stoppers.push(ctrl.stop);
    }
  }

  if (fireSlots.length) {
    const ctrl = runAlternatingFire({ root, slots: fireSlots, sporeIndex });
    if (ctrl?.stop) stoppers.push(ctrl.stop);
  }

  return {
    stop() {
      stoppers.forEach((s) => {
        try { s(); } catch (_) {}
      });
    }
  };
}

/**
 * Alternate (or random) fire across gun slots on one spore/composite.
 */
function runAlternatingFire({ root, slots, sporeIndex }) {
  const timers = new Set();
  let idx = sporeIndex % Math.max(1, slots.length);
  let stopped = false;

  const scheduleNext = () => {
    if (stopped || !slots.length) return;
    const pattern = slots[0]?.action?.pattern || 'alternate';
    const slot = pattern === 'random'
      ? slots[Math.floor(Math.random() * slots.length)]
      : slots[idx % slots.length];
    idx += 1;
    const action = slot.action;
    const rate = Math.max(0.5, +action.rate || 3);
    const jitter = Math.max(0, +action.jitter || 0.4);
    const baseMs = 1000 / rate;
    const delay = baseMs * (1 + (Math.random() * 2 - 1) * jitter);
    fireOnce({ root, el: slot.el, action });
    const id = setTimeout(scheduleNext, Math.max(80, delay));
    timers.add(id);
  };

  // Fire once immediately, then stagger subsequent shots so spores don't sync
  const firstSlot = slots[sporeIndex % Math.max(1, slots.length)];
  if (firstSlot) fireOnce({ root, el: firstSlot.el, action: firstSlot.action });
  idx = (sporeIndex % Math.max(1, slots.length)) + 1;
  const firstDelay = 120 + (sporeIndex % 7) * 35 + Math.random() * 100;
  const first = setTimeout(scheduleNext, firstDelay);
  timers.add(first);

  return {
    stop() {
      stopped = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    }
  };
}

/**
 * Spawn a muzzle flash / puff along the action direction from the muzzle point.
 */
export function fireOnce({ root, el, action }) {
  const img = root.querySelector(`[data-element-id="${el.id}"]`);
  if (!img || !root.isConnected) return;

  const point = action.point || { x: 0.5, y: 0.5 };
  const localDeg = Number.isFinite(+action.direction) ? +action.direction : 0;
  const st = el.placement || {};
  const rot = +(st.rotation || 0);
  const flip = !!st.flipX;
  // Local direction → after flipX and placement rotation
  let deg = localDeg;
  if (flip) deg = 180 - deg;
  deg = deg + rot;

  const w = img.offsetWidth || parseFloat(img.style.width) || 20;
  const h = img.offsetHeight || w * 0.6;
  const ox = point.x * w;
  const oy = point.y * h;

  // Position relative to element: element's left/top already set; flash as child of root
  const elLeft = parseFloat(img.style.left) || 0;
  const elTop = parseFloat(img.style.top) || 0;
  // Account for transform-origin translate of objectAnchor
  const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
  const originX = elLeft; // left is already at character anchor
  const originY = elTop;
  // img is translated by -oa; muzzle in element bitmap space maps to:
  const mx = originX + (point.x - oa.x) * w;
  const my = originY + (point.y - oa.y) * h;

  const rad = (deg * Math.PI) / 180;
  const dist = Math.max(10, w * 0.35);
  const puff = document.createElement('div');
  puff.className = 'activation-muzzle-flash';
  puff.setAttribute('data-fire-for', el.id);
  puff.style.cssText = [
    'position:absolute',
    `left:${mx}px`,
    `top:${my}px`,
    `width:${Math.max(8, w * 0.22)}px`,
    `height:${Math.max(6, w * 0.14)}px`,
    `transform:translate(-20%,-50%) rotate(${deg}deg)`,
    'transform-origin:0% 50%',
    'pointer-events:none',
    'z-index:30'
  ].join(';');
  // Projectile streak
  const streak = document.createElement('div');
  streak.className = 'activation-muzzle-streak';
  streak.style.cssText = [
    'position:absolute',
    `left:${mx}px`,
    `top:${my}px`,
    `width:${dist}px`,
    'height:2px',
    `transform:translate(0,-50%) rotate(${deg}deg)`,
    'transform-origin:0% 50%',
    'pointer-events:none',
    'z-index:29'
  ].join(';');
  root.appendChild(puff);
  root.appendChild(streak);
  requestAnimationFrame(() => {
    puff.classList.add('is-on');
    streak.classList.add('is-on');
  });
  setTimeout(() => {
    puff.remove();
    streak.remove();
  }, 140);
}

/**
 * Resolve a DOM node for an element id inside an action root.
 * Falls back to the root itself (image-only spores with data-element-id on root/img).
 */
function resolveActionNode(root, el) {
  if (!root) return null;
  if (el?.id) {
    const found = root.querySelector(`[data-element-id="${el.id}"]`);
    if (found) return found;
  }
  if (root.matches?.('[data-element-id]')) return root;
  const img = root.querySelector('img[data-element-id], img');
  return img || root;
}

/**
 * Generic short-lived text projectile from an anchor point (mouth, muzzle, etc.).
 * Config (reusable): text, color, fontWeight, fontFamily, fontSizeRatio | fontSizePx,
 * durationMs, holdRatio, distance | distanceRatio, point (anchor), direction (local deg),
 * scaleFrom, scaleTo, pattern ('once' | 'repeat'), rate, jitter, appliesTo.
 */
export function textProjectileOnce({ root, el, action }) {
  if (!root?.isConnected) return;
  const node = resolveActionNode(root, el);
  if (!node) return;

  const point = action.point || { x: 0.5, y: 0.5 };
  const localDeg = Number.isFinite(+action.direction) ? +action.direction : -90;
  const st = el?.placement || {};
  const rot = +(st.rotation || 0);
  const flip = !!st.flipX;
  let deg = localDeg;
  if (flip) deg = 180 - deg;
  deg = deg + rot;

  const w = node.offsetWidth || parseFloat(node.style.width) || root.offsetWidth || 40;
  const h = node.offsetHeight || parseFloat(node.style.height) || root.offsetHeight || w * 0.7;
  const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
  const elLeft = parseFloat(node.style.left) || 0;
  const elTop = parseFloat(node.style.top) || 0;
  // When the img fills the root (ghost wrap), left/top are 0 and oa is unused — point is fraction of node box.
  const fillsRoot = !node.style.left && node.parentElement === root;
  const mx = fillsRoot ? point.x * w : elLeft + (point.x - oa.x) * w;
  const my = fillsRoot ? point.y * h : elTop + (point.y - oa.y) * h;

  const distRatio = Number.isFinite(+action.distanceRatio) ? +action.distanceRatio : 0.55;
  let dist = Number.isFinite(+action.distance)
    ? +action.distance
    : Math.max(14, w * distRatio);
  // Mobile: shorten travel via the same viewport spread scale as spore bursts
  dist *= getViewportSpreadScale();

  const rad = (deg * Math.PI) / 180;
  let endX = Math.cos(rad) * dist;
  let endY = Math.sin(rad) * dist;

  // Clamp travel so the word stays on screen (host = spore container)
  try {
    const host = root.parentElement;
    const br = root.getBoundingClientRect();
    const hr = host?.getBoundingClientRect?.();
    if (hr && br.width > 0) {
      const mouthX = (br.left + br.right) / 2 - hr.left;
      const mouthY = (br.top + br.bottom) / 2 - hr.top;
      const rotMatch = /rotate\((-?[\d.]+)(rad|deg)\)/.exec(root.style.transform || '');
      let rootRot = 0;
      if (rotMatch) {
        rootRot = rotMatch[2] === 'rad'
          ? parseFloat(rotMatch[1])
          : (parseFloat(rotMatch[1]) * Math.PI) / 180;
      }
      const worldAng = rootRot + rad;
      const wtx = Math.cos(worldAng) * dist;
      const wty = Math.sin(worldAng) * dist;
      const fontSizeApprox = Number.isFinite(+action.fontSizePx) && +action.fontSizePx > 0
        ? Math.max(8, +action.fontSizePx)
        : Math.max(10, w * (Number(action.fontSizeRatio) || 0.4));
      const clamped = clampBurstDelta(mouthX, mouthY, wtx, wty, {
        width: fontSizeApprox * 2.4,
        height: fontSizeApprox * 1.2,
        margin: 4,
        host
      });
      const cLen = Math.hypot(clamped.tx, clamped.ty);
      if (Number.isFinite(cLen) && cLen < dist) {
        const scale = dist > 0 ? cLen / dist : 1;
        endX *= scale;
        endY *= scale;
      }
    }
  } catch (_) { /* clamp is best-effort */ }

  const durationMs = Math.max(
    200,
    Math.min(4000, Number(action.durationMs) || 1200)
  );
  // holdRatio: fraction of duration spent fully opaque (gentle hold then fade)
  let holdRatio = Number.isFinite(+action.holdRatio) ? +action.holdRatio : 0.4;
  holdRatio = Math.min(0.85, Math.max(0, holdRatio));
  const scaleFrom = Number.isFinite(+action.scaleFrom) ? +action.scaleFrom : 0.65;
  const scaleTo = Number.isFinite(+action.scaleTo) ? +action.scaleTo : 1.12;
  const fontSizeRatio = Number.isFinite(+action.fontSizeRatio) ? +action.fontSizeRatio : 0.4;
  // fontSizePx (absolute) wins when set; else ratio of element width (current default look)
  const fontSize = Number.isFinite(+action.fontSizePx) && +action.fontSizePx > 0
    ? Math.max(8, +action.fontSizePx)
    : Math.max(10, w * fontSizeRatio);
  const rawText = (action.text != null ? String(action.text) : 'BOO');
  const color = action.color || '#000';
  const fontWeight = action.fontWeight != null ? String(action.fontWeight) : '700';
  const fontFamily = (action.fontFamily != null ? String(action.fontFamily).trim() : '');

  const tip = document.createElement('div');
  tip.className = 'activation-text-projectile';
  tip.setAttribute('data-text-projectile-for', el?.id || 'spore');
  tip.textContent = rawText;
  const cssParts = [
    'position:absolute',
    `left:${mx}px`,
    `top:${my}px`,
    `font-size:${fontSize}px`,
    `color:${color}`,
    `font-weight:${fontWeight}`,
    'line-height:1',
    'white-space:nowrap',
    'text-transform:uppercase',
    'letter-spacing:0.04em',
    'pointer-events:none',
    'z-index:36',
    'user-select:none',
    `transform:translate(-50%,-50%) translate(0px,0px) scale(${scaleFrom})`,
    'opacity:1'
  ];
  if (fontFamily) cssParts.splice(5, 0, `font-family:${fontFamily}`);
  tip.style.cssText = cssParts.join(';');
  root.appendChild(tip);

  const midX = endX * holdRatio;
  const midY = endY * holdRatio;
  const midScale = scaleFrom + (scaleTo - scaleFrom) * holdRatio;
  const anim = tip.animate(
    [
      {
        offset: 0,
        transform: `translate(-50%, -50%) translate(0px, 0px) scale(${scaleFrom})`,
        opacity: 1
      },
      {
        offset: holdRatio,
        transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px) scale(${midScale})`,
        opacity: 1
      },
      {
        offset: 1,
        transform: `translate(-50%, -50%) translate(${endX}px, ${endY}px) scale(${scaleTo})`,
        opacity: 0
      }
    ],
    { duration: durationMs, easing: 'linear', fill: 'forwards' }
  );
  const done = () => {
    try { tip.remove(); } catch (_) {}
  };
  if (anim && typeof anim.finished?.then === 'function') {
    anim.finished.then(done).catch(done);
  } else {
    setTimeout(done, durationMs + 30);
  }
}

/**
 * Register textProjectile — once (default) or repeat with rate/jitter.
 */
registerAction('textProjectile', ({ root, el, action, sporeIndex = 0 }) => {
  const timers = new Set();
  let stopped = false;
  const pattern = action.pattern || 'once';

  const shoot = () => {
    if (stopped || !root?.isConnected) return;
    textProjectileOnce({ root, el, action });
  };

  // Stagger first shot slightly so a burst of ghosts doesn't sync
  const firstDelay = 40 + (Number(sporeIndex) % 5) * 25 + Math.random() * 60;
  const first = setTimeout(() => {
    shoot();
    if (stopped || pattern === 'once') return;
    const tick = () => {
      if (stopped) return;
      shoot();
      const rate = Math.max(0.4, +action.rate || 1.2);
      const jitter = Math.max(0, +action.jitter || 0.35);
      const delay = (1000 / rate) * (1 + (Math.random() * 2 - 1) * jitter);
      const id = setTimeout(tick, Math.max(120, delay));
      timers.add(id);
    };
    const id = setTimeout(tick, Math.max(200, 1000 / Math.max(0.4, +action.rate || 1.2)));
    timers.add(id);
  }, firstDelay);
  timers.add(first);

  return {
    stop() {
      stopped = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      try {
        root?.querySelectorAll?.('.activation-text-projectile').forEach((n) => n.remove());
      } catch (_) {}
    }
  };
});

// Register built-in fire (also used via alternating coordinator)
registerAction('fire', ({ root, el, action }) => {
  // Single-slot fallback when not batched by runAlternatingFire
  const timers = new Set();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    fireOnce({ root, el, action });
    const rate = Math.max(0.5, +action.rate || 3);
    const jitter = Math.max(0, +action.jitter || 0.4);
    const delay = (1000 / rate) * (1 + (Math.random() * 2 - 1) * jitter);
    const id = setTimeout(tick, Math.max(80, delay));
    timers.add(id);
  };
  const first = setTimeout(tick, 60 + Math.random() * 100);
  timers.add(first);
  return {
    stop() {
      stopped = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    }
  };
});

export default {
  registerAction,
  getAction,
  listActionTypes,
  actionsForElement,
  runObjectActions,
  fireOnce,
  textProjectileOnce
};
