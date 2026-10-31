/**
 * Ghost Effect Configuration
 * Configuration for the ghost spore effect
 */

export const GHOST_CONFIG = {
    // Lightning and Storm Configuration
    LIGHTNING: {
        MIN_CLICKS: 3,           // Fallback min; live SSOT = runtime-config.settings.clickThresholdMin
        MAX_CLICKS: 5,           // Fallback max; live SSOT = runtime-config.settings.clickThresholdMax
        SEQUENCE_MIN_MS: 2000,   // Minimum lightning sequence duration
        SEQUENCE_MAX_MS: 3000,   // Maximum lightning sequence duration
        FLASH_MIN_MS: 50,        // Minimum individual flash duration
        FLASH_MAX_MS: 200,       // Maximum individual flash duration
        FLASH_GAP_MIN_MS: 100,   // Minimum gap between flashes
        FLASH_GAP_MAX_MS: 500    // Maximum gap between flashes
    },

    // Storm Visual Progression
    STORM: {
        MAX_LEVEL: 5,            // Maximum storm intensity level
        DARKNESS_PER_LEVEL: 0.15 // Background darkening per level
    },

    // Effect Overlay Configuration
    OVERLAY: {
        MIN_OPACITY: 0.3,         // Minimum overlay opacity during flash
        MAX_OPACITY: 0.6,         // Maximum overlay opacity during flash
        FADE_IN_MS: 50,           // Overlay fade in duration
        FADE_OUT_MS: 150,         // Overlay fade out duration
        SHOW_PROBABILITY: 1,      // Probability of overlay appearing on each flash (0-1)
        FLICKER_ENABLED: true,    // Enable opacity flickering during visibility
        FLICKER_MIN_OPACITY: 0.2, // Minimum opacity during flicker
        FLICKER_MAX_OPACITY: 0.9, // Maximum opacity during flicker
        FLICKER_SPEED_MS: 80      // Speed of opacity flickering
    },

    // Spore Explosion Settings
    SPORES: {
        COUNT: 24,                    // Total spores per explosion
        BURST_LAYERS: 3,              // Number of burst layers
        LAYER_RADIUS_BASE: 80,        // Base radius multiplier per layer
        VELOCITY_RANDOM_RANGE: 100,   // Random velocity addition
        MIN_ROTATION: 360,            // Minimum rotation degrees
        MAX_ROTATION: 1080,           // Maximum rotation degrees
        ANIMATION_MIN_DURATION: 0.8,  // Minimum animation duration (seconds)
        ANIMATION_MAX_DURATION: 1.2,  // Maximum animation duration (seconds)
        ANGLE_VARIATION: 0.2,         // Angle variation for organic look
        SPRITE_WIDTH: 76,             // Spore sprite width
        SPRITE_HEIGHT: 50,            // Spore sprite height
        LAYER_DELAY: 0.1,             // Delay between layers (seconds)
        SPORE_DELAY: 0.02             // Delay between individual spores (seconds)
    },

    // Firework Spores Configuration
    FIREWORKS: {
        // Launch settings
        SPORE_COUNT: 8,               // Number of firework spores to launch
        LAUNCH_DELAY_MS: 80,          // Delay between each spore launch
        LAUNCH_OFFSET_X: 0,           // X offset from creature center
        LAUNCH_OFFSET_Y: 50,          // Y offset from creature center (positive = below)

        // Physics
        MIN_INITIAL_SPEED: 200,       // Minimum initial velocity (pixels/second)
        MAX_INITIAL_SPEED: 400,       // Maximum initial velocity (pixels/second)
        MIN_LAUNCH_ANGLE: -Math.PI,   // Minimum launch angle (radians)
        MAX_LAUNCH_ANGLE: 0,          // Maximum launch angle (radians) - launches upward
        GRAVITY: 50,                  // Gravity acceleration (pixels/second²)
        AIR_RESISTANCE: 0.2,          // Air resistance coefficient

        // Swirl motion
        MIN_SWIRL_FREQUENCY: 2,       // Minimum swirl oscillation frequency (Hz)
        MAX_SWIRL_FREQUENCY: 4,       // Maximum swirl oscillation frequency (Hz)
        MIN_SWIRL_AMPLITUDE: 20,      // Minimum swirl amplitude (pixels)
        MAX_SWIRL_AMPLITUDE: 60,      // Maximum swirl amplitude (pixels)

        // Visual properties
        SIZE_MULTIPLIER: 1.0,         // Base size multiplier vs normal spores
        SIZE_VARIATION: 0.3,          // Random size variation (+/- this value)
        BASE_WIDTH: 76,               // Base spore width (pixels)
        BASE_HEIGHT: 50,              // Base spore height (pixels)

        // Lifecycle
        MIN_LIFESPAN: 3,              // Minimum lifespan (seconds)
        MAX_LIFESPAN: 5,              // Maximum lifespan (seconds)
        FADE_START_RATIO: 0.7,        // Start fading at this ratio of lifespan

        // Animation
        PHYSICS_UPDATE_RATE: 60,      // Physics updates per second

        // Asset
        SPORE_IMAGE: '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png'
    },

    // Animation Timings (milliseconds)
    ANIMATIONS: {
        CREATURE_PULSE_DURATION: 200,     // Click pulse effect duration
        FINAL_FLASH_FADE_DURATION: 1500,  // Final lightning fade duration
        STORM_RESET_DURATION: 1500,       // Storm to normal transition
        CREATURE_FILTER_RESET_DELAY: 200, // Delay before filter resets
        FIREWORKS_DELAY_BEFORE_FINAL: 500 // Delay after fireworks before final flash
    },

    // Visual Effects
    VISUALS: {
        CREATURE_INITIAL_FILTER: 'drop-shadow(0 0 20px rgba(0, 0, 0, 0.3))',
        CREATURE_PULSE_FILTER: 'drop-shadow(0 0 30px rgba(0, 0, 0, 0.5))',
        BACKGROUND_COLOR: '#7ab5a0',  // Normal background color
        STORM_DARKNESS_RGBA: 'rgba(0, 0, 0, {darkness})'  // Template for storm darkness
    },

    // Asset Paths
    ASSETS: {
        SPORE_IMAGE: '/effects/spore/ghost/img/mushroom-platypus-ghost-spores.png',
        OVERLAY_IMAGE: '/effects/spore/ghost/img/ghost-platypus.png'
    },

    // Stylesheet Paths
    STYLESHEETS: {
        EFFECT: '/effects/spore/ghost/effect.css',
        FINALE: '/effects/spore/finale.css'
    },

    // Effect-specific metadata
    METADATA: {
        name: 'Ghost Storm',
        description: 'Ethereal ghost appearances with progressive storm and lightning',
        author: 'Mushroom Platypus Team',
        version: '1.0.0'
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(GHOST_CONFIG);

// Deep freeze helper
function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
        if (obj[prop] !== null && (typeof obj[prop] === "object" || typeof obj[prop] === "function") && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return obj;
}

deepFreeze(GHOST_CONFIG);