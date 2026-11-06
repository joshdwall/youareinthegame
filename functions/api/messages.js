import { createPagesMessageHandler } from '../_shared/messaging/pages.mjs';

export function onRequestPost(context) {
  const configured = context.env.MESSAGES_ALLOWED_ORIGINS || 'https://youareinthegame.com';
  return createPagesMessageHandler({
    siteId: 'youareinthegame',
    origins: configured.split(',').map(origin => origin.trim())
  })(context);
}

export function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const origins = (env.MESSAGES_ALLOWED_ORIGINS || 'https://youareinthegame.com').split(',').map(value => value.trim());
  const siteKey = origins.includes(origin) ? env.MESSAGES_TURNSTILE_SITE_KEY : null;
  return Response.json({ siteKey: siteKey || null }, {
    status: siteKey ? 200 : 503, headers: { 'Cache-Control': 'no-store' }
  });
}
