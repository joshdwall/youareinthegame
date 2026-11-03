import { requireAccess, json } from '../../_shared/cambio-auth.js';
import { readRuntimeConfig, writeRuntimeConfig, normalizeConfig } from '../../_shared/runtime-config.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  const { config, source } = await readRuntimeConfig(env);
  return json({ ok: true, source, config });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const incoming = body?.config || body;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.animations)) {
    return json({ ok: false, error: 'invalid_shape' }, 400);
  }
  try {
    const config = await writeRuntimeConfig(env, {...normalizeConfig(incoming),costumeLibraryRevision:incoming.costumeLibraryRevision});
    return json({ ok: true, config });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 422);
  }
}
