import { expect, test } from "bun:test"
import { observeWithdrawnFilterV2 } from "../../../tools/fixtures/withdrawn-document-recovery/run"

test("operation-produced filter and every serialized boundary finish exactly under current consent", async () => {
  const result = await observeWithdrawnFilterV2()
  expect(result.reconstruction.complete).toBe(true)
  expect(result.events.filter(event => event.kind === "restart-read-only")).toHaveLength(16)
  expect(result.events.filter(event => event.kind === "completion")).toHaveLength(2)
}, 180000)
