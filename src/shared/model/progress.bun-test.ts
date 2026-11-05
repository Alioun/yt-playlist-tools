import { expect, test } from "bun:test"
import {
  decodeProgress,
  parseProgressKey,
  progressKey,
  progressShard,
  pruneProgress,
  rememberProgress,
  storedParts,
  PROGRESS_KEEP_MS,
  PROGRESS_SHARDS,
  type Progress,
  type ProgressShard,
  type ProgressShards
} from "./progress"
import { isAccountKey, isVideoId, type VideoId } from "./validation"

const acct = "AAAAAAAAAAAAAAAA"
if (!isAccountKey(acct)) throw Error("Invalid fixture account")
function video(n: number): VideoId {
  const id = `v${String(n).padStart(10, "0")}`
  if (!isVideoId(id)) throw Error("Invalid fixture video")
  return id
}
const day = 24 * 60 * 60 * 1000
const emptyShards = (): Record<ProgressShard, Progress> => Object.fromEntries(PROGRESS_SHARDS.map(shard => [shard, {}])) as Record<ProgressShard, Progress>

test("a video always maps to one of the 16 shards, and the shard key round-trips", () => {
  const seen = new Set<number>()
  for (let n = 0; n < 400; n++) {
    const shard = progressShard(video(n))
    expect(shard).toBe(progressShard(video(n)))
    seen.add(shard)
  }
  expect(seen.size).toBe(16)
  expect(progressKey(acct, 7)).toBe(`progress:${acct}:7`)
  expect(parseProgressKey(`progress:${acct}:15`)).toEqual({ acct, shard: 15 })
  expect(parseProgressKey(`progress:${acct}:16`)).toBeNull()
  expect(parseProgressKey(`cache:${acct}`)).toBeNull()
})

test("stored stretches only ever shrink: clamped, rounded inwards to 0.1 s and merged", () => {
  expect(
    storedParts(
      [
        [0.04, 10.06],
        [9, 12],
        [-1, 0.2],
        [55, 70]
      ],
      60
    )
  ).toEqual([
    [0, 12],
    [55, 60]
  ])
  expect(storedParts([[3.01, 3.09]], 60)).toEqual([])
  expect(storedParts([[0.3, 0.7]], 60)).toEqual([[0.3, 0.7]])
})

test("beyond 100 stretches the shortest are dropped", () => {
  const parts = Array.from({ length: 101 }, (_, i): [number, number] => [i * 10, i * 10 + (i === 40 ? 1 : 5)])
  const kept = storedParts(parts, 2000)
  expect(kept).toHaveLength(100)
  expect(kept).not.toContainEqual([400, 401])
  expect(kept[0]).toEqual([0, 5])
})

test("a save replaces the video's entry, and an empty save forgets it", () => {
  const first = rememberProgress({}, video(1), { len: 300, parts: [[0, 40]] }, 1_000)
  expect(first).toEqual({ [video(1)]: { len: 300, parts: [[0, 40]], at: 1_000 } })
  const second = rememberProgress(
    first,
    video(1),
    {
      len: 300,
      parts: [
        [0, 40],
        [100, 160]
      ]
    },
    2_000
  )
  expect(second[video(1)]).toEqual({
    len: 300,
    parts: [
      [0, 40],
      [100, 160]
    ],
    at: 2_000
  })
  expect(rememberProgress(second, video(1), { len: 300, parts: [] }, 3_000)).toEqual({})
})

test("a shard that doesn't decode keeps only its readable entries", () => {
  const good = { len: 120, parts: [[0, 30]], at: 5 } as const
  expect(decodeProgress({ [video(1)]: good, [video(2)]: { len: 120, parts: [[30, 10]], at: 5 }, nope: good, [video(3)]: { len: -1, parts: [], at: 1 } })).toEqual({ [video(1)]: good })
  expect(decodeProgress(null)).toEqual({})
  expect(decodeProgress([good])).toEqual({})
})

test("the prune drops entries 30 days after they last played and rewrites only their shards", () => {
  const shards = emptyShards()
  const now = 100 * day
  const old = video(1),
    fresh = video(2)
  shards[progressShard(old)] = { [old]: { len: 60, parts: [[0, 10]], at: now - PROGRESS_KEEP_MS } }
  shards[progressShard(fresh)] = { ...shards[progressShard(fresh)], [fresh]: { len: 60, parts: [[0, 10]], at: now - PROGRESS_KEEP_MS + 1 } }
  const changed = pruneProgress(shards, now)
  expect(Object.keys(changed)).toEqual([String(progressShard(old))])
  expect(changed[progressShard(old)]?.[old]).toBeUndefined()
  expect(pruneProgress(shards, now - 1)).toEqual({})
})

test("past 2,000 videos the oldest go first", () => {
  const shards = emptyShards()
  for (let n = 0; n < 2_003; n++) {
    const id = video(n)
    const shard = progressShard(id)
    shards[shard] = { ...shards[shard], [id]: { len: 60, parts: [[0, 10]], at: 1_000 + n } }
  }
  const changed = pruneProgress(shards satisfies ProgressShards, 2_000)
  const after = { ...shards, ...changed }
  const left = PROGRESS_SHARDS.flatMap(shard => Object.keys(after[shard]))
  expect(left).toHaveLength(2_000)
  for (const n of [0, 1, 2]) expect(left).not.toContain(video(n))
  expect(left).toContain(video(3))
})
