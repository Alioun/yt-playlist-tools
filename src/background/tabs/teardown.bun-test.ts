import { expect, test } from "bun:test"
import { isTabViewFor } from "../../shared/contracts/tab-view"
import type { TabPing } from "../../shared/contracts/tabs"
import type { RpcFailure } from "../../shared/rpc/rpc"
import type { NativeTab, TabNativePort, TabReply } from "./ports"
import { emptyTabView, tearDownOpenTabs } from "./teardown"

const build = "test" as TabPing["build"]
const acct = "AAAAAAAAAAAAAAAA" as Extract<TabPing, { signedIn: true }>["acct"]
function tab(tabId: number, patch: Partial<NativeTab> = {}): NativeTab {
  return { tabId, windowId: 1, incognito: false, site: "www", lastAccessed: 0, active: false, discarded: false, frozen: false, ...patch }
}
type Ping = TabReply<TabPing>
const answered = (result: TabPing): Ping => ({ kind: "answered", result })
const failed = (failure: RpcFailure): Ping => ({ kind: "failed", failure })

function browserWith(tabs: readonly NativeTab[] | "unavailable", pings: Record<number, Ping>, views: Record<number, TabReply<null>> = {}) {
  const sent: { tabId: number; view: unknown }[] = []
  const pinged: number[] = []
  const port: Pick<TabNativePort, "query" | "ping" | "view"> = {
    async query() {
      return tabs === "unavailable" ? { kind: "unavailable" } : { kind: "tabs", tabs }
    },
    async ping(tabId) {
      pinged.push(tabId)
      return (pings[tabId] ?? failed("transport")) as never
    },
    async view(tabId, view) {
      sent.push({ tabId, view })
      return (views[tabId] ?? { kind: "answered", result: null }) as never
    }
  }
  return { port, sent, pinged }
}

test("each signed-in, signed-out, private and YouTube Music core is sent a view it accepts, with nothing on", () => {
  const cases: [TabPing, boolean][] = [
    [{ site: "www", build, signedIn: true, acct }, false],
    [{ site: "www", build, signedIn: true, acct }, true],
    [{ site: "music", build, signedIn: false, acct: null }, false]
  ]
  for (const [info, incognito] of cases) {
    const view = emptyTabView(info, incognito)
    expect(isTabViewFor({ ...info, tabId: 1, windowId: 1, private: incognito }, view)).toBe(true)
    expect(view).toMatchObject({ features: [], statuses: [], notices: [], undoKey: null })
  }
})

test("every YouTube tab whose core answers gets the view, and tabs without a core or closed meanwhile count as torn down", async () => {
  const world = browserWith([tab(1), tab(2, { site: "music", incognito: true }), tab(3), tab(4), tab(5, { site: null }), tab(6, { discarded: true })], {
    1: answered({ site: "www", build, signedIn: true, acct }),
    2: answered({ site: "music", build, signedIn: false, acct: null }),
    3: failed("transport"),
    4: { kind: "gone" }
  })
  expect(await tearDownOpenTabs(world.port)).toBe("torn-down")
  expect(world.pinged.sort()).toEqual([1, 2, 3, 4])
  expect(world.sent.map(({ tabId, view }) => [tabId, view])).toEqual([
    [1, emptyTabView({ site: "www", build, signedIn: true, acct }, false)],
    [2, emptyTabView({ site: "music", build, signedIn: false, acct: null }, true)]
  ])
})

test("a core that doesn't answer in time, or doesn't take the view, leaves the teardown unconfirmed", async () => {
  expect(await tearDownOpenTabs(browserWith([tab(1)], { 1: failed("timeout") }).port)).toBe("unconfirmed")
  expect(await tearDownOpenTabs(browserWith([tab(1)], { 1: answered({ site: "www", build, signedIn: false, acct: null }) }, { 1: { kind: "failed", failure: "timeout" } }).port)).toBe("unconfirmed")
})

test("a tab list the browser won't give leaves the teardown unconfirmed", async () => {
  expect(await tearDownOpenTabs(browserWith("unavailable", {}).port)).toBe("unconfirmed")
})
