/**
 * Desk-list — CoreUI desk delegates to mountCoreUiCardTable (vendored recipes);
 * legacy ev-panel well markup otherwise.
 * v0.5.0: CoreUI path = shared/ui/vendor card-table + card-toolbar.
 * componentId: ev-desk-list
 */
import { defaultSortKey, resolveSortType, sortEvDeskItems } from './desk-list-sort.mjs';
import { mountCoreUiCardTable } from './coreui-card-table.mjs';
import {
  scrollListToolbarHtml,
  bindScrollListToolbar,
  filterBySearch,
  filterByCheckboxes
} from './ev-scroll-list/toolbar.mjs';
import { bindScrollListAutoFit } from './ev-scroll-list/autofit.mjs';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function padRowHtml(colCount) {
  const cells = Array.from({ length: colCount }, () => `<td class="ev-desk-pad">—</td>`).join('');
  return `<tr class="ev-desk-pad-row">${cells}</tr>`;
}

/** True on CoreUI greenfield desk — emit Free Admin card lists, not legacy well panels. */
export function isCoreUiDeskList() {
  try {
    const root = document.documentElement;
    if (root.getAttribute('data-ui-base') === 'coreui-bootstrap5') return true;
    return Boolean(document.querySelector('link[href*="coreui"]'));
  } catch {
    return false;
  }
}

/**
 * Legacy chrome: title bar + search row.
 */
function chromeHtml(opts) {
  const titleOnly = opts.scrollList === true;
  const clearBtn =
    !titleOnly && opts.withClear
      ? `<button type="button" class="btn btn-sm btn-outline-secondary ev-desk-search-clear" id="${escapeHtml(
          opts.clearId
        )}" title="Clear search">Clear</button>`
      : '';
  const searchBar =
    titleOnly
      ? ''
      : `
        <div class="ev-desk-list__searchbar">
          <input type="text" class="ev-desk-search ev-sl-search" id="${escapeHtml(
            opts.searchId
          )}" placeholder="${escapeHtml(opts.searchPlaceholder || 'Search…')}" autocomplete="off" spellcheck="false" />
          ${clearBtn}
        </div>`;
  return `
      <div class="ev-desk-list__chrome">
        <div class="ev-desk-list__titlebar">
          <div class="ev-desk-list__title fw-semibold small">${escapeHtml(opts.title)}</div>
          <div class="ev-hint small ev-desk-list__meta" id="${escapeHtml(opts.metaId)}">${escapeHtml(
            opts.metaLabel || 'warming…'
          )}</div>
        </div>
        ${searchBar}
      </div>`;
}

/**
 * CoreUI Free Admin: card-header toolbar + search, table in card-body.
 */
function coreUiCardChromeHtml(opts) {
  return `
    <div class="card-header">
      <div class="d-flex flex-nowrap align-items-center justify-content-between gap-2">
        <strong class="ev-desk-list__title mb-0">${escapeHtml(opts.title)}</strong>
        <span class="small text-body-secondary ev-desk-list__meta" id="${escapeHtml(opts.metaId)}">${escapeHtml(
          opts.metaLabel || '…'
        )}</span>
      </div>
      <div class="input-group input-group-sm mt-2 ev-desk-list__searchbar" style="max-width: 22rem">
        <input type="text" class="ev-desk-search ev-sl-search" id="${escapeHtml(opts.searchId)}"
          placeholder="${escapeHtml(opts.searchPlaceholder || 'Search…')}" autocomplete="off" spellcheck="false" />
        <button type="button" class="btn btn-outline-secondary ev-desk-search-clear" id="${escapeHtml(
          opts.clearId
        )}" title="Clear search">Clear</button>
      </div>
    </div>`;
}

/**
 * Legacy shell — title bar + search left under it. No sort API.
 * Prefer mountEvDeskList for new features.
 *
 * @param {HTMLElement} host
 * @param {{
 *   title: string,
 *   metaId?: string,
 *   searchPlaceholder?: string,
 *   columns: { key: string, label: string, className?: string }[],
 *   padRows?: number,
 *   maxBodyRem?: number
 * }} opts
 */
export function paintDeskListShell(host, opts) {
  const pad = opts.padRows ?? 3;
  const maxH = opts.maxBodyRem ?? 14;
  const cols = opts.columns || [];
  const metaId = opts.metaId || 'deskMeta';
  const searchId = `${opts.metaId || 'desk'}Search`;
  const clearId = `${opts.metaId || 'desk'}Clear`;
  const bodyId = `${opts.metaId || 'desk'}Body`;
  const head = cols.map((c) => `<th class="${c.className || ''}">${escapeHtml(c.label)}</th>`).join('');
  const padHtml = Array.from({ length: pad }, () => padRowHtml(cols.length)).join('');
  const coreUi = isCoreUiDeskList();

  if (coreUi) {
    host.innerHTML = `
    <div class="card mb-3 ev-cui-desk-list" data-ev-component="ev-desk-list" data-ev-desk-list-ver="0.4.0-coreui-legacy">
      ${coreUiCardChromeHtml({
        title: opts.title,
        metaId,
        metaLabel: 'warming…',
        searchId,
        clearId,
        searchPlaceholder: opts.searchPlaceholder
      })}
      <div class="card-body p-0 ev-desk-list__well">
        <div class="table-responsive ev-desk-list__scroll" style="max-height:${maxH}rem">
          <table class="table table-striped table-hover table-sm mb-0 align-middle ev-desk-table">
            <thead><tr>${head}</tr></thead>
            <tbody id="${escapeHtml(bodyId)}">${padHtml}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  } else {
    host.innerHTML = `
    <div class="ev-desk-list ev-panel" data-ev-component="ev-desk-list" data-ev-desk-list-ver="0.3.1-legacy">
      ${chromeHtml({
        title: opts.title,
        metaId,
        metaLabel: 'warming…',
        searchId,
        clearId,
        searchPlaceholder: opts.searchPlaceholder,
        withClear: true
      })}
      <div class="ev-desk-list__well">
        <div class="ev-desk-list__scroll" style="max-height:${maxH}rem">
          <table class="table table-sm mb-0 ev-desk-table">
            <thead class="ev-desk-sticky"><tr>${head}</tr></thead>
            <tbody id="${escapeHtml(bodyId)}">${padHtml}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  const search = /** @type {HTMLInputElement|null} */ (host.querySelector(`#${CSS.escape(searchId)}`));
  const clear = host.querySelector(`#${CSS.escape(clearId)}`);
  clear?.addEventListener('click', () => {
    if (search) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  return {
    meta: host.querySelector(`#${CSS.escape(metaId)}`),
    search,
    body: host.querySelector(`#${CSS.escape(bodyId)}`),
    clear
  };
}

/**
 * Mount: CoreUI Free Admin card+table on CoreUI desk; legacy well otherwise.
 *
 * @param {HTMLElement} host
 * @param {{
 *   title: string,
 *   metaLabel?: string,
 *   searchPlaceholder?: string,
 *   columns: {
 *     key: string,
 *     label: string,
 *     className?: string,
 *     width?: string,
 *     sortable?: boolean,
 *     sortType?: 'string'|'number'|'status'|'none',
 *     sortValue?: (row: object) => unknown,
 *     render?: (row: object) => string
 *   }[],
 *   items?: object[],
 *   searchFields?: string[],
 *   defaultSortKey?: string|null,
 *   defaultSortDir?: 1|-1,
 *   padRows?: number,
 *   minRows?: number,
 *   emptyHtml?: string,
 *   maxHeightCss?: string,
 *   formatMeta?: (visible: number, total: number) => string,
 *   afterPaint?: (ctx: { body: HTMLElement, meta: HTMLElement|null, items: object[], visible: object[] }) => void
 * }} cfg
 */
export function mountEvDeskList(host, cfg) {
  if (isCoreUiDeskList()) {
    return mountCoreUiCardTable(host, cfg);
  }
  return mountEvDeskListWell(host, cfg);
}

export function mountEvDeskListWell(host, cfg) {

  const embed = cfg.embed === true;
  if (cfg.scrollList) host.classList.add('ev-scroll-list-host');
  if (embed) host.classList.add('ev-scroll-list-host--embed');

  const columns = cfg.columns || [];
  const padRows = cfg.padRows ?? cfg.minRows ?? 6;
  const maxHeight = cfg.maxHeightCss || 'min(48vh, 22rem)';
  const searchFields = cfg.searchFields || columns.map((c) => c.key).filter(Boolean);
  const ids = {
    root: uid('evdl'),
    meta: uid('evdl-meta'),
    search: uid('evdl-q'),
    clear: uid('evdl-clear'),
    body: uid('evdl-body')
  };

  let items = Array.isArray(cfg.items) ? cfg.items.slice() : [];
  let filter = '';
  let sortKey = cfg.defaultSortKey !== undefined ? cfg.defaultSortKey : defaultSortKey(columns);
  let sortDir = cfg.defaultSortDir === -1 ? -1 : 1;
  let selectedId = cfg.selectedId ?? null;

  function colStyle(c) {
    if (!c.width) return '';
    const w = String(c.width).trim();
    return ` style="width:${escapeHtml(w)}"`;
  }

  function headHtml() {
    return columns
      .map((c) => {
        const type = resolveSortType(c);
        const sortable = type !== 'none';
        const active = sortable && sortKey === c.key;
        const aria = active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none';
        const marker = active ? (sortDir === 1 ? ' ▲' : ' ▼') : sortable ? ' ▾' : '';
        const label = c.headerHtml || escapeHtml(c.label);
        if (!sortable) {
          return `<th scope="col" class="${c.className || ''}"${colStyle(c)}>${label}</th>`;
        }
        return `<th scope="col" class="ev-desk-th-sort ${c.className || ''} ${active ? 'is-active' : ''}"
          data-sort-key="${escapeHtml(c.key)}"
          role="columnheader"
          aria-sort="${aria}"
          tabindex="0"${colStyle(c)}
          title="Sort by ${escapeHtml(c.label)}">${label}<span class="ev-desk-sort-mark" aria-hidden="true">${marker}</span></th>`;
      })
      .join('');
  }

  const colgroup = columns.some((c) => c.width)
    ? `<colgroup>${columns
        .map((c) => (c.width ? `<col style="width:${escapeHtml(String(c.width))}" />` : '<col />'))
        .join('')}</colgroup>`
    : '';

  const filterDefs = cfg.scrollList && Array.isArray(cfg.filters) ? cfg.filters : [];

  host.innerHTML = `
    <div class="ev-desk-list ev-panel${cfg.scrollList ? ' ev-scroll-list' : ''}" data-ev-component="ev-desk-list" data-ev-desk-list-ver="0.5.0" id="${ids.root}">
      ${
        embed
          ? `<span class="ev-desk-list__meta d-none" id="${ids.meta}"></span>`
          : chromeHtml({
              title: cfg.title,
              metaId: ids.meta,
              metaLabel: cfg.metaLabel || '…',
              searchId: ids.search,
              clearId: ids.clear,
              searchPlaceholder: cfg.searchPlaceholder,
              withClear: true,
              scrollList: cfg.scrollList
            })
      }
      <div class="ev-desk-list__well${cfg.scrollList ? ' ev-sl-table-stack' : ''}">
        ${
          cfg.scrollList && !embed
            ? scrollListToolbarHtml({
                searchId: ids.search,
                clearId: ids.clear,
                searchPlaceholder: cfg.searchPlaceholder,
                filters: filterDefs
              })
            : ''
        }
        <div class="ev-desk-list__scroll" style="max-height:${escapeHtml(maxHeight)}">
          <table class="table table-sm mb-0 ev-desk-table">
            ${colgroup}
            <thead class="ev-desk-sticky"><tr>${headHtml()}</tr></thead>
            <tbody id="${ids.body}"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  const rootEl = host.querySelector(`#${ids.root}`);
  let toolbarApi = null;
  if (cfg.scrollList && rootEl && !embed) {
    toolbarApi = bindScrollListToolbar(rootEl, {
      searchId: ids.search,
      clearId: ids.clear,
      filters: filterDefs,
      onChange: () => paint()
    });
  }

  const metaEl = host.querySelector(`#${ids.meta}`);
  const searchEl = /** @type {HTMLInputElement} */ (host.querySelector(`#${ids.search}`));
  const clearEl = host.querySelector(`#${ids.clear}`);
  const bodyEl = host.querySelector(`#${ids.body}`);
  const theadRow = host.querySelector('thead tr');

  function visibleRows() {
    const q = cfg.scrollList && toolbarApi ? toolbarApi.getQuery() : filter;
    let rows = cfg.scrollList
      ? filterBySearch(items, q, searchFields)
      : filterRows(items, filter, searchFields);
    if (cfg.scrollList && filterDefs.length && toolbarApi) {
      rows = filterByCheckboxes(rows, filterDefs, toolbarApi.getActiveFilterIds());
    }
    return sortEvDeskItems(rows, { columns, sortKey, sortDir });
  }

  function paint() {
    const rows = visibleRows();
    const scrollEl = host.querySelector('.ev-desk-list__scroll');
    if (scrollEl) {
      const emptyFit = rows.length === 0 && cfg.padWhenEmpty !== true;
      scrollEl.style.maxHeight = emptyFit ? 'none' : maxHeight;
      scrollEl.style.overflowY = emptyFit ? 'hidden' : 'auto';
      scrollEl.classList.toggle('ev-sl-scroll--fit', emptyFit);
    }
    fillDeskListBody(bodyEl, rows, columns, {
      emptyHtml: cfg.emptyHtml,
      padRows:
        rows.length === 0 && cfg.padWhenEmpty !== true ? 0 : Math.max(0, padRows - rows.length),
      skipEmptyHtml: cfg.padWhenEmpty === true && rows.length === 0,
      scrollList: cfg.scrollList,
      rowKey: cfg.rowKey,
      selectedId
    });
    if (cfg.scrollList) {
      const tableEl = host.querySelector('table');
      if (tableEl) bindScrollListAutoFit(tableEl, scrollEl, columns);
    }
    if (metaEl) {
      metaEl.textContent = cfg.formatMeta
        ? cfg.formatMeta(rows.length, items.length)
        : `${rows.length} of ${items.length}`;
    }
    if (theadRow) theadRow.innerHTML = headHtml();
    bindSortHeads();
    try {
      cfg.afterPaint?.({ body: bodyEl, meta: metaEl, items, visible: rows });
    } catch (err) {
      console.error('[ev-desk-list] afterPaint', err);
    }
  }

  function bindSortHeads() {
    host.querySelectorAll('th[data-sort-key]').forEach((th) => {
      const key = th.getAttribute('data-sort-key');
      const toggle = () => {
        if (sortKey === key) sortDir = /** @type {1|-1} */ (sortDir === 1 ? -1 : 1);
        else {
          sortKey = key;
          sortDir = 1;
        }
        paint();
      };
      th.addEventListener('click', toggle);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  if (!cfg.scrollList) {
    searchEl?.addEventListener('input', () => {
      filter = searchEl.value || '';
      paint();
    });
    clearEl?.addEventListener('click', () => {
      filter = '';
      if (searchEl) searchEl.value = '';
      paint();
    });
  }

  if (cfg.scrollList && cfg.onRowSelect && bodyEl) {
    const IGNORE = 'a,button,input,label,select,textarea,option,[data-row-ignore]';
    bodyEl.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof Element) || t.closest(IGNORE)) return;
      const tr = t.closest('tr[data-row-id]');
      if (!(tr instanceof HTMLElement)) return;
      const id = tr.getAttribute('data-row-id') || '';
      const row = visibleRows().find((r) => (cfg.rowKey || ((x) => String(x?.id ?? '')))(r) === id);
      if (!row) return;
      selectedId = id;
      cfg.onRowSelect(row, id);
      paint();
    });
  }

  paint();

  return {
    setItems(next) {
      items = Array.isArray(next) ? next.slice() : [];
      paint();
    },
    /** Replace empty-state row (e.g. handler error vs zero rows). */
    setEmptyHtml(html) {
      cfg.emptyHtml = html;
      paint();
    },
    refresh() {
      paint();
    },
    getFilter() {
      return filter;
    },
    getSort() {
      return { key: sortKey, dir: sortDir };
    },
    select(id) {
      selectedId = id;
      paint();
    },
    getSelectedId: () => selectedId,
    els: { meta: metaEl, search: searchEl, body: bodyEl, root: host.querySelector(`#${ids.root}`) }
  };
}

/**
 * @param {HTMLElement} tbody
 * @param {object[]} rows
 * @param {{ key: string, render?: (row: object) => string, className?: string }[]} columns
 * @param {{ emptyHtml?: string, padRows?: number }} [opts]
 */
export function fillDeskListBody(tbody, rows, columns, opts = {}) {
  const pad = opts.padRows ?? 0;
  const scrollList = opts.scrollList === true;
  const rowKeyFn = opts.rowKey || ((r) => String(r?.id ?? ''));
  const selectedId = opts.selectedId ?? null;
  const rowClick = scrollList && opts.onRowSelect;

  if (!rows.length) {
    const pads = Array.from({ length: Math.max(0, pad) }, () => padRowHtml(columns.length)).join('');
    if (opts.skipEmptyHtml && pads) {
      tbody.innerHTML = pads;
      return;
    }
    const empty =
      opts.emptyHtml ||
      `<tr><td colspan="${columns.length}" class="ev-hint">No rows.</td></tr>`;
    tbody.innerHTML = empty + pads;
    return;
  }
  const dataHtml = rows
    .map((row) => {
      const rid = escapeHtml(rowKeyFn(row));
      const sel = selectedId && rid === selectedId ? ' ev-sl-row--selected' : '';
      const click = rowClick ? ' ev-sl-row--clickable' : '';
      const cells = columns
        .map((c) => {
          const html = c.render ? c.render(row) : escapeHtml(row[c.key]);
          return `<td class="${c.className || ''}">${html}</td>`;
        })
        .join('');
      return `<tr class="ev-sl-row${click}${sel}" data-row-id="${rid}"${
        rowClick ? ' tabindex="0"' : ''
      }>${cells}</tr>`;
    })
    .join('');
  const pads = Array.from({ length: Math.max(0, pad) }, () => padRowHtml(columns.length)).join('');
  tbody.innerHTML = dataHtml + pads;
}

export function filterRows(rows, query, fields) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    fields.some((f) =>
      String(r[f] ?? '')
        .toLowerCase()
        .includes(q)
    )
  );
}
