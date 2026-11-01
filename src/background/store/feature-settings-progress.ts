import { decodeSettings, decodeDocument, DOCUMENT_VERSION } from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { objectShape } from "../../shared/contracts/object-shape"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { consentObject, isAgreement, readConsentDevice, type Agreement } from "./consent-withdrawal"
import { joinProgressPlan } from "./sync-join-persistence"
import { sameSyncJson } from "./sync-write-admission"
import { prepareFirstEditHistory } from "./first-edit-provenance"
import type { LocalWriteStorage } from "./local-filter-writer"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"

export const featureProgressKey = "feature-settings:progress"
type FeatureProgressIdentity = {
  readonly v: 1; readonly kind: "feature-settings-progress"; readonly id: string; readonly deviceId: string
  readonly original: Agreement
}
export type AcceptedFeatureProgress = FeatureProgressIdentity & { readonly state: "accepted"; readonly before: JsonObject; readonly effect: JsonObject }
export type FeatureProgressRecord = AcceptedFeatureProgress | FeatureProgressIdentity & { readonly state: "terminal" }
export type FeatureProgressRead = { readonly kind: "absent" } | { readonly kind: "invalid" | "newer-version" }
  | { readonly kind: "valid"; readonly record: FeatureProgressRecord }
export type FeatureProgressView = {
  readonly kind: "feature-settings"; readonly selection: { readonly kind: "held-job-selection" }
  readonly id: string; readonly original: Agreement; readonly recoverability: "exact-feature-settings"
}

export function progressNames(records: JsonObject): readonly string[] {
  return joinProgressPlan(records, []).map(({ acct, shard }) => `progress:${acct}:${shard}`).sort()
}

function withoutMarker(records: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(records).filter(([name]) => name !== featureProgressKey))
}

export function readFeatureProgress(raw: unknown): FeatureProgressRead {
  try { return parseFeatureProgress(raw) } catch { return { kind: "invalid" } }
}

function parseFeatureProgress(raw: unknown): FeatureProgressRead {
  if (raw === undefined) return { kind: "absent" }
  if (consentObject(raw) && typeof raw.v === "number" && raw.v > 1) return { kind: "newer-version" }
  if (objectShape(raw, { v: v => v === 1, kind: v => v === "feature-settings-progress", id: v => typeof v === "string" && v.length > 0,
    deviceId: v => typeof v === "string" && v.length > 0, original: isAgreement, state: v => v === "terminal" }) &&
    typeof raw.id === "string" && typeof raw.deviceId === "string" && isAgreement(raw.original)) return { kind: "valid", record: {
      v: 1, kind: "feature-settings-progress", id: raw.id, deviceId: raw.deviceId, original: { ...raw.original }, state: "terminal" } }
  if (!objectShape(raw, { v: v => v === 1, kind: v => v === "feature-settings-progress", id: v => typeof v === "string" && v.length > 0,
    deviceId: v => typeof v === "string" && v.length > 0, original: isAgreement, state: v => v === "accepted",
    before: consentObject, effect: consentObject })) return { kind: "invalid" }
  const before = raw.before, effect = raw.effect
  if (!consentObject(before) || !consentObject(effect) || Object.hasOwn(before, featureProgressKey) || !isAgreement(raw.original)) return { kind: "invalid" }
  const device = readConsentDevice(before), settings = readSettingsView(before["doc:settings"])
  if (device.kind !== "supported" || device.device.id !== raw.deviceId || !sameSyncJson(device.device.consent, raw.original) || settings.kind !== "value" || !settings.settings.autoAdd.on) return { kind: "invalid" }
  const names = progressNames(before), expected = new Set(["doc:settings", ...names, ...(Object.hasOwn(effect, "sync") ? ["sync"] : [])])
  if (Object.keys(effect).length !== expected.size || Object.keys(effect).some(name => !expected.has(name)) || names.some(name => !consentObject(effect[name]) || Object.keys(effect[name] ?? {}).length !== 0)) return { kind: "invalid" }
  const document = effect["doc:settings"]
  if (!consentObject(document) || document.v !== DOCUMENT_VERSION || document.by !== raw.deviceId || decodeDocument(document, decodeSettings).kind !== "value") return { kind: "invalid" }
  const desired = decodeSettings(settings.settings); desired.autoAdd.on = false
  if (!isJsonValue(desired) || !sameSyncJson(document.data ?? null, desired)) return { kind: "invalid" }
  const oldEnvelope = before["doc:settings"]
  if (consentObject(oldEnvelope)) {
    const envelope = { ...oldEnvelope, v: document.v!, gen: document.gen!, at: document.at!, by: document.by!, data: document.data! }
    if ("deleted" in envelope) delete envelope.deleted
    if (!sameSyncJson(envelope, document)) return { kind: "invalid" }
  }
  if (Object.hasOwn(effect, "sync")) {
    if (!consentObject(effect.sync)) return { kind: "invalid" }
    if (!Object.hasOwn(before, "sync")) {
      const history = prepareFirstEditHistory({ history: { kind: "absent" }, syncOn: device.device.syncOn })
      if (history.kind !== "set" || !sameSyncJson(history.sync, effect.sync)) return { kind: "invalid" }
    } else {
      if (!consentObject(before.sync)) return { kind: "invalid" }
      const prior = { ...before.sync }, next = { ...effect.sync }
      delete prior.editedSinceOff; delete prior.everEdited; delete next.editedSinceOff; delete next.everEdited
      // Sync admission may add acknowledged generations. It may not alter other history.
      delete prior.pushed; delete next.pushed
      if (!sameSyncJson(prior, next)) return { kind: "invalid" }
    }
  }
  if (typeof raw.id !== "string" || typeof raw.deviceId !== "string" || raw.state !== "accepted") return { kind: "invalid" }
  return { kind: "valid", record: { v: 1, kind: "feature-settings-progress", id: raw.id, deviceId: raw.deviceId,
    original: { ...raw.original }, state: raw.state, before: structuredClone(before), effect: structuredClone(effect) } }
}

export function featureProgressWork(records: JsonObject): readonly FeatureProgressView[] {
  const read = readFeatureProgress(records[featureProgressKey])
  return read.kind === "valid" && read.record.state === "accepted" ? [{ kind: "feature-settings", selection: Object.freeze({ kind: "held-job-selection" }),
    id: read.record.id, original: read.record.original, recoverability: "exact-feature-settings" }] : []
}
export function featureProgressPending(records: Readonly<Record<string, unknown>>): boolean {
  const read = readFeatureProgress(records[featureProgressKey])
  return read.kind !== "absent" && !(read.kind === "valid" && read.record.state === "terminal")
}

function recordJson(record: FeatureProgressRecord): JsonObject {
  return { ...record, original: { ...record.original } }
}

export async function commitFeatureProgress(deps: {
  readonly local: LocalWriteStorage; readonly stopped: () => boolean; readonly id: () => string
}, baseline: JsonObject, items: JsonObject): Promise<LocalSettingsWriteResult> {
  const read = readConsentDevice(baseline)
  if (read.kind !== "supported" || !read.device.consent) return { kind: "unavailable", reason: "startup" }
  const effect = { ...items }
  for (const name of progressNames(baseline)) effect[name] = {}
  const record: AcceptedFeatureProgress = { v: 1, kind: "feature-settings-progress", id: deps.id(), deviceId: read.device.id,
    original: read.device.consent, state: "accepted", before: withoutMarker(baseline), effect }
  if (readFeatureProgress(recordJson(record)).kind !== "valid") return { kind: "result", result: { refused: "invalid" } }
  const accepted = { ...baseline, [featureProgressKey]: recordJson(record) }
  const write = await confirm(deps, baseline, accepted, { [featureProgressKey]: recordJson(record) })
  if (write.kind !== "committed") return write
  return finishFeatureProgress(deps, accepted, record)
}

async function confirm(deps: { readonly local: LocalWriteStorage; readonly stopped: () => boolean }, before: JsonObject, after: JsonObject, items: JsonObject): Promise<LocalSettingsWriteResult> {
  try {
    if (deps.stopped()) return { kind: "unconfirmed", cause: { kind: "authority" } }
    const current = await deps.local.get(null)
    if (!consentObject(current) || !sameSyncJson(current, before)) return { kind: "unavailable", reason: "stale" }
    if (deps.stopped()) return { kind: "unconfirmed", cause: { kind: "authority" } }
    let rejected: { readonly error: unknown } | undefined
    try { await deps.local.set(items) } catch (error) { rejected = { error } }
    const observed = await deps.local.get(null)
    if (deps.stopped()) return { kind: "unconfirmed", cause: { kind: "authority" } }
    if (rejected) return consentObject(observed) && sameSyncJson(observed, before) ? { kind: "failed", stage: "set", error: rejected.error } : { kind: "unconfirmed", cause: { kind: "readback" } }
    return consentObject(observed) && sameSyncJson(observed, after) ? { kind: "committed" } : { kind: "unconfirmed", cause: { kind: "readback" } }
  } catch (error) { return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
}

async function finishFeatureProgress(deps: { readonly local: LocalWriteStorage; readonly stopped: () => boolean }, records: JsonObject, record: AcceptedFeatureProgress): Promise<LocalSettingsWriteResult> {
  const applied = { ...records, ...record.effect }
  const write = await confirm(deps, records, applied, record.effect)
  if (write.kind !== "committed") return write
  const terminal = { v: 1, kind: "feature-settings-progress", id: record.id, deviceId: record.deviceId, original: record.original, state: "terminal" } satisfies FeatureProgressRecord
  return confirm(deps, applied, { ...applied, [featureProgressKey]: recordJson(terminal) }, { [featureProgressKey]: recordJson(terminal) })
}

export async function recoverFeatureProgress(deps: { readonly local: LocalWriteStorage; readonly stopped: () => boolean }, expected: JsonObject): Promise<LocalSettingsWriteResult> {
  const read = readFeatureProgress(expected[featureProgressKey]), consent = readConsentDevice(expected)
  if (read.kind !== "valid" || read.record.state !== "accepted" || consent.kind !== "supported" || !consent.device.consent ||
    consent.device.id !== read.record.deviceId || consent.control && consent.control.state.kind !== "agreed") return { kind: "unavailable", reason: "startup" }
  const { record } = read, basis = withoutMarker(expected), before = structuredClone(record.before)
  // Explicit recovery authorizes this exact effect under the current agreement. Original consent stays in the record.
  before.device = expected.device!
  if (Object.hasOwn(expected, "consent:state")) before["consent:state"] = expected["consent:state"]!
  if (Object.hasOwn(expected, "consent:jobs")) before["consent:jobs"] = expected["consent:jobs"]!
  for (const [name, value] of Object.entries(basis)) {
    if (Object.hasOwn(record.effect, name) && sameSyncJson(value, record.effect[name]!)) continue
    if (!Object.hasOwn(before, name) || !sameSyncJson(value, before[name]!)) return { kind: "unavailable", reason: "stale" }
  }
  if (Object.keys(before).some(name => !Object.hasOwn(basis, name))) return { kind: "unavailable", reason: "stale" }
  if (Object.hasOwn(before, "device") && consentObject(before.device) && consentObject(record.before.device)) {
    const current = { ...before.device }, original = { ...record.before.device }
    delete current.consent; delete original.consent
    if (!sameSyncJson(current, original)) return { kind: "unavailable", reason: "stale" }
  }
  return finishFeatureProgress(deps, expected, record)
}
