import { expect, test } from "bun:test"
import { submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { stages, openPlaylist, recoverPlaylist, playlistExecution, installedFixture } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error"] as const) test(`installed-V3 playlist ${stage} keeps actual ${mode} outcome and its confirmed prefix`, async () => {
  const f = await openPlaylist((await installedFixture()).stores), writeError = new Error(`write-${stage}`)
  f.h.write(async (items, apply) => {
    if (submittedPlaylistStage(items) !== stage) { apply(items); return }
    if (mode === "rejected-applied" || mode === "divergent") apply(items)
    if (mode === "divergent") f.h.foreign(records => { records.unrelated = { drift: stage } })
    if (mode === "write-and-read-error") f.h.get(async () => { throw f.h.readError })
    if (mode === "rejected-unchanged" || mode === "rejected-applied" || mode === "write-and-read-error") throw writeError
  })
  const result = await recoverPlaylist(f), actual = playlistExecution(result)
  if (mode === "rejected-applied") {
    expect(result.kind).toBe("recovered")
    expect(actual.mutations.find(m => m.stage === stage)?.write).toEqual({ kind: "rejected", error: writeError })
  } else {
    expect(result.kind).toBe("authorized-pending")
    expect(actual.kind).toBe(mode === "rejected-unchanged" ? "failed" : "unconfirmed")
    if (actual.kind !== "failed" && actual.kind !== "unconfirmed") throw new Error("Expected attempted-stage result")
    expect(actual.stage).toBe(stage)
    expect(actual.write).toEqual(mode === "ignored" || mode === "divergent" ? { kind: "resolved" } : { kind: "rejected", error: writeError })
    expect(actual.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
    if (mode === "write-and-read-error") expect(actual.kind === "unconfirmed" && actual.observation).toEqual({ kind: "read-failed", error: f.h.readError })
  }
  f.h.get(undefined)
  await f.owner.dispose()
}, 120000)
