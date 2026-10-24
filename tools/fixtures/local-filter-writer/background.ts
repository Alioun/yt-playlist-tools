import { encodeSyncDocument } from "../../../src/background/store/sync-codec"
import { parseDocumentKey } from "../../../src/shared/model"
import { createBrowserLocalFilterWriter } from "../../../src/background/adapters/local-filter-writer"

declare const chrome: typeof import("wxt/browser").browser

const reads: unknown[] = [], sets: unknown[] = [], events: unknown[] = [], senders: unknown[] = []
const unhandledRejections: string[] = []
globalThis.addEventListener("unhandledrejection", event => { if ("reason" in event) unhandledRejections.push(String(event.reason)) })
let syncAccesses = 0
let lastInvocation = -Infinity, lastEditCommit = -Infinity
const timers: { at: number; milliseconds: number; kind: string }[] = []
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const nativeTimeout = setTimeout, nativeClearTimeout = clearTimeout
Object.defineProperty(globalThis, "setTimeout", { value: new Proxy(nativeTimeout, {
  apply(target, receiver, args) {
    timers.push({ at: performance.now(), milliseconds: args[1], kind: "armed" })
    const run = args[0]
    let timer: ReturnType<typeof setTimeout>
    timer = Reflect.apply(target, receiver, [() => { pendingTimers.delete(timer); timers.push({ at: performance.now(), milliseconds: args[1], kind: "fired" }); run() }, ...args.slice(1)])
    pendingTimers.add(timer)
    return timer
  }
}) })
Object.defineProperty(globalThis, "clearTimeout", { value: new Proxy(nativeClearTimeout, {
  apply(target, receiver, args) { pendingTimers.delete(args[0]); return Reflect.apply(target, receiver, args) }
}) })
const syncReads: unknown[] = [], syncWrites: unknown[] = []
const syncArea = chrome.storage.sync
const nativeSyncGet = syncArea.get.bind(syncArea)
const nativeSyncSet = syncArea.set.bind(syncArea)
const nativeSyncRemove = syncArea.remove.bind(syncArea)
const nativeSyncClear = syncArea.clear.bind(syncArea)
const nativeLocalClear = chrome.storage.local.clear.bind(chrome.storage.local)
const nativeLocalRemove = chrome.storage.local.remove.bind(chrome.storage.local)
let releasePaddingOnAckFailure = false
let fillSyncBeforeSet = false
let flushing = 0
let started = false
const automaticResults: unknown[] = [], nativeInvocations: number[] = []
let holdNextSet = false
let releaseSet: (() => void) | undefined
let heldSet = false
let changeAuthority: "off" | "metadata" | undefined
Object.defineProperty(syncArea, "set", { value: new Proxy(syncArea.set, {
  async apply(target, receiver, args) {
    if (flushing === 0 && !started) throw Error("Writer attempted sync set outside authorized fixture driver")
    syncWrites.push(args[0])
    if (fillSyncBeforeSet) {
      fillSyncBeforeSet = false
      await nativeSyncSet(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`fixture-sync-occupancy:${i}`, "x".repeat(7800)])))
    }
    lastInvocation = performance.now()
    nativeInvocations.push(lastInvocation)
    await Reflect.apply(target, receiver, args)
    if (changeAuthority === "off") {
      changeAuthority = undefined
      const records = await nativeGet(["device", "sync"])
      const device = records.device, history = records.sync
      if (!device || typeof device !== "object" || Array.isArray(device) || !history || typeof history !== "object" || Array.isArray(history)) throw Error("Missing synthetic authority")
      await nativeSet({ device: { ...device, syncOn: false }, sync: { ...history, status: "off" } })
    } else if (changeAuthority === "metadata") {
      changeAuthority = undefined
      await nativeSyncSet({ "s:meta": { v: 1, id: "changed-history", created: 0 } })
    }
    if (holdNextSet) {
      holdNextSet = false
      heldSet = true
      await new Promise<void>(done => { releaseSet = done })
      heldSet = false
    }
  }
}) })
for (const method of ["remove", "clear"] as const) {
  Object.defineProperty(syncArea, method, { value: new Proxy(syncArea[method], {
    apply() { syncWrites.push(method); throw Error("Writer attempted forbidden sync removal") }
  }) })
}
syncArea.get = new Proxy(syncArea.get, {
  apply(target, receiver, args) { syncReads.push(args[0]); return Reflect.apply(target, receiver, args) }
})
const nativeGet = chrome.storage.local.get.bind(chrome.storage.local)
const nativeSet = chrome.storage.local.set.bind(chrome.storage.local)
chrome.storage.local.get = new Proxy(chrome.storage.local.get, {
  apply(target, receiver, args) { reads.push(args[0]); return Reflect.apply(target, receiver, args) }
})
chrome.storage.local.set = new Proxy(chrome.storage.local.set, {
  async apply(target, receiver, args) {
    sets.push(args[0])
    try {
      const result = await Reflect.apply(target, receiver, args)
      if (Object.keys(args[0]).some(key => key.startsWith("doc:"))) lastEditCommit = performance.now()
      return result
    } catch (error) {
      if (releasePaddingOnAckFailure && (flushing > 0 || started) && Object.keys(args[0]).join() === "sync") {
        releasePaddingOnAckFailure = false
        await nativeLocalRemove("fixture-quota-padding")
      }
      throw error
    }
  }
})
Object.defineProperty(chrome.storage, "sync", { get() { syncAccesses++; return syncArea } })
chrome.storage.onChanged.addListener((changes, area) => {
  if (Object.hasOwn(changes, "fixture-quota-padding")) {
    const padding = changes["fixture-quota-padding"]
    changes = { ...changes, "fixture-quota-padding": Object.fromEntries(Object.entries(padding ?? {}).map(([name, value]) =>
      [name, typeof value === "string" ? { syntheticPaddingLength: value.length } : value])) }
  }
  events.push({ area, changes })
})
function observable(result: unknown): unknown {
  if (!result || typeof result !== "object") return result
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key,
    value instanceof Error ? { name: value.name, message: value.message, fields: Object.getOwnPropertyNames(value) } : value]))
}
let createdAt = performance.now()
let writer = createBrowserLocalFilterWriter(chrome, { onSyncResult(result) { automaticResults.push({ at: performance.now(), result: observable(result) }) } })
let createdBy = performance.now()
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  senders.push({ id: sender.id, frameId: sender.frameId, url: sender.url, tab: sender.tab && {
    id: sender.tab.id, windowId: sender.tab.windowId, incognito: sender.tab.incognito
  } })
  writer.changeFromSettings(raw, sender).then(respond, error => respond({ fixtureError: String(error) }))
  return true
})
Object.assign(globalThis, {
  localFilterFixture: {
    reads, sets, events, senders, syncReads, syncWrites, automaticResults, nativeInvocations,
    createdAt: () => createdAt,
    createdBy: () => createdBy,
    pacingDelay: () => Math.max(0, createdBy + 5000 - performance.now(), lastInvocation + 5000 - performance.now(), lastEditCommit + 2000 - performance.now()),
    timers, pendingTimers: () => pendingTimers.size, unhandledRejections,
    async start() { started = true; await writer.startSync() },
    async dispose() { await writer.dispose(); started = false },
    async freshOwner() {
      await writer.dispose()
      started = false
      createdAt = performance.now()
      lastInvocation = lastEditCommit = -Infinity
      writer = createBrowserLocalFilterWriter(chrome, { onSyncResult(result) { automaticResults.push({ at: performance.now(), result: observable(result) }) } })
      createdBy = performance.now()
    },
    async flush() {
      flushing++
      try {
        const result = await writer.flushSync()
        if ("error" in result) {
          const error = result.error
          return { ...result, error: error instanceof Error ? { name: error.name, message: error.message, fields: Object.getOwnPropertyNames(error) } : String(error) }
        }
        return result
      } finally { flushing-- }
    },
    fillSyncBeforeNextSet() { fillSyncBeforeSet = true },
    releaseQuotaPaddingAfterAckFailure() { releasePaddingOnAckFailure = true },
    holdNextSyncSet() { holdNextSet = true },
    isSetHeld: () => heldSet,
    releaseSyncSet() { releaseSet?.(); releaseSet = undefined },
    switchOffAfterNextSet() { changeAuthority = "off" },
    changeMetadataAfterNextSet() { changeAuthority = "metadata" },
    syncRead: nativeSyncGet,
    syncSeed: nativeSyncSet,
    async seedSyncDocuments(documents: Record<string, unknown>) {
      const items: Record<string, unknown> = {}
      for (const [name, document] of Object.entries(documents)) {
        const key = parseDocumentKey(name)
        if (!key) throw Error("Invalid synthetic document key")
        const encoded = encodeSyncDocument({ key, document })
        if (encoded.kind !== "encoded") throw Error("Invalid synthetic document")
        for (const item of encoded.encoded.items) Object.defineProperty(items, item.key, { value: item.value, enumerable: true })
      }
      await nativeSyncSet(items)
    },
    syncRemove: nativeSyncRemove,
    syncClear: nativeSyncClear,
    localClear: nativeLocalClear,
    localRemove: nativeLocalRemove,
    read: nativeGet,
    seed: nativeSet,
    clearEffects() { reads.length = sets.length = events.length = senders.length = syncReads.length = syncWrites.length = automaticResults.length = nativeInvocations.length = 0; syncAccesses = 0 },
    syncAccesses: () => syncAccesses,
    incognitoAllowed: () => chrome.extension.isAllowedIncognitoAccess()
  }
})
