import { isJsonValue } from "../../shared/contracts/json"
import { isAccountKey, isPlaylistId } from "../../shared/model"
import {
  createLocalFilterWriter, type LocalFilterChange, type LocalFilterWriteResult, type SyncAutomaticResult, type SyncFlushResult, type SyncReceiveKey, type SyncReceiveResult
} from "../store/local-filter-writer"

type NativeBrowser = typeof import("wxt/browser").browser
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]

function parseChange(raw: unknown): LocalFilterChange | undefined {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) return
  const keys = Object.keys(raw)
  if (keys.some(key => !["acct", "playlist", "desired", "clearListedChannels", "expectedGeneration"].includes(key))) return
  if (!isAccountKey(raw.acct) || !isPlaylistId(raw.playlist)) return
  const desired = raw.desired
  if (!desired || typeof desired !== "object" || Array.isArray(desired) || Object.keys(desired).length !== 2 ||
    !Object.hasOwn(desired, "mode") || !Object.hasOwn(desired, "on") ||
    (desired.mode !== "allow" && desired.mode !== "deny") || typeof desired.on !== "boolean") return
  const common = { acct: raw.acct, playlist: raw.playlist, desired: { mode: desired.mode, on: desired.on } } satisfies Pick<LocalFilterChange, "acct" | "playlist" | "desired">
  if (raw.clearListedChannels === "not-confirmed" && keys.length === 4 && !Object.hasOwn(raw, "expectedGeneration")) {
    return { ...common, clearListedChannels: "not-confirmed" }
  }
  if (raw.clearListedChannels === "confirmed" && keys.length === 5 && Object.hasOwn(raw, "expectedGeneration") &&
    (raw.expectedGeneration === null || typeof raw.expectedGeneration === "string")) {
    return { ...common, clearListedChannels: "confirmed", expectedGeneration: raw.expectedGeneration }
  }
}

export function createBrowserLocalFilterWriter(nativeBrowser: NativeBrowser, options: { onSyncResult: (result: SyncAutomaticResult) => void }): {
  changeFromSettings(raw: unknown, sender: NativeSender): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
} {
  const writer = createLocalFilterWriter({
    local: {
      get: keys => nativeBrowser.storage.local.get(keys === null ? null : [...keys]),
      set: items => nativeBrowser.storage.local.set(items)
    },
    sync: {
      get: () => nativeBrowser.storage.sync.get(null),
      set: items => nativeBrowser.storage.sync.set(items),
      subscribe(changed) {
        const event = nativeBrowser.storage.sync.onChanged
        event.addListener(changed)
        return () => event.removeListener(changed)
      }
    },
    syncClock: {
      now: () => performance.now(),
      after(milliseconds, run) {
        const timer = setTimeout(run, milliseconds)
        return () => clearTimeout(timer)
      }
    },
    onSyncResult: options.onSyncResult,
    now: () => Date.now(),
    generation: () => crypto.randomUUID()
  })
  return {
    receiveSyncDocument: key => writer.receiveSyncDocument(key),
    flushSync: () => writer.flushSync(),
    startSync: () => writer.startSync(),
    dispose: () => writer.dispose(),
    async changeFromSettings(raw, sender) {
      if (sender.id !== nativeBrowser.runtime.id || sender.frameId !== 0 ||
        sender.url !== nativeBrowser.runtime.getURL("/options.html") || !sender.tab) {
        return { kind: "result", result: { refused: "invalid" } }
      }
      const change = parseChange(raw)
      if (!change) return { kind: "result", result: { refused: "invalid" } }
      const { windowId, incognito } = sender.tab
      if (!Number.isInteger(windowId) || windowId < 0 || incognito !== false) {
        return { kind: "result", result: { refused: "private" } }
      }
      try {
        const window = await nativeBrowser.windows.get(windowId)
        if (window.id !== windowId || window.incognito !== false) return { kind: "result", result: { refused: "private" } }
      } catch {
        return { kind: "result", result: { refused: "private" } }
      }
      return writer.change({ kind: "ui", windowId, incognito: false }, change)
    }
  }
}
