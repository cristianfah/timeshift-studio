// Animation UI: per-param clock (keyframe) + wave (LFO) buttons on every
// numeric slider, an inline LFO editor, and keyframe markers on the main
// timeline (drag = move, right-click = delete, alt+click = cycle ease).

import { $, el, clamp } from '../util/dom.js';
import { state, emit, on } from '../state.js';
import { registry } from '../effects/registry.js';
import { addKey, sortKeys, cycleEase, interpKeys } from '../animation/keyframes.js';
import { defaultLfo, LFO_SHAPES } from '../animation/lfo.js';
import { setParamRowDecorator } from './chain.js';
import { toast } from './toast.js';

export function initAnim() {
  setParamRowDecorator(decorateRow);
  for (const evt of ['chain-changed', 'selection-changed', 'video-loaded', 'trim-changed']) {
    on(evt, renderTimelineKeys);
  }
  on('keys-changed', () => {
    renderTimelineKeys();
    emit('param-changed', {});
  });
}

// ---------- param row decoration ----------

function decorateRow(fx, def, { row, animCell, label }) {
  const p = fx.params[def.key];

  const kfBtn = el('button', {
    class: p.keys?.length ? 'on' : '',
    title: 'Añadir keyframe en el playhead',
  }, p.keys?.length ? '◆' : '⧗');
  kfBtn.addEventListener('click', () => {
    if (!state.video) { toast('Carga un clip antes de animar.', 'warn'); return; }
    const t = state.video.el.currentTime;
    const v = p.keys?.length ? interpKeys(p.keys, t) : p.base;
    addKey(p.keys, t, v);
    emit('keys-changed', { fx, key: def.key });
    refresh(fx, def, { row, animCell, label });
  });

  const lfoBtn = el('button', {
    class: p.lfo ? 'on-lfo' : '',
    title: 'LFO on/off',
  }, '∿');
  lfoBtn.addEventListener('click', () => {
    p.lfo = p.lfo ? null : defaultLfo(def);
    emit('param-changed', { fx, key: def.key });
    refresh(fx, def, { row, animCell, label });
  });

  animCell.replaceChildren(kfBtn, lfoBtn);
  label.classList.toggle('animated', !!(p.lfo || p.keys?.length));

  row.querySelector('.lfo-editor')?.remove();
  if (p.lfo) row.append(renderLfoEditor(fx, def, p));
}

function refresh(fx, def, refs) {
  decorateRow(fx, def, refs);
}

function renderLfoEditor(fx, def, p) {
  const editor = el('div', { class: 'lfo-editor', style: 'grid-column: 1 / -1;' });

  const shapeSel = el('select', {},
    ...LFO_SHAPES.map(([v, l]) => el('option', { value: v }, l)));
  shapeSel.value = p.lfo.shape;
  shapeSel.addEventListener('change', () => {
    p.lfo.shape = shapeSel.value;
    emit('param-changed', { fx, key: def.key });
  });
  editor.append(el('div', { class: 'lfo-row' }, el('label', {}, 'FORMA'), shapeSel));

  const mini = (labelTxt, prop, min, max, step) => {
    const val = el('span', { class: 'lfo-val' }, fmt(p.lfo[prop]));
    const range = el('input', { type: 'range', min, max, step });
    range.value = p.lfo[prop];
    range.addEventListener('input', () => {
      p.lfo[prop] = parseFloat(range.value);
      val.textContent = fmt(p.lfo[prop]);
      emit('param-changed', { fx, key: def.key });
    });
    return el('div', { class: 'lfo-row' }, el('label', {}, labelTxt), range, val);
  };

  editor.append(
    mini('RATE', 'rate', 0.05, 8, 0.05),
    mini('AMP', 'amp', 0, Math.max(def.max - def.min, 1), (def.max - def.min) / 100),
    mini('FASE', 'phase', 0, 1, 0.01),
  );
  return editor;
}

function fmt(v) {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}

// ---------- timeline keyframe markers ----------

function renderTimelineKeys() {
  const host = $('#tl-keys');
  host.replaceChildren();
  const v = state.video;
  const fx = state.chain.find((f) => f.id === state.selectedId);
  if (!v || !fx) return;

  const mod = registry[fx.type];
  let lane = 0;
  for (const def of mod.params) {
    const p = fx.params[def.key];
    if (!p.keys || p.keys.length === 0) continue;
    const laneBottom = 4 + (lane % 4) * 10;
    for (const key of p.keys) {
      host.append(renderMarker(fx, def, p, key, laneBottom));
    }
    lane++;
  }
}

function renderMarker(fx, def, p, key, bottom) {
  const dur = state.video.duration || 1;
  const marker = el('div', {
    class: `tl-key ease-${key.ease}`,
    title: `${def.label} · ${key.t.toFixed(2)}s = ${fmt(key.v)} · ${key.ease}`,
  });
  marker.style.left = `${(key.t / dur) * 100}%`;
  marker.style.bottom = `${bottom}px`;

  marker.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    p.keys.splice(p.keys.indexOf(key), 1);
    emit('keys-changed', { fx, key: def.key });
    emit('chain-changed'); // refresh card buttons (◆ → ⧗ when track empties)
  });

  marker.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.altKey) {
      cycleEase(key);
      emit('keys-changed', { fx, key: def.key });
      return;
    }
    marker.setPointerCapture(e.pointerId);
    const rect = $('#timeline').getBoundingClientRect();
    const move = (ev) => {
      key.t = clamp(((ev.clientX - rect.left) / rect.width), 0, 1) * dur;
      marker.style.left = `${(key.t / dur) * 100}%`;
      marker.title = `${def.label} · ${key.t.toFixed(2)}s = ${fmt(key.v)} · ${key.ease}`;
      emit('param-changed', {});
    };
    const up = () => {
      marker.removeEventListener('pointermove', move);
      marker.removeEventListener('pointerup', up);
      sortKeys(p.keys);
      emit('keys-changed', { fx, key: def.key });
    };
    marker.addEventListener('pointermove', move);
    marker.addEventListener('pointerup', up);
  });

  return marker;
}
