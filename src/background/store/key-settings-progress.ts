import { decodeDocument, decodeSettings, decodeSetup, DOCUMENT_VERSION, isShortcutId, parseDocumentKey, documentKey, type ShortcutId, type AccountKey } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { objectShape } from "../../shared/contracts/object-shape"
import { consentObject, isAgreement, readConsentDevice, type Agreement } from "./consent-withdrawal"
import { sameSyncJson } from "./sync-write-admission"
import { prepareFirstEditHistory } from "./first-edit-provenance"
import type { LocalWriteStorage } from "./local-filter-writer"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"

export const keySettingsProgressKey = "key-settings:progress"
type Identity = { readonly v: 1; readonly kind: "key-settings-progress"; readonly id: string; readonly deviceId: string;
  readonly original: Agreement; readonly retired: readonly ShortcutId[] }
export type AcceptedKeySettings = Identity & { readonly state: "accepted"; readonly operation: "remove" | "restore";
  readonly shortcut: ShortcutId; readonly before: JsonObject; readonly effect: JsonObject }
export type KeySettingsRecord = AcceptedKeySettings | Identity & { readonly state: "terminal" }
export type KeySettingsRead = { readonly kind: "absent" | "invalid" | "newer-version" } | { readonly kind: "valid"; readonly record: KeySettingsRecord }
export type KeySettingsWorkView = { readonly kind: "key-settings"; readonly selection: { readonly kind: "held-job-selection" };
  readonly id: string; readonly original: Agreement; readonly recoverability: "exact-key-settings" }

const identifier = (raw: unknown) => typeof raw === "string" && raw.length > 0
const retiredIds = (raw: unknown): raw is ShortcutId[] => Array.isArray(raw) && raw.every(isShortcutId) && new Set(raw).size === raw.length
const identityChecks = { v: (v: unknown) => v === 1, kind: (v: unknown) => v === "key-settings-progress", id: identifier,
  deviceId: identifier, original: isAgreement, retired: retiredIds }

function changedEnvelope(before: JsonObject, after: unknown, data: JsonObject, device: string): boolean {
  if (!consentObject(after) || after.v !== DOCUMENT_VERSION || after.by !== device || typeof after.gen !== "string" || !after.gen ||
    typeof after.at !== "number" || !Number.isSafeInteger(after.at) || after.at < 0 || after.gen === before.gen) return false
  const expected = { ...before, v: DOCUMENT_VERSION, gen: after.gen, at: after.at, by: device, data }
  if ("deleted" in expected) delete expected.deleted
  return sameSyncJson(expected, after)
}

function validEffect(record: AcceptedKeySettings): boolean {
  const { before, effect, shortcut, operation } = record
  if (Object.hasOwn(before, keySettingsProgressKey) || Object.keys(effect).some(name => name !== "doc:settings" && name !== "sync" && !name.startsWith("doc:setup:"))) return false
  const consent = readConsentDevice(before)
  if (consent.kind !== "supported" || consent.device.id !== record.deviceId || !sameSyncJson(consent.device.consent, record.original)) return false
  const rawSettings = before["doc:settings"], nextSettings = effect["doc:settings"]
  if (!consentObject(rawSettings) || !consentObject(rawSettings.data) || !consentObject(nextSettings) || !consentObject(nextSettings.data)) return false
  if (decodeDocument(rawSettings, decodeSettings).kind !== "value" || decodeDocument(nextSettings, decodeSettings).kind !== "value") return false
  const old = decodeSettings(rawSettings.data), next = decodeSettings(nextSettings.data)
  const row = operation === "remove" ? old.shortcuts.list.find(row => row.id === shortcut) : next.shortcuts.list.find(row => row.id === shortcut)
  if (!row || !record.retired.includes(shortcut)) return false
  const baseline = operation === "remove" ? old.shortcuts.list : next.shortcuts.list
  const filtered = baseline.filter(row => row.id !== shortcut)
  const other = operation === "remove" ? next.shortcuts.list : old.shortcuts.list
  if (!isJsonValue(filtered) || !isJsonValue(other) || !sameSyncJson(filtered, other)) return false
  if (operation === "remove" ? next.shortcuts.list.some(row => row.id === shortcut) : old.shortcuts.list.some(row => row.id === shortcut)) return false
  const expectedSettings = { ...old, shortcuts: { ...old.shortcuts, list: next.shortcuts.list } }
  if (!isJsonValue(expectedSettings) || !sameSyncJson(expectedSettings, nextSettings.data) || !changedEnvelope(rawSettings, nextSettings, nextSettings.data, record.deviceId)) return false
  const expectedNames = new Set(["doc:settings", ...(Object.hasOwn(effect, "sync") ? ["sync"] : [])])
  for (const [name, raw] of Object.entries(before)) {
    if (!name.startsWith("doc:setup:")) continue
    const key = parseDocumentKey(name)
    if (!key || key.kind !== "setup" || documentKey(key) !== name || !consentObject(raw)) return false
    const decoded = decodeDocument(raw, decodeSetup)
    if (decoded.kind === "deleted") { if (Object.hasOwn(effect, name)) return false; continue }
    if (decoded.kind !== "value" || !consentObject(raw.data) || !consentObject(raw.data.targets)) return false
    const target = raw.data.targets[shortcut], after = effect[name]
    if (operation === "remove" && target === undefined) { if (after !== undefined) return false; continue }
    if (operation === "restore" && after === undefined) continue
    if (operation === "restore" && target !== undefined || !consentObject(after) || !consentObject(after.data) || !consentObject(after.data.targets)) return false
    const targets = { ...raw.data.targets }
    if (operation === "remove") delete targets[shortcut]
    else {
      const restored = after.data.targets[shortcut]
      if (typeof restored !== "string") return false
      targets[shortcut] = restored
    }
    const data = { ...raw.data, targets }
    if (!changedEnvelope(raw, after, data, record.deviceId) || decodeDocument(after, decodeSetup).kind !== "value") return false
    expectedNames.add(name)
  }
  if (Object.keys(effect).length !== expectedNames.size || Object.keys(effect).some(name => !expectedNames.has(name))) return false
  if (Object.hasOwn(effect, "sync")) {
    if (!consentObject(effect.sync)) return false
    const oldSync = consentObject(before.sync) ? { ...before.sync } : undefined
    if (oldSync) {
      const nextSync = { ...effect.sync }
      delete oldSync.editedSinceOff; delete oldSync.everEdited; delete oldSync.pushed
      delete nextSync.editedSinceOff; delete nextSync.everEdited; delete nextSync.pushed
      if (!sameSyncJson(oldSync, nextSync)) return false
    } else {
      const patch = prepareFirstEditHistory({ history: { kind: "absent" }, syncOn: consent.device.syncOn })
      if (patch.kind !== "set" || !sameSyncJson(patch.sync, effect.sync)) return false
    }
  }
  return true
}

export function readKeySettingsProgress(raw: unknown): KeySettingsRead {
  if (raw === undefined) return { kind: "absent" }
  if (consentObject(raw) && typeof raw.v === "number" && raw.v > 1) return { kind: "newer-version" }
  try {
    if (!objectShape(raw, { ...identityChecks, state: v => v === "terminal" }) &&
      !objectShape(raw, { ...identityChecks, state: v => v === "accepted", operation: v => v === "remove" || v === "restore",
        shortcut: isShortcutId, before: consentObject, effect: consentObject })) return { kind: "invalid" }
    if (typeof raw.id !== "string" || typeof raw.deviceId !== "string" || !isAgreement(raw.original) || !retiredIds(raw.retired)) return { kind: "invalid" }
    const identity: Identity = { v: 1, kind: "key-settings-progress", id: raw.id, deviceId: raw.deviceId, original: { ...raw.original }, retired: [...raw.retired] }
    if (raw.state === "terminal") return { kind: "valid", record: { ...identity, state: "terminal" } }
    if (raw.state !== "accepted" || raw.operation !== "remove" && raw.operation !== "restore" || !isShortcutId(raw.shortcut) || !consentObject(raw.before) || !consentObject(raw.effect)) return { kind: "invalid" }
    const record: AcceptedKeySettings = { ...identity, state: "accepted", operation: raw.operation, shortcut: raw.shortcut,
      before: structuredClone(raw.before), effect: structuredClone(raw.effect) }
    return validEffect(record) ? { kind: "valid", record } : { kind: "invalid" }
  } catch { return { kind: "invalid" } }
}
export function keySettingsPending(records: Readonly<Record<string, unknown>>): boolean {
  const read = readKeySettingsProgress(records[keySettingsProgressKey])
  return read.kind !== "absent" && !(read.kind === "valid" && read.record.state === "terminal")
}
export function keySettingsWork(records: JsonObject): readonly KeySettingsWorkView[] {
  const read = readKeySettingsProgress(records[keySettingsProgressKey])
  return read.kind === "valid" && read.record.state === "accepted" ? [{ kind: "key-settings", selection: Object.freeze({ kind: "held-job-selection" }),
    id: read.record.id, original: read.record.original, recoverability: "exact-key-settings" }] : []
}
export function keySettingsAccounts(record: AcceptedKeySettings): AccountKey[] {
  return Object.keys(record.effect).flatMap(name => {
    const key = parseDocumentKey(name)
    return key?.kind === "setup" ? [key.acct] : []
  })
}
export function keyRecordJson(record: KeySettingsRecord): JsonObject {
  return { ...record, retired: [...record.retired], original: { ...record.original } }
}
type CommitDependencies = { readonly local: LocalWriteStorage; readonly stopped: () => boolean }
async function confirm(deps: CommitDependencies, before: JsonObject, items: JsonObject): Promise<LocalSettingsWriteResult> {
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
    return consentObject(observed) && sameSyncJson(observed, { ...before, ...items }) ? { kind: "committed" } : { kind: "unconfirmed", cause: { kind: "readback" } }
  } catch (error) { return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
}
async function finish(deps: CommitDependencies, records: JsonObject, record: AcceptedKeySettings, effect: JsonObject): Promise<LocalSettingsWriteResult> {
  if (Object.keys(effect).length) {
    const applied = await confirm(deps, records, effect)
    if (applied.kind !== "committed") return applied
    records = { ...records, ...effect }
  }
  const terminal: KeySettingsRecord = { v: 1, kind: "key-settings-progress", id: record.id, deviceId: record.deviceId,
    original: record.original, retired: record.retired, state: "terminal" }
  return confirm(deps, records, { [keySettingsProgressKey]: keyRecordJson(terminal) })
}
export async function commitKeySettings(deps: CommitDependencies, baseline: JsonObject, record: AcceptedKeySettings): Promise<LocalSettingsWriteResult> {
  if (readKeySettingsProgress(keyRecordJson(record)).kind !== "valid") return { kind: "result", result: { refused: "invalid" } }
  const marker = { [keySettingsProgressKey]: keyRecordJson(record) }
  const accepted = await confirm(deps, baseline, marker)
  return accepted.kind === "committed" ? finish(deps, { ...baseline, ...marker }, record, record.effect) : accepted
}
export async function recoverKeySettings(deps: CommitDependencies, expected: JsonObject,
  readmit: (record: AcceptedKeySettings) => Promise<boolean>): Promise<LocalSettingsWriteResult> {
  const read = readKeySettingsProgress(expected[keySettingsProgressKey]), consent = readConsentDevice(expected)
  if (read.kind !== "valid" || read.record.state !== "accepted" || consent.kind !== "supported" || !consent.device.consent ||
    consent.device.id !== read.record.deviceId || consent.control && consent.control.state.kind !== "agreed") return { kind: "unavailable", reason: "startup" }
  const { record } = read, before = structuredClone(record.before), effect: JsonObject = {}
  before.device = expected.device!
  for (const name of ["consent:state", "consent:jobs"]) {
    if (Object.hasOwn(expected, name)) before[name] = expected[name]!
    else delete before[name]
  }
  const originalDevice = consentObject(record.before.device) ? { ...record.before.device } : undefined
  const currentDevice = consentObject(expected.device) ? { ...expected.device } : undefined
  if (!originalDevice || !currentDevice) return { kind: "unavailable", reason: "stale" }
  delete originalDevice.consent; delete currentDevice.consent
  if (!sameSyncJson(originalDevice, currentDevice)) return { kind: "unavailable", reason: "stale" }
  const basis = { ...expected }; delete basis[keySettingsProgressKey]
  if (Object.keys(basis).length !== Object.keys(before).length) return { kind: "unavailable", reason: "stale" }
  for (const [name, value] of Object.entries(basis)) {
    if (!Object.hasOwn(before, name)) return { kind: "unavailable", reason: "stale" }
    const after = record.effect[name]
    if (after !== undefined && sameSyncJson(value, after)) continue
    if (!sameSyncJson(value, before[name]!)) return { kind: "unavailable", reason: "stale" }
    if (after !== undefined) effect[name] = after
  }
  if (!await readmit(record) || deps.stopped()) return { kind: "unavailable", reason: "sync-writer-required" }
  return finish(deps, expected, record, effect)
}
