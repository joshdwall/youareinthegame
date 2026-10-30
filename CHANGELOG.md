# Changelog — youareinthegame.com

All notable changes to [joshdwall/youareinthegame](https://github.com/joshdwall/youareinthegame).
Dates are America/Chicago. Production = Cloudflare Pages project **youareinthegame-web** (git build on `main`; zero GitHub Actions).

SSOT for cross-project PM/changelog: [joshdwall/knowledge-hub](https://github.com/joshdwall/knowledge-hub) (`pm/projects/youareinthegame/`, `changelog/`).

## 2026-10-30

### Changed
- **Cambio connector-point attach + rotation + overlay harness** (`cowboy-connectors-1`): hat asset rotated −90° CCW (was stored crown-right / brim-vertical; no EXIF) so brim is horizontal; placement schema v2 `{objectAnchor, characterAnchor, rotation, scale, transition}` with migrate from v1 x/y; edit-mode rotation slider/numeric + rotate handle; two-click connectors (object then character) with markers + reset; props parented on `.creature-rig` float (bob with character); layout = real public site stage with left anim rail / right Edit rail overlays (character stays clear). MVP flag `preloadedAccessories` on animations (cowboy false). Apex remains ghost-only; no pages.dev.

### Changed
- **Final cowboy art** replaces Delapouite/game-icons SVG placeholders in `assets/animations/cowboy/` (`hat.webp`, `mustache.webp`, `revolver-l.webp`, `revolver-r.webp`). Operator-owned art; CC-BY attribution removed. Transparent WebP; manifest `?v=cowboy-final-1` cache-bust. Dedicated L/R revolvers (barrel outward); seed `flipX` false; Cambio prefers manifest flipX so saved KV placements keep positions/sizes without double-flipping. Public apex remains ghost-only.

### Added
- **Cambio admin** at `https://app.youareinthegame.com/cambio` — seasonal animation harness, cowboy Delapouite placeholders, KV `cambio:placements` on `YAITG_SESSION_KV`, Access on `app.` ([`27b9c91`](https://github.com/joshdwall/youareinthegame/commit/27b9c9193166cec64bab99a32a9dfa709582886a)). Public apex remains ghost-only.
- Plan: knowledge-hub `plans/site-hub/YouAreInTheGame-Random-Seasonal-Animations-Cambio-Plan.md` (`337dff5a`, marked implemented `4b356b6e`).

### Security
- Cambio login switched to **Cloudflare IdP** (same pattern as enVivo/COMPA; not email OTP); reusable Admin policy ([`199ed2f`](https://github.com/joshdwall/youareinthegame/commit/199ed2f0c02f389a7196ab6fab8e5afae6f114ae)).
- **pages.dev lockdown:** `functions/_middleware.js` returns 404 for `youareinthegame-web.pages.dev` / `*.youareinthegame-web.pages.dev`; Access also covers those hosts.
- **No-preview rule:** `preview_deployment_setting: none`; do not promote via pages.dev unless the operator asks (knowledge-hub `176c474b`, `workflows/agent-autonomous-merge-promote.md`).

### Open (PM)
- Operator Save round-trip check on Cambio placements.
- Promote cowboy into the public pool; seasonal pools.
- ~~Final cowboy art~~ (shipped this day).
- Old Pages/Replit resource cleanup — waiting on operator okay.

## 2026-10-27

### Docs
- knowledge-hub [#190](https://github.com/joshdwall/knowledge-hub/pull/190) — YAITG status (ghost-only live, CF git build, cache fix, multi-effect paused, cleanup pending) ([`2d5de1eb`](https://github.com/joshdwall/knowledge-hub/commit/2d5de1ebc517784325acbb6dfe45aa268b7be295)).

## 2026-10-26

### Changed
- **PR [#6](https://github.com/joshdwall/youareinthegame/pull/6)** — Restore previous ghost-only implementation verbatim from youareinthegame.replit.app (`script.js`, `styles.css`, `defaultSpore.js`, ghost config); drop multi-vignette runtime/cannons/global effects + hop/ring from build; keep no-selection fix; no-cache `_headers` + versioned assets; ghost-only click test ([`a343a0e`](https://github.com/joshdwall/youareinthegame/commit/a343a0eee57d2c30d44982ded8b493e461fa1cf1)). Deploy `1e7f6aea-7ab3-4e87-8a6c-322480282aad`.
- **PR [#5](https://github.com/joshdwall/youareinthegame/pull/5)** — Character hop/squash + ring click ([`c6ca116`](https://github.com/joshdwall/youareinthegame/commit/c6ca116de3a8cfc2c903c6fe5ab22983c65451ae)); superseded same day by PR #6.

## 2026-10-24

### Added
- **PR [#1](https://github.com/joshdwall/youareinthegame/pull/1)** — Recover registry/vignette MVP into the repo; self-contained Pages + Functions build ([`ddae994`](https://github.com/joshdwall/youareinthegame/commit/ddae99449a6fae26f8376fd151846244a988fdf6)).
- **PR [#2](https://github.com/joshdwall/youareinthegame/pull/2)** — CF-native Pages preview path / project naming ([`eee1a60`](https://github.com/joshdwall/youareinthegame/commit/eee1a6010d6b9d5f606b6796403c7dc12c1583fc)).
- **PR [#3](https://github.com/joshdwall/youareinthegame/pull/3)** — Standard cloud promote + **click fix** (session-roll from `runtime/shared`); drop box deploy script ([`2ee9263`](https://github.com/joshdwall/youareinthegame/commit/2ee9263af7046998d36d3dab6df827c418357e2d)).
- **PR [#4](https://github.com/joshdwall/youareinthegame/pull/4)** — **CF-native git build cutover**: deploy via Cloudflare git build on Pages **youareinthegame-web**; remove Actions promote; Replit routes removed; domains apex/www on youareinthegame-web ([`c0011ec`](https://github.com/joshdwall/youareinthegame/commit/c0011eca32c0621b74a7bddd82a3b4b5482a834d)).
