/**
 * Code fallback for byAnimation placements (objectActions, anchors).
 * Live SSOT = KV `cambio:placements` → git seed `content/cambio-placements.json` → these defaults.
 * Shape matches cowboy/ghost seed entries so every character is data-driven identically.
 */

/** @type {Record<string, { transitionId?: string, elements: Record<string, object> }>} */
export const DEFAULT_PLACEMENTS_BY_ANIMATION = {
  ghost: {
    transitionId: 'lightning',
    elements: {
      ghostBody: {
        objectAnchor: { x: 0.5, y: 0.5 },
        characterAnchor: { x: 0.5, y: 0.5 },
        rotation: 0,
        scale: 1,
        transition: null,
        flipX: false,
        objectActions: [
          {
            type: 'textProjectile',
            point: { x: 0.5, y: 0.6 },
            direction: -90,
            text: 'BOO',
            color: '#000000',
            fontWeight: '700',
            fontSizeRatio: 0.42,
            durationMs: 1200,
            holdRatio: 0.4,
            distanceRatio: 0.62,
            scaleFrom: 0.65,
            scaleTo: 1.15,
            pattern: 'once',
            appliesTo: ['spore']
          }
        ]
      }
    }
  },
  cowboy: {
    transitionId: 'lightning',
    elements: {
      hat: {
        objectAnchor: { x: 0.5, y: 0.9 },
        characterAnchor: { x: 0.85, y: -0.15 },
        rotation: 0,
        scale: 0.55,
        transition: null,
        flipX: false
      },
      mustache: {
        objectAnchor: { x: 0.5, y: 0.5 },
        characterAnchor: { x: 0.5, y: 0.56 },
        rotation: 0,
        scale: 0.38,
        transition: null,
        flipX: false
      },
      pistolL: {
        objectAnchor: { x: 0.5, y: 0.5 },
        characterAnchor: { x: 0.14, y: 0.72 },
        rotation: -20,
        scale: 0.28,
        transition: null,
        flipX: false,
        objectActions: [
          {
            type: 'fire',
            point: { x: 0.08, y: 0.32 },
            direction: 180,
            pattern: 'alternate',
            rate: 3.2,
            jitter: 0.5,
            appliesTo: ['spore', 'activation']
          }
        ]
      },
      pistolR: {
        objectAnchor: { x: 0.5, y: 0.5 },
        characterAnchor: { x: 0.86, y: 0.72 },
        rotation: 20,
        scale: 0.28,
        transition: null,
        flipX: false,
        objectActions: [
          {
            type: 'fire',
            point: { x: 0.92, y: 0.32 },
            direction: 0,
            pattern: 'alternate',
            rate: 3.2,
            jitter: 0.5,
            appliesTo: ['spore', 'activation']
          }
        ]
      }
    }
  }
};

/**
 * Resolve placements for an animation: prefer live map, else code defaults.
 * @param {Record<string, object>|null|undefined} placementsById
 * @param {string} animId
 */
export function resolvePlacementsForAnimation(placementsById, animId) {
  if (placementsById && Object.keys(placementsById).length) return placementsById;
  return DEFAULT_PLACEMENTS_BY_ANIMATION[animId]?.elements || {};
}

export default DEFAULT_PLACEMENTS_BY_ANIMATION;
