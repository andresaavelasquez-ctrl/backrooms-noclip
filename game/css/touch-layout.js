// Personalización de controles táctiles: posición, escala, opacidad y presets.
// Módulo aislado: no modifica la lógica de movimiento ni el protocolo del MMO.
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const preview = params.get('touch') === '1';
  if (preview) document.body.classList.add('touch-preview');
  if (!coarse && !preview) return;

  const STORAGE = 'backrooms-touch-layout-v1';
  const controls = document.getElementById('touch-controls');
  const gameWrap = document.getElementById('game-wrap');
  const soundMenu = document.getElementById('sound-menu');
  if (!controls || !gameWrap || !soundMenu) return;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const orientationKey = () => innerWidth >= innerHeight ? 'landscape' : 'portrait';

  const defaultOrientation = (portrait) => ({
    blocks: portrait
      ? { move: { x: .22, y: .78 }, actions: { x: .78, y: .76 } }
      : { move: { x: .12, y: .77 }, actions: { x: .88, y: .74 } },
    individual: {},
  });

  const defaults = {
    size: 100,
    opacity: 74,
    fillScreen: true,
    editMode: 'blocks',
    preset: 'consola-clasica',
    orientations: {
      landscape: defaultOrientation(false),
      portrait: defaultOrientation(true),
    },
  };

  function mergeState(raw) {
    const state = JSON.parse(JSON.stringify(defaults));
    if (!raw || typeof raw !== 'object') return state;
    if (Number.isFinite(raw.size)) state.size = clamp(raw.size, 70, 170);
    if (Number.isFinite(raw.opacity)) state.opacity = clamp(raw.opacity, 15, 100);
    if (typeof raw.fillScreen === 'boolean') state.fillScreen = raw.fillScreen;
    if (raw.editMode === 'blocks' || raw.editMode === 'individual') state.editMode = raw.editMode;
    if (typeof raw.preset === 'string') state.preset = raw.preset;
    for (const key of ['landscape', 'portrait']) {
      const src = raw.orientations && raw.orientations[key];
      if (!src) continue;
      if (src.blocks) {
        for (const name of ['move', 'actions']) {
          const p = src.blocks[name];
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            state.orientations[key].blocks[name] = {
              x: clamp(p.x, .02, .98), y: clamp(p.y, .04, .96),
            };
          }
        }
      }
      if (src.individual && typeof src.individual === 'object') {
        for (const [name, p] of Object.entries(src.individual)) {
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            state.orientations[key].individual[name] = {
              x: clamp(p.x, .02, .98), y: clamp(p.y, .04, .96),
            };
          }
        }
      }
    }
    return state;
  }

  let state;
  try { state = mergeState(JSON.parse(localStorage.getItem(STORAGE) || 'null')); }
  catch (e) { state = mergeState(null); }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) {}
  }

  const joystick = document.getElementById('touch-joystick');
  const dpad = document.getElementById('touch-dpad');
  const actions = controls.querySelector('.touch-actions');
  const actionButtons = [...controls.querySelectorAll('.touch-actions [data-touch]')];
  const dpadButtons = [...controls.querySelectorAll('#touch-dpad [data-dir]')];

  function clearPosition(el) {
    if (!el) return;
    el.classList.remove('touch-layout-positioned');
    for (const prop of ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transform']) {
      el.style.removeProperty(prop);
    }
  }

  function positionElement(el, pos) {
    if (!el || !pos) return;
    el.classList.add('touch-layout-positioned');
    el.style.left = `${Math.round(pos.x * innerWidth)}px`;
    el.style.top = `${Math.round(pos.y * innerHeight)}px`;
  }

  function individualKey(el) {
    if (el === joystick) return 'joystick';
    if (el.matches && el.matches('#touch-dpad [data-dir]')) return `dpad-${el.dataset.dir}`;
    if (el.matches && el.matches('.touch-actions [data-touch]')) return `action-${el.dataset.touch}`;
    return null;
  }

  function defaultIndividualPosition(el) {
    const layout = state.orientations[orientationKey()];
    const key = individualKey(el);
    if (key === 'joystick') return { ...layout.blocks.move };

    const dx = 62 / Math.max(1, innerWidth);
    const dy = 56 / Math.max(1, innerHeight);
    const move = layout.blocks.move;
    const action = layout.blocks.actions;
    const offsets = {
      'dpad-up': [0, -dy],
      'dpad-down': [0, dy],
      'dpad-left': [-dx, 0],
      'dpad-right': [dx, 0],
      'action-q': [-dx * .55, -dy * .58],
      'action-e': [dx * .55, -dy * .58],
      'action-act': [-dx * .55, dy * .42],
      'action-bag': [dx * .55, dy * .42],
      'action-map': [0, dy * 1.38],
    };
    const base = key && key.startsWith('dpad-') ? move : action;
    const off = offsets[key] || [0, 0];
    return {
      x: clamp(base.x + off[0], .02, .98),
      y: clamp(base.y + off[1], .04, .96),
    };
  }

  function applyLayout() {
    const layout = state.orientations[orientationKey()];
    document.documentElement.style.setProperty('--touch-control-scale', String(state.size / 100));
    document.documentElement.style.setProperty('--touch-control-opacity', String(state.opacity / 100));
    document.body.classList.toggle('touch-fill-screen', !!state.fillScreen);
    controls.classList.toggle('touch-layout-individual', state.editMode === 'individual');

    if (state.editMode === 'blocks') {
      for (const el of [...actionButtons, ...dpadButtons]) clearPosition(el);
      positionElement(joystick, layout.blocks.move);
      positionElement(dpad, layout.blocks.move);
      positionElement(actions, layout.blocks.actions);
    } else {
      clearPosition(dpad);
      clearPosition(actions);
      const all = [joystick, ...dpadButtons, ...actionButtons];
      for (const el of all) {
        const key = individualKey(el);
        if (!key) continue;
        if (!layout.individual[key]) layout.individual[key] = defaultIndividualPosition(el);
        positionElement(el, layout.individual[key]);
      }
    }
    scheduleFit();
  }

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      w: Math.max(320, Math.floor(vv ? vv.width : innerWidth)),
      h: Math.max(200, Math.floor(vv ? vv.height : innerHeight)),
    };
  }

  let fitTimer = 0;
  function fitGameToViewport() {
    if (!state.fillScreen) return;
    const { w, h } = viewportSize();
    document.documentElement.style.setProperty('--game-w', `${w}px`);
    document.documentElement.style.setProperty('--game-h', `${h}px`);
    const canvas = document.getElementById('game-canvas');
    const gl = document.getElementById('gl-canvas');
    if (canvas && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
    if (gl && (gl.width !== w || gl.height !== h)) {
      gl.width = w;
      gl.height = h;
    }
    if (window.Render3D && typeof Render3D.resize === 'function') {
      try { Render3D.resize(w, h); } catch (e) {}
    }
  }

  function scheduleFit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      if (state.fillScreen) fitGameToViewport();
      else window.dispatchEvent(new Event('resize'));
    }, 80);
  }

  window.addEventListener('resize', () => {
    setTimeout(() => { applyLayout(); if (state.fillScreen) fitGameToViewport(); }, 120);
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { applyLayout(); if (state.fillScreen) fitGameToViewport(); }, 220);
  });
  if (window.visualViewport) visualViewport.addEventListener('resize', scheduleFit);

  // ---------- menú de configuración ----------
  const row = document.createElement('div');
  row.id = 'row-touch-layout';
  row.className = 'sound-row';
  row.innerHTML = '<label>Controles táctiles</label><button id="btn-touch-layout" class="btn-small" style="margin-top:0">Personalizar</button>';
  const adminRow = document.getElementById('admin-row');
  if (adminRow) adminRow.before(row);
  else soundMenu.querySelector('.modal-box')?.appendChild(row);

  const menu = document.createElement('div');
  menu.id = 'touch-layout-menu';
  menu.innerHTML = `
    <div class="modal-box">
      <h3>Controles táctiles</h3>
      <p>Personaliza la distribución sin cambiar las acciones del juego.</p>
      <div class="sound-row">
        <label for="touch-size">Tamaño</label>
        <input id="touch-size" type="range" min="70" max="170" step="5">
        <span id="touch-size-v"></span>
      </div>
      <div class="sound-row">
        <label for="touch-opacity">Opacidad</label>
        <input id="touch-opacity" type="range" min="15" max="100" step="5">
        <span id="touch-opacity-v"></span>
      </div>
      <div class="sound-row">
        <label>Pantalla</label>
        <label class="chk-row"><input id="touch-fill-screen" type="checkbox"> Usar toda la pantalla</label>
      </div>
      <div class="touch-layout-section">
        <h4>PRESETS DE CONSOLA</h4>
        <div class="touch-layout-preset-grid">
          <button class="btn-small" data-touch-preset="consola-clasica">Consola clásica</button>
          <button class="btn-small" data-touch-preset="consola-compacta">Consola compacta</button>
        </div>
      </div>
      <div class="touch-layout-section">
        <h4>EDITAR POSICIONES</h4>
        <div class="touch-layout-editor-grid">
          <button id="touch-edit-blocks" class="btn-small">Mover por bloques</button>
          <button id="touch-edit-individual" class="btn-small">Mover uno a uno</button>
        </div>
      </div>
      <div class="modal-btns">
        <button id="touch-reset" class="btn-small">Restablecer</button>
        <button id="touch-close" class="btn-small">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(menu);

  const toolbar = document.createElement('div');
  toolbar.id = 'touch-layout-toolbar';
  toolbar.innerHTML = `
    <span class="touch-layout-toolbar-label">Arrastra los controles</span>
    <button id="touch-editor-save" class="btn-small" style="margin-top:0">Guardar</button>
    <button id="touch-editor-cancel" class="btn-small" style="margin-top:0">Cancelar</button>`;
  document.body.appendChild(toolbar);

  const sizeInput = menu.querySelector('#touch-size');
  const sizeValue = menu.querySelector('#touch-size-v');
  const opacityInput = menu.querySelector('#touch-opacity');
  const opacityValue = menu.querySelector('#touch-opacity-v');
  const fillInput = menu.querySelector('#touch-fill-screen');

  function syncMenu() {
    sizeInput.value = state.size;
    sizeValue.textContent = `${state.size}%`;
    opacityInput.value = state.opacity;
    opacityValue.textContent = `${state.opacity}%`;
    fillInput.checked = !!state.fillScreen;
  }

  document.getElementById('btn-touch-layout').addEventListener('click', () => {
    syncMenu();
    menu.classList.add('is-open');
  });
  menu.querySelector('#touch-close').addEventListener('click', () => menu.classList.remove('is-open'));

  sizeInput.addEventListener('input', () => {
    state.size = Number(sizeInput.value);
    sizeValue.textContent = `${state.size}%`;
    applyLayout();
  });
  sizeInput.addEventListener('change', save);
  opacityInput.addEventListener('input', () => {
    state.opacity = Number(opacityInput.value);
    opacityValue.textContent = `${state.opacity}%`;
    applyLayout();
  });
  opacityInput.addEventListener('change', save);
  fillInput.addEventListener('change', () => {
    state.fillScreen = fillInput.checked;
    save();
    applyLayout();
  });

  const presets = {
    'consola-clasica': {
      size: 100, opacity: 74,
      landscape: { move: { x: .12, y: .77 }, actions: { x: .88, y: .74 } },
      portrait: { move: { x: .22, y: .78 }, actions: { x: .78, y: .76 } },
    },
    'consola-compacta': {
      size: 88, opacity: 62,
      landscape: { move: { x: .10, y: .72 }, actions: { x: .90, y: .70 } },
      portrait: { move: { x: .18, y: .73 }, actions: { x: .82, y: .71 } },
    },
  };

  menu.querySelectorAll('[data-touch-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.touchPreset;
      const preset = presets[id];
      if (!preset) return;
      state.preset = id;
      state.editMode = 'blocks';
      state.size = preset.size;
      state.opacity = preset.opacity;
      for (const key of ['landscape', 'portrait']) {
        state.orientations[key].blocks = JSON.parse(JSON.stringify(preset[key]));
      }
      save();
      syncMenu();
      applyLayout();
    });
  });

  let editSnapshot = null;
  function setDragTargets() {
    controls.querySelectorAll('.touch-layout-drag-target').forEach((el) => el.classList.remove('touch-layout-drag-target'));
    if (state.editMode === 'blocks') {
      joystick?.classList.add('touch-layout-drag-target');
      dpad?.classList.add('touch-layout-drag-target');
      actions?.classList.add('touch-layout-drag-target');
    } else {
      joystick?.classList.add('touch-layout-drag-target');
      for (const el of [...dpadButtons, ...actionButtons]) el.classList.add('touch-layout-drag-target');
    }
  }

  function startEditor(mode) {
    state.editMode = mode;
    editSnapshot = JSON.stringify(state);
    menu.classList.remove('is-open');
    soundMenu.style.display = 'none';
    document.body.classList.add('touch-layout-editing');
    if (window.Game?.world) Game.world.busy = true;
    window.joyDx = 0;
    window.joyDy = 0;
    if (window.Net?.parar) Net.parar();
    applyLayout();
    setDragTargets();
  }

  function finishEditor(saveChanges) {
    if (!saveChanges && editSnapshot) state = mergeState(JSON.parse(editSnapshot));
    document.body.classList.remove('touch-layout-editing');
    controls.querySelectorAll('.touch-layout-drag-target').forEach((el) => el.classList.remove('touch-layout-drag-target'));
    if (saveChanges) save();
    applyLayout();
    editSnapshot = null;
    menu.classList.add('is-open');
    soundMenu.style.display = 'flex';
    syncMenu();
  }

  menu.querySelector('#touch-edit-blocks').addEventListener('click', () => startEditor('blocks'));
  menu.querySelector('#touch-edit-individual').addEventListener('click', () => startEditor('individual'));
  toolbar.querySelector('#touch-editor-save').addEventListener('click', () => finishEditor(true));
  toolbar.querySelector('#touch-editor-cancel').addEventListener('click', () => finishEditor(false));
  menu.querySelector('#touch-reset').addEventListener('click', () => {
    state = mergeState(null);
    save();
    syncMenu();
    applyLayout();
  });

  // Arrastre en fase de captura: evita disparar el movimiento/acción mientras se edita.
  let drag = null;
  document.addEventListener('pointerdown', (ev) => {
    if (!document.body.classList.contains('touch-layout-editing')) return;
    if (ev.target.closest('#touch-layout-toolbar')) return;

    let target = null;
    let key = null;
    if (state.editMode === 'blocks') {
      const move = ev.target.closest('#touch-joystick, #touch-dpad');
      if (move) { target = move; key = 'move'; }
      else if (ev.target.closest('.touch-actions')) { target = actions; key = 'actions'; }
    } else {
      target = ev.target.closest('#touch-joystick, #touch-dpad [data-dir], .touch-actions [data-touch]');
      key = target && individualKey(target);
    }
    if (!target || !key) return;

    ev.preventDefault();
    ev.stopImmediatePropagation();
    const layout = state.orientations[orientationKey()];
    const pos = state.editMode === 'blocks'
      ? layout.blocks[key]
      : (layout.individual[key] || defaultIndividualPosition(target));
    drag = {
      id: ev.pointerId,
      target,
      key,
      startX: ev.clientX,
      startY: ev.clientY,
      pos: { x: pos.x, y: pos.y },
    };
    try { target.setPointerCapture(ev.pointerId); } catch (e) {}
  }, true);

  document.addEventListener('pointermove', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const next = {
      x: clamp(drag.pos.x + (ev.clientX - drag.startX) / innerWidth, .02, .98),
      y: clamp(drag.pos.y + (ev.clientY - drag.startY) / innerHeight, .04, .96),
    };
    const layout = state.orientations[orientationKey()];
    if (state.editMode === 'blocks') {
      layout.blocks[drag.key] = next;
      if (drag.key === 'move') {
        positionElement(joystick, next);
        positionElement(dpad, next);
      } else positionElement(actions, next);
    } else {
      layout.individual[drag.key] = next;
      positionElement(drag.target, next);
    }
  }, true);

  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    try { drag.target.releasePointerCapture(ev.pointerId); } catch (e) {}
    drag = null;
  }
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  // ---------- botón de chat móvil ----------
  const chatButton = document.createElement('button');
  chatButton.id = 'btn-chat-touch';
  chatButton.type = 'button';
  chatButton.textContent = 'T';
  chatButton.title = 'Abrir chat';
  chatButton.setAttribute('aria-label', 'Abrir chat multijugador');
  gameWrap.appendChild(chatButton);
  chatButton.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (window.Game?.world?.online && window.Net?.activo && typeof Net.abrirChat === 'function') {
      if (document.pointerLockElement) document.exitPointerLock();
      Net.abrirChat();
    }
  }, { passive: false });

  function updateChatButton() {
    const visible = !!(document.body.classList.contains('game-active') &&
      window.Game?.world?.online && window.Net?.activo);
    chatButton.classList.toggle('is-visible', visible);
  }
  setInterval(updateChatButton, 500);

  applyLayout();
  syncMenu();
  updateChatButton();
  setTimeout(fitGameToViewport, 120);
})();
