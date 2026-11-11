# Changelog — youareinthegame.com

All notable changes to [joshdwall/youareinthegame](https://github.com/joshdwall/youareinthegame).
Dates are America/Chicago. Production = Cloudflare Pages project **youareinthegame-web** (git build on `main`; zero GitHub Actions).

SSOT for cross-project PM/changelog: [joshdwall/knowledge-hub](https://github.com/joshdwall/knowledge-hub) (`pm/projects/youareinthegame/`, `changelog/`).


- **Public site image protect:** Creature, sticker, overlays, spore images: `draggable=false`, `contextmenu` preventDefault, CSS `-webkit-touch-callout:none`, `-webkit-user-drag:none`, `user-select:none`. No hit-shield / no `pointer-events:none` on creature (would steal threshold clicks). Clicks/taps, spore bursts, overlays unchanged.
- YAITG `2e77f99` → CF Pages deploy **`313f4f53-b262-4817-9371-b77afc4c1c08`** (production aliases: apex, www, app). Local + prod image-protect PASS; uniform-actions Playwright PASS.

## 2026-11-11 (America/Chicago) — Shared Tap For Spores cache for Cambio (pt69u)

- `/img/tap-for-spores.png` cache `max-age=60, must-revalidate` + `Access-Control-Allow-Origin: *` so Cambio at `app.youareinthegame.com` can load the live site's badge as the single source and pick up replacements quickly. Other `/img/*` stay immutable. Markup and image bytes unchanged. Follow-up: Pages `_headers` was appending the `/img/*` immutable policy onto this file; a targeted Function overwrite now sets a single `max-age=60` Cache-Control.
- Checkpoint `checkpoint-2026-11-11-pre-shared-tap-badge` @ `a905bd2`.

## 2026-11-01 (America/Chicago) — LIVE KV only: restore ghost BOO direction 90→-90



## 2026-11-01 (America/Chicago) — ghost BOO direction opposite (config)



- Promote: ghost BOO textProjectile + longer hold-fade to production.

## 2026-11-01 (America/Chicago) — preview: ghost BOO textProjectile

- New generic `objectActions` type **`textProjectile`** (config: text, color, fontWeight, durationMs, distance/distanceRatio, mouth `point`, direction, …).
- Ghost firework spores shoot black bold ALL-CAPS **BOO** from the mouth (facing direction, ~550ms fade/scale); mobile uses viewport spread + clamp.
- Activation always runs OA; click-preview only when `previewObjectActions` (unchanged).
- **Preview only** — local commit on `main`, do **not** push (main = prod). Deploy via `wrangler pages deploy --branch=preview-ghost-boo`.

## 2026-11-01 (America/Chicago) — OverlayPlayer standard: ghost never missing after cowboy

- **Bug (prod `5466cc3` / deploy `43efdccb`):** First ghost climax overlay OK; cowboy `ActivationEngine` removed `#effectOverlay`; later ghost cycles called `SporeBaseEffect.showOverlay` on a **detached** node → flash with no visible overlay.
- **Fix / standard:** Every culmination (ghost, cowboy, future) uses one **`OverlayPlayer`** lifecycle (`effects/activation/OverlayPlayer.js` + `overlayProfiles.js`): preload+decode, **fresh owned layer per run**, shared flash timings, cleanup removes owned layers only (never bare `#effectOverlay` / live `#overlayLayer` host). Apex threshold routes ghost through `activate({ profile: 'ghost' })` same as cowboy composite. `SporeBaseEffect` no longer keeps a persistent climax `#effectOverlay`. Host opacity reset to `'0'` (not `''`).
- Checkpoint `checkpoint-2026-11-01-pre-overlay-standard-fix`. Manual Playwright ≥6 alternate cycles (+ mobile 390×844) — **not** wired into `npm run verify`. Screenshots `tmp/overlay-standard-verify/{desktop,mobile}/`.
- Plans: knowledge-hub overlay-standard plan (pt50u). Keep prior: instant boot, image budget, logging, favicon, mobile clamp, cowboy scale.
- YAITG `7033a95` → CF Pages deploy `8050e161-e093-411b-b555-7a3c774047e0` (production aliases: apex, www, app). Prod manual Playwright 6 cycles desktop + mobile PASS.

## 2026-10-31 — Fix alternate cursor: last-played (not upcoming) so cowboy is not skipped

- **Bug:** `yaitg.selectionCursor.lastId` was written when *picking upcoming*, so a reload advanced past the queued animation. After ghost → cowboy queued, refresh skipped cowboy and stuck on ghost; cowboy transition looked "missing".
- **Fix:** Cursor schema **v2** stores `lastPlayedId` only in `recordPlayed()` after activation completes (ghost `onFinaleComplete` + composite path). `pickUpcoming` no longer mutates the cursor. v1 blobs ignored (clean start).
- Tests: `tests/selection-cursor-last-played.test.mjs`; Playwright `tests/alternate-reload-cowboy-test.mjs` (ghost↔cowboy with/without reload; cowboy flash/overlays/spores/guns). Screenshots `/workspace/cowboy-transition-shots/`.
- YAITG `9278f5d` → CF Pages deploy `38f818ab-dcb9-4c0a-9e45-c1d2b60ab7f5` (production aliases: apex, www, app). Prod verify: ghost↔cowboy with/without reload; cowboy transition screenshots `/workspace/cowboy-transition-shots/`.

## 2026-10-31 — Always interactive during transitions + interactionOpacityDuringAnimation

- **Always interactive:** During activation flash, running activation, and reset fade (any former click-ignore window), click/tap still spawns the **default spore burst** at the point — no overlays / object actions. **Decorative only** (does not increment click threshold, storm progress, or next-pick). Overlay `pointer-events:none` kept so clicks pass through.
- CSS `--spore-opacity` on `@keyframes explode`; `__stormResetFadeUntil` covers composite fade after finale flags clear.
- YAITG `f591b4f` → CF Pages deploy `d6b91824-573d-49e0-8fb2-e30529dea5d8` (production aliases: apex, www, app). Live KV verified: opacity 0.55 → API without redeploy; restored to 0.8.

## 2026-10-31 — Selection mode: alternate (round-robin) + 50/50 weights

- **Alternate**: cycles LIVE eligible animations by stable `order` (then id). Per-visitor cursor in `localStorage` (`yaitg.selectionCursor` v2: index + lastPlayedId written on activation complete); survives add/remove by continuing after last-played id. (v1 wrote upcoming-as-lastId — fixed 2026-10-31.) Character-click preview = next pick. Scales to 1000+.
- **Weights** cowboy/ghost set to **1/1 (50/50)** in seed + live KV (was 3/1 → 75/25).
- Tests: `tests/loot-table-alternate.test.mjs` (A,B,A,B; 1,2,3,1; 1000 synthetic; mid-cycle; mode switch); weight test pinned to `weighted`.


- YAITG `61f2680` → CF Pages deploy `11fd5d19-4d07-4a24-acb1-ce2799da30c2` (production aliases: apex, www, app).


- **Ask:** Scrollable lists (main sidebar + editor item lists) must scroll horizontally when content is wider than the rail so nothing is clipped (enVivo overflow-x:auto / nowrap; header stays aligned). Non-list options/settings in both sidebars → enVivo/CoreUI cards (`card` / `card-header` / `card-body`, compact) by logical section; put inputs side-by-side in a flex-wrap row at content width (≈6ch numbers, inline checkboxes, auto selects); keep per-setting ✎/✓/✕.
- Heights (view mode): site settings **157 → 99px**; edit Animation block **131 → 89px**; selected controls **419 → 181px**.
- YAITG `5510706` → CF Pages deploy `b7023fa9-a785-418c-89ec-85f6636fe03d` (production aliases: apex, www, app).


- YAITG `6b685fa` → CF Pages deploy `d46c029a-1bea-4a1a-b0c2-057854393896` (production aliases: apex, www, app).


- YAITG `122be4c` → CF Pages deploy `386f443a-7741-4dee-80b1-ce08848236da` (production aliases: apex, www, app).


- YAITG `656b38b` → CF Pages deploy `3d34a618-7275-4c8b-94a4-610ea81bc41f` (production aliases: apex, www, app).


- **Full Edit restored/visible.** Row Actions had Play/Click/Edit/Archive in markup but Edit was clipped by table overflow after the envivo-ui remount. Edit now sits next to Play (enVivo `btn btn-sm btn-outline-dark` + `border-radius:0`), actions wrap with overflow visible, and the selected-row detail bar also exposes Edit. Opens the right-rail full animation editor (pencils + Save placements); git history: same `data-act="edit"` / `enterEdit` path as pre-pf-kit desk list.
- Checkpoint `checkpoint-2026-10-30-pre-edit-hamburger`. Playwright `tests/edit-hamburger-test.mjs` (Edit→editor+save, hamburger expand/collapse). Screenshots `/workspace/capture/edit-hamburger/`. YAITG `b01c3e9` → CF Pages deploy `5173c577-fc47-4df7-b032-5ec0b8c9cd06` (production aliases: apex, www, app).

## 2026-10-30

### Changed


### Changed

### Added

### Changed

### Fixed


### Added


### Fixed
- **Cowboy Play mini spores invisible** during activation. Root cause: composite profile launched spores via a short radial fade from `boxInContainer`/`flashParent` coordinates (creature-rig space) with z-index 8 under `.creature-rig` (10), so replicas were either off the fixed `#siteStage` origin, clipped, or stacked behind the character — not the FireworkManager/SporeBaseEffect path ghost uses (viewport center + `LAUNCH_OFFSET_Y`). Fix: same FireworkManager launch + ghost spawn origin; mini cowboy composites sized near ghost spore sprites; z-index 25; image preload before scale. Playwright asserts cowboy spores in viewport, opacity > 0.5, size ≥ 24px, top-most via `elementFromPoint`, and spawn origin within ~10px of ghost @ 1920×1080 & 1366×768. Side-by-side frames: `capture/yaitg-activation/spore-side-by-side-*.png`.

### Fixed
- **Cowboy Play duplicated the base character** during activation flash. Root cause: ActivationEngine composite profile built a full-size `CharacterComposite` (base + accessories) beside live `#mainCreature`, so two platypuses appeared. Fix: flash flickers accessories mounted on the live character via the same `mountProps` / objectAnchor→characterAnchor path as edit mode (`flashHost: #overlayLayer`); mini spores stay small base+overlay composites; reset clears overlays and leaves the character untouched. Playwright @ 1920×1080 & 1366×768 asserts exactly 1 full-size base and accessory bbox ≤2px vs edit-mode while floating.

### Tests

### Changed
- **Cowboy Play** uses the shared activation engine with saved placements (KV/seed SSOT): lightning + composite flash (hat, mustache, left/right pistols) + mini cowboy spore replicas + reset. Manifest `playMode: character-overlay`. Public apex still ghost-only.

### Added
- **Character-overlay activation engine** (`effects/activation/`): shared Play/threshold sequence — transition + overlay flash + spore replicas + reset. Ghost profile uses apex assets/timings (`GHOST_CONFIG` + FireworkManager). Composite profile builds a CharacterComposite for flash and mini spores.

### Fixed

### Checkpoint

### Fixed
- **Selected-object prompts** (`move-select-1`): connector/move hints no longer hard-code “hat”. Prompts, markers, hit targets, and field writes follow `selectedElementId` with labels hat / mustache / left pistol / right pistol. Playwright covers all 4 objects.

### Changed
- **Move mode** (renamed from Position): prominent **✎ Move** in the edit rail. Drag-to-stick with grab-offset (no jump); float-safe characterAnchor updates; ✓ keeps `objectAnchor` and writes only `characterAnchor` (scale/rotation untouched). Survives Save + reload while floating.


### Fixed

### Changed


### Changed

### Changed

### Added

### Security
- **pages.dev lockdown:** `functions/_middleware.js` returns 404 for `youareinthegame-web.pages.dev` / `*.youareinthegame-web.pages.dev`; Access also covers those hosts.
- **No-preview rule:** `preview_deployment_setting: none`; do not promote via pages.dev unless the operator asks (knowledge-hub `176c474b`, `workflows/agent-autonomous-merge-promote.md`).

### Open (PM)
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
