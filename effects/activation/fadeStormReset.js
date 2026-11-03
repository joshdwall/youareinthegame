/**
 * Gradual dark→light background fade on activation reset.
 * Flash at activation stays instant; only the return to sage fades.
 * Historical path (SporeBaseEffect endLightningSequence):
 *   container.style.transition = `background-color ${STORM_RESET_DURATION}ms ease-out`
 *   container.style.backgroundColor = BACKGROUND_COLOR
 */

export const DEFAULT_STORM_RESET_MS = 1500;
export const DEFAULT_BACKGROUND = '#7ab5a0';
const pendingClears = new WeakMap();

/**
 * @param {HTMLElement | null} container
 * @param {{ durationMs?: number, backgroundColor?: string, clearAfter?: boolean }} [opts]
 * @returns {number} duration used
 */
export function fadeStormResetToLight(container, opts = {}) {
  if (!container) return 0;
  const durationMs = Math.max(
    200,
    Math.floor(Number(opts.durationMs) || DEFAULT_STORM_RESET_MS)
  );
  const backgroundColor = opts.backgroundColor || DEFAULT_BACKGROUND;
  const clearAfter = opts.clearAfter !== false;
  clearTimeout(pendingClears.get(container));

  // Ensure we transition FROM the current computed dark color TO light
  const current = getComputedStyle(container).backgroundColor;
  container.style.transition = 'none';
  container.style.backgroundColor = backgroundColor;
  if (getComputedStyle(container).backgroundColor === current) {
    container.style.transition = '';
    pendingClears.delete(container);
    return 0;
  }
  container.style.backgroundColor = current;
  // Force style flush so the next transition animates
  void container.offsetHeight;
  container.style.transition = `background-color ${durationMs}ms ease-out`;
  container.style.backgroundColor = backgroundColor;

  if (clearAfter) {
    const t = setTimeout(() => {
      if (container.style.transition.includes('background-color')) {
        container.style.transition = '';
      }
      pendingClears.delete(container);
    }, durationMs);
    pendingClears.set(container, t);
    return durationMs;
  }
  return durationMs;
}
