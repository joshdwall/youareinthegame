// Legacy alias (kept for COMPA's Poll Answers source and old pages): /api/discovery -> the communications module poll
// "how-did-you-find". GET ?totals=1 -> { ok, totals } · GET -> { ok, answer } (+ voter cookie) · POST { answer } -> { ok, answer }.
import { pollsApi, DISCOVERY_POLL } from '../_shared/comm-site.mjs';

export async function onRequestGet({ request, env }) {
  const totals = new URL(request.url).searchParams.get('totals') === '1';
  const res = await pollsApi(env).handle(request, { pollId: DISCOVERY_POLL, action: totals ? 'totals' : '' });
  const body = await res.json();
  const out = !body.ok ? { ok: false } : totals ? { ok: true, totals: body.totals } : { ok: true, answer: body.answer ?? null };
  const headers = { 'cache-control': 'no-store' };
  if (res.headers.get('set-cookie')) headers['set-cookie'] = res.headers.get('set-cookie');
  return Response.json(out, { status: res.status, headers });
}

export async function onRequestPost({ request, env }) {
  return pollsApi(env).handle(request, { pollId: DISCOVERY_POLL, action: 'vote' });
}
