/**
 * Session assignment orchestration — Pages Function + local gateway.
 */
import {
  rollNewAssignment,
  buildOverrideAssignment,
  hashIp
} from './session-roll.js';
import {
  openAssignment,
  sealAssignment,
  readSessionCookie,
  sessionCookieHeader
} from './session-cookie.js';
import { checkNewSessionRateLimit } from './session-rate-limit.js';

function jsonResponse(status, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders };
  if (body.retryAfterSec) headers['Retry-After'] = String(body.retryAfterSec);
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * @param {URL} url
 * @param {object} policy
 */
function readUrlOverride(url, policy) {
  if (!policy?.allowUrlOverride) return null;
  const characterId = url.searchParams.get('character') || url.searchParams.get('characterId');
  const vignetteId = url.searchParams.get('vignette') || url.searchParams.get('vignetteId');
  const transitionId = url.searchParams.get('transition') || url.searchParams.get('transitionId');
  if (!characterId && !vignetteId && !transitionId) return null;
  const host = url.hostname;
  const allowed = policy.urlOverrideHosts || ['127.0.0.1', 'localhost'];
  const stagingHosts = policy.urlOverrideStagingHosts || [];
  if (!allowed.includes(host) && !stagingHosts.includes(host)) return null;
  const out = {};
  if (characterId) out.characterId = characterId;
  if (vignetteId) out.vignetteId = vignetteId;
  if (transitionId) out.transitionId = transitionId;
  return out;
}

/**
 * @param {Request} request
 */
async function loadRegistries(request) {
  const base = new URL(request.url);
  const [policy, charactersRegistry, vignettesRegistry] = await Promise.all([
    fetch(new URL('/content/session-policy.json', base)).then((r) => r.json()),
    fetch(new URL('/content/characters-registry.json', base)).then((r) => r.json()),
    fetch(new URL('/content/vignettes-registry.json', base)).then((r) => r.json())
  ]);
  return { policy, charactersRegistry, vignettesRegistry };
}

/**
 * @param {object} opts
 */
export async function processSessionAssignment(opts) {
  const {
    request,
    env = {},
    kv = null,
    cache = null,
    registries = null,
    gateway = 'cloudflare-pages-function'
  } = opts;

  const secret =
    env.YAITG_SESSION_SECRET || env.SESSION_SECRET || 'dev-yaitg-session-secret-change-me';
  const url = new URL(request.url);
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '127.0.0.1';
  const ipHash = hashIp(ip);

  const { policy, charactersRegistry, vignettesRegistry } =
    registries || (await loadRegistries(request));

  const urlOverride = readUrlOverride(url, policy);
  if (urlOverride) {
    const assignment = buildOverrideAssignment(
      policy,
      charactersRegistry,
      vignettesRegistry,
      urlOverride
    );
    return {
      status: 200,
      body: { ok: true, assignment, gateway, source: assignment.source },
      setCookie: null
    };
  }

  const existingToken = readSessionCookie(request);
  if (existingToken) {
    const existing = await openAssignment(existingToken, secret);
    if (existing) {
      return {
        status: 200,
        body: { ok: true, assignment: existing, gateway, source: 'cookie' },
        setCookie: null
      };
    }
  }

  const rate = await checkNewSessionRateLimit(kv, cache, ipHash, env);
  if (!rate.ok) {
    return {
      status: rate.status,
      body: { ok: false, error: rate.error, retryAfterSec: rate.retryAfterSec },
      setCookie: null
    };
  }

  const assignment = rollNewAssignment(policy, charactersRegistry, vignettesRegistry);
  const token = await sealAssignment(assignment, secret);
  const ttlHours = Number(policy.sessionTtlHours ?? 6);
  const maxAgeSec = Math.max(60, Math.floor(ttlHours * 3600));

  return {
    status: 200,
    body: { ok: true, assignment, gateway, source: assignment.source },
    setCookie: sessionCookieHeader(token, maxAgeSec)
  };
}

/**
 * @param {import('@cloudflare/workers-types').EventContext} context
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = env.YAITG_SESSION_KV || null;
  const cache = caches.default;
  const result = await processSessionAssignment({
    request,
    env,
    kv,
    cache,
    gateway: 'cloudflare-pages-function'
  });
  const headers = {};
  if (result.setCookie) headers['Set-Cookie'] = result.setCookie;
  return jsonResponse(result.status, result.body, headers);
}
