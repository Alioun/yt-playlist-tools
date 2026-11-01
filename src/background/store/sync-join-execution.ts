import { classifyRetainedAuthority } from "./interim-canonical-authority"
import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION, decodeDevice, decodeDocument, decodeSettings, decodeSyncState, decodeSyncMeta, decodeStamp, documentKey, isAccountKey,
  type AccountKey, type Device, type SyncMeta, type DocumentKey } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
import type { JsonObject } from "../../shared/contracts/json"
import { agreementObject, detachAgreement } from "./consent-agreement"
import { encodeSyncDocument, projectSyncWrite, type SyncItem } from "./sync-codec"
import { readSyncInventory } from "./sync-inventory"
import { sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"
import { readFirstEditProvenance } from "./first-edit-provenance"
import { planAccountSessionRemoval } from "./account-removal-session"
import { removalProgressShards, type ProgressShard, type AccountRemovalHost } from "./account-removal-execution"
import type { LocalWriteStorage } from "./local-filter-writer"
import { pendingSyncJoinKey, readSyncJoinCheckpoint, transitionSyncJoin, joinJson, joinStored, sameJoinStored, joinDocuments,
  selectJoinDocuments, deriveJoinAgreement, deriveJoinHistory, deriveReconcileEffect, joinClearsProgress, joinProgressPlan,
  type JoinAgreementFacts, type JoinSelectionFacts, type JoinTarget, type ReconcileEffect,
  type JoinMaterialization, type JoinOutboundDebt, type JoinDocument, type SyncJoinCheckpoint, type AcceptedJoinEffect } from "./sync-join-persistence"
export type UiOrigin = Extract<Origin, { kind: "ui" }>
export type { SyncJoinSide } from "./sync-join-persistence"
export type SyncJoinReview = { readonly kind: "sync-join-review" }
export type SyncJoinUnavailable = { readonly kind: "unavailable"; readonly reason: "consent-held" |
  "startup" | "newer-layout" | "disposed" | "consent" | "stale" | "inventory" | "history" | "reset" | "incomplete" | "ambiguous-history" |
  "retention" | "pending-removal" | "pending-agreement" | "pending-join" | "join-host" | "same-history-rejoin-required" | "changed-generation" }
export type SyncJoinRefusal = { readonly kind: "refused"; readonly reason: "invalid" | "update-needed" | "sync-full"; readonly quota?: { readonly exceeded: readonly ("bytes" | "items" | "item-bytes")[]; readonly bytes: number; readonly items: number; readonly largest: { readonly kind: "settings" | "setup" | "filter" | "metadata" | "other"; readonly bytes: number; readonly items: number } } }
export type SyncJoinPreparation =
  | { readonly kind: "choice-required"; readonly review: SyncJoinReview; readonly reason: "independent-settings" | "unknown-provenance" | "different-history"; readonly defaultChoice: "use-synced" }
  | { readonly kind: "automatic"; readonly review: SyncJoinReview; readonly reason: "empty-copy" | "proven-never-edited" | "proven-same-history-no-edit" }
  | SyncJoinUnavailable | SyncJoinRefusal | { readonly kind: "cancelled" } | { readonly kind: "failed"; readonly stage: "prepare"; readonly error: unknown }
export type SyncJoinOperation = { readonly result: Promise<SyncJoinPreparation>; cancel(): void }
export type SyncJoinWrite = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type SyncJoinStage = "accept" | "materialize" | "local-cleanup" | "session-cleanup" | "debt" | "acknowledge" | "retire"
export type SyncJoinResult =
  | { readonly kind: "committed"; readonly historyId: SyncMeta["id"]; readonly replication: "pending" | "confirmed";
      readonly mutations: readonly { readonly stage: SyncJoinStage; readonly write: SyncJoinWrite }[] }
  | { readonly kind: "cancelled" } | SyncJoinUnavailable | SyncJoinRefusal
  | { readonly kind: "failed"; readonly stage: "prepare"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: SyncJoinStage; readonly write: Extract<SyncJoinWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: SyncJoinStage; readonly write: SyncJoinWrite; readonly cause:
      { readonly kind: "readback" | "stopped" | "authority" } | { readonly kind: "read-failed"; readonly error: unknown } }
export type SyncJoinStatus = { readonly kind: "off" | "joining" } | { readonly kind: "waiting"; readonly action: "review-join" } |
  { readonly kind: "pending"; readonly action: "resume-join" } | { readonly kind: "joined"; readonly status: "ok" | "full" | "update-needed" } | SyncJoinUnavailable
export type SyncJoinLocalRemoval = { readonly kind: "continuation" } | { readonly kind: "cache"; readonly acct: AccountKey } |
  { readonly kind: "progress"; readonly acct: AccountKey; readonly shard: ProgressShard }
export type SyncJoinHost = { readonly kind: "unavailable" } | { readonly kind: "fixture";
  removeLocal(keys: readonly SyncJoinLocalRemoval[]): Promise<void>; readonly session: Extract<AccountRemovalHost, { kind: "fixture" }>["session"] }
export function syncJoinLocalName(key: SyncJoinLocalRemoval): string {
  if (!agreementObject(key)) throw new TypeError("Invalid join removal")
  if (key.kind === "continuation" && Object.keys(key).length === 1) return pendingSyncJoinKey
  if (key.kind === "cache" && Object.keys(key).length === 2 && isAccountKey(key.acct)) return `cache:${key.acct}`
  if (key.kind === "progress" && Object.keys(key).length === 3 && isAccountKey(key.acct) && removalProgressShards.includes(key.shard)) return `progress:${key.acct}:${key.shard}`
  throw new TypeError("Join removal escaped its semantic key")
}
export const joinUnavailable = (reason: SyncJoinUnavailable["reason"]): SyncJoinUnavailable => ({ kind: "unavailable", reason })
export function readJoinLocal(raw: unknown, agreement = false): { readonly kind: "local"; readonly records: JsonObject; readonly documents: readonly JoinDocument[] } | SyncJoinUnavailable | SyncJoinRefusal {
  if (!agreementObject(raw)) return joinUnavailable("inventory")
  if (typeof raw.schema === "number" && raw.schema > STORAGE_SCHEMA_VERSION) return joinUnavailable("newer-layout")
  if (raw.schema !== STORAGE_SCHEMA_VERSION) return joinUnavailable("startup")
  if (classifyRetainedAuthority(raw).kind === "held") return joinUnavailable("retention")
  if (Object.hasOwn(raw, "pending:account-removal")) return joinUnavailable("pending-removal")
  try {
    if (Object.hasOwn(raw, "device")) {
      if (!agreementObject(raw.device) || !["id", "consent", "syncOn"].every(k => agreementObject(raw.device) && Object.hasOwn(raw.device, k))) return joinUnavailable("consent")
      const device = decodeDevice(raw.device)
      if (!agreement && (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending")) return joinUnavailable("consent")
      if (device.consent && device.consent.v > CONSENT_VERSION) return { kind: "refused", reason: "update-needed" }
    } else if (!agreement) return joinUnavailable("consent")
    if (Object.hasOwn(raw, "sync")) {
      if (readFirstEditProvenance({ kind: "present", raw: raw.sync }).kind === "invalid") return joinUnavailable("history")
      const history = decodeSyncState(raw.sync), device = Object.hasOwn(raw, "device") ? decodeDevice(raw.device) : undefined
      if (device?.syncOn ? history.joined === null || history.status === "off" : history.status !== "off") return joinUnavailable("history")
    } else if (Object.hasOwn(raw, "device") && decodeDevice(raw.device).syncOn) return joinUnavailable("history")
    for (const [name, value] of Object.entries(raw)) if (name.startsWith("doc:") && agreementObject(value) && typeof value.v === "number" && value.v > 1) return { kind: "refused", reason: "update-needed" }
    const documents = joinDocuments(raw)
    for (const [name, value] of Object.entries(raw)) if (name.startsWith("progress:") && (!/^progress:[A-Za-z0-9_-]{16}:(?:[0-9]|1[0-5])$/.test(name) || !agreementObject(value))) return joinUnavailable("inventory")
    return { kind: "local", records: joinJson(raw), documents }
  } catch { return joinUnavailable("inventory") }
}
export type JoinRemote = { readonly kind: "remote"; readonly records: JsonObject; readonly target: JoinTarget | { readonly kind: "empty" }; readonly documents: readonly JoinDocument[] }
export function readJoinRemote(raw: unknown): JoinRemote | SyncJoinUnavailable | SyncJoinRefusal {
  if (!agreementObject(raw)) return joinUnavailable("inventory")
  try {
    const inventory = readSyncInventory({ items: Object.entries(raw).map(([key, value]) => ({ key, value })) })
    if (inventory.kind !== "read") return { kind: "refused", reason: "invalid" }
    let target: JoinRemote["target"]
    if (!Object.hasOwn(raw, "s:meta")) {
      if (Object.keys(raw).some(n => n.startsWith("s:"))) return joinUnavailable("ambiguous-history")
      target = { kind: "empty" }
    } else {
      if (!agreementObject(raw["s:meta"])) return { kind: "refused", reason: "invalid" }
      const metadata = decodeSyncMeta(raw["s:meta"])
      if (metadata.v > 1) return { kind: "refused", reason: "update-needed" }
      if (metadata.reset === true) return joinUnavailable("reset")
      target = { kind: "existing", metadata: joinJson(raw["s:meta"]) }
    }
    const documents: JoinDocument[] = []
    for (const member of inventory.documents) {
      if (member.result.kind === "incomplete" || member.result.kind === "absent") return joinUnavailable("incomplete")
      if (member.result.kind === "newer-version") return { kind: "refused", reason: "update-needed" }
      if (member.result.kind !== "value" && member.result.kind !== "deleted") return { kind: "refused", reason: "invalid" }
      documents.push({ key: member.key, document: joinJson(member.result.json) })
    }
    try { joinDocuments(Object.fromEntries(documents.map(x => [documentKey(x.key), x.document]))) } catch { return joinUnavailable("inventory") }
    return { kind: "remote", records: joinJson(raw), target, documents: documents.sort((a,b) => documentKey(a.key).localeCompare(documentKey(b.key))) }
  } catch { return { kind: "refused", reason: "invalid" } }
}
export function classifySyncJoin(local: JsonObject, remote: JoinRemote): { readonly kind: "automatic"; readonly reason: "empty-copy" | "proven-never-edited" | "proven-same-history-no-edit" } |
  { readonly kind: "choice-required"; readonly reason: "independent-settings" | "unknown-provenance" | "different-history" } | SyncJoinUnavailable {
  const checkpoint = readSyncJoinCheckpoint(local[pendingSyncJoinKey])
  if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "choice") return { kind: "choice-required", reason: "different-history" }
  if (remote.target.kind === "empty") return { kind: "automatic", reason: "empty-copy" }
  const history = Object.hasOwn(local, "sync") ? decodeSyncState(local.sync) : undefined
  const unfinished = checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off"
  if (!unfinished && agreementObject(local.device) && !decodeDevice(local.device).syncOn && history?.joined === decodeSyncMeta(remote.target.metadata).id &&
    agreementObject(local.sync) && local.sync.editedSinceOff === false) return { kind: "automatic", reason: "proven-same-history-no-edit" }
  if (history?.everEdited === false) return { kind: "automatic", reason: "proven-never-edited" }
  return { kind: "choice-required", reason: history?.joined ? "different-history" : history?.everEdited === true ? "independent-settings" : "unknown-provenance" }
}
export function syncJoinDecision(classification: ReturnType<typeof classifySyncJoin>, side?: "use-synced" | "use-this-browser"): JoinSelectionFacts["decision"] | undefined {
  if (classification.kind === "unavailable") return
  if (classification.kind === "choice-required") return side ? { kind: "explicit", side } : undefined
  return classification.reason === "empty-copy" ? { kind: "create-copy" } : classification.reason === "proven-same-history-no-edit" ? { kind: "same-history-no-edit" } : { kind: "proven-never-edited" }
}
export function prepareJoinEffect(input: { readonly local: JsonObject; readonly remote: JoinRemote; readonly decision: JoinSelectionFacts["decision"];
  readonly agreement: JoinAgreementFacts; readonly at: number; readonly generation: () => string }): { readonly kind: "prepared"; readonly effect: JoinMaterialization } | SyncJoinRefusal | SyncJoinUnavailable {
  try {
    const { local, remote, at } = input
    if (!Number.isSafeInteger(at) || at < 0) return { kind: "refused", reason: "invalid" }
    const selection: JoinSelectionFacts = { localDocuments: joinDocuments(local), remoteDocuments: detachAgreement(remote.documents), decision: input.decision }
    const used = new Set([...selection.localDocuments, ...selection.remoteDocuments].map(x => decodeStamp(x.document).gen))
    if (agreementObject(local.sync) && typeof local.sync.joined === "string") used.add(local.sync.joined)
    if (remote.target.kind !== "empty") used.add(decodeSyncMeta(remote.target.metadata).id)
    const next = () => { const gen = input.generation(); if (typeof gen !== "string" || !gen.trim() || used.has(gen)) throw new TypeError("Colliding join generation"); used.add(gen); return gen }
    const deviceBefore = joinStored(local, "device"), historyBefore = joinStored(local, "sync")
    const deviceId = deviceBefore.kind === "present" ? decodeDevice(deviceBefore.value).id : input.agreement.kind === "none" ? "" : input.agreement.context.deviceId
    const selected = selectJoinDocuments(selection, (_key, raw) => { const tombstone: JsonObject = { ...raw, v: 1, gen: next(), at, by: deviceId, deleted: true }; delete tombstone.data; return tombstone })
    const overlay = deriveJoinAgreement({ selected, facts: input.agreement, device: deviceBefore, history: historyBefore })
    if (overlay.settings) {
      const index = selected.findIndex(x => x.key.kind === "settings"), original = selected[index]?.document ?? {}
      const document: JsonObject = { ...original, v: 1, gen: next(), at, by: deviceId, data: overlay.settings }; delete document.deleted
      if (index < 0) selected.push({ key: { kind: "settings" }, document }); else selected[index] = { key: { kind: "settings" }, document }
      selected.sort((a,b) => documentKey(a.key).localeCompare(documentKey(b.key)))
    }
    const target: JoinTarget = remote.target.kind === "empty" ? { kind: "create", metadata: { v: 1, id: next(), created: at } } : remote.target
    const consent = decodeDevice(overlay.device).consent
    if (consent?.v !== CONSENT_VERSION) return joinUnavailable("consent")
    const outgoing = selected.filter(x => !remote.documents.some(y => documentKey(y.key) === documentKey(x.key) && sameSyncJson(y.document, x.document))).map(x => ({ key: x.key, remoteBefore: remote.documents.some(y => documentKey(y.key) === documentKey(x.key)) ? { kind: "present", value: remote.documents.find(y => documentKey(y.key) === documentKey(x.key))!.document } as const : { kind: "absent" } as const, selected: x.document }))
    const debt: JoinOutboundDebt = { target, deviceId, consent, selectedDocuments: selected, outgoing }
    const removedAccounts = selected.filter(x => x.key.kind === "setup" && x.document.deleted === true).flatMap(x => x.key.kind === "setup" ? [x.key.acct] : [])
    const device = joinJson(overlay.device)
    if (removedAccounts.some(x => x === decodeDevice(device).lastAccount)) device.lastAccount = null
    const clearProgress: { acct: AccountKey; shard: ProgressShard }[] = []
    const localSettings = selection.localDocuments.find(x => x.key.kind === "settings")?.document
    const finalSettings = selected.find(x => x.key.kind === "settings")?.document
    const clearsProgress = (localSettings && decodeDocument(localSettings, decodeSettings).kind === "value" && decodeSettings(localSettings.data).autoAdd.on && finalSettings && decodeDocument(finalSettings, decodeSettings).kind === "value" && !decodeSettings(finalSettings.data).autoAdd.on) || overlay.clearProgress
    if (clearsProgress) for (const name of Object.keys(local).sort()) {
      const match = /^progress:([A-Za-z0-9_-]{16}):([0-9]|1[0-5])$/.exec(name)
      if (!match || !isAccountKey(match[1]) || removedAccounts.some(x => x === match[1])) continue
      const shard = removalProgressShards.find(x => String(x) === match[2]); if (shard !== undefined) clearProgress.push({ acct: match[1], shard })
    }
    const effect: JoinMaterialization = { kind: "join", selection, agreement: input.agreement, device: { before: deviceBefore, after: device }, history: { before: historyBefore, after: deriveJoinHistory(historyBefore, debt, overlay.settings !== undefined) }, documents: selected.map(x => ({ key: x.key, before: joinStored(local, documentKey(x.key)), after: x.document })), clearProgress, removedAccounts, debt }
    const admission = projectJoinDebt(debt, remote.records)
    if (admission.kind !== "planned") return admission
    const validation = readSyncJoinCheckpoint({ v: input.decision.kind === "same-history-no-edit" ? 2 : 1, kind: "sync-join", phase: "accepted", effect })
    return validation.kind === "valid" ? { kind: "prepared", effect } : { kind: "refused", reason: "invalid" }
  } catch { return { kind: "refused", reason: "invalid" } }
}
export function prepareReconcileEffect(input: { readonly local: JsonObject; readonly remote: JoinRemote; readonly debt: JoinOutboundDebt;
  readonly at: number; readonly generation: () => string }): { readonly kind: "prepared"; readonly effect: ReconcileEffect } | SyncJoinRefusal | SyncJoinUnavailable {
  try {
    if (!Number.isSafeInteger(input.at) || input.at < 0) return { kind: "refused", reason: "invalid" }
    const { local, remote, debt, at } = input, localRead = readJoinLocal(local)
    if (localRead.kind !== "local") return localRead
    const used = new Set([...localRead.documents, ...remote.documents].map(x => decodeStamp(x.document).gen))
    used.add(decodeSyncMeta(debt.target.metadata).id)
    for (const member of debt.outgoing) if (member.remoteBefore.kind === "present") used.add(decodeStamp(member.remoteBefore.value).gen)
    const basis = { kind: "outbound-drift", priorDebt: debt, localDocuments: localRead.documents, remoteDocuments: remote.documents, metadataBefore: joinStored(remote.records, "s:meta") } as const
    const effect = deriveReconcileEffect({ basis, device: joinStored(local, "device"), history: joinStored(local, "sync"), clearProgress: [],
      suppress(_key, original) {
        const gen = input.generation()
        if (typeof gen !== "string" || !gen.trim() || used.has(gen)) throw new TypeError("Colliding reconciliation generation")
        used.add(gen)
        const document: JsonObject = { ...original, v: 1, gen, at, by: debt.deviceId, deleted: true }; delete document.data; return document
      } })
    const fixed = { ...effect, clearProgress: joinClearsProgress(basis.localDocuments, effect.debt.selectedDocuments) ? joinProgressPlan(local, effect.removedAccounts) : [] }
    const admission = projectJoinDebt(fixed.debt, remote.records)
    if (admission.kind !== "planned") return admission
    return readSyncJoinCheckpoint({ v: 2, kind: "sync-join", phase: "accepted", effect: fixed }).kind === "valid" ? { kind: "prepared", effect: fixed } : { kind: "refused", reason: "invalid" }
  } catch { return { kind: "refused", reason: "invalid" } }
}
export function projectJoinDebt(debt: JoinOutboundDebt, remote: JsonObject): { readonly kind: "planned"; readonly items: readonly SyncItem[]; readonly sent: readonly SyncDocumentRecord[] } | SyncJoinUnavailable | SyncJoinRefusal {
  const current = readJoinRemote(remote)
  if (current.kind !== "remote") return current
  if (current.target.kind === "empty" ? debt.target.kind !== "create" && debt.target.kind !== "restore" : !sameSyncJson(current.target.metadata, debt.target.metadata)) return joinUnavailable("history")
  const items: SyncItem[] = [], sent: SyncDocumentRecord[] = []
  if (current.target.kind === "empty") items.push({ key: "s:meta", value: debt.target.metadata })
  for (const selected of debt.selectedDocuments) {
    const name = documentKey(selected.key), existing = current.documents.find(x => documentKey(x.key) === name)
    if (existing && sameSyncJson(existing.document, selected.document)) continue
    const captured = debt.outgoing.find(x => documentKey(x.key) === name)
    if (existing && (!captured || captured.remoteBefore.kind !== "present" || !sameSyncJson(captured.remoteBefore.value, existing.document))) return joinUnavailable("changed-generation")
    const encoded = encodeSyncDocument(selected)
    if (encoded.kind !== "encoded") return { kind: "refused", reason: encoded.kind === "newer-version" ? "update-needed" : encoded.kind === "item-too-large" ? "sync-full" : "invalid" }
    items.push(...encoded.encoded.items); sent.push({ key: selected.key, name, gen: decodeStamp(selected.document).gen, document: selected.document })
  }
  if (current.documents.some(x => !debt.selectedDocuments.some(y => documentKey(x.key) === documentKey(y.key)))) return joinUnavailable("changed-generation")
  const projection = projectSyncWrite({ current: Object.entries(remote).map(([key, value]) => ({ key, value })), set: items })
  if (projection.kind === "fits") return { kind: "planned", items, sent }
  if (projection.kind !== "full") return { kind: "refused", reason: "invalid" }
  const groups = new Map<string, { kind: "settings" | "setup" | "filter" | "metadata" | "other"; bytes: number; items: number }>()
  for (const item of projection.usage.perItem) {
    const base = item.key.split("@")[0]!
    const kind = base === "s:settings" ? "settings" : base.startsWith("s:setup:") ? "setup" : base.startsWith("s:filter:") ? "filter" : base === "s:meta" ? "metadata" : "other"
    const contributor = kind === "other" ? "other" : base
    const group = groups.get(contributor) ?? { kind, bytes: 0, items: 0 }
    group.bytes += item.bytes; group.items++; groups.set(contributor, group)
  }
  const largest = [...groups.values()].sort((a,b) => projection.exceeded.includes("items") ? b.items - a.items || b.bytes - a.bytes : b.bytes - a.bytes)[0] ?? { kind: "other" as const, bytes: 0, items: 0 }
  return { kind: "refused", reason: "sync-full", quota: { exceeded: projection.exceeded, bytes: projection.usage.bytes, items: projection.usage.items, largest } }
}
export type JoinExecutionDependencies = { readonly local: LocalWriteStorage; readonly host: SyncJoinHost; readonly stopped: () => boolean }
type JoinMutation = { stage: SyncJoinStage; write: SyncJoinWrite }
export async function confirmJoinMutation(input: { readonly stage: SyncJoinStage; readonly baseline: JsonObject; readonly expected: JsonObject;
  readonly read: () => Promise<Readonly<Record<string, unknown>>>; readonly write: () => Promise<void>; readonly stopped: () => boolean }): Promise<SyncJoinWrite | Exclude<SyncJoinResult, { kind: "committed" | "cancelled" }>> {
  if (input.stopped()) return joinUnavailable("stale")
  const before = await input.read()
  if (input.stopped() || !agreementObject(before) || !sameSyncJson(input.baseline, before)) return joinUnavailable("stale")
  let write: SyncJoinWrite = { kind: "resolved" }
  try { await input.write() } catch (error) { write = { kind: "rejected", error } }
  let observed
  try { observed = await input.read() } catch (error) { return { kind: "unconfirmed", stage: input.stage, write, cause: { kind: "read-failed", error } } }
  if (input.stopped()) return { kind: "unconfirmed", stage: input.stage, write, cause: { kind: "stopped" } }
  if (agreementObject(observed) && sameSyncJson(input.expected, observed)) return write
  if (write.kind === "rejected" && agreementObject(observed) && sameSyncJson(input.baseline, observed)) return { kind: "failed", stage: input.stage, write }
  return { kind: "unconfirmed", stage: input.stage, write, cause: { kind: "readback" } }
}
export function joinEffectCompatible(effect: AcceptedJoinEffect, records: JsonObject): boolean {
  const pairs = [["device", effect.device], ["sync", effect.history]] as const
  if (pairs.some(([name, value]) => !sameJoinStored(records, name, value.before) && !sameJoinStored(records, name, { kind: "present", value: value.after }))) return false
  if (effect.kind === "cancel") return true
  if (effect.documents.some(x => !sameJoinStored(records, documentKey(x.key), x.before) && !sameJoinStored(records, documentKey(x.key), { kind: "present", value: x.after }))) return false
  const named = new Set(effect.documents.map(x => documentKey(x.key)))
  if (Object.keys(records).some(n => n.startsWith("doc:") && !named.has(n))) return false
  if (effect.kind === "join" && effect.agreement.kind !== "none" && !sameJoinStored(records, "unclaimed", effect.agreement.reservedUnclaimed)) return false
  if ((effect.kind === "reconcile" || effect.selection.decision.kind === "same-history-no-edit") &&
    (joinClearsProgress(effect.kind === "reconcile" ? effect.basis.localDocuments : effect.selection.localDocuments, effect.debt.selectedDocuments) || effect.kind === "join" && effect.clearProgress.length > 0)) {
    if (!sameSyncJson(joinJson({ list: joinProgressPlan(records, effect.removedAccounts) }), joinJson({ list: effect.clearProgress }))) return false
  }
  return true
}
export async function setJoinStage(deps: JoinExecutionDependencies, stage: SyncJoinStage, baseline: JsonObject, items: JsonObject) {
  return confirmJoinMutation({ stage, baseline, expected: { ...baseline, ...items }, read: () => deps.local.get(null), write: () => deps.local.set(joinJson(items)), stopped: deps.stopped })
}
export async function retireJoin(deps: JoinExecutionDependencies, baseline: JsonObject) {
  if (deps.host.kind !== "fixture") return joinUnavailable("join-host")
  const expected = joinJson(baseline); delete expected[pendingSyncJoinKey]
  const host = deps.host
  return confirmJoinMutation({ stage: "retire", baseline, expected, read: () => deps.local.get(null), write: () => host.removeLocal([{ kind: "continuation" }]), stopped: deps.stopped })
}
export async function finishJoinEffect(deps: JoinExecutionDependencies, initial: JsonObject, checkpoint: SyncJoinCheckpoint & { phase: "accepted" }, mutations: JoinMutation[] = [], waiting?: Extract<SyncJoinCheckpoint, { phase: "choice" }>): Promise<SyncJoinResult> {
  if (deps.host.kind !== "fixture") return joinUnavailable("join-host")
  let stage: SyncJoinStage = "materialize"
  try {
    const host = deps.host, effect = checkpoint.effect
    let baseline = joinJson(initial)
    if (!joinEffectCompatible(effect, baseline)) return joinUnavailable("stale")
    const items: JsonObject = { device: effect.device.after, sync: effect.history.after }
    if (effect.kind !== "cancel") {
      for (const x of effect.documents) items[documentKey(x.key)] = x.after
      for (const x of effect.clearProgress) items[`progress:${x.acct}:${x.shard}`] = {}
    }
    if (Object.entries(items).some(([k,v]) => !Object.hasOwn(baseline,k) || !sameSyncJson(baseline[k]!,v))) {
      const write = await setJoinStage(deps, "materialize", baseline, items)
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "materialize", write }); baseline = { ...baseline, ...items }
    }
    if (effect.kind === "cancel") {
      stage = "retire"
      const next = effect.unfinishedTarget.kind === "present" ? transitionSyncJoin(joinJson(baseline[pendingSyncJoinKey]), { v: checkpoint.v, kind: "sync-join", phase: "off", unfinishedTarget: effect.unfinishedTarget.id }) : undefined
      const write = next ? await setJoinStage(deps, "retire", baseline, { [pendingSyncJoinKey]: next }) : await retireJoin(deps, baseline)
      return write.kind === "resolved" || write.kind === "rejected" ? { kind: "cancelled" } : write
    }
    const keys: SyncJoinLocalRemoval[] = effect.removedAccounts.flatMap(acct => [{ kind: "cache", acct } as const, ...removalProgressShards.map(shard => ({ kind: "progress", acct, shard } as const))]).filter(x => Object.hasOwn(baseline, syncJoinLocalName(x)))
    if (keys.length) {
      stage = "local-cleanup"
      const expected = joinJson(baseline); keys.forEach(x => { delete expected[syncJoinLocalName(x)] })
      const write = await confirmJoinMutation({ stage: "local-cleanup", baseline, expected, read: () => deps.local.get(null), write: () => host.removeLocal(keys), stopped: deps.stopped })
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "local-cleanup", write }); baseline = expected
    }
    for (const acct of effect.removedAccounts) {
      stage = "session-cleanup"
      let session = await host.session.get()
      const plan = planAccountSessionRemoval(acct, session)
      if (plan.kind !== "supported" || !agreementObject(session)) return joinUnavailable("inventory")
      for (const action of plan.effects) {
        const expected = joinJson(session)
        if (action.kind === "set") expected[action.key] = action.value
        else delete expected[`${action.key.kind}:${action.key.acct}`]
        const localPreflight = await deps.local.get(null)
        if (!agreementObject(localPreflight) || !sameSyncJson(baseline, localPreflight) || deps.stopped()) return joinUnavailable("stale")
        const write = await confirmJoinMutation({ stage: "session-cleanup", baseline: joinJson(session), expected, read: () => host.session.get(), write: () => action.kind === "set" ? host.session.set({ [action.key]: action.value }) : host.session.remove([action.key]), stopped: deps.stopped })
        if (write.kind !== "resolved" && write.kind !== "rejected") return write
        mutations.push({ stage: "session-cleanup", write }); session = expected
        const current = await deps.local.get(null)
        if (!agreementObject(current) || !sameSyncJson(baseline, current)) return { kind: "unconfirmed", stage: "session-cleanup", write, cause: { kind: "authority" } }
      }
    }
    const debt = effect.debt
    const outbound = debt.outgoing.length > 0 || debt.target.kind !== "existing"
    if (outbound || waiting) {
      stage = "debt"
      const next: SyncJoinCheckpoint = waiting ? { ...waiting, suspended: outbound ? { kind: "outbound", debt } : { kind: "none" } } : { v: checkpoint.v, kind: "sync-join", phase: "outbound", debt }
      const record = transitionSyncJoin(joinJson(baseline[pendingSyncJoinKey]), next)
      const write = await setJoinStage(deps, "debt", baseline, { [pendingSyncJoinKey]: record })
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "debt", write })
      return { kind: "committed", historyId: decodeSyncMeta(debt.target.metadata).id, replication: outbound ? "pending" : "confirmed", mutations }
    }
    stage = "retire"
    const write = await retireJoin(deps, baseline)
    if (write.kind !== "resolved" && write.kind !== "rejected") return write
    mutations.push({ stage: "retire", write })
    return { kind: "committed", historyId: decodeSyncMeta(debt.target.metadata).id, replication: "confirmed", mutations }
  } catch (error) {
    return { kind: "unconfirmed", stage, write: { kind: "resolved" }, cause: { kind: "read-failed", error } }
  }
}
