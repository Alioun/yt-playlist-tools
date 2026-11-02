import {
  decodeDocument, decodeProgress, decodeSetup, documentKey, DecodeError, progressJson, progressKey, progressLive, progressShard, pruneProgress,
  rememberProgress, PROGRESS_PRUNE_MS, PROGRESS_SHARDS, type AccountKey, type Progress, type ProgressParts, type ProgressShard, type VideoId
} from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { isJsonValue, type JsonValue } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"
import type { TabProjectionInvalid, TabProjectionUnavailable } from "./tab-projection"

export type ProgressRequest = { readonly acct: AccountKey; readonly video: VideoId; readonly private: boolean }
export type ProgressSaveRequest = ProgressRequest & { readonly len: number; readonly parts: ProgressParts }
export type ProgressRefusal = { readonly kind: "refused"; readonly reason: "private" | "off" | "no-setup" | "invalid" }
export type ProgressLoad =
  | { readonly kind: "progress"; readonly progress: { readonly len: number; readonly parts: ProgressParts } | null }
  | ProgressRefusal | TabProjectionUnavailable | TabProjectionInvalid
export type ProgressSave =
  | { readonly kind: "committed" | "unchanged" }
  | ProgressRefusal
  | { readonly kind: "failed"; readonly stage: "set" }
  | TabProjectionUnavailable | TabProjectionInvalid
/** The store's watch-progress operations (DATA-24 to DATA-29, DATA-56). Private tabs keep progress themselves (DATA-28). */
export type ProgressOwner = {
  loadProgress(request: ProgressRequest): Promise<ProgressLoad>
  saveProgress(request: ProgressSaveRequest): Promise<ProgressSave>
}

/** The keys one load or save reads: the authority records and the video's shard, or all 16 when the daily prune is due. */
export function progressReadKeys(acct: AccountKey, video: VideoId, prune: boolean): string[] {
  const shards = prune ? PROGRESS_SHARDS : [progressShard(video)]
  return ["doc:settings", documentKey({ kind: "setup", acct }), ...shards.map(shard => progressKey(acct, shard))]
}

/** Progress is kept only while auto-add is on (DATA-29) and the account has an auto-add playlist to keep it for. */
export function progressAuthority(records: Readonly<Record<string, unknown>>, acct: AccountKey): ProgressRefusal | null {
  const settings = readSettingsView(records["doc:settings"])
  if (settings.kind !== "value") return { kind: "refused", reason: "invalid" }
  if (!settings.settings.autoAdd.on) return { kind: "refused", reason: "off" }
  try {
    const setup = decodeDocument(records[documentKey({ kind: "setup", acct })], decodeSetup)
    return setup.kind === "value" && setup.document.data.autoAdd.length > 0 ? null : { kind: "refused", reason: "no-setup" }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "refused", reason: "invalid" }
    throw error
  }
}

export function readProgressEntry(records: Readonly<Record<string, unknown>>, acct: AccountKey, video: VideoId, now: number): ProgressLoad {
  const entry = decodeProgress(records[progressKey(acct, progressShard(video))])[video]
  return { kind: "progress", progress: entry && progressLive(entry, now) ? { len: entry.len, parts: entry.parts } : null }
}

/**
 * The items one save writes: the video's shard, plus every shard the prune changed when it's due. Nothing is
 * returned when the stored copy already says the same.
 */
export function planProgressSave(records: Readonly<Record<string, unknown>>, request: ProgressSaveRequest, now: number, prune: boolean):
  Readonly<Record<string, JsonValue>> {
  const read = (shard: ProgressShard): Progress => decodeProgress(records[progressKey(request.acct, shard)])
  const own = progressShard(request.video)
  const next: Partial<Record<ProgressShard, Progress>> = { [own]: rememberProgress(read(own), request.video, request, now) }
  if (prune) {
    const all = Object.fromEntries(PROGRESS_SHARDS.map(shard => [shard, next[shard] ?? read(shard)])) as Record<ProgressShard, Progress>
    Object.assign(next, pruneProgress(all, now))
  }
  const items: Record<string, JsonValue> = {}
  for (const shard of PROGRESS_SHARDS) {
    const value = next[shard]
    if (!value) continue
    const key = progressKey(request.acct, shard), json = progressJson(value)
    const stored = records[key]
    if (stored === undefined ? Object.keys(json).length === 0 : isStoredJson(stored) && sameSyncJson(stored, json)) continue
    items[key] = json
  }
  return items
}
function isStoredJson(value: unknown): value is JsonValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

/** The daily prune runs at the first save of a day per account, so a background start that writes nothing reads nothing. */
export function createProgressPruneClock() {
  const pruned = new Map<AccountKey, number>()
  return {
    due: (acct: AccountKey, now: number) => { const at = pruned.get(acct); return at === undefined || now - at >= PROGRESS_PRUNE_MS || now < at },
    done: (acct: AccountKey, now: number) => { pruned.set(acct, now) },
    forget: () => pruned.clear()
  }
}
