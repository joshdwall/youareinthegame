/** Query token appended to module URLs so Safari/Chrome do not keep stale effects/*.js. */
export const CACHE_BUST = 'spore-timing2';

/**
 * @param {string} url
 * @returns {string}
 */
export function withCacheBust(url) {
  const value = String(url || '');
  if (!value || /[?&]v=/.test(value)) return value;
  return `${value}${value.includes('?') ? '&' : '?'}v=${CACHE_BUST}`;
}

export default withCacheBust;
