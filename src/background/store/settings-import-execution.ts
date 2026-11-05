import { documentKey, LAST_ACCOUNT_KEY, type AccountKey } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { createImportPlanner, type ImportPlan } from "../../shared/settings-file"
import { agreementOrigin } from "./consent-agreement"
import { readConsentDevice } from "./consent-withdrawal"
import { consentJobsKey, parseConsentJobs, type ConsentJobs } from "./consent-recovery"
import { pendingAccountRemovalKey, removalProgressShards, type AccountRemovalHost, type RemovalLocalKey, removalLocalName } from "./account-removal-execution"
import type { RemovalSessionEffect } from "./account-removal-session"
import { pendingSyncJoinKey, readSyncJoinCheckpoint } from "./sync-join-persistence"
import type { LocalWriteStorage, SyncStorage } from "./local-filter-writer"
import { planSettingsImport, type ImportSyncFacts, type SettingsImportPlan } from "./settings-import-plan"
import { sameSyncJson } from "./sync-write-admission"
import { importJson, importObject, readSettingsImport, settingsImportKey, type AcceptedSettingsImport, type SettingsImportContinuation } from "./settings-import-persistence"
import { consumeSettingsImportPermit, importJob, importPermissionCurrent, type ConsentSettingsImportJob, type ExactSettingsImportPermit } from "./settings-import-recovery"

type UiOrigin = Extract<Origin, { kind: "ui" }>
const confirmationBrand = Symbol("settings-import-confirmation")
export type SettingsImportConfirmation = { readonly [confirmationBrand]: true }
export type SettingsImportScope = ImportPlan["replacement"] & { readonly accounts: readonly AccountKey[] }
export type SettingsImportUnavailable = { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "startup" | "authority" | "cleanup-host" | "pending-import" | "inventory" }
export type SettingsImportRefusal = { readonly kind: "refused"; readonly reason: "private" | "origin" | "not-agreed" | "invalid" | "update-needed" | "sync-full" }
export type SettingsImportStage = "accept" | "documents" | "local-cleanup" | "session-cleanup" | "advance" | "retire" | "receipt" | "authorize"
export type SettingsImportResult =
  | SettingsImportUnavailable
  | SettingsImportRefusal
  | { readonly kind: "held"; readonly occurrence: number; readonly stage: SettingsImportStage }
  | { readonly kind: "failed"; readonly stage: SettingsImportStage; readonly applied: boolean; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly stage: SettingsImportStage; readonly cause: "readback" | "read-failed" | "authority"; readonly write: "resolved" | "rejected" }
  | {
      readonly kind: "committed"
      readonly receipt: { readonly kind: "settings-import-receipt"; readonly occurrence: number; readonly accounts: readonly AccountKey[]; readonly documents: readonly string[] }
    }
export type SettingsImportPreparation =
  | SettingsImportUnavailable
  | SettingsImportRefusal
  | { readonly kind: "confirmation-required"; readonly confirmation: SettingsImportConfirmation; readonly scope: SettingsImportScope }
export type SettingsImportOwner = {
  prepareSettingsImport(origin: UiOrigin, text: unknown): Promise<SettingsImportPreparation>
  importSettings(origin: UiOrigin, input: { readonly confirmation: SettingsImportConfirmation; readonly replace: "confirmed" }): Promise<SettingsImportResult>
  resumeSettingsImport(origin: UiOrigin): Promise<SettingsImportResult | { readonly kind: "idle" }>
}
export type SettingsImportLocalRemoval = Exclude<RemovalLocalKey, { readonly kind: "continuation" }>
type ImportCleanupPorts = {
  removeLocal(keys: readonly SettingsImportLocalRemoval[]): Promise<void>
  readonly session: Extract<AccountRemovalHost, { kind: "fixture" }>["session"]
}
export type SettingsImportHost = { readonly kind: "unavailable" } | ({ readonly kind: "fixture" } & ImportCleanupPorts) | ({ readonly kind: "native" } & ImportCleanupPorts)
type Cleanup = Exclude<SettingsImportHost, { kind: "unavailable" }>
/** The browser's own cleanup for an import's replaced accounts: their local records and session state (DATA-55, UI-SET-22). */
export function nativeSettingsImportHost(ports: { removeLocal(names: readonly string[]): Promise<void>; readonly session: Cleanup["session"] }): SettingsImportHost {
  return { kind: "native", removeLocal: keys => ports.removeLocal(keys.map(removalLocalName)), session: ports.session }
}
export type SettingsImportDependencies = {
  readonly local: LocalWriteStorage
  readonly sync: Pick<SyncStorage, "get">
  readonly cleanup: Cleanup
  stopped(): boolean
  authority(): Promise<boolean>
  now(): number
  generation(): string
  accepted(record: AcceptedSettingsImport): void
  confirmed(record: AcceptedSettingsImport): void
  uncertain(): void
}
type Effect =
  | { readonly kind: "local-set"; readonly stage: "documents"; readonly items: JsonObject }
  | { readonly kind: "local-remove"; readonly stage: "local-cleanup"; readonly keys: readonly SettingsImportLocalRemoval[]; readonly names: readonly string[] }
  | { readonly kind: "session"; readonly stage: "session-cleanup"; readonly effect: RemovalSessionEffect }
type Inventory = { readonly local: JsonObject; readonly session: JsonObject }
type Observed = Inventory & { readonly ledger: ConsentJobs }
type Capture = { readonly origin: UiOrigin; readonly source: string; readonly plan: SettingsImportPlan; readonly scope: SettingsImportScope; consumed: boolean }

function effects(plan: SettingsImportPlan): Effect[] {
  const items: JsonObject = {},
    keys: SettingsImportLocalRemoval[] = [],
    names: string[] = []
  for (const change of plan.documents.changes) {
    if (change.kind === "put") items[documentKey(change.key)] = change.document
    else {
      keys.push({ kind: "document", key: change.key })
      names.push(documentKey(change.key))
    }
  }
  if (plan.documents.history.kind === "set") items.sync = plan.documents.history.sync
  if (plan.cleanup.lastAccount.kind === "clear") items[LAST_ACCOUNT_KEY] = null
  for (const account of plan.cleanup.accounts) {
    keys.push({ kind: "cache", acct: account.acct })
    names.push(account.cacheKey)
    for (const shard of removalProgressShards) {
      keys.push({ kind: "progress", acct: account.acct, shard })
      names.push(`progress:${account.acct}:${shard}`)
    }
  }
  const result: Effect[] = [{ kind: "local-set", stage: "documents", items }]
  if (keys.length) result.push({ kind: "local-remove", stage: "local-cleanup", keys, names })
  for (const effect of plan.cleanup.sessionEffects) result.push({ kind: "session", stage: "session-cleanup", effect })
  return result
}
function afterEffect(before: Inventory, effect: Effect): Inventory {
  const local = importJson(before.local),
    session = importJson(before.session)
  switch (effect.kind) {
    case "local-set":
      Object.assign(local, structuredClone(effect.items))
      break
    case "local-remove":
      for (const name of effect.names) delete local[name]
      break
    case "session":
      if (effect.effect.kind === "set") session[effect.effect.key] = structuredClone(effect.effect.value)
      else delete session[`${effect.effect.key.kind}:${effect.effect.key.acct}`]
      break
  }
  return { local, session }
}
function prefix(record: AcceptedSettingsImport, count: number): Inventory {
  let result: Inventory = { local: record.plan.capture.local, session: record.plan.capture.session }
  for (const effect of effects(record.plan).slice(0, count)) result = afterEffect(result, effect)
  return result
}
function materialized(records: JsonObject): JsonObject {
  const result = importJson(records)
  delete result[settingsImportKey]
  delete result[consentJobsKey]
  delete result["consent:state"]
  if (importObject(result.device)) {
    const device = { ...result.device }
    delete device.consent
    result.device = device
  }
  return result
}
function matches(observed: Inventory, expected: Inventory): boolean {
  return sameSyncJson(materialized(observed.local), materialized(expected.local)) && sameSyncJson(observed.session, expected.session)
}
function replaceJob(ledger: ConsentJobs, job: ConsentSettingsImportJob): ConsentJobs {
  return { ...ledger, jobs: ledger.jobs.map(entry => (entry.identity.occurrence === job.identity.occurrence ? job : entry)) }
}
function joinClear(records: JsonObject): boolean {
  const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
  return join.kind === "absent" || (join.kind === "valid" && join.checkpoint.phase === "off")
}
function same(a: unknown, b: unknown): boolean {
  return isJsonValue(a) && isJsonValue(b) && sameSyncJson(a, b)
}

export function createSettingsImportExecution(deps: SettingsImportDependencies) {
  const captures = new WeakMap<SettingsImportConfirmation, Capture>()
  let revision = 0
  const revisions = new WeakMap<SettingsImportConfirmation, number>()
  async function observe(): Promise<Observed | undefined> {
    if (deps.stopped() || !(await deps.authority())) return
    const first = await deps.local.get(null),
      session = await deps.cleanup.session.get(),
      last = await deps.local.get(null)
    if (deps.stopped() || !(await deps.authority()) || !importObject(first) || !importObject(last) || !importObject(session) || !sameSyncJson(first, last)) return
    const read = readConsentDevice(last)
    if (read.kind !== "supported") return
    const ledger = Object.hasOwn(last, consentJobsKey) ? parseConsentJobs(last[consentJobsKey]) : ({ v: 1, kind: "consent-jobs", deviceId: read.device.id, next: 0, jobs: [] } satisfies ConsentJobs)
    if (!ledger || ledger.deviceId !== read.device.id) return
    return { local: last, session, ledger }
  }
  function exactJob(record: AcceptedSettingsImport, observed: Observed): ConsentSettingsImportJob | undefined {
    const job = importJob(observed.ledger, record.occurrence)
    const original = Object.hasOwn(record.plan.capture.local, consentJobsKey)
      ? parseConsentJobs(record.plan.capture.local[consentJobsKey])
      : ({ v: 1, kind: "consent-jobs", deviceId: record.control.deviceId, next: 0, jobs: [] } satisfies ConsentJobs)
    return original &&
      original.next === record.occurrence &&
      job &&
      same(job.identity.operation.record, record) &&
      same(observed.ledger, { ...original, next: record.occurrence + 1, jobs: [...original.jobs, job] })
      ? job
      : undefined
  }
  function allowed(record: AcceptedSettingsImport, observed: Observed): ConsentSettingsImportJob | undefined {
    const job = exactJob(record, observed)
    return job && importPermissionCurrent(job, observed.local) ? job : undefined
  }
  async function writeExact(stage: SettingsImportStage, before: Observed, expected: Inventory, run: () => Promise<void>, record?: AcceptedSettingsImport): Promise<Observed | SettingsImportResult> {
    if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
    const current = await observe()
    if (!current || !same(current.local, before.local) || !same(current.session, before.session)) return { kind: "unavailable", reason: "stale" }
    if (record && !allowed(record, current)) return { kind: "held", occurrence: record.occurrence, stage }
    let write: "resolved" | "rejected" = "resolved",
      error: unknown
    try {
      await run()
    } catch (caught) {
      write = "rejected"
      error = caught
    }
    let after: Observed | undefined
    try {
      after = await observe()
    } catch {
      deps.uncertain()
      return { kind: "unconfirmed", stage, cause: "read-failed", write }
    }
    if (!after) {
      deps.uncertain()
      return { kind: "unconfirmed", stage, cause: "authority", write }
    }
    if (record && !allowed(record, after)) return { kind: "held", occurrence: record.occurrence, stage }
    const applied = same(after.local, expected.local) && same(after.session, expected.session)
    if (write === "rejected" && (applied || (same(after.local, before.local) && same(after.session, before.session)))) {
      return { kind: "failed", stage, applied, error }
    }
    if (!applied) {
      deps.uncertain()
      return { kind: "unconfirmed", stage, cause: "readback", write }
    }
    return after
  }
  function continuation(record: AcceptedSettingsImport, next: number): SettingsImportContinuation {
    return { v: 1, kind: "settings-import-continuation", accepted: record, next }
  }
  async function checkpoint(before: Observed, record: AcceptedSettingsImport, next: number): Promise<Observed | SettingsImportResult> {
    const items = { [settingsImportKey]: importJson(continuation(record, next)) }
    return writeExact("advance", before, { local: { ...before.local, ...items }, session: before.session }, () => deps.local.set(items), record)
  }
  async function run(record: AcceptedSettingsImport, initial: Observed, start: number): Promise<SettingsImportResult> {
    const steps = effects(record.plan)
    if (start > steps.length) return { kind: "unavailable", reason: "inventory" }
    let current = initial
    for (let index = start; index < steps.length; index++) {
      const effect = steps[index]
      if (!effect) return { kind: "unavailable", reason: "inventory" }
      if (!allowed(record, current)) return { kind: "held", occurrence: record.occurrence, stage: effect.stage }
      const expectedBefore = prefix(record, index),
        expectedAfter = afterEffect(expectedBefore, effect)
      if (!matches(current, expectedAfter)) {
        if (!matches(current, expectedBefore)) {
          deps.uncertain()
          return { kind: "unconfirmed", stage: effect.stage, cause: "readback", write: "resolved" }
        }
        let local = importJson(current.local),
          session = importJson(current.session)
        let apply: () => Promise<void>
        switch (effect.kind) {
          case "local-set":
            local = { ...local, ...effect.items }
            apply = () => deps.local.set(effect.items)
            break
          case "local-remove":
            for (const name of effect.names) delete local[name]
            apply = () => deps.cleanup.removeLocal(effect.keys)
            break
          case "session": {
            const operation = effect.effect
            if (operation.kind === "set") {
              session[operation.key] = operation.value
              apply = () => deps.cleanup.session.set({ [operation.key]: operation.value })
            } else {
              delete session[`${operation.key.kind}:${operation.key.acct}`]
              apply = () => deps.cleanup.session.remove([operation.key])
            }
            break
          }
        }
        const result = await writeExact(effect.stage, current, { local, session }, apply, record)
        if (!("local" in result)) return result
        current = result
      }
      const advanced = await checkpoint(current, record, index + 1)
      if (!("local" in advanced)) return advanced
      current = advanced
    }
    if (!matches(current, record.plan.expected)) {
      deps.uncertain()
      return { kind: "unconfirmed", stage: "retire", cause: "readback", write: "resolved" }
    }
    let job = allowed(record, current)
    if (!job) return { kind: "held", occurrence: record.occurrence, stage: "retire" }
    if (job.permission.kind !== "armed" && job.permission.kind !== "retiring") return { kind: "unavailable", reason: "stale" }
    if (job.progress.kind !== "terminal" || job.permission.kind !== "retiring") {
      const retiring: ConsentSettingsImportJob = { ...job, progress: { kind: "terminal" }, permission: { ...job.permission, kind: "retiring" } }
      const items = { [consentJobsKey]: importJson(replaceJob(current.ledger, retiring)) }
      const next = await writeExact("retire", current, { local: { ...current.local, ...items }, session: current.session }, () => deps.local.set(items), record)
      if (!("local" in next)) return next
      current = next
    }
    const marker = readSettingsImport(current.local[settingsImportKey])
    if (marker.kind !== "retired") {
      const items = { [settingsImportKey]: { v: 1, kind: "settings-import-retired", occurrence: record.occurrence } }
      const next = await writeExact("retire", current, { local: { ...current.local, ...items }, session: current.session }, () => deps.local.set(items), record)
      if (!("local" in next)) return next
      current = next
    }
    job = allowed(record, current)
    if (!job || job.progress.kind !== "terminal") return { kind: "held", occurrence: record.occurrence, stage: "receipt" }
    const done: ConsentSettingsImportJob = { ...job, permission: { kind: "done" } }
    const items = { [consentJobsKey]: importJson(replaceJob(current.ledger, done)) }
    // Terminal readback checks the done ledger as well as all documents and cleanup.
    const terminal = await writeExact("receipt", current, { local: { ...current.local, ...items }, session: current.session }, () => deps.local.set(items))
    if (!("local" in terminal)) return terminal
    const read = readConsentDevice(terminal.local)
    if (
      read.kind !== "supported" ||
      !read.control ||
      read.control.state.kind !== "agreed" ||
      job.permission.kind !== "retiring" ||
      read.control.generation !== job.permission.generation ||
      !same(read.device.consent, job.permission.current) ||
      !matches(terminal, record.plan.expected)
    ) {
      return { kind: "held", occurrence: record.occurrence, stage: "receipt" }
    }
    deps.confirmed(record)
    return {
      kind: "committed",
      receipt: {
        kind: "settings-import-receipt",
        occurrence: record.occurrence,
        accounts: [
          ...new Set([...record.plan.documents.changes.flatMap(change => (change.key.kind === "settings" ? [] : [change.key.acct])), ...record.plan.cleanup.accounts.map(account => account.acct)])
        ].sort(),
        documents: record.plan.documents.changes.map(change => documentKey(change.key))
      }
    }
  }
  async function resume(): Promise<SettingsImportResult | { readonly kind: "idle" }> {
    try {
      const current = await observe()
      if (!current) return { kind: "unavailable", reason: deps.stopped() ? "disposed" : "authority" }
      const marker = readSettingsImport(current.local[settingsImportKey])
      if (marker.kind === "valid") {
        deps.accepted(marker.continuation.accepted)
        return run(marker.continuation.accepted, current, marker.continuation.next)
      }
      if (marker.kind === "retired") {
        const job = importJob(current.ledger, marker.receipt.occurrence)
        if (job?.permission.kind === "done") return { kind: "idle" }
        if (job?.progress.kind === "terminal") {
          const parsed = readSettingsImport({ v: 1, kind: "settings-import-continuation", accepted: job.identity.operation.record, next: 0 })
          if (parsed.kind === "valid") return run(parsed.continuation.accepted, current, effects(parsed.continuation.accepted.plan).length)
        }
      }
      if (marker.kind === "absent" && !current.ledger.jobs.some(job => job.identity.operation.kind === "settings-import" && job.permission.kind !== "done")) return { kind: "idle" }
      return { kind: "unavailable", reason: "pending-import" }
    } catch {
      return { kind: "unavailable", reason: deps.stopped() ? "disposed" : "authority" }
    }
  }
  async function prepare(origin: UiOrigin, source: unknown): Promise<SettingsImportPreparation> {
    if (!agreementOrigin(origin)) return { kind: "refused", reason: "origin" }
    if (origin.incognito) return { kind: "refused", reason: "private" }
    if (typeof source !== "string") return { kind: "refused", reason: "invalid" }
    const parsed = createImportPlanner("normal").importFile(source)
    if (parsed.kind !== "import-plan") return { kind: "refused", reason: parsed.reason === "newer-format" ? "update-needed" : "invalid" }
    try {
      const current = await observe()
      if (!current) return { kind: "unavailable", reason: deps.stopped() ? "disposed" : "authority" }
      const read = readConsentDevice(current.local)
      if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
      const marker = readSettingsImport(current.local[settingsImportKey])
      if (
        (marker.kind !== "absent" && marker.kind !== "retired") ||
        current.ledger.jobs.some(job => job.permission.kind !== "done") ||
        Object.hasOwn(current.local, pendingAccountRemovalKey) ||
        !joinClear(current.local)
      )
        return { kind: "unavailable", reason: "pending-import" }
      let sync: ImportSyncFacts = { kind: "off" }
      if (read.device.syncOn) {
        const remote = await deps.sync.get()
        if (!importObject(remote)) return { kind: "unavailable", reason: "inventory" }
        sync = { kind: "on", records: remote }
      }
      const plan = planSettingsImport({ parsed, local: current.local, session: current.session, sync, at: deps.now(), generation: () => deps.generation() })
      if (plan.kind !== "planned") return plan.kind === "refused" ? plan : { kind: "unavailable", reason: "inventory" }
      const confirmation: SettingsImportConfirmation = Object.freeze({ [confirmationBrand]: true })
      const scope = { ...parsed.replacement, accounts: parsed.accounts.map(account => account.account) }
      captures.set(confirmation, { origin: structuredClone(origin), source, plan, scope, consumed: false })
      revisions.set(confirmation, revision)
      return { kind: "confirmation-required", confirmation, scope }
    } catch {
      return { kind: "unavailable", reason: "authority" }
    }
  }
  async function confirm(origin: UiOrigin, input: { readonly confirmation: SettingsImportConfirmation; readonly replace: "confirmed" }): Promise<SettingsImportResult> {
    const capture = input && captures.get(input.confirmation)
    const consumed = capture?.consumed
    if (capture) capture.consumed = true
    if (!agreementOrigin(origin)) return { kind: "refused", reason: "origin" }
    if (origin.incognito) return { kind: "refused", reason: "private" }
    if (!input || Object.keys(input).length !== 2 || input.replace !== "confirmed" || !capture || consumed || revisions.get(input.confirmation) !== revision)
      return { kind: "unavailable", reason: "stale" }
    captures.delete(input.confirmation)
    try {
      const current = await observe()
      if (
        !current ||
        !same(current.local, capture.plan.capture.local) ||
        !same(current.session, capture.plan.capture.session) ||
        !same(origin, capture.origin) ||
        current.ledger.next >= Number.MAX_SAFE_INTEGER
      )
        return { kind: "unavailable", reason: "stale" }
      const read = readConsentDevice(current.local)
      if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
      if (capture.plan.capture.sync.kind === "on" && !same(await deps.sync.get(), capture.plan.capture.sync.records)) return { kind: "unavailable", reason: "stale" }
      const accepted: AcceptedSettingsImport = {
        v: 1,
        kind: "settings-import",
        occurrence: current.ledger.next,
        original: read.device.consent,
        control: read.control,
        source: capture.source,
        plan: capture.plan
      }
      const job: ConsentSettingsImportJob = {
        identity: { deviceId: read.device.id, occurrence: accepted.occurrence, original: accepted.original, operation: { kind: "settings-import", record: importJson(accepted) } },
        progress: { kind: "accepted" },
        permission: { kind: "armed", generation: read.control.generation, current: read.device.consent }
      }
      const ledger: ConsentJobs = { ...current.ledger, next: current.ledger.next + 1, jobs: [...current.ledger.jobs, job] }
      const items = { [settingsImportKey]: importJson(continuation(accepted, 0)), [consentJobsKey]: importJson(ledger) }
      const result = await writeExact("accept", current, { local: { ...current.local, ...items }, session: current.session }, () => deps.local.set(items))
      revision++
      if (!("local" in result)) {
        if (result.kind !== "failed" || result.applied) deps.accepted(accepted)
        return result
      }
      deps.accepted(accepted)
      return run(accepted, result, 0)
    } catch {
      return { kind: "unavailable", reason: deps.stopped() ? "disposed" : "authority" }
    }
  }
  async function recover(permit: ExactSettingsImportPermit): Promise<SettingsImportResult> {
    const binding = consumeSettingsImportPermit(permit)
    if (!binding) return { kind: "unavailable", reason: "stale" }
    const current = await observe()
    if (!current || !same(current.local, binding.records)) return { kind: "unavailable", reason: "stale" }
    const read = readConsentDevice(current.local),
      job = exactJob(binding.accepted, current)
    if (
      !job ||
      !same(job.identity.operation.record, binding.accepted) ||
      read.kind !== "supported" ||
      !read.control ||
      read.control.state.kind !== "agreed" ||
      read.control.generation !== binding.generation ||
      !same(read.device.consent, binding.current)
    )
      return { kind: "unavailable", reason: "stale" }
    const marker = readSettingsImport(current.local[settingsImportKey]),
      steps = effects(binding.accepted.plan)
    const cursor = marker.kind === "valid" ? marker.continuation.next : marker.kind === "retired" && job.progress.kind === "terminal" ? steps.length : -1
    if (cursor < 0 || cursor > steps.length || (!matches(current, prefix(binding.accepted, cursor)) && !(cursor < steps.length && matches(current, prefix(binding.accepted, cursor + 1)))))
      return { kind: "unavailable", reason: "stale" }
    const armed: ConsentSettingsImportJob = { ...job, permission: { kind: job.progress.kind === "terminal" ? "retiring" : "armed", generation: binding.generation, current: binding.current } }
    const items = { [consentJobsKey]: importJson(replaceJob(current.ledger, armed)) }
    const authorized = await writeExact("authorize", current, { local: { ...current.local, ...items }, session: current.session }, () => deps.local.set(items))
    if (!("local" in authorized)) return authorized
    const result = await resume()
    return result.kind === "idle" ? { kind: "unavailable", reason: "stale" } : result
  }
  return {
    prepare,
    confirm,
    resume,
    recover,
    revoke() {
      revision++
    }
  }
}
