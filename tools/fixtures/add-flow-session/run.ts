import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { SessionPort } from "../../../src/background/store/session-memory"
import { isAccountKey, isPlaylistId, isVideoId } from "../../../src/shared/model"
import { createRemovalHarness, removalFixture } from "../account-removal-execution/run"
import { brand, harness, no, shortcut, tabOrigin } from "../add-flow/harness"

// Two sequential engines and a private window over one actual canonical owner. Prints reports and native session calls.
export async function runAddFlowSessionFixture() {
  const acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA"), music = brand(isPlaylistId, "PLmusic"), later = brand(isPlaylistId, "WL")
  const video = brand(isVideoId, "vid00000001"), second = brand(isVideoId, "vid00000002")
  const removal = createRemovalHarness({ ...removalFixture(), session: { unknown: { keep: true } } })
  const owner = createLocalFilterWriter(removal.deps)
  const port: SessionPort = { read: () => owner.readSession(), change: change => owner.changeSession(change) }
  const yt = harness({ session: port, clock: 1_700_000_000_000 })
  yt.tab(1, acct)
  yt.tab(2, acct)
  yt.setup(acct, { kind: "shortcut", shortcut }, [{ playlist: music }])
  yt.setup(acct, { kind: "auto-add" }, [{ playlist: music }])
  const lines: unknown[] = []
  let seen = 0
  const step = (name: string, value: unknown) => {
    const calls = removal.io.slice(seen).filter(entry => entry.phase === "invoked" && entry.kind.startsWith("session.")).map(entry => entry.kind)
    seen = removal.io.length
    lines.push({ step: name, value, session: calls })
  }
  const normal = tabOrigin(1), incognito = tabOrigin(2, true)

  step("normal shortcut add", await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal))
  const gathered = await yt.flow.batch({ playlist: later, videos: [second], auto: false }, normal)
  step("normal gather before the 429 hold", gathered)
  yt.script.add.push(() => no<"add">("failed", 429))
  step("normal 429", await yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normal))
  step("normal gather", gathered)
  step("external skip", await yt.flow.skip({ kind: "skip", acct, video: second, playlists: "all" }, normal))
  step("private shortcut add", await yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, incognito))
  step("private skip", await yt.flow.skip({ kind: "skip", acct, video, playlists: "all" }, incognito))
  await yt.flow.quiesce()
  step("first engine quiesced", removal.state().session)

  yt.advance(30_000)
  const next = yt.engine(port, "second-engine")
  step("restart: auto-add inside the 60 s memory", await next.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, normal))
  step("restart: explicit add during the 429 hold", await next.add({ via: "shortcut", site: "www", video: second, shortcut }, normal))
  if (gathered.kind === "report" && gathered.undo) {
    yt.advance(30_000)
    step("restart: gather Undo", await next.undo(gathered.undo, normal))
    step("restart: gather Undo is one-use", await next.undo(gathered.undo, normal))
  }
  await next.quiesce()
  step("final session", removal.state().session)
  return lines
}

if (import.meta.main) {
  for (const line of await runAddFlowSessionFixture()) process.stdout.write(`${JSON.stringify(line)}\n`)
}
