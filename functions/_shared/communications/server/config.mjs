/**
 * communications.v1 config helpers (shared/communications). Pure functions, no I/O.
 * One config per site (schema communications.v1.schema.json). Answers never change (Josh 2026-11-13): the first answer
 * per voter is kept.
 */
const ID = /^[a-z0-9][a-z0-9-]*$/;
const IDENT = /^[a-z_][a-z0-9_]*$/i;

export const DEFAULTS = Object.freeze({ basePath: '/api/comm', cookie: 'comm_voter', maxAgeDays: 365 });

/** Returns a list of problems (empty = valid). */
export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return ['config missing'];
  if (cfg.schema !== 'communications.v1') errors.push('schema must be communications.v1');
  if (!ID.test(cfg.siteId || '')) errors.push('siteId missing or invalid');
  const st = cfg.storage;
  if (st) {
    if (st.adapter !== 'd1') errors.push('storage.adapter must be d1');
    if (!IDENT.test(st.table || '')) errors.push('storage.table invalid');
    for (const [k, v] of Object.entries(st.columns || {})) if (!IDENT.test(v)) errors.push(`storage.columns.${k} invalid`);
    for (const k of ['voter', 'option', 'at']) if (!st.columns?.[k]) errors.push(`storage.columns.${k} required`);
  }
  const seen = new Set();
  for (const p of cfg.polls || []) {
    if (!ID.test(p.id || '')) errors.push(`poll id invalid: ${p.id}`);
    if (seen.has(p.id)) errors.push(`duplicate poll ${p.id}`);
    seen.add(p.id);
    const opts = new Set();
    for (const o of p.options || []) {
      if (!ID.test(o.id || '')) errors.push(`${p.id}: option id invalid: ${o.id}`);
      if (opts.has(o.id)) errors.push(`${p.id}: duplicate option ${o.id}`);
      opts.add(o.id);
      if (!o.label) errors.push(`${p.id}: option ${o.id} needs a label`);
    }
    if (opts.size < 2) errors.push(`${p.id}: needs at least 2 options`);
  }
  return errors;
}

export const findPoll = (cfg, pollId) => (cfg?.polls || []).find((p) => p.id === pollId) || null;
export const activeOptions = (poll) => (poll?.options || []).filter((o) => o.active !== false);

/** Option id for a submitted value: matches an active option id, label or alias (case-insensitive). */
export function optionFor(poll, value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  for (const o of activeOptions(poll)) {
    if (o.id === v || String(o.label).toLowerCase() === v || (o.aliases || []).some((a) => String(a).toLowerCase() === v)) return o.id;
  }
  return null;
}

/** What a browser may see about a poll (no storage details, no aliases). */
export function publicPoll(poll) {
  return {
    id: poll.id,
    title: poll.title,
    question: poll.question,
    status: poll.status || 'open',
    thanks: poll.thanks || 'Thanks for answering!',
    publicResults: !!poll.publicResults,
    options: activeOptions(poll).map((o) => ({ id: o.id, label: o.label, color: o.color || '' }))
  };
}

export const voterSettings = (cfg) => ({ cookie: cfg?.voter?.cookie || DEFAULTS.cookie, maxAgeDays: cfg?.voter?.maxAgeDays || DEFAULTS.maxAgeDays });
