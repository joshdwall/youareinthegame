/**
 * Cambio admin — Play / Edit placements for seasonal animations.
 * Public apex behavior is unchanged; this page is Access-gated on app.youareinthegame.com.
 */
const state = {
  manifest: null,
  anchors: null,
  placements: null,
  selectedAnim: null,
  editMode: false,
  selectedElementId: null,
  dirty: false
};

const $ = (id) => document.getElementById(id);
const animList = $('animList');
const editSection = $('editSection');
const elementList = $('elementList');
const overlay = $('overlayLayer');
const creature = $('mainCreature');
const flash = $('lightningFlash');
const saveStatus = $('saveStatus');
const transitionSelect = $('transitionSelect');

async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function boot() {
  const [manifest, anchors, seed] = await Promise.all([
    loadJson('/content/animations-manifest.json'),
    loadJson('/content/character-anchors.json'),
    loadJson('/content/cambio-placements.json')
  ]);
  state.manifest = manifest;
  state.anchors = anchors;
  state.placements = seed;
  try {
    const r = await fetch('/api/cambio/placements', { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      if (data?.ok && data.placements) state.placements = data.placements;
    }
  } catch (_) { /* seed only */ }
  renderAnimList();
  transitionSelect.addEventListener('change', () => {
    if (!state.selectedAnim) return;
    ensureAnimPlacement(state.selectedAnim.id).transitionId = transitionSelect.value;
    state.dirty = true;
    saveStatus.textContent = 'Unsaved changes';
  });
  $('btnSave').addEventListener('click', savePlacements);
  $('btnExitEdit').addEventListener('click', () => exitEdit());
  window.addEventListener('resize', () => {
    if (state.editMode || state.selectedAnim) mountProps(state.selectedAnim?.id, { interactive: state.editMode });
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

function creatureBox() {
  const stage = $('stage').getBoundingClientRect();
  const r = creature.getBoundingClientRect();
  return {
    left: r.left - stage.left,
    top: r.top - stage.top,
    width: r.width,
    height: r.height
  };
}

function fracToPx(elState) {
  const box = creatureBox();
  const w = (elState.widthFrac || 0.3) * box.width;
  return {
    left: box.left + elState.x * box.width,
    top: box.top + elState.y * box.height,
    width: w
  };
}

function pxToFrac(clientX, clientY, widthPx) {
  const stage = $('stage').getBoundingClientRect();
  const box = creatureBox();
  const x = (clientX - stage.left - box.left) / box.width;
  const y = (clientY - stage.top - box.top) / box.height;
  return {
    x: Math.min(1.15, Math.max(-0.15, x)),
    y: Math.min(1.15, Math.max(-0.15, y)),
    widthFrac: widthPx / box.width
  };
}

function defaultElementState(anim, el) {
  const anchor = state.anchors.anchors[el.anchor] || { x: 0.5, y: 0.5 };
  return {
    x: anchor.x,
    y: anchor.y,
    widthFrac: el.defaultWidthFrac || 0.3,
    rotationDeg: 0,
    flipX: !!el.flipX
  };
}

function mountProps(animId, { interactive = false, visible = true } = {}) {
  overlay.innerHTML = '';
  overlay.classList.toggle('editing', interactive);
  if (!animId || !visible) return;
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.elements?.length) return;
  const place = ensureAnimPlacement(animId);
  for (const el of anim.elements) {
    const st = place.elements[el.id] || (place.elements[el.id] = defaultElementState(anim, el));
    // Dedicated L/R assets: always honor manifest flipX (avoids double-flip from placeholder-era KV).
    if (Object.prototype.hasOwnProperty.call(el, 'flipX')) st.flipX = !!el.flipX;
    const img = document.createElement('img');
    img.src = '/' + el.src.replace(/^\//, '');
    img.alt = el.id;
    img.className = 'cambio-prop' + (state.selectedElementId === el.id ? ' selected' : '');
    img.dataset.elementId = el.id;
    img.draggable = false;
    const px = fracToPx(st);
    img.style.left = `${px.left}px`;
    img.style.top = `${px.top}px`;
    img.style.width = `${px.width}px`;
    const flips = st.flipX ? ' scaleX(-1)' : '';
    img.style.transform = `translate(-50%, -50%) rotate(${st.rotationDeg || 0}deg)${flips}`;
    if (interactive) bindDrag(img, animId, el.id);
    else img.style.pointerEvents = 'none';
    overlay.appendChild(img);
  }
}

function bindDrag(img, animId, elementId) {
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.selectedElementId = elementId;
    highlightElementRow(elementId);
    img.classList.add('dragging', 'selected');
    const place = ensureAnimPlacement(animId);
    const st = place.elements[elementId];
    const box = creatureBox();
    const widthPx = (st.widthFrac || 0.3) * box.width;
    const move = (ev) => {
      const next = pxToFrac(ev.clientX, ev.clientY, widthPx);
      st.x = next.x;
      st.y = next.y;
      const px = fracToPx(st);
      img.style.left = `${px.left}px`;
      img.style.top = `${px.top}px`;
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

function enterEdit(animId) {
  const anim = state.manifest.animations.find((a) => a.id === animId);
  if (!anim?.editable) return;
  state.selectedAnim = anim;
  state.editMode = true;
  state.selectedElementId = anim.elements[0]?.id || null;
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
    const li = document.createElement('li');
    li.className = 'el-row' + (state.selectedElementId === el.id ? ' selected' : '');
    li.dataset.elementId = el.id;
    li.innerHTML = `<span class="label">${el.id} → ${el.anchor}</span>`;
    li.addEventListener('click', () => {
      state.selectedElementId = el.id;
      highlightElementRow(el.id);
      mountProps(animId, { interactive: true });
    });
    elementList.appendChild(li);
  }
  // transition as menu entry note
  const tLi = document.createElement('li');
  tLi.innerHTML = `<span class="label">effect / transition: use dropdown above (lightning available)</span>`;
  elementList.appendChild(tLi);
  mountProps(animId, { interactive: true });
  $('stageHint').textContent = 'Drag elements to their success points, then Save · Play';
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
  editSection.classList.add('hidden');
  if (state.selectedAnim) mountProps(state.selectedAnim.id, { interactive: false, visible: false });
  overlay.innerHTML = '';
  $('stageHint').textContent = 'Select Play or Edit from the list';
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
  // brief appear pulse
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 180ms ease-out';
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  await wait(2200);
  if (!state.editMode) {
    overlay.innerHTML = '';
    overlay.style.transition = '';
    overlay.style.opacity = '1';
  } else {
    mountProps(animId, { interactive: true });
  }
  $('stageHint').textContent = `${anim.label} play finished`;
}

async function playGhostSample() {
  // Lightweight homage: dim + lightning + spawn a few ghost spore imgs near creature
  const stage = $('stage');
  stage.style.filter = 'brightness(0.55)';
  await playLightning();
  const box = creatureBox();
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
    const body = {
      ...state.placements,
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
    state.placements = data.placements || body;
    state.dirty = false;
    saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    saveStatus.textContent = `Save failed: ${err.message}`;
  }
}

boot().catch((err) => {
  saveStatus.textContent = `Boot failed: ${err.message}`;
  console.error(err);
});
