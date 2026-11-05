import { describe, expect, test } from "bun:test"
import { createLocalFilterWriter } from "../store/local-filter-writer"
import type { SessionPort, SessionStorage } from "../store/session-memory"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey, isPlaylistId, isVideoId } from "../../shared/model"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { brand, harness, no, settle, shortcut, tabOrigin } from "../../../tools/fixtures/add-flow/harness"

const acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA"),
  other = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
const music = brand(isPlaylistId, "PLmusic"),
  later = brand(isPlaylistId, "WL")
const video = brand(isVideoId, "vid00000001"),
  second = brand(isVideoId, "vid00000002")
const normal = tabOrigin(1),
  incognito = tabOrigin(2, true),
  wall = 1_700_000_000_000
const ui = { kind: "ui", windowId: 1, incognito: false } as const
type Call = { kind: "get"; value: Readonly<Record<string, unknown>> } | { kind: "set"; items: Parameters<SessionStorage["set"]>[0] } | { kind: "remove"; keys: Parameters<SessionStorage["remove"]>[0] }

function world() {
  const removal = createRemovalHarness({ ...removalFixture(), session: {} })
  const host = removal.deps.removal
  if (host.kind !== "fixture") throw Error("Expected session storage")
  const original = { ...host.session },
    calls: Call[] = []
  const error = Error("Synthetic clean session rejection")
  let rejecting = false
  host.session.get = async () => {
    const value = await original.get()
    calls.push({ kind: "get", value })
    return value
  }
  host.session.set = async items => {
    calls.push({ kind: "set", items })
    if (rejecting) throw error
    await original.set(items)
  }
  host.session.remove = async keys => {
    calls.push({ kind: "remove", keys })
    await original.remove(keys)
  }
  const owner = createLocalFilterWriter(removal.deps)
  const port: SessionPort = { read: () => owner.readSession(), change: change => owner.changeSession(change) }
  const yt = harness({ session: port, clock: wall })
  for (const account of [acct, other]) {
    yt.setup(account, { kind: "shortcut", shortcut }, [{ playlist: music }])
    yt.setup(account, { kind: "auto-add" }, [{ playlist: music }])
  }
  yt.tab(1, acct)
  yt.tab(2, acct)
  const remove = async () => {
    const prepared = await owner.prepareAccountRemoval(ui, acct)
    if (prepared.kind !== "confirmation-required") throw Error(`Removal unavailable: ${prepared.kind}`)
    expect((await owner.removeAccountSetup(ui, prepared.confirmation)).kind).toBe("committed")
  }
  return {
    removal,
    owner,
    port,
    yt,
    calls,
    error,
    remove,
    reject(value: boolean) {
      rejecting = value
    }
  }
}

describe("rejected session writes keep observed facts inside the engine", () => {
  test("a rejected 429 write still blocks the next user add without another native set or YouTube call", async () => {
    const h = world()
    h.reject(true)
    h.yt.script.add.push(() => no<"add">("failed", 429))
    const failed = { kind: "failed", applied: false, error: h.error } as const
    const first = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(first.kind === "report" && first.outcomes).toEqual({ [music]: { kind: "failed", failure: "rate-limited" } })
    expect(first.memory).toEqual([failed])
    expect(h.calls).toEqual([
      { kind: "get", value: {} },
      { kind: "get", value: {} },
      { kind: "set", items: { [`cooldown:${acct}`]: wall + 60_000 } },
      { kind: "get", value: {} }
    ])
    const sent = [...h.yt.calls]
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normal)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "failed", failure: "paused" } })
    expect(next.memory).toEqual([failed])
    expect(h.yt.calls).toEqual(sent)
    expect(h.calls).toEqual([
      { kind: "get", value: {} },
      { kind: "get", value: {} },
      { kind: "set", items: { [`cooldown:${acct}`]: wall + 60_000 } },
      { kind: "get", value: {} },
      { kind: "get", value: {} }
    ])
    expect(h.removal.state().session).toEqual({})
  })

  test("an authoritative read cannot erase a confirmed add whose session write was rejected", async () => {
    const h = world()
    h.reject(true)
    const failed = { kind: "failed", applied: false, error: h.error } as const
    const first = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(first.kind === "report" && first.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(first.memory).toEqual([failed])
    const second = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(second.kind === "report" && second.outcomes).toEqual({ [music]: { kind: "already-in" } })
    expect(second.memory).toEqual([failed])
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add"])
    expect(h.calls).toEqual([
      { kind: "get", value: {} },
      { kind: "get", value: {} },
      { kind: "set", items: { recent: [{ acct, playlist: music, video, at: wall }] } },
      { kind: "get", value: {} },
      { kind: "get", value: {} }
    ])
    expect(h.removal.state().session).toEqual({})
  })

  test.each([60_000, -1])("a retained hold ends after wall time moves by %i ms", async shift => {
    const h = world()
    h.reject(true)
    h.yt.script.add.push(() => no<"add">("failed", 429))
    await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    h.reject(false)
    h.yt.advance(shift)
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normal)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(next.memory).toBeUndefined()
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add", "membership", "add"])
    const expected = { recent: [{ acct, playlist: music, video: second, at: wall + shift }] }
    expect(h.calls.slice(4)).toEqual([
      { kind: "get", value: {} },
      { kind: "get", value: {} },
      { kind: "set", items: expected },
      { kind: "get", value: expected }
    ])
    expect(h.removal.state().session).toEqual(expected)
  })

  test.each([60_000, -1])("a retained recent tuple expires after wall time moves by %i ms", async shift => {
    const h = world()
    h.reject(true)
    await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    h.reject(false)
    h.yt.advance(shift)
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "already-in" } })
    expect(next.memory).toBeUndefined()
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add", "membership"])
    expect(h.calls.slice(4)).toEqual([{ kind: "get", value: {} }])
    expect(h.removal.state().session).toEqual({})
  })

  test("a successful Undo supersedes failed recent memory before the next add", async () => {
    const h = world()
    h.reject(true)
    const first = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    if (first.kind !== "report" || !first.undo) throw Error("Expected ordinary Undo")
    h.reject(false)
    expect(await h.yt.flow.undo(first.undo, normal)).toEqual({ kind: "undone" })
    const again = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(again.kind === "report" && again.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(again.memory).toBeUndefined()
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add", "membership", "remove", "membership", "add"])
    expect(h.removal.state().session).toEqual({ recent: [{ acct, playlist: music, video, at: wall }] })
  })
})

describe("account-specific removal authority", () => {
  test.each(["recent", "cooldown"] as const)("removing an account revokes its retained rejected %s fact", async fact => {
    const h = world()
    h.reject(true)
    if (fact === "cooldown") h.yt.script.add.push(() => no<"add">("failed", 429))
    const first = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(first.memory).toEqual([{ kind: "failed", applied: false, error: h.error }])
    h.reject(false)
    await h.remove()
    const sent = h.yt.calls.length
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: fact === "recent" ? "already-in" : "added" } })
    expect(next.memory).toBeUndefined()
    expect(h.yt.calls.slice(sent).map(call => call.job.kind)).toEqual(fact === "recent" ? ["membership"] : ["membership", "add"])
    expect(h.removal.state().session).toEqual(fact === "recent" ? {} : { recent: [{ acct, playlist: music, video, at: wall }] })
  })

  test("owner revocation stops retained rejected facts without another native write or YouTube request", async () => {
    const h = world()
    h.reject(true)
    await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    await h.owner.dispose()
    const calls = [...h.calls],
      sent = [...h.yt.calls]
    expect(await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normal)).toEqual({ kind: "stopped", outcomes: {}, pending: [], toast: null, feedback: true, undo: null })
    expect(h.yt.calls).toEqual(sent)
    expect(h.calls).toEqual(calls)
    expect(h.removal.state().session).toEqual({})
    await h.yt.flow.quiesce()
  })

  test("unrelated removal preserves a rejected confirmed add and its visible storage failure", async () => {
    const h = world()
    h.yt.tab(1, other)
    h.reject(true)
    const first = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    const failure = { kind: "failed", applied: false, error: h.error } as const
    expect(first.memory).toEqual([failure])
    h.reject(false)
    await h.remove()
    const sent = [...h.yt.calls],
      sets = h.calls.filter(call => call.kind !== "get")
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "already-in" } })
    expect(next.memory).toEqual([failure])
    expect(h.yt.calls).toEqual(sent)
    expect(h.calls.filter(call => call.kind !== "get")).toEqual(sets)
    expect(h.removal.state().session).toEqual({})
  })

  test("removing another account preserves ordinary Undo, private recent tuples, skips and gather handles", async () => {
    const h = world()
    h.yt.tab(1, other)
    h.yt.tab(2, other)
    const added = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
    const privateAdd = await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, incognito)
    const gather = await h.yt.flow.batch({ playlist: later, videos: [second], auto: false }, incognito)
    expect(privateAdd.kind === "report" && privateAdd.outcomes).toEqual({ [music]: { kind: "added" } })
    await h.yt.flow.skip({ kind: "skip", acct: other, video, playlists: "all" }, incognito)
    await h.remove()
    const sent = h.yt.calls.length
    const recent = await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, incognito)
    expect(recent.kind === "report" && recent.outcomes).toEqual({ [music]: { kind: "already-in" } })
    const skipped = await h.yt.flow.add({ via: "auto-add", site: "www", video, playlists: [music], channel: null }, incognito)
    expect(skipped.kind === "report" && skipped.outcomes).toEqual({ [music]: { kind: "skipped" } })
    expect(h.yt.calls.length).toBe(sent)
    expect(h.removal.state().session).toEqual({ recent: [{ acct: other, playlist: music, video, at: wall }] })
    if (added.kind !== "report" || !added.undo || gather.kind !== "report" || !gather.undo) throw Error("Expected unrelated handles")
    expect(await h.yt.flow.undo(added.undo, normal)).toEqual({ kind: "undone" })
    expect(await h.yt.flow.undo(gather.undo, incognito)).toEqual({ kind: "undone" })
    expect(h.calls.filter(call => call.kind !== "get")).toEqual([
      { kind: "set", items: { recent: [{ acct: other, playlist: music, video, at: wall }] } },
      { kind: "set", items: { recent: [] } }
    ])
    expect(h.removal.state().session).toEqual({ recent: [] })
  })

  test("removing another account preserves a private 429 hold without writing it", async () => {
    const h = world()
    h.yt.tab(2, other)
    h.yt.script.add.push(() => no<"add">("failed", 429))
    await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, incognito)
    await h.remove()
    const sent = [...h.yt.calls]
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, incognito)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "failed", failure: "paused" } })
    expect(h.yt.calls).toEqual(sent)
    expect(h.calls.filter(call => call.kind !== "get")).toEqual([])
    expect(h.removal.state().session).toEqual({})
  })

  test.each([false, true])("an old sent continuation cannot recreate removed-account memory, private=%s", async privateWindow => {
    const h = world(),
      origin = privateWindow ? incognito : normal
    h.yt.block("add")
    const adding = h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, origin)
    await settle()
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add"])
    await h.remove()
    // A later read must not lend its new revision to the old sent request.
    await h.yt.flow.skip({ kind: "unskip", acct: other, video: second }, normal)
    h.yt.open()
    const completed = await adding
    expect(completed.kind === "report" && completed.outcomes).toEqual({ [music]: { kind: "added" } })
    expect(completed.kind === "report" && completed.undo).toBeNull()
    const next = await h.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, origin)
    expect(next.kind === "report" && next.outcomes).toEqual({ [music]: { kind: "already-in" } })
    expect(h.yt.calls.map(call => call.job.kind)).toEqual(["membership", "add", "membership"])
    expect(h.calls.filter(call => call.kind !== "get")).toEqual([])
    expect(h.removal.state().session).toEqual({})
  })

  test("a captured change for an unrelated account remains valid, while the removed account's change is refused", async () => {
    const h = world()
    const before = await h.owner.readSession()
    if (before.kind !== "memory") throw Error("Expected a revision")
    await h.remove()
    const accepted = await h.owner.changeSession({ revision: before.revision, now: wall, edits: [{ kind: "cooldown", acct: other, until: wall + 60_000 }] })
    expect(accepted.kind).toBe("committed")
    expect(await h.owner.changeSession({ revision: before.revision, now: wall, edits: [{ kind: "cooldown", acct, until: wall + 60_000 }] })).toEqual({ kind: "unavailable", reason: "revision" })
    expect(h.calls.filter(call => call.kind !== "get")).toEqual([{ kind: "set", items: { [`cooldown:${other}`]: wall + 60_000 } }])
    expect(h.removal.state().session).toEqual({ [`cooldown:${other}`]: wall + 60_000 })
  })
})
