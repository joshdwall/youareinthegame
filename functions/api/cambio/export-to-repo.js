/**
 * POST /api/cambio/export-to-repo
 * Commits content/runtime-config.json (+ optional placements) to main via GitHub API
 * when GITHUB_TOKEN Pages secret is set (Infisical-managed). Otherwise returns docs-only.
 */
import { requireAccess, json } from '../../_shared/cambio-auth.js';
import { readRuntimeConfig, PLACEMENTS_KV_KEY } from '../../_shared/runtime-config.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const denied = requireAccess(request, url);
  if (denied) return denied;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error: 'github_token_missing',
      docs: 'Set Pages secret GITHUB_TOKEN from Infisical /sites/youareinthegame (repo scope). Until then, agents periodically snapshot KV → git. SSOT: KV is live; git is the versioned fallback.'
    }, 501);
  }

  const { config } = await readRuntimeConfig(env);
  let placements = null;
  try {
    placements = await env.YAITG_SESSION_KV.get(PLACEMENTS_KV_KEY, 'json');
  } catch (_) {}

  const owner = 'joshdwall';
  const repo = 'youareinthegame';
  const branch = 'main';
  const files = [
    { path: 'content/runtime-config.json', content: JSON.stringify(config, null, 2) + '\n' }
  ];
  if (placements) {
    files.push({
      path: 'content/cambio-placements.json',
      content: JSON.stringify(placements, null, 2) + '\n'
    });
  }

  const results = [];
  for (const f of files) {
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${f.path}?ref=${branch}`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'yaitg-cambio-export' } }
    );
    const existing = getRes.ok ? await getRes.json() : null;
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${f.path}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'yaitg-cambio-export'
        },
        body: JSON.stringify({
          message: `chore(cambio): export runtime snapshot from KV`,
          content: btoa(unescape(encodeURIComponent(f.content))),
          branch,
          sha: existing?.sha
        })
      }
    );
    const body = await putRes.json().catch(() => ({}));
    results.push({ path: f.path, status: putRes.status, ok: putRes.ok, commit: body.commit?.sha });
  }

  const ok = results.every((r) => r.ok);
  return json({ ok, results });
}
