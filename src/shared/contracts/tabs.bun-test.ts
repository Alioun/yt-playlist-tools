import { expect, test } from "bun:test"
import { isTabHello, isTabPing, tabJobMessages, tabMessages } from "./tabs"
import { a, b, build, isFixtureView, signedIn, signedOut } from "../../../tools/fixtures/tabs/harness"

test("hello and ping accept complete signed-in and signed-out variants only", () => {
  expect(isTabPing(signedIn())).toBe(true); expect(isTabPing(signedOut())).toBe(true)
  expect(isTabHello({ ...signedIn(), hidden: true, fresh: false })).toBe(true)
  for (const value of [null, {}, { ...signedIn(), acct: null }, { ...signedOut(), acct: a }, { ...signedIn(), private: true },
    { ...signedIn(), windowId: 1 }, { ...signedIn(), datasyncId: "raw" }, { ...signedIn(), site: "other" }, { ...signedIn(), build: "" }]) expect(isTabPing(value)).toBe(false)
  expect(isTabHello({ ...signedIn(), hidden: true })).toBe(false)
  expect(isTabHello({ ...signedIn(), hidden: true, fresh: true, incognito: false })).toBe(false)
})

test("job answers are checked against the actual invocation", () => {
  const invocation = { job: { kind: "playlists" }, acct: a } as const
  const contract = tabJobMessages(invocation, 500)
  expect(contract["bg.job"].payload(invocation)).toBe(true)
  expect(contract["bg.job"].payload({ ...invocation, acct: b })).toBe(false)
  expect(contract["bg.job"].result({ ok: true, route: "synthetic", data: [] })).toBe(true)
  expect(contract["bg.job"].result({ ok: true, route: "synthetic", data: { confirmed: true } })).toBe(false)
  expect(contract["bg.job"].result({ ok: false, reason: "accountChanged" })).toBe(true)
})

test("view subset uses a required complete producer validator", () => {
  const contract = tabMessages(isFixtureView)
  expect(contract["bg.ping"].payload({})).toBe(true)
  expect(contract["bg.ping"].payload({ incognito: false })).toBe(false)
  expect(contract["bg.view"].payload({ acct: a, signedIn: true, private: false, build, fixture: "account-scoped" })).toBe(true)
  expect(contract["bg.view"].payload({})).toBe(false)
  expect(contract["bg.view"].result(null)).toBe(true)
  expect(contract["bg.view"].result({ ok: true })).toBe(false)
})
