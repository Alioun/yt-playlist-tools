import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION } from "../../shared/model/documents"
import { decodeDevice } from "../../shared/model/decodeDevice"
import { decodeSyncState } from "../../shared/model/decodeSyncState"
import { isAccountKey, parseDocumentKey } from "../../shared/model/validation"
import type { Device } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import type { RetainedInterim, RetainedAgreementV2, InterimPersistenceSnapshot } from "./interim-persistence"
import { readFirstEditProvenance } from "./first-edit-provenance"
import { sameSyncJson } from "./sync-write-admission"
import type { Agreement } from "./consent-withdrawal"

export type ConfirmedRetainedAgreementV2 = Omit<RetainedAgreementV2, "agreement"> & {
  readonly agreement: Extract<RetainedAgreementV2["agreement"], { kind: "confirmed" }>
}
export type RetainedInstallationHistory = { readonly kind: "absent" } | { readonly kind: "present"; readonly raw: JsonObject }
export type RetainedInstallationV3 = {
  readonly v: 3
  readonly kind: "retained-interim"
  readonly agreed: ConfirmedRetainedAgreementV2
  readonly installation: { readonly kind: "accepted"; readonly history: RetainedInstallationHistory } | { readonly kind: "installed"; readonly history: RetainedInstallationHistory }
}
export type AcceptedRetainedInstallationV3 = Omit<RetainedInstallationV3, "installation"> & {
  readonly installation: Extract<RetainedInstallationV3["installation"], { kind: "accepted" }>
}
export type InstalledRetainedInstallationV3 = Omit<RetainedInstallationV3, "installation"> & {
  readonly installation: Extract<RetainedInstallationV3["installation"], { kind: "installed" }>
}
type Proposal = Extract<RetainedInterim["outcome"], { kind: "inactive-proposal" }>
export type InterimInstallationEffect = {
  readonly documents: Snapshot<Proposal["documents"]>
  readonly caches: Snapshot<Proposal["caches"]>
  readonly schema: { readonly kind: "unchanged" } | { readonly kind: "set"; readonly value: typeof STORAGE_SCHEMA_VERSION }
}
export type InterimInstallationDerivation = { readonly kind: "effect"; readonly effect: InterimInstallationEffect }
  | { readonly kind: "unavailable"; readonly reason: "consent-held" | "blocked-source" | "sync-writer-required" | "retention" }
export type InterimInstallationDifference = "source" | "canonical" | "history" | "checkpoint" | undefined
export type InterimInstallationReview = { readonly kind: "interim-installation-review" }
export type InterimInstallationWrite = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type InterimInstallationStage = "accept" | "install" | "confirm"
export type InterimInstallationUnavailable = {
  readonly kind: "unavailable"
  readonly reason: "consent-held" | "startup" | "disposed" | "stale" | "retention" | "agreement-required" | "pending-agreement" | "pending-installation"
    | "pending-removal" | "pending-join" | "blocked-source" | "newer-version" | "newer-layout" | "sync-writer-required" | "history"
}
export type InterimInstallationStatus =
  | { readonly kind: "review"; readonly review: InterimInstallationReview; readonly documents: readonly { readonly kind: "settings" | "setup" | "filter"; readonly path: string }[];
      readonly caches: readonly string[]; readonly note: Snapshot<Proposal["note"]>; readonly consent: Snapshot<NonNullable<Device["consent"]>>; readonly activation: "held" }
  | { readonly kind: "pending"; readonly action: "resume-interim-installation"; readonly activation: "held" }
  | { readonly kind: "installed"; readonly activation: "held"; readonly recovery: "retained" }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" }
  | InterimInstallationUnavailable
export type InterimInstallationResult =
  | { readonly kind: "committed"; readonly activation: "held"; readonly mutations: readonly { readonly stage: InterimInstallationStage; readonly write: InterimInstallationWrite }[] }
  | { readonly kind: "unchanged"; readonly reason: "already-installed"; readonly activation: "held" }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" }
  | InterimInstallationUnavailable
  | { readonly kind: "failed"; readonly stage: "before-set"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: InterimInstallationStage; readonly write: Extract<InterimInstallationWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: InterimInstallationStage; readonly write: InterimInstallationWrite;
      readonly cause: { readonly kind: "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
function object(raw: unknown): raw is JsonObject { return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw) }
function same(a: unknown, b: unknown): boolean { return isJsonValue(a) && isJsonValue(b) && sameSyncJson(a, b) }

export function deriveInterimInstallationEffect(agreed: Snapshot<ConfirmedRetainedAgreementV2>): InterimInstallationDerivation {
  if (agreed.agreement.kind !== "confirmed" || agreed.agreement.effect.consent.v !== CONSENT_VERSION) return { kind: "unavailable", reason: "retention" }
  const original = agreed.retained, proposal = original.outcome
  if (proposal.kind !== "inactive-proposal") return { kind: "unavailable", reason: "blocked-source" }
  try {
    const device = decodeDevice(agreed.agreement.effect.device)
    if (device.syncOn) return { kind: "unavailable", reason: "sync-writer-required" }
    if (!same(device.consent, agreed.agreement.effect.consent)) return { kind: "unavailable", reason: "retention" }
  } catch { return { kind: "unavailable", reason: "retention" } }
  if (Object.hasOwn(original.canonical, "schema") && Object.getOwnPropertyDescriptor(original.canonical, "schema")?.value !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "retention" }
  const paths = new Set<string>()
  for (const candidate of proposal.documents) {
    if (parseDocumentKey(candidate.path)?.kind !== candidate.kind || paths.has(candidate.path) || Object.hasOwn(original.canonical, candidate.path)) return { kind: "unavailable", reason: "retention" }
    paths.add(candidate.path)
  }
  for (const cache of proposal.caches) {
    if (!cache.path.startsWith("cache:") || !isAccountKey(cache.path.slice(6)) || paths.has(cache.path) || Object.hasOwn(original.canonical, cache.path)) return { kind: "unavailable", reason: "retention" }
    paths.add(cache.path)
  }
  return { kind: "effect", effect: { documents: proposal.documents, caches: proposal.caches,
    schema: Object.hasOwn(original.canonical, "schema") ? { kind: "unchanged" } : { kind: "set", value: STORAGE_SCHEMA_VERSION } } }
}
export function readInterimInstallationHistory(records: JsonObject): { readonly kind: "history"; readonly history: RetainedInstallationHistory } | { readonly kind: "unavailable"; readonly reason: "history" } {
  if (!object(records)) return { kind: "unavailable", reason: "history" }
  if (!Object.hasOwn(records, "sync")) return { kind: "history", history: { kind: "absent" } }
  const raw = records.sync
  if (!object(raw)) return { kind: "unavailable", reason: "history" }
  try {
    if (decodeSyncState(raw).status !== "off" || readFirstEditProvenance({ kind: "present", raw }).kind === "invalid") return { kind: "unavailable", reason: "history" }
  } catch { return { kind: "unavailable", reason: "history" } }
  return { kind: "history", history: { kind: "present", raw } }
}
function validSnapshot(raw: unknown): boolean {
  return object(raw) && object(raw.source) && object(raw.canonical) && object(raw.checkpoint) &&
    Object.keys(raw).every(k => ["source", "canonical", "checkpoint", "historicalAuthorization", "priorCredentialPresence"].includes(k))
}
export function retainedInstallationDifference(input: { readonly checkpoint: Snapshot<RetainedInstallationV3>; readonly current: InterimPersistenceSnapshot; readonly history: RetainedInstallationHistory }): InterimInstallationDifference {
  const { checkpoint, current, history } = input
  if (!validSnapshot(current)) return "source"
  if (current.checkpoint.kind !== "present" || Object.keys(current.checkpoint).length !== 2 || !same(checkpoint, current.checkpoint.value)) return "checkpoint"
  const original = checkpoint.agreed.retained
  if (!same(original.source, current.source)) return "source"
  if (!same(original.historicalAuthorization, current.historicalAuthorization) || !same(original.priorCredentialPresence, current.priorCredentialPresence)) return "history"
  if (!same(checkpoint.installation.history, history)) return "history"
  const readHistory = readInterimInstallationHistory(history.kind === "absent" ? {} : { sync: history.raw })
  if (readHistory.kind !== "history" || !same(readHistory.history, history)) return "history"
  const derived = deriveInterimInstallationEffect(checkpoint.agreed)
  if (derived.kind !== "effect") return "canonical"
  const canonical: unknown = original.canonical, device: unknown = checkpoint.agreed.agreement.effect.device
  if (!object(canonical) || !object(device)) return "canonical"
  const before: JsonObject = { ...canonical, device }
  const owned: JsonObject = Object.fromEntries([...derived.effect.documents.map(x => [x.path, x.document]), ...derived.effect.caches.map(x => [x.path, x.data])])
  if (derived.effect.schema.kind === "set") owned.schema = derived.effect.schema.value
  for (const key of new Set([...Object.keys(before), ...Object.keys(owned), ...Object.keys(current.canonical)])) {
    const present = Object.hasOwn(current.canonical, key)
    if (Object.hasOwn(owned, key) && present && same(current.canonical[key], owned[key])) continue
    if (Object.hasOwn(owned, key) && checkpoint.installation.kind === "installed") return "canonical"
    if (present !== Object.hasOwn(before, key) || present && !same(current.canonical[key], before[key])) return "canonical"
  }
}

export function recoveredRetainedInstallationDifference(input: {
  readonly accepted: Snapshot<AcceptedRetainedInstallationV3>
  readonly effect: InterimInstallationEffect
  readonly current: InterimPersistenceSnapshot
  readonly history: RetainedInstallationHistory
  readonly agreement: Agreement
  readonly expected: { readonly checkpoint: "agreed"; readonly progress: "draft" } | { readonly checkpoint: "accepted"; readonly progress: "draft" | "accepted" | "terminal" } | { readonly checkpoint: "installed"; readonly progress: "terminal" }
}): InterimInstallationDifference {
  const { accepted, effect, current, history, agreement, expected } = input
  if (!validSnapshot(current)) return "source"
  const receipt = { ...accepted, installation: { ...accepted.installation, kind: "installed" } }
  if (current.checkpoint.kind !== "present" || Object.keys(current.checkpoint).length !== 2 || !same(current.checkpoint.value, expected.checkpoint === "agreed" ? accepted.agreed : expected.checkpoint === "accepted" ? accepted : receipt)) return "checkpoint"
  const original = accepted.agreed.retained
  if (!same(original.source, current.source)) return "source"
  if (!same(original.historicalAuthorization, current.historicalAuthorization) || !same(original.priorCredentialPresence, current.priorCredentialPresence)) return "history"
  const checkedHistory = readInterimInstallationHistory(history.kind === "absent" ? {} : { sync: history.raw })
  if (checkedHistory.kind !== "history" || !same(accepted.installation.history, history) || !same(checkedHistory.history, history)) return "history"
  const derived = deriveInterimInstallationEffect(accepted.agreed)
  if (derived.kind !== "effect" || !same(derived.effect, effect)) return "canonical"
  const canonical: unknown = original.canonical, device: unknown = accepted.agreed.agreement.effect.device
  if (!object(canonical) || !object(device) || agreement.v !== CONSENT_VERSION || !Number.isSafeInteger(agreement.at) || agreement.at < 0) return "canonical"
  const before: JsonObject = { ...canonical, device: { ...device, consent: agreement } }
  const owned: JsonObject = Object.fromEntries([...effect.documents.map(x => [x.path, x.document]), ...effect.caches.map(x => [x.path, x.data])])
  if (effect.schema.kind === "set") owned.schema = effect.schema.value
  for (const key of new Set([...Object.keys(before), ...Object.keys(owned), ...Object.keys(current.canonical)])) {
    const present = Object.hasOwn(current.canonical, key)
    if (expected.progress !== "draft" && Object.hasOwn(owned, key) && present && same(current.canonical[key], owned[key])) continue
    if (Object.hasOwn(owned, key) && expected.progress === "terminal") return "canonical"
    if (present !== Object.hasOwn(before, key) || present && !same(current.canonical[key], before[key])) return "canonical"
  }
}
