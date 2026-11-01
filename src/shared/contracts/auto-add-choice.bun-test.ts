import { expect, test } from "bun:test"
import { isChangePayload, isChangeAnswer } from "./first-run"
import { confirmsAutoAdd, isAutoAddChoiceChange, isAutoAddChoiceAnswer, isAutoAddLifetime } from "./auto-add-choice"
import { isAccountKey, isPlaylistId } from "../model/validation"

const acct = "AAAAAAAAAAAAAAAA", one = "PL_one", two = "PL_two"
if (!isAccountKey(acct) || !isPlaylistId(one) || !isPlaylistId(two)) throw Error("fixture identities")

const lifetime = "00000000-0000-4000-8000-000000000001"
if (!isAutoAddLifetime(lifetime)) throw Error("fixture lifetime")
const change = { kind: "auto-add-choice", acct, playlist: one, lifetime, edit: { kind: "auto-add", expected: false, chosen: true } } as const
test("auto-add DTOs accept separate field edits and bounded nullable percentages", () => {
  expect(isChangePayload({ change })).toBe(true)
  expect(isChangePayload({ change: { kind: "auto-add-read", acct, playlist: one } })).toBe(true)
  for (const takes of ["videos", "shorts", "both"]) expect(isAutoAddChoiceChange({ ...change, edit: { kind: "takes", expected: "videos", takes } })).toBe(true)
  for (const pct of [0, 1, 100, null]) expect(isAutoAddChoiceChange({ ...change, edit: { kind: "percentage", expected: null, pct } })).toBe(true)
  for (const pct of [-1, 101, 0.5, NaN, Infinity, "20", undefined]) expect(isAutoAddChoiceChange({ ...change, edit: { kind: "percentage", expected: null, pct } })).toBe(false)
})
test("auto-add boundary rejects unexpected fields and raw invalid identities without invoking accessors", () => {
  for (const invalid of [
    { ...change, acct: "invalid" }, { ...change, playlist: "!" }, { ...change, lifetime: "copied" },
    { ...change, origin: { kind: "ui", incognito: false } }, { ...change, account: { name: "Forged" } },
    { ...change, autoAdd: [] }, { ...change, setup: {} }, { ...change, edit: { ...change.edit, takes: "both" } },
    { ...change, edit: { kind: "takes", expected: "videos", takes: "all" } },
    { ...change, edit: { kind: "percentage", expected: -1, pct: 20 } },
    { ...change, edit: { kind: "auto-add", expected: false, chosen: 1 } }
  ]) expect(isAutoAddChoiceChange(invalid)).toBe(false)
  let called = 0
  expect(isAutoAddChoiceChange({ ...change, get origin() { called++; return {} } })).toBe(false)
  expect(called).toBe(0)
})
test("auto-add answers carry only detached facts with explicit operation and account correlation", () => {
  const answer = { kind: "auto-add-confirmed", acct, playlist: one, fact: { kind: "selected", takes: "videos", pct: null } } as const
  expect(isAutoAddChoiceAnswer(answer)).toBe(true)
  expect(isChangeAnswer({ kind: "auto-add-choice", outcome: answer })).toBe(true)
  expect(confirmsAutoAdd(change, answer)).toBe(true)
  expect(confirmsAutoAdd(change, { ...answer, playlist: two })).toBe(false)
  expect(confirmsAutoAdd(change, { ...answer, fact: { kind: "absent" } })).toBe(false)
  expect(isChangeAnswer({ kind: "destination", outcome: answer })).toBe(false)
  expect(isChangeAnswer({ kind: "auto-add-choice", outcome: { kind: "agreed", attempt: 1, applications: [] } })).toBe(false)
  expect(isAutoAddChoiceAnswer({ ...answer, error: "SENTINEL" })).toBe(false)
})
