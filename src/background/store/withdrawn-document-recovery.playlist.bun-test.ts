import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot } from "../../../tools/fixtures/interim-conversion/run"
import { heldReady, copy, createWithdrawnPlaylistInput, createWithdrawnPlaylistHarness, selectPlaylist, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { completedPlaylistRecord } from "./withdrawn-document-recovery"
import { stages, playlistFixture, openPlaylist, recoverPlaylist, playlistExecution } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const syncing of [false, true])
  for (const images of [
    [false, false],
    [true, false],
    [false, true],
    [true, true]
  ] as const)
    test(`playlist exact actual IO images syncing=${syncing} document=${images[0]} history=${images[1]}`, async () => {
      const source = await createWithdrawnPlaylistInput(syncing, false, { images }),
        f = await openPlaylist(source.stores),
        before = f.stores()
      const clock = Date.now
      let allocations = 0
      Date.now = () => {
        allocations++
        return 123
      }
      let result
      try {
        result = await recoverPlaylist(f)
      } finally {
        Date.now = clock
      }
      const ran = playlistExecution(result)
      expect(allocations).toBe(0)
      expect(result.kind).toBe("recovered")
      expect(ran.mutations.map(m => m.stage)).toEqual(stages.filter(stage => stage !== "documents" || !images[0] || !images[1]))
      expect(f.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toHaveLength(images[0] && images[1] ? 0 : 1)
      expect(f.h.records().device).toEqual(before.local.device)
      expect(f.h.records()["consent:state"]).toEqual(before.local["consent:state"])
      expect(f.h.records().interimConversion).toEqual(completedPlaylistRecord(f.view.identity))
      expect(f.stores().sync).toEqual(before.sync)
      expect(f.h.effects.filter(value => ["stamp", "generation", "sync-set", "sync-subscribe", "timer"].includes(String(value)))).toEqual([])
      await heldReady(f.owner)
      await f.owner.dispose()
    })
test("playlist equal numeric occurrences retain the actual A prefix and immutable B destination", async () => {
  const source = await createWithdrawnPlaylistInput(false, false, { siblings: true }),
    f = await openPlaylist(source.stores),
    before = f.stores()
  expect(source.accepted.resolutions).toHaveLength(1)
  expect(source.accepted.pending.effect.item).toEqual({ sourceKey: "playlists", path: [1] })
  expect(String(source.accepted.pending.effect.key.acct)).toBe("BBBBBBBBBBBBBBBB")
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  expect(f.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(before.local["doc:setup:AAAAAAAAAAAAAAAA"])
  expect(f.h.records().playlists).toEqual(["PL_GLOBAL", "PL_GLOBAL"])
  await f.owner.dispose()
})
test("playlist current Device extension outside the historical consent projection refuses even before capture", async () => {
  const source = await playlistFixture(),
    stores = copy(source.stores)
  if (!consentObject(stores.local.device)) throw new Error("Missing Device")
  stores.local.device.addedAfterAcceptance = { nested: [false, null] }
  const f = createWithdrawnPlaylistHarness(stores),
    owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

test("playlist every persisted recovery permission uses the exact current numeric consent generation", async () => {
  const f = await openPlaylist(),
    current = readConsentDevice(f.h.records())
  if (current.kind !== "supported" || !current.control || !current.device.consent) throw new Error("Missing numeric current generation")
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  const permissions = f.h.writes.flatMap(batch => {
    const job = parseConsentJobs(batch[consentJobsKey])?.jobs.find(job => job.identity.operation.kind === "retained-playlist-restore")
    return job && "generation" in job.permission ? [job.permission] : []
  })
  expect(permissions).toHaveLength(3)
  for (const permission of permissions) {
    expect(permission.generation).toBe(current.control.generation)
    expect(permission.current).toEqual(current.device.consent)
  }
  await f.owner.dispose()
})

for (const channel of ["explicit", "startup"] as const)
  test(`playlist ${channel} snapshot observed ABA invalidates its old selection`, async () => {
    const source = await playlistFixture(),
      f = createWithdrawnPlaylistHarness(source.stores),
      host = f.h.deps.recovery
    if (host.kind !== "fixture") throw new Error("Missing explicit host")
    let changed = false
    const adjust = (snapshot: ReturnType<typeof interimSnapshot>) => (changed ? { ...snapshot, source: { ...snapshot.source, playlists: ["PL_OBSERVED_B"] } } : snapshot)
    const owner = createStartingLocalFilterWriter({
      ...f.h.deps,
      startup: {
        ...f.h.deps.startup,
        async readInterimSnapshot() {
          const value = await f.h.deps.startup.readInterimSnapshot()
          return channel === "startup" ? adjust(value) : value
        }
      },
      recovery: {
        ...host,
        snapshot: {
          async read() {
            const value = await host.snapshot.read()
            return channel === "explicit" ? { ...value, retained: adjust(value.retained) } : value
          }
        }
      }
    })
    await heldReady(owner)
    const selected = await selectPlaylist(owner)
    changed = true
    await owner.readWithdrawnWork(recoveryUi)
    changed = false
    await owner.readWithdrawnWork(recoveryUi)
    const result = playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
    expect(result.kind).toBe("unavailable")
    expect(f.h.writes).toEqual([])
    await owner.dispose()
  })

for (const drift of ["repair", "newer-addressed", "quota", "new-debt", "read-failure"] as const)
  test(`playlist synced fixed admission refuses ${drift} and never invokes outbound work`, async () => {
    const source = await createWithdrawnPlaylistInput(true),
      f = createWithdrawnPlaylistHarness(source.stores),
      h = f.h
    if (drift === "repair")
      h.remote(records => {
        const name = "s:settings"
        if (!consentObject(records[name])) throw new Error("Missing remote repair document")
        records[name].extension = "remote-drift"
      })
    if (drift === "newer-addressed")
      h.remote(records => {
        records["s:setup:AAAAAAAAAAAAAAAA"] = { v: 99 }
      })
    if (drift === "quota")
      h.remote(records => {
        records.padding = "x".repeat(105000)
      })
    if (drift === "new-debt")
      h.remote(records => {
        for (const name of Object.keys(records)) delete records[name]
      })
    const owner = createStartingLocalFilterWriter({
      ...h.deps,
      sync: {
        ...h.deps.sync,
        async get() {
          if (drift === "read-failure") throw new Error("remote-read-failure")
          return h.deps.sync.get()
        }
      }
    })
    await heldReady(owner)
    const selected = await selectPlaylist(owner)
    const result = playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
    expect(result.kind).toBe(drift === "read-failure" ? "preflight-failed" : "unavailable")
    if (result.kind === "preflight-failed") expect(result.error).toHaveProperty("message", "remote-read-failure")
    expect(h.writes).toEqual([])
    expect(h.writes.some(batch => submittedPlaylistStage(batch) === "documents")).toBe(false)
    expect(h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
    await owner.dispose()
  })

test("playlist synced repair drift while done applies cannot report a completed recovery", async () => {
  const source = await createWithdrawnPlaylistInput(true),
    f = await openPlaylist(source.stores)
  f.h.write(async (batch, apply) => {
    apply(batch)
    if (submittedPlaylistStage(batch) === "done")
      f.h.remote(records => {
        records["s:settings"] = { v: 99 }
      })
  })
  const result = await recoverPlaylist(f),
    ran = playlistExecution(result)
  expect(result.kind).toBe("authorized-pending")
  expect(ran.kind).toBe("unconfirmed")
  expect(ran.kind === "unconfirmed" && ran.stage).toBe("done")
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, -1))
  expect(parseConsentJobs(f.h.records()[consentJobsKey])?.jobs.at(-1)?.permission.kind).toBe("done")
  expect(f.h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
  await f.owner.dispose()
})

for (const part of ["document", "history"])
  for (const rejected of [false, true])
    test(`playlist documents partial ${part} rejected=${rejected} closes execution and fresh owners finish only the fixed after-values`, async () => {
      const f = await openPlaylist()
      const error = new Error(`partial-${part}`)
      f.h.write(async (items, apply) => {
        if (submittedPlaylistStage(items) !== "documents") {
          apply(items)
          return
        }
        const key = part === "document" ? "doc:setup:AAAAAAAAAAAAAAAA" : "sync"
        apply({ [key]: items[key]! })
        if (rejected) throw error
      })
      const result = playlistExecution(await recoverPlaylist(f))
      expect(result.kind).toBe("unconfirmed")
      if (result.kind !== "unconfirmed") throw new Error("Partial write cannot confirm")
      expect(result.write).toEqual(rejected ? { kind: "rejected", error } : { kind: "resolved" })
      expect(f.h.writes.at(-1) && submittedPlaylistStage(f.h.writes.at(-1)!)).toBe("documents")
      const saved = f.stores()
      await f.owner.dispose()
      const next = await openPlaylist(JSON.parse(JSON.stringify(saved)))
      expect((await recoverPlaylist(next)).kind).toBe("recovered")
      expect(next.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toHaveLength(1)
      await next.owner.dispose()
    })
