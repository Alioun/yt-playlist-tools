import {
  DecodeError, decodeSyncMeta, decodeSyncState, documentKey, parseDocumentKey,
  type DocumentKey, type Stamp
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { encodeSyncDocument, projectSyncWrite, readSyncDocument, type ReadSyncResult, type SyncItem } from "./sync-codec"

export type SyncWritePlanInput = {
  readonly local: Readonly<Record<string, unknown>>
  readonly sync: Readonly<Record<string, unknown>>
  readonly intent:
    | { readonly kind: "flush" }
    | { readonly kind: "unchanged"; readonly key: DocumentKey }
    | { readonly kind: "changed"; readonly key: DocumentKey; readonly document: JsonObject }
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
  if (!jsonObject(local) || !jsonObject(sync) || Object.keys(Object.prototype).length > 0 ||
    !Object.hasOwn(local, "sync") || !Object.hasOwn(sync, "s:meta")) return unavailable
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
  const addressed = intent.kind === "flush" ? undefined : documentKey(intent.key)
  const remoteAddressed = intent.kind === "flush" ? undefined : readSyncDocument({ key: intent.key, items: current })
  if (remoteAddressed?.kind === "newer-version") return { kind: "refused", reason: "update-needed" }
  if (remoteAddressed?.kind === "invalid" || remoteAddressed?.kind === "incomplete" ||
    (addressed !== undefined && Object.hasOwn(sync, `s:${addressed.slice(4)}`) && sync[`s:${addressed.slice(4)}`] === null)) return unavailable

  const documents = new Map<string, SyncDocumentRecord>()
  const repairs: SyncDocumentRecord[] = []
  const names = intent.kind === "unchanged" ? [documentKey(intent.key)] : Object.keys(local).filter(key => key.startsWith("doc:"))
  for (const name of names) {
    if (!Object.hasOwn(local, name)) continue
    const key = parseDocumentKey(name), raw = local[name]
    if (!key || documentKey(key) !== name || !jsonObject(raw)) return unavailable
    const base = `s:${name.slice(4)}`
    const own = readSyncDocument({ key, items: [{ key: base, value: raw }] })
    const remote = name === addressed && remoteAddressed ? remoteAddressed : readSyncDocument({ key, items: current })
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
  if (intent.kind === "unchanged") return !Object.hasOwn(local, documentKey(intent.key)) && remoteAddressed && complete(remoteAddressed) ? unavailable : { kind: "unchanged" }

  for (const name of Object.keys(state.pushed)) {
    const key = parseDocumentKey(name)
    if (!key || documentKey(key) !== name || !Object.hasOwn(local, name)) return unavailable
  }
  for (const base of Object.keys(sync)) {
    if (!base.startsWith("s:")) continue
    const key = parseDocumentKey(`doc:${base.slice(2)}`)
    if (!key || `s:${documentKey(key).slice(4)}` !== base || Object.hasOwn(local, documentKey(key))) continue
    const remote = readSyncDocument({ key, items: current })
    if (remote.kind !== "newer-version") return unavailable
  }
  if (intent.kind === "changed") {
    const candidate = readSyncDocument({ key: intent.key, items: [{ key: `s:${documentKey(intent.key).slice(4)}`, value: intent.document }] })
    if (!complete(candidate)) return { kind: "refused", reason: "invalid" }
    documents.set(documentKey(intent.key), { key: intent.key, name: documentKey(intent.key),
      gen: candidate.kind === "value" ? candidate.value.document.gen : candidate.document.gen, document: intent.document })
  }
  const set = new Map<string, JsonValue>()
  for (const [name, outgoing] of documents) {
    const encoded = encodeSyncDocument(outgoing)
    if (encoded.kind === "item-too-large") return { kind: "refused", reason: "sync-full" }
    if (encoded.kind !== "encoded") return name === addressed
      ? { kind: "refused", reason: "invalid" } : unavailable
    for (const item of encoded.encoded.items) {
      if (set.has(item.key)) return unavailable
      set.set(item.key, item.value)
    }
  }
  const planned = { kind: "planned", items: [...set].map(([key, value]) => ({ key, value })), sent: [...documents.values()], repairs, metadata: rawMeta } as const
  if (intent.kind === "flush" && set.size === 0) return planned
  const projection = projectSyncWrite({ current, set: [...set].map(([key, value]) => ({ key, value })) })
  if (projection.kind === "invalid") return unavailable
  return projection.kind === "full" ? { kind: "refused", reason: "sync-full" } : planned
}
