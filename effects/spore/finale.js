/**
 * finale.js
 * Individual firework spore physics and animation handler
 * Fixed for mobile compatibility and reliable animation
 */
import { getViewportSpreadScale } from './sporeBurstMath.js';
import { log, info, debug, warn, error } from '../../js/log.js';


/**
 * Class representing a single firework spore
 */
class FireworkSpore {
    /**
     * Create a firework spore
     * @param {number} x - Initial X position
     * @param {number} y - Initial Y position
     * @param {Object} config - Configuration object
     */
    constructor(x, y, config) {
        // Position
        this.x = x;
        this.y = y;

        // Velocity with random initial direction and speed
        const angle = config.MIN_LAUNCH_ANGLE + Math.random() * (config.MAX_LAUNCH_ANGLE - config.MIN_LAUNCH_ANGLE);
        const spreadScale = getViewportSpreadScale();
        const speed = (config.MIN_INITIAL_SPEED + Math.random() * (config.MAX_INITIAL_SPEED - config.MIN_INITIAL_SPEED)) * spreadScale;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this._spreadScale = spreadScale;

        // Acceleration
        this.ax = 0;
        this.ay = config.GRAVITY;

        // Visual properties
        this.rotation = 0;
        this.size = config.SIZE_MULTIPLIER + (Math.random() - 0.5) * config.SIZE_VARIATION;
        this.opacity = 1;

        // Lifecycle
        this.age = 0;
        this.lifespan = config.MIN_LIFESPAN + Math.random() * (config.MAX_LIFESPAN - config.MIN_LIFESPAN);
        this.isAlive = true;

        // DOM element
        this.element = null;

        // Config reference
        this.config = config;

        // Random swirl properties
        this.swirlPhase = Math.random() * Math.PI * 2;
        this.swirlFrequency = config.MIN_SWIRL_FREQUENCY +
            Math.random() * (config.MAX_SWIRL_FREQUENCY - config.MIN_SWIRL_FREQUENCY);
        this.swirlAmplitude = config.MIN_SWIRL_AMPLITUDE +
            Math.random() * (config.MAX_SWIRL_AMPLITUDE - config.MIN_SWIRL_AMPLITUDE);
    }

    /**
     * Create and append DOM element
     * @param {HTMLElement} container - Container to append spore to
     */
    createElement(container) {
        const w = this.config.BASE_WIDTH * this.size;
        const h = this.config.BASE_HEIGHT * this.size;

        // Optional factory (e.g. cowboy mini composites) — same physics/launch path
        if (typeof this.config.createSporeElement === 'function') {
            this.element = this.config.createSporeElement(this, { width: w, height: h });
            if (!this.element) throw new Error('FireworkSpore: createSporeElement returned nothing');
            this.element.classList.add('firework-spore');
            this.element.draggable = false;
        } else {
            this.element = document.createElement('img');
            this.element.src = this.config.SPORE_IMAGE;
            this.element.className = 'firework-spore';
            this.element.draggable = false;
            this.element.style.width = `${w}px`;
            this.element.style.height = `${h}px`;
        }

        // Prefer explicit style size from factory; fall back to ghost BASE dims
        this.elW = parseFloat(this.element.style.width) || w;
        this.elH = parseFloat(this.element.style.height) || h;

        this.element.style.position = 'absolute';
        this.element.style.left = `${this.x - this.elW / 2}px`;
        this.element.style.top = `${this.y - this.elH / 2}px`;
        this.element.style.transformOrigin = 'center bottom';
        this.element.style.pointerEvents = 'none';
        if (!this.element.style.zIndex) this.element.style.zIndex = '25';
        // Physics spawn (viewport coords) — stable for tests; getBoundingClientRect shifts with rotation
        this.element.dataset.spawnX = String(this.x);
        this.element.dataset.spawnY = String(this.y);

        this.updateRotation();
        container.appendChild(this.element);
    }

    /**
     * Update physics for one frame
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(deltaTime) {
        if (!this.isAlive) return;

        // Update age
        this.age += deltaTime;

        // Check lifespan
        if (this.age > this.lifespan) {
            this.isAlive = false;
            return;
        }

        // Apply swirl effect
        const swirlOffset = Math.sin(this.age * this.swirlFrequency + this.swirlPhase) * this.swirlAmplitude;
        const swirlAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        const swirlX = Math.cos(swirlAngle) * swirlOffset;
        const swirlY = Math.sin(swirlAngle) * swirlOffset;

        // Update velocity with acceleration and swirl
        this.vx += (this.ax + swirlX * deltaTime) * deltaTime;
        this.vy += (this.ay + swirlY * deltaTime) * deltaTime;

        // Apply air resistance
        this.vx *= (1 - this.config.AIR_RESISTANCE * deltaTime);
        this.vy *= (1 - this.config.AIR_RESISTANCE * deltaTime);

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Update visual properties
        this.updateRotation();
        this.updateOpacity();

        // Check if off-screen
        this.checkBounds();
    }

    /**
     * Update rotation based on velocity vector
     */
    updateRotation() {
        // Calculate angle from velocity
        // Add PI/2 because sprite's "forward" is pointing up (negative Y)
        this.rotation = Math.atan2(this.vy, this.vx) + Math.PI / 2;

        if (this.element) {
            this.element.style.transform = `rotate(${this.rotation}rad)`;
        }
    }

    /**
     * Update opacity based on age
     */
    updateOpacity() {
        // Fade out in last portion of lifespan
        const fadeStart = this.lifespan * this.config.FADE_START_RATIO;

        if (this.age > fadeStart) {
            const fadeProgress = (this.age - fadeStart) / (this.lifespan - fadeStart);
            this.opacity = 1 - fadeProgress;

            if (this.element) {
                this.element.style.opacity = this.opacity;
            }
        }
    }

    /**
     * Check if spore is off-screen
     */
    checkBounds() {
        const margin = 100; // Margin outside viewport before removal
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (this.x < -margin || this.x > width + margin ||
            this.y < -margin || this.y > height + margin) {
            this.isAlive = false;
        }
    }

    /**
     * Update DOM element position
     */
    render() {
        if (!this.element || !this.isAlive) return;
        const w = this.elW ?? (this.config.BASE_WIDTH * this.size);
        const h = this.elH ?? (this.config.BASE_HEIGHT * this.size);
        this.element.style.left = `${this.x - w / 2}px`;
        this.element.style.top = `${this.y - h / 2}px`;
    }

    /**
     * Clean up and remove DOM element
     */
    destroy() {
        try { this.element?.__actionStop?.(); } catch (_) {}
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
        this.element = null;
        this.isAlive = false;
    }
}

/**
 * FireworkManager - Manages the collection of firework spores
 */
class FireworkManager {
    constructor(config) {
        this.config = config;
        this.fireworkSpores = [];
        this.animationFrameId = null;
        this.animationTimeoutId = null;
        this.lastUpdateTime = 0;
        this.launchTimeouts = [];
        this.container = null;
        this.isAnimating = false;
        this.useFallbackAnimation = this.detectMobileBrowser();
        this.completionCallback = null; // Callback for when all fireworks complete
    }

    /**
     * Detect if running on mobile browser that might need fallback
     * @returns {boolean} True if mobile browser detected
     */
    detectMobileBrowser() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        const isReplit = window.location.hostname.includes('replit');

        // Also check if requestAnimationFrame behaves properly
        const rafTest = typeof requestAnimationFrame !== 'function';

        return isMobile || isReplit || rafTest;
    }

    /**
     * Launch firework spores from specified position
     * @param {number} x - Launch X position
     * @param {number} y - Launch Y position
     * @param {HTMLElement} container - Container element
     * @param {Function} onComplete - Callback function to call when all fireworks complete
     */
    launch(x, y, container, onComplete) {
        log('FireworkManager: Launching firework spores');

        this.container = container;
        this.completionCallback = onComplete;

        // Clear any existing launch timeouts
        this.clearLaunchTimeouts();

        // Launch spores with stagger
        for (let i = 0; i < this.config.SPORE_COUNT; i++) {
            const delay = i * this.config.LAUNCH_DELAY_MS;

            const timeout = setTimeout(() => {
                const spore = new FireworkSpore(x, y, this.config);
                spore.createElement(this.container);
                this.fireworkSpores.push(spore);

                // Start animation after first spore is created
                if (i === 0 && !this.isAnimating) {
                    this.startAnimation();
                }
            }, delay);

            this.launchTimeouts.push(timeout);
        }
    }

    /**
     * Start the animation loop
     */
    startAnimation() {
        if (this.isAnimating) return; // Already running

        this.isAnimating = true;
        this.lastUpdateTime = performance.now();

        log(`FireworkManager: Starting animation (fallback mode: ${this.useFallbackAnimation})`);

        if (this.useFallbackAnimation) {
            this.startFallbackAnimation();
        } else {
            this.startRAFAnimation();
        }
    }

    /**
     * Start animation using requestAnimationFrame
     */
    startRAFAnimation() {
        const animate = (currentTime) => {
            if (!this.isAnimating) return;

            // Calculate delta time in seconds
            const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = currentTime;

            // Update all spores
            this.updateAndRenderSpores(deltaTime);

            // Continue animation if spores remain
            if (this.fireworkSpores.length > 0) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.stopAnimation();
            }
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    /**
     * Start animation using setTimeout fallback
     */
    startFallbackAnimation() {
        const targetFPS = 60;
        const frameInterval = 1000 / targetFPS;

        const animate = () => {
            if (!this.isAnimating) return;

            const currentTime = performance.now();
            const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = currentTime;

            // Update all spores
            this.updateAndRenderSpores(deltaTime);

            // Continue animation if spores remain
            if (this.fireworkSpores.length > 0) {
                this.animationTimeoutId = setTimeout(animate, frameInterval);
            } else {
                this.stopAnimation();
            }
        };

        this.animationTimeoutId = setTimeout(animate, frameInterval);
    }

    /**
     * Update and render all spores
     * @param {number} deltaTime - Time since last update in seconds
     */
    updateAndRenderSpores(deltaTime) {
        // Clamp deltaTime to prevent huge jumps
        deltaTime = Math.min(deltaTime, 0.1);

        for (let i = this.fireworkSpores.length - 1; i >= 0; i--) {
            const spore = this.fireworkSpores[i];

            spore.update(deltaTime);
            spore.render();

            // Remove dead spores
            if (!spore.isAlive) {
                spore.destroy();
                this.fireworkSpores.splice(i, 1);
            }
        }
    }

    /**
     * Stop the animation loop
     */
    stopAnimation() {
        this.isAnimating = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.animationTimeoutId) {
            clearTimeout(this.animationTimeoutId);
            this.animationTimeoutId = null;
        }

        log('FireworkManager: Animation stopped');

        // Call completion callback if set
        if (this.completionCallback && typeof this.completionCallback === 'function') {
            log('FireworkManager: Calling completion callback');
            this.completionCallback();
            this.completionCallback = null; // Clear callback after calling
        }
    }

    /**
     * Clear launch timeouts
     */
    clearLaunchTimeouts() {
        this.launchTimeouts.forEach(timeout => clearTimeout(timeout));
        this.launchTimeouts = [];
    }

    /**
     * Clean up all fireworks
     */
    cleanup() {
        // Stop animation
        this.stopAnimation();

        // Clear launch timeouts
        this.clearLaunchTimeouts();

        // Destroy all spores
        this.fireworkSpores.forEach(spore => spore.destroy());
        this.fireworkSpores = [];

        // Reset state
        this.lastUpdateTime = 0;
        this.container = null;
        this.isAnimating = false;
        this.completionCallback = null;
    }

    /**
     * Get current spore count
     * @returns {number} Number of active spores
     */
    getSporeCount() {
        return this.fireworkSpores.length;
    }
}

// Export both classes
export { FireworkSpore, FireworkManager };
export default FireworkSpore;