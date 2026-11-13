/**
 * D1 poll-response store (Cloudflare D1 or anything with the D1 prepare/bind/first/all/run API).
 * Table and column names come from config (communications.v1 storage) so an existing table can be adopted as-is
 * (youareinthegame discovery_responses) and new sites get the standard table (ddl()).
 * Answers never change: insert is INSERT … ON CONFLICT DO NOTHING; the stored answer is returned.
 */
const IDENT = /^[a-z_][a-z0-9_]*$/i;
const q = (name) => {
  if (!IDENT.test(name || '')) throw new Error(`bad identifier: ${name}`);
  return name;
};

export const STANDARD_STORAGE = Object.freeze({
  adapter: 'd1',
  table: 'poll_responses',
  columns: { site: 'site_id', poll: 'poll_id', voter: 'voter_key', option: 'option_id', at: 'created_at', source: 'source' }
});

/** CREATE TABLE for the standard layout (new sites). */
export function ddl(storage = STANDARD_STORAGE) {
  const c = storage.columns;
  const keys = [c.site, c.poll, c.voter].filter(Boolean).map(q).join(', ');
  return [
    `CREATE TABLE IF NOT EXISTS ${q(storage.table)} (`,
    [
      c.site && `  ${q(c.site)} TEXT NOT NULL`,
      c.poll && `  ${q(c.poll)} TEXT NOT NULL`,
      `  ${q(c.voter)} TEXT NOT NULL`,
      `  ${q(c.option)} TEXT NOT NULL`,
      c.source && `  ${q(c.source)} TEXT`,
      `  ${q(c.at)} TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `  PRIMARY KEY (${keys})`
    ].filter(Boolean).join(',\n'),
    ');'
  ].join('\n');
}

export function createD1PollStore(db, storage, { siteId } = {}) {
  if (!db) throw new Error('D1 binding missing');
  const c = storage.columns;
  const T = q(storage.table);
  const scope = [];
  if (c.site) scope.push([q(c.site), () => siteId]);
  const pollCol = c.poll ? q(c.poll) : null;
  const where = (pollId) => {
    const parts = scope.map(([col]) => `${col} = ?`);
    const vals = scope.map(([, v]) => v());
    if (pollCol) {
      parts.push(`${pollCol} = ?`);
      vals.push(pollId);
    }
    return { sql: parts.length ? parts.join(' AND ') : '1 = 1', vals };
  };
  return {
    async answerOf(pollId, voter) {
      const w = where(pollId);
      const row = await db.prepare(`SELECT ${q(c.option)} AS option FROM ${T} WHERE ${w.sql} AND ${q(c.voter)} = ?`).bind(...w.vals, voter).first();
      return row?.option ?? null;
    },
    /** Insert the first answer; returns the stored answer (the earlier one if this voter already answered). */
    async insert(pollId, voter, optionId, { source = '' } = {}) {
      const cols = [];
      const vals = [];
      for (const [col, v] of scope) {
        cols.push(col);
        vals.push(v());
      }
      if (pollCol) {
        cols.push(pollCol);
        vals.push(pollId);
      }
      cols.push(q(c.voter), q(c.option));
      vals.push(voter, optionId);
      if (c.source) {
        cols.push(q(c.source));
        vals.push(source || null);
      }
      await db.prepare(`INSERT INTO ${T} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`).bind(...vals).run();
      return this.answerOf(pollId, voter);
    },
    async totals(pollId) {
      const w = where(pollId);
      const { results } = await db.prepare(`SELECT ${q(c.option)} AS option, COUNT(*) AS count FROM ${T} WHERE ${w.sql} GROUP BY ${q(c.option)}`).bind(...w.vals).all();
      return Object.fromEntries((results || []).map((r) => [r.option, Number(r.count) || 0]));
    },
    /** Newest first; voter shown only as an 8-char prefix of its hash. */
    async responses(pollId, { limit = 200 } = {}) {
      const w = where(pollId);
      const src = c.source ? `, ${q(c.source)} AS source` : '';
      const { results } = await db
        .prepare(`SELECT ${q(c.option)} AS option, ${q(c.at)} AS at, substr(${q(c.voter)}, 1, 8) AS voter${src} FROM ${T} WHERE ${w.sql} ORDER BY ${q(c.at)} DESC LIMIT ?`)
        .bind(...w.vals, Math.min(Math.max(Number(limit) || 200, 1), 1000))
        .all();
      return results || [];
    }
  };
}
