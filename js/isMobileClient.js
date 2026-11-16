/**
 * Shared mobile / iOS-desktop-mode detection.
 * "Request Desktop Website" on iPhone/iPad spoofs a Macintosh UA but keeps
 * multi-touch, so a UA-only sniff would wrongly take the desktop path.
 * Real desktops (MacIntel with maxTouchPoints <= 1) stay desktop.
 *
 * @param {Pick<Navigator,'userAgent'|'vendor'|'platform'|'maxTouchPoints'> & {opera?: string}} [nav]
 * @returns {boolean}
 */
export function isMobileClient(nav) {
  const src = nav || (typeof navigator !== 'undefined' ? navigator : {});
  const opera = typeof window !== 'undefined' ? window.opera : '';
  const userAgent = String(src.userAgent || src.vendor || opera || '');
  const ua = userAgent.toLowerCase();
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return true;
  }
  const touch = Number(src.maxTouchPoints) || 0;
  if (touch <= 1) return false;
  const platform = String(src.platform || '');
  // iPhone / iPad Request Desktop Website: Macintosh UA or MacIntel platform.
  return /macintel|macintosh|ipad|iphone/i.test(`${platform} ${userAgent}`);
}

export default isMobileClient;
