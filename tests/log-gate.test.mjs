import assert from 'node:assert/strict';

async function withLocation(loc, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const prev = had ? globalThis.location : undefined;
  Object.defineProperty(globalThis, 'location', {
    value: loc,
    configurable: true,
    writable: true
  });
  try {
    return await fn();
  } finally {
    if (had) {
      Object.defineProperty(globalThis, 'location', {
        value: prev,
        configurable: true,
        writable: true
      });
    } else {
      delete globalThis.location;
    }
  }
}

async function loadFresh() {
  const url = new URL('../js/log.js', import.meta.url);
  url.searchParams.set('t', String(Date.now() + Math.random()));
  return import(url.href);
}

await withLocation({ hostname: 'youareinthegame.com', search: '' }, async () => {
  const m = await loadFresh();
  assert.equal(m.refreshDebugEnabled(), false);
  assert.equal(m.isDebugEnabled(), false);
});

await withLocation({ hostname: 'c3f1c223.youareinthegame-web.pages.dev', search: '' }, async () => {
  const m = await loadFresh();
  assert.equal(m.refreshDebugEnabled(), true);
  assert.equal(m.isDebugEnabled(), true);
});

await withLocation({ hostname: 'localhost', search: '' }, async () => {
  const m = await loadFresh();
  assert.equal(m.refreshDebugEnabled(), true);
});

{
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  };
  await withLocation({ hostname: 'youareinthegame.com', search: '?debug=1' }, async () => {
    const m = await loadFresh();
    assert.equal(m.refreshDebugEnabled(), true);
    assert.equal(store.get('yaitg-debug'), '1');
  });
  delete globalThis.sessionStorage;
}

console.log('log-gate.test.mjs: ok');
