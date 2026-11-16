/**
 * SSOT: place overlay elements on the rendered character box.
 *
 * Coordinate system (both Cambio edit-mode and public apex MUST use this):
 * - box = creature rest box relative to the overlay host (rig); the body's
 *   own transient translate is removed (all motion belongs to the rig)
 * - characterAnchor {x,y} in [0,1+] of character box (attachment point)
 * - objectAnchor {x,y} in [0,1] of the element image (pivot)
 * - scale = element width as a FRACTION OF CHARACTER WIDTH
 *   (NOT multiplied by defaultWidthFrac again — when creating defaults,
 *    set scale = el.defaultWidthFrac; after edit, scale IS the width fraction)
 * - rotation degrees; flipX boolean
 *
 * Size:  w = scale * box.width
 * Pos:   left/top = box origin + characterAnchor * box size
 * Xform: translate(-objectAnchor%) rotate(deg) [scaleX(-1)]
 */

/**
 * Translation the element applies to itself (transform + translate), in px.
 * Costume layers are placed in the rig's local space, so the body's own
 * momentary motion must never be baked into their coordinates.
 */
export function ownTranslatePx(el) {
  let x = 0;
  let y = 0;
  try {
    if (typeof getComputedStyle !== 'function' || !el) return { x, y };
    const cs = getComputedStyle(el);
    if (cs.transform && cs.transform !== 'none' && typeof DOMMatrixReadOnly === 'function') {
      const m = new DOMMatrixReadOnly(cs.transform);
      x += m.m41;
      y += m.m42;
    }
    if (cs.translate && cs.translate !== 'none') {
      const [tx = '0px', ty = '0px'] = cs.translate.split(/\s+/);
      if (tx.endsWith('px')) x += parseFloat(tx) || 0;
      if (ty.endsWith('px')) y += parseFloat(ty) || 0;
    }
  } catch (_) {}
  return { x, y };
}

export function measureCreatureBoxInHost(creatureEl, hostEl) {
  const host = hostEl.getBoundingClientRect();
  const r = creatureEl.getBoundingClientRect();
  const own = ownTranslatePx(creatureEl);
  return {
    left: r.left - host.left - own.x,
    top: r.top - host.top - own.y,
    width: r.width,
    height: r.height
  };
}

export function defaultObjectAnchor() {
  return { x: 0.5, y: 0.5 };
}

/**
 * Resolve width in px from placement scale (width-fraction of character).
 * @param {object} st - placement state
 * @param {number} characterWidthPx
 * @param {number} [fallbackScale=0.3]
 */
export function elementWidthPx(st, characterWidthPx, fallbackScale = 0.3) {
  const scale = Number.isFinite(st?.scale) ? st.scale : fallbackScale;
  return scale * characterWidthPx;
}

/**
 * Apply left/top/width/transform to an absolutely-positioned element image.
 * Matches Cambio edit-mode positionProp + applyPropTransform exactly.
 * @returns {{ width: number, ca: object, oa: object, scale: number }}
 */
export function applyElementPlacement(img, st, box) {
  const ca = st?.characterAnchor || { x: 0.5, y: 0.5 };
  const oa = st?.objectAnchor || defaultObjectAnchor();
  const scale = Number.isFinite(st?.scale) ? st.scale : 0.3;
  const w = scale * box.width;
  const rot = st?.rotation || 0;
  const flips = st?.flipX ? ' scaleX(-1)' : '';

  img.style.position = 'absolute';
  img.style.left = `${box.left + ca.x * box.width}px`;
  img.style.top = `${box.top + ca.y * box.height}px`;
  img.style.width = `${w}px`;
  img.style.height = 'auto';
  img.style.transformOrigin = `${oa.x * 100}% ${oa.y * 100}%`;
  img.style.transform = `translate(${-oa.x * 100}%, ${-oa.y * 100}%) rotate(${rot}deg)${flips}`;

  return { width: w, ca, oa, scale };
}

/**
 * Compute expected element bounding box (approx, height from natural aspect if known).
 * Used by parity tests. If naturalW/H unknown, height ≈ width (conservative).
 */
export function expectedElementRect(st, box, naturalW = 0, naturalH = 0) {
  const scale = Number.isFinite(st?.scale) ? st.scale : 0.3;
  const width = scale * box.width;
  const ca = st?.characterAnchor || { x: 0.5, y: 0.5 };
  const oa = st?.objectAnchor || defaultObjectAnchor();
  const aspect = naturalW > 0 && naturalH > 0 ? naturalH / naturalW : 1;
  const height = width * aspect;
  const attachX = box.left + ca.x * box.width;
  const attachY = box.top + ca.y * box.height;
  return {
    left: attachX - oa.x * width,
    top: attachY - oa.y * height,
    width,
    height,
    attachX,
    attachY
  };
}

export default {
  measureCreatureBoxInHost,
  defaultObjectAnchor,
  elementWidthPx,
  applyElementPlacement,
  expectedElementRect
};

/** Map an artwork point into its host using the same pivot as applyElementPlacement. */
export function elementPointInHost(node, placement, point, width = node.offsetWidth, height = node.offsetHeight) {
  const anchor = placement.objectAnchor || { x: .5, y: .5 };
  const rotation = (+placement.rotation || 0) * Math.PI / 180;
  const dx = (point.x - anchor.x) * width * (placement.flipX ? -1 : 1);
  const dy = (point.y - anchor.y) * height;
  return {
    x: (parseFloat(node.style.left) || 0) + dx * Math.cos(rotation) - dy * Math.sin(rotation),
    y: (parseFloat(node.style.top) || 0) + dx * Math.sin(rotation) + dy * Math.cos(rotation)
  };
}
