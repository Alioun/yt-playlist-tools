import { openFirstRun, releaseBrowserMenu, type NativeBrowser } from "./adapters/browser"
import { createRuntimeGate } from "./adapters/runtime-gate"
import { createClearAllTeardown } from "./adapters/store-lifecycle"
import { composeRegistrar, registrarOwner } from "./compose/registrar"
import { composeServices, type Services } from "./compose/services"
import { composeStore } from "./compose/store"
import type { StoreLifecycle } from "./store/store-lifecycle"
import type { Platform } from "../shared/platform"

/**
 * The composition root (06 §6.4.3, ARC-MOD-39). Every listener the background needs is added in this first
 * turn: the gated message listener, `runtime.onInstalled`, and the Registrar's permission and start-up
 * listeners. Everything that needs the store waits for its readiness, and the gate holds messages until then.
 */
export type Background = { readonly lifecycle: StoreLifecycle; readonly ready: Promise<void>; dispose(): Promise<void> }

export function boot(native: NativeBrowser, platform: Platform): Background {
  const gate = createRuntimeGate(native.runtime)
  native.runtime.onInstalled.addListener(details => { if (details.reason === "install") void openFirstRun(native) })
  let services: Services | undefined
  const lifecycle = composeStore(native, platform, () => createClearAllTeardown({
    registrar: current.registrar, extLinks: [], scripting: current.scripting,
    get tabs() { if (!services) throw new Error("Clear all before the tab services started"); return services.tabs },
    drainInvokedWork: async () => "drained",
    tearDownAllOpenTabs: async () => "torn-down",
    releaseBrowserMenu: () => releaseBrowserMenu(native)
  }))
  const owner = registrarOwner(lifecycle)
  let current = composeRegistrar(native, platform.build, owner.port)
  const consented = () => { const snapshot = owner.port.current(); return snapshot.kind === "ok" && snapshot.consent && snapshot.schemaOk }
  let stopOwner = () => {}

  function start() {
    const state = lifecycle.state()
    if (state.kind !== "active") return
    stopOwner()
    const refresh = () => { void owner.refresh() }
    const stops = [state.owner.subscribeView(refresh), state.owner.subscribe(refresh)]
    stopOwner = () => { for (const stop of stops.splice(0)) stop() }
    services = composeServices({
      native, runtime: gate.runtime, build: platform.build, owner: state.owner, registrar: current.registrar, consented,
      lifecycle: { ...lifecycle, async clearAll(origin, options) {
        const result = await lifecycle.clearAll(origin, options)
        if (lifecycle.state().kind === "active" && services === undefined) restart()
        return result
      } }
    })
  }
  function restart() {
    current = composeRegistrar(native, platform.build, owner.port)
    void owner.refresh()
    start()
    if (lifecycle.state().kind === "active") void lifecycle.owner()?.startSync()
  }
  lifecycle.subscribe(event => {
    if (event.kind !== "cleared") return
    stopOwner()
    services?.dispose()
    services = undefined
  })
  gate.onAnswered(() => { void owner.refresh() })
  const ready = lifecycle.ready().then(start, () => {}).finally(() => gate.open())
  return { lifecycle, ready, async dispose() {
    stopOwner()
    services?.dispose()
    current.registrar.dispose()
    await lifecycle.dispose()
  } }
}
