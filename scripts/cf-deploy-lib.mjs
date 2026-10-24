/**
 * Minimal Cloudflare Worker deploy over the REST API (no wrangler login, no GitHub Actions).
 * Same file in joshdwall/political-consequences, joshdwall/political-data and the
 * knowledge-hub quick-MVP template. Secrets come from Infisical at run time and stay in
 * memory: never printed, never written to disk.
 *
 * Credentials, in order:
 *   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env (if already loaded by the caller), else
 *   Infisical Universal Auth (INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET env):
 *   project INFISICAL_PROJECT_ID (default secrets-managment), env prod, path /cloudflare,
 *   keys `agents-write` and `CLOUDFLARE_ACCOUNT_ID` (reference/envivo-secrets-map.md).
 */
import fs from 'node:fs';

const INFISICAL = process.env.INFISICAL_API_URL || 'https://app.infisical.com';
const PROJECT = process.env.INFISICAL_PROJECT_ID || '41982513-3430-4531-a227-9aa124fe024d';
const CF = 'https://api.cloudflare.com/client/v4';

let infToken = null;
async function infisicalLogin() {
  if (infToken) return infToken;
  const { INFISICAL_CLIENT_ID: clientId, INFISICAL_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) throw new Error('Set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET (Universal Auth).');
  const res = await fetch(`${INFISICAL}/api/v1/auth/universal-auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret })
  });
  if (!res.ok) throw new Error(`Infisical login failed (${res.status})`);
  infToken = (await res.json()).accessToken;
  return infToken;
}

/** Read every secret at an Infisical path. Returns a plain object; never logs values. */
export async function infisicalPath(secretPath) {
  const tok = await infisicalLogin();
  const q = new URLSearchParams({ workspaceId: PROJECT, environment: 'prod', secretPath });
  const res = await fetch(`${INFISICAL}/api/v3/secrets/raw?${q}`, { headers: { authorization: `Bearer ${tok}` } });
  if (!res.ok) throw new Error(`Infisical read ${secretPath} failed (${res.status})`);
  return Object.fromEntries((await res.json()).secrets.map((s) => [s.secretKey, s.secretValue]));
}

export async function cloudflareCreds() {
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    return { token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID };
  }
  const s = await infisicalPath('/cloudflare');
  if (!s['agents-write'] || !s.CLOUDFLARE_ACCOUNT_ID) throw new Error('Infisical /cloudflare is missing agents-write or CLOUDFLARE_ACCOUNT_ID');
  return { token: s['agents-write'], account: s.CLOUDFLARE_ACCOUNT_ID };
}

export function cfClient({ token, account }) {
  async function call(method, path, body, contentType = 'application/json') {
    const res = await fetch(`${CF}${path.replace('{account}', account)}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': contentType } : {}) },
      body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body
    });
    const out = await res.json().catch(() => ({}));
    if (!out.success) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(out.errors || out).slice(0, 300)}`);
    return out.result;
  }
  async function upload(path, form) {
    const res = await fetch(`${CF}${path.replace('{account}', account)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
    const out = await res.json().catch(() => ({}));
    if (!out.success) throw new Error(`upload ${path} -> ${res.status} ${JSON.stringify(out.errors || out).slice(0, 400)}`);
    return out.result;
  }
  return { call, upload, account };
}

/**
 * Deploy one Worker from a wrangler.json-shaped config:
 *   { name, compatibility_date, compatibility_flags, vars, durable_objects.bindings,
 *     routes: [{ pattern, zone_name }], triggers.crons, workers_dev }
 * `secrets` is a { NAME: value } map set as secret_text (values never logged).
 */
export async function deployWorker(cf, config, bundlePath, { secrets = {}, log = console.log } = {}) {
  const name = config.name;
  const code = fs.readFileSync(bundlePath);
  const bindings = [
    ...Object.entries(config.vars || {}).map(([k, v]) => ({ type: 'plain_text', name: k, text: String(v) })),
    ...((config.durable_objects?.bindings) || []).map((b) => ({
      type: 'durable_object_namespace', name: b.name, class_name: b.class_name, ...(b.script_name ? { script_name: b.script_name } : {})
    }))
  ];
  const metadata = {
    main_module: 'worker.js',
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags || [],
    bindings,
    keep_bindings: ['secret_text']
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  await cf.upload(`/accounts/{account}/workers/scripts/${name}`, form);
  log(`[deploy] ${name}: uploaded ${(code.length / 1024).toFixed(0)} KiB`);

  for (const [key, text] of Object.entries(secrets)) {
    if (!text) continue;
    await cf.call('PUT', `/accounts/{account}/workers/scripts/${name}/secrets`, { name: key, text, type: 'secret_text' });
    log(`[deploy] ${name}: secret ${key} set`);
  }
  await cf.call('POST', `/accounts/{account}/workers/scripts/${name}/subdomain`, { enabled: config.workers_dev !== false });
  await cf.call('PUT', `/accounts/{account}/workers/scripts/${name}/schedules`, (config.triggers?.crons || []).map((cron) => ({ cron })));
  log(`[deploy] ${name}: crons ${JSON.stringify(config.triggers?.crons || [])}`);

  const zones = new Map();
  for (const route of config.routes || []) {
    if (!zones.has(route.zone_name)) {
      const z = await cf.call('GET', `/zones?name=${encodeURIComponent(route.zone_name)}`);
      zones.set(route.zone_name, { id: z[0].id, routes: await cf.call('GET', `/zones/${z[0].id}/workers/routes`) });
    }
    const zone = zones.get(route.zone_name);
    const existing = zone.routes.find((r) => r.pattern === route.pattern);
    if (!existing) {
      await cf.call('POST', `/zones/${zone.id}/workers/routes`, { pattern: route.pattern, script: name });
      log(`[deploy] route + ${route.pattern}`);
    } else if (existing.script !== name) {
      await cf.call('PUT', `/zones/${zone.id}/workers/routes/${existing.id}`, { pattern: route.pattern, script: name });
      log(`[deploy] route ~ ${route.pattern} (was ${existing.script})`);
    } else {
      log(`[deploy] route = ${route.pattern}`);
    }
  }
}

/** Curl-style checks: [{ url, status, contains?, header? }]. Throws on the first failure. */
export async function verify(checks, { log = console.log, retries = 6 } = {}) {
  for (const c of checks) {
    let last = '';
    for (let i = 0; i < retries; i += 1) {
      const res = await fetch(c.url, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
      const text = await res.text();
      const okStatus = res.status === (c.status || 200);
      const okText = !c.contains || text.includes(c.contains);
      const okHeader = !c.header || res.headers.get(c.header[0])?.includes(c.header[1]);
      if (okStatus && okText && okHeader) { log(`[verify] ok ${res.status} ${c.url}`); last = ''; break; }
      last = `${res.status} ${c.url} (want ${c.status || 200}${c.contains ? `, "${c.contains}"` : ''})`;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (last) throw new Error(`[verify] failed ${last}`);
  }
}
