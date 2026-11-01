/**
 * Alternate (round-robin) selection: A,B,A,B; 1,2,3,1; 1000 synthetic; mid-cycle add/remove.
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const {
  pickAnimation,
  pickAlternate,
  eligibleOrdered,
  resolveSelectionMode
} = await import(pathToFileURL(path.join(root, 'runtime/loot/LootTable.js')).href);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function baseConfig(anims, mode = 'alternate') {
  return {
    flags: { noRepeatTwice: false },
    settings: { selectionMode: mode },
    seasons: [],
    tiers: {},
    animations: anims
  };
}

// --- A,B,A,B ---
{
  const config = baseConfig([
    { id: 'A', live: true, archived: false, order: 0 },
    { id: 'B', live: true, archived: false, order: 1 }
  ]);
  assert(resolveSelectionMode(config) === 'alternate', 'mode');
  let lastId = null;
  let index = -1;
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const pick = pickAnimation(config, { lastId, cursorIndex: index });
    seq.push(pick.id);
    lastId = pick.id;
    index = pick.index;
  }
  assert(seq.join(',') === 'A,B,A,B', `expected A,B,A,B got ${seq}`);
  console.log('PASS A,B,A,B');
}

// --- 1,2,3,1 ---
{
  const config = baseConfig([
    { id: '1', live: true, archived: false, order: 10 },
    { id: '2', live: true, archived: false, order: 20 },
    { id: '3', live: true, archived: false, order: 30 }
  ]);
  let lastId = null;
  let index = -1;
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const pick = pickAnimation(config, { lastId, cursorIndex: index });
    seq.push(pick.id);
    lastId = pick.id;
    index = pick.index;
  }
  assert(seq.join(',') === '1,2,3,1', `expected 1,2,3,1 got ${seq}`);
  console.log('PASS 1,2,3,1');
}

// --- 1000 synthetic fast ---
{
  const anims = Array.from({ length: 1000 }, (_, i) => ({
    id: `a${String(i).padStart(4, '0')}`,
    live: true,
    archived: false,
    order: i
  }));
  const config = baseConfig(anims);
  const t0 = performance.now();
  let lastId = null;
  let index = -1;
  for (let i = 0; i < 2000; i++) {
    const pick = pickAnimation(config, { lastId, cursorIndex: index });
    assert(pick, 'null pick');
    lastId = pick.id;
    index = pick.index;
  }
  const ms = performance.now() - t0;
  assert(ms < 2000, `1000-anim 2000 picks too slow: ${ms}ms`);
  // After 2000 picks starting at 0: last should be a0999 (index 999), next cycle wraps
  assert(lastId === 'a0999', `expected a0999 got ${lastId}`);
  console.log(`PASS 1000 synthetic (${ms.toFixed(1)}ms)`);
}

// --- mid-cycle add/remove continues after lastId ---
{
  const config = baseConfig([
    { id: 'A', live: true, archived: false, order: 0 },
    { id: 'B', live: true, archived: false, order: 1 },
    { id: 'C', live: true, archived: false, order: 2 }
  ]);
  let pick = pickAnimation(config, { lastId: null, cursorIndex: -1 }); // A
  assert(pick.id === 'A', 'start A');
  pick = pickAnimation(config, { lastId: 'A', cursorIndex: 0 }); // B
  assert(pick.id === 'B', 'then B');
  // Remove B, add D after C
  config.animations = [
    { id: 'A', live: true, archived: false, order: 0 },
    { id: 'C', live: true, archived: false, order: 2 },
    { id: 'D', live: true, archived: false, order: 3 }
  ];
  // last played was B (gone) — continue after cursorIndex 1 → next slot after former B position
  // With B gone, ordered = A,C,D. cursorIndex was 1. next = (1+1)%3 = 2 → D
  // Spec: continue after last-played id in current order — B not found → use cursorIndex
  pick = pickAnimation(config, { lastId: 'B', cursorIndex: 1 });
  assert(pick.id === 'D', `after remove B expected D got ${pick.id}`);
  // Add E at start; lastId D → next should be A (wrap) then... wait order: E( -1), A, C, D
  config.animations.push({ id: 'E', live: true, archived: false, order: -1 });
  pick = pickAnimation(config, { lastId: 'D', cursorIndex: pick.index });
  assert(pick.id === 'E', `after add E, next after D should wrap to E got ${pick.id}`);
  console.log('PASS mid-cycle add/remove');
}

// --- live mode switch ---
{
  const config = baseConfig([
    { id: 'ghost', live: true, archived: false, order: 0, weight: 1 },
    { id: 'cowboy', live: true, archived: false, order: 1, weight: 99 }
  ]);
  const a1 = pickAnimation(config, { lastId: null });
  assert(a1.id === 'ghost' && a1.mode === 'alternate', 'alternate first');
  config.settings.selectionMode = 'weighted';
  // weighted with rng that always picks high end → cowboy likely; just check mode
  const w = pickAnimation(config, { rng: () => 0.99 });
  assert(w.mode === 'weighted', 'switched to weighted');
  console.log('PASS live mode switch');
}

// --- skip non-live ---
{
  const config = baseConfig([
    { id: 'A', live: true, archived: false, order: 0 },
    { id: 'B', live: false, archived: false, order: 1 },
    { id: 'C', live: true, archived: false, order: 2 }
  ]);
  const seq = [];
  let lastId = null, index = -1;
  for (let i = 0; i < 4; i++) {
    const p = pickAnimation(config, { lastId, cursorIndex: index });
    seq.push(p.id);
    lastId = p.id; index = p.index;
  }
  assert(seq.join(',') === 'A,C,A,C', `skip non-live got ${seq}`);
  console.log('PASS skip non-live');
}

console.log('PASS loot-table-alternate');
