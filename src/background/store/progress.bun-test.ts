import { expect, test } from "bun:test"
import { createLocalFilterWriter } from "./local-filter-writer"
import { pendingAccountRemovalKey } from "./account-removal-execution"
import { isAccountKey, isVideoId, progressKey, progressShard, PROGRESS_KEEP_MS, type VideoId } from "../../shared/model"
import type { JsonObject, JsonValue } from "../../shared/contracts/json"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"

const acct = "AAAAAAAAAAAAAAAA",
  other = "BBBBBBBBBBBBBBBB"
if (!isAccountKey(acct) || !isAccountKey(other)) throw Error("Invalid fixture accounts")
function video(id: string): VideoId {
  if (!isVideoId(id)) throw Error("Invalid fixture video")
  return id
}
const watched = video("ccccccccccc")
const day = 24 * 60 * 60 * 1000

function world(options: { autoAdd?: boolean } = {}) {
  const initial = removalFixture()
  const settings = initial.local["doc:settings"] as JsonObject
  initial.local["doc:settings"] = { ...settings, data: { ...(settings.data as JsonObject), autoAdd: { on: options.autoAdd ?? true } } }
  for (const key of Object.keys(initial.local)) if (key.startsWith("progress:")) delete initial.local[key]
  const removal = createRemovalHarness(initial)
  let now = 100 * day
  const writes: Readonly<Record<string, JsonValue>>[] = []
  const local = {
    get: (keys: readonly string[] | null) => removal.deps.local.get(keys),
    async set(items: Readonly<Record<string, JsonValue>>) {
      writes.push(items)
      return removal.deps.local.set(items)
    }
  }
  const owner = createLocalFilterWriter({ ...removal.deps, local, now: () => now })
  return {
    owner,
    writes,
    stored: () => removal.state().local,
    edit: (change: (local: JsonObject) => void) => removal.foreign(state => change(state.local)),
    later(ms: number) {
      now += ms
    },
    get now() {
      return now
    },
    dispose: () => owner.dispose()
  }
}
const normal = { acct, video: watched, private: false }

test("a save is read back on the next visit, and only the video's own shard is written", async () => {
  const h = world()
  try {
    expect(await h.owner.loadProgress(normal)).toEqual({ kind: "progress", progress: null })
    expect(
      await h.owner.saveProgress({
        ...normal,
        len: 600,
        parts: [
          [0, 120.04],
          [300, 360]
        ]
      })
    ).toEqual({ kind: "committed" })
    const key = progressKey(acct, progressShard(watched))
    expect(h.writes.map(items => Object.keys(items))).toEqual([[key]])
    expect(h.stored()[key]).toEqual({
      [watched]: {
        len: 600,
        parts: [
          [0, 120],
          [300, 360]
        ],
        at: h.now
      }
    })
    expect(await h.owner.loadProgress(normal)).toEqual({
      kind: "progress",
      progress: {
        len: 600,
        parts: [
          [0, 120],
          [300, 360]
        ]
      }
    })
    expect(await h.owner.loadProgress({ ...normal, acct: other })).toEqual({ kind: "refused", reason: "no-setup" })
  } finally {
    await h.dispose()
  }
})

test("once auto-add has run, an empty save forgets the video", async () => {
  const h = world()
  try {
    await h.owner.saveProgress({ ...normal, len: 600, parts: [[0, 120]] })
    expect(await h.owner.saveProgress({ ...normal, len: 600, parts: [] })).toEqual({ kind: "committed" })
    expect(await h.owner.loadProgress(normal)).toEqual({ kind: "progress", progress: null })
    expect(await h.owner.saveProgress({ ...normal, len: 600, parts: [] })).toEqual({ kind: "unchanged" })
  } finally {
    await h.dispose()
  }
})

test("progress older than 30 days reads as nothing, and the next day's save prunes it", async () => {
  const h = world()
  try {
    const stale = video("ddddddddddd")
    await h.owner.saveProgress({ ...normal, video: stale, len: 60, parts: [[0, 30]] })
    h.later(PROGRESS_KEEP_MS)
    expect(await h.owner.loadProgress({ ...normal, video: stale })).toEqual({ kind: "progress", progress: null })
    expect(h.stored()[progressKey(acct, progressShard(stale))]).toBeDefined()
    await h.owner.saveProgress({ ...normal, len: 600, parts: [[0, 10]] })
    expect((h.stored()[progressKey(acct, progressShard(stale))] as JsonObject | undefined)?.[stale]).toBeUndefined()
  } finally {
    await h.dispose()
  }
})

test("private tabs, auto-add off and a pending removal never touch stored progress", async () => {
  const h = world({ autoAdd: false })
  try {
    expect(await h.owner.saveProgress({ ...normal, private: true, len: 60, parts: [[0, 30]] })).toEqual({ kind: "refused", reason: "private" })
    expect(await h.owner.loadProgress({ ...normal, private: true })).toEqual({ kind: "refused", reason: "private" })
    expect(await h.owner.saveProgress({ ...normal, len: 60, parts: [[0, 30]] })).toEqual({ kind: "refused", reason: "off" })
    h.edit(local => {
      local[pendingAccountRemovalKey] = { acct }
    })
    expect(await h.owner.saveProgress({ ...normal, len: 60, parts: [[0, 30]] })).toEqual({ kind: "unavailable", reason: "pending-removal" })
    expect(h.writes).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("malformed saves are refused before anything is read", async () => {
  const h = world()
  try {
    for (const bad of [
      { len: 0, parts: [[0, 1]] },
      { len: 60, parts: [[5, 1]] },
      { len: Number.NaN, parts: [] },
      { len: 60, parts: [[0]] }
    ]) {
      expect(await h.owner.saveProgress({ ...normal, ...bad } as never)).toEqual({ kind: "refused", reason: "invalid" })
    }
    expect(await h.owner.loadProgress({ acct, video: "short", private: false } as never)).toEqual({ kind: "refused", reason: "invalid" })
    expect(h.writes).toEqual([])
  } finally {
    await h.dispose()
  }
})
