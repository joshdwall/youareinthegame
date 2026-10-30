/**
 * Build a composited character (base + overlay elements at placements).
 * Used for mini spore replicas (base + overlays, scaled down).
 * Full-size flash must NOT use this — accessories mount on the live character via mountProps.
 */

/**
 * @param {object} opts
 * @param {string} opts.baseSrc
 * @param {Array<{id:string,src:string,placement:object}>} opts.elements
 * @param {{width:number,height:number}} opts.box - character box size in px (composite local)
 * @param {number} [opts.scale=1] - overall scale of the composite
 * @returns {HTMLElement} .activation-composite
 */
export function buildCharacterComposite({ baseSrc, elements = [], box, scale = 1 }) {
  const root = document.createElement('div');
  root.className = 'activation-composite';
  root.style.cssText = [
    'position:absolute',
    'pointer-events:none',
    `width:${box.width * scale}px`,
    `height:${box.height * scale}px`,
    'transform-origin:center center'
  ].join(';');

  const base = document.createElement('img');
  base.className = 'activation-composite-base';
  base.src = baseSrc;
  base.alt = '';
  base.draggable = false;
  base.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
  root.appendChild(base);

  for (const el of elements) {
    const st = el.placement || {};
    const ca = st.characterAnchor || { x: 0.5, y: 0.5 };
    const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
    const rot = st.rotation || 0;
    const elScale = st.scale || 0.3;
    const w = elScale * box.width * scale;
    const img = document.createElement('img');
    img.className = 'activation-composite-el';
    img.dataset.elementId = el.id;
    img.src = el.src.startsWith('/') ? el.src : '/' + el.src.replace(/^\//, '');
    img.alt = el.id;
    img.draggable = false;
    const flips = st.flipX ? ' scaleX(-1)' : '';
    img.style.cssText = [
      'position:absolute',
      `left:${ca.x * box.width * scale}px`,
      `top:${ca.y * box.height * scale}px`,
      `width:${w}px`,
      'height:auto',
      `transform-origin:${oa.x * 100}% ${oa.y * 100}%`,
      `transform:translate(${-oa.x * 100}%, ${-oa.y * 100}%) rotate(${rot}deg)${flips}`
    ].join(';');
    root.appendChild(img);
  }

  return root;
}

/**
 * Measure creature box relative to a host element.
 */
export function measureCreatureBox(creatureEl, hostEl) {
  const host = hostEl.getBoundingClientRect();
  const r = creatureEl.getBoundingClientRect();
  return {
    left: r.left - host.left,
    top: r.top - host.top,
    width: r.width,
    height: r.height
  };
}
