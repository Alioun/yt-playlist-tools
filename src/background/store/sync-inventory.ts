import { documentKey, parseDocumentKey, type DocumentKey } from "../../shared/model"
import { projectSyncWrite, readSyncDocument, type RawSyncItem, type ReadSyncResult, type SyncProjection, type WireInvalid } from "./sync-codec"

export type SyncInventoryDocument = {
  readonly key: DocumentKey
  readonly baseKey: string
  readonly result: ReadSyncResult
}

export type SyncInventoryResult =
  | WireInvalid
  | {
      readonly kind: "read"
      readonly documents: readonly SyncInventoryDocument[]
      readonly occupancy: Exclude<SyncProjection, WireInvalid>
    }

export function readSyncInventory(input: { readonly items: readonly RawSyncItem[] }): SyncInventoryResult {
  const occupancy = projectSyncWrite({ current: input.items, set: [] })
  if (occupancy.kind === "invalid") return occupancy

  const documents: SyncInventoryDocument[] = []
  for (const item of input.items) {
    if (!item.key.startsWith("s:")) continue
    const name = `doc:${item.key.slice(2)}`
    const key = parseDocumentKey(name)
    if (!key || documentKey(key) !== name) continue
    documents.push({ key, baseKey: item.key, result: readSyncDocument({ key, items: input.items }) })
  }
  return { kind: "read", documents, occupancy }
}
