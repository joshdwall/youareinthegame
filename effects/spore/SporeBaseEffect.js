/**
 * SporeBaseEffect.js
 * Base class for all spore-type effects
 * Provides common functionality for storm progression, lightning, and overlays
 */

import { FireworkManager } from './finale.js';
import { fadeStormResetToLight } from '../activation/fadeStormReset.js';
import { computeClampedBurstDelta } from './sporeBurstMath.js';
import { log, info, debug, warn, error } from '../../js/log.js';

/**
 * Base class for spore effects with storm and lightning mechanics
 */
class SporeBaseEffect {
    /**
     * Create a new spore effect instance
     */
    constructor() {
        // Effect state
        this.stormLevel = 0;
        this.clickCount = 0;
        this.resetThreshold = 0;
        this.lightningSequenceActive = false;
        this.finaleInProgress = false; // Track entire finale sequence
        /** @type {number} epoch ms — decorative-only clicks until this time (covers reset fade) */
        this.__stormResetFadeUntil = 0;
        /** @type {number} 0..1 opacity for default click spores during activation/fade */
        this.__liveInteractionOpacity = 0.8;

        // DOM elements (will be set in init)
        this.container = null;
        this.creature = null;
        this.effectOverlay = null;

        // Overlay state
        this.overlayVisible = false;
        this.overlayFlickerInterval = null;

        // Active timeouts for cleanup
        this.activeTimeouts = new Set();
        this.activeIntervals = new Set();

        // Firework manager - requires config to be set by subclass
        this.fireworkManager = null;

        // Loaded stylesheets
        this.loadedStylesheets = [];

        // Calculate initial threshold
        this.calculateResetThreshold();
    }

    /**
     * Get the configuration object (must be implemented by subclass)
     * @returns {Object} The effect configuration
     * @abstract
     */
    getConfig() {
        throw new Error('Subclass must implement getConfig()');
    }

    /**
     * Initialize the effect and load assets
     * @returns {Promise<void>}
     */
    async init() {
        const CONFIG = this.getConfig();
        log(`${CONFIG.METADATA.name} Effect: Initializing`);

        // Initialize firework manager with config
        this.fireworkManager = new FireworkManager(CONFIG.FIREWORKS);

        // Get DOM elements
        this.container = document.querySelector('.container');
        this.creature = document.getElementById('mainCreature');

        // Load stylesheets
        await this.loadStylesheets();

        // Create effect overlay
        await this.createEffectOverlay();

        // Preload assets
        await this.preloadAssets();

        // Reset visual state
        this.resetVisuals();

        log(`${CONFIG.METADATA.name} Effect: Initialized successfully`);
    }

    /**
     * Load effect stylesheets
     * @returns {Promise<void>}
     */
    async loadStylesheets() {
        const CONFIG = this.getConfig();
        const stylesheets = [
            CONFIG.STYLESHEETS.EFFECT,
            CONFIG.STYLESHEETS.FINALE
        ];

        for (const href of stylesheets) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.effectStylesheet = CONFIG.METADATA.name.toLowerCase();
            document.head.appendChild(link);
            this.loadedStylesheets.push(link);

            // Wait for stylesheet to load
            await new Promise((resolve, reject) => {
                link.onload = resolve;
                link.onerror = reject;
            });
        }

        log(`${CONFIG.METADATA.name} Effect: Stylesheets loaded`);
    }

    /**
     * Remove loaded stylesheets
     */
    removeStylesheets() {
        this.loadedStylesheets.forEach(link => {
            if (link.parentNode) {
                link.parentNode.removeChild(link);
            }
        });
        this.loadedStylesheets = [];
    }

    /**
     * Handle spore click event
     * @param {number} x - X coordinate of click
     * @param {number} y - Y coordinate of click
     */
    /**
     * True while activation flash/animation OR reset fade is running.
     * Clicks stay interactive but only spawn decorative default spores.
     */
    isActivationInteractionBusy() {
        if (this.lightningSequenceActive || this.finaleInProgress) return true;
        return Number.isFinite(this.__stormResetFadeUntil) && Date.now() < this.__stormResetFadeUntil;
    }

    /** Mark the storm-reset fade window so clicks stay decorative until it ends. */
    markStormResetFade(durationMs) {
        const ms = Math.max(0, Math.floor(Number(durationMs) || 0));
        this.__stormResetFadeUntil = Date.now() + ms;
    }

    /** Opacity for default click spores while busy (clamped 0..1). */
    getInteractionDecorOpacity() {
        const o = Number(this.__liveInteractionOpacity);
        if (!Number.isFinite(o)) return 0.8;
        return Math.min(1, Math.max(0, o));
    }

    onSporeClick(x, y) {
        // Always interactive: during flash/animation/fade, still spawn default spores
        // (no threshold / storm progress / pulse — counting mid-climax would re-trigger).
        if (this.isActivationInteractionBusy()) {
            this.createSporeExplosion(x, y, {
                opacity: this.getInteractionDecorOpacity(),
                decorOnly: true
            });
            return;
        }

        this.clickCount++;

        // Create spore explosion (previewClick may wrap this for composites)
        this.createSporeExplosion(x, y);

        // Progress storm if not in lightning sequence
        if (!this.lightningSequenceActive) {
            this.progressThunderstorm();
        }

        // Pulse effect on creature
        this.pulseCreature();
    }

    /**
     * Start the culmination sequence (lightning storm)
     * @returns {Promise<void>}
     */
    async onClimax() {
        if (this.lightningSequenceActive || this.finaleInProgress) {
            return; // Already in progress
        }

        const CONFIG = this.getConfig();
        log(`${CONFIG.METADATA.name} Effect: Starting climax sequence`);

        // Force trigger lightning if not already at threshold
        if (this.clickCount < this.resetThreshold) {
            this.clickCount = this.resetThreshold;
        }

        await this.triggerLightningReset();
    }

    /**
     * Reset the effect to initial state
     * @returns {Promise<void>}
     */
    async reset() {
        const CONFIG = this.getConfig();
        log(`${CONFIG.METADATA.name} Effect: Resetting`);

        // Clear all timeouts and intervals
        this.clearAllTimers();

        // Clean up firework manager
        if (this.fireworkManager) {
            this.fireworkManager.cleanup();
        }

        // Reset state
        this.stormLevel = 0;
        this.clickCount = 0;
        this.lightningSequenceActive = false;
        this.finaleInProgress = false;
        this.__stormResetFadeUntil = 0;
        this.overlayVisible = false;

        // Reset visuals
        this.resetVisuals();

        // Remove effect overlay
        if (this.effectOverlay && this.effectOverlay.parentNode) {
            this.effectOverlay.remove();
            this.effectOverlay = null;
        }

        // Remove stylesheets
        this.removeStylesheets();

        // Calculate new threshold
        this.calculateResetThreshold();

        log(`${CONFIG.METADATA.name} Effect: Reset complete`);
    }

    /**
     * Create spore explosion at specified coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    /**
     * @param {number} x
     * @param {number} y
     * @param {{ opacity?: number, decorOnly?: boolean }} [opts]
     */
    createSporeExplosion(x, y, opts = {}) {
        const CONFIG = this.getConfig();
        const config = CONFIG.SPORES;
        const opacity = Number.isFinite(Number(opts?.opacity))
          ? Math.min(1, Math.max(0, Number(opts.opacity)))
          : null;

        for (let layer = 0; layer < config.BURST_LAYERS; layer++) {
            const layerSporeCount = config.COUNT / config.BURST_LAYERS;
            const layerRadius = (layer + 1) * config.LAYER_RADIUS_BASE;

            for (let i = 0; i < layerSporeCount; i++) {
                const spore = document.createElement('img');
                spore.src = CONFIG.ASSETS.SPORE_IMAGE;
                spore.className = 'spore';
                spore.draggable = false;
                if (opacity != null) {
                    spore.style.setProperty('--spore-opacity', String(opacity));
                    if (opts.decorOnly) spore.dataset.decorOnly = '1';
                }

                // Create burst pattern
                const baseAngle = (Math.PI * 2 * i) / layerSporeCount;
                const angleVariation = (Math.random() - 0.5) * config.ANGLE_VARIATION;
                const angle = baseAngle + angleVariation;

                // Calculate velocity (viewport-scaled + clamped so spores stay on screen)
                const velocity = layerRadius + Math.random() * config.VELOCITY_RANDOM_RANGE;
                const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
                    width: config.SPRITE_WIDTH,
                    height: config.SPRITE_HEIGHT,
                    host: this.container
                });
                const rotation = config.MIN_ROTATION + Math.random() * (config.MAX_ROTATION - config.MIN_ROTATION);

                // Set CSS variables
                spore.style.setProperty('--tx', tx + 'px');
                spore.style.setProperty('--ty', ty + 'px');
                spore.style.setProperty('--rotation', rotation + 'deg');

                // Position at click location
                spore.style.left = (x - config.SPRITE_WIDTH / 2) + 'px';
                spore.style.top = (y - config.SPRITE_HEIGHT / 2) + 'px';

                // Stagger animation
                const delay = layer * config.LAYER_DELAY + (i * config.SPORE_DELAY);
                const duration = config.ANIMATION_MIN_DURATION +
                    Math.random() * (config.ANIMATION_MAX_DURATION - config.ANIMATION_MIN_DURATION);
                spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

                this.container.appendChild(spore);

                // Schedule removal
                const timeout = setTimeout(() => spore.remove(), (duration + delay) * 1000);
                this.trackTimeout(timeout);
            }
        }
    }

    /**
     * Progress the thunderstorm effect
     */
    progressThunderstorm() {
        const CONFIG = this.getConfig();
        this.stormLevel = Math.min(this.stormLevel + 1, CONFIG.STORM.MAX_LEVEL);
        this.updateStormVisuals();

        // Check for lightning trigger
        if (this.clickCount >= this.resetThreshold) {
            this.triggerLightningReset();
        }
    }

    /**
     * Update storm visual effects
     */
    updateStormVisuals() {
        const CONFIG = this.getConfig();
        const darkness = this.stormLevel * CONFIG.STORM.DARKNESS_PER_LEVEL;
        this.container.style.backgroundColor = CONFIG.VISUALS.STORM_DARKNESS_RGBA.replace('{darkness}', darkness);

        // Remove existing storm classes
        this.creature.className = this.creature.className.replace(/storm-level-\d+/g, '');
        if (this.effectOverlay) {
            this.effectOverlay.className = this.effectOverlay.className.replace(/storm-level-\d+/g, '');
        }

        // Add current storm level
        if (this.stormLevel > 0) {
            this.creature.classList.add(`storm-level-${this.stormLevel}`);
            if (this.effectOverlay) {
                this.effectOverlay.classList.add(`storm-level-${this.stormLevel}`);
            }
        }
    }

    /**
     * Trigger lightning reset sequence
     * @returns {Promise<void>}
     */
    async triggerLightningReset() {
        if (this.lightningSequenceActive || this.finaleInProgress) return;

        const CONFIG = this.getConfig();

        // Clear any existing timers BEFORE starting the sequence
        this.clearAllTimers();

        this.lightningSequenceActive = true;
        this.finaleInProgress = true; // Mark entire finale as in progress

        const sequenceDuration = CONFIG.LIGHTNING.SEQUENCE_MIN_MS +
            Math.random() * (CONFIG.LIGHTNING.SEQUENCE_MAX_MS - CONFIG.LIGHTNING.SEQUENCE_MIN_MS);
        const endTime = Date.now() + sequenceDuration;
        let sequenceActive = true;

        const createRandomLightning = () => {
            if (!sequenceActive || Date.now() >= endTime) {
                this.endLightningSequence();
                return;
            }

            // Create lightning flash
            const lightningFlash = document.createElement('div');
            lightningFlash.className = 'lightning-flash';
            document.body.appendChild(lightningFlash);

            // Show overlay
            this.showOverlay();

            // Flash duration
            const flashDuration = CONFIG.LIGHTNING.FLASH_MIN_MS +
                Math.random() * (CONFIG.LIGHTNING.FLASH_MAX_MS - CONFIG.LIGHTNING.FLASH_MIN_MS);

            const hideTimeout = setTimeout(() => {
                lightningFlash.remove();
                this.hideOverlay();
            }, flashDuration);
            this.trackTimeout(hideTimeout);

            // Schedule next flash
            const nextDelay = CONFIG.LIGHTNING.FLASH_GAP_MIN_MS +
                Math.random() * (CONFIG.LIGHTNING.FLASH_GAP_MAX_MS - CONFIG.LIGHTNING.FLASH_GAP_MIN_MS);
            const nextTimeout = setTimeout(createRandomLightning, nextDelay);
            this.trackTimeout(nextTimeout);
        };

        createRandomLightning();
    }

    /**
     * End the lightning sequence with final flash
     * DO NOT clear timers here - let FireworkManager handle its own timing
     */
    endLightningSequence() {
        const CONFIG = this.getConfig();

        // Force hide overlay
        this.hideOverlay();

        // Launch firework spores with completion callback
        const launchX = window.innerWidth / 2 + CONFIG.FIREWORKS.LAUNCH_OFFSET_X;
        const launchY = window.innerHeight / 2 + CONFIG.FIREWORKS.LAUNCH_OFFSET_Y;

        this.fireworkManager.launch(launchX, launchY, this.container, () => {
            this.onFinaleComplete();
        });

        // Wait for fireworks to get going, then final flash
        const finalFlashDelay = CONFIG.ANIMATIONS.FIREWORKS_DELAY_BEFORE_FINAL;

        const finalFlashTimeout = setTimeout(() => {
            // Create final flash
            const finalFlash = document.createElement('div');
            finalFlash.className = 'lightning-flash final-reset';
            finalFlash.style.transition = `opacity ${CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION}ms ease-out`;
            finalFlash.style.opacity = '1';
            document.body.appendChild(finalFlash);

            // Force reflow
            finalFlash.offsetHeight;

            // Start fade
            requestAnimationFrame(() => {
                finalFlash.style.opacity = '0';

                // Reset storm — gradual dark→light fade (not an abrupt snap)
                this.stormLevel = 0;
                const durationMs = Number.isFinite(this.__liveStormResetMs)
                  ? this.__liveStormResetMs
                  : CONFIG.ANIMATIONS.STORM_RESET_DURATION;
                this.markStormResetFade(durationMs);
                fadeStormResetToLight(this.container, {
                  durationMs,
                  backgroundColor: CONFIG.VISUALS.BACKGROUND_COLOR
                });
                // Clear storm classes without snapping background (fade owns bg)
                this.creature.className = this.creature.className.replace(/storm-level-\d+/g, '');
                if (this.effectOverlay) {
                    this.effectOverlay.className = this.effectOverlay.className.replace(/storm-level-\d+/g, '');
                }
            });

            // Cleanup
            const cleanupTimeout = setTimeout(() => {
                finalFlash.remove();
                this.container.style.transition = '';
            }, CONFIG.ANIMATIONS.FINAL_FLASH_FADE_DURATION + 500);
            this.trackTimeout(cleanupTimeout);
        }, finalFlashDelay);

        this.trackTimeout(finalFlashTimeout);

        // Keep lightningSequenceActive true until finale completes
    }

    /**
     * Handle finale completion
     * Called when firework animation is complete
     */
    onFinaleComplete() {
        log('Finale complete - resetting effect state');

        // Reset click count to 0
        this.clickCount = 0;

        // Calculate new threshold
        this.calculateResetThreshold();

        // Reset sequence flags
        this.lightningSequenceActive = false;
        this.finaleInProgress = false;

        log(`New threshold: ${this.resetThreshold}, clicks reset to: ${this.clickCount}`);
    }

    /**
     * Show effect overlay with flicker
     */
    showOverlay() {
        if (!this.effectOverlay) return;

        const CONFIG = this.getConfig();

        if (Math.random() > CONFIG.OVERLAY.SHOW_PROBABILITY) {
            return;
        }

        // Clear existing flicker
        if (this.overlayFlickerInterval) {
            clearInterval(this.overlayFlickerInterval);
            this.activeIntervals.delete(this.overlayFlickerInterval);
        }

        // Set initial opacity
        const opacity = CONFIG.OVERLAY.MIN_OPACITY +
            Math.random() * (CONFIG.OVERLAY.MAX_OPACITY - CONFIG.OVERLAY.MIN_OPACITY);

        this.effectOverlay.style.transition = `opacity ${CONFIG.OVERLAY.FADE_IN_MS}ms ease`;
        this.effectOverlay.style.opacity = opacity;
        this.overlayVisible = true;

        // Start flicker if enabled
        if (CONFIG.OVERLAY.FLICKER_ENABLED) {
            this.overlayFlickerInterval = setInterval(() => {
                const flickerOpacity = CONFIG.OVERLAY.FLICKER_MIN_OPACITY +
                    Math.random() * (CONFIG.OVERLAY.FLICKER_MAX_OPACITY - CONFIG.OVERLAY.FLICKER_MIN_OPACITY);
                this.effectOverlay.style.opacity = flickerOpacity;
            }, CONFIG.OVERLAY.FLICKER_SPEED_MS);
            this.activeIntervals.add(this.overlayFlickerInterval);
        }
    }

    /**
     * Hide effect overlay
     */
    hideOverlay() {
        if (!this.effectOverlay) return;

        const CONFIG = this.getConfig();

        if (this.overlayFlickerInterval) {
            clearInterval(this.overlayFlickerInterval);
            this.activeIntervals.delete(this.overlayFlickerInterval);
            this.overlayFlickerInterval = null;
        }

        this.effectOverlay.style.transition = `opacity ${CONFIG.OVERLAY.FADE_OUT_MS}ms ease`;
        this.effectOverlay.style.opacity = 0;
        this.overlayVisible = false;
    }

    /**
     * Pulse the creature on click
     */
    pulseCreature() {
        const CONFIG = this.getConfig();
        this.creature.style.filter = CONFIG.VISUALS.CREATURE_PULSE_FILTER;
        const timeout = setTimeout(() => {
            this.creature.style.filter = CONFIG.VISUALS.CREATURE_INITIAL_FILTER;
        }, CONFIG.ANIMATIONS.CREATURE_PULSE_DURATION);
        this.trackTimeout(timeout);
    }

    /**
     * Calculate new reset threshold
     */
    calculateResetThreshold() {
        const CONFIG = this.getConfig();
        // Live KV settings (via /api/animations) override build-time GHOST_CONFIG when set.
        const min = Number.isFinite(this.__liveClickMin)
          ? this.__liveClickMin
          : CONFIG.LIGHTNING.MIN_CLICKS;
        const max = Number.isFinite(this.__liveClickMax)
          ? this.__liveClickMax
          : CONFIG.LIGHTNING.MAX_CLICKS;
        const lo = Math.max(3, Math.floor(min));
        const hi = Math.max(lo, Math.floor(max));
        const range = hi - lo;
        this.resetThreshold = this.clickCount + Math.floor(Math.random() * (range + 1)) + lo;
    }

    /**
     * Apply live click-threshold settings from runtime config (no redeploy).
     * @param {{ clickThresholdMin?: number, clickThresholdMax?: number } | null} settings
     */
    applyLiveClickThreshold(settings) {
        if (!settings || typeof settings !== 'object') return;
        let min = Number(settings.clickThresholdMin);
        let max = Number(settings.clickThresholdMax);
        if (!Number.isFinite(min)) min = this.getConfig().LIGHTNING.MIN_CLICKS;
        if (!Number.isFinite(max)) max = this.getConfig().LIGHTNING.MAX_CLICKS;
        this.__liveClickMin = Math.max(3, Math.floor(min));
        this.__liveClickMax = Math.max(this.__liveClickMin, Math.floor(max));
        let fadeMs = Number(settings.stormResetDurationMs);
        if (!Number.isFinite(fadeMs) || fadeMs < 200) {
            fadeMs = this.getConfig().ANIMATIONS.STORM_RESET_DURATION;
        }
        this.__liveStormResetMs = Math.floor(fadeMs);
        let opac = Number(settings.interactionOpacityDuringAnimation);
        if (!Number.isFinite(opac)) opac = 0.8;
        this.__liveInteractionOpacity = Math.min(1, Math.max(0, opac));
    }

    /**
     * Reset all visual elements
     */
    resetVisuals() {
        const CONFIG = this.getConfig();

        if (this.container) {
            this.container.style.backgroundColor = CONFIG.VISUALS.BACKGROUND_COLOR;
            this.container.style.transition = '';
        }

        if (this.creature) {
            this.creature.className = this.creature.className.replace(/storm-level-\d+/g, '');
            this.creature.classList.add('creature');
            this.creature.style.filter = CONFIG.VISUALS.CREATURE_INITIAL_FILTER;
        }

        if (this.effectOverlay) {
            this.effectOverlay.className = this.effectOverlay.className.replace(/storm-level-\d+/g, '');
            this.effectOverlay.classList.add('effect-overlay');
            this.effectOverlay.style.opacity = 0;
        }
    }

    /**
     * Create effect overlay
     * @returns {Promise<void>}
     */
    async createEffectOverlay() {
        const CONFIG = this.getConfig();
        const overlay = document.createElement('img');
        overlay.src = CONFIG.ASSETS.OVERLAY_IMAGE;
        overlay.alt = `${CONFIG.METADATA.name} Overlay`;
        overlay.className = 'effect-overlay';
        overlay.id = 'effectOverlay';
        overlay.draggable = false;
        this.container.appendChild(overlay);
        this.effectOverlay = overlay;
    }

    /**
     * Preload effect assets
     * @returns {Promise<void>}
     */
    async preloadAssets() {
        const CONFIG = this.getConfig();
        const imagesToLoad = [
            CONFIG.ASSETS.SPORE_IMAGE,
            CONFIG.ASSETS.OVERLAY_IMAGE
        ];

        const loadPromises = imagesToLoad.map(src => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = reject;
                img.src = src;
            });
        });

        try {
            await Promise.all(loadPromises);
            log(`${CONFIG.METADATA.name} Effect: Assets preloaded`);
        } catch (error) {
            error(`${CONFIG.METADATA.name} Effect: Failed to preload assets`, error);
        }
    }

    /**
     * Track timeout for cleanup
     * @param {number} timeoutId - Timeout ID to track
     */
    trackTimeout(timeoutId) {
        this.activeTimeouts.add(timeoutId);
        // Auto-remove after completion
        setTimeout(() => this.activeTimeouts.delete(timeoutId), 0);
    }

    /**
     * Clear all active timers
     * Only called at the start of triggerLightningReset and during reset
     */
    clearAllTimers() {
        this.activeTimeouts.forEach(id => clearTimeout(id));
        this.activeTimeouts.clear();

        this.activeIntervals.forEach(id => clearInterval(id));
        this.activeIntervals.clear();

        this.overlayFlickerInterval = null;
    }
}

export default SporeBaseEffect;