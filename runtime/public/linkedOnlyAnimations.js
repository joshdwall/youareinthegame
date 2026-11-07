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

const rocker = {
  id: 'rocknroll',
  label: 'Rocker',
  playMode: 'character-overlay',
  animationPreset: PRESETS['classic-lightning@1'],
  clickEffect: { type: 'composite-spores', count: 12, scale: 0.16 },
  elements: [
    {
      id: 'rocker-hair',
      src: '/assets/animations/rocknroll/hair-d45b4a842e8d.webp',
      placement: {
        characterAnchor: { x: 0.5, y: 0.12 },
        objectAnchor: { x: 0.5, y: 0.48 },
        scale: 0.72,
        layer: 'foreground',
        order: 0
      }
    },
    {
      id: 'rocker-guitar',
      src: '/assets/animations/rocknroll/guitar-e08c6a01cb3c.webp',
      placement: {
        characterAnchor: { x: 0.48, y: 0.93 },
        objectAnchor: { x: 0.42, y: 0.54 },
        scale: 0.9,
        layer: 'foreground',
        order: 1,
        objectActions: [{
          type: 'textProjectile',
          phase: 'activation',
          appliesTo: ['activation', 'spore'],
          point: { x: 0.31, y: 0.58 },
          text: '\u266b',
          color: '#ffe398',
          fontSizePx: 19,
          fontWeight: '700',
          direction: -52,
          distanceRatio: 0.95,
          durationMs: 900,
          pattern: 'repeat',
          rate: 1.4,
          jitter: 0.25
        }]
      }
    }
  ]
};

export const linkedOnlyAnimations = new Map([
  [forklift.id, forklift],
  [rocker.id, rocker]
]);
