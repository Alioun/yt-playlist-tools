import { openFirstRun, openNoteTab, releaseBrowserMenu, type NativeBrowser } from "./adapters/browser"
import { openUpgradeNote } from "./compose/note-opener"
import { timerDeadline } from "./adapters/runtime"
import { createRuntimeGate } from "./adapters/runtime-gate"
import { createBrowserTabs } from "./adapters/tabs"
import { createClearAllTeardown } from "./adapters/store-lifecycle"
import { composeRegistrar, registrarOwner } from "./compose/registrar"
import { composeHeldRoutes, composeServices, type Services } from "./compose/services"
import { composeStore } from "./compose/store"
import type { StoreLifecycle } from "./store/store-lifecycle"
import type { Platform } from "../shared/platform"
import type { SiteDiagnostics } from "./monitor/ports"
import { tearDownOpenTabs } from "./tabs/teardown"

/**
 * The composition root (06 §6.4.3, ARC-MOD-39). Every listener the background needs is added in this first
 * turn: the gated message listener, `runtime.onInstalled`, and the Registrar's permission and start-up
 * listeners. Everything that needs the store waits for its readiness, and the gate holds messages until then.
 */
export type Background = { readonly lifecycle: StoreLifecycle; readonly ready: Promise<void>; dispose(): Promise<void> }

export function boot(native: NativeBrowser, platform: Platform, sites?: SiteDiagnostics): Background {
  const gate = createRuntimeGate(native.runtime)
  native.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") void openFirstRun(native)
  })
  // Keys from any tab and the browser's menu wake the worker, so their listeners join this first turn and wait for the services (YT-ANY, YT-BM).
  native.commands?.onCommand.addListener(name => {
    void ready.then(() => services?.anyTab.command(name))
  })
  const menuClicksHeard = native.contextMenus !== undefined
  native.contextMenus?.onClicked.addListener((info, tab) => {
    void ready.then(() => services?.anyTab.clicked(info, tab))
  })
  // The upgrade note reopens only at a browser start, which this first-turn listener is the one witness of (REL-CON-25).
  let browserStart = false,
    noteChecked = false
  const checkNote = () => {
    const state = lifecycle.state()
    if (state.kind !== "active" || (noteChecked && !browserStart)) return
    noteChecked = true
    void openUpgradeNote({ device: async () => (await native.storage.local.get("device")).device, mark: flag => state.owner.markUpgradeNote(flag), open: () => openNoteTab(native) }, browserStart)
      .catch(() => {})
      .finally(() => {
        browserStart = false
      })
  }
  // A browser start is also when automatic gathering looks for unvisited tabs, and the minute trigger 2 ignores begins (ARC-MOD-39).
  native.runtime.onStartup.addListener(() => {
    browserStart = true
    noteChecked = false
    checkNote()
    void ready.then(() => services?.gather.woke("startup"))
  })
  let services: Services | undefined
  // While consent is held only the UI routes run, on the held owner, and every feature service stays stopped (R167).
  let held: { dispose(): void } | undefined
  const lifecycle = composeStore(native, platform, () =>
    createClearAllTeardown({
      registrar: current.registrar,
      extLinks: [],
      scripting: current.scripting,
      tabs: { dispose: () => services?.tabs.dispose() },
      async drainInvokedWork() {
        await services?.actions.flow.quiesce()
        return "drained"
      },
      async tearDownAllOpenTabs() {
        const runtime = { ...gate.runtime, id: native.runtime.id, getURL: (path: string) => native.runtime.getURL(path as never) }
        const tabs = createBrowserTabs({ ...native, runtime }, { build: platform.build, deadline: timerDeadline })
        try {
          return await tearDownOpenTabs(tabs.port)
        } finally {
          tabs.dispose()
        }
      },
      releaseBrowserMenu: () => releaseBrowserMenu(native)
    })
  )
  const owner = registrarOwner(lifecycle)
  let current = composeRegistrar(native, platform.build, owner.port)
  const consented = () => {
    const snapshot = owner.port.current()
    return snapshot.kind === "ok" && snapshot.consent && snapshot.schemaOk
  }
  let stopOwner = () => {}
  // Clear all and withdrawal replace the owner, so once one settles the routes move to the owner that follows it.
  const routed: StoreLifecycle = {
    ...lifecycle,
    async clearAll(origin, options) {
      const result = await lifecycle.clearAll(origin, options)
      rebind()
      return result
    },
    async withdrawConsent(origin, expected) {
      const result = await lifecycle.withdrawConsent(origin, expected)
      rebind()
      return result
    }
  }
  function rebind() {
    const next = lifecycle.state().kind
    if ((next === "active" || next === "held") && services === undefined && held === undefined) restart()
  }

  function start() {
    const state = lifecycle.state()
    if (state.kind === "held") {
      held = composeHeldRoutes({ native, runtime: gate.runtime, build: platform.build, owner: state.owner, lifecycle: routed })
      return
    }
    if (state.kind !== "active") return
    stopOwner()
    const refresh = () => {
      void owner.refresh()
    }
    const stops = [state.owner.subscribeView(refresh), state.owner.subscribe(refresh)]
    stopOwner = () => {
      for (const stop of stops.splice(0)) stop()
    }
    services = composeServices({
      native,
      runtime: gate.runtime,
      build: platform.build,
      browser: platform.browser,
      owner: state.owner,
      registrar: current.registrar,
      consented,
      menuClicksHeard,
      sites,
      lifecycle: routed
    })
  }
  function restart() {
    current = composeRegistrar(native, platform.build, owner.port)
    void owner.refresh()
    start()
    if (lifecycle.state().kind === "active") void lifecycle.owner()?.startSync()
  }
  // Both lifecycle events mean the owner the routes and services use is gone.
  lifecycle.subscribe(() => {
    stopOwner()
    services?.dispose()
    services = undefined
    held?.dispose()
    held = undefined
  })
  gate.onAnswered(() => {
    void owner.refresh()
  })
  const ready = lifecycle
    .ready()
    .then(start, () => {})
    .finally(() => {
      gate.open()
      checkNote()
    })
  return {
    lifecycle,
    ready,
    async dispose() {
      stopOwner()
      services?.dispose()
      held?.dispose()
      current.registrar.dispose()
      await lifecycle.dispose()
    }
  }
}
