import {
  decodeDocument, decodeFilter, decodeSettings, decodeSetup, decodeStamp,
  DOCUMENT_VERSION, documentKey,
  type DocumentKey, type Filter, type Settings, type Setup, type Stamp,
  type Stamped, type Tombstone
} from "../../shared/model"
import { isJsonValue, parseJsonText, type JsonObject, type JsonValue } from "../../shared/contracts/json"

export const SINGLE_DOCUMENT_BYTES = 7600
export const SYNC_ITEM_BYTES = 8192
export const SYNC_BUDGET_BYTES = 96 * 1024
export const SYNC_BUDGET_ITEMS = 480

export type RawSyncItem = { readonly key: string; readonly value: unknown }
export type SyncItem = { readonly key: string; readonly value: JsonValue }
export type WireInvalid = {
  kind: "invalid"
  field: "document" | "items" | "pointer" | "chunks"
  reason: "json" | "shape" | "duplicate-key" | "chunk-index" | "stamp-mismatch"
}
export type NewerSyncDocument = { kind: "newer-version"; version: number; raw: JsonObject }
export type EncodedSyncDocument = { baseKey: string; gen: string } & (
  | { mode: "single"; items: readonly [SyncItem] }
  | { mode: "chunked"; items: readonly [SyncItem, SyncItem, ...SyncItem[]] }
)
export type EncodeSyncResult =
  | { kind: "encoded"; encoded: EncodedSyncDocument }
  | NewerSyncDocument
  | WireInvalid
  | { kind: "item-too-large"; key: string; bytes: number }
export type KnownSyncValue =
  | { kind: "settings"; document: Stamped<Settings> }
  | { kind: "setup"; document: Stamped<Setup> }
  | { kind: "filter"; document: Stamped<Filter> }
export type ReadSyncResult =
  | { kind: "absent" }
  | { kind: "incomplete"; gen: string; expected: number; received: number }
  | { kind: "value"; value: KnownSyncValue; json: JsonObject }
  | { kind: "deleted"; document: Tombstone; json: JsonObject }
  | NewerSyncDocument
  | WireInvalid
export type SyncUsage = {
  bytes: number
  items: number
  perItem: readonly { key: string; bytes: number }[]
}
export type SyncBound = "bytes" | "items" | "item-bytes"
export type SyncProjection =
  | { kind: "fits"; usage: SyncUsage }
  | { kind: "full"; usage: SyncUsage; exceeded: readonly [SyncBound, ...SyncBound[]] }
  | WireInvalid

function invalid(field: WireInvalid["field"], reason: WireInvalid["reason"]): WireInvalid {
  return { kind: "invalid", field, reason }
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function dataText(value: JsonValue): string {
  type Part = { kind: "value"; value: JsonValue } | { kind: "text"; text: string }
  const pending: Part[] = [{ kind: "value", value }]
  const output: string[] = []
  while (pending.length > 0) {
    const part = pending.pop()
    if (!part) break
    if (part.kind === "text") {
      output.push(part.text)
      continue
    }
    const current = part.value
    if (current === null || typeof current !== "object") {
      output.push(JSON.stringify(current))
    } else if (Array.isArray(current)) {
      output.push("[")
      pending.push({ kind: "text", text: "]" })
      for (let index = current.length - 1; index >= 0; index--) {
        pending.push({ kind: "value", value: current[index]! })
        if (index > 0) pending.push({ kind: "text", text: "," })
      }
    } else {
      output.push("{")
      pending.push({ kind: "text", text: "}" })
      const entries = Object.entries(current).reverse()
      for (const [index, [key, child]] of entries.entries()) {
        pending.push({ kind: "value", value: child }, { kind: "text", text: `${JSON.stringify(key)}:` })
        if (index < entries.length - 1) pending.push({ kind: "text", text: "," })
      }
    }
  }
  return output.join("")
}

function utf8Bytes(text: string): number {
  let bytes = 0
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}

function itemBytes(key: string, value: JsonValue): number {
  return utf8Bytes(key) + utf8Bytes(dataText(value)) + 4
}

function syncKey(key: DocumentKey): string {
  return `s:${documentKey(key).slice(4)}`
}

type Candidate = Extract<ReadSyncResult, { kind: "value" | "deleted" | "newer-version" | "invalid" }>

function decodeCandidate(key: DocumentKey, json: JsonObject): Candidate {
  if (Object.keys(Object.prototype).length > 0) return invalid("document", "shape")
  try {
    switch (key.kind) {
      case "settings": {
        const result = decodeDocument(json, decodeSettings)
        if (result.kind === "value") return { kind: "value", value: { kind: "settings", document: result.document }, json }
        if (result.kind === "deleted") return { ...result, json }
        if (result.kind === "newer-version") return { ...result, raw: json }
        break
      }
      case "setup": {
        const result = decodeDocument(json, decodeSetup)
        if (result.kind === "value") return { kind: "value", value: { kind: "setup", document: result.document }, json }
        if (result.kind === "deleted") return { ...result, json }
        if (result.kind === "newer-version") return { ...result, raw: json }
        break
      }
      case "filter": {
        const result = decodeDocument(json, decodeFilter)
        if (result.kind === "value") return { kind: "value", value: { kind: "filter", document: result.document }, json }
        if (result.kind === "deleted") return { ...result, json }
        if (result.kind === "newer-version") return { ...result, raw: json }
        break
      }
    }
  } catch {
    return invalid("document", "shape")
  }
  return invalid("document", "shape")
}

export function encodeSyncDocument(input: { key: DocumentKey; document: unknown }): EncodeSyncResult {
  const json = input.document
  if (!isJsonValue(json)) return invalid("document", "json")
  if (!isObject(json)) return invalid("document", "shape")
  const candidate = decodeCandidate(input.key, json)
  if (candidate.kind === "invalid" || candidate.kind === "newer-version") return candidate
  const stamp = candidate.kind === "value" ? candidate.value.document : candidate.document
  const baseKey = syncKey(input.key)
  const text = dataText(json)
  if (utf8Bytes(text) <= SINGLE_DOCUMENT_BYTES) {
    const bytes = itemBytes(baseKey, json)
    if (bytes > SYNC_ITEM_BYTES) return { kind: "item-too-large", key: baseKey, bytes }
    return { kind: "encoded", encoded: { mode: "single", baseKey, gen: stamp.gen, items: [{ key: baseKey, value: json }] } }
  }

  const pointer = { v: stamp.v, gen: stamp.gen, at: stamp.at, by: stamp.by, n: 1 }
  const minimumBytes = itemBytes(baseKey, pointer)
  if (minimumBytes > SYNC_ITEM_BYTES) return { kind: "item-too-large", key: baseKey, bytes: minimumBytes }
  const chunks: [SyncItem, ...SyncItem[]] = [{ key: `${baseKey}@${stamp.gen}.0`, value: "" }]
  let key = chunks[0].key
  let fragment = ""
  let bytes = itemBytes(key, fragment)
  for (const character of text) {
    const cost = utf8Bytes(JSON.stringify(character)) - 2
    if (bytes + cost > SYNC_ITEM_BYTES && fragment !== "") {
      chunks[chunks.length - 1] = { key, value: fragment }
      key = `${baseKey}@${stamp.gen}.${chunks.length}`
      chunks.push({ key, value: "" })
      fragment = ""
      bytes = itemBytes(key, fragment)
    }
    if (bytes + cost > SYNC_ITEM_BYTES) return { kind: "item-too-large", key, bytes: bytes + cost }
    fragment += character
    bytes += cost
  }
  chunks[chunks.length - 1] = { key, value: fragment }
  pointer.n = chunks.length
  const pointerBytes = itemBytes(baseKey, pointer)
  if (pointerBytes > SYNC_ITEM_BYTES) return { kind: "item-too-large", key: baseKey, bytes: pointerBytes }
  return { kind: "encoded", encoded: { mode: "chunked", baseKey, gen: stamp.gen, items: [{ key: baseKey, value: pointer }, ...chunks] } }
}

function sameStamp(left: Stamp, right: Stamp): boolean {
  return left.v === right.v && left.gen === right.gen && left.at === right.at && left.by === right.by
}

export function readSyncDocument(input: { key: DocumentKey; items: readonly RawSyncItem[] }): ReadSyncResult {
  const baseKey = syncKey(input.key)
  const bases = input.items.filter(item => item.key === baseKey)
  if (bases.length > 1) return invalid("items", "duplicate-key")
  const base = bases[0]
  if (!base || base.value === null) return { kind: "absent" }
  const json = base.value
  if (!isJsonValue(json)) return invalid("document", "json")
  if (!isObject(json) || Object.keys(Object.prototype).length > 0) return invalid("document", "shape")
  let stamp: Stamp
  try {
    stamp = decodeStamp(json)
  } catch {
    return invalid("document", "shape")
  }
  if (stamp.v > DOCUMENT_VERSION) return { kind: "newer-version", version: stamp.v, raw: json }
  if (Object.hasOwn(json, "data") || Object.hasOwn(json, "deleted")) return decodeCandidate(input.key, json)
  const n = Object.hasOwn(json, "n") ? json.n : undefined
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return invalid("pointer", "shape")

  const prefix = `${baseKey}@`
  const chunks = new Map<number, string>()
  for (const item of input.items) {
    if (!item.key.startsWith(prefix)) continue
    const suffix = item.key.slice(prefix.length)
    const dot = suffix.lastIndexOf(".")
    if (dot < 0 || suffix.slice(0, dot) !== stamp.gen) continue
    const indexText = suffix.slice(dot + 1)
    const index = Number(indexText)
    if (!/^(0|[1-9][0-9]*)$/.test(indexText) || !Number.isSafeInteger(index) || index >= n) return invalid("chunks", "chunk-index")
    if (chunks.has(index)) return invalid("items", "duplicate-key")
    if (typeof item.value !== "string" || item.value.length === 0) return invalid("chunks", "shape")
    chunks.set(index, item.value)
  }
  if (chunks.size !== n) return { kind: "incomplete", gen: stamp.gen, expected: n, received: chunks.size }
  const text = [...chunks].sort(([left], [right]) => left - right).map(([, fragment]) => fragment).join("")
  const parsed = parseJsonText(text)
  if (!parsed.ok) return invalid("chunks", "json")
  if (!isObject(parsed.value)) return invalid("chunks", "shape")
  let embedded: Stamp
  try {
    embedded = decodeStamp(parsed.value)
  } catch {
    return invalid("chunks", "shape")
  }
  if (!sameStamp(stamp, embedded)) return invalid("chunks", "stamp-mismatch")
  return decodeCandidate(input.key, parsed.value)
}

export function projectSyncWrite(input: { current: readonly RawSyncItem[]; set: readonly RawSyncItem[] }): SyncProjection {
  const projected = new Map<string, unknown>()
  for (const items of [input.current, input.set]) {
    const keys = new Set<string>()
    for (const item of items) {
      if (keys.has(item.key)) return invalid("items", "duplicate-key")
      keys.add(item.key)
      projected.set(item.key, item.value)
    }
  }
  const perItem: { key: string; bytes: number }[] = []
  let bytes = 0
  for (const [key, value] of projected) {
    if (!isJsonValue(value)) return invalid("items", "json")
    const charge = itemBytes(key, value)
    perItem.push({ key, bytes: charge })
    bytes += charge
  }
  const usage = { bytes, items: projected.size, perItem }
  const exceeded: SyncBound[] = []
  if (bytes > SYNC_BUDGET_BYTES) exceeded.push("bytes")
  if (projected.size > SYNC_BUDGET_ITEMS) exceeded.push("items")
  if (perItem.some(item => item.bytes > SYNC_ITEM_BYTES)) exceeded.push("item-bytes")
  const [first, ...rest] = exceeded
  return first === undefined ? { kind: "fits", usage } : { kind: "full", usage, exceeded: [first, ...rest] }
}
