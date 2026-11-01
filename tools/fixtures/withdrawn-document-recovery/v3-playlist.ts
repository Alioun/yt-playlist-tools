import { createHash } from "node:crypto"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { readConsentDevice } from "../../../src/background/store/consent-withdrawal"
import { parseConsentJobs, sameConsentValue, consentJobsKey } from "../../../src/background/store/consent-recovery"
import { isAcceptedPlaylistRecord, completedPlaylistRecord, type PlaylistRecoveryStage } from "../../../src/background/store/withdrawn-document-recovery"
import { readRetainedRecovery, startingCanonical } from "../../../src/background/store/interim-recovery-execution"
import { createGlobalPlaylistRestoreHarness, installAuthorityFixture, globalPlaylistRestoreSelection, recoveryUi } from "../interim-recovery-review/run"
import { renewWithdrawalAgreement } from "../interim-conversion/run"
import { copy, heldReady, selectPlaylist, submittedPlaylistStage, createWithdrawnPlaylistHarness, writePlaylistObservation, type FilterStores } from "./run"

function check(value: unknown, label: string): asserts value { if (!value) throw new Error(label) }
export async function createInstalledPlaylistInput(options: { readonly images?: readonly [boolean, boolean]; readonly siblings?: boolean } = {}) {
  const h = createGlobalPlaylistRestoreHarness(), installation = await installAuthorityFixture(h), owner = installation.owner
  const installed = h.records()
  h.allocateReplacement()
  let priorRestore: unknown, index = 0
  if (options.siblings) {
    h.replacementGeneration("playlist-v3-0-A")
    const first = await globalPlaylistRestoreSelection(owner, 0)
    priorRestore = await owner.restoreInterimPlaylist(recoveryUi, { choice: first.prepared.choice, acct: h.account })
    check(priorRestore && typeof priorRestore === "object" && "kind" in priorRestore && priorRestore.kind === "committed", "Actual first equal occurrence restores to A on installed V3")
    index = 1
  }
  const acct = options.siblings ? h.accountB : h.account, destination = `doc:setup:${acct}`
  h.replacementGeneration(`playlist-v3-${index}-${options.siblings ? "B" : "A"}`)
  const selected = await globalPlaylistRestoreSelection(owner, index)
  check(selected.prepared.owners.some(row => row.acct === acct && row.status === "available"), "Original accepting choice offers the immutable chosen account")
  const [documentAfter, historyAfter] = options.images ?? [false, false]
  const accepting: { keys: string[]; write: "resolved" | "rejected" }[] = []
  let acceptedWritten = false
  h.write(async (batch, apply) => {
    if (Object.hasOwn(batch, "interimConversion") && !acceptedWritten) {
      apply(batch); acceptedWritten = true; accepting.push({ keys: Object.keys(batch).sort(), write: "resolved" }); return
    }
    if (!Object.hasOwn(batch, "interimConversion")) {
      if (documentAfter && historyAfter) { apply(batch); accepting.push({ keys: Object.keys(batch).sort(), write: "resolved" }); return }
      const subset: JsonObject = {}
      for (const [key, value] of Object.entries(batch)) if (key === "sync" ? historyAfter : documentAfter) subset[key] = value
      apply(subset)
    }
    accepting.push({ keys: Object.keys(batch).sort(), write: "rejected" }); throw h.error
  })
  const acceptance = await owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct })
  const acceptingRecords = h.records()
  const accepted: unknown = acceptingRecords.interimConversion
  check(isAcceptedPlaylistRecord(accepted), "Pending installed-V3 playlist comes from actual ordinary accepting IO")
  const acceptedBasis = accepted.basis.checkpoint
  check(acceptedBasis.v === 3, "Pending playlist has an installed-V3 basis")
  check(accepting.length === (documentAfter && historyAfter ? 3 : 2) && accepting.at(-1)?.write === "rejected", "Actual accepted batch remains pending after interrupted IO")
  const parsedAccepted = readRetainedRecovery(accepted)
  check(parsedAccepted.kind === "recovery", "Accepted playlist has a parsed recovery basis")
  const basisCanonical = startingCanonical(parsedAccepted.checkpoint.basis.checkpoint)
  check(Object.hasOwn(installed, destination) && sameConsentValue(accepted.pending.effect.before, installed[destination]) && sameConsentValue(basisCanonical?.[destination], installed[destination]), "Installation already wrote the live fixed destination Setup")
  check(accepted.pending.effect.admission.kind === "off" && accepted.pending.effect.scope.kind === "this-browser", "Installed-V3 effect is local-only")
  await owner.dispose()
  const renewal = await renewWithdrawalAgreement({ local: h.records(), session: {}, sync: {} })
  const current = readConsentDevice(renewal.stores.local), original = acceptedBasis.agreed.agreement.effect.consent
  check(sameConsentValue(renewal.stores.local.interimConversion, acceptingRecords.interimConversion), "Actual withdrawal and new agreement preserve the fixed installed-V3 playlist record")
  check(current.kind === "supported" && current.device.consent && !sameConsentValue(current.device.consent, original), "Renewal records a newer current agreement than the accepting agreement")
  return { stores: copy(renewal.stores), accepted, installed, recipe: { images: [documentAfter, historyAfter], siblings: options.siblings ?? false, priorRestore, acceptance, accepting, withdrawal: renewal.withdrawal.result, agreement: renewal.agreement.result } }
}

const stages = ["register", "prepare", "authorize", "documents", "retire", "record", "done"] as const satisfies readonly PlaylistRecoveryStage[]
const allocations = ["stamp", "generation", "sync-get", "sync-set", "sync-subscribe", "timer"]
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex") }
function count(effects: readonly unknown[], names: readonly string[]) { return effects.filter(value => names.includes(String(value))).length }
async function openInstalled(stores: FilterStores) {
  const f = createWithdrawnPlaylistHarness(stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  return { ...f, owner, ...await selectPlaylist(owner) }
}
type Opened = Awaited<ReturnType<typeof openInstalled>>
async function recover(f: Opened) { return f.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection }) }
function execution(result: Awaited<ReturnType<typeof recover>>) {
  if (result.kind === "recovered" && result.completion.operation === "retained-playlist-restore") return { kind: result.completion.result.kind, stages: result.completion.result.mutations.map(m => m.stage), writes: result.completion.result.mutations.map(m => m.write.kind) }
  if (result.kind === "authorized-pending") {
    const observed = result.observation
    return { kind: observed.kind, stage: "stage" in observed ? observed.stage : null, stages: "mutations" in observed ? observed.mutations.map(m => m.stage) : [], observation: "observation" in observed ? observed.observation.kind : null }
  }
  return { kind: result.kind, reason: "reason" in result ? result.reason : null }
}
function resolutions(local: JsonObject) {
  const parsed = readRetainedRecovery(local.interimConversion)
  return parsed.kind === "recovery" ? parsed.checkpoint.resolutions.length : -1
}

export async function observeInstalledPlaylistV3() {
  const completion: unknown[] = [], restarts: unknown[] = [], faults: unknown[] = [], lifecycle: unknown[] = []
  for (const images of [[false, false], [true, false], [false, true], [true, true]] as const) {
    const input = await createInstalledPlaylistInput({ images }), f = await openInstalled(input.stores), before = f.stores()
    const result = await recover(f), after = f.stores()
    check(result.kind === "recovered", `Installed-V3 images ${images.join("/")} recover`)
    completion.push({ images, accepting: input.recipe.accepting, result: execution(result),
      documents: f.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents").length,
      completed: sameConsentValue(after.local.interimConversion, completedPlaylistRecord(f.view.identity)),
      basis: sameConsentValue(input.accepted.basis, f.view.identity.operation.record.basis),
      original: sameConsentValue(f.view.identity.original, input.accepted.basis.checkpoint.v === 3 ? input.accepted.basis.checkpoint.agreed.agreement.effect.consent : null),
      device: sameConsentValue(before.local.device, after.local.device), control: sameConsentValue(before.local["consent:state"], after.local["consent:state"]),
      effects: count(f.h.effects, allocations), next: parseConsentJobs(after.local[consentJobsKey])?.next ?? null, resolutions: resolutions(after.local), local: digest(after.local) })
    await f.owner.dispose()
  }
  const siblings = await createInstalledPlaylistInput({ siblings: true }), s = await openInstalled(siblings.stores), sBefore = s.stores()
  const sResult = await recover(s), sAfter = s.stores()
  const siblingRow = { result: execution(sResult), item: siblings.accepted.pending.effect.item, acct: String(siblings.accepted.pending.effect.key.acct),
    prefix: sameConsentValue(sBefore.local["doc:setup:AAAAAAAAAAAAAAAA"], sAfter.local["doc:setup:AAAAAAAAAAAAAAAA"]), source: sameConsentValue(sBefore.local.playlists, sAfter.local.playlists), resolutions: resolutions(sAfter.local) }
  await s.owner.dispose()
  const base = await createInstalledPlaylistInput()
  for (const stage of stages) {
    const f = await openInstalled(copy(base.stores))
    f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === stage) f.h.get(async () => { throw f.h.readError }) })
    const first = execution(await recover(f)); f.h.get(undefined)
    const saved = f.stores(); await f.owner.dispose()
    const reopened = createWithdrawnPlaylistHarness(copy(saved)), owner = createStartingLocalFilterWriter(reopened.h.deps)
    await heldReady(owner)
    const held = await owner.readWithdrawnWork(recoveryUi)
    const idle = reopened.h.writes.length
    await owner.dispose()
    if (stage === "done") {
      check(held.kind === "held" && !held.work.some(view => view.kind === "retained-playlist-restore"), "Durable done has no playlist selection to recover again")
      restarts.push({ stage, first, idle, held: held.kind, view: null, finished: { kind: "already-complete" },
        documents: f.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents").length, resolutions: resolutions(saved.local), effects: count(reopened.h.effects, allocations) })
      continue
    }
    const next = await openInstalled(copy(saved)), finished = await recover(next)
    restarts.push({ stage, first, idle, held: held.kind, view: { registration: next.view.registration, progress: next.view.progress, checkpoint: next.view.checkpoint }, finished: execution(finished),
      documents: [...f.h.writes, ...next.h.writes].filter(batch => submittedPlaylistStage(batch) === "documents").length, resolutions: resolutions(next.stores().local), effects: count([...reopened.h.effects, ...next.h.effects], allocations) })
    await next.owner.dispose()
  }
  for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error"] as const) {
    const f = await openInstalled(copy(base.stores)), writeError = new Error(`write-${stage}`)
    f.h.write(async (items, apply) => {
      if (submittedPlaylistStage(items) !== stage) { apply(items); return }
      if (mode === "rejected-applied" || mode === "divergent") apply(items)
      if (mode === "divergent") f.h.foreign(records => { records.unrelated = { drift: stage } })
      if (mode === "write-and-read-error") f.h.get(async () => { throw f.h.readError })
      if (mode !== "ignored" && mode !== "divergent") throw writeError
    })
    faults.push({ stage, mode, result: execution(await recover(f)), last: f.h.writes.at(-1) ? submittedPlaylistStage(f.h.writes.at(-1)!) : null })
    f.h.get(undefined); await f.owner.dispose()
  }
  for (const event of ["dispose", "ownership", "accounts"] as const) {
    const f = await openInstalled(copy(base.stores)), host = f.h.deps.recovery
    check(host.kind === "fixture", "Installed-V3 authority host exists")
    let stopping: Promise<unknown> | undefined
    f.h.write(async (items, apply) => {
      apply(items)
      if (submittedPlaylistStage(items) !== "documents") return
      if (event === "dispose") stopping = f.owner.dispose()
      if (event === "ownership") f.h.ownership(false)
      if (event === "accounts") host.accounts.read = async () => []
    })
    const result = await recover(f)
    await stopping
    lifecycle.push({ event, result: execution(result), writes: f.h.writes.map(submittedPlaylistStage) })
    await f.owner.dispose()
  }
  return { mode: "synthetic-withdrawn-installed-v3-playlist", completion, siblings: siblingRow, restarts, faults, lifecycle,
    counts: { completion: completion.length, restarts: restarts.length, faults: faults.length, lifecycle: lifecycle.length },
    activation: "held", native: "waived-and-unproven", production: "disconnected", privacyWordingApproval: "pending" }
}
if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0] !== "--playlist-v3-only") throw new Error("Unsupported installed-V3 playlist fixture flag")
  writePlaylistObservation(await observeInstalledPlaylistV3(), chunk => { process.stdout.write(chunk) })
}
