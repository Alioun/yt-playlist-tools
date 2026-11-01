import { expect, test } from "bun:test"
import { uiContract } from "./ui"
import { isUiCreationAnswer, isUiPlaylistList, isUiListing, isUiCacheStatus, isUiCreationPayload } from "./ui-playlists"

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
