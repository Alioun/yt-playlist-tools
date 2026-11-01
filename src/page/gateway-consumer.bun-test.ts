import { expect, test } from "bun:test"
import { runGatewayReadConsumer } from "../../tools/fixtures/gateway-reads/run"

test("real direct and DOM channels preserve the complete consumer output through EOF", async () => {
  const direct = await runGatewayReadConsumer(false)
  const dom = await runGatewayReadConsumer(true)
  expect(dom).toBe(direct)
  expect(direct.endsWith("\n")).toBe(true)
  expect(direct.trimEnd().split("\n")).toHaveLength(12)
})
