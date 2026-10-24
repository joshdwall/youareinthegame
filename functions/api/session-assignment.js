/**
 * Cloudflare Pages Function — GET /api/session-assignment
 * Server-side character/vignette roll with signed cookie + IP rate limit.
 */
export { onRequestGet } from '../_shared/session-assignment-core.js';
