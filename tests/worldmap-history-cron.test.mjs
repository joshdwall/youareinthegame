import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshHistory } from '../workers/worldmap-history-cron.mjs';
import { HISTORY_KEY } from '../runtime/worldmap/history-contract.js';

const scheduledTime = Date.parse('2026-11-10T12:23:00Z');

test('publishes a validated snapshot, skips stale runs, and preserves data on analytics failure', async t => {
  let snapshot;
  let writes = 0;
  let fail = false;
  const events = [];
  const json = value => Response.json(value);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/graphql')) {
      if (fail) return new Response(null, { status: 503 });
      const { query } = JSON.parse(options.body);
      if (query.includes('settings')) return json({ data: { viewer: { zones: [{ settings: {
        httpRequestsAdaptiveGroups: { enabled: true, maxDuration: 86400, notOlderThan: 86400, maxPageSize: 20 }
      } }] } } });
      const dimensions = { date: '2026-11-10', clientCountryName: 'US' };
      return json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ dimensions, sum: { visits: 3 } }] }] } } });
    }
    assert.ok(url.endsWith('/_actions'));
    if (options.method === 'POST') {
      events.push(...JSON.parse(options.body).events);
      return json({ ok: true });
    }
    return json({ capabilities: { idempotent: true, batch: true, trackingOnly: true, snapshot: true, revisionedSnapshots: true } });
  });
  const env = {
    SYNC_ENVIRONMENT: 'shadow',
    REPOSITORY_VISIBILITY: 'public',
    HISTORY_KV: {
      async get(key) { assert.equal(key, HISTORY_KEY); return snapshot; },
      async put(key, value) { assert.equal(key, HISTORY_KEY); snapshot = JSON.parse(value); writes++; }
    }
  };
  await refreshHistory(scheduledTime, env);
  assert.equal(snapshot.fetchedAt, new Date(scheduledTime).toISOString());
  assert.equal(snapshot.dailyTotals[0].count, 3);
  assert.ok(events.some(event => event.op === 'worldmap.history.analytics.request' && event.actual === 3));
  await refreshHistory(scheduledTime - 3600000, env);
  assert.equal(writes, 1);
  fail = true;
  await assert.rejects(refreshHistory(scheduledTime + 3600000, env), /HTTP 503/);
  assert.equal(writes, 1);
});
