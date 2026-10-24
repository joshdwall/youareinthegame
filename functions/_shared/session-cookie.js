/**
 * Signed session cookie for YAITG assignment (HMAC-SHA256).
 */
const COOKIE_NAME = 'yaitg_session';

function base64UrlEncode(bytes) {
  const bin = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let str = '';
  for (const b of bin) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

async function hmacVerify(secret, payload, sig) {
  const expected = await hmacSign(secret, payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * @param {object} assignment
 * @param {string} secret
 */
export async function sealAssignment(assignment, secret) {
  const payload = base64UrlEncode(JSON.stringify(assignment));
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * @param {string} token
 * @param {string} secret
 */
export async function openAssignment(token, secret) {
  if (!token || !secret) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const ok = await hmacVerify(secret, payload, sig);
  if (!ok) return null;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(payload));
    const assignment = JSON.parse(json);
    if (assignment.expiresAt && Date.parse(assignment.expiresAt) <= Date.now()) {
      return null;
    }
    return assignment;
  } catch {
    return null;
  }
}

export function readSessionCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

/**
 * @param {string} token
 * @param {number} maxAgeSec
 */
export function sessionCookieHeader(token, maxAgeSec = 21600) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ];
  return parts.join('; ');
}

export { COOKIE_NAME };
