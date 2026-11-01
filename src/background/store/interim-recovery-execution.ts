import { archiveRetained, archiveResolutions, coversArchivedSource, readCanonicalAuthorityRecord, type RetainedCanonicalAuthorityV5 } from "./interim-canonical-authority"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, decodeDevice, decodeDocument, decodeFilter, decodeSetup, decodeSettings, decodeSyncState,
  documentKey, parseDocumentKey, type AccountKey, type PlaylistId, type DocumentKey, type Filter } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { UiOrigin } from "./account-removal-execution"
import type { ClaimAuthority, ClaimAuthorityState } from "./local-claim-writer"
import { agreementOrigin, detachAgreement, freezeAgreement } from "./consent-agreement"
import { deriveInterimInstallationEffect, retainedInstallationDifference, type ConfirmedRetainedAgreementV2, type RetainedInstallationV3 } from "./interim-installation"
import { interimConversionKey, isInterimCanonicalKey, isInterimSourceKey, readRetainedCheckpoint, retainedCheckpointDifference,
  type InterimPersistenceSnapshot, type RetainedInterim, type RetainedAgreementV2, type StoreStartupHost } from "./interim-persistence"
import type { InterimConversionPlan } from "./interim-conversion"
import { openInterimRecoveryReview, type RecoveryItemId, type RecoveryItem, type RecoveryObservation, type RecoveryReviewView } from "./interim-recovery-review"
import { prepareFirstEditHistory, readFirstEditProvenance, type StoredEditHistory } from "./first-edit-provenance"
import { prepareDocumentBody } from "./write-preparation"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
import { pendingSyncJoinKey, readSyncJoinCheckpoint } from "./sync-join-persistence"
import { pendingAccountRemovalKey } from "./account-removal-execution"
import type { LocalWriteStorage, SyncStorage } from "./local-filter-writer"

export type RecoveryCapture = { readonly kind: "interim-recovery-capture" }
export type PlaylistDestinationChoice = { readonly kind: "interim-playlist-destination-choice" }
export type PlaylistOwnerDestination = { readonly acct: AccountKey; readonly status: "available" | "already-present" | "no-setup" | "deleted" | "newer-version" | "invalid" }
export type PlaylistRestorePreparation =
  | { readonly kind: "destination-required"; readonly choice: PlaylistDestinationChoice; readonly item: RecoveryItemId;
      readonly entry: { readonly pl: PlaylistId; readonly takes: "videos" }; readonly owners: readonly PlaylistOwnerDestination[]; readonly scope: RecoveryScope }
  | RecoveryUnavailable | RecoveryRefusal | { readonly kind: "failed"; readonly stage: "prepare"; readonly error: unknown }
export type FilterReplacementConfirmation = { readonly kind: "interim-filter-replacement-confirmation" }
export type RecoveryScope = { readonly kind: "this-browser" } | { readonly kind: "syncing-browsers"; readonly joined: string }
export type RecoveryOwnership = { readonly kind: "unavailable" } | {
  readonly kind: "fixture-owned"; readonly authority: ClaimAuthority; readonly ownedPlaylistIds: ReadonlySet<PlaylistId>
}
export type RecoverySnapshot = { readonly retained: InterimPersistenceSnapshot; readonly history: StoredEditHistory }
export type RecoveryHost = { readonly kind: "unavailable" } | {
  readonly kind: "fixture"
  readonly snapshot: { read(): Promise<RecoverySnapshot> }
  readonly authority: { read(): Promise<ClaimAuthorityState> }
  readonly accounts: { read(): Promise<readonly ClaimAuthority[]> }
  readonly ownership: { lookup(authority: ClaimAuthority): Promise<RecoveryOwnership> }
}
export type RecoveryUnavailable = {
  readonly kind: "unavailable"
  readonly reason: "consent-held" | "startup" | "newer-layout" | "newer-version" | "disposed" | "stale" | "retention" | "recovery-host" | "consent"
    | "authority" | "ownership" | "inventory" | "unsupported-item" | "destination" | "already-present" | "pending-agreement"
    | "pending-installation" | "pending-removal" | "pending-join" | "pending-recovery" | "sync-writer-required" | "admission-debt"
}
export type RecoveryRefusal = { readonly kind: "refused"; readonly reason: "private" | "invalid" | "sync-full" | "update-needed" }
export type RecoveryWrite = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type RecoveryStage = "accept" | "documents" | "record"
export type RecoveryTransactionResult =
  | { readonly kind: "committed"; readonly item: RecoveryItemId; readonly activation: "held" | "canonical";
      readonly mutations: readonly { readonly stage: RecoveryStage; readonly write: RecoveryWrite }[] }
  | RecoveryUnavailable | RecoveryRefusal
  | { readonly kind: "failed"; readonly stage: "before-set"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: RecoveryStage; readonly write: Extract<RecoveryWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: RecoveryStage; readonly write: RecoveryWrite;
      readonly cause: { readonly kind: "authority" | "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
export type RecoveryRead =
  | { readonly kind: "review"; readonly capture: RecoveryCapture; readonly view: RecoveryReviewView;
      readonly resolved: readonly RecoveryItemId[]; readonly discarded: readonly RecoveryItemId[]; readonly activation: "held" | "canonical" }
  | { readonly kind: "pending"; readonly item: RecoveryItemId; readonly action: "resume-accepted-filter-replacement" | "resume-accepted-playlist-restore"; readonly activation: "held" | "canonical" }
  | RecoveryUnavailable
export type RecoveryPreparation =
  | { readonly kind: "confirmation-required"; readonly confirmation: FilterReplacementConfirmation; readonly item: RecoveryItemId;
      readonly acct: AccountKey; readonly playlist: PlaylistId; readonly current: Snapshot<Filter>; readonly retained: Snapshot<Filter>; readonly scope: RecoveryScope }
  | RecoveryUnavailable | RecoveryRefusal | { readonly kind: "failed"; readonly stage: "prepare"; readonly error: unknown }
export type InstalledRetainedV3 = Omit<RetainedInstallationV3, "installation"> & {
  readonly installation: Extract<RetainedInstallationV3["installation"], { kind: "installed" }>
}
export type RecoveryStoredObject = { readonly kind: "absent" } | { readonly kind: "present"; readonly raw: JsonObject }
export type RecoveryLocator = Pick<RecoveryItemId, "sourceKey" | "path">
export type RecoveryFilterKey = Extract<DocumentKey, { kind: "filter" }>
export type RecoveryAdmission = { readonly kind: "off" } | { readonly kind: "synced"; readonly joined: string; readonly requiredRepairs: readonly SyncDocumentRecord[] }
export type FilterReplacementEffect = {
  readonly kind: "filter-replacement"; readonly item: RecoveryLocator; readonly key: RecoveryFilterKey
  readonly parent: JsonObject; readonly before: JsonObject; readonly after: JsonObject
  readonly history: { readonly before: RecoveryStoredObject; readonly after: RecoveryStoredObject }
  readonly scope: RecoveryScope; readonly admission: RecoveryAdmission
}
export type FilterReplacementResolution = { readonly kind: "filter-replaced"; readonly effect: FilterReplacementEffect }
export type RecoveryDiscardResolution = { readonly kind: "discarded"; readonly item: RecoveryLocator }
export type RecoverySetupKey = Extract<DocumentKey, { kind: "setup" }>
export type PlaylistRestoreEffect = {
  readonly kind: "playlist-restore"; readonly item: RecoveryLocator; readonly key: RecoverySetupKey
  readonly before: JsonObject; readonly after: JsonObject
  readonly history: { readonly before: RecoveryStoredObject; readonly after: RecoveryStoredObject }
  readonly scope: RecoveryScope; readonly admission: RecoveryAdmission
}
export type RecoveryDocumentEffect = FilterReplacementEffect | PlaylistRestoreEffect
export type PlaylistRestoreResolution = { readonly kind: "playlist-restored"; readonly effect: PlaylistRestoreEffect }
export type RecoveryResolution = FilterReplacementResolution | PlaylistRestoreResolution | RecoveryDiscardResolution
export type RecoveryPending = { readonly kind: "none" } | { readonly kind: "filter-replacement"; readonly effect: FilterReplacementEffect } | { readonly kind: "playlist-restore"; readonly effect: PlaylistRestoreEffect }
export function documentResolution(effect: RecoveryDocumentEffect): FilterReplacementResolution | PlaylistRestoreResolution {
  switch (effect.kind) {
    case "filter-replacement": return { kind: "filter-replaced", effect }
    case "playlist-restore": return { kind: "playlist-restored", effect }
    default: { const exhaustive: never = effect; return exhaustive }
  }
}
export function documentPending(effect: RecoveryDocumentEffect): Exclude<RecoveryPending, { kind: "none" }> {
  switch (effect.kind) {
    case "filter-replacement": return { kind: "filter-replacement", effect }
    case "playlist-restore": return { kind: "playlist-restore", effect }
    default: { const exhaustive: never = effect; return exhaustive }
  }
}
export type RetainedRecoveryV4 = {
  readonly v: 4; readonly kind: "retained-interim"
  readonly basis: { readonly checkpoint: ConfirmedRetainedAgreementV2 | InstalledRetainedV3; readonly history: RecoveryStoredObject }
  readonly resolutions: readonly RecoveryResolution[]
  readonly pending: RecoveryPending
}

function object(raw: unknown): raw is JsonObject { return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw) }
function json(raw: unknown): JsonObject { if (!object(raw)) throw new TypeError("Recovery requires a JSON object"); return detachAgreement(raw) }
function same(a: unknown, b: unknown): boolean { return isJsonValue(a) && isJsonValue(b) && sameSyncJson(a, b) }
function exact(raw: JsonObject, keys: readonly string[]): boolean { return Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key)) }
function unavailable(reason: RecoveryUnavailable["reason"]): RecoveryUnavailable { return { kind: "unavailable", reason } }
export function recoveryRetained(checkpoint: Snapshot<RetainedInterim | RetainedAgreementV2 | RetainedInstallationV3 | RetainedRecoveryV4 | RetainedCanonicalAuthorityV5>): Snapshot<RetainedInterim> {
  switch (checkpoint.v) {
    case 1: return checkpoint
    case 2: return checkpoint.retained
    case 3: return checkpoint.agreed.retained
    case 4: return recoveryRetained(checkpoint.basis.checkpoint)
    case 5: return archiveRetained(checkpoint.archive)
  }
}
export function recoveryHistory(records: JsonObject): RecoveryStoredObject | undefined {
  if (!Object.hasOwn(records, "sync")) return { kind: "absent" }
  const raw = records.sync
  if (!object(raw) || readFirstEditProvenance({ kind: "present", raw }).kind === "invalid") return
  try { decodeSyncState(raw) } catch { return }
  return { kind: "present", raw: detachAgreement(raw) }
}
export function stored(raw: unknown): RecoveryStoredObject | undefined {
  if (!object(raw)) return
  if (raw.kind === "absent" && exact(raw, ["kind"])) return { kind: "absent" }
  if (raw.kind === "present" && exact(raw, ["kind", "raw"]) && object(raw.raw)) return recoveryHistory({ sync: raw.raw })
}
function effectKey(key: Snapshot<RecoveryFilterKey | RecoverySetupKey>): RecoveryFilterKey | RecoverySetupKey {
  const parsed = parseDocumentKey(key.kind === "setup" ? `doc:setup:${String(key.acct)}` : `doc:filter:${String(key.acct)}:${String(key.playlist)}`)
  if (parsed?.kind !== "filter" && parsed?.kind !== "setup") throw new TypeError("Recovery requires a document key")
  return parsed
}
function observation(original: Snapshot<RetainedInterim>, canonical: JsonObject, captureId: string): RecoveryObservation {
  // readRetainedInterim proved this outcome equal to the current converter output. Snapshot typing only erases string brands.
  const conversion = original.outcome as unknown as InterimConversionPlan
  return { captureId, schema: canonical.schema, conversion, canonical: {
    documents: Object.fromEntries(Object.entries(canonical).filter(([name]) => name.startsWith("doc:"))),
    caches: Object.fromEntries(Object.entries(canonical).filter(([name]) => name.startsWith("cache:"))), device: canonical.device, unclaimed: canonical.unclaimed
  } }
}
type AccountFilter = Extract<RecoveryItem, { kind: "filter" }> & {
  readonly source: { readonly kind: "account-body"; readonly account: AccountKey }
  readonly destination: Extract<Extract<RecoveryItem, { kind: "filter" }>["destination"], { kind: "account-filter" }>
}
export function recoveryLocatorIdentity(item: RecoveryLocator): string { return JSON.stringify([item.sourceKey, item.path]) }
type ResolutionOccurrence = RecoveryDiscardResolution | { readonly kind: "filter-replaced" | "playlist-restored"; readonly effect: { readonly item: RecoveryLocator } }
export function resolutionItem(resolution: ResolutionOccurrence): RecoveryLocator {
  return detachAgreement(resolution.kind === "discarded" ? resolution.item : resolution.effect.item)
}
function selectedOccurrence(original: Snapshot<RetainedInterim>, canonical: JsonObject, item: RecoveryLocator): RecoveryItem | undefined {
  const current = observation(original, canonical, "validated-occurrence"), read = openInterimRecoveryReview(current).read(current)
  if (read.kind !== "review") return
  const row = read.view.items.find(row => same({ sourceKey: row.id.sourceKey, path: row.id.path }, item))
  const source: unknown = original.source
  if (!row || !object(source) || !Object.hasOwn(source, item.sourceKey)) return
  let raw: unknown = source[item.sourceKey]
  for (const part of item.path) {
    if (Array.isArray(raw)) {
      if (typeof part !== "number" || !Number.isSafeInteger(part) || part < 0 || !Object.hasOwn(raw, part)) return
      raw = raw[part]
    } else {
      if (!object(raw) || typeof part !== "string" || !Object.hasOwn(raw, part)) return
      raw = raw[part]
    }
  }
  if (row.kind === "filter") {
    if (!object(raw) || raw.mode !== row.facts.mode || raw.enabled !== row.facts.on || !same(raw.channels, row.facts.channels.map(channel => channel[0]))) return
  } else if (raw !== row.facts.playlist) return
  return row
}
export function validateDiscardResolution(raw: unknown, original: Snapshot<RetainedInterim>, canonical: JsonObject): RecoveryDiscardResolution | undefined {
  if (!object(raw) || !exact(raw, ["kind", "item"]) || raw.kind !== "discarded" || !object(raw.item) || !exact(raw.item, ["sourceKey", "path"]) ||
    typeof raw.item.sourceKey !== "string" || !Array.isArray(raw.item.path) || !raw.item.path.every(part => typeof part === "string" || typeof part === "number" && Number.isSafeInteger(part) && part >= 0)) return
  const item: RecoveryLocator = { sourceKey: raw.item.sourceKey, path: raw.item.path as (string | number)[] }
  return selectedOccurrence(original, canonical, item) ? { kind: "discarded", item } : undefined
}
export function selectedFilter(original: Snapshot<RetainedInterim>, canonical: JsonObject, item: RecoveryLocator): AccountFilter | undefined {
  const current = observation(original, canonical, "validated-occurrence"), read = openInterimRecoveryReview(current).read(current)
  if (read.kind !== "review") return
  const row = read.view.items.find(row => same({ sourceKey: row.id.sourceKey, path: row.id.path }, item))
  if (row?.kind !== "filter" || row.source.kind !== "account-body" || row.destination.kind !== "account-filter" ||
    row.source.account !== row.destination.account || row.id.sourceKey !== `account:${row.source.account}` ||
    !same(row.id.path, ["filters", row.facts.playlist]) || row.destination.path !== `doc:filter:${row.source.account}:${row.facts.playlist}` ||
    row.destination.parentPath !== `doc:setup:${row.source.account}`) return
  return { ...row, source: row.source, destination: row.destination }
}
function known(filter: Snapshot<Filter>): Filter {
  return { mode: filter.mode, on: filter.on, channels: filter.channels.map((channel): Filter["channels"][number] => channel[2] === undefined ? [channel[0], channel[1]] : [channel[0], channel[1], channel[2]]) }
}
function replacement(original: Snapshot<RetainedInterim>, canonical: JsonObject, item: RecoveryLocator) {
  const row = selectedFilter(original, canonical, item)
  if (!row) return unavailable("unsupported-item")
  const key = parseDocumentKey(row.destination.path), before = canonical[row.destination.path], parent = canonical[row.destination.parentPath]
  if (key?.kind !== "filter" || !object(before) || !object(before.data) || !object(parent)) return unavailable("destination")
  try {
    const setup = decodeDocument(parent, decodeSetup), filter = decodeDocument(before, decodeFilter)
    if (setup.kind !== "value" || filter.kind !== "value") return unavailable("destination")
    const retained: Filter = { mode: row.facts.mode, on: row.facts.on, channels: detachAgreement(row.facts.channels) }
    const current = known(filter.document.data)
    if (same(current, retained)) return unavailable("already-present")
    const prepared = prepareDocumentBody({ kind: "filter", data: { ...before.data, ...retained } })
    if (prepared.kind !== "prepared" || !same(known(decodeFilter(prepared.data)), retained)) return unavailable("unsupported-item")
    return { kind: "replacement" as const, key, parent, before, body: prepared.data, current, retained }
  } catch { return unavailable("destination") }
}
function selectedPlaylist(original: Snapshot<RetainedInterim>, canonical: JsonObject, item: RecoveryLocator) {
  if (item.sourceKey !== "playlists" || item.path.length !== 1 || typeof item.path[0] !== "number" || !Number.isSafeInteger(item.path[0]) || item.path[0] < 0) return
  const row = selectedOccurrence(original, canonical, item)
  return row?.kind === "playlist" && row.source.kind === "global" ? row : undefined
}
function restoreDestination(original: Snapshot<RetainedInterim>, canonical: JsonObject, item: RecoveryLocator, acct: AccountKey) {
  const row = selectedPlaylist(original, canonical, item), key: RecoverySetupKey = { kind: "setup", acct }
  if (!row) return { kind: "destination" as const, status: "invalid" as const }
  const before = canonical[documentKey(key)]
  if (before === undefined) return { kind: "destination" as const, status: "no-setup" as const }
  try {
    const setup = decodeDocument(before, decodeSetup)
    if (setup.kind !== "value") return { kind: "destination" as const, status: setup.kind === "deleted" ? "deleted" as const : setup.kind === "newer-version" ? "newer-version" as const : "invalid" as const }
    if (!object(before) || !object(before.data) || !Array.isArray(before.data.autoAdd)) return { kind: "destination" as const, status: "invalid" as const }
    if (setup.document.data.autoAdd.some(entry => entry.pl === row.facts.playlist)) return { kind: "destination" as const, status: "already-present" as const }
    const settings = decodeDocument(canonical["doc:settings"], decodeSettings)
    if (settings.kind !== "value") return { kind: "destination" as const, status: "invalid" as const }
    const shortcuts = settings.document.data.shortcuts.list
    const data = { ...setup.document.data, autoAdd: [...setup.document.data.autoAdd, { pl: row.facts.playlist, takes: "videos" as const }] }
    const prepared = prepareDocumentBody({ kind: "setup", data, context: {
      shortcutIds: new Set(shortcuts.map(shortcut => shortcut.id)),
      additionalChosenPlaylists: new Set(shortcuts.some(shortcut => shortcut.watchLaterOnEveryAccount && !Object.hasOwn(data.targets, shortcut.id)) ? ["WL"] : [])
    } })
    const exactBody = { ...before.data, autoAdd: [...before.data.autoAdd, { pl: row.facts.playlist, takes: "videos" }] }
    if (prepared.kind !== "prepared" || !same(prepared.data, exactBody)) return { kind: "destination" as const, status: "invalid" as const }
    return { kind: "restore" as const, key, before, body: prepared.data, playlist: row.facts.playlist }
  } catch { return { kind: "destination" as const, status: "invalid" as const } }
}
export function startingCanonical(checkpoint: Snapshot<ConfirmedRetainedAgreementV2 | InstalledRetainedV3>): JsonObject | undefined {
  const agreed = checkpoint.v === 2 ? checkpoint : checkpoint.agreed, original = agreed.retained
  const saved: unknown = original.canonical, device: unknown = agreed.agreement.effect.device
  if (!object(saved) || !object(device)) return
  const canonical: JsonObject = { ...json(saved), device: json(device) }
  if (checkpoint.v === 3) {
    const derived = deriveInterimInstallationEffect(checkpoint.agreed)
    if (derived.kind !== "effect") return
    for (const doc of derived.effect.documents) canonical[doc.path] = json(doc.document)
    for (const cache of derived.effect.caches) canonical[cache.path] = json(cache.data)
    if (derived.effect.schema.kind === "set") canonical.schema = derived.effect.schema.value
  }
  return canonical
}
function deriveHistory(before: { readonly kind: "absent" } | { readonly kind: "present"; readonly raw: unknown }, syncOn: boolean, repairs: readonly SyncDocumentRecord[]): RecoveryStoredObject | undefined {
  let effective: RecoveryStoredObject = before.kind === "absent" ? { kind: "absent" } : { kind: "present", raw: json(before.raw) }
  if (repairs.length) {
    if (effective.kind !== "present" || !object(effective.raw.pushed)) return
    const pushed = { ...effective.raw.pushed }
    for (const repair of repairs) Object.defineProperty(pushed, repair.name, { value: repair.gen, enumerable: true, configurable: true, writable: true })
    effective = { kind: "present", raw: { ...effective.raw, pushed } }
  }
  const patch = prepareFirstEditHistory({ history: effective, syncOn })
  return patch.kind === "unavailable" ? undefined : patch.kind === "set" ? { kind: "present", raw: patch.sync } : effective
}
type RecoveryOverlay = { readonly canonical: JsonObject; readonly history: RecoveryStoredObject }
function validateEffect(raw: unknown, original: Snapshot<RetainedInterim>, overlay: RecoveryOverlay): RecoveryDocumentEffect | undefined {
  if (!object(raw) || !exact(raw, raw.kind === "playlist-restore" ? ["kind", "item", "key", "before", "after", "history", "scope", "admission"] : ["kind", "item", "key", "parent", "before", "after", "history", "scope", "admission"]) || (raw.kind !== "filter-replacement" && raw.kind !== "playlist-restore") ||
    !object(raw.item) || !exact(raw.item, ["sourceKey", "path"]) || typeof raw.item.sourceKey !== "string" || !Array.isArray(raw.item.path) ||
    !raw.item.path.every(x => typeof x === "string" || typeof x === "number")) return
  const item: RecoveryLocator = { sourceKey: raw.item.sourceKey, path: raw.item.path as (string | number)[] }
  const parsed = object(raw.key) && typeof raw.key.acct === "string" ? parseDocumentKey(`doc:setup:${raw.key.acct}`) : undefined
  const candidate = raw.kind === "playlist-restore" && parsed?.kind === "setup" ? restoreDestination(original, overlay.canonical, item, parsed.acct) : replacement(original, overlay.canonical, item)
  if (candidate.kind !== "replacement" && candidate.kind !== "restore" || !same(raw.key, candidate.key) || candidate.kind === "replacement" && !same(raw.parent, candidate.parent) || !same(raw.before, candidate.before) || !object(raw.after)) return
  const after = raw.after, device = decodeDevice(overlay.canonical.device)
  if (after.v !== DOCUMENT_VERSION || typeof after.gen !== "string" || !after.gen.trim() || after.gen === candidate.before.gen ||
    typeof after.at !== "number" || !Number.isSafeInteger(after.at) || after.at < 0 || after.by !== device.id ||
    Object.values(overlay.canonical).some(value => object(value) && value.gen === after.gen) ||
    !same(after, { ...candidate.before, v: DOCUMENT_VERSION, gen: after.gen, at: after.at, by: device.id, data: candidate.body })) return
  if (!object(raw.history) || !exact(raw.history, ["before", "after"])) return
  const beforeHistory = stored(raw.history.before), afterHistory = stored(raw.history.after)
  if (!beforeHistory || !afterHistory || !same(beforeHistory, overlay.history) || !object(raw.scope) || !object(raw.admission)) return
  let scope: RecoveryScope, admission: RecoveryAdmission
  if (!device.syncOn) {
    if (!same(raw.scope, { kind: "this-browser" }) || !same(raw.admission, { kind: "off" })) return
    scope = { kind: "this-browser" }; admission = { kind: "off" }
  } else {
    if (beforeHistory.kind !== "present") return
    const state = decodeSyncState(beforeHistory.raw)
    if (state.joined === null || !["ok", "full", "update-needed"].includes(state.status) || !same(raw.scope, { kind: "syncing-browsers", joined: state.joined }) ||
      !exact(raw.admission, ["kind", "joined", "requiredRepairs"]) || raw.admission.kind !== "synced" || raw.admission.joined !== state.joined || !Array.isArray(raw.admission.requiredRepairs)) return
    const repairs: SyncDocumentRecord[] = [], names = new Set<string>()
    for (const repair of raw.admission.requiredRepairs) {
      if (!object(repair) || !exact(repair, ["key", "name", "gen", "document"]) || typeof repair.name !== "string" || typeof repair.gen !== "string" || !object(repair.document)) return
      const key = parseDocumentKey(repair.name)
      if (!key || !same(key, repair.key) || documentKey(key) !== repair.name || names.has(repair.name) || repair.document.gen !== repair.gen || !same(overlay.canonical[repair.name], repair.document) || state.pushed[repair.name] === repair.gen) return
      const decoded = readSyncDocument({ key, items: [{ key: `s:${repair.name.slice(4)}`, value: repair.document }] })
      if (decoded.kind !== "value" && decoded.kind !== "deleted") return
      names.add(repair.name); repairs.push({ key, name: repair.name, gen: repair.gen, document: repair.document })
    }
    scope = { kind: "syncing-browsers", joined: state.joined }; admission = { kind: "synced", joined: state.joined, requiredRepairs: repairs }
  }
  if (!same(deriveHistory(beforeHistory, device.syncOn, admission.kind === "off" ? [] : admission.requiredRepairs), afterHistory)) return
  const common = { before: candidate.before, after, history: { before: beforeHistory, after: afterHistory }, scope, admission }
  return candidate.kind === "restore" ? { kind: "playlist-restore", item, key: candidate.key, ...common } : { kind: "filter-replacement", item, key: candidate.key, parent: candidate.parent, ...common }
}
// A released archive's receipts are historical facts. Later canonical edits own the live document, so the effect is checked against its own before-image.
export function validateArchivedReplacement(raw: unknown, original: Snapshot<RetainedInterim>, anchor: JsonObject): FilterReplacementEffect | undefined {
  try {
    if (!object(raw) || !exact(raw, ["kind", "item", "key", "parent", "before", "after", "history", "scope", "admission"]) || raw.kind !== "filter-replacement" ||
      !object(raw.item) || !exact(raw.item, ["sourceKey", "path"]) || typeof raw.item.sourceKey !== "string" || !Array.isArray(raw.item.path) ||
      !raw.item.path.every(x => typeof x === "string" || typeof x === "number")) return
    const item: RecoveryLocator = { sourceKey: raw.item.sourceKey, path: raw.item.path as (string | number)[] }
    const row = selectedFilter(original, anchor, item), key = row && parseDocumentKey(row.destination.path)
    if (!row || key?.kind !== "filter" || !same(raw.key, key) || !object(raw.before) || !object(raw.before.data) || !object(raw.parent) || !object(raw.after)) return
    const setup = decodeDocument(raw.parent, decodeSetup), filter = decodeDocument(raw.before, decodeFilter)
    if (setup.kind !== "value" || filter.kind !== "value") return
    const retained: Filter = { mode: row.facts.mode, on: row.facts.on, channels: detachAgreement(row.facts.channels) }
    if (same(known(filter.document.data), retained)) return
    const prepared = prepareDocumentBody({ kind: "filter", data: { ...raw.before.data, ...retained } })
    const after = raw.after
    if (prepared.kind !== "prepared" || after.v !== DOCUMENT_VERSION || typeof after.gen !== "string" || !after.gen.trim() || after.gen === raw.before.gen ||
      typeof after.at !== "number" || !Number.isSafeInteger(after.at) || after.at < 0 || typeof after.by !== "string" || !after.by.trim() ||
      !same(after, { ...raw.before, v: DOCUMENT_VERSION, gen: after.gen, at: after.at, by: after.by, data: prepared.data })) return
    if (!object(raw.history) || !exact(raw.history, ["before", "after"]) || !object(raw.scope) || !object(raw.admission)) return
    const beforeHistory = stored(raw.history.before), afterHistory = stored(raw.history.after)
    if (!beforeHistory || !afterHistory) return
    let scope: RecoveryScope, admission: RecoveryAdmission
    if (same(raw.scope, { kind: "this-browser" }) && same(raw.admission, { kind: "off" })) { scope = { kind: "this-browser" }; admission = { kind: "off" } }
    else {
      if (beforeHistory.kind !== "present") return
      const state = decodeSyncState(beforeHistory.raw)
      if (state.joined === null || !same(raw.scope, { kind: "syncing-browsers", joined: state.joined }) || !exact(raw.admission, ["kind", "joined", "requiredRepairs"]) ||
        raw.admission.kind !== "synced" || raw.admission.joined !== state.joined || !Array.isArray(raw.admission.requiredRepairs)) return
      const repairs: SyncDocumentRecord[] = [], names = new Set<string>()
      for (const repair of raw.admission.requiredRepairs) {
        if (!object(repair) || !exact(repair, ["key", "name", "gen", "document"]) || typeof repair.name !== "string" || typeof repair.gen !== "string" || !object(repair.document)) return
        const repairKey = parseDocumentKey(repair.name)
        if (!repairKey || !same(repairKey, repair.key) || documentKey(repairKey) !== repair.name || names.has(repair.name) || repair.document.gen !== repair.gen) return
        names.add(repair.name); repairs.push({ key: repairKey, name: repair.name, gen: repair.gen, document: repair.document })
      }
      scope = { kind: "syncing-browsers", joined: state.joined }; admission = { kind: "synced", joined: state.joined, requiredRepairs: repairs }
    }
    if (!same(deriveHistory(beforeHistory, scope.kind === "syncing-browsers", admission.kind === "off" ? [] : admission.requiredRepairs), afterHistory)) return
    return { kind: "filter-replacement", item, key, parent: detachAgreement(raw.parent), before: detachAgreement(raw.before), after: detachAgreement(after),
      history: { before: beforeHistory, after: afterHistory }, scope, admission }
  } catch { return }
}
function validateRestoreHistory(raw: JsonObject, item: RecoveryLocator, key: RecoverySetupKey): PlaylistRestoreEffect | undefined {
    if (!object(raw.history) || !exact(raw.history, ["before", "after"]) || !object(raw.scope) || !object(raw.admission)) return
    const beforeHistory = stored(raw.history.before), afterHistory = stored(raw.history.after)
    if (!beforeHistory || !afterHistory) return
    let scope: RecoveryScope, admission: RecoveryAdmission
    if (same(raw.scope, { kind: "this-browser" }) && same(raw.admission, { kind: "off" })) { scope = { kind: "this-browser" }; admission = { kind: "off" } }
    else {
      if (beforeHistory.kind !== "present") return
      const state = decodeSyncState(beforeHistory.raw)
      if (state.joined === null || !same(raw.scope, { kind: "syncing-browsers", joined: state.joined }) || !exact(raw.admission, ["kind", "joined", "requiredRepairs"]) ||
        raw.admission.kind !== "synced" || raw.admission.joined !== state.joined || !Array.isArray(raw.admission.requiredRepairs)) return
      const repairs: SyncDocumentRecord[] = [], names = new Set<string>()
      for (const repair of raw.admission.requiredRepairs) {
        if (!object(repair) || !exact(repair, ["key", "name", "gen", "document"]) || typeof repair.name !== "string" || typeof repair.gen !== "string" || !object(repair.document)) return
        const repairKey = parseDocumentKey(repair.name)
        if (!repairKey || !same(repairKey, repair.key) || documentKey(repairKey) !== repair.name || names.has(repair.name) || repair.document.gen !== repair.gen) return
        names.add(repair.name); repairs.push({ key: repairKey, name: repair.name, gen: repair.gen, document: repair.document })
      }
      scope = { kind: "syncing-browsers", joined: state.joined }; admission = { kind: "synced", joined: state.joined, requiredRepairs: repairs }
    }
    if (!same(deriveHistory(beforeHistory, scope.kind === "syncing-browsers", admission.kind === "off" ? [] : admission.requiredRepairs), afterHistory)) return
    if (!object(raw.before) || !object(raw.after)) return
    return { kind: "playlist-restore", item, key, before: detachAgreement(raw.before), after: detachAgreement(raw.after), history: { before: beforeHistory, after: afterHistory }, scope, admission }
}
export function validateArchivedRestore(raw: unknown, original: Snapshot<RetainedInterim>, anchor: JsonObject): PlaylistRestoreEffect | undefined {
  try {
    if (!object(raw) || !exact(raw, ["kind", "item", "key", "before", "after", "history", "scope", "admission"]) || raw.kind !== "playlist-restore" ||
      !object(raw.item) || !exact(raw.item, ["sourceKey", "path"]) || raw.item.sourceKey !== "playlists" || !Array.isArray(raw.item.path) || raw.item.path.length !== 1 ||
      typeof raw.item.path[0] !== "number" || !Number.isSafeInteger(raw.item.path[0]) || raw.item.path[0] < 0 || !object(raw.key) ||
      typeof raw.key.acct !== "string" || !object(raw.before) || !object(raw.before.data) || !Array.isArray(raw.before.data.autoAdd) || !object(raw.after) || !object(raw.history)) return
    const key = parseDocumentKey(`doc:setup:${raw.key.acct}`), item: RecoveryLocator = { sourceKey: "playlists", path: [raw.item.path[0]] }
    const row = selectedPlaylist(original, anchor, item)
    if (!row || key?.kind !== "setup" || !same(key, raw.key) || decodeDocument(raw.before, decodeSetup).kind !== "value") return
    const setup = decodeSetup(raw.before.data), after = raw.after
    if (setup.autoAdd.some(entry => entry.pl === row.facts.playlist) || after.v !== DOCUMENT_VERSION || typeof after.gen !== "string" || !after.gen.trim() || after.gen === raw.before.gen ||
      typeof after.at !== "number" || !Number.isSafeInteger(after.at) || after.at < 0 || typeof after.by !== "string" || !after.by.trim() ||
      !same(after, { ...raw.before, v: DOCUMENT_VERSION, gen: after.gen, at: after.at, by: after.by, data: { ...raw.before.data, autoAdd: [...raw.before.data.autoAdd, { pl: row.facts.playlist, takes: "videos" }] } })) return
    return validateRestoreHistory(raw, item, key)
  } catch { return }
}
export function readRetainedRecovery(raw: unknown): { readonly kind: "recovery"; readonly checkpoint: Snapshot<RetainedRecoveryV4> } | { readonly kind: "invalid" } {
  const invalid = { kind: "invalid" } as const
  try {
    if (!object(raw) || raw.v !== 4 || raw.kind !== "retained-interim" || !object(raw.basis) || !exact(raw.basis, ["checkpoint", "history"]) ||
      !object(raw.basis.checkpoint) || ![2, 3].includes(Number(raw.basis.checkpoint.v)) || !Array.isArray(raw.resolutions) || !object(raw.pending)) return invalid
    const read = readRetainedCheckpoint(raw.basis.checkpoint), history = stored(raw.basis.history)
    let basisCheckpoint: Snapshot<ConfirmedRetainedAgreementV2 | InstalledRetainedV3>
    if (read.kind === "agreement" && read.checkpoint.agreement.kind === "confirmed") basisCheckpoint = { ...read.checkpoint, agreement: { ...read.checkpoint.agreement, kind: "confirmed" } }
    else if (read.kind === "installation" && read.checkpoint.installation.kind === "installed") basisCheckpoint = { ...read.checkpoint, installation: { ...read.checkpoint.installation, kind: "installed" } }
    else return invalid
    const canonical = startingCanonical(basisCheckpoint)
    if (!canonical || !history) return invalid
    const device = decodeDevice(canonical.device)
    if (device.consent?.v !== CONSENT_VERSION) return invalid
    if (history.kind === "absent") { if (device.syncOn) return invalid }
    else {
      const state = decodeSyncState(history.raw)
      if (device.syncOn ? state.joined === null || !["ok", "full", "update-needed"].includes(state.status) : state.status !== "off") return invalid
    }
    const original = recoveryRetained(basisCheckpoint)
    if (read.kind === "installation" && retainedInstallationDifference({ checkpoint: read.checkpoint, history, current: {
      source: json(original.source), canonical, checkpoint: { kind: "present", value: read.checkpoint }, historicalAuthorization: original.historicalAuthorization, priorCredentialPresence: original.priorCredentialPresence
    } })) return invalid
    let overlay: RecoveryOverlay = { canonical, history }
    const resolutions: RecoveryResolution[] = [], locators = new Set<string>()
    for (const resolution of raw.resolutions) {
      const discard = validateDiscardResolution(resolution, original, overlay.canonical)
      if (discard) {
        const identity = recoveryLocatorIdentity(discard.item)
        if (locators.has(identity)) return invalid
        locators.add(identity); resolutions.push(discard)
        continue
      }
      if (!object(resolution) || !exact(resolution, ["kind", "effect"]) || (resolution.kind !== "filter-replaced" && resolution.kind !== "playlist-restored")) return invalid
      const effect = validateEffect(resolution.effect, original, overlay)
      if (!effect || resolution.kind !== documentResolution(effect).kind || locators.has(recoveryLocatorIdentity(effect.item))) return invalid
      locators.add(recoveryLocatorIdentity(effect.item)); resolutions.push(documentResolution(effect))
      overlay = { canonical: { ...overlay.canonical, [documentKey(effect.key)]: effect.after }, history: effect.history.after }
    }
    let pending: RetainedRecoveryV4["pending"]
    if (raw.pending.kind === "none" && exact(raw.pending, ["kind"])) pending = { kind: "none" }
    else if ((raw.pending.kind === "filter-replacement" || raw.pending.kind === "playlist-restore") && exact(raw.pending, ["kind", "effect"])) {
      const effect = validateEffect(raw.pending.effect, original, overlay)
      if (!effect || raw.pending.kind !== effect.kind || locators.has(recoveryLocatorIdentity(effect.item))) return invalid
      pending = documentPending(effect)
    } else return invalid
    const checkpoint: unknown = { ...raw, v: 4, kind: "retained-interim", basis: { checkpoint: basisCheckpoint, history }, resolutions, pending }
    return { kind: "recovery", checkpoint: freezeAgreement(checkpoint) as Snapshot<RetainedRecoveryV4> }
  } catch { return invalid }
}
export function retainedRecoveryDifference(input: { readonly checkpoint: Snapshot<RetainedRecoveryV4>; readonly current: InterimPersistenceSnapshot; readonly history: RecoveryStoredObject }): "source" | "canonical" | "history" | "checkpoint" | undefined {
  const { checkpoint, current, history } = input, original = recoveryRetained(checkpoint)
  if (!same(current.source, original.source)) return "source"
  if (current.checkpoint.kind !== "present" || !same(current.checkpoint.value, checkpoint)) return "checkpoint"
  if (!same(current.historicalAuthorization, original.historicalAuthorization) || !same(current.priorCredentialPresence, original.priorCredentialPresence)) return "history"
  const canonical = startingCanonical(checkpoint.basis.checkpoint)
  if (!canonical) return "canonical"
  let expectedHistory = checkpoint.basis.history
  for (const resolution of checkpoint.resolutions) if (resolution.kind !== "discarded") { canonical[documentKey(effectKey(resolution.effect.key))] = json(resolution.effect.after); expectedHistory = resolution.effect.history.after }
  if (checkpoint.pending.kind !== "none") {
    const effect = checkpoint.pending.effect, name = documentKey(effectKey(effect.key))
    if (!same(current.canonical[name], effect.before) && !same(current.canonical[name], effect.after)) return "canonical"
    canonical[name] = json(current.canonical[name])
    if (!same(history, effect.history.before) && !same(history, effect.history.after)) return "history"
  } else if (!same(history, expectedHistory)) return "history"
  if (!same(current.canonical, canonical)) return "canonical"
}

type RecoveryCheckpoint = Snapshot<ConfirmedRetainedAgreementV2 | InstalledRetainedV3 | RetainedRecoveryV4 | RetainedCanonicalAuthorityV5>
function resolutions(checkpoint: RecoveryCheckpoint): readonly ResolutionOccurrence[] {
  return checkpoint.v === 5 ? [...archiveResolutions(checkpoint.archive), ...checkpoint.resolutions] : checkpoint.v === 4 ? checkpoint.resolutions : []
}
function resolvedItems(checkpoint: RecoveryCheckpoint): readonly RecoveryLocator[] { return resolutions(checkpoint).map(resolutionItem) }
type Observation = {
  readonly kind: "observation"; readonly records: JsonObject; readonly retained: InterimPersistenceSnapshot
  readonly history: RecoveryStoredObject; readonly checkpoint: RecoveryCheckpoint; readonly scope: RecoveryScope
}
type OwnershipProof = { readonly kind: "filter" | "playlist"; readonly playlist: PlaylistId }
type MutationProof = OwnershipProof | { readonly kind: "discard" }
type Authorized = { readonly kind: "authorized"; readonly authority: ClaimAuthority; readonly revision: string }
type ExecutionDependencies = {
  readonly local: LocalWriteStorage; readonly sync: SyncStorage; readonly startup: StoreStartupHost | undefined; readonly host: RecoveryHost
  readonly blocked: () => RecoveryUnavailable | undefined; readonly revision: () => number; readonly checkpoint: () => unknown
  readonly save: (checkpoint: Snapshot<RetainedRecoveryV4 | RetainedCanonicalAuthorityV5>) => void; readonly barrier: () => void
  readonly now: () => number; readonly generation: () => string
  readonly repairHistory: (raw: JsonObject, repairs: readonly SyncDocumentRecord[]) => JsonObject | undefined
}

// The owner calls these methods only on its existing lane. Cancellation revokes a capability synchronously.
export function createInterimRecoveryExecution(deps: ExecutionDependencies) {
  type Capture = { readonly observation: Observation; readonly revision: string; readonly captureId: string }
  type Confirmation = Capture & { readonly origin: UiOrigin; readonly item: RecoveryItemId; readonly authority: ClaimAuthority }
  type Choice = Capture & { readonly origin: UiOrigin; readonly item: RecoveryItemId; readonly owners: readonly ClaimAuthority[] }
  const captures = new WeakMap<RecoveryCapture, Capture>(), confirmations = new WeakMap<FilterReplacementConfirmation, Confirmation>()
  const choices = new WeakMap<PlaylistDestinationChoice, Choice>()
  let serial = 0, authorityRevision = 0, authorityObserved: unknown, accountsObserved: unknown
  const ownershipObserved = new Map<AccountKey, unknown>()
  const revision = () => `${deps.revision()}:${authorityRevision}`
  const host = deps.host
  function blocked(): RecoveryUnavailable | undefined { return deps.blocked() ?? (!deps.startup ? unavailable("startup") : host.kind !== "fixture" ? unavailable("recovery-host") : undefined) }
  function originRefusal(origin: UiOrigin): RecoveryRefusal | undefined {
    return !agreementOrigin(origin) ? { kind: "refused", reason: "invalid" } : origin.incognito ? { kind: "refused", reason: "private" } : undefined
  }
  async function readAuthority(): Promise<ClaimAuthorityState> {
    if (deps.blocked()) return { kind: "unavailable" }
    if (host.kind !== "fixture") return { kind: "unavailable" }
    const raw = await host.authority.read()
    if (authorityObserved !== undefined && !same(authorityObserved, raw)) authorityRevision++
    authorityObserved = isJsonValue(raw) ? detachAgreement(raw) : null
    if (!object(raw) || raw.kind !== "ready" || !object(raw.authority)) return { kind: "unavailable" }
    const a = raw.authority
    if (typeof a.acct !== "string" || parseDocumentKey(`doc:setup:${a.acct}`)?.kind !== "setup" || a.signedIn !== true || a.incognito !== false ||
      ![a.lease, a.browserSession, a.consentGeneration].every(value => typeof value === "string" && value.trim())) return { kind: "unavailable" }
    return detachAgreement(raw)
  }
  async function readAccounts(): Promise<readonly ClaimAuthority[] | RecoveryUnavailable> {
    const stopped = deps.blocked(); if (stopped) return stopped
    if (host.kind !== "fixture") return unavailable("recovery-host")
    const raw: unknown = await host.accounts.read()
    const accounts: ClaimAuthority[] = [], identities = new Set<string>()
    let valid = Array.isArray(raw)
    if (Array.isArray(raw)) for (const value of raw) {
      if (!object(value) || typeof value.acct !== "string" || value.signedIn !== true || value.incognito !== false ||
        ![value.lease, value.browserSession, value.consentGeneration].every(part => typeof part === "string" && part.trim()) || identities.has(value.acct)) { valid = false; break }
      const key = parseDocumentKey(`doc:setup:${value.acct}`)
      if (key?.kind !== "setup" || typeof value.lease !== "string" || typeof value.browserSession !== "string" || typeof value.consentGeneration !== "string") { valid = false; break }
      identities.add(value.acct)
      accounts.push({ acct: key.acct, lease: value.lease, browserSession: value.browserSession, consentGeneration: value.consentGeneration, signedIn: true, incognito: false })
    }
    accounts.sort((a, b) => a.acct < b.acct ? -1 : a.acct > b.acct ? 1 : 0)
    const observed = valid ? accounts : null
    if (accountsObserved !== undefined && !same(accountsObserved, observed)) authorityRevision++
    accountsObserved = detachAgreement(observed)
    return valid ? accounts : unavailable("authority")
  }
  async function accountAuthority(acct: AccountKey, plural: boolean): Promise<ClaimAuthorityState> {
    if (!plural) return readAuthority()
    const accounts = await readAccounts()
    if (!Array.isArray(accounts)) return { kind: "unavailable" }
    const authority = accounts.find(account => account.acct === acct)
    return authority ? { kind: "ready", authority } : { kind: "unavailable" }
  }
  async function authorize(acct: AccountKey, playlist: PlaylistId, plural = false): Promise<Authorized | RecoveryUnavailable> {
    if (host.kind !== "fixture") return unavailable("recovery-host")
    const first = await accountAuthority(acct, plural), beforeLookup = blocked()
    if (beforeLookup) return beforeLookup
    if (first.kind !== "ready" || first.authority.acct !== acct) return unavailable("authority")
    const captured = detachAgreement(first.authority)
    const owned = await host.ownership.lookup(detachAgreement(captured))
    const evidence = owned.kind === "fixture-owned" ? { authority: detachAgreement(owned.authority), ids: [...owned.ownedPlaylistIds].sort(), lineage: Object.hasOwn(owned, "lineage") } : { kind: "unavailable" }
    const authorized = owned.kind === "fixture-owned" && !Object.hasOwn(owned, "lineage") && same(evidence.authority, captured) && evidence.ids?.includes(playlist)
    if (ownershipObserved.has(acct) && !same(ownershipObserved.get(acct), evidence)) authorityRevision++
    ownershipObserved.set(acct, detachAgreement(evidence))
    const second = await accountAuthority(acct, plural), afterLookup = blocked()
    if (afterLookup) return afterLookup
    if (second.kind !== "ready" || !same(second.authority, captured)) return unavailable("authority")
    if (!authorized) return unavailable("ownership")
    return { kind: "authorized", authority: captured, revision: revision() }
  }
  async function observe(): Promise<Observation | RecoveryUnavailable> {
    const stopped = blocked()
    if (stopped) return stopped
    if (!deps.startup || host.kind !== "fixture") return unavailable("recovery-host")
    const raw = await deps.local.get(null)
    if (!object(raw)) return unavailable("inventory")
    const records = detachAgreement(raw)
    const beforeSnapshot = blocked(); if (beforeSnapshot) return beforeSnapshot
    const explicitRaw = await host.snapshot.read()
    if (!isJsonValue(explicitRaw)) return unavailable("inventory")
    const explicit = detachAgreement(explicitRaw), retainedRaw = await deps.startup.readInterimSnapshot()
    if (!isJsonValue(retainedRaw)) return unavailable("inventory")
    const retained = detachAgreement(retainedRaw)
    const afterSnapshot = blocked()
    if (afterSnapshot) return afterSnapshot
    const selected = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))
    const present = Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey] } : { kind: "absent" }
    const history = recoveryHistory(records)
    if (!history || !same(explicit, { retained, history }) || !same(selected(isInterimSourceKey), retained.source) ||
      !same(selected(isInterimCanonicalKey), retained.canonical) || !same(present, retained.checkpoint)) return unavailable("stale")
    if (Object.hasOwn(records, pendingAccountRemovalKey)) return unavailable("pending-removal")
    const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) return unavailable("pending-join")
    const read = readRetainedCheckpoint(records[interimConversionKey])
    if (read.kind === "newer-version") return unavailable("newer-version")
    if (!same(deps.checkpoint(), records[interimConversionKey])) return unavailable("stale")
    let checkpoint: RecoveryCheckpoint
    if (read.kind === "agreement") {
      if (read.checkpoint.agreement.kind !== "confirmed") return unavailable("pending-agreement")
      if (retainedCheckpointDifference(read.checkpoint, retained)) return unavailable("stale")
      checkpoint = { ...read.checkpoint, agreement: { ...read.checkpoint.agreement, kind: "confirmed" } }
    } else if (read.kind === "installation") {
      if (read.checkpoint.installation.kind !== "installed") return unavailable("pending-installation")
      if (retainedInstallationDifference({ checkpoint: read.checkpoint, current: retained, history })) return unavailable("stale")
      checkpoint = { ...read.checkpoint, installation: { ...read.checkpoint.installation, kind: "installed" } }
    } else if (read.kind === "recovery") {
      if (retainedRecoveryDifference({ checkpoint: read.checkpoint, current: retained, history })) return unavailable("stale")
      checkpoint = read.checkpoint
    } else if (read.kind === "authority") {
      if (read.checkpoint.handoff.kind !== "canonical" || !coversArchivedSource(records, read.checkpoint)) return unavailable("retention")
      const original = archiveRetained(read.checkpoint.archive)
      if (!same(original.historicalAuthorization, retained.historicalAuthorization) || !same(original.priorCredentialPresence, retained.priorCredentialPresence)) return unavailable("stale")
      if (read.checkpoint.pending.kind !== "none") {
        const effect = read.checkpoint.pending.effect, key = effectKey(effect.key)
        if (effect.kind === "filter-replacement" && !same(records[documentKey({ kind: "setup", acct: key.acct })], effect.parent) ||
          !(same(records[documentKey(key)], effect.before) || same(records[documentKey(key)], effect.after)) ||
          !(same(history, effect.history.before) || same(history, effect.history.after))) return unavailable("stale")
      }
      checkpoint = read.checkpoint
    } else return unavailable("retention")
    if (records.schema !== STORAGE_SCHEMA_VERSION || !object(records.device)) return unavailable("consent")
    const device = decodeDevice(records.device)
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") return unavailable("consent")
    let scope: RecoveryScope = { kind: "this-browser" }
    if (history.kind === "present") {
      const state = decodeSyncState(history.raw)
      if (device.syncOn ? state.joined === null || !["ok", "full", "update-needed"].includes(state.status) : state.status !== "off") return unavailable("sync-writer-required")
      if (device.syncOn && state.joined !== null) scope = { kind: "syncing-browsers", joined: state.joined }
    } else if (device.syncOn) return unavailable("sync-writer-required")
    return { kind: "observation", records, retained, checkpoint, history, scope }
  }
  async function stable(): Promise<Observation | RecoveryUnavailable> {
    const first = await observe(), at = revision()
    if (first.kind !== "observation") return first
    const second = await observe()
    return second.kind !== "observation" ? second : at !== revision() || !same(first, second) ? unavailable("stale") : second
  }
  async function authorizeOwner(): Promise<Authorized | RecoveryUnavailable> {
    const current = await readAuthority(), stopped = blocked()
    if (stopped) return stopped
    return current.kind === "ready" ? { kind: "authorized", authority: current.authority, revision: revision() } : unavailable("authority")
  }
  async function freshOwner(observed: Observation, origin: UiOrigin, expectedAuthority?: ClaimAuthority): Promise<Authorized | RecoveryUnavailable | RecoveryRefusal> {
    const invalid = originRefusal(origin)
    if (invalid) return invalid
    const at = revision(), auth = await authorizeOwner()
    if (auth.kind !== "authorized") return auth
    const current = await stable()
    if (current.kind !== "observation" || at !== revision() || !same(current, observed)) return unavailable("stale")
    const final = await authorizeOwner()
    if (final.kind !== "authorized") return final
    if (!same(final.authority, auth.authority) || expectedAuthority && !same(expectedAuthority, auth.authority) || auth.revision !== revision()) return unavailable("authority")
    return auth
  }
  async function fresh(observed: Observation, origin: UiOrigin, acct: AccountKey, playlist: PlaylistId, expectedAuthority?: ClaimAuthority, plural = false): Promise<Authorized | RecoveryUnavailable | RecoveryRefusal> {
    const invalid = originRefusal(origin)
    if (invalid) return invalid
    const at = revision(), auth = await authorize(acct, playlist, plural)
    if (auth.kind !== "authorized") return auth
    const current = await stable()
    if (current.kind !== "observation" || at !== revision() || !same(current, observed)) return unavailable("stale")
    const final = await accountAuthority(acct, plural), afterAuthority = blocked()
    if (afterAuthority) return afterAuthority
    if (final.kind !== "ready" || !same(final.authority, auth.authority) || expectedAuthority && !same(expectedAuthority, auth.authority) || auth.revision !== revision()) return unavailable("authority")
    return auth
  }
  async function admission(current: Observation, key: RecoveryFilterKey | RecoverySetupKey, candidate: JsonObject, pending?: Snapshot<RecoveryDocumentEffect>) {
    if (current.scope.kind === "this-browser") return { kind: "admitted" as const, admission: { kind: "off" } as const, repairs: [] }
    const logical = { ...current.records }
    if (pending) {
      logical[documentKey(key)] = json(pending.before)
      if (pending.history.before.kind === "present") logical.sync = json(pending.history.before.raw)
      else delete logical.sync
    }
    const raw = await deps.sync.get()
    if (!object(raw)) return unavailable("sync-writer-required")
    const remote = detachAgreement(raw)
    const plan = planSyncWrite({ local: logical, sync: remote, intent: { kind: "changed-batch", documents: [{ key, document: candidate }] } })
    if (plan.kind === "refused") return plan
    if (plan.kind !== "planned") return unavailable("sync-writer-required")
    if (pending) {
      if (pending.admission.kind !== "synced" || !same(pending.scope, current.scope)) return unavailable("admission-debt")
      const effective = deriveHistory(pending.history.before, true, plan.repairs)
      if (!same(effective, pending.history.after)) return unavailable("admission-debt")
      for (const repair of pending.admission.requiredRepairs) {
        const repairKey = parseDocumentKey(repair.name)
        if (!repairKey) return unavailable("admission-debt")
        const observed = readSyncDocument({ key: repairKey, items: Object.entries(remote).map(([key, value]) => ({ key, value })) })
        if ((observed.kind !== "value" && observed.kind !== "deleted") || !same(observed.json, repair.document) || observed.json.gen !== repair.gen) return unavailable("admission-debt")
      }
    }
    return { kind: "admitted" as const, admission: { kind: "synced", joined: current.scope.joined, requiredRepairs: plan.repairs } as const, repairs: plan.repairs }
  }
  async function set(stage: RecoveryStage, baseline: Observation, items: JsonObject, origin: UiOrigin, auth: ClaimAuthority,
    proof: MutationProof): Promise<RecoveryWrite | Exclude<RecoveryTransactionResult, { kind: "committed" }>> {
    try {
      const preflight = proof.kind !== "discard" ? await fresh(baseline, origin, auth.acct, proof.playlist, auth, proof.kind === "playlist") : await freshOwner(baseline, origin, auth)
      if (preflight.kind !== "authorized") return preflight
    } catch (error) { return { kind: "failed", stage: "before-set", error } }
    const authorityAt = authorityRevision
    let write: RecoveryWrite = { kind: "resolved" }
    try { await deps.local.set(detachAgreement(items)) } catch (error) { write = { kind: "rejected", error } }
    const unconfirmed = (cause: Extract<RecoveryTransactionResult, { kind: "unconfirmed" }>["cause"]): Extract<RecoveryTransactionResult, { kind: "unconfirmed" }> => {
      deps.barrier(); return { kind: "unconfirmed", stage, write, cause }
    }
    try {
      const raw = await deps.local.get(null)
      if (!object(raw) || host.kind !== "fixture" || !deps.startup) return unconfirmed({ kind: "readback" })
      const observed = detachAgreement(raw), explicitRaw = await host.snapshot.read()
      if (!isJsonValue(explicitRaw)) return unconfirmed({ kind: "readback" })
      const explicit = detachAgreement(explicitRaw), retainedRaw = await deps.startup.readInterimSnapshot()
      if (!isJsonValue(retainedRaw)) return unconfirmed({ kind: "readback" })
      const retained = detachAgreement(retainedRaw)
      if (deps.blocked()?.reason === "disposed") return unconfirmed({ kind: "stopped" })
      if (deps.blocked()) return unconfirmed({ kind: "authority" })
      const selected = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(observed).filter(([key]) => keep(key)))
      const checkpoint = Object.hasOwn(observed, interimConversionKey) ? { kind: "present", value: observed[interimConversionKey] } : { kind: "absent" }
      const original = recoveryRetained(baseline.checkpoint)
      if (!same(explicit, { retained, history: recoveryHistory(observed) }) || !same(retained.source, selected(isInterimSourceKey)) ||
        !same(retained.canonical, selected(isInterimCanonicalKey)) || !same(retained.checkpoint, checkpoint) ||
        !same(retained.historicalAuthorization, original.historicalAuthorization) || !same(retained.priorCredentialPresence, original.priorCredentialPresence)) return unconfirmed({ kind: "readback" })
      const granted = proof.kind !== "discard" ? await authorize(auth.acct, proof.playlist, proof.kind === "playlist") : await authorizeOwner()
      if (granted.kind !== "authorized" || !same(granted.authority, auth) || authorityAt !== authorityRevision) return unconfirmed({ kind: "authority" })
      const final = await deps.local.get(null), finalAuthority = await accountAuthority(auth.acct, proof.kind === "playlist")
      if (!same(final, observed)) return unconfirmed({ kind: "readback" })
      if (finalAuthority.kind !== "ready" || !same(finalAuthority.authority, auth) || authorityAt !== authorityRevision) return unconfirmed({ kind: "authority" })
      if (deps.blocked()) return unconfirmed({ kind: deps.blocked()?.reason === "disposed" ? "stopped" : "authority" })
      if (same(observed, { ...baseline.records, ...items })) {
        const read = readRetainedCheckpoint(observed[interimConversionKey])
        if (read.kind !== "recovery" && read.kind !== "authority") return unconfirmed({ kind: "readback" })
        deps.save(read.checkpoint)
        return write
      }
      if (write.kind === "rejected" && same(observed, baseline.records)) return { kind: "failed", stage, write }
      return unconfirmed({ kind: "readback" })
    } catch (error) { return unconfirmed({ kind: "read-failed", error }) }
  }
  async function finish(current: Observation, origin: UiOrigin, auth: ClaimAuthority, captureId: string, mutations: { stage: RecoveryStage; write: RecoveryWrite }[]): Promise<RecoveryTransactionResult> {
    const playlistOperation = (current.checkpoint.v === 4 || current.checkpoint.v === 5) && current.checkpoint.pending.kind === "playlist-restore"
    const interrupted = (result: Exclude<RecoveryTransactionResult, { kind: "committed" }>): Exclude<RecoveryTransactionResult, { kind: "committed" }> => {
      const attempted = mutations.at(-1)
      if (!playlistOperation || !attempted || result.kind === "unconfirmed" || result.kind === "failed" && result.stage !== "before-set") return result
      deps.barrier()
      return { kind: "unconfirmed", ...attempted, cause: result.kind === "failed" ? { kind: "read-failed", error: result.error } : { kind: "authority" } }
    }
    try {
      if (current.checkpoint.v !== 4 && current.checkpoint.v !== 5) return unavailable("pending-recovery")
      const checkpoint = current.checkpoint, pending = checkpoint.pending
      if (pending.kind === "none") return unavailable("pending-recovery")
      const effect = pending.effect, key = effectKey(effect.key), name = documentKey(key)
      const row = effect.kind === "playlist-restore" ? selectedPlaylist(recoveryRetained(checkpoint), json(current.retained.canonical), effect.item) : undefined
      const proof: OwnershipProof = key.kind === "filter" ? { kind: "filter", playlist: key.playlist } : row ? { kind: "playlist", playlist: row.facts.playlist } : (() => { throw new TypeError("Missing accepted playlist occurrence") })()
      const admitted = await admission(current, key, json(effect.after), effect)
      if (admitted.kind !== "admitted") return interrupted(admitted)
      if (!same(current.records[name], effect.after) || !same(current.history, effect.history.after)) {
        const items: JsonObject = { [name]: json(effect.after) }
        if (effect.history.after.kind === "present") items.sync = json(effect.history.after.raw)
        const write = await set("documents", current, items, origin, auth, proof)
        if (write.kind !== "resolved" && write.kind !== "rejected") return interrupted(write)
        mutations.push({ stage: "documents", write })
        const next = await stable()
        if (next.kind !== "observation") { deps.barrier(); return { kind: "unconfirmed", stage: "documents", write, cause: { kind: "readback" } } }
        current = next
      }
      const lastAdmission = await admission(current, key, json(effect.after), effect)
      if (lastAdmission.kind !== "admitted") return interrupted(lastAdmission)
      const previous = json(current.records[interimConversionKey])
      const completed: unknown = { ...previous, resolutions: [...previous.resolutions as JsonObject[], { kind: effect.kind === "playlist-restore" ? "playlist-restored" : "filter-replaced", effect: json(effect) }], pending: { kind: "none" } }
      if (!object(completed) || (checkpoint.v === 5 ? readCanonicalAuthorityRecord(completed).kind !== "authority" : readRetainedRecovery(completed).kind !== "recovery")) return unavailable("retention")
      const write = await set("record", current, { [interimConversionKey]: completed }, origin, auth, proof)
      if (write.kind !== "resolved" && write.kind !== "rejected") return interrupted(write)
      mutations.push({ stage: "record", write })
      return { kind: "committed", item: { captureId, ...detachAgreement(effect.item) }, activation: checkpoint.v === 5 ? "canonical" : "held", mutations }
    } catch (error) { return interrupted({ kind: "failed", stage: "before-set", error }) }
  }
  async function ownersFor(playlist: PlaylistId): Promise<readonly ClaimAuthority[] | RecoveryUnavailable> {
    const accounts = await readAccounts()
    if (!Array.isArray(accounts)) return unavailable("authority")
    const at = revision(), owners: ClaimAuthority[] = []
    for (const account of accounts) {
      const checked = await authorize(account.acct, playlist, true)
      if (checked.kind === "authorized") owners.push(checked.authority)
      else if (checked.reason !== "ownership") return checked
      if (at !== revision()) return unavailable("stale")
    }
    const after = await readAccounts()
    return at !== revision() || !same(accounts, after) ? unavailable("stale") : owners
  }
  function consumeChoice(token: PlaylistDestinationChoice): Choice | undefined {
    const choice = choices.get(token)
    choices.delete(token)
    return choice
  }
  return {
    async read(): Promise<RecoveryRead> {
      try {
        const current = await stable()
        if (current.kind !== "observation") return current
        const captureId = `recovery-capture-${++serial}`
        if ((current.checkpoint.v === 4 || current.checkpoint.v === 5) && current.checkpoint.pending.kind !== "none") return {
          kind: "pending", item: { captureId, ...detachAgreement(current.checkpoint.pending.effect.item) }, action: current.checkpoint.pending.kind === "playlist-restore" ? "resume-accepted-playlist-restore" : "resume-accepted-filter-replacement", activation: current.checkpoint.v === 5 ? "canonical" : "held"
        }
        const canonical = current.retained.canonical
        if (!object(canonical)) return unavailable("inventory")
        const initial = observation(recoveryRetained(current.checkpoint), canonical, captureId), read = openInterimRecoveryReview(initial).read(initial)
        if (read.kind !== "review") return unavailable("retention")
        const capture: RecoveryCapture = Object.freeze({ kind: "interim-recovery-capture" })
        captures.set(capture, { observation: current, revision: revision(), captureId })
        // The frozen copy keeps every branded value that Snapshot typing erases.
        const resolved = resolvedItems(current.checkpoint).map(item => ({ captureId, ...detachAgreement(item) }))
        const discarded = resolutions(current.checkpoint).filter(resolution => resolution.kind === "discarded").map(resolution => ({ captureId, ...resolutionItem(resolution) }))
        const hidden = current.checkpoint.v === 5 ? resolved : discarded
        const view = { ...read.view, items: read.view.items.filter(item => !hidden.some(done => same({ sourceKey: done.sourceKey, path: done.path }, { sourceKey: item.id.sourceKey, path: item.id.path }))) }
        return { kind: "review", capture, view: freezeAgreement(view) as unknown as RecoveryReviewView, activation: current.checkpoint.v === 5 ? "canonical" : "held", resolved, discarded }
      } catch { return unavailable("stale") }
    },
    async discard(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryTransactionResult> {
      const invalid = originRefusal(origin)
      if (invalid) return invalid
      try {
        const captured = captures.get(input.capture)
        if (!captured || input.item.captureId !== captured.captureId) return unavailable("stale")
        const item = detachAgreement(input.item), locator = { sourceKey: item.sourceKey, path: item.path }
        const current = await stable()
        if (current.kind !== "observation") return current
        if (captured.revision !== revision() || !same(current, captured.observation)) return unavailable("stale")
        if ((current.checkpoint.v === 4 || current.checkpoint.v === 5) && current.checkpoint.pending.kind !== "none") return unavailable("pending-recovery")
        if (resolvedItems(current.checkpoint).some(done => same(done, locator))) return unavailable("already-present")
        if (!selectedOccurrence(recoveryRetained(current.checkpoint), json(current.retained.canonical), locator)) return unavailable("unsupported-item")
        const auth = await freshOwner(current, origin)
        if (auth.kind !== "authorized") return auth
        if (captured.revision !== revision()) return unavailable("stale")
        const previous = json(current.records[interimConversionKey]), receipt: RecoveryDiscardResolution = { kind: "discarded", item: locator }
        const completed: unknown = current.checkpoint.v === 4 || current.checkpoint.v === 5
          ? { ...previous, resolutions: [...previous.resolutions as JsonObject[], receipt] }
          : { v: 4, kind: "retained-interim", basis: { checkpoint: previous, history: current.history }, resolutions: [receipt], pending: { kind: "none" } }
        const checked = readRetainedCheckpoint(completed)
        if (!object(completed) || checked.kind !== "recovery" && checked.kind !== "authority") return unavailable("retention")
        captures.delete(input.capture)
        return set("record", current, { [interimConversionKey]: completed }, origin, auth.authority, { kind: "discard" }).then((write): RecoveryTransactionResult => {
          if (write.kind !== "resolved" && write.kind !== "rejected") return write
          return { kind: "committed", item, activation: current.checkpoint.v === 5 ? "canonical" : "held", mutations: [{ stage: "record", write }] }
        })
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    },
    async preparePlaylist(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<PlaylistRestorePreparation> {
      try {
        const invalid = originRefusal(origin)
        if (invalid) return invalid
        const captured = captures.get(input.capture)
        if (!captured || captured.captureId !== input.item.captureId) return unavailable("stale")
        const current = await stable()
        if (current.kind !== "observation") return current
        if (captured.revision !== revision() || !same(current, captured.observation)) return unavailable("stale")
        if ((current.checkpoint.v === 4 || current.checkpoint.v === 5) && current.checkpoint.pending.kind !== "none") return unavailable("pending-recovery")
        const item = detachAgreement(input.item), locator = { sourceKey: item.sourceKey, path: item.path }
        if (resolvedItems(current.checkpoint).some(done => same(done, locator))) return unavailable("already-present")
        const original = recoveryRetained(current.checkpoint), row = selectedPlaylist(original, json(current.retained.canonical), locator)
        if (!row) return unavailable("unsupported-item")
        const owners = await ownersFor(row.facts.playlist)
        if (!Array.isArray(owners)) return unavailable("authority")
        const after = await stable()
        if (after.kind !== "observation" || captured.revision !== revision() || !same(current, after)) return unavailable("stale")
        const destinations = owners.map(owner => {
          const destination = restoreDestination(original, json(current.retained.canonical), locator, owner.acct)
          return { acct: owner.acct, status: destination.kind === "restore" ? "available" as const : destination.status }
        })
        const choice: PlaylistDestinationChoice = Object.freeze({ kind: "interim-playlist-destination-choice" })
        choices.set(choice, { ...captured, origin: detachAgreement(origin), item, owners })
        return Object.freeze({ kind: "destination-required", choice, item: freezeAgreement(item), entry: Object.freeze({ pl: row.facts.playlist, takes: "videos" }), owners: freezeAgreement(destinations), scope: freezeAgreement(current.scope) })
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    },
    consumeChoice,
    cancelPlaylist(token: PlaylistDestinationChoice): void { consumeChoice(token) },
    async restorePlaylist(origin: UiOrigin, captured: Choice | undefined, acct: AccountKey): Promise<RecoveryTransactionResult> {
      let attempted: { stage: RecoveryStage; write: RecoveryWrite } | undefined
      try {
        const invalid = originRefusal(origin)
        if (invalid) return invalid
        if (!captured || !same(captured.origin, origin)) return unavailable("stale")
        const current = await stable()
        if (current.kind !== "observation") return current
        if (captured.revision !== revision() || !same(current, captured.observation)) return unavailable("stale")
        const item = { sourceKey: captured.item.sourceKey, path: captured.item.path }
        const selected = restoreDestination(recoveryRetained(current.checkpoint), json(current.retained.canonical), item, acct)
        if (selected.kind !== "restore") return unavailable(selected.status === "already-present" ? "already-present" : "destination")
        const owners = await ownersFor(selected.playlist)
        if (!Array.isArray(owners) || !same(captured.owners, owners) || captured.revision !== revision()) return unavailable("authority")
        const chosen = owners.find(owner => owner.acct === acct)
        if (!chosen) return unavailable("ownership")
        const auth = await fresh(current, origin, acct, selected.playlist, chosen, true)
        if (auth.kind !== "authorized") return auth
        const at = deps.now(), gen = deps.generation(), device = decodeDevice(current.records.device)
        if (!Number.isSafeInteger(at) || at < 0 || typeof gen !== "string" || !gen.trim() || Object.values(current.records).some(value => object(value) && value.gen === gen)) return { kind: "refused", reason: "invalid" }
        const after: JsonObject = { ...selected.before, v: DOCUMENT_VERSION, gen, at, by: device.id, data: selected.body }
        const admitted = await admission(current, selected.key, after)
        if (admitted.kind !== "admitted") return admitted
        const history = deriveHistory(current.history, device.syncOn, admitted.repairs)
        if (!history) return unavailable("sync-writer-required")
        const effect: PlaylistRestoreEffect = { kind: "playlist-restore", item, key: selected.key, before: selected.before, after, history: { before: current.history, after: history }, scope: current.scope, admission: admitted.admission }
        const previous = json(current.records[interimConversionKey]), pending = documentPending(effect)
        const accepted: unknown = current.checkpoint.v === 4 || current.checkpoint.v === 5 ? { ...previous, pending }
          : { v: 4, kind: "retained-interim", basis: { checkpoint: previous, history: current.history }, resolutions: [], pending }
        const checked = readRetainedCheckpoint(accepted)
        if (!object(accepted) || checked.kind !== "recovery" && checked.kind !== "authority") return unavailable("retention")
        if (captured.revision !== revision()) return unavailable("stale")
        const write = await set("accept", current, { [interimConversionKey]: accepted }, origin, auth.authority, { kind: "playlist", playlist: selected.playlist })
        if (write.kind !== "resolved" && write.kind !== "rejected") return write
        attempted = { stage: "accept", write }
        const next = await stable()
        if (next.kind !== "observation") { deps.barrier(); return { kind: "unconfirmed", stage: "accept", write, cause: { kind: "readback" } } }
        return await finish(next, origin, auth.authority, captured.captureId, [attempted])
      } catch (error) {
        if (attempted) { deps.barrier(); return { kind: "unconfirmed", ...attempted, cause: { kind: "read-failed", error } } }
        return { kind: "failed", stage: "before-set", error }
      }
    },
    async prepare(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryPreparation> {
      try {
        const invalid = originRefusal(origin)
        if (invalid) return invalid
        const captured = captures.get(input.capture)
        if (!captured || input.item.captureId !== captured.captureId) return unavailable("stale")
        const current = await stable()
        if (current.kind !== "observation") return current
        if (captured.revision !== revision() || !same(current, captured.observation)) return unavailable("stale")
        if ((current.checkpoint.v === 4 || current.checkpoint.v === 5) && current.checkpoint.pending.kind !== "none") return unavailable("pending-recovery")
        const item = detachAgreement(input.item), locator = { sourceKey: item.sourceKey, path: item.path }
        if (!object(current.retained.canonical)) return unavailable("inventory")
        const original = recoveryRetained(current.checkpoint), row = selectedFilter(original, current.retained.canonical, locator)
        if (!row) return unavailable("unsupported-item")
        const auth = await fresh(current, origin, row.destination.account, row.facts.playlist)
        if (auth.kind !== "authorized") return auth
        if (captured.revision !== revision()) return unavailable("stale")
        if (resolvedItems(current.checkpoint).some(x => same(x, locator))) return unavailable("already-present")
        const selected = replacement(original, current.retained.canonical, locator)
        if (selected.kind !== "replacement") return selected
        const confirmation: FilterReplacementConfirmation = Object.freeze({ kind: "interim-filter-replacement-confirmation" })
        confirmations.set(confirmation, { ...captured, origin: detachAgreement(origin), item, authority: auth.authority })
        return Object.freeze({ kind: "confirmation-required", confirmation, item: freezeAgreement(item), acct: selected.key.acct, playlist: selected.key.playlist,
          current: freezeAgreement(selected.current), retained: freezeAgreement(selected.retained), scope: freezeAgreement(current.scope) })
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    },
    cancel(origin: UiOrigin, token: FilterReplacementConfirmation): void {
      const captured = confirmations.get(token)
      if (captured && agreementOrigin(origin) && same(origin, captured.origin)) confirmations.delete(token)
    },
    async replace(origin: UiOrigin, token: FilterReplacementConfirmation): Promise<RecoveryTransactionResult> {
      const invalid = originRefusal(origin)
      if (invalid) return invalid
      const captured = confirmations.get(token)
      if (!captured || !same(origin, captured.origin)) return unavailable("stale")
      confirmations.delete(token)
      try {
        const current = await stable()
        if (current.kind !== "observation") return current
        if (captured.revision !== revision() || !same(current, captured.observation)) return unavailable("stale")
        const item = { sourceKey: captured.item.sourceKey, path: captured.item.path }
        if (!object(current.retained.canonical)) return unavailable("inventory")
        const selected = replacement(recoveryRetained(current.checkpoint), current.retained.canonical, item)
        if (selected.kind !== "replacement") return selected
        const auth = await fresh(current, origin, selected.key.acct, selected.key.playlist, captured.authority)
        if (auth.kind !== "authorized") return auth
        const at = deps.now(), gen = deps.generation(), device = decodeDevice(current.records.device)
        if (!Number.isSafeInteger(at) || at < 0 || typeof gen !== "string" || !gen.trim() ||
          Object.values(current.records).some(value => object(value) && value.gen === gen)) return { kind: "refused", reason: "invalid" }
        const after: JsonObject = { ...selected.before, v: DOCUMENT_VERSION, gen, at, by: device.id, data: selected.body }
        const admitted = await admission(current, selected.key, after)
        if (admitted.kind !== "admitted") return admitted
        let effective = current.history
        if (effective.kind === "present") effective = { kind: "present", raw: deps.repairHistory(effective.raw, admitted.repairs) ?? effective.raw }
        const patch = prepareFirstEditHistory({ history: effective, syncOn: device.syncOn })
        if (patch.kind === "unavailable") return unavailable("sync-writer-required")
        const history = patch.kind === "set" ? { kind: "present", raw: patch.sync } as const : effective
        const effect: FilterReplacementEffect = { kind: "filter-replacement", item, key: selected.key, parent: selected.parent, before: selected.before, after,
          history: { before: current.history, after: history }, scope: current.scope, admission: admitted.admission }
        const previous = current.checkpoint, previousRecord = json(current.records[interimConversionKey])
        const accepted: unknown = previous.v === 4 || previous.v === 5 ? { ...previousRecord, pending: { kind: "filter-replacement", effect } }
          : { v: 4, kind: "retained-interim", basis: { checkpoint: previousRecord, history: current.history }, resolutions: [], pending: { kind: "filter-replacement", effect } }
        const checked = readRetainedCheckpoint(accepted)
        if (checked.kind !== "recovery" && checked.kind !== "authority" || !object(accepted)) return unavailable("retention")
        if (captured.revision !== revision()) return unavailable("stale")
        const write = await set("accept", current, { [interimConversionKey]: accepted }, origin, auth.authority, { kind: "filter", playlist: selected.key.playlist })
        if (write.kind !== "resolved" && write.kind !== "rejected") return write
        const next = await stable()
        if (next.kind !== "observation") { deps.barrier(); return { kind: "unconfirmed", stage: "accept", write, cause: { kind: "readback" } } }
        return await finish(next, origin, auth.authority, captured.captureId, [{ stage: "accept", write }])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    },
    async resume(origin: UiOrigin, expectedKind: "filter-replacement" | "playlist-restore" = "filter-replacement"): Promise<RecoveryTransactionResult> {
      const invalid = originRefusal(origin)
      if (invalid) return invalid
      try {
        const current = await stable()
        if (current.kind !== "observation") return current
        if (current.checkpoint.v !== 4 && current.checkpoint.v !== 5 || current.checkpoint.pending.kind === "none" || current.checkpoint.pending.kind !== expectedKind) return unavailable("pending-recovery")
        const effect = current.checkpoint.pending.effect, key = effectKey(effect.key)
        const row = effect.kind === "playlist-restore" ? selectedPlaylist(recoveryRetained(current.checkpoint), json(current.retained.canonical), effect.item) : undefined
        const playlist = key.kind === "filter" ? key.playlist : row?.facts.playlist
        if (!playlist) return unavailable("unsupported-item")
        const auth = await fresh(current, origin, key.acct, playlist, undefined, effect.kind === "playlist-restore")
        if (auth.kind !== "authorized") return auth
        return await finish(current, origin, auth.authority, `recovery-capture-${++serial}`, [])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    }
  }
}
