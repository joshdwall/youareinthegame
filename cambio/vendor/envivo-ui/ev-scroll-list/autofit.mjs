/**
 * ev-scroll-list column auto-fit (SL-26 / SL-27).
 * Measure one-line content, keep short fields at that width, give leftover to flex
 * columns, ellipsis only after flex columns cannot shrink further.
 */
import { SCROLL_LIST_DEFAULTS } from './defaults.mjs';

const CONTENT_KEYS =
  /^(n|id|#|status|step|col|type|req|active|category|kind|pillar|role|trigger|packId|domain|ownerRole|e3|e5|cfr|reg)$/i;

/**
 * @param {{ fit?: string, className?: string, key?: string }} col
 * @returns {'content'|'flex'}
 */
export function inferColumnFit(col) {
  if (col?.fit === 'flex' || col?.fit === 'content') return col.fit;
  const cls = String(col?.className || '');
  if (cls.includes('ev-sl-col--flex')) return 'flex';
  if (cls.includes('ev-sl-col--tight') || cls.includes('ev-sl-col--cfr') || cls.includes('text-end')) {
    return 'content';
  }
  if (CONTENT_KEYS.test(String(col?.key || ''))) return 'content';
  if (String(col?.key || '') === 'actions') return 'content';
  return 'flex';
}

function parseCssLen(v, fontPx) {
  const s = String(v || '').trim();
  if (!s) return 0;
  if (s.endsWith('px')) return parseFloat(s) || 0;
  if (s.endsWith('rem')) return (parseFloat(s) || 0) * fontPx;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function minPxFor(col, fontPx) {
  if (col?.minWidth) return parseCssLen(col.minWidth, fontPx);
  return inferColumnFit(col) === 'content'
    ? Math.round(fontPx * SCROLL_LIST_DEFAULTS.contentMinRem)
    : Math.round(fontPx * SCROLL_LIST_DEFAULTS.flexMinRem);
}

function shrinkTowardMins(assigned, mins, idxs, deficit) {
  let left = deficit;
  let guard = 0;
  while (left > 0.5 && guard++ < 24) {
    const room = idxs.map((i) => Math.max(0, assigned[i] - mins[i]));
    const totalRoom = room.reduce((a, b) => a + b, 0);
    if (totalRoom <= 0) break;
    const take = Math.min(left, totalRoom);
    idxs.forEach((i, k) => {
      assigned[i] -= (room[k] / totalRoom) * take;
    });
    left -= take;
  }
  return left;
}

function markTruncation(table) {
  table.querySelectorAll('tbody td, thead th').forEach((cell) => {
    if (cell.colSpan > 1) return;
    const clipped = cell.scrollWidth > cell.clientWidth + 1;
    if (clipped) {
      const t = String(cell.innerText || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t) cell.title = t;
    } else if (cell.hasAttribute('title') && !cell.hasAttribute('data-keep-title')) {
      cell.removeAttribute('title');
    }
  });
}

/**
 * @param {HTMLTableElement} table
 * @param {HTMLElement|null} wrap
 * @param {object[]} columns
 */
export function fitScrollListTable(table, wrap, columns = []) {
  if (!table || typeof table.querySelector !== 'function') return;
  if (SCROLL_LIST_DEFAULTS.autoFit === false) return;
  if (table.querySelector('.ev-skel-row')) return;
  const ths = table.querySelectorAll('thead tr:first-child th');
  const n = ths.length;
  if (!n) return;

  const fontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const host = wrap || table.parentElement;
  const available = Math.max(0, Math.floor(host?.clientWidth || 0));
  if (!available) return;

  const prevOx = host?.style?.overflowX;
  if (host?.style) host.style.overflowX = 'visible';
  table.classList.add('ev-sl-measuring');
  table.style.tableLayout = 'auto';
  table.style.width = 'max-content';
  table.style.maxWidth = 'none';
  let cg = table.querySelector('colgroup');
  if (cg) cg.innerHTML = Array.from({ length: n }, () => '<col />').join('');

  const preferred = Array.from(ths, (th, i) => {
    const col = columns[i] || {};
    const measured = Math.ceil(th.getBoundingClientRect().width);
    return Math.max(measured, minPxFor(col, fontPx));
  });

  table.classList.remove('ev-sl-measuring');
  if (host?.style) host.style.overflowX = prevOx ?? '';

  const fits = columns.map((c) => inferColumnFit(c));
  const mins = columns.map((c) => minPxFor(c, fontPx));
  const assigned = preferred.slice();
  let sum = assigned.reduce((a, b) => a + b, 0);
  const flexIdx = fits.map((f, i) => (f === 'flex' ? i : -1)).filter((i) => i >= 0);
  const allIdx = assigned.map((_, i) => i);

  if (sum < available) {
    const extra = available - sum;
    const targets = flexIdx.length ? flexIdx : allIdx;
    const share = extra / targets.length;
    targets.forEach((i) => {
      assigned[i] += share;
    });
  } else if (sum > available) {
    let deficit = sum - available;
    deficit = shrinkTowardMins(assigned, mins, flexIdx.length ? flexIdx : allIdx, deficit);
    if (deficit > 0.5) shrinkTowardMins(assigned, mins, allIdx, deficit);
  }

  const px = assigned.map((w) => Math.max(1, Math.floor(w)));
  const drift = available - px.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    const lastFlex = [...px.keys()].reverse().find((i) => fits[i] === 'flex') ?? px.length - 1;
    px[lastFlex] = Math.max(1, px[lastFlex] + drift);
  }

  if (!cg) {
    cg = document.createElement('colgroup');
    table.insertBefore(cg, table.firstChild);
  }
  cg.innerHTML = px.map((w) => `<col style="width:${w}px" />`).join('');
  table.style.tableLayout = 'fixed';
  table.style.width = '100%';
  table.style.maxWidth = '100%';
  markTruncation(table);
}

/**
 * Refit on paint and when the scroll well resizes.
 * @param {HTMLTableElement} table
 * @param {HTMLElement|null} wrap
 * @param {object[]} columns
 */
export function bindScrollListAutoFit(table, wrap, columns) {
  const run = () => fitScrollListTable(table, wrap, columns);
  run();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  if (!wrap || wrap._evSlFitRo) return;
  let t = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = window.setTimeout(run, 40);
  });
  ro.observe(wrap);
  wrap._evSlFitRo = ro;
}

export default { inferColumnFit, fitScrollListTable, bindScrollListAutoFit };
