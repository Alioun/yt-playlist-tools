import { expect, test } from "bun:test"
import { uiBridgeJson } from "./run"

test("real two-endpoint consumer is deterministic through one LF and EOF", async () => {
  const first = await uiBridgeJson(), second = await uiBridgeJson()
  expect(first).toBe(second)
  expect(first.endsWith("\n")).toBe(true)
  expect(first.endsWith("\n\n")).toBe(false)
  const result: unknown = JSON.parse(first)
  expect(Array.isArray(result)).toBe(true)
  expect(first).not.toMatch(/playlist-cache-capture|agreement-review|SessionRevision|SENTINEL/)
})
