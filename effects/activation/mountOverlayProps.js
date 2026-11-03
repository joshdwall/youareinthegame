/**
 * Mount character-overlay accessories onto a flash host (public apex or Cambio).
 * Placement math is SSOT in placementMath.js — scale = fraction of character width.
 */

import {
  measureCreatureBoxInHost,
  applyElementPlacement,
  defaultObjectAnchor
} from './placementMath.js';
import {resolvePlacement} from '../../runtime/costumes/contracts.js';

export function migrateElement(st) {
  if (!st || typeof st !== 'object') return defaultElementState(null, {});
  if (st.attachment || (st.characterAnchor && st.objectAnchor)) return resolvePlacement(st);
  // v1 x/y → v2; scale already means width-fraction when present
  const out = {
    objectAnchor: defaultObjectAnchor(),
    characterAnchor: { x: st.x ?? 0.5, y: st.y ?? 0.5 },
    rotation: st.rotation ?? 0,
    scale: Number.isFinite(st.scale) ? st.scale : 0.3,
    flipX: !!st.flipX
  };
  if (Array.isArray(st.objectActions)) out.objectActions = st.objectActions;
  return out;
}

export function defaultElementState(_anim, el) {
  return {
    objectAnchor: defaultObjectAnchor(),
    characterAnchor: { x: 0.5, y: 0.35 },
    rotation: 0,
    // scale IS the width fraction (same as Cambio defaultElementState)
    scale: el?.defaultWidthFrac || 0.3,
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
  overlayHost.__costumeBackLayer?.remove();
  overlayHost.__costumeBackLayer=null;
  overlayHost.style.pointerEvents = 'none';

  const rig = creatureRig || creature.parentElement;
  const box = measureCreatureBoxInHost(creature, rig);

  const mounted = [];
  for (const el of [...elements].sort((a,b)=>(resolvePlacement(placementsById[a.id]||a.placement).order-resolvePlacement(placementsById[b.id]||b.placement).order))) {
    let st = placementsById[el.id] || el.placement;
    st = migrateElement(st || defaultElementState(null, el));
    if (Object.prototype.hasOwnProperty.call(el, 'flipX')) st.flipX = !!el.flipX;

    st=resolvePlacement(st);
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
    img.style.zIndex = String(st.layer==='behind-character'?1:5);

    applyElementPlacement(img, st, box);

    if(st.layer==='behind-character'){
      if(!overlayHost.__costumeBackLayer){const back=document.createElement('div');back.className='costume-back-layer';back.style.cssText='position:absolute;inset:0;z-index:1;pointer-events:none;overflow:visible;opacity:0';rig.insertBefore(back,creature);overlayHost.__costumeBackLayer=back;}
      overlayHost.__costumeBackLayer.appendChild(img);
    }else overlayHost.appendChild(img);
    mounted.push({ el, st, img, box });
  }
  return mounted;
}

export { measureCreatureBoxInHost, applyElementPlacement, elementWidthPx } from './placementMath.js';
export default { mountOverlayProps, migrateElement, defaultElementState };
