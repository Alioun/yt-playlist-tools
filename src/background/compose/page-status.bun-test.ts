import { expect, test } from "bun:test"
import { createPageStatus } from "./page-status"
import { defaultSettings } from "../../shared/model/defaults"
import type { EnabledMonitorFeature, MonitorStatus } from "../monitor/ports"
import type { UiRequester } from "../adapters/ui-requester"

const acct = "AAAAAAAAAAAAAAAA" as never
const ui = { ui: { kind: "ui", page: "popup", origin: { kind: "ui", windowId: 3, incognito: false } },
  requester: { windowId: 3, incognito: false, activeTabId: 4 }, principal: "p" } as unknown as UiRequester
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
    statuses: { read: async () => { throw Error("page statuses alone") } },
    tab: async () => ({ kind: "tab", tab: { id: 4, windowId: 3, incognito: false, url: "https://www.youtube.com/" } }) as never,
    build: "build" as never,
    syncOn: async () => true,
    monitor: async (_context, enabled: readonly EnabledMonitorFeature[]) => {
      asked.push(enabled.map(feature => feature.id))
      return { kind: "statuses", statuses: [status("browser-menu", "not-working"), status("any-tab-keys", "working"),
        status("gather", "partly-working", ["queue"]), status("sync", "working")] }
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
