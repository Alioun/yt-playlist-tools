import { createBrowserTabs } from "../../../src/background/adapters/tabs"
import { createTabs } from "../../../src/background/tabs/tabs"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createNativeExtLink, type ExtLinkNativeSender } from "../../../src/site/core/adapters/extlink-runtime"
import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import type { Site } from "../../../src/shared/contracts/vocabulary"
import type { RemovalFixtureState } from "../account-removal-execution/run"
import { deferred, harness as pageHarness, snapshot, rawIdentity, expectedKey, build } from "../page-link/support"
import { a, b, beta, otherVideo, projectionSeed } from "../tab-projection/harness"
import { callbackRuntime } from "../extlink/native"
import { syntheticHealth, viewWorld } from "./harness"

const extensionId = "synthetic-full-tab-view-extension"
async function scenario(name: string, siteName: Site, privateWindow: boolean, signedIn: boolean) {
  const acct = expectedKey(rawIdentity)
  const seed: RemovalFixtureState = JSON.parse(JSON.stringify(projectionSeed())
    .replaceAll(`:${a}`, `:${acct}`).replaceAll(JSON.stringify(a), JSON.stringify(acct)))
  seed.session.tabs = {}
  const health = syntheticHealth()
  health.statuses.read = async (context, enabled) => ({ kind: "statuses", facts: {
    ...context.info, tabId: context.tab.tabId, windowId: context.tab.windowId, private: context.tab.incognito
  }, current: () => true, statuses: enabled.map(feature => ({ feature: feature.id,
    state: feature.id === "shortcuts" ? "not-working" : "working",
    jobs: feature.id === "shortcuts" ? ["account"] : [], anchors: [], actions: [], kinds: [] })) })
  health.notices.read = async (context, statuses) => ({ kind: "notices", facts: {
    ...context.info, tabId: context.tab.tabId, windowId: context.tab.windowId, private: context.tab.incognito
  }, current: () => true, notices: statuses.filter(status => status.state === "not-working").map(status => ({ kind: "not-working", features: [status.feature] })) })
  const h = viewWorld(seed, health)
  const page = pageHarness({ link: { site: siteName }, pageSnapshot: () => ({ ...snapshot(signedIn ? rawIdentity : null), navType: "navigate" }) })
  const deadline = page.clock.after.bind(page.clock)
  const tab = { id: 7, windowId: 3, incognito: privateWindow, active: true, discarded: false, frozen: false, lastAccessed: 5,
    index: 0, pinned: false, highlighted: true, selected: true, autoDiscardable: true, groupId: -1,
    url: `https://${siteName === "www" ? "www" : "music"}.youtube.com/watch?v=abcdefghijk` }
  const network = createMemoryNetwork<ExtLinkNativeSender>({ delivery: "immediate" })
  const backgroundTransport = network.connect({ id: extensionId })
  const siteTransport = network.connect({ id: extensionId, frameId: 0, url: tab.url, tab })
  const background = callbackRuntime(backgroundTransport, extensionId), site = callbackRuntime(siteTransport, extensionId)
  const adapter = createBrowserTabs({ runtime: background.runtime,
    windows: { async get(windowId) {
      if (windowId !== tab.windowId) throw Error("Unknown synthetic window")
      return { id: windowId, incognito: privateWindow }
    } },
    tabs: {
      async get(tabId) { if (tabId !== tab.id) throw Error("Unknown synthetic tab"); return tab },
      async query() { return [tab] },
      sendMessage(tabId, message, options) {
        if (tabId !== tab.id || options.frameId !== 0) throw Error("Wrong synthetic native target")
        return backgroundTransport.send(message)
      }
    }
  }, { build, deadline })
  const tabs = createTabs({ native: adapter.port,
    session: { read: () => h.owner.readSession(), change: change => h.owner.changeSession(change) },
    registrar: { async ensure() { throw Error("Unexpected synthetic Registrar injection") } },
    accounts: { async lastAccount() { throw Error("Unexpected fallback account") }, async hasSetup() { throw Error("Unexpected fallback Setup") } },
    enabled: () => true,
    clock: { now: page.clock.now, wallNow: () => 1_700_000_000_000 + page.clock.now(), after: deadline }
  })
  const unbind = adapter.bindHello(tabs, h.producer)
  let cleanup = () => {}
  try {
    if (privateWindow && signedIn) {
      const skip = await h.flow.skip({ kind: "skip", acct, video: otherVideo, playlists: [beta] }, { kind: "tab", tabId: 7, incognito: true })
      if (skip.kind !== "remembered") throw Error("Actual private AddFlow write unavailable")
      await h.flow.skip({ kind: "skip", acct: b, video: otherVideo, playlists: "all" }, { kind: "tab", tabId: 8, incognito: true })
    }
    const ext = createNativeExtLink({ build, site: siteName, page: page.link, deadline, isView: isTabView }, site.runtime, { visibilityState: "hidden" })
    const views: boolean[] = [], first = deferred<TabView>()
    const stopViews = ext.onView(view => { views.push(view !== null); if (view !== null) first.resolve(view) })
    cleanup = () => { ext.dispose(); stopViews() }
    const initial = await first.promise
    const ping = await adapter.port.ping(tab.id, 2_000, new AbortController().signal)
    const paused = await h.flow.pause(false)
    if (paused.kind !== "remembered") throw Error("Actual shared Pause write unavailable")
    const push = await tabs.push({ windowId: 3, incognito: privateWindow, activeTabId: 7 }, h.producer)
    const pushed = ext.view
    const stored = await h.owner.readSession()
    if (stored.kind !== "memory") throw Error("Actual owner session unavailable")
    const sessionTabCount = stored.memory.tabs.size
    const normalSkipsUnchanged = JSON.stringify(h.removal.state().session[`skips:${acct}`]) === JSON.stringify(seed.session[`skips:${acct}`])
    const sentKinds = network.trace().flatMap(row => {
      if (row.event !== "sent") return []
      const message: unknown = JSON.parse(row.text)
      return message !== null && typeof message === "object" && "kind" in message && typeof message.kind === "string" ? [message.kind] : []
    })
    cleanup(); unbind(); tabs.dispose(); adapter.dispose(); page.dispose(); await h.dispose()
    return { name, initial, pushed, ping, push, views, sessionTabCount, normalSkipsUnchanged, sentKinds,
      cleanup: { runtimeListeners: network.listening(), nativeListeners: background.listening + site.listening,
        pageListeners: page.tracked.listenerCount, timers: page.clock.count } }
  } finally { cleanup(); unbind(); tabs.dispose(); adapter.dispose(); page.dispose(); await h.dispose() }
}

export async function runTabViewConsumer() {
  return { syntheticHealth: true, syntheticNativePorts: true,
    cases: [await scenario("www-normal", "www", false, true), await scenario("www-private", "www", true, true),
      await scenario("music-normal", "music", false, true), await scenario("www-signed-out", "www", false, false)] }
}
if (import.meta.main) process.stdout.write(JSON.stringify(await runTabViewConsumer()) + "\n")
