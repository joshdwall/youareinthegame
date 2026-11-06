import { PRESETS } from '../costumes/contracts.js';

// These costumes are available by explicit link, outside the live rotation.
const forklift = {
  id: 'forklift',
  label: 'Forklift Driver Certified',
  playMode: 'character-overlay',
  replacesCreature: true,
  animationPreset: {
    ...PRESETS['gentle-burst@1'],
    phases: { equipMs: 140, activationMinMs: 1250, activationMaxMs: 1250, exitMs: 120 }
  },
  clickEffect: { type: 'composite-spores', count: 12, scale: 0.16 },
  elements: [{
    id: 'forklift-driver',
    src: '/assets/animations/forklift/driver.webp',
    placement: {
      characterAnchor: { x: 0.5, y: 0.5 },
      objectAnchor: { x: 0.5, y: 0.5 },
      scale: 1.15,
      rotation: 0,
      layer: 'foreground',
      order: 0,
      flipX: false,
      objectActions: [{ type: 'bounce', phase: 'activation', appliesTo: ['activation'], amplitude: 4, durationMs: 500 }]
    }
  }]
};

export const linkedOnlyAnimations = new Map([[forklift.id, forklift]]);
