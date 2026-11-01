import { expect, test } from "bun:test"
import expected from "./expected.json"
import { runSession } from "./run"

test("the Accounts consumer uses the real owner and actual Tabs through complete EOF", async () => {
  expect(await runSession()).toEqual(expected)
})
