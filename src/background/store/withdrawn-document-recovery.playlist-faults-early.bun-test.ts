import { expect, test } from "bun:test"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { stages, openPlaylist, recoverPlaylist, playlistExecution } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const stage of stages.slice(0, 5))
  for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error", "resolved-read-error"] as const)
    test(`playlist ${stage} retains actual ${mode} outcome and its confirmed prefix`, async () => {
      const f = await openPlaylist(),
        before = f.stores(),
        writeError = new Error(`write-${stage}`),
        readError = new Error(`read-${stage}`)
      let invoked = false
      f.h.write(async (items, apply) => {
        if (submittedPlaylistStage(items) !== stage) {
          apply(items)
          return
        }
        invoked = true
        if (mode === "rejected-applied" || mode === "resolved-read-error") apply(items)
        if (mode === "divergent") {
          apply(items)
          f.h.foreign(records => {
            records.unrelated = { drift: stage }
          })
        }
        if (mode === "write-and-read-error" || mode === "resolved-read-error")
          f.h.get(async () => {
            throw readError
          })
        if (mode.startsWith("rejected") || mode === "write-and-read-error") throw writeError
      })
      const result = await recoverPlaylist(f),
        actual = playlistExecution(result)
      expect(invoked).toBe(true)
      if (mode === "rejected-applied") {
        expect(result.kind).toBe("recovered")
        expect(actual.kind).toBe("confirmed")
        const mutation = actual.mutations.find(m => m.stage === stage)
        expect(mutation?.write).toEqual({ kind: "rejected", error: writeError })
      } else {
        expect(result.kind).toBe("authorized-pending")
        expect(actual.kind).toBe(mode === "rejected-unchanged" ? "failed" : "unconfirmed")
        if (actual.kind !== "failed" && actual.kind !== "unconfirmed") throw new Error("Expected attempted-stage result")
        expect(actual.stage).toBe(stage)
        expect(actual.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
        expect(f.h.writes.at(-1) && submittedPlaylistStage(f.h.writes.at(-1)!)).toBe(stage)
        if (mode === "write-and-read-error") {
          expect(actual.write).toEqual({ kind: "rejected", error: writeError })
          expect(actual.kind === "unconfirmed" && actual.observation).toEqual({ kind: "read-failed", error: readError })
        }
        if (mode === "ignored" && stage === "documents") expect(f.h.records().interimConversion).toEqual(before.local.interimConversion)
        f.h.get(undefined)
        if (mode !== "rejected-unchanged")
          expect((await f.owner.readWithdrawnWork(recoveryUi)).kind === "held" && (await f.owner.readWithdrawnWork(recoveryUi))).not.toHaveProperty(
            "work",
            expect.arrayContaining([expect.objectContaining({ kind: "retained-playlist-restore" })])
          )
      }
      await f.owner.dispose()
    })
