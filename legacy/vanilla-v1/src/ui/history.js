// Undo/redo for the effect chain — cmd/ctrl+Z and cmd/ctrl+shift+Z.
//
// Snapshots are taken *after* the fact: every change event captures the new
// state, and the previous one moves onto the undo stack. Capturing is
// debounced so dragging a slider lands as one entry instead of a hundred.
// Snapshots keep object references for things JSON can't hold (an uploaded
// displacement map), so undoing never loses an image the user chose.

import { state, emit, on } from '../state.js';
import { createEffect } from '../effects/registry.js';
import { toast } from './toast.js';

const LIMIT = 60;
const DEBOUNCE = 350;

const undoStack = [];
const redoStack = [];
let current = null;
let currentKey = '';
let timer = null;
let restoring = false;

export function initHistory() {
  current = capture();
  currentKey = keyOf(current);

  for (const evt of ['chain-changed', 'param-changed', 'keys-changed', 'trim-changed']) {
    on(evt, schedule);
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    // inside a text field the native text undo is what the user means
    if (e.target.matches('input[type="text"], input[type="number"], textarea')) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  });
}

// ---------- recording ----------

function schedule() {
  if (restoring) return;
  clearTimeout(timer);
  timer = setTimeout(record, DEBOUNCE);
}

function record() {
  const snap = capture();
  const key = keyOf(snap);
  if (key === currentKey) return;
  undoStack.push(current);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
  current = snap;
  currentKey = key;
}

// ---------- undo / redo ----------

export function undo() {
  clearTimeout(timer);
  record();                       // don't lose an edit still inside the debounce
  if (undoStack.length === 0) {
    toast('Nada que deshacer.', 'warn');
    return;
  }
  redoStack.push(current);
  apply(undoStack.pop());
  toast(`Deshecho · ${undoStack.length} paso(s) atrás disponibles`);
}

export function redo() {
  clearTimeout(timer);
  if (redoStack.length === 0) {
    toast('Nada que rehacer.', 'warn');
    return;
  }
  undoStack.push(current);
  apply(redoStack.pop());
  toast('Rehecho.');
}

function apply(snap) {
  restoring = true;
  try {
    restore(snap);
    current = snap;
    currentKey = keyOf(snap);
    emit('chain-changed');
    emit('trim-changed');
    emit('keys-changed');
  } finally {
    restoring = false;
  }
}

// ---------- snapshots ----------

function capture() {
  return {
    trim: { ...state.trim },
    selectedId: state.selectedId,
    chain: state.chain.map((fx) => ({
      id: fx.id,
      type: fx.type,
      enabled: fx.enabled,
      collapsed: fx.collapsed,
      params: Object.fromEntries(Object.entries(fx.params).map(([k, p]) => [k, {
        base: p.base,
        lfo: p.lfo ? { ...p.lfo } : null,
        keys: (p.keys ?? []).map((key) => ({ ...key })),
      }])),
      points: (fx._points ?? []).map((p) => ({ ...p })),
      mapImage: fx._mapImage ?? null,   // by reference — never re-decoded
      mapStamp: fx._mapStamp ?? 0,
    })),
  };
}

/** Comparable form of a snapshot (drops the non-serializable image handle). */
function keyOf(snap) {
  return JSON.stringify({
    trim: snap.trim,
    chain: snap.chain.map(({ mapImage, ...rest }) => rest),
  });
}

function restore(snap) {
  state.chain = snap.chain.map((s) => {
    const fx = createEffect(s.type);
    // Reusing the id keeps per-effect engine state (tracker templates,
    // glyph atlases) attached to the effect across an undo.
    fx.id = s.id;
    fx.enabled = s.enabled;
    fx.collapsed = s.collapsed;
    for (const [k, saved] of Object.entries(s.params)) {
      const p = fx.params[k];
      if (!p) continue;
      p.base = saved.base;
      if (p.keys) {
        p.lfo = saved.lfo ? { ...saved.lfo } : null;
        p.keys = saved.keys.map((key) => ({ ...key }));
      }
    }
    fx._points = s.points.map((p) => ({ ...p }));
    if (s.mapImage) {
      fx._mapImage = s.mapImage;
      fx._mapStamp = s.mapStamp;
    }
    return fx;
  });
  state.selectedId = state.chain.some((fx) => fx.id === snap.selectedId)
    ? snap.selectedId
    : state.chain[0]?.id ?? null;
  if (state.video) {
    state.trim.in = snap.trim.in;
    state.trim.out = snap.trim.out;
  }
}
