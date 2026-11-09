import { createSubmitHandler } from './submit.mjs';

export function createPagesMessageHandler({ siteId, origins }) {
  return ({ request, env }) => createSubmitHandler({
    siteId,
    origins,
    async verify(token, incoming) {
      if (!env.MESSAGES_TURNSTILE_SECRET || typeof token !== 'string' || token.length > 2048) return false;
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.MESSAGES_TURNSTILE_SECRET, response: token,
          remoteip: incoming.headers.get('CF-Connecting-IP') || ''
        })
      });
      const data = await response.json();
      return response.ok && data.success && data.hostname === new URL(incoming.url).hostname &&
        data.action === 'communications';
    },
    async ingest(submission) {
      if (!env.COMMUNICATIONS_INGEST_URL || !env.COMMUNICATIONS_INGEST_TOKEN) {
        throw new Error('Communications ingest is unavailable');
      }
      const url = new URL(env.COMMUNICATIONS_INGEST_URL);
      if (url.protocol !== 'https:') throw new Error('Invalid ingest URL');
      const response = await fetch(url, {
        method: 'POST', redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + env.COMMUNICATIONS_INGEST_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submission)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Communications ingest rejected the message');
      return result;
    }
  })(request);
}
