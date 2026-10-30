/**
 * Cambio admin — Play / Edit with connector-point attach, rotation, float-parented props.
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
  /** null | 'object' | 'character' */
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
  // v1 → v2: old x/y was object center on character (translate -50%-50%)
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

  // Preloaded accessories: mount immediately when flag set
  for (const anim of state.manifest.animations) {
    if (anim.preloadedAccessories) {
      mountProps(anim.id, { interactive: false, visible: true });
      break;
    }
  }

  renderAnimList();
  transitionSelect.addEventListener('change', () => {
    if (!state.selectedAnim) return;
    ensureAnimPlacement(state.selectedAnim.id).transitionId = transitionSelect.value;
    state.dirty = true;
    saveStatus.textContent = 'Unsaved changes';
  });
  $('btnSave').addEventListener('click', savePlacements);
  $('btnExitEdit').addEventListener('click', () => exitEdit());
  $('btnSetConnectors').addEventListener('click', startConnectorPick);
  $('btnResetConnectors').addEventListener('click', resetConnectors);
  $('rotationSlider').addEventListener('input', onRotationInput);
  $('rotationNum').addEventListener('input', onRotationInput);
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

/** Creature box relative to creature-rig (props live in rig space). */
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
    if (state.connectorPick === 'object' && state.selectedElementId === el.id) {
      img.classList.add('picking-object');
    }
    img.dataset.elementId = el.id;
    img.draggable = false;
    positionProp(img, st);
    if (interactive) bindPropPointer(img, animId, el.id);
    else img.style.pointerEvents = 'none';
    overlay.appendChild(img);
  }
  if (interactive && state.selectedElementId) {
    renderMarkers(animId, state.selectedElementId);
    renderRotateHandle(animId, state.selectedElementId);
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

  const img = overlay.querySelector(`[data-element-id="${elementId}"]`);
  if (img) {
    const oa = st.objectAnchor;
    // object marker at attachment point = characterAnchor in rig (they coincide when attached)
    // Also show object-local marker on the prop bbox for clarity while picking
    const ir = img.getBoundingClientRect();
    const rig = creatureRig.getBoundingClientRect();
    const objM = document.createElement('div');
    objM.className = 'cambio-marker object';
    objM.title = 'objectAnchor';
    // After transform, objectAnchor lands on characterAnchor — place blue marker at same spot
    // plus a slight offset label via second marker on untransformed estimate:
    objM.style.left = `${box.left + ca.x * box.width}px`;
    objM.style.top = `${box.top + ca.y * box.height}px`;
    // Offset blue slightly so both visible when coincident
    objM.style.boxShadow = '0 0 0 2px #fff, 0 0 8px rgba(0,0,0,.45), 3px 3px 0 #4a9eff';
    markerLayer.appendChild(objM);
    void ir; void rig; void oa;
  }
}

function renderRotateHandle(animId, elementId) {
  const existing = overlay.querySelector('.cambio-rotate-handle');
  if (existing) existing.remove();
  const img = overlay.querySelector(`[data-element-id="${elementId}"]`);
  if (!img) return;
  const st = ensureAnimPlacement(animId).elements[elementId];
  const handle = document.createElement('div');
  handle.className = 'cambio-rotate-handle';
  handle.title = 'Drag to rotate';
  // Place handle above object center in rig space
  const box = creatureBoxInRig();
  const ca = st.characterAnchor;
  const w = (st.scale || 0.3) * box.width;
  handle.style.left = `${box.left + ca.x * box.width}px`;
  handle.style.top = `${box.top + ca.y * box.height - w * 0.55}px`;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const originX = box.left + ca.x * box.width;
    const originY = box.top + ca.y * box.height;
    const rig = creatureRig.getBoundingClientRect();
    const move = (ev) => {
      const px = ev.clientX - rig.left;
      const py = ev.clientY - rig.top;
      const ang = (Math.atan2(py - originY, px - originX) * 180) / Math.PI + 90;
      st.rotation = Math.round(((ang + 540) % 360) - 180);
      syncRotationControls(st.rotation);
      positionProp(img, st);
      state.dirty = true;
      saveStatus.textContent = 'Unsaved changes';
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
    state.selectedElementId = elementId;
    highlightElementRow(elementId);
    updateSelectedControls(animId, elementId);

    if (state.connectorPick === 'object') {
      // Click on object sets objectAnchor in object-local normalized coords
      const rect = img.getBoundingClientRect();
      // Approximate without inverse-rotate: use axis-aligned bbox (good enough for MVP; exact after re-mount)
      const ox = (e.clientX - rect.left) / rect.width;
      const oy = (e.clientY - rect.top) / rect.height;
      const st = ensureAnimPlacement(animId).elements[elementId];
      st.objectAnchor = {
        x: Math.min(1, Math.max(0, ox)),
        y: Math.min(1, Math.max(0, oy))
      };
      state.connectorPick = 'character';
      document.body.classList.add('picking-character');
      connectorHint.textContent = 'Now click the character where this object should attach.';
      state.dirty = true;
      saveStatus.textContent = 'Unsaved changes';
      mountProps(animId, { interactive: true });
      return;
    }

    // Drag moves characterAnchor
    img.classList.add('dragging', 'selected');
    const st = ensureAnimPlacement(animId).elements[elementId];
    const box = creatureBoxInRig();
    const rig = creatureRig.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.clientX - rig.left - box.left) / box.width;
      const y = (ev.clientY - rig.top - box.top) / box.height;
      st.characterAnchor = {
        x: Math.min(1.15, Math.max(-0.15, x)),
        y: Math.min(1.15, Math.max(-0.15, y))
      };
      positionProp(img, st);
      renderMarkers(animId, elementId);
      state.dirty = true;
      saveStatus.textContent = 'Unsaved changes';
    };
    const up = () => {
      img.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      mountProps(animId, { interactive: true });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function onCreaturePointerDown(e) {
  if (state.connectorPick !== 'character' || !state.editMode || !state.selectedAnim || !state.selectedElementId) {
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
  document.body.classList.remove('picking-character');
  connectorHint.textContent = 'Connectors set. Drag to nudge · rotate with slider/handle.';
  state.dirty = true;
  saveStatus.textContent = 'Unsaved changes';
  mountProps(state.selectedAnim.id, { interactive: true });
}

function startConnectorPick() {
  if (!state.selectedAnim || !state.selectedElementId) return;
  state.connectorPick = 'object';
  document.body.classList.remove('picking-character');
  connectorHint.textContent = 'Click on the object to set its connector point.';
  mountProps(state.selectedAnim.id, { interactive: true });
}

function resetConnectors() {
  if (!state.selectedAnim || !state.selectedElementId) return;
  const anim = state.selectedAnim;
  const el = anim.elements.find((e) => e.id === state.selectedElementId);
  const st = ensureAnimPlacement(anim.id).elements[state.selectedElementId];
  const def = defaultElementState(anim, el);
  st.objectAnchor = { ...def.objectAnchor };
  st.characterAnchor = { ...def.characterAnchor };
  state.connectorPick = null;
  document.body.classList.remove('picking-character');
  connectorHint.textContent = 'Connectors reset to defaults.';
  state.dirty = true;
  saveStatus.textContent = 'Unsaved changes';
  mountProps(anim.id, { interactive: true });
}

function syncRotationControls(deg) {
  $('rotationSlider').value = String(deg);
  $('rotationNum').value = String(deg);
}

function onRotationInput(e) {
  if (!state.selectedAnim || !state.selectedElementId) return;
  const v = Math.max(-180, Math.min(180, +e.target.value || 0));
  syncRotationControls(v);
  const st = ensureAnimPlacement(state.selectedAnim.id).elements[state.selectedElementId];
  st.rotation = v;
  const img = overlay.querySelector(`[data-element-id="${state.selectedElementId}"]`);
  if (img) positionProp(img, st);
  state.dirty = true;
  saveStatus.textContent = 'Unsaved changes';
}

function onScaleInput(e) {
  if (!state.selectedAnim || !state.selectedElementId) return;
  const v = Math.max(0.05, Math.min(1.5, +e.target.value || 0.3));
  const st = ensureAnimPlacement(state.selectedAnim.id).elements[state.selectedElementId];
  st.scale = v;
  const img = overlay.querySelector(`[data-element-id="${state.selectedElementId}"]`);
  if (img) {
    positionProp(img, st);
    renderRotateHandle(state.selectedAnim.id, state.selectedElementId);
  }
  state.dirty = true;
  saveStatus.textContent = 'Unsaved changes';
}

function updateSelectedControls(animId, elementId) {
  selectedControls.classList.remove('hidden');
  $('selectedLabel').textContent = elementId;
  const st = ensureAnimPlacement(animId).elements[elementId];
  syncRotationControls(st.rotation || 0);
  $('scaleSlider').value = String(st.scale || 0.3);
}

function enterEdit(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.editable) return;
  state.selectedAnim = anim;
  state.editMode = true;
  state.selectedElementId = anim.elements[0]?.id || null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character');
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
    li.innerHTML = `<span class="label">${el.id} → ${el.anchor}</span>`;
    li.addEventListener('click', () => {
      state.selectedElementId = el.id;
      state.connectorPick = null;
      document.body.classList.remove('picking-character');
      highlightElementRow(el.id);
      updateSelectedControls(animId, el.id);
      mountProps(animId, { interactive: true });
      connectorHint.textContent = 'Select an object, then Set connectors — or drag / rotate.';
    });
    elementList.appendChild(li);
  }
  if (state.selectedElementId) updateSelectedControls(animId, state.selectedElementId);
  mountProps(animId, { interactive: true });
  $('stageHint').textContent = 'Edit: connectors, rotate, drag · Save · Play';
  [...animList.children].forEach((li) => li.classList.toggle('active', li.dataset.id === animId));
}

function highlightElementRow(id) {
  [...elementList.querySelectorAll('.el-row')].forEach((li) => {
    li.classList.toggle('selected', li.dataset.elementId === id);
  });
}

function exitEdit() {
  state.editMode = false;
  state.selectedElementId = null;
  state.connectorPick = null;
  document.body.classList.remove('picking-character');
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
  saveStatus.textContent = 'Saving…';
  try {
    // Ensure migrated shape on save
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
    // Sample objectAnchor in screen space via elementFromPoint-style geometry:
    // After CSS transform, objectAnchor should be at left/top of the positioned element
    // which equals expected. Read computed left/top.
    const left = parseFloat(img.style.left);
    const top = parseFloat(img.style.top);
    return {
      expected,
      actual: { x: left, y: top },
      dx: left - expected.x,
      dy: top - expected.y,
      rotation: st.rotation,
      objectAnchor: st.objectAnchor,
      characterAnchor: st.characterAnchor
    };
  },
  setConnectors(elementId, objectAnchor, characterAnchor) {
    const animId = state.selectedAnim?.id;
    if (!animId) return;
    const st = ensureAnimPlacement(animId).elements[elementId];
    st.objectAnchor = { ...objectAnchor };
    st.characterAnchor = { ...characterAnchor };
    mountProps(animId, { interactive: state.editMode });
  },
  setRotation(elementId, deg) {
    const animId = state.selectedAnim?.id;
    if (!animId) return;
    ensureAnimPlacement(animId).elements[elementId].rotation = deg;
    mountProps(animId, { interactive: state.editMode });
  }
};

boot().catch((err) => {
  saveStatus.textContent = `Boot failed: ${err.message}`;
  console.error(err);
});
