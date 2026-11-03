import { DecodeError, decodeSyncMeta, decodeSyncState, documentKey, parseDocumentKey, isAccountKey, isPlaylistId, type DocumentKey, type Stamp } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { encodeSyncDocument, projectSyncWrite, readSyncDocument, type ReadSyncResult, type SyncItem } from "./sync-codec"

type Candidate = Extract<SyncWritePlanInput["intent"], { kind: "changed-batch" }>["documents"][number]

export type SyncWritePlanInput = {
  readonly local: Readonly<Record<string, unknown>>
  readonly sync: Readonly<Record<string, unknown>>
  /**
   * A user's change must fit the budget. Label refreshes and marks may use the headroom up to the browsers' quota
   * (SYNC-16), and so may a flush, which only sends what was already admitted.
   */
  readonly allowance?: "headroom"
  readonly intent:
    | { readonly kind: "flush" }
    | { readonly kind: "unchanged"; readonly key: DocumentKey }
    | { readonly kind: "changed"; readonly key: DocumentKey; readonly document: JsonObject }
    | { readonly kind: "changed-batch"; readonly documents: readonly [{ readonly key: DocumentKey; readonly document: JsonObject }, ...{ readonly key: DocumentKey; readonly document: JsonObject }[]] }
}
export type SyncDocumentRecord = {
  readonly key: DocumentKey
  readonly name: string
  readonly gen: Stamp["gen"]
  readonly document: JsonObject
}
export type SyncWritePlan =
  | { kind: "unchanged" }
  | {
      kind: "planned"
      items: readonly SyncItem[]
      sent: readonly SyncDocumentRecord[]
      repairs: readonly SyncDocumentRecord[]
      metadata: JsonObject
    }
  | { kind: "refused"; reason: "sync-full" | "update-needed" | "invalid" }
  | { kind: "unavailable" }

function jsonObject(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}

export function sameSyncJson(left: JsonValue, right: JsonValue): boolean {
  const pending: [JsonValue, JsonValue][] = [[left, right]]
  while (pending.length) {
    const pair = pending.pop()
    if (!pair) break
    const [a, b] = pair
    if (a === b) continue
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const key of keys) {
      const av: unknown = Object.getOwnPropertyDescriptor(a, key)?.value
      const bv: unknown = Object.getOwnPropertyDescriptor(b, key)?.value
      if (!Object.hasOwn(b, key) || !isJsonValue(av) || !isJsonValue(bv)) return false
      pending.push([av, bv])
    }
  }
  return true
}

function complete(result: ReadSyncResult): result is Extract<ReadSyncResult, { kind: "value" | "deleted" }> {
  return result.kind === "value" || result.kind === "deleted"
}

export function planSyncWrite(input: SyncWritePlanInput): SyncWritePlan {
  const unavailable = { kind: "unavailable" } as const
  const { local, sync, intent } = input
  if (!jsonObject(local) || !jsonObject(sync) || Object.keys(Object.prototype).length > 0 || !Object.hasOwn(local, "sync") || !Object.hasOwn(sync, "s:meta")) return unavailable
  const rawMeta = sync["s:meta"]
  if (!jsonObject(rawMeta) || (Object.hasOwn(rawMeta, "reset") && rawMeta.reset === true)) return unavailable
  let state
  try {
    const meta = decodeSyncMeta(rawMeta)
    state = decodeSyncState(local.sync)
    if (meta.v !== 1 || meta.id !== state.joined || !["ok", "full", "update-needed"].includes(state.status)) return unavailable
  } catch (error) {
    if (error instanceof DecodeError) return unavailable
    throw error
  }
  const current = Object.entries(sync).map(([key, value]) => ({ key, value }))
  const invalid = { kind: "refused", reason: "invalid" } as const
  const proposed = intent.kind === "changed" ? [intent] : intent.kind === "changed-batch" ? intent.documents : []
  if (intent.kind === "changed" || intent.kind === "changed-batch") {
    if (!isJsonValue({ intent }) || !Array.isArray(proposed) || proposed.length === 0) return invalid
  }
  const addressed = intent.kind === "flush" || intent.kind === "changed-batch" ? undefined : documentKey(intent.key)
  const remotes = new Map<string, ReadSyncResult>()
  for (const item of proposed) {
    if (!jsonObject(item) || !jsonObject(item.key)) return invalid
    if (item.key.kind !== "settings" && (!isAccountKey(item.key.acct) || (item.key.kind === "filter" && !isPlaylistId(item.key.playlist)))) return invalid
    if (intent.kind === "changed-batch" && Object.keys(item).some(field => field !== "key" && field !== "document")) return invalid
    const name = documentKey(item.key),
      key = parseDocumentKey(name)
    if (!key || remotes.has(name)) return invalid
    remotes.set(name, readSyncDocument({ key, items: current }))
  }
  if (intent.kind === "unchanged" && addressed !== undefined) remotes.set(addressed, readSyncDocument({ key: intent.key, items: current }))
  if ([...remotes.values()].some(remote => remote.kind === "newer-version")) return { kind: "refused", reason: "update-needed" }
  for (const [name, remote] of remotes) {
    const base = `s:${name.slice(4)}`
    if (remote.kind === "invalid" || remote.kind === "incomplete" || (Object.hasOwn(sync, base) && sync[base] === null)) return unavailable
  }

  const documents = new Map<string, SyncDocumentRecord>()
  const repairs: SyncDocumentRecord[] = []
  const names = intent.kind === "unchanged" ? [documentKey(intent.key)] : Object.keys(local).filter(key => key.startsWith("doc:"))
  for (const name of names) {
    if (!Object.hasOwn(local, name)) continue
    const key = parseDocumentKey(name),
      raw = local[name]
    if (!key || documentKey(key) !== name || !jsonObject(raw)) return unavailable
    const base = `s:${name.slice(4)}`
    const own = readSyncDocument({ key, items: [{ key: base, value: raw }] })
    const remote = remotes.get(name) ?? readSyncDocument({ key, items: current })
    if (own.kind === "newer-version") {
      if ((!Object.hasOwn(raw, "data") && raw.deleted !== true) || remote.kind !== "newer-version" || !sameSyncJson(raw, remote.raw)) return unavailable
      continue
    }
    if (!complete(own)) return unavailable
    if (remote.kind === "newer-version") continue
    const record = { key, name, gen: own.kind === "value" ? own.value.document.gen : own.document.gen, document: raw }
    if (remote.kind === "absent") {
      if (Object.hasOwn(sync, base)) return unavailable
      documents.set(name, record)
      continue
    }
    if (!complete(remote)) return unavailable
    if (remote.json.gen === raw.gen) {
      if (!sameSyncJson(raw, remote.json)) return unavailable
      if (raw.gen !== state.pushed[name]) repairs.push(record)
      continue
    } else if (remote.json.gen !== state.pushed[name] || raw.gen === state.pushed[name]) return unavailable
    if (raw.gen !== state.pushed[name]) documents.set(name, record)
  }
  // SYNC-16: a mark or label refresh saved past the quota waits outside admission, so it never blocks anything else.
  const waiting = new Map<string, SyncDocumentRecord>()
  for (const [name, record] of documents)
    if (state.deferred?.[name] === record.gen) {
      waiting.set(name, record)
      documents.delete(name)
    }
  if (intent.kind === "unchanged") {
    const remote = remotes.get(documentKey(intent.key))
    return !Object.hasOwn(local, documentKey(intent.key)) && remote && complete(remote) ? unavailable : { kind: "unchanged" }
  }

  for (const name of Object.keys(state.pushed)) {
    const key = parseDocumentKey(name)
    if (!key || documentKey(key) !== name || !Object.hasOwn(local, name)) return unavailable
  }
  for (const base of Object.keys(sync)) {
    if (!base.startsWith("s:")) continue
    const key = parseDocumentKey(`doc:${base.slice(2)}`)
    if (!key || `s:${documentKey(key).slice(4)}` !== base || Object.hasOwn(local, documentKey(key))) continue
    const remote = readSyncDocument({ key, items: current })
    // A synced tombstone agrees with this browser's absence, as between the two turns of an expiry (R178).
    if (remote.kind !== "newer-version" && remote.kind !== "deleted") return unavailable
  }
  let candidates: readonly Candidate[] = intent.kind === "changed-batch" ? intent.documents : []
  if (intent.kind === "changed") {
    candidates = [intent]
  }
  for (const item of candidates) {
    const name = documentKey(item.key)
    const candidate = readSyncDocument({ key: item.key, items: [{ key: `s:${name.slice(4)}`, value: item.document }] })
    if (!complete(candidate)) return invalid
    documents.set(name, { key: item.key, name, gen: candidate.kind === "value" ? candidate.value.document.gen : candidate.document.gen, document: item.document })
    waiting.delete(name)
  }
  const set = new Map<string, JsonValue>()
  for (const [name, outgoing] of documents) {
    const encoded = encodeSyncDocument(outgoing)
    if (encoded.kind === "item-too-large") return { kind: "refused", reason: "sync-full" }
    if (encoded.kind !== "encoded") return remotes.has(name) ? { kind: "refused", reason: "invalid" } : unavailable
    for (const item of encoded.encoded.items) {
      if (set.has(item.key)) return unavailable
      set.set(item.key, item.value)
    }
  }
  let items: readonly SyncItem[] = [...set].map(([key, value]) => ({ key, value }))
  const sent = [...documents.values()]
  if (intent.kind !== "flush" || set.size > 0) {
    const projection = projectSyncWrite({ current, set: [...set].map(([key, value]) => ({ key, value })), limits: intent.kind === "flush" || input.allowance === "headroom" ? "quota" : "budget" })
    if (projection.kind === "invalid") return unavailable
    if (projection.kind === "full") return { kind: "refused", reason: "sync-full" }
  }
  // A flush adds each waiting document that now fits the quota, in key order, and leaves the rest for a later flush.
  if (intent.kind === "flush")
    for (const name of [...waiting.keys()].sort()) {
      const record = waiting.get(name)!,
        encoded = encodeSyncDocument(record)
      if (encoded.kind !== "encoded") continue
      const next = [...items, ...encoded.encoded.items]
      if (projectSyncWrite({ current, set: next, limits: "quota" }).kind !== "fits") continue
      items = next
      sent.push(record)
    }
  return { kind: "planned", items, sent, repairs, metadata: rawMeta }
}

/** Saves an automatic update past the quota locally, to push once room frees up (SYNC-16). Acknowledging its push drops it. */
export function deferSyncDocument(history: JsonObject, name: string, gen: string): JsonObject {
  const deferred = jsonObject(history.deferred) ? history.deferred : {}
  return { ...history, deferred: { ...deferred, [name]: gen } }
}
