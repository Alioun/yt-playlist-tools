import { describe, expect, test } from "bun:test"
import { accounts, channels, fact, harness, lists, no, ok, settle, shortcut, tabOrigin, videoAt } from "../../../tools/fixtures/add-flow/harness"
import type { ExplicitFailure } from "../../shared/rules/outcomes"
import type { Filter } from "../../shared/model"
import type { Origin } from "../../shared/contracts"
import { CHUNK, type AddReport, type AddRequest, type UndoHandle, type UndoReport } from "./add-flow"
import { emptySessionMemory, emptySessionRevision, type SessionPort, type SessionRevision } from "../store/session-memory"
import { build } from "../../../tools/fixtures/page-link/support"
import { deferred } from "../../../tools/fixtures/tab-projection/harness"

const { a, b } = accounts
const { music, learning, later, old, fresh } = lists
const video = videoAt(1)
const tab1 = tabOrigin(1)
const auto = (playlists = [music, learning], channel: typeof channels.listed | null = channels.listed) =>
  ({ via: "auto-add", site: "www", video, playlists, channel }) as const
const quick = { via: "quick-save", site: "www", video, opener: "quick-save" } as const
const key = { via: "shortcut", site: "www", video, shortcut } as const
const pick = (playlist = music) => ({ via: "picker", site: "www", video, playlist, opener: "quick-save" }) as const
const stoppedAdd = (pending: readonly typeof music[] = [], found: Extract<AddReport, { kind: "stopped" }>["outcomes"] = {}): Extract<AddReport, { kind: "stopped" }> => ({ kind: "stopped", outcomes: found, pending, feedback: true, toast: null, undo: null })
const undoFailed = (completed: number, of: number, failure: ExplicitFailure): Extract<UndoReport, { kind: "failed" }> => ({
  kind: "failed", completed, of, failure,
  toast: { tone: "failure", auto: false, message: { kind: "undo-failed" }, action: null, remember: { tab: [], session: [] } }
})
const outcomes = (report: AddReport) => report.kind === "report" ? report.outcomes : null

function ready() {
  const h = harness()
  h.tab(1, a)
  h.tab(2, b)
  h.setup(a, { kind: "auto-add" }, [{ playlist: music }, { playlist: learning }])
  h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }])
  h.setup(a, { kind: "quick-save", site: "www", opener: "quick-save" }, [{ playlist: music }])
  h.setup(b, { kind: "quick-save", site: "www", opener: "quick-save" }, [{ playlist: music }])
  return h
}

describe("private skip projection", () => {
  const context = (acct = a) => ({ tab: { tabId: 1, incognito: true as const, site: "www" as const },
    info: { signedIn: true as const, acct, site: "www" as const, build } })

  test("detached skips come only from the requested account's actual private memory", async () => {
    const h = ready()
    try {
      await h.flow.skip({ kind: "skip", acct: a, video, playlists: [music] }, tabOrigin(1, true))
      await h.flow.skip({ kind: "skip", acct: b, video: videoAt(2), playlists: "all" }, tabOrigin(2, true))
      await h.flow.skip({ kind: "skip", acct: a, video: videoAt(3), playlists: "all" }, tab1)
      const read = await h.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })
      expect(read).toEqual({ kind: "skips", entries: [[video, [music]]] })
      if (read.kind !== "skips") throw Error("Private read unavailable")
      const playlists = read.entries[0]?.[1]
      if (Array.isArray(playlists)) playlists.push(learning)
      expect(await h.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })).toEqual({ kind: "skips", entries: [[video, [music]]] })
      expect(await h.flow.readPrivateSkips({ context: context(b), revision: emptySessionRevision })).toEqual({ kind: "skips", entries: [[videoAt(2), "all"]] })
      expect(h.calls).toEqual([])
    } finally { await h.flow.quiesce() }
  })

  test("read checks current revocation and disposal without writing or reviving old memory", async () => {
    let revision: SessionRevision = emptySessionRevision, sequence = 0, writes = 0
    let wait: (() => Promise<void>) | null = null
    const port: SessionPort = {
      async read() {
        const result = { kind: "memory", memory: emptySessionMemory, revision, sequence: ++sequence } as const
        const pending = wait; wait = null
        if (pending) await pending()
        return result
      },
      async change() { writes++; return { kind: "unavailable", reason: "stale" } }
    }
    const h = harness({ session: port })
    try {
      await h.flow.skip({ kind: "skip", acct: a, video, playlists: [music] }, tabOrigin(1, true))
      const gate = deferred(); wait = gate.wait
      const old = h.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })
      await gate.entered
      revision = { reset: 0, accounts: new Map([[a, 1]]) }
      expect(await h.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })).toEqual({ kind: "unavailable", reason: "revision" })
      gate.release()
      expect(await old).toEqual({ kind: "unavailable", reason: "revision" })
      expect(await h.flow.readPrivateSkips({ context: context(), revision })).toEqual({ kind: "skips", entries: [] })
      expect(writes).toBe(0)
      await h.flow.quiesce()
      expect((await h.flow.readPrivateSkips({ context: context(), revision })).kind).toBe("unavailable")
    } finally { await h.flow.quiesce() }
  })

  test("owner holds and a late private read stay unavailable", async () => {
    const h = ready()
    await h.flow.skip({ kind: "skip", acct: a, video, playlists: [music] }, tabOrigin(1, true))
    h.withdraw()
    expect((await h.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })).kind).toBe("unavailable")
    await h.flow.quiesce()
    const gate = deferred()
    let block = false, sequence = 0
    const port: SessionPort = {
      async read() { if (block) await gate.wait(); return { kind: "memory", memory: emptySessionMemory, revision: emptySessionRevision, sequence: ++sequence } },
      async change() { throw Error("Read wrote session") }
    }
    const late = harness({ session: port })
    await late.flow.skip({ kind: "skip", acct: a, video, playlists: "all" }, tabOrigin(1, true))
    block = true
    const pending = late.flow.readPrivateSkips({ context: context(), revision: emptySessionRevision })
    await gate.entered
    const draining = late.flow.quiesce()
    gate.release()
    expect((await pending).kind).toBe("unavailable")
    await draining
  })
})

describe("order of checks", () => {
  test("signed out answers before any target lookup or request, silently for auto-add", async () => {
    const h = ready()
    h.tab(3, null)
    expect(await h.flow.add(key, tabOrigin(3))).toEqual({ kind: "signed-out" })
    expect(await h.flow.add(auto(), tabOrigin(3))).toMatchObject({ kind: "report", outcomes: {}, toast: null })
    expect(h.accountReads).toEqual([])
    expect(h.calls).toEqual([])
  })

  test("a missing target: auto-add is silent, quick-save opens Choose, a shortcut gives the no-playlist hint", async () => {
    const h = harness()
    h.tab(1, a)
    expect(await h.flow.add(auto(), tab1)).toMatchObject({ kind: "report", outcomes: {}, toast: null })
    expect(await h.flow.add(quick, tab1)).toEqual({ kind: "choose" })
    const hint = await h.flow.add(key, tab1)
    expect(hint.kind === "report" && hint.toast).toMatchObject({ message: { kind: "no-playlist" }, action: { kind: "choose" } })
    expect(h.calls).toEqual([])
  })

  test("a switched-off feature does nothing", async () => {
    const h = ready()
    h.feature("auto-add", { on: false, feedback: true })
    expect(await h.flow.add(auto(), tab1)).toMatchObject({ outcomes: {}, toast: null })
    expect(h.calls).toEqual([])
  })

  test("settings are captured once per action", async () => {
    const h = ready()
    h.block()
    const first = h.flow.add(auto(), tab1)
    await settle()
    h.setup(a, { kind: "auto-add" }, [{ playlist: music }])
    h.feature("auto-add", { on: true, feedback: false })
    h.open()
    const report = await first
    expect(outcomes(report)).toEqual({ [music]: { kind: "added" }, [learning]: { kind: "added" } })
    expect(report.kind === "report" && report.toast?.message.kind).toBe("saved")
    const second = await h.flow.add({ ...auto(), video: videoAt(2) }, tab1)
    expect(outcomes(second)).toEqual({ [music]: { kind: "added" } })
    expect(second.kind === "report" && second.toast).toBeNull()
  })

  test("auto-add: the session skip precedes filters, an unknown channel is filtered, and nothing is read when nothing remains", async () => {
    const h = ready()
    const allow: Filter = { mode: "allow", on: true, channels: [[channels.listed, "Listed"]] }
    const first = await h.flow.add(auto([music]), tab1)
    expect(first.kind === "report" && await h.flow.undo(first.undo ?? { kind: "add", id: "none" }, tab1)).toEqual({ kind: "undone" })
    h.setup(a, { kind: "auto-add" }, [{ playlist: music, filter: allow }, { playlist: learning, filter: allow }])
    const before = h.calls.length
    const report = await h.flow.add(auto([music, learning], null), tab1)
    expect(outcomes(report)).toEqual({ [music]: { kind: "skipped" }, [learning]: { kind: "filtered", decision: "filtered-unknown-channel" } })
    expect(report.kind === "report" && report.toast?.message.kind).toBe("unknown-channel")
    expect(h.calls.length).toBe(before)
  })

  test("explicit adds bypass skips and filters", async () => {
    const h = ready()
    const added = await h.flow.add(auto([music]), tab1)
    if (added.kind !== "report" || !added.undo) throw new Error("expected an undoable auto-add")
    await h.flow.undo(added.undo, tab1)
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "added" } })
  })
})

describe("membership and the account guard", () => {
  test("fresh membership settles already in without a write", async () => {
    const h = ready()
    h.put(a, music, video)
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "already-in" } })
    expect(h.count("add")).toBe(0)
  })

  test("an account change on the read writes nothing, and that tab then refuses without a request", async () => {
    const h = ready()
    h.script.membership.push(() => no<"membership">("accountChanged"))
    const first = await h.flow.add(key, tab1)
    expect(outcomes(first)).toEqual({ [music]: { kind: "failed", failure: "account-changed" } })
    expect(first.kind === "report" && first.toast?.action).toEqual({ kind: "reload" })
    const calls = h.calls.length
    expect(outcomes(await h.flow.add(quick, tab1))).toEqual({ [music]: { kind: "failed", failure: "account-changed" } })
    expect(h.calls.length).toBe(calls)
    expect(h.count("add")).toBe(0)
    expect(outcomes(await h.flow.add(quick, tabOrigin(2)))).toEqual({ [music]: { kind: "added" } })
    h.tab(1, a)
    expect(outcomes(await h.flow.add(quick, tab1))).toEqual({ [music]: { kind: "added" } })
  })

  test("unreadable membership: an explicit add goes ahead, auto-add holds with its own toast", async () => {
    const h = ready()
    h.script.membership.push(() => fact<"membership">("unreadable"), () => fact<"membership">("unreadable"))
    const held = await h.flow.add(auto(), tab1)
    expect(outcomes(held)).toEqual({ [music]: { kind: "failed", failure: "membership-unreadable" }, [learning]: { kind: "failed", failure: "membership-unreadable" } })
    expect(held.kind === "report" && held.toast?.message).toEqual({ kind: "failed", failure: "membership-unreadable", playlists: [music, learning] })
    expect(h.count("add")).toBe(0)
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "added" } })
  })

  test("a playlist absent from the membership list is still tried", async () => {
    const h = ready()
    h.script.membership.push(() => ok<"membership">([]))
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "added" } })
  })
})

describe("adds", () => {
  test("targets are independent, one request at a time in the tab, and marks follow confirmed answers", async () => {
    const h = ready()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: old }, { playlist: music }, { playlist: learning }])
    h.script.add.push(() => fact<"add">("missing"), () => undefined, () => no<"add">("unconfirmed"))
    const report = await h.flow.add(key, tabOrigin(1, true))
    expect(outcomes(report)).toEqual({
      [old]: { kind: "failed", failure: "missing" }, [music]: { kind: "added" }, [learning]: { kind: "failed", failure: "unconfirmed" }
    })
    expect(h.count("add")).toBe(3)
    expect(h.peak("tab 1 load 1")).toBe(1)
    expect(h.marks).toEqual([
      [{ acct: a, playlist: old, mark: "missing" }, tabOrigin(1, true)],
      [{ acct: a, playlist: music, mark: "clear" }, tabOrigin(1, true)]
    ])
    expect(report.kind === "report" && report.toast?.message.kind).toBe("saved-failed")
  })

  test("an unconfirmed add is never resent and leaves no recent-add memory", async () => {
    const h = ready()
    h.script.add.push(() => no<"add">("unconfirmed"))
    await h.flow.add(key, tab1)
    expect(h.count("add")).toBe(1)
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "added" } })
    expect(h.count("membership")).toBe(2)
  })

  test("YouTube's duplicate rejection reads as already in", async () => {
    const h = ready()
    h.script.add.push(() => fact<"add">("duplicate"))
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [music]: { kind: "already-in" } })
  })

  test("YouTube Music saves and undoes through save and unsave", async () => {
    const h = ready()
    h.setup(a, { kind: "quick-save", site: "music", opener: "music-actions" }, [{ playlist: music }])
    const report = await h.flow.add({ via: "quick-save", site: "music", video, opener: "music-actions" }, tab1)
    expect(h.calls.map(call => call.job.kind)).toEqual(["membership", "save"])
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.calls.map(call => call.job.kind)).toEqual(["membership", "save", "membership", "unsave"])
  })

  test("ordinary picker ticks keep row outcomes without a toast, and choose picks leave the toast to the picker", async () => {
    const h = ready()
    h.script.add.push(() => fact<"add">("full"))
    const tick = await h.flow.add(pick(old), tab1)
    expect(tick).toMatchObject({ outcomes: { [old]: { kind: "failed", failure: "full" } }, toast: null })
    const first = await h.flow.add({ ...pick(learning), via: "choose-quick-save" }, tab1)
    expect(first).toMatchObject({ outcomes: { [learning]: { kind: "added" } }, toast: null, feedback: true })
  })
})

describe("concurrency", () => {
  test("two adds of one tuple make one add: the explicit follower reads already in, the auto-add follower is silent", async () => {
    const h = ready()
    h.block()
    const leader = h.flow.add(key, tab1)
    const explicit = h.flow.add(quick, tabOrigin(1))
    const unattended = h.flow.add(auto([music]), tabOrigin(1))
    await settle()
    h.open()
    expect(outcomes(await leader)).toEqual({ [music]: { kind: "added" } })
    expect(outcomes(await explicit)).toEqual({ [music]: { kind: "already-in" } })
    const silent = await unattended
    expect(silent.kind === "report" && silent.toast).toBeNull()
    expect(h.count("add")).toBe(1)
  })

  test("independent tuples on different tabs progress at once", async () => {
    const h = ready()
    h.block()
    const first = h.flow.add(quick, tab1)
    const second = h.flow.add(quick, tabOrigin(2))
    await settle()
    expect(h.calls.map(call => call.lane)).toEqual(["tab 1 load 1", "tab 2 load 1"])
    h.open()
    await Promise.all([first, second])
  })

  test("recent adds read already in for 60 s without asking YouTube, then YouTube is asked again", async () => {
    const h = ready()
    await h.flow.add(key, tab1)
    h.advance(59_999)
    expect(outcomes(await h.flow.add(quick, tab1))).toEqual({ [music]: { kind: "already-in" } })
    expect(h.count("membership")).toBe(1)
    h.advance(1)
    expect(outcomes(await h.flow.add(quick, tab1))).toEqual({ [music]: { kind: "already-in" } })
    expect(h.count("membership")).toBe(2)
  })

  test("an untick runs after the pending add of its row, and a later explicit add works again", async () => {
    const h = ready()
    h.block()
    const tick = h.flow.add(pick(), tab1)
    const untick = h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    await settle()
    expect(h.calls.map(call => call.job.kind)).toEqual(["membership"])
    h.open()
    const added = await tick
    expect(await untick).toMatchObject({ kind: "removed", playlist: music, video, undo: { kind: "remove" } })
    expect(h.calls.map(call => call.job.kind)).toEqual(["membership", "add", "membership", "remove"])
    if (added.kind !== "report") throw new Error("expected a report")
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: added.undo }, tab1)).toMatchObject({ kind: "removed", feedback: true, playlist: music, video })
    expect(h.has(a, music, video)).toBe(false)
    expect(outcomes(await h.flow.add(pick(), tab1))).toEqual({ [music]: { kind: "added" } })
  })
})

describe("shown-once memory", () => {
  test("a missing playlist shows once per session across tabs, an account change once per tab", async () => {
    const h = ready()
    h.tab(3, a)
    h.setup(a, { kind: "auto-add" }, [{ playlist: old }])
    h.script.add.push(() => fact<"add">("missing"), () => fact<"add">("missing"))
    const shown = async (request: AddRequest, origin: Origin) => {
      const report = await h.flow.add(request, origin)
      return report.kind === "report" ? report.toast?.message.kind ?? null : report.kind
    }
    expect(await shown(auto([old]), tab1)).toBe("failed")
    expect(await shown({ ...auto([old]), video: videoAt(2) }, tabOrigin(3))).toBeNull()
    h.script.membership.push(() => no<"membership">("accountChanged"), () => no<"membership">("accountChanged"))
    expect(await shown({ ...auto([old]), video: videoAt(3) }, tab1)).toBe("failed")
    expect(await shown({ ...auto([old]), video: videoAt(4) }, tab1)).toBeNull()
    expect(await shown({ ...auto([old]), video: videoAt(3) }, tabOrigin(3))).toBe("failed")
  })
})

describe("rate limits, refusals and new playlists", () => {
  test("a 429 pauses the account for 60 s: later adds fail at once, explicit ones say so, auto-add stays silent", async () => {
    const h = ready()
    h.script.add.push(() => no<"add">("failed", 429))
    const limited = await h.flow.add(key, tab1)
    expect(outcomes(limited)).toEqual({ [music]: { kind: "failed", failure: "rate-limited" } })
    const calls = h.calls.length
    h.advance(59_999)
    const explicit = await h.flow.add({ ...key, video: videoAt(2) }, tab1)
    expect(explicit).toMatchObject({ outcomes: { [music]: { kind: "failed", failure: "paused" } }, toast: { tone: "failure" } })
    expect(await h.flow.add({ ...auto(), video: videoAt(2) }, tab1)).toMatchObject({ toast: null })
    expect(h.calls.length).toBe(calls)
    expect(outcomes(await h.flow.add(quick, tabOrigin(2)))).toEqual({ [music]: { kind: "added" } })
    h.advance(1)
    expect(outcomes(await h.flow.add({ ...key, video: videoAt(3) }, tab1))).toEqual({ [music]: { kind: "added" } })
  })

  test("an account that can't use playlists stops that tab trying, in memory only", async () => {
    const h = ready()
    h.script.add.push(() => fact<"add">("account-refused"))
    await h.flow.add(key, tab1)
    const calls = h.calls.length
    expect(outcomes(await h.flow.add(quick, tab1))).toEqual({ [music]: { kind: "failed", failure: "account-refused" } })
    expect(h.calls.length).toBe(calls)
    expect(h.marks).toEqual([])
  })

  test("a just-created playlist waits until it is 30 s old, then sends once", async () => {
    const h = ready()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: fresh }])
    h.created(fresh, h.now - 10_000)
    expect(outcomes(await h.flow.add(key, tab1))).toEqual({ [fresh]: { kind: "added" } })
    expect(h.delays).toEqual([20_000])
    expect(h.count("add")).toBe(1)
    h.created(music, h.now - 30_000)
    await h.flow.add(pick(), tab1)
    expect(h.delays).toEqual([20_000])
  })

  test("quiesce during the new-playlist wait sends nothing", async () => {
    const h = ready()
    h.hang()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: fresh }])
    h.created(fresh, h.now)
    const waiting = h.flow.add(key, tab1)
    await settle()
    await h.flow.quiesce()
    expect(await waiting).toEqual(stoppedAdd([fresh]))
    expect(h.count("add")).toBe(0)
  })
})

describe("Undo and removal", () => {
  test("Undo removes exactly the entries the action added, after a fresh read", async () => {
    const h = ready()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }, { playlist: learning }, { playlist: later }])
    const earlier = h.put(a, learning, video)
    const report = await h.flow.add(key, tab1)
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    const added = h.calls.flatMap(call => call.job.kind === "add" ? [call.job.playlistId] : [])
    expect(added).toEqual([music, later])
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    const removed = h.calls.flatMap(call => call.job.kind === "remove" ? [call.job.setVideoId] : [])
    expect(removed).toHaveLength(2)
    expect(removed).not.toContain(earlier)
    expect(h.has(a, learning, video)).toBe(true)
    expect(h.calls.at(-3)?.job.kind).toBe("membership")
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "expired" })
  })

  test("undoing an auto-add skips only that video on those playlists", async () => {
    const h = ready()
    const report = await h.flow.add(auto([music]), tab1)
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    await h.flow.undo(report.undo, tab1)
    expect(outcomes(await h.flow.add(auto(), tab1))).toEqual({ [music]: { kind: "skipped" }, [learning]: { kind: "added" } })
    expect(outcomes(await h.flow.add({ ...auto([music]), video: videoAt(2) }, tab1))).toEqual({ [music]: { kind: "added" } })
  })

  test("a partial Undo is a failure with counts, and retrying removes only the rest", async () => {
    const h = ready()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }, { playlist: learning }])
    const report = await h.flow.add(key, tab1)
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    h.script.remove.push(() => undefined, () => no<"remove">("unconfirmed"))
    expect(await h.flow.undo(report.undo, tab1)).toEqual(undoFailed(1, 2, "unconfirmed"))
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.count("remove")).toBe(3)
  })

  test("a video already gone counts as removed; another account or a released handle removes nothing", async () => {
    const h = ready()
    const report = await h.flow.add(key, tab1)
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    h.tab(1, b)
    expect(await h.flow.undo(report.undo, tab1)).toEqual(undoFailed(0, 1, "account-changed"))
    h.tab(1, a)
    h.script.membership.push(() => ok<"membership">([{ id: music, title: "Music", contains: false }]))
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.count("remove")).toBe(0)
    const again = await h.flow.add({ ...key, video: videoAt(2) }, tab1)
    if (again.kind !== "report" || !again.undo) throw new Error("expected Undo")
    h.flow.release(again.undo)
    expect(await h.flow.undo(again.undo, tab1)).toEqual({ kind: "expired" })
  })

  test("unticking an auto-add playlist removes the tick's own entry and sets the skip", async () => {
    const h = ready()
    const tick = await h.flow.add(pick(), tab1)
    if (tick.kind !== "report") throw new Error("expected a report")
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "watch-button", tick: tick.undo }, tab1)).toMatchObject({ kind: "removed", feedback: true, playlist: music, video })
    expect(outcomes(await h.flow.add(auto([music]), tab1))).toEqual({ [music]: { kind: "skipped" } })
  })
})

describe("quiesce and consent", () => {
  test("quiesce is idempotent, drains running actions and lets queued work send nothing", async () => {
    const h = ready()
    h.block()
    const running = h.flow.add(key, tab1)
    const queued = h.flow.add({ ...key, video: videoAt(2) }, tab1)
    await settle()
    const first = h.flow.quiesce()
    expect(h.flow.quiesce()).toBe(first)
    h.open()
    await first
    expect(await running).toEqual(stoppedAdd([music]))
    expect(await queued).toEqual(stoppedAdd([music]))
    expect(h.calls.map(call => call.job.kind)).toEqual(["membership"])
    expect(await h.flow.add(quick, tabOrigin(2))).toEqual({ ...stoppedAdd(), feedback: false })
  })

  test("withdrawn consent stops the next write", async () => {
    const h = ready()
    h.script.membership.push(call => {
      h.withdraw()
      return ok<"membership">([{ id: music, title: "Music", contains: call.job.videoId !== video }])
    })
    expect(await h.flow.add(key, tab1)).toEqual(stoppedAdd([music]))
    expect(h.count("add")).toBe(0)
  })
})

describe("batch", () => {
  const many = Array.from({ length: 120 }, (_, n) => videoAt(100 + n))

  test("gather order, fresh membership per video, chunks of at most 50 and one report", async () => {
    const h = ready()
    for (const n of [0, 60, 119]) h.put(a, later, many[n] ?? video)
    const report = await h.flow.batch({ playlist: later, videos: many, auto: false }, tab1)
    expect(h.count("membership")).toBe(120)
    const chunks = h.calls.flatMap(call => call.job.kind === "addBatch" ? [call.job.videoIds] : [])
    expect(chunks.map(chunk => chunk.length)).toEqual([CHUNK, CHUNK, 17])
    expect(chunks.flat()).toEqual(many.filter((_, n) => ![0, 60, 119].includes(n)))
    if (report.kind !== "report") throw new Error("expected a report")
    expect(report.outcomes.map(({ video: id }) => id)).toEqual(many)
    expect(report.outcomes.filter(({ outcome }) => outcome.kind === "already-in")).toHaveLength(3)
    expect(report.undo?.kind).toBe("gather")
  })

  test("per-video failures stay per video, and a 429 pauses the account and fails the rest", async () => {
    const h = ready()
    h.script.addBatch.push(call => ok<"addBatch">({
      results: call.job.videoIds.map((videoId, n) => n === 0 ? { videoId, failure: { ok: false, reason: "failed" } } : { videoId, setVideoId: h.put(a, later, videoId) })
    }), () => no<"addBatch">("failed", 429))
    const report = await h.flow.batch({ playlist: later, videos: many, auto: false }, tab1)
    if (report.kind !== "report") throw new Error("expected a report")
    const kinds = report.outcomes.map(({ outcome }) => outcome.kind === "failed" ? outcome.failure : outcome.kind)
    expect(kinds.slice(0, 2)).toEqual(["unrecognised", "added"])
    expect(kinds.slice(50, 100).every(kind => kind === "rate-limited")).toBe(true)
    expect(kinds.slice(100).every(kind => kind === "paused")).toBe(true)
    expect(h.count("addBatch")).toBe(2)
    expect(outcomes(await h.flow.add({ ...key, video: videoAt(2) }, tab1))).toEqual({ [music]: { kind: "failed", failure: "paused" } })
  })

  test("a missing playlist fails every video and marks it; automatic gathers hold on unreadable membership", async () => {
    const h = ready()
    h.script.addBatch.push(() => fact<"addBatch">("missing"))
    const missing = await h.flow.batch({ playlist: old, videos: many.slice(0, 60), auto: false }, tab1)
    expect(missing.kind === "report" && missing.outcomes.every(({ outcome }) => outcome.kind === "failed" && outcome.failure === "missing")).toBe(true)
    expect(h.marks).toEqual([[{ acct: a, playlist: old, mark: "missing" }, tab1]])
    h.script.membership.push(() => fact<"membership">("unreadable"))
    const held = await h.flow.batch({ playlist: later, videos: [videoAt(9)], auto: true }, tab1)
    expect(held).toMatchObject({ outcomes: [{ outcome: { kind: "failed", failure: "membership-unreadable" } }], undo: null })
  })

  test("batch Undo removes exact entries in chunks after one read, and a short count is a failure", async () => {
    const h = ready()
    const report = await h.flow.batch({ playlist: later, videos: many, auto: false }, tab1)
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    const reads = h.count("membership")
    h.script.removeBatch.push(() => undefined, call => ok<"removeBatch">({ removed: call.job.setVideoIds.length - 1 }))
    expect(await h.flow.undo(report.undo, tab1)).toEqual(undoFailed(99, 120, "unconfirmed"))
    expect(h.count("membership")).toBe(reads + 1)
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    expect(many.some(id => h.has(a, later, id))).toBe(false)
  })

  test("the last five gathers keep Undo, and release never drops one", async () => {
    const h = ready()
    const handles: UndoHandle[] = []
    for (let n = 0; n < 6; n++) {
      const report = await h.flow.batch({ playlist: later, videos: [videoAt(200 + n)], auto: false }, tab1)
      if (report.kind === "report" && report.undo) handles.push(report.undo)
    }
    const [oldest, ...kept] = handles
    if (!oldest) throw new Error("expected handles")
    expect(await h.flow.undo(oldest, tab1)).toEqual({ kind: "expired" })
    for (const handle of kept) h.flow.release(handle)
    for (const handle of kept) expect(await h.flow.undo(handle, tab1)).toEqual({ kind: "undone" })
  })
})

describe("settled untick and restoration", () => {
  for (const site of ["www", "music"] as const) {
    test(`${site}: older membership removes by video, then Undo appends once`, async () => {
      const h = ready()
      h.put(a, music, video)
      const other = videoAt(70)
      h.put(a, music, other)
      const removed = await h.flow.remove({ site, video, playlist: music, opener: "quick-save", tick: null }, tab1)
      const job = site === "www" ? "remove" : "unsave"
      expect(h.calls.map(({ acct, job }) => ({ acct, job }))).toEqual([
        { acct: a, job: { kind: "membership", videoId: video } },
        { acct: a, job: { kind: job, playlistId: music, videoId: video } }
      ])
      expect(removed).toEqual({
        kind: "removed", playlist: music, video, feedback: true, undo: { kind: "remove", id: "engine:1" },
        toast: { tone: "confirmation", auto: false, message: { kind: "removed", playlist: music }, action: { kind: "undo" }, remember: { tab: [], session: [] } }
      })
      if (removed.kind !== "removed" || !removed.undo) throw new Error("expected removal Undo")
      expect(await Promise.all([h.flow.undo(removed.undo, tab1), h.flow.undo(removed.undo, tab1)]))
        .toEqual([{ kind: "undone" }, { kind: "expired" }])
      expect(h.entries(a, music).map(({ video }) => video)).toEqual([other, video])
      expect(h.count(site === "www" ? "add" : "save")).toBe(1)
      expect(h.calls.at(-1)).toMatchObject({ acct: a, job: { kind: site === "www" ? "add" : "save", playlistId: music, videoId: video } })
    })

    test(`${site}: an own tick removes its exact entry and preserves a second copy`, async () => {
      const h = ready()
      const tick = await h.flow.add({ ...pick(), site }, tab1)
      const first = h.entries(a, music)[0]
      if (tick.kind !== "report" || !tick.undo || !first) throw new Error("expected own entry")
      const second = h.put(a, music, video)
      const removed = await h.flow.remove({ site, video, playlist: music, opener: "quick-save", tick: tick.undo }, tab1)
      expect(removed).toMatchObject({ kind: "removed", undo: { kind: "remove" } })
      expect(h.calls.at(-1)).toMatchObject({ acct: a, job: { kind: site === "www" ? "remove" : "unsave", playlistId: music, setVideoId: first.entry } })
      expect(h.calls.at(-1)?.job).not.toHaveProperty("videoId")
      expect(h.entries(a, music)).toEqual([{ entry: second, video }])
      if (removed.kind !== "removed" || !removed.undo) throw new Error("expected Undo")
      const before = h.calls.length
      expect(await h.flow.undo(removed.undo, tab1)).toEqual({ kind: "undone" })
      expect(h.calls.slice(before).map(({ job }) => job.kind)).toEqual(["membership"])
      expect(h.entries(a, music)).toEqual([{ entry: second, video }])
    })
  }

  test("already absent settles without a write or an inverse write token", async () => {
    const h = ready()
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1))
      .toEqual({ kind: "removed", playlist: music, video, feedback: true, toast: null, undo: null })
    expect(h.calls.map(({ job }) => job.kind)).toEqual(["membership"])
  })

  test("unreadable membership still permits explicit removal, failed membership never writes", async () => {
    const h = ready()
    h.put(a, music, video)
    h.script.membership.push(() => fact<"membership">("unreadable"))
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1))
      .toMatchObject({ kind: "removed", undo: { kind: "remove" } })
    h.script.membership.push(() => no<"membership">("failed"))
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1))
      .toEqual({ kind: "failed", failure: "unrecognised" })
    expect(h.count("remove")).toBe(1)
  })

  test("mismatch, pause and signed-out outcomes never request a removal", async () => {
    const h = ready()
    const tick = await h.flow.add(pick(), tab1)
    if (tick.kind !== "report") throw new Error("expected tick")
    h.tab(1, b)
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: tick.undo }, tab1))
      .toEqual({ kind: "failed", failure: "account-changed" })
    h.tab(1, null)
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)).toEqual({ kind: "signed-out" })
    if (!tick.undo) throw new Error("expected Undo")
    expect(await h.flow.undo(tick.undo, tab1)).toEqual({ kind: "signed-out" })
    h.tab(1, a)
    h.script.add.push(() => no<"add">("failed", 429))
    await h.flow.add({ ...key, video: videoAt(71) }, tab1)
    const before = h.calls.length
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1))
      .toEqual({ kind: "failed", failure: "paused" })
    expect(h.calls.length).toBe(before)
    expect(h.count("remove")).toBe(0)
  })

  test("a membership account mismatch blocks removal and later requests on that lane", async () => {
    const h = ready()
    h.script.membership.push(() => no<"membership">("accountChanged"))
    const request = { site: "www", video, playlist: music, opener: "quick-save", tick: null } as const
    expect(await h.flow.remove(request, tab1)).toEqual({ kind: "failed", failure: "account-changed" })
    expect(await h.flow.remove(request, tab1)).toEqual({ kind: "failed", failure: "account-changed" })
    expect(h.calls.map(({ job }) => job.kind)).toEqual(["membership"])
  })

  test("failed removal returns no confirmation or Undo, and leaves the own entry undoable", async () => {
    const h = ready()
    const tick = await h.flow.add(pick(), tab1)
    if (tick.kind !== "report" || !tick.undo) throw new Error("expected tick")
    h.script.remove.push(() => no<"remove">("unconfirmed"))
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: tick.undo }, tab1))
      .toEqual({ kind: "failed", failure: "unconfirmed" })
    expect(h.has(a, music, video)).toBe(true)
    expect(await h.flow.undo(tick.undo, tab1)).toEqual({ kind: "undone" })
  })

  test("Show feedback silences the confirmation while keeping the container's Undo", async () => {
    const h = ready()
    h.feature("picker", { on: true, feedback: false })
    h.put(a, music, video)
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "shortcuts", tick: null }, tab1))
      .toEqual({ kind: "removed", playlist: music, video, feedback: false, toast: null, undo: { kind: "remove", id: "engine:1" } })
  })

  test("a removal handle survives six gathers, then expires through release", async () => {
    const h = ready()
    h.put(a, music, video)
    const removed = await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    if (removed.kind !== "removed" || !removed.undo) throw new Error("expected Undo")
    for (let n = 0; n < 6; n++) await h.flow.batch({ playlist: later, videos: [videoAt(300 + n)], auto: false }, tab1)
    expect(await h.flow.undo(removed.undo, tab1)).toEqual({ kind: "undone" })
    const again = await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    if (again.kind !== "removed" || !again.undo) throw new Error("expected another Undo")
    h.flow.release(again.undo)
    const before = h.calls.length
    expect(await h.flow.undo(again.undo, tab1)).toEqual({ kind: "expired" })
    expect(h.calls.length).toBe(before)
  })

  test("an explicit tick before removal Undo re-adds once", async () => {
    const h = ready()
    h.put(a, music, video)
    const removed = await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    if (removed.kind !== "removed" || !removed.undo) throw new Error("expected Undo")
    expect(outcomes(await h.flow.add(pick(), tab1))).toEqual({ [music]: { kind: "added" } })
    expect(await h.flow.undo(removed.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.count("add")).toBe(1)
    expect(h.entries(a, music)).toHaveLength(1)
  })

  test("failed removal Undo answers explicitly and can be retried", async () => {
    const h = ready()
    h.put(a, music, video)
    const removed = await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    if (removed.kind !== "removed" || !removed.undo) throw new Error("expected Undo")
    h.script.add.push(() => no<"add">("unconfirmed"))
    expect(await h.flow.undo(removed.undo, tab1)).toEqual(undoFailed(0, 1, "unconfirmed"))
    expect(await h.flow.undo(removed.undo, tab1)).toEqual({ kind: "undone" })
    expect(await h.flow.undo(removed.undo, tab1)).toEqual({ kind: "expired" })
  })
})

describe("confirmed missing identity and partial progress", () => {
  for (const site of ["www", "music"] as const) {
    test(`${site}: a confirmed add without an entry ID gets guarded video fallback`, async () => {
      const h = ready()
      const operation = site === "www" ? "add" : "save"
      const missing = () => { h.put(a, music, video); return ok<typeof operation>({ setVideoId: null }) }
      if (site === "www") h.script.add.push(missing)
      else h.script.save.push(missing)
      const report = await h.flow.add({ ...pick(), site }, tab1)
      expect(outcomes(report)).toEqual({ [music]: { kind: "added" } })
      if (report.kind !== "report" || !report.undo) throw new Error("expected guarded Undo")
      expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
      expect(h.calls.at(-2)).toMatchObject({ acct: a, job: { kind: "membership", videoId: video } })
      expect(h.calls.at(-1)).toMatchObject({ acct: a, job: { kind: site === "www" ? "remove" : "unsave", playlistId: music, videoId: video } })
      expect(h.calls.at(-1)?.job).not.toHaveProperty("setVideoId")
    })
  }

  test("uncertain writes grant no fallback, while unreadable membership still requires positive add confirmation", async () => {
    const h = ready()
    h.script.add.push(() => no<"add">("unconfirmed"), () => { h.put(a, music, video); return ok<"add">({ setVideoId: null }) })
    expect(await h.flow.add(pick(), tab1)).toMatchObject({ outcomes: { [music]: { kind: "failed", failure: "unconfirmed" } }, undo: null })
    h.script.membership.push(() => fact<"membership">("unreadable"))
    const confirmed = await h.flow.add(pick(), tab1)
    expect(confirmed).toMatchObject({ outcomes: { [music]: { kind: "added" } }, undo: { kind: "add" } })
    expect(h.count("remove")).toBe(0)
    if (confirmed.kind !== "report" || !confirmed.undo) throw new Error("expected positive confirmation")
    expect(await h.flow.undo(confirmed.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.calls.at(-2)).toMatchObject({ acct: a, job: { kind: "membership", videoId: video } })
    expect(h.calls.at(-1)).toMatchObject({ acct: a, job: { kind: "remove", playlistId: music, videoId: video } })
  })

  test("a fallback Undo still refuses a failed account read before any removal", async () => {
    const h = ready()
    h.script.add.push(() => { h.put(a, music, video); return ok<"add">({ setVideoId: null }) })
    const added = await h.flow.add(pick(), tab1)
    if (added.kind !== "report" || !added.undo) throw new Error("expected fallback Undo")
    h.script.membership.push(() => no<"membership">("accountChanged"))
    expect(await h.flow.undo(added.undo, tab1)).toEqual(undoFailed(0, 1, "account-changed"))
    expect(h.count("remove")).toBe(0)
    expect(h.has(a, music, video)).toBe(true)
  })

  test("gather Undo correlates a missing entry ID to its own video alongside exact entries", async () => {
    const h = ready()
    const videos = [videoAt(420), videoAt(421)]
    h.script.addBatch.push(call => ok<"addBatch">({ results: call.job.videoIds.map((videoId, index) => {
      const entry = h.put(a, later, videoId)
      return { videoId, setVideoId: index === 0 ? null : entry }
    }) }))
    const added = await h.flow.batch({ playlist: later, videos, auto: false }, tab1)
    if (added.kind !== "report" || !added.undo) throw new Error("expected gather Undo")
    expect(await h.flow.undo(added.undo, tab1)).toEqual({ kind: "undone" })
    expect(h.calls.filter(({ job }) => job.kind === "remove").map(({ job }) => job))
      .toEqual([{ kind: "remove", playlistId: later, videoId: videoAt(420) }])
    expect(h.calls.filter(({ job }) => job.kind === "removeBatch")).toHaveLength(1)
    expect(h.entries(a, later)).toEqual([])
  })

  test("recognized duplicate and refusal remain per-video facts beside confirmed additions", async () => {
    const h = ready()
    const videos: [typeof video, typeof video, typeof video] = [videoAt(400), videoAt(401), videoAt(402)]
    h.script.addBatch.push(call => ({ kind: "observed", results: call.job.videoIds.map((videoId, n) =>
      n === 0 ? { videoId, fact: "duplicate" } : n === 1 ? { videoId, fact: "refused" } : { videoId, setVideoId: h.put(a, later, videoId) }) }))
    const report = await h.flow.batch({ playlist: later, videos, auto: false }, tab1)
    expect(report).toEqual({ kind: "report", outcomes: [
      { video: videos[0], outcome: { kind: "already-in" } },
      { video: videos[1], outcome: { kind: "failed", failure: "refused" } },
      { video: videos[2], outcome: { kind: "added" } }
    ], undo: { kind: "gather", id: "engine:1" } })
    if (report.kind !== "report" || !report.undo) throw new Error("expected Undo")
    expect(await h.flow.undo(report.undo, tab1)).toEqual({ kind: "undone" })
    const removed = h.calls.flatMap(({ job }) => job.kind === "removeBatch" ? job.setVideoIds : [])
    expect(removed).toHaveLength(1)
    expect(h.has(a, later, videos[2] ?? video)).toBe(false)
  })

  test("misordered normalized results grant no success or Undo authority", async () => {
    const h = ready()
    h.script.addBatch.push(call => ({ kind: "observed", results: call.job.videoIds.toReversed().map(videoId => ({ videoId, fact: "duplicate" })) }))
    expect(await h.flow.batch({ playlist: later, videos: [videoAt(410), videoAt(411)], auto: false }, tab1)).toEqual({
      kind: "report", outcomes: [
        { video: videoAt(410), outcome: { kind: "failed", failure: "unrecognised" } },
        { video: videoAt(411), outcome: { kind: "failed", failure: "unrecognised" } }
      ], undo: null
    })
  })

  for (const stopping of ["withdraw", "quiesce"] as const) {
    test(`${stopping}: an add preserves the first confirmed playlist and blocks the next effect`, async () => {
      const h = ready()
      h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }, { playlist: learning }])
      h.script.add.push(() => {
        const setVideoId = h.put(a, music, video)
        if (stopping === "withdraw") h.withdraw()
        else void h.flow.quiesce()
        return ok<"add">({ setVideoId })
      })
      expect(await h.flow.add(key, tab1)).toEqual(stoppedAdd([learning], { [music]: { kind: "added" } }))
      expect(h.calls.map(({ job }) => job.kind)).toEqual(["membership", "add"])
      expect(h.has(a, music, video)).toBe(true)
      expect(h.has(a, learning, video)).toBe(false)
      await h.flow.quiesce()
    })
  }

  test("a stopped batch reports only confirmed videos and names the unsent remainder", async () => {
    const h = ready()
    const videos = Array.from({ length: 51 }, (_, n) => videoAt(500 + n))
    h.script.addBatch.push(call => {
      const results = call.job.videoIds.map(videoId => ({ videoId, setVideoId: h.put(a, later, videoId) }))
      h.withdraw()
      return ok<"addBatch">({ results })
    })
    expect(await h.flow.batch({ playlist: later, videos, auto: false }, tab1)).toEqual({
      kind: "stopped", outcomes: videos.slice(0, 50).map(video => ({ video, outcome: { kind: "added" } })), pending: videos.slice(50), undo: null
    })
    expect(h.count("addBatch")).toBe(1)
    expect(h.has(a, later, videoAt(550))).toBe(false)
  })

  test("owner loss during a held untick blocks its write and revokes prior Undo handles", async () => {
    const h = ready()
    const added = await h.flow.add(pick(), tab1)
    if (added.kind !== "report" || !added.undo) throw new Error("expected tick")
    h.block()
    const pending = h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: added.undo }, tab1)
    await settle()
    h.withdraw()
    h.open()
    expect(await pending).toEqual({ kind: "stopped", removed: false, playlist: music, video, undo: null })
    expect(await h.flow.undo(added.undo, tab1)).toEqual({ kind: "stopped", completed: 0, of: 0 })
    expect(h.count("remove")).toBe(0)
  })

  test("withdrawal after confirmed removal keeps that observation without granting restoration", async () => {
    const h = ready()
    h.put(a, music, video)
    h.script.remove.push(() => { h.withdraw(); return ok<"remove">(null) })
    expect(await h.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1))
      .toEqual({ kind: "stopped", removed: true, playlist: music, video, undo: null })
    expect(h.count("remove")).toBe(1)
  })

  test("stopped Undo retains its confirmed count, and a released in-flight restoration cannot write", async () => {
    const h = ready()
    h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }, { playlist: learning }])
    const added = await h.flow.add(key, tab1)
    if (added.kind !== "report" || !added.undo) throw new Error("expected Undo")
    h.script.remove.push(() => { h.withdraw(); return ok<"remove">(null) })
    expect(await h.flow.undo(added.undo, tab1)).toEqual({ kind: "stopped", completed: 1, of: 2 })
    expect(h.count("remove")).toBe(1)
    const other = ready()
    other.put(a, music, video)
    const removed = await other.flow.remove({ site: "www", video, playlist: music, opener: "quick-save", tick: null }, tab1)
    if (removed.kind !== "removed" || !removed.undo) throw new Error("expected restoration")
    other.block()
    const restoring = other.flow.undo(removed.undo, tab1)
    await settle()
    other.flow.release(removed.undo)
    other.open()
    expect(await restoring).toEqual(undoFailed(0, 1, "not-sent"))
    expect(other.count("add")).toBe(0)
  })
})
