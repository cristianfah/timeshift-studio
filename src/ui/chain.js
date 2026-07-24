// Effect chain rack: collapsible cards, per-effect preset chips, ordering,
// enable toggles, buffer-reach warnings. The animation milestone decorates
// each numeric param row with keyframe/LFO controls via setParamRowDecorator.

import { $, el } from '../util/dom.js';
import { state, emit, on, maxDelayFrames } from '../state.js';
import { registry, effectTypes, createEffect, baseParams, effectReach } from '../effects/registry.js';
import { LOOKS } from '../effects/looks.js';
import { toast } from './toast.js';

let decorateParamRow = null; // (fx, def, rowEl) => void — set by animation UI
export function setParamRowDecorator(fn) {
  decorateParamRow = fn;
  renderChain();
}

export function initChain() {
  const select = $('#add-effect-select');
  for (const { type, label } of effectTypes) {
    select.append(el('option', { value: type }, label));
  }
  $('#btn-add-effect').addEventListener('click', () => {
    const fx = createEffect(select.value);
    state.chain.push(fx);
    state.selectedId = fx.id;
    emit('chain-changed');
  });

  const chipsHost = $('#looks-chips');
  for (const name of Object.keys(LOOKS)) {
    chipsHost.append(el('span', {
      class: 'chip',
      onclick: () => applyLook(name),
    }, name));
  }

  on('chain-changed', renderChain);
  on('buffer-changed', renderChain);
  on('video-loaded', renderChain);
  renderChain();
}

function applyLook(name) {
  state.chain = LOOKS[name]();
  state.selectedId = state.chain[0]?.id ?? null;
  emit('chain-changed');
  toast(`Look aplicado: ${name}`);
}

// ---------- rendering ----------

export function renderChain() {
  const host = $('#chain-list');
  host.replaceChildren();
  if (state.chain.length === 0) {
    host.append(el('p', { class: 'muted small empty-chain' },
      '— cadena vacía: añade un efecto o elige un look —'));
    return;
  }
  state.chain.forEach((fx, i) => host.append(renderCard(fx, i)));
}

function renderCard(fx, index) {
  const mod = registry[fx.type];
  const card = el('div', {
    class: `fx-card${fx.enabled ? '' : ' disabled'}${fx.id === state.selectedId ? ' selected' : ''}`,
  });

  // ---- header ----
  const toggle = el('input', { type: 'checkbox', class: 'fx-toggle', title: 'Activar/desactivar' });
  toggle.checked = fx.enabled;
  toggle.addEventListener('change', () => {
    fx.enabled = toggle.checked;
    emit('chain-changed');
  });

  const head = el('div', { class: 'fx-head' },
    el('button', { class: 'btn', title: 'Subir', onclick: (e) => { e.stopPropagation(); moveFx(index, -1); } }, '▲'),
    el('button', { class: 'btn', title: 'Bajar', onclick: (e) => { e.stopPropagation(); moveFx(index, 1); } }, '▼'),
    toggle,
    el('span', { class: 'fx-name' }, mod.label),
    el('button', { class: 'btn', title: 'Plegar/desplegar', onclick: (e) => { e.stopPropagation(); fx.collapsed = !fx.collapsed; emit('chain-changed'); } }, fx.collapsed ? '▸' : '▾'),
    el('button', { class: 'btn', title: 'Eliminar', onclick: (e) => { e.stopPropagation(); removeFx(index); } }, '✕'),
  );
  head.addEventListener('click', () => {
    if (state.selectedId !== fx.id) {
      state.selectedId = fx.id;
      emit('selection-changed');
      renderChain();
    }
  });
  card.append(head);
  if (fx.collapsed) return card;

  // ---- body ----
  const body = el('div', { class: 'fx-body' });

  // preset chips
  const chips = el('div', { class: 'fx-presets' });
  for (const [name, preset] of Object.entries(mod.presets ?? {})) {
    chips.append(el('span', {
      class: 'chip',
      onclick: () => {
        for (const [k, v] of Object.entries(preset)) {
          if (fx.params[k]) fx.params[k].base = v;
        }
        emit('chain-changed');
      },
    }, name));
  }
  body.append(chips);

  // buffer-reach warning
  const warn = bufferWarning(fx);
  if (warn) body.append(el('div', { class: 'fx-warn' }, warn));

  // params
  for (const def of mod.params) {
    body.append(def.type === 'select' ? renderSelectRow(fx, def) : renderSliderRow(fx, def));
  }

  // custom displacement map upload
  if (mod.hasCustomMap) {
    const input = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        fx._mapImage = await createImageBitmap(file);
        fx._mapStamp = (fx._mapStamp ?? 0) + 1;
        fx.params.mapType.base = 'custom';
        emit('chain-changed');
        toast('Mapa de tiempo personalizado cargado.');
      } catch {
        toast('No se pudo leer la imagen.', 'error');
      }
    });
    body.append(el('div', { class: 'param-select' },
      el('label', {}, 'MAPA PROPIO'),
      el('button', { class: 'btn small', onclick: () => input.click() },
        fx._mapImage ? 'CAMBIAR IMAGEN…' : 'SUBIR IMAGEN…'),
      input,
    ));
  }

  card.append(body);
  return card;
}

function renderSliderRow(fx, def) {
  const p = fx.params[def.key];
  const slider = el('input', { type: 'range', min: def.min, max: def.max, step: def.step });
  slider.value = p.base;
  const num = el('input', { type: 'number', min: def.min, max: def.max, step: def.step, class: 'pval' });
  num.value = p.base;

  const sync = (v) => {
    p.base = Math.min(def.max, Math.max(def.min, v));
    slider.value = p.base;
    num.value = p.base;
    emit('param-changed', { fx, key: def.key });
  };
  slider.addEventListener('input', () => sync(parseFloat(slider.value)));
  num.addEventListener('change', () => sync(parseFloat(num.value) || def.def));

  const label = el('label', { class: isAnimated(p) ? 'animated' : '' }, def.label);
  const animCell = el('div', { class: 'panim' });
  const row = el('div', { class: 'param' }, label, slider, num, animCell);
  decorateParamRow?.(fx, def, { row, animCell, label, slider });
  return row;
}

function renderSelectRow(fx, def) {
  const select = el('select', {},
    ...def.options.map(([v, l]) => el('option', { value: v }, l)));
  select.value = fx.params[def.key].base;
  select.addEventListener('change', () => {
    fx.params[def.key].base = select.value;
    emit('param-changed', { fx, key: def.key });
    emit('chain-changed');
  });
  return el('div', { class: 'param-select' }, el('label', {}, def.label), select);
}

function isAnimated(p) {
  return !!(p.lfo || (p.keys && p.keys.length));
}

function bufferWarning(fx) {
  if (!state.video || !state.bufferInfo) return null;
  const ctx = { time: 0, fps: state.video.fps, duration: state.video.duration };
  const reach = effectReach(fx, baseParams(fx), ctx);
  const max = maxDelayFrames();
  if (reach <= max) return null;
  const maxSecs = (max / state.video.fps).toFixed(1);
  return `⚠ alcance ${Math.ceil(reach)}f > buffer ${max}f — sube BUFFER o baja el delay (máx ≈ ${maxSecs}s / ${max}f)`;
}

function moveFx(index, delta) {
  const j = index + delta;
  if (j < 0 || j >= state.chain.length) return;
  const [fx] = state.chain.splice(index, 1);
  state.chain.splice(j, 0, fx);
  emit('chain-changed');
}

function removeFx(index) {
  const [fx] = state.chain.splice(index, 1);
  if (fx?._mapTex) { /* GPU texture is freed with the context; instance dropped */ }
  if (state.selectedId === fx?.id) state.selectedId = state.chain[0]?.id ?? null;
  emit('chain-changed');
}
