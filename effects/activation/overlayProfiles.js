/**
 * Data-only overlay profiles. Every animation culmination uses OverlayPlayer
 * with one of these profiles — ghost / cowboy / future share the same lifecycle.
 */
import { GHOST_CONFIG } from '../spore/ghost/config.js';

/** Shared flash timing (opacity flicker) — ghost SSOT, reused by composites. */
export const OVERLAY_FLASH = { ...GHOST_CONFIG.OVERLAY };

export const OVERLAY_PROFILES = {
  /** Full-bleed character image flash (ghost platypus). */
  ghost: {
    id: 'ghost',
    kind: 'image',
    imageSrc: GHOST_CONFIG.ASSETS.OVERLAY_IMAGE,
    sporeImage: GHOST_CONFIG.ASSETS.SPORE_IMAGE,
    flash: OVERLAY_FLASH,
    lightning: GHOST_CONFIG.LIGHTNING,
    fireworks: GHOST_CONFIG.FIREWORKS,
    animations: GHOST_CONFIG.ANIMATIONS,
    visuals: GHOST_CONFIG.VISUALS,
    stylesheets: [
      GHOST_CONFIG.STYLESHEETS.EFFECT,
      GHOST_CONFIG.STYLESHEETS.FINALE,
      '/effects/activation/activation.css'
    ]
  },
  /** Accessories on live character via flashHost (cowboy etc.). */
  composite: {
    id: 'composite',
    kind: 'composite',
    flash: OVERLAY_FLASH,
    lightning: GHOST_CONFIG.LIGHTNING,
    fireworks: GHOST_CONFIG.FIREWORKS,
    animations: GHOST_CONFIG.ANIMATIONS,
    visuals: GHOST_CONFIG.VISUALS,
    stylesheets: [
      GHOST_CONFIG.STYLESHEETS.EFFECT,
      GHOST_CONFIG.STYLESHEETS.FINALE,
      '/effects/activation/activation.css'
    ]
  }
};

/**
 * Resolve profile id from animation pick / playMode.
 * @param {{ id?: string, anim?: object, playMode?: string }|null} pick
 */
export function resolveOverlayProfileId(pick) {
  if (!pick) return 'ghost';
  const anim = pick.anim || pick;
  const id = pick.id || anim.id;
  if (id === 'ghost' || anim.playMode === 'legacy-ghost' || anim.overlayFlashMode === 'image') {
    return 'ghost';
  }
  return 'composite';
}

export default OVERLAY_PROFILES;
