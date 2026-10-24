/**
 * Play global transition effects (lightning, feather poof, etc.).
 */
import { resolveSiteModule } from './sitePaths.js';

export class GlobalEffectRunner {
  constructor() {
    this.registry = null;
    this.cache = new Map();
  }

  async loadRegistry() {
    if (this.registry) return this.registry;
    const res = await fetch('./content/global-effects-registry.json');
    this.registry = await res.json();
    return this.registry;
  }

  /**
   * @param {string} effectId
   * @param {HTMLElement} container
   */
  async play(effectId, container) {
    await this.loadRegistry();
    const row = (this.registry.effects || []).find((e) => e.id === effectId);
    if (!row?.module) return;

    const moduleUrl = resolveSiteModule(row.module);
    let mod = this.cache.get(moduleUrl);
    if (!mod) {
      mod = await import(moduleUrl);
      this.cache.set(moduleUrl, mod);
    }
    const EffectClass = mod.default || mod.Effect;
    if (!EffectClass) return;
    const instance = new EffectClass(row);
    if (instance.play) {
      await instance.play(container);
    }
  }
}

export const globalEffectRunner = new GlobalEffectRunner();
