# youareinthegame

Source of truth for **youareinthegame.com** (Mushroom Platypus). It is self-contained and builds without site-hub or any local path.

## Architecture
- **Static site** (`index.html`, `script.js`, `mainConfig.js`, `styles.css`) boots from JSON registries:
  - `content/characters-registry.json`: characters (sprites, accessories such as the pirate hat, default and allowed vignettes)
  - `content/vignettes-registry.json`: click/storm packs (spores, cannons, ghost-storm) with weights, projectiles and props
  - `content/global-effects-registry.json`: transitions (lightning, feather-poof)
  - `content/session-policy.json`: session TTL, pools, URL override hosts
- `runtime/`: `SessionAssignment` (weighted roll + TTL; server-assigned when Phase 2 is enabled), `CharacterRuntime`, `VignetteLoader`, `GlobalEffectRunner`
- `vignettes/<id>/effect.js`, `global-effects/<id>/effect.js`, `effects/spore/*`: the effect modules
- `assets/characters/<id>/`, `assets/vignettes/<id>/`: swappable art. To add a character or hat, drop the art in and add a registry row.
- `functions/api/session-assignment.js` (+ `functions/_shared/*`): the Cloudflare Pages Function for `GET /api/session-assignment` (signed cookie, IP rate limit, optional KV `YAITG_SESSION_KV`, secret `YAITG_SESSION_SECRET`).

## Commands
```
npm run build    # stage static output into dist/
npm run verify   # session-roll + animation-preview smoke tests
npm run dev      # wrangler pages dev (static + Functions locally)
npm run compare:staging [origin]   # hash-compare dist/ with a deployed origin
```
Deploy and promote follow knowledge-hub `plans/site-hub/YouAreInTheGame-CF-Native-Deploy-Promote-Plan.md`: preview first, production only after operator sign-off. Secrets come from Infisical and are never committed. Pages project config: output dir `dist`, build command `npm run build`.

## Other folders
- `config/site-hub-harness/`: legacy site-hub harness metadata (not used by the build)
- `reference/site-hub/`: the old local-gateway session handler, kept for reference only (superseded by `npm run dev`)
- `docs/SESSION-WORKER-SETUP.md`: KV/secret setup notes


## Deploy (Cloudflare git build, zero GitHub Actions minutes)
- Pages project `youareinthegame-web` is connected to this repo. Every push to `main` is built by Cloudflare (`npm run build` → `dist`) and goes **straight to production** (youareinthegame.com, www). Branch previews are off.
- Verify after a deploy: `bash scripts/verify-site.sh https://youareinthegame.com` (needs `npm run build` locally for the asset list and `npx playwright install chromium` for the click gate).
- Rollback: in the Cloudflare dashboard, open Pages → youareinthegame-web → Deployments → Rollback (or the API `POST .../deployments/<id>/rollback`).
- Bindings live on the Pages project and in `wrangler.toml` (KV id, rate vars). `YAITG_SESSION_SECRET` is a Pages secret whose source of truth is Infisical `/sites/youareinthegame`.

### Cambio admin releases

The permanent editor URL is [Cambio](https://app.youareinthegame.com/cambio/).
The apex and www redirect legacy Cambio links and keep the costume query.
Public costume URLs, including short links such as `/?chef`, stay on the apex.

The public Pages project `youareinthegame-web` builds main. The separate
`youareinthegame-admin` project takes approved main commits only when an
operator dispatches **Promote Cambio admin**. Both use the production
costume KV and asset bucket so a saved costume can become available
without a code release. Access remains on the admin hostname.

For the initial cutover, record the current deployment and DNS target.
Run the admin promotion and verify its deployment alias returns 404.
Move only the app custom domain to the new project with the existing
Access policy in place. Verify unauthenticated requests reach Access,
then sign in and check the costume list, assets, and playtest. Roll
back by restoring the app domain to the former Pages project if this
initial verification fails. After cutover, use the admin project's
deployment history for admin rollbacks and the public project's
deployment history for public rollbacks.
