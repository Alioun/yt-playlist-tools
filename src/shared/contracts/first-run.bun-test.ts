import { expect, test } from "bun:test"
import { isAgreeChange, isChangePayload, isLookupPayload, isAgreementAnswer, isDestinationAnswer, isSyncedChoices, isChangeAnswer } from "./first-run"

const change = { kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: ["shortcuts", "any-tab-keys"], syncOn: false }
test("ui.change validates auto-add operation and answer variants together", () => {
  const request = { kind: "auto-add-choice", acct: "AAAAAAAAAAAAAAAA", playlist: "PL_one", lifetime: "00000000-0000-4000-8000-000000000001", edit: { kind: "percentage", expected: null, pct: 100 } }
  expect(isChangePayload({ change: request })).toBe(true)
  expect(isChangePayload({ change: { ...request, edit: { ...request.edit, pct: 101 } } })).toBe(false)
  const outcome = { kind: "auto-add-confirmed", acct: request.acct, playlist: request.playlist, fact: { kind: "selected", takes: "videos", pct: 100 } }
  expect(isChangeAnswer({ kind: "auto-add-choice", outcome })).toBe(true)
  expect(isChangeAnswer({ kind: "agreement", outcome })).toBe(false)
  expect(isChangeAnswer({ kind: "destination", outcome })).toBe(false)
})
test("the first-run subset accepts only complete JSON DTOs", () => {
  expect(isChangePayload({ change })).toBe(true)
  expect(isChangePayload({ change, windowId: 1 })).toBe(true)
  expect(isLookupPayload({})).toBe(true)
  expect(isAgreeChange({ ...change, selected: [] })).toBe(true)
  for (const invalid of [
    { ...change, selected: ["shortcuts", "shortcuts"] }, { ...change, selected: ["sync"] },
    { ...change, attempt: 0 }, { ...change, attempt: 0.5 }, { ...change, displayedVersion: 0 },
    { ...change, displayedVersion: Infinity }, { ...change, syncOn: "false" },
    { ...change, review: { kind: "agreement-review" } }, { ...change, origin: { kind: "ui", windowId: 1, incognito: false } },
    { ...change, permissions: { music: true, browserMenu: true } }, { ...change, scope: "music" }
  ]) expect(isAgreeChange(invalid)).toBe(false)
  for (const invalid of [{ change, windowId: -1 }, { change, windowId: "1" }, { change, origin: {} }, { change, review: {} }]) expect(isChangePayload(invalid)).toBe(false)
  expect(isLookupPayload({ origin: {} })).toBe(false)
})
test("accessors and non-JSON values invoke no application getter", () => {
  let called = 0
  const accessor = { ...change, get review() { called++; return {} } }
  expect(isAgreeChange(accessor)).toBe(false)
  expect(called).toBe(0)
  expect(isAgreeChange({ ...change, permissions: Promise.resolve(true) })).toBe(false)
  expect(isAgreeChange({ ...change, selected: new Set(["shortcuts"]) })).toBe(false)
})
test("public answers have fixed fields and bounded unique feature rows", () => {
  const row = { feature: "shortcuts", state: "enabled", alsoOnMusic: "held-site-access" }
  expect(isAgreementAnswer({ kind: "agreed", attempt: 1, applications: [row] })).toBe(true)
  expect(isAgreementAnswer({ kind: "agreed", attempt: 1, applications: [row, row] })).toBe(false)
  expect(isAgreementAnswer({ kind: "not-agreed", attempt: 1, reason: "rejected", error: Error("SENTINEL") })).toBe(false)
  expect(isAgreementAnswer({ kind: "agreed", attempt: 1, applications: [{ feature: "music-keys", state: "off" }] })).toBe(false)
  expect(isAgreementAnswer({ kind: "agreed", attempt: 1, applications: [{ feature: "music-keys", state: "held-browser-menu" }] })).toBe(false)
  expect(isDestinationAnswer({ kind: "refused", reason: "stale" })).toBe(true)
  expect(isDestinationAnswer({ kind: "confirmed", playlist: "PL_chosen", view: {} })).toBe(false)
  expect(isSyncedChoices({ kind: "found", features: ["any-tab-keys"] })).toBe(true)
  expect(isSyncedChoices({ kind: "found", features: [], historyId: "SENTINEL" })).toBe(false)
})
