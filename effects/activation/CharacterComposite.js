import { elementWidthPx, measureCreatureBoxInHost } from './placementMath.js';
import {applyElementPlacement} from './placementMath.js';
import {resolvePlacement} from '../../runtime/costumes/contracts.js';

/**
 * Build a composited character (base + overlay elements at placements).
 * Used for mini spore replicas (base + overlays, scaled down).
 * Full-size flash must NOT use this — accessories mount on the live character via mountProps.
 */

/**
 * @param {object} opts
 * @param {string|null} opts.baseSrc
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

  if (baseSrc) {
    const base = document.createElement('img');
    base.className = 'activation-composite-base';
    base.src = baseSrc;
    base.alt = '';
    base.draggable = false;
    base.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;';
    root.appendChild(base);
  }

  for (const el of [...elements].sort((a,b)=>resolvePlacement(a.placement).order-resolvePlacement(b.placement).order)) {
    const st = resolvePlacement({...el.placement,...(Object.prototype.hasOwnProperty.call(el,'flipX')?{flipX:el.flipX}:{})});
    const ca = st.characterAnchor || { x: 0.5, y: 0.5 };
    const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
    const rot = st.rotation || 0;
    const w = elementWidthPx(st, box.width) * scale;
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
    applyElementPlacement(img,st,{left:0,top:0,width:box.width*scale,height:box.height*scale});
    img.style.zIndex=String(st.layer==='behind-character'?1:5);
    // Keep the accessory's anchor available to spore object actions.
    if ((st.shownOnSpore ?? st.shown) === false) {
      img.style.visibility = 'hidden';
      img.setAttribute('aria-hidden', 'true');
    }
  }

  return root;
}

/**
 * Measure creature box relative to a host element.
 */
export function measureCreatureBox(creatureEl, hostEl) {
  return measureCreatureBoxInHost(creatureEl, hostEl);
}
