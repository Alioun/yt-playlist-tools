import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { decodeSyncState } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { detachAgreement, freezeAgreement } from "./consent-agreement"
import { readInterimInstallationHistory, type RetainedInstallationHistory } from "./interim-installation"
import { interimConversionKey, isInterimCanonicalKey, isInterimSourceKey, readRetainedCheckpoint, type RetainedInterim } from "./interim-persistence"
import { readRetainedRecovery, recoveryRetained, startingCanonical, validateArchivedReplacement, validateArchivedRestore, validateDiscardResolution, resolutionItem, recoveryLocatorIdentity, documentResolution, documentPending,
  type RecoveryPending, type RecoveryResolution, type InstalledRetainedV3, type RecoveryStoredObject, type RetainedRecoveryV4 } from "./interim-recovery-execution"
import { LEGACY_DELETE_KEYS } from "./legacy"
import { pendingSyncJoinKey, readSyncJoinCheckpoint } from "./sync-join-persistence"
import { sameSyncJson } from "./sync-write-admission"

export type CompletedRecoveryV4 = Omit<RetainedRecoveryV4, "basis" | "pending"> & {
  readonly basis: { readonly checkpoint: InstalledRetainedV3; readonly history: RecoveryStoredObject }
  readonly pending: { readonly kind: "none" }
}
export type RetainedArchiveV5 =
  | { readonly kind: "installed-v3"; readonly checkpoint: InstalledRetainedV3 }
  | { readonly kind: "completed-v4"; readonly checkpoint: CompletedRecoveryV4 }
export type AuthorityAnchorV5 = {
  readonly canonical: JsonObject
  readonly history: RetainedInstallationHistory
  readonly join: { readonly kind: "absent" } | { readonly kind: "off"; readonly raw: JsonObject }
}
export type FixtureRetirementReceipt = { readonly kind: "fixture-producers-retired"; readonly handoffId: string; readonly sourceEpoch: string }
export type AuthorityHandoffV5 =
  | { readonly kind: "accepted"; readonly handoffId: string; readonly sourceEpoch: string; readonly anchor: AuthorityAnchorV5 }
  | { readonly kind: "canonical"; readonly handoffId: string; readonly sourceEpoch: string; readonly anchor: AuthorityAnchorV5; readonly retirement: FixtureRetirementReceipt }
export type RetainedCanonicalAuthorityV5 = {
  readonly v: 5
  readonly kind: "retained-interim"
  readonly archive: RetainedArchiveV5
  readonly handoff: AuthorityHandoffV5
  readonly resolutions: readonly RecoveryResolution[]
  readonly pending: RecoveryPending
}
export type CanonicalAuthorityRecordRead = { readonly kind: "authority"; readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5> } | { readonly kind: "invalid" }
export type RetainedAuthorityClass =
  | { readonly kind: "none" }
  | { readonly kind: "held" }
  | { readonly kind: "canonical-archive"; readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5> }

export type RetainedControllerCapability = { assertCurrent(): Promise<"current" | "lost">; release(): Promise<void> }
export type CanonicalOwnerCapability = { assertCurrent(): Promise<"current" | "lost">; release(): Promise<void> }
export type CanonicalAuthorityHost = { readonly kind: "unavailable" } | {
  readonly kind: "fixture"
  observeSource(input: { readonly source: JsonObject }): Promise<{ readonly kind: "source-epoch"; readonly sourceEpoch: string } | { readonly kind: "unavailable" }>
  begin(input: { readonly kind: "new"; readonly sourceEpoch: string } | { readonly kind: "resume"; readonly sourceEpoch: string; readonly handoffId: string }):
    Promise<{ readonly kind: "controller"; readonly handoffId: string; readonly sourceEpoch: string; readonly capability: RetainedControllerCapability } | { readonly kind: "unavailable" }>
  retire(input: { readonly handoffId: string; readonly sourceEpoch: string }): Promise<{ readonly kind: "retired"; readonly receipt: FixtureRetirementReceipt } | { readonly kind: "unconfirmed" }>
  acquire(input: { readonly handoffId: string; readonly sourceEpoch: string }): Promise<{ readonly kind: "exclusive"; readonly capability: CanonicalOwnerCapability } | { readonly kind: "unavailable" }>
}

export type CanonicalAuthorityReview = { readonly kind: "canonical-authority-review" }
export type CanonicalAuthorityUnavailable = {
  readonly kind: "unavailable"
  readonly reason: "consent-held" | "startup" | "disposed" | "stale" | "newer-layout" | "newer-version" | "retention" | "installation-required" | "pending-agreement"
    | "pending-installation" | "pending-removal" | "pending-join" | "pending-recovery" | "uncertain" | "sync-writer-required" | "authority-host"
    | "controller" | "inventory" | "history"
}
export type CanonicalAuthorityRead =
  | { readonly kind: "review"; readonly review: CanonicalAuthorityReview; readonly canonical: Snapshot<JsonObject>; readonly recovery: "retained-inactive"; readonly activation: "held" }
  | { readonly kind: "pending"; readonly action: "resume-retained-authority"; readonly activation: "held" }
  | { readonly kind: "canonical"; readonly recovery: "retained-inactive" }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" }
  | CanonicalAuthorityUnavailable
export type CanonicalAuthorityWrite = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type CanonicalAuthorityStage = "accept" | "retire" | "record"
export type CanonicalAuthorityResult =
  | { readonly kind: "restart-required"; readonly activation: "held"; readonly mutations: readonly { readonly stage: CanonicalAuthorityStage; readonly write: CanonicalAuthorityWrite }[] }
  | CanonicalAuthorityUnavailable
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" }
  | { readonly kind: "failed"; readonly stage: "before-set"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: CanonicalAuthorityStage; readonly write: Extract<CanonicalAuthorityWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: CanonicalAuthorityStage; readonly write: CanonicalAuthorityWrite;
      readonly cause: { readonly kind: "authority" | "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }

function object(raw: unknown): raw is JsonObject { return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw) }
function same(a: unknown, b: unknown): boolean { return isJsonValue(a) && isJsonValue(b) && sameSyncJson(a, b) }
function exact(raw: JsonObject, keys: readonly string[]): boolean { return Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key)) }
function text(raw: unknown): raw is string { return typeof raw === "string" && raw.trim() !== "" }
const markerKeys = ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]
export function isRetainedMarkerKey(key: string): boolean { return key === interimConversionKey || key.startsWith("account:") || markerKeys.includes(key) }

export function archiveRetained(archive: Snapshot<RetainedArchiveV5>): Snapshot<RetainedInterim> {
  return archive.kind === "installed-v3" ? archive.checkpoint.agreed.retained : recoveryRetained(archive.checkpoint)
}
export function archiveConsent(archive: Snapshot<RetainedArchiveV5>) {
  return (archive.kind === "installed-v3" ? archive.checkpoint : archive.checkpoint.basis.checkpoint).agreed.agreement.effect.consent
}
type ArchivedReceipt =
  | { readonly kind: "discarded"; readonly item: import("./interim-recovery-execution").RecoveryLocator }
  | { readonly kind: "filter-replaced"; readonly effect: { readonly item: import("./interim-recovery-execution").RecoveryLocator; readonly key: { readonly acct: string; readonly playlist: string }; readonly after: JsonObject; readonly history: { readonly after: RecoveryStoredObject } } }
  | { readonly kind: "playlist-restored"; readonly effect: { readonly item: import("./interim-recovery-execution").RecoveryLocator; readonly key: { readonly acct: string }; readonly after: JsonObject; readonly history: { readonly after: RecoveryStoredObject } } }
export function archiveResolutions(archive: Snapshot<RetainedArchiveV5>): readonly ArchivedReceipt[] {
  // The archive reader validated these receipts; this view avoids recursively mapping JSON and branded strings.
  return archive.kind === "completed-v4" ? archive.checkpoint.resolutions as unknown as readonly ArchivedReceipt[] : []
}

// The historical after-image is derived once from evidence, never from today's canonical records.
function historicalAnchor(archive: Snapshot<RetainedArchiveV5>): { readonly canonical: JsonObject; readonly history: RecoveryStoredObject } | undefined {
  const basis = archive.kind === "installed-v3" ? archive.checkpoint : archive.checkpoint.basis.checkpoint
  const canonical = startingCanonical(basis)
  if (!canonical) return
  const initial: unknown = archive.kind === "installed-v3" ? basis.installation.history : archive.checkpoint.basis.history
  let history = detachAgreement(initial) as RecoveryStoredObject
  for (const resolution of archiveResolutions(archive)) {
    switch (resolution.kind) {
      case "discarded": break
      case "filter-replaced":
        canonical[`doc:filter:${resolution.effect.key.acct}:${resolution.effect.key.playlist}`] = detachAgreement(resolution.effect.after)
        history = resolution.effect.history.after
        break
      case "playlist-restored":
        canonical[`doc:setup:${resolution.effect.key.acct}`] = detachAgreement(resolution.effect.after)
        history = resolution.effect.history.after
        break
      default: { const exhaustive: never = resolution; return exhaustive }
    }
  }
  return { canonical, history }
}
function readArchive(raw: unknown): Snapshot<RetainedArchiveV5> | undefined {
  if (!object(raw) || !exact(raw, ["kind", "checkpoint"]) || !object(raw.checkpoint)) return
  if (raw.kind === "installed-v3") {
    if (raw.checkpoint.v !== 3) return
    const read = readRetainedCheckpoint(raw.checkpoint)
    if (read.kind !== "installation" || read.checkpoint.installation.kind !== "installed") return
    return { kind: "installed-v3", checkpoint: { ...read.checkpoint, installation: { ...read.checkpoint.installation, kind: "installed" } } }
  }
  if (raw.kind !== "completed-v4" || raw.checkpoint.v !== 4) return
  const read = readRetainedRecovery(raw.checkpoint)
  if (read.kind !== "recovery" || read.checkpoint.pending.kind !== "none" || read.checkpoint.basis.checkpoint.v !== 3) return
  const basis = read.checkpoint.basis.checkpoint
  if (basis.installation.kind !== "installed") return
  return { kind: "completed-v4", checkpoint: { ...read.checkpoint, basis: { ...read.checkpoint.basis, checkpoint: basis }, pending: { kind: "none" } } }
}
function readAnchor(raw: unknown, archive: Snapshot<RetainedArchiveV5>): AuthorityAnchorV5 | undefined {
  if (!object(raw) || !exact(raw, ["canonical", "history", "join"]) || !object(raw.canonical) || !object(raw.history) || !object(raw.join)) return
  const historical = historicalAnchor(archive)
  if (!historical || !same(raw.canonical, historical.canonical) || !same(raw.history, historical.history)) return
  const history: JsonObject | undefined = raw.history.kind === "absent" && exact(raw.history, ["kind"]) ? {} : raw.history.kind === "present" && exact(raw.history, ["kind", "raw"]) && object(raw.history.raw) ? { sync: raw.history.raw } : undefined
  const checked = history && readInterimInstallationHistory(history)
  if (checked?.kind !== "history") return
  let join: AuthorityAnchorV5["join"]
  if (raw.join.kind === "absent" && exact(raw.join, ["kind"])) join = { kind: "absent" }
  else if (raw.join.kind === "off" && exact(raw.join, ["kind", "raw"]) && object(raw.join.raw)) {
    const read = readSyncJoinCheckpoint(raw.join.raw)
    if (read.kind !== "valid" || read.checkpoint.phase !== "off") return
    join = { kind: "off", raw: detachAgreement(raw.join.raw) }
  } else return
  return { canonical: detachAgreement(raw.canonical), history: checked.history, join }
}
function readHandoff(raw: unknown, archive: Snapshot<RetainedArchiveV5>): AuthorityHandoffV5 | undefined {
  if (!object(raw) || !text(raw.handoffId) || !text(raw.sourceEpoch)) return
  const anchor = readAnchor(raw.anchor, archive)
  if (!anchor) return
  const base = { handoffId: raw.handoffId, sourceEpoch: raw.sourceEpoch, anchor }
  if (raw.kind === "accepted" && exact(raw, ["kind", "handoffId", "sourceEpoch", "anchor"])) return { kind: "accepted", ...base }
  if (raw.kind !== "canonical" || !exact(raw, ["kind", "handoffId", "sourceEpoch", "anchor", "retirement"])) return
  const retirement = raw.retirement
  if (!object(retirement) || !exact(retirement, ["kind", "handoffId", "sourceEpoch"]) || retirement.kind !== "fixture-producers-retired" ||
    retirement.handoffId !== raw.handoffId || retirement.sourceEpoch !== raw.sourceEpoch) return
  return { kind: "canonical", ...base, retirement: { kind: "fixture-producers-retired", handoffId: raw.handoffId, sourceEpoch: raw.sourceEpoch } }
}
export function readCanonicalAuthorityRecord(raw: unknown): CanonicalAuthorityRecordRead {
  const invalid = { kind: "invalid" } as const
  try {
    if (!object(raw) || raw.v !== 5 || raw.kind !== "retained-interim" || !Array.isArray(raw.resolutions) || !object(raw.pending)) return invalid
    const archive = readArchive(raw.archive)
    const handoff = archive && readHandoff(raw.handoff, archive)
    if (!archive || !handoff) return invalid
    const original = archiveRetained(archive), anchor = handoff.anchor.canonical
    const occurrences = new Set(archiveResolutions(archive).map(x => recoveryLocatorIdentity(resolutionItem(x))))
    const resolutions: RecoveryResolution[] = []
    for (const resolution of raw.resolutions) {
      if (handoff.kind !== "canonical") return invalid
      const discard = validateDiscardResolution(resolution, original, anchor)
      if (discard) {
        const identity = recoveryLocatorIdentity(discard.item)
        if (occurrences.has(identity)) return invalid
        occurrences.add(identity); resolutions.push(discard)
        continue
      }
      if (!object(resolution) || !exact(resolution, ["kind", "effect"]) || (resolution.kind !== "filter-replaced" && resolution.kind !== "playlist-restored")) return invalid
      const effect = resolution.kind === "playlist-restored" ? validateArchivedRestore(resolution.effect, original, anchor) : validateArchivedReplacement(resolution.effect, original, anchor)
      if (!effect || occurrences.has(recoveryLocatorIdentity(effect.item))) return invalid
      occurrences.add(recoveryLocatorIdentity(effect.item)); resolutions.push(documentResolution(effect))
    }
    let pending: RetainedCanonicalAuthorityV5["pending"]
    if (raw.pending.kind === "none" && exact(raw.pending, ["kind"])) pending = { kind: "none" }
    else if (handoff.kind === "canonical" && (raw.pending.kind === "filter-replacement" || raw.pending.kind === "playlist-restore") && exact(raw.pending, ["kind", "effect"])) {
      const effect = raw.pending.kind === "playlist-restore" ? validateArchivedRestore(raw.pending.effect, original, anchor) : validateArchivedReplacement(raw.pending.effect, original, anchor)
      if (!effect || occurrences.has(recoveryLocatorIdentity(effect.item))) return invalid
      pending = documentPending(effect)
    } else return invalid
    const checkpoint: unknown = { ...raw, v: 5, kind: "retained-interim", archive: { kind: archive.kind, checkpoint: detachAgreement(raw.archive as JsonObject).checkpoint }, handoff, resolutions, pending }
    return { kind: "authority", checkpoint: freezeAgreement(checkpoint) as Snapshot<RetainedCanonicalAuthorityV5> }
  } catch { return invalid }
}

export function selectRecords(records: Readonly<Record<string, unknown>>, keep: (key: string) => boolean): JsonObject {
  return detachAgreement(Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))) as JsonObject
}
// Absence or archived authority needs the complete inventory, including the checkpoint.
export function classifyRetainedAuthority(records: Readonly<Record<string, unknown>>): RetainedAuthorityClass {
  if (records === null || typeof records !== "object" || Array.isArray(records)) return { kind: "held" }
  if (!Object.keys(records).some(isRetainedMarkerKey)) return { kind: "none" }
  if (!object(records)) return { kind: "held" }
  const read = readRetainedCheckpoint(records[interimConversionKey])
  if (read.kind !== "authority" || read.checkpoint.handoff.kind !== "canonical") return { kind: "held" }
  return coversArchivedSource(records, read.checkpoint) ? { kind: "canonical-archive", checkpoint: read.checkpoint } : { kind: "held" }
}
export function coversArchivedSource(records: Readonly<Record<string, unknown>>, checkpoint: Snapshot<RetainedCanonicalAuthorityV5>): boolean {
  const source = archiveRetained(checkpoint.archive).source
  return same(selectRecords(records, isInterimSourceKey), source) && !LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key) && !Object.hasOwn(source, key))
}
export function archivedKeys(checkpoint: Snapshot<RetainedCanonicalAuthorityV5>): ReadonlySet<string> {
  const source: object = archiveRetained(checkpoint.archive).source
  return new Set([...Object.keys(source), interimConversionKey])
}

export function currentAuthorityAnchor(records: JsonObject): AuthorityAnchorV5 | undefined {
  const history = readInterimInstallationHistory(records)
  if (history.kind !== "history") return
  if (history.history.kind === "present" && decodeSyncState(history.history.raw).opaqueWrite?.gate) return
  let join: AuthorityAnchorV5["join"] = { kind: "absent" }
  if (Object.hasOwn(records, pendingSyncJoinKey)) {
    const read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (read.kind !== "valid" || read.checkpoint.phase !== "off" || !object(records[pendingSyncJoinKey])) return
    join = { kind: "off", raw: detachAgreement(records[pendingSyncJoinKey]) }
  }
  return { canonical: selectRecords(records, isInterimCanonicalKey), history: history.history, join }
}
export function archiveFor(checkpoint: unknown): RetainedArchiveV5 | undefined {
  const read = readRetainedCheckpoint(checkpoint)
  if (read.kind === "installation" && read.checkpoint.installation.kind === "installed") return detachAgreement({ kind: "installed-v3", checkpoint: checkpoint as InstalledRetainedV3 })
  if (read.kind === "recovery" && read.checkpoint.pending.kind === "none" && read.checkpoint.basis.checkpoint.v === 3 && read.checkpoint.basis.checkpoint.installation.kind === "installed")
    return detachAgreement({ kind: "completed-v4", checkpoint: checkpoint as CompletedRecoveryV4 })
}
