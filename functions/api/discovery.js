const COOKIE = 'yaitg_discovery';
const OPTIONS = new Set(['random', 'word-of-mouth', 'search', 'social', 'link']);

function reply(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

async function browserHash(request) {
  const id = request.headers.get('cookie')?.match(/(?:^|;\s*)yaitg_discovery=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!id) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet({ request, env }) {
  const db = env.YAITG_WORLDMAP_DB;
  if (!db) return reply({ ok: false }, 503);
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('totals') === '1') {
      const { results } = await db.prepare('SELECT answer, COUNT(*) AS count FROM discovery_responses GROUP BY answer').all();
      const totals = Object.fromEntries([...OPTIONS].map(answer => [answer, 0]));
      for (const { answer, count } of results) totals[answer] = count;
      return reply({ ok: true, totals });
    }
    const hash = await browserHash(request);
    if (!hash) {
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return reply({ ok: true, answer: null }, 200, {
        'set-cookie': `${COOKIE}=${crypto.randomUUID()}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
      });
    }
    const existing = await db.prepare('SELECT answer FROM discovery_responses WHERE browser_hash = ?').bind(hash).first();
    return reply({ ok: true, answer: existing?.answer ?? null });
  } catch {
    return reply({ ok: false }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ ok: false }, 403);
  const db = env.YAITG_WORLDMAP_DB;
  if (!db) return reply({ ok: false }, 503);
  try {
    const { answer } = await request.json().catch(() => ({}));
    if (!OPTIONS.has(answer)) return reply({ ok: false }, 400);
    const hash = await browserHash(request);
    if (!hash) return reply({ ok: false, error: 'Cookies are required to record a response.' }, 409);
    await db.prepare('INSERT INTO discovery_responses (browser_hash, answer) VALUES (?, ?) ON CONFLICT(browser_hash) DO NOTHING')
      .bind(hash, answer).run();
    const saved = await db.prepare('SELECT answer FROM discovery_responses WHERE browser_hash = ?').bind(hash).first();
    return reply({ ok: true, answer: saved.answer });
  } catch {
    return reply({ ok: false }, 503);
  }
}
