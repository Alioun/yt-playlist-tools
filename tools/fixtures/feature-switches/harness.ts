import { createStartingLocalFilterWriter, type ConfirmedViewChange } from "../../../src/background/store/local-filter-writer"
import { createBrowserStartingLocalFilterWriter } from "../../../src/background/adapters/starting-owner"
import { nativeSharedSettingsAccess } from "../../../src/background/adapters/shared-settings"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import { changeFeatureSetting } from "../../../src/background/router/shared-settings"
import { createBrowserBackend } from "../../../src/ui/backend/browser"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createTabs } from "../../../src/background/tabs/tabs"
import { createPlaylists } from "../../../src/background/playlists/playlists"
import { decodeSettings } from "../../../src/shared/model"
import { isJsonValue, type JsonObject } from "../../../src/shared/contracts/json"
import type { FeatureSettingChange } from "../../../src/shared/contracts/shared-settings"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import { startingOwnerFixture, gate } from "../starting-owner/support"
import { build, manualClock } from "../tabs/harness"
import seedData from "./seed.json"
export { gate }

export type Route = "owner" | "native" | "wire"
export type Fault = "none" | "reject-before" | "reject-after" | "ignore" | "partial" | "mismatch" | "readback-fail"
export const sessionSeed: JsonObject = { undo: { preserve: [1, 2] }, history: ["keep"], skips: { preserve: true }, pause: { keep: true } }
export const normal = { kind: "ui", windowId: 1, incognito: false } as const
export const privateOrigin = { kind: "ui", windowId: 2, incognito: true } as const
export function object(raw: unknown): JsonObject {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) throw Error("Expected finite fixture object")
  return raw
}
export function seed(): JsonObject { return structuredClone(object(seedData)) }

export function world(route: Route, initial: JsonObject = seed(), privateWindow = false) {
  const h = startingOwnerFixture(initial), clock = manualClock()
  const trace: string[] = [], events: ConfirmedViewChange[] = [], batches: JsonObject[] = []
  const grant = { www: true, music: true, browserMenu: true }, prompt = { music: true, browserMenu: true }
  let removal = true, fault: Fault = "none", faultAt = 1, writes = 0, unreadable = false
  let readHook: (() => Promise<void>) | undefined, setHook: (() => Promise<void>) | undefined
  let shortcut = 0
  const local = {
    async get(keys: readonly string[] | null) {
      trace.push("read")
      if (readHook) await readHook()
      if (unreadable) { unreadable = false; throw Error("Synthetic feature readback failure") }
      return h.options.local.get(keys)
    },
    async set(items: Readonly<JsonObject>) {
      trace.push("set"); batches.push(structuredClone(items)); writes++
      if (setHook) await setHook()
      const selected = writes === faultAt ? fault : "none"
      if (selected === "reject-before") throw Error("Synthetic feature rejection before effect")
      if (selected === "ignore") return
      if (selected === "partial") await h.options.local.set(Object.fromEntries(Object.entries(items).slice(0, 2)))
      else await h.options.local.set(items)
      if (selected === "mismatch") h.mutate(records => { object(object(records["doc:settings"]).data).theme = "light" })
      if (selected === "readback-fail") unreadable = true
      if (selected === "reject-after") throw Error("Synthetic feature rejection after effect")
    }
  }
  type Permissions = typeof h.native.permissions
  const permissions = new Proxy(h.native.permissions, { get(target, key, receiver) {
    if (key === "contains") return async (query: Parameters<Permissions["contains"]>[0]) => {
      trace.push("contains")
      return query.permissions?.includes("contextMenus") ? grant.browserMenu
        : query.origins?.some(origin => origin.includes("music.youtube.com")) ? grant.music : grant.www
    }
    if (key === "request") return (query: Parameters<Permissions["request"]>[0]) => {
      trace.push("request")
      if (query.origins?.length) grant.music = prompt.music
      if (query.permissions?.includes("contextMenus")) grant.browserMenu = prompt.browserMenu
      return Promise.resolve(query.permissions?.includes("contextMenus") ? prompt.browserMenu : prompt.music)
    }
    if (key === "remove") return async () => { trace.push("remove"); if (removal) grant.browserMenu = false; return removal }
    return Reflect.get(target, key, receiver)
  } })
  const native = { ...h.native, permissions }
  const options = { ...h.options, local, featureAccess: nativeSharedSettingsAccess(permissions), allocateShortcut: () => `new${String(++shortcut).padStart(3, "0")}` }
  const generation = options.generation, syncClock = options.syncClock
  if (!generation || !syncClock) throw Error("Finite fixture clock and generation are required")
  const owner = route !== "owner" ? createBrowserStartingLocalFilterWriter(native, options) : createStartingLocalFilterWriter({
    ...options, now: () => 200, generation, syncClock, claim: { kind: "unavailable" },
    sync: { get: () => native.storage.sync.get(null), set: items => native.storage.sync.set(items), subscribe(fn) {
      const listener = () => fn(); native.storage.sync.onChanged.addListener(listener); return () => native.storage.sync.onChanged.removeListener(listener)
    } },
    session: { get: () => native.storage.session.get(null), set: items => native.storage.session.set(items),
      remove: keys => native.storage.session.remove(keys.map(key => `${key.kind}:${key.acct}`)) }
  })
  h.seedSession(sessionSeed)
  let revocations = 0, serviceCalls = 0
  const unsubscribe = owner.subscribeView(event => events.push(structuredClone(event)), () => { revocations++ })
  const tabs = createTabs({ session: { read: owner.readSession, change: owner.changeSession }, clock, enabled: () => true,
    accounts: { lastAccount: async () => null, hasSetup: async () => false }, registrar: { ensure: async () => ({ kind: "unavailable" }) },
    native: { query: async () => { serviceCalls++; return { kind: "tabs", tabs: [] } }, get: async () => ({ kind: "gone" }),
      ping: async () => ({ kind: "gone" }), run: async () => ({ kind: "gone" }), view: async () => ({ kind: "gone" }), dispose() {} } })
  const playlists = createPlaylists({ owner, tabs, now: clock.wallNow })
  const network = createMemoryNetwork<NativeSender>({ delivery: "immediate" })
  const origin = privateWindow ? privateOrigin : normal
  const sender: NativeSender = { id: "feature-fixture", url: "chrome-extension://feature-fixture/popup.html", documentId: "feature-popup" }
  const senderPorts = { runtime: { id: "feature-fixture", getURL: (path: string) => `chrome-extension://feature-fixture${path}` },
    windows: { async get(id: number) { return { id, incognito: privateWindow } } },
    tabs: { async query() { serviceCalls++; return [] } } }
  const router = createUiRouter({ native: senderPorts, owner, sharedSettings: owner, services: { kind: "ready", tabs, playlists },
    firstRun: { readAccess: () => options.featureAccess.read(), lookup: { sync: { get: () => native.storage.sync.get(null), subscribe: () => () => {} }, clock, isCurrent: () => true } },
    transport: network.connect({ id: "feature-fixture" }), rpc: { build, deadline: clock.after } })
  const backend = createBrowserBackend({ permissions, storage: { local: { get: keys => {
    if (!Array.isArray(keys) || !keys.every(key => typeof key === "string")) throw Error("Synthetic named local keys")
    return local.get(keys)
  } },
    onChanged: { addListener() {}, removeListener() {} } }, runtime: {
    sendMessage: network.connect(sender).send,
    getManifest: () => ({ manifest_version: 3, name: "Feature fixture", version: "1.0.0", optional_host_permissions: ["https://music.youtube.com/*"], optional_permissions: ["contextMenus"] })
  } }, { build, deadline: clock.after, windowId: origin.windowId, browser: "chrome" })
  return { h, owner, backend, router, network, permissions, origin, grant, prompt, events, batches, trace,
    get revocations() { return revocations }, get serviceCalls() { return serviceCalls },
    settings: () => decodeSettings(object(h.records()["doc:settings"]).data),
    async change(change: FeatureSettingChange) {
      return route === "wire" ? backend.changeFeatureSetting(change, decodeSettings(object(h.records()["doc:settings"]).data))
        : changeFeatureSetting(owner, { kind: "ui", page: "popup", origin }, change)
    },
    fail(next: Fault, offset = 1) { fault = next; faultAt = writes + offset },
    removal(value: boolean) { removal = value },
    readHook(fn?: () => Promise<void>) { readHook = fn }, setHook(fn?: () => Promise<void>) { setHook = fn },
    async dispose() { backend.dispose(); router.dispose(); playlists.dispose(); tabs.dispose(); unsubscribe(); await owner.dispose() }
  }
}
