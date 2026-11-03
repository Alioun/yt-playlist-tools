import { test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { readFileSync } from "node:fs"
import { check, same } from "./specimens"
import { expectedQueueOutput, runGatewayQueueConsumer } from "./run"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com" })

test("real gateway, servePage and PageLink queue consumers match fixed records through EOF", async () => {
  const direct = await runGatewayQueueConsumer(false),
    dom = await runGatewayQueueConsumer(true)
  same(direct, expectedQueueOutput(), "Direct consumer differs from fixed records")
  same(dom, direct, "DOM consumer differs from direct consumer")
  same(direct, readFileSync(new URL("./expected-output.jsonl", import.meta.url), "utf8"), "Consumer differs from the checked-in JSONL")
  check(direct.endsWith("\n") && direct.trimEnd().split("\n").length === 11, "Consumer EOF or record count changed")
})
