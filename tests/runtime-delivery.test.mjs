import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as assetsGet } from '../functions/api/assets/[[key]].js';
import { onRequestGet as animationsGet } from '../functions/api/animations.js';
import { onRequestPost as worldmapPost } from '../functions/api/worldmap.js';
import { worldmapDatabase } from './helpers/worldmap-db.mjs';

function memoryCache() {
  const rows = new Map();
  return {
    match: async (key) => rows.get(String(key.url || key))?.clone(),
    put: async (key, value) => {
      rows.set(String(key.url || key), value.clone());
    }
  };
}

test('hash-keyed costume assets are immutable-cached and skip quota on HIT', async () => {
  const previous = globalThis.caches;
  globalThis.caches = { default: memoryCache() };
  let classBWrites = 0;
  let r2Gets = 0;
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const key = 'animations/costumes/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
  const env = {
    YAITG_ASSETS_R2: {
      get: async () => {
        r2Gets += 1;
        return {
          body: bytes,
          httpEtag: '"abc"',
          writeHttpMetadata(headers) {
            headers.set('content-type', 'image/png');
          }
        };
      }
    },
    YAITG_SESSION_KV: {
      get: async () => ({ month: '2099-01', storageBytes: 0, classA: 0, classB: 0 }),
      put: async (_k, raw) => {
        classBWrites += 1;
        const row = JSON.parse(raw);
        assert.equal(row.classB, 1);
      }
    }
  };
  try {
    const req = (hdrs = {}) =>
      new Request('https://youareinthegame.com/api/assets/' + key, { headers: hdrs });
    const first = await assetsGet({ env, params: { key: key.split('/') }, request: req() });
    assert.equal(first.status, 200);
    assert.match(first.headers.get('cache-control'), /immutable/);
    assert.equal(first.headers.get('x-yaitg-asset-cache'), 'MISS');
    assert.equal(r2Gets, 1);
    assert.equal(classBWrites, 1);

    const second = await assetsGet({ env, params: { key: key.split('/') }, request: req() });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-yaitg-asset-cache'), 'HIT');
    assert.equal(r2Gets, 1);
    assert.equal(classBWrites, 1);

    const notModified = await assetsGet({
      env,
      params: { key: key.split('/') },
      request: req({ 'if-none-match': '"abc"' })
    });
    assert.equal(notModified.status, 304);
  } finally {
    globalThis.caches = previous;
  }
});

test('animations API returns ETag and honors If-None-Match', async () => {
  const env = {
    YAITG_SESSION_KV: {
      get: async () => null
    }
  };
  const first = await animationsGet({
    env,
    request: new Request('https://youareinthegame.com/api/animations')
  });
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.match(etag, /^"anim-[a-f0-9]{32}"$/);
  const body = await first.json();
  assert.equal(body.ok, true);

  const second = await animationsGet({
    env,
    request: new Request('https://youareinthegame.com/api/animations', {
      headers: { 'if-none-match': etag }
    })
  });
  assert.equal(second.status, 304);
  assert.equal(second.headers.get('etag'), etag);
});

test('worldmap visit beacon records once via POST without requiring HTML rewrite', async () => {
  const { db } = worldmapDatabase();
  const env = {
    YAITG_WORLDMAP_DB: db,
    YAITG_SESSION_SECRET: 'test-only-independent-worldmap-secret'
  };
  const make = (cookie = '') => {
    const r = new Request('https://youareinthegame.com/api/worldmap?visit=1', {
      method: 'POST',
      headers: {
        cookie,
        origin: 'https://youareinthegame.com',
        'user-agent': 'A real browser'
      }
    });
    Object.defineProperty(r, 'cf', {
      value: { latitude: '40.71', longitude: '-74.01', country: 'US' }
    });
    return r;
  };
  const first = await worldmapPost({ env, request: make() });
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.equal(data.ok, true);
  assert.equal(data.recorded, true);
  assert.match(first.headers.get('set-cookie') || '', /yaitg_worldmap=/);

  const cookie = (first.headers.get('set-cookie') || '').split(';')[0];
  const second = await worldmapPost({ env, request: make(cookie) });
  assert.equal((await second.json()).recorded, false);
});
