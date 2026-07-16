// Toast notifications — info / warn / error.
import { el, $ } from '../util/dom.js';

const DURATION = { info: 3500, warn: 6000, error: 8000 };

export function toast(message, type = 'info') {
  const host = $('#toasts');
  const node = el('div', { class: `toast ${type}` }, message);
  host.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 320);
  }, DURATION[type] ?? 4000);
}

/** Fatal, unrecoverable error — replaces the whole app. */
export function fatal(title, message) {
  const node = el('div', { class: 'fatal' },
    el('div', {},
      el('h2', {}, title),
      el('p', {}, message),
    ),
  );
  document.body.append(node);
}
