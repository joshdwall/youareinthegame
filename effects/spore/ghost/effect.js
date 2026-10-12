/**
 * Ghost Effect Module
 * Implements the spooky ghost effect with progressive storm and lightning
 * Extends SporeBaseEffect for shared functionality
 */

import SporeBaseEffect from '../SporeBaseEffect.js';
import { GHOST_CONFIG } from './config.js';

/**
 * Ghost effect implementation
 * @extends SporeBaseEffect
 */
class GhostEffect extends SporeBaseEffect {
    /**
     * Get the configuration object for this effect
     * @returns {Object} The ghost effect configuration
     * @override
     */
    getConfig() {
        return GHOST_CONFIG;
    }
}

export default GhostEffect;