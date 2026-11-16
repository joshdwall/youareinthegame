/**
 * EffectLoader.js
 * Dynamically loads and manages effects from the manifest
 * Handles random selection and effect lifecycle
 */
import { log, info, debug, warn, error } from '../js/log.js';
import { withCacheBust } from '../js/cacheBust.js';

class EffectLoader {
    /**
     * Initialize the EffectLoader
     * @param {string} manifestPath - Path to the effects manifest
     */
    constructor(manifestPath = './manifest.js') {
        this.manifestPath = manifestPath;
        this.availableEffects = [];
        this.currentEffect = null;
        this.loadedEffects = new Map(); // Cache loaded effects
        this.isLoading = false;
    }

    /**
     * Load the effects manifest and initialize available effects
     * @returns {Promise<void>}
     */
    async loadManifest() {
        try {
            const manifestModule = await import(withCacheBust(this.manifestPath));
            this.availableEffects = manifestModule.effects || [];

            if (this.availableEffects.length === 0) {
                log('No effects found in manifest');
            }

            log(`EffectLoader: Loaded ${this.availableEffects.length} effects from manifest`);
        } catch (error) {
            error('Failed to load effects manifest:', error);
            this.availableEffects = [];
        }
    }

    /**
     * Select and load a random effect from available effects
     * @returns {Promise<Object>} The loaded effect instance
     */
    async selectRandomEffect() {
        if (this.availableEffects.length === 0) {
            throw new Error('No effects available to select');
        }

        // If currently loading, wait for it to complete
        if (this.isLoading) {
            await this.waitForLoading();
            return this.currentEffect;
        }

        this.isLoading = true;

        try {
            // Clean up previous effect if exists
            if (this.currentEffect) {
                await this.cleanupCurrentEffect();
            }

            // Select random effect path
            const randomIndex = Math.floor(Math.random() * this.availableEffects.length);
            const effectPath = this.availableEffects[randomIndex];

            log(`EffectLoader: Selected effect ${effectPath}`);

            // Load the effect
            const effect = await this.loadEffect(effectPath);
            this.currentEffect = effect;

            return effect;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Load a specific effect by path
     * @param {string} effectPath - Path to the effect module
     * @returns {Promise<Object>} The loaded effect instance
     */
    async loadEffect(effectPath) {
        // Check cache first
        if (this.loadedEffects.has(effectPath)) {
            log(`EffectLoader: Using cached effect ${effectPath}`);
            const CachedEffect = this.loadedEffects.get(effectPath);
            const instance = new CachedEffect();
            await instance.init();
            return instance;
        }

        try {
            log(`EffectLoader: Loading effect from ${effectPath}`);

            // Load the effect module
            const effectModule = await import(withCacheBust(effectPath));
            const EffectClass = effectModule.default || effectModule.Effect;

            if (!EffectClass) {
                throw new Error(`No default export or Effect class found in ${effectPath}`);
            }

            // Validate effect interface
            this.validateEffectInterface(EffectClass);

            // Cache the effect class
            this.loadedEffects.set(effectPath, EffectClass);

            // Create and initialize instance
            const instance = new EffectClass();
            await instance.init();

            return instance;
        } catch (error) {
            error(`Failed to load effect ${effectPath}:`, error);
            throw error;
        }
    }

    /**
     * Validate that an effect class implements the required interface
     * @param {Class} EffectClass - The effect class to validate
     * @throws {Error} If the effect doesn't implement required methods
     */
    validateEffectInterface(EffectClass) {
        const requiredMethods = ['init', 'onSporeClick', 'onClimax', 'reset'];
        const prototype = EffectClass.prototype;

        for (const method of requiredMethods) {
            if (typeof prototype[method] !== 'function') {
                throw new Error(`Effect class missing required method: ${method}`);
            }
        }
    }

    /**
     * Get the currently active effect
     * @returns {Object|null} The current effect instance or null
     */
    getCurrentEffect() {
        return this.currentEffect;
    }

    /**
     * Clean up the current effect
     * @returns {Promise<void>}
     */
    async cleanupCurrentEffect() {
        if (this.currentEffect && typeof this.currentEffect.reset === 'function') {
            try {
                await this.currentEffect.reset();
            } catch (error) {
                error('Error cleaning up effect:', error);
            }
        }
        this.currentEffect = null;
    }

    /**
     * Wait for any ongoing loading to complete
     * @returns {Promise<void>}
     */
    async waitForLoading() {
        const checkInterval = 100; // ms
        while (this.isLoading) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }

    /**
     * Preload the next effect for smooth transitions
     * @returns {Promise<void>}
     */
    async preloadNextEffect() {
        if (this.availableEffects.length <= 1) {
            return; // No other effects to preload
        }

        try {
            // Select a different effect than current
            let nextEffectPath;
            do {
                const randomIndex = Math.floor(Math.random() * this.availableEffects.length);
                nextEffectPath = this.availableEffects[randomIndex];
            } while (this.currentEffect && nextEffectPath === this.currentEffect.constructor.name);

            // Load but don't initialize
            const effectModule = await import(withCacheBust(nextEffectPath));
            const EffectClass = effectModule.default || effectModule.Effect;

            if (EffectClass) {
                this.loadedEffects.set(nextEffectPath, EffectClass);
                log(`EffectLoader: Preloaded ${nextEffectPath}`);
            }
        } catch (error) {
            log('Failed to preload next effect:', error);
        }
    }

    /**
     * Force reload all effects (useful for development)
     * @returns {Promise<void>}
     */
    async reloadAll() {
        await this.cleanupCurrentEffect();
        this.loadedEffects.clear();
        await this.loadManifest();
    }
}

// Export as singleton
const effectLoader = new EffectLoader();
export default effectLoader;