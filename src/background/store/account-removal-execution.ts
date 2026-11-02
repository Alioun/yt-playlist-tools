import { prepareFirstEditHistory, readFirstEditProvenance } from "./first-edit-provenance"
import {
  CONSENT_VERSION, DOCUMENT_VERSION, DecodeError, decodeDevice, decodeDocument, decodeFilter, decodeLastAccount, decodeSetup, LAST_ACCOUNT_KEY,
  documentKey, parseDocumentKey, isAccountKey, isPlaylistId, PROGRESS_SHARDS, type AccountKey, type ProgressShard, type Device, type DocumentKey, type Filter, type Tombstone
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import type { LocalWriteStorage, SyncStorage } from "./local-filter-writer"
import { planSetupRemoval } from "./accounts"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord, type SyncWritePlan } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
import { planAccountSessionRemoval, type RemovalSessionCollection, type RemovalSessionKey } from "./account-removal-session"
import { acceptedRemovalLedger, permitsExactRemoval, removalRetirementLedger, selectedRetiringRemoval, type ExactRemovalPermit } from "./consent-recovery"
import { readConsentDevice } from "./consent-withdrawal"

export type UiOrigin = Extract<Origin, { kind: "ui" }>
export type RemovalConfirmation = { readonly kind: "account-removal-confirmation" }
export type RemovalScope = { readonly kind: "this-browser" } | { readonly kind: "syncing-browsers"; readonly joined: string }
export type RemovalStage = "prepare" | "accept" | "documents" | "local-cleanup" | "session-cleanup" | "last-account" | "retire"
export type RemovalUnavailableReason = "consent-held" | "startup" | "newer-layout" | "sync-writer-required" | "stale" | "disposed" |
  "removal-host" | "inventory" | "session-layout" | "pending-removal"
export type RemovalRefusal = { readonly kind: "result"; readonly result: Extract<ChangeResult, { refused: string }> }
export type RemovalUnavailable = { readonly kind: "unavailable"; readonly reason: RemovalUnavailableReason }
export type RemovalPreparation =
  | { readonly kind: "unchanged" }
  | { readonly kind: "confirmation-required"; readonly confirmation: RemovalConfirmation; readonly acct: AccountKey; readonly label: string; readonly scope: RemovalScope }
  | RemovalRefusal | RemovalUnavailable | { readonly kind: "failed"; readonly stage: "prepare"; readonly error: unknown }
export type RemovalResult =
  | { readonly kind: "committed" }
  | { readonly kind: "unchanged" }
  | RemovalRefusal | RemovalUnavailable
  | { readonly kind: "failed"; readonly stage: RemovalStage; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly stage: RemovalStage;
    readonly mutation: { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown };
    readonly cause: { readonly kind: "authority" | "readback" } | { readonly kind: "read-failed"; readonly error: unknown } }

export type AccountDocumentKey = Extract<DocumentKey, { kind: "setup" | "filter" }>
export type { ProgressShard } from "../../shared/model"
export const removalProgressShards = PROGRESS_SHARDS
export const pendingAccountRemovalKey = "pending:account-removal"
export type RemovalLocalKey =
  | { readonly kind: "document"; readonly key: AccountDocumentKey }
  | { readonly kind: "cache"; readonly acct: AccountKey }
  | { readonly kind: "progress"; readonly acct: AccountKey; readonly shard: ProgressShard }
  | { readonly kind: "continuation" }
type RemovalPorts = {
  removeLocal(keys: readonly RemovalLocalKey[]): Promise<void>
  readonly session: {
    get(): Promise<Readonly<Record<string, unknown>>>
    set(items: Readonly<Partial<Record<RemovalSessionCollection, JsonValue>>>): Promise<void>
    remove(keys: readonly RemovalSessionKey[]): Promise<void>
  }
}
// Only nativeAccountRemovalHost builds "native"; native configuration refuses caller-supplied fixtures.
export type AccountRemovalHost =
  | { readonly kind: "unavailable" }
  | { readonly kind: "fixture" } & RemovalPorts
  | { readonly kind: "native" } & RemovalPorts
export function nativeAccountRemovalHost(ports: { removeLocal(names: readonly string[]): Promise<void>; readonly session: RemovalPorts["session"] }): AccountRemovalHost {
  return { kind: "native", removeLocal: keys => ports.removeLocal(keys.map(removalLocalName)), session: ports.session }
}

type Before<K extends AccountDocumentKey> = { readonly key: K; readonly before: JsonObject }
type After<K extends AccountDocumentKey> = Before<K> & { readonly after: JsonObject & Tombstone }
type SetupKey = Extract<AccountDocumentKey, { kind: "setup" }>
type FilterKey = Extract<AccountDocumentKey, { kind: "filter" }>
type BeforeDocuments = readonly [Before<SetupKey>, ...Before<FilterKey>[]]
type AfterDocuments = readonly [After<SetupKey>, ...After<FilterKey>[]]
type RemovalIdentity = { readonly v: 1; readonly kind: "account-remove"; readonly acct: AccountKey;
  readonly deviceId: string; readonly consent: NonNullable<Device["consent"]> }
export type PendingAccountRemoval = RemovalIdentity & (
  | { readonly mode: "local"; readonly documents: BeforeDocuments }
  | { readonly mode: "synced"; readonly joined: string; readonly documents: AfterDocuments }
)
export type RemovalCapture = {
  readonly acct: AccountKey; readonly label: string; readonly scope: RemovalScope; readonly deviceId: string;
  readonly consent: JsonObject; readonly joined: string | null; readonly documents: BeforeDocuments
}
type Authority = {
  readonly kind: "ready"; readonly device: Device; readonly rawDevice: JsonObject;
  readonly history?: { readonly raw: JsonObject; readonly editedSinceOff: boolean; readonly joined: string | null }
}
export type AccountRemovalDependencies = {
  readonly recoveryPermit?: ExactRemovalPermit
  readonly local: LocalWriteStorage; readonly sync: Pick<SyncStorage, "get">; readonly host: AccountRemovalHost;
  readonly authority: (records: Readonly<Record<string, unknown>>) => Authority | { readonly kind: "unavailable"; readonly reason: RemovalUnavailableReason | "account-context" };
  readonly repairHistory: (raw: JsonObject, repairs: readonly SyncDocumentRecord[]) => JsonObject | undefined;
  readonly isStopped: () => boolean; readonly now: () => number; readonly generation: () => string
}
function object(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
function copy(raw: JsonObject): JsonObject {
  const value: unknown = JSON.parse(JSON.stringify(raw))
  if (!object(value)) throw new TypeError("Invalid removal snapshot")
  return value
}
function unavailable(reason: RemovalUnavailableReason): RemovalUnavailable { return { kind: "unavailable", reason } }
function accountDocumentKey(raw: unknown): AccountDocumentKey | undefined {
  if (!object(raw) || !isAccountKey(raw.acct)) return
  if (raw.kind === "setup" && Object.keys(raw).length === 2) return { kind: "setup", acct: raw.acct }
  if (raw.kind === "filter" && isPlaylistId(raw.playlist) && Object.keys(raw).length === 3) return { kind: "filter", acct: raw.acct, playlist: raw.playlist }
}
function captureJson(capture: RemovalCapture): JsonObject {
  return { acct: capture.acct, label: capture.label, scope: capture.scope, deviceId: capture.deviceId, consent: capture.consent, joined: capture.joined,
    documents: capture.documents.map(member => ({ key: member.key, before: member.before })) }
}
function supported(key: AccountDocumentKey, raw: JsonObject) {
  return key.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter)
}

export function accountRemovalLocalName(key: RemovalLocalKey, acct: AccountKey): string {
  if (!object(key) || !isAccountKey(acct)) throw new TypeError("Invalid account removal key")
  switch (key.kind) {
    case "continuation":
      if (Object.keys(key).length !== 1) break
      return pendingAccountRemovalKey
    case "document": {
      if (Object.keys(key).length !== 2) break
      const parsed = parseDocumentKey(documentKey(key.key))
      if (!parsed || parsed.kind === "settings" || parsed.acct !== acct || !sameSyncJson(key.key, parsed)) break
      return documentKey(parsed)
    }
    case "cache": if (key.acct === acct && Object.keys(key).length === 2) return `cache:${acct}`; break
    case "progress": if (key.acct === acct && removalProgressShards.includes(key.shard) && Object.keys(key).length === 3) return `progress:${acct}:${key.shard}`; break
    default: break
  }
  throw new TypeError("Removal key escaped its accepted account")
}
function removalLocalName(key: RemovalLocalKey): string {
  if (key.kind !== "continuation") return accountRemovalLocalName(key, key.kind === "document" ? key.key.acct : key.acct)
  if (!object(key) || Object.keys(key).length !== 1) throw new TypeError("Invalid account removal key")
  return pendingAccountRemovalKey
}

export function parsePendingAccountRemoval(raw: unknown): { readonly record: PendingAccountRemoval; readonly raw: JsonObject } | undefined {
  if (!object(raw) || raw.v !== 1 || raw.kind !== "account-remove" || !isAccountKey(raw.acct) ||
    typeof raw.deviceId !== "string" || raw.deviceId.length === 0 || !object(raw.consent) ||
    raw.consent.v !== CONSENT_VERSION || typeof raw.consent.at !== "number" || !Number.isSafeInteger(raw.consent.at) || raw.consent.at < 0 ||
    !Array.isArray(raw.documents) || raw.documents.length === 0 ||
    (raw.mode !== "local" && raw.mode !== "synced") ||
    (raw.mode === "local" ? Object.hasOwn(raw, "joined") : typeof raw.joined !== "string" || raw.joined.length === 0)) return
  const before: Before<FilterKey>[] = [], after: After<FilterKey>[] = [], names = new Set<string>(), generations = new Set<string>()
  let firstBefore: Before<SetupKey> | undefined, firstAfter: After<SetupKey> | undefined
  try {
    for (const [index, member] of raw.documents.entries()) {
      if (!object(member) || !object(member.key) || !object(member.before) ||
        Object.keys(member).some(key => !["key", "before", ...(raw.mode === "synced" ? ["after"] : [])].includes(key))) return
      const key = accountDocumentKey(member.key)
      if (!key || key.acct !== raw.acct || !sameSyncJson(key, member.key) ||
        (index === 0 ? key.kind !== "setup" : key.kind !== "filter")) return
      const name = documentKey(key), decoded = supported(key, member.before)
      if (names.has(name) || decoded.kind !== "value" && (index === 0 || decoded.kind !== "deleted")) return
      names.add(name)
      if (key.kind === "setup") firstBefore = { key, before: member.before }
      else before.push({ key, before: member.before })
      if (raw.mode === "local") continue
      if (!object(member.after)) return
      const tombstone = supported(key, member.after)
      if (tombstone.kind !== "deleted" || Object.hasOwn(member.after, "data") || tombstone.document.by !== raw.deviceId ||
        tombstone.document.gen === member.before.gen || generations.has(tombstone.document.gen)) return
      generations.add(tombstone.document.gen)
      const expected: JsonObject = { ...member.before, v: DOCUMENT_VERSION, gen: tombstone.document.gen, at: tombstone.document.at, by: raw.deviceId, deleted: true }
      delete expected.data
      if (!sameSyncJson(expected, member.after)) return
      const fixed: JsonObject & Tombstone = { ...member.after, ...tombstone.document }
      if (key.kind === "setup") firstAfter = { key, before: member.before, after: fixed }
      else after.push({ key, before: member.before, after: fixed })
    }
  } catch (error) { if (error instanceof DecodeError || error instanceof TypeError) return; throw error }
  const identity: RemovalIdentity = { v: 1, kind: "account-remove", acct: raw.acct, deviceId: raw.deviceId, consent: { v: raw.consent.v, at: raw.consent.at } }
  if (raw.mode === "local" && firstBefore) return { record: { ...identity, mode: "local", documents: [firstBefore, ...before] }, raw }
  if (raw.mode === "synced" && typeof raw.joined === "string" && firstAfter) return { record: { ...identity, mode: "synced", joined: raw.joined, documents: [firstAfter, ...after] }, raw }
}

function filterNames(local: JsonObject, acct: AccountKey): string[] {
  return Object.keys(local).filter(name => name === `doc:filter:${acct}` || name.startsWith(`doc:filter:${acct}:`)).sort()
}
function unsupportedAccountKeys(local: JsonObject, acct: AccountKey): boolean {
  const progress = new Set(removalProgressShards.map(shard => `progress:${acct}:${shard}`))
  return Object.keys(local).some(name => name.startsWith(`doc:setup:${acct}:`) || name.startsWith(`progress:${acct}:`) && !progress.has(name))
}

export function captureAccountRemoval(records: unknown, acct: AccountKey, ready: Authority):
  { readonly kind: "captured"; readonly capture: RemovalCapture } | { readonly kind: "unchanged" } | RemovalUnavailable | RemovalRefusal {
  if (!object(records) || !isAccountKey(acct) || !object(ready.rawDevice.consent)) return unavailable("inventory")
  if (readFirstEditProvenance(Object.hasOwn(records, "sync") ? { kind: "present", raw: records.sync } : { kind: "absent" }).kind === "invalid") return unavailable("sync-writer-required")
  if (Object.hasOwn(records, pendingAccountRemovalKey)) return unavailable("pending-removal")
  const name = documentKey({ kind: "setup", acct }), rawSetup = records[name]
  if (unsupportedAccountKeys(records, acct)) return unavailable("inventory")
  const physicalFilters = filterNames(records, acct)
  if (!Object.hasOwn(records, name)) {
    const dependencies = Object.keys(records).some(key => key === `cache:${acct}` || key.startsWith(`progress:${acct}:`))
    return physicalFilters.length || dependencies || decodeLastAccount(records) === acct ? unavailable("inventory") : { kind: "unchanged" }
  }
  if (!object(rawSetup)) return unavailable("inventory")
  try {
    const setup = decodeDocument(rawSetup, decodeSetup)
    if (setup.kind === "newer-version") return { kind: "result", result: { refused: "update-needed" } }
    if (setup.kind !== "value") return unavailable("inventory")
    const filters: Record<string, Filter> = {}, documents: Before<FilterKey>[] = []
    for (const name of physicalFilters) {
      const key = parseDocumentKey(name), raw = records[name]
      if (!key || key.kind !== "filter" || key.acct !== acct || documentKey(key) !== name || !object(raw)) return unavailable("inventory")
      const decoded = decodeDocument(raw, decodeFilter)
      if (decoded.kind === "newer-version") return { kind: "result", result: { refused: "update-needed" } }
      if (decoded.kind !== "value" && decoded.kind !== "deleted") return unavailable("inventory")
      if (decoded.kind === "value") Object.defineProperty(filters, key.playlist, { value: decoded.document.data, enumerable: true })
      documents.push({ key, before: copy(raw) })
    }
    const plan = planSetupRemoval({ acct, current: { kind: "present", bodies: { setup: setup.document.data, filters } } })
    if (plan.kind !== "remove") return unavailable("inventory")
    const joined = ready.history?.joined
    if (ready.device.syncOn && typeof joined !== "string") return unavailable("sync-writer-required")
    return { kind: "captured", capture: { acct, label: setup.document.data.label?.name ?? "",
      scope: ready.device.syncOn && typeof joined === "string" ? { kind: "syncing-browsers", joined } : { kind: "this-browser" },
      deviceId: ready.device.id, consent: copy(ready.rawDevice.consent), joined: ready.history?.joined ?? null,
      documents: [{ key: { kind: "setup", acct }, before: copy(rawSetup) }, ...documents] } }
  } catch (error) { if (error instanceof DecodeError) return unavailable("inventory"); throw error }
}

export async function prepareAccountRemovalCapture(deps: AccountRemovalDependencies, acct: AccountKey): Promise<
  { readonly kind: "captured"; readonly capture: RemovalCapture } | Exclude<RemovalPreparation, { kind: "confirmation-required" }>> {
  try {
    if (deps.isStopped()) return unavailable("disposed")
    const input = await deps.local.get(null)
    if (!object(input)) return unavailable("inventory")
    const records = copy(input), ready = deps.authority(records)
    if (ready.kind !== "ready") return unavailable(ready.reason === "account-context" ? "inventory" : ready.reason)
    if (deps.host.kind === "unavailable") return unavailable("removal-host")
    const inventory = captureAccountRemoval(records, acct, ready)
    if (inventory.kind !== "captured" && inventory.kind !== "unchanged") return inventory
    const session = await deps.host.session.get(), plan = planAccountSessionRemoval(acct, session)
    if (plan.kind !== "supported") return unavailable("session-layout")
    const latest = await deps.local.get(null)
    if (!object(records) || !object(latest) || !sameSyncJson(records, latest) || deps.isStopped()) return unavailable("stale")
    if (inventory.kind === "unchanged" && plan.effects.length) return unavailable("inventory")
    return inventory
  } catch (error) { return { kind: "failed", stage: "prepare", error } }
}

function matchesAuthority(deps: AccountRemovalDependencies, local: JsonObject, record: PendingAccountRemoval, raw: JsonObject, ordinaryGeneration?: number): boolean {
  const ready = deps.authority(local)
  const control = ordinaryGeneration === undefined ? undefined : readConsentDevice(local)
  const ordinary = !Object.hasOwn(local, "consent:state") || control?.kind === "supported" && control.control?.state.kind === "agreed" && control.control.generation === ordinaryGeneration
  return readFirstEditProvenance(Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" }).kind !== "invalid" &&
    ready.kind === "ready" && ready.device.id === record.deviceId && object(ready.rawDevice.consent) &&
    object(raw.consent) && (sameSyncJson(ready.rawDevice.consent, raw.consent) && ordinary || permitsExactRemoval(deps.recoveryPermit, local, raw)) &&
    (record.mode === "local" ? !ready.device.syncOn : ready.device.syncOn && ready.history?.joined === record.joined)
}
function matchesDocuments(local: JsonObject, record: PendingAccountRemoval): boolean {
  const names = new Set(record.documents.map(member => documentKey(member.key)))
  if (unsupportedAccountKeys(local, record.acct) || filterNames(local, record.acct).some(name => !names.has(name))) return false
  return record.documents.every(member => {
    const name = documentKey(member.key), value = local[name]
    if (!Object.hasOwn(local, name)) return record.mode === "local"
    return object(value) && (sameSyncJson(value, member.before) || record.mode === "synced" && "after" in member && object(member.after) && sameSyncJson(value, member.after))
  })
}

export async function executeAccountRemoval(deps: AccountRemovalDependencies, capture: RemovalCapture, expectedRecords?: JsonObject): Promise<RemovalResult> {
  let stage: RemovalStage = "prepare"
  try {
    if (deps.host.kind === "unavailable") return unavailable("removal-host")
    const input = await deps.local.get(null)
    if (!object(input)) return unavailable("inventory")
    const records = copy(input), ready = deps.authority(records)
    if (expectedRecords && !sameSyncJson(records, expectedRecords)) return unavailable("stale")
    if (ready.kind !== "ready") return unavailable(ready.reason === "account-context" ? "inventory" : ready.reason)
    const current = captureAccountRemoval(records, capture.acct, ready)
    if (current.kind !== "captured" || !sameSyncJson(captureJson(capture), captureJson(current.capture)) || deps.isStopped()) return unavailable("stale")
    const sessionInput = await deps.host.session.get()
    const session = object(sessionInput) ? copy(sessionInput) : sessionInput
    const sessionPlan = planAccountSessionRemoval(capture.acct, session)
    if (sessionPlan.kind !== "supported") return unavailable("session-layout")
    if (!object(records) || !object(session)) return unavailable("inventory")
    const identity = { v: 1, kind: "account-remove", acct: capture.acct, deviceId: capture.deviceId, consent: capture.consent } as const
    let raw: JsonObject
    if (capture.scope.kind === "this-browser") raw = { ...identity, mode: "local", documents: capture.documents.map(member => ({ key: member.key, before: member.before })) }
    else {
      const at = deps.now()
      const documents = capture.documents.map(member => {
        const after: JsonObject = { ...member.before, v: DOCUMENT_VERSION, gen: deps.generation(), at, by: capture.deviceId, deleted: true }
        delete after.data
        return { key: member.key, before: member.before, after }
      })
      const [first, ...rest] = documents
      if (!first) return unavailable("inventory")
      const remote = await deps.sync.get()
      const admission = planAccountDocumentWrite({ local: records, sync: remote, intent: { kind: "changed-batch", documents: [
        { key: first.key, document: first.after }, ...rest.map(member => ({ key: member.key, document: member.after }))
      ] } })
      if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
      if (admission.kind !== "planned") return unavailable("sync-writer-required")
      raw = { ...identity, mode: "synced", joined: capture.scope.joined, documents }
    }
    const parsed = parsePendingAccountRemoval(raw)
    if (!parsed) return { kind: "result", result: { refused: "invalid" } }
    stage = "accept"
    return await complete(deps, parsed, copy(records), copy(session), true)
  } catch (error) { return { kind: "failed", stage, error } }
}

export async function resumePendingAccountRemoval(deps: AccountRemovalDependencies): Promise<RemovalResult> {
  try {
    if (deps.isStopped()) return unavailable("disposed")
    const localInput = await deps.local.get(null)
    if (!object(localInput)) return unavailable("inventory")
    const local = copy(localInput)
    const terminal = selectedRetiringRemoval(deps.recoveryPermit, local)
    if (!Object.hasOwn(local, pendingAccountRemovalKey) && !terminal) return { kind: "unchanged" }
    if (deps.host.kind === "unavailable") return unavailable("removal-host")
    const parsed = parsePendingAccountRemoval(local[pendingAccountRemovalKey] ?? terminal)
    if (!parsed || !matchesAuthority(deps, local, parsed.record, parsed.raw) || !matchesDocuments(local, parsed.record)) return unavailable("pending-removal")
    const session = await deps.host.session.get()
    if (!object(session) || planAccountSessionRemoval(parsed.record.acct, session).kind !== "supported") return unavailable("session-layout")
    return await complete(deps, parsed, copy(local), copy(session), false)
  } catch (error) { return { kind: "failed", stage: "prepare", error } }
}

async function complete(deps: AccountRemovalDependencies, parsed: NonNullable<ReturnType<typeof parsePendingAccountRemoval>>,
  initial: JsonObject, initialSession: JsonObject, accepting: boolean): Promise<RemovalResult> {
  if (deps.host.kind === "unavailable") return unavailable("removal-host")
  const host = deps.host, { record, raw } = parsed
  const initialControl = accepting ? readConsentDevice(initial) : undefined
  const ordinaryGeneration = initialControl?.kind === "supported" && initialControl.control?.state.kind === "agreed" ? initialControl.control.generation : undefined
  const terminal = selectedRetiringRemoval(deps.recoveryPermit, initial)
  let local = initial, session = initialSession, stage: RemovalStage = terminal ? "retire" : accepting ? "accept" : "documents"
  let accepted = !accepting
  type Problem = Exclude<RemovalResult, { kind: "committed" | "unchanged" }>
  async function inspect(expectedLocal: JsonObject, expectedSession: JsonObject, mutation: Extract<RemovalResult, { kind: "unconfirmed" }>["mutation"]): Promise<Problem | undefined> {
    let observedLocal, observedSession
    try {
      const localInput = await deps.local.get(null)
      observedLocal = object(localInput) ? copy(localInput) : localInput
      if (!object(observedLocal)) return { kind: "unconfirmed", stage, mutation, cause: { kind: "readback" } }
      if (!matchesAuthority(deps, observedLocal, record, raw, ordinaryGeneration) || !matchesDocuments(observedLocal, record) ||
        accepted && stage !== "retire" && (!object(observedLocal[pendingAccountRemovalKey]) || !sameSyncJson(raw, observedLocal[pendingAccountRemovalKey]))) {
        return { kind: "unconfirmed", stage, mutation, cause: { kind: "authority" } }
      }
      if (!sameSyncJson(expectedLocal, observedLocal) && !sameSyncJson(local, observedLocal)) return { kind: "unconfirmed", stage, mutation, cause: { kind: "readback" } }
      const sessionInput = await host.session.get()
      observedSession = object(sessionInput) ? copy(sessionInput) : sessionInput
      const currentLocal = await deps.local.get(null)
      observedLocal = object(currentLocal) ? copy(currentLocal) : currentLocal
    } catch (error) {
      return { kind: "unconfirmed", stage, mutation, cause: { kind: "read-failed", error } }
    }
    if (!object(observedLocal) || !object(observedSession)) return { kind: "unconfirmed", stage, mutation, cause: { kind: "readback" } }
    if (!matchesAuthority(deps, observedLocal, record, raw, ordinaryGeneration) || !matchesDocuments(observedLocal, record) ||
      accepted && stage !== "retire" && (!object(observedLocal[pendingAccountRemovalKey]) || !sameSyncJson(raw, observedLocal[pendingAccountRemovalKey]))) {
      return { kind: "unconfirmed", stage, mutation, cause: { kind: "authority" } }
    }
    if (sameSyncJson(expectedLocal, observedLocal) && sameSyncJson(expectedSession, observedSession)) return
    if (mutation.kind === "rejected" && sameSyncJson(local, observedLocal) && sameSyncJson(session, observedSession)) return { kind: "failed", stage, error: mutation.error }
    return { kind: "unconfirmed", stage, mutation, cause: { kind: "readback" } }
  }
  async function effect(nextLocal: JsonObject, nextSession: JsonObject,
    operation: { kind: "local-set"; items: JsonObject } | { kind: "local-remove"; key: RemovalLocalKey } |
      { kind: "session-set"; key: RemovalSessionCollection; value: JsonValue } | { kind: "session-remove"; key: RemovalSessionKey }): Promise<Problem | undefined> {
    const before = await inspect(local, session, { kind: "resolved" })
    if (before) return before
    if (deps.isStopped()) return unavailable("disposed")
    let mutation: Extract<RemovalResult, { kind: "unconfirmed" }>["mutation"] = { kind: "resolved" }
    try {
      switch (operation.kind) {
        case "local-set": await deps.local.set(operation.items); break
        case "local-remove": accountRemovalLocalName(operation.key, record.acct); await host.removeLocal([operation.key]); break
        case "session-set": await host.session.set({ [operation.key]: operation.value }); break
        case "session-remove":
          if (operation.key.acct !== record.acct) throw new TypeError("Session removal escaped its account")
          await host.session.remove([operation.key]); break
      }
    } catch (error) { mutation = { kind: "rejected", error } }
    const issue = await inspect(nextLocal, nextSession, mutation)
    if (issue) return issue
    local = nextLocal; session = nextSession
    if (mutation.kind === "rejected") return { kind: "failed", stage, error: mutation.error }
  }
  async function removeLocal(key: RemovalLocalKey): Promise<Problem | undefined> {
    const name = accountRemovalLocalName(key, record.acct)
    if (!Object.hasOwn(local, name)) return
    const next = { ...local }; delete next[name]
    return effect(next, session, { kind: "local-remove", key })
  }
  async function retire(): Promise<RemovalResult> {
    stage = "retire"
    const retiring = removalRetirementLedger(local, raw, "retiring", deps.recoveryPermit)
    if (!retiring) return unavailable("consent-held")
    if (Object.keys(retiring).length && !sameSyncJson({ ...local, ...retiring }, local)) {
      const issue = await effect({ ...local, ...retiring }, session, { kind: "local-set", items: retiring }); if (issue) return issue
    }
    const retired = await removeLocal({ kind: "continuation" }); if (retired) return retired
    const final = await inspect(local, session, { kind: "resolved" }); if (final) return final
    const done = removalRetirementLedger(local, raw, "done", deps.recoveryPermit)
    if (!done) return unavailable("consent-held")
    if (Object.keys(done).length) {
      const issue = await effect({ ...local, ...done }, session, { kind: "local-set", items: done }); if (issue) return issue
    }
    return { kind: "committed" }
  }
  try {
    const preflight = await inspect(local, session, { kind: "resolved" })
    if (preflight) return preflight
    if (terminal) {
      const cleanSession = planAccountSessionRemoval(record.acct, session)
      if (cleanSession.kind !== "supported" || cleanSession.effects.length || decodeLastAccount(local) === record.acct ||
        Object.keys(local).some(name => name === `cache:${record.acct}` || name.startsWith(`progress:${record.acct}:`)) ||
        !record.documents.every(member => record.mode === "local" ? !Object.hasOwn(local, documentKey(member.key)) : "after" in member && object(member.after) && sameSyncJson(local[documentKey(member.key)] ?? null, member.after))) return unavailable("stale")
      return await retire()
    }
    if (accepting) {
      const registration = acceptedRemovalLedger(local, raw)
      if (!registration) return unavailable("consent-held")
      const items = { [pendingAccountRemovalKey]: raw, ...registration }
      const issue = await effect({ ...local, ...items }, session, { kind: "local-set", items })
      if (issue) return issue
      accepted = true
    }
    stage = "documents"
    if (record.mode === "synced") {
      {
        if (deps.isStopped()) return unavailable("disposed")
        const remote = await deps.sync.get()
        const [first, ...rest] = record.documents
        const plan = planAccountDocumentWrite({ local, sync: remote, intent: { kind: "changed-batch", documents: [
          { key: first.key, document: first.after }, ...rest.map(member => ({ key: member.key, document: member.after }))
        ] } })
        const issue = await inspect(local, session, { kind: "resolved" }); if (issue) return issue
        if (plan.kind === "refused") return { kind: "result", result: { refused: plan.reason } }
        if (plan.kind !== "planned") return unavailable("sync-writer-required")
        const items: JsonObject = {}
        for (const member of record.documents) if (!sameSyncJson(member.after, local[documentKey(member.key)] ?? null)) items[documentKey(member.key)] = member.after
        const ready = deps.authority(local)
        if (ready.kind !== "ready" || !ready.history) return unavailable("sync-writer-required")
        const history = deps.repairHistory(ready.history.raw, plan.repairs)
        const patch = prepareFirstEditHistory({ history: { kind: "present", raw: history ?? ready.history.raw }, syncOn: true })
        if (patch.kind === "unavailable") return unavailable("sync-writer-required")
        if (patch.kind === "set") items.sync = patch.sync
        else if (history) items.sync = history
        if (Object.keys(items).length > 0) {
          const changed = await effect({ ...local, ...items }, session, { kind: "local-set", items }); if (changed) return changed
        }
      }
    } else {
      for (const member of record.documents) { const issue = await removeLocal({ kind: "document", key: member.key }); if (issue) return issue }
      const ready = deps.authority(local)
      if (ready.kind !== "ready") return unavailable("pending-removal")
      const patch = prepareFirstEditHistory({ history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" }, syncOn: false })
      if (patch.kind === "unavailable") return unavailable("sync-writer-required")
      if (patch.kind === "set") {
        const sync = patch.sync
        const issue = await effect({ ...local, sync }, session, { kind: "local-set", items: { sync } }); if (issue) return issue
      }
    }
    stage = "local-cleanup"
    const cache = await removeLocal({ kind: "cache", acct: record.acct }); if (cache) return cache
    for (const shard of removalProgressShards) { const issue = await removeLocal({ kind: "progress", acct: record.acct, shard }); if (issue) return issue }
    stage = "session-cleanup"
    const plan = planAccountSessionRemoval(record.acct, session)
    if (plan.kind !== "supported") return unavailable("session-layout")
    for (const change of plan.effects) {
      const next = { ...session }
      if (change.kind === "set") next[change.key] = change.value
      else delete next[`${change.key.kind}:${change.key.acct}`]
      const issue = await effect(local, next, change.kind === "set" ? { kind: "session-set", key: change.key, value: change.value } : { kind: "session-remove", key: change.key }); if (issue) return issue
    }
    stage = "last-account"
    if (decodeLastAccount(local) === record.acct) {
      const items = { [LAST_ACCOUNT_KEY]: null }
      const issue = await effect({ ...local, ...items }, session, { kind: "local-set", items }); if (issue) return issue
    }
    const confirmed = await inspect(local, session, { kind: "resolved" }); if (confirmed) return confirmed
    return await retire()
  } catch (error) { return { kind: "failed", stage, error } }
}

// Admission projects unrelated unreadable documents only. Persistence always uses the original inventory.
type AccountWrite = { readonly key: AccountDocumentKey; readonly document: JsonObject }
export function planAccountDocumentWrite(input: {
  readonly local: Readonly<Record<string, unknown>>
  readonly sync: Readonly<Record<string, unknown>>
  readonly allowance?: "headroom"
  readonly intent:
    | { readonly kind: "unchanged"; readonly key: AccountDocumentKey }
    | ({ readonly kind: "changed" } & AccountWrite)
    | { readonly kind: "changed-batch"; readonly documents: readonly [AccountWrite, ...AccountWrite[]] }
}): SyncWritePlan {
  if (!object(input.local) || !object(input.sync) || !object(input.local.sync) || !object(input.local.sync.pushed)) return { kind: "unavailable" }
  const addressed = new Set(input.intent.kind === "changed-batch"
    ? input.intent.documents.map(item => documentKey(item.key)) : [documentKey(input.intent.key)])
  const local = { ...input.local }, pushed = { ...input.local.sync.pushed }
  const items = Object.entries(input.sync).map(([key, value]) => ({ key, value }))
  for (const [name, raw] of Object.entries(input.local)) {
    const key = parseDocumentKey(name)
    if (!key || documentKey(key) !== name || addressed.has(name)) continue
    if (readSyncDocument({ key, items: [{ key: `s:${name.slice(4)}`, value: raw }] }).kind !== "newer-version") continue
    const remote = readSyncDocument({ key, items })
    if (remote.kind === "value" || remote.kind === "deleted") {
      local[name] = remote.json
      pushed[name] = remote.kind === "value" ? remote.value.document.gen : remote.document.gen
    } else if (remote.kind === "absent" || remote.kind === "newer-version") {
      delete local[name]
      delete pushed[name]
    } else return { kind: "unavailable" }
  }
  local.sync = { ...input.local.sync, pushed }
  return planSyncWrite({ ...input, local })
}
