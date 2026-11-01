# Registrar engine

`createRegistrar(ports)` owns serialized registration changes and on-demand injection. Its public API is `reconcile()`, `ensure(tabId, what)`, and `dispose()`. Creation schedules the background-start reconciliation. Owner changes, access changes, and `runtime.onStartup` schedule the same operation. There is no `onInstalled` dependency.

The sole desired-set planner is `src/shared/features/registration.ts`. The engine preserves its IDs, ordered files, match unions, worlds, run times, top-frame restriction, and session persistence. It removes only the four owned IDs. It never writes feature settings.

The authoring input is the frozen tree `ca26435f833d2aa7ea06317e9351708d4c6d4daa`. This unit has no runtime evidence. Its tests, fixture, compiler projects, and browser behavior remain unexecuted.

## Authority and serialization

`OwnerPort.ready()` must resolve `"ok"` before the engine acts. `OwnerPort.current()` supplies a detached snapshot of readiness, supported schema, effective consent, and current Settings. Its revision must increase whenever those facts change. Its subscription must notify relevant changes promptly, including revocation. The composition owner must derive these facts from the authoritative Store and consent lifecycle. A read-only placeholder is not a binding.

One Promise queue paces `reconcile` and `ensure` together. Reconcile requests coalesce while retaining their invalidation revision. A change arriving during an awaited call stops the old pass before another effect and drains a fresh pass. Mutation failures do not schedule retries. A later explicit request or authority event can start another pass, and each failed invocation remains a failure even if its effect appears in readback.

Every registration change needs a fresh browser observation. Every injection needs current authority, current tab eligibility, and per-document current-build inventory. A resolved API call alone cannot establish success. An in-flight native call cannot be cancelled by disposal or revocation. Disposal removes all owned subscriptions and prevents later port calls. Already invoked calls may finish.

## Injection

A newly selected file-backed feature triggers a scan of open matching tabs. A background start or startup event scans file-backed selections again. The engine injects only files the probe has not observed at the current build. Order is page, core, kit when required, and feature files in planner order. Each file completes and is observed before another begins. Each tab completes before another begins. Priority is the focused window's active tab, audible tabs, and descending `lastAccessed`, with tab ID as the tie breaker.

The engine skips discarded, frozen, closed, inaccessible, and unsupported tabs. It has no wake, activate, reload, or navigation port. The tab list is local to a pass. No second tab registry survives the call. Gather's file-free page entry changes registrations and never triggers injection into already open tabs.

`ensure(tabId, { core: true })` requests page and core. `{ core: true, kit: true }` also requests kit. `{ popovers: true }` requests only popovers and requires the current page, core, and kit already observed. A combined `{ core: true, kit: true, popovers: true }` can request the whole dependency chain. The public request keeps the specification's optional boolean fields. A kit request includes its page and core dependencies. A popovers request requires each prerequisite not included in that request to be observed already. An all-false request performs no injection. These requests never enable a feature. The future bundles own the promise that a one-off core and kit remain inert.

`ProbePort.inspect` must report a stable top-frame document identity and the actual build identity of every loaded file. An unavailable receiver proves no absence. `no-receiver` and `not-observed` refuse confirmation. Known closed, inaccessible, and unsupported tabs can be skipped during reconciliation. The scripted fake supplies explicit inventories. No successful native probe is supplied here.

## Failures

`RegistrarError.fact` distinguishes unexpected failures, refusals, failed ports, failed or unconfirmed registration calls, failed or unconfirmed injections, and unavailable probes. Registration failures carry a fresh observed list or an unavailable observation. Injection failures carry the requested file, call outcome, and observed inventory or an explicit unavailable result. Partial rejected calls never become optimistic successes.

The required `backgroundError` callback receives failures from automatic reconciliations. Explicit public calls reject. Background failure reporting cannot start a mutation retry.

## Adjoining assembly

The browser adapter is `src/background/adapters/registrar.ts`. A startup owner must supply its native browser, validated build, production registry, owner binding, authenticated current-build probe, and background error receiver. No entrypoint imports or starts this Registrar yet. The existing entrypoint import-path audit remains static evidence only.

Production registry values, page and core bundles, shared kit bundles, popovers and feature bundles, probe transport and validation, and startup composition remain separate work. The owner must also deliver settings and consent changes to existing cores so feature scopes dispose when disabled. This unit does not implement the full health registry, Backend, Tabs router, or entrypoint migration.

The native adapter targets `frameIds: [0]`, rejects empty execution results and a reported mismatching document ID, and relies on the required probe for subsequent inventory. This does not prove atomic document targeting across navigation in both browsers. Dynamic registration persistence, world ordering between separate registrations, `document_start` timing, old-build retirement, orphan disposal, inertness, owner revocation delivery, frozen-tab exclusion, and optional Chrome host-access UI remain provisional until native qualification. Nothing assumes ordering between registrations.

Native guarantees remain unproven. Privacy wording approval is pending. Production activation is held. This unit does not complete 2.0.
