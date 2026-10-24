/**
 * Rate limit new session assignments per IP (KV or Cache API fallback).
 */

const DEFAULT_MAX = 12;
const DEFAULT_WINDOW_SEC = 3600;

/**
 * @param {import('@cloudflare/workers-types').KVNamespace|null} kv
 * @param {Cache|null} cache
 * @param {string} ipHash
 * @param {object} env
 */
export async function checkNewSessionRateLimit(kv, cache, ipHash, env = {}) {
  const max = Number(env.YAITG_RATE_MAX || DEFAULT_MAX);
  const windowSec = Number(env.YAITG_RATE_WINDOW_SEC || DEFAULT_WINDOW_SEC);
  const key = `yaitg:rl:${ipHash}`;

  if (kv) {
    const raw = await kv.get(key);
    const count = raw ? Number(raw) : 0;
    if (count >= max) {
      return {
        ok: false,
        status: 429,
        error: 'Too many new character rolls. Try again later.',
        retryAfterSec: windowSec
      };
    }
    await kv.put(key, String(count + 1), { expirationTtl: windowSec });
    return { ok: true };
  }

  if (cache) {
    const cacheKey = new Request(`https://yaitg-internal/rate/${key}`);
    const hit = await cache.match(cacheKey);
    const count = hit ? Number(await hit.text()) : 0;
    if (count >= max) {
      return {
        ok: false,
        status: 429,
        error: 'Too many new character rolls. Try again later.',
        retryAfterSec: windowSec
      };
    }
    await cache.put(
      cacheKey,
      new Response(String(count + 1), {
        headers: { 'Cache-Control': `max-age=${windowSec}` }
      })
    );
    return { ok: true };
  }

  return { ok: true };
}
