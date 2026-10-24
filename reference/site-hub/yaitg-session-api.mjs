/**
 * Vite middleware — /api/yaitg/session-assignment for local gateway dev.
 */
import { handleYaitgSessionAssignment, yaitgSessionHealth } from '../lib/yaitg-session-gateway-handler.mjs';

const SESSION_PATH = '/api/yaitg/session-assignment';
const HEALTH_PATH = '/api/yaitg/session-health';

function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v);
  }
  if (body.retryAfterSec) {
    res.setHeader('Retry-After', String(body.retryAfterSec));
  }
  res.end(JSON.stringify(body));
}

/**
 * @returns {import('vite').Plugin}
 */
export function yaitgSessionApiPlugin() {
  return {
    name: 'recovering-yaitg-session-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];

        if (req.method === 'GET' && urlPath === HEALTH_PATH) {
          sendJson(res, 200, { ok: true, ...yaitgSessionHealth() });
          return;
        }

        if (req.method === 'GET' && urlPath === SESSION_PATH) {
          try {
            const result = await handleYaitgSessionAssignment(req);
            const headers = {};
            if (result.setCookie) headers['Set-Cookie'] = result.setCookie;
            sendJson(res, result.status, result.body, headers);
          } catch (err) {
            console.error('[yaitg-session-api]', err);
            sendJson(res, 500, { ok: false, error: 'Internal error' });
          }
          return;
        }

        next();
      });
    }
  };
}
