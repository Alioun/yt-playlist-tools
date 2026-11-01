import { expect, test } from "bun:test"
import { planSessionChange, parseSessionMemory, sessionAccountCurrent, sessionEditAccount } from "./session-memory"
import { planAccountSessionRemoval } from "./account-removal-session"
import { signalValue, vocabulary, instance } from "../../../tools/fixtures/monitor/harness"
import { a, b } from "../../../tools/fixtures/tabs/harness"
import { readMonitorBucket, type MonitorOperation } from "./monitor-session"
import type { JsonObject } from "../../shared/contracts/json"

function operation(sequence: number): MonitorOperation {
  return { kind: "signal", instance: instance(), sequence, site: "www", tabId: 1, signal: signalValue("no-effect"), evidence: { kind: "job", online: true, otherRequestsAnswer: true } }
}
function write(raw: JsonObject, now: number, sequence: number) {
  return planSessionChange(raw, { now, edits: [{ kind: "monitor", acct: a, scope: "normal", vocabulary, operations: [operation(sequence)] }] })
}
test("Monitor edits merge a fresh session and preserve unknown keys and other owners", () => {
  const raw: JsonObject = { paused: true, future: { keep: true }, breakage: { v: 1, global: { extension: true }, accounts: { [a]: { extension: [1, 2] }, [b]: { extension: { keep: true } } }, extension: "outer" } }
  const first = write(raw, 10_000, 1)
  if (!first) throw Error("Expected Monitor edit")
  const concurrent = { ...first.expected, paused: false, future: { keep: true, concurrent: 2 } }
  const next = write(concurrent, 20_000, 2)
  if (!next) throw Error("Expected fresh Monitor edit")
  expect(next.expected.paused).toBe(false)
  expect(next.expected.future).toEqual({ keep: true, concurrent: 2 })
  expect(Object.keys(next.items)).toEqual(["breakage"])
  const memory = parseSessionMemory(next.expected)
  expect(memory?.breakage.global.extension).toBe(true)
  expect(memory?.breakage.accounts.get(b)).toEqual({ extension: { keep: true } })
  expect(memory?.breakage.accounts.get(a)?.extension).toEqual([1, 2])
  expect(memory && readMonitorBucket(memory.breakage.accounts.get(a) ?? {}, vocabulary)?.signals[0]?.signal.count).toBe(2)
})
test("Monitor operation replay is idempotent and the planner owns the cross-engine write pace", () => {
  const first = write({}, 0, 1)
  if (!first) throw Error("Expected first Monitor edit")
  expect(write(first.expected, 9_999, 2)).toBeUndefined()
  const replay = write(first.expected, 10_000, 1)
  if (!replay) throw Error("Expected idempotent replay")
  const memory = parseSessionMemory(replay.expected)
  expect(memory && readMonitorBucket(memory.breakage.accounts.get(a) ?? {}, vocabulary)?.signals[0]?.signal.count).toBe(1)
  expect(write(replay.expected, 9_999, 2)).toBeUndefined()
})
test("account-removal cleanup owns the complete Monitor bucket and revision revokes stale work", () => {
  const first = write({}, 0, 1)
  if (!first) throw Error("Expected Monitor edit")
  const removed = planAccountSessionRemoval(a, first.expected)
  expect(removed.kind).toBe("supported")
  if (removed.kind !== "supported") throw Error("Expected compatible removal envelope")
  expect(parseSessionMemory(removed.expected)?.breakage.accounts.has(a)).toBe(false)
  const captured = { reset: 0, accounts: new Map([[a, 0]]) }, current = { reset: 0, accounts: new Map([[a, 1]]) }
  expect(sessionEditAccount({ kind: "monitor", acct: a, scope: "normal", vocabulary, operations: [operation(1)] })).toBe(a)
  expect(sessionAccountCurrent(captured, current, a)).toBe(false)
  expect(sessionAccountCurrent(captured, current, b)).toBe(true)
})
test("global shown edits support signed-out contexts and preserve account once state", () => {
  const raw = { shown: { v: 1, global: { keep: true, once: ["existing"] }, accounts: { [a]: { once: ["missing:PL_alpha"] } } } }
  const result = planSessionChange(raw, { now: 0, edits: [{ kind: "shown-global", scope: "normal", acct: null, keys: ["monitor:www:auto-add"] }] })
  expect(result?.expected.shown).toEqual({ v: 1, global: { keep: true, once: ["existing", "monitor:www:auto-add"] }, accounts: { [a]: { once: ["missing:PL_alpha"] } } })
  expect(planSessionChange(raw, { now: 0, edits: [{ kind: "shown-global", scope: "normal", acct: null, keys: ["arbitrary:user-data"] }] })).toBeUndefined()
})

test("normal notice claims are exclusive, reads do not mark shown and only the winning token acknowledges", () => {
  const key = "monitor:www:auto-add"
  const claim = planSessionChange({}, { now: 0, edits: [{ kind: "monitor-notice", scope: "normal", acct: a, action: "claim", token: "0000000000000001:1", keys: [key] }] })
  if (!claim) throw Error("Expected first claim")
  const competing = planSessionChange(claim.expected, { now: 1, edits: [{ kind: "monitor-notice", scope: "normal", acct: b, action: "claim", token: "0000000000000002:1", keys: [key] }] })
  if (!competing) throw Error("Expected confirmed competing read")
  expect(competing.items).toEqual({})
  expect(parseSessionMemory(competing.expected)?.shown.global.has(key)).toBe(false)
  expect(parseSessionMemory(competing.expected)?.monitorClaims.get(key)?.token).toBe("0000000000000001:1")
  const wrong = planSessionChange(competing.expected, { now: 2, edits: [{ kind: "monitor-notice", scope: "normal", acct: b, action: "acknowledge", token: "0000000000000002:1", keys: [key] }] })
  expect(wrong?.items).toEqual({})
  const actual = planSessionChange(competing.expected, { now: 2, edits: [{ kind: "monitor-notice", scope: "normal", acct: a, action: "acknowledge", token: "0000000000000001:1", keys: [key] }] })
  expect(parseSessionMemory(actual?.expected)?.shown.global.has(key)).toBe(true)
  expect(parseSessionMemory(actual?.expected)?.monitorClaims.has(key)).toBe(false)
})
