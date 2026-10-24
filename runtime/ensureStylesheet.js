/**
 * Idempotent stylesheet loader (site-relative hrefs).
 * @param {string} href
 * @returns {Promise<void>}
 */
export function ensureStylesheet(href) {
  if (!href) return Promise.resolve();
  const existing = [...document.querySelectorAll('link[data-yaitg-href]')].find(
    (l) => l.dataset.yaitgHref === href
  );
  if (existing) {
    return existing.dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error(`stylesheet ${href}`)), {
            once: true
          });
        });
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.yaitgHref = href;
    link.onload = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}
