import type { Backend, LocalChange } from "../../../src/ui/backend/backend"
import type { UiPlaylistList } from "../../../src/shared/contracts/ui-playlists"
import type { RpcOutcome } from "../../../src/shared/rpc/rpc"
import { world, a, alpha, beta, created, oldCache, nativeTab, signedIn, success, video } from "../playlists-cache/harness"
import { settle } from "../tabs/harness"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createBrowserBackend, type BrowserBackendPort } from "../../../src/ui/backend/browser"
import { createUiRouter } from "../../../src/background/router/ui-playlists"
import type { UiRequesterPorts } from "../../../src/background/adapters/ui-requester"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import type { RemovalFixtureState } from "../account-removal-execution/run"
import { recordWireTrace } from "./wire-observer"

export { a, alpha, beta, created, video, nativeTab, signedIn, success, settle }
export function check(value: unknown, label: string): asserts value { if (!value) throw Error(label) }
export function build() { const value = "ui-bridge-fixture"; check(isBuildId(value), "fixture build"); return value }
export function consumerSeed(): RemovalFixtureState {
  return { local: {
    schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, lastAccount: a },
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true },
    "doc:settings": { v: 1, gen: "settings", at: 1, by: "fixture", data: {} },
    [`doc:setup:${a}`]: { v: 1, gen: "setup", at: 1, by: "fixture", data: { quickSave: alpha } },
    [`cache:${a}`]: structuredClone(oldCache), preserved: { keep: true }
  }, session: { unknown: { keep: true } }, sync: {} }
}
export function popup(windowId = 1): NativeSender {
  return { id: "fixture-extension", url: "chrome-extension://fixture-extension/popup.html", documentId: `popup-${windowId}` }
}
export function settings(tabId = 20, incognito = false): NativeSender {
  return { id: "fixture-extension", url: "chrome-extension://fixture-extension/options.html", documentId: `settings-${tabId}`, frameId: 0,
    tab: { id: tabId, windowId: incognito ? 2 : 1, incognito, active: true, highlighted: true, index: 0, pinned: false,
      discarded: false, frozen: false, selected: true, autoDiscardable: true, groupId: -1, lastAccessed: 0 } }
}
export function bridgeHarness(options: { readonly initial?: RemovalFixtureState; readonly delivery?: "immediate" | "queued"; readonly unavailable?: boolean } = {}) {
  const h = world(options.initial ?? consumerSeed())
  h.seedTab()
  h.script(async (_tab, invocation) => {
    switch (invocation.job.kind) {
      case "playlists": return success([{ id: alpha, title: "Alpha fresh", privacy: "PRIVATE", count: 2 }])
      case "create": return success({ playlistId: created })
      case "resolveChannel": return success({ channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Synthetic channel", handle: "@synthetic" })
      default: return { ok: false, reason: "unavailable" }
    }
  })
  const privacy = new Map<number, boolean>([[1, false], [2, true]])
  const network = createMemoryNetwork<NativeSender>({ delivery: options.delivery ?? "immediate" })
  const localListeners = new Set<Parameters<BrowserBackendPort["storage"]["onChanged"]["addListener"]>[0]>()
  const native: UiRequesterPorts = {
    runtime: { id: "fixture-extension", getURL: path => `chrome-extension://fixture-extension${path}` },
    windows: { async get(id) { const incognito = privacy.get(id); if (incognito === undefined) throw Error("Synthetic missing window"); return { id, incognito } } },
    tabs: { async query(query) { return [...h.tabs.values()].filter(tab => tab.active && tab.windowId === query.windowId)
      .map(tab => ({ id: tab.tabId, windowId: tab.windowId, incognito: tab.incognito, active: tab.active })) } }
  }
  let accessReads = 0, syncReads = 0, localReads = 0
  const router = createUiRouter({ native, owner: h.owner,
    services: options.unavailable ? { kind: "unavailable" } : { kind: "ready", tabs: h.engine, playlists: h.playlists },
    firstRun: {
      async readAccess() { accessReads++; return { www: true, music: true, browserMenu: true } },
      lookup: { sync: { async get() { syncReads++; return {} }, subscribe() { return () => {} } },
        clock: { now: h.clock.now, after: h.clock.after }, isCurrent: () => true }
    },
    transport: network.connect({ id: "fixture-extension" }), rpc: { build: build(), deadline: h.clock.after }
  })
  const views: ReturnType<typeof createBrowserBackend>[] = []
  function open(sender: NativeSender = popup(), windowId?: number) {
    const port: BrowserBackendPort = {
      runtime: { sendMessage: network.connect(sender).send,
        getManifest: () => ({ manifest_version: 3, name: "UI bridge fixture", version: "1.0.0", host_permissions: ["https://www.youtube.com/*"], optional_host_permissions: ["https://music.youtube.com/*"], optional_permissions: ["contextMenus"] }) },
      storage: { local: { async get(keys) {
        check(Array.isArray(keys) && keys.every(key => typeof key === "string"), "consumer names local keys")
        localReads++; return h.removal.deps.local.get(keys)
      } }, onChanged: { addListener(fn) { localListeners.add(fn) }, removeListener(fn) { localListeners.delete(fn) } } },
      permissions: { contains: async () => true, request: async () => true }
    }
    const backend = createBrowserBackend(port, { build: build(), deadline: h.clock.after, browser: "chrome", ...(windowId === undefined ? {} : { windowId }) })
    views.push(backend)
    return backend
  }
  let rawSequence = 0
  function send(payload: unknown, kind = "ui.accountInView", sender = popup()) {
    return network.connect(sender).send({ v: CONTRACT_VERSION, build: build(), id: `raw-${++rawSequence}`, kind, payload }).catch(error => {
      const last = network.trace().at(-1)
      if (last?.event === "rejected" && last.reason === "no-receiver") return undefined
      throw error
    })
  }
  return { h, native, network, router, privacy, open, send,
    emitLocal(changes: LocalChange) {
      for (const listener of [...localListeners]) listener(changes, "local")
    },
    counts: () => ({ accessReads, syncReads, localReads, localListeners: localListeners.size, nativeListeners: network.listening() }),
    async flush() { await settle(); for (const item of [...network.queued()]) item.deliver(); await settle() },
    async dispose() { for (const view of views) view.dispose(); await settle(); router.dispose(); await h.dispose(); recordWireTrace(network.trace()) }
  }
}

export async function completedList(backend: Backend, request: Parameters<Backend["playlistList"]>[0] & { readonly windowId?: number }): Promise<RpcOutcome<UiPlaylistList>> {
  const operation = backend.playlistList(request)
  try {
    const opened = await operation.opened
    if (opened.kind !== "answered") return opened
    if (opened.result.kind === "unavailable") return { kind: "answered", result: opened.result }
    if (opened.result.kind !== "open") return { kind: "failed", failure: "invalid-answer" }
    const base = { kind: "open", cached: opened.result.cached, freshness: opened.result.freshness } as const
    if (opened.result.refresh === null) return { kind: "answered", result: { ...base, refresh: null } }
    const fresh = await operation.refresh()
    if (fresh.kind !== "answered") return fresh
    if (fresh.result.kind === "unavailable") return { kind: "answered", result: fresh.result }
    if (fresh.result.kind !== "refreshed") return { kind: "failed", failure: "invalid-answer" }
    if (fresh.result.refresh.kind === "withheld") return { kind: "answered", result: { kind: "unavailable", reason: "owner" } }
    return { kind: "answered", result: { ...base, refresh: fresh.result.refresh } }
  } finally { operation.dispose() }
}
