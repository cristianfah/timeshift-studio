// Central app state + a tiny event bus. Modules mutate state and emit
// events; UI modules subscribe and re-render what they own.

export const state = {
  video: null,          // { el, file, url, name, duration, width, height, fps }
  playing: false,
  loop: true,
  trim: { in: 0, out: 0 },
  exporting: false,     // realtime-fallback export in progress
  priming: false,       // ring buffer being rebuilt after a scrub
  chain: [],            // ordered effect instances
  selectedId: null,     // effect card focused for time-map / timeline keys
  settings: {
    previewWidth: 854,
    bufferSecs: 3,
  },
  bufferInfo: null,     // { width, height, depth, requestedDepth, memoryMB }
};

const bus = new EventTarget();

export function emit(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, fn) {
  bus.addEventListener(type, (e) => fn(e.detail));
}

let uidCounter = 0;
export function uid() {
  return `fx${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
}

/** Max usable delay in frames given the current buffer allocation. */
export function maxDelayFrames() {
  return state.bufferInfo ? state.bufferInfo.depth - 1 : 0;
}
