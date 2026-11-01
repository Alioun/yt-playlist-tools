import { expect, test } from "bun:test"
import { planAccountSessionRemoval } from "./account-removal-session"
import { planSessionChange, parseSessionMemory, RECENT_MS } from "./session-memory"
import { removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { isAccountKey, isPlaylistId, isVideoId } from "../../shared/model"

const acct = "AAAAAAAAAAAAAAAA", other = "BBBBBBBBBBBBBBBB"
if (!isAccountKey(acct) || !isAccountKey(other)) throw Error("Invalid synthetic account")
const playlist = "PL_selected", video = "aaaaaaaaaaa"
if (!isPlaylistId(playlist) || !isVideoId(video)) throw Error("Invalid synthetic identifiers")

test("edits touch only their names and keep every unknown field, other account and private-free partition", () => {
  const session = { ...removalFixture().session, tabs: { "1": { site: "www", acct, signedIn: true } } }
  const plan = planSessionChange(session, { now: 30, edits: [
    { kind: "recent", tuple: { acct, playlist, video, at: 30 } },
    { kind: "cooldown", acct: other, until: 400 },
    { kind: "skip", acct, video, playlists: [playlist] },
    { kind: "shown", acct, keys: ["missing:PL_selected", "refused"] }
  ] })
  if (!plan) throw Error("Supported fixture refused")
  expect(Object.keys(plan.items).sort()).toEqual(["cooldown:BBBBBBBBBBBBBBBB", "recent", "shown"])
  expect(plan.remove).toEqual([])
  expect(plan.expected.recent).toEqual([
    { acct: other, playlist: "PL_selected", video: "bbbbbbbbbbb", at: 1, extension: { acct, keep: true } },
    { acct: other, playlist: "PL_selected", video: "bbbbbbbbbbb", at: 1, extension: { acct, keep: true } },
    { acct, playlist, video, at: 30 }
  ])
  expect(plan.expected.shown).toEqual({ v: 1, global: { keep: true, accountLookingExtension: { acct, keep: true }, paced: { "1": 10 }, once: ["refused"] },
    accounts: { [acct]: { owned: true, once: ["missing:PL_selected"] }, [other]: { extension: { keep: true } } }, extension: [null, 1] })
  expect(plan.expected[`skips:${acct}`]).toEqual({ [video]: "all" })
  const removal = planAccountSessionRemoval(acct, plan.expected)
  expect(removal.kind).toBe("supported")
})

test("persisted windows end early when wall time moves backwards and never stretch", () => {
  const memory = parseSessionMemory({ recent: [{ acct, playlist, video, at: 1_000 }] })
  expect(memory?.recent).toEqual([{ acct, playlist, video, at: 1_000 }])
  const later = planSessionChange({ recent: [{ acct, playlist, video, at: 1_000 }] }, { now: 1_000 + RECENT_MS, edits: [{ kind: "pause", paused: false }, { kind: "forget", acct: other, playlist, video }] })
  expect(later?.expected.recent).toEqual([])
  const earlier = planSessionChange({ recent: [{ acct, playlist, video, at: 1_000 }] }, { now: 999, edits: [{ kind: "forget", acct: other, playlist, video }] })
  expect(earlier?.expected.recent).toEqual([])
})

test("the sixth gather evicts the oldest and an ended record is never recreated", () => {
  let raw: Record<string, unknown> = {}
  for (let n = 1; n <= 6; n++) {
    const plan = planSessionChange(raw, { now: n, edits: [{ kind: "gather", record: { id: `g${n}`, at: n, auto: false, acct: n % 2 ? acct : other, playlist, added: [{ video, setVideoId: null }] } }] })
    if (!plan) throw Error("Gather refused")
    raw = plan.expected
  }
  expect(parseSessionMemory(raw)?.gathers.map(record => record.id)).toEqual(["g6", "g5", "g4", "g3", "g2"])
  const ended = planSessionChange(raw, { now: 7, edits: [{ kind: "gather-left", id: "g1", acct, added: [{ video, setVideoId: null }] }] })
  expect(ended?.items).toEqual({})
  expect(parseSessionMemory(ended?.expected)?.gathers.map(record => record.id)).toEqual(["g6", "g5", "g4", "g3", "g2"])
})

test("malformed records refuse instead of being rewritten", () => {
  for (const raw of [null, [], { paused: "yes" }, { recent: [{ acct, playlist, video: "short", at: 1 }] }, { [`cooldown:${acct}`]: -1 },
    { [`skips:${acct}`]: { [video]: "some" } }, { shown: { v: 2, global: {}, accounts: {} } }, { gather: { v: 1, global: {}, accounts: { [acct]: { last: [{ id: "g" }] } } } }]) {
    expect(parseSessionMemory(raw)).toBeUndefined()
    expect(planSessionChange(raw, { now: 1, edits: [{ kind: "pause", paused: true }] })).toBeUndefined()
  }
})

test("tab edits preserve unrelated data, compare semantic fields and guard stale deletion", () => {
  const info = { site: "www", acct, signedIn: true, seenAt: 10 } as const
  const raw = { unrelated: { keep: true }, tabs: { "1": { acct, signedIn: true, site: "www", seenAt: 10 } } }
  expect(planSessionChange(raw, { now: 10, edits: [{ kind: "tab-seen", tabId: 1, info }] })?.items).toEqual({})
  const changed = { ...info, acct: other }
  const replaced = planSessionChange(raw, { now: 11, edits: [{ kind: "tab-seen", tabId: 1, info: changed }] })
  expect(replaced?.expected).toEqual({ unrelated: { keep: true }, tabs: { "1": changed } })
  expect(planSessionChange(replaced?.expected, { now: 11, edits: [{ kind: "tab-forget", tabId: 1, expected: info }] })?.items).toEqual({})
  expect(planSessionChange(raw, { now: 11, edits: [{ kind: "tab-forget", tabId: 1, expected: info }] })?.expected).toEqual({ unrelated: { keep: true }, tabs: {} })
})

test("tab boundary rejects private facts, raw identity, browser objects and inconsistent sign-in", () => {
  for (const tabs of [[], { bad: {} }, { "01": { site: "www", signedIn: false, acct: null } },
    { "1": { site: "www", signedIn: true, acct: null } }, { "1": { site: "www", signedIn: false, acct } },
    { "1": { site: "www", signedIn: true, acct, private: true } }, { "1": { site: "www", signedIn: true, acct, datasyncId: "raw" } },
    { "1": { site: "www", signedIn: true, acct, window: {} } }, { "1": { site: "www", acct } }]) expect(parseSessionMemory({ tabs })).toBeUndefined()
})
