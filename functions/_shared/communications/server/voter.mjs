/**
 * Voter identity for one-answer-per-browser polls: an HttpOnly random cookie id, stored only as its SHA-256 hex.
 * Same scheme youareinthegame.com used since 2026-11-11 (cookie value = UUID, key = sha256(UUID)), so existing votes
 * stay deduped after the move onto this module.
 */
const UUID = '[a-f0-9-]{36}';

export function voterId(request, cookie) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${cookie}=(${UUID})(?:;|$)`));
  return m ? m[1] : null;
}

export async function voterKey(id) {
  if (!id) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newVoterCookie(request, { cookie, maxAgeDays }) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookie}=${crypto.randomUUID()}; Path=/; Max-Age=${maxAgeDays * 24 * 3600}; HttpOnly; SameSite=Lax${secure}`;
}
