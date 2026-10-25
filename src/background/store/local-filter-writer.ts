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
  | { kind: "unavailable" }
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
      if (!isJsonObject(records.sync)) return unavailable("sync-writer-required")
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
  constructor(readonly result: { readonly kind: "interim-held"; readonly result: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> } | Exclude<StartupExecutionResult, { kind: "ok" | "newer-layout" }> | { readonly kind: "disposed" } | { readonly kind: "pending-removal"; readonly result: Exclude<RemovalResult, { kind: "committed" | "unchanged" }> }) {
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
  let initialization: "pending" | "ok" | "newer-layout" | "failed" | "interim-held" = startup ? "pending" : "ok"
  let interimResult: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> | undefined
  let claimConfirmation: "ready" | "unconfirmed" = "ready"
  const removal = deps.removal ?? { kind: "unavailable" }
  const removalLocal: LocalWriteStorage = {
    set: items => deps.local.set(items),
    async get(keys) {
      const records = await deps.local.get(keys)
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
      const retained = await executeInterimRetention({ local: deps.local, snapshot: () => startup.readInterimSnapshot(), isStopped: disposed,
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
      const result = await executeLegacyStartup({ local: deps.local, host: startup })
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
      if (initialization !== "interim-held") initialization = "failed"
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
      await guardedLocal.set({ sync: next })
      const confirmed = await guardedLocal.get(null)
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
    const records = await guardedLocal.get(null)
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
    let records = await guardedLocal.get(["schema", "device", "sync", setupKey, filterKey])
    let exhaustive = false
    for (;;) {
      const ready = authority(records)
      if (ready.kind === "unavailable") return ready
      const { device, history } = ready
      observeOff(device.syncOn)
      if (!device.syncOn && exhaustive) return { kind: "unavailable", reason: "sync-writer-required" }

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
          records = await guardedLocal.get(null)
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
      } else if (history && !history.editedSinceOff) {
        const sync = { ...history.raw, editedSinceOff: true }
        if (!isJsonObject(sync)) throw new TypeError("Writer produced a non-JSON history")
        decodeSyncState(sync)
        items.sync = sync
      }
      await guardedLocal.set(items)
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
    const remote = observation(await deps.sync.get(), initial.joined)
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
    let records = await guardedLocal.get(null)
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
    let plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })
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

  function noticeUnavailable(): Extract<ClaimNoticeRead, { kind: "unavailable" }> | undefined {
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (disposed() || claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
  }

  function removalUnavailable(): Extract<RemovalResult, { kind: "unavailable" }> | undefined {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
  }
  function removalOrigin(origin: UiOrigin): Extract<RemovalResult, { kind: "result" }> | undefined {
    if (!isJsonObject(origin) || origin.kind !== "ui" || !Number.isSafeInteger(origin.windowId) || origin.windowId < 0) return { kind: "result", result: { refused: "invalid" } }
    if (origin.incognito !== false) return { kind: "result", result: { refused: "private" } }
  }

  const writer: LocalFilterWriter = {
    readInterimNote() {
      const unavailable = (): InterimNoteRead | undefined => disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "interim-held" ? { kind: "unavailable", reason: initialization === "pending" ? "startup" : "stale" }
        : !startup || !interimResult || interimResult.kind === "failed" || interimResult.kind === "unconfirmed" || interimResult.kind === "unrepresentable" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        if (!startup || !interimResult) return { kind: "unavailable", reason: "stale" }
        if (interimResult.kind === "invalid") return Object.freeze({ kind: "held", reason: "invalid" })
        if (interimResult.kind === "newer-checkpoint") return Object.freeze({ kind: "held", reason: "newer-version" })
        if (interimResult.kind === "stale") return interimResult.reason === "stopped" ? { kind: "unavailable", reason: "stale" } : Object.freeze({ kind: "held", reason: interimResult.reason })
        if (interimResult.kind !== "retained-but-held") return { kind: "unavailable", reason: "stale" }
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
      if (disposed() || initialization === "interim-held" || initialization === "failed" || initialization === "newer-layout") return () => {}
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
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        const result = await executeSharedSetting({ local: guardedLocal, sync: deps.sync, authority: records => hasInterimMarkers(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation }, change)
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
      if (initialization !== "ok") return Promise.resolve({ kind: "unavailable" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable" })
      const event = ingress("manual")
      return enqueue(() => attempt(event))
    },
    startSync() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok") return Promise.resolve()
      if (claimConfirmation === "unconfirmed") return Promise.resolve()
      const event = ingress("start")
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed" || lifetime.kind === "stopped" || lifetime.kind === "disposed") return
        let ready
        try {
          const records = await guardedLocal.get(null)
          if (disposed()) return
          ready = authority(records)
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
      return enqueue(() => execute(change, at, event))
    }
  }
  return { writer, readiness }
}
