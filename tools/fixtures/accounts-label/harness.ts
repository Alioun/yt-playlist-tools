import { createAccounts, type Claiming } from "../../../src/background/accounts/accounts"
import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { NativeTab, TabNativePort, TabContext, TabsPorts } from "../../../src/background/tabs/ports"
import { isJobResultFor, type Job, type JobInvocation, type JobResult } from "../../../src/shared/contracts/jobs"
import type { TabPing } from "../../../src/shared/contracts/tabs"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { type AccountKey, type AccountLabel } from "../../../src/shared/model"
import { createRemovalHarness, type RemovalFixtureState } from "../account-removal-execution/run"
import { a, b, build, manualClock, nativeTab, signedIn, signedOut, type NativeCall } from "../tabs/harness"
import { alpha, beta, epoch, oldCache, deferred, origin } from "../playlists-cache/harness"
export { a, b, build, alpha, beta, epoch, oldCache, deferred, origin, signedIn, signedOut }

export function object(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Expected fixture JSON object")
  return value
}
export function seed(): RemovalFixtureState {
  const stamp = (data: JsonObject) => ({ v: 1, gen: "original", at: 1, by: "fixture", data })
  return { local: {
    schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, extension: { keep: true } },
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false, everEdited: false },
    "doc:settings": stamp({}),
    [`doc:setup:${a}`]: stamp({ label: { name: "Original" }, quickSave: alpha, marks: { [alpha]: "missing" }, extension: { keep: true } }),
    [`doc:setup:${b}`]: stamp({ label: { name: "Other" }, gather: beta }),
    [`cache:${a}`]: { ...structuredClone(oldCache), labelAt: null,
      created: [{ id: "PL_pending", title: "Pending", privacy: "PRIVATE", at: epoch - 1 }], extension: { keep: true } },
    unclaimed: null, unrelated: { keep: true }
  }, sync: {}, session: { unknown: { keep: true } } }
}
export type WriteFault = "none" | "rejected-unchanged" | "rejected-applied" | "resolved-unchanged" | "mismatched" | "unreadable"
export function world(initial = seed(), claim?: Claiming) {
  const removal = createRemovalHarness(initial), timer = manualClock(), calls: NativeCall[] = []
  const tabs = new Map<number, NativeTab>(), pings = new Map<number, TabPing>()
  let wall = epoch, unreadable = false, reads = 0, writes = 0
  let fault: { readonly stage: "metadata" | "label"; readonly kind: WriteFault } = { stage: "metadata", kind: "none" }
  const clock = { ...timer, wallNow: () => wall }
  const local = {
    async get(keys: readonly string[] | null) {
      reads++
      if (unreadable) { unreadable = false; throw Error("Synthetic unavailable label readback") }
      return removal.deps.local.get(keys)
    },
    async set(items: Readonly<Record<string, JsonValue>>) {
      writes++
      const stage = Object.keys(items).some(key => key.startsWith("doc:setup:")) ? "label" : "metadata"
      const kind = fault.stage === stage ? fault.kind : "none"
      if (kind === "rejected-unchanged") throw Error("Synthetic unchanged label rejection")
      if (kind === "resolved-unchanged") return
      await removal.deps.local.set(items)
      if (kind === "mismatched") removal.foreign(state => { state.local.unrelated = { misleading: true } })
      if (kind === "rejected-applied") throw Error("Synthetic applied label rejection")
      if (kind === "unreadable") unreadable = true
    }
  }
  const owner = createLocalFilterWriter({ ...removal.deps, local, now: clock.wallNow, syncClock: clock })
  let script = async (_tab: number, _job: JobInvocation): Promise<unknown> => success({ name: "Original" })
  const native: TabNativePort = {
    async query(site) { calls.push({ kind: "query", site }); return { kind: "tabs", tabs: [...tabs.values()].filter(tab => site === "all" || site === tab.site) } },
    async get(tabId) { calls.push({ kind: "get", tabId }); const tab = tabs.get(tabId); return tab ? { kind: "tab", tab } : { kind: "gone" } },
    async ping(tabId, milliseconds) { calls.push({ kind: "ping", tabId, milliseconds }); const result = pings.get(tabId); return result ? { kind: "answered", result } : { kind: "failed", failure: "transport" } },
    async run<J extends Job>(tabId: number, invocation: JobInvocation<J>, milliseconds: number) {
      calls.push({ kind: "run", tabId, invocation, milliseconds })
      const answer = await script(tabId, invocation)
      const checked: { kind: "answered"; result: JobResult<J> } | { kind: "failed"; failure: "invalid-answer" } =
        isJobResultFor<J>(invocation.job, answer) ? { kind: "answered", result: answer } : { kind: "failed", failure: "invalid-answer" }
      return checked
    },
    async view() { return { kind: "answered", result: null } },
    dispose() {}
  }
  const ports: TabsPorts = { native, clock, enabled: () => true,
    session: { read: () => owner.readSession(), change: change => owner.changeSession(change) },
    registrar: { async ensure() { return { kind: "unavailable" } } },
    accounts: {
      async lastAccount() { const result = await owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false }); return result.kind === "account" ? result.acct : null },
      async hasSetup(acct) { const read = await owner.readSetup(acct); return read.kind === "value" && read.view.kind === "live" }
    } }
  const engine = createTabs(ports)
  const accounts = createAccounts({ owner, tabs: engine, now: clock.wallNow, claim: claim ?? { kind: "unavailable", reason: "production-ownership-required" } })
  function context(acct: AccountKey = a, tabId = 1, incognito = false): TabContext {
    const tab = { ...nativeTab(tabId, { incognito, windowId: incognito ? 2 : 1 }), site: "www" as const }
    const info = signedIn(acct)
    tabs.set(tabId, tab); pings.set(tabId, info)
    return { tab, info }
  }
  return { owner, engine, accounts, removal, calls, tabs, pings, clock, context,
    script(fn: typeof script) { script = fn },
    fault(stage: "metadata" | "label", kind: WriteFault) { fault = { stage, kind } },
    advance(ms: number) { wall += ms; timer.advance(ms) }, wall(value: number) { wall = value },
    stored: () => removal.state().local,
    get reads() { return reads }, get writes() { return writes },
    runs: () => calls.filter(call => call.kind === "run"),
    label(acct: AccountKey = a) { return object(object(removal.state().local[`doc:setup:${acct}`]).data).label },
    async dispose() { accounts.dispose(); engine.dispose(); await owner.dispose() }
  }
}
export function success(label: AccountLabel) { return { ok: true, route: "accounts-label-fixture", data: label } }
