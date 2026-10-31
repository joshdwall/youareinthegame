/**
 * Compact spreadsheet-style desk table (site-kit SSOT).
 * Always renders header + data rows + empty pad rows (fixed visual row count).
 * Promoted from operator-dashboard/lib/desk-compact-table.mjs (renderer only;
 * route-specific column presets stay in the owning site).
 *
 * Row selection: visual single-select is the default desk behavior
 * (`installDeskTableRowSelect` at boot). Pass `onSelect` via `bindDeskTableRowSelect`
 * when selection drives app state. Opt out with `data-desk-row-select="off"`.
 */
import { escapeHtml } from './esc.mjs';
import { resolveDeskSortType } from './desk-sort.mjs';

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   className?: string,
 *   headerHtml?: string,
 *   sortType?: import('./desk-sort.mjs').DeskSortType,
 *   sortable?: boolean,
 *   sortValue?: (item: object) => unknown,
 *   statusRank?: Record<string, number>
 * }} DeskTableColumn
 */

/**
 * @param {DeskTableColumn[]} columns
 * @param {number} padCount
 */
export function renderDeskPadRows(columns, padCount) {
  if (padCount <= 0) return '';
  const cells = columns
    .map(
      (c) =>
        `<div class="od-fd-cell ${c.className || ''}" role="cell"><span class="od-fd-row-pad" aria-hidden="true">&nbsp;</span></div>`
    )
    .join('');
  return Array.from(
    { length: padCount },
    () => `<div class="od-fd-row od-fd-row--empty" role="row" aria-hidden="true">${cells}</div>`
  ).join('');
}

/**
 * @param {{
 *   columns: DeskTableColumn[],
 *   dataRowsHtml: string,
 *   itemCount: number,
 *   minRows?: number,
 *   tableClass?: string,
 *   ariaLabel?: string,
 *   emptyHint?: string,
 *   sortKey?: string|null,
 *   sortDir?: 1|-1,
 *   sortable?: boolean
 * }} opts
 */
export function renderDeskCompactTable(opts) {
  const {
    columns,
    dataRowsHtml,
    itemCount,
    minRows = 10,
    tableClass = '',
    ariaLabel = 'List',
    emptyHint = '',
    sortKey = null,
    sortDir = 1,
    sortable = true
  } = opts;

  const head = columns
    .map((c) => {
      const cls = c.className || '';
      if (c.headerHtml) {
        return `<span class="od-fd-cell ${cls}" role="columnheader">${c.headerHtml}</span>`;
      }
      const type = sortable ? resolveDeskSortType(c) : 'none';
      if (type === 'none') {
        return `<span class="od-fd-cell ${cls}" role="columnheader">${escapeHtml(c.label)}</span>`;
      }
      const active = sortKey === c.key;
      const ariaSort = active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none';
      const marker = active ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      return (
        `<span class="od-fd-cell ${cls} od-fd-cell--sortable" role="columnheader" aria-sort="${ariaSort}">` +
        `<button type="button" class="od-fd-sort-btn" data-desk-sort-key="${escapeHtml(c.key)}" aria-label="Sort by ${escapeHtml(c.label)}">` +
        `${escapeHtml(c.label)}${marker}` +
        `</button></span>`
      );
    })
    .join('');

  let body = dataRowsHtml;
  let effectiveCount = itemCount;

  if (itemCount === 0 && emptyHint) {
    body =
      `<div class="od-fd-row od-fd-row--hint" role="row">` +
      `<div class="od-fd-cell od-fd-cell--hint pf-muted" role="cell">${escapeHtml(emptyHint)}</div>` +
      `</div>`;
    effectiveCount = 1;
  }

  const padCount = Math.max(0, minRows - effectiveCount);
  body += renderDeskPadRows(columns, padCount);

  return (
    `<div class="od-fd-table ${tableClass}" role="table" aria-label="${escapeHtml(ariaLabel)}">` +
    `<div class="od-fd-table__head" role="row">${head}</div>` +
    `<div class="od-fd-table__body" role="rowgroup">${body}</div>` +
    `</div>`
  );
}

/** Default min-rows presets (spreadsheet density). */
export const DESK_TABLE_MIN_ROWS_SPLIT = 8;
export const DESK_TABLE_MIN_ROWS_PANEL = 10;

const DESK_ROW_SELECT_IGNORE =
  'a,button,input,label,select,textarea,option,[data-row-ignore],[role="button"]';

/**
 * @param {Element|null|undefined} target
 * @param {string} [ignoreSelector]
 * @returns {HTMLElement|null}
 */
function resolveDeskSelectableRow(target, ignoreSelector = DESK_ROW_SELECT_IGNORE) {
  const el = /** @type {HTMLElement|null} */ (target instanceof Element ? target : null);
  if (!el) return null;
  if (el.closest(ignoreSelector)) return null;
  const row = el.closest('.od-fd-row');
  if (!(row instanceof HTMLElement)) return null;
  if (
    row.classList.contains('od-fd-row--empty') ||
    row.classList.contains('od-fd-row--hint') ||
    row.classList.contains('od-fd-row-detail')
  ) {
    return null;
  }
  const table = row.closest('.od-fd-table');
  if (!table) return null;
  if (
    table.closest('[data-desk-row-select="off"]') ||
    table.getAttribute('data-desk-row-select') === 'off'
  ) {
    return null;
  }
  return row;
}

/**
 * Visual single-select highlight within a table (no business callback).
 * @param {HTMLElement} row
 * @param {string} [selectedClass]
 */
export function applyDeskTableRowVisualSelect(row, selectedClass = 'od-fd-row--selected') {
  const table = row?.closest?.('.od-fd-table');
  if (!table || !row) return;
  table.querySelectorAll(`.od-fd-row.${selectedClass}`).forEach((r) => {
    r.classList.remove(selectedClass);
    r.removeAttribute('aria-selected');
  });
  row.classList.add(selectedClass);
  row.setAttribute('aria-selected', 'true');
  row.classList.add('od-fd-row--clickable');
  if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '0');
}

/**
 * Bind click/keyboard selection on compact desk table rows.
 * Prefer `data-row-id` on rows; visual highlight works without it.
 * Clicks on links/buttons/inputs are ignored.
 *
 * Default: visual mark only. Pass `onSelect` when selection drives app state.
 *
 * @param {HTMLElement} host  Table scroll host (or table root)
 * @param {{
 *   onSelect?: (id: string, row: HTMLElement, ev: Event) => void,
 *   rowSelector?: string,
 *   ignoreSelector?: string,
 *   selectedClass?: string,
 *   visual?: boolean
 * }} [opts]
 * @returns {() => void} unbind
 */
export function bindDeskTableRowSelect(host, opts = {}) {
  if (!host) return () => {};
  const ignoreSelector = opts.ignoreSelector || DESK_ROW_SELECT_IGNORE;
  const selectedClass = opts.selectedClass || 'od-fd-row--selected';
  const visual = opts.visual !== false;

  function resolveRow(target) {
    const row = resolveDeskSelectableRow(target, ignoreSelector);
    if (!row) return null;
    if (opts.rowSelector?.includes('[data-row-id]') && !row.getAttribute('data-row-id')) {
      return null;
    }
    return row;
  }

  function activate(row, ev) {
    if (visual) applyDeskTableRowVisualSelect(row, selectedClass);
    const id = row.getAttribute('data-row-id') || '';
    if (typeof opts.onSelect === 'function' && id) opts.onSelect(id, row, ev);
  }

  function onClick(ev) {
    const row = resolveRow(ev.target);
    if (!row) return;
    activate(row, ev);
  }

  function onKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = resolveRow(ev.target);
    if (!row) return;
    ev.preventDefault();
    activate(row, ev);
  }

  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  return () => {
    host.removeEventListener('click', onClick);
    host.removeEventListener('keydown', onKey);
  };
}

/**
 * Delegated visual row-select for all desk tables under `root`.
 * Safe to call once at app boot (same pattern as `installDeskListFilterClears`).
 * Opt out: `data-desk-row-select="off"` on the table or an ancestor.
 * @param {ParentNode} [root]
 */
export function installDeskTableRowSelect(root = document) {
  const el = /** @type {ParentNode & { addEventListener?: Function }} */ (root);
  if (!el?.addEventListener) return;

  function activateFromEvent(ev) {
    const row = resolveDeskSelectableRow(ev.target);
    if (!row) return;
    if (root !== document && root instanceof Node && !root.contains(row)) return;
    applyDeskTableRowVisualSelect(row);
  }

  el.addEventListener('click', (ev) => {
    activateFromEvent(ev);
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = resolveDeskSelectableRow(ev.target);
    if (!row) return;
    ev.preventDefault();
    activateFromEvent(ev);
  });
}

/**
 * Apply single-select highlight inside a table host.
 * @param {ParentNode} host
 * @param {string|null|undefined} selectedId
 * @param {string} [selectedClass]
 */
export function syncDeskTableRowSelection(host, selectedId, selectedClass = 'od-fd-row--selected') {
  if (!host) return;
  host.querySelectorAll(`.od-fd-row[data-row-id]`).forEach((row) => {
    const on = Boolean(selectedId) && row.getAttribute('data-row-id') === selectedId;
    row.classList.toggle(selectedClass, on);
    if (on) row.setAttribute('aria-selected', 'true');
    else row.removeAttribute('aria-selected');
  });
}
