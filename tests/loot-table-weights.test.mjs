/**
 * Weighted loot: cowboy 3 / ghost 1 → ~75/25 over 400 picks (±5%).
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const { pickAnimation, livePercents, effectiveWeight } = await import(
  pathToFileURL(path.join(root, 'runtime/loot/LootTable.js')).href
);

const config = {
  tiers: {
    common: { label: 'Common', weight: 100 },
    uncommon: { label: 'Uncommon', weight: 40 },
    rare: { label: 'Rare', weight: 10 },
    legendary: { label: 'Legendary', weight: 1 }
  },
  flags: { noRepeatTwice: false },
  seasons: [],
  animations: [
    { id: 'ghost', live: true, archived: false, weight: 1, tier: 'legendary', multiplier: 1 },
    { id: 'cowboy', live: true, archived: false, weight: 3, tier: 'legendary', multiplier: 3 }
  ]
};

const N = 400;
const counts = { ghost: 0, cowboy: 0 };
// Deterministic LCG so CI is stable but still samples the distribution
let seed = 0xC0FFEE;
const rng = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

for (let i = 0; i < N; i++) {
  const pick = pickAnimation(config, { rng });
  if (!pick) throw new Error('null pick');
  counts[pick.id] = (counts[pick.id] || 0) + 1;
}

const cowPct = (counts.cowboy / N) * 100;
const ghostPct = (counts.ghost / N) * 100;
const pcts = livePercents(config);

console.log(JSON.stringify({ N, counts, cowPct, ghostPct, expectedPercents: pcts }, null, 2));

if (Math.abs(pcts.cowboy - 75) > 0.01 || Math.abs(pcts.ghost - 25) > 0.01) {
  throw new Error(`livePercents not 75/25: ${JSON.stringify(pcts)}`);
}
if (cowPct < 70 || cowPct > 80) {
  throw new Error(`cowboy ${cowPct.toFixed(1)}% outside 75±5`);
}
if (ghostPct < 20 || ghostPct > 30) {
  throw new Error(`ghost ${ghostPct.toFixed(1)}% outside 25±5`);
}
if (effectiveWeight(config.animations[1], config.tiers) !== 3) {
  throw new Error('cowboy effectiveWeight expected 3');
}
console.log('PASS loot-table-weights');
