/**
 * Env-gated site logger.
 * Debug (log/info/debug) when:
 *   - hostname ends with .pages.dev
 *   - hostname is localhost / 127.0.0.1
 *   - URL has ?debug=1 (persisted in sessionStorage as yaitg-debug=1)
 * Production custom domains: only warn/error pass.
 * Easter-egg / curious messages must use raw console.log — not this module.
 */

const DEBUG_STORAGE_KEY = 'yaitg-debug';

function readLocation() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.location) {
      return globalThis.location;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function computeDebugEnabled() {
  const loc = readLocation();
  if (!loc) {
    // Non-browser (Workers/tests without location): no debug noise by default.
    return false;
  }
  let host = '';
  try {
    host = String(loc.hostname || '').toLowerCase();
  } catch (_) {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (host.endsWith('.pages.dev')) return true;

  try {
    const q = new URLSearchParams(loc.search || '');
    if (q.get('debug') === '1') {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(DEBUG_STORAGE_KEY, '1');
        }
      } catch (_) { /* ignore */ }
      return true;
    }
  } catch (_) { /* ignore */ }

  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEBUG_STORAGE_KEY) === '1') {
      return true;
    }
  } catch (_) { /* ignore */ }

  return false;
}

let debugEnabled = computeDebugEnabled();

export function isDebugEnabled() {
  return debugEnabled;
}

export function refreshDebugEnabled() {
  debugEnabled = computeDebugEnabled();
  return debugEnabled;
}

export function log(...args) {
  if (debugEnabled) console.log(...args);
}

export function info(...args) {
  if (debugEnabled) console.info(...args);
}

export function debug(...args) {
  if (debugEnabled) console.debug(...args);
}

/** Always emitted (production + preview). */
export function warn(...args) {
  console.warn(...args);
}

/** Always emitted (production + preview). */
export function error(...args) {
  console.error(...args);
}

const logger = { log, info, debug, warn, error, isDebugEnabled, refreshDebugEnabled };
export default logger;
