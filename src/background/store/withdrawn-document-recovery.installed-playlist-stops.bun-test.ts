import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { createStoreLifecycle } from "./store-lifecycle"
import { createLifecycleHarness, settingsOrigin } from "../../../tools/fixtures/device-lifecycle/run"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot } from "../../../tools/fixtures/interim-conversion/run"
import { heldReady, copy, createWithdrawnPlaylistHarness, selectPlaylist, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import type { JsonObject } from "../../shared/contracts/json"
import { stages, openPlaylist, recoverPlaylist, playlistExecution, installedFixture, fixedDocuments, offersPlaylist } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const part of ["document", "history", "corrupt"] as const) for (const rejected of [false, true]) test(`installed-V3 playlist documents ${part} partial rejected=${rejected} stays unconfirmed and a fresh owner writes only the fixed images`, async () => {
  const source = await installedFixture(), effect = source.accepted.pending.effect, destination = `doc:setup:${effect.key.acct}`, f = await openPlaylist(source.stores), error = new Error(`partial-${part}`)
  f.h.write(async (items, apply) => {
    if (submittedPlaylistStage(items) !== "documents") { apply(items); return }
    if (part === "corrupt") apply({ [destination]: { ...effect.after, gen: "corrupt-third-image" } })
    else { const key = part === "document" ? destination : "sync"; apply({ [key]: items[key]! }) }
    if (rejected) throw error
  })
  const ran = playlistExecution(await recoverPlaylist(f))
  expect(ran.kind === "unconfirmed" && [ran.stage, ran.write]).toEqual(["documents", rejected ? { kind: "rejected", error } : { kind: "resolved" }])
  const saved = f.stores(); await f.owner.dispose()
  if (part === "corrupt") {
    const held = createWithdrawnPlaylistHarness(copy(saved)), owner = createStartingLocalFilterWriter(held.h.deps)
    await heldReady(owner)
    expect(offersPlaylist(await owner.readWithdrawnWork(recoveryUi))).toBe(false)
    expect(held.h.writes).toEqual([])
    await owner.dispose()
    return
  }
  const next = await openPlaylist(copy(saved))
  expect((await recoverPlaylist(next)).kind).toBe("recovered")
  expect(next.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toEqual([fixedDocuments(source.accepted)])
  await next.owner.dispose()
}, 120000)

test("installed-V3 playlist lost ownership after documents keeps the attempted stage and writes no retirement", async () => {
  const f = await openPlaylist((await installedFixture()).stores)
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === "documents") f.h.ownership(false) })
  const ran = playlistExecution(await recoverPlaylist(f))
  expect(ran.kind === "unconfirmed" && [ran.stage, ran.observation.kind]).toEqual(["documents", "authority"])
  expect(f.h.writes.map(submittedPlaylistStage)).toEqual(["register", "prepare", "authorize", "documents"])
  await f.owner.dispose()
}, 120000)

for (const stopping of ["withdrawal", "disposal"] as const) for (const boundary of stages) test(`installed-V3 playlist same-owner ${stopping} drains suspended ${boundary} and starts no later stage`, async () => {
  const source = await installedFixture(), host = createWithdrawnPlaylistHarness(source.stores).h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing installed-V3 host")
  let signalStop = () => {}; const stopEntered = new Promise<void>(resolve => { signalStop = resolve })
  const writes: JsonObject[] = [], stageIndex = stages.indexOf(boundary)
  const harness = createLifecycleHarness({ local: copy(source.stores.local), session: copy(source.stores.session), database: "present" }, {
    faults: [{ port: "owner.local.set", occurrence: stageIndex + 1, mode: "hold" }], onStop: signalStop,
    configureOwner(deps, stores) {
      return { ...deps, now() { throw new Error("Recovery cannot allocate time") }, generation() { throw new Error("Recovery cannot allocate generation") }, local: { ...deps.local, async set(items) { if (!consentObject(items)) throw new Error("Non-JSON batch"); writes.push(copy(items)); await deps.local.set(items) } },
        recovery: { ...host, snapshot: { async read() { const local = stores().local; return { retained: interimSnapshot(local), history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" } } } } } }
    }
  })
  const lifecycle = createStoreLifecycle(harness.deps())
  await lifecycle.ready()
  const owner = lifecycle.owner()
  if (!owner) throw new Error("Lifecycle did not expose its held owner")
  const selected = await selectPlaylist(owner), arrival = harness.arrival("owner.local.set", stageIndex + 1)
  const recovering = owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
  await arrival
  const read = readConsentDevice(harness.stores().local)
  if (read.kind !== "supported" || !read.device.consent) throw new Error("Missing current agreement")
  const stopped = stopping === "withdrawal" ? lifecycle.withdrawConsent(settingsOrigin, read.device.consent) : lifecycle.dispose()
  await stopEntered
  const beforeRelease = writes.length
  harness.release("owner.local.set")
  const result = await recovering, stopResult = await stopped
  if (stopping === "withdrawal") expect(stopResult).toMatchObject({ kind: "withdrawn" })
  expect(result.kind).not.toBe("recovered")
  expect(writes.length).toBe(beforeRelease)
  const ran = playlistExecution(result)
  expect(ran.kind === "unconfirmed" && ran.stage).toBe(boundary)
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, stageIndex))
  expect(harness.ledger.exclusionViolations).toBe(0)
  expect(harness.ledger.syncCalls).toBe(0)
  await lifecycle.dispose()
})
