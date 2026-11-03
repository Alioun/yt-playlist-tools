import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createBrowserTabs } from "../../../src/background/adapters/tabs"
import { createTabs } from "../../../src/background/tabs/tabs"
import { bindNativeRoutingAccounts, readStorageForTab } from "./consumer"
import { projectionWorld, projectionSeed, a, b } from "./harness"
import { build, manualClock, nativeTab, normal, signedOut, tabsFixture } from "../tabs/harness"
import expected from "./expected.json"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())

test("normal routing reads the real owner through native requester authority", async () => {
  const h = projectionWorld(),
    clock = manualClock()
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Fixture window missing")
  spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
  const native = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const accounts = bindNativeRoutingAccounts({ owner: h.owner, native, sender: { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }, popupWindowId: window.id })
  try {
    expect(await accounts.lastAccount()).toBe(b)
    expect(await accounts.hasSetup(b)).toBe(true)
    h.removal.foreign(state => {
      delete state.local[`doc:setup:${b}`]
    })
    expect(await accounts.lastAccount()).toBeNull()
    expect(await accounts.hasSetup(b)).toBe(false)
    expect(h.writes()).toEqual([])
    expect(h.syncReads()).toEqual([])
  } finally {
    native.dispose()
    await h.owner.dispose()
  }
})

test("native private and unauthenticated requesters cannot read fallback account data", async () => {
  const h = projectionWorld(),
    clock = manualClock()
  const window = await fakeBrowser.windows.create({ incognito: true })
  if (window?.id === undefined) throw Error("Fixture window missing")
  spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
  const native = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const read = spyOn(h.owner, "readLastAccount"),
    setup = spyOn(h.owner, "readSetup")
  try {
    for (const sender of [
      { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") },
      { id: "foreign-extension", url: fakeBrowser.runtime.getURL("/popup.html") }
    ]) {
      const accounts = bindNativeRoutingAccounts({ owner: h.owner, native, sender, popupWindowId: window.id })
      expect(await accounts.lastAccount()).toBeNull()
      expect(await accounts.hasSetup(a)).toBe(false)
    }
    expect(read).not.toHaveBeenCalled()
    expect(setup).not.toHaveBeenCalled()
    expect(h.removal.io).toEqual([])
  } finally {
    native.dispose()
    await h.owner.dispose()
  }
})

test("native privacy changes during a routing read discard the hint", async () => {
  const h = projectionWorld(),
    clock = manualClock()
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Fixture window missing")
  spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
  const privacy = spyOn(fakeBrowser.windows, "get")
    .mockImplementationOnce(async () => ({ ...window, incognito: false }))
    .mockImplementation(async () => ({ ...window, incognito: true }))
  const native = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  try {
    const accounts = bindNativeRoutingAccounts({ owner: h.owner, native, sender: { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }, popupWindowId: window.id })
    expect(await accounts.lastAccount()).toBeNull()
    expect(privacy.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(h.writes()).toEqual([])
  } finally {
    native.dispose()
    await h.owner.dispose()
  }
})

test("an active signed-out Tabs result precedes the normal last-account hint", async () => {
  const h = tabsFixture(projectionSeed())
  const lastAccount = mock(async () => b)
  const engine = createTabs({
    ...h.ports,
    accounts: {
      lastAccount,
      async hasSetup(acct) {
        const read = await h.owner.readSetup(acct)
        return read.kind === "value" && read.view.kind === "live"
      }
    }
  })
  h.seedTab(nativeTab(1), signedOut())
  try {
    expect(await engine.accountInView(normal)).toEqual({ kind: "account", source: "active", tabId: 1, signedIn: false, acct: null })
    expect(lastAccount).not.toHaveBeenCalled()
    expect(await readStorageForTab(h.owner, { tab: { ...nativeTab(1), site: "www" }, info: signedOut() })).toEqual<unknown>(expected.signedOut)
  } finally {
    engine.dispose()
    await h.dispose()
  }
})
