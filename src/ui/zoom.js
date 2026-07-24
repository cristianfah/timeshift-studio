// Viewport zoom/pan — purely visual (CSS transform on the preview canvas);
// render resolution and export are unaffected. Wheel zooms, dragging pans
// when zoomed in, double click or the % button resets.

import { $, clamp } from '../util/dom.js';

const MIN_Z = 0.25;
const MAX_Z = 8;

let z = 1;
let panX = 0;
let panY = 0;

function apply() {
  const wrap = $('#zoom-wrap');
  if (z === 1) { panX = 0; panY = 0; }
  clampPan();
  wrap.style.transform = `translate(${panX}px, ${panY}px) scale(${z})`;
  $('#zoom-reset').textContent = `${Math.round(z * 100)}%`;
  $('#viewport').classList.toggle('zoomed', z > 1);
}

function clampPan() {
  // keep at least part of the frame on screen
  const rect = $('#viewport').getBoundingClientRect();
  const maxX = (rect.width * z) / 2;
  const maxY = (rect.height * z) / 2;
  panX = clamp(panX, -maxX, maxX);
  panY = clamp(panY, -maxY, maxY);
}

function setZoom(next) {
  z = clamp(next, MIN_Z, MAX_Z);
  if (Math.abs(z - 1) < 0.06) z = 1; // snap to 100%
  apply();
}

export function initZoom() {
  const viewport = $('#viewport');

  $('#zoom-in').addEventListener('click', () => setZoom(z * 1.25));
  $('#zoom-out').addEventListener('click', () => setZoom(z / 1.25));
  $('#zoom-reset').addEventListener('click', () => setZoom(1));

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  viewport.addEventListener('dblclick', () => setZoom(1));

  // drag to pan while zoomed in
  viewport.addEventListener('pointerdown', (e) => {
    if (z <= 1 || e.target.closest('.zoom-ctl, .dropzone')) return;
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('panning');
    let lx = e.clientX, ly = e.clientY;
    const move = (ev) => {
      panX += ev.clientX - lx;
      panY += ev.clientY - ly;
      lx = ev.clientX; ly = ev.clientY;
      apply();
    };
    const up = () => {
      viewport.classList.remove('panning');
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', up);
      viewport.removeEventListener('pointercancel', up);
    };
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', up);
  });

  apply();
}
