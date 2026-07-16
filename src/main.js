// TIMESHIFT_STUDIO — entry point.
// Boot sequence: capability checks, then app modules wire themselves up.
import { fatal } from './ui/toast.js';

function checkWebGL2() {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) {
    fatal('WEBGL2_NO_DISPONIBLE',
      'Este navegador no soporta WebGL2, requerido por el motor de render. ' +
      'Prueba con una versión reciente de Chrome, Edge o Firefox, y verifica ' +
      'que la aceleración por hardware esté activada.');
    return false;
  }
  return true;
}

if (checkWebGL2()) {
  // App modules land in the next milestones (engine → effects → animation → export).
  console.info('[timeshift] scaffold ok — WebGL2 available');
}
