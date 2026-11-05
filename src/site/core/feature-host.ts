import type { TabView } from "../../shared/contracts/tab-view"
import type { Site } from "../../shared/contracts/vocabulary"
import type { ExtLink } from "./extlink"
import type { Dispose, Scope } from "./scope"

export type SiteView<S extends Site> = Extract<TabView, { readonly site: S }>
export type SiteFeatureId<S extends Site> = SiteView<S>["features"][number]["id"]
export interface FeatureView<S extends Site> {
  read(): SiteView<S> | null
  subscribe(listener: (view: SiteView<S>) => void): Dispose
}
export interface FeatureLifecycleContext<S extends Site> {
  readonly site: S
  readonly scope: Scope
  readonly view: FeatureView<S>
}
export type FeatureContext<S extends Site, Services extends object> = FeatureLifecycleContext<S> & Services
export interface FeatureDefinition<S extends Site, Services extends object> {
  readonly id: SiteFeatureId<S>
  start(context: FeatureContext<S, Services>): void | Promise<void>
}
export interface FeatureFailure<S extends Site> {
  readonly id: SiteFeatureId<S>
  readonly phase: "scope" | "context" | "start" | "view"
  readonly error: unknown
}
export interface FeatureHostOptions<S extends Site, Services extends object> {
  readonly site: S
  createScope(): Scope
  createContext(lifecycle: FeatureLifecycleContext<S>): Services & { readonly scope?: never; readonly site?: never; readonly view?: never }
  onEmpty(view: SiteView<S>): void
  onError(failure: FeatureFailure<S>): void
}
export interface FeatureHost<S extends Site, Services extends object> {
  define(definition: FeatureDefinition<S, Services>): void
  connect(link: Pick<ExtLink<TabView>, "onView">): void
  dispose(): void
}
type Run<S extends Site> = { readonly scope: Scope; readonly listeners: Set<(view: SiteView<S>) => void> }
type State<S extends Site> = { readonly kind: "idle" | "failed" } | { readonly kind: "running"; readonly run: Run<S> }
type Entry<S extends Site, Services extends object> = { readonly definition: FeatureDefinition<S, Services>; state: State<S> }

function onSite<S extends Site>(view: TabView, site: S): view is SiteView<S> { return view.site === site }

export function createFeatureHost<S extends Site, Services extends object>(options: FeatureHostOptions<S, Services>): FeatureHost<S, Services> {
  const entries = new Map<SiteFeatureId<S>, Entry<S, Services>>()
  let current: SiteView<S> | null = null
  let stopped = false
  let connected = false
  let disconnect: Dispose = () => {}
  let busy = 0
  let draining = false
  let dirty = false

  const enabled = (id: SiteFeatureId<S>) => current?.features.some(feature => feature.id === id) === true
  function report(id: SiteFeatureId<S>, phase: FeatureFailure<S>["phase"], error: unknown) {
    try { options.onError({ id, phase, error }) } catch {}
  }
  function live(entry: Entry<S, Services>, run: Run<S>): boolean {
    return !stopped && !run.scope.disposed && entry.state.kind === "running" && entry.state.run === run && enabled(entry.definition.id)
  }
  function transaction(change: () => void) {
    busy++
    try { change() } finally { busy--; drain() }
  }
  function fail(entry: Entry<S, Services>, run: Run<S>, phase: "context" | "start", error: unknown) {
    transaction(() => {
      if (entry.state.kind !== "running" || entry.state.run !== run) return
      entry.state = { kind: "failed" }
      run.scope.dispose()
      report(entry.definition.id, phase, error)
    })
  }
  function context(entry: Entry<S, Services>, run: Run<S>): FeatureLifecycleContext<S> {
    return {
      site: options.site,
      scope: run.scope,
      view: {
        read: () => live(entry, run) ? current : null,
        subscribe(listener) {
          if (!live(entry, run)) return () => {}
          const notify = (view: SiteView<S>) => {
            if (!live(entry, run)) return
            try { listener(view) } catch (error) { report(entry.definition.id, "view", error) }
          }
          run.listeners.add(notify)
          const release = run.scope.add(() => { run.listeners.delete(notify) })
          if (current && live(entry, run)) notify(current)
          return release
        }
      }
    }
  }
  function drain() {
    dirty = true
    if (busy || draining || stopped) return
    draining = true
    try {
      while (dirty && !stopped) {
        dirty = false
        for (const entry of [...entries.values()]) {
          if (stopped || !enabled(entry.definition.id) || entry.state.kind !== "idle") continue
          let scope: Scope
          try { scope = options.createScope() } catch (error) {
            entry.state = { kind: enabled(entry.definition.id) ? "failed" : "idle" }
            report(entry.definition.id, "scope", error)
            continue
          }
          if (stopped || !enabled(entry.definition.id) || scope.disposed) { scope.dispose(); continue }
          const run: Run<S> = { scope, listeners: new Set() }
          entry.state = { kind: "running", run }
          const lifecycle = context(entry, run)
          let supplied: Services
          try { supplied = options.createContext(lifecycle) } catch (error) { fail(entry, run, "context", error); continue }
          if (!live(entry, run)) continue
          const owned = Object.assign({}, supplied, lifecycle)
          try {
            const result = entry.definition.start(owned)
            if (result) void result.catch(error => { fail(entry, run, "start", error) })
          } catch (error) { fail(entry, run, "start", error) }
        }
      }
    } finally { draining = false }
  }
  function receive(view: TabView | null) {
    if (stopped) return
    transaction(() => {
      const previous = current
      current = view && onSite(view, options.site) ? view : null
      const next = current
      for (const entry of [...entries.values()]) {
        if (enabled(entry.definition.id)) continue
        const state = entry.state
        entry.state = { kind: "idle" }
        if (state.kind === "running") state.run.scope.dispose()
      }
      if (stopped || current !== next) return
      for (const entry of [...entries.values()]) {
        const state = entry.state
        if (state.kind !== "running" || !next) continue
        for (const notify of [...state.run.listeners]) {
          if (stopped || current !== next || !live(entry, state.run)) break
          if (state.run.listeners.has(notify)) notify(next)
        }
      }
      if (!stopped && current === next && next && previous && previous.features.length > 0 && next.features.length === 0) options.onEmpty(next)
    })
  }
  function stop() {
    if (stopped) return
    stopped = true
    current = null
    try { disconnect() } finally {
      disconnect = () => {}
      for (const entry of entries.values()) {
        const state = entry.state
        entry.state = { kind: "idle" }
        if (state.kind === "running") state.run.scope.dispose()
      }
      entries.clear()
    }
  }
  return {
    define(definition) {
      if (stopped || entries.has(definition.id)) return
      entries.set(definition.id, { definition, state: { kind: "idle" } })
      drain()
    },
    connect(link) {
      if (stopped || connected) return
      connected = true
      try {
        const release = link.onView(receive)
        if (stopped) release()
        else disconnect = release
      } catch (error) {
        stop()
        throw error
      }
    },
    dispose: stop
  }
}
