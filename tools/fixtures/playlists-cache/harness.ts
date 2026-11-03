import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { createTabs } from "../../../src/background/tabs/tabs"
import type { NativeTab, TabNativePort, TabsPorts } from "../../../src/background/tabs/ports"
import { createPlaylists } from "../../../src/background/playlists/playlists"
import { isJobResultFor, type Job, type JobInvocation, type JobResult } from "../../../src/shared/contracts/jobs"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { isPlaylistId, isVideoId, type PlaylistId, type VideoId } from "../../../src/shared/model"
import { createRemovalHarness, removalFixture, type RemovalFixtureState } from "../account-removal-execution/run"
import { a, b, build, manualClock, nativeTab, normal, privateRequester, signedIn, type NativeCall } from "../tabs/harness"
import type { TabPing } from "../../../src/shared/contracts/tabs"
export { a, b, build, nativeTab, normal, privateRequester, signedIn }

function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw Error("Invalid fixture playlist")
  return value
}
export const alpha = playlist("PL_alpha"),
  beta = playlist("PL_beta"),
  created = playlist("PL_created")
function validVideo(value: string): VideoId {
  if (!isVideoId(value)) throw Error("Invalid fixture video")
  return value
}
export const video = validVideo("aaaaaaaaaaa")
export const epoch = 1_700_000_000_000
export const normalRequest = { site: "www", req: normal } as const
export const privateRequest = { site: "www", req: privateRequester } as const
export const origin = { kind: "ui", windowId: 1, incognito: false } as const
export const oldCache: JsonObject = {
  listAt: epoch - 300_001,
  playlists: [
    { id: alpha, title: "Alpha", privacy: "PRIVATE", count: 4, thumb: "https://img.test/alpha.jpg" },
    { id: beta, title: "Beta", privacy: "UNLISTED", count: 8 }
  ],
  order: { www: [beta, alpha], music: [alpha, beta] },
  created: [],
  labelAt: 42
}
export function seed(): RemovalFixtureState {
  const inherited = removalFixture()
  return {
    ...inherited,
    local: {
      ...inherited.local,
      [`cache:${a}`]: structuredClone(oldCache),
      [`cache:${b}`]: { listAt: epoch, playlists: [{ id: beta, title: "Other account" }], order: {}, created: [], labelAt: null }
    },
    session: { unknown: { keep: true } }
  }
}
export function deferred<T>() {
  let resolve: (answer: T) => void = () => {
    throw Error("Deferred is not ready")
  }
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
export type CacheFault = "none" | "rejected-unchanged" | "rejected-applied" | "resolved-unchanged" | "mismatched" | "unreadable"
export function world(initial = seed()) {
  const removal = createRemovalHarness(initial),
    clock = manualClock(),
    calls: NativeCall[] = []
  const tabs = new Map<number, NativeTab>(),
    pings = new Map<number, TabPing>()
  let fault: CacheFault = "none",
    unreadable = false,
    cacheWrites = 0
  const local = {
    async get(keys: readonly string[] | null) {
      if (unreadable) {
        unreadable = false
        throw Error("Synthetic readback unavailable")
      }
      return removal.deps.local.get(keys)
    },
    async set(items: Readonly<Record<string, JsonValue>>) {
      if (!Object.keys(items).some(key => key.startsWith("cache:"))) return removal.deps.local.set(items)
      cacheWrites++
      if (fault === "rejected-unchanged") throw Error("Synthetic unchanged rejection")
      if (fault === "resolved-unchanged") return
      if (fault === "mismatched") {
        await removal.deps.local.set(
          Object.fromEntries(
            Object.entries(items).map(([key, value]) => [key, isJsonValue(value) && value !== null && typeof value === "object" && !Array.isArray(value) ? { ...value, labelAt: 999 } : value])
          )
        )
        return
      }
      await removal.deps.local.set(items)
      if (fault === "rejected-applied") throw Error("Synthetic post-apply rejection")
      if (fault === "unreadable") unreadable = true
    }
  }
  const owner = createLocalFilterWriter({ ...removal.deps, local, now: clock.wallNow })
  let run = async (_tabId: number, _invocation: JobInvocation): Promise<unknown> => ({ ok: false, reason: "unavailable" })
  const native: TabNativePort = {
    async query(site) {
      calls.push({ kind: "query", site })
      return { kind: "tabs", tabs: [...tabs.values()].filter(tab => site === "all" || tab.site === site) }
    },
    async get(tabId) {
      calls.push({ kind: "get", tabId })
      const tab = tabs.get(tabId)
      return tab ? { kind: "tab", tab } : { kind: "gone" }
    },
    async ping(tabId, milliseconds) {
      calls.push({ kind: "ping", tabId, milliseconds })
      const result = pings.get(tabId)
      return result ? { kind: "answered", result } : { kind: "failed", failure: "transport" }
    },
    async run<J extends Job>(tabId: number, invocation: JobInvocation<J>, milliseconds: number) {
      calls.push({ kind: "run", tabId, invocation, milliseconds })
      const answer = await run(tabId, invocation)
      const checked: { kind: "answered"; result: JobResult<J> } | { kind: "failed"; failure: "invalid-answer" } = isJobResultFor<J>(invocation.job, answer)
        ? { kind: "answered", result: answer }
        : { kind: "failed", failure: "invalid-answer" }
      return checked
    },
    async view() {
      return { kind: "answered", result: null }
    },
    dispose() {
      calls.push({ kind: "dispose" })
    }
  }
  const ports: TabsPorts = {
    native,
    clock,
    session: { read: () => owner.readSession(), change: input => owner.changeSession(input) },
    enabled: () => true,
    registrar: {
      async ensure(tabId, need) {
        calls.push({ kind: "ensure", tabId, site: need.site, core: true })
        return { kind: "ready" }
      }
    },
    accounts: {
      async lastAccount() {
        const answer = await owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false })
        return answer.kind === "account" ? answer.acct : null
      },
      async hasSetup(acct) {
        const answer = await owner.readPlaylistCache({ acct, private: true })
        return answer.kind === "cache" && (answer.authority.kind === "eligible" || answer.authority.reason !== "no-setup")
      }
    }
  }
  const engine = createTabs(ports),
    playlists = createPlaylists({ owner, tabs: engine, now: clock.wallNow })
  return {
    owner,
    engine,
    playlists,
    removal,
    calls,
    clock,
    tabs,
    pings,
    seedTab(tab = nativeTab(1), ping = signedIn()) {
      tabs.set(tab.tabId, tab)
      pings.set(tab.tabId, ping)
    },
    script(fn: typeof run) {
      run = fn
    },
    fault(value: CacheFault) {
      fault = value
    },
    get cacheWrites() {
      return cacheWrites
    },
    stored() {
      return removal.state().local
    },
    runs(kind: Job["kind"]) {
      return calls.filter(call => call.kind === "run" && call.invocation.job.kind === kind)
    },
    async dispose() {
      playlists.dispose()
      engine.dispose()
      await owner.dispose()
    }
  }
}
export function success(data: unknown) {
  return { ok: true, route: "playlists-cache-fixture", data }
}
