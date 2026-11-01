import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { runMonitorConsumer, stable } from "./run"

test("real owner Monitor registry Tabs and complete TabView match every expected byte through EOF", async () => {
  const actual = new TextEncoder().encode(stable(await runMonitorConsumer()))
  const expected = await readFile(new URL("./expected.jsonl", import.meta.url))
  expect(actual).toEqual(new Uint8Array(expected))
})
