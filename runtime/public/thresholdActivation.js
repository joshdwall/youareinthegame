/**
 * Public apex: on ghost climax, pick from loot table and run ActivationEngine.
 */
import { pickAnimation } from '../loot/LootTable.js';
import { runActivation } from '../../effects/activation/ActivationEngine.js';
import { mountOverlayProps } from '../../effects/activation/mountOverlayProps.js';

let cachedConfig = null;
let cacheAt = 0;
let lastPickedId = null;
const CACHE_MS = 15_000;

export async function fetchAnimationConfig(force = false) {
  const now = Date.now();
  if (!force && cachedConfig && now - cacheAt < CACHE_MS) return cachedConfig;
  try {
    const r = await fetch('/api/animations', { credentials: 'same-origin' });
    const data = await r.json();
    if (r.ok && data.ok) {
      cachedConfig = data;
      cacheAt = now;
      return data;
    }
  } catch (e) {
    console.warn('animation config fetch failed', e);
  }
  return cachedConfig;
}

function forceIdFromQuery() {
  try {
    const u = new URL(location.href);
    const id = u.searchParams.get('force');
    if (!id) return null;
    const host = location.hostname;
    if (host === '127.0.0.1' || host === 'localhost' || host.endsWith('.local')) return id;
    if (document.documentElement.dataset.yaitgAllowForce === '1') return id;
    return null;
  } catch {
    return null;
  }
}

export function ensurePublicOverlayDom(creature) {
  if (!creature) return null;
  let rig = document.getElementById('creatureRig');
  let overlay = document.getElementById('overlayLayer');
  if (rig && overlay) return { rig, overlay, creature };

  const parent = creature.parentElement;
  rig = document.createElement('div');
  rig.id = 'creatureRig';
  rig.className = 'creature-rig';
  const cs = getComputedStyle(creature);
  if (cs.animationName && cs.animationName !== 'none') {
    rig.style.animation = cs.animation;
    creature.style.animation = 'none';
  }
  parent.insertBefore(rig, creature);
  rig.appendChild(creature);
  overlay = document.createElement('div');
  overlay.id = 'overlayLayer';
  overlay.className = 'public-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  rig.appendChild(overlay);
  return { rig, overlay, creature };
}

/**
 * Hook SporeBaseEffect climax → loot pick → ActivationEngine when non-ghost.
 * Ghost keeps the existing FireworkManager climax for pixel parity.
 */
export function installThresholdLootHook(effect) {
  if (!effect || effect.__lootHooked) return;
  effect.__lootHooked = true;

  const origEnd = effect.endLightningSequence.bind(effect);

  effect.endLightningSequence = async function patchedEnd() {
    const config = await fetchAnimationConfig();
    const forceId = forceIdFromQuery();
    let pick = null;
    if (forceId && config?.animations) {
      const anim = config.animations.find((a) => a.id === forceId);
      if (anim) pick = { id: forceId, anim };
    }
    if (!pick && config) {
      pick = pickAnimation(config, { lastId: lastPickedId });
    }
    if (!pick || pick.id === 'ghost' || pick.anim?.playMode === 'legacy-ghost') {
      lastPickedId = 'ghost';
      return origEnd();
    }

    lastPickedId = pick.id;
    const CONFIG = this.getConfig();
    this.hideOverlay?.();

    const creature = this.creature;
    const container = this.container;
    const { rig, overlay } = ensurePublicOverlayDom(creature);

    let placementsById = {};
    try {
      if (config.placementsByAnimation?.[pick.id]?.elements) {
        placementsById = config.placementsByAnimation[pick.id].elements;
      } else {
        const placeRes = await fetch('/content/cambio-placements.json');
        if (placeRes.ok) {
          const pj = await placeRes.json();
          placementsById = pj?.byAnimation?.[pick.id]?.elements || {};
        }
      }
    } catch (_) {}

    const elements = (pick.anim.elements || []).map((el) => ({
      ...el,
      placement: placementsById[el.id]
    }));

    mountOverlayProps(overlay, { creature, creatureRig: rig, elements, placementsById });

    try {
      await runActivation({
        container,
        creature,
        creatureRig: rig,
        sporeHost: container,
        profile: 'composite',
        flashHost: overlay,
        composite: {
          baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
          elements: elements.map((el) => ({
            id: el.id,
            src: el.src.startsWith('/') || el.src.startsWith('http')
              ? el.src
              : '/' + el.src.replace(/^\//, ''),
            placement: placementsById[el.id] || el.placement
          }))
        },
        spore: { count: 8, scale: 0.32, durationMs: 1800, spreadPx: 140 }
      });
    } catch (err) {
      console.error('composite activation failed; falling back to ghost', err);
      overlay.innerHTML = '';
      return origEnd();
    }

    overlay.innerHTML = '';
    overlay.style.opacity = '';
    overlay.classList.remove('activation-flash-host');

    this.clickCount = 0;
    this.calculateResetThreshold?.();
    this.lightningSequenceActive = false;
    this.finaleInProgress = false;
    this.stormLevel = 0;
    this.updateStormVisuals?.();
    if (container && CONFIG?.VISUALS?.BACKGROUND_COLOR) {
      container.style.backgroundColor = CONFIG.VISUALS.BACKGROUND_COLOR;
    }
  };

  fetchAnimationConfig().catch(() => {});
}

export default { fetchAnimationConfig, installThresholdLootHook, ensurePublicOverlayDom };
