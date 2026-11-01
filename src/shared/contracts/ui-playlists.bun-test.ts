import { expect, test } from "bun:test"
import { uiContract } from "./ui"
import { isUiCreationAnswer, isUiListRefresh, isUiPlaylistList, isUiListing, isUiCacheStatus, isUiCreationPayload } from "./ui-playlists"

const operation = "00000000-0000-4000-8000-000000000001"
test("wire data has nullable cache stamps and no promises or authority", () => {
  expect(isUiListing({ rows: [{ id: "PL_alpha", title: "Created" }], at: null })).toBe(true)
  expect(isUiCacheStatus({ kind: "committed", cache: { capture: "raw" } })).toBe(false)
  expect(isUiPlaylistList({ kind: "open", cached: null, freshness: "absent", refresh: Promise.resolve(null) })).toBe(false)
  expect(isUiPlaylistList({ kind: "unavailable", read: { kind: "committed" } })).toBe(false)
})
test("wire validators reject forged authority and cross-kind answers", () => {
  const payload = { action: "open", operation, acct: "AAAAAAAAAAAAAAAA", site: "www", refresh: false, windowId: 1 }
  expect(uiContract["ui.playlists"].payload(payload)).toBe(true)
  for (const field of ["origin", "req", "incognito", "activeTabId", "tabId", "capture"]) {
    expect(uiContract["ui.playlists"].payload({ ...payload, [field]: 1 })).toBe(false)
  }
  expect(uiContract["ui.accountInView"].payload({ windowId: 1, acct: "AAAAAAAAAAAAAAAA" })).toBe(false)
  expect(uiContract["ui.accountInView"].result({ kind: "created", id: "PL_alpha" })).toBe(false)
  expect(uiContract["ui.resolveChannel"].result({ kind: "result", tabId: 1, result: { ok: true, route: "fixture", data: { playlistId: "PL_alpha" } } })).toBe(false)
  expect(isUiCreationPayload({ action: "submit", operation, title: "Title", privacy: "FRIENDS" })).toBe(false)
  expect(isUiCreationPayload({ action: "submit", operation, title: "Title", privacy: "PRIVATE", videoId: "invalid" })).toBe(false)
  expect(isUiCreationPayload({ action: "submit", operation, title: "Title", privacy: "PRIVATE", acct: "AAAAAAAAAAAAAAAA" })).toBe(false)
})
test("creation answers cannot invent confirmation or disagree about the created ID", () => {
  const result = { kind: "created", id: "PL_alpha", outcome: { kind: "result", tabId: 1,
    result: { ok: true, route: "fixture", data: { playlistId: "PL_alpha" } } }, cache: { kind: "unconfirmed", write: "resolved", cause: "stopped" } }
  expect(isUiCreationAnswer(result)).toBe(true)
  expect(isUiCreationAnswer({ ...result, id: "PL_other" })).toBe(false)
  expect(isUiCreationAnswer({ ...result, outcome: { kind: "transport", tabId: 1, failure: "timeout", delivery: "unknown" } })).toBe(false)
})
test("refresh and creation answers agree with the outcome they carry", () => {
  const listed = { ok: true, route: "fixture", data: [{ id: "PL_alpha", title: "Alpha" }] }
  const success = { kind: "result", tabId: 1, result: listed }
  const failure = { kind: "result", tabId: 1, result: { ok: false, reason: "failed" } }
  const present = { kind: "list-present", acct: "AAAAAAAAAAAAAAAA", site: "www", private: false, at: 1, ids: ["PL_alpha"] }
  const refresh = { kind: "listed", listing: { rows: listed.data, at: 1 }, outcome: success, cache: { kind: "committed" }, present }
  expect(isUiListRefresh(refresh)).toBe(true)
  expect(isUiListRefresh({ ...refresh, outcome: failure })).toBe(false)
  expect(isUiListRefresh({ kind: "not-listed", outcome: failure, cached: null })).toBe(true)
  expect(isUiListRefresh({ kind: "not-listed", outcome: success, cached: null })).toBe(false)
  const created = { kind: "result", tabId: 1, result: { ok: true, route: "fixture", data: { playlistId: "PL_alpha" } } }
  expect(isUiCreationAnswer({ kind: "not-created", outcome: { kind: "session", status: "memory" } })).toBe(true)
  expect(isUiCreationAnswer({ kind: "not-created", outcome: created })).toBe(false)
})
