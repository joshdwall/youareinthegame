/**
 * Site-root URL helpers — registry paths are relative to the site mount,
 * not to runtime/*.js (dynamic import resolves against the importing module).
 */

/** Site root = parent of /runtime/ */
export function getSiteRootUrl() {
  return new URL('../', import.meta.url);
}

/**
 * Resolve a registry module path (./vignettes/..., ./global-effects/...) to an absolute URL.
 * @param {string} modulePath
 * @returns {string}
 */
export function resolveSiteModule(modulePath) {
  if (!modulePath) throw new Error('Missing module path');
  if (/^(https?:|data:)/i.test(modulePath)) return modulePath;
  const clean = String(modulePath).replace(/^\.\//, '');
  return new URL(clean, getSiteRootUrl()).href;
}

/**
 * Resolve an asset path for img/src (relative to site root; safe on gateway mounts).
 * Leading "/" is treated as site-root, not gateway root.
 * @param {string} assetPath
 * @returns {string}
 */
export function resolveSiteAsset(assetPath) {
  if (!assetPath) return assetPath;
  if (/^(https?:|data:|blob:)/i.test(assetPath)) return assetPath;
  const clean = String(assetPath).replace(/^\.\//, '').replace(/^\//, '');
  return new URL(clean, getSiteRootUrl()).pathname + new URL(clean, getSiteRootUrl()).search;
}
