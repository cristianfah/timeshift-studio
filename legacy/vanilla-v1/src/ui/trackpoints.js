// Track-point picking: lets the user choose WHAT the tracker follows by
// clicking on the viewport. Seeds live on the effect instance (fx._points)
// so presets and the exporter see the same list; the effect module owns the
// actual patch tracking and reports live positions back in fx._vizPoints.

import { $, el, clamp } from '../util/dom.js';
import { state, emit, on } from '../state.js';
import { toast } from './toast.js';

let pickingFx = null;   // effect instance currently in picking mode
let seedCounter = 0;

export function isPicking() {
  return !!pickingFx;
}

export function initTrackPoints() {
  const overlay = $('#track-overlay');

  overlay.addEventListener('pointerdown', (e) => {
    if (!pickingFx || e.target !== overlay) return; // markers handle their own
    if (e.button !== 0) return;
    const rect = overlay.getBoundingClientRect();
    addPoint(pickingFx,
      clamp((e.clientX - rect.left) / rect.width, 0, 1),
      clamp((e.clientY - rect.top) / rect.height, 0, 1));
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && pickingFx) stopPicking();
  });

  on('frame-rendered', syncOverlay);
  on('chain-changed', () => {
    // the effect may have been deleted while picking
    if (pickingFx && !state.chain.includes(pickingFx)) stopPicking();
    else renderMarkers();
  });
}

function addPoint(fx, x, y) {
  fx._points = fx._points ?? [];
  fx._points.push({ id: `p${++seedCounter}`, x, y, anchor: 0 });
  if (fx.params.mode?.base === 'auto') fx.params.mode.base = 'puntos';
  emit('chain-changed');
}

export function clearPoints(fx) {
  fx._points = [];
  emit('chain-changed');
}

/** Re-take every template at the point's current tracked position. */
export function reanchorPoints(fx) {
  const live = new Map((fx._vizPoints ?? []).map((m) => [m.sid, m]));
  for (const seed of fx._points ?? []) {
    const m = live.get(seed.id);
    if (m) { seed.x = m.cx; seed.y = m.cy; }
    seed.anchor = (seed.anchor ?? 0) + 1;
  }
  emit('chain-changed');
}

export function startPicking(fx) {
  pickingFx = fx;
  $('#viewport').classList.add('picking');
  $('#pick-hint').classList.remove('hidden');
  syncOverlay();
  renderMarkers();
  emit('chain-changed');
}

export function stopPicking() {
  pickingFx = null;
  $('#viewport').classList.remove('picking');
  $('#pick-hint').classList.add('hidden');
  $('#track-overlay').replaceChildren();
  emit('chain-changed');
}

export function togglePicking(fx) {
  if (pickingFx === fx) stopPicking();
  else startPicking(fx);
}

/**
 * Keep the overlay exactly on top of the canvas. The canvas is CSS-scaled by
 * the zoom/pan transform, so its client rect is the single source of truth.
 */
function syncOverlay() {
  if (!pickingFx) return;
  const overlay = $('#track-overlay');
  const canvas = $('#gl-canvas').getBoundingClientRect();
  const host = $('#viewport').getBoundingClientRect();
  overlay.style.left = `${canvas.left - host.left}px`;
  overlay.style.top = `${canvas.top - host.top}px`;
  overlay.style.width = `${canvas.width}px`;
  overlay.style.height = `${canvas.height}px`;
  overlay.classList.remove('hidden');

  // follow the live tracked positions
  const live = new Map((pickingFx._vizPoints ?? []).map((m) => [m.sid, m]));
  for (const node of overlay.children) {
    const seed = (pickingFx._points ?? []).find((s) => s.id === node.dataset.id);
    if (!seed || node.dataset.dragging === '1') continue;
    const m = live.get(seed.id);
    const x = m ? m.cx : seed.x;
    const y = m ? m.cy : seed.y;
    node.style.left = `${x * 100}%`;
    node.style.top = `${y * 100}%`;
    node.classList.toggle('lost', !!m?.lost);
    node.querySelector('.tp-val').textContent = m ? m.value : '—';
  }
}

function renderMarkers() {
  const overlay = $('#track-overlay');
  if (!pickingFx) { overlay.replaceChildren(); overlay.classList.add('hidden'); return; }
  overlay.replaceChildren();
  (pickingFx._points ?? []).forEach((seed, i) => {
    overlay.append(renderMarker(pickingFx, seed, i + 1));
  });
  syncOverlay();
}

function renderMarker(fx, seed, index) {
  const node = el('div', {
    class: 'tp-marker',
    dataset: { id: seed.id },
    title: 'arrastra para re-anclar · clic derecho para borrar',
  },
    el('span', { class: 'tp-ring' }),
    el('span', { class: 'tp-tag' }, `P${String(index).padStart(2, '0')}`),
    el('span', { class: 'tp-val' }, '—'),
  );
  node.style.left = `${seed.x * 100}%`;
  node.style.top = `${seed.y * 100}%`;

  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = fx._points;
    list.splice(list.indexOf(seed), 1);
    emit('chain-changed');
  });

  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    node.setPointerCapture(e.pointerId);
    node.dataset.dragging = '1';
    const rect = $('#track-overlay').getBoundingClientRect();
    const move = (ev) => {
      seed.x = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      seed.y = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
      node.style.left = `${seed.x * 100}%`;
      node.style.top = `${seed.y * 100}%`;
    };
    const up = () => {
      delete node.dataset.dragging;
      seed.anchor = (seed.anchor ?? 0) + 1; // re-take the template here
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      emit('param-changed', {});
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  });

  return node;
}

/** Panel embedded in the MOTION_TRACK card by the chain rack. */
export function trackPointsPanel(fx) {
  const count = (fx._points ?? []).length;
  const active = pickingFx === fx;

  const pick = el('button', {
    class: `btn small${active ? ' btn-primary' : ''}`,
    onclick: () => {
      if (!state.video) { toast('Carga un clip antes de elegir puntos.', 'warn'); return; }
      togglePicking(fx);
      if (!active) toast('Clic en el visor para añadir puntos de trackeo · Esc para terminar.');
    },
  }, active ? `● PICANDO — TERMINAR (${count})` : `ELEGIR PUNTOS EN EL VISOR (${count})`);

  const row = el('div', { class: 'tp-actions' },
    pick,
    el('button', {
      class: 'btn small', title: 'Vuelve a tomar la referencia visual de cada punto en su posición actual',
      onclick: () => reanchorPoints(fx),
    }, 'RE-ANCLAR'),
    el('button', { class: 'btn small', onclick: () => clearPoints(fx) }, 'LIMPIAR'),
  );

  return el('div', { class: 'tp-panel' },
    el('div', { class: 'tp-title muted small' }, 'PUNTOS_DE_TRACKEO'),
    row,
    el('p', { class: 'muted small' },
      count === 0
        ? 'Sin puntos: el modo PUNTOS no dibuja nada todavía.'
        : `${count} punto(s) · arrastra un marcador para re-anclarlo, clic derecho para borrarlo.`),
  );
}
