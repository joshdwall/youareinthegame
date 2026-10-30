/**
 * Mount character-overlay accessories onto a flash host (public apex or Cambio).
 * Placement math matches Cambio edit-mode (objectAnchor / characterAnchor / rotation / scale).
 */

export function migrateElement(st) {
  if (!st || typeof st !== 'object') return defaultElementState(null, {});
  if (st.characterAnchor && st.objectAnchor) return { ...st };
  // v1 x/y → v2
  return {
    objectAnchor: { x: 0.5, y: 0.5 },
    characterAnchor: { x: st.x ?? 0.5, y: st.y ?? 0.5 },
    rotation: st.rotation ?? 0,
    scale: st.scale ?? 1,
    flipX: !!st.flipX
  };
}

export function defaultElementState(_anim, el) {
  return {
    objectAnchor: { x: 0.5, y: 0.5 },
    characterAnchor: { x: 0.5, y: 0.35 },
    rotation: 0,
    scale: 1,
    flipX: !!el?.flipX
  };
}

/**
 * @param {HTMLElement} overlayHost
 * @param {object} opts
 * @param {HTMLElement} opts.creature
 * @param {HTMLElement} [opts.creatureRig]
 * @param {Array} opts.elements - [{ id, src, placement?, defaultWidthFrac?, flipX? }]
 * @param {object} [opts.placementsById] - map elementId → placement state
 */
export function mountOverlayProps(overlayHost, opts) {
  const {
    creature,
    creatureRig = creature?.parentElement,
    elements = [],
    placementsById = {}
  } = opts;
  if (!overlayHost || !creature) return [];

  overlayHost.innerHTML = '';
  overlayHost.style.pointerEvents = 'none';

  const rig = creatureRig || creature.parentElement;
  const rigBox = rig.getBoundingClientRect();
  const cBox = creature.getBoundingClientRect();
  const box = {
    left: cBox.left - rigBox.left,
    top: cBox.top - rigBox.top,
    width: cBox.width,
    height: cBox.height
  };

  const mounted = [];
  for (const el of elements) {
    let st = placementsById[el.id] || el.placement;
    st = migrateElement(st || defaultElementState(null, el));
    if (Object.prototype.hasOwnProperty.call(el, 'flipX')) st.flipX = !!el.flipX;

    const img = document.createElement('img');
    const src = el.src.startsWith('/') || el.src.startsWith('http')
      ? el.src
      : '/' + el.src.replace(/^\//, '');
    img.src = src;
    img.alt = el.id;
    img.className = 'activation-prop';
    img.dataset.elementId = el.id;
    img.draggable = false;
    img.style.pointerEvents = 'none';
    img.style.position = 'absolute';
    img.style.zIndex = '5';

    const frac = el.defaultWidthFrac ?? 0.4;
    const w = box.width * frac * (st.scale || 1);
    img.style.width = `${w}px`;
    img.style.height = 'auto';

    const ca = st.characterAnchor || { x: 0.5, y: 0.5 };
    const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
    const attachX = box.left + ca.x * box.width;
    const attachY = box.top + ca.y * box.height;
    const left = attachX - oa.x * w;
    // height unknown until load — approximate with width for transform-origin
    img.style.left = `${left}px`;
    img.style.top = `${attachY}px`;
    img.style.transformOrigin = `${oa.x * 100}% 0%`;
    const flip = st.flipX ? ' scaleX(-1)' : '';
    img.style.transform = `translateY(-${oa.y * 100}%) rotate(${st.rotation || 0}deg)${flip}`;

    // Refine vertical once decoded
    img.onload = () => {
      const h = img.getBoundingClientRect().height || img.naturalHeight * (w / Math.max(1, img.naturalWidth));
      img.style.top = `${attachY - oa.y * h}px`;
      img.style.transformOrigin = `${oa.x * 100}% ${oa.y * 100}%`;
      img.style.transform = `rotate(${st.rotation || 0}deg)${flip}`;
    };

    overlayHost.appendChild(img);
    mounted.push({ el, st, img });
  }
  return mounted;
}

export default { mountOverlayProps, migrateElement, defaultElementState };
