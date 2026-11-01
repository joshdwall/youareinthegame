/**
 * Animation selection: weighted loot OR alternate (round-robin) by settings.selectionMode.
 * chance(i) = weight(i) / sum(eligible weights)  — weighted mode
 * alternate: cycle LIVE eligible by stable order (then id), O(1) next after list build.
 */

/** @param {object} anim @param {Record<string, {weight:number}>} tiers */
export function effectiveWeight(anim, tiers = {}) {
  if (anim && typeof anim.weight === 'number' && Number.isFinite(anim.weight) && anim.weight >= 0) {
    return anim.weight;
  }
  const tw = tiers?.[anim?.tier]?.weight;
  const base = typeof tw === 'number' ? tw : 100;
  const mult = typeof anim?.multiplier === 'number' ? anim.multiplier : 1;
  return Math.max(0, base * mult);
}

/**
 * Resolve which season windows apply for `now`.
 * @param {object} config
 * @param {Date} [now]
 */
export function resolveActiveSeasons(config, now = new Date()) {
  const seasons = Array.isArray(config?.seasons) ? config.seasons : [];
  const active = [];
  for (const s of seasons) {
    if (!s || s.disabled) continue;
    if (seasonContains(s, now)) active.push(s);
  }
  return active;
}

function seasonContains(season, now) {
  if (season.startISO && season.endISO) {
    const t = now.getTime();
    return t >= Date.parse(season.startISO) && t <= Date.parse(season.endISO);
  }
  if (!season.start || !season.end) return false;
  const md = (d) => (d.getMonth() + 1) * 100 + d.getDate();
  const parseMD = (s) => {
    const [m, d] = String(s).split('-').map(Number);
    return m * 100 + d;
  };
  const cur = md(now);
  const a = parseMD(season.start);
  const b = parseMD(season.end);
  if (a <= b) return cur >= a && cur <= b;
  return cur >= a || cur <= b;
}

/** Live (+ optional archived) after season id filters. Shared by weighted + alternate. */
export function eligibleLiveAnims(config, opts = {}) {
  const now = opts.now || new Date();
  const anims = Array.isArray(config?.animations) ? config.animations : [];
  const seasons = resolveActiveSeasons(config, now);

  let list = anims.filter((a) => a && a.live && (opts.includeArchived || !a.archived));

  const seasonIds = new Set();
  for (const s of seasons) {
    if (Array.isArray(s.animationIds) && s.animationIds.length) {
      for (const id of s.animationIds) seasonIds.add(id);
    }
  }
  if (seasonIds.size > 0) {
    list = list.filter((a) => seasonIds.has(a.id));
  }
  return { list, seasons, now };
}

/**
 * Build eligible list with effective weights (after season boosts).
 * @param {object} config
 * @param {{ now?: Date, lastId?: string|null, includeArchived?: boolean }} [opts]
 */
export function eligibleWeighted(config, opts = {}) {
  const tiers = config?.tiers || {};
  const flags = config?.flags || {};
  const { list: base, seasons } = eligibleLiveAnims(config, opts);
  let list = base;

  if (flags.noRepeatTwice && opts.lastId) {
    const filtered = list.filter((a) => a.id !== opts.lastId);
    if (filtered.length) list = filtered;
  }

  return list.map((a) => {
    let w = effectiveWeight(a, tiers);
    for (const s of seasons) {
      const boost = s.weightBoosts?.[a.id];
      if (typeof boost === 'number') w *= boost;
    }
    return { anim: a, weight: w };
  }).filter((x) => x.weight > 0);
}

/** Stable sort key: order asc, then id. Missing order → 0. */
export function orderKey(anim) {
  const o = Number(anim?.order);
  return Number.isFinite(o) ? o : 0;
}

/**
 * Eligible animations sorted for alternate (round-robin).
 * @returns {object[]}
 */
export function eligibleOrdered(config, opts = {}) {
  const { list } = eligibleLiveAnims(config, opts);
  return list.slice().sort((a, b) => {
    const d = orderKey(a) - orderKey(b);
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Round-robin next pick. O(1) after ordered list is built.
 * Cursor: prefer lastId position; if removed, continue after cursorIndex.
 * @returns {{ id: string, anim: object, weight: number, chance: number, sum: number, mode: 'alternate', index: number } | null}
 */
export function pickAlternate(config, opts = {}) {
  const list = eligibleOrdered(config, opts);
  const n = list.length;
  if (!n) return null;

  let found = -1;
  if (opts.lastId != null && opts.lastId !== '') {
    found = list.findIndex((a) => a.id === opts.lastId);
  }
  let next;
  if (found >= 0) {
    next = (found + 1) % n;
  } else if (Number.isFinite(opts.cursorIndex) && opts.cursorIndex >= 0) {
    next = (Math.floor(opts.cursorIndex) + 1) % n;
  } else {
    next = 0;
  }
  const anim = list[next];
  return {
    id: anim.id,
    anim,
    weight: 1,
    chance: 1 / n,
    sum: n,
    mode: 'alternate',
    index: next
  };
}

function pickWeighted(config, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const rows = eligibleWeighted(config, opts);
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  if (!rows.length || sum <= 0) return null;
  let r = rng() * sum;
  for (const row of rows) {
    r -= row.weight;
    if (r <= 0) {
      return {
        id: row.anim.id,
        anim: row.anim,
        weight: row.weight,
        chance: row.weight / sum,
        sum,
        mode: 'weighted'
      };
    }
  }
  const last = rows[rows.length - 1];
  return {
    id: last.anim.id,
    anim: last.anim,
    weight: last.weight,
    chance: last.weight / sum,
    sum,
    mode: 'weighted'
  };
}

export function resolveSelectionMode(config) {
  const m = config?.settings?.selectionMode;
  if (m === 'weighted') return 'weighted';
  return 'alternate';
}

/**
 * Dispatch on settings.selectionMode (default alternate).
 * @returns {{ id: string, anim: object, weight: number, chance: number, sum: number, mode?: string, index?: number } | null}
 */
export function pickAnimation(config, opts = {}) {
  const mode = resolveSelectionMode(config);
  if (mode === 'weighted') return pickWeighted(config, opts);
  return pickAlternate(config, opts);
}

/** Live % map for UI (weighted semantics; alternate shows equal shares). */
export function livePercents(config, opts = {}) {
  if (resolveSelectionMode(config) === 'alternate') {
    const list = eligibleOrdered(config, opts);
    const n = list.length || 1;
    const out = {};
    for (const a of list) out[a.id] = (1 / n) * 100;
    return out;
  }
  const rows = eligibleWeighted(config, opts);
  const sum = rows.reduce((s, r) => s + r.weight, 0) || 1;
  const out = {};
  for (const r of rows) out[r.anim.id] = (r.weight / sum) * 100;
  return out;
}

export default {
  effectiveWeight,
  resolveActiveSeasons,
  eligibleLiveAnims,
  eligibleWeighted,
  eligibleOrdered,
  pickAlternate,
  resolveSelectionMode,
  pickAnimation,
  livePercents,
  orderKey
};
