/**
 * Unit: scale is width-fraction of character; no defaultWidthFrac double-apply.
 */
import assert from 'node:assert/strict';
import {
  elementWidthPx,
  applyElementPlacement
} from '../effects/activation/placementMath.js';

const box = { left: 100, top: 50, width: 400, height: 500 };

// Cowboy KV scales (width fractions)
const placements = {
  hat: { scale: 1.05, characterAnchor: { x: 0.5, y: -0.07 }, objectAnchor: { x: 0.5, y: 0.5 } },
  mustache: { scale: 0.38, characterAnchor: { x: 0.5, y: 0.8 }, objectAnchor: { x: 0.5, y: 0.5 } },
  pistolL: { scale: 0.28, characterAnchor: { x: 0.0, y: 0.46 }, objectAnchor: { x: 0.56, y: 0.34 } },
  pistolR: { scale: 0.28, characterAnchor: { x: 0.94, y: 0.49 }, objectAnchor: { x: 0.32, y: 0.48 } }
};

for (const [id, st] of Object.entries(placements)) {
  const w = elementWidthPx(st, box.width);
  assert.equal(w, st.scale * box.width, `${id}: width = scale * charWidth`);
  // Must NOT equal defaultWidthFrac * scale * charWidth for mustache/pistols
  if (id === 'mustache') {
    const wrong = box.width * 0.38 * st.scale; // old public bug
    assert.notEqual(w, wrong, 'mustache must not double-apply defaultWidthFrac');
    assert.equal(w, 0.38 * 400);
  }
}

const img = { style: {} };
const r = applyElementPlacement(img, placements.mustache, box);
assert.equal(img.style.width, '152px'); // 0.38 * 400
assert.match(img.style.transform, /translate\(-50%, -50%\)/);
assert.equal(r.width, 152);

console.log('placement-math.test.mjs: OK');
