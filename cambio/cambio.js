/**
 * Cambio admin — Play / Edit with modal pencil editors (enVivo ✎/✓/✕).
 * Modes write only their own fields; Cancel restores a deep snapshot.
 * Public apex behavior unchanged; Access-gated on app.youareinthegame.com.
 */
const state = {
  manifest: null,
  anchors: null,
  placements: null,
  selectedAnim: null,
  editMode: false,
  selectedElementId: null,
  dirty: false,
  /** null | 'connector' | 'rotation' | 'move' | 'size' | 'transition' */
  activeMode: null,
  /** Deep clone of element (or transitionId) when mode opened */
  modeSnapshot: null,
  /** null | 'object' | 'character' — only while activeMode === 'connector' */
  connectorPick: null
};

const $ = (id) => document.getElementById(id);
const animList = $('animList');
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

async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

function migrateElement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.characterAnchor && raw.objectAnchor) {
    return {
      objectAnchor: { x: +raw.objectAnchor.x, y: +raw.objectAnchor.y },
      characterAnchor: { x: +raw.characterAnchor.x, y: +raw.characterAnchor.y },
      rotation: Number.isFinite(+raw.rotation) ? +raw.rotation : (+raw.rotationDeg || 0),
      scale: Number.isFinite(+raw.scale) ? +raw.scale : (+raw.widthFrac || 0.3),
      transition: raw.transition ?? null,
      flipX: !!raw.flipX
    };
  }
  return {
    objectAnchor: { x: 0.5, y: 0.5 },
    characterAnchor: { x: +raw.x || 0.5, y: +raw.y || 0.5 },
    rotation: +raw.rotationDeg || +raw.rotation || 0,
    scale: +raw.widthFrac || +raw.scale || 0.3,
    transition: raw.transition ?? null,
    flipX: !!raw.flipX
  };
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
  const [manifest, anchors, seed] = await Promise.all([
    loadJson('/content/animations-manifest.json'),
    loadJson('/content/character-anchors.json'),
    loadJson('/content/cambio-placements.json')
  ]);
  state.manifest = manifest;
  state.anchors = anchors;
  state.placements = migratePlacements(seed);
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

  renderAnimList();
  $('btnSave').addEventListener('click', savePlacements);
  $('btnExitEdit').addEventListener('click', () => exitEdit());

  $('btnEditTransition').addEventListener('click', () => enterMode('transition'));
  $('btnSaveTransition').addEventListener('click', () => commitMode());
  $('btnCancelTransition').addEventListener('click', () => cancelMode());
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

function enterMode(mode) {
  if (!state.editMode || !state.selectedAnim) return;
  if (mode !== 'transition' && !state.selectedElementId) return;
  if (state.activeMode && state.activeMode !== mode) {
    cancelMode();
  }
  state.activeMode = mode;
  if (mode === 'transition') {
    const place = ensureAnimPlacement(state.selectedAnim.id);
    state.modeSnapshot = { transitionId: place.transitionId || 'lightning' };
  } else {
    const st = currentElement();
    state.modeSnapshot = deepClone(st);
  }
  state.connectorPick = mode === 'connector' ? 'object' : null;
  document.body.classList.toggle('picking-character', false);
  document.body.classList.toggle('picking-object', mode === 'connector');
  if (mode === 'connector') {
    connectorHint.textContent = `Click a connector point on the ${selectedLabel()}.`;
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

function commitMode() {
  if (!state.activeMode) return;
  // Working values already written into state; just clear mode.
  // Isolation: writers only touch their fields while mode is active.
  state.activeMode = null;
  state.modeSnapshot = null;
  state.connectorPick = null;
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
    document.body.classList.remove('picking-character', 'picking-object');
    syncModeUi();
    return;
  }
  const mode = state.activeMode;
  if (mode === 'transition') {
    ensureAnimPlacement(state.selectedAnim.id).transitionId = state.modeSnapshot.transitionId;
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
}

function refreshViews() {
  const place = state.selectedAnim ? ensureAnimPlacement(state.selectedAnim.id) : null;
  if (place) {
    $('transitionView').textContent = place.transitionId || 'lightning';
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

function renderAnimList() {
  animList.innerHTML = '';
  for (const anim of state.manifest.animations) {
    const li = document.createElement('li');
    li.dataset.id = anim.id;
    li.innerHTML = `<span class="label">${anim.label}</span>`;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn primary';
    play.textContent = 'Play';
    play.addEventListener('click', () => playAnimation(anim.id));
    li.appendChild(play);
    if (anim.editable) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => enterEdit(anim.id));
      li.appendChild(edit);
    } else {
      const note = document.createElement('span');
      note.style.fontSize = '.7rem';
      note.style.opacity = '.65';
      note.textContent = 'play-only';
      li.appendChild(note);
    }
    animList.appendChild(li);
  }
}

function creatureBoxInRig() {
  const rig = creatureRig.getBoundingClientRect();
  const r = creature.getBoundingClientRect();
  return {
    left: r.left - rig.left,
    top: r.top - rig.top,
    width: r.width,
    height: r.height
  };
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
  const oa = st.objectAnchor || { x: 0.5, y: 0.5 };
  const rot = st.rotation || 0;
  const flips = st.flipX ? ' scaleX(-1)' : '';
  img.style.transformOrigin = `${oa.x * 100}% ${oa.y * 100}%`;
  img.style.transform = `translate(${-oa.x * 100}%, ${-oa.y * 100}%) rotate(${rot}deg)${flips}`;
}

function positionProp(img, st) {
  const box = creatureBoxInRig();
  const ca = st.characterAnchor || { x: 0.5, y: 0.5 };
  const w = (st.scale || 0.3) * box.width;
  img.style.left = `${box.left + ca.x * box.width}px`;
  img.style.top = `${box.top + ca.y * box.height}px`;
  img.style.width = `${w}px`;
  applyPropTransform(img, st);
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
        (!state.activeMode && interactive)
      );
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
  [...animList.children].forEach((li) => li.classList.toggle('active', li.dataset.id === animId));
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

async function playLightning() {
  flash.hidden = false;
  for (let i = 0; i < 5; i++) {
    flash.classList.add('on');
    await wait(40 + Math.random() * 80);
    flash.classList.remove('on');
    await wait(60 + Math.random() * 120);
  }
  flash.hidden = true;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playAnimation(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim) return;
  state.selectedAnim = anim;
  [...animList.children].forEach((li) => li.classList.toggle('active', li.dataset.id === animId));
  overlay.innerHTML = '';
  markerLayer.innerHTML = '';
  $('stageHint').textContent = `Playing ${anim.label}…`;

  if (anim.playMode === 'legacy-ghost') {
    await playGhostSample();
    $('stageHint').textContent = 'Ghost play finished';
    return;
  }

  const place = ensureAnimPlacement(animId);
  const transition = place.transitionId || 'lightning';
  if (transition === 'lightning') await playLightning();
  mountProps(animId, { interactive: false, visible: true });
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 180ms ease-out';
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  await wait(2200);
  if (!state.editMode) {
    if (!anim.preloadedAccessories) {
      overlay.innerHTML = '';
      markerLayer.innerHTML = '';
    }
    overlay.style.transition = '';
    overlay.style.opacity = '1';
  } else {
    mountProps(animId, { interactive: true });
  }
  $('stageHint').textContent = `${anim.label} play finished`;
}

async function playGhostSample() {
  const stage = $('siteStage');
  stage.style.filter = 'brightness(0.55)';
  await playLightning();
  const box = creatureBoxInRig();
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;';
  for (let i = 0; i < 12; i++) {
    const img = document.createElement('img');
    img.src = '/effects/spore/ghost/img/ghost-platypus.png';
    img.alt = '';
    const ang = (Math.PI * 2 * i) / 12;
    const dist = 40 + Math.random() * 90;
    img.style.cssText = `position:absolute;width:48px;left:${box.left + box.width / 2 + Math.cos(ang) * dist}px;top:${box.top + box.height / 2 + Math.sin(ang) * dist}px;transform:translate(-50%,-50%);opacity:0.85;`;
    layer.appendChild(img);
  }
  overlay.appendChild(layer);
  await wait(1600);
  overlay.innerHTML = '';
  stage.style.filter = '';
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
  getState: () => state,
  mountProps,
  creatureBoxInRig,
  enterMode,
  commitMode,
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
