# YAITG session assignment — Pages Function setup

Server-side character/vignette roll for **youareinthegame-mvp** (and production later).

## Endpoints

| Runtime | URL |
|---------|-----|
| Cloudflare Pages | `GET /api/session-assignment` |
| Local gateway `:8765` | `GET /api/yaitg/session-assignment` |

Browser loads assignment via `runtime/SessionAssignment.js` when `content/session-policy.json` → `workerPhase2.enabled: true`.

## Behavior

1. Valid signed `yaitg_session` cookie → return same assignment until `expiresAt`.
2. New visitors → weighted roll from `characters-registry.json` + `vignettes-registry.json`.
3. IP rate limit on **new** rolls (default 12/hour production, 30/hour local gateway).
4. URL override on localhost + `youareinthegame-mvp.pages.dev`: `?character=pirate-mushroom&vignette=cannons`.

## KV (optional, recommended for production)

```powershell
cd <repo root>
wrangler kv namespace create YAITG_SESSION_KV
# Paste id into wrangler.toml [[kv_namespaces]]
```

Bind in Cloudflare dashboard: **Workers & Pages** → **youareinthegame-mvp** → **Settings** → **Bindings** → KV `YAITG_SESSION_KV`.

Without KV, rate limiting uses Cache API (Pages) or local `.harness/yaitg-rate-limit/` (gateway).

## Secrets

Set in Pages project **Settings** → **Environment variables** (production):

| Variable | Purpose |
|----------|---------|
| `YAITG_SESSION_SECRET` | HMAC cookie signing (long random string) |
| `YAITG_RATE_MAX` | Max new sessions per IP per window (default `12`) |
| `YAITG_RATE_WINDOW_SEC` | Rate window seconds (default `3600`) |

Local dev uses `dev-yaitg-session-secret-change-me` unless `YAITG_SESSION_SECRET` is set in env.

## Verify

```powershell
# Gateway up
curl -s "http://127.0.0.1:8765/api/yaitg/session-health"

# Assignment (sets cookie)
curl -s -c - "http://127.0.0.1:8765/api/yaitg/session-assignment"

# Staging
curl -s "https://youareinthegame-mvp.pages.dev/api/session-assignment"
```

## DNS

**Do not** point `youareinthegame.com` at MVP until operator sign-off. MVP URL only: `https://youareinthegame-mvp.pages.dev/`.
