/**
 * Desk list filter wiring (site-kit SSOT).
 * Client-side search/filter for desk list cards + compact tables.
 * Promoted from operator-dashboard/lib/list-filter.mjs so all sites share it.
 */

/**
 * @template T
 * @param {T[]} items
 * @param {string} query
 * @param {(item: T) => string} textFn
 * @returns {T[]}
 */
export function filterByQuery(items, query, textFn) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return items;
  return items.filter((item) => textFn(item).toLowerCase().includes(q));
}

/**
 * @param {HTMLInputElement|null} input
 * @param {(query: string) => void} onChange
 */
export function bindListSearch(input, onChange) {
  if (!input) return;
  input.addEventListener('input', () => onChange(input.value));
}

/**
 * Clear button → empty filter input and re-fire `input` (so bindListSearch runs).
 * @param {HTMLElement|null} clearBtn
 * @param {HTMLInputElement|null} input
 */
export function bindListFilterClear(clearBtn, input) {
  if (!clearBtn || !input) return;
  clearBtn.addEventListener('click', () => {
    if (!input.value) {
      input.focus();
      return;
    }
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
}

/**
 * Delegated Clear (×) for all desk list toolbars under `root`.
 * Safe to call once at app boot — works for dynamically rendered lists.
 * @param {ParentNode} [root]
 */
export function installDeskListFilterClears(root = document) {
  const el = /** @type {ParentNode & { addEventListener?: Function }} */ (root);
  if (!el?.addEventListener) return;
  el.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target : null);
    const btn = t?.closest?.('.pf-desk-list-clear');
    if (!btn) return;
    if (root !== document && root instanceof Node && !root.contains(btn)) return;
    const scope =
      btn.closest('.pf-desk-list-unit') ||
      btn.closest('.pf-desk-page-toolbar') ||
      btn.closest('.pf-desk-list-toolbar');
    const input = /** @type {HTMLInputElement|null} */ (
      scope?.querySelector('input.pf-desk-list-search, input[type="search"].pf-input')
    );
    if (!input) return;
    if (!input.value) {
      input.focus();
      return;
    }
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
}

/**
 * @param {HTMLElement|null} el
 * @param {number} shown
 * @param {number} total
 */
export function updateFilterMeta(el, shown, total) {
  if (!el) return;
  if (total === 0) el.textContent = 'empty';
  else if (shown === total) el.textContent = `${total}`;
  else el.textContent = `${shown}/${total}`;
}
