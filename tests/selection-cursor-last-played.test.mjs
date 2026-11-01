/**
 * Alternate cursor must store last *played* id, not upcoming.
 * Reloading while cowboy is queued must still pick cowboy (not skip to ghost).
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Minimal localStorage for Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const mod = await import(
  pathToFileURL(path.join(root, 'runtime/public/thresholdActivation.js')).href + '?t=' + Date.now()
);
const loot = await import(pathToFileURL(path.join(root, 'runtime/loot/LootTable.js')).href);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const {
  readSelectionCursor,
  writeSelectionCursor,
  recordPlayed,
  clearSelectionCursorForTests,
  setLastPlayedForTests
} = mod;

const { pickAnimation } = loot;

function baseConfig() {
  return {
    flags: {},
    settings: { selectionMode: 'alternate' },
    seasons: [],
    tiers: {},
    animations: [
      { id: 'ghost', live: true, archived: false, order: 0, playMode: 'legacy-ghost' },
      { id: 'cowboy', live: true, archived: false, order: 1, playMode: 'composite' }
    ]
  };
}

function pickNext(lastPlayedId, cursorIndex = -1) {
  return pickAnimation(baseConfig(), { lastId: lastPlayedId, cursorIndex });
}

// --- v1 cursor ignored ---
{
  store.clear();
  localStorage.setItem(
    'yaitg.selectionCursor',
    JSON.stringify({ index: 1, lastId: 'cowboy' }) // v1 = upcoming was cowboy
  );
  const c = readSelectionCursor();
  assert(c.lastPlayedId == null && c.lastId == null, 'v1 cursor must be ignored');
  console.log('PASS v1 cursor ignored');
}

// --- recordPlayed writes v2 ---
{
  store.clear();
  clearSelectionCursorForTests();
  recordPlayed('ghost', 0);
  const raw = JSON.parse(localStorage.getItem('yaitg.selectionCursor'));
  assert(raw.v === 2, 'version 2');
  assert(raw.lastPlayedId === 'ghost', 'lastPlayedId ghost');
  assert(raw.lastId === 'ghost', 'lastId alias');
  assert(raw.index === 0, 'index 0');
  console.log('PASS recordPlayed writes v2');
}

// --- reload while cowboy queued keeps cowboy ---
{
  store.clear();
  clearSelectionCursorForTests();
  // Simulates: played ghost, upcoming=cowboy, user reloads before cowboy plays
  recordPlayed('ghost', 0);
  setLastPlayedForTests(null); // memory cleared on reload
  const cursor = readSelectionCursor();
  const pick = pickNext(cursor.lastPlayedId, cursor.index);
  assert(pick.id === 'cowboy', `expected cowboy after reload, got ${pick.id}`);
  // pickUpcoming must NOT write cursor to cowboy-as-lastPlayed
  const after = readSelectionCursor();
  assert(after.lastPlayedId === 'ghost', 'cursor still lastPlayed=ghost until cowboy finishes');
  console.log('PASS reload while cowboy queued → cowboy');
}

// --- full alternate with simulated reloads between rounds ---
{
  store.clear();
  clearSelectionCursorForTests();
  const seq = [];
  for (let round = 0; round < 4; round++) {
    setLastPlayedForTests(null); // reload clears memory
    const cursor = readSelectionCursor();
    const pick = pickNext(cursor.lastPlayedId, cursor.index);
    seq.push(pick.id);
    // activation complete:
    recordPlayed(pick.id, pick.index);
  }
  assert(seq.join(',') === 'ghost,cowboy,ghost,cowboy', `got ${seq}`);
  console.log('PASS alternate with reload between rounds ghost,cowboy,ghost,cowboy');
}

// --- same-session without reload ---
{
  store.clear();
  clearSelectionCursorForTests();
  const seq = [];
  let mem = null;
  for (let round = 0; round < 4; round++) {
    const cursor = readSelectionCursor();
    const lastId = mem || cursor.lastPlayedId;
    const pick = pickNext(lastId, cursor.index);
    seq.push(pick.id);
    recordPlayed(pick.id, pick.index);
    mem = pick.id;
  }
  assert(seq.join(',') === 'ghost,cowboy,ghost,cowboy', `got ${seq}`);
  console.log('PASS same-session alternate ghost,cowboy,ghost,cowboy');
}

// --- writing upcoming as lastId (old bug) would skip cowboy ---
{
  store.clear();
  clearSelectionCursorForTests();
  // first visit picks ghost; OLD bug wrote lastId=ghost as if played
  writeSelectionCursor({ v: 2, lastPlayedId: 'ghost', lastId: 'ghost', index: 0 });
  // without playing, reload — with CORRECT semantics lastPlayed=ghost means next=cowboy
  // OLD bug: wrote upcoming before play, so this was intentional "next after upcoming"
  // Demonstrate that if we wrongly wrote cowboy as lastPlayed when only queued:
  writeSelectionCursor({ v: 2, lastPlayedId: 'cowboy', lastId: 'cowboy', index: 1 });
  const bad = pickNext(readSelectionCursor().lastPlayedId, 1);
  assert(bad.id === 'ghost', 'wrongly marking upcoming as played skips to ghost');
  console.log('PASS documenting skip-when-upcoming-written-as-played');
}

console.log('ALL selection-cursor-last-played tests passed');
