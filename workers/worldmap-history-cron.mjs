import { collectEdgeHistory, collectHistory } from '../scripts/cloudflare-history.mjs';
import { HISTORY_KEY } from '../runtime/worldmap/history-contract.js';
import { WORLDMAP_SETTINGS } from '../runtime/worldmap/settings.js';
import { createActionClient } from './action-client.mjs';

const LEDGER = 'https://envivo-data.joshdwall.workers.dev/enVivo/api/data';
const QUERY_TIMEOUT_MS = 45_000;

export async function refreshHistory(scheduledTime, env) {
  const time = new Date(scheduledTime);
  const deployment = env.SYNC_ENVIRONMENT;
  const visibility = env.REPOSITORY_VISIBILITY;
  if (!['shadow', 'production'].includes(deployment) || !['public', 'private'].includes(visibility)) {
    throw new Error('Invalid history sync configuration');
  }

  let analyticsCalls = 0;
  let writes = 0;
  let syncError;
  try {
    const previous = await env.HISTORY_KV.get(HISTORY_KEY, 'json');
    if (Date.parse(previous?.fetchedAt) < scheduledTime || !Number.isFinite(Date.parse(previous?.fetchedAt))) {
      const gql = async (query, variables) => {
        analyticsCalls++;
        const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + env.ANALYTICS_READ_TOKEN,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(QUERY_TIMEOUT_MS)
        });
        if (!response.ok) throw new Error('Analytics request failed with HTTP ' + response.status);
        const result = await response.json();
        if (result.errors?.length || !result.data) throw new Error('Analytics query failed');
        return result.data;
      };
      const snapshot = WORLDMAP_SETTINGS.historySource === 'edge'
        ? await collectEdgeHistory({ gql, zone: env.CLOUDFLARE_ZONE_ID, now: time })
        : await collectHistory({ gql, account: env.CLOUDFLARE_ACCOUNT_ID, now: time });
      await env.HISTORY_KV.put(HISTORY_KEY, JSON.stringify(snapshot));
      writes = 1;
      console.info('Visitor history refreshed', { deployment, scheduledTime, rows: snapshot.rows.length, analyticsCalls });
    }
  } catch (error) {
    syncError = error;
  }

  const client = createActionClient({ baseUrl: LEDGER, token: env.ACTION_LEDGER_TOKEN });
  const operations = [
    ['unrouted-actions', 'worldmap.history.cron.invoke', 1],
    ['cloudflare-api', 'worldmap.history.analytics.request', analyticsCalls],
    ['cloudflare-analytics', 'worldmap.history.analytics.request', analyticsCalls],
    ['unrouted-actions', 'worldmap.history.cron.kv.write', writes]
  ];
  const events = operations.filter(([, , count]) => count > 0).map(([providerId, op, actual]) => ({
    id: ['yaitg-worldmap-cron', deployment, scheduledTime, providerId, op].join(':'),
    providerId, op, actual, mode: 'snapshot', atMs: scheduledTime, period: 'day',
    actor: 'youareinthegame', repo: 'joshdwall/youareinthegame', visibility,
    workflow: 'cloudflare-worldmap-history-' + deployment, runId: String(scheduledTime),
    reason: JSON.stringify({ capturedAtMs: Date.now(), scheduler: 'cloudflare-cron' })
  }));
  try {
    await client.countBatch(events);
  } catch (error) {
    console.error('Visitor history tracking failed', { deployment, scheduledTime });
    if (!syncError) throw error;
  }
  if (syncError) throw syncError;
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshHistory(controller.scheduledTime, env));
  }
};
