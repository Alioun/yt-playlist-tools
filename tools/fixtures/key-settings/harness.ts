import { createStartingLocalFilterWriter, type ConfirmedViewChange } from "../../../src/background/store/local-filter-writer"
import { createBrowserStartingLocalFilterWriter } from "../../../src/background/adapters/starting-owner"
import { nativeSharedSettingsAccess } from "../../../src/background/adapters/shared-settings"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import { createBrowserBackend } from "../../../src/ui/backend/browser"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import type { KeySettingChange, KeySettingAnswer } from "../../../src/shared/contracts/key-settings"
import { keyForWire, keyAt } from "../../../src/shared/contracts/key-settings-fields"
import type { ShortcutTarget } from "../../../src/shared/keys"
import { decodeSettings, isAccountKey, isShortcutId, type Key } from "../../../src/shared/model"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { startingOwnerFixture } from "../starting-owner/support"
import seedData from "./seed.json"
import { isJsonValue } from "../../../src/shared/contracts/json"
export function object(raw: unknown): JsonObject {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) throw Error("Expected finite key fixture object")
  return raw
}
export function seed(): JsonObject {
  return structuredClone(object(seedData))
}
import { build } from "../tabs/harness"
export type Route = "owner" | "native" | "wire"
export type Fault = "none" | "reject-before" | "reject-after" | "partial" | "ignore" | "readback-fail" | "mismatch"
export function chord(letter: string): Key {
  return { code: `Key${letter.toUpperCase()}`, char: letter, ctrl: false, alt: true, shift: false, meta: false }
}
export function shortcut(value: string) {
  if (!isShortcutId(value)) throw Error("Expected canonical shortcut ID")
  return value
}
export function account(value: string) {
  if (!isAccountKey(value)) throw Error("Expected canonical account key")
  return value
}

export function world(route: Route, initial: JsonObject = seed(), privateWindow = false) {
  const h = startingOwnerFixture(initial)
  let now = 0,
    wall = 200,
    fault: Fault = "none",
    at = 0,
    writes = 0,
    unreadable = false,
    nextId = 0
  let beforeSet: ((items: Readonly<JsonObject>) => void | Promise<void>) | undefined
  const timers = new Set<{ readonly due: number; readonly run: () => void }>()
  const events: ConfirmedViewChange[] = [],
    batches: JsonObject[] = [],
    trace: string[] = []
  const clock = {
    now: () => now,
    wallNow: () => wall,
    after(ms: number, run: () => void) {
      const ticket = { due: now + ms, run }
      timers.add(ticket)
      return () => {
        timers.delete(ticket)
      }
    }
  }
  const local = {
    async get(keys: readonly string[] | null) {
      if (unreadable) {
        unreadable = false
        throw Error("Synthetic key readback failure")
      }
      return h.options.local.get(keys)
    },
    async set(items: Readonly<JsonObject>) {
      writes++
      batches.push(structuredClone(items))
      await beforeSet?.(items)
      const selected = writes === at ? fault : "none"
      if (selected === "reject-before") throw Error("Synthetic key rejection before landing")
      if (selected === "ignore") return
      if (selected === "partial") await h.options.local.set(Object.fromEntries(Object.entries(items).slice(0, 1)))
      else await h.options.local.set(items)
      if (selected === "mismatch")
        h.mutate(records => {
          object(object(records["doc:settings"]).data).theme = "dark"
        })
      if (selected === "readback-fail") unreadable = true
      if (selected === "reject-after") throw Error("Synthetic key rejection after landing")
    }
  }
  const native = {
    ...h.native,
    storage: {
      ...h.native.storage,
      local: new Proxy(h.native.storage.local, {
        get(target, key, receiver) {
          if (key === "remove")
            return async (keys: string | string[]) => {
              h.mutate(records => {
                for (const name of typeof keys === "string" ? [keys] : keys) delete records[name]
              })
            }
          return Reflect.get(target, key, receiver)
        }
      })
    }
  }
  const featureAccess = nativeSharedSettingsAccess(h.native.permissions)
  const options = { ...h.options, local, syncClock: clock, now: () => wall, featureAccess, allocateShortcut: () => `new${String(++nextId).padStart(3, "0")}` }
  const generation = options.generation
  if (!generation) throw Error("Expected pinned generation collaborator")
  const owner =
    route === "owner"
      ? createStartingLocalFilterWriter({
          ...options,
          generation,
          claim: { kind: "unavailable" },
          sync: {
            get: () => h.native.storage.sync.get(null),
            set: items => h.native.storage.sync.set(items),
            subscribe(fn) {
              const listener = () => fn()
              h.native.storage.sync.onChanged.addListener(listener)
              return () => h.native.storage.sync.onChanged.removeListener(listener)
            }
          }
        })
      : createBrowserStartingLocalFilterWriter(native, options)
  const origin = { kind: "ui", windowId: privateWindow ? 2 : 1, incognito: privateWindow } as const
  const network = createMemoryNetwork<NativeSender>({ delivery: "immediate" })
  const sender: NativeSender = { id: "key-fixture", url: "chrome-extension://key-fixture/popup.html", documentId: "keys-popup-a" }
  const senderPorts = {
    runtime: { id: "key-fixture", getURL: (path: string) => `chrome-extension://key-fixture${path}` },
    windows: {
      async get(id: number) {
        return { id, incognito: privateWindow }
      }
    },
    tabs: {
      async query() {
        return []
      }
    }
  }
  const router = createUiRouter({
    native: senderPorts,
    owner,
    sharedSettings: owner,
    services: { kind: "unavailable" },
    firstRun: { readAccess: () => featureAccess.read(), lookup: { sync: { get: () => h.native.storage.sync.get(null), subscribe: () => () => {} }, clock, isCurrent: () => true } },
    transport: network.connect({ id: "key-fixture" }),
    rpc: { build, deadline: clock.after }
  })
  const backend = createBrowserBackend(
    {
      permissions: h.native.permissions,
      storage: {
        local: {
          get: keys => {
            if (!Array.isArray(keys) || !keys.every(key => typeof key === "string")) throw Error("Synthetic named local keys")
            return local.get(keys)
          }
        },
        onChanged: { addListener() {}, removeListener() {} }
      },
      runtime: {
        sendMessage(message) {
          trace.push("rpc")
          return network.connect(sender).send(message)
        },
        getManifest: () => ({ manifest_version: 3, name: "Key fixture", version: "1.0.0", optional_host_permissions: ["https://music.youtube.com/*"], optional_permissions: ["contextMenus"] })
      }
    },
    { build, deadline: clock.after, windowId: origin.windowId, browser: "chrome" }
  )
  const unsubscribe = owner.subscribeView(event => events.push(structuredClone(event)))
  function settings() {
    return decodeSettings(object(h.records()["doc:settings"]).data)
  }
  return {
    h,
    owner,
    backend,
    router,
    network,
    sender,
    origin,
    events,
    batches,
    trace,
    settings,
    change(change: KeySettingChange): Promise<KeySettingAnswer> {
      return route === "wire" ? backend.change(change) : owner.changeKeySetting(origin, change, "native-key-fixture")
    },
    assign(target: ShortcutTarget, key: Key | null, confirmation: Extract<KeySettingChange, { kind: "key" }>["confirmation"] = { kind: "none" }) {
      const expected = keyAt(settings(), target)
      if (expected === undefined) throw Error("Expected existing target")
      return this.change({ kind: "key", target, expected: keyForWire(expected), key, confirmation })
    },
    remove(id = shortcut("save01")) {
      const row = settings().shortcuts.list.find(row => row.id === id)
      if (!row) throw Error("Expected existing shortcut")
      return this.change({ kind: "shortcut-remove", id, expected: { id: row.id, key: keyForWire(row.key), label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount } })
    },
    fault(next: Fault, offset = 1) {
      fault = next
      at = writes + offset
    },
    beforeSet(fn?: (items: Readonly<JsonObject>) => void | Promise<void>) {
      beforeSet = fn
    },
    advance(ms: number) {
      now += ms
      wall += ms
    },
    setTime(value: number) {
      now = value
    },
    async runDue() {
      for (const ticket of [...timers]) if (ticket.due <= now && timers.delete(ticket)) ticket.run()
      await owner.read("settings")
    },
    async dispose() {
      backend.dispose()
      router.dispose()
      unsubscribe()
      await owner.dispose()
    }
  }
}
