import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { runViewPublicationConsumer } from "./run"

test("real owner Tabs Monitor and complete producer match the authored consumer through EOF", async () => {
  const expected = await readFile(new URL("./expected.jsonl", import.meta.url), "utf8")
  expect(JSON.stringify(await runViewPublicationConsumer()) + "\n").toBe(expected)
}, 10_000)
