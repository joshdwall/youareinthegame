/**
 * Desk list column sort helpers (site-kit SSOT).
 * Fail-safe: comparator errors → treat as equal; never throw through render.
 */

/** @typedef {'string'|'number'|'status'|'none'} DeskSortType */

/** Default ranks for status-like values (lower = sorts first on asc). */
export const DESK_DEFAULT_STATUS_RANK = {
  ok: 0,
  present: 0,
  check: 0,
  vault: 0,
  gray: 1,
  missing: 2,
  registry: 2,
  error: 3,
  fail: 3,
  none: 4
};

/**
 * @param {import('./desk-table.mjs').DeskTableColumn} col
 * @returns {DeskSortType}
 */
export function resolveDeskSortType(col) {
  if (!col || !col.key) return 'none';
  if (col.sortType === 'none' || col.sortable === false) return 'none';
  if (col.sortType === 'number' || col.sortType === 'status' || col.sortType === 'string') {
    return col.sortType;
  }
  // Default: string when key present and label non-empty
  if (col.label === '' || col.label == null) return 'none';
  return 'string';
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isEmptySortValue(v) {
  return v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
}

/**
 * @param {object} item
 * @param {import('./desk-table.mjs').DeskTableColumn} col
 * @returns {unknown}
 */
export function deskSortValue(item, col) {
  try {
    if (typeof col.sortValue === 'function') return col.sortValue(item);
    const key = col.key;
    if (!key || !item || typeof item !== 'object') return undefined;
    return /** @type {Record<string, unknown>} */ (item)[key];
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {DeskSortType} type
 * @param {1|-1} dir
 * @param {Record<string, number>} [statusRank]
 * @returns {number}
 */
export function compareDeskSortValues(a, b, type, dir, statusRank = DESK_DEFAULT_STATUS_RANK) {
  try {
    const aEmpty = isEmptySortValue(a);
    const bEmpty = isEmptySortValue(b);
    if (aEmpty && bEmpty) return 0;
    // Empty last on asc, first on desc
    if (aEmpty) return dir === 1 ? 1 : -1;
    if (bEmpty) return dir === 1 ? -1 : 1;

    if (type === 'number') {
      const na = Number(a);
      const nb = Number(b);
      const aBad = !Number.isFinite(na);
      const bBad = !Number.isFinite(nb);
      if (aBad && bBad) return 0;
      if (aBad) return dir === 1 ? 1 : -1;
      if (bBad) return dir === 1 ? -1 : 1;
      return (na - nb) * dir;
    }

    if (type === 'status') {
      const ra =
        statusRank[String(a).toLowerCase()] ??
        statusRank[String(a)] ??
        1.5;
      const rb =
        statusRank[String(b).toLowerCase()] ??
        statusRank[String(b)] ??
        1.5;
      return (ra - rb) * dir;
    }

    // string (default)
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true }) * dir;
  } catch {
    return 0;
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {{
 *   columns: import('./desk-table.mjs').DeskTableColumn[],
 *   sortKey: string|null,
 *   sortDir: 1|-1
 * }} opts
 * @returns {T[]}
 */
export function sortDeskItems(items, opts) {
  try {
    const { columns, sortKey, sortDir } = opts;
    if (!sortKey || !Array.isArray(items) || !items.length) return items.slice();
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return items.slice();
    const type = resolveDeskSortType(col);
    if (type === 'none') return items.slice();
    const rank = col.statusRank || DESK_DEFAULT_STATUS_RANK;
    const dir = sortDir === -1 ? -1 : 1;
    return items.slice().sort((ia, ib) => {
      const va = deskSortValue(ia, col);
      const vb = deskSortValue(ib, col);
      return compareDeskSortValues(va, vb, type, dir, rank);
    });
  } catch {
    return Array.isArray(items) ? items.slice() : [];
  }
}

/**
 * First sortable column key, or null.
 * @param {import('./desk-table.mjs').DeskTableColumn[]} columns
 * @returns {string|null}
 */
export function defaultDeskSortKey(columns) {
  for (const c of columns || []) {
    if (resolveDeskSortType(c) !== 'none') return c.key;
  }
  return null;
}
