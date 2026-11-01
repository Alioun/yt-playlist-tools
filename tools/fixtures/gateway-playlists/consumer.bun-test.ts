import { test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { check, same } from "./specimens"
import { expectedPlaylistOutput, runGatewayPlaylistConsumer } from "./run"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com" })

test("real gateway servePage and PageLink consumers match fixed records through EOF", async () => {
  const direct = await runGatewayPlaylistConsumer(false), dom = await runGatewayPlaylistConsumer(true)
  same(direct, expectedPlaylistOutput(), "Direct consumer differs from fixed records")
  same(dom, direct, "DOM consumer differs from direct consumer")
  check(direct.endsWith("\n") && direct.trimEnd().split("\n").length === 16, "Consumer EOF or record count changed")
})
