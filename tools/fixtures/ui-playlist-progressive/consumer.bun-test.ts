import { expect, test } from "bun:test"
import { progressiveConsumer } from "./run"

test("the composed progressive consumer is deterministic through EOF", async () => {
  const first = await progressiveConsumer(), second = await progressiveConsumer()
  expect(first).toBe(second)
  expect(first.endsWith("\n") && !first.endsWith("\n\n")).toBe(true)
  const parsed: unknown = JSON.parse(first)
  expect(Array.isArray(parsed)).toBe(true)
  if (Array.isArray(parsed)) expect(parsed.at(-1)).toMatchObject({ case: "eof", deadlines: 0, nativeListeners: 0, localListeners: 0 })
  expect(first).not.toMatch(/playlist-cache-capture|SessionRevision|SENTINEL/)
})
