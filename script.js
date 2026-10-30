/**
 * Mushroom Platypus Interactive Experience
 * Main JavaScript file - Modular Effects System
 */

// Import configuration
import { CONFIG } from './mainConfig.js';

// Import modular systems
import effectLoader from './effects/EffectLoader.js';
import { createDefaultSporeExplosion } from './effects/spore/defaultSpore.js';

/**
 * Main application controller
 */
class MushroomPlatypusApp {
    constructor() {
        // DOM elements
        this.creature = null;
        this.container = null;
        this.sporeSticker = null;

        // State
        this.clickCount = 0;
        this.currentEffect = null;
        this.isInitialized = false;

        // Performance
        this.lastClickTime = 0;
        this.clickDebounce = CONFIG.APP.CLICK_DEBOUNCE || 50;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Mushroom Platypus: Initializing...');

            // Get DOM elements
            this.creature = document.getElementById('mainCreature');
            this.container = document.querySelector('.container');
            this.sporeSticker = document.querySelector('.spore-sticker');

            if (!this.creature || !this.container) {
                throw new Error('Required DOM elements not found');
            }

            // Initialize effects system
            await this.initializeEffects();

            // Set up event listeners
            this.setupEventListeners();

            // Log ARG console messages
            this.logConsoleArt();

            this.isInitialized = true;
            console.log('Mushroom Platypus: Initialization complete');

        } catch (error) {
            console.error('Failed to initialize Mushroom Platypus:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * Initialize the effects system
     */
    async initializeEffects() {
        // Load effects manifest
        await effectLoader.loadManifest();

        // Select and load initial effect
        this.currentEffect = await effectLoader.selectRandomEffect();

        if (!this.currentEffect) {
            throw new Error('No effects available');
        }

        console.log('Loaded initial effect:', this.currentEffect.constructor.name);

        // Preload next effect if enabled
        if (CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) {
            setTimeout(() => {
                effectLoader.preloadNextEffect().catch(err =>
                    console.warn('Failed to preload next effect:', err)
                );
            }, 5000);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Creature click handler
        this.creature.addEventListener('click', (e) => this.handleCreatureClick(e));

        // Spore sticker click handler
        if (this.sporeSticker) {
            this.sporeSticker.addEventListener('click', (e) => this.handleStickerClick(e));
        }

        // Container click handler for default spores
        this.container.addEventListener('click', (e) => {
            // Only handle if not clicking on creature or sticker
            if (e.target !== this.creature && e.target !== this.sporeSticker) {
                this.handleContainerClick(e);
            }
        });

        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handlePageHidden();
            } else {
                this.handlePageVisible();
            }
        });
    }

    /**
     * Handle creature click
     * @param {MouseEvent} e - Click event
     */
    handleCreatureClick(e) {
        // Debounce rapid clicks
        const now = Date.now();
        if (now - this.lastClickTime < this.clickDebounce) {
            return;
        }
        this.lastClickTime = now;

        // Increment click count
        this.clickCount++;

        // Get click position relative to container
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Delegate to current effect
        if (this.currentEffect && this.currentEffect.onSporeClick) {
            this.currentEffect.onSporeClick(x, y);
        }

        // Pulse effect
        this.pulseCreature();

        // Console messages for ARG
        this.checkConsoleMessages();

        // Check for effect transition (every 100 clicks)
        if (this.clickCount % 100 === 0) {
            this.considerEffectTransition();
        }
    }

    /**
     * Handle spore sticker click
     * @param {MouseEvent} e - Click event
     */
    handleStickerClick(e) {
        // Debounce rapid clicks
        const now = Date.now();
        if (now - this.lastClickTime < this.clickDebounce) {
            return;
        }
        this.lastClickTime = now;

        // Increment click count
        this.clickCount++;

        // Get click position relative to container
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Delegate to current effect
        if (this.currentEffect && this.currentEffect.onSporeClick) {
            this.currentEffect.onSporeClick(x, y);
        }

        // Console messages for ARG
        this.checkConsoleMessages();
    }

    /**
     * Handle container click for default spores
     * @param {MouseEvent} e - Click event
     */
    handleContainerClick(e) {
        // Get click position relative to container
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Create default spore explosion using imported function
        createDefaultSporeExplosion(x, y, this.container);
    }

    /**
     * Pulse the creature on click
     */
    pulseCreature() {
        this.creature.style.filter = CONFIG.VISUALS.CREATURE_PULSE_FILTER;
        setTimeout(() => {
            this.creature.style.filter = CONFIG.VISUALS.CREATURE_INITIAL_FILTER;
        }, CONFIG.ANIMATIONS.CREATURE_PULSE_DURATION);
    }

    /**
     * Check and display console messages
     */
    checkConsoleMessages() {
        CONFIG.CONSOLE_MESSAGES.forEach(msg => {
            if (this.clickCount === msg.clicks) {
                console.log(msg.message);
            }
        });
    }

    /**
     * Consider transitioning to a new effect
     */
    async considerEffectTransition() {
        if (!CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) return;

        try {
            console.log('Considering effect transition...');

            // Trigger current effect's climax
            if (this.currentEffect && this.currentEffect.onClimax) {
                await this.currentEffect.onClimax();

                // Wait for climax to complete
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Transition to new effect
            await this.transitionToNewEffect();

        } catch (error) {
            console.error('Effect transition failed:', error);
        }
    }

    /**
     * Transition to a new effect
     */
    async transitionToNewEffect() {
        try {
            // Reset current effect
            if (this.currentEffect && this.currentEffect.reset) {
                await this.currentEffect.reset();
            }

            // Load new effect
            this.currentEffect = await effectLoader.selectRandomEffect();

            console.log('Transitioned to new effect:', this.currentEffect.constructor.name);

            // Preload next
            if (CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) {
                setTimeout(() => {
                    effectLoader.preloadNextEffect().catch(err =>
                        console.warn('Failed to preload next effect:', err)
                    );
                }, 5000);
            }

        } catch (error) {
            console.error('Failed to transition to new effect:', error);
        }
    }

    /**
     * Handle page becoming hidden
     */
    handlePageHidden() {
        // Could pause animations here if needed
    }

    /**
     * Handle page becoming visible
     */
    handlePageVisible() {
        // Could resume animations here if needed
    }

    /**
     * Log console art for ARG
     */
    logConsoleArt() {
        console.log(`%c${CONFIG.CONSOLE_ART.EMOJI}`, CONFIG.CONSOLE_ART.EMOJI_STYLE);
        console.log(`%c${CONFIG.CONSOLE_ART.MESSAGE}`, CONFIG.CONSOLE_ART.MESSAGE_STYLE);
    }

    /**
     * Handle initialization errors
     * @param {Error} error - The error that occurred
     */
    handleInitializationError(error) {
        // Show user-friendly error
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
            z-index: 1000;
        `;
        errorDiv.innerHTML = `
            <h2 style="color: #e74c3c; margin: 0 0 10px 0;">Oops!</h2>
            <p style="color: #333; margin: 0;">The spores are having trouble spreading.</p>
            <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">Please refresh the page to try again.</p>
        `;
        document.body.appendChild(errorDiv);
    }

    /**
     * Get current app statistics
     * @returns {Object} App statistics
     */
    getStats() {
        return {
            clickCount: this.clickCount,
            currentEffect: this.currentEffect ? this.currentEffect.constructor.name : 'None'
        };
    }
}

/**
 * Initialize the application when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async function() {
    // Create and initialize app
    const app = new MushroomPlatypusApp();
    await app.init();

    // Always expose for harness/Playwright (no visual change). Verbose log only in debug.
    window.mushroomPlatypusApp = app;
    window.effectLoader = effectLoader;
    if (CONFIG.DEV_MODE || CONFIG.APP.DEBUG_MODE) {
        console.log('Debug mode enabled. Access app via window.mushroomPlatypusApp');
    }
});
// Block selection / caret on mouse-down anywhere except real inputs
(() => {
    const block = (e) => {
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
    };
    document.addEventListener('mousedown', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('dblclick', block);
})();
