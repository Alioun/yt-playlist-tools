import { expect, test } from "bun:test"
import { createDiagnostics } from "./diagnostics"
import { createSiteHealth } from "../../site/core/health"
import { applyMonitorOperation, emptyMonitorJournal, type MonitorJournal, type MonitorOperation } from "../store/monitor-session"
import { deriveStatus } from "../monitor/derive"
import type { BreakageSignal } from "../../shared/contracts/diagnostics"
import { instance, pageFeature, signalValue, syntheticHealthFacts } from "../../../tools/fixtures/monitor/harness"

const acct = "AAAAAAAAAAAAAAAA"
function world(options: { consented?: boolean; tabs?: { tabId: number; acct: string | null; privateTab: boolean; site: "www" | "music" | null }[] } = {}) {
  const tabs = options.tabs ?? [
    { tabId: 4, acct, privateTab: false, site: "www" },
    { tabId: 5, acct, privateTab: true, site: "www" }
  ]
  const runs: unknown[] = []
  const diagnostics = createDiagnostics({
    tabs: {
      known: async () => tabs.map(({ tabId, acct, privateTab }) => ({ tabId, acct, privateTab })) as never,
      async runIn(tabId, invocation) {
        runs.push([tabId, invocation.job.kind])
        return { kind: "result", tabId, result: invocation.job.kind === "playlists" ? { ok: false, reason: "failed" } : { ok: true, data: {}, route: "r" } } as never
      }
    },
    async deliver(tabId) {
      runs.push([tabId, "deliver"])
    },
    tab: async tabId => {
      const tab = tabs.find(row => row.tabId === tabId)
      return tab ? { kind: "tab", tab: { tabId, windowId: 1, incognito: tab.privateTab, site: tab.site, lastAccessed: tabId, active: true, discarded: false, frozen: false } } : { kind: "gone" }
    },
    monitor: {
      diagnostics: async () =>
        ({
          signals: [
            {
              tabId: 4,
              active: true,
              evidence: { kind: "diagnostic" },
              signal: {
                site: "www",
                feature: null,
                job: "add",
                route: "service.add",
                kind: "fell-back",
                watchId: null,
                shape: null,
                clientVersion: null,
                pageType: "watch",
                count: 1,
                firstSeen: 3,
                lastSeen: 3
              }
            }
          ],
          counters: [],
          seen: {},
          passed: []
        }) as never
    },
    build: "test" as never,
    consented: () => options.consented ?? true,
    now: () => 77
  })
  return { diagnostics, runs }
}

test("Check now runs each read once in the newest normal tab, and the session's signals come with it (HEALTH-23)", async () => {
  const { diagnostics, runs } = world()
  expect(await diagnostics.read(true)).toEqual({
    kind: "diagnostics",
    tabs: { www: true, music: false },
    checks: [
      {
        site: "www",
        at: 77,
        jobs: [
          { job: "account", ok: true },
          { job: "accountLabel", ok: true },
          { job: "playlists", ok: false }
        ]
      }
    ],
    signals: [{ site: "www", feature: null, job: "add", route: "service.add", kind: "fell-back", pageType: "watch", clientVersion: null, shape: null, count: 1, firstSeen: 3, lastSeen: 3 }]
  })
  expect(runs).toEqual([
    [4, "account"],
    [4, "accountLabel"],
    [4, "playlists"],
    [4, "deliver"]
  ])
  expect((await diagnostics.read(false)).kind === "diagnostics" && runs.length).toBe(4)
})

test("Check now can't run before consent or with no YouTube tab open, and reading evidence never runs a job", async () => {
  expect(await world({ consented: false }).diagnostics.read(true)).toEqual({ kind: "refused", reason: "consent" })
  const none = world({ tabs: [{ tabId: 9, acct, privateTab: true, site: "www" }] })
  expect(await none.diagnostics.read(true)).toEqual({ kind: "refused", reason: "no-tab" })
  expect(await none.diagnostics.read(false)).toMatchObject({ kind: "diagnostics", tabs: { www: false, music: false }, checks: [] })
  expect(none.runs).toEqual([])
})

test("Check now answers once its reads' signals have reached the Monitor, so the report and statuses agree with its result (HEALTH-23)", async () => {
  let journal: MonitorJournal = structuredClone(emptyMonitorJournal),
    sequence = 0,
    raise: (signal: BreakageSignal) => void = () => {}
  const health = createSiteHealth({
    site: "www",
    page: {
      onSignal(listener) {
        raise = listener
        return () => {}
      },
      state: { kind: "ready", snapshot: { pageType: "watch" } } as never
    },
    async send(reports) {
      for (const report of reports)
        journal = applyMonitorOperation(journal, {
          ...(report.kind === "signal" ? { kind: "signal", signal: report.signal, evidence: { kind: "job", online: true, otherRequestsAnswer: true } } : report),
          instance: instance(),
          sequence: ++sequence,
          tabId: 4,
          site: "www"
        } as MonitorOperation)
      return null
    },
    now: () => 100,
    online: () => true,
    // The 5 s batch timer never fires here, so only Check now's own delivery can carry the signal.
    later: () => () => {}
  })
  const deps = {
    tabs: {
      known: async () => [{ tabId: 4, acct, privateTab: false }] as never,
      async runIn(_tabId: number, invocation: { readonly job: { readonly kind: string } }) {
        if (invocation.job.kind === "playlists") {
          raise(signalValue("unrecognised", { feature: null, job: "playlists", firstSeen: 100, lastSeen: 100 }))
          return { kind: "result", tabId: 4, result: { ok: false, reason: "unavailable" } } as never
        }
        return { kind: "result", tabId: 4, result: { ok: true, data: {}, route: "r" } } as never
      }
    },
    tab: async () => ({ kind: "tab", tab: { tabId: 4, windowId: 1, incognito: false, site: "www", lastAccessed: 4, active: true, discarded: false, frozen: false } }) as never,
    monitor: { diagnostics: async () => journal as never },
    deliver: async () => health.deliver(),
    build: "test" as never,
    consented: () => true,
    now: () => 100
  }
  const result = await createDiagnostics(deps).read(true)
  if (result.kind !== "diagnostics") throw Error("Check now refused")
  expect(result.checks[0]?.jobs).toContainEqual({ job: "playlists", ok: false })
  expect(result.signals).toMatchObject([{ job: "playlists", kind: "unrecognised" }])
  expect(deriveStatus({ enabled: [pageFeature("quick-save")], facts: syntheticHealthFacts("www"), journal, tabId: 4 })).toMatchObject({ statuses: [{ feature: "quick-save", state: "partly-working" }] })
})
