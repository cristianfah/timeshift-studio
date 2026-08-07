# Toolcraft Workflow

<!-- toolcraft-performance-lifecycle: first-delivery=functional; later-delivery=functional-targeted; complaint=one-authority-targeted-performance-iteration; full-audit=explicit-only -->
<!-- toolcraft-performance-iteration: authority=exact-request-evidence+canonical-path-ids; fixture=reachable-development; after-pass=return-app-to-user+stop -->
<!-- toolcraft-performance-full-authority: automatic=forbidden; recommendation=two-compatible-iterations-or-broad-unlocalizable-problem; command=pnpm verify:perf; authority=explicit-user-request-or-accepted-offer -->
<!-- toolcraft-performance-routing: localized=agent-targeted; ambiguous=one-user-facing-choice; broad=offer-targeted-or-full; full=explicit-only -->

This file is the app-local routing layer for Toolcraft work. It does not replace the detailed contracts; it tells an agent which contract to read and which verification path to use before editing.

## Required Preflight

Before planning or editing app code, runtime code, controls, canvas, panels, renderer, timeline, layers, export, or tests:

1. Confirm the nearest `AGENTS.md` is the active project contract.
2. Classify the project type:
   - **Generated app**: use local `docs/toolcraft/*`.
   - **Starter source**: use `starter/AGENTS.md`, local starter docs, and runtime contracts.
   - **Runtime/template source**: use root `AGENTS.md` and runtime contracts.
3. Classify the task type.
4. Read the task-specific docs below.
5. Record the coherent user-visible delivery batch and its focused development checks before implementation.

Do not edit implementation files until this preflight is complete.

Renderer and performance work also completes this pre-code sequence: reachable controls and inputs; workload dimensions and enforced boundaries; pass cost, frequency, lifecycle, and invalidation; render-plan assessment and protected kernel benchmark when required; derived paths and combined fixtures. Keep `src/app/app-verification-impact.json` current while implementing. Development uses impact-derived functional and browser checks without minting delivery evidence. First and later functional delivery run no measured performance; only exact request authority creates one targeted iteration. Full certification is a separate operator/CI action described in the canonical performance docs.

## Local Contract Authority

The signed local `AGENTS.md` plus `docs/toolcraft/*` are sufficient and mandatory workflow input for a standalone generated app. External workflow skills should be used when available, but missing skills never invalidate `--no-skills` generation and never justify skipping the equivalent local spec, plan, debugging, browser, or verification requirement. `pnpm ai:check` enforces local code health and the product AST boundary only; it neither discovers nor validates workflow skill installations.

Core modules are required reading when listed by the routing table. Read each listed module fully, one phase at a time. Open exactly one listed document per terminal or tool read, even when several documents belong to the same route and phase. Do not concatenate documents or rely on a truncated excerpt; finish the current phase, then open the next phase when the work reaches it. The signed host and runtime validators enforce platform boundaries, while product organization remains open inside those boundaries.

## Task Routing

Use the smallest route set that covers the changed surface. When a task matches multiple routes, process them sequentially inside the phase currently in progress and skip documents already read in that phase; open each document separately and never concatenate route documents into one terminal output. Read Plan documents before the spec or implementation plan, Implementation documents immediately before code, and Verification documents immediately before writing or running proof. A broken behavior still starts with the failing test, log, or reproduction before its Plan documents; a Figma task still starts with Figma MCP/design context.

[//]: # (toolcraft-workflow-routes:start)
| Task route | Plan phase | Implementation phase | Verification phase |
| --- | --- | --- | --- |
| App assembly, route structure, generated app porting | `core/runtime-boundary.md`<br>`assembly-workflow.md` | `decision-contract.md` | `acceptance-testing.md` |
| Reference app study, audit, or port | `core/reference-study.md`<br>`core/runtime-boundary.md`<br>`assembly-workflow.md` | `schema-reference.md`<br>`decision-contract.md` | `acceptance-testing.md` |
| Schema, controls, defaults, persistence, actions | `core/control-selection.md`<br>`core/layout.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Custom controls | `core/control-selection.md`<br>`core/layout.md` | `custom-controls.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Renderer, canvas output, visual technique | `core/runtime-boundary.md`<br>`core/performance.md` | `renderer-technique.md`<br>`performance.md` | `acceptance-testing.md` |
| Timeline, keyframes, animation transport | `core/timeline-animation.md`<br>`core/performance.md` | `decision-contract.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Layers | `core/runtime-boundary.md`<br>`core/layout.md` | `decision-contract.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Export, copy, media, background | `core/setup-export.md`<br>`core/media-upload.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md`<br>`performance.md` |
| Broken control, visual mismatch, failed build, export bug, performance issue | `decision-contract.md`<br>`core/runtime-boundary.md` | `component-rules.md`<br>`renderer-technique.md` | `acceptance-testing.md`<br>`performance.md` |
| Figma implementation | `core/reference-study.md`<br>`core/runtime-boundary.md`<br>`assembly-workflow.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md` |
[//]: # (toolcraft-workflow-routes:end)

## Worklog Gate

For product app work, update `docs/toolcraft/agent-worklog.md` before reporting completion. Record:

- one `Decision Trail` entry for each coherent user-visible delivery batch, including:
  - request;
  - task type;
  - user-visible result;
  - source/reference checked;
  - docs/contracts read and contract rules applied;
  - typed view interaction mode, evidence, and orientation target mapping when the product has a spatial scene;
  - typed interaction ownership for operations that could live on canvas or in the panel, including evidence, selected surface, rejected duplicate surface, and complementary operations;
  - decision;
  - alternatives rejected;
  - state/output mapping from controls, commands, timeline, layers, media, or renderer to the visible product;
  - one bare-delivery verification narrative;
  - risks or follow-ups.
- for localized performance work, or a post-clarification targeted choice, an exact request quote and the canonical affected performance path IDs; classifier output establishes complaint authority only, and unresolved localization records neither performance-iteration intent nor canonical path authority regardless of classifier result.
- updated high-level decisions for renderer, view interaction, interaction ownership, timeline, layers, controls, export, and performance when those choices change.

If the folder is still the neutral starter, do not invent product decisions. Once it becomes a product, switch the worklog to product mode and keep it concrete.

Protected receipts, not the worklog, own changed files, the derived plan, executed checks, reports, measurements, and pass/fail evidence. Each Decision Trail entry mentions only that one bare `npm run verify:delivery` will derive and run the protected proof.

## Runtime Boundary

Use the runtime extension points described in the current contracts:

- schema controls;
- `canvasContent` for product output only;
- `controlRenderers` only for true custom controls;
- `onPanelAction` for sticky product actions;
- runtime commands and hooks.

Do not recreate controls, panels, toolbar, timeline, layers, canvas shell, or runtime surfaces by hand. If a shared behavior is wrong, fix the shared runtime/template source and regenerate when needed.

Browser verification is outcome-based. Protected helpers attach versioned evidence only after a persistent observable change, an observed fixture application, a decoded non-empty export inspection, a completed output action, an immutable scenario measurement, and its matching budget check. The signed reporter derives required evidence from acceptance and performance config and fails skipped, missing, duplicate, transient, unmeasured, or unbudgeted scenarios.

## Automatic Delivery Lifecycle

The normal product loop is:

```text
assemble/change
→ focused functional feedback
→ one coherent delivery boundary
→ protected functional delivery
→ user evaluation
```

Use the smallest focused unit and browser checks while implementation is changing. Do not rerun the aggregate, export, or performance matrix after every edit. At the coherent delivery boundary, run one bare `npm run verify:delivery` and use the automatic sequence:

1. **First product delivery:** bare `npm run verify:delivery` proves complete product contracts, performs one production build, runs full functional acceptance, and runs no measured performance.
2. **Later functional-targeted delivery:** bare `npm run verify:delivery` compares the immediate previous and current semantic functional proof models. It selects exact changed acceptance contracts, their direct owners and domains, and tests reached through the affected product-unit dependency graph.
3. **Localized or clarified targeted work:** only a localized complaint or a post-clarification targeted choice records domain authority in the worklog—an exact request quote plus canonical affected path IDs—and runs one bare `npm run verify:delivery`. It executes one targeted iteration against the reachable development fixture, returns the verified app, and waits for user evaluation. Classifier output alone never localizes a path; unresolved localization creates neither performance-iteration intent nor canonical path authority, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`.
4. **Full audit:** only an explicit operator request or accepted offer authorizes `npm run verify:perf`. It performs one fresh build and the complete maximum-fixture performance matrix without advancing the delivery anchor.

Performance authority and localization are separate decisions. Classifier output establishes complaint authority only and never path localization. A localized complaint lets the agent select the affected canonical paths and run one targeted iteration without asking the user. For an ambiguous complaint, ask one user-facing question that names the visible operation and offers targeted diagnosis or a complete performance review; never ask the user to choose internal path IDs, and record no performance-iteration intent or canonical path authority before the answer. For a broad or honestly unlocalizable problem, the agent may recommend the complete performance review in that single targeted/full choice, but the user still chooses. A direct request for the complete performance review runs `npm run verify:perf` without another clarification.

Store agent-produced browser diagnostics under `.toolcraft/browser-artifacts/`. Browser integrations may instead use their external tool-owned storage; diagnostic files never belong in product source.

The unchanged `sourceHash` fast path does not collect the catalog, dependency graph, or functional proof model and does not execute proof. For a changed source, the current catalog, input roles, ownership inventory, and semantic model are collected once and remain the immutable basis for that delivery plan. `workflow-observation.md` is a post-delivery summary, not execution authority, so it stays outside this hash; `agent-worklog.md` remains included.

After two consecutive compatible targeted iterations, offer the slower full audit if the user remains unsatisfied. A complaint, filename, or touched subsystem never authorizes it. Canonical classification details, failure behavior, and evidence wording live in `core/performance.md` and `performance.md`.

The app is not complete when required checks are failed, incomplete, pending, blocked, or listed as skipped. Resolve benchmark requirements with the protected internal kernel check before accepting the renderer. The delivery runner executes integrity and lifecycle-specific proof atomically, binds evidence to current source, and advances the delivery anchor only after success. Product prose and command arguments cannot select or broaden that proof.
