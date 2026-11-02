import { openFirstRun, openNoteTab, releaseBrowserMenu, type NativeBrowser } from "./adapters/browser"
import { openUpgradeNote } from "./compose/note-opener"
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
  // The upgrade note reopens only at a browser start, which this first-turn listener is the one witness of (REL-CON-25).
  let browserStart = false, noteChecked = false
  const checkNote = () => {
    const state = lifecycle.state()
    if (state.kind !== "active" || noteChecked && !browserStart) return
    noteChecked = true
    void openUpgradeNote({ device: async () => (await native.storage.local.get("device")).device, mark: flag => state.owner.markUpgradeNote(flag),
      open: () => openNoteTab(native) }, browserStart).catch(() => {}).finally(() => { browserStart = false })
  }
  // A browser start is also when automatic gathering looks for unvisited tabs, and the minute trigger 2 ignores begins (ARC-MOD-39).
  native.runtime.onStartup.addListener(() => {
    browserStart = true; noteChecked = false; checkNote()
    void ready.then(() => services?.gather.woke("startup"))
  })
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
      native, runtime: gate.runtime, build: platform.build, browser: platform.browser, owner: state.owner, registrar: current.registrar, consented, menuClicksHeard,
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
  const ready = lifecycle.ready().then(start, () => {}).finally(() => { gate.open(); checkNote() })
  return { lifecycle, ready, async dispose() {
    stopOwner()
    services?.dispose()
    current.registrar.dispose()
    await lifecycle.dispose()
  } }
}
