import {
  CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError,
  decodeDevice, decodeDocument, decodeFilter, decodeSetup, documentKey,
  type AccountKey, type PlaylistId
} from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import { changeFilterSetting, type FilterSettingInput } from "./channel-filter-edit"
import { prepareDocumentBody } from "./write-preparation"

type UiOrigin = Extract<Origin, { kind: "ui" }>

export type LocalFilterChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly desired: FilterSettingInput["desired"]
} & (
  | { readonly clearListedChannels: "not-confirmed" }
  | { readonly clearListedChannels: "confirmed"; readonly expectedGeneration: string | null }
)

export type LocalFilterWriteResult =
  | { readonly kind: "result"; readonly result: ChangeResult }
  | {
    readonly kind: "unavailable"
    readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context"
  }

export type LocalWriteStorage = {
  get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonObject>>): Promise<void>
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

export function createLocalFilterWriter(deps: {
  readonly local: LocalWriteStorage
  readonly now: () => number
  readonly generation: () => string
}): {
  change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
} {
  let lane: Promise<void> = Promise.resolve()

  async function execute(change: LocalFilterChange, at: number): Promise<LocalFilterWriteResult> {
    const invalid = { kind: "result", result: { refused: "invalid" } } as const
    const ok = { kind: "result", result: { ok: true } } as const
    const setupKey = documentKey({ kind: "setup", acct: change.acct })
    const filterKey = documentKey({ kind: "filter", acct: change.acct, playlist: change.playlist })
    const records = await deps.local.get(["schema", "device", "sync", setupKey, filterKey])
    const schema = records.schema
    if (typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION) {
      return { kind: "unavailable", reason: "newer-layout" }
    }
    if (schema !== STORAGE_SCHEMA_VERSION || !isJsonObject(records.device) || Object.keys(Object.prototype).length > 0) {
      return { kind: "unavailable", reason: "startup" }
    }
    const rawDevice = records.device
    if (!["id", "consent", "syncOn"].every(key => Object.hasOwn(rawDevice, key))) {
      return { kind: "unavailable", reason: "startup" }
    }
    let device
    try { device = decodeDevice(rawDevice) } catch (error) {
      if (error instanceof DecodeError) return { kind: "unavailable", reason: "startup" }
      throw error
    }
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") {
      return { kind: "unavailable", reason: "startup" }
    }
    if (device.syncOn || Object.hasOwn(records, "sync")) return { kind: "unavailable", reason: "sync-writer-required" }

    const rawSetup = records[setupKey]
    if (!isJsonObject(rawSetup)) return { kind: "unavailable", reason: "account-context" }
    try {
      const setup = decodeDocument(rawSetup, decodeSetup)
      if (setup.kind !== "value" || !setup.document.data.autoAdd.some(entry => entry.pl === change.playlist)) {
        return { kind: "unavailable", reason: "account-context" }
      }
    } catch (error) {
      if (error instanceof DecodeError) return { kind: "unavailable", reason: "account-context" }
      throw error
    }

    const rawFilter = records[filterKey]
    if (Object.hasOwn(records, filterKey) && !isJsonValue(rawFilter)) return invalid
    let filter
    try { filter = decodeDocument(rawFilter, decodeFilter) } catch (error) {
      if (error instanceof DecodeError) return invalid
      throw error
    }
    if (filter.kind === "newer-version") return { kind: "result", result: { refused: "update-needed" } }
    const current = filter.kind === "value" ? filter.document.data : undefined
    const result = changeFilterSetting({ current, desired: change.desired, clearListedChannels: change.clearListedChannels })
    if (result.kind === "unchanged") return ok
    if (result.kind === "confirmation-required") return invalid
    if (filter.kind === "value" && current && current.mode !== change.desired.mode && current.channels.length > 0 &&
      (change.clearListedChannels !== "confirmed" || change.expectedGeneration !== filter.document.gen)) return invalid

    const prepared = prepareDocumentBody({ kind: "filter", data: result.filter })
    if (prepared.kind !== "prepared") return invalid
    const envelope = {
      ...(isJsonObject(rawFilter) ? rawFilter : {}),
      v: DOCUMENT_VERSION, gen: deps.generation(), at, by: device.id, data: prepared.data
    }
    if ("deleted" in envelope) delete envelope.deleted
    if (!isJsonObject(envelope)) throw new TypeError("Writer produced a non-JSON envelope")
    if (decodeDocument(envelope, decodeFilter).kind !== "value") throw new TypeError("Writer produced an unsupported Filter")
    await deps.local.set({ [filterKey]: envelope })
    return ok
  }

  return {
    async change(origin, change) {
      if (origin.kind !== "ui" || origin.incognito !== false || !Number.isInteger(origin.windowId) || origin.windowId < 0) {
        return { kind: "result", result: { refused: "private" } }
      }
      const at = deps.now()
      const work = lane.then(() => execute(change, at))
      lane = work.then(() => {}, () => {})
      return work
    }
  }
}
