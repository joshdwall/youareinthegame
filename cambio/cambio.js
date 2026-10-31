import { runActivation, previewClick, activate } from '/effects/activation/ActivationEngine.js';
import { applyElementPlacement, measureCreatureBoxInHost } from '/effects/activation/placementMath.js';
import { escapeHtml } from '/cambio/vendor/envivo-ui/desk-list.mjs';
import { mountEvScrollList } from '/cambio/vendor/envivo-ui/ev-scroll-list/mount.mjs';
/** @type {ReturnType<typeof mountEvScrollList>|null} */
let animDeskList = null;
/**
 * Cambio admin — Play / Edit with modal pencil editors (enVivo ✎/✓/✕).
 * Modes write only their own fields; Cancel restores a deep snapshot.
 * Public apex behavior unchanged; Access-gated on app.youareinthegame.com.
 */
const state = {
  manifest: null,
  runtimeConfig: null,
  tiers: null,
  flags: null,
  seasons: null,
  anchors: null,
  placements: null,
  selectedAnim: null,
  editMode: false,
  selectedElementId: null,
  dirty: false,
  animFilter: '',
  /** null | 'connector' | 'rotation' | 'move' | 'size' | 'transition' | 'action' | 'previewObjectActions' | 'clickThreshold' | 'stormResetDuration' */
  activeMode: null,
  /** Deep clone of element (or transitionId) when mode opened */
  modeSnapshot: null,
  /** null | 'object' | 'character' — only while activeMode === 'connector' */
  connectorPick: null,
  /** null | 'point' | 'direction' — while activeMode === 'action' */
  actionPick: null,
  /** Working fire action while editing */
  actionDraft: null
};

const $ = (id) => document.getElementById(id);
const editSection = $('editSection');
const elementList = $('elementList');
const overlay = $('overlayLayer');
const markerLayer = $('markerLayer');
const creature = $('mainCreature');
const creatureRig = $('creatureRig');
const flash = $('lightningFlash');
const saveStatus = $('saveStatus');
const transitionSelect = $('transitionSelect');
const selectedControls = $('selectedControls');
const connectorHint = $('connectorHint');

/** Human labels for cowboy (and future) elements — drives prompts + UI. */
const ELEMENT_LABELS = {
  hat: 'hat',
  mustache: 'mustache',
  pistolL: 'left pistol',
  pistolR: 'right pistol'
};

function elementLabel(id) {
  if (!id) return 'object';
  if (ELEMENT_LABELS[id]) return ELEMENT_LABELS[id];
  const el = state.selectedAnim?.elements?.find((e) => e.id === id);
  return el?.label || id;
}

function selectedLabel() {
  return elementLabel(state.selectedElementId);
}


function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function slugify(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `anim-${Date.now()}`;
}

function effectiveWeight(anim) {
  if (anim.weight != null && Number.isFinite(+anim.weight)) return Math.max(0, +anim.weight);
  const tierW = state.tiers?.[anim.tier]?.weight ?? 1;
  const mult = Number.isFinite(+anim.multiplier) ? +anim.multiplier : 1;
  return Math.max(0, tierW * mult);
}

function livePercents() {
  const live = (state.runtimeConfig?.animations || []).filter((a) => a.live && !a.archived);
  const sum = live.reduce((s, a) => s + effectiveWeight(a), 0);
  const map = {};
  for (const a of live) {
    map[a.id] = sum > 0 ? (effectiveWeight(a) / sum) * 100 : 0;
  }
  return map;
}

function syncManifestFromRuntime() {
  if (!state.runtimeConfig) return;
  state.manifest = {
    schemaVersion: state.runtimeConfig.schemaVersion || 1,
    updatedAt: state.runtimeConfig.updatedAt,
    animations: (state.runtimeConfig.animations || []).filter((a) => !a.archived)
  };
  state.tiers = state.runtimeConfig.tiers;
  state.flags = state.runtimeConfig.flags;
  state.settings = state.runtimeConfig.settings || { clickThresholdMin: 3, clickThresholdMax: 5 };
  state.seasons = state.runtimeConfig.seasons || [];
  syncClickThresholdView();
  syncStormResetView();
  syncStormResetView();
}

async function apiJson(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) {
    throw new Error(data.error || `${url} ${r.status}`);
  }
  return data;
}

async function persistRuntime(patchReason) {
  const body = {
    ...state.runtimeConfig,
    updatedAt: new Date().toISOString(),
    reason: patchReason || 'cambio-ui'
  };
  const data = await apiJson('/api/cambio/runtime-config', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  state.runtimeConfig = data.config || body;
  syncManifestFromRuntime();
  renderAnimList();
  return data;
}

async function patchAnimation(id, patch) {
  const data = await apiJson(`/api/cambio/animations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  if (data.config) {
    state.runtimeConfig = data.config;
  } else {
    const idx = state.runtimeConfig.animations.findIndex((a) => a.id === id);
    if (idx >= 0) state.runtimeConfig.animations[idx] = { ...state.runtimeConfig.animations[idx], ...patch };
  }
  syncManifestFromRuntime();
  renderAnimList();
  return data;
}


async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

function migrateElement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const actions = Array.isArray(raw.objectActions)
    ? raw.objectActions.map((a) => ({ ...a, point: a.point ? { x: +a.point.x, y: +a.point.y } : { x: 0.5, y: 0.5 } }))
    : undefined;
  if (raw.characterAnchor && raw.objectAnchor) {
    const out = {
      objectAnchor: { x: +raw.objectAnchor.x, y: +raw.objectAnchor.y },
      characterAnchor: { x: +raw.characterAnchor.x, y: +raw.characterAnchor.y },
      rotation: Number.isFinite(+raw.rotation) ? +raw.rotation : (+raw.rotationDeg || 0),
      scale: Number.isFinite(+raw.scale) ? +raw.scale : (+raw.widthFrac || 0.3),
      transition: raw.transition ?? null,
      flipX: !!raw.flipX
    };
    if (actions) out.objectActions = actions;
    return out;
  }
  const out = {
    objectAnchor: { x: 0.5, y: 0.5 },
    characterAnchor: { x: +raw.x || 0.5, y: +raw.y || 0.5 },
    rotation: +raw.rotationDeg || +raw.rotation || 0,
    scale: +raw.widthFrac || +raw.scale || 0.3,
    transition: raw.transition ?? null,
    flipX: !!raw.flipX
  };
  if (actions) out.objectActions = actions;
  return out;
}

function migratePlacements(data) {
  if (!data?.byAnimation) return { schemaVersion: 2, updatedAt: null, byAnimation: {} };
  const out = {
    schemaVersion: 2,
    updatedAt: data.updatedAt || null,
    byAnimation: {}
  };
  for (const [animId, anim] of Object.entries(data.byAnimation)) {
    const elements = {};
    for (const [elId, el] of Object.entries(anim.elements || {})) {
      elements[elId] = migrateElement(el);
    }
    out.byAnimation[animId] = {
      transitionId: anim.transitionId || 'lightning',
      elements
    };
  }
  return out;
}

async function boot() {
  const [manifestSeed, anchors, seed, runtimeSeed] = await Promise.all([
    loadJson('/content/animations-manifest.json'),
    loadJson('/content/character-anchors.json'),
    loadJson('/content/cambio-placements.json'),
    loadJson('/content/runtime-config.json').catch(() => null)
  ]);
  state.anchors = anchors;
  state.placements = migratePlacements(seed);
  state.runtimeConfig = runtimeSeed;
  try {
    const rc = await apiJson('/api/cambio/runtime-config');
    if (rc?.config) state.runtimeConfig = rc.config;
  } catch (_) { /* seed */ }
  if (!state.runtimeConfig) {
    state.runtimeConfig = {
      schemaVersion: 1,
      tiers: { common: { label: 'Common', weight: 100 }, uncommon: { label: 'Uncommon', weight: 40 }, rare: { label: 'Rare', weight: 10 }, legendary: { label: 'Legendary', weight: 1 } },
      flags: { noRepeatTwice: false },
      seasons: [],
      animations: (manifestSeed.animations || []).map((a) => ({
        ...a,
        live: a.id === 'ghost' || a.id === 'cowboy',
        archived: false,
        tier: 'legendary',
        multiplier: a.id === 'cowboy' ? 3 : 1,
        weight: a.id === 'cowboy' ? 3 : 1
      }))
    };
  }
  syncManifestFromRuntime();
  try {
    const r = await fetch('/api/cambio/placements', { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      if (data?.ok && data.placements) {
        state.placements = migratePlacements(data.placements);
      }
    }
  } catch (_) { /* seed only */ }

  for (const anim of state.manifest.animations) {
    if (anim.preloadedAccessories) {
      mountProps(anim.id, { interactive: false, visible: true });
      break;
    }
  }

  ensureAnimDeskList();
  renderAnimList();
  $('createForm')?.addEventListener('submit', onCreateSubmit);
  $('btnSave').addEventListener('click', savePlacements);
  $('btnExitEdit').addEventListener('click', () => exitEdit());

  $('btnEditTransition').addEventListener('click', () => enterMode('transition'));
  $('btnSaveTransition').addEventListener('click', () => commitMode());
  $('btnCancelTransition').addEventListener('click', () => cancelMode());
  $('btnEditPreviewObjectActions')?.addEventListener('click', () => enterMode('previewObjectActions'));
  $('btnEditClickThreshold')?.addEventListener('click', () => enterMode('clickThreshold'));
  $('btnSaveClickThreshold')?.addEventListener('click', () => commitMode());
  $('btnCancelClickThreshold')?.addEventListener('click', () => cancelMode());
  $('btnEditStormReset')?.addEventListener('click', () => enterMode('stormResetDuration'));
  $('btnSaveStormReset')?.addEventListener('click', () => commitMode());
  $('btnCancelStormReset')?.addEventListener('click', () => cancelMode());
  $('btnSavePreviewObjectActions')?.addEventListener('click', () => commitMode());
  $('btnCancelPreviewObjectActions')?.addEventListener('click', () => cancelMode());
  transitionSelect.addEventListener('change', onTransitionChange);

  $('btnEditConnector').addEventListener('click', () => enterMode('connector'));
  $('btnSaveConnector').addEventListener('click', () => commitMode());
  $('btnCancelConnector').addEventListener('click', () => cancelMode());
  $('btnResetConnectors').addEventListener('click', resetConnectorsInMode);

  $('btnEditRotation').addEventListener('click', () => enterMode('rotation'));
  $('btnSaveRotation').addEventListener('click', () => commitMode());
  $('btnCancelRotation').addEventListener('click', () => cancelMode());
  $('rotationSlider').addEventListener('input', onRotationInput);
  $('rotationNum').addEventListener('input', onRotationInput);

  $('btnEditMove').addEventListener('click', () => enterMode('move'));
  $('btnSaveMove').addEventListener('click', () => commitMode());
  $('btnCancelMove').addEventListener('click', () => cancelMode());

  $('btnEditSize').addEventListener('click', () => enterMode('size'));
  $('btnSaveSize').addEventListener('click', () => commitMode());
  $('btnCancelSize').addEventListener('click', () => cancelMode());
  $('scaleSlider').addEventListener('input', onScaleInput);

  $('btnEditAction').addEventListener('click', () => enterMode('action'));
  $('btnSaveAction').addEventListener('click', () => commitMode());
  $('btnCancelAction').addEventListener('click', () => cancelMode());

  creature.addEventListener('pointerdown', onCreaturePointerDown);
  window.addEventListener('resize', () => {
    if (state.editMode || state.selectedAnim) {
      mountProps(state.selectedAnim?.id, { interactive: state.editMode });
    }
  });
}

function ensureAnimPlacement(id) {
  if (!state.placements.byAnimation) state.placements.byAnimation = {};
  if (!state.placements.byAnimation[id]) {
    state.placements.byAnimation[id] = { transitionId: 'lightning', elements: {} };
  }
  return state.placements.byAnimation[id];
}

function currentElement() {
  if (!state.selectedAnim || !state.selectedElementId) return null;
  return ensureAnimPlacement(state.selectedAnim.id).elements[state.selectedElementId] || null;
}

function markDirty() {
  state.dirty = true;
  saveStatus.textContent = 'Unsaved changes';
}

/* ---------- Modal pencil modes ---------- */


function getClickThresholdSettings() {
  const s = state.settings || state.runtimeConfig?.settings || {};
  let min = Number(s.clickThresholdMin);
  let max = Number(s.clickThresholdMax);
  if (!Number.isFinite(min) || min < 3) min = 3;
  if (!Number.isFinite(max) || max < min) max = Math.max(min, 5);
  return { clickThresholdMin: Math.floor(min), clickThresholdMax: Math.floor(max) };
}


function getStormResetDurationMs() {
  const s = state.settings || state.runtimeConfig?.settings || {};
  let ms = Number(s.stormResetDurationMs);
  if (!Number.isFinite(ms) || ms < 200) ms = 1500;
  return Math.floor(ms);
}

function syncStormResetView() {
  const ms = getStormResetDurationMs();
  const view = $('stormResetView');
  if (view) view.textContent = `${ms}ms`;
  const input = $('stormResetInput');
  if (input && state.activeMode !== 'stormResetDuration') input.value = String(ms);
}

function syncClickThresholdView() {
  const { clickThresholdMin: min, clickThresholdMax: max } = getClickThresholdSettings();
  const view = $('clickThresholdView');
  if (view) view.textContent = `${min}–${max}`;
  const minIn = $('clickThresholdMinInput');
  const maxIn = $('clickThresholdMaxInput');
  if (minIn && state.activeMode !== 'clickThreshold') minIn.value = String(min);
  if (maxIn && state.activeMode !== 'clickThreshold') maxIn.value = String(max);
}

function enterMode(mode) {
  // Site settings (click threshold) — always available; no edit/anim required
  if (mode === 'clickThreshold') {
    if (state.activeMode && state.activeMode !== mode) cancelMode();
    state.activeMode = mode;
    const cur = getClickThresholdSettings();
    state.modeSnapshot = { ...cur };
    const minIn = $('clickThresholdMinInput');
    const maxIn = $('clickThresholdMaxInput');
    if (minIn) minIn.value = String(cur.clickThresholdMin);
    if (maxIn) maxIn.value = String(cur.clickThresholdMax);
    syncModeUi();
    return;
  }
  if (mode === 'stormResetDuration') {
    if (state.activeMode && state.activeMode !== mode) cancelMode();
    state.activeMode = mode;
    const ms = getStormResetDurationMs();
    state.modeSnapshot = { stormResetDurationMs: ms };
    const input = $('stormResetInput');
    if (input) input.value = String(ms);
    syncModeUi();
    return;
  }
  if (!state.editMode || !state.selectedAnim) return;
  if (mode !== 'transition' && mode !== 'previewObjectActions' && !state.selectedElementId) return;
  if (state.activeMode && state.activeMode !== mode) {
    cancelMode();
  }
  state.activeMode = mode;
  if (mode === 'transition') {
    const place = ensureAnimPlacement(state.selectedAnim.id);
    state.modeSnapshot = { transitionId: place.transitionId || 'lightning' };
  } else if (mode === 'previewObjectActions') {
    state.modeSnapshot = { previewObjectActions: !!state.selectedAnim.previewObjectActions };
    const ck = $('previewObjectActionsCheck');
    if (ck) ck.checked = !!state.selectedAnim.previewObjectActions;
  } else {
    const st = currentElement();
    state.modeSnapshot = deepClone(st);
  }
  state.connectorPick = mode === 'connector' ? 'object' : null;
  state.actionPick = mode === 'action' ? 'point' : null;
  state.actionDraft = null;
  document.body.classList.toggle('picking-character', false);
  document.body.classList.toggle('picking-object', mode === 'connector');
  if (mode === 'connector') {
    connectorHint.textContent = `Click a connector point on the ${selectedLabel()}.`;
  }
  if (mode === 'action') {
    const st = currentElement();
    const existing = (st?.objectActions || []).find((a) => a.type === 'fire') || null;
    state.actionDraft = existing
      ? { ...existing, point: { ...existing.point } }
      : { type: 'fire', point: { x: 0.5, y: 0.5 }, direction: 0, pattern: 'alternate', rate: 3.2, jitter: 0.5, appliesTo: ['spore', 'activation'] };
    const ah = $('actionHint');
    if (ah) ah.textContent = `Click the muzzle on the ${selectedLabel()}.`;
  }
  if (mode === 'move') {
    const st = currentElement();
    if (st && (!st.objectAnchor || !Number.isFinite(+st.objectAnchor.x))) {
      st.objectAnchor = { x: 0.5, y: 0.5 };
    }
    const mh = $('moveHint');
    if (mh) mh.textContent = `Drag the ${selectedLabel()} to where it should stick.`;
  }
  syncModeUi();
  mountProps(state.selectedAnim.id, { interactive: true });
}

async function commitMode() {
  if (!state.activeMode) return;
  // Isolation: action mode writes ONLY objectActions on commit.
  if (state.activeMode === 'action' && state.actionDraft) {
    const st = currentElement();
    if (st) {
      const others = (st.objectActions || []).filter((a) => a.type !== 'fire');
      st.objectActions = [...others, { ...state.actionDraft, point: { ...state.actionDraft.point } }];
    }
  }
  if (state.activeMode === 'previewObjectActions' && state.selectedAnim) {
    const ck = $('previewObjectActionsCheck');
    const val = !!ck?.checked;
    state.selectedAnim.previewObjectActions = val;
    try {
      await patchAnimation(state.selectedAnim.id, { previewObjectActions: val });
    } catch (e) {
      console.error(e);
      $('saveStatus').textContent = `Preview object actions save failed: ${e.message || e}`;
    }
  }
  if (state.activeMode === 'clickThreshold') {
    let min = Number($('clickThresholdMinInput')?.value);
    let max = Number($('clickThresholdMaxInput')?.value);
    if (!Number.isFinite(min) || min < 3) min = 3;
    if (!Number.isFinite(max) || max < min) max = Math.max(min, 5);
    min = Math.floor(min);
    max = Math.floor(max);
    const prev = state.runtimeConfig?.settings || state.settings || {};
    const settings = {
      ...prev,
      clickThresholdMin: min,
      clickThresholdMax: max,
      stormResetDurationMs: Number.isFinite(Number(prev.stormResetDurationMs))
        ? Math.floor(Number(prev.stormResetDurationMs))
        : 1500
    };
    state.settings = settings;
    if (state.runtimeConfig) state.runtimeConfig.settings = settings;
    try {
      await persistRuntime('click-threshold');
      syncClickThresholdView();
      $('poolHint').textContent = `Click threshold ${min}–${max} live (next visitors ~15s, no redeploy)`;
    } catch (e) {
      console.error(e);
      $('poolHint').textContent = `Click threshold save failed: ${e.message || e}`;
    }
  }
  if (state.activeMode === 'stormResetDuration') {
    let ms = Number($('stormResetInput')?.value);
    if (!Number.isFinite(ms) || ms < 200) ms = 1500;
    ms = Math.floor(ms);
    const prev = state.runtimeConfig?.settings || state.settings || {};
    const settings = { ...prev, stormResetDurationMs: ms };
    // keep click thresholds
    const ct = getClickThresholdSettings();
    settings.clickThresholdMin = ct.clickThresholdMin;
    settings.clickThresholdMax = ct.clickThresholdMax;
    state.settings = settings;
    if (state.runtimeConfig) state.runtimeConfig.settings = settings;
    try {
      await persistRuntime('storm-reset-duration');
      syncStormResetView();
      $('poolHint').textContent = `Reset fade ${ms}ms live (next visitors ~15s, no redeploy)`;
    } catch (e) {
      console.error(e);
      $('poolHint').textContent = `Reset fade save failed: ${e.message || e}`;
    }
  }
  state.activeMode = null;
  state.modeSnapshot = null;
  state.connectorPick = null;
  state.actionPick = null;
  state.actionDraft = null;
  document.body.classList.remove('picking-character', 'picking-object');
  markDirty();
  syncModeUi();
  refreshViews();
  if (state.selectedAnim) mountProps(state.selectedAnim.id, { interactive: true });
}

function cancelMode() {
  if (!state.activeMode || !state.modeSnapshot) {
    state.activeMode = null;
    state.modeSnapshot = null;
    state.connectorPick = null;
    state.actionPick = null;
    state.actionDraft = null;
    document.body.classList.remove('picking-character', 'picking-object');
    syncModeUi();
    return;
  }
  const mode = state.activeMode;
  if (mode === 'transition') {
    ensureAnimPlacement(state.selectedAnim.id).transitionId = state.modeSnapshot.transitionId;
  } else if (mode === 'previewObjectActions') {
    // Cancel: leave animation field unchanged (draft was only in checkbox)
  } else if (mode === 'clickThreshold') {
    const snap = state.modeSnapshot || {};
    const minIn = $('clickThresholdMinInput');
    const maxIn = $('clickThresholdMaxInput');
    if (minIn) minIn.value = String(snap.clickThresholdMin ?? 3);
    if (maxIn) maxIn.value = String(snap.clickThresholdMax ?? 5);
    syncClickThresholdView();
  } else if (mode === 'stormResetDuration') {
    const snap = state.modeSnapshot || {};
    const input = $('stormResetInput');
    if (input) input.value = String(snap.stormResetDurationMs ?? 1500);
    syncStormResetView();
  } else {
    const st = currentElement();
    if (st && state.modeSnapshot) {
      // Restore entire element snapshot so Cancel is exact
      Object.keys(st).forEach((k) => delete st[k]);
      Object.assign(st, deepClone(state.modeSnapshot));
    }
  }
  state.activeMode = null;
  state.modeSnapshot = null;
  state.connectorPick = null;
  state.actionPick = null;
  state.actionDraft = null;
  document.body.classList.remove('picking-character', 'picking-object');
  syncModeUi();
  refreshViews();
  if (state.selectedAnim) mountProps(state.selectedAnim.id, { interactive: true });
}

function syncModeUi() {
  const mode = state.activeMode;
  document.querySelectorAll('.ie-row').forEach((row) => {
    const m = row.dataset.mode;
    const editing = mode === m;
    row.classList.toggle('is-editing', editing);
    row.querySelector('.ie-view')?.classList.toggle('hidden', editing);
    row.querySelector('.ie-edit')?.classList.toggle('hidden', !editing);
  });
  // Disable other pencils while one mode active
  document.querySelectorAll('.ie-view .ie-btn').forEach((btn) => {
    btn.disabled = !!mode;
  });
  overlay.classList.toggle('passthrough', mode === 'connector' && state.connectorPick === 'character');
  overlay.classList.toggle('mode-move', mode === 'move');
  overlay.classList.toggle('mode-rotation', mode === 'rotation');
  overlay.classList.toggle('mode-connector', mode === 'connector');
  overlay.classList.toggle('mode-action', mode === 'action');
}

function refreshViews() {
  const place = state.selectedAnim ? ensureAnimPlacement(state.selectedAnim.id) : null;
  if (place) {
    $('transitionView').textContent = place.transitionId || 'lightning';
    const pov = $('previewObjectActionsView');
    if (pov) pov.textContent = state.selectedAnim?.previewObjectActions ? 'on' : 'off';
    const pock = $('previewObjectActionsCheck');
    if (pock && state.activeMode !== 'previewObjectActions') {
      pock.checked = !!state.selectedAnim?.previewObjectActions;
    }
  syncClickThresholdView();
    transitionSelect.value = place.transitionId || 'lightning';
  }
  const st = currentElement();
  if (!st) {
    selectedControls.classList.add('hidden');
    return;
  }
  selectedControls.classList.remove('hidden');
  $('selectedLabel').textContent = selectedLabel();
  $('connectorView').textContent =
    `obj(${st.objectAnchor.x.toFixed(2)},${st.objectAnchor.y.toFixed(2)}) → ` +
    `char(${st.characterAnchor.x.toFixed(2)},${st.characterAnchor.y.toFixed(2)})`;
  $('rotationView').textContent = `${Math.round(st.rotation || 0)}°`;
  syncRotationControls(st.rotation || 0);
  const mv = $('moveView');
  if (mv) {
    mv.textContent =
      `(${st.characterAnchor.x.toFixed(2)}, ${st.characterAnchor.y.toFixed(2)})`;
  }
  $('sizeView').textContent = Number(st.scale || 0.3).toFixed(2);
  $('scaleSlider').value = String(st.scale || 0.3);
  const av = $('actionView');
  if (av) {
    const fire = (st.objectActions || []).find((a) => a.type === 'fire');
    av.textContent = fire
      ? `fire @ (${(+fire.point?.x || 0).toFixed(2)},${(+fire.point?.y || 0).toFixed(2)}) → ${Math.round(+fire.direction || 0)}°`
      : 'none';
  }
}

function onTransitionChange() {
  if (state.activeMode !== 'transition' || !state.selectedAnim) return;
  ensureAnimPlacement(state.selectedAnim.id).transitionId = transitionSelect.value;
}

function onRotationInput(e) {
  if (state.activeMode !== 'rotation') return;
  if (!state.selectedAnim || !state.selectedElementId) return;
  const v = Math.max(-180, Math.min(180, +e.target.value || 0));
  syncRotationControls(v);
  const st = currentElement();
  st.rotation = v; // rotation mode writes ONLY rotation
  const img = overlay.querySelector(`[data-element-id="${state.selectedElementId}"]`);
  if (img) positionProp(img, st);
}

function onScaleInput(e) {
  if (state.activeMode !== 'size') return;
  if (!state.selectedAnim || !state.selectedElementId) return;
  const v = Math.max(0.05, Math.min(1.5, +e.target.value || 0.3));
  const st = currentElement();
  st.scale = v; // size mode writes ONLY scale
  const img = overlay.querySelector(`[data-element-id="${state.selectedElementId}"]`);
  if (img) {
    positionProp(img, st);
    if (state.activeMode === 'rotation') {
      renderRotateHandle(state.selectedAnim.id, state.selectedElementId);
    }
  }
}

function resetConnectorsInMode() {
  if (state.activeMode !== 'connector') return;
  if (!state.selectedAnim || !state.selectedElementId) return;
  const anim = state.selectedAnim;
  const el = anim.elements.find((e) => e.id === state.selectedElementId);
  const st = currentElement();
  const def = defaultElementState(anim, el);
  st.objectAnchor = { ...def.objectAnchor };
  st.characterAnchor = { ...def.characterAnchor };
  state.connectorPick = 'object';
  document.body.classList.remove('picking-character');
  document.body.classList.add('picking-object');
  connectorHint.textContent = `Reset. Click a connector point on the ${selectedLabel()}.`;
  syncModeUi();
  mountProps(anim.id, { interactive: true });
}

function ensureAnimDeskList() {
  if (animDeskList) return animDeskList;
  const host = $('animListHost');
  if (!host) throw new Error('animListHost missing');

  const columns = [
    {
      key: 'label',
      label: 'Name',
      width: '22%',
      className: 'ev-desk-col--wrap',
      render: (anim) => `<span class="label">${escapeHtml(anim.label)}</span>`
    },
    {
      key: 'live',
      label: 'Live',
      width: '10%',
      sortType: 'none',
      className: 'cambio-col-live',
      render: (anim) => {
        const liveDisabled = anim.archived ? ' disabled' : '';
        const liveChecked = anim.live && !anim.archived ? ' checked' : '';
        return `<label class="cambio-live-lab"><input type="checkbox" data-act="live" data-id="${escapeHtml(anim.id)}"${liveChecked}${liveDisabled} /> Live</label>`;
      }
    },
    {
      key: 'tier',
      label: 'Tier',
      width: '16%',
      render: (anim) => {
        const tierOpts = Object.entries(state.tiers || {})
          .map(([tid, tdef]) => {
            const sel = (anim.tier || 'legendary') === tid ? ' selected' : '';
            return `<option value="${escapeHtml(tid)}"${sel}>${escapeHtml(tdef.label)} (${tdef.weight})</option>`;
          })
          .join('');
        return `<select data-act="tier" data-id="${escapeHtml(anim.id)}" aria-label="Tier">${tierOpts}</select>`;
      }
    },
    {
      key: 'weight',
      label: 'Weight',
      width: '10%',
      sortType: 'number',
      className: 'cambio-col-num',
      render: (anim) => {
        const weight = anim.weight != null ? anim.weight : effectiveWeight(anim);
        return `<input type="number" min="0" step="0.1" data-act="weight" data-id="${escapeHtml(anim.id)}" value="${escapeHtml(String(weight))}" title="Direct weight (overrides tier×multiplier when set)" />`;
      }
    },
    {
      key: 'pct',
      label: '%',
      width: '8%',
      sortType: 'number',
      className: 'cambio-col-num',
      render: (anim) => {
        const pcts = livePercents();
        const pct = anim.live && !anim.archived ? `${(pcts[anim.id] || 0).toFixed(1)}%` : '—';
        return `<span class="pct">${escapeHtml(pct)}</span>`;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '34%',
      sortType: 'none',
      className: 'cambio-col-actions',
      render: (anim) => {
        const canEditPlacement =
          anim.editable !== false && anim.placementEditable !== false && anim.id !== 'ghost';
        const canArchive = anim.editable !== false && anim.id !== 'ghost';
        let actions =
          `<button type="button" class="btn btn-sm btn-primary" data-act="play" data-id="${escapeHtml(anim.id)}">Play</button>` +
          `<button type="button" class="btn btn-sm btn-outline-dark" data-act="click-preview" data-id="${escapeHtml(anim.id)}" title="Preview this animation's per-click character effect">Click preview</button>`;
        if (canEditPlacement) {
          actions += `<button type="button" class="btn btn-sm btn-outline-dark" data-act="edit" data-id="${escapeHtml(anim.id)}">Edit</button>`;
        } else if (anim.id === 'ghost') {
          actions += `<span class="text-body-secondary" style="font-size:.7rem">placement locked</span>`;
        }
        if (canArchive) {
          actions += `<button type="button" class="btn btn-sm btn-outline-dark" data-act="archive" data-id="${escapeHtml(anim.id)}">${
            anim.archived ? 'Restore' : 'Archive'
          }</button>`;
        }
        return `<div class="cambio-row-actions">${actions}</div>`;
      }
    }
  ];

  animDeskList = mountEvScrollList(host, {
    title: 'Animations',
    searchPlaceholder: 'Search animations…',
    searchFields: ['id', 'label', 'tier'],
    columns,
    minRows: 10,
    maxHeightCss: 'min(70vh, 36rem)',
    emptyHtml: `<tr><td colspan="6" class="ev-hint">No animations yet</td></tr>`,
    rowKey: (item) => String(item.id),
    headerActions: [
      { label: '+ Create', attrs: 'id="btnCreateAnim"' },
      { label: 'Export→git', attrs: 'id="btnExportRepo" title="Snapshot KV → git"' }
    ],
    afterPaint: () => wireAnimListActions()
  });

  // Give the painted card an id tests / markAnimRowActive can find
  const card = host.querySelector('.card, .ev-desk-list, [data-ev-component="ev-desk-list"]');
  if (card && !card.id) card.id = 'animList';
  host.id = host.id || 'animListHost';
  // Also stamp id on scroll wrap for #animList selector compatibility
  const stamp = () => {
    const root = host.querySelector('[data-ev-component="ev-desk-list"]') || host.querySelector('.card');
    if (root) root.id = 'animList';
  };
  stamp();
  const _set = animDeskList.setItems.bind(animDeskList);
  animDeskList.setItems = (items) => {
    _set(items);
    stamp();
    wireAnimListActions();
  };

  host.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === 'btnCreateAnim' || t.closest?.('#btnCreateAnim')) {
      const d = $('createDialog');
      if (d) { $('createStatus').textContent = ''; d.showModal(); }
      return;
    }
    if (t.id === 'btnExportRepo' || t.closest?.('#btnExportRepo')) {
      void (async () => {
        try {
          saveStatus.textContent = 'Exporting…';
          const data = await apiJson('/api/cambio/export-to-repo', { method: 'POST', body: '{}' });
          saveStatus.textContent = data.message || (data.ok ? 'Exported' : 'Export unavailable');
        } catch (err) {
          saveStatus.textContent = `Export: ${err.message}`;
        }
      })();
    }
  });

  return animDeskList;
}


function wireAnimListActions() {
  const root = $('animList') || $('animListHost');
  if (!root || root.dataset.cambioWired === '1') return;
  root.dataset.cambioWired = '1';

  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('[data-act]');
    if (!btn || !root.contains(btn)) return;
    if (btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    if (!act || !id) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (act === 'play') void playAnimation(id);
    else if (act === 'click-preview') void previewClickAnimation(id);
    else if (act === 'edit') enterEdit(id);
    else if (act === 'archive') void toggleArchive(id);
  });

  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    if (!act || !id) return;
    const anim = (state.runtimeConfig?.animations || state.manifest.animations || []).find((a) => a.id === id);
    if (!anim) return;
    if (act === 'live' && el instanceof HTMLInputElement) {
      void (async () => {
        try {
          await patchAnimation(id, { live: el.checked });
          saveStatus.textContent = `${anim.label} live=${el.checked} (immediate)`;
        } catch (err) {
          el.checked = !el.checked;
          saveStatus.textContent = err.message;
        }
      })();
    } else if (act === 'tier' && el instanceof HTMLSelectElement) {
      void (async () => {
        try {
          await patchAnimation(id, { tier: el.value });
          saveStatus.textContent = `${anim.label} tier=${el.value}`;
        } catch (err) {
          saveStatus.textContent = err.message;
          renderAnimList();
        }
      })();
    } else if (act === 'weight' && el instanceof HTMLInputElement) {
      void (async () => {
        const w = Math.max(0, +el.value || 0);
        try {
          await patchAnimation(id, { weight: w, multiplier: w });
          saveStatus.textContent = `${anim.label} weight=${w}`;
        } catch (err) {
          saveStatus.textContent = err.message;
        }
      })();
    }
  });
}

function markAnimRowActive(animId) {
  const root = $('animList') || $('animListHost');
  if (!root) return;
  root.querySelectorAll('tr[data-row-id], .ev-sl-row[data-row-id]').forEach((row) => {
    const on = row.getAttribute('data-row-id') === animId;
    row.classList.toggle('ev-sl-row--selected', on);
    row.classList.toggle('active', on);
  });
}

function renderAnimList() {
  ensureAnimDeskList();
  const all = state.runtimeConfig?.animations || state.manifest.animations || [];
  const q = state.animFilter || '';
  // mountEvScrollList owns search; pass full pool (archived stay visible so Restore works).
  const pool = all.slice();
  animDeskList.setItems(pool);
  const hint = $('poolHint');
  if (hint) {
    const pcts = livePercents();
    const parts = Object.entries(pcts).map(([id, p]) => `${id} ${p.toFixed(0)}%`);
    hint.textContent = parts.length ? `Live pool: ${parts.join(' · ')}` : 'No live animations';
  }
  if (state.selectedAnim?.id) markAnimRowActive(state.selectedAnim.id);
}

async function onCreateSubmit(ev) {
  const form = ev.target;
  const submitter = ev.submitter;
  if (submitter && submitter.value === 'cancel') return;
  ev.preventDefault();
  const fd = new FormData(form);
  const label = String(fd.get('label') || '').trim();
  if (!label) return;
  const status = $('createStatus');
  status.textContent = 'Creating…';
  try {
    const id = slugify(label);
    const files = fd.getAll('files').filter((f) => f && f.size);
    const elements = [];
    for (const file of files) {
      const up = new FormData();
      up.append('file', file);
      up.append('animationId', id);
      const ur = await fetch('/api/cambio/assets', { method: 'POST', credentials: 'include', body: up });
      const ud = await ur.json();
      if (!ur.ok || ud.ok === false) throw new Error(ud.error || `upload ${ur.status}`);
      const elId = slugify(file.name.replace(/\.[^.]+$/, '')) || `el-${elements.length}`;
      elements.push({
        id: elId,
        anchor: 'head',
        src: ud.url || ud.key,
        defaultWidthFrac: 0.35
      });
    }
    const mult = Math.max(0, +fd.get('multiplier') || 1);
    const body = {
      id,
      label,
      type: fd.get('type') || 'character-overlay-activation',
      tier: fd.get('tier') || 'legendary',
      multiplier: mult,
      weight: mult,
      live: !!fd.get('live'),
      archived: false,
      editable: true,
      placementEditable: true,
      playMode: 'character-overlay',
      overlayFlashMode: 'composite',
      elements,
      transitionsAvailable: ['lightning', 'none'],
      previewObjectActions: false
    };
    const data = await apiJson('/api/cambio/animations', { method: 'POST', body: JSON.stringify(body) });
    if (data.config) state.runtimeConfig = data.config;
    else {
      state.runtimeConfig.animations.push(body);
    }
    syncManifestFromRuntime();
    renderAnimList();
    status.textContent = 'Created — open Edit to place elements';
    $('createDialog')?.close();
    if (elements.length) enterEdit(id);
    saveStatus.textContent = `Created ${label} (immediate)`;
  } catch (err) {
    status.textContent = err.message;
  }
}


function creatureBoxInRig() {
  return measureCreatureBoxInHost(creature, creatureRig);
}

function defaultElementState(anim, el) {
  const anchor = state.anchors.anchors[el.anchor] || { x: 0.5, y: 0.5 };
  return {
    objectAnchor: { x: 0.5, y: 0.5 },
    characterAnchor: { x: anchor.x, y: anchor.y },
    rotation: 0,
    scale: el.defaultWidthFrac || 0.3,
    transition: null,
    flipX: !!el.flipX
  };
}

function applyPropTransform(img, st) {
  // Kept for callers that only need transform refresh after scale/rot edit;
  // position uses shared applyElementPlacement (SSOT with public apex).
  const box = creatureBoxInRig();
  applyElementPlacement(img, st, box);
}

function positionProp(img, st) {
  applyElementPlacement(img, st, creatureBoxInRig());
}

function mountProps(animId, { interactive = false, visible = true } = {}) {
  overlay.innerHTML = '';
  markerLayer.innerHTML = '';
  overlay.classList.toggle('editing', interactive);
  syncModeUi();
  if (!animId || !visible) return;
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.elements?.length) return;
  const place = ensureAnimPlacement(animId);
  for (const el of anim.elements) {
    let st = place.elements[el.id];
    if (!st) {
      st = place.elements[el.id] = defaultElementState(anim, el);
    } else {
      st = place.elements[el.id] = migrateElement(st);
    }
    if (Object.prototype.hasOwnProperty.call(el, 'flipX')) st.flipX = !!el.flipX;

    const img = document.createElement('img');
    img.src = '/' + el.src.replace(/^\//, '');
    img.alt = el.id;
    img.className = 'cambio-prop' + (state.selectedElementId === el.id ? ' selected' : '');
    if (state.activeMode === 'connector' && state.connectorPick === 'object' && state.selectedElementId === el.id) {
      img.classList.add('picking-object');
    }
    img.dataset.elementId = el.id;
    img.draggable = false;

    // Hit-testing rules by mode (always scoped to selectedElementId):
    // - connector object-pick: only selected prop receives clicks
    // - connector character-pick: overlay passthrough → creature gets clicks
    // - move: selected prop draggable
    // - rotation: rotate handle only
    // - otherwise / no mode: select only (no drag)
    const allowPropPe =
      interactive &&
      (
        (state.activeMode === 'connector' && state.connectorPick === 'object' && el.id === state.selectedElementId) ||
        (state.activeMode === 'move' && el.id === state.selectedElementId) ||
        (state.activeMode === 'action' && el.id === state.selectedElementId) ||
        (!state.activeMode && interactive)
      );
    if (state.activeMode === 'action' && el.id === state.selectedElementId) {
      img.classList.add('picking-action');
    }
    img.style.pointerEvents = allowPropPe ? 'auto' : 'none';

    positionProp(img, st);
    if (interactive) bindPropPointer(img, animId, el.id);
    overlay.appendChild(img);
  }
  if (interactive && state.selectedElementId) {
    if (state.activeMode === 'connector' || !state.activeMode) {
      renderMarkers(animId, state.selectedElementId);
    }
    if (state.activeMode === 'rotation') {
      renderRotateHandle(animId, state.selectedElementId);
    }
    if (state.activeMode === 'action') {
      renderActionMarkers(animId, state.selectedElementId);
    }
  }
}

function renderMarkers(animId, elementId) {
  markerLayer.innerHTML = '';
  const place = ensureAnimPlacement(animId);
  const st = place.elements[elementId];
  if (!st) return;
  const box = creatureBoxInRig();
  const ca = st.characterAnchor;
  const charM = document.createElement('div');
  charM.className = 'cambio-marker character';
  charM.title = 'characterAnchor';
  charM.style.left = `${box.left + ca.x * box.width}px`;
  charM.style.top = `${box.top + ca.y * box.height}px`;
  markerLayer.appendChild(charM);

  const objM = document.createElement('div');
  objM.className = 'cambio-marker object';
  objM.title = 'objectAnchor';
  objM.style.left = `${box.left + ca.x * box.width}px`;
  objM.style.top = `${box.top + ca.y * box.height}px`;
  objM.style.boxShadow = '0 0 0 2px #fff, 0 0 8px rgba(0,0,0,.45), 3px 3px 0 #4a9eff';
  markerLayer.appendChild(objM);
}


function renderActionMarkers(animId, elementId) {
  markerLayer.querySelectorAll('.cambio-marker.action-point, .cambio-marker.action-dir').forEach((n) => n.remove());
  const img = overlay.querySelector(`[data-element-id="${elementId}"]`);
  const draft = state.actionDraft;
  if (!img || !draft?.point) return;
  const rect = img.getBoundingClientRect();
  const rig = creatureRig.getBoundingClientRect();
  const px = rect.left - rig.left + draft.point.x * rect.width;
  const py = rect.top - rig.top + draft.point.y * rect.height;
  const pt = document.createElement('div');
  pt.className = 'cambio-marker action-point';
  pt.style.left = `${px}px`;
  pt.style.top = `${py}px`;
  markerLayer.appendChild(pt);
  const dir = document.createElement('div');
  dir.className = 'cambio-marker action-dir';
  dir.style.left = `${px}px`;
  dir.style.top = `${py}px`;
  const st = ensureAnimPlacement(animId).elements[elementId] || {};
  let deg = +draft.direction || 0;
  if (st.flipX) deg = 180 - deg;
  deg = deg + (+st.rotation || 0);
  dir.style.transform = `rotate(${deg}deg)`;
  markerLayer.appendChild(dir);
}

function renderRotateHandle(animId, elementId) {
  const existing = overlay.querySelector('.cambio-rotate-handle');
  if (existing) existing.remove();
  if (state.activeMode !== 'rotation') return;
  const img = overlay.querySelector(`[data-element-id="${elementId}"]`);
  if (!img) return;
  const st = ensureAnimPlacement(animId).elements[elementId];
  const handle = document.createElement('div');
  handle.className = 'cambio-rotate-handle';
  handle.title = 'Drag to rotate';
  const box = creatureBoxInRig();
  const ca = st.characterAnchor;
  const w = (st.scale || 0.3) * box.width;
  handle.style.left = `${box.left + ca.x * box.width}px`;
  handle.style.top = `${box.top + ca.y * box.height - w * 0.55}px`;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.activeMode !== 'rotation') return;
    const originX = box.left + ca.x * box.width;
    const originY = box.top + ca.y * box.height;
    const rig = creatureRig.getBoundingClientRect();
    const move = (ev) => {
      const px = ev.clientX - rig.left;
      const py = ev.clientY - rig.top;
      const ang = (Math.atan2(py - originY, px - originX) * 180) / Math.PI + 90;
      st.rotation = Math.round(((ang + 540) % 360) - 180); // ONLY rotation
      syncRotationControls(st.rotation);
      positionProp(img, st);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      mountProps(animId, { interactive: true });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  overlay.appendChild(handle);
}

function bindPropPointer(img, animId, elementId) {
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Selecting another element cancels active mode
    if (state.selectedElementId !== elementId) {
      if (state.activeMode) cancelMode();
      state.selectedElementId = elementId;
      highlightElementRow(elementId);
      refreshViews();
      mountProps(animId, { interactive: true });
      return;
    }

    // Action point: click muzzle (normalized on object), then direction
    if (state.activeMode === 'action') {
      const rect = img.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      if (state.actionPick === 'point' || !state.actionDraft) {
        if (!state.actionDraft) {
          state.actionDraft = { type: 'fire', point: { x: nx, y: ny }, direction: 0, pattern: 'alternate', rate: 3.2, jitter: 0.5, appliesTo: ['spore', 'activation'] };
        } else {
          state.actionDraft.point = { x: nx, y: ny };
        }
        state.actionPick = 'direction';
        const ah = $('actionHint');
        if (ah) ah.textContent = 'Click or drag to set fire direction, then ✓.';
        renderActionMarkers(animId, elementId);
        const move = (ev) => {
          const dx = ev.clientX - (rect.left + state.actionDraft.point.x * rect.width);
          const dy = ev.clientY - (rect.top + state.actionDraft.point.y * rect.height);
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          const st = currentElement() || {};
          // Convert screen deg → element-local (undo rotation/flip)
          deg = deg - (+st.rotation || 0);
          if (st.flipX) deg = 180 - deg;
          state.actionDraft.direction = Math.round(((deg % 360) + 360) % 360);
          if (state.actionDraft.direction > 180) state.actionDraft.direction -= 360;
          renderActionMarkers(animId, elementId);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return;
      }
      // Second click sets direction
      const dx = e.clientX - (rect.left + state.actionDraft.point.x * rect.width);
      const dy = e.clientY - (rect.top + state.actionDraft.point.y * rect.height);
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const st = currentElement() || {};
      deg = deg - (+st.rotation || 0);
      if (st.flipX) deg = 180 - deg;
      state.actionDraft.direction = Math.round(((deg % 360) + 360) % 360);
      if (state.actionDraft.direction > 180) state.actionDraft.direction -= 360;
      renderActionMarkers(animId, elementId);
      return;
    }

    // Connector object-pick: write objectAnchor only
    if (state.activeMode === 'connector' && state.connectorPick === 'object') {
      const rect = img.getBoundingClientRect();
      const ox = (e.clientX - rect.left) / rect.width;
      const oy = (e.clientY - rect.top) / rect.height;
      const st = ensureAnimPlacement(animId).elements[elementId];
      st.objectAnchor = {
        x: Math.min(1, Math.max(0, ox)),
        y: Math.min(1, Math.max(0, oy))
      };
      state.connectorPick = 'character';
      document.body.classList.remove('picking-object');
      document.body.classList.add('picking-character');
      connectorHint.textContent = `Now click the character where the ${selectedLabel()} should attach.`;
      syncModeUi();
      mountProps(animId, { interactive: true });
      return;
    }

    // Move mode only: drag → characterAnchor under objectAnchor (no jump / no float drift)
    if (state.activeMode === 'move') {
      if (elementId !== state.selectedElementId) return;
      img.classList.add('dragging', 'selected');
      const st = ensureAnimPlacement(animId).elements[elementId];
      // Keep objectAnchor; default to center if missing. Never touch scale/rotation.
      if (!st.objectAnchor || !Number.isFinite(+st.objectAnchor.x)) {
        st.objectAnchor = { x: 0.5, y: 0.5 };
      }
      const rig0 = creatureRig.getBoundingClientRect();
      // Attach point is CSS left/top (characterAnchor in rig-local space)
      const attachX = parseFloat(img.style.left) || 0;
      const attachY = parseFloat(img.style.top) || 0;
      const grabDx = (e.clientX - rig0.left) - attachX;
      const grabDy = (e.clientY - rig0.top) - attachY;
      const move = (ev) => {
        const rig = creatureRig.getBoundingClientRect(); // live — float-safe
        const box = creatureBoxInRig();
        const newAttachX = (ev.clientX - rig.left) - grabDx;
        const newAttachY = (ev.clientY - rig.top) - grabDy;
        // characterAnchor = character-normalized point under objectAnchor at this drop pose
        st.characterAnchor = {
          x: Math.min(1.15, Math.max(-0.15, (newAttachX - box.left) / box.width)),
          y: Math.min(1.15, Math.max(-0.15, (newAttachY - box.top) / box.height))
        };
        positionProp(img, st);
        const mv = $('moveView');
        if (mv) {
          mv.textContent =
            `(${st.characterAnchor.x.toFixed(2)}, ${st.characterAnchor.y.toFixed(2)})`;
        }
      };
      const up = () => {
        img.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        // Final convert against current creature box (objectAnchor unchanged)
        const box = creatureBoxInRig();
        const left = parseFloat(img.style.left) || 0;
        const top = parseFloat(img.style.top) || 0;
        st.characterAnchor = {
          x: Math.min(1.15, Math.max(-0.15, (left - box.left) / box.width)),
          y: Math.min(1.15, Math.max(-0.15, (top - box.top) / box.height))
        };
        mountProps(animId, { interactive: true });
        refreshViews();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    // No active mode: click selects only (already selected) — no drag
  });
}

function onCreaturePointerDown(e) {
  // Character pick only in connector mode step 2
  if (
    state.activeMode !== 'connector' ||
    state.connectorPick !== 'character' ||
    !state.editMode ||
    !state.selectedAnim ||
    !state.selectedElementId
  ) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const box = creature.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width;
  const y = (e.clientY - box.top) / box.height;
  const st = ensureAnimPlacement(state.selectedAnim.id).elements[state.selectedElementId];
  st.characterAnchor = {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y))
  };
  state.connectorPick = null;
  document.body.classList.remove('picking-character', 'picking-object');
  connectorHint.textContent = `${selectedLabel()} connectors preview set. ✓ to keep, ✕ to cancel.`;
  syncModeUi();
  mountProps(state.selectedAnim.id, { interactive: true });
  refreshViews();
}

function syncRotationControls(deg) {
  $('rotationSlider').value = String(deg);
  $('rotationNum').value = String(deg);
}

function enterEdit(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.editable) return;
  if (state.activeMode) cancelMode();
  state.selectedAnim = anim;
  state.editMode = true;
  state.selectedElementId = anim.elements[0]?.id || null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character', 'picking-object');
  document.body.classList.add('cambio-editing');
  editSection.classList.remove('hidden');
  $('editTitle').textContent = anim.label;
  const place = ensureAnimPlacement(animId);
  transitionSelect.innerHTML = '';
  for (const t of anim.transitionsAvailable || ['none']) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if ((place.transitionId || 'lightning') === t) opt.selected = true;
    transitionSelect.appendChild(opt);
  }
  elementList.innerHTML = '';
  for (const el of anim.elements) {
    if (!place.elements[el.id]) place.elements[el.id] = defaultElementState(anim, el);
    else place.elements[el.id] = migrateElement(place.elements[el.id]);
    const li = document.createElement('li');
    li.className = 'el-row' + (state.selectedElementId === el.id ? ' selected' : '');
    li.dataset.elementId = el.id;
    li.innerHTML = `<span class="label">${elementLabel(el.id)} → ${el.anchor}</span>`;
    li.addEventListener('click', () => {
      if (state.activeMode) cancelMode();
      state.selectedElementId = el.id;
      highlightElementRow(el.id);
      refreshViews();
      mountProps(animId, { interactive: true });
    });
    elementList.appendChild(li);
  }
  refreshViews();
  syncModeUi();
  mountProps(animId, { interactive: true });
  $('stageHint').textContent = 'Edit: pencil a property · Save placements · Play';
  markAnimRowActive(animId);
}

function highlightElementRow(id) {
  [...elementList.querySelectorAll('.el-row')].forEach((li) => {
    li.classList.toggle('selected', li.dataset.elementId === id);
  });
}

function exitEdit() {
  if (state.activeMode) cancelMode();
  state.editMode = false;
  state.selectedElementId = null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character', 'picking-object', 'cambio-editing');
  editSection.classList.add('hidden');
  selectedControls.classList.add('hidden');
  if (state.selectedAnim?.preloadedAccessories) {
    mountProps(state.selectedAnim.id, { interactive: false, visible: true });
  } else {
    overlay.innerHTML = '';
    markerLayer.innerHTML = '';
  }
  $('stageHint').textContent = 'Select Play or Edit';
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Build composite element list from manifest + saved placements. */
function compositeElementsFor(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.elements?.length) return [];
  const place = ensureAnimPlacement(animId);
  return anim.elements.map((el) => {
    let st = place.elements[el.id];
    if (!st) st = defaultElementState(anim, el);
    else st = migrateElement(st);
    return {
      id: el.id,
      src: el.src.startsWith('/') ? el.src : '/' + el.src.replace(/^\//, ''),
      placement: st
    };
  });
}

/**
 * Play = activate. Ghost uses image-overlay + firework spores (apex parity).
 * Cowboy (and future overlays): flash accessories ON the live #mainCreature via
 * the same mountProps placement path as edit mode (no duplicate base character).
 * Mini spores remain small base+overlay composites.
 */
/**
 * Preview the per-click character burst for an animation (clickEffect).
 * Editable later via manifest; default = mini composite replicas or ghost spores.
 */
function previewClickAnimation(animId) {
  const anim = (state.runtimeConfig?.animations || state.manifest.animations || [])
    .find((a) => a.id === animId);
  if (!anim) return;
  const container = $('siteStage');
  const rect = container.getBoundingClientRect();
  // Spawn near creature center
  const cbox = creature.getBoundingClientRect();
  const x = cbox.left + cbox.width / 2 - rect.left;
  const y = cbox.top + cbox.height / 2 - rect.top;
  const elements = (anim.elements || []).map((el) => {
    const place = state.placements?.byAnimation?.[animId]?.elements?.[el.id];
    return {
      id: el.id,
      src: el.src.startsWith('/') ? el.src : '/' + el.src.replace(/^\//, ''),
      placement: place
    };
  });
  const result = previewClick({
    container,
    creature,
    animation: anim,
    compositeElements: elements,
    x,
    y,
    sporeHost: container,
    fallback: null
  });
  $('stageHint').textContent = `Click preview: ${anim.label} (${result?.type || 'ok'})`;
}

async function playAnimation(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim) return;
  if (state._activationBusy) {
    $('stageHint').textContent = 'Activation already playing…';
    return;
  }
  state.selectedAnim = anim;
  markAnimRowActive(animId);
  // Clear edit markers; accessories remounted below for flash (shared edit path)
  markerLayer.innerHTML = '';
  $('stageHint').textContent = `Playing ${anim.label}…`;
  state._activationBusy = true;

  const container = $('siteStage');
  try {
    if (anim.playMode === 'legacy-ghost' || anim.id === 'ghost') {
      overlay.innerHTML = '';
      await activate({
        container,
        creature,
        creatureRig,
        sporeHost: container,
        profile: 'ghost'
      });
      $('stageHint').textContent = 'Ghost play finished';
      return;
    }

    // Mount accessories with the EXACT edit-mode placement path, then flicker that host.
    mountProps(animId, { interactive: false, visible: true });
    const elements = compositeElementsFor(animId);
    await activate({
      container,
      creature,
      creatureRig,
      sporeHost: container,
      profile: 'composite',
      flashHost: overlay,
      composite: {
        // Spores only — never used for a full-size duplicate flash layer
        baseSrc: creature.getAttribute('src') || '/img/mushroom-platypus.png',
        elements
      },
      spore: { count: 8, scale: 0.32, durationMs: 1800, spreadPx: 140 }
    });

    // Reset: hide/remove overlay items; live character untouched
    if (state.editMode) {
      mountProps(animId, { interactive: true });
    } else {
      overlay.innerHTML = '';
      overlay.style.opacity = '';
      overlay.classList.remove('activation-flash-host');
    }
    $('stageHint').textContent = `${anim.label} play finished`;
  } catch (err) {
    console.error('activation failed', err);
    $('stageHint').textContent = `Play failed: ${err.message || err}`;
    overlay.innerHTML = '';
    overlay.style.opacity = '';
    overlay.classList.remove('activation-flash-host');
  } finally {
    state._activationBusy = false;
  }
}

async function savePlacements() {
  if (state.activeMode) commitMode();
  saveStatus.textContent = 'Saving…';
  try {
    const migrated = migratePlacements(state.placements);
    const body = {
      ...migrated,
      schemaVersion: 2,
      updatedAt: new Date().toISOString()
    };
    const r = await fetch('/api/cambio/placements', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    state.placements = migratePlacements(data.placements || body);
    state.dirty = false;
    saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    saveStatus.textContent = `Save failed: ${err.message}`;
  }
}

/** Test helpers exposed for Playwright */
window.__cambioTest = {
  runActivationPlay: (id) => playAnimation(id),
  previewClick: (id) => previewClickAnimation(id),
  compositeElementsFor,

  getState: () => state,
  enterEdit,
  mountProps,
  creatureBoxInRig,
  enterMode,
  commitMode,
  cancelMode,
  getActionDraft: () => state.actionDraft,
  cancelMode,
  elementLabel,
  selectElement(id) {
    if (!state.selectedAnim) return;
    if (state.activeMode) cancelMode();
    state.selectedElementId = id;
    highlightElementRow(id);
    refreshViews();
    mountProps(state.selectedAnim.id, { interactive: true });
  },
  snapshotElement(elementId) {
    const animId = state.selectedAnim?.id;
    if (!animId) return null;
    return deepClone(ensureAnimPlacement(animId).elements[elementId]);
  },
  measureAttachment(elementId) {
    const img = overlay.querySelector(`[data-element-id="${elementId}"]`);
    if (!img || !state.selectedAnim) return null;
    const st = ensureAnimPlacement(state.selectedAnim.id).elements[elementId];
    const box = creatureBoxInRig();
    const ca = st.characterAnchor;
    const expected = {
      x: box.left + ca.x * box.width,
      y: box.top + ca.y * box.height
    };
    const left = parseFloat(img.style.left);
    const top = parseFloat(img.style.top);
    return {
      expected,
      actual: { x: left, y: top },
      dx: left - expected.x,
      dy: top - expected.y,
      rotation: st.rotation,
      objectAnchor: st.objectAnchor,
      characterAnchor: st.characterAnchor,
      scale: st.scale
    };
  },
  setConnectors(elementId, objectAnchor, characterAnchor) {
    const animId = state.selectedAnim?.id;
    if (!animId) return;
    const st = ensureAnimPlacement(animId).elements[elementId];
    st.objectAnchor = { ...objectAnchor };
    st.characterAnchor = { ...characterAnchor };
    mountProps(animId, { interactive: state.editMode });
    refreshViews();
  },
  setRotation(elementId, deg) {
    const animId = state.selectedAnim?.id;
    if (!animId) return;
    ensureAnimPlacement(animId).elements[elementId].rotation = deg;
    mountProps(animId, { interactive: state.editMode });
    refreshViews();
  },
  setScale(elementId, scale) {
    const animId = state.selectedAnim?.id;
    if (!animId) return;
    ensureAnimPlacement(animId).elements[elementId].scale = scale;
    mountProps(animId, { interactive: state.editMode });
    refreshViews();
  }
};

boot().catch((err) => {
  saveStatus.textContent = `Boot failed: ${err.message}`;
  console.error(err);
});
