import { expect, test } from "bun:test"
import expected from "./expected.json"
import { runSession } from "./run"
test("the actual owner, Playlists and Tabs consumer matches every authored record through EOF", async () => {
  expect(await runSession()).toEqual(expected)
})
