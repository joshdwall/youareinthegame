/**
 * Desk control HTML helpers — SSOT markup for operator/LAN desks.
 * Pair with pf-desk-controls.css (.od-body scope) + pf-dom-contract constants.
 */

import {
  PF_DESK_PAGE_TOOLBAR,
  PF_DESK_LIST_SEARCH,
  PF_DESK_LIST_UNIT,
  PF_BTN_SECONDARY,
  PF_BTN_DESK_SM,
} from '../constants/pf-dom-contract.mjs';

/** @param {string} s */
function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Standard list toolbar: search + Clear (×) + optional extras + Refresh.
 * Order: Filter → Clear → extraHtml → Refresh (Clear stays adjacent to the filter).
 * Clear empties the filter input; Refresh reloads list data (caller wires click).
 * @param {{
 *   searchId: string,
 *   searchPlaceholder: string,
 *   searchAriaLabel?: string,
 *   clearId?: string,
 *   clearLabel?: string,
 *   showClear?: boolean,
 *   refreshId?: string,
 *   refreshLabel?: string,
 *   showRefresh?: boolean,
 *   extraHtml?: string,
 *   toolbarClass?: string,
 * }} opts
 */
export function renderDeskListToolbar(opts) {
  const toolbarClass = opts.toolbarClass || PF_DESK_PAGE_TOOLBAR;
  const aria = opts.searchAriaLabel
    ? ` aria-label="${escAttr(opts.searchAriaLabel)}"`
    : '';
  const extra = opts.extraHtml || '';
  const showClear = opts.showClear !== false;
  const showRefresh = opts.showRefresh !== false;
  const clearId = opts.clearId || `${opts.searchId}-clear`;
  const refreshId = opts.refreshId || `${opts.searchId}-refresh`;
  const clearLabel = opts.clearLabel || '×';
  const refreshLabel = opts.refreshLabel || 'Refresh';
  const clearBtn = showClear
    ? `<button type="button" class="${PF_BTN_DESK_SM} pf-desk-list-clear" id="${escAttr(clearId)}" title="Clear filter" aria-label="Clear filter">${escAttr(clearLabel)}</button>`
    : '';
  const refreshBtn = showRefresh
    ? `<button type="button" class="${PF_BTN_DESK_SM} pf-desk-list-refresh" id="${escAttr(refreshId)}" title="Refresh" aria-label="Refresh">${escAttr(refreshLabel)}</button>`
    : '';

  return (
    `<div class="${toolbarClass}">` +
    `<input type="search" class="${PF_DESK_LIST_SEARCH}" id="${escAttr(opts.searchId)}"` +
    ` placeholder="${escAttr(opts.searchPlaceholder)}"${aria} autocomplete="off" />` +
    clearBtn +
    extra +
    refreshBtn +
    `</div>`
  );
}

/**
 * Wrap search toolbar + list scroll/table as one bordered control unit.
 * @param {{ toolbarHtml: string, bodyHtml: string, unitClass?: string }} opts
 */
export function renderDeskListUnit(opts) {
  const unitClass = opts.unitClass ? ` ${opts.unitClass}` : '';
  return (
    `<div class="${PF_DESK_LIST_UNIT}${unitClass}">` +
    (opts.toolbarHtml || '') +
    (opts.bodyHtml || '') +
    `</div>`
  );
}

/** Re-export for routes that need secondary without desk-sm alias */
export { PF_BTN_DESK_SM, PF_BTN_SECONDARY };
