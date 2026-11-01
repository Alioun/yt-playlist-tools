import { createBrowserTabs } from "../../../src/background/adapters/tabs"
import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { TabViewProducer } from "../../../src/background/tabs/ports"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createNativeExtLink, type ExtLinkNativeSender } from "../../../src/site/core/adapters/extlink-runtime"
import { deferred, harness as pageHarness, route, snapshot } from "../page-link/support"
import { createRemovalHarness, removalFixture } from "../account-removal-execution/run"
import { build, extensionId, fixtureView, isFixtureView, type FixtureView } from "./harness"
import { callbackRuntime } from "./native"

export async function runExtLinkConsumer() {
  const page = pageHarness({
    pageSnapshot: () => ({ ...snapshot(), navType: "navigate" }),
    run: async job => job.kind === "playlists" ? { ok: true, data: [], route } : { ok: false, reason: "unavailable" }
  })
  const deadline = page.clock.after.bind(page.clock)
  const tab = { id: 7, windowId: 3, incognito: false, active: true, discarded: false, frozen: false, lastAccessed: 5,
    index: 0, pinned: false, highlighted: true, selected: true, autoDiscardable: true, groupId: -1,
    url: "https://www.youtube.com/watch?v=abcdefghijk" }
  const network = createMemoryNetwork<ExtLinkNativeSender>({ delivery: "immediate" })
  const backgroundTransport = network.connect({ id: extensionId })
  const siteTransport = network.connect({ id: extensionId, frameId: 0, url: tab.url, tab })
  const background = callbackRuntime(backgroundTransport, extensionId)
  const site = callbackRuntime(siteTransport, extensionId)
  const nativeCalls: { readonly kind: string; readonly tabId?: number; readonly frameId?: number }[] = []
  const adapter = createBrowserTabs({
    runtime: background.runtime,
    windows: { async get(windowId) { if (windowId !== tab.windowId) throw Error("Unknown synthetic window"); return { id: windowId, incognito: false } } },
    tabs: {
      async get(tabId) { nativeCalls.push({ kind: "get", tabId }); if (tabId !== tab.id) throw Error("Unknown synthetic tab"); return tab },
      async query() { nativeCalls.push({ kind: "query" }); return [tab] },
      sendMessage(tabId, message, options) {
        nativeCalls.push({ kind: "send", tabId, frameId: options.frameId })
        if (tabId !== tab.id || options.frameId !== 0) throw Error("Wrong synthetic target")
        return backgroundTransport.send(message)
      }
    }
  }, { build, deadline })
  const removal = createRemovalHarness({ ...removalFixture(), session: {} })
  const owner = createLocalFilterWriter(removal.deps)
  const tabs = createTabs({
    native: adapter.port,
    session: { read: () => owner.readSession(), change: change => owner.changeSession(change) },
    registrar: { async ensure() { throw Error("Unexpected synthetic Registrar injection") } },
    accounts: {
      async lastAccount() { throw Error("Unexpected synthetic last-account read") },
      async hasSetup() { throw Error("Unexpected synthetic Setup read") }
    },
    enabled: () => true,
    clock: { now: page.clock.now, wallNow: () => 1_700_000_000_000 + page.clock.now(), after: deadline }
  })
  const produced: { readonly tabId: number; readonly acct: string | null; readonly private: boolean }[] = []
  const producer: TabViewProducer<FixtureView> = {
    isView: isFixtureView,
    async produce({ tab, info }) {
      produced.push({ tabId: tab.tabId, acct: info.acct, private: tab.incognito })
      return { kind: "view", view: { ...fixtureView(info), private: tab.incognito } }
    }
  }
  const unbind = adapter.bindHello(tabs, producer)
  const ext = createNativeExtLink({ build, site: "www", page: page.link, deadline, isView: isFixtureView }, site.runtime, { visibilityState: "hidden" })
  const views: (FixtureView | null)[] = []
  const first = deferred<FixtureView>()
  const stopViews = ext.onView(view => { views.push(view); if (view !== null) first.resolve(view) })
  try {
    const initial = await first.promise
    if (!initial.signedIn) throw Error("Synthetic consumer requires its signed-in snapshot")
    const signal = new AbortController().signal
    const ping = await adapter.port.ping(tab.id, 2_000, signal)
    const job = await adapter.port.run(tab.id, { job: { kind: "playlists" }, acct: initial.acct }, 30_000, signal)
    const pushed = fixtureView(initial, 1)
    const push = await adapter.port.view(tab.id, pushed, isFixtureView, 2_000, signal)
    const stored = await owner.readSession()
    if (stored.kind !== "memory") throw Error("Synthetic session unavailable")
    const registry = [...stored.memory.tabs.entries()]
    ext.dispose()
    stopViews()
    unbind()
    tabs.dispose()
    adapter.dispose()
    page.dispose()
    await owner.dispose()
    return {
      synthetic: true,
      produced, views, ping, job, push, registry,
      nativeCalls,
      callbacks: { backgroundClaims: background.claims, backgroundResponses: background.responses,
        siteClaims: site.claims, siteResponses: site.responses },
      wire: network.trace(),
      pageJobs: page.calls.map(call => call.job),
      retirementAnnouncements: page.tracked.frames.filter(frame => frame.wire === "retire").length,
      cleanup: { runtimeListeners: network.listening(), nativeListeners: background.listening + site.listening,
        pageListeners: page.tracked.listenerCount, timers: page.clock.count }
    }
  } finally {
    ext.dispose(); stopViews(); unbind(); tabs.dispose(); adapter.dispose(); page.dispose(); await owner.dispose()
  }
}

if (import.meta.main) process.stdout.write(JSON.stringify(await runExtLinkConsumer()) + "\n")
