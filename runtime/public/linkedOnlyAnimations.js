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
      src: '/assets/animations/forklift/seated-670c5bdb4e82.webp',
      placement: {
        // Align the cab so the neck tucks under the original bill.
        characterAnchor: MUSHROOM_RIG.anchors['bill-bottom'],
        objectAnchor: { x: 0.5, y: 0.46 },
        scale: 1.49,
        layer: 'foreground',
        order: 1
      }
    }
  ]
};

export const linkedOnlyAnimations = new Map([[forklift.id, forklift]]);
