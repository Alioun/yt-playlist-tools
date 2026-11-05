import { isJsonValue } from "../../shared/contracts/json"
import { isAccountKey, isPlaylistId } from "../../shared/model"
import { resolveSenderOrigin } from "./sender-origin"
import { acquireLocalFilterWriterArea } from "./starting-owner-area"
import type { SessionPort } from "../store/session-memory"
import {
  createLocalFilterWriter,
  type LocalFilterChange,
  type LocalFilterWriteResult,
  type SyncAutomaticResult,
  type SyncFlushResult,
  type SyncReceiveKey,
  type SyncReceiveResult
} from "../store/local-filter-writer"

type NativeBrowser = typeof import("wxt/browser").browser
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]

function parseChange(raw: unknown): LocalFilterChange | undefined {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) return
  const keys = Object.keys(raw)
  if (keys.some(key => !["acct", "playlist", "desired", "clearListedChannels", "expectedGeneration"].includes(key))) return
  if (!isAccountKey(raw.acct) || !isPlaylistId(raw.playlist)) return
  const desired = raw.desired
  if (
    !desired ||
    typeof desired !== "object" ||
    Array.isArray(desired) ||
    Object.keys(desired).length !== 2 ||
    !Object.hasOwn(desired, "mode") ||
    !Object.hasOwn(desired, "on") ||
    (desired.mode !== "allow" && desired.mode !== "deny") ||
    typeof desired.on !== "boolean"
  )
    return
  const common = { acct: raw.acct, playlist: raw.playlist, desired: { mode: desired.mode, on: desired.on } } satisfies Pick<LocalFilterChange, "acct" | "playlist" | "desired">
  if (raw.clearListedChannels === "not-confirmed" && keys.length === 4 && !Object.hasOwn(raw, "expectedGeneration")) {
    return { ...common, clearListedChannels: "not-confirmed" }
  }
  if (raw.clearListedChannels === "confirmed" && keys.length === 5 && Object.hasOwn(raw, "expectedGeneration") && (raw.expectedGeneration === null || typeof raw.expectedGeneration === "string")) {
    return { ...common, clearListedChannels: "confirmed", expectedGeneration: raw.expectedGeneration }
  }
}

export function createBrowserLocalFilterWriter(
  nativeBrowser: NativeBrowser,
  options: { onSyncResult: (result: SyncAutomaticResult) => void }
): {
  session: SessionPort
  changeFromSettings(raw: unknown, sender: NativeSender): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
} {
  const area = nativeBrowser.storage.local
  const release = acquireLocalFilterWriterArea(area)
  try {
    const writer = createLocalFilterWriter({
      claim: { kind: "unavailable" },
      session: {
        get: () => nativeBrowser.storage.session.get(null),
        set: items => nativeBrowser.storage.session.set(items),
        remove: keys => nativeBrowser.storage.session.remove(keys.map(key => `${key.kind}:${key.acct}`))
      },
      local: {
        get: keys => area.get(keys === null ? null : [...keys]),
        set: items => area.set(items)
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
        wallNow: () => Date.now(),
        after(milliseconds, run) {
          const timer = setTimeout(run, milliseconds)
          return () => clearTimeout(timer)
        }
      },
      onSyncResult: options.onSyncResult,
      now: () => Date.now(),
      generation: () => crypto.randomUUID()
    })
    let disposal: Promise<void> | undefined
    return {
      session: { read: () => writer.readSession(), change: change => writer.changeSession(change) },
      receiveSyncDocument: key => writer.receiveSyncDocument(key),
      flushSync: () => writer.flushSync(),
      startSync: () => writer.startSync(),
      dispose() {
        if (!disposal) {
          try {
            disposal = writer.dispose().then(release)
          } catch (error) {
            disposal = Promise.reject(error)
          }
        }
        return disposal
      },
      async changeFromSettings(raw, sender) {
        const change = parseChange(raw)
        if (!change) return { kind: "result", result: { refused: "invalid" } }
        const resolved = await resolveSenderOrigin(nativeBrowser, { sender, popupWindowId: undefined })
        if (resolved.kind === "unavailable") {
          const refused = resolved.reason === "privacy" && resolved.page === "settings" ? "private" : "invalid"
          return { kind: "result", result: { refused } }
        }
        if (resolved.kind !== "ui" || resolved.page !== "settings") return { kind: "result", result: { refused: "invalid" } }
        if (resolved.origin.incognito) return { kind: "result", result: { refused: "private" } }
        return writer.change(resolved.origin, change)
      }
    }
  } catch (error) {
    release()
    throw error
  }
}
