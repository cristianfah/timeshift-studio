# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: product

Timeshift Studio es un editor de video **y de imagen fija** con cadena de efectos, por ahora con timeline y layout heredados del starter. La timeline se posiciona abajo (estilo After Effects / Jitter.com) por decisión de producto registrada en Iteration 7. Desde Iteration 8 la misma cadena corre sobre una foto subida y se entrega como PNG/JPG.

## Automatic Delivery Lifecycle

Keep this worklog human-shaped. For the first product delivery, record the request, decisions, state/output mapping, reference evidence, rejected alternatives, and known risks; one bare `npm run verify:delivery` derives complete contract proof, one build, full functional acceptance, and no measured performance. For later `functional-targeted` delivery, record only the new intent and decisions; the same bare command derives exact ownership-required proof from protected state.

Classifier output establishes complaint authority only and never path localization. A localized performance complaint adds the domain authority below, then one bare `npm run verify:delivery` runs one targeted iteration. If localization remains unresolved regardless of classifier result, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; record neither `performance-iteration` intent nor canonical path authority until the answer supplies exact localization evidence. Never ask the user to choose internal path IDs. A broad or honestly unlocalizable problem may present that single choice with a recommendation for complete review, but the user still chooses. A direct complete-review request needs no further clarification. The full audit remains separate and requires an explicit operator request or accepted offer before `npm run verify:perf` may run. Protected receipts own changed files, plans, checks, reports, measurements, and pass/fail evidence.

When `canvas.renderScale` is enabled, record the renderer decision to preserve selected backing quality and map it to functional `renderScaleCoverage` for interaction and steady state, plus playback when timeline is enabled. The worklog may name the protected `canvas-render-scale-backing` recipe, but it cannot claim its evidence or turn a quality failure into performance authority.

## Performance Iteration Entry Contract

For high-confidence ordinary work, record `Performance intent: ordinary-product-work`. For unresolved localization, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`, record the unresolved visible operation but no `Performance intent: performance-iteration` field or `Performance paths` until the user's one clarification provides exact localization. For a localized performance complaint or post-clarification targeted choice, record exactly these domain fields in the latest iteration:

```md
- Performance intent: performance-iteration
- Performance request evidence: "<verbatim exact Request quote>"
- Performance paths: ["performance-path:%5B...%5D"]
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
```

The quoted evidence must be an exact nontrivial raw substring of `Request` with identical whitespace and Unicode code units. `Performance paths` must be a non-empty unique JSON array of canonical path IDs. Do not record command arguments, changed-file inventory, executed checks, reports, or measurements; the protected planner and receipt own that machine evidence. Each localized complaint or post-clarification targeted choice authorizes one bounded iteration; after it passes, return the app and wait for user evaluation. Classifier output or complaint evidence alone never supplies path localization or authorizes full certification. The separate operator command is permitted only after the user explicitly requests a complete audit or explicitly accepts the agent's offer; the user does not need to name the command.

## Decision Trail

### Iteration 1 — Migración de Timeshift Studio a Toolcraft

- Request: Migrar la app vanilla de efectos temporales a la arquitectura Toolcraft manteniendo el motor y los diez efectos.
- Task type: Ensamblado de app, esquema, renderer WebGL2, layers, timeline y export.
- User-visible result: La app corre sobre `ToolcraftApp` con panel de controles, layers por posición de cadena, timeline con keyframes y export PNG/vídeo; el preview WebGL2 reemplaza el preview genérico de medios.
- Source/reference checked: La app original congelada en `legacy/vanilla-v1` (shaders, algoritmos y parámetros) y el runtime Toolcraft copiado en `src/toolcraft`.
- Reference inputs: `legacy/vanilla-v1` como referencia de comportamiento y de shaders. Ninguna referencia visual externa.
- Docs/contracts read: `docs/toolcraft/workflow.md`, `core/runtime-boundary.md`, `assembly-workflow.md`, `schema-reference.md`, `acceptance-testing.md`.
- Contract rules applied: `defineToolcraft` + `ToolcraftApp` como única cáscara, `canvasContent` sólo para salida de producto, `exportRenderer` compartido para imagen y vídeo, estado de producto en targets del runtime.
- View interaction intent: `non-spatial`; la salida es un plano 2D renderizado sobre la fuente, sin escena tridimensional.
- Interaction ownership: El panel posee la edición de efectos y la carga de la fuente; el canvas sólo muestra el resultado renderizado.
- Decision: Modelar la cadena como un pool fijo de ocho posiciones con targets propios por posición, tipo y parámetro, para que keyframes, undo, reset y persistencia sean del runtime.
- Alternatives rejected: Recrear el panel vanilla dentro del canvas; guardar la cadena en estado local de React; crear controles en runtime (el esquema Toolcraft es estático).
- State/output mapping: `chain.order` + `fx.<slot>.<tipo>.<param>` → `resolveSlotParams` → uniformes del shader → canvas y artefacto exportado.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: El motor depende de WebGL2 y de los códecs que el navegador pueda decodificar; sin WebGL2 el canvas queda vacío.

### Iteration 2 — Timeline extendida y anclada abajo

- Request: Que la timeline arranque extendida y quede abajo, al estilo After Effects / Jitter.com.
- Task type: Timeline y presentación de paneles.
- User-visible result: Al abrir la app la timeline aparece extendida y anclada al borde inferior del viewport.
- Source/reference checked: After Effects y Jitter.com como referencia de disposición, más el host de paneles del runtime (`snapEdge`).
- Reference inputs: Referencia verbal del usuario a After Effects / Jitter.com. Ningún archivo de referencia.
- Docs/contracts read: `core/timeline-animation.md`, `core/setup-export.md`, `core/runtime-boundary.md`.
- Contract rules applied: El interruptor Timeline es presentación del runtime, no un valor de producto; el producto no reconstruye el panel ni su transporte.
- View interaction intent: `non-spatial`; la timeline no introduce escena espacial.
- Interaction ownership: El transporte vive en la timeline del runtime; el panel de controles no lo duplica.
- Decision: Enviar una sola vez al montar los comandos de presentación (`panels.timeline.extended` y `snapEdge: "bottom"`), sin historial ni valores de producto.
- Alternatives rejected: Reconstruir la timeline en el producto; guardar el estado extendido como valor de producto; parchear el layout firmado del framework.
- State/output mapping: `timelineDefaultCommands()` → estado de paneles del runtime → posición y altura del panel de timeline.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Es estado de presentación: si el runtime cambia los bordes de anclaje, el producto debe seguir ese contrato en vez de forzar posiciones.

### Iteration 3 — Imagen fija como fuente, efectos sobre la foto y export de imagen

- Request: "me gustaria que se puedan subir imagenes a la app y aplicarles efecto a la imagen tambien, exportar imagenes, tambien sea una opcion".
- Task type: Media upload, esquema y controles, renderer/canvas, export de imagen.
- Reference inputs: `legacy/vanilla-v1` (motor temporal original) y una foto de prueba generada para el navegador. Ninguna referencia visual aportada por el usuario.
- User-visible result: El cargador «Fuente» acepta video **o** imagen. Al soltar una foto, el canvas la muestra a resolución nativa, los looks y la cadena de 8 slots se aplican sobre ella, la reproducción del timeline anima los moduladores sobre la foto quieta, y «Exportar PNG» entrega la imagen procesada en PNG/JPG a 2K/4K/8K.
- Source/reference checked: `legacy/vanilla-v1` (motor temporal original), el registro de efectos actual (`effects/registry.ts`) y el comportamiento observado en navegador: con un anillo de fotogramas idénticos, `Datamosh` devolvía un render bit a bit igual a la foto.
- Docs/contracts read: `docs/toolcraft/workflow.md`, `core/media-upload.md`, `core/setup-export.md`, `core/runtime-boundary.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `schema-reference.md`.
- Contract rules applied: `fileDrop` como único dueño de la subida (`assetKind: "file"` + `accept` que estrecha a video/imagen, porque el control admite los dos tipos); Layers sigue siendo el dueño de la gestión del medio; el runtime sigue siendo el dueño del encoding/descarga (el producto solo pinta `exportRenderer.renderFrame`); `Image Export` se mantiene inmediatamente antes de `Video Export`; canvas neutro antes de que exista contenido real.
- View interaction intent: sin cambios — `orbit` sobre el preview 2D; una foto no agrega escena espacial.
- Interaction ownership: sin superficies nuevas. La subida vive en el panel (`fileDrop`), el orden y la visibilidad en Layers, el export en las acciones sticky.
- Decision: (1) Un solo control de fuente para clip e imagen; el tipo se deduce del `mimeType` del asset (extensión como respaldo). (2) Una foto no tiene pasado y **todos** los efectos de esta app leen el pasado, así que el producto le inventa uno: el anillo se rellena una sola vez y el fotograma más viejo se aleja del actual según «Movimiento inventado» (Barrido por defecto) e «Intensidad» (0.5). El fotograma actual siempre es la imagen intacta, así que con delay 0 el resultado es la foto original píxel a píxel. (3) El tiempo de la imagen lo manda el timeline del runtime (un clip manda el suyo), de modo que LFOs y keyframes animan sobre la foto. (4) La sesión de export se identifica por fuente + tamaño + ajustes de pasado inventado, para que cambiar 2K↔8K reasigne el anillo en vez de reescalar capas viejas.
- Alternatives rejected: rellenar el anillo con copias idénticas (deja la cadena en no-op: comprobado en navegador); mover la imagen también en el fotograma actual (alteraría la foto exportada); un segundo cargador solo para imágenes (duplica la fuente y rompe «una operación, una superficie»); un valor de producto que espeje el tipo de medio para ocultar los controles de clip (duplicaría el estado de medios del runtime).
- State/output mapping: `clip.source` → asset de medios → `clipSourceRef` → preview (`use-preview-source.ts`) y export (`export-renderer.ts`). `still.motion` / `still.motionAmount` → `still-history.ts` → capas del ring buffer → cada shader de la cadena → canvas y artefacto exportado. `export.image.format` / `export.image.resolution` los sigue consumiendo el runtime.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Con «Sin movimiento» o intensidad 0 los efectos temporales no tienen material y la foto sale igual — está documentado en la ayuda del control. Los controles de «Reproducción del clip» (silenciar, entrada, salida) siguen visibles con una imagen cargada aunque no apliquen; ocultarlos exigiría espejar el tipo de medio en `values`. Un export 8K sigue reservando el anillo a esa resolución, igual que en video.

### Iteration 4 — Cierre de contratos: acceptance, applicability y salud de código

- Request: "ok ahora arreglemos los errores" — los 5.033 errores de cobertura de acceptance y los tests de contrato en rojo.
- Task type: Acceptance, esquema y controles, salud de código, más los arreglos de producto que los contratos destaparon.
- User-visible result: Dos controles que no hacían nada ahora hacen lo que prometen —«Entrada»/«Salida» recortan de verdad la región del clip (la timeline pasa a durar la región y el export entrega ese tramo) y el interruptor «Audio original», que el runtime no puede cumplir porque su codificador de video no lleva pista de audio, desapareció. La intensidad del movimiento inventado admite keyframes en lugar de esconder el diamante.
- Source/reference checked: Los validadores del runtime (`src/app/acceptance/*`), el reporter de evidencia de Vitest y el chequeo de salud de código; más `src/toolcraft/runtime/export` para confirmar que el export de video no tiene audio.
- Reference inputs: Ninguna referencia externa; la entrada fue la salida de los propios validadores.
- Docs/contracts read: `acceptance-testing.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `performance.md`, `core/setup-export.md`, `schema-reference.md`.
- Contract rules applied: applicability explícita en cada control; una fila de acceptance por control visible con su test automatizado real; inventario de secciones con entidad, targets y razón; cohesión de entidad con etapas de trabajo para los efectos partidos; intención de export tipada; `viewInteraction` sin gizmo para una salida 2D; presupuesto de líneas por módulo.
- View interaction intent: `non-spatial`, con razón registrada: la salida es un plano 2D renderizado sobre la fuente. Antes decía `orbit` sin ningún gizmo declarado, que es justo lo que el contrato rechaza.
- Interaction ownership: Una sola entrada tipada, el explorador de efectos (`chain.browser`), que es la única operación que podría vivir en el canvas y vive en el panel; su fila de acceptance la referencia por `interactionId`.
- Decision: Generar las filas de acceptance y el inventario de secciones desde el mismo recorrido del registro que genera el esquema, y registrar los 2.480 tests automatizados desde esa misma lista, de modo que un control nuevo no pueda declarar cobertura sin ejecutar una aserción real. Cada test ejercita el resolutor que usan el preview y el export.
- Alternatives rejected: Escribir las filas a mano (se desincronizan al primer efecto nuevo); declarar `automated: false` para saltarse la prueba; dejar los sliders de recorte y el interruptor de audio como controles muertos; ocultar el diamante de keyframes con `keyframeable: false`.
- State/output mapping: `clip.trimIn`/`clip.trimOut` → `resolveClipWindow` → duración de la timeline, tiempo de fuente del preview y tiempo de fuente del export. Las filas de acceptance y el inventario derivan de `buildChainAcceptance()` y `buildSectionInventory(appSchema)`.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: Queda abierto el contrato de performance. El motor es un renderer WebGL2 propio, así que debe declarar envelope, pipeline ejecutable, un escenario por path canónico y sus adaptadores; pero el contrato de pipeline prohíbe que una interacción de alta frecuencia invalide un pase `pixel-transform`, que es exactamente lo que hace la reproducción cuadro a cuadro de este producto. Esa contradicción necesita una decisión de producto antes de declarar nada. Además, el inventario de impacto por módulo crece a cientos de kilobytes con 2.480 filas: si se modela el banco de LFO como una colección (el patrón que el propio contrato recomienda para entidades repetibles) bajarían a ~640.

## Decisions

### Renderer

- Decision: No product renderer yet.
- Reason: The starter is intentionally neutral.
- Evidence: No `canvasContent` product renderer is declared. The neutral composition still declares `modelPresentation: { mode: "runtime" }` so future model uploads have one standard owner until a product explicitly declares checked custom consumers.

### Timeline

- Decision: Timeline extendida por defecto, posicionada abajo (estilo After Effects / Jitter.com).
- Reason: Timeshift es un editor de video; la timeline es el transporte principal.
- Evidence: `panels.timeline: { enabled: true, mode: "keyframes", defaultDurationSeconds: 8 }` en app-schema. TimelineDefaultOn dispatchea `panels.timeline.extended = true` al montar. Pendiente: mover la timeline a la posición inferior (el runtime actual la posiciona arriba por defecto, se necesita layout override).

### Layers

- Decision: Layers habilitadas (una por slot de cadena).
- Reason: La cadena de efectos se modela como capas reordenables.
- Evidence: `panels.layers: true` en app-schema.

### Controls

- Decision: 8 slots de efecto × 10 tipos = 424 secciones, ~2480 controles. Generados en effect-sections.ts. Discriminador `fx.selection = "<slot>:<tipo>"`. Moduladores LFO: banco fijo de 4 por slot (MODULATORS_PER_SLOT = 4 en targets.ts). **Confirmado por Cristian (2026-08-08): 4 LFOs por slot alcanza, no se agregan ~2000 controles extra.**
- Reason: El esquema Toolcraft es estático; no se puede crear/eliminar controles en runtime.
- Evidence: effect-sections.ts, app-sections.ts, targets.ts.

### View Interaction

- Decision: `orbit` (canvas 2D con zoom/pan).
- Reason: El preview del clip es un canvas 2D renderizado por WebGL2.
- Evidence: canvas.draggable: true, canvas.sizing: "intrinsic-media".

### Interaction Ownership

- Decision: Canvas owns preview (zoom/pan/reset), panel owns efectos.
- Reason: Timeshift no tiene handles de transform sobre el canvas; el preview es solo visual.
- Evidence: canvas.draggable: true, no overlay handles declarados.

### Export

- Decision: Export PNG y Video vía runtime exportRenderer compartido, para clip y para imagen fija.
- Reason: El resultado renderizado se entrega como imagen o como video, sin importar de qué fuente venga.
- Evidence: createExportRenderer en app-composition.tsx, onPanelAction exportPng/exportVideo; la rama de imagen de export-renderer.ts rellena su propio anillo con el pasado inventado a resolución de export.

### Performance

- Decision: Pendiente definir workload (renderizado de clip, 8 slots de efectos, playback).
- Reason: Depende del renderer WebGL2 y la cantidad de efectos activos.
- Evidence: Sin escenarios de performance definidos en app-performance.ts.

## Evidence

- Source reviewed: timeshift-studio vanilla v1 (legacy/vanilla-v1/), neutral starter schema, local Toolcraft docs.
- Contract applied: product baseline with video renderer, timeline, layers, effect chain, export.

## Verification

Protected receipts own changed files, the derived plan, commands, selectors, reports, measurements, and pass/fail evidence. Decision Trail iterations record only one bare `npm run verify:delivery` narrative.

## Known Issues

- **Timeline layout**: El runtime posiciona la timeline arriba; Timeshift la necesita abajo (estilo After Effects / Jitter.com). Pendiente de implementar layout override.
- **Fuente de imagen**: los controles de «Reproducción del clip» siguen visibles con una foto cargada; no aplican hasta que la fuente es un video.
- **Contrato de performance**: `app-performance.ts` sigue declarando el starter neutro. El producto tiene renderer propio y debe declarar el plan completo; ver Iteration 4 para la contradicción pendiente.
- **Export de video sin audio**: el codificador del runtime no muxea audio, así que el export de video sale mudo.
- **Bug 1 (video no carga)**: El engine WebGL2 no renderiza frames de mp4 (H.264). Funciona con .webm. El binding del asset funciona correctamente. Pendiente verificar con video real del usuario.
- **Push a main**: Se resolvió el auth de GitHub (device flow) para push. Ahora funciona con gh auth keyring.

## Risks

- Risk: El runtime no expone un modo fácil para cambiar posición de la timeline (abajo). Puede requerir editar layout firmado del framework o encontrar una vía alternativa.
- Risk: El engine WebGL2 puede no soportar todos los codecs de video que el usuario suba. Requiere transcodificación o fallback.
- Risk: El esquema estático de 2480 controles puede ser lento de renderizar. Puede necesitar virtualización.
- Risk: 4 LFOs por slot puede ser insuficiente para efectos complejos.
