import { runActivation, previewClick, activate } from '/effects/activation/ActivationEngine.js';
import { applyElementPlacement, measureCreatureBoxInHost } from '/effects/activation/placementMath.js';
import { buildCharacterComposite } from '/effects/activation/CharacterComposite.js';
import { runObjectActions } from '/effects/activation/objectActions.js';
import { mountOverlayProps } from '/effects/activation/mountOverlayProps.js';
import { DEFAULT_PLACEMENTS_BY_ANIMATION } from '/effects/activation/defaultPlacements.js';
import { escapeHtml } from '/cambio/vendor/envivo-ui/desk-list.mjs';
import { mountEvScrollList } from '/cambio/vendor/envivo-ui/ev-scroll-list/mount.mjs';
import { SAFE_FONT_OPTIONS, schemaForActionType } from '/cambio/objectActionFieldSchema.js';
import { log, info, debug, warn, error } from '../js/log.js';
import {editorPlacement,normalizeEditedPlacement} from '/runtime/costumes/contracts.js';
import {mountCostumeWorkshop} from '/cambio/costume-workshop.js';

/**
 * Content-fit columns for Cambio rails (enVivo SL-27 measure, without grow-to-fill).
 * Root cause of fat headers: (1) page % column widths + (2) autofit leftover→flex /
 * width:100% stretch, and our prior minWidth:100% hack. Contract: fit:'content',
 * no rem/% widths; measure nowrap content. Sidebar needs h-scroll instead of
 * leftover stretch — keep measured px cols, table width = sum, overflow-x:auto.
 */
function enableCambioListHScroll(host) {
  if (!host) return;
  const wrap = host.querySelector('.table-responsive, .ev-desk-list__scroll');
  const table = host.querySelector('table.table');
  if (!wrap || !table) return;

  // Autofit RO re-applies width:100% + leftover into flex — disconnect for rail h-scroll.
  if (wrap._evSlFitRo) {
    try { wrap._evSlFitRo.disconnect(); } catch {}
    wrap._evSlFitRo = null;
  }
  wrap.style.overflowX = 'auto';
  wrap.style.maxWidth = '100%';
  wrap.style.minWidth = '0';

  for (const cell of table.querySelectorAll('thead th, tbody td')) {
    cell.style.whiteSpace = 'nowrap';
  }

  // SL-27 measuring phase: auto + max-content, no min-width:100% (that was stretching cols).
  table.classList.add('ev-sl-measuring');
  table.style.tableLayout = 'auto';
  table.style.width = 'max-content';
  table.style.minWidth = '0';
  table.style.maxWidth = 'none';
  table.querySelector('colgroup')?.remove();

  const ths = [...table.querySelectorAll('thead tr:first-child th')];
  const n = ths.length;
  if (!n) {
    table.classList.remove('ev-sl-measuring');
    return;
  }
  // Prefer max(header, body cells) per column — longest one-line value.
  const widths = ths.map((th, i) => {
    let w = Math.ceil(th.getBoundingClientRect().width);
    for (const td of table.querySelectorAll(`tbody tr:not(.ev-sl-pad) td:nth-child(${i + 1})`)) {
      if (td.colSpan > 1) continue;
      w = Math.max(w, Math.ceil(td.getBoundingClientRect().width));
    }
    return Math.max(w, 24);
  });
  table.classList.remove('ev-sl-measuring');

  const cg = document.createElement('colgroup');
  cg.innerHTML = widths.map((w) => `<col style="width:${w}px" />`).join('');
  table.insertBefore(cg, table.firstChild);
  const sum = widths.reduce((a, b) => a + b, 0);
  table.style.tableLayout = 'fixed';
  table.style.width = `${sum}px`;
  table.style.minWidth = '0';
  table.style.maxWidth = 'none';
}

/** @type {ReturnType<typeof mountEvScrollList>|null} */
let animDeskList = null;
/** @type {ReturnType<typeof mountEvScrollList>|null} */
let editItemList = null;
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
  /** null | 'connector' | 'rotation' | 'move' | 'size' | 'transition' | 'action' | 'previewObjectActions' | 'clickThreshold' | 'stormResetDuration' | 'selectionMode' | 'interactionOpacity' */
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


/**
 * Uniform row action buttons: SAME set + order for every item.
 * Non-applicable actions stay visible but disabled (title explains why).
 * @param {Array<{
 *   key?: string,
 *   label: string,
 *   enabled?: boolean,
 *   disabledReason?: string,
 *   title?: string,
 *   className?: string,
 *   attrs?: string
 * }>} actionsSpec
 * @param {{ wrapClass?: string, buttonStyle?: string }} [opts]
 */
function renderActionButtons(actionsSpec, opts = {}) {
  const wrapClass = opts.wrapClass || 'cambio-row-actions';
  const br = opts.buttonStyle != null ? opts.buttonStyle : ' style="border-radius:0"';
  const html = (actionsSpec || []).map((a) => {
    const enabled = a.enabled !== false;
    const label = a.label != null ? String(a.label) : '';
    const title = !enabled
      ? (a.disabledReason || a.title || 'Not available for this item')
      : (a.title || label);
    const cls = a.className || 'btn btn-sm btn-outline-dark';
    const disabledAttr = enabled ? '' : ' disabled aria-disabled="true"';
    const attrs = a.attrs || '';
    return `<button type="button" class="${cls}"${br}${attrs ? ' ' + attrs : ''} title="${escapeHtml(title)}"${disabledAttr}>${escapeHtml(label)}</button>`;
  }).join('');
  return `<div class="${wrapClass}">${html}</div>`;
}

function animListActionButtons(anim, playtest = false) {
  const id = escapeHtml(anim.id);
  const canFullEdit = anim.editable !== false && anim.placementEditable !== false;
  const canArchive = anim.editable !== false && anim.id !== 'ghost';
  let archiveReason = '';
  if (anim.id === 'ghost') archiveReason = 'Ghost cannot be archived (core animation)';
  else if (anim.editable === false) archiveReason = 'This animation is not editable / archivable';
  const archiveLabel = anim.archived ? 'Restore' : 'Archive';
  const actions = renderActionButtons([
    {
      key: 'play',
      label: 'Play',
      className: 'btn btn-sm btn-primary',
      title: 'Play this animation',
      attrs: `data-act="play" data-id="${id}"`
    },
    {
      key: 'edit',
      label: 'Edit',
      enabled: canFullEdit,
      disabledReason: 'Placement editing is locked for this animation',
      title: 'Open full animation editor',
      attrs: `data-act="edit" data-id="${id}"`
    },
    {
      key: 'click-preview',
      label: 'Click',
      title: "Preview this animation's per-click character effect",
      attrs: `data-act="click-preview" data-id="${id}"`
    },
    {
      key: 'archive',
      label: archiveLabel,
      enabled: canArchive,
      disabledReason: archiveReason || 'Cannot archive',
      title: anim.archived ? 'Restore from archive' : 'Soft-archive (hide from live pool)',
      attrs: `data-act="archive" data-id="${id}"`
    }
  ].filter(action => !playtest || ['play', 'click-preview'].includes(action.key)));
  const show = playtest ? renderActionButtons([{
    key: 'show', label: 'Show', title: 'Show the costume and four stationary spores',
    attrs: `data-act="show" data-id="${id}"`
  }]) : '';
  const url = escapeHtml(costumeUrl(anim.id));
  return actions + show + ` <span class="btn-group cambio-url-actions" role="group" aria-label="Costume URL">
    <a class="btn btn-sm btn-outline-secondary" href="${url}" target="_blank" rel="noopener noreferrer">URL</a>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-act="copy-url" data-id="${id}" aria-label="Copy costume URL" title="Copy costume URL">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 3V2H2v9h1"/></svg>
    </button>
  </span>`;
}

function costumeUrl(id) {
  return 'https://youareinthegame.com/?' + encodeURIComponent(id.replaceAll('-', ''));
}

async function copyCostumeUrl(id) {
  const status = $('poolHint');
  try {
    await navigator.clipboard.writeText(costumeUrl(id));
    if (status) status.textContent = 'Copied link for ' + id + '.';
  } catch {
    if (status) status.textContent = 'Could not copy. Link for ' + id + ' is ' + costumeUrl(id);
  }
}

function editItemActionButtons(row) {
  const id = escapeHtml(row.id);
  const isAction = row.kind === 'action';
  const isElement = row.kind === 'element';
  const isEffect = row.kind === 'effect';
  return renderActionButtons([
    {
      key: 'select',
      label: 'Select',
      title: 'Select on stage',
      attrs: `data-edit-act="select" data-item-id="${id}"`
    },
    {
      key: 'edit',
      label: 'Edit',
      enabled: isAction || isElement,
      disabledReason: isEffect
        ? 'Effects are edited via site settings / placement fields, not this row'
        : 'Edit not available for this item',
      title: isAction ? 'Edit action point' : 'Edit placement',
      attrs: `data-edit-act="${isAction ? 'edit-action' : 'edit-element'}" data-item-id="${id}"`
    },
    {
      key: 'delete',
      label: 'Delete',
      enabled: isAction,
      disabledReason: isElement
        ? 'Overlay elements cannot be deleted here'
        : 'Only object actions can be removed from this list',
      title: 'Remove action',
      attrs: `data-edit-act="delete-action" data-item-id="${id}"`
    }
  ]);
}

async function toggleArchive(id) {
  const pool = state.runtimeConfig?.animations || [];
  const anim = pool.find((a) => a.id === id);
  if (!anim) return;
  if (anim.id === 'ghost') {
    saveStatus.textContent = 'Ghost cannot be archived';
    return;
  }
  if (anim.editable === false) {
    saveStatus.textContent = 'This animation cannot be archived';
    return;
  }
  try {
    if (anim.archived) {
      await patchAnimation(id, { archived: false });
      saveStatus.textContent = `Restored ${anim.label || id}`;
    } else {
      const data = await apiJson(`/api/cambio/animations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: '{}'
      });
      if (data.config) state.runtimeConfig = data.config;
      else {
        const idx = state.runtimeConfig.animations.findIndex((a) => a.id === id);
        if (idx >= 0) {
          state.runtimeConfig.animations[idx] = {
            ...state.runtimeConfig.animations[idx],
            archived: true,
            live: false
          };
        }
      }
      syncManifestFromRuntime();
      renderAnimList();
      saveStatus.textContent = `Archived ${anim.label || id}`;
    }
  } catch (err) {
    saveStatus.textContent = err.message || String(err);
  }
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
  syncSelectionModeView();
  syncInteractionOpacityView();
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
  if(raw.attachment)return editorPlacement(raw);
  const actions = Array.isArray(raw.objectActions)
    ? raw.objectActions.map((a) => ({ ...a, point: a.point ? { x: +a.point.x, y: +a.point.y } : { x: 0.5, y: 0.5 } }))
    : undefined;
  if (raw.characterAnchor && raw.objectAnchor) {
    const out = {
      ...raw,
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
    libraryRevision:data.libraryRevision,
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

/** Isolated OA field modes (textProjectile generic editor). */
const OA_FIELD_MODES = new Set(['oaText', 'oaDuration', 'oaDistance', 'oaFontFamily', 'oaFontSize']);

/**
 * Merge KV live placements over seed: keep live values, fill missing anims/elements/OAs from seed.
 * Prevents cowboy-only KV from wiping ghost objectActions in the editor.
 */
function mergePlacementsPreferLive(seedPlacements, livePlacements) {
  const out = migratePlacements(livePlacements);
  const seed = migratePlacements(seedPlacements);
  for (const [animId, animPlace] of Object.entries(seed.byAnimation || {})) {
    if (!out.byAnimation[animId]) {
      out.byAnimation[animId] = deepClone(animPlace);
      continue;
    }
    const liveEls = out.byAnimation[animId].elements || (out.byAnimation[animId].elements = {});
    const seedEls = animPlace.elements || {};
    for (const [elId, elPlace] of Object.entries(seedEls)) {
      if (!liveEls[elId]) {
        liveEls[elId] = deepClone(elPlace);
        continue;
      }
      const liveOa = liveEls[elId].objectActions;
      const seedOa = elPlace.objectActions;
      if ((!Array.isArray(liveOa) || !liveOa.length) && Array.isArray(seedOa) && seedOa.length) {
        liveEls[elId].objectActions = deepClone(seedOa);
      }
    }
    if (!out.byAnimation[animId].transitionId && animPlace.transitionId) {
      out.byAnimation[animId].transitionId = animPlace.transitionId;
    }
  }
  return out;
}

/** Prefer textProjectile, else fire, else first — for generic OA editors. */
function primaryObjectAction(st) {
  const list = Array.isArray(st?.objectActions) ? st.objectActions : [];
  return (
    list.find((a) => a?.type === 'textProjectile') ||
    list.find((a) => a?.type === 'fire') ||
    list[0] ||
    null
  );
}

function ensurePrimaryActionOfType(st, type) {
  if (!st) return null;
  if (!Array.isArray(st.objectActions)) st.objectActions = [];
  let act = st.objectActions.find((a) => a?.type === type);
  if (act) return act;
  if (type === 'textProjectile') {
    act = {
      type: 'textProjectile',
      point: { x: 0.5, y: 0.6 },
      direction: -90,
      text: 'BOO',
      color: '#000000',
      fontWeight: '700',
      fontFamily: '',
      fontSizeRatio: 0.42,
      durationMs: 1200,
      holdRatio: 0.4,
      distanceRatio: 0.62,
      scaleFrom: 0.65,
      scaleTo: 1.15,
      pattern: 'once',
      appliesTo: ['spore']
    };
  } else {
    act = {
      type: 'fire',
      point: { x: 0.5, y: 0.5 },
      direction: 0,
      pattern: 'alternate',
      rate: 3.2,
      jitter: 0.5,
      appliesTo: ['spore']
    };
  }
  st.objectActions = [...st.objectActions.filter((a) => a?.type !== type), act];
  return act;
}

function formatDistanceView(act) {
  if (!act) return '—';
  if (Number.isFinite(+act.distance) && +act.distance > 0) {
    return `${Math.round(+act.distance)} px`;
  }
  const r = Number.isFinite(+act.distanceRatio) ? +act.distanceRatio : 0.55;
  return `${r.toFixed(2)} × width`;
}

function formatFontSizeView(act) {
  if (!act) return '—';
  if (Number.isFinite(+act.fontSizePx) && +act.fontSizePx > 0) {
    return `${Math.round(+act.fontSizePx)} px`;
  }
  const r = Number.isFinite(+act.fontSizeRatio) ? +act.fontSizeRatio : 0.4;
  return `${r.toFixed(2)} × width`;
}

function formatFontFamilyView(act) {
  const ff = (act?.fontFamily != null ? String(act.fontFamily).trim() : '');
  if (!ff) return 'Default';
  const known = SAFE_FONT_OPTIONS.find((o) => o.value === ff);
  return known ? known.label : ff;
}

function syncOaFieldViews() {
  const st = currentElement();
  const act = primaryObjectAction(st);
  const wrap = $('oaTextProjectileFields');
  const schema = schemaForActionType(act?.type);
  const isTp = act?.type === 'textProjectile' && schema.length > 0;
  // Always show the same textProjectile field cards; disable pencils when N/A
  if (wrap) {
    wrap.hidden = false;
    wrap.classList.toggle('oa-fields-na', !isTp);
  }
  const reason = !act
    ? 'No object action on this element'
    : (!isTp
      ? `Text fields apply to textProjectile only (current: ${act.type || 'unknown'})`
      : '');
  const pencilIds = [
    'btnEditOaText',
    'btnEditOaDuration',
    'btnEditOaDistance',
    'btnEditOaFontFamily',
    'btnEditOaFontSize'
  ];
  for (const pid of pencilIds) {
    const btn = $(pid);
    if (!btn) continue;
    const na = !isTp;
    // Keep disabled while another mode is active OR fields N/A
    btn.disabled = na || !!state.activeMode;
    if (na) {
      btn.title = reason;
      btn.setAttribute('aria-disabled', 'true');
    } else if (!state.activeMode) {
      btn.removeAttribute('aria-disabled');
      const defaults = {
        btnEditOaText: 'Edit text',
        btnEditOaDuration: 'Edit duration',
        btnEditOaDistance: 'Edit distance',
        btnEditOaFontFamily: 'Edit font',
        btnEditOaFontSize: 'Edit font size'
      };
      btn.title = defaults[pid] || 'Edit';
    }
  }
  const tv = $('oaTextView');
  const dv = $('oaDurationView');
  const distV = $('oaDistanceView');
  const ffV = $('oaFontFamilyView');
  const fsV = $('oaFontSizeView');
  if (!isTp || !act) {
    if (tv) tv.textContent = '—';
    if (dv) dv.textContent = '—';
    if (distV) distV.textContent = '—';
    if (ffV) ffV.textContent = '—';
    if (fsV) fsV.textContent = '—';
    return;
  }
  if (tv) tv.textContent = act.text != null ? String(act.text) : 'BOO';
  if (dv) {
    const ms = Number.isFinite(+act.durationMs) ? Math.round(+act.durationMs) : 1200;
    dv.textContent = `${ms} ms`;
  }
  if (distV) distV.textContent = formatDistanceView(act);
  if (ffV) ffV.textContent = formatFontFamilyView(act);
  if (fsV) fsV.textContent = formatFontSizeView(act);
}

function snapshotOaField(mode, act) {
  if (!act) return {};
  if (mode === 'oaText') return { text: act.text != null ? String(act.text) : 'BOO' };
  if (mode === 'oaDuration') {
    return { durationMs: Number.isFinite(+act.durationMs) ? +act.durationMs : 1200 };
  }
  if (mode === 'oaDistance') {
    if (Number.isFinite(+act.distance) && +act.distance > 0) {
      return { unit: 'px', value: +act.distance };
    }
    return {
      unit: 'ratio',
      value: Number.isFinite(+act.distanceRatio) ? +act.distanceRatio : 0.55
    };
  }
  if (mode === 'oaFontFamily') {
    return { fontFamily: act.fontFamily != null ? String(act.fontFamily) : '' };
  }
  if (mode === 'oaFontSize') {
    if (Number.isFinite(+act.fontSizePx) && +act.fontSizePx > 0) {
      return { unit: 'px', value: +act.fontSizePx };
    }
    return {
      unit: 'ratio',
      value: Number.isFinite(+act.fontSizeRatio) ? +act.fontSizeRatio : 0.4
    };
  }
  return {};
}

function fillOaFieldInputs(mode, snapOrAct) {
  if (mode === 'oaText') {
    const input = $('oaTextInput');
    if (input) {
      input.value =
        snapOrAct?.text != null
          ? String(snapOrAct.text)
          : (snapOrAct && 'text' in snapOrAct ? '' : 'BOO');
    }
  } else if (mode === 'oaDuration') {
    const input = $('oaDurationInput');
    if (input) {
      const ms = Number.isFinite(+snapOrAct?.durationMs) ? +snapOrAct.durationMs : 1200;
      input.value = String(Math.round(ms));
    }
  } else if (mode === 'oaDistance') {
    const unitEl = $('oaDistanceUnit');
    const valEl = $('oaDistanceInput');
    let unit = snapOrAct?.unit;
    let value = snapOrAct?.value;
    if (!unit) {
      if (Number.isFinite(+snapOrAct?.distance) && +snapOrAct.distance > 0) {
        unit = 'px';
        value = +snapOrAct.distance;
      } else {
        unit = 'ratio';
        value = Number.isFinite(+snapOrAct?.distanceRatio) ? +snapOrAct.distanceRatio : 0.55;
      }
    }
    if (unitEl) unitEl.value = unit === 'px' ? 'px' : 'ratio';
    if (valEl) valEl.value = String(value);
  } else if (mode === 'oaFontFamily') {
    const sel = $('oaFontFamilySelect');
    const custom = $('oaFontFamilyCustom');
    const wrap = $('oaFontFamilyCustomWrap');
    const ff = snapOrAct?.fontFamily != null ? String(snapOrAct.fontFamily) : '';
    const known = SAFE_FONT_OPTIONS.some((o) => o.value === ff);
    if (sel) {
      if (!ff || known) {
        sel.value = ff;
        if (wrap) wrap.hidden = true;
      } else {
        sel.value = '__custom__';
        if (wrap) wrap.hidden = false;
        if (custom) custom.value = ff;
      }
    }
  } else if (mode === 'oaFontSize') {
    const unitEl = $('oaFontSizeUnit');
    const valEl = $('oaFontSizeInput');
    let unit = snapOrAct?.unit;
    let value = snapOrAct?.value;
    if (!unit) {
      if (Number.isFinite(+snapOrAct?.fontSizePx) && +snapOrAct.fontSizePx > 0) {
        unit = 'px';
        value = +snapOrAct.fontSizePx;
      } else {
        unit = 'ratio';
        value = Number.isFinite(+snapOrAct?.fontSizeRatio) ? +snapOrAct.fontSizeRatio : 0.4;
      }
    }
    if (unitEl) unitEl.value = unit === 'px' ? 'px' : 'ratio';
    if (valEl) valEl.value = String(value);
  }
}

/** Commit ONE textProjectile field; never touch other element / OA fields. */
function applyOaFieldCommit(mode) {
  const st = currentElement();
  if (!st) return;
  const act = ensurePrimaryActionOfType(st, 'textProjectile');
  if (!act) return;
  if (mode === 'oaText') {
    const v = ($('oaTextInput')?.value ?? 'BOO').trim() || 'BOO';
    act.text = v.slice(0, 32);
  } else if (mode === 'oaDuration') {
    let ms = Number($('oaDurationInput')?.value);
    if (!Number.isFinite(ms)) ms = 1200;
    act.durationMs = Math.max(200, Math.min(4000, Math.round(ms)));
  } else if (mode === 'oaDistance') {
    const unit = $('oaDistanceUnit')?.value === 'px' ? 'px' : 'ratio';
    let value = Number($('oaDistanceInput')?.value);
    if (unit === 'px') {
      if (!Number.isFinite(value) || value <= 0) value = 40;
      act.distance = Math.max(4, Math.min(2000, value));
      delete act.distanceRatio;
    } else {
      if (!Number.isFinite(value) || value <= 0) value = 0.55;
      act.distanceRatio = Math.max(0.05, Math.min(3, value));
      delete act.distance;
    }
  } else if (mode === 'oaFontFamily') {
    const sel = $('oaFontFamilySelect')?.value ?? '';
    if (sel === '__custom__') {
      act.fontFamily = ($('oaFontFamilyCustom')?.value || '').trim();
    } else {
      act.fontFamily = sel;
    }
  } else if (mode === 'oaFontSize') {
    const unit = $('oaFontSizeUnit')?.value === 'px' ? 'px' : 'ratio';
    let value = Number($('oaFontSizeInput')?.value);
    if (unit === 'px') {
      if (!Number.isFinite(value) || value <= 0) value = 24;
      act.fontSizePx = Math.max(8, Math.min(400, value));
      delete act.fontSizeRatio;
    } else {
      if (!Number.isFinite(value) || value <= 0) value = 0.42;
      act.fontSizeRatio = Math.max(0.05, Math.min(2, value));
      delete act.fontSizePx;
    }
  }
}


async function boot() {
  const [manifestSeed, anchors, seed, runtimeSeed] = await Promise.all([
    loadJson('/content/animations-manifest.json'),
    loadJson('/content/character-anchors.json'),
    loadJson('/content/cambio-placements.json'),
    loadJson('/content/runtime-config.json').catch(() => null)
  ]);
  state.anchors = anchors;
  const seedPlacements = migratePlacements(seed);
  state.placements = seedPlacements;
  state.runtimeConfig = runtimeSeed;
  const [runtime, placements] = await Promise.all([
    apiJson('/api/cambio/runtime-config').catch(() => null),
    apiJson('/api/cambio/placements').catch(() => null)
  ]);
  if (runtime?.config) state.runtimeConfig = runtime.config;
  if (placements?.placements) {
    state.placements = mergePlacementsPreferLive(seedPlacements, placements.placements);
  }
  if (!runtime?.config || !placements?.placements) {
    // A read-only Cambio session can still preview the exact live catalog.
    const live = await apiJson('/api/animations').catch(() => null);
    if (live?.ok) {
      if (!runtime?.config) state.runtimeConfig = live;
      if (!placements?.placements) {
        const liveIds = new Set(live.animations.map(animation => animation.id));
        const layouts = Object.fromEntries(Object.entries(live.placementsByAnimation || {})
          .filter(([id]) => liveIds.has(id)));
        state.placements = migratePlacements({
          ...seedPlacements,
          byAnimation: { ...seedPlacements.byAnimation, ...layouts }
        });
      }
    }
  }
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
        multiplier: 1,
        weight: 1,
        order: a.id === 'ghost' ? 0 : 1
      }))
    };
  }
  syncManifestFromRuntime();

  for (const anim of state.manifest.animations) {
    if (anim.preloadedAccessories) {
      mountProps(anim.id, { interactive: false, visible: true });
      break;
    }
  }

  ensureAnimDeskList();
  renderAnimList();
  $('startPlaytest').addEventListener('click', startPlaytest);
  $('stopPlaytest').addEventListener('click', stopPlaytest);
  wireSidebarToggle();
  wireEditSidebarToggle();
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
  $('btnEditSelectionMode')?.addEventListener('click', () => enterMode('selectionMode'));
  $('btnSaveSelectionMode')?.addEventListener('click', () => commitMode());
  $('btnCancelSelectionMode')?.addEventListener('click', () => cancelMode());
  $('btnEditInteractionOpacity')?.addEventListener('click', () => enterMode('interactionOpacity'));
  $('btnSaveInteractionOpacity')?.addEventListener('click', () => commitMode());
  $('btnCancelInteractionOpacity')?.addEventListener('click', () => cancelMode());
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

  $('btnEditOaText')?.addEventListener('click', () => enterMode('oaText'));
  $('btnSaveOaText')?.addEventListener('click', () => commitMode());
  $('btnCancelOaText')?.addEventListener('click', () => cancelMode());
  $('btnEditOaDuration')?.addEventListener('click', () => enterMode('oaDuration'));
  $('btnSaveOaDuration')?.addEventListener('click', () => commitMode());
  $('btnCancelOaDuration')?.addEventListener('click', () => cancelMode());
  $('btnEditOaDistance')?.addEventListener('click', () => enterMode('oaDistance'));
  $('btnSaveOaDistance')?.addEventListener('click', () => commitMode());
  $('btnCancelOaDistance')?.addEventListener('click', () => cancelMode());
  $('btnEditOaFontFamily')?.addEventListener('click', () => enterMode('oaFontFamily'));
  $('btnSaveOaFontFamily')?.addEventListener('click', () => commitMode());
  $('btnCancelOaFontFamily')?.addEventListener('click', () => cancelMode());
  $('btnEditOaFontSize')?.addEventListener('click', () => enterMode('oaFontSize'));
  $('btnSaveOaFontSize')?.addEventListener('click', () => commitMode());
  $('btnCancelOaFontSize')?.addEventListener('click', () => cancelMode());
  $('oaFontFamilySelect')?.addEventListener('change', () => {
    const wrap = $('oaFontFamilyCustomWrap');
    if (wrap) wrap.hidden = $('oaFontFamilySelect')?.value !== '__custom__';
  });

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

function getSelectionModeSetting() {
  const s = state.settings || state.runtimeConfig?.settings || {};
  const m = s.selectionMode === 'weighted' ? 'weighted' : 'alternate';
  return m;
}

function selectionModeLabel(mode) {
  return mode === 'weighted' ? 'Weighted' : 'Alternate';
}

function syncSelectionModeView() {
  const mode = getSelectionModeSetting();
  const view = $('selectionModeView');
  if (view) view.textContent = selectionModeLabel(mode);
  const input = $('selectionModeInput');
  if (input && state.activeMode !== 'selectionMode') input.value = mode;
}


function getInteractionOpacitySetting() {
  const s = state.settings || state.runtimeConfig?.settings || {};
  let o = Number(s.interactionOpacityDuringAnimation);
  if (!Number.isFinite(o)) o = 0.8;
  return Math.min(1, Math.max(0, o));
}

function syncInteractionOpacityView() {
  const o = getInteractionOpacitySetting();
  const view = $('interactionOpacityView');
  if (view) view.textContent = `${Math.round(o * 100)}%`;
  const input = $('interactionOpacityInput');
  if (input && state.activeMode !== 'interactionOpacity') input.value = String(o);
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
  if (mode === 'selectionMode') {
    if (state.activeMode && state.activeMode !== mode) cancelMode();
    state.activeMode = mode;
    const cur = getSelectionModeSetting();
    state.modeSnapshot = { selectionMode: cur };
    const input = $('selectionModeInput');
    if (input) input.value = cur;
    syncModeUi();
    return;
  }
  if (mode === 'interactionOpacity') {
    if (state.activeMode && state.activeMode !== mode) cancelMode();
    state.activeMode = mode;
    const o = getInteractionOpacitySetting();
    state.modeSnapshot = { interactionOpacityDuringAnimation: o };
    const input = $('interactionOpacityInput');
    if (input) input.value = String(o);
    syncModeUi();
    return;
  }
  // Generic per-type OA field editors (isolated; inputs are draft until ✓)
  if (OA_FIELD_MODES.has(mode)) {
    if (!state.editMode || !state.selectedAnim || !state.selectedElementId) return;
    if (state.activeMode && state.activeMode !== mode) cancelMode();
    const act = primaryObjectAction(currentElement());
    if (!act || act.type !== 'textProjectile') return;
    state.activeMode = mode;
    state.modeSnapshot = snapshotOaField(mode, act);
    fillOaFieldInputs(mode, act);
    if (mode === 'oaFontFamily') {
      const sel = $('oaFontFamilySelect');
      sel?.addEventListener?.(
        'change',
        () => {
          const wrap = $('oaFontFamilyCustomWrap');
          if (wrap) wrap.hidden = sel.value !== '__custom__';
        },
        { once: false }
      );
      const wrap = $('oaFontFamilyCustomWrap');
      if (wrap) wrap.hidden = sel?.value !== '__custom__';
    }
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
    const existing = primaryObjectAction(st);
    if (existing) {
      state.actionDraft = { ...existing, point: { ...(existing.point || { x: 0.5, y: 0.5 }) } };
    } else {
      state.actionDraft = {
        type: 'fire',
        point: { x: 0.5, y: 0.5 },
        direction: 0,
        pattern: 'alternate',
        rate: 3.2,
        jitter: 0.5,
        appliesTo: ['spore']
      };
    }
    const ah = $('actionHint');
    const kind = state.actionDraft.type === 'textProjectile' ? 'origin (mouth)' : 'muzzle';
    if (ah) ah.textContent = `Click the ${kind} on the ${selectedLabel()}.`;
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
  if (state.selectedAnim) mountProps(state.selectedAnim.id, { interactive: true });
}

async function commitMode() {
  if (!state.activeMode) return;
  // Isolation: OA field modes write ONLY that field on the primary textProjectile.
  if (OA_FIELD_MODES.has(state.activeMode)) {
    applyOaFieldCommit(state.activeMode);
  }
  // Isolation: action mode writes ONLY the matching objectAction type on commit.
  if (state.activeMode === 'action' && state.actionDraft) {
    const st = currentElement();
    if (st) {
      const t = state.actionDraft.type || 'fire';
      const others = (st.objectActions || []).filter((a) => a.type !== t);
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
      error(e);
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
      error(e);
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
      error(e);
      $('poolHint').textContent = `Reset fade save failed: ${e.message || e}`;
    }
  }
  if (state.activeMode === 'selectionMode') {
    const raw = $('selectionModeInput')?.value;
    const mode = raw === 'weighted' ? 'weighted' : 'alternate';
    const prev = state.runtimeConfig?.settings || state.settings || {};
    const settings = { ...prev, selectionMode: mode };
    state.settings = settings;
    if (state.runtimeConfig) state.runtimeConfig.settings = settings;
    try {
      await persistRuntime('selection-mode');
      syncSelectionModeView();
      $('poolHint').textContent = `Selection ${selectionModeLabel(mode)} live (next visitors ~15s, no redeploy)`;
    } catch (e) {
      error(e);
      $('poolHint').textContent = `Selection mode save failed: ${e.message || e}`;
    }
  }
  if (state.activeMode === 'interactionOpacity') {
    let o = Number($('interactionOpacityInput')?.value);
    if (!Number.isFinite(o)) o = 0.8;
    o = Math.min(1, Math.max(0, o));
    const prev = state.runtimeConfig?.settings || state.settings || {};
    const settings = { ...prev, interactionOpacityDuringAnimation: o };
    state.settings = settings;
    if (state.runtimeConfig) state.runtimeConfig.settings = settings;
    try {
      await persistRuntime('interaction-opacity');
      syncInteractionOpacityView();
      $('poolHint').textContent = `Click opacity ${Math.round(o * 100)}% during animation live (next visitors ~15s, no redeploy)`;
    } catch (e) {
      error(e);
      $('poolHint').textContent = `Interaction opacity save failed: ${e.message || e}`;
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
  } else if (mode === 'selectionMode') {
    const snap = state.modeSnapshot || {};
    const input = $('selectionModeInput');
    if (input) input.value = snap.selectionMode === 'weighted' ? 'weighted' : 'alternate';
    syncSelectionModeView();
  } else if (mode === 'interactionOpacity') {
    const snap = state.modeSnapshot || {};
    const input = $('interactionOpacityInput');
    let o = Number(snap.interactionOpacityDuringAnimation);
    if (!Number.isFinite(o)) o = 0.8;
    if (input) input.value = String(o);
    syncInteractionOpacityView();
  } else if (OA_FIELD_MODES.has(mode)) {
    // Field modes never mutate the element until ✓ — just restore inputs
    fillOaFieldInputs(mode, state.modeSnapshot || {});
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
  // Disable other pencils while one mode active; OA N/A state reapplied via syncOaFieldViews
  document.querySelectorAll('.ie-view .ie-btn').forEach((btn) => {
    const rowMode = btn.closest('.ie-row')?.dataset?.mode;
    if (mode) {
      btn.disabled = true;
    } else if (rowMode && OA_FIELD_MODES.has(rowMode)) {
      // leave disabled flag to syncOaFieldViews
    } else {
      btn.disabled = false;
    }
  });
  if (!mode) syncOaFieldViews();
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
    const act = primaryObjectAction(st);
    if (act) {
      const typ = act.type || 'action';
      av.textContent =
        `${typ} @ (${(+act.point?.x || 0).toFixed(2)},${(+act.point?.y || 0).toFixed(2)}) → ${Math.round(+act.direction || 0)}°`;
    } else {
      av.textContent = 'none';
    }
  }
  syncOaFieldViews();
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


/** Persist key — mirrors enVivo `envivo.sidebar.show` (Cambio-scoped). */
const CAMBIO_SIDEBAR_SHOW_KEY = 'cambio.sidebar.show';

function isSidebarCollapsed() {
  const root = $('cambioRoot');
  if (root?.dataset?.sidebarCollapsed === '1') return true;
  const side = $('sidebar');
  return Boolean(side?.classList.contains('hide'));
}

/**
 * Collapse/expand is overlay-only: state lives on #cambioRoot + #sidebar.
 * Never mutate body/html classes or fire layout changes on the public stage.
 */
function setSidebarVisible(show, { persist = true } = {}) {
  const visible = Boolean(show);
  const root = $('cambioRoot');
  if (root) {
    root.dataset.sidebarCollapsed = visible ? '0' : '1';
  }
  // Strip any legacy body classes from older builds (must not affect page CSS).
  document.body.classList.remove('sidebar-narrow', 'cambio-sidebar-collapsed');
  document.documentElement.classList.remove('sidebar-narrow', 'cambio-sidebar-collapsed');
  const side = $('sidebar');
  if (side) {
    side.classList.toggle('hide', !visible);
    side.classList.toggle('show', visible);
    side.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  const tog = $('evSidebarToggle');
  if (tog) {
    tog.setAttribute('aria-expanded', visible ? 'true' : 'false');
    tog.title = visible ? 'Collapse sidebar' : 'Expand sidebar';
  }
  const reopen = $('cambioSidebarReopen');
  if (reopen) {
    reopen.setAttribute('aria-hidden', visible ? 'true' : 'false');
  }
  if (persist) {
    try {
      localStorage.setItem(CAMBIO_SIDEBAR_SHOW_KEY, visible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
}

function wireSidebarToggle() {
  const toggle = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setSidebarVisible(isSidebarCollapsed());
  };
  $('evSidebarToggle')?.addEventListener('click', toggle);
  $('cambioSidebarReopen')?.addEventListener('click', toggle);
  let show = true;
  try {
    const stored = localStorage.getItem(CAMBIO_SIDEBAR_SHOW_KEY);
    if (stored === '0') show = false;
    if (stored === '1') show = true;
  } catch {
    /* ignore */
  }
  setSidebarVisible(show, { persist: false });
}

function visibilityControl(anim, field) {
  const label = field === 'live' ? 'Live' : 'Direct link';
  const checked = anim[field] && !anim.archived ? ' checked' : '';
  const attrs = `data-id="${escapeHtml(anim.id)}" data-visibility-field="${field}"`;
  return `<span class="cambio-visibility" data-visibility>
    <input type="checkbox" aria-label="${label}"${checked} disabled>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-act="visibility-edit" ${attrs} aria-label="Edit ${label}" title="Edit ${label}"${anim.archived ? ' disabled' : ''}>✎</button>
    <button type="button" class="btn btn-sm btn-success" data-act="visibility-save" ${attrs} aria-label="Save ${label}" title="Save ${label}" hidden>✓</button>
    <button type="button" class="btn btn-sm btn-outline-danger" data-act="visibility-cancel" ${attrs} aria-label="Cancel ${label} edit" title="Cancel ${label} edit" hidden>×</button>
  </span>`;
}

async function handleVisibilityAction(button, action, id) {
  const control = button.closest('[data-visibility]');
  const checkbox = control.querySelector('input');
  const edit = control.querySelector('[data-act="visibility-edit"]');
  const save = control.querySelector('[data-act="visibility-save"]');
  const cancel = control.querySelector('[data-act="visibility-cancel"]');
  const editing = action === 'visibility-edit';
  if (action === 'visibility-save') {
    save.disabled = cancel.disabled = checkbox.disabled = true;
    try {
      await patchAnimation(id, { [button.dataset.visibilityField]: checkbox.checked });
      saveStatus.textContent = 'Visibility saved.';
      return;
    } catch (error) {
      saveStatus.textContent = error.message;
      save.disabled = cancel.disabled = checkbox.disabled = false;
      return;
    }
  }
  if (!editing) checkbox.checked = checkbox.defaultChecked;
  checkbox.disabled = !editing;
  edit.hidden = editing;
  save.hidden = cancel.hidden = !editing;
  (editing ? checkbox : edit).focus();
}

function ensureAnimDeskList() {
  if (animDeskList) return animDeskList;
  const host = $('animListHost');
  if (!host) throw new Error('animListHost missing');

  const columns = [
    {
      key: 'label',
      label: 'Name',
      fit: 'content',
      className: 'cambio-col-name ev-sl-col--tight',
      render: (anim) => `<span class="label">${escapeHtml(anim.label)}</span>`
    },
    {
      key: 'actions',
      label: 'Actions',
      fit: 'content',
      sortType: 'none',
      className: 'cambio-col-actions ev-sl-col--tight text-end',
      render: (anim) => animListActionButtons(anim)
    },
    {
      key: 'live', label: 'Live', fit: 'content', sortType: 'none',
      render: anim => visibilityControl(anim, 'live')
    },
    {
      key: 'directLink', label: 'Direct Link', fit: 'content', sortType: 'none',
      render: anim => visibilityControl(anim, 'directLink')
    },
    {
      key: 'tier',
      label: 'Tier',
      fit: 'content',
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
      key: 'order',
      label: 'Order',
      fit: 'content',
      sortType: 'number',
      className: 'cambio-col-num',
      render: (anim) => {
        const order = anim.order != null && Number.isFinite(+anim.order) ? +anim.order : 0;
        return `<input type="number" step="1" data-act="order" data-id="${escapeHtml(anim.id)}" value="${escapeHtml(String(order))}" title="Alternate cycle order (lower first)" />`;
      }
    },
    {
      key: 'weight',
      label: 'Weight',
      fit: 'content',
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
      fit: 'content',
      sortType: 'number',
      className: 'cambio-col-num',
      render: (anim) => {
        const pcts = livePercents();
        const pct = anim.live && !anim.archived ? `${(pcts[anim.id] || 0).toFixed(1)}%` : '—';
        return `<span class="pct">${escapeHtml(pct)}</span>`;
      }
    },
  ];

  const detailHost = $('animDetailHost');
  animDeskList = mountEvScrollList(host, {
    title: 'Animations',
    searchPlaceholder: 'Search animations…',
    searchFields: ['id', 'label', 'tier'],
    columns,
    minRows: 10,
    padWhenEmpty: true,
    maxHeightCss: '27rem',
    emptyHtml: `<tr><td colspan="7" class="ev-hint">No animations yet</td></tr>`,
    rowKey: (item) => String(item.id),
    detailHost,
    renderDetail: (anim) => {
      return `<strong class="me-2">${escapeHtml(anim.label)}</strong>` + animListActionButtons(anim);
    },
    headerActions: [
      { label: '+ Create', attrs: 'id="btnCreateAnim"' },
      { label: 'Export→git', attrs: 'id="btnExportRepo" title="Snapshot KV → git"' }
    ],
    afterPaint: () => {
      enableCambioListHScroll(host);
      requestAnimationFrame(() => enableCambioListHScroll(host));
      wireAnimListActions();
    }
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
  enableCambioListHScroll(host);
  const _set = animDeskList.setItems.bind(animDeskList);
  animDeskList.setItems = (items) => {
    _set(items);
    stamp();
    enableCambioListHScroll(host);
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
  const wireClick = (root) => {
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
      if (act.startsWith('visibility-')) void handleVisibilityAction(btn, act, id);
      else if (act === 'show') showAnimation(id);
      else if (act === 'copy-url') void copyCostumeUrl(id);
      else if (act === 'play') void playAnimation(id);
      else if (act === 'click-preview') void previewClickAnimation(id);
      else if (act === 'edit') enterEdit(id);
      else if (act === 'archive') void toggleArchive(id);
    });
  };
  wireClick($('playtestChoices'));
  wireClick($('animListHost'));
  wireClick($('animDetailHost'));
  wireClick($('animList'));

  const root = $('animListHost') || $('animList');
  if (!root || root.dataset.cambioChangeWired === '1') return;
  root.dataset.cambioChangeWired = '1';

  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    if (!act || !id) return;
    const anim = (state.runtimeConfig?.animations || state.manifest.animations || []).find((a) => a.id === id);
    if (!anim) return;
    if (act === 'tier' && el instanceof HTMLSelectElement) {
      void (async () => {
        try {
          await patchAnimation(id, { tier: el.value });
          saveStatus.textContent = `${anim.label} tier=${el.value}`;
        } catch (err) {
          saveStatus.textContent = err.message;
          renderAnimList();
        }
      })();
    } else if (act === 'order' && el instanceof HTMLInputElement) {
      const o = Number(el.value);
      if (!Number.isFinite(o)) return;
      const order = Math.floor(o);
      (async () => {
        try {
          await patchAnimation(id, { order });
          saveStatus.textContent = `${anim.label} order=${order}`;
        } catch (e) {
          error(e);
          saveStatus.textContent = `Order save failed: ${e.message || e}`;
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

const playtestSelection = new Set();
let playtestSelectionInitialized = false;
let playtestSidebarWasVisible = true;

let playtestList;
let playtestChoices = [];

function renderPlaytestChoices(animations) {
  const list = $('playtestChoices');
  if (!list) return;
  playtestChoices = animations.filter(animation => !animation.archived);
  if (!playtestSelectionInitialized) {
    for (const animation of playtestChoices) if (animation.live) playtestSelection.add(animation.id);
    playtestSelectionInitialized = true;
  }
  if (!playtestList) {
    playtestList = mountEvScrollList(list, {
      title: 'Animations',
      searchPlaceholder: 'Search animations…',
      searchFields: ['id', 'label'],
      minRows: 10,
      padWhenEmpty: true,
      maxHeightCss: '27rem',
      columns: [
        { key: 'label', label: 'Name', render: animation => `<label><input type="checkbox" data-playtest-id="${escapeHtml(animation.id)}"${playtestSelection.has(animation.id) ? ' checked' : ''}> ${escapeHtml(animation.label || animation.id)}</label>` },
        { key: 'actions', label: 'Actions', render: animation => animListActionButtons(animation, true) },
        { key: 'live', label: 'Status', render: animation => visibilityControl(animation, 'live') },
        { key: 'directLink', label: 'Direct Link', render: animation => visibilityControl(animation, 'directLink') }
      ],
      afterPaint: () => wireAnimListActions()
    });
    $('playtestShortcuts').addEventListener('click', event => {
      const mode = event.target.closest('[data-playtest-select]')?.dataset.playtestSelect;
      if (!mode) return;
      playtestSelection.clear();
      for (const animation of playtestChoices) {
        if (mode === 'all' || (mode === 'live' && animation.live) || (mode === 'inactive' && !animation.live)) {
          playtestSelection.add(animation.id);
        }
      }
      playtestList.setItems(playtestChoices);
    });
    list.addEventListener('change', event => {
      const id = event.target.dataset.playtestId;
      if (!id) return;
      if (event.target.checked) playtestSelection.add(id);
      else playtestSelection.delete(id);
    });
  }
  playtestList.setItems(playtestChoices);
}

let stopShowing;

function showAnimation(animId) {
  if (state._activationBusy) return;
  const anim = state.manifest.animations.find(entry => entry.id === animId);
  if (!anim) return;
  stopPlaytest();
  if (state.editMode) exitEdit();
  state.selectedAnim = anim;
  mountProps(animId);

  const stage = $('siteStage');
  const bounds = stage.getBoundingClientRect();
  const body = creature.getBoundingClientRect();
  const box = { width: body.width, height: body.height };
  const elements = compositeElementsFor(animId);
  const ghostBody = anim.playMode === 'legacy-ghost' ? elements.find(el => el.role === 'sporeBody' || el.id === 'ghostBody') : null;
  const scale = Math.min(.21, bounds.width / (box.width * 5), bounds.height / (box.height * 5));
  const width = box.width * scale;
  const height = box.height * scale;
  const x = body.left - bounds.left + box.width / 2;
  const y = body.top - bounds.top + box.height / 2;
  const dx = box.width / 2 + width * .65;
  const dy = box.height / 2 + height * .65;
  const spores = [[x - dx, y], [x + dx, y], [x, y - dy], [x, y + dy]].map(([left, top]) => {
    const node = buildCharacterComposite({
      baseSrc: ghostBody ? null : creature.getAttribute('src'),
      elements, box, scale
    });
    node.classList.add('cambio-show-spore');
    node.style.left = Math.max(0, Math.min(bounds.width - width, left - width / 2)) + 'px';
    node.style.top = Math.max(0, Math.min(bounds.height - height, top - height / 2)) + 'px';
    node.style.zIndex = '25';
    stage.append(node);
    return node;
  });
  const sporeElements = elements.map(el => ({
    ...el, placement: {
      ...el.placement,
      objectActions: (el.placement.objectActions || []).filter(action => (action.phase || 'activation') === 'activation')
    }
  }));
  let actions = [];
  const fire = () => {
    actions.forEach(action => action.stop());
    actions = spores.map((root, sporeIndex) => runObjectActions({ root, elements: sporeElements, target: 'spore', sporeIndex }));
  };
  fire();
  const timer = setInterval(fire, 2400);
  stopShowing = () => {
    clearInterval(timer);
    actions.forEach(action => action.stop());
    spores.forEach(node => node.remove());
    mountProps(null);
  };
  $('stopPlaytest').textContent = 'Stop show';
  $('stopPlaytest').hidden = false;
  $('stageHint').textContent = 'Showing ' + anim.label;
}

function stopPlaytest() {
  if (stopShowing) {
    stopShowing();
    stopShowing = null;
  }
  $('stopPlaytest').textContent = 'Stop playtest';
  const frame = $('cambioPlaytestFrame');
  if (frame) {
    frame.remove();
    setSidebarVisible(playtestSidebarWasVisible, { persist: false });
  }
  $('siteStage').style.visibility = '';
  $('stopPlaytest').hidden = true;
  $('playtestStatus').textContent = '';
}

function startPlaytest() {
  const animations = playtestChoices
    .filter(animation => playtestSelection.has(animation.id))
    .map(animation => ({ ...animation, live: true, weight: Math.max(1, Number(animation.weight) || 1) }));
  if (!animations.length) {
    $('playtestStatus').textContent = 'Select at least one animation to playtest.';
    return;
  }
  if (state._activationBusy) {
    $('playtestStatus').textContent = 'Wait for the current preview to finish.';
    return;
  }
  if (state.editMode) exitEdit();
  stopPlaytest();
  playtestSidebarWasVisible = !isSidebarCollapsed();
  setSidebarVisible(false, { persist: false });
  const frame = document.createElement('iframe');
  frame.id = 'cambioPlaytestFrame';
  frame.title = 'Live game playtest';
  frame.cambioPlaytestConfig = deepClone({
    ...state.runtimeConfig,
    settings: state.settings,
    animations,
    seasons: [],
    placementsByAnimation: Object.fromEntries(animations.map(animation => [
      animation.id, ensureAnimPlacement(animation.id)
    ]))
  });
  frame.src = '/';
  $('siteStage').style.visibility = 'hidden';
  $('siteStage').after(frame);
  $('stopPlaytest').hidden = false;
  $('playtestStatus').textContent = 'Starting playtest…';
  const deadline = Date.now() + 12000;
  const checkReady = () => {
    if (!frame.isConnected) return;
    try {
      if (animations.some(animation => animation.id === frame.contentWindow.__yaitgPrepared?.id)
          && frame.contentWindow.__yaitgPrepared?.ready) {
        $('playtestStatus').textContent = 'Playtest running. Click the platypus to play.';
        return;
      }
    } catch { /* A redirected frame cannot run the local selection. */ }
    if (Date.now() < deadline) setTimeout(checkReady, 150);
    else {
      stopPlaytest();
      $('playtestStatus').textContent = 'Playtest could not load the selected costumes.';
    }
  };
  checkReady();
}

function renderAnimList() {
  ensureAnimDeskList();
  const all = state.runtimeConfig?.animations || state.manifest.animations || [];
  const q = state.animFilter || '';
  // mountEvScrollList owns search; pass full pool (archived stay visible so Restore works).
  const pool = all.slice();
  animDeskList.setItems(pool);
  renderPlaytestChoices(all);
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
    const existingOrders = (state.runtimeConfig?.animations || []).map((a) => Number(a.order)).filter(Number.isFinite);
    const nextOrder = existingOrders.length ? Math.max(...existingOrders) + 1 : 0;
    const body = {
      id,
      label,
      type: fd.get('type') || 'character-overlay-activation',
      tier: fd.get('tier') || 'legendary',
      multiplier: mult,
      weight: mult,
      order: nextOrder,
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
  if(el.placement)return editorPlacement(el.placement);
  const fromCode = DEFAULT_PLACEMENTS_BY_ANIMATION[anim?.id]?.elements?.[el.id];
  if (fromCode) {
    const cloned = deepClone(fromCode);
    if (Object.prototype.hasOwnProperty.call(el, 'flipX')) cloned.flipX = !!el.flipX;
    return cloned;
  }
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
  overlay.style.pointerEvents = '';
  overlay.__costumeBackLayer?.remove();overlay.__costumeBackLayer=null;
  markerLayer.innerHTML = '';
  overlay.classList.toggle('editing', interactive);
  syncModeUi();
  if (!animId || !visible) return;
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.elements?.length) return;
  const place = ensureAnimPlacement(animId);
  for (const el of [...anim.elements].sort((a,b)=>(place.elements[a.id]?.order||0)-(place.elements[b.id]?.order||0))) {
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
    if (interactive && (!state.activeMode || state.activeMode === 'move')) img.classList.add('draggable-prop');
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
    img.style.zIndex=st.layer==='behind-character'?'1':'5';
    if (interactive) bindPropPointer(img, animId, el.id);
    if(st.layer==='behind-character'){
      if(!overlay.__costumeBackLayer){const back=document.createElement('div');back.className='costume-back-layer';back.style.cssText=`position:absolute;inset:0;z-index:1;overflow:visible;pointer-events:${interactive?'auto':'none'};opacity:${visible?1:0}`;creatureRig.insertBefore(back,creature);overlay.__costumeBackLayer=back;}
      overlay.__costumeBackLayer.appendChild(img);
    }else overlay.appendChild(img);
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
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Keep the hit element mounted so the same press can select and drag.
    if (state.selectedElementId !== elementId) {
      if (state.activeMode) {
        cancelMode();
        state.selectedElementId = elementId;
        highlightElementRow(elementId);
        refreshViews();
        mountProps(animId, { interactive: true });
        return;
      }
      state.selectedElementId = elementId;
      for (const prop of creatureRig.querySelectorAll('.cambio-prop.selected')) prop.classList.remove('selected');
      img.classList.add('selected');
      highlightElementRow(elementId);
      refreshViews();
      renderMarkers(animId, elementId);
    }

    // Action point: click muzzle (normalized on object), then direction
    if (state.activeMode === 'action') {
      const rect = img.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      if (state.actionPick === 'point' || !state.actionDraft) {
        if (!state.actionDraft) {
          const existing = primaryObjectAction(currentElement());
          state.actionDraft = existing
            ? { ...existing, point: { x: nx, y: ny } }
            : { type: 'fire', point: { x: nx, y: ny }, direction: 0, pattern: 'alternate', rate: 3.2, jitter: 0.5, appliesTo: ['spore'] };
        } else {
          state.actionDraft.point = { x: nx, y: ny };
        }
        state.actionPick = 'direction';
        const ah = $('actionHint');
        if (ah) ah.textContent = 'Click or drag to set direction, then ✓.';
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

    if (!state.activeMode || state.activeMode === 'move') {
      const st = ensureAnimPlacement(animId).elements[elementId];
      const original = { ...st.characterAnchor };
      let moved = false;
      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - e.clientX;
        const dy = ev.clientY - e.clientY;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        if (!moved) {
          moved = true;
          img.classList.add('dragging');
          markerLayer.replaceChildren();
        }
        const box = creatureBoxInRig();
        st.characterAnchor = {
          x: Math.min(1.15, Math.max(-0.15, original.x + dx / box.width)),
          y: Math.min(1.15, Math.max(-0.15, original.y + dy / box.height))
        };
        positionProp(img, st);
        const mv = $('moveView');
        if (mv) {
          mv.textContent =
            `(${st.characterAnchor.x.toFixed(2)}, ${st.characterAnchor.y.toFixed(2)})`;
        }
      };
      const finish = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        img.removeEventListener('pointermove', move);
        img.removeEventListener('pointerup', finish);
        img.removeEventListener('pointercancel', finish);
        img.removeEventListener('lostpointercapture', finish);
        if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
        img.classList.remove('dragging');
        if (!moved || !img.isConnected) return;
        if (ev.type !== 'pointerup') st.characterAnchor = original;
        else $('saveStatus').textContent = 'Placement changed. Save to keep it.';
        mountProps(animId, { interactive: true });
        refreshViews();
      };
      img.setPointerCapture(e.pointerId);
      img.addEventListener('pointermove', move);
      img.addEventListener('pointerup', finish);
      img.addEventListener('pointercancel', finish);
      img.addEventListener('lostpointercapture', finish);
    }
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


/** Build flat item rows for the edit mountEvScrollList (overlays, object actions, effects). */
function buildEditItems(anim) {
  const items = [];
  if (!anim) return items;
  const place = ensureAnimPlacement(anim.id);
  for (const el of anim.elements || []) {
    items.push({
      kind: 'element',
      id: `element:${el.id}`,
      elementId: el.id,
      name: elementLabel(el.id),
      type: 'Overlay',
      meta: el.anchor || '—',
      live: true
    });
    const st = place.elements?.[el.id];
    for (const act of st?.objectActions || []) {
      items.push({
        kind: 'action',
        id: `action:${el.id}:${act.type || 'fire'}`,
        elementId: el.id,
        actionType: act.type || 'fire',
        name: `${elementLabel(el.id)} · ${act.type || 'fire'}`,
        type: 'Action',
        meta: act.pattern || act.type || 'fire',
        live: Array.isArray(act.appliesTo) ? act.appliesTo.includes('activation') : true
      });
    }
  }
  if (anim.clickEffect) {
    const ce = anim.clickEffect;
    items.push({
      kind: 'effect',
      id: 'effect:clickEffect',
      elementId: null,
      name: ce.type === 'composite-spores' || ce.type === 'spores' ? 'Click spores' : 'Click effect',
      type: 'Effect',
      meta: ce.type || '—',
      live: true,
      effect: ce
    });
  }
  return items;
}

function selectEditItem(item) {
  if (!item || !state.selectedAnim) return;
  if (state.activeMode) cancelMode();
  if (item.kind === 'element' || item.kind === 'action') {
    state.selectedElementId = item.elementId;
    highlightElementRow(item.elementId);
    refreshViews();
    mountProps(state.selectedAnim.id, { interactive: true });
    if (item.kind === 'action') {
      // Focus action-point editor for this element (does not start mode until pencil)
      selectedControls?.classList.remove('hidden');
    }
  } else if (item.kind === 'effect') {
    // Effect rows do not select a stage overlay; keep current element selection
    refreshViews();
  }
}

function isEditSidebarCollapsed() {
  const root = $('cambioRoot');
  return root?.dataset?.editSidebarCollapsed === '1';
}

function setEditSidebarVisible(show, { persist = false } = {}) {
  const visible = Boolean(show);
  const root = $('cambioRoot');
  if (root) root.dataset.editSidebarCollapsed = visible ? '0' : '1';
  const side = $('editSection');
  if (side && !side.classList.contains('hidden')) {
    side.classList.toggle('hide', !visible);
    side.classList.toggle('show', visible);
  }
  const tog = $('evEditSidebarToggle');
  if (tog) {
    tog.setAttribute('aria-expanded', visible ? 'true' : 'false');
    tog.title = visible ? 'Collapse edit sidebar' : 'Expand edit sidebar';
  }
  const reopen = $('cambioEditSidebarReopen');
  if (reopen) reopen.setAttribute('aria-hidden', visible ? 'true' : 'false');
}

function wireEditSidebarToggle() {
  const toggle = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!state.editMode) return;
    setEditSidebarVisible(isEditSidebarCollapsed());
  };
  $('evEditSidebarToggle')?.addEventListener('click', toggle);
  $('cambioEditSidebarReopen')?.addEventListener('click', toggle);
}

function ensureEditItemList() {
  const host = $('editItemListHost');
  if (!host) return null;
  if (editItemList) return editItemList;

  const br = ' style="border-radius:0"';
  const columns = [
    {
      key: 'name',
      label: 'Name',
      fit: 'content',
      sortType: 'string',
      render: (row) => `<span class="cambio-item-name">${escapeHtml(row.name)}</span>`
    },
    {
      key: 'type',
      label: 'Type',
      fit: 'content',
      sortType: 'string',
      render: (row) => `<span class="text-body-secondary">${escapeHtml(row.type)}</span>`
    },
    {
      key: 'meta',
      label: 'Detail',
      fit: 'content',
      sortType: 'string',
      render: (row) => `<span class="text-body-secondary">${escapeHtml(row.meta || '—')}</span>`
    },
    {
      key: 'actions',
      label: 'Actions',
      fit: 'content',
      sortType: 'none',
      className: 'cambio-col-actions ev-sl-col--tight text-end',
      render: (row) => editItemActionButtons(row)
    }
  ];

  const detailHost = $('editItemDetailHost');
  editItemList = mountEvScrollList(host, {
    title: 'Items',
    searchPlaceholder: 'Search items…',
    searchFields: ['name', 'type', 'meta', 'elementId'],
    columns,
    minRows: 6,
    maxHeightCss: 'min(40vh, 22rem)',
    emptyHtml: `<tr><td colspan="4" class="ev-hint">No items</td></tr>`,
    rowKey: (item) => String(item.id),
    detailHost,
    selectedId: state.selectedElementId ? `element:${state.selectedElementId}` : null,
    onSelect: (row) => selectEditItem(row),
    renderDetail: (row) => {
      const br2 = ' style="border-radius:0"';
      return `<strong class="me-2">${escapeHtml(row.name)}</strong><span class="text-body-secondary me-2">${escapeHtml(row.type)}</span>` +
        `<button type="button" class="btn btn-sm btn-outline-dark"${br2} data-edit-act="select" data-item-id="${escapeHtml(row.id)}">Select</button>`;
    },
    afterPaint: () => {
      enableCambioListHScroll(host);
      requestAnimationFrame(() => enableCambioListHScroll(host));
      wireEditItemListActions();
    }
  });
  enableCambioListHScroll(host);

  host.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('[data-edit-act]');
    if (!btn || !host.contains(btn)) return;
    ev.preventDefault();
    ev.stopPropagation();
    handleEditItemAction(btn.getAttribute('data-edit-act'), btn.getAttribute('data-item-id'));
  });

  return editItemList;
}

function wireEditItemListActions() {
  /* click delegated on host in ensureEditItemList */
}

function handleEditItemAction(act, itemId) {
  if (!act || !itemId || !state.selectedAnim) return;
  const items = buildEditItems(state.selectedAnim);
  const row = items.find((r) => r.id === itemId);
  if (!row) return;
  if (act === 'select' || act === 'edit-element') {
    if (act === 'edit-element' && row.kind !== 'element' && row.kind !== 'action') return;
    selectEditItem(row);
    if (act === 'edit-element') selectedControls?.classList.remove('hidden');
    return;
  }
  if (act === 'edit-action') {
    if (row.kind !== 'action') return;
    selectEditItem(row);
    // Open action pencil mode for this element only
    const btn = $('btnEditAction');
    if (btn) btn.click();
    return;
  }
  if (act === 'delete-action') {
    if (row.kind !== 'action') return;
    const place = ensureAnimPlacement(state.selectedAnim.id);
    const st = place.elements?.[row.elementId];
    if (!st) return;
    const before = st.objectActions || [];
    st.objectActions = before.filter((a) => (a.type || 'fire') !== (row.actionType || 'fire'));
    state.dirty = true;
    saveStatus.textContent = `Removed ${row.actionType || 'action'} from ${elementLabel(row.elementId)} (Save placements to persist)`;
    refreshEditItemList(state.selectedAnim.id);
    refreshViews();
    mountProps(state.selectedAnim.id, { interactive: true });
  }
}

function refreshEditItemList(animId) {
  const anim =
    state.selectedAnim?.id === animId
      ? state.selectedAnim
      : (state.runtimeConfig?.animations || state.manifest?.animations || []).find((a) => a.id === animId);
  if (!anim) return;
  ensureEditItemList();
  const items = buildEditItems(anim);
  editItemList?.setItems?.(items);
  if (state.selectedElementId && editItemList?.select) {
    try { editItemList.select(`element:${state.selectedElementId}`); } catch { /* ignore */ }
  }
  wireEditItemListActions();
}

function enterEdit(animId) {
  const pool = state.runtimeConfig?.animations || state.manifest?.animations || [];
  const anim = pool.find((a) => a.id === animId) || state.manifest?.animations?.find((a) => a.id === animId);
  if (!anim || anim.editable === false || anim.placementEditable === false) return;
  if ($('cambioPlaytestFrame') || stopShowing) stopPlaytest();
  if (!state.manifest?.animations?.some((a) => a.id === animId) && state.manifest) {
    state.manifest.animations.push(anim);
  }
  if (state.activeMode) cancelMode();
  state.selectedAnim = anim;
  state.editMode = true;
  state.selectedElementId = anim.elements[0]?.id || null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character', 'picking-object');
  document.body.classList.add('cambio-editing');
  const root = $('cambioRoot');
  if (root) {
    root.dataset.editing = '1';
    root.dataset.editSidebarCollapsed = '0';
  }
  editSection.classList.remove('hidden', 'hide');
  editSection.classList.add('show');
  $('editTitle').textContent = anim.label || animId;
  const place = ensureAnimPlacement(animId);
  transitionSelect.innerHTML = '';
  for (const tr of anim.transitionsAvailable || ['none']) {
    const opt = document.createElement('option');
    opt.value = tr;
    opt.textContent = tr;
    if ((place.transitionId || 'lightning') === tr) opt.selected = true;
    transitionSelect.appendChild(opt);
  }
  for (const el of anim.elements || []) {
    if (!place.elements[el.id]) place.elements[el.id] = defaultElementState(anim, el);
    else place.elements[el.id] = migrateElement(place.elements[el.id]);
  }
  setEditSidebarVisible(true, { persist: false });
  ensureEditItemList();
  refreshEditItemList(animId);
  highlightElementRow(state.selectedElementId);
  refreshViews();
  syncModeUi();
  mountProps(animId, { interactive: true });
  $('stageHint').textContent = 'Edit: select an item · pencil a property · Save placements · Play';
  markAnimRowActive(animId);
}

function highlightElementRow(id) {
  if (editItemList?.select) {
    const key = id ? `element:${id}` : null;
    try { editItemList.select(key); } catch { /* ignore */ }
  }
  // Legacy ul fallback (removed from DOM after edit-sidebar wave)
  if (elementList) {
    [...elementList.querySelectorAll('.el-row')].forEach((li) => {
      li.classList.toggle('selected', li.dataset.elementId === id);
    });
  }
}

function exitEdit() {
  if (state.activeMode) cancelMode();
  state.editMode = false;
  state.selectedElementId = null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character', 'picking-object', 'cambio-editing');
  const root = $('cambioRoot');
  if (root) {
    root.dataset.editing = '0';
    root.dataset.editSidebarCollapsed = '1';
  }
  editSection.classList.add('hidden');
  editSection.classList.remove('hide', 'show');
  const reopen = $('cambioEditSidebarReopen');
  if (reopen) reopen.setAttribute('aria-hidden', 'true');
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
      ...el,
      id: el.id,
      role:el.role||null,
      src: el.src.startsWith('/') || el.src.startsWith('http') ? el.src : '/' + el.src,
      placement: st
    };
  });
}

/**
 * Play = activate. Ghost uses image-overlay + firework spores (apex parity).
 * Cowboy and other costumes use the public overlay renderer on #mainCreature.
 * Mini spores remain small base+overlay composites.
 */
/**
 * Preview the per-click character burst for an animation (clickEffect).
 * Editable later via manifest; default = mini composite replicas or ghost spores.
 */
function previewClickAnimation(animId) {
  if (stopShowing) stopPlaytest();
  const anim = (state.runtimeConfig?.animations || state.manifest.animations || [])
    .find((a) => a.id === animId);
  if (!anim) return;
  const container = $('siteStage');
  const rect = container.getBoundingClientRect();
  // Spawn near creature center
  const cbox = creature.getBoundingClientRect();
  const x = cbox.left + cbox.width / 2 - rect.left;
  const y = cbox.top + cbox.height / 2 - rect.top;
  const elements = compositeElementsFor(animId);
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

async function playAnimation(animId,{signal}={}) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim) return;
  if ($('cambioPlaytestFrame') || stopShowing) stopPlaytest();
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
        signal,
        animation:anim,
        transitionId:ensureAnimPlacement(animId).transitionId,
        composite:{baseSrc:creature.getAttribute('src'),elements:compositeElementsFor(animId)},
        container,
        creature,
        creatureRig,
        sporeHost: container,
        profile: 'ghost',
        stormResetDurationMs: state.settings.stormResetDurationMs
      });
      $('stageHint').textContent = 'Ghost play finished';
      return;
    }

    const elements = compositeElementsFor(animId);
    mountOverlayProps(overlay, { creature, creatureRig, elements });
    overlay.style.opacity = '0';
    await activate({
      signal,
      animation:anim,
      transitionId:ensureAnimPlacement(animId).transitionId,
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
      stormResetDurationMs: state.settings.stormResetDurationMs
    });

    // Reset: hide/remove overlay items; live character untouched
    if (state.editMode) {
      mountProps(animId, { interactive: true });
    } else {
      overlay.innerHTML = '';
      overlay.__costumeBackLayer?.remove();
      overlay.__costumeBackLayer = null;
      overlay.style.opacity = '';
      overlay.classList.remove('activation-flash-host');
    }
    $('stageHint').textContent = `${anim.label} play finished`;
  } catch (err) {
    error('activation failed', err);
    $('stageHint').textContent = `Play failed: ${err.message || err}`;
    overlay.innerHTML = '';
    overlay.__costumeBackLayer?.remove();
    overlay.__costumeBackLayer = null;
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
    for(const layout of Object.values(migrated.byAnimation||{}))for(const [id,p]of Object.entries(layout.elements||{}))if(p.attachment)layout.elements[id]=normalizeEditedPlacement(p);
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
  setSidebarVisible,
  isSidebarCollapsed,
  wireSidebarToggle,
  runActivationPlay: (id) => playAnimation(id),
  previewClick: (id) => previewClickAnimation(id),
  compositeElementsFor,
  renderActionButtons,
  animListActionButtons,
  editItemActionButtons,
  toggleArchive,

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

boot().then(()=>mountCostumeWorkshop({
  async onPreview(result,signal){
    state.runtimeConfig.animations=[...state.runtimeConfig.animations.filter(a=>a.id!==result.animation.id),result.animation];syncManifestFromRuntime();state.placements.byAnimation[result.animation.id]=deepClone(result.placements);state.selectedAnim=result.animation;renderAnimList();await playAnimation(result.animation.id,{signal});
  },
  async onSaved(result){
    const rc=await apiJson('/api/cambio/runtime-config');state.runtimeConfig=rc.config;syncManifestFromRuntime();state.placements.byAnimation[result.animation.id]=deepClone(result.placements);renderAnimList();
  }
})).catch((err) => {
  saveStatus.textContent = `Boot failed: ${err.message}`;
  error(err);
});
