import { describe, expect, test } from "bun:test"
import { createLocalFilterWriter } from "../store/local-filter-writer"
import type { SessionPort } from "../store/session-memory"
import { isAccountKey, isPlaylistId, isVideoId } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { harness, no, settle, shortcut, tabOrigin } from "../../../tools/fixtures/add-flow/harness"

function brand<T>(check: (value: unknown) => value is T, value: string): T {
  if (!check(value)) throw Error(`Invalid synthetic identifier ${value}`)
  return value
}
const acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA"), other = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
const music = brand(isPlaylistId, "PLmusic"), learning = brand(isPlaylistId, "PLlearning"), later = brand(isPlaylistId, "WL")
const video = brand(isVideoId, "vid00000001"), second = brand(isVideoId, "vid00000002")
const wall = 1_700_000_000_000
const normalTab = tabOrigin(1), privateTab = tabOrigin(2, true)
const unrelated = (): JsonObject => ({ tabs: { "1": { acct: other, site: "www", signedIn: true } }, unknown: { acct, keep: true }, [`skips:${other}`]: { vid00000009: ["PLother"] } })

// One actual owner over the removal fixture's local and session areas. Its io log is the native call record.
function world(session: JsonObject = unrelated()) {
  const removal = createRemovalHarness({ ...removalFixture(), session })
  const owner = createLocalFilterWriter(removal.deps)
  const port: SessionPort = { read: () => owner.readSession(), change: change => owner.changeSession(change) }
  const yt = harness({ session: port, clock: wall })
  yt.tab(1, acct)
  yt.tab(2, acct)
  yt.setup(acct, { kind: "shortcut", shortcut }, [{ playlist: music }])
  yt.setup(acct, { kind: "auto-add" }, [{ playlist: music }, { playlist: learning }])
  const sessionCalls = () => removal.io.filter(entry => entry.phase === "invoked" && entry.kind.startsWith("session.")).map(entry => entry.kind)
  return { removal, owner, port, yt, sessionCalls }
}

describe("two engines over one canonical owner", () => {
  test("a restarted engine keeps the 60-second memory and the 429 hold in wall time", async () => {
    const { removal, port, yt } = world()
    yt.script.add.push(() => undefined, () => no<"add">("failed", 429))
    const first = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    expect(first.kind === "report" && first.outcomes).toEqual({ [music]: { kind: "added" } })
    const remembered = yt.engine(port, "remembered"), beforeRecent = yt.calls.length
    const recent = await remembered.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, normalTab)
    expect(recent.kind === "report" && recent.outcomes[music]).toEqual({ kind: "already-in" })
    expect(yt.calls.length).toBe(beforeRecent)
    await remembered.quiesce()
    const limited = await yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
    expect(limited.kind === "report" && limited.outcomes).toEqual({ [music]: { kind: "failed", failure: "rate-limited" } })
    await yt.flow.quiesce()
    await settle()
    expect(removal.state().session).toEqual({ ...unrelated(), recent: [{ acct, playlist: music, video, at: wall }], [`cooldown:${acct}`]: wall + 60_000 })

    yt.advance(59_999)
    const restarted = yt.engine(port, "restarted"), sent = yt.calls.length
    const auto = await restarted.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, normalTab)
    expect(auto.kind === "report" && auto.outcomes[music]).toEqual({ kind: "failed", failure: "paused" })
    const paused = await restarted.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
    expect(paused.kind === "report" && paused.outcomes).toEqual({ [music]: { kind: "failed", failure: "paused" } })
    expect(yt.calls.length).toBe(sent)

    yt.advance(-600_000)
    const rewound = yt.engine(port, "rewound")
    const retried = await rewound.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
    expect(retried.kind === "report" && retried.outcomes).toEqual({ [music]: { kind: "added" } })
  })

  test("external skips survive reconstruction, auto-add obeys them and explicit adds ignore them", async () => {
    const { removal, port, yt } = world()
    expect(await yt.flow.skip({ kind: "skip", acct, video, playlists: "all" }, normalTab)).toEqual({ kind: "remembered", scope: "normal" })
    expect(removal.state().session[`skips:${acct}`]).toEqual({ [video]: "all" })
    const next = yt.engine(port, "next")
    const auto = await next.add({ via: "auto-add", site: "www", video, playlists: [music, learning], channel: null }, normalTab)
    expect(auto.kind === "report" && auto.outcomes).toEqual({ [music]: { kind: "skipped" }, [learning]: { kind: "skipped" } })
    expect(yt.calls).toEqual([])
    const explicit = await next.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    expect(explicit.kind === "report" && explicit.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(await next.skip({ kind: "unskip", acct, video }, normalTab)).toEqual({ kind: "remembered", scope: "normal" })
    expect(Object.hasOwn(removal.state().session, `skips:${acct}`)).toBe(false)
    expect(removal.state().session[`skips:${other}`]).toEqual({ vid00000009: ["PLother"] })
  })

  test("private memory never reaches a storage call and never borrows normal records", async () => {
    const { removal, sessionCalls, yt } = world()
    yt.script.add.push(() => undefined, () => no<"add">("failed", 429))
    await yt.flow.skip({ kind: "skip", acct, video: second, playlists: "all" }, privateTab)
    await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, privateTab)
    const gathered = await yt.flow.batch({ playlist: later, videos: [video, second], auto: false }, privateTab)
    await yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, privateTab)
    await settle()
    expect(sessionCalls().filter(call => !call.startsWith("session.get"))).toEqual([])
    expect(removal.state().session).toEqual(unrelated())
    expect(gathered.kind === "report" && gathered.undo?.kind).toBe("gather")

    yt.advance(1)
    const normal = await yt.flow.add({ via: "auto-add", site: "www", video: second, playlists: [learning], channel: null }, normalTab)
    expect(normal.kind === "report" && normal.outcomes).toEqual({ [learning]: { kind: "added" } })
    if (gathered.kind === "report" && gathered.undo) expect(await yt.flow.undo(gathered.undo, normalTab)).toEqual({ kind: "expired" })
    expect(sessionCalls().filter(call => call.startsWith("session.set"))).toEqual(["session.set:recent"])
  })

  test("gather Undo keeps its record across reconstruction, is one-use and never shares an ordinary handle", async () => {
    const { removal, port, yt } = world()
    const added = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    const gathered = await yt.flow.batch({ playlist: later, videos: [second], auto: false }, normalTab)
    if (added.kind !== "report" || !added.undo || gathered.kind !== "report" || !gathered.undo) throw Error("Expected handles")
    expect([added.undo, gathered.undo]).toEqual([{ kind: "add", id: "engine:1" }, { kind: "gather", id: "engine:2" }])
    const record = removal.state().session.gather
    const entry = yt.entries(acct, later)[0]?.entry
    if (!entry) throw Error("Expected the fixture's confirmed gather entry")
    expect(record).toEqual({ v: 1, global: {}, accounts: { [acct]: { last: [{ id: "engine:2", seq: 1, at: wall, auto: false, to: "playlist", count: 1, acct,
      playlist: later, added: [{ video: second, setVideoId: entry }] }] } } })
    await yt.flow.quiesce()
    expect(removal.state().session.gather).toEqual(record)

    const next = yt.engine(port, "engine-2")
    const fresh = await next.add({ via: "shortcut", site: "www", video: brand(isVideoId, "vid00000003"), shortcut }, normalTab)
    expect(await next.undo(added.undo, normalTab)).toEqual({ kind: "expired" })
    expect(fresh.kind === "report" && fresh.undo).toEqual({ kind: "add", id: "engine-2:1" })
    expect(await next.undo(gathered.undo, normalTab)).toEqual({ kind: "undone" })
    expect(await next.undo(gathered.undo, normalTab)).toEqual({ kind: "expired" })
    expect(yt.has(acct, later, second)).toBe(false)
    expect(removal.state().session.gather).toEqual({ v: 1, global: {}, accounts: { [acct]: { last: [] } } })
  })

  test("the sixth gather evicts the oldest across engines", async () => {
    const { removal, port, yt } = world()
    const handles = []
    for (let n = 0; n < 6; n++) {
      const engine = yt.engine(port, `engine-${n}`)
      const report = await engine.batch({ playlist: later, videos: [brand(isVideoId, `vid0000010${n}`)], auto: false }, normalTab)
      if (report.kind === "report") handles.push(report.undo)
    }
    const gather = removal.state().session.gather
    const last = gather && typeof gather === "object" && !Array.isArray(gather) && gather.accounts && typeof gather.accounts === "object" && !Array.isArray(gather.accounts) ? gather.accounts[acct] : undefined
    expect(last && typeof last === "object" && !Array.isArray(last) && Array.isArray(last.last) ? last.last.map(row => row && typeof row === "object" && !Array.isArray(row) ? row.id : null) : null)
      .toEqual(["engine-5:1", "engine-4:1", "engine-3:1", "engine-2:1", "engine-1:1"])
    const oldest = handles[0]
    if (!oldest) throw Error("Expected the first gather handle")
    expect(await yt.engine(port, "reader").undo(oldest, normalTab)).toEqual({ kind: "expired" })
  })
})

describe("owner lifecycle and storage failures", () => {
  test("account removal clears the account's records and a pending add cannot recreate them", async () => {
    const { removal, owner, yt } = world({ ...unrelated(), [`cooldown:${acct}`]: 5, [`skips:${acct}`]: { vid00000007: "all" } })
    yt.block()
    const adding = yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    await settle()
    const ui = { kind: "ui", windowId: 1, incognito: false } as const
    const prepared = await owner.prepareAccountRemoval(ui, acct)
    if (prepared.kind !== "confirmation-required") throw Error(`Removal not prepared: ${prepared.kind}`)
    expect((await owner.removeAccountSetup(ui, prepared.confirmation)).kind).toBe("committed")
    yt.open()
    const report = await adding
    await settle()
    expect(report.kind === "report" && report.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(removal.state().session).toEqual(unrelated())
  })

  test("a rejected unchanged write fails without stopping the owner, and an ignored write stops it", async () => {
    const { removal, owner, port, yt } = world()
    const host = removal.deps.removal
    if (host.kind !== "fixture") throw Error("Expected the fixture session host")
    const set = host.session.set
    host.session.set = async () => { throw Error("Synthetic session rejection") }
    expect(await yt.flow.pause(true)).toEqual({ kind: "failed", applied: false, error: Error("Synthetic session rejection") })
    expect((await owner.readSession()).kind).toBe("memory")
    host.session.set = async () => {}
    expect(await yt.flow.pause(true)).toEqual({ kind: "unconfirmed", cause: { kind: "readback" } })
    host.session.set = set
    expect(await owner.readSession()).toEqual({ kind: "unavailable", reason: "stale" })
    const after = await yt.engine(port, "after").add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    expect(after.kind === "report" && after.outcomes).toEqual({ [music]: { kind: "failed", failure: "not-sent" } })
    expect(yt.calls).toEqual([])
    expect(removal.state().session).toEqual(unrelated())
  })

  test("a malformed session record refuses before any YouTube request", async () => {
    const { yt } = world({ ...unrelated(), recent: [{ acct, playlist: music, video: "short", at: 1 }] })
    const explicit = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    expect(explicit.kind === "report" && explicit.outcomes).toEqual({ [music]: { kind: "failed", failure: "not-sent" } })
    const auto = await yt.flow.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, normalTab)
    expect(auto).toEqual({ kind: "report", outcomes: {}, toast: null, feedback: true, undo: null })
    expect(yt.calls).toEqual([])
  })

  test("Pause stops auto-add in private windows too while explicit adds and Undo still work", async () => {
    const { removal, yt } = world()
    expect(await yt.flow.pause(true)).toEqual({ kind: "remembered", scope: "normal" })
    expect(removal.state().session.paused).toBe(true)
    const auto = await yt.flow.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, privateTab)
    expect(auto).toEqual({ kind: "report", outcomes: {}, toast: null, feedback: true, undo: null })
    const explicit = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    if (explicit.kind !== "report" || !explicit.undo) throw Error("Expected an explicit add with Undo")
    expect(await yt.flow.undo(explicit.undo, normalTab)).toEqual({ kind: "undone" })
  })

  test("disposing the owner stops the engine without erasing normal session history", async () => {
    const { removal, owner, yt } = world()
    await yt.flow.batch({ playlist: later, videos: [video], auto: false }, normalTab)
    const kept = removal.state().session.gather
    await owner.dispose()
    const stopped = await yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
    expect(stopped).toEqual({ kind: "stopped", outcomes: {}, pending: [], feedback: true, toast: null, undo: null })
    expect(removal.state().session.gather).toEqual(kept)
  })
})

describe("tab lifetime", () => {
  test("releasing a tab ends its ordinary Undo but never a gather", async () => {
    const { yt } = world()
    const added = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
    const gathered = await yt.flow.batch({ playlist: later, videos: [second], auto: false }, normalTab)
    if (added.kind !== "report" || !added.undo || gathered.kind !== "report" || !gathered.undo) throw Error("Expected handles")
    yt.flow.releaseTab("tab 1 load 1")
    expect(await yt.flow.undo(added.undo, normalTab)).toEqual({ kind: "expired" })
    expect(await yt.flow.undo(gathered.undo, normalTab)).toEqual({ kind: "undone" })
  })
})
