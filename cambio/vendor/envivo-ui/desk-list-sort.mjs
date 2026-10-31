/**
 * First-party desk-list sort (OD contract parity — no pf-* / site-kit import).
 * Mirrors site-kit desk-sort behavior for enVivo Bootstrap lists.
 */

export const EV_DESK_STATUS_RANK = {
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

function isEmpty(v) {
  return v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
}

/**
 * @param {{ sortType?: string, sortable?: boolean, key?: string, label?: string }} col
 */
export function resolveSortType(col) {
  if (!col || !col.key) return 'none';
  if (col.sortType === 'none' || col.sortable === false) return 'none';
  if (col.sortType === 'number' || col.sortType === 'status' || col.sortType === 'string') {
    return col.sortType;
  }
  if (col.label === '' || col.label == null) return 'none';
  return 'string';
}

export function sortValue(item, col) {
  try {
    if (typeof col.sortValue === 'function') return col.sortValue(item);
    if (!col.key || !item || typeof item !== 'object') return undefined;
    return item[col.key];
  } catch {
    return undefined;
  }
}

export function compareSortValues(a, b, type, dir, statusRank = EV_DESK_STATUS_RANK) {
  try {
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
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
      const ra = statusRank[String(a).toLowerCase()] ?? statusRank[String(a)] ?? 1.5;
      const rb = statusRank[String(b).toLowerCase()] ?? statusRank[String(b)] ?? 1.5;
      return (ra - rb) * dir;
    }

    return (
      String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true }) * dir
    );
  } catch {
    return 0;
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {{ columns: object[], sortKey: string|null, sortDir: 1|-1 }} opts
 */
export function sortEvDeskItems(items, opts) {
  try {
    const { columns, sortKey, sortDir } = opts;
    if (!sortKey || !Array.isArray(items) || !items.length) return items.slice();
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return items.slice();
    const type = resolveSortType(col);
    if (type === 'none') return items.slice();
    const rank = col.statusRank || EV_DESK_STATUS_RANK;
    const dir = sortDir === -1 ? -1 : 1;
    return items.slice().sort((ia, ib) =>
      compareSortValues(sortValue(ia, col), sortValue(ib, col), type, dir, rank)
    );
  } catch {
    return Array.isArray(items) ? items.slice() : [];
  }
}

export function defaultSortKey(columns) {
  for (const c of columns || []) {
    if (resolveSortType(c) !== 'none') return c.key;
  }
  return null;
}
