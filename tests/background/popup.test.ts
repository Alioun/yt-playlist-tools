import { afterEach, expect, test } from "bun:test"
import type { Background } from "../../src/background/boot"
import { acct, browser, started } from "./world"

const running: Background[] = []
afterEach(async () => {
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
})

test("with no YouTube tab open, the popup still names the last account whose setup is saved", async () => {
  const world = browser({})
  await world.seed({ lastAccount: acct })
  world.tabs.open(1, "https://example.com/", { active: true })
  const w = world.worker()
  running.push(w.background)
  await started(w)

  expect(await w.popup.call("ui.accountInView", {})).toEqual({ kind: "answered", result: { kind: "account", source: "last-account", acct: acct as never } })
})

test("with no YouTube tab open and no saved last account, the popup has no account to name", async () => {
  const world = browser({})
  await world.seed()
  world.tabs.open(1, "https://example.com/", { active: true })
  const w = world.worker()
  running.push(w.background)
  await started(w)

  expect(await w.popup.call("ui.accountInView", {})).toEqual({ kind: "answered", result: { kind: "none" } })
})
