import { expect, test } from "bun:test"
import { createDiagnostics } from "./diagnostics"

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
    [4, "playlists"]
  ])
  expect((await diagnostics.read(false)).kind === "diagnostics" && runs.length).toBe(3)
})

test("Check now can't run before consent or with no YouTube tab open, and reading evidence never runs a job", async () => {
  expect(await world({ consented: false }).diagnostics.read(true)).toEqual({ kind: "refused", reason: "consent" })
  const none = world({ tabs: [{ tabId: 9, acct, privateTab: true, site: "www" }] })
  expect(await none.diagnostics.read(true)).toEqual({ kind: "refused", reason: "no-tab" })
  expect(await none.diagnostics.read(false)).toMatchObject({ kind: "diagnostics", tabs: { www: false, music: false }, checks: [] })
  expect(none.runs).toEqual([])
})
