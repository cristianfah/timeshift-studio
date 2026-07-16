// Preset I/O: full effect stack + animation as a portable JSON file, and
// the "copy render command" pattern inherited from the CLI prototype.

import { $, download } from '../util/dom.js';
import { state, emit, on } from '../state.js';
import { createEffect, registry } from '../effects/registry.js';
import { toast } from './toast.js';

const PRESET_VERSION = 1;

export function initPresets() {
  $('#btn-preset-save').addEventListener('click', savePreset);
  $('#btn-preset-load').addEventListener('click', () => $('#preset-input').click());
  $('#preset-input').addEventListener('change', (e) => {
    if (e.target.files[0]) loadPreset(e.target.files[0]);
    e.target.value = '';
  });
  $('#btn-copy-cli').addEventListener('click', copyCli);

  for (const evt of ['chain-changed', 'param-changed', 'video-loaded', 'trim-changed', 'keys-changed']) {
    on(evt, updateCli);
  }
  updateCli();
}

// ---------- JSON presets ----------

export function serializeSetup() {
  return {
    app: 'timeshift-studio',
    version: PRESET_VERSION,
    trim: { ...state.trim },
    chain: state.chain.map((fx) => ({
      type: fx.type,
      enabled: fx.enabled,
      params: Object.fromEntries(Object.entries(fx.params).map(([k, p]) => [k, {
        base: p.base,
        lfo: p.lfo ?? null,
        keys: (p.keys ?? []).map((key) => ({ ...key })),
      }])),
    })),
  };
}

export function applySetup(data) {
  if (data?.app !== 'timeshift-studio' || !Array.isArray(data.chain)) {
    throw new Error('formato');
  }
  const chain = [];
  for (const item of data.chain) {
    if (!registry[item.type]) continue; // skip effects from future versions
    const fx = createEffect(item.type);
    fx.enabled = item.enabled !== false;
    for (const [k, saved] of Object.entries(item.params ?? {})) {
      const p = fx.params[k];
      if (!p || typeof saved !== 'object') continue;
      if (saved.base !== undefined) p.base = saved.base;
      if (p.keys) {
        p.lfo = saved.lfo ?? null;
        p.keys = Array.isArray(saved.keys)
          ? saved.keys.filter((key) => isFinite(key.t) && isFinite(key.v))
          : [];
      }
    }
    chain.push(fx);
  }
  state.chain = chain;
  state.selectedId = chain[0]?.id ?? null;
  if (data.trim && state.video) {
    state.trim.in = Math.max(0, Math.min(data.trim.in ?? 0, state.video.duration));
    state.trim.out = Math.max(state.trim.in + 0.1, Math.min(data.trim.out ?? state.video.duration, state.video.duration));
  }
  emit('chain-changed');
  emit('trim-changed');
}

function savePreset() {
  const json = JSON.stringify(serializeSetup(), null, 2);
  const base = state.video ? state.video.name.replace(/\.[^.]+$/, '') : 'setup';
  download(new Blob([json], { type: 'application/json' }), `${base}_timeshift.json`);
  toast('Preset guardado (.json). Las imágenes de mapa propias no se incluyen.');
}

async function loadPreset(file) {
  try {
    applySetup(JSON.parse(await file.text()));
    toast(`Preset cargado: ${state.chain.length} efecto(s).`);
  } catch {
    toast('Preset inválido: no es un .json de timeshift-studio.', 'error');
  }
}

// ---------- render command ----------

function fmtNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function buildCli() {
  if (!state.video) return '// carga un clip para generar el comando';
  const name = state.video.name;
  const outName = name.replace(/\.[^.]+$/, '');
  const enabled = state.chain.filter((f) => f.enabled);
  const trim = `${state.trim.in.toFixed(2)}:${state.trim.out.toFixed(2)}`;

  // Pure slit-scan setups keep the original timeslice.py CLI shape.
  if (enabled.length === 1 && enabled[0].type === 'sliceBands') {
    const p = Object.fromEntries(Object.entries(enabled[0].params).map(([k, v]) => [k, v.base]));
    return `python timeslice.py --input "${name}" --bands ${p.bands} ` +
      `--offset ${p.offset} --jitter ${fmtNum(p.jitter)} --angle ${p.angle} ` +
      `--spacing ${p.spacing} --feather ${fmtNum(p.feather)} --seed ${p.seed} ` +
      `--trim ${trim} --out "${outName}_timeslice.mp4"`;
  }

  if (enabled.length === 0) return `// sin efectos activos — nada que renderizar`;
  const types = enabled.map((f) => f.type).join(',');
  return `timeshift render "${name}" --trim ${trim} --fx ${types} ` +
    `--preset "${outName}_timeshift.json" --out "${outName}_timeshift.mp4"`;
}

function updateCli() {
  $('#cli-preview').textContent = buildCli();
  $('#btn-copy-cli').disabled = !state.video;
  $('#cli-note').textContent = state.chain.some((f) => f.enabled)
    ? 'exporta el preset .json junto al comando'
    : '';
}

async function copyCli() {
  try {
    await navigator.clipboard.writeText(buildCli());
    toast('Comando copiado al portapapeles.');
  } catch {
    toast('No se pudo acceder al portapapeles.', 'error');
  }
}
