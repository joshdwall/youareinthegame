/**
 * Pluggable objectActions registry.
 * Element schema: objectActions: [{ type, point:{x,y}, direction, pattern, rate, jitter, appliesTo }]
 * Handlers receive a runtime context and schedule visuals on a host node.
 */

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
  fireOnce
};
