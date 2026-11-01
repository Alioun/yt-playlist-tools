import { expect, test } from "bun:test"
import { playlistUiContract, isUiListCompletion, isUiPlaylistAnswer } from "../../../src/shared/contracts/ui-playlists"

const operation = "00000000-0000-4000-8000-000000000002"
const contract = playlistUiContract["ui.playlists"]
test("every list wire command has an exact finite receiver guard", () => {
  const commands = [
    { action: "open", operation, acct: "AAAAAAAAAAAAAAAA", site: "www", refresh: false },
    { action: "await", operation, generation: 0 },
    { action: "refresh", operation, generation: 1 },
    { action: "release", operation }
  ]
  for (const command of commands) {
    expect(contract.payload(command)).toBe(true)
    for (const extra of ["req", "private", "sender", "capture", "callback", "rawError"]) expect(contract.payload({ ...command, [extra]: 1 })).toBe(false)
    expect(contract.payload({ ...command, operation: "not-validated" })).toBe(false)
  }
  expect(contract.payload({ action: "await", operation, generation: -1 })).toBe(false)
  expect(contract.payload({ action: "refresh", operation, generation: 0.5 })).toBe(false)
  expect(contract.payload({ action: "await", operation, generation: 0, acct: "AAAAAAAAAAAAAAAA" })).toBe(false)
  expect(contract.payload({ action: "release", operation, generation: 0 })).toBe(false)
  expect(contract.payload({ action: "open", operation, acct: "AAAAAAAAAAAAAAAA", site: "www" })).toBe(false)
})
test("all progressive list answers reject promises, callbacks, errors and captured authority", () => {
  const replies = [
    { kind: "open", operation, cached: { rows: [], at: null }, freshness: "stale", refresh: { kind: "pending", generation: 0 } },
    { kind: "open", operation, cached: null, freshness: "absent", refresh: null },
    { kind: "refreshed", operation, generation: 0, refresh: { kind: "not-listed", outcome: { kind: "no-tab", attempted: [] }, cached: null } },
    { kind: "refreshed", operation, generation: 1, refresh: { kind: "listed", listing: { rows: [], at: 1 },
      outcome: { kind: "result", tabId: 1, result: { ok: true, route: "fixture", data: [] } }, cache: { kind: "failed", stage: "set" },
      present: { kind: "list-present", acct: "AAAAAAAAAAAAAAAA", site: "www", private: false, at: 1, ids: [] } } },
    { kind: "refreshed", operation, generation: 1, refresh: { kind: "withheld", confirmed: true, cache: { kind: "unconfirmed", write: "resolved", cause: "stopped" } } },
    { kind: "released", operation }
  ]
  for (const reply of replies) {
    expect(isUiPlaylistAnswer(reply)).toBe(true)
    for (const extra of ["owner", "sender", "error", "callback"]) expect(isUiPlaylistAnswer({ ...reply, [extra]: 1 })).toBe(false)
  }
  expect(isUiPlaylistAnswer({ kind: "open", operation, cached: null, freshness: "absent", refresh: Promise.resolve(null) })).toBe(false)
  expect(isUiPlaylistAnswer({ kind: "refreshed", operation, generation: 0, refresh: () => ({}) })).toBe(false)
  expect(isUiListCompletion({ kind: "withheld", confirmed: true, cache: null, listing: { rows: [], at: 1 } })).toBe(false)
  expect(isUiPlaylistAnswer({ kind: "released", operation, capture: {} })).toBe(false)
})
