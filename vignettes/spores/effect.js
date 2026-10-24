/**
 * Default Spores vignette — radial burst using shared defaultSpore module.
 * Config: vignettes-registry projectile.sprite + behavior.
 */
import { createDefaultSporeExplosion } from '../../effects/spore/defaultSpore.js';
import { creatureCenter } from '../../runtime/creatureCenter.js';

export default class SporesVignette {
  /**
   * @param {object} vignetteRow
   */
  constructor(vignetteRow) {
    this.config = vignetteRow;
    this.container = null;
    this.creature = null;
    this.clickCount = 0;
  }

  async init() {
    this.container = document.querySelector('.container');
    this.creature = document.getElementById('mainCreature');
  }

  sporeOverrides() {
    const sprite = this.config?.projectile?.sprite;
    return sprite ? { SPORE_IMAGE: sprite } : {};
  }

  onSporeClick(x, y) {
    this.clickCount += 1;
    if (this.container) {
      createDefaultSporeExplosion(x, y, this.container, this.sporeOverrides());
    }
  }

  /** Harness / URL-override: multiple bursts so Preview is unmistakable. */
  async previewDemo() {
    if (!this.container) await this.init();
    const { x, y } = creatureCenter(this.container, this.creature);
    const offsets = [
      [0, 0],
      [18, -10],
      [-16, 12],
      [8, 16]
    ];
    for (const [dx, dy] of offsets) {
      this.onSporeClick(x + dx, y + dy);
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  async onClimax() {
    /* spores vignette has no storm climax */
  }

  async reset() {
    this.clickCount = 0;
  }
}
