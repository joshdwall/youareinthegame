import assert from 'node:assert/strict';
import {
  getViewportSpreadScale,
  clampBurstDelta,
  computeClampedBurstDelta
} from '../effects/spore/sporeBurstMath.js';
import { resolveClickEffect } from '../effects/activation/clickEffect.js';

// jsdom-less: stub window for viewport helpers
globalThis.window = { innerWidth: 390, innerHeight: 844 };

const mobileScale = getViewportSpreadScale();
assert.ok(mobileScale < 1, `mobile scale should be <1, got ${mobileScale}`);
assert.ok(mobileScale >= 0.45, `mobile scale floor 0.45, got ${mobileScale}`);

globalThis.window = { innerWidth: 1440, innerHeight: 900 };
assert.equal(getViewportSpreadScale(), 1);

// Clamp keeps end point inside host
const clamped = clampBurstDelta(200, 400, 500, 500, {
  width: 76,
  height: 50,
  host: { clientWidth: 390, clientHeight: 844 }
});
assert.ok(200 + clamped.tx <= 390 - 8 - 38 + 0.01);
assert.ok(400 + clamped.ty <= 844 - 8 - 25 + 0.01);

globalThis.window = { innerWidth: 390, innerHeight: 844 };
const { tx, ty, spreadScale } = computeClampedBurstDelta(100, 100, 0, 200, {
  width: 40,
  height: 40,
  host: { clientWidth: 390, clientHeight: 844 }
});
assert.ok(spreadScale < 1);
assert.ok(Math.abs(tx) <= 200);

// Cowboy default scale ~15% (was 0.18)
const cowboy = resolveClickEffect({
  id: 'cowboy',
  elements: [{ id: 'hat' }],
  playMode: 'character-overlay'
});
assert.equal(cowboy.type, 'composite-spores');
assert.equal(cowboy.scale, 0.15);

const explicit = resolveClickEffect({
  clickEffect: { type: 'composite-spores', scale: 0.15 }
});
assert.equal(explicit.scale, 0.15);

console.log('spore-burst-math.test.mjs: ok');
