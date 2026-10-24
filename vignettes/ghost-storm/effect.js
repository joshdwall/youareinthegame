/**
 * Ghost Storm vignette — thin wrapper around legacy ghost effect module (SSOT).
 * Preview demos burst + short storm progress (full climax reserved for onClimax).
 */
import GhostEffect from '../../effects/spore/ghost/effect.js';
import { creatureCenter } from '../../runtime/creatureCenter.js';

export default class GhostStormVignette extends GhostEffect {
  /**
   * @param {object} vignetteRow
   */
  constructor(vignetteRow) {
    super();
    this.vignetteRow = vignetteRow;
  }

  /**
   * Harness Preview: show original ghost spore bursts + storm step (not full finale).
   * Pass `?preview=climax` or call onClimax for the full ghost-explosion sequence.
   */
  async previewDemo() {
    if (!this.container) await this.init();
    const { x, y } = creatureCenter(this.container, this.creature);
    const bursts = 4;
    for (let i = 0; i < bursts; i++) {
      this.onSporeClick(x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 28);
      await new Promise((r) => setTimeout(r, 140));
    }
  }
}
