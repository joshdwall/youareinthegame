/**
 * Dynamic vignette loader — registry-driven effect modules.
 */
import { resolveSiteModule } from './sitePaths.js';

export class VignetteLoader {
  constructor() {
    this.cache = new Map();
    this.current = null;
    this.isLoading = false;
  }

  /**
   * @param {object} vignetteRow — from vignettes-registry
   * @param {object} [context]
   */
  async load(vignetteRow, context = {}) {
    if (!vignetteRow?.module) {
      throw new Error('Vignette row missing module path');
    }

    if (this.isLoading) {
      await this.waitForLoading();
      return this.current;
    }

    this.isLoading = true;
    try {
      if (this.current?.reset) {
        await this.current.reset();
      }

      const mod = await import(resolveSiteModule(vignetteRow.module));
      const EffectClass = mod.default || mod.Effect || mod.Vignette;
      if (!EffectClass) {
        throw new Error(`No default export in ${vignetteRow.module}`);
      }

      this.validateInterface(EffectClass);
      const instance = new EffectClass(vignetteRow, context);
      await instance.init();
      this.current = instance;
      return instance;
    } finally {
      this.isLoading = false;
    }
  }

  validateInterface(EffectClass) {
    const required = ['init', 'onSporeClick', 'onClimax', 'reset'];
    for (const method of required) {
      if (typeof EffectClass.prototype[method] !== 'function') {
        throw new Error(`Vignette missing method: ${method}`);
      }
    }
  }

  getCurrent() {
    return this.current;
  }

  async waitForLoading() {
    while (this.isLoading) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

export const vignetteLoader = new VignetteLoader();
