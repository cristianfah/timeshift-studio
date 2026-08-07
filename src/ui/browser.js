// Effect browser — replaces the old "pick a name from a dropdown" flow with
// a grid of LIVE previews. A second, deliberately small engine keeps its own
// ring buffer (fed from the main engine's frames, so the video is decoded
// once) and renders one candidate per animation frame into its tile; the
// hovered candidate also renders large in the hero panel. Nothing is added
// to the real chain until you click.

import { $, el } from '../util/dom.js';
import { state, emit, on } from '../state.js';
import { Engine } from '../engine/renderer.js';
import { registry, effectTypes, createEffect, baseParams } from '../effects/registry.js';
import { LOOKS } from '../effects/looks.js';
import { toast } from './toast.js';

const PREVIEW_W = 384;      // internal render width of the preview engine
const TILE_W = 208;         // backing-store width of a grid tile
const TILES_PER_FRAME = 3;  // round-robin budget — keeps the main preview smooth

let engine = null;
let glCanvas = null;
let items = [];
let hero = null;
let open = false;
let cursor = 0;
let rafId = 0;
let detach = null;
let seekBack = null;
let resume = null;   // playback state to put back when the browser closes

// ---------------------------------------------------------------- lifecycle

export function initBrowser({ engine: mainEngine, seek }) {
  seekBack = seek;
  $('#btn-browser-close').addEventListener('click', closeBrowser);
  $('#browser-modal').addEventListener('click', (e) => {
    if (e.target === $('#browser-modal')) closeBrowser();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) closeBrowser();
  });
  $('#browser-filter').addEventListener('input', applyFilter);
  $('#btn-hero-add').addEventListener('click', () => hero && addItem(hero));

  detach?.();
  detach = mainEngine.addPushListener((frame) => engine?.pushFrame(frame));

  on('video-loaded', configure);
  buildItems();
}

/** (Re)allocate the preview ring for the loaded clip. */
function configure() {
  const v = state.video;
  if (!v) return;
  if (!engine) {
    glCanvas = document.createElement('canvas');
    // preserveDrawingBuffer: tiles are copied out with drawImage after each pass
    engine = new Engine(glCanvas, { preserveDrawingBuffer: true });
  }
  engine.configure({
    srcWidth: v.width,
    srcHeight: v.height,
    targetWidth: PREVIEW_W,
    depth: Math.min(120, Math.max(48, Math.round(3 * v.fps))),
  });
  sizeCanvases();
}

function sizeCanvases() {
  if (!engine) return;
  const ratio = engine.height / engine.width;
  const heroCv = $('#browser-hero-canvas');
  heroCv.width = engine.width;
  heroCv.height = engine.height;
  for (const item of items) {
    item.canvas.width = TILE_W;
    item.canvas.height = Math.round(TILE_W * ratio);
  }
  // Tiles keep the clip's shape but never grow tall enough to push the name
  // out of view — a vertical clip letterboxes instead of stretching the grid.
  $('#browser-grid').style.setProperty('--tile-h',
    `${Math.round(Math.min(190, Math.max(72, TILE_W * ratio)))}px`);
}

// -------------------------------------------------------------------- items

function buildItems() {
  items = [];
  for (const { type, label } of effectTypes) {
    const mod = registry[type];
    items.push(makeItem({
      key: `fx:${type}`, kind: 'fx', type, label,
      desc: mod.desc ?? '',
      presets: Object.keys(mod.presets ?? {}),
    }));
  }
  for (const name of Object.keys(LOOKS)) {
    items.push(makeItem({
      key: `look:${name}`, kind: 'look', name, label: name,
      desc: `Cadena completa: ${LOOKS[name]().map((f) => registry[f.type].label).join(' → ')}. ` +
        'Aplicarlo reemplaza la cadena actual.',
      presets: [],
    }));
  }
  renderGrid();
  setHero(items[0]);
}

function makeItem(base) {
  const item = { ...base, preset: null, hidden: false };
  item.canvas = el('canvas', { class: 'tile-canvas', width: TILE_W, height: Math.round(TILE_W * 9 / 16) });
  item.ctx = item.canvas.getContext('2d');
  item.chain = buildChain(item);
  return item;
}

/** Throwaway effect instances used only for previewing. */
function buildChain(item, presetName = null) {
  if (item.kind === 'look') return LOOKS[item.name]();
  const mod = registry[item.type];
  const overrides = presetName ? (mod.presets?.[presetName] ?? {}) : {};
  return [createEffect(item.type, overrides)];
}

// ------------------------------------------------------------------- render

function renderInto(item, ctx2d) {
  const v = state.video;
  engine.render(item.chain, registry, {
    time: v.el.currentTime,
    fps: v.fps,
    duration: v.duration,
    params: (fx) => baseParams(fx),
  });
  ctx2d.drawImage(glCanvas, 0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
}

function tick() {
  if (!open) return;
  rafId = requestAnimationFrame(tick);
  if (!engine?.ring || engine.ring.count === 0 || !state.video) return;

  if (hero) {
    renderInto(hero, $('#browser-hero-canvas').getContext('2d'));
    // same GL frame, second copy: the hovered tile stays live too
    hero.ctx.drawImage(glCanvas, 0, 0, hero.canvas.width, hero.canvas.height);
  }

  const visible = items.filter((i) => !i.hidden);
  for (let k = 0; k < TILES_PER_FRAME && visible.length; k++) {
    const item = visible[cursor++ % visible.length];
    if (item !== hero) renderInto(item, item.ctx);
  }
}

// ---------------------------------------------------------------------- DOM

function renderGrid() {
  const host = $('#browser-grid');
  host.replaceChildren();
  let kind = null;
  for (const item of items) {
    if (item.kind !== kind) {
      kind = item.kind;
      host.append(el('div', { class: 'browser-section muted small' },
        kind === 'fx' ? 'EFECTOS' : 'LOOKS — cadenas completas'));
    }
    host.append(renderTile(item));
  }
}

function renderTile(item) {
  const tile = el('div', { class: `browser-tile${item.kind === 'look' ? ' is-look' : ''}` },
    item.canvas,
    el('div', { class: 'tile-label' }, item.label),
  );
  item.node = tile;
  tile.addEventListener('pointerenter', () => setHero(item));
  tile.addEventListener('focus', () => setHero(item));
  tile.addEventListener('click', () => addItem(item));
  tile.tabIndex = 0;
  tile.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); addItem(item); }
  });
  return tile;
}

function setHero(item) {
  if (!item || hero === item) return;
  hero?.node?.classList.remove('active');
  hero = item;
  hero.node?.classList.add('active');
  $('#hero-title').textContent = item.label;
  $('#hero-desc').textContent = item.desc;
  $('#btn-hero-add').textContent = item.kind === 'look'
    ? 'APLICAR LOOK (reemplaza la cadena)'
    : '+ AÑADIR A LA CADENA';

  const chips = $('#hero-presets');
  chips.replaceChildren();
  if (item.presets.length) {
    chips.append(el('span', { class: 'muted small' }, 'PRESETS:'));
    chips.append(renderPresetChip(item, null, 'BASE'));
    for (const name of item.presets) chips.append(renderPresetChip(item, name, name));
  }
  chips.onpointerleave = () => usePreset(item, item.preset, false);
}

function renderPresetChip(item, presetName, label) {
  const chip = el('span', {
    class: `chip${item.preset === presetName ? ' active' : ''}`,
    title: 'pasa el cursor para previsualizar · clic para añadir con este preset',
  }, label);
  chip.addEventListener('pointerenter', () => usePreset(item, presetName, false));
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    usePreset(item, presetName, true);
    addItem(item);
  });
  return chip;
}

function usePreset(item, presetName, sticky) {
  item.chain = buildChain(item, presetName);
  if (sticky) item.preset = presetName;
  const current = item.preset ?? 'BASE';
  for (const node of $('#hero-presets').children) {
    if (node.classList.contains('chip')) {
      node.classList.toggle('active', node.textContent === current);
    }
  }
}

// -------------------------------------------------------------------- adding

function addItem(item) {
  if (item.kind === 'look') {
    state.chain = LOOKS[item.name]();
    state.selectedId = state.chain[0]?.id ?? null;
    emit('chain-changed');
    toast(`Look aplicado: ${item.label}`);
  } else {
    const mod = registry[item.type];
    const overrides = item.preset ? (mod.presets?.[item.preset] ?? {}) : {};
    const fx = createEffect(item.type, overrides);
    state.chain.push(fx);
    state.selectedId = fx.id;
    emit('chain-changed');
    toast(`${item.label} añadido${item.preset ? ` · preset ${item.preset}` : ''}.`);
  }
  closeBrowser();
}

function applyFilter() {
  const q = $('#browser-filter').value.trim().toLowerCase();
  for (const item of items) {
    item.hidden = !!q && !`${item.label} ${item.desc}`.toLowerCase().includes(q);
    item.node?.classList.toggle('hidden', item.hidden);
  }
  const first = items.find((i) => !i.hidden);
  if (first) setHero(first);
}

// --------------------------------------------------------------- open/close

export function openBrowser() {
  if (!engine && state.video) configure();
  open = true;
  $('#browser-modal').classList.remove('hidden');
  $('#browser-empty').classList.toggle('hidden', !!state.video);
  $('#browser-filter').value = '';
  applyFilter();
  $('#browser-filter').focus();
  startPlayback();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function closeBrowser() {
  open = false;
  cancelAnimationFrame(rafId);
  $('#browser-modal').classList.add('hidden');
  stopPlayback();
}

/**
 * Previews are only meaningful in motion: on a frozen frame most temporal
 * effects render the same still. So the clip rolls while the browser is
 * open, muted, and the exact playback state is restored on close.
 */
function startPlayback() {
  const v = state.video;
  if (!v || resume) return;
  resume = { playing: state.playing, time: v.el.currentTime, muted: v.el.muted };
  v.el.muted = true;
  if (!state.playing) {
    v.el.play().then(() => { state.playing = true; }).catch(() => { /* blocked */ });
  }
}

function stopPlayback() {
  const v = state.video;
  if (!v || !resume) return;
  const { playing, time, muted } = resume;
  resume = null;
  v.el.muted = muted;
  if (!playing) {
    v.el.pause();
    state.playing = false;
    seekBack?.(time);   // back to the frame the user was looking at
  }
}
