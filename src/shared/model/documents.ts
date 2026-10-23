import { DecodeError, isRecord, natural, nonempty, object, positive, type Decoder } from "./codec"
import type { Stamp, Stamped, Tombstone } from "./types"

export const DOCUMENT_VERSION = 1
export const STORAGE_SCHEMA_VERSION = 1
export const CONSENT_VERSION = 1

export const decodeStamp = object<Stamp>({ v: positive, gen: nonempty, at: natural, by: nonempty })

export type DecodedDocument<T> =
  | { kind: "absent" }
  | { kind: "value"; document: Stamped<T> }
  | { kind: "deleted"; document: Tombstone }
  | { kind: "newer-version"; version: number; raw: Record<string, unknown> }

export function decodeDocument<T>(raw: unknown, decodeData: Decoder<T>): DecodedDocument<T> {
  if (raw === undefined || raw === null) return { kind: "absent" }
  if (!isRecord(raw)) throw new DecodeError("document", "a stamped document")
  const stamp = decodeStamp(raw, "document")
  if (stamp.v > DOCUMENT_VERSION) return { kind: "newer-version", version: stamp.v, raw }
  if (Object.hasOwn(raw, "deleted")) {
    if (raw.deleted !== true) throw new DecodeError("document.deleted", "true")
    return { kind: "deleted", document: { ...stamp, deleted: true } }
  }
  if (!Object.hasOwn(raw, "data") || raw.data === undefined) throw new DecodeError("document.data", "document data")
  return { kind: "value", document: { ...stamp, data: decodeData(raw.data, "document.data") } }
}
