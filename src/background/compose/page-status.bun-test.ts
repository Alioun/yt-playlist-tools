import { expect, test } from "bun:test"
import { createPageStatus } from "./page-status"
import { createDiagnostics } from "./diagnostics"
import { defaultSettings } from "../../shared/model/defaults"
import type { EnabledMonitorFeature, MonitorStatus } from "../monitor/ports"
import type { UiRequester } from "../adapters/ui-requester"

const acct = "AAAAAAAAAAAAAAAA" as never
const ui = {
  ui: { kind: "ui", page: "popup", origin: { kind: "ui", windowId: 3, incognito: false } },
  requester: { windowId: 3, incognito: false, activeTabId: 4 },
  principal: "p"
} as unknown as UiRequester
const status = (feature: string, state: MonitorStatus["state"], destinations: MonitorStatus["destinations"] = []) =>
  ({ feature, state, jobs: [], anchors: [], actions: [], kinds: [], destinations }) as unknown as MonitorStatus

test("the popup's health list carries the background features: the browser's menu, keys from any tab, Gather's destinations and sync (HEALTH-29)", async () => {
  const settings = defaultSettings()
  settings.browserMenu.on = true
  settings.anyTabKeys.on = true
  settings.gather.on = true
  const asked: string[][] = []
  const source = createPageStatus({
    owner: {
      readSession: async () => ({ kind: "memory", memory: { tabs: new Map([[4, { site: "www", signedIn: true, acct }]]) } }) as never,
      read: async () => ({ kind: "value", settings }) as never
    },
    statuses: {
      read: async () => {
        throw Error("page statuses alone")
      }
    },
    tab: async () => ({ kind: "tab", tab: { tabId: 4, windowId: 3, incognito: false, site: "www", lastAccessed: 4, active: true, discarded: false, frozen: false } }) as never,
    build: "build" as never,
    syncOn: async () => true,
    monitor: async (_context, enabled: readonly EnabledMonitorFeature[]) => {
      asked.push(enabled.map(feature => feature.id))
      return { kind: "statuses", statuses: [status("browser-menu", "not-working"), status("any-tab-keys", "working"), status("gather", "partly-working", ["queue"]), status("sync", "working")] }
    }
  })
  const answer = await source(ui)
  expect(asked).toEqual([["browser-menu", "any-tab-keys", "gather", "sync"]])
  expect(answer?.health).toEqual([
    { feature: "browser-menu", site: "www", state: "not-working", gaps: [] },
    { feature: "any-tab-keys", site: "www", state: "working", gaps: [] },
    { feature: "gather", site: "www", state: "partly-working", gaps: ["queue"] },
    { feature: "sync", site: "www", state: "working", gaps: [] }
  ])
})

// Settings is the active tab, so the status covers the open tabs of each site.
const settingsPage = { ...ui, requester: { windowId: 3, incognito: false, activeTabId: 99 } } as unknown as UiRequester
const native = (tabId: number, site: "www" | "music" | null) => ({ kind: "tab", tab: { tabId, windowId: 3, incognito: false, site, lastAccessed: tabId, active: false, discarded: false, frozen: false } }) as never
const working = async (_context: unknown, enabled: readonly EnabledMonitorFeature[]) => ({ kind: "statuses" as const, statuses: enabled.map(feature => status(feature.id, "working")) })

test("an open YouTube Music tab reports its health however many YouTube tabs are registered (UI-SET-17)", async () => {
  const settings = defaultSettings()
  settings.musicActions.on = true
  settings.queueButton.on = true
  const tabs = new Map(Array.from({ length: 30 }, (_, index) => [index + 1, { site: index === 29 ? "music" : "www", signedIn: true, acct }]))
  const answer = await createPageStatus({
    owner: { readSession: async () => ({ kind: "memory", memory: { tabs } }) as never, read: async () => ({ kind: "value", settings }) as never },
    statuses: { read: async () => ({ kind: "unavailable" }) as never },
    tab: async tabId => native(tabId, tabs.get(tabId)!.site as "www" | "music"),
    build: "build" as never,
    monitor: working
  })(settingsPage)
  expect(answer?.health).toContainEqual({ feature: "music-actions", site: "music", state: "working", gaps: [] })
  expect(answer?.health).toContainEqual({ feature: "queue-button", site: "www", state: "working", gaps: [] })
})

test("a registered tab that left YouTube is no open tab, for the statuses and for Check now (HEALTH-22, HEALTH-23)", async () => {
  const settings = defaultSettings()
  settings.cardMenu.on = true
  // Tab 7 said hello on youtube.com and then went to another site, so the browser reports it with no site.
  const answer = await createPageStatus({
    owner: { readSession: async () => ({ kind: "memory", memory: { tabs: new Map([[7, { site: "www", signedIn: true, acct }]]) } }) as never, read: async () => ({ kind: "value", settings }) as never },
    statuses: { read: async () => ({ kind: "unavailable" }) as never },
    tab: async tabId => native(tabId, null),
    build: "build" as never,
    monitor: working
  })(settingsPage)
  const evidence = await createDiagnostics({
    tabs: { known: async () => [{ tabId: 7, acct, privateTab: false }] as never, runIn: async () => ({ kind: "no-tab", attempted: [] }) as never },
    tab: async tabId => native(tabId, null),
    deliver: async () => true,
    monitor: { diagnostics: async () => undefined as never },
    build: "build" as never,
    consented: () => true,
    now: () => 1
  }).read(false)
  expect(answer?.health).toEqual([])
  expect(evidence).toMatchObject({ kind: "diagnostics", tabs: { www: false, music: false } })
})

test("the popup over a tab that left YouTube covers the site's open tabs, as over any other tab (UI-POP-09)", async () => {
  const settings = defaultSettings()
  settings.cardMenu.on = true
  const tabs = new Map([4, 5].map(tabId => [tabId, { site: "www", signedIn: true, acct }]))
  const answer = await createPageStatus({
    owner: { readSession: async () => ({ kind: "memory", memory: { tabs } }) as never, read: async () => ({ kind: "value", settings }) as never },
    statuses: { read: async () => ({ kind: "unavailable" }) as never },
    tab: async tabId => native(tabId, tabId === 4 ? null : "www"),
    build: "build" as never,
    monitor: async (context, enabled) => ({ kind: "statuses", statuses: enabled.map(feature => status(feature.id, context.tab.tabId === 5 ? "not-working" : "working")) })
  })(ui)
  expect(answer).toEqual({ tab: { kind: "other" }, health: [{ feature: "card-menu", site: "www", state: "not-working", gaps: [] }] })
})

test("a status read reports each registered tab the browser no longer shows on its site, so the registry drops it (UI-SET-17)", async () => {
  const settings = defaultSettings()
  settings.cardMenu.on = true
  // Tab 5 is still on youtube.com, tab 6 closed, tab 7 went to another site and tab 8 went from YouTube to YouTube Music.
  const tabs = new Map([5, 6, 7, 8].map(tabId => [tabId, { site: "www", signedIn: true, acct }]))
  const left: number[] = []
  const read = (requester: UiRequester) =>
    createPageStatus({
      owner: { readSession: async () => ({ kind: "memory", memory: { tabs } }) as never, read: async () => ({ kind: "value", settings }) as never },
      statuses: { read: async () => ({ kind: "unavailable" }) as never },
      tab: async tabId => (tabId === 6 ? ({ kind: "gone" } as never) : native(tabId, tabId === 5 ? "www" : tabId === 8 ? "music" : null)),
      build: "build" as never,
      monitor: working,
      left: tabId => left.push(tabId)
    })(requester)
  expect((await read(settingsPage))?.health).toEqual([{ feature: "card-menu", site: "www", state: "working", gaps: [] }])
  const numerically = (a: number, b: number) => a - b
  expect(left.sort(numerically)).toEqual([6, 7, 8])
  // A private window's page doesn't count normal tabs, and they haven't left their site.
  left.length = 0
  const privatePage = Object.assign({}, settingsPage, { requester: { windowId: 9, incognito: true, activeTabId: 99 } })
  expect((await read(privatePage))?.health).toEqual([])
  expect(left.sort(numerically)).toEqual([6, 7, 8])
})
