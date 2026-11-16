// Communications module pin (config/comm-source.json): vendored files match the pinned tree, the site config is valid,
// the worldmap markup matches config, and the legacy /api/discovery alias still answers in the old shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { treeHash } from '../scripts/comm-tree-hash.mjs';
import { renderPollBlocks } from '../scripts/comm-poll-markup.mjs';
import { validateConfig } from '../functions/_shared/communications/server/config.mjs';
import { createPollsApi } from '../functions/_shared/communications/server/polls.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'config', 'comm-source.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'communications.json'), 'utf8'));

test('vendored communications files match the pinned treeHash', () => {
  assert.match(pin.sha, /^[0-9a-f]{40}$/);
  assert.equal(treeHash(root, Object.values(pin.vendor)), pin.treeHash, 'vendored files drifted: re-run node scripts/sync-communications.mjs');
});

test('site config is valid communications.v1 and the source markup equals the generated block', () => {
  assert.deepEqual(validateConfig(config), []);
  const html = fs.readFileSync(path.join(root, 'worldmap', 'index.html'), 'utf8');
  assert.equal(renderPollBlocks(html, config), html, 'worldmap/index.html poll block differs from config (build regenerates it; keep source in sync)');
});

test('D1 table + legacy shapes: totals, answer, vote (first answer kept)', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync(path.join(root, 'migrations', 'worldmap')).filter((f) => /discovery/.test(f)).sort()) sqlite.exec(fs.readFileSync(path.join(root, 'migrations', 'worldmap', f), 'utf8'));
  const d1 = { prepare: (sql) => { let a = []; const s = { bind: (...x) => ((a = x), s), first: async () => sqlite.prepare(sql).get(...a) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...a) }), run: async () => sqlite.prepare(sql).run(...a) }; return s; } };
  const api = createPollsApi({ config, env: { YAITG_WORLDMAP_DB: d1 } });
  const cookie = 'yaitg_discovery=11111111-2222-3333-4444-555555555555';
  const vote = (answer) => api.handle(new Request('https://youareinthegame.com/api/discovery', { method: 'POST', headers: { cookie, origin: 'https://youareinthegame.com' }, body: JSON.stringify({ answer }) }), { pollId: 'how-did-you-find', action: 'vote' });
  assert.deepEqual(await (await vote('search')).json(), { ok: true, answer: 'search' });
  assert.deepEqual(await (await vote('random')).json(), { ok: true, answer: 'search' });
  const t = await (await api.handle(new Request('https://youareinthegame.com/x'), { pollId: 'how-did-you-find', action: 'totals' })).json();
  assert.deepEqual(t.totals, { random: 0, 'word-of-mouth': 0, search: 1, social: 0, link: 0 });
});
