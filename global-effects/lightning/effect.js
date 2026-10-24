/**
 * Lightning global transition — driven by ghost GHOST_CONFIG + effect.css (original model).
 * Not a white-div stub: uses .lightning-flash sequence from SporeBaseEffect lineage.
 */
import { GHOST_CONFIG } from '../../effects/spore/ghost/config.js';
import { ensureStylesheet } from '../../runtime/ensureStylesheet.js';

/**
 * @param {object} cfg — LIGHTNING block from GHOST_CONFIG (or registry override)
 * @param {{ flashCount?: number, includeFinal?: boolean }} [opts]
 */
export async function playGhostLightningSequence(cfg, opts = {}) {
  const L = cfg || GHOST_CONFIG.LIGHTNING;
  const flashCount = opts.flashCount ?? 4;
  const includeFinal = opts.includeFinal !== false;

  await ensureStylesheet(GHOST_CONFIG.STYLESHEETS.EFFECT);

  for (let i = 0; i < flashCount; i++) {
    const flash = document.createElement('div');
    flash.className = 'lightning-flash';
    document.body.appendChild(flash);

    const flashDuration =
      L.FLASH_MIN_MS + Math.random() * (L.FLASH_MAX_MS - L.FLASH_MIN_MS);
    await new Promise((r) => setTimeout(r, flashDuration));
    flash.remove();

    const gap =
      L.FLASH_GAP_MIN_MS + Math.random() * (L.FLASH_GAP_MAX_MS - L.FLASH_GAP_MIN_MS);
    await new Promise((r) => setTimeout(r, gap * 0.45));
  }

  if (includeFinal) {
    const finalFlash = document.createElement('div');
    finalFlash.className = 'lightning-flash final-reset';
    finalFlash.style.transition = `opacity ${GHOST_CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION}ms ease-out`;
    finalFlash.style.opacity = '1';
    document.body.appendChild(finalFlash);
    finalFlash.offsetHeight;
    requestAnimationFrame(() => {
      finalFlash.style.opacity = '0';
    });
    await new Promise((r) =>
      setTimeout(r, Math.min(600, GHOST_CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION))
    );
    finalFlash.remove();
  }
}

export default class LightningEffect {
  /**
   * @param {object} row — global-effects-registry row
   */
  constructor(row) {
    this.row = row;
  }

  /**
   * @param {HTMLElement} [_container]
   */
  async play(_container) {
    const preview = this.row?.meta?.preview || {};
    await playGhostLightningSequence(GHOST_CONFIG.LIGHTNING, {
      flashCount: preview.flashCount ?? 4,
      includeFinal: preview.includeFinal !== false
    });
  }
}
