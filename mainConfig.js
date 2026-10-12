/**
 * Mushroom Platypus - Main Configuration File
 * Global settings and constants
 */

const CONFIG = {

    // Effects System Configuration
    EFFECTS_MANIFEST_PATH: './effects/manifest.js',

    // Effect System Settings
    EFFECTS: {
        AUTO_PRELOAD_NEXT: true,     // Preload next effect for smooth transitions
        TRANSITION_DURATION: 500,     // Duration for effect transitions (ms)
        DEFAULT_EFFECT_INDEX: 0       // Default effect to load on startup (-1 for random)
    },

    // Animation Timings (milliseconds) - Global timings only
    ANIMATIONS: {
        CREATURE_PULSE_DURATION: 200,     // Click pulse effect duration
        CREATURE_FILTER_RESET_DELAY: 200  // Delay before filter resets
    },

    // Visual Effects - Global visuals only
    VISUALS: {
        CREATURE_INITIAL_FILTER: 'drop-shadow(0 0 20px rgba(0, 0, 0, 0.3))',
        CREATURE_PULSE_FILTER: 'drop-shadow(0 0 30px rgba(0, 0, 0, 0.5))',
        BACKGROUND_COLOR: '#7ab5a0'  // Normal background color
    },

    // Asset Paths - Global assets only
    ASSETS: {
        CREATURE_IMAGE: 'img/mushroom-platypus.png',
        STICKER_IMAGE: 'img/Now With Spores Large Image Circular Blue Orange.png'
    },

    // Console ARG Easter Eggs
    CONSOLE_ART: {
        EMOJI: '🍄',
        EMOJI_STYLE: 'font-size: 50px; color: #4A90E2; filter: hue-rotate(200deg) brightness(1.5);',
        MESSAGE: 'blue caps are special',
        MESSAGE_STYLE: 'color: #4A90E2; font-style: italic;'
    },

    // ARG (Alternate Reality Game) Console Messages
    CONSOLE_MESSAGES: [
        { clicks: 1, message: '...' },
        { clicks: 5, message: 'curious, aren\'t you?' },
        { clicks: 10, message: 'patience yields rewards' },
        { clicks: 20, message: 'the spores are spreading...' },
        { clicks: 50, message: 'reality is shifting...' },
        { clicks: 100, message: 'you\'re quite persistent' }
    ],

    // Application Settings
    APP: {
        DEBUG_MODE: false,                // Enable debug logging
        PERFORMANCE_MONITORING: false,    // Enable performance metrics
        ERROR_REPORTING: true,           // Enable error reporting
        MAX_CLICK_RATE: 10,              // Maximum clicks per second
        CLICK_DEBOUNCE: 50               // Debounce time for rapid clicks (ms)
    }
};

// Freeze the configuration to prevent accidental modifications
Object.freeze(CONFIG);

// Deep freeze for nested objects
function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
        if (obj[prop] !== null && (typeof obj[prop] === "object" || typeof obj[prop] === "function") && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return obj;
}

deepFreeze(CONFIG);

// Export for module usage
export { CONFIG };