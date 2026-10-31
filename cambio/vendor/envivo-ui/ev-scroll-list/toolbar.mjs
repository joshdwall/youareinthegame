/**
 * ev-scroll-list toolbar — search + checkbox filters, flush on table top.
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object[]} rows
 * @param {string} query
 * @param {string[]} fields
 */
export function filterBySearch(rows, query, fields) {
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
 * @param {object[]} rows
 * @param {{ id: string, match: (row: object) => boolean }[]} filterDefs
 * @param {Set<string>} activeIds
 */
export function filterByCheckboxes(rows, filterDefs, activeIds) {
  if (!filterDefs?.length || !activeIds?.size) return rows;
  const active = filterDefs.filter((f) => activeIds.has(f.id));
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => f.match(row)));
}

/**
 * @param {{
 *   searchId: string,
 *   clearId: string,
 *   searchPlaceholder?: string,
 *   filters?: { id: string, label: string, default?: boolean }[]
 * }} opts
 */
export function scrollListToolbarHtml(opts) {
  const filters = opts.filters || [];
  const filterHtml = filters.length
    ? filters
        .map(
          (f) =>
            `<label class="ev-sl-toolbar__filter">
          <input type="checkbox" class="form-check-input ev-sl-filter" data-filter-id="${escapeHtml(f.id)}"${
              f.default ? ' checked' : ''
            } />
          <span>${escapeHtml(f.label)}</span>
        </label>`
        )
        .join('')
    : '';

  return `
    <div class="ev-sl-toolbar" data-ev-bind="scroll-list-toolbar">
      <div class="ev-sl-toolbar__section ev-sl-toolbar__search">
        <input type="text" class="ev-sl-search" id="${escapeHtml(opts.searchId)}"
          placeholder="${escapeHtml(opts.searchPlaceholder || 'Search…')}" autocomplete="off" spellcheck="false" />
        <button type="button" class="ev-sl-clear" id="${escapeHtml(opts.clearId)}" title="Clear search">Clear</button>
      </div>
      ${filters.length ? `<div class="ev-sl-toolbar__section ev-sl-toolbar__filters">${filterHtml}</div>` : ''}
      <div class="ev-sl-toolbar__section ev-sl-toolbar__meta"><span class="ev-desk-list__meta" id="${escapeHtml(opts.metaId || '')}"></span></div>
    </div>`;
}

/**
 * @param {HTMLElement} host
 * @param {{ searchId: string, clearId: string, filters?: { id: string, default?: boolean }[], onChange: () => void }} opts
 * @returns {{ getQuery: () => string, getActiveFilterIds: () => Set<string>, clearSearch: () => void }}
 */
export function bindScrollListToolbar(host, opts) {
  const searchEl = /** @type {HTMLInputElement|null} */ (host.querySelector(`#${CSS.escape(opts.searchId)}`));
  const clearEl = host.querySelector(`#${CSS.escape(opts.clearId)}`);
  const activeFilterIds = new Set(
    (opts.filters || []).filter((f) => f.default).map((f) => f.id)
  );

  if (searchEl) {
    searchEl.type = 'text';
    searchEl.removeAttribute('results');
    searchEl.removeAttribute('autosave');
    searchEl.removeAttribute('inputmode');
    searchEl.setAttribute('spellcheck', 'false');
    searchEl.classList.remove('form-control', 'form-control-sm');
  }
  searchEl?.addEventListener('input', () => opts.onChange());
  clearEl?.addEventListener('click', () => {
    if (searchEl) searchEl.value = '';
    opts.onChange();
  });

  host.querySelectorAll('.ev-sl-filter').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.getAttribute('data-filter-id');
      if (!id) return;
      if (el.checked) activeFilterIds.add(id);
      else activeFilterIds.delete(id);
      opts.onChange();
    });
  });

  return {
    getQuery: () => searchEl?.value || '',
    getActiveFilterIds: () => activeFilterIds,
    clearSearch: () => {
      if (searchEl) searchEl.value = '';
    }
  };
}
