import { expect, test } from "bun:test"
import { isTabAddReport, tabActionContract, tabProgressContract, TITLE_LIMIT } from "./tab-actions"
import { isAccountKey, isPlaylistId, isVideoId, type PlaylistId } from "../model"
import { toastPlan, type Outcome, type Report } from "../rules/outcomes"

function id<T>(value: string, guard: (v: unknown) => v is T): T {
  if (!guard(value)) throw Error(`Invalid fixture ${value}`)
  return value
}
const acct = id("AAAAAAAAAAAAAAAA", isAccountKey),
  video = id("aaaaaaaaaaa", isVideoId)
const music = id("PL_music", isPlaylistId),
  talks = id("PL_talks", isPlaylistId)
const shown = () => ({ tab: new Set<string>(), session: new Set<string>() })
const outcomes: Record<PlaylistId, Outcome> = { [music]: { kind: "added" }, [talks]: { kind: "filtered", decision: "filtered-unknown-channel" } }
const reports: Report[] = [
  { kind: "pending", playlists: [music] },
  { kind: "no-playlist" },
  { kind: "removed", playlist: music },
  { kind: "undo-failed" },
  { kind: "auto-add", outcomes, shown: shown() },
  { kind: "auto-add", outcomes: { [music]: { kind: "failed", failure: "membership-unreadable" } }, shown: shown() },
  { kind: "shortcut", outcomes: { [music]: { kind: "added" }, [talks]: { kind: "failed", failure: "full" } } },
  { kind: "quick-save", outcomes: { [music]: { kind: "already-in" } } },
  { kind: "choose-shortcut", outcomes: { [music]: { kind: "added" } } }
]
const report = (toast: unknown, extra: Record<string, unknown> = {}) => ({
  kind: "report",
  outcomes: { [music]: { kind: "added" } },
  toast,
  feedback: true,
  undo: null,
  titles: { [music]: "Music" },
  ...extra
})

test("the page accepts every toast the background plans, and refuses an outcome or toast with no kind", () => {
  const toasts = reports.map(planned => toastPlan(planned, true))
  expect(toasts.filter(toast => toast === null)).toEqual([])
  for (const toast of toasts) expect(isTabAddReport(report(toast))).toBe(true)
  expect(isTabAddReport(report(null, { outcomes: { [music]: { added: true } } }))).toBe(false)
  expect(isTabAddReport(report({ tone: "confirmation", message: "saved" }))).toBe(false)
  expect(isTabAddReport(report(null, { outcomes: { "not a playlist": { kind: "added" } } }))).toBe(false)
})

test("an add may name its video within the title limit and carries no other extra field", () => {
  const payload = tabActionContract["tab.add"].payload
  const request = { site: "www", video, via: "shortcut", shortcut: "orig01" }
  expect(payload({ acct, request })).toBe(true)
  expect(payload({ acct, request: { ...request, title: "A video" } })).toBe(true)
  expect(payload({ acct, request: { ...request, title: "x".repeat(TITLE_LIMIT + 1) } })).toBe(false)
  expect(payload({ acct, request: { ...request, channel: null } })).toBe(false)
})

test("auto-add's progress carries ordered stretches of a known length", () => {
  const save = tabProgressContract["tab.progress.save"].payload
  expect(
    save({
      acct,
      request: {
        video,
        progress: {
          len: 300,
          parts: [
            [0, 60],
            [90, 120]
          ]
        }
      }
    })
  ).toBe(true)
  expect(save({ acct: null, request: { video, progress: { len: 300, parts: [] } } })).toBe(true)
  expect(save({ acct, request: { video, progress: { len: 300, parts: [[60, 0]] } } })).toBe(false)
  expect(save({ acct, request: { video, progress: { len: 0, parts: [] } } })).toBe(false)
  expect(tabProgressContract["tab.cantMeasure"].payload({ acct, request: null })).toBe(true)
  expect(tabProgressContract["tab.progress.load"].result({ len: 300, parts: [[0, 60]] })).toBe(true)
})
