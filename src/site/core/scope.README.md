# Scoped page resources

`Scope` owns listener registrations, mutation observers, one-shot deadlines, mounted components, and added cleanup functions. Construction stores the document and collaborators without allocating a native resource. `resourceCount` reports registrations still owned, including added cleanup and view subscriptions.

Every acquisition returns an idempotent release function. A release removes its registration and clears the cleanup reference before invoking cleanup. A fired deadline and a `once` listener release themselves before calling feature code. Abort signals release both the target listener and the abort listener. Listener removal uses the capture value recorded at registration.

`dispose()` revokes callbacks before cleanup starts. It drains all registrations even when a disposer or the error sink throws. Reentry is harmless. `add` invokes cleanup immediately after disposal. Other acquisition methods do nothing after disposal. Ownership is registered before native acquisition starts, so acquisition that disposes the Scope is undone when it returns. Async feature work can pass a late resource to `add`, or call another Scope method after an `await`, without making a live registration on a disposed Scope. A Scope cannot cancel arbitrary promises or undo unowned effects.

`observe` uses the observed element's document realm, including detached elements. `timeout` uses the Scope document's realm. A document without a window cannot supply either native adapter. Those acquisitions throw before retaining a resource. The caller selects observation roots and options. Broad subtree observation remains prohibited by the repository guard.

`mount` requires an injected `ScopeMountPort`. The core has only a type import from Svelte and no kit import. `svelteScopeMount` in `site/kit/scope-mount.ts` adapts real Svelte 5 `mount` and `unmount`. The port accepts actual typed Svelte Components, their props, and an Element or ShadowRoot. It returns one cleanup function. The adapter starts teardown with `{ outro: false }` and forwards rejected completion promises to its error sink.

The prepared Svelte 5.57.2 source declares `unmount` as `Promise<void>`. Its `component_root` calls `destroy_effect` inside the promise executor when outro is false. Thus normal DOM removal and effect destruction start during synchronous Scope disposal. The adapter does not await promise completion, arbitrary async teardown, or a component's failed teardown. A failure still leaves the Scope released and other cleanup proceeds. These are source-derived completion semantics. The authored real-Svelte tests have not run.

No interval, polling, global installation, storage listener, WXT event, or browser-wide event is added here. Later SiteCore composition supplies the document, error sink, and optional mounting port. Keeping the port absent lets card menu usage stay kit-free.
