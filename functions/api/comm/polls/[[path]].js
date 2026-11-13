// /api/comm/polls/:pollId[/vote|/totals|/responses] -> site-hub communications module (functions/_shared/comm-site.mjs).
import { pollsApi } from '../../../_shared/comm-site.mjs';

export async function onRequest({ request, env }) {
  const api = pollsApi(env);
  const route = api.match(new URL(request.url).pathname);
  if (!route) return Response.json({ ok: false, error: 'Not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  return api.handle(request, route);
}
