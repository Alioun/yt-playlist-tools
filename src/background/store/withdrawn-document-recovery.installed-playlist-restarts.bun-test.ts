import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { heldReady, copy, createWithdrawnPlaylistHarness, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { stages, openPlaylist, recoverPlaylist, playlistExecution, installedFixture, contractCompleted, fixedDocuments, outbound } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const stage of stages)
  test(`installed-V3 playlist restart after ${stage} replays nothing until a fresh explicit recover`, async () => {
    const source = await installedFixture(),
      f = await openPlaylist(source.stores)
    f.h.write(async (items, apply) => {
      apply(items)
      if (submittedPlaylistStage(items) === stage)
        f.h.get(async () => {
          throw f.h.readError
        })
    })
    const first = await recoverPlaylist(f),
      ran = playlistExecution(first)
    expect(first.kind).toBe("authorized-pending")
    expect(ran.kind === "unconfirmed" && [ran.stage, ran.write.kind, ran.observation.kind]).toEqual([stage, "resolved", "read-failed"])
    f.h.get(undefined)
    const saved = f.stores()
    await f.owner.dispose()
    const idle = createWithdrawnPlaylistHarness(copy(saved)),
      owner = createStartingLocalFilterWriter(idle.h.deps)
    await heldReady(owner)
    const review = await owner.readWithdrawnWork(recoveryUi)
    expect(idle.h.writes).toEqual([])
    expect(idle.h.effects.filter(value => outbound.includes(String(value)))).toEqual([])
    expect(idle.stores()).toEqual(saved)
    await owner.dispose()
    const view = review.kind === "held" ? review.work.find(view => view.kind === "retained-playlist-restore") : undefined
    if (stage === "done") {
      expect(view).toBeUndefined()
      expect(saved.local.interimConversion).toEqual(contractCompleted(source.accepted))
      return
    }
    const terminal = stages.indexOf(stage) >= stages.indexOf("retire")
    expect(view?.kind === "retained-playlist-restore" && [view.registration, view.progress, view.checkpoint]).toEqual([
      "registered",
      terminal ? "terminal" : "accepted",
      stage === "record" ? "completed" : "pending"
    ])
    const next = await openPlaylist(copy(saved))
    expect((await recoverPlaylist(next)).kind).toBe("recovered")
    expect([...f.h.writes, ...next.h.writes].filter(batch => submittedPlaylistStage(batch) === "documents")).toEqual([fixedDocuments(source.accepted)])
    expect(next.h.writes.map(submittedPlaylistStage)).not.toContain("register")
    expect(next.h.records().interimConversion).toEqual(contractCompleted(source.accepted))
    expect(parseConsentJobs(next.h.records()[consentJobsKey])?.next).toBe(1)
    await next.owner.dispose()
  }, 120000)
