/**
 * Desk page composites (site-kit SSOT) — structure primitives so every site
 * renders pages, titled cards, list cards, badges, dropzones, and banners the
 * SAME way. Layout (sidebar / topbar / statusbar) is a bootstrap concern; these
 * are the components placed inside content, identical across all sites.
 *
 * Import these instead of hand-assembling section/list/badge HTML strings.
 */
import { escapeHtml } from './esc.mjs';
import {
  PF_DESK_SECTION,
  PF_DESK_SECTION_HEAD,
  PF_DESK_SECTION_TITLE,
  PF_DESK_SECTION_STEP,
  PF_DESK_SECTION_STEP_LABEL,
  PF_DESK_SECTION_META,
  PF_DESK_SECTION_BODY,
  PF_BTN_PRIMARY,
  PF_BTN_SECONDARY
} from '../constants/pf-dom-contract.mjs';
import { renderDeskListToolbar, renderDeskListUnit } from './desk-controls.mjs';
import { renderDeskCompactTable, DESK_TABLE_MIN_ROWS_PANEL, bindDeskTableRowSelect } from './desk-table.mjs';
import { bindListSearch, bindListFilterClear, filterByQuery, updateFilterMeta } from './desk-list.mjs';
import { sortDeskItems, defaultDeskSortKey } from './desk-sort.mjs';

/* ─────────────────────────── page head ─────────────────────────── */

/**
 * Standard compact page header (title + optional job status + count + optional trailing actions + lead).
 * Titlebar order: title | job | count | actions (Refresh, etc.). Job never duplicates count copy.
 * @param {{
 *   title: string,
 *   meta?: string,
 *   metaId?: string,
 *   jobStatus?: string,
 *   jobStatusId?: string,
 *   actionsHtml?: string,
 *   lead?: string
 * }} opts
 */
export function renderDeskPageHead(opts) {
  const job =
    opts.jobStatusId || opts.jobStatus != null
      ? `<span class="pf-muted od-page-job"${opts.jobStatusId ? ` id="${escapeHtml(opts.jobStatusId)}"` : ''} aria-live="polite">${escapeHtml(opts.jobStatus || '\u00a0')}</span>`
      : '';
  const meta = opts.meta || opts.metaId
    ? `<span class="pf-muted od-page-count"${opts.metaId ? ` id="${escapeHtml(opts.metaId)}"` : ''}>${escapeHtml(opts.meta || '')}</span>`
    : '';
  const actions = opts.actionsHtml
    ? `<div class="od-page-head__actions">${opts.actionsHtml}</div>`
    : '';
  const lead = opts.lead
    ? `<p class="pf-muted od-page-lead od-page-lead--block">${escapeHtml(opts.lead)}</p>`
    : '';
  return (
    `<header class="od-page-head od-page-head--compact">` +
    `<div class="od-page-head__titlebar">` +
    `<h2 class="od-page-title">${escapeHtml(opts.title)}</h2>` +
    job +
    meta +
    actions +
    `</div>` +
    lead +
    `</header>`
  );
}

/* ─────────────────────────── titled section card ─────────────────────────── */

/**
 * Step number + label for desk section titles (ordered / wizard cards).
 * Lighter badge fill is the default — reuse across OD and future desks.
 * @param {number|string} step
 * @param {string} title
 */
export function renderDeskSectionStepTitle(step, title) {
  return (
    `<span class="${PF_DESK_SECTION_STEP}" aria-hidden="true">${escapeHtml(String(step))}</span>` +
    `<span class="${PF_DESK_SECTION_STEP_LABEL}">${escapeHtml(title)}</span>`
  );
}

/**
 * Titled desk section card. Title bar is MANDATORY — never render a bare card.
 * @param {{
 *   title: string, step?: number|string, meta?: string, metaId?: string,
 *   bodyHtml?: string, toolbarHtml?: string,
 *   sectionClass?: string, bodyClass?: string, inspectId?: string,
 *   titleHtml?: string
 * }} opts
 */
export function renderDeskSection(opts) {
  const titleInner =
    opts.titleHtml ||
    (opts.step != null && opts.step !== ''
      ? renderDeskSectionStepTitle(opts.step, opts.title)
      : escapeHtml(opts.title));
  const meta = opts.meta || opts.metaId
    ? `<span class="${PF_DESK_SECTION_META}"${opts.metaId ? ` id="${escapeHtml(opts.metaId)}"` : ''}>${escapeHtml(opts.meta || '')}</span>`
    : '';
  const inspect = opts.inspectId ? ` data-inspect-id="${escapeHtml(opts.inspectId)}"` : '';
  return (
    `<section class="${PF_DESK_SECTION} ${opts.sectionClass || ''}"${inspect}>` +
    `<header class="${PF_DESK_SECTION_HEAD}">` +
    `<h3 class="${PF_DESK_SECTION_TITLE}">${titleInner}</h3>` +
    meta +
    `</header>` +
    `<div class="${PF_DESK_SECTION_BODY} ${opts.bodyClass || ''}">` +
    (opts.toolbarHtml || '') +
    (opts.bodyHtml || '') +
    `</div>` +
    `</section>`
  );
}

/* ─────────────────────────── badge / chip ─────────────────────────── */

/**
 * One badge/chip primitive (replaces od-fd-type-chip, od-*-status, pills).
 * @param {{ label: string, tone?: 'neutral'|'accent'|'ok'|'warn'|'err', title?: string }} opts
 */
export function renderDeskBadge(opts) {
  const tone = opts.tone || 'neutral';
  const title = opts.title ? ` title="${escapeHtml(opts.title)}"` : '';
  return `<span class="pf-badge pf-desk-badge pf-desk-badge--${tone}"${title}>${escapeHtml(opts.label)}</span>`;
}

/** Maps legacy site/project status.class → desk badge tone. */
const DESK_STATUS_TONES = {
  'status-live': 'ok',
  'in-development': 'accent',
  archived: 'neutral'
};

/**
 * Status badge for site/project launcher cards and list rows.
 * @param {{ class: string, label: string }} status
 */
export function renderDeskStatusBadge(status) {
  return renderDeskBadge({
    label: status.label,
    tone: DESK_STATUS_TONES[status.class] || 'neutral'
  });
}

/* ─────────────────────────── banner (flash / error / degraded) ─────────────────────────── */

/**
 * Inline banner for flash / error / degraded states (replaces per-route od-*-flash).
 * @param {{ text: string, tone?: 'info'|'ok'|'warn'|'err', id?: string, hidden?: boolean }} opts
 */
export function renderDeskBanner(opts) {
  const tone = opts.tone || 'info';
  const id = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
  const hidden = opts.hidden ? ' hidden' : '';
  return `<div class="pf-desk-banner pf-desk-banner--${tone}"${id}${hidden} role="status">${escapeHtml(opts.text)}</div>`;
}

/* ─────────────────────────── details modal (crown jewel) ─────────────────────────── */

/**
 * SSOT for "details"-style popups. Modeled on the Resume Creator submission
 * details dialog — a centered pf-dialog, NEVER a slide-up sheet. Use this for
 * any "open details / inspect / view record" affordance across every site.
 *
 * @typedef {[string, (string|number|null|undefined), { html?: boolean }?]} DeskDetailRow
 * @typedef {{ title?: string, rows?: DeskDetailRow[], bodyHtml?: string }} DeskDetailSection
 * @typedef {{
 *   id?: string, label: string, variant?: 'primary'|'secondary',
 *   href?: string, external?: boolean,
 *   onClick?: (ctx: { close: () => void, body: HTMLElement }) => void|Promise<void>
 * }} DeskDetailAction
 */

/** Label/value rows (reused inside a detail card). @param {DeskDetailRow[]} rows */
export function renderDeskDetailRows(rows) {
  return (rows || [])
    .filter(Boolean)
    .map(([label, value, opts = {}]) => {
      const val =
        opts && opts.html ? String(value == null ? '—' : value) : escapeHtml(String(value == null ? '—' : value));
      return (
        `<div class="pf-desk-detail-row">` +
        `<span class="pf-desk-detail-row__label pf-muted">${escapeHtml(String(label))}</span>` +
        `<span class="pf-desk-detail-row__value">${val}</span>` +
        `</div>`
      );
    })
    .join('');
}

/** A titled detail card (section + rows and/or custom body). @param {DeskDetailSection} section */
export function renderDeskDetailCard(section) {
  const rowsHtml = section.rows && section.rows.length
    ? `<div class="pf-desk-detail-rows">${renderDeskDetailRows(section.rows)}</div>`
    : '';
  return (
    `<section class="${PF_DESK_SECTION} pf-desk-detail-card">` +
    (section.title
      ? `<header class="${PF_DESK_SECTION_HEAD}"><h4 class="${PF_DESK_SECTION_TITLE}">${escapeHtml(section.title)}</h4></header>`
      : '') +
    `<div class="${PF_DESK_SECTION_BODY}">${rowsHtml}${section.bodyHtml || ''}</div>` +
    `</section>`
  );
}

/** @param {DeskDetailAction} a */
function renderDeskDetailAction(a) {
  const cls = `${a.variant === 'primary' ? PF_BTN_PRIMARY : PF_BTN_SECONDARY} pf-desk-detail-btn`;
  if (a.href) {
    const ext = a.external ? ' target="_blank" rel="noopener"' : '';
    return `<a class="${cls}" href="${escapeHtml(a.href)}"${ext}>${escapeHtml(a.label)}</a>`;
  }
  return `<button type="button" class="${cls}" data-desk-action="${escapeHtml(a.id || a.label)}">${escapeHtml(a.label)}</button>`;
}

/**
 * Open a standardized details modal. Returns `{ close }`.
 * @param {{
 *   title?: string, subtitle?: string, size?: 'sm'|'md'|'lg'|'xl',
 *   sections?: DeskDetailSection[], bodyHtml?: string, mediaHtml?: string,
 *   actions?: DeskDetailAction[],
 *   onMount?: (body: HTMLElement, ctx: { close: () => void }) => void|Promise<void>
 * }} config
 */
export async function openDeskDetailModal(config = {}) {
  const { openDialog, closeDialog } = await import('../components/pf-dialog/static/pf-dialog.mjs');
  const close = () => closeDialog('programmatic');
  await openDialog(
    {
      dialog: {
        title: config.title || 'Details',
        intro: config.subtitle,
        size: config.size || 'lg',
        behavior: { closeOnEscape: true, closeOnBackdrop: true, lockBodyScroll: true }
      }
    },
    async (body) => {
      const sectionsHtml = (config.sections || []).map((s) => renderDeskDetailCard(s)).join('');
      const actions = config.actions || [];
      const actionsHtml = actions.length
        ? `<div class="pf-desk-detail-actions">${actions.map(renderDeskDetailAction).join('')}</div>`
        : '';
      body.innerHTML =
        `<div class="pf-desk-detail-modal">` +
        (config.bodyHtml || '') +
        sectionsHtml +
        (config.mediaHtml || '') +
        actionsHtml +
        `</div>`;
      actions.forEach((a) => {
        if (!a.onClick) return;
        const el = body.querySelector(`[data-desk-action="${(a.id || a.label).replace(/"/g, '\\"')}"]`);
        el?.addEventListener('click', () => a.onClick({ close, body }));
      });
      if (config.onMount) await config.onMount(body, { close });
    }
  );
  return { close };
}

/* ─────────────────────────── dropzone ─────────────────────────── */

/**
 * Standard file dropzone (replaces 4× copied od-desk-dropzone markup).
 * @param {{
 *   id: string, label?: string, hint?: string, extraClass?: string,
 *   ariaLabel?: string, titleId?: string, hintId?: string, innerHtml?: string
 * }} opts
 */
export function renderDeskDropzone(opts) {
  const aria = opts.ariaLabel ? ` aria-label="${escapeHtml(opts.ariaLabel)}"` : '';
  const titleId = opts.titleId ? ` id="${escapeHtml(opts.titleId)}"` : '';
  const hintId = opts.hintId ? ` id="${escapeHtml(opts.hintId)}"` : '';
  return (
    `<div class="od-desk-dropzone ${opts.extraClass || ''}" id="${escapeHtml(opts.id)}" role="button" tabindex="0"${aria}>` +
    `<span class="od-desk-dropzone__title"${titleId}>${escapeHtml(opts.label || 'Drop files here')}</span>` +
    (opts.hint ? `<span class="od-desk-dropzone__hint pf-muted"${hintId}>${escapeHtml(opts.hint)}</span>` : '') +
    (opts.innerHtml || '') +
    `</div>`
  );
}

/* ─────────────────────────── searchable list card (crown jewel) ─────────────────────────── */

/**
 * @template T
 * @typedef {Object} DeskListCardConfig
 * @property {string} title
 * @property {string} [meta]
 * @property {string} searchId
 * @property {string} [searchPlaceholder]
 * @property {string} [searchAriaLabel]
 * @property {string} [refreshId]
 * @property {string} [refreshLabel]
 * @property {string} [extraToolbarHtml]
 * @property {import('./desk-table.mjs').DeskTableColumn[]} columns
 * @property {number} [minRows]
 * @property {string} [tableClass]
 * @property {string} [emptyFilterHint]         When items exist but none pass filters
 * @property {(items: T[], ctx: { textFilter: string }) => T[]} [filterItems]
 * @property {string} [inspectId]
 * @property {string} [sectionClass]
 * @property {string} [toolbarClass]
 * @property {string} [bodyClass]
 * @property {string} [metaId]              Defaults to `${searchId}-meta`
 * @property {string} [scrollId]            Defaults to `${searchId}-scroll`
 * @property {{ id: string, render: (visible: T[], ctx: { scrollHost: HTMLElement, filter: string, total: number }) => string, emptyFiltered?: string, emptyNone?: string }} [altView]
 * @property {string} [scrollClass]         Defaults to `od-rg-pane-scroll`
 * @property {'filter'|'fraction'} [metaMode]  Meta pill format (default `filter`)
 * @property {boolean} [showRefresh]
 * @property {string|((item: T) => string)} [rowClass]
 * @property {((item: T) => Record<string, string>)} [rowAttrs]
 * @property {((ctx: { visible: T[], scrollHost: HTMLElement, total: number, filter: string }) => void)} [onAfterRender]
 * @property {(item: T, idx: number) => string} rowToCells   Inner cell HTML (no wrapping row).
 * @property {(item: T) => string} [searchText] Text used for filtering (defaults to rowToCells).
 * @property {(item: T, idx: number) => string} [rowKey] Stable id per item (defaults to index).
 * @property {'expand'|'modal'|'none'|'select'} [rowClick] Default: `select` (visual mark). Use `expand`/`modal` with `renderDetail`; `none` disables.
 * @property {(item: T) => string} [renderDetail] Detail HTML for expand/modal.
 * @property {(item: T) => string} [detailTitle]  Modal title (rowClick:'modal').
 * @property {(item: T, id: string) => void} [onRowSelect] Optional; called when a row is selected (works with any rowClick except `none`).
 * @property {() => (Promise<void>|void)} [onRefresh]
 * @property {boolean} [sortable] Column header sort (default true). Set false to disable.
 * @property {string} [defaultSortKey] Initial sort column key (defaults to first sortable column).
 * @property {1|-1} [defaultSortDir] Initial direction (default 1 = asc).
 */

/**
 * Mount a fully-standard searchable list card: titled section + search toolbar +
 * compact spreadsheet table + bounded scroll + filter wiring + row-click behavior.
 * Row-click DEFAULT = visual select (mark a row). Set rowClick:'expand'|'modal' for detail;
 * rowClick:'none' to disable selection.
 *
 * @template T
 * @param {HTMLElement} host
 * @param {DeskListCardConfig<T>} config
 * @returns {{ setItems: (items: T[]) => void, refresh: () => Promise<void>, getFilter: () => string, setViewMode: (mode: string) => void, getViewMode: () => string, rerender: () => void }}
 */
export function mountDeskListCard(host, config) {
  const rowClick =
    config.rowClick ||
    (config.renderDetail ? 'expand' : 'select');
  const searchText = config.searchText || config.rowToCells;
  const rowKey = config.rowKey || ((_i, idx) => String(idx));
  const scrollId = config.scrollId || `${config.searchId}-scroll`;
  const scrollClass = config.scrollClass || 'od-rg-pane-scroll';
  const metaId = config.metaId || `${config.searchId}-meta`;

  const toolbar = renderDeskListToolbar({
    toolbarClass: config.toolbarClass,
    searchId: config.searchId,
    searchPlaceholder: config.searchPlaceholder || 'Filter…',
    searchAriaLabel: config.searchAriaLabel || config.title,
    clearId: config.clearId || `${config.searchId}-clear`,
    refreshId: config.refreshId || `${config.searchId}-refresh`,
    refreshLabel: config.refreshLabel || 'Refresh',
    extraHtml: config.extraToolbarHtml || '',
    showClear: config.showClear,
    showRefresh: config.showRefresh
  });

  host.innerHTML = renderDeskSection({
    title: config.title,
    meta: config.meta || '0',
    metaId,
    inspectId: config.inspectId,
    sectionClass: config.sectionClass,
    bodyClass: config.bodyClass,
    bodyHtml: renderDeskListUnit({
      toolbarHtml: toolbar,
      bodyHtml: `<div class="${scrollClass}" id="${scrollId}" aria-live="polite"></div>`
    })
  });

  const scrollHost = host.querySelector(`#${cssEscape(scrollId)}`);
  const metaEl = host.querySelector(`#${cssEscape(metaId)}`);
  const searchEl = /** @type {HTMLInputElement|null} */ (host.querySelector(`#${cssEscape(config.searchId)}`));
  const clearBtn = host.querySelector(`#${cssEscape(config.clearId || `${config.searchId}-clear`)}`);

  /** @type {T[]} */
  let items = Array.isArray(config.initialItems) ? config.initialItems.slice() : [];
  let filter = '';
  let viewMode = 'list';
  const sortable = config.sortable !== false;
  /** @type {string|null} */
  let sortKey = sortable
    ? (config.defaultSortKey || defaultDeskSortKey(config.columns) || null)
    : null;
  /** @type {1|-1} */
  let sortDir = config.defaultSortDir === -1 ? -1 : 1;

  function updateMeta(shown, total) {
    if (!metaEl) return;
    if (config.metaMode === 'fraction') {
      metaEl.textContent = `${shown}/${total}`;
    } else {
      updateFilterMeta(metaEl, shown, total);
    }
  }

  function resolveEmptyHint(visibleCount, totalCount) {
    if (visibleCount === 0 && totalCount > 0) {
      return config.emptyFilterHint || 'No matches for filter';
    }
    if (filter) return 'No matches for filter';
    return config.emptyHint || 'No items yet';
  }

  function visibleItems() {
    const filtered = config.filterItems
      ? config.filterItems(items, { textFilter: filter })
      : filterByQuery(items, filter, searchText);
    if (!sortable || !sortKey) return filtered;
    return sortDeskItems(filtered, { columns: config.columns, sortKey, sortDir });
  }

  function render() {
    if (!scrollHost) return;
    const visible = visibleItems();
    updateMeta(visible.length, items.length);

    if (config.altView && viewMode === config.altView.id) {
      if (!visible.length) {
        const emptyMsg = visible.length === 0 && items.length > 0
          ? config.altView.emptyFiltered || config.emptyFilterHint || 'No matches for filter'
          : config.altView.emptyNone || config.emptyHint || 'No items yet';
        scrollHost.innerHTML = `<p class="pf-muted od-fd-table-empty">${escapeHtml(emptyMsg)}</p>`;
      } else {
        scrollHost.innerHTML = config.altView.render(visible, { scrollHost, filter, total: items.length });
      }
      if (config.onAfterRender) {
        config.onAfterRender({ visible, scrollHost, total: items.length, filter });
      }
      return;
    }

    const dataRowsHtml = visible
      .map((item, idx) => {
        const id = escapeHtml(rowKey(item, idx));
        const clickable = rowClick !== 'none' ? ' od-fd-row--clickable' : '';
        const tab = rowClick !== 'none' ? ' tabindex="0"' : '';
        const rowExtraClass =
          typeof config.rowClass === 'function' ? config.rowClass(item) : config.rowClass || '';
        const attrs = config.rowAttrs
          ? Object.entries(config.rowAttrs(item))
              .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
              .join('')
          : '';
        return (
          `<div class="od-fd-row${clickable}${rowExtraClass ? ` ${rowExtraClass}` : ''}"` +
          ` role="row" data-row-id="${id}"${tab}${attrs}>${config.rowToCells(item, idx)}</div>`
        );
      })
      .join('');

    scrollHost.innerHTML = renderDeskCompactTable({
      columns: config.columns,
      dataRowsHtml,
      itemCount: visible.length,
      minRows: config.minRows || DESK_TABLE_MIN_ROWS_PANEL,
      tableClass: config.tableClass || '',
      ariaLabel: config.title,
      emptyHint: resolveEmptyHint(visible.length, items.length),
      sortKey,
      sortDir,
      sortable
    });

    if (config.onAfterRender) {
      config.onAfterRender({ visible, scrollHost, total: items.length, filter });
    }
  }

  function findItem(id) {
    let out = null;
    const visible = visibleItems();
    visible.forEach((item, idx) => {
      if (rowKey(item, idx) === id) out = item;
    });
    return out;
  }

  if (rowClick !== 'none') {
    bindDeskTableRowSelect(scrollHost, {
      onSelect: (id) => {
        const item = findItem(id);
        if (item && typeof config.onRowSelect === 'function') config.onRowSelect(item, id);
        if (!item || !config.renderDetail) return;
        const rowEl = scrollHost?.querySelector(`.od-fd-row[data-row-id="${cssEscape(id)}"]`);
        if (!(rowEl instanceof HTMLElement)) return;
        if (rowClick === 'modal') {
          openModal(item, config);
          return;
        }
        if (rowClick !== 'expand') return;
        const next = rowEl.nextElementSibling;
        if (next && next.classList.contains('od-fd-row-detail')) {
          next.remove();
          rowEl.classList.remove('od-fd-row--open');
          return;
        }
        const detail = document.createElement('div');
        detail.className = 'od-fd-row od-fd-row-detail';
        detail.setAttribute('role', 'row');
        detail.innerHTML = `<div class="od-fd-cell od-fd-cell--detail" role="cell">${config.renderDetail(item)}</div>`;
        rowEl.classList.add('od-fd-row--open');
        rowEl.after(detail);
      }
    });
  }

  bindListSearch(searchEl, (q) => {
    filter = q;
    render();
  });
  bindListFilterClear(clearBtn, searchEl);

  if (sortable && scrollHost) {
    scrollHost.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('[data-desk-sort-key]');
      if (!btn || !scrollHost.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const key = btn.getAttribute('data-desk-sort-key');
      if (!key) return;
      if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
      else {
        sortKey = key;
        sortDir = 1;
      }
      render();
    });
  }

  async function refresh() {
    if (config.onRefresh) await config.onRefresh();
    render();
  }

  const refreshBtn = host.querySelector(`#${cssEscape(config.refreshId || `${config.searchId}-refresh`)}`);
  refreshBtn?.addEventListener('click', () => void refresh());

  render();

  return {
    setItems(next) {
      items = Array.isArray(next) ? next : [];
      render();
    },
    refresh,
    getFilter: () => filter,
    setViewMode(mode) {
      viewMode = config.altView && mode === config.altView.id ? config.altView.id : 'list';
      render();
    },
    getViewMode: () => viewMode,
    rerender() {
      render();
    }
  };
}

/** @param {any} item @param {DeskListCardConfig<any>} config */
async function openModal(item, config) {
  const { openDialog } = await import('../components/pf-dialog/static/pf-dialog.mjs');
  await openDialog(
    { title: config.detailTitle ? config.detailTitle(item) : config.title, size: 'lg' },
    (bodyEl) => {
      bodyEl.innerHTML = config.renderDetail ? config.renderDetail(item) : '';
    }
  );
}

/** Minimal CSS.escape fallback for querySelector by id. */
function cssEscape(id) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id);
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
