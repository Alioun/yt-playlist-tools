import { afterEach, expect, test } from "bun:test"
import { projectionWorld, a, alpha, beta } from "../../../tools/fixtures/tab-projection/harness"
import type { PlaylistId } from "../../shared/model"

const other = "PL_other" as PlaylistId
const worlds: ReturnType<typeof projectionWorld>[] = []
afterEach(async () => { for (const world of worlds.splice(0)) await world.owner.dispose() })
function world() { const created = projectionWorld(); worlds.push(created); return created }
async function marks(store: ReturnType<typeof world>) {
  const read = await store.owner.readSetup(a)
  if (read.kind !== "value" || read.view.kind !== "live") throw Error("Expected a's live setup")
  return read.view.setup.marks
}

test("a Full mark lands on a playlist the setup chooses, and clearing removes a Missing one", async () => {
  const store = world()
  expect(await marks(store)).toEqual({ [alpha]: "missing" })
  expect((await store.owner.markPlaylists({ acct: a, private: false, marks: [{ playlist: beta, mark: "full" }] })).kind).toBe("committed")
  expect(await marks(store)).toEqual({ [alpha]: "missing", [beta]: "full" })
  expect((await store.owner.markPlaylists({ acct: a, private: false, marks: [{ playlist: alpha, mark: "clear" }] })).kind).toBe("committed")
  expect(await marks(store)).toEqual({ [beta]: "full" })
})

test("a mark on a playlist the setup doesn't choose, or one already in place, writes nothing", async () => {
  const store = world()
  const before = store.writes().length
  expect(await store.owner.markPlaylists({ acct: a, private: false, marks: [{ playlist: other, mark: "missing" }] })).toEqual({ kind: "unchanged" })
  expect(await store.owner.markPlaylists({ acct: a, private: false, marks: [{ playlist: alpha, mark: "missing" }] })).toEqual({ kind: "unchanged" })
  expect(store.writes().length).toBe(before)
})

test("a private window records no mark (FT-12)", async () => {
  const store = world()
  expect(await store.owner.markPlaylists({ acct: a, private: true, marks: [{ playlist: beta, mark: "full" }] }))
    .toEqual({ kind: "result", result: { refused: "private" } })
  expect(await marks(store)).toEqual({ [alpha]: "missing" })
})

test("a list read that shows a Missing playlist again clears its mark; one that doesn't keeps it (DATA-21)", async () => {
  for (const listed of [[beta], [alpha, beta]] as const) {
    const store = world()
    const read = await store.owner.readPlaylistCache({ acct: a, private: false })
    if (read.kind !== "cache" || read.authority.kind !== "eligible") throw Error("Expected an eligible cache capture")
    const write = await store.owner.absorbPlaylistCache(read.authority.capture, { kind: "list", acct: a, site: "www", at: 50,
      rows: listed.map(id => ({ id, title: id })) as never })
    expect(write.kind).toBe("committed")
    expect(await marks(store)).toEqual(listed.length === 2 ? {} : { [alpha]: "missing" })
  }
})
