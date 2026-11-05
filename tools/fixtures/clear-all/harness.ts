import { startingOwnerFixture, agreedSeed, check, copy } from "../starting-owner/support"
import { createBrowserStoreLifecycle } from "../../../src/background/adapters/store-lifecycle"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import { createBackend } from "../../../src/ui/backend/core"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { isJsonValue, type JsonObject } from "../../../src/shared/contracts/json"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import type { ClearAllOptions, SettingsPageOrigin } from "../../../src/background/store/store-lifecycle"
import type { ClearAllAnswer } from "../../../src/shared/contracts/clear-all"
import type { ResetNotice } from "../../../src/background/store/sync-reset-receive"
import type { Unclaimed } from "../../../src/shared/model"

export { check, agreedSeed, copy }
export const settingsOrigin = { kind: "ui", page: "settings", origin: { kind: "ui", windowId: 1, incognito: false } } as const satisfies SettingsPageOrigin
export const account = "AAAAAAAAAAAAAAAA"
export const otherAccount = "BBBBBBBBBBBBBBBB"
export type Fault = "before" | "after" | "ignore"
export function sharedSync(initial: JsonObject = { "s:meta": { v: 1, id: "history", created: 0 }, old: { obsolete: true } }) {
  let records = copy(initial)
  const listeners = new Set<() => void>()
  return {
    records: () => copy(records),
    replace(value: JsonObject) {
      records = copy(value)
    },
    listeners,
    set(items: JsonObject) {
      records = { ...records, ...copy(items) }
    },
    remove(names: readonly string[]) {
      for (const name of names) delete records[name]
    },
    fire() {
      for (const listener of [...listeners]) listener()
    }
  }
}
export function accountSeed(syncOn = true): JsonObject {
  const initial = agreedSeed(syncOn)
  initial.unclaimed = { from: "1.5.0", autoAdd: [], shortcutPlaylist: null, filters: {}, at: 1 } satisfies Unclaimed
  for (const acct of [account, otherAccount]) {
    initial[`doc:setup:${acct}`] = { v: 1, gen: `setup-${acct}`, at: 1, by: "starting-fixture", data: {} }
    initial[`doc:filter:${acct}:PL_alpha`] = { v: 1, gen: `filter-${acct}`, at: 1, by: "starting-fixture", data: {} }
    initial[`cache:${acct}`] = { fixture: true }
    for (let shard = 0; shard < 16; shard++) initial[`progress:${acct}:${shard}`] = { fixture: shard }
  }
  return initial
}
export function clearFixture(initial: JsonObject = agreedSeed(), shared = sharedSync()) {
  const h = startingOwnerFixture(initial),
    fault = new Map<string, Fault>()
  const calls: { readonly operation: string; readonly at: number; readonly names: readonly string[] }[] = []
  const notices = new Map<string, ResetNotice>()
  let time = 0,
    generation = 0,
    openings = 0,
    databases = 0,
    privacy: boolean | undefined = false
  let before: (operation: string) => Promise<void> = async () => {}
  const timers: { readonly at: number; readonly run: () => void; cancelled: boolean }[] = []
  const clock = {
    now: () => time,
    wallNow: () => 1_000_000 + time,
    after(ms: number, run: () => void) {
      const timer = { at: time + ms, run, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    }
  }
  async function enter(operation: string, names: readonly string[] = []) {
    calls.push({ operation, at: time, names: [...names] })
    await before(operation)
    const mode = fault.get(operation)
    fault.delete(operation)
    if (mode === "before") throw Error(`DUMMY_${operation}_BEFORE`)
    return mode
  }
  function finish(operation: string, mode: Fault | undefined) {
    if (mode === "after") throw Error(`DUMMY_${operation}_AFTER`)
  }
  const local = new Proxy(h.native.storage.local, {
    get(target, key, receiver) {
      if (key === "get")
        return new Proxy(target.get, {
          async apply(_fn, _this, args: [unknown]) {
            const keys = args[0]
            check(Array.isArray(keys) && keys.every((value): value is string => typeof value === "string"), "native local read names keys")
            check(
              keys.every(name => ["schema", "device", "sync", "consent:state", "pending:clear-all"].includes(name)),
              "native local never reads legacy credentials"
            )
            await enter("local.get", keys)
            return h.options.local.get(keys)
          }
        })
      if (key === "set")
        return new Proxy(target.set, {
          async apply(_fn, _this, args: [unknown]) {
            const items = args[0]
            check(isJsonValue(items) && items !== null && typeof items === "object" && !Array.isArray(items), "local set JSON")
            const mode = await enter("local.set", Object.keys(items))
            if (mode !== "ignore") await h.options.local.set(items)
            finish("local.set", mode)
          }
        })
      if (key === "remove")
        return new Proxy(target.remove, {
          async apply(_fn, _this, args: [unknown]) {
            const names = args[0]
            check(Array.isArray(names) && names.every((name): name is string => typeof name === "string"), "local remove names")
            const mode = await enter("local.remove", names)
            if (mode !== "ignore")
              h.mutate(records => {
                for (const name of names) delete records[name]
              })
            finish("local.remove", mode)
          }
        })
      if (key === "getKeys")
        return async () => {
          await enter("local.names")
          return Object.keys(h.records())
        }
      if (key === "clear")
        return () => {
          throw Error("Untyped local clear forbidden")
        }
      return Reflect.get(target, key, receiver)
    }
  })
  const session = new Proxy(h.native.storage.session, {
    get(target, key, receiver) {
      if (key === "clear")
        return async () => {
          const mode = await enter("session.clear")
          if (mode !== "ignore") h.seedSession({})
          finish("session.clear", mode)
        }
      if (key === "getKeys")
        return async () => {
          await enter("session.names")
          return Object.keys(h.session())
        }
      if (key === "set")
        return new Proxy(target.set, {
          async apply(_fn, _this, args: [unknown]) {
            const items = args[0]
            check(isJsonValue(items) && items !== null && typeof items === "object" && !Array.isArray(items), "session set JSON")
            const mode = await enter("session.set", Object.keys(items))
            if (mode !== "ignore") h.seedSession({ ...h.session(), ...copy(items) })
            finish("session.set", mode)
          }
        })
      if (key === "remove")
        return new Proxy(target.remove, {
          async apply(_fn, _this, args: [unknown]) {
            const names = args[0]
            check(Array.isArray(names) && names.every((name): name is string => typeof name === "string"), "session remove names")
            const mode = await enter("session.remove", names)
            if (mode !== "ignore") {
              const next = h.session()
              for (const name of names) delete next[name]
              h.seedSession(next)
            }
            finish("session.remove", mode)
          }
        })
      return Reflect.get(target, key, receiver)
    }
  })
  type Listener = Parameters<typeof h.native.storage.sync.onChanged.addListener>[0]
  const subscriptions = new Map<Listener, () => void>()
  const event = new Proxy(h.native.storage.sync.onChanged, {
    get(target, key, receiver) {
      if (key === "addListener")
        return (listener: Listener) => {
          const call = () => listener({})
          subscriptions.set(listener, call)
          shared.listeners.add(call)
        }
      if (key === "removeListener")
        return (listener: Listener) => {
          const call = subscriptions.get(listener)
          if (call) shared.listeners.delete(call)
          subscriptions.delete(listener)
        }
      return Reflect.get(target, key, receiver)
    }
  })
  const sync = new Proxy(h.native.storage.sync, {
    get(target, key, receiver) {
      if (key === "get")
        return async () => {
          await enter("sync.get")
          return shared.records()
        }
      if (key === "set")
        return new Proxy(target.set, {
          async apply(_fn, _this, args: [unknown]) {
            const items = args[0]
            check(isJsonValue(items) && items !== null && typeof items === "object" && !Array.isArray(items), "sync set JSON")
            const mode = await enter("sync.set", Object.keys(items))
            if (mode !== "ignore") shared.set(items)
            finish("sync.set", mode)
          }
        })
      if (key === "remove")
        return new Proxy(target.remove, {
          async apply(_fn, _this, args: [unknown]) {
            const names = args[0]
            check(Array.isArray(names) && names.every((name): name is string => typeof name === "string"), "sync remove names")
            const mode = await enter("sync.remove", names)
            if (mode !== "ignore") shared.remove(names)
            finish("sync.remove", mode)
          }
        })
      if (key === "onChanged") return event
      return Reflect.get(target, key, receiver)
    }
  })
  const native = { ...h.native, storage: { ...h.native.storage, local, session, sync } }
  function construct() {
    return createBrowserStoreLifecycle(native, {
      owner: h.options,
      clock,
      generation: () => `clear-generation-${++generation}`,
      teardown: {
        async quiesce() {
          await enter("teardown")
          return { kind: "confirmed", scripts: "absent", tabs: "torn-down", browserMenu: "released" }
        }
      },
      database: {
        async delete() {
          const mode = await enter("database.delete")
          if (mode === "ignore") return "unconfirmed"
          databases++
          finish("database.delete", mode)
          return "deleted"
        }
      },
      firstRun: {
        async open() {
          const mode = await enter("first-run.open")
          if (mode === "ignore") return { kind: "unconfirmed", reason: "not-opened" }
          openings++
          finish("first-run.open", mode)
          return { kind: "opened" }
        }
      },
      notices: {
        async publish(notice) {
          const mode = await enter("notice.publish")
          if (mode === "ignore") return "unconfirmed"
          if (notices.has(notice.id)) return "already-published"
          notices.set(notice.id, notice)
          finish("notice.publish", mode)
          return "published"
        }
      }
    })
  }
  let lifecycle = construct()
  async function wire(page: "settings" | "popup" | "content" = "settings") {
    await lifecycle.ready()
    const owner = lifecycle.owner()
    check(owner, "real owner exists for composed route")
    const build = "clear-all-fixture"
    check(isBuildId(build), "fixture build")
    const sender: NativeSender = {
      id: "fixture-extension",
      frameId: 0,
      url: page === "content" ? "https://www.youtube.com/watch?v=x" : `chrome-extension://fixture-extension/${page === "settings" ? "options" : "popup"}.html`,
      documentId: "clear-document",
      ...(page === "popup"
        ? {}
        : {
            tab: {
              id: 10,
              windowId: 1,
              incognito: privacy ?? false,
              active: true,
              highlighted: true,
              index: 0,
              pinned: false,
              discarded: false,
              frozen: false,
              selected: true,
              autoDiscardable: true,
              groupId: -1,
              lastAccessed: 0
            }
          })
    }
    const network = createMemoryNetwork<NativeSender>({ delivery: "immediate" })
    const connection = network.connect(sender)
    const router = createUiRouter({
      native: {
        runtime: { id: "fixture-extension", getURL: path => `chrome-extension://fixture-extension${path}` },
        windows: {
          async get(id) {
            if (privacy === undefined) throw Error("DUMMY_UNKNOWN_PRIVATE")
            return { id, incognito: privacy }
          }
        },
        tabs: {
          async query() {
            return []
          }
        }
      },
      owner,
      lifecycle,
      services: { kind: "unavailable" },
      firstRun: { readAccess: async () => undefined, lookup: { sync: { get: async () => shared.records(), subscribe: () => () => {} }, clock, isCurrent: () => true } },
      transport: network.connect(sender),
      rpc: { build, deadline: () => () => {} }
    })
    const backend = createBackend(
      {
        local: { get: keys => h.options.local.get(keys), all: () => h.options.local.get(null), onChanged: { addListener() {}, removeListener() {} } },
        send: connection.send,
        access: { has: async () => true, request: async () => true, hasBrowserMenu: async () => true, requestCombined: async () => ({ music: true, browserMenu: true }) }
      },
      { build, deadline: () => () => {} }
    )
    return {
      backend,
      network,
      router,
      dispose() {
        backend.dispose()
        router.dispose()
      }
    }
  }
  return {
    h,
    native,
    fault,
    calls,
    notices,
    clock,
    timers,
    shared,
    wire,
    lifecycle: () => lifecycle,
    records: h.records,
    session: h.session,
    seedSession: h.seedSession,
    counts: () => ({ openings, databases }),
    time: () => time,
    advance(ms: number) {
      time += ms
    },
    setTime(value: number) {
      time = value
    },
    private(value: boolean | undefined) {
      privacy = value
    },
    hook(run: typeof before) {
      before = run
    },
    async restart() {
      await lifecycle.dispose()
      lifecycle = construct()
      return lifecycle.ready()
    },
    async clear(options: ClearAllOptions) {
      return lifecycle.clearAll(settingsOrigin, options)
    },
    async confirm(backend: Awaited<ReturnType<typeof wire>>["backend"], alsoSynced: boolean): Promise<ClearAllAnswer> {
      const review = await backend.clearAll({ action: "review", alsoSynced })
      check(review.kind === "answered" && review.result.kind === "reviewed", "wire obtains authenticated review")
      const result = await backend.clearAll({ action: "confirm", review: review.result.review, alsoSynced })
      check(result.kind === "answered", "wire clear answers")
      return result.result
    },
    async dispose() {
      await lifecycle.dispose()
    }
  }
}
