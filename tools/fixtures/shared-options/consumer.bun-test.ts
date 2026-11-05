import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { consume } from "./consumer"

test("both real owner routes match every independent JSONL record through EOF", async () => {
  const observations: unknown[] = []
  await consume(record => observations.push(record))
  const text = await readFile(new URL("./expected.jsonl", import.meta.url), "utf8")
  expect(text.endsWith("\n")).toBe(true)
  expect(observations).toEqual(
    text
      .trimEnd()
      .split("\n")
      .map(line => JSON.parse(line))
  )
  expect(observations).toHaveLength(66)
})
