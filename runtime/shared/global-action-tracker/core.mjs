/**
 * Global action tracker — core (desk + Worker safe).
 * Primary clock = unix ms since 1970-01-01 UTC (id + atMs).
 * NEVER pass secret plaintext in meta.
 */

const RING_MAX = 500;
/** @type {object[]} */
const ring = [];
/** @type {Record<string, number>} */
const tallies = Object.create(null);
let seqInMs = 0;
let lastMs = 0;

/**
 * Unique id from Date.now(); same-ms calls get *1000 + seq.
 * @returns {number}
 */
export function nextActionId() {
  const ms = Date.now();
  if (ms === lastMs) {
    seqInMs = (seqInMs + 1) % 1000;
  } else {
    lastMs = ms;
    seqInMs = 0;
  }
  return ms * 1000 + seqInMs;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = String(k).toLowerCase();
    if (/value|secret|token|password|key|clasprc|plaintext|authorization/i.test(key)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (v == null) out[k] = v;
    else out[k] = '[object]';
  }
  return out;
}

/**
 * @param {{
 *   kind: string,
 *   calledBy?: string,
 *   purpose?: string,
 *   source?: string,
 *   actor?: string,
 *   workerId?: string,
 *   connectorId?: string,
 *   module?: string,
 *   page?: string,
 *   surface?: string,
 *   meta?: Record<string, unknown>
 * }} opts
 */
export function recordActionCore(opts = {}) {
  const kind = String(opts.kind || 'unknown').slice(0, 120);
  const calledBy = String(opts.calledBy || opts.source || opts.actor || 'envivo').slice(0, 120);
  const purpose = opts.purpose ? String(opts.purpose).slice(0, 200) : undefined;
  const workerId = opts.workerId ? String(opts.workerId).slice(0, 120) : undefined;
  const connectorId = opts.connectorId ? String(opts.connectorId).slice(0, 120) : undefined;
  const module = opts.module ? String(opts.module).slice(0, 200) : undefined;
  const page = opts.page ? String(opts.page).slice(0, 200) : undefined;
  const surface = opts.surface ? String(opts.surface).slice(0, 80) : undefined;
  const meta = sanitizeMeta(opts.meta);
  const id = nextActionId();
  const atMs = Math.floor(id / 1000);

  tallies[kind] = (tallies[kind] || 0) + 1;
  const row = {
    id,
    atMs,
    kind,
    calledBy,
    purpose,
    workerId,
    connectorId,
    module,
    page,
    surface,
    meta,
    n: tallies[kind]
  };
  ring.push(row);
  while (ring.length > RING_MAX) ring.shift();
  return row;
}

export function getActionSnapshotCore() {
  return {
    ok: true,
    status: 'ring',
    clock: 'unix-ms',
    tallies: { ...tallies },
    recent: ring.slice(-80),
    ringSize: ring.length
  };
}

export function resetActionTrackerForTests() {
  ring.length = 0;
  for (const k of Object.keys(tallies)) delete tallies[k];
  seqInMs = 0;
  lastMs = 0;
}

export { RING_MAX };
