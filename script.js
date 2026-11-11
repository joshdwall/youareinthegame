/**
 * Mushroom Platypus Interactive Experience
 * Instant-interactive boot: listeners + default spores first;
 * EffectLoader / thresholdActivation / ghost stack load in background.
 */
import { CONFIG } from './mainConfig.js';
import { createDefaultSporeExplosion } from './effects/spore/defaultSpore.js';
import { log, info, debug, warn, error } from './js/log.js';

class MushroomPlatypusApp {
    constructor() {
        this.creature = null;
        this.container = null;
        this.sporeSticker = null;

        this.clickCount = 0;
        this.currentEffect = null;
        this.isInitialized = false;
        /** True once EffectLoader + threshold hook are installed. */
        this.effectsReady = false;
        /** Creature clicks before effectsReady — applied to effect.clickCount on takeover. */
        this.pendingThresholdClicks = 0;
        /** Module handle once dynamically imported. */
        this.effectLoader = null;

        this.lastClickTime = 0;
        this.clickDebounce = CONFIG.APP.CLICK_DEBOUNCE || 50;
    }

    async init() {
        try {
            log('Mushroom Platypus: Initializing...');

            this.creature = document.getElementById('mainCreature');
            this.container = document.querySelector('.container');
            this.sporeSticker = document.querySelector('.spore-sticker');

            if (!this.creature || !this.container) {
                throw new Error('Required DOM elements not found');
            }

            // Absorb early-boot pending clicks (inline script) before attaching module listeners.
            const early = typeof window !== 'undefined' ? window.__yaitgEarly : null;
            if (early && typeof early.takeOver === 'function') {
                const pending = early.takeOver() || 0;
                this.pendingThresholdClicks += Number(pending) || 0;
            }

            // Instant interactivity: listeners BEFORE heavy effect stack.
            this.setupEventListeners();
            this.markListenersReady();
            this.logConsoleArt();
            this.isInitialized = true;
            log('Mushroom Platypus: listeners ready (effects loading…)');

            // Background: ghost / ActivationEngine / loot / CSS / images.
            await this.initializeEffects();
            this.flushPendingThresholdClicks();
            this.effectsReady = true;
            log('Mushroom Platypus: Initialization complete');
        } catch (err) {
            error('Failed to initialize Mushroom Platypus:', err);
            this.handleInitializationError(err);
        }
    }

    markListenersReady() {
        try {
            if (typeof performance !== 'undefined' && performance.mark) {
                performance.mark('yaitg-listeners-ready');
            }
            if (typeof window !== 'undefined') {
                window.__yaitgListenersReadyAt = Date.now();
                window.__yaitgListenersReady = true;
            }
        } catch (_) { /* ignore */ }
    }

    async initializeEffects() {
        const { default: effectLoader } = await import('./effects/EffectLoader.js?v=glow-jump-1');
        const { installThresholdLootHook } = await import('./runtime/public/thresholdActivation.js?v=glow-jump-1');
        this.effectLoader = effectLoader;
        if (typeof window !== 'undefined') {
            window.effectLoader = effectLoader;
        }

        await effectLoader.loadManifest();
        this.currentEffect = await effectLoader.selectRandomEffect();

        if (!this.currentEffect) {
            throw new Error('No effects available');
        }

        installThresholdLootHook(this.currentEffect);
        window.__yaitgEffect = this.currentEffect;
        log('Loaded initial effect:', this.currentEffect.constructor.name);

        if (CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) {
            setTimeout(() => {
                effectLoader.preloadNextEffect().catch(err =>
                    log('Failed to preload next effect:', err)
                );
            }, 5000);
        }
    }

    /**
     * Apply early creature clicks to the effect's threshold counter without
     * re-firing spore bursts (already shown via default spores).
     */
    flushPendingThresholdClicks() {
        const n = this.pendingThresholdClicks | 0;
        this.pendingThresholdClicks = 0;
        if (!n || !this.currentEffect) return;
        const effect = this.currentEffect;
        effect.clickCount = (effect.clickCount | 0) + n;
        if (typeof effect.progressThunderstorm === 'function' && !effect.lightningSequenceActive) {
            // One visual progress step is enough; count already includes all early clicks.
            // Progress storm level based on how far into threshold we are without N full pulses.
            const steps = Math.min(n, 8);
            for (let i = 0; i < steps; i++) {
                if (effect.lightningSequenceActive || effect.finaleInProgress) break;
                effect.progressThunderstorm();
            }
        }
        // If early clicks already met threshold, trigger once effects are ready.
        if (
            typeof effect.resetThreshold === 'number' &&
            effect.clickCount >= effect.resetThreshold &&
            typeof effect.triggerLightningReset === 'function' &&
            !effect.lightningSequenceActive &&
            !effect.finaleInProgress
        ) {
            effect.triggerLightningReset();
        }
    }

    setupEventListeners() {
        this.creature.addEventListener('click', (e) => this.handleCreatureClick(e));
        this.container.addEventListener('click', (e) => {
            const badge = e.target.closest?.('#tapSporeBadge');
            if (badge) {
                if (!badge.disabled) this.handleCreatureClick(e, true);
                return;
            }
            if (e.target !== this.creature) {
                this.handleContainerClick(e);
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.handlePageHidden();
            else this.handlePageVisible();
        });
    }

    handleCreatureClick(e, fromBadge = false) {
        const now = Date.now();
        if (now - this.lastClickTime < this.clickDebounce) return;
        this.lastClickTime = now;

        this.clickCount++;

        const rect = this.container.getBoundingClientRect();
        const center = fromBadge ? this.creature.getBoundingClientRect() : null;
        const x = (center ? center.left + center.width / 2 : e.clientX) - rect.left;
        const y = (center ? center.top + center.height / 2 : e.clientY) - rect.top;

        if (this.effectsReady && this.currentEffect && this.currentEffect.onSporeClick) {
            this.currentEffect.onSporeClick(x, y);
        } else {
            // Early path: default spores immediately; count applied on takeover.
            createDefaultSporeExplosion(x, y, this.container);
            this.pendingThresholdClicks++;
        }

        this.pulseCreature();
        this.checkConsoleMessages();

        if (this.clickCount % 100 === 0) {
            this.considerEffectTransition();
        }
    }

    handleStickerClick(_e) { /* no-op */ }

    handleContainerClick(e) {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createDefaultSporeExplosion(x, y, this.container);
    }

    pulseCreature() {
        this.creature.style.filter = CONFIG.VISUALS.CREATURE_PULSE_FILTER;
        setTimeout(() => {
            this.creature.style.removeProperty('filter');
        }, CONFIG.ANIMATIONS.CREATURE_PULSE_DURATION);
    }

    checkConsoleMessages() {
        CONFIG.CONSOLE_MESSAGES.forEach(msg => {
            if (this.clickCount === msg.clicks) console.log(msg.message);
        });
    }

    async considerEffectTransition() {
        if (!CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) return;
        if (!this.effectsReady || !this.effectLoader) return;
        try {
            log('Considering effect transition...');
            if (this.currentEffect && this.currentEffect.onClimax) {
                await this.currentEffect.onClimax();
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            await this.transitionToNewEffect();
        } catch (err) {
            error('Effect transition failed:', err);
        }
    }

    async transitionToNewEffect() {
        try {
            if (this.currentEffect && this.currentEffect.reset) {
                await this.currentEffect.reset();
            }
            this.currentEffect = await this.effectLoader.selectRandomEffect();
            window.__yaitgEffect = this.currentEffect;
            log('Transitioned to new effect:', this.currentEffect.constructor.name);
            if (CONFIG.EFFECTS.AUTO_PRELOAD_NEXT) {
                setTimeout(() => {
                    this.effectLoader.preloadNextEffect().catch(err =>
                        log('Failed to preload next effect:', err)
                    );
                }, 5000);
            }
        } catch (err) {
            error('Failed to transition to new effect:', err);
        }
    }

    handlePageHidden() {}
    handlePageVisible() {}

    logConsoleArt() {
        console.log(`%c${CONFIG.CONSOLE_ART.EMOJI}`, CONFIG.CONSOLE_ART.EMOJI_STYLE);
        console.log(`%c${CONFIG.CONSOLE_ART.MESSAGE}`, CONFIG.CONSOLE_ART.MESSAGE_STYLE);
    }

    handleInitializationError(error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 20px; border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); text-align: center; z-index: 1000;
        `;
        errorDiv.innerHTML = `
            <h2 style="color: #e74c3c; margin: 0 0 10px 0;">Oops!</h2>
            <p style="color: #333; margin: 0;">The spores are having trouble spreading.</p>
            <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">Please refresh the page to try again.</p>
        `;
        document.body.appendChild(errorDiv);
    }

    getStats() {
        return {
            clickCount: this.clickCount,
            currentEffect: this.currentEffect ? this.currentEffect.constructor.name : 'None',
            effectsReady: this.effectsReady
        };
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const app = new MushroomPlatypusApp();
    await app.init();
    window.mushroomPlatypusApp = app;
    if (CONFIG.DEV_MODE || CONFIG.APP.DEBUG_MODE) {
        log('Debug mode enabled. Access app via window.mushroomPlatypusApp');
    }
});

(() => {
    const block = (e) => {
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
    };
    const blockMenu = (e) => {
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (e.target.closest && e.target.closest('.container, .creature-rig, img, picture, .creature-hit-shield, .public-overlay')) {
            e.preventDefault();
        }
    };
    document.addEventListener('mousedown', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('dblclick', block);
    document.addEventListener('contextmenu', blockMenu, true);
    const harden = (root) => {
        (root.querySelectorAll ? root.querySelectorAll('img') : []).forEach((img) => {
            img.draggable = false;
            img.setAttribute('draggable', 'false');
        });
        if (root.tagName === 'IMG') {
            root.draggable = false;
            root.setAttribute('draggable', 'false');
        }
    };
    harden(document);
    try {
        new MutationObserver((muts) => {
            for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) harden(n);
        }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
})();
