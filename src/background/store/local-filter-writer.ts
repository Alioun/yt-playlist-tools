import { pendingSyncJoinKey, readSyncJoinCheckpoint, transitionSyncJoin, joinJson, joinStored, sameJoinStored,
  type SyncJoinCheckpointV1, type JoinOutboundDebt, type JoinAgreementFacts } from "./sync-join-persistence"
import { readJoinLocal, readJoinRemote, classifySyncJoin, prepareJoinEffect, projectJoinDebt, joinUnavailable,
  finishJoinEffect, setJoinStage, retireJoin, type SyncJoinHost, type SyncJoinReview, type SyncJoinOperation, type SyncJoinPreparation,
  type SyncJoinResult, type SyncJoinStatus, type SyncJoinSide, type JoinRemote } from "./sync-join-execution"
import { agreementOrigin, agreementAccess, detachAgreement, freezeAgreement, parseAgreementChoice, readCanonicalAgreement, prepareCanonicalAgreement,
  type AgreementRead, type AgreementInput, type AgreementResult, type AgreementReview, type AgreementUnavailable, type AgreementStage, type AgreementWrite } from "./consent-agreement"
import { planLegacyStartup } from "./legacy-startup"
import { prepareFirstEditHistory, readFirstEditProvenance } from "./first-edit-provenance"
import {
  CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError,
  decodeDevice, decodeDocument, decodeFilter, decodeSettings, decodeSetup, decodeSyncState, decodeSyncMeta, documentKey, parseDocumentKey,
  type AccountKey, type PlaylistId, type DocumentKey, type SyncOpaqueWrite
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import { changeFilterSetting, type FilterSettingInput } from "./channel-filter-edit"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
import { readSyncInventory } from "./sync-inventory"
import { prepareDocumentBody } from "./write-preparation"
import { executeLocalClaim, type ClaimHost, type ClaimTransactionResult } from "./local-claim-writer"

import { executeLegacyStartup, type StartupExecutionResult } from "./legacy-execution"

import { readSettingsView, type SettingsView } from "../../shared/model/settings-view"
import { executeSharedSetting, type LocalSettingsWriteResult } from "./shared-setting-execution"
import type { SharedSettingChange } from "./settings-edit"
import type { ClaimNotice } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { projectClaimNotice, executeClaimNoticeAcknowledgement, type ClaimNoticeRead, type ClaimNoticeAcknowledgement, type NormalUiOrigin } from "./claim-notice"

import { prepareAccountRemovalCapture, executeAccountRemoval, resumePendingAccountRemoval, pendingAccountRemovalKey,
  type AccountRemovalHost, type AccountRemovalDependencies, type RemovalCapture, type RemovalConfirmation, type RemovalPreparation, type RemovalResult } from "./account-removal-execution"

import { executeInterimRetention, projectInterimNote, interimConversionKey,
  readRetainedCheckpoint, retainedAgreementDevice, retainedCheckpointDifference, isInterimCanonicalKey, isInterimSourceKey,
  type RetainedAgreementV2, type InterimPersistenceSnapshot,
  type StoreStartupHost, type InterimRetentionResult, type InterimNoteRead } from "./interim-persistence"

export type SettingsRead = SettingsView | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "disposed" | "stale" }
export type SettingsEvent = { readonly kind: "settings-changed"; readonly source: "local" | "sync" }

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
  | { readonly kind: "unconfirmed"; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }
  | { readonly kind: "result"; readonly result: ChangeResult }
  | {
    readonly kind: "unavailable"
    readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context" | "stale"
  }

export type LocalWriteStorage = {
  get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
}

export type SyncClock = {
  now(): number
  wallNow(): number
  after(milliseconds: number, run: () => void): () => void
}

export type SyncStorage = {
  get(): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
  subscribe(changed: () => void): () => void
}

type FlushSource =
  | { kind: "set"; sent: readonly SyncDocumentRecord[]; repairs: readonly SyncDocumentRecord[] }
  | { kind: "readback"; repairs: readonly SyncDocumentRecord[] }
export type SyncFlushResult =
  | { kind: "deferred"; notBefore: number }
  | { kind: "idle" }
  | { kind: "reconciled"; repaired: readonly SyncDocumentRecord[] }
  | { kind: "pushed"; sent: readonly SyncDocumentRecord[]; repaired: readonly SyncDocumentRecord[] }
  | { kind: "unavailable"; reason?: "changed-generation" }
  | { kind: "blocked" }
  | { kind: "sync-set-failed"; error: unknown; sent: readonly SyncDocumentRecord[]; recoveryPersistence?: { error: unknown } }
  | { kind: "acknowledgement-failed"; error: unknown; source: FlushSource }
  | { kind: "unconfirmed"; sent: readonly SyncDocumentRecord[]; cause:
    | { kind: "authority" | "readback" }
    | { kind: "read-failed"; error: unknown }
  }

export type SyncReceiveKey = Extract<DocumentKey, { kind: "settings" | "filter" | "setup" }>

export type SyncReceiveResult =
  | { readonly kind: "idle" }
  | { readonly kind: "adopted"; readonly received: SyncDocumentRecord }
  | { readonly kind: "unavailable"; readonly reason: "authority" | "history" | "account-context" | "document" | "pending" | "conflict" }
  | { readonly kind: "local-set-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "unconfirmed"; readonly received: SyncDocumentRecord; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }

export type SyncAutomaticResult = SyncFlushResult | { kind: "rejected"; error: unknown }

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

function hasInterimMarkers(records: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(records).some(name => name.startsWith("account:") ||
    ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed", interimConversionKey].includes(name))
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
      if (!isJsonObject(records.sync) || readFirstEditProvenance({ kind: "present", raw: records.sync }).kind === "invalid") return unavailable("sync-writer-required")
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

function snapshot(raw: JsonObject): JsonObject {
  const copy: JsonObject = {}
  const pending: { source: JsonObject | JsonValue[]; target: JsonObject | JsonValue[] }[] = [{ source: raw, target: copy }]
  while (pending.length > 0) {
    const entry = pending.pop()
    if (!entry) break
    for (const [name, value] of Object.entries(entry.source)) {
      const child: JsonValue = value !== null && typeof value === "object" ? Array.isArray(value) ? [] : {} : value
      Object.defineProperty(entry.target, name, { value: child, enumerable: true, writable: true, configurable: true })
      if (value !== null && typeof value === "object" && child !== null && typeof child === "object") {
        pending.push({ source: value, target: child })
      }
    }
  }
  return copy
}

function diagnostic(error: unknown): NonNullable<SyncOpaqueWrite["diagnostic"]> {
  if (typeof error === "string") return { name: null, message: error }
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return { name: null, message: null }
  try {
    const name = Object.getOwnPropertyDescriptor(error, "name")
    const message = Object.getOwnPropertyDescriptor(error, "message")
    return {
      name: name && "value" in name && typeof name.value === "string" ? name.value : null,
      message: message && "value" in message && typeof message.value === "string" ? message.value : null
    }
  } catch { return { name: null, message: null } }
}

function recoveryHistory(raw: JsonObject, gate: SyncOpaqueWrite["gate"], error?: { value: unknown }): JsonObject {
  const previous = isJsonObject(raw.opaqueWrite) ? raw.opaqueWrite : undefined
  const savedDiagnostic = error ? { ...(isJsonObject(previous?.diagnostic) ? previous.diagnostic : {}), ...diagnostic(error.value) }
    : previous?.diagnostic ?? null
  const next = { ...raw }
  if (gate === null && savedDiagnostic === null) delete next.opaqueWrite
  else next.opaqueWrite = { ...previous, gate: gate === null ? null : {
    ...(isJsonObject(previous?.gate) ? previous.gate : {}), ...gate
  }, diagnostic: savedDiagnostic }
  decodeSyncState(next)
  return next
}

type SyncEvent = { readonly kind: "edit" | "start" | "sync" | "manual"; readonly mono: number; readonly wall: number; readonly epoch: number }

type LocalFilterWriterDependencies = {
  readonly join?: SyncJoinHost
  readonly removal?: AccountRemovalHost
  readonly local: LocalWriteStorage
  readonly claim: ClaimHost
  readonly sync: SyncStorage
  readonly now: () => number
  readonly generation: () => string
  readonly syncClock: SyncClock
  readonly onSyncResult: (result: SyncAutomaticResult) => void
}

type LocalFilterWriter = {
  beginSyncJoin(origin: UiOrigin): SyncJoinOperation
  applySyncJoin(origin: UiOrigin, input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }): Promise<SyncJoinResult>
  cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
  readSyncJoin(origin: UiOrigin): Promise<SyncJoinStatus>
  resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
  readAgreement(origin: UiOrigin): Promise<AgreementRead>
  agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult>
  resumeRetainedAgreement(origin: UiOrigin): Promise<AgreementResult>
  readInterimNote(): Promise<InterimNoteRead>
  prepareAccountRemoval(origin: UiOrigin, acct: AccountKey): Promise<RemovalPreparation>
  removeAccountSetup(origin: UiOrigin, confirmation: RemovalConfirmation): Promise<RemovalResult>
  readClaimNotice(): Promise<ClaimNoticeRead>
  acknowledgeClaimNotice(origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>): Promise<ClaimNoticeAcknowledgement>
  read(view: "settings"): Promise<SettingsRead>
  subscribe(fn: (event: SettingsEvent) => void): () => void
  changeSharedSetting(origin: UiOrigin, change: SharedSettingChange): Promise<LocalSettingsWriteResult>
  claim(): Promise<ClaimTransactionResult>
  change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
}

export class StartupReadinessError extends Error {
  constructor(readonly result: { readonly kind: "pending-join"; readonly observation: "accepted" | "outbound" | "choice" | "invalid" | "newer-version" } | { readonly kind: "interim-held"; readonly result: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> } | Exclude<StartupExecutionResult, { kind: "ok" | "newer-layout" }> | { readonly kind: "disposed" } | { readonly kind: "pending-removal"; readonly result: Exclude<RemovalResult, { kind: "committed" | "unchanged" }> }) {
    super("Local startup did not release this owner")
    this.name = "StartupReadinessError"
  }
}

export function createLocalFilterWriter(deps: LocalFilterWriterDependencies): LocalFilterWriter {
  return createOwner(deps).writer
}

export function createStartingLocalFilterWriter(deps: LocalFilterWriterDependencies & { readonly startup: StoreStartupHost }):
  LocalFilterWriter & { ready(): Promise<"ok" | "newer-layout"> } {
  const owner = createOwner(deps, deps.startup)
  return { ...owner.writer, ready: () => owner.readiness }
}

function createOwner(deps: LocalFilterWriterDependencies, startup?: StoreStartupHost) {
  let agreementRevision = 0
  let joinHeld = false
  let joinRemoteRevision = 0
  let observedJoinRemote: JsonObject | undefined
  const rawStartup = startup
  let observedInterimSnapshot: InterimPersistenceSnapshot | undefined
  if (rawStartup) startup = { ...rawStartup, context: detachAgreement(rawStartup.context),
    async readInterimSnapshot() {
      const raw = await rawStartup.readInterimSnapshot()
      if (!isJsonValue(raw)) { agreementRevision++; return raw }
      const current = detachAgreement(raw)
      if (observedInterimSnapshot && !agreementSame(observedInterimSnapshot, current)) agreementRevision++
      observedInterimSnapshot = detachAgreement(current)
      return current
    }
  }
  const observedAgreementValues = new Map<string, JsonValue>()
  let observedComplete = false
  const rawLocal = deps.local
  const local: LocalWriteStorage = {
    async get(keys) {
      const raw = await rawLocal.get(keys)
      if (!isJsonObject(raw)) { agreementRevision++; return raw }
      const records = snapshot(raw)
      if (keys === null || keys.includes(pendingSyncJoinKey)) {
        const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        joinHeld = checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")
      }
      const names = keys === null ? new Set([...observedAgreementValues.keys(), ...Object.keys(records)]) : new Set(keys)
      for (const name of names) {
        const before = observedAgreementValues.get(name), present = Object.hasOwn(records, name)
        if (observedAgreementValues.has(name) ? !present || !sameSyncJson(before!, records[name]!) : observedComplete && present) agreementRevision++
        if (present) observedAgreementValues.set(name, snapshot({ value: records[name]! }).value!)
        else observedAgreementValues.delete(name)
      }
      if (keys === null) observedComplete = true
      return records
    },
    set: items => rawLocal.set(items)
  }
  let agreementContext: "first-run" | "upgrade-note" | "existing" = "existing"
  const agreementCreation = startup ? detachAgreement(startup.context) : undefined
  type ReviewCapture = {
    readonly origin: JsonObject; readonly records: JsonObject; readonly revision: number
    readonly retained: InterimPersistenceSnapshot | undefined
    readonly context: "first-run" | "upgrade-note" | "existing"
    terminal?: { readonly revision: number; readonly action: JsonObject; readonly after: JsonObject; readonly result: Extract<AgreementResult, { kind: "committed" | "unchanged" }> }
    consumed: boolean
  }
  const agreementReviews = new WeakMap<AgreementReview, ReviewCapture>()
  let initialization: "pending" | "ok" | "newer-layout" | "failed" | "interim-held" | "pending-join" = startup ? "pending" : "ok"
  let interimResult: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> | undefined
  let claimConfirmation: "ready" | "unconfirmed" = "ready"
  const removal = deps.removal ?? { kind: "unavailable" }
  const join = deps.join ?? { kind: "unavailable" }
  const joinDeps = { local, host: join, stopped: () => disposed() || claimConfirmation === "unconfirmed" }
  const removalLocal: LocalWriteStorage = {
    set: items => local.set(items),
    async get(keys) {
      const records = await local.get(keys)
      if (hasInterimMarkers(records)) {
        interimResult ??= { kind: "stale", reason: "checkpoint" }
        initialization = "interim-held"
        deactivate("stopped")
        listeners.clear()
        return {}
      }
      return records
    }
  }
  let removalChecked = false
  const confirmations = new WeakMap<RemovalConfirmation, { readonly origin: JsonObject; readonly capture: RemovalCapture }>()
  const listeners = new Set<(event: SettingsEvent) => void>()
  let lane: Promise<void> = Promise.resolve()
  let lifetime: { kind: "inactive" | "stopped" | "disposed" } | { kind: "active"; unsubscribe: () => void } = { kind: "inactive" }
  let ticket: { event: SyncEvent; cancel: () => void } | undefined
  let quietUntil = 0
  let nextInvocation = (startup ? 0 : deps.syncClock.now()) + 5000
  let lastMonotonic = nextInvocation - 5000
  let clockInvalid = !Number.isFinite(lastMonotonic) || lastMonotonic < 0 || nextInvocation > Number.MAX_SAFE_INTEGER
  let epoch = 0
  let hold: { mono: number; wall: number } | undefined
  let observedGate: JsonValue | undefined

  const removalDependencies: AccountRemovalDependencies = {
    local: removalLocal, sync: deps.sync, host: removal,
    authority: records => hasInterimMarkers(records) ? { kind: "unavailable", reason: "startup" } : authority(records),
    repairHistory: repairedHistory,
    isStopped: disposed, now: () => deps.now(), generation: () => deps.generation()
  }
  async function completePendingRemoval(): Promise<RemovalResult> {
    const result = await resumePendingAccountRemoval(removalDependencies)
    if (result.kind === "committed" || result.kind === "unchanged") removalChecked = true
    else {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
    }
    return result
  }
  const guardedLocal: LocalWriteStorage = {
    set: items => removalLocal.set(items),
    async get(keys) {
      let records = await removalLocal.get(keys)
      if (joinHeld) return {}
      if (removalChecked) return records
      if (keys !== null) {
        // Joined Filter edits already require a complete read before any successful outcome.
        if (isJsonObject(records.device) && records.device.syncOn === true) return records
        records = await removalLocal.get(null)
      }
      if (!Object.hasOwn(records, pendingAccountRemovalKey)) { removalChecked = true; return records }
      const result = await completePendingRemoval()
      return result.kind === "committed" ? removalLocal.get(keys) : {}
    }
  }

  const readiness: Promise<"ok" | "newer-layout"> = startup ? enqueue(async () => {
    try {
      const full = await local.get(null)
      if (Object.hasOwn(full, pendingSyncJoinKey)) {
        const check = readSyncJoinCheckpoint(full[pendingSyncJoinKey])
        if (!(check.kind === "valid" && check.checkpoint.phase === "off")) {
          const header = await startup.readInterimSnapshot()
          if (hasInterimMarkers(full) || header.checkpoint.kind !== "absent" || Object.keys(header.source).some(name => name.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(name)) || typeof full.schema === "number" && full.schema > STORAGE_SCHEMA_VERSION) {
            initialization = "pending-join"
            throw new StartupReadinessError({ kind: "pending-join", observation: "invalid" })
          }
          initialization = "pending-join"
          throw new StartupReadinessError({ kind: "pending-join", observation: check.kind === "valid" ? check.checkpoint.phase === "off" ? "invalid" : check.checkpoint.phase : check.kind === "newer-version" ? "newer-version" : "invalid" })
        }
      }
      const retained = await executeInterimRetention({ local: local, snapshot: () => startup.readInterimSnapshot(), isStopped: disposed,
        context: initial => {
          const context = startup.context
          const paths = new Set(["doc:settings"])
          for (const [key, body] of Object.entries(initial.source)) {
            if (!key.startsWith("account:")) continue
            const acct = key.slice(8), setup = `doc:setup:${acct}`
            if (parseDocumentKey(setup)?.kind !== "setup") continue
            paths.add(setup)
            if (!isJsonObject(body) || !isJsonObject(body.filters)) continue
            for (const playlist of Object.keys(body.filters)) {
              const path = `doc:filter:${acct}:${playlist}`
              if (parseDocumentKey(path)?.kind === "filter") paths.add(path)
            }
          }
          return { deviceId: context.deviceId, at: context.at, platform: context.platform, commands: context.commands,
            interimShortcutId: context.shortcutId, documentGenerations: Object.fromEntries([...paths].map(path => [path, `${context.settingsGen}:${path}`])) }
        } })
      if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
      if (retained.kind === "failed" && retained.stage === "snapshot") throw retained.error
      if (retained.kind === "newer-layout") { initialization = "newer-layout"; return "newer-layout" }
      if (retained.kind !== "not-interim") {
        interimResult = retained
        initialization = "interim-held"
        deactivate("stopped")
        listeners.clear()
        throw new StartupReadinessError({ kind: "interim-held", result: retained })
      }
      let classified = false
      const result = await executeLegacyStartup({ local: local, host: { ...startup,
        async readSnapshot() {
          const current = await startup.readSnapshot()
          if (!classified) {
            classified = true
            const plan = planLegacyStartup(current, startup.context)
            agreementContext = plan.kind === "upgrade" || plan.kind === "resume" ? "upgrade-note"
              : plan.kind === "fresh" || plan.kind === "current" && current.device === undefined && current.settingsDocument === undefined && current.unclaimed === undefined && current.legacy.presentKeys.length === 0 ? "first-run" : "existing"
          }
          return current
        }
      } })
      if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
      if (result.kind !== "ok" && result.kind !== "newer-layout") throw new StartupReadinessError(result)
      if (result.kind === "ok") {
        const completion = await completePendingRemoval()
        if (interimResult) throw new StartupReadinessError({ kind: "interim-held", result: interimResult })
        if ("stage" in completion || completion.kind === "result" || completion.kind === "unavailable") throw new StartupReadinessError({ kind: "pending-removal", result: completion })
        lastMonotonic = deps.syncClock.now()
        nextInvocation = lastMonotonic + 5000
        clockInvalid = !Number.isFinite(lastMonotonic) || lastMonotonic < 0 || nextInvocation > Number.MAX_SAFE_INTEGER
      }
      initialization = result.kind
      return result.kind
    } catch (error) {
      if (initialization !== "interim-held" && initialization !== "pending-join") initialization = "failed"
      throw error
    }
  }) : Promise.resolve("ok")
  // Construction may precede the consumer attaching its ready rejection handler.
  void readiness.catch(() => {})

  function clock() {
    const mono = deps.syncClock.now(), wall = deps.syncClock.wallNow()
    if (!Number.isFinite(mono) || mono < lastMonotonic || mono < 0 || mono + 60000 > Number.MAX_SAFE_INTEGER) clockInvalid = true
    if (clockInvalid || !Number.isSafeInteger(wall) || wall < 0 || !Number.isSafeInteger(wall + 60000)) return
    lastMonotonic = mono
    return { mono, wall }
  }

  function ingress(kind: SyncEvent["kind"]): SyncEvent | undefined {
    const time = clock()
    return time ? { kind, ...time, epoch } : undefined
  }

  function admitted(event: SyncEvent | undefined, time: { mono: number; wall: number }) {
    return event !== undefined && event.epoch === epoch && (!hold ||
      event.mono >= hold.mono && event.wall >= hold.wall && time.mono >= hold.mono && time.wall >= hold.wall)
  }

  function recoveryDeferral(time: { mono: number; wall: number }): SyncFlushResult {
    const notBefore = Math.max(nextInvocation, quietUntil, hold?.mono ?? 0,
      time.mono + Math.max(0, (hold?.wall ?? 0) - time.wall))
    return Number.isFinite(notBefore) && notBefore <= Number.MAX_SAFE_INTEGER
      ? { kind: "deferred", notBefore } : { kind: "unavailable" }
  }

  async function loadRecovery(records: JsonObject): Promise<JsonObject | undefined> {
    const raw = records.sync
    if (!isJsonObject(raw)) return
    const gate = decodeSyncState(raw).opaqueWrite?.gate
    if (!gate || observedGate !== undefined && sameSyncJson(gate, observedGate)) return records
    const time = clock()
    if (!time) return
    epoch++
    cancelTicket()
    const floor = Math.max(time.mono + 60000, time.mono + Math.max(0, gate.notBefore - time.wall))
    if (!Number.isFinite(floor) || floor > Number.MAX_SAFE_INTEGER) { clockInvalid = true; return }
    hold = { mono: floor, wall: gate.notBefore }
    if (gate.kind === "pending") {
      const next = recoveryHistory(raw, { kind: "held", notBefore: Math.max(gate.notBefore, time.wall + 60000) })
      const expected = { ...snapshot(records), sync: next }
      await local.set({ sync: next })
      const confirmed = await local.get(null)
      if (disposed() || !isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) return
      hold.wall = Math.max(hold.wall, time.wall + 60000)
      observedGate = isJsonObject(next.opaqueWrite) ? next.opaqueWrite.gate : undefined
      return expected
    }
    observedGate = { ...gate }
    return records
  }

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const work = lane.then(run)
    lane = work.then(() => {}, () => {})
    return work
  }

  function emitSettings(source: SettingsEvent["source"]) {
    for (const listener of [...listeners]) {
      if (disposed()) break
      if (!listeners.has(listener)) continue
      try { void Promise.resolve(listener({ kind: "settings-changed", source })).catch(() => {}) } catch {}
    }
  }

  function cancelTicket() {
    ticket?.cancel()
    ticket = undefined
  }

  function deactivate(kind: "inactive" | "stopped" | "disposed") {
    cancelTicket()
    if (lifetime.kind === "active") lifetime.unsubscribe()
    if (lifetime.kind !== "disposed" && (lifetime.kind !== "stopped" || kind === "disposed")) lifetime = { kind }
  }

  function arm(notBefore: number, event: SyncEvent | undefined) {
    if (lifetime.kind !== "active") return
    cancelTicket()
    const time = clock()
    if (!time || !admitted(event, time)) return
    const milliseconds = Math.max(0, notBefore - time.mono)
    if (milliseconds > 25000) return
    if (!event) return
    const current = { event, cancel: () => {} }
    ticket = current
    current.cancel = deps.syncClock.after(milliseconds, () => {
      void enqueue(async () => {
        if (ticket !== current || lifetime.kind !== "active") return
        ticket = undefined
        await automatic(current.event, false)
      })
    })
  }

  async function automatic(event: SyncEvent | undefined, followup = true) {
    if (lifetime.kind !== "active") return
    let result: SyncAutomaticResult
    try {
      const incoming = followup && (event?.kind === "start" || event?.kind === "sync") ? await receiveIncomingDocuments() : undefined
      if (incoming) result = incoming
      else {
        if (lifetime.kind !== "active") return
        result = await attempt(event)
      }
    } catch (error) { result = { kind: "rejected", error } }
    if (result.kind === "rejected") deactivate("stopped")
    else if (followup && result.kind === "deferred") arm(result.notBefore, event)
    if (result.kind !== "deferred") cancelTicket()
    deps.onSyncResult(result)
  }

  async function receiveAttempt(key: SyncReceiveKey): Promise<SyncReceiveResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "authority" }
    try {
      const result = await receive(key)
      if (result.kind === "local-set-failed" || result.kind === "unconfirmed") deactivate("stopped")
      if (key.kind === "settings" && result.kind === "adopted") emitSettings("sync")
      return result
    } catch (error) { deactivate("stopped"); throw error }
  }

  async function receiveIncomingDocuments(): Promise<SyncAutomaticResult | undefined> {
    if (lifetime.kind !== "active") return
    const records = await (joinHeld ? local : guardedLocal).get(null)
    const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "outbound" || checkpoint.checkpoint.phase === "choice")) {
      const remote = await readJoinSync()
      if (isJsonObject(records) && isJsonObject(remote) && await signalJoinHistory(records, remote)) return { kind: "unavailable" }
      return checkpoint.checkpoint.phase === "choice" ? { kind: "unavailable" } : undefined
    }
    if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")) return { kind: "unavailable" }
    if (lifetime.kind !== "active") return
    const ready = authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable" }
    observeOff(ready.device.syncOn)
    if (!ready.device.syncOn) return
    if (hasInterimMarkers(records)) return { kind: "unavailable" }
    const targets: SyncReceiveKey[] = []
    for (const name of Object.keys(records).sort()) {
      const key = parseDocumentKey(name)
      if ((key?.kind === "settings" || key?.kind === "filter" || key?.kind === "setup") && documentKey(key) === name) targets.push(key)
    }
    if (targets.length === 0 && isJsonObject(records)) {
      const remote = await readJoinSync()
      if (isJsonObject(remote) && await signalJoinHistory(records, remote)) return { kind: "unavailable" }
    }
    for (const key of targets) {
      if (lifetime.kind !== "active") return
      const result = await receiveAttempt(key)
      if (result.kind === "local-set-failed") return { kind: "rejected", error: result.error }
      if (result.kind === "unconfirmed") return result.cause.kind === "read-failed"
        ? { kind: "rejected", error: result.cause.error } : { kind: "unavailable" }
      if (lifetime.kind !== "active") return
      if (result.kind === "unavailable" && (result.reason === "authority" || result.reason === "history")) {
        if (result.reason === "authority") {
          const current = authority(await guardedLocal.get(null))
          if (current.kind === "ready") observeOff(current.device.syncOn)
        }
        return { kind: "unavailable" }
      }
    }
  }

  async function attempt(event: SyncEvent | undefined): Promise<SyncFlushResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable" }
    let result: SyncFlushResult
    try { result = await flush(event) } catch (error) { deactivate("stopped"); throw error }
    if (result.kind === "acknowledgement-failed" || result.kind === "unconfirmed") deactivate("stopped")
    if (result.kind !== "deferred") cancelTicket()
    return result
  }

  function observeOff(syncOn: boolean) {
    if (!syncOn) deactivate("inactive")
  }

  function disposed() { return lifetime.kind === "disposed" }

  async function execute(change: LocalFilterChange, at: number, event: SyncEvent | undefined): Promise<LocalFilterWriteResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
    const invalid = { kind: "result", result: { refused: "invalid" } } as const
    const ok = { kind: "result", result: { ok: true } } as const
    const setupKey = documentKey({ kind: "setup", acct: change.acct })
    const filterKey = documentKey({ kind: "filter", acct: change.acct, playlist: change.playlist })
    const initial = await guardedLocal.get(["schema", "device", "sync", setupKey, filterKey])
    if (disposed()) return { kind: "unavailable", reason: "stale" }
    const initialAuthority = authority(initial)
    if (initialAuthority.kind !== "ready") return initialAuthority
    if (!isJsonObject(initial[setupKey])) return { kind: "unavailable", reason: "account-context" }
    if (Object.hasOwn(initial, filterKey) && !isJsonValue(initial[filterKey])) return invalid
    if (!isJsonObject(initial)) return initialAuthority.device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
    let records = snapshot(initial)
    let exhaustive = false
    for (;;) {
      const ready = authority(records)
      if (ready.kind === "unavailable") return ready
      const { device, history } = ready
      observeOff(device.syncOn)

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
          const complete = await guardedLocal.get(null)
          if (disposed()) return { kind: "unavailable", reason: "stale" }
          if (Object.hasOwn(complete, filterKey) && !isJsonValue(complete[filterKey])) return invalid
          if (!isJsonObject(complete)) return device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
          records = snapshot(complete)
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

      if (!exhaustive) {
        const complete = await guardedLocal.get(null)
        if (disposed()) return { kind: "unavailable", reason: "stale" }
        if (!isJsonObject(complete)) return device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
        records = snapshot(complete)
        exhaustive = true
        continue
      }
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
      }
      const effective = items.sync ?? history?.raw
      const patch = prepareFirstEditHistory({ history: effective === undefined ? { kind: "absent" } : { kind: "present", raw: effective }, syncOn: device.syncOn })
      if (patch.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
      if (patch.kind === "set") items.sync = patch.sync
      if (disposed()) return { kind: "unavailable", reason: "stale" }
      const before = await guardedLocal.get(null)
      if (disposed()) return { kind: "unavailable", reason: "stale" }
      if (!isJsonObject(before) || !sameSyncJson(records, before)) return { kind: "unavailable", reason: "stale" }
      const expected = snapshot({ ...records, ...items })
      function uncertain(cause: Extract<LocalFilterWriteResult, { kind: "unconfirmed" }>["cause"]): LocalFilterWriteResult {
        claimConfirmation = "unconfirmed"
        deactivate("stopped")
        return { kind: "unconfirmed", cause }
      }
      try { await guardedLocal.set(items) } catch (error) {
        uncertain({ kind: "readback" })
        throw error
      }
      try {
        const confirmed = await guardedLocal.get(null)
        if (disposed()) return uncertain({ kind: "authority" })
        if (!isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) return uncertain({ kind: "readback" })
      } catch (error) { return uncertain({ kind: "read-failed", error }) }
      if (device.syncOn) {
        quietUntil = deps.syncClock.now() + 2000
        const gate = history && decodeSyncState(history.raw).opaqueWrite?.gate
        if (!gate || observedGate !== undefined) arm(Math.max(quietUntil, nextInvocation), event)
      }
      return ok
    }
  }

  async function receive(key: SyncReceiveKey): Promise<SyncReceiveResult> {
    const unavailable = (reason: Extract<SyncReceiveResult, { kind: "unavailable" }>["reason"]) => ({ kind: "unavailable", reason } as const)
    const name = documentKey(key)
    function context(records: Readonly<Record<string, unknown>>) {
      const ready = authority(records)
      if (lifetime.kind === "disposed" || ready.kind !== "ready" || !ready.device.syncOn || !ready.history ||
        hasInterimMarkers(records)) return unavailable("authority")
      const raw = records[name]
      if (!Object.hasOwn(records, name) || !isJsonObject(raw)) return unavailable("document")
      let document
      try { document = key.kind === "settings" ? decodeDocument(raw, decodeSettings)
        : key.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter) } catch (error) {
        if (error instanceof DecodeError) return unavailable("document")
        throw error
      }
      if (document.kind !== "value") return unavailable("document")
      const shared = { kind: "ready", device: ready.rawDevice, history: ready.history.raw, joined: ready.history.joined,
        raw, stamp: document.document } as const
      if (key.kind === "settings") return { ...shared, selection: { kind: "settings" } } as const
      if (key.kind === "setup") return { ...shared, selection: { kind: "setup" } } as const
      const setupName = documentKey({ kind: "setup", acct: key.acct }), setup = records[setupName]
      if (!Object.hasOwn(records, setupName) || !isJsonObject(setup)) return unavailable("account-context")
      try {
        const supported = decodeDocument(setup, decodeSetup)
        if (supported.kind !== "value") return unavailable("account-context")
      } catch (error) {
        if (error instanceof DecodeError) return unavailable("account-context")
        throw error
      }
      return { ...shared, selection: { kind: "filter", setup } } as const
    }
    function observation(records: Readonly<Record<string, unknown>>, joined: string | null) {
      if (records === null || typeof records !== "object" || Array.isArray(records) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(records)) || Reflect.ownKeys(records).some(key => {
          const descriptor = Object.getOwnPropertyDescriptor(records, key)
          return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable
        })) return unavailable("document")
      const metadata = records["s:meta"]
      if (!Object.hasOwn(records, "s:meta") || !isJsonObject(metadata)) return unavailable("history")
      try {
        const meta = decodeSyncMeta(metadata)
        if (meta.v !== 1 || meta.id !== joined || meta.reset === true) return unavailable("history")
      } catch (error) {
        if (error instanceof DecodeError) return unavailable("history")
        throw error
      }
      const items = Object.entries(records).map(([key, value]) => ({ key, value }))
      const inventory = readSyncInventory({ items })
      if (inventory.kind !== "read") return unavailable("document")
      const candidate = inventory.documents.find(entry => entry.baseKey === `s:${name.slice(4)}`)?.result
      if (candidate?.kind !== "value" || candidate.value.kind !== key.kind) return unavailable("document")
      if (candidate.value.kind === "setup") {
        const setup = candidate.value.document.data
        if (!(setup.autoAdd.length > 0 || setup.quickSave !== null || setup.musicSave !== null || setup.gather !== null)) {
          return unavailable("account-context")
        }
      }
      return { kind: "ready", metadata, candidate } as const
    }
    const initial = context(await guardedLocal.get(null))
    if (initial.kind !== "ready") return initial
    const baseline = { device: snapshot(initial.device), history: snapshot(initial.history), raw: snapshot(initial.raw),
      selection: initial.selection.kind === "filter" ? { kind: "filter", setup: snapshot(initial.selection.setup) } as const : initial.selection }
    const sameSelection = (current: typeof initial.selection) => current.kind !== "filter"
      ? baseline.selection.kind === current.kind
      : baseline.selection.kind === "filter" && sameSyncJson(current.setup, baseline.selection.setup)
    const unchanged = (current: ReturnType<typeof context>) => current.kind === "ready" &&
      sameSyncJson(current.device, baseline.device) && sameSyncJson(current.history, baseline.history) &&
      sameSelection(current.selection) && sameSyncJson(current.raw, baseline.raw)
    const observedRemote = await readJoinSync()
    const remote = observation(observedRemote, initial.joined)
    if (remote.kind === "unavailable" && remote.reason === "history" && isJsonObject(observedRemote)) {
      const records = await local.get(null)
      if (isJsonObject(records)) await signalJoinHistory(records, observedRemote)
    }
    if (disposed()) return unavailable("authority")
    if (remote.kind !== "ready") return remote
    if (sameSyncJson(initial.raw, remote.candidate.json)) return { kind: "idle" }
    const history = decodeSyncState(initial.history)
    if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.stamp.gen) return unavailable("pending")
    const incoming = remote.candidate.value.document
    if (incoming.gen === initial.stamp.gen || incoming.at <= initial.stamp.at) return unavailable("conflict")
    const metadata = snapshot(remote.metadata)
    const document = snapshot(remote.candidate.json)
    const received: SyncDocumentRecord = { key, name, gen: incoming.gen, document }
    const current = context(await guardedLocal.get(null))
    if (!unchanged(current)) return unavailable("authority")
    const preflight = observation(await deps.sync.get(), initial.joined)
    if (disposed()) return unavailable("authority")
    if (preflight.kind !== "ready") return preflight
    if (!sameSyncJson(metadata, preflight.metadata)) return unavailable("history")
    if (!sameSyncJson(document, preflight.candidate.json)) return unavailable("document")
    const latest = context(await guardedLocal.get(null))
    if (latest.kind !== "ready" || !unchanged(latest)) return unavailable("authority")
    const next = repairedHistory(latest.history, [received])
    if (!next) throw new TypeError("Missing incoming acknowledgement")
    try { await guardedLocal.set({ [name]: document, sync: next }) } catch (error) {
      return { kind: "local-set-failed", received, error }
    }
    try {
      const records = await guardedLocal.get(null), post = context(records)
      if (post.kind === "unavailable" && post.reason === "authority" || disposed()) {
        return { kind: "unconfirmed", received, cause: { kind: "authority" } }
      }
      if (post.kind !== "ready" || post.joined !== initial.joined || !sameSyncJson(post.device, baseline.device) || !sameSelection(post.selection)) {
        return { kind: "unconfirmed", received, cause: { kind: post.kind === "ready" || post.reason === "account-context" ? "authority" : "readback" } }
      }
      if (!sameSyncJson(post.raw, document) || !sameSyncJson(post.history, next)) {
        return { kind: "unconfirmed", received, cause: { kind: "readback" } }
      }
      const confirmed = observation(await deps.sync.get(), initial.joined)
      if (disposed() || confirmed.kind === "unavailable" && confirmed.reason === "history" ||
        confirmed.kind === "ready" && !sameSyncJson(metadata, confirmed.metadata)) {
        return { kind: "unconfirmed", received, cause: { kind: "authority" } }
      }
      if (confirmed.kind !== "ready" || !sameSyncJson(document, confirmed.candidate.json)) {
        return { kind: "unconfirmed", received, cause: { kind: "readback" } }
      }
      return { kind: "adopted", received }
    } catch (error) {
      return { kind: "unconfirmed", received, cause: { kind: "read-failed", error } }
    }
  }


  async function flush(event: SyncEvent | undefined): Promise<SyncFlushResult> {
    let records = await (joinHeld ? local : guardedLocal).get(null)
    const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "choice" && isJsonObject(records)) {
      const remote = await readJoinSync()
      if (isJsonObject(remote)) await signalJoinHistory(records, remote)
      return { kind: "unavailable" }
    }
    if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "outbound" && isJsonObject(records)) {
      const result = await flushJoin(event, records, checkpoint.checkpoint.debt)
      if (result.kind === "unconfirmed" || result.kind === "acknowledgement-failed") agreementBarrier()
      return result
    }
    if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")) return { kind: "unavailable" }
    let ready = authority(records)
    if (disposed() || ready.kind !== "ready") return { kind: "unavailable" }
    observeOff(ready.device.syncOn)
    if (!ready.device.syncOn) return { kind: "idle" }
    if (!isJsonObject(records)) return { kind: "unavailable" }
    const loaded = await loadRecovery(snapshot(records))
    if (!loaded || disposed()) return { kind: "unavailable" }
    records = loaded
    ready = authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable" }
    const time = clock()
    if (!time) { cancelTicket(); return { kind: "unavailable" } }
    if (hold && !admitted(event, time)) { cancelTicket(); return recoveryDeferral(time) }
    const observedRemote = await readJoinSync()
    if (isJsonObject(records) && isJsonObject(observedRemote) && await signalJoinHistory(records, observedRemote)) return { kind: "unavailable" }
    let plan = planSyncWrite({ local: records, sync: observedRemote, intent: { kind: "flush" } })
    if (plan.kind === "refused") return plan.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable" }
    if (plan.kind !== "planned") return { kind: "unavailable" }
    if (plan.sent.length === 0 && plan.repairs.length === 0) return { kind: "idle" }
    let prearmed: JsonObject | undefined
    if (plan.sent.length > 0) {
      const before = clock()
      if (!before || !admitted(event, before)) return { kind: "unavailable" }
      const notBefore = Math.max(quietUntil, nextInvocation)
      if (before.mono < notBefore) return { kind: "deferred", notBefore }
      if (!isJsonObject(records) || !isJsonObject(records.sync)) return { kind: "unavailable" }
      const baseline = snapshot(records)
      const current = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(current) || !sameSyncJson(baseline, current)) return { kind: "unavailable" }
      const pending = recoveryHistory(records.sync, { kind: "pending", notBefore: before.wall + 60000 })
      prearmed = { ...baseline, sync: pending }
      await guardedLocal.set({ sync: pending })
      const confirmed = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(confirmed) || !sameSyncJson(prearmed, confirmed)) return { kind: "unavailable" }
      observedGate = isJsonObject(pending.opaqueWrite) ? pending.opaqueWrite.gate : undefined
      const remote = await deps.sync.get()
      const latest = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(latest) || !sameSyncJson(prearmed, latest)) return { kind: "unavailable" }
      const currentReady = authority(latest)
      if (currentReady.kind !== "ready" || !currentReady.device.syncOn) return { kind: "unavailable" }
      const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })
      if (replanned.kind === "refused") return replanned.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable" }
      if (replanned.kind !== "planned" || !sameSyncJson(plan.metadata, replanned.metadata)) return { kind: "unavailable" }
      if (replanned.sent.length === 0 && replanned.repairs.length === 0) return { kind: "unavailable" }
      plan = replanned
    }
    const source: FlushSource = plan.sent.length > 0
      ? { kind: "set", sent: plan.sent, repairs: plan.repairs }
      : { kind: "readback", repairs: plan.repairs }
    if (source.kind === "set") {
      const invoked = clock()
      if (!invoked || !admitted(event, invoked)) return { kind: "unavailable" }
      const invokedAt = invoked.mono
      const notBefore = Math.max(quietUntil, nextInvocation)
      if (invokedAt < notBefore) return { kind: "deferred", notBefore }
      cancelTicket()
      nextInvocation = invokedAt + 5000
      try { await deps.sync.set(Object.fromEntries(plan.items.map(item => [item.key, item.value]))) } catch (error) {
        let rejected: ReturnType<typeof clock>
        let clockError: { error: unknown } | undefined
        try { rejected = clock() } catch (error) { clockError = { error } }
        epoch++
        cancelTicket()
        hold = rejected ? { mono: rejected.mono + 60000, wall: rejected.wall + 60000 }
          : { mono: Infinity, wall: Number.MAX_SAFE_INTEGER }
        try {
          if (clockError) throw clockError.error
          if (!rejected || !prearmed) throw new TypeError("Recovery clock unavailable")
          const current = await guardedLocal.get(null)
          if (disposed() || !isJsonObject(current) || !sameSyncJson(prearmed, current) || !isJsonObject(current.sync)) {
            throw new TypeError("Recovery authority changed")
          }
          const finalizing = clock()
          if (!finalizing) throw new TypeError("Recovery clock unavailable")
          hold.wall = Math.max(hold.wall, finalizing.wall + 60000)
          const held = recoveryHistory(current.sync, { kind: "held", notBefore: hold.wall }, { value: error })
          const expected = { ...snapshot(current), sync: held }
          await guardedLocal.set({ sync: held })
          const confirmed = await guardedLocal.get(null)
          if (!isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) throw new TypeError("Recovery persistence unconfirmed")
          observedGate = isJsonObject(held.opaqueWrite) ? held.opaqueWrite.gate : undefined
        } catch (persistenceError) {
          return { kind: "sync-set-failed", error, sent: plan.sent, recoveryPersistence: { error: persistenceError } }
        }
        return { kind: "sync-set-failed", error, sent: plan.sent }
      }
      hold = undefined
    }
    let latest, postflight, remoteSnapshot
    try {
      latest = await guardedLocal.get(null)
      const current = authority(latest)
      if (current.kind !== "ready" || !current.device.syncOn || !current.history ||
        current.history.joined !== ready.history?.joined || !sameSyncJson(current.rawDevice, ready.rawDevice)) {
        return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "authority" } } : { kind: "unavailable" }
      }
      remoteSnapshot = await deps.sync.get()
      postflight = planSyncWrite({ local: latest, sync: remoteSnapshot, intent: { kind: "flush" } })
    } catch (error) {
      if (source.kind === "set") return { kind: "unconfirmed", sent: plan.sent, cause: { kind: "read-failed", error } }
      throw error
    }
    const captured = [...plan.sent, ...plan.repairs]
    const remoteItems = Object.entries(remoteSnapshot).map(([key, value]) => ({ key, value }))
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
    let next = repairedHistory(rawHistory, captured)
    if (prearmed || observedGate !== undefined) {
      const cleared = recoveryHistory(next ?? rawHistory, null)
      if (!sameSyncJson(cleared, rawHistory)) next = cleared
    }
    if (next) {
      try {
        const baseline = await guardedLocal.get(null)
        if (disposed() || !isJsonObject(baseline) || !isJsonObject(latest) || !sameSyncJson(latest, baseline)) {
          return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "authority" } } : { kind: "unavailable" }
        }
        await guardedLocal.set({ sync: next })
        const confirmed = await guardedLocal.get(null)
        if (disposed() || !isJsonObject(confirmed) || !sameSyncJson({ ...baseline, sync: next }, confirmed)) {
          return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "readback" } } : { kind: "unavailable" }
        }
        observedGate = undefined
        hold = undefined
      } catch (error) {
        return { kind: "acknowledgement-failed", error, source }
      }
    }
    return source.kind === "set" ? { kind: "pushed", sent: plan.sent, repaired: plan.repairs }
      : next ? { kind: "reconciled", repaired: plan.repairs } : { kind: "idle" }
  }

  async function signalJoinHistory(records: JsonObject, remote: JsonObject): Promise<boolean> {
    const metadata = remote["s:meta"]
    if (!isJsonObject(metadata) || !isJsonObject(records.device) || !isJsonObject(records.sync)) return false
    try { const supported = decodeSyncMeta(metadata); if (supported.v !== 1 || supported.reset === true) return false } catch { return false }
    const device = decodeDevice(records.device), history = decodeSyncState(records.sync)
    if (!device.syncOn || device.consent?.v !== CONSENT_VERSION || history.joined === null) return false
    const read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    const existing = read.kind === "valid" ? read.checkpoint : undefined
    if (read.kind !== "absent" && !existing) return true
    const expected = existing?.phase === "outbound" ? decodeSyncMeta(existing.debt.target.metadata).id : history.joined
    if (metadata.id === expected && existing?.phase !== "choice") return false
    if (existing?.phase === "accepted" || existing?.phase === "off") return true
    if (existing?.phase === "choice" && sameSyncJson(existing.observedMetadata, metadata)) return true
    const suspended = existing?.phase === "outbound" ? { kind: "outbound", debt: existing.debt } as const : existing?.phase === "choice" ? existing.suspended : { kind: "none" } as const
    const checkpoint: SyncJoinCheckpointV1 = { v: 1, kind: "sync-join", phase: "choice", lastJoined: history.joined, observedMetadata: metadata, suspended }
    const record = transitionSyncJoin(read.kind === "valid" ? read.raw : undefined, checkpoint)
    cancelTicket()
    const write = await setJoinStage(joinDeps, "debt", records, { [pendingSyncJoinKey]: record })
    if (write.kind !== "resolved" && write.kind !== "rejected") joinOutcome(write)
    return true
  }
  async function flushJoin(event: SyncEvent | undefined, initial: JsonObject, debt: JoinOutboundDebt): Promise<SyncFlushResult> {
    const valid = (records: JsonObject) => {
      const state = readJoinLocal(records)
      if (state.kind !== "local" || !isJsonObject(records.device) || !isJsonObject(records.sync)) return false
      const device = decodeDevice(records.device), history = decodeSyncState(records.sync)
      return device.syncOn && device.id === debt.deviceId && agreementSame(device.consent, debt.consent) && history.joined === decodeSyncMeta(debt.target.metadata).id && debt.selectedDocuments.length === state.documents.length && debt.selectedDocuments.every(x => sameJoinStored(records, documentKey(x.key), { kind: "present", value: x.document }))
    }
    if (!valid(initial)) return { kind: "unavailable" }
    let loaded: JsonObject | undefined
    try { loaded = await loadRecovery(snapshot(initial)) } catch (error) { agreementBarrier(); throw error }
    if (!loaded) agreementBarrier()
    if (!loaded || disposed()) return { kind: "unavailable" }
    let baseline = loaded
    const time = clock()
    if (!time) return { kind: "unavailable" }
    if (hold && !admitted(event, time)) return recoveryDeferral(time)
    let remote = await readJoinSync()
    if (!isJsonObject(remote)) return { kind: "unavailable" }
    if (await signalJoinHistory(baseline, remote)) return { kind: "unavailable" }
    let plan = projectJoinDebt(debt, remote)
    if (plan.kind !== "planned") return plan.kind === "refused" && plan.reason === "sync-full" ? { kind: "blocked" } : plan.kind === "unavailable" && plan.reason === "changed-generation" ? { kind: "unavailable", reason: "changed-generation" } : { kind: "unavailable" }
    if (plan.items.length) {
      const before = clock()
      if (!before || !admitted(event, before)) return recoveryDeferral(time)
      const notBefore = Math.max(nextInvocation, quietUntil)
      if (before.mono < notBefore) return { kind: "deferred", notBefore }
      if (!isJsonObject(baseline.sync)) return { kind: "unavailable" }
      const pending = recoveryHistory(baseline.sync, { kind: "pending", notBefore: before.wall + 60000 })
      const write = await setJoinStage(joinDeps, "debt", baseline, { sync: pending })
      if (write.kind !== "resolved" && write.kind !== "rejected") { joinOutcome(write); return { kind: "unavailable" } }
      baseline = { ...baseline, sync: pending }
      observedGate = isJsonObject(pending.opaqueWrite) ? pending.opaqueWrite.gate : undefined
      remote = await readJoinSync()
      const current = await local.get(null)
      if (disposed() || !isJsonObject(current) || !sameSyncJson(current, baseline) || !valid(current) || !isJsonObject(remote)) { agreementBarrier(); return { kind: "unavailable" } }
      if (await signalJoinHistory(baseline, remote)) return { kind: "unavailable" }
      plan = projectJoinDebt(debt, remote)
      if (plan.kind !== "planned") return plan.kind === "refused" && plan.reason === "sync-full" ? { kind: "blocked" } : plan.kind === "unavailable" && plan.reason === "changed-generation" ? { kind: "unavailable", reason: "changed-generation" } : { kind: "unavailable" }
    }
    const sent = plan.sent
    const expectedRemote = { ...remote, ...Object.fromEntries(plan.items.map(x => [x.key, x.value])) }
    if (plan.items.length) {
      const invoked = clock()
      if (!invoked || !admitted(event, invoked)) return { kind: "unavailable" }
      const notBefore = Math.max(nextInvocation, quietUntil)
      if (invoked.mono < notBefore) return { kind: "deferred", notBefore }
      nextInvocation = invoked.mono + 5000; cancelTicket()
      try { await deps.sync.set(Object.fromEntries(plan.items.map(x => [x.key, x.value]))) }
      catch (error) {
        let rejected: ReturnType<typeof clock>
        let clockError: { error: unknown } | undefined
        try { rejected = clock() } catch (error) { clockError = { error } }
        epoch++; cancelTicket()
        hold = rejected ? { mono: rejected.mono + 60000, wall: rejected.wall + 60000 } : { mono: Infinity, wall: Number.MAX_SAFE_INTEGER }
        try {
          if (clockError) throw clockError.error
          if (!rejected || !isJsonObject(baseline.sync)) throw new TypeError("Join recovery clock unavailable")
          const finalizing = clock()
          if (!finalizing) throw new TypeError("Join recovery clock unavailable")
          hold.wall = Math.max(hold.wall, finalizing.wall + 60000)
          const held = recoveryHistory(baseline.sync, { kind: "held", notBefore: hold.wall }, { value: error })
          const write = await setJoinStage(joinDeps, "debt", baseline, { sync: held })
          if (write.kind !== "resolved" && write.kind !== "rejected") { joinOutcome(write); throw new TypeError("Join recovery persistence unconfirmed") }
          observedGate = isJsonObject(held.opaqueWrite) ? held.opaqueWrite.gate : undefined
        } catch (persistenceError) { return { kind: "sync-set-failed", error, sent, recoveryPersistence: { error: persistenceError } } }
        return { kind: "sync-set-failed", error, sent }
      }
    }
    let confirmed: JsonObject, observed: JsonObject
    try {
      const current = await local.get(null), raw = await readJoinSync()
      if (!isJsonObject(current) || !sameSyncJson(baseline, current) || !valid(current) || disposed()) return { kind: "unconfirmed", sent, cause: { kind: "authority" } }
      if (!isJsonObject(raw)) return { kind: "unconfirmed", sent, cause: { kind: "readback" } }
      confirmed = current; observed = raw
    } catch (error) { agreementBarrier(); return { kind: "unconfirmed", sent, cause: { kind: "read-failed", error } } }
    const post = projectJoinDebt(debt, observed)
    if (post.kind !== "planned" || post.items.length || !sameSyncJson(expectedRemote, observed)) { agreementBarrier(); return { kind: "unconfirmed", sent, cause: { kind: "readback" } } }
    if (!isJsonObject(confirmed.sync)) return { kind: "unavailable" }
    const all = debt.selectedDocuments.map(x => ({ key: x.key, name: documentKey(x.key), gen: String(x.document.gen), document: x.document }))
    const acknowledged = repairedHistory(confirmed.sync, all) ?? confirmed.sync
    const next = { ...recoveryHistory(acknowledged, null), status: "ok" }
    const write = await setJoinStage(joinDeps, "acknowledge", confirmed, { sync: next })
    if (write.kind !== "resolved" && write.kind !== "rejected") {
      joinOutcome(write)
      return write.kind === "failed" ? { kind: "acknowledgement-failed", error: "write" in write ? write.write.error : write.error, source: { kind: "set", sent, repairs: [] } } : { kind: "unconfirmed", sent, cause: { kind: "readback" } }
    }
    const retired = await retireJoin(joinDeps, { ...confirmed, sync: next })
    if (retired.kind !== "resolved" && retired.kind !== "rejected") { joinOutcome(retired); return { kind: "unconfirmed", sent, cause: { kind: "readback" } } }
    observedGate = undefined; hold = undefined; initialization = "ok"
    return sent.length ? { kind: "pushed", sent, repaired: [] } : { kind: "reconciled", repaired: all }
  }

  function noticeUnavailable(): Extract<ClaimNoticeRead, { kind: "unavailable" }> | undefined {
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (disposed() || claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
  }

  function removalUnavailable(): Extract<RemovalResult, { kind: "unavailable" }> | undefined {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (claimConfirmation === "unconfirmed" || joinHeld) return { kind: "unavailable", reason: "stale" }
  }
  function removalOrigin(origin: UiOrigin): Extract<RemovalResult, { kind: "result" }> | undefined {
    if (!isJsonObject(origin) || origin.kind !== "ui" || !Number.isSafeInteger(origin.windowId) || origin.windowId < 0) return { kind: "result", result: { refused: "invalid" } }
    if (origin.incognito !== false) return { kind: "result", result: { refused: "private" } }
  }

  function agreementJson(raw: unknown): JsonObject { if (!isJsonObject(raw)) throw new TypeError("Invalid agreement JSON"); return snapshot(raw) }
  function agreementSame(left: unknown, right: unknown): boolean { return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right) }
  function agreementUnavailable(): AgreementUnavailable | undefined {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
    if (initialization === "newer-layout") return { kind: "unavailable", reason: "newer-layout" }
    if (initialization === "interim-held") {
      if (!startup || !interimResult || !["retained-but-held", "retained-agreement", "pending-agreement"].includes(interimResult.kind)) return { kind: "unavailable", reason: "retention" }
    } else if (initialization !== "ok") return { kind: "unavailable", reason: "startup" }
  }
  function agreementBarrier() {
    cancelJoinPreparations()
    claimConfirmation = "unconfirmed"
    agreementRevision++
    deactivate("stopped")
    listeners.clear()
  }
  type AgreementObservation = { readonly kind: "observation"; readonly records: JsonObject; readonly retained: InterimPersistenceSnapshot | undefined }
  async function observeAgreement(): Promise<AgreementObservation | Extract<AgreementRead, { kind: "invalid" }> | AgreementUnavailable> {
    const records = await local.get(null)
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    if (!isJsonObject(records)) return { kind: "invalid", field: "records" }
    if (Object.hasOwn(records, pendingAccountRemovalKey)) return { kind: "unavailable", reason: "pending-removal" }
    if (joinHeld) return { kind: "unavailable", reason: "pending-join" }
    let retained: InterimPersistenceSnapshot | undefined
    if (startup) {
      const raw = await startup.readInterimSnapshot()
      if (!isJsonValue(raw)) { agreementRevision++; return { kind: "invalid", field: "records" } }
      retained = detachAgreement(raw)
      const selected = (keep: (name: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([name]) => keep(name)))
      const checkpoint = Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey] } : { kind: "absent" }
      if (!sameSyncJson(selected(isInterimSourceKey), retained.source as JsonObject) || !sameSyncJson(selected(isInterimCanonicalKey), retained.canonical as JsonObject) || !sameSyncJson(checkpoint as JsonObject, retained.checkpoint as JsonObject)) {
        agreementRevision++
        return { kind: "unavailable", reason: "stale" }
      }
    }
    if (initialization === "interim-held") {
      if (!retained || !interimResult || !("checkpoint" in interimResult)) return { kind: "unavailable", reason: "retention" }
      const current = readRetainedCheckpoint(records[interimConversionKey])
      if (current.kind !== "valid" && current.kind !== "agreement" || retainedCheckpointDifference(current.checkpoint, retained)) { agreementRevision++; return { kind: "unavailable", reason: "retention" } }
      if (!agreementSame(interimResult.checkpoint, current.checkpoint)) { agreementRevision++; return { kind: "unavailable", reason: "stale" } }
    } else if (hasInterimMarkers(records)) return { kind: "unavailable", reason: "retention" }
    return agreementUnavailable() ?? { kind: "observation", records, retained }
  }
  async function agreementSet(stage: AgreementStage, baseline: JsonObject, items: JsonObject): Promise<AgreementWrite | Exclude<AgreementResult, { kind: "committed" | "unchanged" }>> {
    const preflight = await observeAgreement()
    if (preflight.kind !== "observation" || !sameSyncJson(baseline, preflight.records)) return { kind: "unavailable", reason: "stale" }
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    let write: AgreementWrite = { kind: "resolved" }
    try { await local.set(snapshot(items)) } catch (error) { write = { kind: "rejected", error } }
    let observed: Readonly<Record<string, unknown>>
    try {
      observed = await local.get(null)
      if (startup) {
        const host = await startup.readInterimSnapshot()
        if (!isJsonValue(host) || !isJsonObject(observed) ||
          !sameSyncJson(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimSourceKey(key))), host.source as JsonObject) ||
          !sameSyncJson(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimCanonicalKey(key))), host.canonical as JsonObject) ||
          !sameSyncJson((Object.hasOwn(observed, interimConversionKey) ? { kind: "present", value: observed[interimConversionKey] } : { kind: "absent" }) as JsonObject, host.checkpoint as JsonObject) ||
          initialization === "interim-held" && interimResult && "checkpoint" in interimResult &&
            (!sameSyncJson((interimResult.checkpoint.v === 1 ? interimResult.checkpoint : interimResult.checkpoint.retained).historicalAuthorization, host.historicalAuthorization) ||
             !sameSyncJson((interimResult.checkpoint.v === 1 ? interimResult.checkpoint : interimResult.checkpoint.retained).priorCredentialPresence, host.priorCredentialPresence))) {
          agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
        }
      }
    } catch (error) {
      agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "read-failed", error } }
    }
    if (disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "stopped" } } }
    if (isJsonObject(observed) && sameSyncJson({ ...baseline, ...items }, observed)) return write
    if (write.kind === "rejected" && isJsonObject(observed) && sameSyncJson(baseline, observed)) return { kind: "failed", stage, write }
    agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
  }
  function savedRetained(checkpoint: Snapshot<RetainedAgreementV2>) {
    interimResult = { kind: checkpoint.agreement.kind === "accepted" ? "pending-agreement" : "retained-agreement", checkpoint }
  }
  async function finishRetainedAgreement(baseline: JsonObject, checkpoint: Snapshot<RetainedAgreementV2>, mutations: { stage: AgreementStage; write: AgreementWrite }[]): Promise<AgreementResult> {
    const consent = checkpoint.agreement.effect.consent
    const device = agreementJson(Object.getOwnPropertyDescriptor(checkpoint.agreement.effect, "device")?.value)
    if (checkpoint.agreement.kind === "confirmed") return { kind: "unchanged", reason: "already-agreed", consent: { ...consent }, activation: "held" }

    if (!Object.hasOwn(baseline, "device") || !agreementSame(baseline.device, device)) {
      const write = await agreementSet("device", baseline, { device: snapshot(device) })
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "device", write })
      baseline = { ...baseline, device: snapshot(device) }
    }
    const confirmed = { ...agreementJson(checkpoint), agreement: { kind: "confirmed", effect: { consent: { ...consent }, device } } }
    if (!isJsonObject(confirmed)) return { kind: "refused", reason: "invalid" }
    const write = await agreementSet("record", baseline, { [interimConversionKey]: confirmed })
    if (write.kind !== "resolved" && write.kind !== "rejected") return write
    mutations.push({ stage: "record", write })
    const read = readRetainedCheckpoint(confirmed)
    if (read.kind !== "agreement") throw new TypeError("Invalid confirmed agreement")
    savedRetained(read.checkpoint)
    return { kind: "committed", consent: { ...consent }, settingsChanged: false, blocked: [], applications: [], mutations, activation: "held" }
  }
  async function readAgreement(origin: UiOrigin): Promise<AgreementRead> {
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    if (!agreementOrigin(origin)) return { kind: "invalid", field: "records" }
    const caller = snapshot(origin)
    return enqueue(async () => {
      const stopped = agreementUnavailable()
      if (stopped) return stopped
      try {
        const current = await observeAgreement()
        if (current.kind !== "observation") return current
        const { records, retained } = current
        let presentation: Extract<AgreementRead, { kind: "review" }>["presentation"]
        if (initialization === "interim-held") {
          const read = readRetainedCheckpoint(records[interimConversionKey])
          if (read.kind !== "valid" && read.kind !== "agreement") return { kind: "unavailable", reason: "retention" }
          if (read.kind === "agreement" && read.checkpoint.agreement.kind === "accepted") return { kind: "pending", consent: freezeAgreement(read.checkpoint.agreement.effect.consent), action: "resume-retained-agreement", activation: "held" }
          const original = read.kind === "valid" ? read.checkpoint : read.checkpoint.retained
          const device = Object.hasOwn(records, "device") ? records.device : undefined
          if (device !== undefined && (!isJsonObject(device) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(device, key)))) return { kind: "invalid", field: "device" }
          let consent = null
          if (device !== undefined) {
            const decoded = decodeDevice(device)
            if (decoded.consent && decoded.consent.v > CONSENT_VERSION) return { kind: "unavailable", reason: "newer-consent" }
            consent = decoded.consent
          }
          const outcome = original.outcome
          presentation = { kind: "retained", consent, historicalAuthorization: original.historicalAuthorization, priorCredentialPresence: original.priorCredentialPresence,
            recovery: original.recovery, agreement: read.kind === "agreement" ? "confirmed" : "required", activation: "held",
            details: outcome.kind === "blocked" ? { kind: "blocked" } : { kind: "available", percentage: outcome.note.percentage, feedback: outcome.note.feedback, globals: outcome.note.globals.kind } }
        } else {
          const state = readCanonicalAgreement(records)
          if (state.kind !== "canonical-state") return state
          presentation = { kind: "canonical", consent: state.device?.consent ?? null, note: state.device?.upgradeNote ?? null, settings: state.settings, syncOn: state.device?.syncOn ?? false }
        }
        const review: AgreementReview = Object.freeze({ kind: "agreement-review" })
        agreementReviews.set(review, { origin: caller, records: snapshot(records), revision: agreementRevision, retained, context: agreementContext, consumed: false })
        return { kind: "review", version: CONSENT_VERSION, review, presentation: freezeAgreement(presentation) }
      } catch { return { kind: "unavailable", reason: "stale" } }
    })
  }
  function agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult> {
    const accessDescriptor = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "access") : undefined
    const access = Promise.resolve(accessDescriptor && "value" in accessDescriptor ? accessDescriptor.value : undefined).then(
      value => ({ kind: "observed", value: agreementAccess(value) ? detachAgreement(value) : undefined } as const), error => ({ kind: "rejected", error } as const))
    let at: number
    try { at = deps.now() } catch (error) { return Promise.resolve({ kind: "failed", stage: "before-set", error }) }
    const version = CONSENT_VERSION
    const stopped = agreementUnavailable()
    if (stopped) return Promise.resolve(stopped)
    if (!agreementOrigin(origin) || !Number.isSafeInteger(at) || at < 0 || !input || typeof input !== "object" || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== 4 || Reflect.ownKeys(input).some(key => typeof key !== "string" || !["review", "displayedVersion", "choice", "access"].includes(key) || !("value" in (Object.getOwnPropertyDescriptor(input, key) ?? {})))) return Promise.resolve({ kind: "refused", reason: "invalid" })
    const choice = parseAgreementChoice(input.choice), displayedVersion = input.displayedVersion
    if (choice.kind === "unavailable" || choice.kind === "refused") return Promise.resolve(choice)
    const caller = snapshot(origin), captured = agreementReviews.get(input.review)
    if (!captured || !sameSyncJson(caller, captured.origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
    const joining = (choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn && choice.join.kind === "prepare" ? beginJoin(origin, true) : undefined
    return (joining ? joining.result : Promise.resolve(undefined)).then(joinPreparation => enqueue(async () => {
      const stopped = agreementUnavailable()
      if (stopped) return stopped
      const permission = await access
      if (permission.kind === "rejected") return { kind: "failed", stage: "before-set", error: permission.error }
      if (!agreementAccess(permission.value)) return { kind: "refused", reason: "invalid" }
      const observedAccess = detachAgreement(permission.value)
      const action = { choice, access: observedAccess, displayedVersion }
      if (!isJsonObject(action)) return { kind: "refused", reason: "invalid" }
      try {
        const current = await observeAgreement()
        if (current.kind !== "observation") return current.kind === "invalid" ? { kind: "refused", reason: "invalid" } : current
        if (captured.terminal) {
          if (captured.terminal.revision === agreementRevision && sameSyncJson(action, captured.terminal.action) && sameSyncJson(current.records, captured.terminal.after)) return { kind: "unchanged", reason: "already-agreed", consent: captured.terminal.result.consent, activation: captured.terminal.result.activation }
          return { kind: "unavailable", reason: "stale" }
        }
        if (captured.consumed || captured.revision !== agreementRevision || !sameSyncJson(captured.records, current.records) ||
          (captured.retained && (!current.retained || !isJsonValue(current.retained) || !sameSyncJson(captured.retained as JsonObject, current.retained)))) return { kind: "unavailable", reason: "stale" }
        if (displayedVersion !== version) return { kind: "unavailable", reason: "newer-consent" }
        if (!((choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn)) captured.consumed = true
        const consent = { v: version, at }
        let result: AgreementResult
        let terminalAfter: JsonObject | undefined
        if (initialization === "interim-held") {
          if (choice.kind !== "retained-disclosure") return { kind: "unavailable", reason: "retention" }
          const read = readRetainedCheckpoint(current.records[interimConversionKey])
          if (read.kind === "agreement") {
            if (read.checkpoint.agreement.kind !== "confirmed") return { kind: "unavailable", reason: "pending-agreement" }
            const result = { kind: "unchanged", reason: "already-agreed", consent: { ...read.checkpoint.agreement.effect.consent }, activation: "held" } as const
            captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(current.records), result: freezeAgreement(result) }
            return result
          }
          if (read.kind !== "valid") return { kind: "unavailable", reason: "retention" }
          const device = retainedAgreementDevice(read.checkpoint, consent)
          if (!device) return { kind: "refused", reason: "invalid" }
          const accepted: JsonObject = { v: 2, kind: "retained-interim", retained: agreementJson(read.checkpoint), agreement: { kind: "accepted", effect: { consent, device } } }
          if (!isJsonObject(accepted)) return { kind: "refused", reason: "invalid" }
          const validated = readRetainedCheckpoint(accepted)
          if (validated.kind !== "agreement") return { kind: "refused", reason: "invalid" }
          const write = await agreementSet("accept", current.records, { [interimConversionKey]: accepted })
          if (write.kind !== "resolved" && write.kind !== "rejected") return write
          savedRetained(validated.checkpoint)
          result = await finishRetainedAgreement({ ...current.records, [interimConversionKey]: accepted }, validated.checkpoint, [{ stage: "accept", write }])
          if (result.kind === "committed") terminalAfter = { ...current.records, device, [interimConversionKey]: { ...accepted, agreement: { kind: "confirmed", effect: { consent, device } } } }
        } else {
          if (choice.kind === "retained-disclosure") return { kind: "unavailable", reason: "retention" }
          if (choice.kind === "first-run" && captured.context !== "first-run" || choice.kind === "upgrade-note" && captured.context !== "upgrade-note") return { kind: "unavailable", reason: "startup" }
          const state = readCanonicalAgreement(current.records)
          if (state.kind !== "canonical-state") return state.kind === "invalid" ? { kind: "refused", reason: "invalid" } : state
          if (state.device?.upgradeNote?.state === "pending" && choice.kind !== "upgrade-note") return { kind: "unavailable", reason: "upgrade-note" }
          if ((choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn) {
            if (joinPreparation && joinPreparation.kind !== "automatic") return joinPreparation.kind === "cancelled" ? { kind: "unavailable", reason: "stale" } : joinPreparation
            const review = choice.join.kind === "answer" ? choice.join.review : joinPreparation?.kind === "automatic" ? joinPreparation.review : undefined
            if (!review || !agreementCreation) return { kind: "unavailable", reason: "creation-context" }
            const joinCapture = await validateJoinCapture(caller, review, true)
            if (!joinCapture || choice.join.kind === "answer" && joinCapture.classification !== "choice-required") return { kind: "unavailable", reason: "stale" }
            const side = choice.join.kind === "answer" ? choice.join.choice : undefined
            const localSettings = joinCapture.local["doc:settings"], remoteSettings = joinCapture.remote.documents.find(x => x.key.kind === "settings")?.document
            const selected = side === "use-this-browser" || joinCapture.remote.target.kind === "empty" ? localSettings ?? remoteSettings : remoteSettings ?? localSettings
            const reviewed = { ...current.records }
            if (selected !== undefined) reviewed["doc:settings"] = selected
            const selectedState = readCanonicalAgreement(reviewed)
            if (selectedState.kind !== "canonical-state") return { kind: "refused", reason: "invalid" }
            const plan = prepareCanonicalAgreement({ records: reviewed, state: selectedState, choice, access: observedAccess, consent, context: agreementCreation })
            if (plan.kind !== "prepared") return plan
            const facts: JoinAgreementFacts = choice.kind === "first-run" ? { kind: choice.kind, selected: choice.selected, access: observedAccess, consent, context: agreementCreation, reservedUnclaimed: joinStored(current.records, "unclaimed") }
              : { kind: choice.kind, selected: choice.selected, percentage: choice.percentage, access: observedAccess, consent, context: agreementCreation, reservedUnclaimed: joinStored(current.records, "unclaimed") }
            const joined = await acceptJoin(joinCapture, side, facts, at)
            if (joined.kind === "cancelled") return { kind: "unavailable", reason: "stale" }
            if (joined.kind !== "committed") return joined
            captured.consumed = true
            return { kind: "joined", consent, join: joined, activation: "ordinary-gates", settingsChanged: plan.settings !== undefined, applications: plan.applications, blocked: plan.blocked }
          }
          const plan = prepareCanonicalAgreement({ records: current.records, state, choice, access: observedAccess, consent, context: agreementCreation })
          if (plan.kind !== "prepared") return plan
          const items: JsonObject = { device: plan.device }
          if (plan.settings) {
            const raw = current.records["doc:settings"]
            const envelope: JsonObject = { ...(isJsonObject(raw) ? raw : {}), v: DOCUMENT_VERSION, gen: deps.generation(), at, by: plan.device.id!, data: plan.settings }
            delete envelope.deleted
            if (decodeDocument(envelope, decodeSettings).kind !== "value") return { kind: "refused", reason: "invalid" }
            items["doc:settings"] = envelope
            if (state.device?.syncOn) {
              const admission = planSyncWrite({ local: current.records, sync: await deps.sync.get(), intent: { kind: "changed-batch", documents: [{ key: { kind: "settings" }, document: envelope }] } })
              if (admission.kind === "refused") return admission
              if (admission.kind !== "planned" || !isJsonObject(current.records.sync)) return { kind: "unavailable", reason: "sync-writer-required" }
              const repaired = repairedHistory(current.records.sync, admission.repairs)
              if (repaired) items.sync = repaired
            }
            const history = prepareFirstEditHistory({ history: Object.hasOwn(current.records, "sync") ? { kind: "present", raw: items.sync ?? current.records.sync } : { kind: "absent" }, syncOn: state.device?.syncOn ?? false })
            if (history.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
            if (history.kind === "set") items.sync = history.sync
          } else if (choice.kind !== "disclosure" && state.device?.syncOn) {
            const admission = planSyncWrite({ local: current.records, sync: await deps.sync.get(), intent: { kind: "unchanged", key: { kind: "settings" } } })
            if (admission.kind === "refused") return admission
            if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
          }
          if (!plan.settings && state.device?.consent?.v === version && state.device.upgradeNote?.state !== "pending") {
            const result = { kind: "unchanged", reason: "already-agreed", consent: { ...state.device.consent }, activation: "ordinary-gates" } as const
            captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(current.records), result: freezeAgreement(result) }
            return result
          }
          if (plan.clearProgress) for (const [key, value] of Object.entries(current.records)) {
            if (!key.startsWith("progress:")) continue
            if (!/^progress:[A-Za-z0-9_-]{16}:(?:[0-9]|1[0-5])$/.test(key) || !isJsonObject(value)) return { kind: "refused", reason: "invalid" }
            items[key] = {}
          }
          const write = await agreementSet("canonical", current.records, items)
          if (write.kind !== "resolved" && write.kind !== "rejected") return write
          result = { kind: "committed", consent, settingsChanged: plan.settings !== undefined, blocked: plan.blocked, applications: plan.applications,
            mutations: [{ stage: "canonical", write }], activation: "ordinary-gates" }
          terminalAfter = { ...current.records, ...items }
          if (plan.settings) emitSettings("local")
        }
        if (result.kind === "committed") {
          const after = terminalAfter
          if (!after || disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage: initialization === "interim-held" ? "record" : "canonical", write: result.mutations.at(-1)?.write ?? { kind: "resolved" }, cause: { kind: "stopped" } } }
          captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(after), result: freezeAgreement(result) }
        }
        return result
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    }))
  }
  function resumeRetainedAgreement(origin: UiOrigin): Promise<AgreementResult> {
    const blocked = agreementUnavailable()
    if (blocked) return Promise.resolve(blocked)
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    if (!startup || initialization !== "interim-held") return Promise.resolve({ kind: "unavailable", reason: "retention" })
    return enqueue(async () => {
      const blocked = agreementUnavailable()
      if (blocked) return blocked
      try {
        const current = await observeAgreement()
        if (current.kind !== "observation") return current.kind === "invalid" ? { kind: "refused", reason: "invalid" } : current
        const read = readRetainedCheckpoint(current.records[interimConversionKey])
        if (read.kind !== "agreement") return { kind: "unavailable", reason: "pending-agreement" }
        return await finishRetainedAgreement(current.records, read.checkpoint, [])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }

  type JoinCapture = { readonly origin: JsonObject; readonly local: JsonObject; readonly remote: JoinRemote; readonly revision: number; readonly remoteRevision: number; readonly classification: Extract<SyncJoinPreparation, { kind: "automatic" | "choice-required" }>["kind"]; readonly agreementOnly: boolean; consumed: boolean; cancelled(): boolean; cancel(): void }
  const joinReviews = new WeakMap<SyncJoinReview, JoinCapture>()
  const joinPreparations = new Set<{ origin: JsonObject; cancel(): void }>()
  function cancelJoinPreparations() { for (const operation of [...joinPreparations]) operation.cancel() }
  async function readJoinSync() {
    const raw = await deps.sync.get()
    if (!isJsonObject(raw)) { joinRemoteRevision++; return raw }
    const records = snapshot(raw)
    if (observedJoinRemote && !sameSyncJson(observedJoinRemote, records)) joinRemoteRevision++
    observedJoinRemote = snapshot(records)
    return records
  }
  function joinBlocked(allowPending = true) {
    if (disposed()) return joinUnavailable("disposed")
    if (claimConfirmation === "unconfirmed") return joinUnavailable("stale")
    if (initialization === "interim-held") return joinUnavailable("retention")
    if (initialization === "newer-layout") return joinUnavailable("newer-layout")
    if (initialization !== "ok" && !(allowPending && initialization === "pending-join")) return joinUnavailable("startup")
  }
  function joinOutcome(result: SyncJoinResult) {
    if (result.kind === "unconfirmed") agreementBarrier()
    return result
  }
  function beginJoin(origin: UiOrigin, agreementOnly: boolean): SyncJoinOperation {
    if (!agreementOrigin(origin)) return { result: Promise.resolve({ kind: "refused", reason: "invalid" }), cancel() {} }
    const caller = snapshot(origin), blocked = joinBlocked()
    if (blocked) return { result: Promise.resolve(blocked), cancel() {} }
    if (join.kind !== "fixture") return { result: Promise.resolve(joinUnavailable("join-host")), cancel() {} }
    let resolve!: (value: SyncJoinPreparation) => void
    const result = new Promise<SyncJoinPreparation>(done => { resolve = done })
    let done = false, cancelled = false, reading = false, again = false, deadline = false
    let empty: JoinRemote | undefined, cancelDeadline = () => {}, unsubscribe = () => {}
    const operation = { origin: caller, cancel() {
      if (cancelled) return
      cancelled = true; cancelDeadline(); unsubscribe(); joinPreparations.delete(operation)
      if (!done) { done = true; resolve({ kind: "cancelled" }) }
    } }
    joinPreparations.add(operation)
    function finish(value: SyncJoinPreparation) {
      if (done || cancelled) return
      done = true; cancelDeadline()
      if (value.kind !== "automatic" && value.kind !== "choice-required") { unsubscribe(); joinPreparations.delete(operation) }
      resolve(value)
    }
    async function publish(remote: JoinRemote) {
      if (cancelled || done) return
      const blocked = joinBlocked(); if (blocked) { finish(blocked); return }
      const localRead = readJoinLocal(await local.get(null), agreementOnly)
      if (cancelled || done) return
      if (localRead.kind !== "local") { finish(localRead); return }
      const checkpoint = readSyncJoinCheckpoint(localRead.records[pendingSyncJoinKey])
      if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "choice" || checkpoint.checkpoint.phase === "off"))) { finish(joinUnavailable("pending-join")); return }
      if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "choice" && checkpoint.checkpoint.suspended.kind === "accepted") { finish(joinUnavailable("pending-join")); return }
      const classification = classifySyncJoin(localRead.records, remote)
      if (classification.kind === "unavailable") { finish(classification); return }
      const review: SyncJoinReview = Object.freeze({ kind: "sync-join-review" })
      joinReviews.set(review, { origin: caller, local: snapshot(localRead.records), remote: detachAgreement(remote), revision: agreementRevision, remoteRevision: joinRemoteRevision, classification: classification.kind, agreementOnly, consumed: false, cancelled: () => cancelled, cancel: operation.cancel })
      finish(classification.kind === "automatic" ? { ...classification, review } : { ...classification, review, defaultChoice: "use-synced" })
    }
    async function observe() {
      if (cancelled || done) return
      if (reading) { again = true; return }
      reading = true
      try {
        const revision = joinRemoteRevision, raw = await readJoinSync()
        if (cancelled || done) return
        const remote = readJoinRemote(raw)
        if (remote.kind !== "remote") {
          empty = undefined
          if (remote.kind !== "unavailable" || remote.reason !== "incomplete" || deadline) finish(remote)
          return
        }
        if (remote.target.kind !== "empty") empty = undefined
        if (remote.target.kind === "empty" && !deadline) empty = remote
        else if (revision === joinRemoteRevision || !again) await enqueue(() => publish(remote))
      } catch (error) { finish({ kind: "failed", stage: "prepare", error }) }
      finally { reading = false; if (again && !cancelled && !done) { again = false; void observe() } }
    }
    try {
      unsubscribe = deps.sync.subscribe(() => { joinRemoteRevision++; if (!done) void observe() })
      cancelDeadline = deps.syncClock.after(10000, () => {
        if (cancelled || done) return
        deadline = true
        if (reading || !empty) finish(joinUnavailable("incomplete"))
        else void enqueue(() => publish(empty!))
      })
      void observe()
    } catch (error) { finish({ kind: "failed", stage: "prepare", error }) }
    return { result, cancel: operation.cancel }
  }
  async function validateJoinCapture(origin: JsonObject, review: SyncJoinReview, agreementOnly: boolean) {
    const capture = joinReviews.get(review)
    if (!capture || capture.consumed || capture.cancelled() || capture.agreementOnly !== agreementOnly || !agreementSame(origin, capture.origin)) return
    const current = await local.get(null), remote = await readJoinSync()
    if (joinBlocked() || !isJsonObject(current) || !isJsonObject(remote) || capture.revision !== agreementRevision || capture.remoteRevision !== joinRemoteRevision || !sameSyncJson(capture.local, current) || !sameSyncJson(capture.remote.records, remote)) return
    return capture
  }
  async function acceptJoin(capture: JoinCapture, side: SyncJoinSide | undefined, facts: JoinAgreementFacts, at: number): Promise<SyncJoinResult> {
    if (join.kind !== "fixture") return joinUnavailable("join-host")
    const classification = classifySyncJoin(capture.local, capture.remote)
    if (classification.kind === "unavailable") return classification
    const decision = classification.kind === "automatic" ? classification.reason === "empty-copy" ? { kind: "create-copy" } as const : { kind: "proven-never-edited" } as const : side ? { kind: "explicit", side } as const : undefined
    if (!decision || capture.classification !== classification.kind) return joinUnavailable("stale")
    const prepared = prepareJoinEffect({ local: capture.local, remote: capture.remote, decision, agreement: facts, at, generation: deps.generation })
    if (prepared.kind !== "prepared") return prepared
    const current = await local.get(null), remote = await readJoinSync()
    if (!isJsonObject(current) || !isJsonObject(remote) || capture.revision !== agreementRevision || capture.remoteRevision !== joinRemoteRevision || !sameSyncJson(capture.local, current) || !sameSyncJson(capture.remote.records, remote) || joinBlocked()) return joinUnavailable("stale")
    capture.consumed = true; capture.cancel(); cancelTicket()
    const accepted: SyncJoinCheckpointV1 & { phase: "accepted" } = { v: 1, kind: "sync-join", phase: "accepted", effect: prepared.effect }
    const old = Object.hasOwn(current, pendingSyncJoinKey) ? joinJson(current[pendingSyncJoinKey]) : undefined
    const record = transitionSyncJoin(old, accepted)
    const write = await setJoinStage(joinDeps, "accept", current, { [pendingSyncJoinKey]: record })
    if (write.kind !== "resolved" && write.kind !== "rejected") return joinOutcome(write)
    const result = await finishJoinEffect(joinDeps, { ...current, [pendingSyncJoinKey]: record }, accepted, [{ stage: "accept", write }])
    if (result.kind === "committed") {
      initialization = "ok"
      if (prepared.effect.documents.some(x => x.key.kind === "settings" && (x.before.kind === "absent" || !sameSyncJson(x.before.value, x.after)))) emitSettings("sync")
    }
    return joinOutcome(result)
  }
  function applySyncJoin(origin: UiOrigin, input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin) || !input || input.kind !== "automatic" && input.kind !== "choice" || input.kind === "choice" && input.choice !== "use-synced" && input.choice !== "use-this-browser") return Promise.resolve({ kind: "refused", reason: "invalid" })
    const caller = snapshot(origin), review = input.review, side = input.kind === "choice" ? input.choice : undefined
    let at: number
    try { at = deps.now() } catch (error) { return Promise.resolve({ kind: "failed", stage: "prepare", error }) }
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const capture = await validateJoinCapture(caller, review, false)
        if (!capture || (side ? capture.classification !== "choice-required" : capture.classification !== "automatic")) return joinUnavailable("stale")
        return await acceptJoin(capture, side, { kind: "none" }, at)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }
  function readSyncJoin(origin: UiOrigin): Promise<SyncJoinStatus> {
    if (!agreementOrigin(origin)) return Promise.resolve(joinUnavailable("stale"))
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const raw = await local.get(null)
        if (disposed()) return joinUnavailable("disposed")
        if (!isJsonObject(raw)) return joinUnavailable("inventory")
        if (typeof raw.schema === "number" && raw.schema > STORAGE_SCHEMA_VERSION) return joinUnavailable("newer-layout")
        if (raw.schema !== STORAGE_SCHEMA_VERSION) return joinUnavailable("startup")
        if (hasInterimMarkers(raw)) return joinUnavailable("retention")
        if (Object.hasOwn(raw, pendingAccountRemovalKey)) return joinUnavailable("pending-removal")
        const read = readSyncJoinCheckpoint(raw[pendingSyncJoinKey])
        if (read.kind === "invalid" || read.kind === "newer-version") return joinUnavailable("pending-join")
        if (read.kind === "valid") {
          if (read.checkpoint.phase === "choice") return { kind: "waiting", action: "review-join" }
          if (read.checkpoint.phase === "accepted") return { kind: "pending", action: "resume-join" }
          if (read.checkpoint.phase === "outbound") return { kind: "joining" }
          return { kind: "off" }
        }
        const state = readJoinLocal(raw)
        if (state.kind !== "local") return state.kind === "refused" ? joinUnavailable("inventory") : state
        const device = decodeDevice(raw.device)
        if (!device.syncOn) return { kind: "off" }
        const history = decodeSyncState(raw.sync)
        return history.status === "ok" || history.status === "full" || history.status === "update-needed" ? { kind: "joined", status: history.status } : joinUnavailable("history")
      } catch { return joinUnavailable("inventory") }
    })
  }
  function resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const raw = await local.get(null)
        if (!isJsonObject(raw) || raw.schema !== STORAGE_SCHEMA_VERSION || hasInterimMarkers(raw) || Object.hasOwn(raw, pendingAccountRemovalKey)) return joinUnavailable("inventory")
        const read = readSyncJoinCheckpoint(raw[pendingSyncJoinKey])
        if (read.kind !== "valid") return joinUnavailable("pending-join")
        const waiting = read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? read.checkpoint : undefined
        const accepted = read.checkpoint.phase === "accepted" ? read.checkpoint : read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? { v: 1, kind: "sync-join", phase: "accepted", effect: read.checkpoint.suspended.effect } as const : undefined
        if (!accepted) return joinUnavailable("pending-join")
        const effect = accepted.effect
        if (effect.kind === "join" && effect.agreement.kind !== "none" && (!agreementCreation || (!agreementSame(effect.agreement.context.platform, agreementCreation.platform) || !agreementSame(effect.agreement.context.commands, agreementCreation.commands)))) return joinUnavailable("stale")
        const result = await finishJoinEffect(joinDeps, raw, accepted, [], waiting)
        if (result.kind === "committed" || result.kind === "cancelled") initialization = "ok"
        if (result.kind === "committed" && effect.kind === "join" && effect.documents.some(x => x.key.kind === "settings" && (x.before.kind === "absent" || !sameSyncJson(x.before.value, x.after)))) emitSettings("sync")
        return joinOutcome(result)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }
  function cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    const caller = snapshot(origin)
    for (const operation of [...joinPreparations]) if (sameSyncJson(operation.origin, caller)) operation.cancel()
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        let records = joinJson(await local.get(null)), read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        if (read.kind === "absent" || read.kind === "valid" && read.checkpoint.phase === "off") return { kind: "cancelled" }
        if (read.kind !== "valid") return joinUnavailable("pending-join")
        if (join.kind !== "fixture") return joinUnavailable("join-host")
        let unfinished: string | undefined
        const fixed = read.checkpoint.phase === "accepted" ? read.checkpoint : read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? { v: 1, kind: "sync-join", phase: "accepted", effect: read.checkpoint.suspended.effect } as const : undefined
        if (fixed) {
          const result = await finishJoinEffect(joinDeps, records, fixed)
          if (result.kind !== "committed") {
            if (result.kind === "cancelled") initialization = "ok"
            return joinOutcome(result)
          }
          if (result.replication === "pending") unfinished = result.historyId
          records = joinJson(await local.get(null)); read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        }
        if (read.kind === "valid" && read.checkpoint.phase === "outbound") unfinished = decodeSyncMeta(read.checkpoint.debt.target.metadata).id
        if (read.kind === "valid" && read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "outbound") unfinished = decodeSyncMeta(read.checkpoint.suspended.debt.target.metadata).id
        if (!isJsonObject(records.device) || !isJsonObject(records.sync)) return joinUnavailable("history")
        const effect = { kind: "cancel", unfinishedTarget: unfinished ? { kind: "present", id: unfinished } as const : { kind: "none" } as const, device: { before: joinStored(records, "device"), after: { ...records.device, syncOn: false } }, history: { before: joinStored(records, "sync"), after: { ...records.sync, status: "off", editedSinceOff: false } } } as const
        const checkpoint = { v: 1, kind: "sync-join", phase: "accepted", effect } as const
        const record = transitionSyncJoin(Object.hasOwn(records, pendingSyncJoinKey) ? joinJson(records[pendingSyncJoinKey]) : undefined, checkpoint)
        const write = await setJoinStage(joinDeps, "accept", records, { [pendingSyncJoinKey]: record })
        if (write.kind !== "resolved" && write.kind !== "rejected") return joinOutcome(write)
        deactivate("inactive")
        const result = await finishJoinEffect(joinDeps, { ...records, [pendingSyncJoinKey]: record }, checkpoint, [{ stage: "accept", write }])
        if (result.kind === "cancelled") initialization = "ok"
        return joinOutcome(result)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }

  const writer: LocalFilterWriter = {
    beginSyncJoin: origin => beginJoin(origin, false), applySyncJoin, cancelSyncJoin, readSyncJoin, resumeSyncJoin,
    readAgreement, agree, resumeRetainedAgreement,
    readInterimNote() {
      const unavailable = (): InterimNoteRead | undefined => disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "interim-held" ? { kind: "unavailable", reason: initialization === "pending" ? "startup" : "stale" }
        : claimConfirmation === "unconfirmed" || !startup || !interimResult || interimResult.kind === "failed" || interimResult.kind === "unconfirmed" || interimResult.kind === "unrepresentable" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        if (!startup || !interimResult) return { kind: "unavailable", reason: "stale" }
        if (interimResult.kind === "invalid") return Object.freeze({ kind: "held", reason: "invalid" })
        if (interimResult.kind === "newer-checkpoint") return Object.freeze({ kind: "held", reason: "newer-version" })
        if (interimResult.kind === "stale") return interimResult.reason === "stopped" ? { kind: "unavailable", reason: "stale" } : Object.freeze({ kind: "held", reason: interimResult.reason })
        if (interimResult.kind !== "retained-but-held" && interimResult.kind !== "retained-agreement" && interimResult.kind !== "pending-agreement") return { kind: "unavailable", reason: "stale" }
        const checkpoint = interimResult.checkpoint
        try {
          const first = projectInterimNote({ checkpoint, current: await startup.readInterimSnapshot() })
          const stopped = unavailable()
          if (stopped) return stopped
          if (first.kind === "held") return first
          const current = await startup.readInterimSnapshot()
          return unavailable() ?? projectInterimNote({ checkpoint, current })
        } catch { return { kind: "unavailable", reason: "stale" } }
      })
    },
    prepareAccountRemoval(origin, acct) {
      const blocked = removalUnavailable() ?? removalOrigin(origin)
      if (blocked) return Promise.resolve(blocked)
      const caller = snapshot(origin)
      return enqueue(async () => {
        const blocked = removalUnavailable()
        if (blocked) return blocked
        const pending = await completePendingRemoval()
        if (pending.kind !== "committed" && pending.kind !== "unchanged") return pending.kind === "failed"
          ? { kind: "failed", stage: "prepare", error: pending.error } : { kind: "unavailable", reason: "pending-removal" }
        const prepared = await prepareAccountRemovalCapture(removalDependencies, acct)
        if (prepared.kind !== "captured") return prepared
        const confirmation: RemovalConfirmation = Object.freeze({ kind: "account-removal-confirmation" })
        confirmations.set(confirmation, { origin: caller, capture: prepared.capture })
        return { kind: "confirmation-required", confirmation, acct, label: prepared.capture.label, scope: Object.freeze({ ...prepared.capture.scope }) }
      })
    },
    removeAccountSetup(origin, confirmation) {
      const blocked = removalUnavailable() ?? removalOrigin(origin)
      if (blocked) return Promise.resolve(blocked)
      const saved = confirmations.get(confirmation)
      if (!saved || !sameSyncJson(saved.origin, origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
      confirmations.delete(confirmation)
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        const blocked = removalUnavailable()
        if (blocked) return blocked
        cancelTicket()
        const result = await executeAccountRemoval(removalDependencies, saved.capture)
        let hasPending = false
        if (result.kind !== "committed" && result.kind !== "unchanged") {
          try { hasPending = Object.hasOwn(await removalLocal.get([pendingAccountRemovalKey]), pendingAccountRemovalKey) }
          catch { hasPending = true }
        }
        if (hasPending || result.kind === "unconfirmed" || result.kind === "failed" && result.stage !== "prepare") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        if (result.kind === "committed" && !disposed()) {
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") arm(Math.max(quietUntil, nextInvocation), arrival ? { kind: "edit", ...arrival, epoch: arrivalEpoch } : undefined)
        }
        return result
      })
    },
    readClaimNotice() {
      if (disposed()) return Promise.reject(new Error("Writer disposed"))
      const blocked = noticeUnavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = noticeUnavailable()
        if (blocked) return blocked
        const records = await guardedLocal.get(null)
        const stopped = noticeUnavailable()
        return stopped ?? projectClaimNotice({ records })
      })
    },
    acknowledgeClaimNotice(origin, expected) {
      if (disposed()) return Promise.reject(new Error("Writer disposed"))
      const blocked = noticeUnavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isJsonObject(origin) || origin.kind !== "ui" || origin.incognito !== false || !Number.isSafeInteger(origin.windowId) || typeof origin.windowId !== "number" || origin.windowId < 0) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const compare = projectClaimNotice({ records: { schema: STORAGE_SCHEMA_VERSION, device: {
        id: "notice-comparison", consent: { v: CONSENT_VERSION, at: 0 }, claimNotice: expected
      } } })
      if (compare.kind !== "pending") return Promise.resolve({ kind: "refused", reason: "invalid" })
      return enqueue(async () => {
        const blocked = noticeUnavailable()
        if (blocked) return blocked
        const result = await executeClaimNoticeAcknowledgement({ local: guardedLocal, expected: compare.notice, isStopped: () => noticeUnavailable() !== undefined })
        if (result.kind === "unconfirmed") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        return result
      })
    },
    read(_view) {
      const unavailable = (): SettingsRead | undefined => disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "ok" ? { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
        : claimConfirmation === "unconfirmed" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        const records = await guardedLocal.get(["schema", "doc:settings"])
        const stale = unavailable()
        if (stale) return stale
        if (typeof records.schema === "number" && Number.isSafeInteger(records.schema) && records.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
        if (records.schema !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "startup" }
        return readSettingsView(records["doc:settings"])
      })
    },
    subscribe(fn) {
      if (claimConfirmation === "unconfirmed" || disposed() || initialization === "interim-held" || initialization === "failed" || initialization === "newer-layout") return () => {}
      // Each registration has an independent, idempotent lifetime.
      const listener = (event: SettingsEvent) => fn(event)
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async changeSharedSetting(origin, change) {
      if (disposed()) return { kind: "unavailable", reason: "disposed" }
      if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
      if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
      if (origin.kind !== "ui" || !Number.isInteger(origin.windowId) || origin.windowId < 0 || typeof origin.incognito !== "boolean") return { kind: "result", result: { refused: "invalid" } }
      const requested = { ...change }
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        const result = await executeSharedSetting({ local: guardedLocal, sync: deps.sync, authority: records => hasInterimMarkers(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation }, requested)
        if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        if (result.kind === "committed") {
          emitSettings("local")
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") {
            const event: SyncEvent | undefined = arrival ? { kind: "edit", ...arrival, epoch: arrivalEpoch } : undefined
            arm(Math.max(quietUntil, nextInvocation), event)
          }
        }
        return result
      })
    },
    claim() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok") return Promise.resolve({ kind: "unavailable", reason: "startup" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable", reason: "stale" })
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        if (deps.claim.kind === "unavailable") return { kind: "unavailable", reason: "authority" }
        const result = await executeLocalClaim({ local: guardedLocal, host: deps.claim, now: deps.now, generation: deps.generation })
        if (result.kind === "unconfirmed") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        return result
      })
    },
    receiveSyncDocument(key) {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok") return Promise.resolve({ kind: "unavailable", reason: "authority" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable", reason: "authority" })
      return enqueue(() => receiveAttempt(key))
    },
    flushSync() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok" && initialization !== "pending-join") return Promise.resolve({ kind: "unavailable" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable" })
      const event = ingress("manual")
      return enqueue(() => attempt(event))
    },
    startSync() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok" && initialization !== "pending-join") return Promise.resolve()
      if (claimConfirmation === "unconfirmed") return Promise.resolve()
      const event = ingress("start")
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed" || lifetime.kind === "stopped" || lifetime.kind === "disposed") return
        let ready
        try {
          const records = await (joinHeld ? local : guardedLocal).get(null)
          if (disposed()) return
          const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
          const observingJoin = checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "outbound" || checkpoint.checkpoint.phase === "choice")
          ready = authority(records)
          if (observingJoin && isJsonObject(records.device) && decodeDevice(records.device).syncOn && decodeDevice(records.device).consent?.v === CONSENT_VERSION) ready = { kind: "ready", device: decodeDevice(records.device), rawDevice: records.device, history: undefined }
          if (ready.kind === "ready") {
            observeOff(ready.device.syncOn)
            if (hasInterimMarkers(records)) {
              deps.onSyncResult({ kind: "unavailable" })
              return
            }
            if (ready.device.syncOn && lifetime.kind === "inactive") {
              const unsubscribe = deps.sync.subscribe(() => {
                if (claimConfirmation === "unconfirmed" || lifetime.kind !== "active") return
                const incoming = ingress("sync")
                void enqueue(() => automatic(incoming))
              })
              lifetime = { kind: "active", unsubscribe }
            }
          }
        } catch (error) {
          deactivate("stopped")
          deps.onSyncResult({ kind: "rejected", error })
          return
        }
        if (ready.kind !== "ready") { deps.onSyncResult({ kind: "unavailable" }); return }
        if (ready.device.syncOn) await automatic(event)
      })
    },
    dispose() {
      cancelJoinPreparations()
      agreementRevision++
      listeners.clear()
      deactivate("disposed")
      return lane
    },
    async change(origin, change) {
      if (lifetime.kind === "disposed") throw new Error("Writer disposed")
      if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
      if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
      if (origin.kind !== "ui" || origin.incognito !== false || !Number.isInteger(origin.windowId) || origin.windowId < 0) {
        return { kind: "result", result: { refused: "private" } }
      }
      const at = deps.now()
      const event = ingress("edit")
      const requested: LocalFilterChange = { ...change, desired: { ...change.desired } }
      return enqueue(() => execute(requested, at, event))
    }
  }
  return { writer, readiness }
}
