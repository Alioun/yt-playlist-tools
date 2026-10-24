import { createBrowserLocalFilterWriter } from "../../../src/background/adapters/local-filter-writer"

declare const chrome: typeof import("wxt/browser").browser

const reads: unknown[] = [], sets: unknown[] = [], events: unknown[] = [], senders: unknown[] = []
let syncAccesses = 0
const nativeGet = chrome.storage.local.get.bind(chrome.storage.local)
const nativeSet = chrome.storage.local.set.bind(chrome.storage.local)
chrome.storage.local.get = new Proxy(chrome.storage.local.get, {
  apply(target, receiver, args) { reads.push(args[0]); return Reflect.apply(target, receiver, args) }
})
chrome.storage.local.set = new Proxy(chrome.storage.local.set, {
  apply(target, receiver, args) { sets.push(args[0]); return Reflect.apply(target, receiver, args) }
})
Object.defineProperty(chrome.storage, "sync", { get() { syncAccesses++; throw Error("Synthetic fixture forbids sync access") } })
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
    reads, sets, events, senders,
    read: nativeGet,
    seed: nativeSet,
    clearEffects() { reads.length = sets.length = events.length = senders.length = 0 },
    syncAccesses: () => syncAccesses,
    incognitoAllowed: () => chrome.extension.isAllowedIncognitoAccess()
  }
})
