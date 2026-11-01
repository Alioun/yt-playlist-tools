import type { createStartingLocalFilterWriter } from "./local-filter-writer"
import { isJsonValue, type JsonValue } from "../../shared/contracts/json"
import type { Origin } from "../../shared/contracts/results"
import { consentDeviceKeys, isAgreement, readConsentDevice, withdrawalItems, withdrawalIntentItems, type Agreement, type ConsentDevicePort } from "./consent-withdrawal"
import { sameSyncJson } from "./sync-write-admission"
import { StartupReadinessError } from "./local-filter-writer"
import { readSyncedClearMarker, type SyncedClearMarker, type SyncedResetResult, type createSyncReset } from "./sync-reset"

export type StartingOwner = ReturnType<typeof createStartingLocalFilterWriter>
type UiOrigin = Extract<Origin, { kind: "ui" }>

export const clearMarkerKey = "pending:clear-all"
export const clearDatabaseName = "yt-playlist-tools"
export type ClearMarker = { readonly v: 1; readonly kind: "clear-all" } | SyncedClearMarker
const localRemovalBatch = 32

// An unknown window counts as private (DATA-30), so the authenticated sender's privacy refusal still admits Clear all (DATA-32).
export type SettingsPageOrigin =
  | { readonly kind: "ui"; readonly page: "settings"; readonly origin: UiOrigin }
  | { readonly kind: "unavailable"; readonly reason: "privacy"; readonly page: "settings" }
export type ClearAllOptions = { readonly alsoSynced: boolean }

export type Outcome = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type NameInventory =
  | { readonly kind: "listed"; readonly names: readonly string[] }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" }
  | { readonly kind: "rejected"; readonly error: unknown }
type UnlistedInventory = Exclude<NameInventory, { kind: "listed" }>
export type MarkerReadback = { readonly kind: "confirmed" } | { readonly kind: "different" } | { readonly kind: "rejected"; readonly error: unknown }

export type ClearEffect =
  | { readonly effect: "sync-reset"; readonly result: SyncedResetResult }
  | { readonly effect: "marker-set" | "session-clear" | "database-delete" | "marker-remove"; readonly outcome: Outcome }
  | { readonly effect: "local-remove"; readonly count: number; readonly outcome: Outcome }

export type FreshReadiness =
  | { readonly kind: "ready"; readonly layout: "ok" | "newer-layout" }
  | { readonly kind: "rejected"; readonly error: unknown }
  | { readonly kind: "not-started"; readonly reason: "disposed" }
  | { readonly kind: "disposed" }

type InventoryStage = "session" | "local" | "marker"
export type IncompleteClear =
  | { readonly kind: "reset-held"; readonly result: Exclude<SyncedResetResult, { kind: "confirmed" }> }
  | { readonly kind: "failed"; readonly stage: "boundary"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: "stop"; readonly owner: Outcome | { readonly kind: "no-owner" }; readonly producers: Outcome }
  | { readonly kind: "failed"; readonly stage: "marker"; readonly effects: readonly ClearEffect[]; readonly confirmation: Exclude<MarkerReadback, { kind: "confirmed" }> }
  | { readonly kind: "partial"; readonly stage: "database"; readonly effects: readonly ClearEffect[] }
  | { readonly kind: "partial"; readonly stage: InventoryStage; readonly effects: readonly ClearEffect[]; readonly names: readonly string[] }
  | { readonly kind: "unconfirmed"; readonly stage: InventoryStage; readonly effects: readonly ClearEffect[]; readonly inventory: UnlistedInventory }
/** "kept-newer-layout": the box was ticked, but a layout newer than this build knows leaves synced settings to the version that wrote them (R168, R174). */
export type SyncedClear = "untouched" | "reset" | "kept-newer-layout"
export type ClearAllResult =
  | { readonly kind: "cleared"; readonly next: "first-run"; readonly effects: readonly ClearEffect[]; readonly readiness: FreshReadiness; readonly synced: SyncedClear; readonly opening?: FirstRunOpening }
  | { readonly kind: "unavailable"; readonly reason: "invalid-origin" | "invalid-options" | "synced-reset-unsupported" | "scope-in-progress" | "disposed" }
  | IncompleteClear
export type FirstRunOpening = { readonly kind: "opened" } | { readonly kind: "unconfirmed"; readonly reason: "rejected" | "not-opened" }

export type MarkerReadFailure = { readonly kind: "rejected"; readonly error: unknown } | { readonly kind: "invalid" }
export type BlockedState =
  | { readonly kind: "blocked"; readonly reason: "clear-pending" }
  | { readonly kind: "blocked"; readonly reason: "marker-read-failed"; readonly read: MarkerReadFailure }
  | { readonly kind: "blocked"; readonly reason: "clear-incomplete"; readonly result: IncompleteClear }
  | { readonly kind: "blocked"; readonly reason: "owner-start-failed"; readonly error: unknown }
export type LifecycleState =
  | { readonly kind: "starting" | "clearing" | "disposed" | "withdrawing" | "withdrawal-stopped" | "opening-held" }
  | { readonly kind: "held"; readonly owner: StartingOwner }
  | { readonly kind: "active"; readonly owner: StartingOwner }
  | BlockedState
export type LifecycleEvent = { readonly kind: "cleared"; readonly next: "first-run" } | { readonly kind: "consent-withdrawn"; readonly shutdown: Extract<Shutdown, { kind: "confirmed" }> }
type Stop = { readonly owner: StartingOwner | null; readonly ownerStop: Outcome | { readonly kind: "no-owner" }; readonly producerStop: Outcome }
export type Shutdown =
  | { readonly kind: "confirmed"; readonly owner: { readonly kind: "resolved" | "no-owner" }; readonly producers: { readonly kind: "resolved" } }
  | { readonly kind: "unconfirmed"; readonly owner: Outcome | { readonly kind: "no-owner" }; readonly producers: Outcome }
export type ConfirmedWithdrawalIntent = { readonly kind: "confirmed"; readonly write: Outcome }
export type WithdrawalResult =
  | { readonly kind: "withdrawn"; readonly intent: ConfirmedWithdrawalIntent; readonly write: Outcome; readonly shutdown: Extract<Shutdown, { kind: "confirmed" }>; readonly activation: "held" }
  | { readonly kind: "unchanged"; readonly reason: "not-agreed" | "different-consent"; readonly shutdown: Shutdown }
  | { readonly kind: "unavailable"; readonly reason: "invalid-origin" | "invalid-input" | "clearing" | "disposed" | "withdrawal-in-progress" | "consent-port" }
  | { readonly kind: "unavailable"; readonly reason: "newer-layout" | "layout"; readonly shutdown: Shutdown }
  | { readonly kind: "failed"; readonly stage: "stop" | "observation"; readonly shutdown: Shutdown }
  | { readonly kind: "failed"; readonly stage: "intent"; readonly write: Outcome; readonly shutdown: Shutdown }
  | { readonly kind: "failed"; readonly stage: "set"; readonly intent: ConfirmedWithdrawalIntent; readonly write: Outcome; readonly shutdown: Shutdown }
  | { readonly kind: "unconfirmed"; readonly stage: "intent"; readonly write: Outcome; readonly cause: "different" | "read-failed"; readonly shutdown: Shutdown }
  | { readonly kind: "unconfirmed"; readonly stage: "device"; readonly intent: ConfirmedWithdrawalIntent; readonly write: Outcome | { readonly kind: "not-invoked" }; readonly cause: "different" | "read-failed"; readonly shutdown: Shutdown }
  | { readonly kind: "superseded"; readonly by: "clear-all" | "dispose" }

// The supervisor reads only the marker by name. Its port types admit no whole-area read and no value read under any other key.
export type LifecycleLocalPort = {
  get(keys: readonly [typeof clearMarkerKey]): Promise<Readonly<Record<string, unknown>>>
  set(items: { readonly [clearMarkerKey]: ClearMarker }): Promise<void>
  remove(keys: readonly string[]): Promise<void>
  names?(): Promise<readonly string[]>
}
export type LifecycleSessionPort = {
  clear(): Promise<void>
  names?(): Promise<readonly string[]>
}
export type StoreLifecycleDependencies = {
  readonly syncedReset?: ReturnType<typeof createSyncReset>
  readonly openFirstRun?: () => Promise<FirstRunOpening>
  readonly startOwner: () => StartingOwner
  readonly local: LifecycleLocalPort
  readonly consentDevice?: ConsentDevicePort
  readonly session: LifecycleSessionPort
  readonly deleteDatabase: (name: typeof clearDatabaseName) => Promise<void>
  readonly producers: { quiesce(): Promise<void> }
}
export type StoreLifecycle = {
  state(): LifecycleState
  owner(): StartingOwner | undefined
  ready(): Promise<LifecycleState>
  clearAll(origin: SettingsPageOrigin, options: ClearAllOptions): Promise<ClearAllResult>
  withdrawConsent(origin: SettingsPageOrigin, expected: Agreement | null): Promise<WithdrawalResult>
  subscribe(listener: (event: LifecycleEvent) => void): () => void
  dispose(): Promise<void>
}

type Phase =
  | { readonly kind: "starting" }
  | { readonly kind: "disposed" }
  | { readonly kind: "active"; readonly owner: StartingOwner }
  | { readonly kind: "held"; readonly owner: StartingOwner }
  | WithdrawalPhase
  | { readonly kind: "withdrawal-stopped"; readonly stopping: Promise<Stop> }
  | { readonly kind: "opening-held"; readonly owner: StartingOwner; readonly stopping: Promise<Stop>; readonly withdrawal: WithdrawalPhase | null }
  | ClearingPhase
  | { readonly kind: "blocked"; readonly state: BlockedState; readonly retiring: StartingOwner | null }

type ClearingPhase = { readonly kind: "clearing"; readonly scope: ClearAllOptions; readonly operation: Promise<ClearAllResult>; owner: StartingOwner | null }
type WithdrawalPhase = {
  readonly kind: "withdrawing"; readonly expected: Agreement | null; readonly operation: Promise<WithdrawalResult>
  readonly settle: (result: WithdrawalResult) => void
  stopping: Promise<Stop>
  mutation?: Promise<Outcome>
}
type ClearCompletion = { readonly result: ClearAllResult; readonly phase: Exclude<Phase, { kind: "clearing" | "starting" }> }

const resolved: Outcome = { kind: "resolved" }
const refuse = (reason: Extract<ClearAllResult, { kind: "unavailable" }>["reason"]) => Promise.resolve<ClearAllResult>({ kind: "unavailable", reason })

function attempt(effect: () => PromiseLike<unknown>): Promise<Outcome> {
  try {
    return Promise.resolve(effect()).then((): Outcome => resolved, (error: unknown): Outcome => ({ kind: "rejected", error }))
  } catch (error) {
    return Promise.resolve<Outcome>({ kind: "rejected", error })
  }
}

function exactRecord(raw: unknown, keys: readonly string[]): raw is Readonly<Record<string, unknown>> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) &&
    Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key))
}

// Validation reads a detached plain copy, so caller getters, proxies and later mutation cannot change an admitted request.
function detach(raw: unknown): JsonValue | undefined {
  try {
    return isJsonValue(raw) ? JSON.parse(JSON.stringify(raw)) : undefined
  } catch {
    return undefined
  }
}

function isSettingsPageOrigin(raw: unknown): boolean {
  const value = detach(raw)
  if (exactRecord(value, ["kind", "reason", "page"])) return value.kind === "unavailable" && value.reason === "privacy" && value.page === "settings"
  if (!exactRecord(value, ["kind", "page", "origin"]) || value.kind !== "ui" || value.page !== "settings") return false
  const origin = value.origin
  return exactRecord(origin, ["kind", "windowId", "incognito"]) && origin.kind === "ui" &&
    typeof origin.windowId === "number" && Number.isSafeInteger(origin.windowId) && origin.windowId >= 0 && typeof origin.incognito === "boolean"
}

function readClearAllOptions(raw: unknown): ClearAllOptions | undefined {
  const value = detach(raw)
  if (exactRecord(value, ["alsoSynced"]) && typeof value.alsoSynced === "boolean") return { alsoSynced: value.alsoSynced }
}

function isClearMarker(records: unknown, expected?: ClearMarker): boolean {
  const value = detach(Object.getOwnPropertyDescriptor(records, clearMarkerKey)?.value)
  if (expected?.v === 2) return !!readSyncedClearMarker(value) && value !== undefined && sameSyncJson(value, expected)
  return exactRecord(value, ["v", "kind"]) && value.v === 1 && value.kind === "clear-all"
}

function markerPresence(records: unknown): "present" | "absent" | "unknown" {
  try {
    if (records === null || typeof records !== "object" || Array.isArray(records)) return "unknown"
    const prototype = Object.getPrototypeOf(records)
    if (prototype !== Object.prototype && prototype !== null) return "unknown"
    const names = Reflect.ownKeys(records)
    if (names.some(name => name !== clearMarkerKey)) return "unknown"
    return names.length === 1 ? "present" : "absent"
  } catch {
    return "unknown"
  }
}

async function inventory(port: { names?(): Promise<readonly string[]> }): Promise<NameInventory> {
  try {
    const names = port.names
    if (!names) return { kind: "unavailable" }
    const listed = detach(await names.call(port))
    if (!Array.isArray(listed) || !listed.every(name => typeof name === "string")) return { kind: "invalid" }
    return { kind: "listed", names: [...new Set<string>(listed)] }
  } catch (error) {
    return { kind: "rejected", error }
  }
}

function sameNames(listed: readonly string[], expected: readonly string[]): boolean {
  return listed.length === expected.length && expected.every(name => listed.includes(name))
}

function inventoryShortfall(stage: InventoryStage, effects: readonly ClearEffect[], listed: NameInventory, expected: readonly string[]): IncompleteClear | undefined {
  if (listed.kind !== "listed") return { kind: "unconfirmed", stage, effects: [...effects], inventory: listed }
  if (!sameNames(listed.names, expected)) return { kind: "partial", stage, effects: [...effects], names: listed.names }
}

export function createStoreLifecycle(deps: StoreLifecycleDependencies): StoreLifecycle {
  let phase: Phase = { kind: "starting" }
  const listeners = new Set<(event: LifecycleEvent) => void>()
  const operations = new Set<Promise<unknown>>()
  let disposal: Promise<void> | undefined

  function state(): LifecycleState {
    switch (phase.kind) {
      case "active": return { kind: "active", owner: phase.owner }
      case "held": return { kind: "held", owner: phase.owner }
      case "blocked": return phase.state
      case "clearing": return { kind: "clearing" }
      case "starting":
      case "withdrawing":
      case "withdrawal-stopped":
      case "opening-held":
      case "disposed": return { kind: phase.kind }
    }
  }

  function track<T>(operation: Promise<T>): Promise<T> {
    const settled = () => { operations.delete(operation) }
    operations.add(operation)
    void operation.then(settled, settled)
    return operation
  }

  function emit(event: LifecycleEvent) {
    for (const listener of [...listeners]) {
      try { listener(event) } catch {}
    }
  }

  // Clear completion or disposal settles readiness when it supersedes an unsettled marker read.
  let settleStartup: (state: LifecycleState) => void = () => {}
  const startup = new Promise<LifecycleState>(resolve => { settleStartup = resolve })
  const gate = phase
  void (async () => {
    let presence: ReturnType<typeof markerPresence> | MarkerReadFailure
    try {
      presence = markerPresence(await deps.local.get([clearMarkerKey]))
    } catch (error) {
      presence = { kind: "rejected", error }
    }
    if (phase !== gate) return
    if (presence === "absent") {
      let held = false
      if (deps.consentDevice) {
        try {
          const tuple = detach(await deps.consentDevice.get(consentDeviceKeys))
          held = tuple !== null && typeof tuple === "object" && !Array.isArray(tuple) && Object.hasOwn(tuple, "consent:state")
        } catch {}
      }
      if (phase !== gate) return
      const fresh = start()
      if (fresh.kind === "started" && held) {
        const opening = { kind: "opening-held", owner: fresh.owner, stopping: Promise.resolve<Stop>({ owner: null, ownerStop: { kind: "no-owner" }, producerStop: { kind: "resolved" } }), withdrawal: null } as const
        phase = opening
        let classified: "active" | "held" = "active"
        try { await fresh.owner.ready() } catch (error) {
          if (error instanceof StartupReadinessError && error.result.kind === "consent-held") classified = "held"
          else if (phase === opening) phase = { kind: "blocked", state: { kind: "blocked", reason: "owner-start-failed", error }, retiring: fresh.owner }
        }
        if (phase === opening) phase = { kind: classified, owner: fresh.owner }
        settleStartup(state())
        return
      }
      phase = fresh.kind === "started" ? { kind: "active", owner: fresh.owner } :
        { kind: "blocked", state: { kind: "blocked", reason: "owner-start-failed", error: fresh.error }, retiring: null }
    } else if (presence === "present") phase = { kind: "blocked", state: { kind: "blocked", reason: "clear-pending" }, retiring: null }
    else phase = { kind: "blocked", state: { kind: "blocked", reason: "marker-read-failed", read: presence === "unknown" ? { kind: "invalid" } : presence }, retiring: null }
    settleStartup(state())
  })()

  function start(): { readonly kind: "started"; readonly owner: StartingOwner } | { readonly kind: "rejected"; readonly error: unknown } {
    try {
      const owner = deps.startOwner()
      return { kind: "started", owner }
    } catch (error) {
      return { kind: "rejected", error }
    }
  }

  function fence(prior: Phase) {
    if (prior.kind === "withdrawing") {
      return Promise.all([prior.stopping, prior.mutation]).then(([stop]) => stop)
    }
    if (prior.kind === "withdrawal-stopped") {
      return prior.stopping.then(async stop => {
        const retiring = stop.owner
        const ownerStop = stop.ownerStop.kind === "rejected" && retiring ? attempt(() => retiring.dispose()) : Promise.resolve(stop.ownerStop)
        const producerStop = stop.producerStop.kind === "rejected" ? attempt(() => deps.producers.quiesce()) : Promise.resolve(stop.producerStop)
        const [owner, producers] = await Promise.all([ownerStop, producerStop])
        return { owner: stop.owner, ownerStop: owner, producerStop: producers }
      })
    }
    const owner = prior.kind === "active" || prior.kind === "held" || prior.kind === "opening-held" ? prior.owner : prior.kind === "blocked" ? prior.retiring : null
    const disposed: Promise<Outcome | { readonly kind: "no-owner" }> = owner ? attempt(() => owner.dispose()) : Promise.resolve<{ readonly kind: "no-owner" }>({ kind: "no-owner" })
    const quiesced = attempt(() => deps.producers.quiesce())
    return Promise.all([disposed, quiesced]).then(([ownerStop, producerStop]) => ({ owner, ownerStop, producerStop }))
  }

  function shutdown(stop: Stop): Shutdown {
    return stop.ownerStop.kind !== "rejected" && stop.producerStop.kind === "resolved"
      ? { kind: "confirmed", owner: stop.ownerStop, producers: stop.producerStop }
      : { kind: "unconfirmed", owner: stop.ownerStop, producers: stop.producerStop }
  }
  async function withdraw(withdrawing: WithdrawalPhase): Promise<void> {
    const live = () => phase === withdrawing
    const finish = (result: WithdrawalResult) => {
      if (!live()) return
      phase = { kind: "withdrawal-stopped", stopping: withdrawing.stopping }
      settleStartup(state())
      withdrawing.settle(result)
    }
    const stop = withdrawing.stopping
    let baseline: JsonValue | undefined
    try { baseline = detach(await deps.consentDevice!.get(consentDeviceKeys)) } catch {
      const stopped = shutdown(await stop)
      finish({ kind: "failed", stage: "observation", shutdown: stopped }); return
    }
    if (!live()) return
    const stopped = shutdown(await stop)
    if (!live()) return
    if (stopped.kind !== "confirmed") { finish({ kind: "failed", stage: "stop", shutdown: stopped }); return }
    const read = readConsentDevice(baseline)
    if (read.kind !== "supported") { finish({ kind: "unavailable", reason: read.kind === "newer-layout" ? "newer-layout" : "layout", shutdown: stopped }); return }
    const expected = read.control?.state.kind === "withdrawing" ? read.control.state.prior : read.device.consent
    if (!expected || withdrawing.expected === null || !sameSyncJson(expected, withdrawing.expected)) {
      finish({ kind: "unchanged", reason: !expected ? "not-agreed" : "different-consent", shutdown: stopped }); return
    }
    const intentItems = withdrawalIntentItems(read), items = withdrawalItems(read)
    if (!intentItems || !items || !baseline || typeof baseline !== "object" || Array.isArray(baseline)) { finish({ kind: "unavailable", reason: "layout", shutdown: stopped }); return }
    try {
      const current = detach(await deps.consentDevice!.get(consentDeviceKeys))
      if (!live()) return
      if (!baseline || !current || !sameSyncJson(baseline, current)) { finish({ kind: "failed", stage: "observation", shutdown: stopped }); return }
    } catch { finish({ kind: "failed", stage: "observation", shutdown: stopped }); return }
    if (!live()) return
    function mutate(value: Parameters<ConsentDevicePort["set"]>[0]): Promise<Outcome> {
      let settleMutation: (outcome: Outcome) => void = () => {}
      const mutation = track(new Promise<Outcome>(resolve => { settleMutation = resolve }))
      withdrawing.mutation = mutation
      void attempt(() => deps.consentDevice!.set(value)).then(settleMutation)
      return mutation
    }
    const intentWrite = await mutate(intentItems)
    if (!live()) return
    const intentBaseline = { ...baseline, ...intentItems }
    let intentObserved: JsonValue | undefined
    try { intentObserved = detach(await deps.consentDevice!.get(consentDeviceKeys)) } catch {
      finish({ kind: "unconfirmed", stage: "intent", write: intentWrite, cause: "read-failed", shutdown: stopped }); return
    }
    if (!live()) return
    if (!intentObserved || !sameSyncJson(intentBaseline, intentObserved)) {
      if (intentWrite.kind === "rejected" && intentObserved && sameSyncJson(baseline, intentObserved)) finish({ kind: "failed", stage: "intent", write: intentWrite, shutdown: stopped })
      else finish({ kind: "unconfirmed", stage: "intent", write: intentWrite, cause: "different", shutdown: stopped })
      return
    }
    const intent: ConfirmedWithdrawalIntent = { kind: "confirmed", write: intentWrite }
    try {
      const current = detach(await deps.consentDevice!.get(consentDeviceKeys))
      if (!live()) return
      if (!current || !sameSyncJson(intentBaseline, current)) { finish({ kind: "unconfirmed", stage: "device", intent, write: { kind: "not-invoked" }, cause: "different", shutdown: stopped }); return }
    } catch { finish({ kind: "unconfirmed", stage: "device", intent, write: { kind: "not-invoked" }, cause: "read-failed", shutdown: stopped }); return }
    if (!live()) return
    const write = await mutate(items)
    if (!live()) return
    let observed: JsonValue | undefined
    try { observed = detach(await deps.consentDevice!.get(consentDeviceKeys)) } catch {
      finish({ kind: "unconfirmed", stage: "device", intent, write, cause: "read-failed", shutdown: stopped }); return
    }
    if (!live()) return
    if (!observed || !baseline || typeof baseline !== "object" || Array.isArray(baseline) || !sameSyncJson({ ...baseline, ...items }, observed)) {
      if (write.kind === "rejected" && observed && sameSyncJson(intentBaseline, observed)) finish({ kind: "failed", stage: "set", intent, write, shutdown: stopped })
      else finish({ kind: "unconfirmed", stage: "device", intent, write, cause: "different", shutdown: stopped })
      return
    }
    const fresh = start()
    if (fresh.kind !== "started") { emit({ kind: "consent-withdrawn", shutdown: stopped }); finish({ kind: "withdrawn", intent, write, shutdown: stopped, activation: "held" }); return }
    const opening = { kind: "opening-held", owner: fresh.owner, stopping: stop, withdrawal: withdrawing } as const
    phase = opening
    emit({ kind: "consent-withdrawn", shutdown: stopped })
    try { await fresh.owner.ready() } catch (error) {
      if (!(error instanceof StartupReadinessError && error.result.kind === "consent-held")) {
        if (phase === opening) phase = { kind: "withdrawal-stopped", stopping: track(attempt(() => fresh.owner.dispose())).then(ownerStop => ({ owner: fresh.owner, ownerStop, producerStop: { kind: "resolved" } })) }
      }
    }
    if (phase === opening) phase = { kind: "held", owner: fresh.owner }
    settleStartup(state())
    withdrawing.settle({ kind: "withdrawn", intent, write, shutdown: stopped, activation: "held" })
  }

  async function erase(stopping: ReturnType<typeof fence>, clearing: ClearingPhase): Promise<ClearCompletion> {
    const live = () => phase === clearing
    const interrupted: ClearCompletion = { result: { kind: "unavailable", reason: "disposed" }, phase: { kind: "disposed" } }
    const block = (result: IncompleteClear, retiring: StartingOwner | null = null): ClearCompletion => {
      if (!live()) return interrupted
      return { result, phase: { kind: "blocked", state: { kind: "blocked", reason: "clear-incomplete", result }, retiring } }
    }
    const stop = await stopping
    if (stop.ownerStop.kind === "rejected" || stop.producerStop.kind === "rejected") {
      return block({ kind: "failed", stage: "stop", owner: stop.ownerStop, producers: stop.producerStop }, stop.ownerStop.kind === "rejected" ? stop.owner : null)
    }
    if (!live()) return interrupted

    const effects: ClearEffect[] = []
    let marker: ClearMarker = { v: 1, kind: "clear-all" }
    let synced: SyncedClear = "untouched"
    if (clearing.scope.alsoSynced) {
      if (!deps.syncedReset) return block({ kind: "reset-held", result: { kind: "unavailable", reason: "marker" } })
      const prepared = await deps.syncedReset.prepare()
      if (!live()) return interrupted
      if (prepared.kind === "prepared") marker = prepared.marker
      else if (prepared.reason === "newer-layout") synced = "kept-newer-layout"
      else return block({ kind: "reset-held", result: prepared })
    }
    effects.push({ effect: "marker-set", outcome: await attempt(() => deps.local.set({ [clearMarkerKey]: marker })) })
    if (!live()) return interrupted
    let confirmation: MarkerReadback
    try {
      const records = await deps.local.get([clearMarkerKey])
      confirmation = markerPresence(records) === "present" && isClearMarker(records, marker) ? { kind: "confirmed" } : { kind: "different" }
    } catch (error) {
      confirmation = { kind: "rejected", error }
    }
    if (confirmation.kind !== "confirmed") return block({ kind: "failed", stage: "marker", effects: [...effects], confirmation })
    if (!live()) return interrupted
    if (marker.v === 2 && deps.syncedReset) {
      const reset = await deps.syncedReset.run(marker, live)
      effects.push({ effect: "sync-reset", result: reset })
      if (!live()) return interrupted
      if (reset.kind !== "confirmed") return block({ kind: "reset-held", result: reset })
      synced = "reset"
    }

    effects.push({ effect: "session-clear", outcome: await attempt(() => deps.session.clear()) })
    if (!live()) return interrupted
    const session = inventoryShortfall("session", effects, await inventory(deps.session), [])
    if (session) return block(session)
    if (!live()) return interrupted

    const deletion = await attempt(() => deps.deleteDatabase(clearDatabaseName))
    effects.push({ effect: "database-delete", outcome: deletion })
    if (deletion.kind === "rejected") return block({ kind: "partial", stage: "database", effects: [...effects] })
    if (!live()) return interrupted

    const before = await inventory(deps.local)
    if (!live()) return interrupted
    if (before.kind !== "listed") return block({ kind: "unconfirmed", stage: "local", effects: [...effects], inventory: before })
    const targets = before.names.filter(name => name !== clearMarkerKey)
    for (let index = 0; index < targets.length; index += localRemovalBatch) {
      const keys = targets.slice(index, index + localRemovalBatch)
      effects.push({ effect: "local-remove", count: keys.length, outcome: await attempt(() => deps.local.remove(keys)) })
      if (!live()) return interrupted
    }
    const local = inventoryShortfall("local", effects, await inventory(deps.local), [clearMarkerKey])
    if (local) return block(local)
    if (!live()) return interrupted

    effects.push({ effect: "marker-remove", outcome: await attempt(() => deps.local.remove([clearMarkerKey])) })
    if (!live()) return interrupted
    const final = inventoryShortfall("marker", effects, await inventory(deps.local), [])
    if (final) return block(final)

    const disposed = (readiness: FreshReadiness): ClearCompletion => ({ result: { kind: "cleared", next: "first-run", effects, readiness, synced }, phase: { kind: "disposed" } })
    if (!live()) return disposed({ kind: "not-started", reason: "disposed" })
    const fresh = start()
    if (fresh.kind === "rejected") {
      let opening: FirstRunOpening | undefined
      if (deps.openFirstRun && live()) {
        try { opening = await deps.openFirstRun() } catch { opening = { kind: "unconfirmed", reason: "rejected" } }
      }
      emit({ kind: "cleared", next: "first-run" })
      return { result: { kind: "cleared", next: "first-run", effects, readiness: fresh, synced, ...(opening ? { opening } : {}) },
        phase: { kind: "blocked", state: { kind: "blocked", reason: "owner-start-failed", error: fresh.error }, retiring: null } }
    }
    clearing.owner = fresh.owner
    emit({ kind: "cleared", next: "first-run" })
    if (!live()) return disposed({ kind: "disposed" })
    let readiness: FreshReadiness
    try {
      readiness = { kind: "ready", layout: await fresh.owner.ready() }
    } catch (error) {
      readiness = { kind: "rejected", error }
    }
    if (!live()) return disposed({ kind: "disposed" })
    const next: ClearCompletion["phase"] = readiness.kind === "ready" ? { kind: "active", owner: fresh.owner } :
      { kind: "blocked", state: { kind: "blocked", reason: "owner-start-failed", error: readiness.error }, retiring: fresh.owner }
    let opening: FirstRunOpening | undefined
    if (deps.openFirstRun) {
      try { opening = await deps.openFirstRun() } catch { opening = { kind: "unconfirmed", reason: "rejected" } }
    }
    if (!live()) return disposed({ kind: "disposed" })
    return { result: { kind: "cleared", next: "first-run", effects, readiness, synced, ...(opening ? { opening } : {}) }, phase: next }
  }

  return {
    state,
    owner: () => phase.kind === "active" || phase.kind === "held" ? phase.owner : undefined,
    ready: () => startup,
    withdrawConsent(origin, expected) {
      if (phase.kind === "disposed") return Promise.resolve({ kind: "unavailable", reason: "disposed" })
      if (!isSettingsPageOrigin(origin)) return Promise.resolve({ kind: "unavailable", reason: "invalid-origin" })
      const request = detach(expected)
      if (request !== null && !isAgreement(request)) return Promise.resolve({ kind: "unavailable", reason: "invalid-input" })
      if (phase.kind === "clearing") return Promise.resolve({ kind: "unavailable", reason: "clearing" })
      if (phase.kind === "withdrawing") return sameSyncJson(phase.expected, request) ? phase.operation : Promise.resolve({ kind: "unavailable", reason: "withdrawal-in-progress" })
      if (phase.kind === "opening-held") return phase.withdrawal && sameSyncJson(phase.withdrawal.expected, request) ? phase.withdrawal.operation : Promise.resolve({ kind: "unavailable", reason: "withdrawal-in-progress" })
      if (!deps.consentDevice) return Promise.resolve({ kind: "unavailable", reason: "consent-port" })
      const prior = phase
      let settle: (result: WithdrawalResult) => void = () => {}
      const operation = new Promise<WithdrawalResult>(resolve => { settle = resolve })
      let settleStop: (stop: Stop) => void = () => {}
      const stopping = track(new Promise<Stop>(resolve => { settleStop = resolve }))
      const withdrawing: WithdrawalPhase = { kind: "withdrawing", expected: request, operation, settle, stopping }
      phase = withdrawing
      void fence(prior).then(settleStop)
      void withdraw(withdrawing).catch(() => {})
      return operation
    },
    clearAll(origin, options) {
      if (phase.kind === "disposed") return refuse("disposed")
      if (!isSettingsPageOrigin(origin)) return refuse("invalid-origin")
      const request = readClearAllOptions(options)
      if (!request) return refuse("invalid-options")
      if (request.alsoSynced && !deps.syncedReset) return refuse("synced-reset-unsupported")
      if (phase.kind === "clearing") return phase.scope.alsoSynced === request.alsoSynced ? phase.operation : refuse("scope-in-progress")
      const prior = phase
      let settle: (result: ClearAllResult) => void = () => {}
      const operation = track(new Promise<ClearAllResult>(resolve => { settle = resolve }))
      const clearing: ClearingPhase = { kind: "clearing", scope: request, operation, owner: null }
      phase = clearing
      if (prior.kind === "withdrawing") prior.settle({ kind: "superseded", by: "clear-all" })
      if (prior.kind === "opening-held") prior.withdrawal?.settle({ kind: "superseded", by: "clear-all" })
      void erase(fence(prior), clearing).then(completion => {
        if (phase === clearing) phase = completion.phase
        settleStartup(state())
        settle(completion.result)
      }, (error: unknown) => {
        const result: IncompleteClear = { kind: "failed", stage: "boundary", error }
        if (phase === clearing) phase = { kind: "blocked", state: { kind: "blocked", reason: "clear-incomplete", result }, retiring: clearing.owner }
        settleStartup(state())
        settle(result)
      })
      return operation
    },
    subscribe(listener) {
      if (phase.kind === "disposed") return () => {}
      const own = (event: LifecycleEvent) => listener(event)
      listeners.add(own)
      return () => { listeners.delete(own) }
    },
    dispose() {
      if (disposal) return disposal
      const prior = phase
      phase = { kind: "disposed" }
      if (prior.kind === "withdrawing") prior.settle({ kind: "superseded", by: "dispose" })
      if (prior.kind === "opening-held") prior.withdrawal?.settle({ kind: "superseded", by: "dispose" })
      listeners.clear()
      settleStartup(state())
      const owner = prior.kind === "active" || prior.kind === "held" || prior.kind === "opening-held" || prior.kind === "clearing" ? prior.owner : prior.kind === "blocked" ? prior.retiring : null
      const stopped = prior.kind === "withdrawing" || prior.kind === "withdrawal-stopped" ? fence(prior) : owner ? attempt(() => owner.dispose()) : Promise.resolve(resolved)
      disposal = Promise.all([stopped, ...operations]).then(() => {})
      return disposal
    }
  }
}
