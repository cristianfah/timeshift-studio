# TIMESHIFT_STUDIO v1 — SPA vanilla (archivada)

Esta carpeta es una copia congelada de la app original, tal y como estaba antes
de la migración a la arquitectura Toolcraft. Se conserva como respaldo y como
referencia de comportamiento durante la migración.

**No se mantiene.** El desarrollo continúa en la raíz del repositorio.

## Qué es

Una SPA sin build: ES modules servidos tal cual, WebGL2 a pelo, sin
dependencias. Todo lo que hace la app vive en estos tres directorios:

```
index.html     estructura completa de la UI (IDs cableados a mano)
styles/        848 líneas de CSS propio
src/
  engine/      gl.js · ringbuffer.js (TEXTURE_2D_ARRAY) · renderer.js · video.js
  effects/     10 módulos shader + registry + looks
  animation/   lfo.js · keyframes.js · resolver.js
  export/      exporter.js (WebCodecs + mp4-muxer) · fallback.js (WebM)
  ui/          12 módulos coordinados por un bus de eventos
  util/        dom.js · rand.js
  state.js     estado central + bus
  main.js      punto de entrada y bucle de render
```

## Cómo ejecutarla

Desde esta carpeta:

```bash
npx serve .
```

O abriendo `index.html` directamente en un navegador con WebGL2.

## Otras formas de recuperarla

- `origin/main` en el commit `ef13169` contiene el árbol completo.
- Tag local `v1-vanilla` y rama local `legacy/vanilla-spa` apuntan a ese commit.

## Qué se llevó la migración

El motor, los efectos, la animación y el export se portaron a `src/app/` en la
raíz sin cambiar shaders ni algoritmos. Lo que se reemplazó fue la capa de UI:
`index.html`, `styles/main.css`, `src/ui/**`, `src/state.js` y `src/main.js`
dieron paso al runtime de Toolcraft (canvas, paneles, timeline, historial).
