import { expect, test } from "bun:test"
import expected from "./expected.json"
import { runSession } from "./run"

test("the composed owner, Accounts and actual Tabs consumer matches complete independent expectations", async () => {
  expect(await runSession()).toEqual(expected)
})
