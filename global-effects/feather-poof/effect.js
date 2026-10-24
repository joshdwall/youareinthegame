/**
 * Feather poof global transition — spore-sprite particles (config-driven), not emoji.
 * Uses registry meta.sprite or default spore asset (ghost lineage aesthetic).
 */
import { GHOST_CONFIG } from '../../effects/spore/ghost/config.js';

const DEFAULT_SPRITE = 'effects/spore/mushroom-platypus-spores.png';

export default class FeatherPoofEffect {
  /**
   * @param {object} row — global-effects-registry row
   */
  constructor(row) {
    this.row = row;
  }

  /**
   * @param {HTMLElement} container
   */
  async play(container) {
    const host = container || document.querySelector('.container') || document.body;
    const sprite =
      this.row?.meta?.sprite ||
      this.row?.projectile?.sprite ||
      DEFAULT_SPRITE;
    const count = this.row?.meta?.particleCount ?? 20;
    const particles = [];

    const hostRect = host.getBoundingClientRect();
    const originX = hostRect.width / 2;
    const originY = hostRect.height / 2;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('img');
      el.className = 'spore feather-poof-particle';
      el.src = sprite;
      el.draggable = false;
      el.style.position = 'absolute';
      el.style.left = `${originX - 20 + (Math.random() - 0.5) * 24}px`;
      el.style.top = `${originY - 16 + (Math.random() - 0.5) * 20}px`;
      el.style.width = `${28 + Math.random() * 22}px`;
      el.style.height = 'auto';
      el.style.opacity = '0.95';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '50';
      const driftX = (Math.random() - 0.5) * 220;
      const driftY = -90 - Math.random() * 180;
      const rotation = 360 + Math.random() * 720;
      el.style.setProperty('--tx', `${driftX}px`);
      el.style.setProperty('--ty', `${driftY}px`);
      el.style.setProperty('--rotation', `${rotation}deg`);
      const duration = 0.85 + Math.random() * 0.55;
      el.style.animation = `explode ${duration}s ease-out forwards`;
      host.appendChild(el);
      particles.push({ el, duration });
    }

    // Brief ghost-style flash accent (same CSS lineage when available)
    try {
      const { ensureStylesheet } = await import('../../runtime/ensureStylesheet.js');
      await ensureStylesheet(GHOST_CONFIG.STYLESHEETS.EFFECT);
      const flash = document.createElement('div');
      flash.className = 'lightning-flash';
      flash.style.opacity = '0.35';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 120);
    } catch {
      /* stylesheet optional for poof */
    }

    const maxDur = Math.max(...particles.map((p) => p.duration), 1);
    await new Promise((r) => setTimeout(r, maxDur * 1000 + 80));
    for (const { el } of particles) el.remove();
  }
}
