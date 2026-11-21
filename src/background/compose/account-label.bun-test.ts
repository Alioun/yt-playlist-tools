import { expect, test } from "bun:test"
import type { AccountInView, Requester, TabContext } from "../tabs/ports"
import type { LiveLabel } from "../accounts/accounts"
import { composeAccountLabel } from "./account-label"

const acct = "AAAAAAAAAAAAAAAA" as never
const normal: Requester = { windowId: 1, incognito: false, activeTabId: 4 }
const privately: Requester = { windowId: 2, incognito: true, activeTabId: 5 }
const tab = (tabId: number, incognito: boolean) => ({ tabId, windowId: incognito ? 2 : 1, incognito, site: "www" as const, lastAccessed: 0, active: true, discarded: false, frozen: false })

function world(view: AccountInView, answer: LiveLabel = { kind: "label", acct, label: { name: "Alex Doe", handle: "@alexdoe" }, persistence: "caller-owned" }) {
  const reads: TabContext[] = []
  let now = 1_000
  const read = composeAccountLabel({
    tabs: { accountInView: async requester => (requester.incognito && view.kind === "account" && view.source !== "last-account" ? { ...view, tabId: 5 } : view) },
    tab: async tabId => ({ kind: "tab", tab: tab(tabId, tabId === 5) }),
    accounts: {
      async readLiveLabel(context) {
        reads.push(context)
        return answer
      }
    },
    build: "test" as never,
    now: () => now
  })
  return { read, reads, later: (ms: number) => { now += ms } }
}

test("an account with no setup is named from its tab's live label, as that tab's account (ACC-17)", async () => {
  const w = world({ kind: "account", source: "active", tabId: 4, signedIn: true, acct })
  expect(await w.read(normal)).toEqual({ kind: "label", acct, label: { name: "Alex Doe", handle: "@alexdoe" } })
  expect(w.reads.map(context => ({ tab: context.tab.tabId, info: context.info }))).toEqual([{ tab: 4, info: { site: "www", build: "test" as never, signedIn: true, acct } }])
})

test("a normal window's label is kept in memory for a day; a private window's is read each time (ACC-08, ACC-18)", async () => {
  const w = world({ kind: "account", source: "recent", tabId: 4, signedIn: true, acct })
  await w.read(normal)
  await w.read(normal)
  expect(w.reads).toHaveLength(1)
  w.later(86_400_000)
  await w.read(normal)
  expect(w.reads).toHaveLength(2)
  await w.read(privately)
  await w.read(privately)
  expect(w.reads.map(context => context.tab.incognito)).toEqual([false, false, true, true])
})

test("signed out, a stored last account, a setup or a failed read names nothing live", async () => {
  expect(await world({ kind: "account", source: "active", tabId: 4, signedIn: false, acct: null }).read(normal)).toEqual({ kind: "none" })
  expect(await world({ kind: "account", source: "last-account", acct }).read(normal)).toEqual({ kind: "none" })
  expect(await world({ kind: "none" }).read(normal)).toEqual({ kind: "none" })
  const withSetup = world({ kind: "account", source: "active", tabId: 4, signedIn: true, acct }, { kind: "setup-present" })
  expect(await withSetup.read(normal)).toEqual({ kind: "none" })
  const failed = world({ kind: "account", source: "active", tabId: 4, signedIn: true, acct }, { kind: "lookup-failed", outcome: { kind: "invalid-label" } })
  expect(await failed.read(normal)).toEqual({ kind: "none" })
  await failed.read(normal)
  expect(failed.reads).toHaveLength(2)
})
