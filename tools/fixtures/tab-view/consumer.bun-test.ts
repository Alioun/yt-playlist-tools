import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { runTabViewConsumer } from "./run"

test("the actual complete producer, owner, AddFlow, Tabs and ExtLink emit exact EOF observations", async () => {
  const expected = await readFile(new URL("./expected.jsonl", import.meta.url), "utf8")
  expect(JSON.stringify(await runTabViewConsumer()) + "\n").toBe(expected)
}, 5_000)
