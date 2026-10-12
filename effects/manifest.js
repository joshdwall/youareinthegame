/**
 * Effects Manifest
 * Registry of all available effects for the Mushroom Platypus
 * Each effect should be a path to the effect module
 */

export const effects = [
    './spore/ghost/effect.js',
    // Future spore effects will be added here:
    // './spore/meatball/effect.js',
    // './spore/cosmic/effect.js',
    // Other effect categories:
    // './particle/digital/effect.js',
    // './transform/morph/effect.js',
];

/**
 * Effect metadata for future use
 * Can be used for weighted selection, categories, etc.
 */
export const effectMetadata = {
    './spore/ghost/effect.js': {
        name: 'Ghost',
        weight: 1,
        category: 'spore',
        subcategory: 'spooky',
        description: 'Ethereal ghost appearances with lightning storms',
        minClicks: 5,
        maxClicks: 10
    }
    // Future effect metadata will be added here
    // './spore/meatball/effect.js': {
    //     name: 'Meatball',
    //     weight: 1,
    //     category: 'spore',
    //     subcategory: 'food',
    //     description: 'Flying meatball madness with savory storms',
    //     minClicks: 5,
    //     maxClicks: 10
    // }
};

/**
 * Get effect metadata by path
 * @param {string} effectPath - Path to the effect
 * @returns {Object|null} Effect metadata or null if not found
 */
export function getEffectMetadata(effectPath) {
    return effectMetadata[effectPath] || null;
}

/**
 * Get effects by category
 * @param {string} category - Category to filter by
 * @returns {Array<string>} Array of effect paths in the category
 */
export function getEffectsByCategory(category) {
    return Object.entries(effectMetadata)
        .filter(([path, meta]) => meta.category === category)
        .map(([path]) => path);
}

/**
 * Get a weighted random effect
 * Takes into account the weight property in metadata
 * @returns {string|null} Random effect path or null if no effects
 */
export function getWeightedRandomEffect() {
    const weightsArray = [];

    for (const [path, meta] of Object.entries(effectMetadata)) {
        const weight = meta.weight || 1;
        for (let i = 0; i < weight; i++) {
            weightsArray.push(path);
        }
    }

    if (weightsArray.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * weightsArray.length);
    return weightsArray[randomIndex];
}