import { fakeBrowser } from "wxt/testing/fake-browser"
import { createStoreStartupHost, isStartupValueKey } from "../../../src/background/adapters/startup-source"
import type { BrowserStartingOwnerOptions } from "../../../src/background/adapters/starting-owner"
import type { JsonObject } from "../../../src/shared/contracts/json"

type NativeBrowser = typeof import("wxt/browser").browser
type SyncListener = Parameters<NativeBrowser["storage"]["sync"]["onChanged"]["addListener"]>[0]

export function check(value: unknown, message: string): asserts value { if (!value) throw Error(message) }
export function copy<T>(value: T): T { return structuredClone(value) }
export function gate() {
  let release = () => {}, enter = () => {}
  const held = new Promise<void>(done => { release = done })
  const entered = new Promise<void>(done => { enter = done })
  return { entered, release, async wait() { enter(); await held } }
}

export function agreedSeed(syncOn = false): JsonObject {
  return {
    schema: 1, device: { id: "starting-fixture", consent: { v: 1, at: 1 }, syncOn },
    "doc:settings": { v: 1, gen: "settings-0", at: 1, by: "starting-fixture", data: {} },
    sync: { joined: syncOn ? "history" : null, pushed: syncOn ? { "doc:settings": "settings-0" } : {},
      status: syncOn ? "ok" : "off", editedSinceOff: false, everEdited: false }
  }
}

export function startingOwnerFixture(initial: JsonObject = {}) {
  let records = copy(initial), sessionRecords: JsonObject = {}, generation = 0
  let remote: JsonObject = { "s:meta": { v: 1, id: "history", created: 0 } }
  for (const [name, value] of Object.entries(records)) if (name.startsWith("doc:")) remote[`s:${name.slice(4)}`] = copy(value)
  const counts = { rawLocal: 0, localRead: 0, localSet: 0, localRemove: 0, sessionGet: 0, sessionSet: 0, sessionRemove: 0, syncGet: 0, syncSet: 0, adds: 0, removes: 0 }
  const localBatches: JsonObject[] = [], localRemovals: string[][] = [], sessionBatches: unknown[] = [], sessionRemovals: unknown[] = []
  const listeners = new Set<SyncListener>(), allListeners: SyncListener[] = []
  const timers: { readonly run: () => void; cancelled: boolean }[] = []
  const results: Parameters<BrowserStartingOwnerOptions["onSyncResult"]>[0][] = []
  const hooks = { localRead: async () => {}, localRemove: async (_names: readonly string[]) => {}, sessionRead: async () => {}, syncRead: async () => {} }
  const faults: { removeListener?: Error; addListener?: Error; cancelTimer?: Error } = {}
  const rawLocal = new Proxy(fakeBrowser.storage.local, {
    get(target, key, receiver) {
      if (key === "remove") return new Proxy(target.remove, { async apply(_fn, _this, args: [unknown]) {
        const names = args[0]
        check(Array.isArray(names) && names.every((name): name is string => typeof name === "string"), "native local removal names exact keys")
        counts.localRemove++; localRemovals.push([...names]); await hooks.localRemove(names)
        for (const name of names) delete records[name]
      } })
      if (["get", "set", "clear", "getKeys", "getBytesInUse"].includes(String(key))) {
        return () => { counts.rawLocal++; throw Error("Raw native local is forbidden") }
      }
      return Reflect.get(target, key, receiver)
    }
  })
  const nativeSession = new Proxy(fakeBrowser.storage.session, {
    get(target, key, receiver) {
      if (key === "get") return new Proxy(target.get, { async apply(_fn, _this, args: [unknown]) {
        check(args[0] === null, "native session reads the exact canonical collection")
        counts.sessionGet++; await hooks.sessionRead(); return copy(sessionRecords)
      } })
      if (key === "set") return new Proxy(target.set, { async apply(_fn, _this, args: [JsonObject]) {
        counts.sessionSet++; sessionBatches.push(copy(args[0])); sessionRecords = { ...sessionRecords, ...copy(args[0]) }
      } })
      if (key === "remove") return new Proxy(target.remove, { async apply(_fn, _this, args: [string[]]) {
        counts.sessionRemove++; sessionRemovals.push(copy(args[0])); for (const name of args[0]) delete sessionRecords[name]
      } })
      return Reflect.get(target, key, receiver)
    }
  })
  const event = new Proxy(fakeBrowser.storage.sync.onChanged, {
    get(target, key, receiver) {
      if (key === "addListener") return (listener: SyncListener) => {
        counts.adds++; listeners.add(listener); allListeners.push(listener)
        if (faults.addListener) throw faults.addListener
      }
      if (key === "removeListener") return (listener: SyncListener) => {
        counts.removes++
        if (faults.removeListener) throw faults.removeListener
        listeners.delete(listener)
      }
      if (key === "hasListener") return (listener: SyncListener) => listeners.has(listener)
      if (key === "hasListeners") return () => listeners.size > 0
      return Reflect.get(target, key, receiver)
    }
  })
  const nativeSync = new Proxy(fakeBrowser.storage.sync, {
    get(target, key, receiver) {
      if (key === "get") return new Proxy(target.get, { async apply(_fn, _this, args: [unknown]) {
        check(args[0] === null, "native sync reads the canonical collection")
        counts.syncGet++; await hooks.syncRead(); return copy(remote)
      } })
      if (key === "set") return new Proxy(target.set, { async apply(_fn, _this, args: [JsonObject]) {
        counts.syncSet++; remote = { ...remote, ...copy(args[0]) }
      } })
      if (key === "onChanged") return event
      return Reflect.get(target, key, receiver)
    }
  })
  const local: BrowserStartingOwnerOptions["local"] = {
    async get(keys) {
      counts.localRead++; await hooks.localRead()
      return copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
    },
    async set(items) { counts.localSet++; localBatches.push(copy(items)); records = { ...records, ...copy(items) } }
  }
  const startup = createStoreStartupHost({
    context: { deviceId: "starting-fixture", settingsGen: "starting-migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
    source: { async readInventory() {
      return { presentLocalKeys: Object.keys(records), values: copy(Object.fromEntries(Object.entries(records).filter(([key]) => isStartupValueKey(key)))),
        legacyAuthorization: { kind: "observed", refreshTokenWasNonempty: false }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }
    } },
    cleanup: {
      async removeLocal() { throw Error("Unexpected fixture legacy cleanup") },
      async deleteDatabase() { throw Error("Unexpected fixture database cleanup") },
      async removeSession() { throw Error("Unexpected fixture session cleanup") }
    }
  })
  const options: BrowserStartingOwnerOptions = {
    local, startup, now: () => 200, generation: () => `starting-${++generation}`,
    syncClock: { now: () => 0, wallNow: () => 1_000_000, after(_milliseconds, run) {
      const timer = { run, cancelled: false }; timers.push(timer)
      return () => { if (faults.cancelTimer) throw faults.cancelTimer; timer.cancelled = true }
    } },
    onSyncResult: result => { results.push(result) }
  }
  const native = { ...fakeBrowser, storage: { ...fakeBrowser.storage, local: rawLocal, session: nativeSession, sync: nativeSync } }
  return { native, options, counts, localBatches, localRemovals, sessionBatches, sessionRemovals, listeners, allListeners, timers, results, hooks, faults,
    records: () => copy(records), session: () => copy(sessionRecords),
    mutate(change: (current: JsonObject) => void) { change(records) },
    /** Another browser's synced copy, as the browser's own sync delivered it. */
    replaceRemote(value: JsonObject) { remote = copy(value) },
    remote: () => copy(remote),
    seedSession(value: JsonObject) { sessionRecords = copy(value) },
    fire() { for (const listener of [...listeners]) listener({}) },
    fireLate() { for (const listener of allListeners) listener({}); for (const timer of timers) timer.run() }
  }
}
