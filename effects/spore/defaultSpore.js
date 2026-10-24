/**
 * Default Spore Module
 * Handles creation of default spore explosions when clicking on background
 * Shared functionality for basic spore bursts
 */

/**
 * Default spore configuration
 */
const DEFAULT_SPORE_CONFIG = {
    SPORE_COUNT: 16,
    BURST_LAYERS: 2,
    // Site-relative (not gateway-root) so mount /youareinthegame/ resolves correctly
    SPORE_IMAGE: 'effects/spore/mushroom-platypus-spores.png',
    SPRITE_WIDTH: 76,
    SPRITE_HEIGHT: 50,
    BASE_RADIUS: 60,
    VELOCITY_RANGE: 50,
    MIN_ROTATION: 360,
    MAX_ROTATION: 1080,
    MIN_DURATION: 0.6,
    MAX_DURATION: 1.0,
    LAYER_DELAY: 0.08,
    SPORE_DELAY: 0.02,
    ANGLE_VARIATION: 0.3
};

/**
 * Create default spore explosion with standard spores
 * @param {number} x - X coordinate relative to container
 * @param {number} y - Y coordinate relative to container
 * @param {HTMLElement} container - Container element to append spores to
 * @param {Partial<typeof DEFAULT_SPORE_CONFIG>} [overrides] - registry-driven (e.g. projectile.sprite)
 */
export function createDefaultSporeExplosion(x, y, container, overrides = {}) {
    const config = { ...DEFAULT_SPORE_CONFIG, ...overrides };
    if (overrides.SPORE_IMAGE) config.SPORE_IMAGE = overrides.SPORE_IMAGE;

    for (let layer = 0; layer < config.BURST_LAYERS; layer++) {
        const layerSporeCount = config.SPORE_COUNT / config.BURST_LAYERS;
        const layerRadius = (layer + 1) * config.BASE_RADIUS;

        for (let i = 0; i < layerSporeCount; i++) {
            const spore = document.createElement('img');
            spore.src = config.SPORE_IMAGE;
            spore.className = 'spore';
            spore.draggable = false;

            // Create burst pattern
            const baseAngle = (Math.PI * 2 * i) / layerSporeCount;
            const angleVariation = (Math.random() - 0.5) * config.ANGLE_VARIATION;
            const angle = baseAngle + angleVariation;

            // Calculate velocity
            const velocity = layerRadius + Math.random() * config.VELOCITY_RANGE;
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;
            const rotation = config.MIN_ROTATION + Math.random() * (config.MAX_ROTATION - config.MIN_ROTATION);

            // Set CSS variables for animation
            spore.style.setProperty('--tx', tx + 'px');
            spore.style.setProperty('--ty', ty + 'px');
            spore.style.setProperty('--rotation', rotation + 'deg');

            // Position at click location
            spore.style.left = (x - config.SPRITE_WIDTH / 2) + 'px';
            spore.style.top = (y - config.SPRITE_HEIGHT / 2) + 'px';

            // Stagger animation
            const delay = layer * config.LAYER_DELAY + (i * config.SPORE_DELAY);
            const duration = config.MIN_DURATION + Math.random() * (config.MAX_DURATION - config.MIN_DURATION);
            spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

            container.appendChild(spore);

            // Schedule removal
            setTimeout(() => spore.remove(), (duration + delay) * 1000);
        }
    }
}

/**
 * Get the default spore configuration
 * @returns {Object} The default spore configuration object
 */
export function getDefaultSporeConfig() {
    return { ...DEFAULT_SPORE_CONFIG };
}

/**
 * Create a single default spore element
 * Useful for custom implementations that need individual spore control
 * @param {Object} options - Spore creation options
 * @param {number} options.x - X position
 * @param {number} options.y - Y position
 * @param {number} options.angle - Launch angle in radians
 * @param {number} options.velocity - Launch velocity
 * @param {number} options.duration - Animation duration in seconds
 * @param {number} options.delay - Animation delay in seconds
 * @returns {HTMLImageElement} The created spore element
 */
export function createSingleSpore(options) {
    const config = DEFAULT_SPORE_CONFIG;
    const {
        x = 0,
        y = 0,
        angle = 0,
        velocity = 100,
        duration = 1,
        delay = 0
    } = options;

    const spore = document.createElement('img');
    spore.src = config.SPORE_IMAGE;
    spore.className = 'spore';
    spore.draggable = false;

    // Calculate movement
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity;
    const rotation = config.MIN_ROTATION + Math.random() * (config.MAX_ROTATION - config.MIN_ROTATION);

    // Set CSS variables
    spore.style.setProperty('--tx', tx + 'px');
    spore.style.setProperty('--ty', ty + 'px');
    spore.style.setProperty('--rotation', rotation + 'deg');

    // Position
    spore.style.left = (x - config.SPRITE_WIDTH / 2) + 'px';
    spore.style.top = (y - config.SPRITE_HEIGHT / 2) + 'px';

    // Animation
    spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

    return spore;
}

// Export default for convenience
export default createDefaultSporeExplosion;