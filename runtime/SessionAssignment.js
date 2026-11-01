/**
 * Load or create session assignment — server Worker when enabled, else sessionStorage fallback.
 */
import { log, info, debug, warn, error } from '../js/log.js';
import {
  weightedPickFromPool,
  rollNewAssignment,
  buildOverrideAssignment
} from './shared/session-roll.js';

export { weightedPickFromPool, rollNewAssignment };

/**
 * @param {object} policy
 */
function resolveAssignmentEndpoint(policy) {
  const worker = policy?.workerPhase2 || {};
  if (!worker.enabled) return null;
  const host = window.location.hostname;
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  if (isLocal && worker.localGatewayEndpoint) {
    return worker.localGatewayEndpoint;
  }
  return worker.endpoint || '/api/session-assignment';
}

/**
 * Parse harness / dev URL overrides (client-only fast path when worker disabled).
 */
export function readUrlOverride(policy) {
  if (!policy?.allowUrlOverride) return null;
  const params = new URLSearchParams(window.location.search);
  const characterId = params.get('character') || params.get('characterId');
  const vignetteId = params.get('vignette') || params.get('vignetteId');
  const transitionId = params.get('transition') || params.get('transitionId');
  if (!characterId && !vignetteId && !transitionId) return null;

  const host = window.location.hostname;
  const allowed = policy.urlOverrideHosts || ['127.0.0.1', 'localhost'];
  const staging = policy.urlOverrideStagingHosts || [];
  if (!allowed.includes(host) && !staging.includes(host)) return null;

  const out = {};
  if (characterId) out.characterId = characterId;
  if (vignetteId) out.vignetteId = vignetteId;
  if (transitionId) out.transitionId = transitionId;
  return out;
}

/**
 * @param {string} endpoint
 */
async function fetchServerAssignment(endpoint) {
  const qs = window.location.search || '';
  const url = endpoint.includes('?') ? endpoint : `${endpoint}${qs}`;
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || `session assignment ${res.status}`);
    err.retryAfterSec = data.retryAfterSec;
    throw err;
  }
  return data.assignment;
}

/**
 * Load or create session assignment.
 */
export async function resolveSessionAssignment() {
  const [policy, charactersRegistry, vignettesRegistry] = await Promise.all([
    fetch('./content/session-policy.json').then((r) => r.json()),
    fetch('./content/characters-registry.json').then((r) => r.json()),
    fetch('./content/vignettes-registry.json').then((r) => r.json())
  ]);

  const storageKey = policy.storageKey || 'yaitg_session_v1';
  const endpoint = resolveAssignmentEndpoint(policy);

  if (endpoint) {
    try {
      let assignment = await fetchServerAssignment(endpoint);
      // Prefer live URL override even if cookie/server roll returned (harness Preview)
      const urlOverride = readUrlOverride(policy);
      if (urlOverride) {
        assignment = buildOverrideAssignment(
          policy,
          charactersRegistry,
          vignettesRegistry,
          urlOverride
        );
      }
      return {
        policy,
        charactersRegistry,
        vignettesRegistry,
        assignment: { ...assignment, source: assignment.source || 'server' }
      };
    } catch (err) {
      warn('YAITG server assignment failed, falling back to client session:', err.message);
      if (err.retryAfterSec) {
        const fallback = rollNewAssignment(policy, charactersRegistry, vignettesRegistry);
        return {
          policy,
          charactersRegistry,
          vignettesRegistry,
          assignment: { ...fallback, source: 'client-fallback-rate-limited' }
        };
      }
    }
  }

  const urlOverride = readUrlOverride(policy);
  if (urlOverride) {
    const assignment = buildOverrideAssignment(
      policy,
      charactersRegistry,
      vignettesRegistry,
      urlOverride
    );
    return { policy, charactersRegistry, vignettesRegistry, assignment };
  }

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt && Date.parse(parsed.expiresAt) > Date.now()) {
        return {
          policy,
          charactersRegistry,
          vignettesRegistry,
          assignment: { ...parsed, source: parsed.source || 'session' }
        };
      }
    }
  } catch {
    /* fresh roll */
  }

  const assignment = rollNewAssignment(policy, charactersRegistry, vignettesRegistry);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(assignment));
  } catch {
    /* private mode */
  }

  return { policy, charactersRegistry, vignettesRegistry, assignment };
}
