import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { SessionPort } from "../../../src/background/store/session-memory"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { NativeTab, Requester, TabNativePort, TabsPorts, TabViewProducer, TabReply } from "../../../src/background/tabs/ports"
import { isAccountKey, type AccountKey } from "../../../src/shared/model/validation"
import { isBuildId, type BuildId } from "../../../src/shared/contracts/vocabulary"
import { isJobResultFor, type AccountData, type Job, type JobInvocation, type JobResult } from "../../../src/shared/contracts/jobs"
import { isTabPing, type TabPing, type TabViewScope } from "../../../src/shared/contracts/tabs"
import { objectShape } from "../../../src/shared/contracts/object-shape"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { createRemovalHarness, removalFixture, type RemovalFixtureState } from "../account-removal-execution/run"

function account(value: string): AccountKey {
  if (!isAccountKey(value)) throw Error("Invalid fixture account")
  return value
}
function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw Error("Invalid fixture build")
  return value
}
export const a = account("AAAAAAAAAAAAAAAA"),
  b = account("BBBBBBBBBBBBBBBB"),
  build = buildId("tabs-fixture")
export const normal: Requester = { windowId: 1, incognito: false, activeTabId: 1 }
export const privateRequester: Requester = { windowId: 2, incognito: true, activeTabId: 9 }
export const anyAccount = { kind: "any" } as const
export const accountA = { kind: "account", acct: a, signedIn: true } as const
export const signedIn = (acct = a): TabPing => ({ site: "www", build, acct, signedIn: true })
export const signedOut = (): TabPing => ({ site: "www", build, acct: null, signedIn: false })
export const nativeTab = (tabId: number, patch: Partial<NativeTab> = {}): NativeTab => ({
  tabId,
  windowId: 1,
  incognito: false,
  site: "www",
  lastAccessed: tabId,
  active: tabId === 1,
  discarded: false,
  frozen: false,
  ...patch
})
export function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
export async function settle() {
  for (let n = 0; n < 80; n++) await Promise.resolve()
}
export function manualClock() {
  let now = 0
  const timers = new Set<{ at: number; run: () => void }>()
  return {
    now: () => now,
    wallNow: () => 1_700_000_000_000 + now,
    after(ms: number, run: () => void) {
      const timer = { at: now + ms, run }
      timers.add(timer)
      return () => {
        timers.delete(timer)
      }
    },
    advance(ms: number) {
      now += ms
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) if (timer.at <= now && timers.delete(timer)) timer.run()
    },
    get pending() {
      return timers.size
    }
  }
}

// This is an explicit fixture projection. Production must supply its complete account-scoped TabView.
export type FixtureView = TabViewScope & { readonly fixture: "account-scoped" }
export function isFixtureView(value: unknown): value is FixtureView {
  const fields = { private: (v: unknown) => typeof v === "boolean", build: isBuildId, fixture: (v: unknown) => v === "account-scoped" }
  return objectShape(value, { ...fields, signedIn: v => v === true, acct: isAccountKey }) || objectShape(value, { ...fields, signedIn: v => v === false, acct: v => v === null })
}
export const fixtureView: TabViewProducer<FixtureView> = {
  isView: isFixtureView,
  async produce({ tab, info }) {
    const account: AccountData = info.signedIn ? { signedIn: true, acct: info.acct } : { signedIn: false, acct: null }
    return { kind: "view", view: { private: tab.incognito, build: info.build, fixture: "account-scoped", ...account } }
  }
}
export type NativeCall =
  | { kind: "query"; site: "www" | "music" | "all" }
  | { kind: "get"; tabId: number }
  | { kind: "ping"; tabId: number; milliseconds: number }
  | { kind: "ensure"; tabId: number; site: "www" | "music"; core: true }
  | { kind: "run"; tabId: number; invocation: JobInvocation; milliseconds: number }
  | { kind: "view"; tabId: number; view: TabViewScope; milliseconds: number }
  | { kind: "dispose" | "last-account" }
  | { kind: "has-setup"; acct: AccountKey }
export function tabsFixture(seed?: RemovalFixtureState) {
  const removal = createRemovalHarness(seed ?? { ...removalFixture(), session: { unknown: { keep: true } } })
  const owner = createLocalFilterWriter(removal.deps)
  const session: SessionPort = { read: () => owner.readSession(), change: change => owner.changeSession(change) }
  const clock = manualClock(),
    calls: NativeCall[] = []
  const tabs = new Map<number, NativeTab>(),
    accounts = new Map<number, TabPing>()
  let enabled = true,
    lastAccount: AccountKey | null = a
  const setups = new Set<AccountKey>([a, b])
  const hooks = {
    get: async (_tabId: number) => {},
    ping: async (tabId: number): Promise<TabReply<TabPing>> => {
      const info = accounts.get(tabId)
      return info ? { kind: "answered", result: info } : { kind: "failed", failure: "transport" }
    },
    ensure: async (_tabId: number): Promise<{ kind: "ready" | "unavailable" }> => ({ kind: "ready" }),
    run: async (_tabId: number, _invocation: JobInvocation): Promise<unknown> => ({ ok: false, reason: "unavailable" }),
    view: async (_tabId: number): Promise<TabReply<null>> => ({ kind: "answered", result: null })
  }
  const native: TabNativePort = {
    async query(site) {
      calls.push({ kind: "query", site })
      return { kind: "tabs", tabs: [...tabs.values()].filter(tab => site === "all" || tab.site === site) }
    },
    async get(tabId) {
      calls.push({ kind: "get", tabId })
      await hooks.get(tabId)
      const tab = tabs.get(tabId)
      return tab ? { kind: "tab", tab } : { kind: "gone" }
    },
    ping(tabId, milliseconds) {
      calls.push({ kind: "ping", tabId, milliseconds })
      return hooks.ping(tabId)
    },
    async run<J extends Job>(tabId: number, invocation: JobInvocation<J>, milliseconds: number): Promise<TabReply<JobResult<J>>> {
      calls.push({ kind: "run", tabId, invocation, milliseconds })
      const answer = await hooks.run(tabId, invocation)
      return isJobResultFor<J>(invocation.job, answer) ? { kind: "answered", result: answer } : { kind: "failed", failure: "invalid-answer" }
    },
    view(tabId, view, _isView, milliseconds) {
      calls.push({ kind: "view", tabId, view, milliseconds })
      return hooks.view(tabId)
    },
    dispose() {
      calls.push({ kind: "dispose" })
    }
  }
  const ports: TabsPorts = {
    session,
    native,
    clock,
    enabled: () => enabled,
    registrar: {
      ensure(tabId, need) {
        calls.push({ kind: "ensure", tabId, site: need.site, core: need.core })
        return hooks.ensure(tabId)
      }
    },
    accounts: {
      async lastAccount() {
        calls.push({ kind: "last-account" })
        return lastAccount
      },
      async hasSetup(acct) {
        calls.push({ kind: "has-setup", acct })
        return setups.has(acct)
      }
    }
  }
  const engine = createTabs(ports),
    engines = [engine]
  return {
    engine,
    owner,
    session,
    removal,
    clock,
    calls,
    hooks,
    tabs,
    accounts,
    ports,
    setups,
    seedTab(tab: NativeTab, info?: TabPing) {
      tabs.set(tab.tabId, tab)
      if (info) {
        if (!isTabPing(info)) throw Error("Invalid fixture ping")
        accounts.set(tab.tabId, info)
      }
    },
    restart() {
      const next = createTabs(ports)
      engines.push(next)
      return next
    },
    setEnabled(value: boolean) {
      enabled = value
    },
    setLastAccount(value: AccountKey | null) {
      lastAccount = value
    },
    sessionWrites() {
      return removal.io.filter(io => io.phase === "invoked" && /^session\.(set|remove):/.test(io.kind)).map(io => io.kind)
    },
    stored(): JsonObject {
      return removal.state().session
    },
    async dispose() {
      for (const engine of engines) engine.dispose()
      await owner.dispose()
    }
  }
}
