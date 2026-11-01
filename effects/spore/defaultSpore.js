/**
 * Default Spore Module
 * Handles creation of default spore explosions when clicking on background
 * Shared functionality for basic spore bursts
 */
import { computeClampedBurstDelta } from './sporeBurstMath.js';

/**
 * Default spore configuration
 */
const DEFAULT_SPORE_CONFIG = {
    SPORE_COUNT: 16,
    BURST_LAYERS: 2,
    SPORE_IMAGE: '/effects/spore/mushroom-platypus-spores.png',
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
 * @param {{ opacity?: number }} [opts]
 */
export function createDefaultSporeExplosion(x, y, container, opts = {}) {
    const config = DEFAULT_SPORE_CONFIG;
    const opacity = Number.isFinite(Number(opts?.opacity))
      ? Math.min(1, Math.max(0, Number(opts.opacity)))
      : null;

    for (let layer = 0; layer < config.BURST_LAYERS; layer++) {
        const layerSporeCount = config.SPORE_COUNT / config.BURST_LAYERS;
        const layerRadius = (layer + 1) * config.BASE_RADIUS;

        for (let i = 0; i < layerSporeCount; i++) {
            const spore = document.createElement('img');
            spore.src = config.SPORE_IMAGE;
            spore.className = 'spore';
            spore.draggable = false;
            if (opacity != null) {
              spore.style.setProperty('--spore-opacity', String(opacity));
            }

            const baseAngle = (Math.PI * 2 * i) / layerSporeCount;
            const angleVariation = (Math.random() - 0.5) * config.ANGLE_VARIATION;
            const angle = baseAngle + angleVariation;
            const velocity = layerRadius + Math.random() * config.VELOCITY_RANGE;
            const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
              width: config.SPRITE_WIDTH,
              height: config.SPRITE_HEIGHT,
              host: container
            });
            const rotation = config.MIN_ROTATION + Math.random() * (config.MAX_ROTATION - config.MIN_ROTATION);

            spore.style.setProperty('--tx', tx + 'px');
            spore.style.setProperty('--ty', ty + 'px');
            spore.style.setProperty('--rotation', rotation + 'deg');
            spore.style.left = (x - config.SPRITE_WIDTH / 2) + 'px';
            spore.style.top = (y - config.SPRITE_HEIGHT / 2) + 'px';

            const delay = layer * config.LAYER_DELAY + (i * config.SPORE_DELAY);
            const duration = config.MIN_DURATION + Math.random() * (config.MAX_DURATION - config.MIN_DURATION);
            spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

            container.appendChild(spore);
            setTimeout(() => spore.remove(), (duration + delay) * 1000);
        }
    }
}

export function getDefaultSporeConfig() {
    return { ...DEFAULT_SPORE_CONFIG };
}

export function createSingleSpore(options) {
    const config = DEFAULT_SPORE_CONFIG;
    const {
        x = 0,
        y = 0,
        angle = 0,
        velocity = 100,
        duration = 1,
        delay = 0,
        container = null
    } = options;

    const spore = document.createElement('img');
    spore.src = config.SPORE_IMAGE;
    spore.className = 'spore';
    spore.draggable = false;

    const { tx, ty } = computeClampedBurstDelta(x, y, angle, velocity, {
      width: config.SPRITE_WIDTH,
      height: config.SPRITE_HEIGHT,
      host: container
    });
    const rotation = config.MIN_ROTATION + Math.random() * (config.MAX_ROTATION - config.MIN_ROTATION);

    spore.style.setProperty('--tx', tx + 'px');
    spore.style.setProperty('--ty', ty + 'px');
    spore.style.setProperty('--rotation', rotation + 'deg');
    spore.style.left = (x - config.SPRITE_WIDTH / 2) + 'px';
    spore.style.top = (y - config.SPRITE_HEIGHT / 2) + 'px';
    spore.style.animation = `explode ${duration}s ease-out ${delay}s forwards`;

    return spore;
}

export default createDefaultSporeExplosion;
