import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { runExtLinkConsumer } from "../../../tools/fixtures/extlink/run"

test("the real ExtLink, bindHello, Tabs and PageLink consumer emits its exact authored EOF bytes", async () => {
  const expected = await readFile(new URL("../../../tools/fixtures/extlink/expected.jsonl", import.meta.url), "utf8")
  expect(JSON.stringify(await runExtLinkConsumer()) + "\n").toBe(expected)
})
