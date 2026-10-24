import { encodeSyncDocument } from "../../../src/background/store/sync-codec"
import { parseDocumentKey } from "../../../src/shared/model"
import { createBrowserLocalFilterWriter } from "../../../src/background/adapters/local-filter-writer"

declare const chrome: typeof import("wxt/browser").browser

const reads: unknown[] = [], sets: unknown[] = [], events: unknown[] = [], senders: unknown[] = []
let syncAccesses = 0
const syncReads: unknown[] = [], syncWrites: unknown[] = []
const syncArea = chrome.storage.sync
const nativeSyncGet = syncArea.get.bind(syncArea)
const nativeSyncSet = syncArea.set.bind(syncArea)
const nativeSyncRemove = syncArea.remove.bind(syncArea)
const nativeSyncClear = syncArea.clear.bind(syncArea)
const nativeLocalClear = chrome.storage.local.clear.bind(chrome.storage.local)
const nativeLocalRemove = chrome.storage.local.remove.bind(chrome.storage.local)
for (const method of ["set", "remove", "clear"] as const) {
  Object.defineProperty(syncArea, method, { value: new Proxy(syncArea[method], {
    apply() { syncWrites.push(method); throw Error("Writer attempted forbidden sync write") }
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
  apply(target, receiver, args) { sets.push(args[0]); return Reflect.apply(target, receiver, args) }
})
Object.defineProperty(chrome.storage, "sync", { get() { syncAccesses++; return syncArea } })
chrome.storage.onChanged.addListener((changes, area) => { events.push({ area, changes }) })
const writer = createBrowserLocalFilterWriter(chrome)
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  senders.push({ id: sender.id, frameId: sender.frameId, url: sender.url, tab: sender.tab && {
    id: sender.tab.id, windowId: sender.tab.windowId, incognito: sender.tab.incognito
  } })
  writer.changeFromSettings(raw, sender).then(respond, error => respond({ fixtureError: String(error) }))
  return true
})
Object.assign(globalThis, {
  localFilterFixture: {
    reads, sets, events, senders, syncReads, syncWrites,
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
    clearEffects() { reads.length = sets.length = events.length = senders.length = syncReads.length = syncWrites.length = 0; syncAccesses = 0 },
    syncAccesses: () => syncAccesses,
    incognitoAllowed: () => chrome.extension.isAllowedIncognitoAccess()
  }
})
