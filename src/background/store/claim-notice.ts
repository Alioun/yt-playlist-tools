import { classifyRetainedAuthority, archivedKeys } from "./interim-canonical-authority"
import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError, decodeDevice, type ClaimNotice } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { Origin } from "../../shared/contracts/results"
import type { Snapshot } from "../../shared/model/settings-view"
import type { LocalWriteStorage } from "./local-filter-writer"
import { LEGACY_DELETE_KEYS } from "./legacy"
import { sameSyncJson } from "./sync-write-admission"

export type ClaimNoticeRead =
  | { readonly kind: "empty" }
  | { readonly kind: "pending"; readonly notice: Snapshot<ClaimNotice> }
  | { readonly kind: "held"; readonly reason: "consent" | "upgrade-note" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "stale" }
  | { readonly kind: "invalid"; readonly field: "records" | "schema" | "device" }

export type NoticeWriteObservation = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }

export type NormalUiOrigin = Extract<Origin, { kind: "ui" }> & { readonly incognito: false }

export type ClaimNoticeAcknowledgement =
  | { readonly kind: "unchanged"; readonly reason: "empty" | "different-notice" }
  | { readonly kind: "committed"; readonly write: NoticeWriteObservation }
  | { readonly kind: "refused"; readonly reason: "invalid" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "stale" | "consent" | "upgrade-note" }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set-not-observed"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly write: NoticeWriteObservation; readonly cause: { readonly kind: "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

function copy(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copy) : copyObject(value)
}

function copyObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

function freeze(value: object): void {
  for (const child of Object.values(value)) if (child !== null && typeof child === "object") freeze(child)
  Object.freeze(value)
}

export function projectClaimNotice(input: { readonly records: Readonly<Record<string, unknown>> }): ClaimNoticeRead {
  const records = input.records
  try {
    if (
      records === null ||
      typeof records !== "object" ||
      Array.isArray(records) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(records)) ||
      Object.keys(Object.prototype).length > 0 ||
      Reflect.ownKeys(records).some(key => {
        const descriptor = Object.getOwnPropertyDescriptor(records, key)
        return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable
      })
    )
      return { kind: "invalid", field: "records" }
    if (!Object.hasOwn(records, "schema")) return { kind: "unavailable", reason: "startup" }
    if (typeof records.schema !== "number" || !Number.isSafeInteger(records.schema) || records.schema < 1) return { kind: "invalid", field: "schema" }
    if (records.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
    const retained = classifyRetainedAuthority(records)
    const exempt = retained.kind === "canonical-archive" ? archivedKeys(retained.checkpoint) : new Set<string>()
    if (records.schema !== STORAGE_SCHEMA_VERSION || retained.kind === "held" || LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key) && !exempt.has(key)))
      return { kind: "unavailable", reason: "startup" }
    if (!Object.hasOwn(records, "device")) return { kind: "held", reason: "consent" }
    if (!jsonObject(records.device)) return { kind: "invalid", field: "device" }
    let device
    try {
      device = decodeDevice(copyObject(records.device))
    } catch (error) {
      if (error instanceof DecodeError) return { kind: "invalid", field: "device" }
      throw error
    }
    if (device.consent?.v !== CONSENT_VERSION) return { kind: "held", reason: "consent" }
    if (device.upgradeNote?.state === "pending") return { kind: "held", reason: "upgrade-note" }
    if (device.claimNotice === null) return { kind: "empty" }
    freeze(device.claimNotice)
    return { kind: "pending", notice: device.claimNotice }
  } catch {
    return { kind: "invalid", field: "records" }
  }
}

/** The existing owner holds its lane until this complete readback finishes. */
export async function executeClaimNoticeAcknowledgement(deps: {
  readonly local: LocalWriteStorage
  readonly expected: Snapshot<ClaimNotice>
  readonly isStopped: () => boolean
}): Promise<ClaimNoticeAcknowledgement> {
  const invalid = { kind: "refused", reason: "invalid" } as const
  const stale = { kind: "unavailable", reason: "stale" } as const
  try {
    if (!jsonObject(deps.expected)) return invalid
    const expectedNotice = copyObject(deps.expected)
    try {
      decodeDevice({ id: "notice-validation", claimNotice: expectedNotice })
    } catch (error) {
      if (error instanceof DecodeError) return invalid
      throw error
    }
    if (deps.isStopped()) return stale
    const loaded = await deps.local.get(null)
    if (deps.isStopped()) return stale
    const view = projectClaimNotice({ records: loaded })
    if (view.kind === "invalid") return invalid
    if (view.kind === "unavailable" || view.kind === "held") return { kind: "unavailable", reason: view.reason }
    if (view.kind === "empty") return { kind: "unchanged", reason: "empty" }
    if (!jsonObject(loaded) || !jsonObject(loaded.device)) return invalid
    const baseline = copyObject(loaded)
    if (!sameSyncJson(view.notice, expectedNotice)) return { kind: "unchanged", reason: "different-notice" }
    const nextRawDevice = { ...copyObject(loaded.device), claimNotice: null }
    const expected = { ...baseline, device: nextRawDevice }
    const preflight = await deps.local.get(null)
    if (deps.isStopped()) return stale
    if (!jsonObject(preflight) || !sameSyncJson(preflight, baseline)) return stale
    let write: NoticeWriteObservation
    try {
      await deps.local.set({ device: nextRawDevice })
      write = { kind: "resolved" }
    } catch (error) {
      write = { kind: "rejected", error }
    }
    const unconfirmed = (cause: Extract<ClaimNoticeAcknowledgement, { kind: "unconfirmed" }>["cause"]): ClaimNoticeAcknowledgement => ({ kind: "unconfirmed", write, cause })
    if (deps.isStopped()) return unconfirmed({ kind: "stopped" })
    try {
      const readback = await deps.local.get(null)
      if (deps.isStopped()) return unconfirmed({ kind: "stopped" })
      if (jsonObject(readback) && sameSyncJson(readback, expected)) return { kind: "committed", write }
      if (write.kind === "rejected" && jsonObject(readback) && sameSyncJson(readback, baseline)) return { kind: "failed", stage: "set-not-observed", error: write.error }
      return unconfirmed({ kind: "readback" })
    } catch (error) {
      return unconfirmed({ kind: "read-failed", error })
    }
  } catch (error) {
    return { kind: "failed", stage: "before-set", error }
  }
}
