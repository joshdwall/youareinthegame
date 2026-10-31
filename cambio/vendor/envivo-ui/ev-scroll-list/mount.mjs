/**
 * ev-scroll-list — reusable searchable scrollable desk table (SSOT).
 * Pages: mountEvScrollList(host, { title, columns, items, onSelect, … }).
 * Visual + behavior parity: site-hub pf-desk-table / mountDeskListCard.
 */
import { mountCoreUiCardTable } from '../coreui-card-table.mjs';
import { mountEvDeskListWell, isCoreUiDeskList } from '../desk-list.mjs';
import { SCROLL_LIST_DEFAULTS } from './defaults.mjs';

const SKIN_ATTR = 'data-ev-skin';
const SKIN_ID = 'ev-scroll-list';

function ensureSkin() {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[${SKIN_ATTR}="${SKIN_ID}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/cambio/vendor/envivo-ui/ev-scroll-list/ev-scroll-list.css';
  link.setAttribute(SKIN_ATTR, SKIN_ID);
  document.head.appendChild(link);
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   title: string,
 *   columns: object[],
 *   items?: object[],
 *   searchFields?: string[],
 *   searchPlaceholder?: string,
 *   minRows?: number,
 *   padWhenEmpty?: boolean,
 *   collapsible?: boolean,
 *   collapsed?: boolean,
 *   headerActions?: { label: string, attrs?: string }[],
 *   maxHeight?: string,
 *   maxHeightCss?: string,
 *   emptyHtml?: string,
 *   formatMeta?: (visible: number, total: number) => string,
 *   defaultSortKey?: string|null,
 *   defaultSortDir?: 1|-1,
 *   rowKey?: (row: object) => string,
 *   onSelect?: (row: object, id: string) => void,
 *   filters?: { id: string, label: string, default?: boolean, match: (row: object) => boolean }[],
 *   detailHost?: HTMLElement|null,
 *   renderDetail?: (row: object) => string,
 *   selectedId?: string|null,
 *   afterPaint?: (ctx: object) => void,
 *   metaLabel?: string,
 *   embed?: boolean
 * }} cfg
 */
export function mountEvScrollList(host, cfg) {
  if (!host) throw new Error('mountEvScrollList: host required');
  if (!cfg?.title) throw new Error('mountEvScrollList: title required');
  if (!cfg?.columns?.length) throw new Error('mountEvScrollList: columns required');

  ensureSkin();
  host.classList.add('ev-scroll-list-host');
  if (cfg.embed) host.classList.add('ev-scroll-list-host--embed');

  const rowKey = cfg.rowKey || ((row) => String(row?.id ?? ''));
  let selectedId = cfg.selectedId ?? null;

  const detailHost = cfg.detailHost || null;

  function paintDetail(row) {
    if (!detailHost || !cfg.renderDetail) return;
    detailHost.classList.remove('d-none');
    detailHost.classList.add('ev-sl-detail');
    detailHost.innerHTML = cfg.renderDetail(row);
    if (cfg.scrollDetailIntoView === true) {
      detailHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function hideDetail() {
    if (!detailHost) return;
    detailHost.classList.add('d-none');
    detailHost.innerHTML = '';
  }

  const api = (isCoreUiDeskList() ? mountCoreUiCardTable : mountEvDeskListWell)(host, {
    ...cfg,
    scrollList: true,
    minRows: cfg.minRows ?? SCROLL_LIST_DEFAULTS.minRows,
    padRows: cfg.minRows ?? SCROLL_LIST_DEFAULTS.minRows,
    maxHeightCss: cfg.maxHeight ?? cfg.maxHeightCss ?? SCROLL_LIST_DEFAULTS.maxHeight,
    searchPlaceholder: cfg.searchPlaceholder ?? SCROLL_LIST_DEFAULTS.searchPlaceholder,
    metaLabel: cfg.metaLabel ?? SCROLL_LIST_DEFAULTS.metaLabel,
    rowKey,
    selectedId,
    onRowSelect: (row, id) => {
      selectedId = id;
      if (cfg.renderDetail && detailHost) paintDetail(row);
      cfg.onSelect?.(row, id);
      cfg.onRowSelect?.(row, id);
    },
    afterPaint: (ctx) => {
      if (selectedId && detailHost && cfg.renderDetail) {
        const row = ctx.visible?.find((r) => rowKey(r) === selectedId);
        if (row) paintDetail(row);
      }
      cfg.afterPaint?.(ctx);
    }
  });

  return {
    setItems: api.setItems.bind(api),
    setEmptyHtml: api.setEmptyHtml.bind(api),
    refresh: api.refresh.bind(api),
    getFilter: api.getFilter?.bind(api),
    getSort: api.getSort?.bind(api),
    els: api.els,
    select(id) {
      selectedId = id ?? null;
      if (typeof api.select === 'function') api.select(selectedId);
      else api.refresh();
    },
    getSelectedId: () => selectedId,
    setCollapsed(next) {
      api.setCollapsed?.(next);
    },
    getCollapsed: () => (typeof api.getCollapsed === 'function' ? api.getCollapsed() : false),
    clearDetail() {
      selectedId = null;
      hideDetail();
      if (typeof api.select === 'function') api.select(null);
      else api.refresh();
    }
  };
}

export { SCROLL_LIST_DEFAULTS };
export default mountEvScrollList;
