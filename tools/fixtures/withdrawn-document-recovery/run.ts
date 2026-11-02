import type { JsonObject } from "../../../src/shared/contracts/json"
import { createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { consentObject } from "../../../src/background/store/consent-withdrawal"
import { parseConsentJobs, sameConsentValue } from "../../../src/background/store/consent-recovery"
import { isAcceptedFilterRecord, completedFilterRecord, type FilterRecoveryStage } from "../../../src/background/store/withdrawn-document-recovery"
import { createRecoveryHarness, recoveryAgree, recoveryPrepare, recoveryUi, recoveryAcceptanceFixture, recoverySyncFixture, recoveryEqual } from "../interim-recovery-review/run"
import { renewWithdrawalAgreement } from "../interim-conversion/run"
import { createStoreLifecycle } from "../../../src/background/store/store-lifecycle"
import { readConsentDevice } from "../../../src/background/store/consent-withdrawal"
import { createLifecycleHarness, settingsOrigin } from "../device-lifecycle/run"
import { interimSnapshot } from "../interim-conversion/run"
import { isAccountKey } from "../../../src/shared/model"
import { globalPlaylistRestoreSelection } from "../interim-recovery-review/run"
import { isAcceptedPlaylistRecord, completedPlaylistRecord, type PlaylistRecoveryStage } from "../../../src/background/store/withdrawn-document-recovery"
import type { ClaimAuthority } from "../../../src/background/store/local-claim-writer"

export type FilterStores = { readonly local: JsonObject; readonly session: JsonObject; readonly sync: JsonObject }
export function copy<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) }
function check(value: unknown, label: string): asserts value { if (!value) throw new Error(label) }
export async function createWithdrawnFilterInput(syncing = false, prefix = false) {
  const seed: JsonObject = syncing ? { ...copy(recoveryAcceptanceFixture.seed), ...copy(recoverySyncFixture.seedOverrides) } : copy(recoveryAcceptanceFixture.seed)
  const remote: JsonObject = syncing ? copy(recoverySyncFixture.remoteInventory) : {}
  const h = createRecoveryHarness(seed, syncing ? remote : undefined), owner = createStartingLocalFilterWriter(h.deps)
  const agreement = await recoveryAgree(owner, h)
  let discarded: unknown
  if (prefix) {
    const review = await owner.readInterimRecovery()
    check(review.kind === "review", "Prefix review exists")
    const item = review.view.items.find(item => item.id.sourceKey === "playlists")
    check(item, "Independent prefix occurrence exists")
    discarded = await owner.discardInterimItem(recoveryUi, { capture: review.capture, item: item.id })
    check(discarded && typeof discarded === "object" && "kind" in discarded && discarded.kind === "committed", "Actual independent discard commits")
  }
  const prepared = await recoveryPrepare(owner)
  check(prepared.prepared.kind === "confirmation-required", "Actual filter confirmation exists")
  const accepting: { batch: JsonObject; before: JsonObject; after: JsonObject; write: "resolved" | "rejected" }[] = []
  h.write(async (batch, apply) => {
    const before = h.records()
    if (Object.hasOwn(batch, "interimConversion")) {
      apply(batch); accepting.push({ batch, before, after: h.records(), write: "resolved" }); return
    }
    accepting.push({ batch, before, after: h.records(), write: "rejected" }); throw h.error
  })
  const acceptance = await owner.replaceInterimFilter(recoveryUi, prepared.prepared.confirmation)
  const accepted = h.records().interimConversion
  check(isAcceptedFilterRecord(accepted), "Pending filter comes from actual accepting IO")
  check(accepting.length === 2 && accepting[1]?.write === "rejected", "Actual document write rejects unchanged")
  const retainedStores: FilterStores = { local: h.records(), session: {}, sync: remote }
  const effects = copy(h.effects), writes = copy(h.writes)
  await owner.dispose()
  const renewal = await renewWithdrawalAgreement(retainedStores)
  check(sameConsentValue(renewal.stores.local.interimConversion, accepted), "Withdrawal and new agreement preserve original accepted effect")
  return { stores: renewal.stores, accepted, recipe: { syncing, prefix, agreement, discarded, confirmation: prepared.prepared, acceptance, accepting, effects, writes, renewal } }
}
export async function heldReady(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  try { await owner.ready() } catch (error) {
    check(error instanceof StartupReadinessError && error.result.kind === "consent-held", "Reopened owner stays consent-held")
    return error.result
  }
  throw new Error("Withdrawn recovery released readiness")
}
export async function selectFilter(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  const review = await owner.readWithdrawnWork(recoveryUi)
  check(review.kind === "held", "Fresh held review exists")
  const view = review.work.find(view => view.kind === "retained-filter-replacement")
  check(view?.kind === "retained-filter-replacement", "Fresh explicit accepted filter selection exists")
  return { review, view }
}
export function submittedStage(items: JsonObject): FilterRecoveryStage {
  if (Object.hasOwn(items, "interimConversion")) return "record"
  if (!Object.hasOwn(items, "consent:jobs")) return "documents"
  const ledger = parseConsentJobs(items["consent:jobs"])
  const job = ledger?.jobs.findLast(job => job.identity.operation.kind === "retained-filter-replacement")
  check(job, "Actual filter stage has a validated job")
  switch (job.permission.kind) {
    case "held": return "register"
    case "prepared": return "prepare"
    case "armed": return "authorize"
    case "retiring": return "retire"
    case "done": return "done"
  }
}
export function createWithdrawnFilterHarness(stores: FilterStores) {
  const syncOn = consentObject(stores.local.device) && stores.local.device.syncOn === true
  let remote = copy(stores.sync)
  const base = createRecoveryHarness(copy(stores.local), syncOn ? remote : undefined)
  const h = { ...base, remote(change: (records: JsonObject) => void) { base.remote(records => { change(records); remote = copy(records) }) } }
  h.forbidAllocation()
  return { h, stores: (): FilterStores => ({ local: h.records(), session: copy(stores.session), sync: copy(remote) }) }
}
function playlistAccounts() {
  const a = "AAAAAAAAAAAAAAAA", b = "BBBBBBBBBBBBBBBB"
  check(isAccountKey(a) && isAccountKey(b), "Synthetic playlist accounts parse")
  const first: ClaimAuthority = { acct: a, lease: "fixture-lease-1", browserSession: "fixture-browser-session-1", consentGeneration: "fixture-canonical-consent-1", signedIn: true, incognito: false }
  const second: ClaimAuthority = { ...first, acct: b, lease: "fixture-lease-B", browserSession: "fixture-browser-session-B" }
  return [first, second] as const
}
export async function createWithdrawnPlaylistInput(syncing = false, prefix = false, options: {
  readonly images?: readonly [boolean, boolean]; readonly siblings?: boolean; readonly absentHistory?: boolean
} = {}) {
  const seed: JsonObject = syncing ? { ...copy(recoveryAcceptanceFixture.seed), ...copy(recoverySyncFixture.seedOverrides) } : copy(recoveryAcceptanceFixture.seed)
  if (options.absentHistory) delete seed.sync
  const [authorityA, authorityB] = playlistAccounts()
  if (options.siblings) {
    const setup = seed["doc:setup:AAAAAAAAAAAAAAAA"]
    check(consentObject(setup) && consentObject(setup.data), "Initial A Setup exists")
    seed["doc:setup:BBBBBBBBBBBBBBBB"] = { ...copy(setup), gen: "canonical-setup-B", data: { ...copy(setup.data), label: { name: "Synthetic account B" } } }
  }
  const remote: JsonObject = syncing ? copy(recoverySyncFixture.remoteInventory) : {}
  const h = createRecoveryHarness(seed, syncing ? remote : undefined)
  h.allowPlaylist("PL_GLOBAL")
  const host = h.deps.recovery
  check(host.kind === "fixture", "Actual playlist host exists")
  if (options.siblings) host.accounts.read = async () => { h.effects.push("recovery-accounts"); return copy([authorityA, authorityB]) }
  const owner = createStartingLocalFilterWriter(h.deps), agreement = await recoveryAgree(owner, h)
  let discarded: unknown, priorRestore: unknown
  let index = 0
  if (options.siblings) {
    h.replacementGeneration("playlist-v2-0-A")
    const first = await globalPlaylistRestoreSelection(owner, 0)
    priorRestore = await owner.restoreInterimPlaylist(recoveryUi, { choice: first.prepared.choice, acct: authorityA.acct })
    check(priorRestore && typeof priorRestore === "object" && "kind" in priorRestore && priorRestore.kind === "committed", "Actual first equal occurrence restores to A")
    index = 1
  } else if (prefix) {
    const review = await owner.readInterimRecovery()
    check(review.kind === "review", "Playlist prefix review exists")
    const item = review.view.items.find(item => item.id.sourceKey === "playlists" && item.id.path[0] === 0)
    check(item, "Numeric first occurrence exists for actual discard")
    discarded = await owner.discardInterimItem(recoveryUi, { capture: review.capture, item: item.id })
    check(discarded && typeof discarded === "object" && "kind" in discarded && discarded.kind === "committed", "Actual independent playlist discard commits")
    index = 1
  }
  const acct = options.siblings ? authorityB.acct : authorityA.acct
  h.replacementGeneration(`playlist-v2-${syncing ? "sync-" : ""}${index}-${options.siblings ? "B" : "A"}`)
  const selected = await globalPlaylistRestoreSelection(owner, index)
  check(selected.prepared.owners.some(row => row.acct === acct && row.status === "available"), "Original accepting choice offers the immutable chosen account")
  const [documentAfter, historyAfter] = options.images ?? [false, false]
  const accepting: { batch: JsonObject; before: JsonObject; after: JsonObject; write: "resolved" | "rejected"; error?: unknown }[] = []
  let acceptedWritten = false
  h.write(async (batch, apply) => {
    const before = h.records()
    if (Object.hasOwn(batch, "interimConversion") && !acceptedWritten) {
      apply(batch); acceptedWritten = true
      accepting.push({ batch: copy(batch), before, after: h.records(), write: "resolved" }); return
    }
    if (!Object.hasOwn(batch, "interimConversion")) {
      if (documentAfter && historyAfter) {
        apply(batch); accepting.push({ batch: copy(batch), before, after: h.records(), write: "resolved" }); return
      }
      const subset: JsonObject = {}
      for (const [key, value] of Object.entries(batch)) if (key === "sync" ? historyAfter : documentAfter) subset[key] = value
      apply(subset)
    }
    accepting.push({ batch: copy(batch), before, after: h.records(), write: "rejected", error: h.error }); throw h.error
  })
  const acceptance = await owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct })
  const accepted = h.records().interimConversion
  check(isAcceptedPlaylistRecord(accepted), "Pending playlist comes from actual ordinary accepting IO")
  check(accepting.length === (documentAfter && historyAfter ? 3 : 2) && accepting.at(-1)?.write === "rejected", "Actual accepted batch remains pending after interrupted IO")
  const retainedStores: FilterStores = { local: h.records(), session: {}, sync: remote }
  const effects = copy(h.effects), writes = copy(h.writes)
  await owner.dispose()
  const renewal = await renewWithdrawalAgreement(retainedStores)
  check(sameConsentValue(renewal.stores.local.interimConversion, accepted), "Actual withdrawal and new agreement preserve the fixed playlist record")
  return { stores: JSON.parse(JSON.stringify(renewal.stores)) as FilterStores, accepted, recipe: { syncing, prefix, agreement, discarded, priorRestore, confirmation: selected.prepared, acceptance, accepting, effects, writes, renewal, images: [documentAfter, historyAfter], siblings: options.siblings ?? false } }
}
export function createWithdrawnPlaylistHarness(stores: FilterStores) {
  const f = createWithdrawnFilterHarness(stores), host = f.h.deps.recovery
  check(host.kind === "fixture", "Reopened playlist host exists")
  f.h.allowPlaylist("PL_GLOBAL")
  if (Object.hasOwn(stores.local, "doc:setup:BBBBBBBBBBBBBBBB")) host.accounts.read = async () => { f.h.effects.push("recovery-accounts"); return copy(playlistAccounts()) }
  return f
}
export async function selectPlaylist(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  const review = await owner.readWithdrawnWork(recoveryUi)
  check(review.kind === "held", "Fresh playlist held review exists")
  const view = review.work.find(view => view.kind === "retained-playlist-restore")
  check(view?.kind === "retained-playlist-restore", "Fresh explicit accepted playlist selection exists")
  return { review, view }
}
export function submittedPlaylistStage(items: JsonObject): PlaylistRecoveryStage {
  if (Object.hasOwn(items, "interimConversion")) return "record"
  if (!Object.hasOwn(items, "consent:jobs")) return "documents"
  const job = parseConsentJobs(items["consent:jobs"])?.jobs.findLast(job => job.identity.operation.kind === "retained-playlist-restore")
  check(job, "Actual playlist stage has a validated job")
  switch (job.permission.kind) {
    case "held": return "register"
    case "prepared": return "prepare"
    case "armed": return "authorize"
    case "retiring": return "retire"
    case "done": return "done"
  }
}
type StoreRef = { readonly local: string; readonly session: string; readonly sync: string }
type StoreRow = { readonly id: string; readonly kind: keyof FilterStores; readonly value: JsonObject }
type Event = { readonly kind: string; readonly stores: StoreRef; readonly data: unknown }
export function errorData(_key: string, value: unknown): unknown { return value instanceof Error ? { ...value, name: value.name, message: value.message } : value }
export function writePlaylistObservation(value: unknown, append: (chunk: string) => void) {
  let pending = ""
  const ancestors = new Set<object>()
  function emit(text: string) { pending += text; if (pending.length >= 65536) { append(pending); pending = "" } }
  const omitted = (child: unknown) => child === undefined || typeof child === "function" || typeof child === "symbol"
  function write(value: unknown, depth: number) {
    const child = errorData("", value)
    if (child === null || typeof child !== "object") { emit(JSON.stringify(child) ?? "undefined"); return }
    if (ancestors.has(child)) throw new TypeError("Converting circular structure to JSON")
    ancestors.add(child)
    const array = Array.isArray(child)
    const entries: [string, unknown][] = array ? Array.from({ length: child.length }, (_, index) => [String(index), child[index]]) : Object.entries(child)
    emit(array ? "[" : "{")
    let count = 0
    for (const [key, member] of entries) {
      if (omitted(member) && !array) continue
      emit(count++ ? ",\n" : "\n"); emit("  ".repeat(depth + 1))
      if (!array) { emit(JSON.stringify(key)); emit(": ") }
      write(omitted(member) ? null : member, depth + 1)
    }
    if (count) { emit("\n"); emit("  ".repeat(depth)) }
    emit(array ? "]" : "}")
    ancestors.delete(child)
  }
  write(value, 0); emit("\n")
  if (pending) append(pending)
}
export async function observeWithdrawnFilterV2() {
  const table: StoreRow[] = [], events: Event[] = [], ids = new Map<string, string>()
  const inputs: Awaited<ReturnType<typeof createWithdrawnFilterInput>>[] = []
  function store(kind: keyof FilterStores, value: JsonObject) {
    const key = JSON.stringify([kind, value]), existing = ids.get(key)
    if (existing) return existing
    const id = `store-${table.length + 1}`; ids.set(key, id); table.push({ id, kind, value: copy(value) }); return id
  }
  function refs(stores: FilterStores): StoreRef { return { local: store("local", stores.local), session: store("session", stores.session), sync: store("sync", stores.sync) } }
  function event(kind: string, stores: FilterStores, data: unknown) { events.push({ kind, stores: refs(stores), data }) }
  function recipeEvidence(input: Awaited<ReturnType<typeof createWithdrawnFilterInput>>) {
    const { recipe } = input
    event("actual-acceptance", input.stores, { syncing: recipe.syncing, prefix: recipe.prefix, agreement: recipe.agreement, discarded: recipe.discarded, confirmation: recipe.confirmation, result: recipe.acceptance, effects: recipe.effects, submittedWrites: recipe.writes })
    for (const entry of recipe.accepting) event("accepting-io", { ...input.stores, local: entry.after }, { batch: entry.batch, write: entry.write, before: refs({ ...input.stores, local: entry.before }) })
    const renewal = recipe.renewal
    event("actual-withdrawal", { ...renewal.withdrawal.stores, sync: input.stores.sync }, { result: renewal.withdrawal.result, reads: renewal.withdrawal.reads, calls: renewal.withdrawal.calls, ledger: renewal.withdrawal.ledger })
    for (const entry of renewal.withdrawal.writes) {
      check(entry && typeof entry === "object" && "before" in entry && "after" in entry && "items" in entry, "Withdrawal has actual IO records")
      const before = entry.before, after = entry.after
      check(consentObject(before) && consentObject(after) && consentObject(before.local) && consentObject(before.session) && consentObject(after.local) && consentObject(after.session), "Withdrawal preserves complete stores")
      event("withdrawal-io", { local: after.local, session: after.session, sync: input.stores.sync }, { batch: entry.items, before: { ...before, local: refs({ local: before.local, session: before.session, sync: input.stores.sync }).local, session: refs({ local: before.local, session: before.session, sync: input.stores.sync }).session }, after: { ...after, local: refs({ local: after.local, session: after.session, sync: input.stores.sync }).local, session: refs({ local: after.local, session: after.session, sync: input.stores.sync }).session } })
    }
    event("actual-consent-only-agree", input.stores, { ...renewal.agreement })
  }
  for (const syncing of [false, true]) {
    const input = await createWithdrawnFilterInput(syncing, true)
    inputs.push(input)
    recipeEvidence(input)
    const f = createWithdrawnFilterHarness(input.stores), h = f.h
    const boundaries: { stage: FilterRecoveryStage; stores: FilterStores }[] = []
    const ports = h.deps.recovery
    check(ports.kind === "fixture", "Recovery host is concrete")
    const trace = <T>(kind: string, result: T): T => { event(kind, f.stores(), result); return result }
    const owner = createStartingLocalFilterWriter({ ...h.deps,
      local: { async get(keys) { const result = await h.deps.local.get(keys); event("local-observation", f.stores(), { keys, result: keys === null ? refs(f.stores()).local : result }); return result }, set: items => h.deps.local.set(items) },
      startup: { ...h.deps.startup, async readInterimSnapshot() { return trace("startup-observation", await h.deps.startup.readInterimSnapshot()) } },
      recovery: { ...ports, snapshot: { async read() { return trace("explicit-observation", await ports.snapshot.read()) } }, authority: { async read() { return trace("authority-observation", await ports.authority.read()) } },
        ownership: { async lookup(authority) { const result = await ports.ownership.lookup(authority); trace("ownership-observation", result.kind === "fixture-owned" ? { ...result, ownedPlaylistIds: [...result.ownedPlaylistIds] } : result); return result } } }
    })
    const readiness = await heldReady(owner), before = f.stores(), selected = await selectFilter(owner)
    recoveryEqual(f.stores(), before, "Review preserves every store")
    recoveryEqual(h.writes, [], "Startup and review write nothing")
    recoveryEqual(h.effects.filter(value => ["stamp", "generation", "recovery-ownership", "sync-get"].includes(String(value))), [], "Read-only reopening performs no lookups, admission or allocation")
    event("read-only-reopening", f.stores(), { readiness, review: selected.review, selected: selected.view })
    h.write(async (items, apply) => {
      const prior = refs(f.stores()), stage = submittedStage(items)
      apply(items); boundaries.push({ stage, stores: f.stores() })
      event("recovery-io", f.stores(), { stage, batch: items, write: { kind: "resolved" }, before: prior, selected: selected.view.identity })
    })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-filter-replacement", "Actual selected filter recovers")
    recoveryEqual(result.completion.result.mutations.map(x => x.stage), ["register", "prepare", "authorize", "documents", "retire", "record", "done"], "All exact filter stages confirm")
    recoveryEqual(h.records(), { ...before.local, "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT": input.accepted.pending.effect.after, sync: input.accepted.pending.effect.history.after.kind === "present" ? input.accepted.pending.effect.history.after.raw : before.local.sync,
      interimConversion: completedFilterRecord(selected.view.identity), "consent:jobs": h.records()["consent:jobs"] }, "Complete store contains only selected fixed effect and its receipt ledger")
    check(h.writes.every(batch => !Object.hasOwn(batch, "device") && !Object.hasOwn(batch, "consent:state")), "Recovery performs zero Device and control writes")
    event("completion", f.stores(), { result, effects: h.effects, writes: h.writes })
    for (const mutation of result.completion.result.mutations) {
      const boundary = boundaries.find(boundary => boundary.stage === mutation.stage)
      check(boundary, "Every confirmed mutation has a complete stored boundary")
      event("confirmed-stage", boundary.stores, { selected: selected.view.identity, ...mutation, batch: h.writes.find(batch => submittedStage(batch) === mutation.stage) })
    }
    const expected = f.stores()
    await owner.dispose()
    for (const boundary of [{ stage: "before-register", stores: before }, ...boundaries]) {
      const serialized = JSON.stringify(boundary.stores), restarted = createWithdrawnFilterHarness(JSON.parse(serialized)), next = createStartingLocalFilterWriter(restarted.h.deps)
      const ready = await heldReady(next), review = await next.readWithdrawnWork(recoveryUi)
      recoveryEqual(restarted.stores(), JSON.parse(serialized), "Restart preserves exact complete stored bytes")
      recoveryEqual(restarted.h.writes, [], "Restart performs no recovery replay")
      recoveryEqual(restarted.h.effects.filter(value => ["stamp", "generation", "recovery-ownership", "sync-get"].includes(String(value))), [], "Restart has no authority, admission or allocation effects")
      event("restart-read-only", restarted.stores(), { boundary: boundary.stage, readiness: ready, review, effects: copy(restarted.h.effects) })
      let continuation: unknown
      if (review.kind === "held") {
        const view = review.work.find(view => view.kind === "retained-filter-replacement")
        if (view?.kind === "retained-filter-replacement") continuation = await next.recoverWithdrawnWork(recoveryUi, { review: review.review, job: view.selection })
      }
      if (boundary.stage !== "done") check(continuation && typeof continuation === "object" && "kind" in continuation && continuation.kind === "recovered", "Fresh explicit restart continuation finishes")
      recoveryEqual(restarted.stores(), expected, "Every fresh continuation reaches the identical complete store")
      event("restart-continuation", restarted.stores(), { boundary: boundary.stage, result: continuation, writes: restarted.h.writes, effects: restarted.h.effects })
      await next.dispose()
    }
  }
  const stages = ["register", "prepare", "authorize", "documents", "retire", "record", "done"] as const
  const source = inputs[0]; check(source, "Actual off input exists")
  for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error", "resolved-read-error", "explicit-read-error", "startup-read-error", "authority-read-error", "ownership-read-error", ...stage === "documents" ? ["partial-document", "partial-history", "rejected-partial-document", "rejected-partial-history"] as const : []] as const) {
    const f = createWithdrawnFilterHarness(source.stores), h = f.h, host = h.deps.recovery
    check(host.kind === "fixture", "Concrete fault host exists")
    const label = `${stage}:${mode}`, writeError = new Error(`write-${label}`), readError = new Error(`read-${label}`)
    let faulted = false
    async function observed<T>(kind: string, read: () => Promise<T>): Promise<T> {
      try { const value = await read(); event("fault-observation", f.stores(), { label, kind, value }); return value }
      catch (error) { event("fault-observation", f.stores(), { label, kind, error }); throw error }
    }
    const owner = createStartingLocalFilterWriter({ ...h.deps,
      local: { get: keys => observed("local", () => h.deps.local.get(keys)), set: items => h.deps.local.set(items) },
      startup: { ...h.deps.startup, readInterimSnapshot: () => observed("startup", async () => { if (faulted && mode === "startup-read-error") throw readError; return h.deps.startup.readInterimSnapshot() }) },
      recovery: { ...host, snapshot: { read: () => observed("explicit", async () => { if (faulted && mode === "explicit-read-error") throw readError; return host.snapshot.read() }) }, authority: { read: () => observed("authority", async () => { if (faulted && mode === "authority-read-error") throw readError; return host.authority.read() }) }, ownership: { async lookup(authority) {
        if (faulted && mode === "ownership-read-error") { event("fault-observation", f.stores(), { label, kind: "ownership", error: readError }); throw readError }
        const result = await host.ownership.lookup(authority)
        event("fault-observation", f.stores(), { label, kind: "ownership", value: result.kind === "fixture-owned" ? { ...result, ownedPlaylistIds: [...result.ownedPlaylistIds] } : result }); return result
      } } }
    })
    await heldReady(owner); const selected = await selectFilter(owner)
    h.write(async (batch, apply) => {
      const before = refs(f.stores()), attempted = submittedStage(batch), targeted = attempted === stage
      if (targeted) faulted = true
      if (!targeted || mode === "rejected-applied" || mode === "resolved-read-error" || mode === "divergent") apply(batch)
      if (targeted && mode === "divergent") h.foreign(records => { records.unrelated = { composedNegative: label } })
      if (targeted && mode.includes("partial-")) {
        const key = mode.endsWith("document") ? "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT" : "sync"
        apply({ [key]: batch[key]! })
      }
      if (targeted && (mode === "write-and-read-error" || mode === "resolved-read-error")) h.get(async () => { throw readError })
      const rejected = targeted && (mode.startsWith("rejected") || mode === "write-and-read-error")
      event("fault-io", f.stores(), { label, stage: attempted, before, batch, selected: selected.view.identity, write: rejected ? { kind: "rejected", error: writeError } : { kind: "resolved" } })
      if (rejected) throw writeError
    })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === (mode === "rejected-applied" ? "recovered" : "authorized-pending"), "Fault result remains correlated with actual IO")
    event("fault-result", f.stores(), { label, result, writes: h.writes, effects: h.effects })
    h.get(undefined); await owner.dispose()
    if (mode.includes("partial-")) {
      const restarted = createWithdrawnFilterHarness(copy(f.stores())), next = createStartingLocalFilterWriter(restarted.h.deps)
      await heldReady(next); const fresh = await selectFilter(next)
      check(restarted.h.writes.length === 0, "Partial restart performs no replay")
      const continued = await next.recoverWithdrawnWork(recoveryUi, { review: fresh.review.review, job: fresh.view.selection })
      check(continued.kind === "recovered", "Fresh explicit partial continuation finishes")
      event("partial-continuation", restarted.stores(), { label, selected: fresh.view.identity, result: continued, writes: restarted.h.writes, effects: restarted.h.effects })
      await next.dispose()
    }
  }
  for (const stopping of ["withdrawal", "disposal"] as const) for (const boundary of [...stages, "lookup", "lookup-register", "lookup-documents", "lookup-record", "lookup-completion"] as const) {
    const host = createRecoveryHarness(source.stores.local).deps.recovery
    check(host.kind === "fixture", "Concrete stopping host exists")
    let signalStop = () => {}; const entered = new Promise<void>(resolve => { signalStop = resolve })
    const writes: JsonObject[] = [], label = `${stopping}:${boundary}`
    const lookup = boundary.startsWith("lookup"), occurrence = boundary === "lookup-register" ? 4 : boundary === "lookup-documents" ? 11 : boundary === "lookup-record" ? 18 : boundary === "lookup-completion" ? 22 : 1
    const stageIndex = stages.findIndex(stage => stage === boundary)
    const harness = createLifecycleHarness({ local: copy(source.stores.local), session: copy(source.stores.session), database: "present" }, {
      faults: [{ port: lookup ? "owner.recovery-lookup" : "owner.local.set", occurrence: lookup ? occurrence : stageIndex + 1, mode: "hold" }], onStop: signalStop,
      configureOwner(deps, stores, lookupBoundary) { return { ...deps,
        now() { throw new Error("Stopped recovery cannot allocate time") }, generation() { throw new Error("Stopped recovery cannot allocate generation") },
        local: { ...deps.local, async set(batch) { check(consentObject(batch), "Stopping batch is complete JSON"); writes.push(copy(batch)); event("stop-invoked-io", { ...stores(), sync: source.stores.sync }, { label, batch }); await deps.local.set(batch); event("stop-drained-io", { ...stores(), sync: source.stores.sync }, { label, batch, write: { kind: "resolved" } }) } },
        recovery: { ...host, snapshot: { async read() { const local = stores().local; return { retained: interimSnapshot(local), history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" } } } }, ownership: { async lookup(authority) { await lookupBoundary(); return host.ownership.lookup(authority) } } }
      } }
    })
    const lifecycle = createStoreLifecycle(harness.deps()); await lifecycle.ready()
    const owner = lifecycle.owner(); check(owner, "Lifecycle exposes the same recovery owner")
    const selected = await selectFilter(owner), port = lookup ? "owner.recovery-lookup" : "owner.local.set"
    const arrival = harness.arrival(port, lookup ? occurrence : stageIndex + 1)
    const recovering = owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    await arrival
    const read = readConsentDevice(harness.stores().local); check(read.kind === "supported" && read.device.consent, "Actual current agreement exists at stop")
    const stopped = stopping === "withdrawal" ? lifecycle.withdrawConsent(settingsOrigin, read.device.consent) : lifecycle.dispose()
    await entered; const started = writes.length; harness.release(port)
    const result = await recovering, stopResult = await stopped
    check(writes.length === started && harness.ledger.exclusionViolations === 0 && harness.ledger.syncCalls === 0, "Stopped owner drains only its invoked IO")
    event("stop-result", { ...harness.stores(), sync: source.stores.sync }, { label, selected: selected.view.identity, result, stopResult, writes, calls: harness.calls, ledger: harness.ledger })
    await lifecycle.dispose()
  }
  for (const fault of ["account", "lease", "session", "host-generation", "ownership", "lineage"] as const) {
    const f = createWithdrawnFilterHarness(source.stores), h = f.h, host = h.deps.recovery
    check(host.kind === "fixture", "Authority capture has a concrete host")
    let lookups = 0
    const owner = createStartingLocalFilterWriter({ ...h.deps, recovery: { ...host,
      authority: { async read() { const value = await host.authority.read(); event("authority-fault-observation", f.stores(), { fault, value }); return value } },
      ownership: { async lookup(authority) {
        const result = await host.ownership.lookup(authority)
        if (++lookups === 5) {
          if (fault === "ownership") h.ownership(false)
          else if (fault !== "lineage") {
            const other = "BBBBBBBBBBBBBBBB"; check(isAccountKey(other), "Synthetic second account parses")
            h.authority({ kind: "ready", authority: { ...authority, acct: fault === "account" ? other : authority.acct, lease: fault === "lease" ? "rotated" : authority.lease, browserSession: fault === "session" ? "rotated" : authority.browserSession, consentGeneration: fault === "host-generation" ? "rotated" : authority.consentGeneration } })
          }
        }
        const returned = fault === "lineage" && lookups === 5 ? { ...result, lineage: "forbidden" } : result
        event("authority-fault-ownership", f.stores(), { fault, lookup: lookups, value: returned.kind === "fixture-owned" ? { ...returned, ownedPlaylistIds: [...returned.ownedPlaylistIds] } : returned })
        return returned
      } }
    } })
    await heldReady(owner); const selected = await selectFilter(owner)
    h.write(async (batch, apply) => { const before = refs(f.stores()); apply(batch); event("authority-fault-io", f.stores(), { fault, before, batch, write: { kind: "resolved" }, selected: selected.view.identity }) })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "authorized-pending" && !h.writes.some(batch => submittedStage(batch) === "documents"), "Fresh authority drift preserves the confirmed prefix before document IO")
    event("authority-fault-result", f.stores(), { fault, result, writes: h.writes, effects: h.effects })
    await owner.dispose()
  }
  const synced = inputs[1]; check(synced, "Actual synced accepted input exists")
  for (const fault of ["repair", "newer-addressed", "quota", "new-debt", "read-failure", "during-done"] as const) {
    const f = createWithdrawnFilterHarness(synced.stores), h = f.h
    if (fault === "repair") h.remote(records => { check(consentObject(records["s:settings"]), "Accepted repair exists"); records["s:settings"].extension = "composed-negative-drift" })
    if (fault === "newer-addressed") h.remote(records => { records["s:filter:AAAAAAAAAAAAAAAA:PL_KEPT"] = { v: 99 } })
    if (fault === "quota") h.remote(records => { records.padding = "x".repeat(105000) })
    if (fault === "new-debt") h.remote(records => { for (const name of Object.keys(records)) delete records[name] })
    const readError = new Error("remote-read-failure")
    const owner = createStartingLocalFilterWriter({ ...h.deps, sync: { ...h.deps.sync, async get() {
      if (fault === "read-failure") { event("sync-fault-observation", f.stores(), { fault, error: readError }); throw readError }
      const value = await h.deps.sync.get(); event("sync-fault-observation", f.stores(), { fault, value }); return value
    } } })
    await heldReady(owner); const selected = await selectFilter(owner)
    h.write(async (batch, apply) => { const before = refs(f.stores()); apply(batch); if (fault === "during-done" && submittedStage(batch) === "done") h.remote(records => { records["s:settings"] = { v: 99 } }); event("sync-fault-io", f.stores(), { fault, before, batch, write: { kind: "resolved" }, selected: selected.view.identity }) })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "authorized-pending" && (fault === "during-done" || !h.writes.some(batch => submittedStage(batch) === "documents")), "Changed synced admission cannot report completion")
    check(h.effects.every(value => !["sync-set", "sync-subscribe", "timer", "stamp", "generation"].includes(String(value))), "Synced refusal invokes no outbound work or allocation")
    event("sync-fault-result", f.stores(), { fault, composition: "negative-inventory", result, writes: h.writes, effects: h.effects })
    await owner.dispose()
  }
  const reconstructed = events.map(entry => ({ ...entry, stores: Object.fromEntries(Object.entries(entry.stores).map(([kind, id]) => {
    const row = table.find(row => row.id === id); check(row && row.kind === kind, "Every event store reference resolves with its exact kind"); return [kind, row.value]
  })) }))
  const references = JSON.stringify(events)
  check(reconstructed.length === events.length && table.every(row => references.includes(JSON.stringify(row.id))), "Every complete store is referenced and reconstructed")
  return { mode: "synthetic-withdrawn-confirmed-v2-filter", stores: table, events, reconstruction: { events: reconstructed.length, stores: table.length, complete: true }, activation: "held", native: "waived-and-unproven", production: "disconnected", privacyWordingApproval: "pending" }
}
export async function observeWithdrawnPlaylistV2() {
  const table: StoreRow[] = [], events: Event[] = [], ids = new Map<string, string>()
  const inputs: Awaited<ReturnType<typeof createWithdrawnPlaylistInput>>[] = []
  function store(kind: keyof FilterStores, value: JsonObject) {
    const key = JSON.stringify([kind, value]), existing = ids.get(key)
    if (existing) return existing
    const id = `store-${table.length + 1}`; ids.set(key, id); table.push({ id, kind, value: copy(value) }); return id
  }
  function refs(stores: FilterStores): StoreRef { return { local: store("local", stores.local), session: store("session", stores.session), sync: store("sync", stores.sync) } }
  function event(kind: string, stores: FilterStores, data: unknown) { events.push({ kind, stores: refs(stores), data }) }
  function recipeEvidence(input: Awaited<ReturnType<typeof createWithdrawnPlaylistInput>>) {
    const { recipe } = input
    event("actual-acceptance", input.stores, { syncing: recipe.syncing, prefix: recipe.prefix, agreement: recipe.agreement, discarded: recipe.discarded, priorRestore: recipe.priorRestore, images: recipe.images, confirmation: recipe.confirmation, result: recipe.acceptance, effects: recipe.effects, submittedWrites: recipe.writes })
    for (const entry of recipe.accepting) event("accepting-io", { ...input.stores, local: entry.after }, { batch: entry.batch, write: entry.write, error: entry.error, before: refs({ ...input.stores, local: entry.before }) })
    const renewal = recipe.renewal
    event("actual-withdrawal", { ...renewal.withdrawal.stores, sync: input.stores.sync }, { result: renewal.withdrawal.result, reads: renewal.withdrawal.reads, calls: renewal.withdrawal.calls, ledger: renewal.withdrawal.ledger })
    for (const entry of renewal.withdrawal.writes) {
      check(entry && typeof entry === "object" && "before" in entry && "after" in entry && "items" in entry, "Withdrawal has actual IO records")
      const before = entry.before, after = entry.after
      check(consentObject(before) && consentObject(after) && consentObject(before.local) && consentObject(before.session) && consentObject(after.local) && consentObject(after.session), "Withdrawal preserves complete stores")
      event("withdrawal-io", { local: after.local, session: after.session, sync: input.stores.sync }, { batch: entry.items, before: { ...before, local: refs({ local: before.local, session: before.session, sync: input.stores.sync }).local, session: refs({ local: before.local, session: before.session, sync: input.stores.sync }).session }, after: { ...after, local: refs({ local: after.local, session: after.session, sync: input.stores.sync }).local, session: refs({ local: after.local, session: after.session, sync: input.stores.sync }).session } })
    }
    event("actual-consent-only-agree", input.stores, { ...renewal.agreement })
  }
  for (const syncing of [false, true]) {
    const input = await createWithdrawnPlaylistInput(syncing, true)
    inputs.push(input)
    recipeEvidence(input)
    const f = createWithdrawnPlaylistHarness(input.stores), h = f.h
    const boundaries: { stage: PlaylistRecoveryStage; stores: FilterStores }[] = []
    const ports = h.deps.recovery
    check(ports.kind === "fixture", "Recovery host is concrete")
    const trace = <T>(kind: string, result: T): T => { event(kind, f.stores(), result); return result }
    const owner = createStartingLocalFilterWriter({ ...h.deps,
      local: { async get(keys) { const result = await h.deps.local.get(keys); event("local-observation", f.stores(), { keys, result: keys === null ? refs(f.stores()).local : result }); return result }, set: items => h.deps.local.set(items) },
      startup: { ...h.deps.startup, async readInterimSnapshot() { return trace("startup-observation", await h.deps.startup.readInterimSnapshot()) } },
      recovery: { ...ports, snapshot: { async read() { return trace("explicit-observation", await ports.snapshot.read()) } }, accounts: { async read() { return trace("accounts-observation", await ports.accounts.read()) } },
        ownership: { async lookup(authority) { const result = await ports.ownership.lookup(authority); trace("ownership-observation", result.kind === "fixture-owned" ? { ...result, ownedPlaylistIds: [...result.ownedPlaylistIds] } : result); return result } } }
    })
    const readiness = await heldReady(owner), before = f.stores(), selected = await selectPlaylist(owner)
    recoveryEqual(f.stores(), before, "Review preserves every store")
    recoveryEqual(h.writes, [], "Startup and review write nothing")
    recoveryEqual(h.effects.filter(value => ["stamp", "generation", "recovery-ownership", "sync-get"].includes(String(value))), [], "Read-only reopening performs no lookups, admission or allocation")
    event("read-only-reopening", f.stores(), { readiness, review: selected.review, selected: selected.view })
    h.write(async (items, apply) => {
      const prior = refs(f.stores()), stage = submittedPlaylistStage(items)
      apply(items); boundaries.push({ stage, stores: f.stores() })
      event("recovery-io", f.stores(), { stage, batch: items, write: { kind: "resolved" }, before: prior, selected: selected.view.identity })
    })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-playlist-restore", "Actual selected playlist recovers")
    recoveryEqual(result.completion.result.mutations.map(x => x.stage), ["register", "prepare", "authorize", "documents", "retire", "record", "done"], "All exact playlist stages confirm")
    recoveryEqual(h.records(), { ...before.local, "doc:setup:AAAAAAAAAAAAAAAA": input.accepted.pending.effect.after, sync: input.accepted.pending.effect.history.after.kind === "present" ? input.accepted.pending.effect.history.after.raw : before.local.sync,
      interimConversion: completedPlaylistRecord(selected.view.identity), "consent:jobs": h.records()["consent:jobs"] }, "Complete store contains only selected fixed effect and its receipt ledger")
    check(h.writes.every(batch => !Object.hasOwn(batch, "device") && !Object.hasOwn(batch, "consent:state")), "Recovery performs zero Device and control writes")
    event("completion", f.stores(), { result, effects: h.effects, writes: h.writes })
    for (const mutation of result.completion.result.mutations) {
      const boundary = boundaries.find(boundary => boundary.stage === mutation.stage)
      check(boundary, "Every confirmed mutation has a complete stored boundary")
      event("confirmed-stage", boundary.stores, { selected: selected.view.identity, ...mutation, batch: h.writes.find(batch => submittedPlaylistStage(batch) === mutation.stage) })
    }
    const expected = f.stores()
    await owner.dispose()
    for (const boundary of [{ stage: "before-register", stores: before }, ...boundaries]) {
      const serialized = JSON.stringify(boundary.stores), restarted = createWithdrawnPlaylistHarness(JSON.parse(serialized)), next = createStartingLocalFilterWriter(restarted.h.deps)
      const ready = await heldReady(next), review = await next.readWithdrawnWork(recoveryUi)
      recoveryEqual(restarted.stores(), JSON.parse(serialized), "Restart preserves exact complete stored bytes")
      recoveryEqual(restarted.h.writes, [], "Restart performs no recovery replay")
      recoveryEqual(restarted.h.effects.filter(value => ["stamp", "generation", "recovery-ownership", "sync-get"].includes(String(value))), [], "Restart has no authority, admission or allocation effects")
      event("restart-read-only", restarted.stores(), { boundary: boundary.stage, readiness: ready, review, effects: copy(restarted.h.effects) })
      let continuation: unknown
      if (review.kind === "held") {
        const view = review.work.find(view => view.kind === "retained-playlist-restore")
        if (view?.kind === "retained-playlist-restore") continuation = await next.recoverWithdrawnWork(recoveryUi, { review: review.review, job: view.selection })
      }
      if (boundary.stage !== "done") check(continuation && typeof continuation === "object" && "kind" in continuation && continuation.kind === "recovered", "Fresh explicit restart continuation finishes")
      recoveryEqual(restarted.stores(), expected, "Every fresh continuation reaches the identical complete store")
      event("restart-continuation", restarted.stores(), { boundary: boundary.stage, result: continuation, writes: restarted.h.writes, effects: restarted.h.effects })
      await next.dispose()
    }
  }
  const stages = ["register", "prepare", "authorize", "documents", "retire", "record", "done"] as const
  const source = inputs[0]; check(source, "Actual off input exists")
  for (const stage of stages) for (const mode of ["resolved-applied", "rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error", "resolved-read-error", "explicit-read-error", "startup-read-error", "authority-read-error", "ownership-read-error", ...stage === "documents" ? ["partial-document", "partial-history", "rejected-partial-document", "rejected-partial-history"] as const : []] as const) {
    const f = createWithdrawnPlaylistHarness(source.stores), h = f.h, host = h.deps.recovery
    check(host.kind === "fixture", "Concrete fault host exists")
    const label = `${stage}:${mode}`, writeError = new Error(`write-${label}`), readError = new Error(`read-${label}`)
    let faulted = false
    async function observed<T>(kind: string, read: () => Promise<T>): Promise<T> {
      try { const value = await read(); event("fault-observation", f.stores(), { label, kind, value }); return value }
      catch (error) { event("fault-observation", f.stores(), { label, kind, error }); throw error }
    }
    const owner = createStartingLocalFilterWriter({ ...h.deps,
      local: { get: keys => observed("local", () => h.deps.local.get(keys)), set: items => h.deps.local.set(items) },
      startup: { ...h.deps.startup, readInterimSnapshot: () => observed("startup", async () => { if (faulted && mode === "startup-read-error") throw readError; return h.deps.startup.readInterimSnapshot() }) },
      recovery: { ...host, snapshot: { read: () => observed("explicit", async () => { if (faulted && mode === "explicit-read-error") throw readError; return host.snapshot.read() }) }, accounts: { read: () => observed("accounts", async () => { if (faulted && mode === "authority-read-error") throw readError; return host.accounts.read() }) }, ownership: { async lookup(authority) {
        if (faulted && mode === "ownership-read-error") { event("fault-observation", f.stores(), { label, kind: "ownership", error: readError }); throw readError }
        const result = await host.ownership.lookup(authority)
        event("fault-observation", f.stores(), { label, kind: "ownership", value: result.kind === "fixture-owned" ? { ...result, ownedPlaylistIds: [...result.ownedPlaylistIds] } : result }); return result
      } } }
    })
    await heldReady(owner); const selected = await selectPlaylist(owner)
    h.write(async (batch, apply) => {
      const before = refs(f.stores()), attempted = submittedPlaylistStage(batch), targeted = attempted === stage
      if (targeted) faulted = true
      if (!targeted || mode === "resolved-applied" || mode === "rejected-applied" || mode === "resolved-read-error" || mode === "divergent") apply(batch)
      if (targeted && mode === "divergent") h.foreign(records => { records.unrelated = { composedNegative: label } })
      if (targeted && mode.includes("partial-")) {
        const key = mode.endsWith("document") ? "doc:setup:AAAAAAAAAAAAAAAA" : "sync"
        apply({ [key]: batch[key]! })
      }
      if (targeted && (mode === "write-and-read-error" || mode === "resolved-read-error")) h.get(async () => { throw readError })
      const rejected = targeted && (mode.startsWith("rejected") || mode === "write-and-read-error")
      event("fault-io", f.stores(), { label, stage: attempted, before, batch, selected: selected.view.identity, write: rejected ? { kind: "rejected", error: writeError } : { kind: "resolved" } })
      if (rejected) throw writeError
    })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === (mode === "rejected-applied" || mode === "resolved-applied" ? "recovered" : "authorized-pending"), "Fault result remains correlated with actual IO")
    event("fault-result", f.stores(), { label, result, writes: h.writes, effects: h.effects })
    h.get(undefined); await owner.dispose()
    if (mode.includes("partial-")) {
      const restarted = createWithdrawnPlaylistHarness(copy(f.stores())), next = createStartingLocalFilterWriter(restarted.h.deps)
      await heldReady(next); const fresh = await selectPlaylist(next)
      check(restarted.h.writes.length === 0, "Partial restart performs no replay")
      const continued = await next.recoverWithdrawnWork(recoveryUi, { review: fresh.review.review, job: fresh.view.selection })
      check(continued.kind === "recovered", "Fresh explicit partial continuation finishes")
      event("partial-continuation", restarted.stores(), { label, selected: fresh.view.identity, result: continued, writes: restarted.h.writes, effects: restarted.h.effects })
      await next.dispose()
    }
  }
  const baseline = createWithdrawnPlaylistHarness(source.stores), baselineHost = baseline.h.deps.recovery
  check(baselineHost.kind === "fixture", "Playlist stopping baseline host exists")
  const baselineStages: PlaylistRecoveryStage[] = [], baselineTrace: { kind: string; stage: string; ordinal: number }[] = []
  let baselineLookup = 0, latest = "before-register"
  const baselineOwner = createStartingLocalFilterWriter({ ...baseline.h.deps, recovery: { ...baselineHost,
    accounts: { async read() { baselineTrace.push({ kind: "accounts", stage: latest, ordinal: baselineTrace.length + 1 }); return baselineHost.accounts.read() } },
    ownership: { async lookup(authority) { baselineTrace.push({ kind: "ownership", stage: latest, ordinal: ++baselineLookup }); return baselineHost.ownership.lookup(authority) } }
  } })
  await heldReady(baselineOwner); const baselineSelected = await selectPlaylist(baselineOwner)
  baseline.h.write(async (batch, apply) => { latest = submittedPlaylistStage(batch); baselineStages.push(submittedPlaylistStage(batch)); apply(batch) })
  const baselineResult = await baselineOwner.recoverWithdrawnWork(recoveryUi, { review: baselineSelected.review.review, job: baselineSelected.view.selection })
  check(baselineResult.kind === "recovered", "Actual stopping baseline completes")
  event("stopping-baseline", baseline.stores(), { stages: baselineStages, trace: baselineTrace, result: baselineResult, writes: baseline.h.writes, effects: baseline.h.effects })
  await baselineOwner.dispose()
  for (const stopping of ["withdrawal", "disposal"] as const) for (const boundary of [...stages, "plural-before-lookup", "ownership-lookup", "plural-after-lookup", "completion-check"] as const) {
    const proof = createWithdrawnPlaylistHarness(source.stores), host = proof.h.deps.recovery
    check(host.kind === "fixture", "Concrete playlist stopping host exists")
    let signalStop = () => {}; const entered = new Promise<void>(resolve => { signalStop = resolve })
    let active = false, lookedUp = false, held = false, lookups = 0
    const writes: JsonObject[] = [], label = `${stopping}:${boundary}`
    const localStage = stages.some(stage => stage === boundary)
    const occurrence = localStage ? baselineStages.findIndex(stage => stage === boundary) + 1 : 1
    check(occurrence > 0, "Stop occurrence derives from the actual stage trace")
    const port = localStage ? "owner.local.set" : "owner.recovery-lookup"
    const harness = createLifecycleHarness({ local: copy(source.stores.local), session: copy(source.stores.session), database: "present" }, {
      faults: [{ port, occurrence, mode: "hold" }], onStop: signalStop,
      configureOwner(deps, stores, lookupBoundary) {
        async function hold(matches: boolean) { if (active && matches && !held) { held = true; await lookupBoundary() } }
        return { ...deps,
          now() { throw new Error("Stopped playlist cannot allocate time") }, generation() { throw new Error("Stopped playlist cannot allocate generation") },
          local: { ...deps.local, async set(batch) { check(consentObject(batch), "Stopping playlist batch is complete JSON"); writes.push(copy(batch)); event("stop-invoked-io", { ...stores(), sync: source.stores.sync }, { label, batch }); await deps.local.set(batch); event("stop-drained-io", { ...stores(), sync: source.stores.sync }, { label, batch, write: { kind: "resolved" } }) } },
          recovery: { ...host,
            snapshot: { async read() { const local = stores().local; return { retained: interimSnapshot(local), history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" } } } },
            accounts: { async read() { await hold(boundary === "plural-before-lookup" && !lookedUp || boundary === "plural-after-lookup" && lookedUp); return host.accounts.read() } },
            ownership: { async lookup(authority) { if (active) lookups++; await hold(boundary === "ownership-lookup" || boundary === "completion-check" && lookups === baselineLookup); const result = await host.ownership.lookup(authority); lookedUp = true; return result } }
          }
        }
      }
    })
    const lifecycle = createStoreLifecycle(harness.deps()); await lifecycle.ready()
    const owner = lifecycle.owner(); check(owner, "Lifecycle exposes the same playlist owner")
    const selected = await selectPlaylist(owner), arrival = harness.arrival(port, occurrence)
    active = true
    const recovering = owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    await arrival
    const read = readConsentDevice(harness.stores().local); check(read.kind === "supported" && read.device.consent, "Current playlist agreement exists at stop")
    const stopped = stopping === "withdrawal" ? lifecycle.withdrawConsent(settingsOrigin, read.device.consent) : lifecycle.dispose()
    await entered; const started = writes.length; harness.release(port)
    const result = await recovering, stopResult = await stopped
    check(result.kind !== "recovered" && writes.length === started && harness.ledger.exclusionViolations === 0 && harness.ledger.syncCalls === 0, "Stopped playlist owner drains its invoked IO and starts no next stage")
    event("stop-result", { ...harness.stores(), sync: source.stores.sync }, { label, derivedOccurrence: occurrence, baselineCompletionLookup: baselineLookup, selected: selected.view.identity, result, stopResult, writes, calls: harness.calls, ledger: harness.ledger })
    await lifecycle.dispose()
  }
  for (const fault of ["account", "lease", "session", "host-generation", "ownership", "lineage", "duplicate", "unselected"] as const) {
    const f = createWithdrawnPlaylistHarness(source.stores), h = f.h, host = h.deps.recovery
    check(host.kind === "fixture", "Playlist authority host exists")
    let changed = false
    const owner = createStartingLocalFilterWriter({ ...h.deps, recovery: { ...host,
      accounts: { async read() {
        const rows = await host.accounts.read()
        const value = !changed ? rows : fault === "duplicate" ? [...rows, ...rows] : fault === "account" ? [playlistAccounts()[1]] : rows.map(row => ({ ...row, lease: fault === "lease" ? "rotated" : row.lease, browserSession: fault === "session" ? "rotated" : row.browserSession, consentGeneration: fault === "host-generation" ? "rotated" : row.consentGeneration }))
        const result = changed && fault === "unselected" ? [...value, playlistAccounts()[1]] : value
        event("authority-fault-observation", f.stores(), { fault, value: result }); return result
      } },
      ownership: { async lookup(authority) {
        const result = await host.ownership.lookup(authority)
        const returned = changed && fault === "ownership" ? { kind: "unavailable" as const } : changed && fault === "lineage" ? { ...result, lineage: "forbidden" } : result
        event("authority-fault-ownership", f.stores(), { fault, value: returned.kind === "fixture-owned" ? { ...returned, ownedPlaylistIds: [...returned.ownedPlaylistIds] } : returned }); return returned
      } }
    } })
    await heldReady(owner); const selected = await selectPlaylist(owner)
    h.write(async (batch, apply) => { const before = refs(f.stores()); apply(batch); if (submittedPlaylistStage(batch) === "register") changed = true; event("authority-fault-io", f.stores(), { fault, before, batch, write: { kind: "resolved" }, selected: selected.view.identity }) })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "authorized-pending" && !h.writes.some(batch => submittedPlaylistStage(batch) === "documents"), "Playlist authority drift starts no document stage")
    event("authority-fault-result", f.stores(), { fault, result, writes: h.writes, effects: h.effects })
    await owner.dispose()
  }
  const synced = inputs[1]; check(synced, "Actual synced accepted input exists")
  for (const fault of ["repair", "newer-addressed", "quota", "new-debt", "read-failure", "during-done"] as const) {
    const f = createWithdrawnPlaylistHarness(synced.stores), h = f.h
    if (fault === "repair") h.remote(records => { check(consentObject(records["s:settings"]), "Accepted repair exists"); records["s:settings"].extension = "composed-negative-drift" })
    if (fault === "newer-addressed") h.remote(records => { records["s:setup:AAAAAAAAAAAAAAAA"] = { v: 99 } })
    if (fault === "quota") h.remote(records => { records.padding = "x".repeat(105000) })
    if (fault === "new-debt") h.remote(records => { for (const name of Object.keys(records)) delete records[name] })
    const readError = new Error("remote-read-failure")
    const owner = createStartingLocalFilterWriter({ ...h.deps, sync: { ...h.deps.sync, async get() {
      if (fault === "read-failure") { event("sync-fault-observation", f.stores(), { fault, error: readError }); throw readError }
      const value = await h.deps.sync.get(); event("sync-fault-observation", f.stores(), { fault, value }); return value
    } } })
    await heldReady(owner); const selected = await selectPlaylist(owner)
    h.write(async (batch, apply) => { const before = refs(f.stores()); apply(batch); if (fault === "during-done" && submittedPlaylistStage(batch) === "done") h.remote(records => { records["s:settings"] = { v: 99 } }); event("sync-fault-io", f.stores(), { fault, before, batch, write: { kind: "resolved" }, selected: selected.view.identity }) })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "authorized-pending" && (fault === "during-done" || !h.writes.some(batch => submittedPlaylistStage(batch) === "documents")), "Changed synced admission cannot report completion")
    check(h.effects.every(value => !["sync-set", "sync-subscribe", "timer", "stamp", "generation"].includes(String(value))), "Synced refusal invokes no outbound work or allocation")
    event("sync-fault-result", f.stores(), { fault, composition: "negative-inventory", result, writes: h.writes, effects: h.effects })
    await owner.dispose()
  }
  const positiveCases: { readonly label: string; readonly syncing: boolean; readonly images?: readonly [boolean, boolean]; readonly siblings?: boolean; readonly absentHistory?: boolean }[] = []
  for (const syncing of [false, true]) for (const images of [[false, false], [true, false], [false, true], [true, true]] as const) positiveCases.push({ label: `images:${syncing}:${images.join(":")}`, syncing, images })
  positiveCases.push({ label: "equal-occurrences-A-then-B", syncing: false, siblings: true }, { label: "absent-history", syncing: false, absentHistory: true })
  for (const configuration of positiveCases) {
    const input = await createWithdrawnPlaylistInput(configuration.syncing, false, configuration)
    recipeEvidence(input)
    const f = createWithdrawnPlaylistHarness(input.stores), host = f.h.deps.recovery
    check(host.kind === "fixture", "Positive playlist host exists")
    let reads = 0
    const trace = <T>(kind: string, value: T): T => { event("input-case-observation", f.stores(), { label: configuration.label, kind, value }); return value }
    const owner = createStartingLocalFilterWriter({ ...f.h.deps,
      local: { get: async keys => trace("local", await f.h.deps.local.get(keys)), set: items => f.h.deps.local.set(items) },
      startup: { ...f.h.deps.startup, readInterimSnapshot: async () => trace("startup", await f.h.deps.startup.readInterimSnapshot()) },
      recovery: { ...host,
        snapshot: { read: async () => trace("explicit", await host.snapshot.read()) },
        accounts: { async read() { const rows = await host.accounts.read(); return trace("accounts", configuration.siblings && ++reads % 2 ? [...rows].reverse() : rows) } },
        ownership: { async lookup(authority) { const result = await host.ownership.lookup(authority); trace("ownership", result.kind === "fixture-owned" ? { ...result, ownedPlaylistIds: [...result.ownedPlaylistIds] } : result); return result } }
      }
    })
    await heldReady(owner); const selected = await selectPlaylist(owner), before = f.stores()
    recoveryEqual(f.h.writes, [], "Every new input restarts without replay")
    f.h.write(async (batch, apply) => { const prior = refs(f.stores()); apply(batch); event("input-case-io", f.stores(), { label: configuration.label, stage: submittedPlaylistStage(batch), before: prior, batch, write: { kind: "resolved" }, selected: selected.view.identity }) })
    const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-playlist-restore", "Every operation-produced playlist input completes")
    const allAfter = configuration.images?.every(Boolean) ?? false
    recoveryEqual(result.completion.result.mutations.map(mutation => mutation.stage), stages.filter(stage => stage !== "documents" || !allAfter), "Fixed after-images skip documents")
    const effect = input.accepted.pending.effect
    recoveryEqual(f.stores(), { ...before, local: { ...before.local, [`doc:setup:${effect.key.acct}`]: effect.after, ...effect.history.after.kind === "present" ? { sync: effect.history.after.raw } : {}, interimConversion: completedPlaylistRecord(selected.view.identity), "consent:jobs": f.h.records()["consent:jobs"] } }, "Every positive changes only its immutable fixed effect and ledger")
    event("input-case-completion", f.stores(), { label: configuration.label, selected: selected.view.identity, review: selected.review, result, writes: f.h.writes, effects: f.h.effects, before: refs(before) })
    await owner.dispose()
  }
  const reconstructed = events.map(entry => ({ ...entry, stores: Object.fromEntries(Object.entries(entry.stores).map(([kind, id]) => {
    const row = table.find(row => row.id === id); check(row && row.kind === kind, "Every event store reference resolves with its exact kind"); return [kind, row.value]
  })) }))
  const references = JSON.stringify(events)
  check(reconstructed.length === events.length && table.every(row => references.includes(JSON.stringify(row.id))), "Every complete store is referenced and reconstructed")
  return { mode: "synthetic-withdrawn-confirmed-v2-playlist", stores: table, events, reconstruction: { events: reconstructed.length, stores: table.length, complete: true }, activation: "held", native: "waived-and-unproven", production: "disconnected", privacyWordingApproval: "pending" }
}
if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some(value => value !== "--filter-v2-only" && value !== "--playlist-v2-only")) throw new Error("Unsupported withdrawn filter fixture flag")
  const result = args[0] === "--playlist-v2-only" ? await observeWithdrawnPlaylistV2() : await observeWithdrawnFilterV2()
  if (args[0] === "--playlist-v2-only") writePlaylistObservation(result, chunk => { process.stdout.write(chunk) })
  else process.stdout.write(JSON.stringify(result, errorData, 2) + "\n")
}
