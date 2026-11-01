import {
  createStartingLocalFilterWriter, type LocalWriteStorage
} from "../../../src/background/store/local-filter-writer"
import {
  isInterimCanonicalKey, isInterimSourceKey, type StoreStartupHost
} from "../../../src/background/store/interim-persistence"
import { defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId } from "../../../src/shared/model"
import type { JsonValue } from "../../../src/shared/contracts/json"

export const normal = { kind: "ui", windowId: 7, incognito: false } as const
export const privateWindow = { ...normal, incognito: true } as const
function account(value: string) { if (!isAccountKey(value)) throw Error("synthetic-account"); return value }
export const accountA = account("AAAAAAAAAAAAAAAA")
export const accountB = account("BBBBBBBBBBBBBBBB")
export const accountC = account("CCCCCCCCCCCCCCCC")
export function playlist(value: string) { if (!isPlaylistId(value)) throw Error("synthetic-playlist"); return value }
export const selected = playlist("PL_selected"), kept = playlist("PL_kept"), orphan = playlist("PL_orphan")
export const stamp = { v: 1, gen: "source-generation", at: 1, by: "synthetic-device" }
export function document<T>(data: T) { return { ...stamp, data } }
export function seed(): Record<string, unknown> {
  return {
    schema: 1, device: { ...defaultDevice("synthetic-device"), lastAccount: accountB, marker: "DEVICE-PRIVATE" },
    "doc:settings": document({ ...defaultSettings(), unknown: "SETTINGS-PRIVATE",
      autoAdd: { ...defaultSettings().autoAdd, unknown: "NESTED-PRIVATE" } }),
    [`doc:setup:${accountA}`]: document({ ...defaultSetup(), autoAdd: [{ pl: selected, takes: "videos" }], unknown: "SETUP-PRIVATE" }),
    [`doc:setup:${accountB}`]: document({ ...defaultSetup(), label: { name: "Second account", unknown: "LABEL-PRIVATE" } }),
    [`doc:filter:${accountA}:${selected}`]: document({ mode: "deny", on: true, channels: [] }),
    [`doc:filter:${accountA}:${kept}`]: { ...document({ mode: "allow", on: false, channels: [], unknown: "FILTER-PRIVATE" }), unknown: "ENVELOPE-PRIVATE" },
    [`doc:filter:${accountC}:${orphan}`]: document({ mode: "deny", on: false, channels: [["UC1234567890123456789012", "Orphan channel"]] }),
    unclaimed: { from: "1.5.0", at: 1, autoAdd: [], shortcutPlaylist: null, filters: {}, marker: "UNCLAIMED-PRIVATE" }, sync: { marker: "SYNC-PRIVATE" },
    [`cache:${accountA}`]: { marker: "CACHE-PRIVATE" }, progress: { marker: "PROGRESS-PRIVATE" }
  }
}
export function clone<T>(value: T): T { return structuredClone(value) }
export function gate() {
  let release = () => {}, enter = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { enter = resolve })
  return { release, entered, async wait() { enter(); await held } }
}
export function harness(initial: Record<string, unknown> = seed()) {
  let records = clone(initial)
  const calls: unknown[] = []
  const hooks = { read: async () => {}, set: async () => {}, startup: async () => {}, allocate: false }
  const local: LocalWriteStorage = {
    async get(keys) {
      calls.push({ get: keys }); await hooks.read()
      return clone(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
    },
    async set(items) { calls.push({ set: clone(items) }); await hooks.set(); records = { ...records, ...clone(items) } }
  }
  const startup: StoreStartupHost = {
    context: { deviceId: "synthetic-device", settingsGen: "startup", at: 1, shortcutId: "orig01",
      platform: { browser: "chrome", os: "linux" }, commands: [] },
    async readInterimSnapshot() {
      calls.push("startup.interim"); await hooks.startup()
      return {
        source: clone(Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key)))),
        canonical: clone(Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key)))),
        checkpoint: Object.hasOwn(records, "interimConversion") ? { kind: "present", value: clone(records.interimConversion) } : { kind: "absent" },
        historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" }
      }
    },
    async readSnapshot() {
      calls.push("startup.snapshot"); await hooks.startup()
      return { schema: records.schema, device: clone(records.device), settingsDocument: clone(records["doc:settings"]),
        unclaimed: clone(records.unclaimed), legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] }
    },
    async removeLocal() { throw Error("unexpected-startup-remove") },
    async deleteDatabase() { throw Error("unexpected-startup-database") },
    async removeSession() { throw Error("unexpected-startup-session") }
  }
  const unexpected = (name: string): never => { calls.push(name); throw Error(name) }
  const owner = createStartingLocalFilterWriter({ local, startup, claim: { kind: "unavailable" },
    session: { async get() { return unexpected("session.get") }, async set() { unexpected("session.set") }, async remove() { unexpected("session.remove") } },
    sync: { async get() { return unexpected("sync.get") }, async set(_items: Readonly<Record<string, JsonValue>>) { unexpected("sync.set") }, subscribe() { return unexpected("sync.subscribe") } },
    syncClock: { now() { calls.push("clock.now"); return 0 }, wallNow() { return unexpected("clock.wall") }, after() { return unexpected("clock.after") } },
    now() { if (!hooks.allocate) return unexpected("now"); calls.push("now"); return 100 },
    generation() { if (!hooks.allocate) return unexpected("generation"); calls.push("generation"); return "fresh-generation" }, onSyncResult() { unexpected("sync.result") }
  })
  return { owner, calls, hooks, get records() { return records }, set records(value) { records = value },
    async ready() { await owner.ready(); calls.length = 0 } }
}
