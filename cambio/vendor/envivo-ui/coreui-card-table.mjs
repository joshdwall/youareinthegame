/**
 * mountCoreUiCardTable — prebuilt-first
 * Paints verbatim Free Admin Traffic & Sales LOCKED.html, then binds title + tbody only.
 * Search strip is bound INSIDE the card, directly above the table (card-body).
 */
import { COREUI_SNIPPETS, COREUI_RECIPE_META } from './vendor/coreui-recipes.bundle.mjs';
import { defaultSortKey, resolveSortType, sortEvDeskItems } from './desk-list-sort.mjs';
import {
  scrollListToolbarHtml,
  bindScrollListToolbar,
  filterBySearch,
  filterByCheckboxes
} from './ev-scroll-list/toolbar.mjs';
import { bindScrollListAutoFit } from './ev-scroll-list/autofit.mjs';
import { SCROLL_LIST_DEFAULTS } from './ev-scroll-list/defaults.mjs';

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

function filterRows(rows, query, fields) {
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

/**
 * @param {HTMLElement} host
 * @param {object} cfg — column/search/sort contract (bind only; chrome = LOCKED Free Admin)
 */
export function mountCoreUiCardTable(host, cfg) {
  const locked = COREUI_SNIPPETS['card-table'];
  const metaInfo = COREUI_RECIPE_META?.['card-table'];
  if (!locked || !locked.includes('table border') || !locked.includes('bg-body-secondary')) {
    throw new Error(
      '[coreui-card-table] LOCKED Free Admin card missing — run: node tools/envivo-coreui-extract.mjs --recipe card-table'
    );
  }

  const scrollList = cfg.scrollList === true;
  const rowKeyFn = cfg.rowKey || ((row) => String(row?.id ?? ''));
  let selectedId = cfg.selectedId ?? null;
  const rowSelectEnabled = scrollList && cfg.onRowSelect;
  const IGNORE_CLICK = 'a,button,input,label,select,textarea,option,[data-row-ignore]';

  const columns = cfg.columns || [];
  const padRows = cfg.padRows ?? cfg.minRows ?? 6;
  const padWhenEmpty = cfg.padWhenEmpty === true;
  let collapsed = cfg.collapsed === true;
  const searchFields = cfg.searchFields || columns.map((c) => c.key).filter(Boolean);
  const ids = {
    search: uid('cui-q'),
    clear: uid('cui-clear'),
    meta: uid('cui-meta')
  };

  let items = Array.isArray(cfg.items) ? cfg.items.slice() : [];
  let hydrated = Array.isArray(cfg.items) && cfg.items.length > 0;
  let filter = '';
  let sortKey = cfg.defaultSortKey !== undefined ? cfg.defaultSortKey : defaultSortKey(columns);
  let sortDir = cfg.defaultSortDir === -1 ? -1 : 1;

  const embed = cfg.embed === true;
  host.classList.add('ev-prebuilt-host');
  if (scrollList) host.classList.add('ev-scroll-list-host');
  if (embed) host.classList.add('ev-scroll-list-host--embed');
  host.style.minWidth = '0';
  host.style.maxWidth = '100%';

  host.innerHTML = locked;

  const card = host.querySelector('[data-ev-coreui-recipe="card-table"], .card.mb-4');
  if (!card) throw new Error('[coreui-card-table] LOCKED card root missing after paint');
  if (scrollList) card.classList.add('ev-scroll-list');
  if (embed) card.classList.remove('mb-4');

  // Free Admin Traffic & Sales has no stats row in slim LOCKED; no-op if absent
  card.querySelectorAll('.card-body > .row, .card-body > br').forEach((el) => {
    el.classList.add('d-none');
    el.setAttribute('data-ev-bind', 'hidden-dashboard-chrome');
  });

  const header = card.querySelector('.card-header');
  if (header) {
    if (embed) {
      header.hidden = true;
      header.innerHTML = `<span class="ev-desk-list__meta d-none" id="${ids.meta}"></span>`;
    } else if (scrollList) {
      const add = cfg.onAdd
        ? `<button type="button" class="btn btn-sm btn-primary ev-sl-add" style="border-radius:0">${escapeHtml(cfg.addLabel || 'Add')}</button>`
        : '';
      const extra = (cfg.headerActions || [])
        .map(
          (a) =>
            `<button type="button" class="btn btn-sm btn-outline-dark" style="border-radius:0"${
              a.attrs ? ` ${a.attrs}` : ''
            }>${escapeHtml(a.label || '')}</button>`
        )
        .join('');
      const fold = cfg.collapsible
        ? `<button type="button" class="btn btn-sm btn-outline-dark ev-sl-fold" style="border-radius:0" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${collapsed ? 'Expand list' : 'Collapse list'}">${collapsed ? '▸' : '▾'}</button>`
        : '';
      header.innerHTML = `
      <div class="d-flex flex-nowrap align-items-center justify-content-between gap-2">
        <div class="d-flex flex-nowrap align-items-center gap-2 min-w-0">
          ${fold}
          <strong class="ev-desk-list__title mb-0">${escapeHtml(cfg.title || 'List')}</strong>
        </div>
        <div class="d-flex flex-nowrap align-items-center gap-1">${extra}${add}</div>
      </div>`;
      header.querySelector('.ev-sl-add')?.addEventListener('click', () => cfg.onAdd());
      header.querySelector('.ev-sl-fold')?.addEventListener('click', () => {
        collapsed = !collapsed;
        applyCollapsed();
      });
    } else {
      header.innerHTML = `
      <div class="d-flex flex-nowrap align-items-center justify-content-between gap-2">
        <strong class="ev-desk-list__title mb-0">${escapeHtml(cfg.title || 'List')}</strong>
        <span class="small text-body-secondary ev-desk-list__meta" id="${ids.meta}">${escapeHtml(
          cfg.metaLabel || '…'
        )}</span>
      </div>`;
    }
  }

  const cardBody = card.querySelector('.card-body');
  const tableWrap = cardBody?.querySelector('.table-responsive');
  if (!cardBody || !tableWrap) {
    throw new Error('[coreui-card-table] Free Admin card-body / table-responsive missing in LOCKED.html');
  }

  const filterDefs = scrollList && Array.isArray(cfg.filters) ? cfg.filters : [];
  let toolbarApi = null;

  if (scrollList && embed) {
    const stack = document.createElement('div');
    stack.className = 'ev-sl-table-stack';
    stack.appendChild(tableWrap);
    cardBody.appendChild(stack);
  } else if (scrollList) {
    const stack = document.createElement('div');
    stack.className = 'ev-sl-table-stack';
    stack.innerHTML = scrollListToolbarHtml({
      searchId: ids.search,
      clearId: ids.clear,
      metaId: ids.meta,
      searchPlaceholder: cfg.searchPlaceholder,
      filters: filterDefs
    });
    stack.appendChild(tableWrap);
    cardBody.appendChild(stack);
    toolbarApi = bindScrollListToolbar(stack, {
      searchId: ids.search,
      clearId: ids.clear,
      filters: filterDefs,
      onChange: () => paint()
    });
  } else {
    const searchStrip = document.createElement('div');
    searchStrip.className = 'd-flex flex-wrap align-items-center gap-2 mb-2';
    searchStrip.setAttribute('data-ev-bind', 'search-strip');
    searchStrip.innerHTML = `
      <input type="text" class="ev-sl-search" style="max-width:22rem" id="${ids.search}"
        placeholder="${escapeHtml(cfg.searchPlaceholder || 'Search…')}" autocomplete="off" spellcheck="false" />
      <button type="button" class="btn btn-sm btn-ghost-secondary" id="${ids.clear}">Clear</button>`;
    cardBody.insertBefore(searchStrip, tableWrap);
  }

  const table = card.querySelector('table.table.border, table.table');
  const theadRow = table?.querySelector('thead tr');
  const tbody = table?.querySelector('tbody');
  if (!table || !theadRow || !tbody) {
    throw new Error('[coreui-card-table] Free Admin table/thead/tbody missing in LOCKED.html');
  }

  // SL-26/27: fixed layout after auto-fit; nowrap + ellipsis is the default (never wrap to contain).
  table.style.tableLayout = 'fixed';
  table.style.width = '100%';
  table.style.maxWidth = '100%';
  const thead0 = table.querySelector('thead');
  if (thead0) {
    thead0.classList.add('fw-semibold');
    if (scrollList) thead0.classList.add('text-nowrap');
    else thead0.classList.remove('text-nowrap');
  }

  const wrap = card.querySelector('.table-responsive');
  if (wrap) {
    wrap.style.maxHeight = cfg.maxHeightCss || 'min(48vh, 22rem)';
    wrap.style.maxWidth = '100%';
    wrap.style.minWidth = '0';
    wrap.style.overflowX = scrollList ? SCROLL_LIST_DEFAULTS.overflowX : 'auto';
  }

  function headLabel(c) {
    return c.headerHtml || escapeHtml(c.label);
  }

  function syncColgroup() {
    let cg = table.querySelector('colgroup');
    if (!columns.some((c) => c.width)) {
      cg?.remove();
      return;
    }
    if (!cg) {
      cg = document.createElement('colgroup');
      table.insertBefore(cg, table.firstChild);
    }
    cg.innerHTML = columns
      .map((c) => (c.width ? `<col style="width:${escapeHtml(String(c.width))}" />` : '<col />'))
      .join('');
  }

  function headHtml() {
    return columns
      .map((c) => {
        const type = resolveSortType(c);
        const sortable = type !== 'none';
        const active = sortable && sortKey === c.key;
        const aria = active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none';
        const marker = active ? (sortDir === 1 ? ' ▲' : ' ▼') : sortable ? ' ▾' : '';
        const width = c.width ? ` style="width:${escapeHtml(String(c.width))}"` : '';
        // Free Admin signature class on every th
        const cls = `bg-body-secondary ${c.className || ''} ${sortable ? 'ev-desk-th-sort' : ''} ${
          active ? 'is-active' : ''
        }`.trim();
        const label = headLabel(c);
        if (!sortable) {
          return `<th scope="col" class="${cls}"${width}>${label}</th>`;
        }
        return `<th scope="col" class="${cls}" data-sort-key="${escapeHtml(c.key)}" role="columnheader" aria-sort="${aria}" tabindex="0"${width}>${label}<span class="ev-desk-sort-mark" aria-hidden="true">${marker}</span></th>`;
      })
      .join('');
  }

  function padRow(colCount) {
    const cells = Array.from({ length: colCount }, () => '<td>—</td>').join('');
    return `<tr class="align-middle ev-desk-pad-row">${cells}</tr>`;
  }

  function skeletonRows(rowCount, colCount) {
    const widths = ['70%', '45%', '60%', '35%', '80%', '50%'];
    return Array.from({ length: rowCount }, () => {
      const cells = Array.from(
        { length: colCount },
        (_, ci) =>
          `<td><span class="ev-skel-cell" style="--ev-skel-w:${widths[ci % widths.length]}"></span></td>`
      ).join('');
      return `<tr class="align-middle ev-skel-row" aria-hidden="true">${cells}</tr>`;
    }).join('');
  }

  function applyCollapsed() {
    host.classList.toggle('is-collapsed', collapsed);
    const foldBtn = header?.querySelector('.ev-sl-fold');
    if (foldBtn) {
      foldBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      foldBtn.setAttribute('aria-label', collapsed ? 'Expand list' : 'Collapse list');
      foldBtn.textContent = collapsed ? '▸' : '▾';
    }
  }

  function padNeeded(rowCount) {
    if (rowCount === 0 && !padWhenEmpty) return 0;
    return Math.max(0, padRows - rowCount);
  }

  function syncScrollBound(rowCount) {
    if (!wrap) return;
    const emptyFit = rowCount === 0 && !padWhenEmpty;
    wrap.style.maxHeight = emptyFit ? 'none' : cfg.maxHeightCss || 'min(48vh, 22rem)';
    wrap.style.overflowY = emptyFit ? 'hidden' : 'auto';
    wrap.classList.toggle('ev-sl-scroll--fit', emptyFit);
  }

  function fillBody(rows) {
    if (!hydrated && rows.length === 0 && !filter) {
      tbody.innerHTML = skeletonRows(Math.max(padRows, 4), columns.length);
      syncScrollBound(padRows);
      return;
    }
    const pad = padNeeded(rows.length);
    syncScrollBound(rows.length);
    const pads = Array.from({ length: pad }, () => padRow(columns.length)).join('');
    if (!rows.length) {
      if (padWhenEmpty && pad) {
        tbody.innerHTML = pads;
        return;
      }
      if (cfg.emptyHtml) {
        tbody.innerHTML = cfg.emptyHtml + pads;
      } else {
        tbody.innerHTML =
          `<tr class="align-middle"><td colspan="${columns.length}" class="text-body-secondary">No rows.</td></tr>` +
          pads;
      }
      return;
    }
    tbody.innerHTML =
      rows
        .map((row) => {
          const rid = escapeHtml(rowKeyFn(row));
          const sel = selectedId && rid === selectedId ? ' ev-sl-row--selected' : '';
          const click = rowSelectEnabled ? ' ev-sl-row--clickable' : '';
          const cells = columns
            .map((c) => {
              const html = c.render ? c.render(row) : escapeHtml(row[c.key]);
              return `<td class="${c.className || ''}">${html}</td>`;
            })
            .join('');
          return `<tr class="align-middle ev-sl-row${click}${sel}" data-row-id="${rid}"${
            rowSelectEnabled ? ' tabindex="0"' : ''
          }>${cells}</tr>`;
        })
        .join('') + pads;
  }

  const metaEl = host.querySelector(`#${ids.meta}`);
  const searchEl = /** @type {HTMLInputElement} */ (host.querySelector(`#${ids.search}`));
  const clearEl = host.querySelector(`#${ids.clear}`);

  function visibleRows() {
    const q = scrollList && toolbarApi ? toolbarApi.getQuery() : filter;
    let rows = scrollList
      ? filterBySearch(items, q, searchFields)
      : filterRows(items, filter, searchFields);
    if (scrollList && filterDefs.length && toolbarApi) {
      rows = filterByCheckboxes(rows, filterDefs, toolbarApi.getActiveFilterIds());
    }
    return sortEvDeskItems(rows, { columns, sortKey, sortDir });
  }

  function paint() {
    const rows = visibleRows();
    syncColgroup();
    theadRow.innerHTML = headHtml();
    const thead = table.querySelector('thead');
    if (thead) {
      thead.classList.add('fw-semibold');
      if (scrollList) thead.classList.add('text-nowrap');
      else thead.classList.remove('text-nowrap');
    }
    fillBody(rows);
    if (scrollList) bindScrollListAutoFit(table, wrap, columns);
    if (metaEl) {
      metaEl.textContent = cfg.formatMeta
        ? cfg.formatMeta(rows.length, items.length)
        : `${rows.length} of ${items.length}`;
    }
    bindSortHeads();
    try {
      cfg.afterPaint?.({ body: tbody, meta: metaEl, items, visible: rows });
    } catch (err) {
      console.error('[coreui-card-table] afterPaint', err);
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

  if (!scrollList) {
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

  function resolveRowFromEvent(ev) {
    const t = ev.target;
    if (!(t instanceof Element) || t.closest(IGNORE_CLICK)) return null;
    const tr = t.closest('tr[data-row-id]');
    if (!(tr instanceof HTMLElement)) return null;
    return tr;
  }

  function selectRow(tr) {
    if (!rowSelectEnabled || !tr) return;
    const id = tr.getAttribute('data-row-id') || '';
    const row = visibleRows().find((r) => rowKeyFn(r) === id);
    if (!row) return;
    selectedId = id;
    paint();
    cfg.onRowSelect(row, id);
  }

  if (rowSelectEnabled && tbody) {
    tbody.addEventListener('click', (ev) => {
      const tr = resolveRowFromEvent(ev);
      if (tr) selectRow(tr);
    });
    tbody.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const tr = resolveRowFromEvent(ev);
      if (tr) {
        ev.preventDefault();
        selectRow(tr);
      }
    });
  }

  applyCollapsed();
  paint();

  return {
    setItems(next) {
      items = Array.isArray(next) ? next.slice() : [];
      hydrated = true;
      paint();
    },
    refresh() {
      paint();
    },
    /** Replace empty-state row (e.g. handler error vs zero rows). */
    setEmptyHtml(html) {
      cfg.emptyHtml = html;
      hydrated = true;
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
    setCollapsed(next) {
      collapsed = Boolean(next);
      applyCollapsed();
    },
    getCollapsed: () => collapsed,
    els: {
      meta: metaEl,
      search: searchEl,
      body: tbody,
      root: card,
      sourceRef: metaInfo?.sourceRef || null
    }
  };
}
