# Changelog — youareinthegame.com

All notable changes to [joshdwall/youareinthegame](https://github.com/joshdwall/youareinthegame).
Dates are America/Chicago. Production = Cloudflare Pages project **youareinthegame-web** (git build on `main`; zero GitHub Actions).

SSOT for cross-project PM/changelog: [joshdwall/knowledge-hub](https://github.com/joshdwall/knowledge-hub) (`pm/projects/youareinthegame/`, `changelog/`).

## 2026-10-30 (America/Chicago) — Cambio content-fit columns + sidebar normalize

- **Ask:** Column headers in scroll lists too wide for content — investigate original enVivo `mountEvScrollList` (fixed cols / `table-layout:fixed` / `width:100%` / th min-width / colgroup); use recommended content-fit so each column auto-fits its widest cell/header with horizontal scroll for overflow. Also standardize/normalize/compact **both** Cambio sidebars (uniform enVivo btn-sm, one label size, one input height, consistent card pad/gap); define scoped CSS tokens under `#cambioRoot`.
- **Root cause:** (1) Cambio passed `%` column `width`s (contract anti-pattern). (2) enVivo autofit SL-27 leftover→flex + `width:100%` stretches columns past content. (3) Prior h-scroll helper set `table.style.minWidth='100%'` which stretched every column; disconnecting the autofit RO also dropped content measure.
- **Fix:** Drop `%` widths; set `fit:'content'` on all list columns. Rewrite `enableCambioListHScroll` to the SL-27 **measure** path without grow-to-fill: nowrap → measure max(header, body) → colgroup px widths → `table.width = sum`, `overflow-x:auto`. `#cambioRoot` tokens (`--cambio-fs-label/body/ctrl`, `--cambio-ctrl-h`, `--cambio-gap/pad/card-pad`) unify `.btn` / `.ie-btn` / inputs / labels / cards in both rails.
- Checkpoint `checkpoint-2026-10-30-pre-cambio-colfit-normalize`. Playwright `tests/cambio-colfit-normalize-test.mjs` (th≈body, no minWidth 100%, uniform btn/input heights, h-scroll, isolation). cards-hscroll + isolation + edit-sidebar still green. Screenshots `/workspace/capture/cambio-colfit-normalize/` and `/workspace/cambio-colfit-normalize-shots/`.
- YAITG `61f2680` → CF Pages deploy `11fd5d19-4d07-4a24-acb1-ce2799da30c2` (production aliases: apex, www, app).

## 2026-10-30 (America/Chicago) — Cambio list horizontal scroll + compact settings cards

- **Ask:** Scrollable lists (main sidebar + editor item lists) must scroll horizontally when content is wider than the rail so nothing is clipped (enVivo overflow-x:auto / nowrap; header stays aligned). Non-list options/settings in both sidebars → enVivo/CoreUI cards (`card` / `card-header` / `card-body`, compact) by logical section; put inputs side-by-side in a flex-wrap row at content width (≈6ch numbers, inline checkboxes, auto selects); keep per-setting ✎/✓/✕.
- **Fix:** `enableCambioListHScroll` after `mountEvScrollList` paint disconnects autofit RO (which forced `width:100%` + ellipsis) and sets wrap `overflow-x:auto` + table `width:max-content` / `table-layout:auto` with nowrap cells; sticky thead kept. Site settings, edit Animation settings, and selected-object controls wrap in CoreUI cards with `.cambio-settings-compact` flex row.
- Heights (view mode): site settings **157 → 99px**; edit Animation block **131 → 89px**; selected controls **419 → 181px**.
- Checkpoint `checkpoint-2026-10-30-pre-cambio-cards-hscroll`. Playwright `tests/cambio-cards-hscroll-test.mjs` (h-scroll both lists, `.card` wrapping, input widths, before/after heights, isolation). Isolation + envivo-sizes + edit-sidebar still green. Screenshots `/workspace/capture/cambio-cards-hscroll/` and `/workspace/cambio-cards-hscroll-shots/`.
- YAITG `5510706` → CF Pages deploy `b7023fa9-a785-418c-89ec-85f6636fe03d` (production aliases: apex, www, app).

## 2026-10-30 (America/Chicago) — Cambio edit sidebar = same enVivo CoreUI chrome + item scroll-list

- **Ask:** Extend the main Cambio sidebar style (CoreUI `#sidebar`, hamburger + title, compact sizes, scoped CSS, overlay-only) to the full Edit panel; title = animation name. List animation items (overlays, object actions/action points, effects) via the same `mountEvScrollList` with enVivo defaults (single-row, square buttons, fonts) and per-row Select/Edit/Delete; row select = stage select. Keep per-setting pencils ✓/✕ isolated.
- **Fix:** `#editSection` is now `sidebar sidebar-fixed sidebar-overlaid sidebar-end` with the same header chrome as `#sidebar` (shell rules broadened to `#editSection`). Right rail collapses via `#cambioRoot[data-edit-sidebar-collapsed]` + `.hide`/`.show` (CoreUI overlaid end needs `.show` or negative `margin-right` pushes it off-screen). Items mount in `#editItemListHost` through `mountEvScrollList` (`buildEditItems` / `selectEditItem` / `refreshEditItemList`). Transition + Preview object actions pencils remain above the list and stay mode-scoped.
- Checkpoint `checkpoint-2026-10-30-pre-cambio-editor-sidebar`. Playwright `tests/cambio-edit-sidebar-test.mjs` (header height/fonts match main; item list; select→stage; collapse overlay-only; isolation still green). Screenshots `/workspace/capture/cambio-edit-sidebar/` and `/workspace/cambio-edit-sidebar-shots/`.
- YAITG `6b685fa` → CF Pages deploy `d46c029a-1bea-4a1a-b0c2-057854393896` (production aliases: apex, www, app).

## 2026-10-30 (America/Chicago) — Cambio enVivo header spacing + compact scroll-list defaults

- **Bug:** Sidebar brand "Cambio" overlapped the hamburger toggler (absolute toggler vs padded flex brand). Scroll list rows wrapped, buttons were oversized/rounded, and fonts were larger than enVivo `mountEvScrollList` defaults — Name/Live/Tier/Weight/%/Actions clipped horizontally in the sidebar.
- **Fix:** Port enVivo shell header layout into `cambio/vendor/envivo-ui/sidebar-shell.css` (rail vars `--ev-rail-tog-left` / `--ev-rail-brand-x`; absolute toggler + brand, no overlap). Match scroll-list defaults: single-row `nowrap`+ellipsis, square controls (`--ev-radius:0`, compact `btn-sm`), `--ev-sl-row-font`/`--ev-sl-head-font` unchanged. Remove wrap/size-inflating overrides in `cambio.css` / `cambio.js`. Local enVivo fixture `cambio/envivo-ref/` for side-by-side Playwright.
- Checkpoint `checkpoint-2026-10-30-pre-cambio-envivo-sizes`. Playwright `tests/cambio-envivo-sizes-test.mjs` (header boxes, nowrap, radius 0, font sizes, no overflow; isolation still green). Screenshots `/workspace/capture/cambio-envivo-sizes/` and `/workspace/cambio-envivo-sizes-shots/` (side-by-side header/list/sidebar).
- YAITG `122be4c` → CF Pages deploy `386f443a-7741-4dee-80b1-ce08848236da` (production aliases: apex, www, app).

## 2026-10-30 (America/Chicago) — Cambio overlay isolation (sidebar must not affect page)

- **Bug:** Collapsing/expanding the Cambio hamburger mutated `body.sidebar-narrow` / `body.cambio-sidebar-collapsed` and zeroed `--cambio-rail-width`, so the live youareinthegame.com stage under the harness reflowed (badge clearance, layout). Cambio is an overlay harness — one UI must not affect the page behind.
- **Fix:** `#cambioRoot` hosts all CoreUI/enVivo chrome (`sidebar-overlaid` fixed overlay). Sidebar state is `data-sidebar-collapsed` on `#cambioRoot` + `#sidebar.hide` only — never body/html. Collapse slides/hides the overlay (`transform`/`visibility`); no page width/margin/transform/canvas/resize. CoreUI + enVivo CSS scoped under `#cambioRoot` via `cambio/vendor/scoped/*` (`scripts/scope-cambio-vendor-css.mjs`). Public stage firewall locks `#siteStage` layout to match apex.
- Checkpoint `checkpoint-2026-10-30-pre-cambio-isolate`. Playwright `tests/cambio-overlay-isolation-test.mjs` (rects/styles/canvas identical expanded↔collapsed; matches public; no resize; clicks work). Screenshots `/workspace/capture/cambio-isolate/` and `/workspace/cambio-isolate-shots/`.
- YAITG `656b38b` → CF Pages deploy `3d34a618-7275-4c8b-94a4-610ea81bc41f` (production aliases: apex, www, app).

## 2026-10-30 (America/Chicago) — Cambio full Edit + sidebar hamburger

- **Full Edit restored/visible.** Row Actions had Play/Click/Edit/Archive in markup but Edit was clipped by table overflow after the envivo-ui remount. Edit now sits next to Play (enVivo `btn btn-sm btn-outline-dark` + `border-radius:0`), actions wrap with overflow visible, and the selected-row detail bar also exposes Edit. Opens the right-rail full animation editor (pencils + Save placements); git history: same `data-act="edit"` / `enterEdit` path as pre-pf-kit desk list.
- **Hamburger collapses entire sidebar.** CoreUI/enVivo `header-toggler` + `header-toggler-icon` in `#sidebar .sidebar-header` (`#evSidebarToggle`). Toggle uses `body.sidebar-narrow` (+ `cambio-sidebar-collapsed`); collapsed width 0 so the stage/canvas takes the space. Persists `localStorage['cambio.sidebar.show']` (mirrors enVivo `envivo.sidebar.show`). Floating `#cambioSidebarReopen` when collapsed.
- Checkpoint `checkpoint-2026-10-30-pre-edit-hamburger`. Playwright `tests/edit-hamburger-test.mjs` (Edit→editor+save, hamburger expand/collapse). Screenshots `/workspace/capture/edit-hamburger/`. YAITG `b01c3e9` → CF Pages deploy `5173c577-fc47-4df7-b032-5ec0b8c9cd06` (production aliases: apex, www, app).

## 2026-10-30

### Changed
- **Live click threshold + dark→light reset fade (KV, no redeploy).** Was build-time `GHOST_CONFIG.LIGHTNING` MIN=**5** / MAX=**10**; now `runtime-config.settings.clickThresholdMin/Max` default **3** / **5** (≈half, floor 3). Public `/api/animations` serves `settings` (~15s cache). Cambio left-rail pencils ✎/✓/✕. Composite path no longer snaps sage — restores SporeBaseEffect `background-color` transition (`stormResetDurationMs`, default **1500**); activation flash stays instant. Playwright: `tests/live-settings-fade-test.mjs` (luminance samples over time). YAITG `74f357d` → CF Pages deploy `5bb82aa6-29ef-4788-a3b2-aa447e495642` (production). Live KV edit verified: settings 4/4/900 → API without redeploy; restored to 3/5/1500.


### Changed
- **Cambio uses enVivo CoreUI `#sidebar` + `mountEvScrollList`** (same as live envivo-dashboard / features). Pin via `scripts/sync-envivo-ui.mjs` → `cambio/vendor/envivo-ui/` (enVivo rev in `ENVIVO_PIN.json`). Brand **Cambio** once; wider sidebar; animation list = Live/Tier/Weight/%/Actions. Not pf-kit / od-sidebar unless that is what enVivo renders (it is not). Checkpoint `checkpoint-2026-10-30-pre-envivo-components`. YAITG `069ccc6` → CF Pages deploy `143ccc8f-f496-4f81-baa0-6078e17247fd` (production aliases: apex, www, app).

### Added
- **`previewObjectActions` (default false)** on each animation. Character-click / Click-preview spores show overlay composites but do **not** run object actions (guns) unless the flag is on. Real activation always runs object actions. Cambio pencil ✎/✓/✕ on the edit rail; PATCH `/api/cambio/animations/:id`. Playwright: `tests/preview-object-actions-test.mjs`.

### Changed
- **Cambio consumes site-hub components directly (no look-alikes).** Deleted vendored imitation `cambio/vendor/{desk-list.mjs,envivo-sidebar.css,pf-desk-list.css}`. Pin `site-hub-v2026.10.09` (rev `830a4b88508ddd266eab6cfa543118a859179384`) via `scripts/sync-site-hub-pf-kit.mjs` → `cambio/vendor/pf-kit/` (assemble-style). Menu = real `od-sidebar` (brand **Cambio** once, wider `--cambio-sidebar-width: 36rem`). Animation list = `mountDeskListCard` default TABLE (Name, Live, Tier, Weight, %, Actions) with component search/scroll. Checkpoint `checkpoint-2026-10-30-pre-sitehub-consume`. Plan req: *Cambio must consume site-hub components directly; no re-implementations.* Screenshots: `capture/sitehub-vs-cambio/`.

### Fixed
- **“Now with Spores!” badge is non-interactive** on apex/www and Cambio: `pointer-events: none`, no pointer cursor / hover affordance; sticker click handler removed. Clicks pass through to the background (normal background spore) — never a character click or badge action. Playwright coverage in `tests/cambio-modal-badge-test.mjs`. Backlog: dedicated badge animation sequence (future).


### Added
- **Loot table + IMMEDIATE live CRUD.** Weighted pick on public click threshold (`chance = weight / sum`); launch cowboy **3** / ghost **1** → **75/25**. Runtime config in KV `cambio:runtime-config` (git seed fallback). Public `GET /api/animations` (~15s cache). Access CRUD: `/api/cambio/runtime-config`, `/api/cambio/animations`, `/api/cambio/animations/:id`, `/api/cambio/assets` (R2 `youareinthegame-assets`, quota warn 60% / block 80%), `/api/cambio/export-to-repo`. Cambio: searchable list, Live checkbox (immediate), tier/weight/live %, Create / Archive; ghost placement locked. Public apex runs ActivationEngine for cowboy (parity with Cambio); ghost climax unchanged. Checkpoint `checkpoint-2026-10-30-pre-loot-table` @ `b533e72`. Tests: `tests/loot-table-weights.test.mjs` (400 sims ±5%), `tests/loot-public-activation-test.mjs`.


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
