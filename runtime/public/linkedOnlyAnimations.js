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

const welder = {
  id: 'welder',
  label: 'Welder',
  playMode: 'character-overlay',
  animationPreset: PRESETS['classic-lightning@1'],
  clickEffect: { type: 'composite-spores', count: 12, scale: 0.16 },
  elements: [
    {
      id: 'welder-helmet',
      src: '/assets/animations/welder/helmet-c6613a99995a.webp',
      placement: {
        characterAnchor: eyeCenter,
        objectAnchor: { x: 0.5, y: 0.5 },
        scale: 0.52,
        layer: 'foreground',
        order: 0
      }
    },
    {
      id: 'welder-torch',
      src: '/assets/animations/welder/torch-7145c30f066f.webp',
      placement: {
        characterAnchor: { x: 0.76, y: 0.84 },
        objectAnchor: { x: 0.35, y: 0.62 },
        scale: 0.42,
        layer: 'foreground',
        order: 1,
        objectActions: [{
          type: 'textProjectile',
          phase: 'activation',
          appliesTo: ['activation', 'spore'],
          point: { x: 0.98, y: 0.13 },
          text: '\u2726',
          color: '#ffd36a',
          fontSizePx: 15,
          direction: -35,
          distanceRatio: 1.05,
          durationMs: 460,
          pattern: 'repeat',
          rate: 3.5,
          jitter: 0.45
        }]
      }
    }
  ]
};

export const linkedOnlyAnimations = new Map([
  [forklift.id, forklift],
  [welder.id, welder]
]);
