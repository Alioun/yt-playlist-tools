import { expect, test } from "bun:test"
import expected from "./expected.json"
import { runAutoAddChoiceConsumer } from "./run"

test("the real owner and authenticated Backend match the complete auto-add transcript", async () => {
  const first = await runAutoAddChoiceConsumer(), second = await runAutoAddChoiceConsumer()
  expect(first).toEqual(expected.map(row => JSON.stringify(row)))
  expect(second).toEqual(first)
})
