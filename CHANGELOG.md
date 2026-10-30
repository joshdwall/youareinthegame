# Changelog — youareinthegame.com

All notable changes to [joshdwall/youareinthegame](https://github.com/joshdwall/youareinthegame).
Dates are America/Chicago. Production = Cloudflare Pages project **youareinthegame-web** (git build on `main`; zero GitHub Actions).

SSOT for cross-project PM/changelog: [joshdwall/knowledge-hub](https://github.com/joshdwall/knowledge-hub) (`pm/projects/youareinthegame/`, `changelog/`).

## 2026-10-30

### Fixed
- **Cowboy Play mini spores invisible** during activation. Root cause: composite profile launched spores via a short radial fade from `boxInContainer`/`flashParent` coordinates (creature-rig space) with z-index 8 under `.creature-rig` (10), so replicas were either off the fixed `#siteStage` origin, clipped, or stacked behind the character — not the FireworkManager/SporeBaseEffect path ghost uses (viewport center + `LAUNCH_OFFSET_Y`). Fix: same FireworkManager launch + ghost spawn origin; mini cowboy composites sized near ghost spore sprites; z-index 25; image preload before scale. Playwright asserts cowboy spores in viewport, opacity > 0.5, size ≥ 24px, top-most via `elementFromPoint`, and spawn origin within ~10px of ghost @ 1920×1080 & 1366×768. Side-by-side frames: `capture/yaitg-activation/spore-side-by-side-*.png`.

### Fixed
- **Cowboy Play duplicated the base character** during activation flash. Root cause: ActivationEngine composite profile built a full-size `CharacterComposite` (base + accessories) beside live `#mainCreature`, so two platypuses appeared. Fix: flash flickers accessories mounted on the live character via the same `mountProps` / objectAnchor→characterAnchor path as edit mode (`flashHost: #overlayLayer`); mini spores stay small base+overlay composites; reset clears overlays and leaves the character untouched. Playwright @ 1920×1080 & 1366×768 asserts exactly 1 full-size base and accessory bbox ≤2px vs edit-mode while floating.

### Tests
- **Activation Playwright** (`tests/cambio-activation-test.mjs`): @ 1920×1080 & 1366×768 — apex ghost threshold vs Cambio ghost Play (flash/spores/reset parity); cowboy Play accessories at saved placements + mini composite spores + reset. Frame captures under `capture/yaitg-activation/`.

### Changed
- **Cowboy Play** uses the shared activation engine with saved placements (KV/seed SSOT): lightning + composite flash (hat, mustache, left/right pistols) + mini cowboy spore replicas + reset. Manifest `playMode: character-overlay`. Public apex still ghost-only.

### Added
- **Character-overlay activation engine** (`effects/activation/`): shared Play/threshold sequence — transition + overlay flash + spore replicas + reset. Ghost profile uses apex assets/timings (`GHOST_CONFIG` + FireworkManager). Composite profile builds a CharacterComposite for flash and mini spores.

### Fixed
- **Cambio ghost Play** was a stub (dim + static sprites). Play now runs the activation engine so flash/spores/reset match the public apex threshold animation. Root cause: `playGhostSample()` never loaded GhostEffect/SporeBaseEffect.

### Checkpoint
- **Cowboy placements SSOT** (`checkpoint-2026-10-30-cowboy-placed`): git tag + bundle; KV dump `data/cambio-placements.checkpoint.json`; KV backup key `cambio:placements:backup:2026-10-30-cowboy-placed`; seed `content/cambio-placements.json` synced to operator-approved placements. Activation Play plan phases A–D start from this checkpoint.

### Fixed
- **Selected-object prompts** (`move-select-1`): connector/move hints no longer hard-code “hat”. Prompts, markers, hit targets, and field writes follow `selectedElementId` with labels hat / mustache / left pistol / right pistol. Playwright covers all 4 objects.

### Changed
- **Move mode** (renamed from Position): prominent **✎ Move** in the edit rail. Drag-to-stick with grab-offset (no jump); float-safe characterAnchor updates; ✓ keeps `objectAnchor` and writes only `characterAnchor` (scale/rotation untouched). Survives Save + reload while floating.


### Fixed
- **Cambio modal pencil editors + connector hit-testing** (`modal-badge-1`): each property (Connector, Rotation, Position, Size, Transition) edits only via ✎ → ✓/✕ (enVivo inline-edit look). Cancel restores a deep snapshot; modes write only their own fields. Root causes: (a) `.cambio-overlay.editing { pointer-events: auto }` blocked creature clicks on connector step 2 — fixed with overlay passthrough + creature hit-test; prop drag no longer runs outside Position mode. (b) Always-live scale slider + non-modal UI caused accidental size changes — Size mode isolates `scale`. Playwright: field isolation save/cancel + real `mouse.click` two-click connectors at 1920×1080 and 1366×768 — ALL PASS.

### Changed
- **“Now with Spores!” badge** fixed to viewport **bottom-right** on apex/www and Cambio (desktop + mobile). CSS variables `--badge-corner`, `--badge-size`, `--badge-right`, `--badge-bottom`, `--badge-z` (+ safe-area insets). Cambio shifts `--badge-right` clear of the right edit rail when editing. Cache-bust `?v=modal-badge-1`. Plan: knowledge-hub `3f211ae0`.


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
