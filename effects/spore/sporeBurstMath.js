/**
 * Shared spore burst geometry: viewport-scaled spread + clamp so most spores
 * stay on screen (especially mobile). Used by default, ghost, and cowboy bursts.
 */

/**
 * Scale factor for burst radius/velocity from viewport size.
 * Desktop (~720+ min edge) ≈ 1; phone (390) ≈ 0.54.
 * @param {number} [refMinEdge=720]
 */
export function getViewportSpreadScale(refMinEdge = 720) {
  const vw = typeof window !== 'undefined' ? window.innerWidth || refMinEdge : refMinEdge;
  const vh = typeof window !== 'undefined' ? window.innerHeight || refMinEdge : refMinEdge;
  const minDim = Math.min(vw, vh);
  const ref = Math.max(1, Number(refMinEdge) || 720);
  return Math.min(1, Math.max(0.45, minDim / ref));
}

/**
 * Host size for clamping (container is typically full viewport).
 * @param {HTMLElement | null | undefined} host
 */
export function getHostSize(host) {
  if (host?.clientWidth && host?.clientHeight) {
    return { width: host.clientWidth, height: host.clientHeight };
  }
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth || 390, height: window.innerHeight || 844 };
  }
  return { width: 390, height: 844 };
}

/**
 * Clamp translate deltas so the spore's final center stays inside the host
 * (with a small margin). Majority of spores remain visible on mobile.
 *
 * @param {number} x - spawn center x (container coords)
 * @param {number} y - spawn center y
 * @param {number} tx - intended translate x
 * @param {number} ty - intended translate y
 * @param {{ width?: number, height?: number, margin?: number, host?: HTMLElement }} [opts]
 * @returns {{ tx: number, ty: number }}
 */
export function clampBurstDelta(x, y, tx, ty, opts = {}) {
  const halfW = Math.max(1, (Number(opts.width) || 40) / 2);
  const halfH = Math.max(1, (Number(opts.height) || 40) / 2);
  const margin = Number.isFinite(Number(opts.margin)) ? Number(opts.margin) : 8;
  const { width: hw, height: hh } = getHostSize(opts.host);

  const minX = margin + halfW;
  const maxX = Math.max(minX, hw - margin - halfW);
  const minY = margin + halfH;
  const maxY = Math.max(minY, hh - margin - halfH);

  const endX = Math.min(maxX, Math.max(minX, x + tx));
  const endY = Math.min(maxY, Math.max(minY, y + ty));
  return { tx: endX - x, ty: endY - y };
}

/**
 * Scale a base radius/velocity by viewport, then clamp the resulting delta.
 * @returns {{ tx: number, ty: number, spreadScale: number }}
 */
export function computeClampedBurstDelta(x, y, angle, velocity, opts = {}) {
  const spreadScale = getViewportSpreadScale(opts.refMinEdge);
  const scaledV = velocity * spreadScale;
  let tx = Math.cos(angle) * scaledV;
  let ty = Math.sin(angle) * scaledV;
  const clamped = clampBurstDelta(x, y, tx, ty, opts);
  return { ...clamped, spreadScale };
}

export default {
  getViewportSpreadScale,
  getHostSize,
  clampBurstDelta,
  computeClampedBurstDelta
};
