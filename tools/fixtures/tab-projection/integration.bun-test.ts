import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createBrowserTabs } from "../../../src/background/adapters/tabs"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { TabProjectionRead } from "../../../src/background/store/tab-projection"
import type { TabViewProducer } from "../../../src/background/tabs/ports"
import { bindNativeRoutingAccounts, readStorageForTab } from "./consumer"
import { projectionSeed, b } from "./harness"
import { a, build, fixtureView, type FixtureView, nativeTab, normal, signedIn, signedOut, tabsFixture } from "../tabs/harness"
import expected from "./expected.json"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())

test("Tabs supplies the real owner with its authenticated normal, private and signed-out contexts", async () => {
  const h = tabsFixture(projectionSeed())
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Fixture window missing")
  const native = createBrowserTabs(fakeBrowser, { build, deadline: h.clock.after })
  const accounts = bindNativeRoutingAccounts({ owner: h.owner, native,
    sender: { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }, popupWindowId: window.id })
  const engine = createTabs({ ...h.ports, accounts })
  const reads: TabProjectionRead[] = []
  const producer: TabViewProducer<FixtureView> = {
    isView: fixtureView.isView,
    async produce(context) {
      const before = h.removal.io.length
      reads.push(await readStorageForTab(h.owner, context))
      expect(h.removal.io.slice(before).filter(row => row.phase === "invoked" && /^(local|session|sync)\.(set|remove)/.test(row.kind))).toEqual([])
      return fixtureView.produce(context)
    }
  }
  try {
    expect(await accounts.lastAccount()).toBe(b)
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(9, { incognito: true, windowId: 2 }), signedIn())
    h.seedTab(nativeTab(3), signedOut())
    expect((await engine.seen(1, { ...signedIn(), hidden: true, fresh: true }, producer)).kind).toBe("seen")
    const stored = h.stored()
    expect((await engine.seen(9, { ...signedIn(), hidden: true, fresh: true }, producer)).kind).toBe("seen")
    expect(h.stored()).toEqual(stored)
    expect((await engine.seen(3, { ...signedOut(), hidden: false, fresh: true }, producer)).kind).toBe("seen")
    expect(reads).toEqual<unknown>([expected.normal, expected.private, expected.signedOut])
    expect(await accounts.lastAccount()).toBe(b)
    const restarted = createTabs({ ...h.ports, accounts })
    try {
      expect(await restarted.accountInView(normal)).toEqual({ kind: "account", source: "active", tabId: 1, signedIn: true, acct: a })
      expect(await restarted.accountInView({ ...normal, activeTabId: 3 })).toEqual({ kind: "account", source: "active", tabId: 3, signedIn: false, acct: null })
    } finally { restarted.dispose() }
    expect(JSON.stringify(reads[0])).not.toContain(b)
  } finally { engine.dispose(); native.dispose(); await h.dispose() }
})

test("routing account bindings authenticate each caller and recheck Setup reads", async () => {
  const h = tabsFixture(projectionSeed())
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Fixture window missing")
  const native = createBrowserTabs(fakeBrowser, { build, deadline: h.clock.after })
  const trusted = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }
  const first = bindNativeRoutingAccounts({ owner: h.owner, native, sender: trusted, popupWindowId: window.id })
  const foreign = bindNativeRoutingAccounts({ owner: h.owner, native,
    sender: { ...trusted, id: "foreign-extension" }, popupWindowId: window.id })
  try {
    expect(await first.lastAccount()).toBe(b)
    const before = h.removal.io.length
    expect(await foreign.lastAccount()).toBeNull()
    expect(await foreign.hasSetup(b)).toBe(false)
    expect(h.removal.io).toHaveLength(before)
    const readSetup = h.owner.readSetup
    h.owner.readSetup = async acct => {
      const result = await readSetup(acct)
      spyOn(fakeBrowser.windows, "get").mockImplementation(async () => ({ ...window, incognito: true }))
      return result
    }
    expect(await first.hasSetup(b)).toBe(false)
  } finally { native.dispose(); await h.dispose() }
})
