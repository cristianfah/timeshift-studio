# Toolcraft App Template Assembly Guide

<!-- toolcraft-performance-lifecycle: first-delivery=functional; later-delivery=functional-targeted; complaint=one-authority-targeted-performance-iteration; full-audit=explicit-only -->

This is a standalone Toolcraft template app generated from the base starter.

## Required Preflight

Treat this `AGENTS.md` as the active project contract. Before planning or editing app code, runtime code, controls, canvas, panels, renderer, timeline, layers, export, or tests:

1. Read `docs/toolcraft/workflow.md` in full.
2. Select every task route that matches the requested surface.
3. Read the selected routes' Plan phase before writing the spec or implementation plan.
4. Read their Implementation phase immediately before editing code.
5. Read their Verification phase before writing or running proof.

Process matching routes sequentially within the current phase and skip repeated documents already read in that phase. Open exactly one listed document per terminal or tool read, including documents from the same route and phase. Do not concatenate multiple documents, routes, or phases into one large output, and never continue from truncated output. Choose and record one verification tier for the coherent user-visible delivery batch before implementation. Do not edit implementation files until the Plan and Implementation preflight is complete.

## Quick Entry Contract

1. Build through `defineToolcraft` and `ToolcraftApp`.
2. Keep app state in Toolcraft runtime schema and commands.
3. Keep product output in `canvasContent`; never render app UI there. The signed host owns `ToolcraftApp`, bootstrap, routes, global runtime styles, and the finite/infinite product scene surface; product code supplies only `ToolcraftAppComposition`. Infinite custom raster/WebGL output declares `sceneBoundsProvider` and consumes `useToolcraftProductSceneFrame` instead of dormant finite `canvas.size`. A preview-only environment that must fill the complete Infinity viewport uses `infiniteCanvasContent`; it remains pointer-transparent and outside world transforms, scene bounds, and export. Model upload preserves supported authored appearance from standalone files, folders, and bounded ZIP packages; declare typed `modelPresentation`, using runtime presentation by default and checked consumers for custom presentation. `renderDefaultCanvasMedia={false}` never hides runtime model layers. If upload/import is part of the source-material flow, do not invent canvas placeholder artwork, CTA copy, helper text, fake sample output, or preset source designs before real content exists.
4. Use built-in Toolcraft controls before custom controls. Use `sourceCollection` when a source/runtime workflow owns array cardinality and users edit existing built-in item values; use `collectionActions` when users own add/remove cardinality. Before controls or canvas interactions, declare typed `interactionOwnership`: user request, inspected reference, or product usability selects one primary surface for each operation; complementary operations may share related state, but canvas and panel must not mirror the same operation. Every product also declares typed `viewInteraction` before renderer code; a visible editable spatial scene defaults to `orbit` and uses schema `orientationGizmo` plus runtime model-orbit interaction. Fixed or timeline-owned cameras require an explicit user request or inspected-reference evidence.
5. Do not hand-compose runtime surfaces or render built-in control components directly in app code; use `ToolcraftApp`, schema controls, `canvasContent`, `controlRenderers`, `onPanelAction`, and runtime commands. Product code never imports modules below `src/toolcraft/ui/components/controls/**` or substitutes native `color`, `range`, `file`, `checkbox`, `radio`, `select`, or `textarea` value models for schema controls. Product artifact surfaces must correspond exactly to required `productReadiness.exportIntent`; use `docs/toolcraft/core/setup-export.md` for the canonical export decision sequence.
6. Before writing controls, export `appControlSectionInventory`. Every product section declares stable `entityId`, human-readable `entity`, exact targets, and `groupingReason`. Every product control explicitly declares `applicability` as `always` or `conditional`; inactive branches are absent, and every visible finite sibling branch must prove the control's accepted product outcome. Keep one entity in one section through ten controls; sections with eight to ten controls declare `semanticGroup` on every control. Entities above ten controls split into balanced two-to-ten-control workflow stages that keep the same entity identity and declare unique `workflowStage` plus `splitReason`. Group by product meaning, never by UI component type or target namespace.
7. Keep control `label` short but semantically sufficient with the nearest visible section/group context, and put product-specific behavior help in schema `description`; runtime renders the label help tooltip only when that description adds meaning beyond the label.
8. Enable layers and timeline only when product behavior requires them, then test the real UI. Product animation loops are seamless forward-only by default: first and last frames stitch, direction does not reverse, and mirror/yoyo/ping-pong behavior requires explicit user intent.
9. Animated preview renderers suspend or coalesce non-essential animation work during canvas drag, pan, pinch, zoom, and radar/center interactions, then resume without changing user playback state.
10. If a Figma URL is provided, inspect the Figma file through MCP and rebuild from its structure; never implement from a screenshot or by eye.
11. If a video, GIF, screen recording, contact sheet, or extracted-frame sequence is provided as a reference, write a Video Reference Study before implementation: storyboard frames, frame-to-frame transition analysis, behavior decomposition, and acceptance mapping. Do not implement video references from a single screenshot or high-level summary.
12. Runtime workspace persistence is enabled locally by default: values, canvas, and panels are the base plan, while enabled timeline, layers, and media add their slices. `{ storage: "none" }` is the only opt-out and requires a recorded reason. Test exact resolved slices through a real reload; product code never writes localStorage or IndexedDB directly.
13. Generated apps follow the mandatory runtime Setup, Infinity canvas/finite canvas sizing, render scale, Timeline switch, Background, Image Export, Video Export, and sticky action rules in `docs/toolcraft/core/setup-export.md`. Do not duplicate or reinterpret those controls in app-authored sections.
14. Media uploads, image/file mode, source images, multi-upload sorting, default assets, and image transform actions follow `docs/toolcraft/core/media-upload.md`.
15. Keep `docs/toolcraft/agent-worklog.md` current with a decision trail, product decisions, explicit reference inputs, evidence, verification, and risks. Reference-runtime-clone apps also declare `referenceStudy` plus `referenceFeatureInventory` so every inspected reference feature has feature-level behavior evidence and maps to Toolcraft implementation and acceptance coverage.
16. Prove every visible entity through acceptance, browser, and performance coverage. Browser acceptance and performance pass only when protected helpers emit matching runtime evidence after successful assertions; source-code spelling and acceptance prose are not outcome authority. Control applicability derives case-scoped presence/absence and product-outcome evidence from semantic section peers; background output keeps its fixed typed recipe. Raster products with `canvas.renderScale` declare `renderScaleCoverage` for interaction and steady state, plus playback when timeline is enabled, and prove real backing pixels with `canvas-render-scale-backing`; clamping quality is a functional failure without measured performance. Every measured path in a render-scale-enabled raster product proves actual CSS × devicePixelRatio × 2 backing after each measured phase. Generic acceptance outcomes prove command side effects only; use the fixed media, persistence, viewport, compound-control, layer, and timeline semantic recipes for specialized evidence.
17. Performance planning follows one sequence: reachable controls and inputs; workload dimensions and enforced boundaries; pass cost, frequency, lifecycle, and invalidation; render-plan assessment and protected kernel benchmark when required; derived paths and combined fixtures; targeted functional/browser development checks; lifecycle-appropriate delivery proof. Keep `src/app/app-verification-impact.json` complete so later functional changes derive exact verification scope. Only exact request authority may create a measured targeted performance iteration. Details live in `docs/toolcraft/core/performance.md` and `docs/toolcraft/performance.md`.
18. Custom renderer apps compile one canonical `rendererPipelineRegistration`, supply it through `ToolcraftAppComposition`, reuse that registration as `rendererPipeline` in performance assessment, and derive paths and fixtures from it. The neutral starter has no registration, runtime provider, or fixture adapters.
19. Classify each coherent user-visible delivery batch with a verification tier before editing. Steering and fixes inside the same request stay in that batch. Use targeted checks for development feedback, then run the protected delivery gate once when the batch is ready.

## Starter Baseline

The generated folder starts as a neutral Toolcraft shell: canvas upload plus toolbar. It intentionally does not include demo controls, prompt fields, layers, or timeline. Do not treat test fixtures or documentation examples as product requirements. Add controls, timeline, layers, sticky actions, and custom renderers only after the requested product or reference app requires them; base workspace persistence already exists.

When the folder becomes a real product, update `src/app/app-acceptance-data.ts` from `appProductReadiness.mode: "starter"` to `mode: "product"` and fill `productName`, `productSummary`, `requestedBehavior`, required typed `exportIntent`, typed `interactionOwnership`, and typed `viewInteraction`. Compare canvas and panel for each operation that could plausibly live on either surface. A visible editable 3D scene uses `orbit`; `fixed-camera` and `timeline-camera` require explicit request/reference evidence. Renamed product folders are not allowed to keep neutral starter readiness.

## License

This project includes Toolcraft source code available under the MIT License in `LICENSE.md`. `NOTICE.md` explains that generated apps include Toolcraft runtime, starter, UI component, documentation, and template source code.

## Local Reference Docs

Use this `AGENTS.md` as the entry contract. Use local docs for detail; the app must remain buildable without the website.

- `docs/toolcraft/workflow.md` — required preflight, task routing, worklog gate, and verification routing.
- `docs/toolcraft/core/runtime-boundary.md`, `docs/toolcraft/core/setup-export.md`, `docs/toolcraft/core/control-selection.md`, `docs/toolcraft/core/layout.md`, `docs/toolcraft/core/media-upload.md`, `docs/toolcraft/core/timeline-animation.md`, `docs/toolcraft/core/performance.md`, `docs/toolcraft/core/reference-study.md` — focused core modules routed by `workflow.md`.
- `docs/toolcraft/assembly-workflow.md` — runtime assembly, canvas output, and reference clone path.
- `docs/toolcraft/decision-contract.md` — rule ids, levels, and enforcement expectations.
- `docs/toolcraft/schema-reference.md` — schema authoring rules for `src/app/app-schema.ts`.
- `docs/toolcraft/component-rules.md` — slider, segmented, color, upload, image picker, vector, orientation gizmo, layers, timeline, and footer action rules.
- `docs/toolcraft/acceptance-testing.md` — app entity matrix and browser acceptance for `src/app/app-acceptance-data.ts`.
- `docs/toolcraft/performance.md` — performance roles, scenarios, and workload coverage for `src/app/app-performance.ts`.
- `docs/toolcraft/renderer-technique.md` — DOM, SVG, Canvas 2D, WebGL, and mixed renderer choices.
- `docs/toolcraft/agent-worklog.md` — implementation decision trail, evidence, verification, and remaining risks.
- `docs/toolcraft/custom-controls.md` — custom control registration through `controlRenderers`.

## Edit Surface

- Build the product through `src/app/app-composition.tsx`, `src/app/app-schema.ts`, and any focused product-owned modules imported by that composition. Product module location under `src` is unrestricted; the AST boundary and code-health inventory scan every product production module regardless of folder.
- Do not edit the signed framework bootstrap: `index.html`, `src/main.tsx`, `src/router.tsx`, `src/routes/index.tsx`, `src/routes/root.tsx`, or `src/styles.css`. The protected route owns the `ToolcraftApp` host and its `className`.
- Product styles use locally imported `*.module.css` files only. Every selector is anchored by a local class. A first-compound `:is()` or `:where()` is a valid local anchor only when every branch is locally anchored; `:not()` and `:has()` do not create an anchor. Do not add plain product CSS, CSS `@import`, package CSS imports, `:global`, bare/root selectors, sibling escapes, selectors that target Toolcraft host attributes, or global `<style>`/`CSSStyleSheet` injection.
- Product `import()` and `require()` specifiers are statically resolvable. Computed module loading is rejected in production and product tests. Production modules do not import product tests, test-support modules, or protected browser-evidence internals, directly or through product bridges; use the protected public acceptance/performance helpers instead of emitting reserved evidence.
- Product production modules form an acyclic dependency graph. Code health resolves relative imports, directory indexes, configured TypeScript aliases, and local package exports; type-only, external-package, test, and copied-framework edges are excluded. A failure reports the complete shortest cycle so ownership can be repaired instead of hidden behind a barrel or alias.
- Root Vite, Vitest, Playwright, and TypeScript verification configuration is signed platform code. Do not add alternate config files whose names resolve to those protected config families.
- Keep `src/app/app-acceptance-data.ts` aligned with every visible product entity.
- Do not edit `src/app/app-acceptance.ts`, `src/app/acceptance`, supplied `app-acceptance.*` meta-tests, or the generic browser acceptance harness. They are framework-owned files covered by the signed integrity manifest; add product-specific Vitest and Playwright tests in separate app-owned files.
- Keep `src/app/app-performance.ts` as app-specific performance matrix config only.
- Keep `src/app/app-verification-impact.json` aligned with every product production module, nearest acceptance coverage, and renderer pass. Classify presentation, functional, and performance ownership there; do not infer verification scope from filenames during a later iteration.
- Use `e2e/app-kernel-benchmarks.ts` only for executable candidates required by `assessToolcraftRenderPlan`, then run protected `pnpm verify:kernel`. Do not put authored timing evidence in product files.
- Do not paste, restore, or duplicate runtime validators inside `src/app/app-performance.ts`.
- Do not edit the generated contract files under `docs/toolcraft` or the generated `LICENSE.md` and `NOTICE.md`; they are framework-owned and covered by the signed integrity manifest. `docs/toolcraft/agent-worklog.md` is the explicit editable exception for product decisions and verification evidence.
- Do not edit `src/toolcraft`. It is an immutable signed copy of the shared Toolcraft runtime; change the monorepo runtime and regenerate the app instead.
- Before delivery, replace the starter worklog with `Mode: product`, add one `Decision Trail` entry per coherent user-visible delivery batch, and record concrete decisions for renderer, timeline, layers, controls, export, and performance. Each entry keeps human intent: request, user-visible result, source/reference checked, contract rules applied, rejected alternatives, state/output mapping, known risks, and domain-shaped performance authority when applicable. Protected receipts own changed files, the plan, executed checks, reports, measurements, and pass/fail evidence. `npm run test` fails if the worklog is missing, lacks the decision trail, or still describes the neutral starter.
- `npm run test` includes Toolcraft source integrity and local docs checks. If a desired control style is missing, fix the schema or regenerate from the upstream template/runtime; do not patch copied `src/toolcraft` files for one app.

## Decision Contract Rule IDs

These ids mirror `TOOLCRAFT_DECISION_CONTRACT` in `@/toolcraft/runtime`. Keep this list synced so standalone instructions do not drift from runtime validators.

[//]: # (toolcraft-contract:decision-rule-list:start)
- `runtime-shell-required`
- `canvas-no-app-ui`
- `canvas-surface-preserved`
- `infinity-canvas-scene-bounds`
- `canvas-handle-placement`
- `interaction-surface-ownership`
- `panel-host-behavior`
- `layers-enable-only-when-needed`
- `layers-enabled-behavior`
- `timeline-mode-choice`
- `timeline-enabled-behavior`
- `controls-product-coverage`
- `output-export-required`
- `controls-section-inventory-required`
- `controls-component-layout-invariants`
- `controls-layout-heuristics`
- `renderer-technique-inventory`
- `renderer-view-interaction`
- `model-appearance-presentation`
- `reference-clone-source-of-truth`
- `video-reference-analysis`
- `acceptance-product-observable`
- `performance-coverage-levels`
- `persistence-policy-explicit`
- `workflow-required`
[//]: # (toolcraft-contract:decision-rule-list:end)

## Runtime Contract

- Use `defineToolcraft` from `@/toolcraft/runtime`.
- Export an `appComposition` satisfying `ToolcraftAppComposition` from `src/app/app-composition.tsx`.
- Keep product composition limited to `schema`, `canvasContent`, `infiniteCanvasContent`, `controlRenderers`, `exportRenderer`, `sceneBoundsProvider`, `modelPresentation`, `onPanelAction`, `renderDefaultCanvasMedia`, and optional `rendererPipelineRegistration`; host `className` and `style` are not product extension points.
- Infinite product output fills the runtime-owned scene surface derived from `sceneBoundsProvider`. Raster/WebGL renderers call `useToolcraftProductSceneFrame` for backing size and coordinate translation; they never position a second bounds wrapper or use dormant finite `canvas.size` while infinite.
- Custom renderers use one compiled `rendererPipelineRegistration` as the canonical declaration for runtime execution and new-envelope performance assessment. Product code receives only the disposal-free pipeline client through hooks and panel action context.
- Do not import `ToolcraftApp`, low-level runtime surfaces, built-in controls, or modules below `src/toolcraft/ui/components/controls/**` into product modules. Do not recreate schema control value models with native form elements. The signed host renders the shell; product modules use schema controls and supported composition fields.
- Use `renderDefaultCanvasMedia={false}` when a custom renderer replaces generic image/file preview. This flag does not suppress runtime model layers; use typed `modelPresentation` custom mode with checked consumers for declared model targets.
- Use `ToolcraftApp onPanelAction` for non-export sticky footer product actions such as Generate, Apply, Copy, or Download. Typed `export-image` and `export-video` actions are executed by the runtime from the shared `ToolcraftAppComposition.exportRenderer`.
- Product export renderers draw one deterministic scene-coordinate frame and return/await their real work. Product modules never allocate export canvases, choose encoders, encode blobs, create download URLs, or duplicate image/video composition.
- Keep final app behavior in the schema and runtime command bus, not in isolated local control state.
- For animated products, write an Animation Intent Inventory before coding: use top playback timeline for product transport, keyframes timeline for editable property animation, and no timeline only for explicitly autonomous decorative output with no video export. Any app with `Export Video` must enable the top Toolcraft timeline.
- For keyframes timeline apps, renderers read keyframed settings through Toolcraft evaluated-value helpers/hooks. Do not parse timeline `valueLabel` strings or read raw `state.values` for keyframed targets.
- Use schema `defaultValue` for every resettable control.
- Route editor-owned actions through runtime commands such as `controls.reset`, `media.import`, `media.delete`, `canvas.center`, `history.undo`, and `history.redo`.

## AI Workflow Skills And Local Fallback

The signed local `AGENTS.md` and `docs/toolcraft/*` files are the mandatory workflow authority. Use the named workflow skills when the environment provides them; they improve execution but are not a prerequisite for a standalone generated app to remain buildable and verifiable.

- Before writing or changing an app spec, use `brainstorming` to decide product behavior, canvas sizing mode, panels, media flow, controls, export/copy behavior, renderer technique, timeline/layer choice, and ambiguous requirements.
- Before editing code from an approved spec, use `writing-plans` to produce a deterministic implementation plan focused on app files, tests, build, and browser verification.
- Before fixing any broken control, failed test, build failure, visual mismatch, export issue, or runtime regression, use `systematic-debugging` to find the root cause first.
- When the prompt includes a Figma URL, use Figma MCP/design context before implementation. Read the actual node, layer, component, variable, and asset structure; screenshots are only for final visual QA, not the source of truth.
- After implementation, use the `browser` workflow or equivalent local browser verification to test the running app, not only typecheck/build output. The default browser gate is `pnpm test:browser`; it excludes every Playwright test whose name contains `browser perf:`. Protected delivery owns exact targeted performance iterations. The complete matrix is reserved for the operator/CI `npm run verify:perf` command.
- Run `pnpm ai:check` before app generation or major changes. It enforces local code health and the product AST boundary. With an explicit `--no-install` generation the AST pass reports that it is deferred; normal `npm run test` and every final gate require installed dependencies and run the full boundary.
- If a workflow skill is missing and installation is available, install it and refresh the session. If installation is unavailable or the app was generated with `--no-skills`, continue through the equivalent signed local workflow instead of stopping or weakening verification.
- Do not silently ignore a missing workflow capability: follow the matching local requirement in this file and `docs/toolcraft/workflow.md`, and record the fallback in the implementation plan or worklog.
- The Toolcraft app contract overrides generic brainstorming approval and visual-companion rituals. If the user asks to build or port an app, that request is approval to produce the spec, plan, implementation, tests, build, and local run unless a product-critical ambiguity remains.
- Do not ask the user to confirm decisions already covered by this contract, the prompt, or the reference app. Record the decision in the spec and continue.
- Do not ask whether to enable a browser companion during brainstorming. Browser verification is mandatory after the app runs locally.
- In standalone folders that are not git repositories, save spec/plan files without asking about commit requirements.

## Verification Tier Classifier

Before editing, write one short verification note for the coherent delivery batch:

```md
Verification tier: Tier N
Reason: <changed surface and expected blast radius>
Run: <commands and browser checks>
Skip: <checks not needed for this pass and why>
```

Choose the tier by blast radius, not by line count. If uncertain, move one tier higher, not automatically to the full final gate.

| Tier                                          | Use When                                                                                                                                                                                                                                                                                       | Required Checks                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier 0 — docs/copy                            | Documentation, comments, copy, labels, or titles change without schema targets, values, runtime behavior, renderer output, or layout mechanics.                                                                                                                                                | Targeted docs/typecheck or targeted app test. Browser is not required unless visual text fitting is the risk.                                                                                                                                                                                                                                                          |
| Tier 1 — local control presentation           | One control or panel visual state changes: spacing, hover, focus, disabled, marker visibility, label fit, or component variant display. Runtime state shape and product renderer are unchanged.                                                                                                | Targeted unit/component test plus one focused browser check for the affected control or panel.                                                                                                                                                                                                                                                                         |
| Tier 2 — schema/product behavior              | Controls, sections, defaults, persistence, panel actions, export actions, acceptance rows, or product behavior mapping changes.                                                                                                                                                                | During development run relevant targeted tests and browser acceptance. At delivery, bare `npm run verify:delivery` derives the required proof.                                                                                                                                                                                                                             |
| Tier 3 — renderer/canvas/runtime feature      | Custom renderer, animation loop, canvas sizing, upload/media, timeline, layers, toolbar, export bytes, WebGL/Canvas/SVG output, zoom, radar, history, heavy control behavior changes, or a post-generation iteration that touches renderer workload or viewport stability.                     | During development run targeted functional and browser acceptance checks. The tier and changed surface do not authorize measured performance. At delivery, `verify:delivery` runs ownership-derived functional proof unless exact request authority creates one performance iteration.                                                                                                                                                                                                 |
| Tier 4 — final delivery/template architecture | Fresh generated app completion, folder export, commit-ready delivery, dependency changes, runtime/template/contract/CLI changes, broad refactors, or major post-generation iterations that rewrite renderer, canvas, animation, timeline/keyframes, layers, media, export, or control mapping. | Fresh folders run `npm install` once. Run `npm run verify:delivery` once when the coherent batch is ready, then start `npm run dev`. Its protected lifecycle selects functional proof or an exact targeted performance iteration from the request and prior receipt state.                                                                                                                     |

Do not rerun `npm install` after every edit. Run it after fresh export, dependency changes, lockfile changes, or a missing package error.

Do not run the full browser performance suite for Tier 0-2 edits.

The automatic lifecycle is sequential. First product delivery uses bare `npm run verify:delivery` for complete product contracts, one production build, full functional acceptance, and zero measured performance. Later delivery is functional-targeted: it compares the immediately previous and current semantic functional proof models and derives exact direct-owner, domain, and affected-unit-graph proof. Classifier output establishes complaint authority only, never path localization. For a localized performance complaint, select affected canonical paths and run one targeted iteration without clarification. When localization remains unresolved, regardless of whether classification is high-confidence `performance-iteration` or `needs-agent-judgment`, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; unresolved localization creates neither performance-iteration intent nor canonical path authority, and internal path IDs are never user choices. A broad or unlocalizable problem may justify recommending the complete review in that single choice, but the user still chooses; an explicit complete-review request runs `npm run verify:perf` directly. The canonical selection and evidence rules live in `docs/toolcraft/workflow.md`, `docs/toolcraft/acceptance-testing.md`, and `docs/toolcraft/performance.md`; do not duplicate their algorithm here.

Feature loops after the first working version run only the smallest focused functional and browser checks while implementation is changing, then one bare `verify:delivery` at the coherent boundary. Do not rerun aggregate, export, or performance matrices after every edit. An unchanged `sourceHash` uses the protected fast path and does not recollect semantic proof inputs.

The app is not complete until bare `npm run verify:delivery` produces the lifecycle-appropriate protected receipt. An initial functional receipt proves complete functional acceptance without measured performance; later functional receipts prove exact ownership-derived checks. Agent-controlled browser checks remain useful for targeted diagnosis and visual verification, but terminal prose cannot mint or upgrade a receipt. The impact inventory derives the required checks and affected passes from the immediately previous successful delivery. Tier is human diagnostic vocabulary only and never grants execution authority.

## Required Checks

For a coherent delivery batch, run:

```bash
npm run verify:delivery
npm run dev
```

The protected runner selects first-delivery functional proof, later `functional-targeted` ownership-derived proof, or one localized-or-clarified targeted performance iteration from protected state. Classifier output alone never supplies path localization; unresolved localization creates neither performance-iteration intent nor canonical path authority regardless of classifier result. `npm run verify:perf` is the separate operator/CI full-audit command; run it only after an explicit user request or accepted agent offer, never as an inferred continuation of a complaint.

Use `npm install` before this final gate when the folder is fresh or dependencies changed.

`verify:delivery` runs the protected integrity checker directly and does not depend only on a mutable package script. `npm run test` includes local docs and app tests. The internal `pnpm test:browser` gate runs against the real app UI and product output but excludes Playwright tests whose names contain `browser perf:`. The protected full-audit path builds and serves the current production bundle, then runs the complete browser performance matrix sequentially so budgets exclude dev-server transformation and unrelated parallel e2e noise.

Do not stop or kill existing local servers to free a port during a first start. `npm run dev`, `pnpm preview`, and browser verification prefer port `3002`, but automatically move to the next free port only while assigning this app's first saved port. After a saved port exists, normal `npm run dev` / `pnpm preview` uses that same port; if that port is already serving this app, report that existing URL instead of starting a duplicate. Use `TOOLCRAFT_PORT`, `TOOLCRAFT_DEV_PORT`, or `TOOLCRAFT_TEST_PORT` only to change the preferred starting port before a saved port exists. A dev/preview launch is successful only after the selected port serves this app's Toolcraft server identity endpoint plus the `toolcraft-app-title` marker from `index.html`; never report a URL just because some server is listening there. When deliberately restarting this app server, use `pnpm dev:restart` or `pnpm preview:restart`; restart mode reuses the previously saved app port, stops the listener on that exact port if it is still running, force-stops it if it does not release the port, starts on the same port again, and verifies the identity before saving/reporting the port.

## App Completion Bar

The app is complete only when:

- the Toolcraft runtime shell is present;
- `canvasContent` contains product output only;
- the runtime canvas backing remains visible behind product output;
- infinite product output uses the runtime-owned product scene surface, exact provider bounds, and real edge-pixel proof without clipping to dormant finite `canvas.size`;
- every product control declares explicit applicability, every non-matching finite branch hides it, and every visible finite branch proves product output or the accepted command side effect;
- reset returns schema controls to `defaultValue`;
- sticky footer export actions operate on final product output at `state.canvas.size`;
- artifact actions and settings correspond exactly to `productReadiness.exportIntent`; image export is the product default, video requires explicit user-request evidence, and image removal requires explicit user-removal evidence;
- PNG export uses the background controls normalized into runtime Setup: `Background` beside `Infinity canvas`, then `Background color`; live preview hides product background when Background is off, and video keeps background;
- every PNG export includes `Image Export` format/resolution `select` controls; runtime resolves the selected settings and exact output size;
- products with both PNG and video export place `Image Export` immediately before `Video Export`;
- one shared `exportRenderer` draws product pixels for both image and video; runtime owns selected settings, scene crop, background, runtime media/model compositing, canvas allocation, encoding, download, progress, and typed errors;
- layers are absent for single-layer apps and fully working when enabled;
- timeline is absent, playback, keyframes, or custom reference timeline according to product behavior;
- performance checks cover workload and responsiveness for all relevant controls;
- detail-heavy or animated custom renderers pass real viewport drag and zoom stress checks;
- workload browser perf tests execute the compiled development or maximum fixture for the canonical derived path, apply every adapter value through the real UI, and observe every dimension before measurement;
- bounded numeric workload ranges and hard limits are derived from schema; scenario values cannot redefine them, custom metrics cannot bypass them, many-item fixtures apply at least 10 real items, and degraded ceilings prove every exact 10 percent step with matching scenario/target identity;
- browser tests verify upload/clear, controls, canvas sizing, toolbar, timeline/layers when enabled, sticky actions, output dimensions, and viewport stability.
