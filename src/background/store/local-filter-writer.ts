import {
  CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError,
  decodeDevice, decodeDocument, decodeFilter, decodeSetup, decodeSyncState, documentKey,
  type AccountKey, type PlaylistId
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import { changeFilterSetting, type FilterSettingInput } from "./channel-filter-edit"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
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
  get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonObject>>): Promise<void>
}

export type SyncStorage = {
  get(): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
}

type FlushSource =
  | { kind: "set"; sent: readonly SyncDocumentRecord[]; repairs: readonly SyncDocumentRecord[] }
  | { kind: "readback"; repairs: readonly SyncDocumentRecord[] }
export type SyncFlushResult =
  | { kind: "idle" }
  | { kind: "reconciled"; repaired: readonly SyncDocumentRecord[] }
  | { kind: "pushed"; sent: readonly SyncDocumentRecord[]; repaired: readonly SyncDocumentRecord[] }
  | { kind: "unavailable" }
  | { kind: "blocked" }
  | { kind: "sync-set-failed"; error: unknown; sent: readonly SyncDocumentRecord[] }
  | { kind: "acknowledgement-failed"; error: unknown; source: FlushSource }
  | { kind: "unconfirmed"; sent: readonly SyncDocumentRecord[]; cause:
    | { kind: "authority" | "readback" }
    | { kind: "read-failed"; error: unknown }
  }

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

function authority(records: Readonly<Record<string, unknown>>) {
  const unavailable = (reason: Extract<LocalFilterWriteResult, { kind: "unavailable" }>["reason"]) => ({ kind: "unavailable", reason } as const)
  if (records === null || typeof records !== "object" || Array.isArray(records) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(records)) || Reflect.ownKeys(records).some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(records, key)
      return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable
    })) return unavailable("startup")
  const schema = records.schema
  if (typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION) return unavailable("newer-layout")
  if (!Object.hasOwn(records, "schema") || !Object.hasOwn(records, "device") || schema !== STORAGE_SCHEMA_VERSION ||
    !isJsonObject(records.device) || Object.keys(Object.prototype).length > 0) return unavailable("startup")
  const rawDevice = records.device
  if (!["id", "consent", "syncOn"].every(key => Object.hasOwn(rawDevice, key))) return unavailable("startup")
  try {
    const device = decodeDevice(rawDevice)
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") return unavailable("startup")
    let history: { raw: JsonObject; editedSinceOff: boolean; joined: string | null } | undefined
    if (Object.hasOwn(records, "sync")) {
      if (!isJsonObject(records.sync)) return unavailable("sync-writer-required")
      let decoded
      try { decoded = decodeSyncState(records.sync) } catch (error) {
        if (error instanceof DecodeError) return unavailable("sync-writer-required")
        throw error
      }
      if (device.syncOn ? decoded.joined === null || !["ok", "full", "update-needed"].includes(decoded.status) : decoded.status !== "off") return unavailable("sync-writer-required")
      history = { raw: records.sync, editedSinceOff: decoded.editedSinceOff, joined: decoded.joined }
    }
    if (device.syncOn && !history) return unavailable("sync-writer-required")
    return { kind: "ready", device, rawDevice, history } as const
  } catch (error) {
    if (error instanceof DecodeError) return unavailable("startup")
    throw error
  }
}

function repairedHistory(raw: JsonObject, repairs: readonly SyncDocumentRecord[]): JsonObject | undefined {
  const state = decodeSyncState(raw)
  const pending = repairs.filter(record => state.pushed[record.name] !== record.gen)
  if (pending.length === 0) return
  if (!isJsonObject(raw.pushed)) throw new TypeError("Missing raw pushed history")
  const pushed = { ...raw.pushed }
  for (const record of pending) Object.defineProperty(pushed, record.name, { value: record.gen, enumerable: true, writable: true, configurable: true })
  const next = { ...raw, pushed }
  if (!isJsonObject(next)) throw new TypeError("Writer produced a non-JSON history")
  decodeSyncState(next)
  return next
}

export function createLocalFilterWriter(deps: {
  readonly local: LocalWriteStorage
  readonly sync: SyncStorage
  readonly now: () => number
  readonly generation: () => string
}): {
  change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
  flushSync(): Promise<SyncFlushResult>
} {
  let lane: Promise<void> = Promise.resolve()

  async function execute(change: LocalFilterChange, at: number): Promise<LocalFilterWriteResult> {
    const invalid = { kind: "result", result: { refused: "invalid" } } as const
    const ok = { kind: "result", result: { ok: true } } as const
    const setupKey = documentKey({ kind: "setup", acct: change.acct })
    const filterKey = documentKey({ kind: "filter", acct: change.acct, playlist: change.playlist })
    let records = await deps.local.get(["schema", "device", "sync", setupKey, filterKey])
    let exhaustive = false
    for (;;) {
      const ready = authority(records)
      if (ready.kind === "unavailable") return ready
      const { device, history } = ready
      if (!device.syncOn && exhaustive) return { kind: "unavailable", reason: "sync-writer-required" }

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
      if (device.syncOn) {
        if (!exhaustive) {
          records = await deps.local.get(null)
          exhaustive = true
          continue
        }
      }

      const current = filter.kind === "value" ? filter.document.data : undefined
      const result = changeFilterSetting({ current, desired: change.desired, clearListedChannels: change.clearListedChannels })
      if (result.kind === "unchanged") {
        if (!device.syncOn) return ok
        const admission = planSyncWrite({ local: records, sync: await deps.sync.get(),
          intent: { kind: "unchanged", key: { kind: "filter", acct: change.acct, playlist: change.playlist } } })
        if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
        return admission.kind === "refused" ? { kind: "result", result: { refused: admission.reason } } : ok
      }
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
      const items: Record<string, JsonObject> = { [filterKey]: envelope }
      if (device.syncOn) {
        const admission = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: {
          kind: "changed", key: { kind: "filter", acct: change.acct, playlist: change.playlist }, document: envelope
        } })
        if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
        if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
        if (admission.kind === "planned" && history) {
          const repaired = repairedHistory(history.raw, admission.repairs)
          if (repaired) items.sync = repaired
        }
      } else if (history && !history.editedSinceOff) {
        const sync = { ...history.raw, editedSinceOff: true }
        if (!isJsonObject(sync)) throw new TypeError("Writer produced a non-JSON history")
        decodeSyncState(sync)
        items.sync = sync
      }
      await deps.local.set(items)
      return ok
    }
  }

  async function flush(): Promise<SyncFlushResult> {
    const records = await deps.local.get(null)
    const ready = authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable" }
    if (!ready.device.syncOn) return { kind: "idle" }
    const plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })
    if (plan.kind === "refused") return plan.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable" }
    if (plan.kind !== "planned") return { kind: "unavailable" }
    if (plan.sent.length === 0 && plan.repairs.length === 0) return { kind: "idle" }
    const source: FlushSource = plan.sent.length > 0
      ? { kind: "set", sent: plan.sent, repairs: plan.repairs }
      : { kind: "readback", repairs: plan.repairs }
    if (source.kind === "set") {
      try { await deps.sync.set(Object.fromEntries(plan.items.map(item => [item.key, item.value]))) } catch (error) {
        return { kind: "sync-set-failed", error, sent: plan.sent }
      }
    }
    let latest, postflight, snapshot
    try {
      latest = await deps.local.get(null)
      const current = authority(latest)
      if (current.kind !== "ready" || !current.device.syncOn || !current.history ||
        current.history.joined !== ready.history?.joined || !sameSyncJson(current.rawDevice, ready.rawDevice)) {
        return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "authority" } } : { kind: "unavailable" }
      }
      snapshot = await deps.sync.get()
      postflight = planSyncWrite({ local: latest, sync: snapshot, intent: { kind: "flush" } })
    } catch (error) {
      if (source.kind === "set") return { kind: "unconfirmed", sent: plan.sent, cause: { kind: "read-failed", error } }
      throw error
    }
    const captured = [...plan.sent, ...plan.repairs]
    const remoteItems = Object.entries(snapshot).map(([key, value]) => ({ key, value }))
    if (postflight.kind !== "planned" || !sameSyncJson(plan.metadata, postflight.metadata) ||
      captured.some(record => {
        const raw = latest[record.name]
        const remote = readSyncDocument({ key: record.key, items: remoteItems })
        return !isJsonObject(raw) || !sameSyncJson(record.document, raw) ||
          (remote.kind !== "value" && remote.kind !== "deleted") || !sameSyncJson(record.document, remote.json)
      })) {
      return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "readback" } } : { kind: "unavailable" }
    }
    const rawHistory = latest.sync
    if (!isJsonObject(rawHistory)) throw new TypeError("Missing current history")
    const next = repairedHistory(rawHistory, captured)
    if (next) {
      try { await deps.local.set({ sync: next }) } catch (error) {
        return { kind: "acknowledgement-failed", error, source }
      }
    }
    return source.kind === "set" ? { kind: "pushed", sent: plan.sent, repaired: plan.repairs }
      : next ? { kind: "reconciled", repaired: plan.repairs } : { kind: "idle" }
  }

  return {
    flushSync() {
      const work = lane.then(flush)
      lane = work.then(() => {}, () => {})
      return work
    },
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
