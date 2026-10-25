import { CONSENT_VERSION, decodeDevice, decodeDocument, decodeSettings, decodeSetup, decodeFilter, decodeSyncMeta, decodeSyncState, decodeStamp,
  documentKey, parseDocumentKey, isAccountKey, isKey, type AccountKey, type Device, type DocumentKey, type SyncMeta } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import { agreementObject, agreementAccess, detachAgreement, prepareCanonicalAgreement, readCanonicalAgreement, parseAgreementChoice,
  type PageFeatureId, type AgreementAccess } from "./consent-agreement"
import type { MigrationContext } from "./legacy-startup"
import { readFirstEditProvenance, prepareFirstEditHistory } from "./first-edit-provenance"
import { removalProgressShards, type ProgressShard } from "./account-removal-execution"
import { sameSyncJson } from "./sync-write-admission"

export const pendingSyncJoinKey = "pending:sync-join"
export type SyncJoinSide = "use-synced" | "use-this-browser"
export type StoredJoinObject = { readonly kind: "absent" } | { readonly kind: "present"; readonly value: JsonObject }
export type JoinDocument = { readonly key: DocumentKey; readonly document: JsonObject }
export type JoinDocumentEffect = { readonly key: DocumentKey; readonly before: StoredJoinObject; readonly after: JsonObject }
export type JoinOutboundDocument = { readonly key: DocumentKey; readonly remoteBefore: StoredJoinObject; readonly selected: JsonObject }
export type JoinTarget = { readonly kind: "existing" | "create"; readonly metadata: JsonObject }
export type JoinOutboundDebt = {
  readonly target: JoinTarget; readonly deviceId: Device["id"]; readonly consent: NonNullable<Device["consent"]>
  readonly selectedDocuments: readonly JoinDocument[]; readonly outgoing: readonly JoinOutboundDocument[]
}
export type JoinAgreementFacts =
  | { readonly kind: "none" }
  | { readonly kind: "first-run"; readonly selected: readonly PageFeatureId[]; readonly access: AgreementAccess;
      readonly consent: NonNullable<Device["consent"]>; readonly context: MigrationContext; readonly reservedUnclaimed: StoredJoinObject }
  | { readonly kind: "upgrade-note"; readonly selected: readonly PageFeatureId[]; readonly percentage: "keep" | "immediate" | "half";
      readonly access: AgreementAccess; readonly consent: NonNullable<Device["consent"]>; readonly context: MigrationContext; readonly reservedUnclaimed: StoredJoinObject }
export type JoinSelectionFacts = {
  readonly localDocuments: readonly JoinDocument[]; readonly remoteDocuments: readonly JoinDocument[]
  readonly decision: { readonly kind: "create-copy" | "proven-never-edited" } | { readonly kind: "explicit"; readonly side: SyncJoinSide }
}
export type JoinMaterialization = {
  readonly kind: "join"; readonly selection: JoinSelectionFacts; readonly agreement: JoinAgreementFacts
  readonly device: { readonly before: StoredJoinObject; readonly after: JsonObject }
  readonly history: { readonly before: StoredJoinObject; readonly after: JsonObject }
  readonly documents: readonly JoinDocumentEffect[]
  readonly clearProgress: readonly { readonly acct: AccountKey; readonly shard: ProgressShard }[]
  readonly removedAccounts: readonly AccountKey[]; readonly debt: JoinOutboundDebt
}
export type JoinCancellation = {
  readonly kind: "cancel"; readonly unfinishedTarget: { readonly kind: "none" } | { readonly kind: "present"; readonly id: SyncMeta["id"] }
  readonly device: { readonly before: StoredJoinObject; readonly after: JsonObject }
  readonly history: { readonly before: StoredJoinObject; readonly after: JsonObject }
}
export type AcceptedJoinEffect = JoinMaterialization | JoinCancellation
export type SuspendedJoin = { readonly kind: "none" } | { readonly kind: "accepted"; readonly effect: AcceptedJoinEffect } | { readonly kind: "outbound"; readonly debt: JoinOutboundDebt }
export type SyncJoinCheckpointV1 = { readonly v: 1; readonly kind: "sync-join" } & (
  | { readonly phase: "choice"; readonly lastJoined: SyncMeta["id"] | null; readonly observedMetadata: JsonObject; readonly suspended: SuspendedJoin }
  | { readonly phase: "accepted"; readonly effect: AcceptedJoinEffect }
  | { readonly phase: "outbound"; readonly debt: JoinOutboundDebt }
  | { readonly phase: "off"; readonly unfinishedTarget: SyncMeta["id"] }
)
export function joinJson(raw: unknown): JsonObject {
  if (!agreementObject(raw)) throw new TypeError("Invalid join JSON")
  return detachAgreement(raw)
}
export function joinStored(records: JsonObject, name: string): StoredJoinObject {
  return Object.hasOwn(records, name) ? { kind: "present", value: joinJson(records[name]) } : { kind: "absent" }
}
export function sameJoinStored(raw: JsonObject, name: string, value: StoredJoinObject): boolean {
  return value.kind === "absent" ? !Object.hasOwn(raw, name) : Object.hasOwn(raw, name) && sameSyncJson(raw[name]!, value.value)
}
export function supportedJoinDocument(key: DocumentKey, raw: JsonObject): boolean {
  const read = key.kind === "settings" ? decodeDocument(raw, decodeSettings) : key.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter)
  return read.kind === "value" || read.kind === "deleted"
}
export function joinDocuments(records: JsonObject): JoinDocument[] {
  const documents: JoinDocument[] = [], generations = new Set<string>()
  for (const name of Object.keys(records).sort()) {
    if (!name.startsWith("doc:")) continue
    const key = parseDocumentKey(name), document = records[name]
    if (!key || documentKey(key) !== name || !agreementObject(document) || !supportedJoinDocument(key, document)) throw new TypeError("Unsupported join inventory")
    const stamp = decodeStamp(document)
    if (generations.has(stamp.gen)) throw new TypeError("Duplicate join generation")
    generations.add(stamp.gen); documents.push({ key, document: joinJson(document) })
  }
  const setups = new Set(documents.filter(x => x.key.kind === "setup").map(x => x.key.kind === "setup" ? x.key.acct : ""))
  if (documents.some(x => x.key.kind === "filter" && x.document.deleted !== true && !setups.has(x.key.acct))) throw new TypeError("Orphan join Filter")
  return documents
}
export function selectJoinDocuments(selection: JoinSelectionFacts, suppress: (key: DocumentKey, raw: JsonObject) => JsonObject): JoinDocument[] {
  const generations = new Map<string, { name: string; document: JsonObject }>()
  for (const member of [...selection.localDocuments, ...selection.remoteDocuments]) {
    const gen = decodeStamp(member.document).gen, name = documentKey(member.key), seen = generations.get(gen)
    if (seen && (seen.name !== name || !sameSyncJson(seen.document, member.document))) throw new TypeError("Conflicting join generation")
    generations.set(gen, { name, document: member.document })
  }
  const local = new Map(selection.localDocuments.map(x => [documentKey(x.key), x])), remote = new Map(selection.remoteDocuments.map(x => [documentKey(x.key), x]))
  const preferred = selection.decision.kind === "create-copy" || selection.decision.kind === "explicit" && selection.decision.side === "use-this-browser" ? local : remote
  const other = preferred === local ? remote : local
  const selected = new Map<string, JoinDocument>()
  const settings = preferred.get("doc:settings") ?? other.get("doc:settings")
  if (settings) selected.set("doc:settings", settings)
  const accounts = new Set([...local.values(), ...remote.values()].flatMap(x => x.key.kind === "setup" ? [x.key.acct] : []))
  for (const acct of [...accounts].sort()) {
    const setupName = `doc:setup:${acct}`, winner = preferred.has(setupName) ? preferred : other
    const chosenSetup = winner.get(setupName)
    if (!chosenSetup) throw new TypeError("Missing join Setup")
    selected.set(setupName, chosenSetup)
    const filters = new Set([...local, ...remote].filter(([, x]) => x.key.kind === "filter" && x.key.acct === acct).map(([name]) => name))
    for (const name of [...filters].sort()) {
      const chosen = winner.get(name), losing = (winner === local ? remote : local).get(name)
      const member = chosen ?? losing
      if (!member) continue
      if (chosenSetup.document.deleted === true) {
        const dead = chosen?.document.deleted === true ? chosen : losing?.document.deleted === true ? losing : undefined
        selected.set(name, dead ?? { key: member.key, document: suppress(member.key, member.document) })
      } else if (chosen) selected.set(name, chosen)
      else if (losing) selected.set(name, losing.document.deleted === true ? losing : { key: losing.key, document: suppress(losing.key, losing.document) })
    }
  }
  for (const [name, member] of [...other, ...preferred]) {
    if (member.key.kind === "filter" && member.document.deleted === true && !accounts.has(member.key.acct)) selected.set(name, member)
  }
  return [...selected].sort(([a], [b]) => a.localeCompare(b)).map(([, x]) => ({ key: x.key, document: joinJson(x.document) }))
}
export function deriveJoinHistory(before: StoredJoinObject, debt: JoinOutboundDebt, realEdit: boolean): JsonObject {
  let raw = before.kind === "present" ? joinJson(before.value) : { joined: null, pushed: {}, status: "off", editedSinceOff: false }
  if (readFirstEditProvenance(before.kind === "present" ? { kind: "present", raw } : { kind: "absent" }).kind === "invalid") throw new TypeError("Invalid join history")
  if (realEdit) {
    const edit = prepareFirstEditHistory({ history: before.kind === "present" ? { kind: "present", raw } : { kind: "absent" }, syncOn: before.kind === "present" && raw.status !== "off" })
    if (edit.kind === "unavailable") throw new TypeError("Join edit provenance unavailable")
    if (edit.kind === "set") raw = joinJson(edit.sync)
  }
  const outgoing = new Set(debt.outgoing.map(x => documentKey(x.key)))
  const pushed = Object.fromEntries(debt.selectedDocuments.filter(x => !outgoing.has(documentKey(x.key))).map(x => [documentKey(x.key), decodeStamp(x.document).gen]))
  const next = { ...raw, joined: decodeSyncMeta(debt.target.metadata).id, pushed, status: debt.outgoing.length || debt.target.kind === "create" ? "joining" : "ok", editedSinceOff: false }
  decodeSyncState(next); return next
}
export function deriveJoinAgreement(input: { selected: readonly JoinDocument[]; facts: JoinAgreementFacts; device: StoredJoinObject; history: StoredJoinObject }) {
  const { facts } = input
  if (facts.kind === "none") {
    if (input.device.kind !== "present") throw new TypeError("Missing join Device")
    const device = decodeDevice(input.device.value)
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") throw new TypeError("Join consent unavailable")
    return { device: { ...input.device.value, syncOn: true }, settings: undefined, clearProgress: false }
  }
  const records: JsonObject = { schema: 1, ...Object.fromEntries(input.selected.map(x => [documentKey(x.key), x.document])) }
  if (input.device.kind === "present") records.device = input.device.value
  if (input.history.kind === "present") records.sync = input.history.value
  if (facts.reservedUnclaimed.kind === "present") records.unclaimed = facts.reservedUnclaimed.value
  const state = readCanonicalAgreement(records)
  if (state.kind !== "canonical-state") throw new TypeError("Join agreement baseline unavailable")
  const choice = facts.kind === "first-run" ? { kind: facts.kind, syncOn: false, selected: facts.selected } as const : { kind: facts.kind, syncOn: false, selected: facts.selected, percentage: facts.percentage } as const
  const parsed = parseAgreementChoice(choice)
  if (parsed.kind !== facts.kind) throw new TypeError("Invalid join agreement choice")
  const plan = prepareCanonicalAgreement({ records, state, choice, access: facts.access, consent: facts.consent, context: facts.context })
  if (plan.kind !== "prepared") throw new TypeError("Join agreement derivation unavailable")
  return { ...plan, device: { ...plan.device, syncOn: true } }
}
function exactKeys(raw: JsonObject, keys: readonly string[]) { return Object.keys(raw).length === keys.length && keys.every(k => Object.hasOwn(raw, k)) }
function stored(raw: unknown): StoredJoinObject | undefined {
  if (!agreementObject(raw)) return
  if (raw.kind === "absent" && exactKeys(raw, ["kind"])) return { kind: "absent" }
  if (raw.kind === "present" && agreementObject(raw.value) && exactKeys(raw, ["kind", "value"])) return { kind: "present", value: joinJson(raw.value) }
}
function key(raw: unknown): DocumentKey | undefined {
  if (!agreementObject(raw)) return
  if (raw.kind !== "settings" && raw.kind !== "setup" && raw.kind !== "filter") return
  const name = raw.kind === "settings" ? "doc:settings" : raw.kind === "setup" ? `doc:setup:${raw.acct}` : `doc:filter:${raw.acct}:${raw.playlist}`
  const parsed = parseDocumentKey(name)
  if (parsed && sameSyncJson(raw, parsed)) return parsed
}
function documents(raw: unknown): JoinDocument[] | undefined {
  if (!Array.isArray(raw)) return
  const records: JsonObject = {}, result: JoinDocument[] = []
  for (const member of raw) {
    if (!agreementObject(member) || !exactKeys(member, ["key", "document"]) || !agreementObject(member.document)) return
    const parsed = key(member.key)
    if (!parsed || Object.hasOwn(records, documentKey(parsed))) return
    records[documentKey(parsed)] = member.document; result.push({ key: parsed, document: joinJson(member.document) })
  }
  joinDocuments(records)
  return result
}
function target(raw: unknown): JoinTarget | undefined {
  if (!agreementObject(raw) || !exactKeys(raw, ["kind", "metadata"]) || raw.kind !== "existing" && raw.kind !== "create" || !agreementObject(raw.metadata)) return
  const meta = decodeSyncMeta(raw.metadata)
  if (meta.v !== 1 || meta.reset === true) return
  if (raw.kind === "create" && !exactKeys(raw.metadata, ["v", "id", "created"])) return
  return { kind: raw.kind, metadata: joinJson(raw.metadata) }
}
function debt(raw: unknown): JoinOutboundDebt | undefined {
  if (!agreementObject(raw) || !exactKeys(raw, ["target", "deviceId", "consent", "selectedDocuments", "outgoing"]) || typeof raw.deviceId !== "string" || !raw.deviceId || !agreementObject(raw.consent)) return
  const device = decodeDevice({ id: raw.deviceId, consent: raw.consent, syncOn: true })
  if (device.consent?.v !== CONSENT_VERSION || !exactKeys(raw.consent, ["v", "at"])) return
  const destination = target(raw.target), selected = documents(raw.selectedDocuments)
  if (!destination || !selected || !Array.isArray(raw.outgoing)) return
  const outgoing: JoinOutboundDocument[] = [], seen = new Set<string>()
  const generations = new Map(selected.map(member => [decodeStamp(member.document).gen, member]))
  for (const member of raw.outgoing) {
    if (!agreementObject(member) || !exactKeys(member, ["key", "remoteBefore", "selected"]) || !agreementObject(member.selected)) return
    const parsed = key(member.key), before = stored(member.remoteBefore)
    if (!parsed || !before || seen.has(documentKey(parsed)) || !selected.some(x => documentKey(x.key) === documentKey(parsed) && sameSyncJson(x.document, member.selected!))) return
    if (before.kind === "present" && (!supportedJoinDocument(parsed, before.value) || sameSyncJson(before.value, member.selected))) return
    if (before.kind === "present") {
      const generation = decodeStamp(before.value).gen, prior = generations.get(generation)
      if (prior && (documentKey(prior.key) !== documentKey(parsed) || !sameSyncJson(prior.document, before.value))) return
      generations.set(generation, { key: parsed, document: before.value })
    }
    if (destination.kind === "create" && before.kind !== "absent") return
    seen.add(documentKey(parsed)); outgoing.push({ key: parsed, remoteBefore: before, selected: joinJson(member.selected) })
  }
  if (destination.kind === "create" && selected.length !== outgoing.length) return
  if (destination.kind === "create" && generations.has(decodeSyncMeta(destination.metadata).id)) return
  return { target: destination, deviceId: device.id, consent: device.consent, selectedDocuments: selected, outgoing }
}
function agreement(raw: unknown): JoinAgreementFacts | undefined {
  if (!agreementObject(raw)) return
  if (raw.kind === "none" && exactKeys(raw, ["kind"])) return { kind: "none" }
  if (raw.kind !== "first-run" && raw.kind !== "upgrade-note" || !agreementAccess(raw.access) || !agreementObject(raw.consent) || !agreementObject(raw.context) || !Array.isArray(raw.selected)) return
  const choice = parseAgreementChoice({ kind: raw.kind, selected: raw.selected, syncOn: false, ...(raw.kind === "upgrade-note" ? { percentage: raw.percentage! } : {}) })
  if (choice.kind !== "first-run" && choice.kind !== "upgrade-note") return
  const reserved = stored(raw.reservedUnclaimed), context = raw.context
  if (!reserved || !exactKeys(raw, raw.kind === "first-run" ? ["kind", "selected", "access", "consent", "context", "reservedUnclaimed"] : ["kind", "selected", "percentage", "access", "consent", "context", "reservedUnclaimed"]) || !exactKeys(context, ["deviceId", "settingsGen", "at", "shortcutId", "platform", "commands"]) || typeof context.deviceId !== "string" || !context.deviceId || typeof context.settingsGen !== "string" || !context.settingsGen || typeof context.at !== "number" || !Number.isSafeInteger(context.at) || context.at < 0 || typeof context.shortcutId !== "string" || !/^[A-Za-z0-9_-]{6}$/.test(context.shortcutId) || !agreementObject(context.platform) || !["chrome", "firefox"].includes(String(context.platform.browser)) || !["macos", "windows", "linux"].includes(String(context.platform.os)) || !Array.isArray(context.commands) || !context.commands.every(x => agreementObject(x) && typeof x.command === "string" && isKey(x.key))) return
  const consent = decodeDevice({ id: context.deviceId, consent: raw.consent, syncOn: false }).consent
  if (consent?.v !== CONSENT_VERSION || !exactKeys(raw.consent, ["v", "at"])) return
  const platform = context.platform
  if (!agreementObject(platform) || (platform.browser !== "chrome" && platform.browser !== "firefox") || (platform.os !== "macos" && platform.os !== "windows" && platform.os !== "linux")) return
  const migration: MigrationContext = { deviceId: context.deviceId, settingsGen: context.settingsGen, at: context.at, shortcutId: context.shortcutId, platform: { browser: platform.browser, os: platform.os }, commands: context.commands.map(x => { if (!agreementObject(x) || typeof x.command !== "string" || !isKey(x.key)) throw new TypeError("Invalid command"); return { command: x.command, key: detachAgreement(x.key) } }) }

  return choice.kind === "first-run" ? { kind: choice.kind, selected: choice.selected, access: detachAgreement(raw.access), consent, context: migration, reservedUnclaimed: reserved } : { kind: choice.kind, selected: choice.selected, percentage: choice.percentage, access: detachAgreement(raw.access), consent, context: migration, reservedUnclaimed: reserved }
}
function effect(raw: unknown): AcceptedJoinEffect | undefined {
  if (!agreementObject(raw) || !agreementObject(raw.device) || !agreementObject(raw.history) || !exactKeys(raw.device, ["before", "after"]) || !exactKeys(raw.history, ["before", "after"]) || !agreementObject(raw.device.after) || !agreementObject(raw.history.after)) return
  const deviceBefore = stored(raw.device.before), historyBefore = stored(raw.history.before)
  if (!deviceBefore || !historyBefore) return
  const deviceAfter = joinJson(raw.device.after), historyAfter = joinJson(raw.history.after)
  decodeDevice(deviceAfter); decodeSyncState(historyAfter)
  if (historyBefore.kind === "present" && readFirstEditProvenance({ kind: "present", raw: historyBefore.value }).kind === "invalid") return
  if (raw.kind === "cancel") {
    if (!exactKeys(raw, ["kind", "unfinishedTarget", "device", "history"]) || deviceBefore.kind !== "present" || historyBefore.kind !== "present" || !agreementObject(raw.unfinishedTarget)) return
    const unfinished = raw.unfinishedTarget
    if (unfinished.kind !== "none" && unfinished.kind !== "present" || !exactKeys(unfinished, unfinished.kind === "none" ? ["kind"] : ["kind", "id"]) || unfinished.kind === "present" && (typeof unfinished.id !== "string" || !unfinished.id)) return
    if (!sameSyncJson(deviceAfter, { ...deviceBefore.value, syncOn: false }) || !sameSyncJson(historyAfter, { ...historyBefore.value, status: "off", editedSinceOff: false })) return
    return { kind: "cancel", unfinishedTarget: unfinished.kind === "none" ? { kind: "none" } : { kind: "present", id: String(unfinished.id) }, device: { before: deviceBefore, after: deviceAfter }, history: { before: historyBefore, after: historyAfter } }
  }
  if (raw.kind !== "join" || !exactKeys(raw, ["kind", "selection", "agreement", "device", "history", "documents", "clearProgress", "removedAccounts", "debt"]) || !agreementObject(raw.selection) || !exactKeys(raw.selection, ["localDocuments", "remoteDocuments", "decision"])) return
  const local = documents(raw.selection.localDocuments), remote = documents(raw.selection.remoteDocuments), decision = raw.selection.decision, facts = agreement(raw.agreement), outgoing = debt(raw.debt)
  if (!local || !remote || !facts || !outgoing || !agreementObject(decision)) return
  let selection: JoinSelectionFacts
  if (decision.kind === "explicit" && exactKeys(decision, ["kind", "side"]) && (decision.side === "use-synced" || decision.side === "use-this-browser")) selection = { localDocuments: local, remoteDocuments: remote, decision: { kind: decision.kind, side: decision.side } }
  else if ((decision.kind === "create-copy" || decision.kind === "proven-never-edited") && exactKeys(decision, ["kind"])) selection = { localDocuments: local, remoteDocuments: remote, decision: { kind: decision.kind } }
  else return
  if (selection.decision.kind === "create-copy" && (remote.length || outgoing.target.kind !== "create") || selection.decision.kind !== "create-copy" && outgoing.target.kind !== "existing") return
  if (selection.decision.kind === "proven-never-edited" && (historyBefore.kind !== "present" || historyBefore.value.everEdited !== false)) return
  if (!Array.isArray(raw.documents)) return
  const effects: JoinDocumentEffect[] = [], names = new Set<string>(), allGenerations = new Set([...local, ...remote].map(x => decodeStamp(x.document).gen))
  const targetId = decodeSyncMeta(outgoing.target.metadata).id
  if (outgoing.target.kind === "create" && (allGenerations.has(targetId) || historyBefore.kind === "present" && historyBefore.value.joined === targetId)) return
  allGenerations.add(targetId)
  if (historyBefore.kind === "present" && typeof historyBefore.value.joined === "string") allGenerations.add(historyBefore.value.joined)
  for (const member of raw.documents) {
    if (!agreementObject(member) || !exactKeys(member, ["key", "before", "after"]) || !agreementObject(member.after)) return
    const parsed = key(member.key), before = stored(member.before)
    if (!parsed || !before || names.has(documentKey(parsed)) || !supportedJoinDocument(parsed, member.after)) return
    const original = local.find(x => documentKey(x.key) === documentKey(parsed))
    if (original ? before.kind !== "present" || !sameSyncJson(before.value, original.document) : before.kind !== "absent") return
    names.add(documentKey(parsed)); effects.push({ key: parsed, before, after: joinJson(member.after) })
  }
  const stampTimes = new Set<number>()
  const selected = selectJoinDocuments(selection, (parsed, original) => {
    const fixed = effects.find(x => documentKey(x.key) === documentKey(parsed))?.after
    if (!fixed) throw new TypeError("Missing suppression")
    const stamp = decodeStamp(fixed), expected: JsonObject = { ...original, ...stamp, deleted: true }
    delete expected.data
    if (fixed.v !== 1 || stamp.by !== outgoing.deviceId || allGenerations.has(stamp.gen) || !sameSyncJson(expected, fixed)) throw new TypeError("Invalid suppression")
    allGenerations.add(stamp.gen); stampTimes.add(stamp.at); return fixed
  })
  const overlay = deriveJoinAgreement({ selected, facts, device: deviceBefore, history: historyBefore })
  let realEdit = false
  if (overlay.settings) {
    const fixed = effects.find(x => x.key.kind === "settings")?.after
    if (!fixed) return
    const stamp = decodeStamp(fixed), prior = selected.find(x => x.key.kind === "settings")?.document ?? {}
    const expected: JsonObject = { ...prior, ...stamp, v: 1, data: overlay.settings }; delete expected.deleted
    if (stamp.by !== outgoing.deviceId || facts.kind === "none" || stamp.at !== facts.consent.at || allGenerations.has(stamp.gen) || !sameSyncJson(fixed, expected)) return
    allGenerations.add(stamp.gen); realEdit = true
    const index = selected.findIndex(x => x.key.kind === "settings")
    if (index < 0) selected.push({ key: { kind: "settings" }, document: fixed }); else selected[index] = { key: { kind: "settings" }, document: fixed }
    selected.sort((a,b) => documentKey(a.key).localeCompare(documentKey(b.key)))
  }
  if (stampTimes.size > 1 || facts.kind !== "none" && [...stampTimes].some(x => x !== facts.consent.at)) return
  const localSettings = local.find(x => x.key.kind === "settings")?.document
  const finalSettings = selected.find(x => x.key.kind === "settings")?.document
  const clearsProgress = (localSettings && decodeDocument(localSettings, decodeSettings).kind === "value" && decodeSettings(localSettings.data).autoAdd.on === true && finalSettings && decodeDocument(finalSettings, decodeSettings).kind === "value" && decodeSettings(finalSettings.data).autoAdd.on === false) || overlay.clearProgress
  const removed = selected.filter(x => x.key.kind === "setup" && x.document.deleted === true).flatMap(x => x.key.kind === "setup" ? [x.key.acct] : [])
  const expectedDevice = joinJson(overlay.device)
  if (removed.some(x => x === decodeDevice(expectedDevice).lastAccount)) expectedDevice.lastAccount = null
  if (!sameSyncJson(expectedDevice, deviceAfter) || decodeDevice(deviceAfter).id !== outgoing.deviceId || !sameSyncJson(deviceAfter.consent!, outgoing.consent)) return
  if (selected.length !== effects.length || !selected.every(x => effects.some(y => documentKey(y.key) === documentKey(x.key) && sameSyncJson(x.document, y.after)))) return
  if (!sameSyncJson(joinJson({ list: selected }), joinJson({ list: outgoing.selectedDocuments }))) return
  const expectedOutgoing = selected.filter(x => { const prior = remote.find(y => documentKey(y.key) === documentKey(x.key)); return !prior || !sameSyncJson(prior.document, x.document) }).map(x => ({ key: x.key, remoteBefore: remote.some(y => documentKey(y.key) === documentKey(x.key)) ? { kind: "present", value: remote.find(y => documentKey(y.key) === documentKey(x.key))!.document } : { kind: "absent" }, selected: x.document }))
  if (!sameSyncJson(joinJson({ list: expectedOutgoing }), joinJson({ list: outgoing.outgoing })) || !sameSyncJson(deriveJoinHistory(historyBefore, outgoing, realEdit), historyAfter)) return
  if (!Array.isArray(raw.removedAccounts) || !sameSyncJson(raw.removedAccounts, removed) || !Array.isArray(raw.clearProgress)) return
  const clearProgress: { acct: AccountKey; shard: ProgressShard }[] = [], cleared = new Set<string>()
  for (const member of raw.clearProgress) {
    if (!agreementObject(member) || !exactKeys(member, ["acct", "shard"]) || !isAccountKey(member.acct) || typeof member.shard !== "number" || !removalProgressShards.some(x => x === member.shard) || removed.includes(member.acct) || !clearsProgress || cleared.has(`${member.acct}:${member.shard}`)) return
    const shard = removalProgressShards.find(x => x === member.shard)!
    cleared.add(`${member.acct}:${shard}`); clearProgress.push({ acct: member.acct, shard })
  }
  return { kind: "join", selection, agreement: facts, device: { before: deviceBefore, after: deviceAfter }, history: { before: historyBefore, after: historyAfter }, documents: effects, clearProgress, removedAccounts: removed, debt: outgoing }
}
export function readSyncJoinCheckpoint(raw: unknown): { readonly kind: "absent" | "invalid" } | { readonly kind: "newer-version"; readonly version: number } | { readonly kind: "valid"; readonly checkpoint: SyncJoinCheckpointV1; readonly raw: JsonObject } {
  if (raw === undefined) return { kind: "absent" }
  if (!agreementObject(raw) || typeof raw.v !== "number" || !Number.isSafeInteger(raw.v)) return { kind: "invalid" }
  if (raw.v > 1) return { kind: "newer-version", version: raw.v }
  if (raw.v !== 1 || raw.kind !== "sync-join") return { kind: "invalid" }
  try {
    let checkpoint: SyncJoinCheckpointV1 | undefined
    const forbidden = ["lastJoined", "observedMetadata", "suspended", "effect", "debt", "unfinishedTarget"]
    const allowed = raw.phase === "choice" ? ["lastJoined", "observedMetadata", "suspended"] : raw.phase === "accepted" ? ["effect"] : raw.phase === "outbound" ? ["debt"] : raw.phase === "off" ? ["unfinishedTarget"] : []
    if (!allowed.length || forbidden.some(k => !allowed.includes(k) && Object.hasOwn(raw, k))) return { kind: "invalid" }
    if (raw.phase === "off" && typeof raw.unfinishedTarget === "string" && raw.unfinishedTarget) checkpoint = { v: 1, kind: "sync-join", phase: "off", unfinishedTarget: raw.unfinishedTarget }
    if (raw.phase === "accepted") { const fixed = effect(raw.effect); if (fixed) checkpoint = { v: 1, kind: "sync-join", phase: "accepted", effect: fixed } }
    if (raw.phase === "outbound") { const fixed = debt(raw.debt); if (fixed) checkpoint = { v: 1, kind: "sync-join", phase: "outbound", debt: fixed } }
    if (raw.phase === "choice" && (raw.lastJoined === null || typeof raw.lastJoined === "string" && raw.lastJoined) && agreementObject(raw.observedMetadata) && agreementObject(raw.suspended)) {
      const meta = decodeSyncMeta(raw.observedMetadata), suspended = raw.suspended
      if (meta.v !== 1 || meta.reset === true) return { kind: "invalid" }
      let fixed: SuspendedJoin | undefined
      if (suspended.kind === "none" && exactKeys(suspended, ["kind"])) fixed = { kind: "none" }
      if (suspended.kind === "accepted" && exactKeys(suspended, ["kind", "effect"])) { const value = effect(suspended.effect); if (value) fixed = { kind: "accepted", effect: value } }
      if (suspended.kind === "outbound" && exactKeys(suspended, ["kind", "debt"])) { const value = debt(suspended.debt); if (value) fixed = { kind: "outbound", debt: value } }
      if (fixed) checkpoint = { v: 1, kind: "sync-join", phase: "choice", lastJoined: raw.lastJoined, observedMetadata: joinJson(raw.observedMetadata), suspended: fixed }
    }
    return checkpoint ? { kind: "valid", checkpoint: detachAgreement(checkpoint), raw: joinJson(raw) } : { kind: "invalid" }
  } catch { return { kind: "invalid" } }
}
export function transitionSyncJoin(raw: JsonObject | undefined, checkpoint: SyncJoinCheckpointV1): JsonObject {
  const next = { ...raw }
  for (const k of ["phase", "lastJoined", "observedMetadata", "suspended", "effect", "debt", "unfinishedTarget"]) delete next[k]
  return { ...next, ...joinJson(checkpoint) }
}
