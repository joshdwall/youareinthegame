/**
 * Weighted animation loot table.
 * chance(i) = weight(i) / sum(eligible weights)
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
 * MVP: seasons array may be empty → no boosts / no extra eligibility filters.
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
  // yearAgnostic MM-DD windows; optional full ISO start/end
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
  // wraps year
  return cur >= a || cur <= b;
}

/**
 * Build eligible list with effective weights (after season boosts).
 * @param {object} config
 * @param {{ now?: Date, lastId?: string|null, includeArchived?: boolean }} [opts]
 */
export function eligibleWeighted(config, opts = {}) {
  const now = opts.now || new Date();
  const tiers = config?.tiers || {};
  const flags = config?.flags || {};
  const anims = Array.isArray(config?.animations) ? config.animations : [];
  const seasons = resolveActiveSeasons(config, now);

  let list = anims.filter((a) => a && a.live && (opts.includeArchived || !a.archived));

  // If any active season lists animationIds, restrict to union of those (+ always allow if seasons empty)
  const seasonIds = new Set();
  for (const s of seasons) {
    if (Array.isArray(s.animationIds) && s.animationIds.length) {
      for (const id of s.animationIds) seasonIds.add(id);
    }
  }
  if (seasonIds.size > 0) {
    list = list.filter((a) => seasonIds.has(a.id));
  }

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

/**
 * Weighted pick.
 * @returns {{ id: string, anim: object, weight: number, chance: number, sum: number } | null}
 */
export function pickAnimation(config, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const rows = eligibleWeighted(config, opts);
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  if (!rows.length || sum <= 0) return null;
  let r = rng() * sum;
  for (const row of rows) {
    r -= row.weight;
    if (r <= 0) {
      return { id: row.anim.id, anim: row.anim, weight: row.weight, chance: row.weight / sum, sum };
    }
  }
  const last = rows[rows.length - 1];
  return { id: last.anim.id, anim: last.anim, weight: last.weight, chance: last.weight / sum, sum };
}

/** Live % map for UI */
export function livePercents(config, opts = {}) {
  const rows = eligibleWeighted(config, opts);
  const sum = rows.reduce((s, r) => s + r.weight, 0) || 1;
  const out = {};
  for (const r of rows) out[r.anim.id] = (r.weight / sum) * 100;
  return out;
}

export default { effectiveWeight, resolveActiveSeasons, eligibleWeighted, pickAnimation, livePercents };
