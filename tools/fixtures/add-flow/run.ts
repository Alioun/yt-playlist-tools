import { englishI18n } from "../localization/scripted"
import { toastText } from "../../../src/shared/copy"
import type { AddReport } from "../../../src/background/add-flow/add-flow"
import { accounts, fact, harness, lists, no, ok, shortcut, tabOrigin, videoAt } from "./harness"

const i18n = englishI18n()

const titles = { video: "A synthetic video", playlists: { [lists.music]: "Music", [lists.learning]: "Learning", [lists.old]: "Old stuff", [lists.later]: "Watch later" } }
const shown = (report: AddReport) =>
  report.kind === "report" ? { outcomes: report.outcomes, toast: report.toast && toastText(report.toast, titles, "www", i18n), undo: report.undo !== null } : report

// Plays one browser session through the real coordinator over a synthetic execution port.
export async function runAddFlowFixture() {
  const h = harness()
  const { a, b } = accounts
  const tab = tabOrigin(1)
  h.tab(1, a)
  h.tab(2, b)
  h.tab(3, null)
  h.setup(a, { kind: "auto-add" }, [{ playlist: lists.music }, { playlist: lists.learning }])
  h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: lists.music }, { playlist: lists.old }])
  const video = videoAt(1)
  const lines: unknown[] = []
  const step = (name: string, value: unknown) => {
    lines.push({ step: name, value, calls: h.calls.length })
  }

  step("signed-out shortcut", await h.flow.add({ via: "shortcut", site: "www", video, shortcut }, tabOrigin(3)))
  h.script.add.push(
    () => undefined,
    () => fact<"add">("missing")
  )
  const keyed = await h.flow.add({ via: "shortcut", site: "www", video, shortcut }, tab)
  step("shortcut saved one and found one missing", shown(keyed))
  step("auto-add right after: the recent Music add reads already in", shown(await h.flow.add({ via: "auto-add", site: "www", video, playlists: [lists.music, lists.learning], channel: null }, tab)))
  if (keyed.kind === "report" && keyed.undo) step("undo the shortcut", await h.flow.undo(keyed.undo, tab))
  step("picker tick answers on its row", shown(await h.flow.add({ via: "picker", site: "www", video: videoAt(2), playlist: lists.later, opener: "quick-save" }, tab)))
  h.put(a, lists.music, videoAt(6))
  const older = await h.flow.remove({ site: "www", video: videoAt(6), playlist: lists.music, opener: "quick-save", tick: null }, tab)
  step("older-entry untick", older.kind === "removed" ? { ...older, toast: older.toast && toastText(older.toast, titles, "www", i18n) } : older)
  if (older.kind === "removed" && older.undo) {
    step("restore the untick at the end", await h.flow.undo(older.undo, tab))
    step("restoration is one-use", await h.flow.undo(older.undo, tab))
  }
  h.script.add.push(() => {
    h.put(a, lists.music, videoAt(7))
    return ok<"add">({ setVideoId: null })
  })
  const missingId = await h.flow.add({ via: "picker", site: "www", video: videoAt(7), playlist: lists.music, opener: "quick-save" }, tab)
  step("confirmed add without an entry ID", shown(missingId))
  if (missingId.kind === "report" && missingId.undo) step("guarded video-ID Undo", await h.flow.undo(missingId.undo, tab))
  h.script.add.push(() => no<"add">("failed", 429))
  step("rate-limited", shown(await h.flow.add({ via: "shortcut", site: "www", video: videoAt(3), shortcut }, tab)))
  step("during the pause", shown(await h.flow.add({ via: "shortcut", site: "www", video: videoAt(4), shortcut }, tab)))
  const gather = await h.flow.batch({ playlist: lists.later, videos: Array.from({ length: 55 }, (_, n) => videoAt(100 + n)), auto: false }, tabOrigin(2))
  step(
    "gather of 55 on another account",
    gather.kind === "report" ? { counts: gather.outcomes.length, added: gather.outcomes.filter(({ outcome }) => outcome.kind === "added").length, undo: gather.undo !== null } : gather
  )
  if (gather.kind === "report" && gather.undo) step("undo the gather", await h.flow.undo(gather.undo, tabOrigin(2)))
  h.script.addBatch.push(call => ({
    kind: "observed",
    results: call.job.videoIds.map((videoId, index) =>
      index === 0 ? { videoId, fact: "duplicate" } : index === 1 ? { videoId, fact: "refused" } : { videoId, setVideoId: h.put(b, lists.later, videoId) }
    )
  }))
  step("mixed duplicate, refusal and confirmed batch", await h.flow.batch({ playlist: lists.later, videos: [videoAt(600), videoAt(601), videoAt(602)], auto: false }, tabOrigin(2)))
  const stopping = harness()
  stopping.tab(1, a)
  stopping.setup(a, { kind: "shortcut", shortcut }, [{ playlist: lists.music }, { playlist: lists.learning }])
  stopping.script.add.push(() => {
    const setVideoId = stopping.put(a, lists.music, videoAt(8))
    stopping.withdraw()
    return ok<"add">({ setVideoId })
  })
  step("stop after one confirmed addition", { report: await stopping.flow.add({ via: "shortcut", site: "www", video: videoAt(8), shortcut }, tab), jobs: stopping.calls.map(({ job }) => job) })
  await stopping.flow.quiesce()
  step(
    "jobs sent",
    h.calls.map(call => call.job.kind)
  )
  step(
    "marks",
    h.marks.map(([mark]) => mark)
  )
  await h.flow.quiesce()
  step("after quiesce", await h.flow.add({ via: "shortcut", site: "www", video: videoAt(5), shortcut }, tab))
  return lines
}

if (import.meta.main) {
  for (const line of await runAddFlowFixture()) process.stdout.write(`${JSON.stringify(line)}\n`)
}
