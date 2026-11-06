import { MUSHROOM_RIG, PRESETS } from '../costumes/contracts.js';

const eyeCenter = MUSHROOM_RIG.anchors.eyes;

// These costumes are available by explicit link, outside the live rotation.
const forklift = {
  id: 'forklift',
  label: 'Forklift Driver Certified',
  playMode: 'character-overlay',
  replacesCreature: true,
  animationPreset: PRESETS['classic-lightning@1'],
  clickEffect: { type: 'composite-spores', count: 12, scale: 0.16 },
  elements: [
    {
      id: 'forklift-face',
      src: '/img/mushroom-platypus.webp',
      placement: {
        // Identical pivots keep the original face at its rig coordinates.
        characterAnchor: eyeCenter,
        objectAnchor: eyeCenter,
        scale: 1,
        layer: 'foreground',
        order: 0
      }
    },
    {
      id: 'forklift-driver',
      src: '/assets/animations/forklift/front-3028c8f29ac6.webp',
      placement: {
        // The wheel sits at the bill-bottom landmark, in front of the driver.
        characterAnchor: MUSHROOM_RIG.anchors['bill-bottom'],
        objectAnchor: { x: 0.5, y: 0.5 },
        scale: 1.49,
        layer: 'foreground',
        order: 1
      }
    }
  ]
};

export const linkedOnlyAnimations = new Map([[forklift.id, forklift]]);
