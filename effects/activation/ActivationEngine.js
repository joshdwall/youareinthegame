/**
 * Shared character-overlay activation engine.
 * Play / threshold → OverlayPlayer flash + spore replicas + reset.
 * Ghost + cowboy (+ future) share ONE OverlayPlayer lifecycle; profiles are data.
 * Cowboy flashes accessories on the LIVE character via flashHost
 * (same mount/placement path as edit mode) + mini composite-replica spores.
 * Never draws a second full-size base character during the flash.
 * Owned flash layers are always created fresh per run and removed on cleanup.
 */
import {resolvePreset,LIMITS} from '../../runtime/costumes/contracts.js';
import {runBehaviors} from '../../runtime/costumes/behaviors.js';
import { FireworkManager } from '../spore/finale.js';
import { GHOST_CONFIG } from '../spore/ghost/config.js';
import { fadeStormResetToLight } from './fadeStormReset.js';
import { buildCharacterComposite, measureCreatureBox } from './CharacterComposite.js';
import { runObjectActions } from './objectActions.js';
import { resolveClickEffect } from './clickEffect.js';
import { computeClampedBurstDelta } from '../spore/sporeBurstMath.js';
import { OVERLAY_PROFILES } from './overlayProfiles.js';
import {
  preloadAndDecode,
  clearOwnedFlashLayers,
  createImageFlashLayer,
  bindFlashHost,
  createOverlayPlayer
} from './OverlayPlayer.js';

const loadedSheets = new Set();

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureStylesheet(href) {
  if (loadedSheets.has(href)) return;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes(href) || l.getAttribute('href') === href)) {
    loadedSheets.add(href);
    return;
  }
  await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.activationStylesheet = '1';
    link.onload = () => { loadedSheets.add(href); resolve(); };
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

/**
 * Preload stylesheets + images used by activation. Call at cycle start so
 * threshold activate() can flash overlay from frame one with no await gap.
 */
export async function preloadActivationAssets(urls = [], profileId = 'ghost') {
  const profile = OVERLAY_PROFILES[profileId] || OVERLAY_PROFILES.ghost;
  await Promise.all((profile.stylesheets || []).map((href) => ensureStylesheet(href)));
  await preloadAndDecode(urls);
}

function bodyFlash(classExtra = '') {

  const el = document.createElement('div');
  el.className = `lightning-flash${classExtra ? ' ' + classExtra : ''}`;
  document.body.appendChild(el);
  return el;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container - .container stage
 * @param {HTMLElement} opts.creature - #mainCreature
 * @param {HTMLElement} [opts.sporeHost] - where spores append (default container)
 * @param {'ghost'|'composite'} opts.profile
 * @param {object} [opts.composite] - { baseSrc, elements } — used for mini spores only when profile=composite
 * @param {HTMLElement} [opts.flashHost] - existing overlay host (e.g. #overlayLayer with accessories
 *   already mounted via edit-mode mountProps). When set, flash flickers THIS host — no duplicate base.
 * @param {object} [opts.spore] - overrides { count, scale, durationMs }
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ok:boolean}>}
 */
export async function runActivation(opts) {
  const {container,creature,creatureRig=null,sporeHost=container,profile='ghost',composite=null,flashHost=null,signal=null,assetsPreloaded=false,animation={}}=opts;
  if(!container||!creature)throw new Error('activation: container and creature required');
  const preset=resolvePreset(opts.preset||animation.animationPreset);
  const transition=opts.transitionId||preset.transition;
  if(!['lightning','none'].includes(transition))throw new Error('Unsupported transition');
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flashParent=creatureRig||container;
  const elements=(composite?.elements||[]).slice(0,LIMITS.elements);
  const timers=new Set(),nodes=new Set(),controls=new Set();
  let player=null,manager=null,abortResolve;
  const abortPromise=new Promise(resolve=>{abortResolve=resolve;});
  const onAbort=()=>abortResolve();signal?.addEventListener('abort',onAbort,{once:true});
  const aborted=()=>signal?.aborted;
  const track=fn=>{controls.add(fn);return fn;};
  const delay=ms=>Promise.race([new Promise(resolve=>{const id=setTimeout(()=>{timers.delete(id);resolve();},ms);timers.add(id);}),abortPromise]);
  const stopControl=control=>{try{control.stop();}catch{}controls.delete(control);};
  const actionsForPhase=phase=>elements.map(e=>({...e,placement:{...e.placement,objectActions:(e.placement?.objectActions||e.objectActions||[]).filter(a=>(a.phase||'activation')===phase)}}));
  const actions=(root,target,phase)=>{
    const selected=actionsForPhase(phase);const legacy=track(runObjectActions({root,elements:selected,target,sporeIndex:0}));
    const motion=track(runBehaviors({root,elements:selected,target,phase,signal}));
    return {stop(){stopControl(motion);stopControl(legacy);}};
  };
  try {
    if(aborted())return {ok:false,aborted:true};
    if(!assetsPreloaded)await preloadActivationAssets(profile==='composite'?[composite?.baseSrc,...elements.map(e=>e.src)].filter(Boolean):[GHOST_CONFIG.ASSETS.OVERLAY_IMAGE],profile);
    if(aborted())return {ok:false,aborted:true};
    clearOwnedFlashLayers(flashParent,container);
    sporeHost.querySelectorAll('.firework-spore,.activation-spore').forEach(n=>{n.__actionStop?.();n.remove();});
    const box=measureCreatureBox(creature,flashParent);
    const overlayProfile=OVERLAY_PROFILES[profile]||OVERLAY_PROFILES.ghost;
    const flash=transition==='none'||reduced?{...overlayProfile.flash,SHOW_PROBABILITY:1,MIN_OPACITY:1,MAX_OPACITY:1,FLICKER_ENABLED:false,FADE_IN_MS:preset.phases.equipMs,FADE_OUT_MS:preset.phases.exitMs}:overlayProfile.flash;
    if(profile==='ghost'){
      const layer=createImageFlashLayer({parent:flashParent,src:overlayProfile.imageSrc,box,alt:'Ghost Overlay',matchCreatureFloat:true});
      player=createOverlayPlayer({layer,owned:true,flash});
    }else if(profile==='composite'){
      if(!flashHost||!composite)throw new Error('Composite activation requires mounted accessories');
      player=createOverlayPlayer({layer:bindFlashHost(flashHost),owned:false,flash,secondaryLayers:flashHost.__costumeBackLayer?[flashHost.__costumeBackLayer]:[]});
    }else throw new Error('Unknown overlay profile');
    const roots=profile==='composite'?[flashHost,flashHost.__costumeBackLayer].filter(Boolean):[];
    player.show();
    const equip=roots.map(root=>actions(root,'activation','equip'));
    if(preset.phases.equipMs)await delay(reduced?100:preset.phases.equipMs);
    equip.forEach(c=>c.stop());
    if(aborted())return {ok:false,aborted:true};
    const active=roots.flatMap(root=>[actions(root,'activation','idle'),actions(root,'activation','activation')]);
    const duration=reduced?150:preset.phases.activationMinMs+Math.random()*(preset.phases.activationMaxMs-preset.phases.activationMinMs);
    if(transition==='lightning'&&!reduced){
      const L=overlayProfile.lightning;const end=Date.now()+duration;
      while(Date.now()<end&&!aborted()){
        const n=bodyFlash();nodes.add(n);player.show();
        await delay(L.FLASH_MIN_MS+Math.random()*(L.FLASH_MAX_MS-L.FLASH_MIN_MS));n.remove();nodes.delete(n);player.hide();
        if(!aborted())await delay(L.FLASH_GAP_MIN_MS+Math.random()*(L.FLASH_GAP_MAX_MS-L.FLASH_GAP_MIN_MS));
      }
    }else await delay(duration);
    active.forEach(c=>c.stop());
    if(aborted())return {ok:false,aborted:true};
    const hasExit=elements.some(e=>(e.placement?.objectActions||[]).some(a=>a.phase==='exit'));
    if(hasExit){player.show();const exits=roots.map(root=>actions(root,'activation','exit'));await delay(reduced?100:preset.phases.exitMs);exits.forEach(c=>c.stop());}
    player.hide();
    const charBox={width:box.width,height:box.height};
    const spec=preset.spores;
    const count=reduced?Math.min(spec.count,4):Math.min(spec.count,LIMITS.clones);
    const makeSpore=(dims,index)=>{
      let node;
      if(profile==='composite'){
        const scale=dims.width/Math.max(1,charBox.width);node=buildCharacterComposite({baseSrc:composite.baseSrc,elements,box:charBox,scale});
      }else{
        node=document.createElement('div');const image=document.createElement('img');image.src=elements.find(e=>e.role==='sporeBody')?.src||GHOST_CONFIG.ASSETS.SPORE_IMAGE;image.dataset.elementId=elements.find(e=>e.role==='sporeBody')?.id||'ghostBody';image.alt='';image.draggable=false;image.style.cssText='width:100%;height:100%;display:block;pointer-events:none';node.appendChild(image);
      }
      node.classList.add('activation-spore');node.style.position='absolute';node.style.width=dims.width+'px';node.style.height=dims.height+'px';node.style.zIndex='25';node.style.overflow='visible';
      const selected=actionsForPhase('activation');const action=track(runObjectActions({root:node,elements:selected,target:'spore',sporeIndex:index}));const motion=track(runBehaviors({root:node,elements:selected,target:'spore',phase:'activation',signal}));
      node.__actionStop=()=>{stopControl(motion);stopControl(action);};return node;
    };
    if(spec.trajectory==='burst'){
      const host=sporeHost.getBoundingClientRect();const x=window.innerWidth/2-host.left,y=window.innerHeight/2-host.top;
      for(let i=0;i<count;i++){
        const scale=spec.scale??.15;const dims={width:charBox.width*scale,height:charBox.height*scale};const node=makeSpore(dims,i);const angle=i/Math.max(1,count)*Math.PI*2;
        const d=computeClampedBurstDelta(x,y,angle,reduced?0:spec.spreadPx??140,{...dims,host:sporeHost});
        node.style.left=x-dims.width/2+'px';node.style.top=y-dims.height/2+'px';node.style.setProperty('--tx',d.tx+'px');node.style.setProperty('--ty',d.ty+'px');node.style.setProperty('--rotation',reduced?'0deg':'360deg');
        node.style.animation=`explode ${reduced?200:spec.durationMs??1600}ms ease-out forwards`;sporeHost.appendChild(node);nodes.add(node);
      }
      await delay(reduced?200:spec.durationMs??1600);
    }else{
      const fw={...overlayProfile.fireworks,SPORE_COUNT:count};
      if(spec.scale!==null){fw.BASE_WIDTH=charBox.width*spec.scale;fw.BASE_HEIGHT=charBox.height*spec.scale;}
      if(spec.durationMs!==null){fw.MIN_LIFESPAN=spec.durationMs/1000;fw.MAX_LIFESPAN=spec.durationMs/1000;}
      if(spec.spreadPx!==null){const seconds=(spec.durationMs||4000)/1000;fw.MIN_INITIAL_SPEED=spec.spreadPx*.7/seconds;fw.MAX_INITIAL_SPEED=spec.spreadPx/seconds;}
      if(reduced){fw.MIN_INITIAL_SPEED=0;fw.MAX_INITIAL_SPEED=0;fw.MIN_LIFESPAN=.2;fw.MAX_LIFESPAN=.2;fw.GRAVITY=0;fw.MIN_SWIRL_AMPLITUDE=0;fw.MAX_SWIRL_AMPLITUDE=0;}
      fw.createSporeElement=(spore,dims)=>makeSpore(dims||{width:fw.BASE_WIDTH,height:fw.BASE_HEIGHT},spore?.id||0);
      const finished=new Promise(resolve=>{manager=new FireworkManager(fw);manager.launch(window.innerWidth/2+fw.LAUNCH_OFFSET_X,window.innerHeight/2+fw.LAUNCH_OFFSET_Y,sporeHost,resolve);});
      if(transition==='lightning'&&!reduced){const id=setTimeout(()=>{timers.delete(id);const n=bodyFlash('final-reset');nodes.add(n);n.style.transition=`opacity ${overlayProfile.animations.FINAL_FLASH_FADE_DURATION}ms ease-out`;n.style.opacity='1';requestAnimationFrame(()=>{n.style.opacity='0';});const end=setTimeout(()=>{nodes.delete(n);n.remove();timers.delete(end);},overlayProfile.animations.FINAL_FLASH_FADE_DURATION+500);timers.add(end);},overlayProfile.animations.FIREWORKS_DELAY_BEFORE_FINAL);timers.add(id);}
      await Promise.race([finished,delay((spec.durationMs||5000)+1000)]);
    }
    if(aborted())return {ok:false,aborted:true};
    fadeStormResetToLight(container,{durationMs:window.__yaitgEffect?.__liveStormResetMs||overlayProfile.animations.STORM_RESET_DURATION,backgroundColor:overlayProfile.visuals.BACKGROUND_COLOR});
    return {ok:true};
  }finally{
    signal?.removeEventListener('abort',onAbort);timers.forEach(id=>{clearTimeout(id);clearInterval(id);});timers.clear();
    [...controls].reverse().forEach(stopControl);manager?.cleanup?.();manager?.destroy?.();player?.cleanup();
    nodes.forEach(n=>{n.__actionStop?.();n.remove();});
    sporeHost?.querySelectorAll('.activation-spore,.firework-spore,.activation-click-spore').forEach(n=>{n.__actionStop?.();n.remove();});
    clearOwnedFlashLayers(flashParent,container);
  }
}


/**
 * Alias: full threshold activation for an animation.
 * Same as runActivation — prefer this name at call sites that pair with previewClick.
 */
export async function activate(opts) {
  return runActivation(opts);
}

/**
 * Per-click preview burst for the upcoming animation (character clicks only).
 * Background clicks should keep using plain/default spores.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.creature
 * @param {object} opts.animation - animation def (with optional clickEffect)
 * @param {Array} [opts.compositeElements] - [{id,src,placement}] for composite-spores
 * @param {number} opts.x - click x relative to container
 * @param {number} opts.y - click y relative to container
 * @param {HTMLElement} [opts.sporeHost]
 * @param {function} [opts.fallback] - called for ghost-spores (e.g. effect.createSporeExplosion)
 */
export function previewClick(opts) {
  const {
    container,
    creature,
    animation,
    compositeElements = [],
    x,
    y,
    sporeHost = container,
    fallback = null
  } = opts;

  const fx = resolveClickEffect(animation);

  if (fx.type === 'ghost-spores' || fx.type === 'image-spores') {
    // When previewObjectActions is on, prefer our image burst so textProjectile can run.
    // Otherwise keep legacy fallback (SporeBaseEffect.createSporeExplosion) unchanged.
    if (animation?.previewObjectActions === true) {
      const img = fx.sporeImage || '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png';
      spawnImageBurst(sporeHost, x, y, img, fx.count || 16, {
        runObjectActions: true,
        elements: compositeElements
      });
      return { ok: true, type: fx.type, via: 'image-actions' };
    }
    if (typeof fallback === 'function') {
      fallback(x, y);
      return { ok: true, type: fx.type, via: 'fallback' };
    }
    // Minimal image burst if no fallback provided
    const img = fx.sporeImage || '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png';
    spawnImageBurst(sporeHost, x, y, img, fx.count || 16);
    return { ok: true, type: fx.type, via: 'image' };
  }

  // composite-spores: mini replicas of base + accessories
  const box = measureCreatureBox(creature, container);
  const charBox = { width: box.width, height: box.height };
  const count = fx.count || 16;
  const baseScale = fx.scale || 0.15;
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));

  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const scale = baseScale * (0.75 + Math.random() * 0.5);
      const node = buildCharacterComposite({
        baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
        elements: compositeElements,
        box: charBox,
        scale
      });
      node.classList.add('spore', 'activation-click-spore');
      node.style.position = 'absolute';
      node.style.pointerEvents = 'none';
      node.style.zIndex = '20';
      node.style.overflow = 'visible';

      const baseAngle = (Math.PI * 2 * i) / perLayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      const w = charBox.width * scale;
      const h = charBox.height * scale;
      const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
        width: w,
        height: h,
        host: sporeHost
      });
      const rotation = 360 + Math.random() * 720;
      node.style.setProperty('--tx', tx + 'px');
      node.style.setProperty('--ty', ty + 'px');
      node.style.setProperty('--rotation', rotation + 'deg');

      node.style.left = (x - w / 2) + 'px';
      node.style.top = (y - h / 2) + 'px';

      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      node.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

      // Object actions (guns etc.) only on preview when animation.previewObjectActions === true (default false).
      // Real activate()/runActivation always runs object actions.
      if (animation?.previewObjectActions === true) {
        const ctrl = runObjectActions({
          root: node,
          elements: compositeElements,
          target: 'spore',
          sporeIndex: layer * perLayer + i
        });
        const motion=runBehaviors({root:node,elements:compositeElements,target:'spore',phase:'interact'});
        node.__actionStop = ()=>{motion.stop();ctrl.stop();};
      }
      sporeHost.appendChild(node);
      setTimeout(() => {
        try { node.__actionStop?.(); } catch (_) {}
        node.remove();
      }, (duration + delay) * 1000 + 50);
    }
  }
  return { ok: true, type: 'composite-spores' };
}

function spawnImageBurst(host, x, y, src, count, opts = {}) {
  const layers = 2;
  const perLayer = Math.max(1, Math.floor(count / layers));
  const sw = 76, sh = 50;
  const runActions = opts.runObjectActions === true;
  const actionElements = runActions && Array.isArray(opts.elements) ? opts.elements : [];
  for (let layer = 0; layer < layers; layer++) {
    const layerRadius = (layer + 1) * 60;
    for (let i = 0; i < perLayer; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'spore activation-spore';
      wrap.style.position = 'absolute';
      wrap.style.width = `${sw}px`;
      wrap.style.height = `${sh}px`;
      wrap.style.overflow = 'visible';
      wrap.style.pointerEvents = 'none';
      wrap.style.zIndex = '20';
      const spore = document.createElement('img');
      spore.src = src;
      spore.draggable = false;
      spore.dataset.elementId = 'ghostBody';
      spore.alt = '';
      spore.style.width = '100%';
      spore.style.height = '100%';
      spore.style.display = 'block';
      wrap.appendChild(spore);
      const baseAngle = (Math.PI * 2 * i) / perLayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.3;
      const velocity = layerRadius + Math.random() * 50;
      const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
        width: sw,
        height: sh,
        host
      });
      wrap.style.setProperty('--tx', tx + 'px');
      wrap.style.setProperty('--ty', ty + 'px');
      wrap.style.setProperty('--rotation', (360 + Math.random() * 720) + 'deg');
      wrap.style.left = (x - sw / 2) + 'px';
      wrap.style.top = (y - sh / 2) + 'px';
      const delay = layer * 0.08 + i * 0.02;
      const duration = 0.6 + Math.random() * 0.4;
      wrap.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;
      if (runActions && actionElements.length) {
        const ctrl = runObjectActions({
          root: wrap,
          elements: actionElements,
          target: 'spore',
          sporeIndex: layer * perLayer + i
        });
        wrap.__actionStop = ctrl.stop;
      }
      host.appendChild(wrap);
      setTimeout(() => {
        try { wrap.__actionStop?.(); } catch (_) {}
        wrap.remove();
      }, (duration + delay) * 1000 + 50);
    }
  }
}

export { resolveClickEffect };
export default { runActivation, activate, previewClick, resolveClickEffect, preloadActivationAssets };
