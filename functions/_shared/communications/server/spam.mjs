/**
 * Free spam guards shared by messages and polls (no IPs stored): HMAC of the IP as a rate-limit key, and a per-isolate
 * per-minute limiter. Extracted from blackpotterpod-publicsite src/contact.mjs.
 */
const enc = new TextEncoder();
const RECENT = new Map();

export async function ipKey(ip, secret, purpose = 'comm') {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || `${purpose}-key`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${purpose}:${ip}`)));
  return [...sig.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function minuteLimited(k, max, now = Date.now()) {
  const [n, t] = RECENT.get(k) || [0, now];
  if (now - t > 60_000) {
    RECENT.set(k, [1, now]);
    return false;
  }
  RECENT.set(k, [n + 1, t]);
  if (RECENT.size > 5000) RECENT.clear();
  return n + 1 > max;
}

/** Constant-time string compare (bearer tokens). */
export function safeEqual(a, b) {
  const x = enc.encode(String(a || ''));
  const y = enc.encode(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
