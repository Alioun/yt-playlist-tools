import { expect, test } from "bun:test"
import { lastLine, progressLine, resultLine, undoLine, type CopyContext } from "./copy"
import type { GatherResult } from "./gather"
import type { GatherLineAction } from "../../shared/contracts/ui-gather"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"

const i18n = englishI18n()
const now = 1_700_000_000_000
const context: CopyContext = { i18n, account: "Ann", now }
const base = { id: "g1", windowId: 1, scope: "normal", at: now - 2 * 3_600_000 } as const
const playlist = (patch: Partial<Extract<GatherResult, { kind: "playlist" }>>): GatherResult => ({
  ...base,
  kind: "playlist",
  acct: "AAAAAAAAAAAAAAAA" as AccountKey,
  playlist: "PLa" as PlaylistId,
  title: "Later",
  saved: 9,
  already: 0,
  failed: [],
  closed: 0,
  navigated: 0,
  kept: true,
  undo: "g1",
  retry: false,
  ...patch
})
const failed = (failure: "refused" | "rate-limited" | "unconfirmed" | "missing" | "full", count = 1) => Array.from({ length: count }, (_, n) => ({ video: `gat0000000${n}` as VideoId, failure }))

test("each result reads in YT-GT-32 and YT-GT-33's words, with its one action", () => {
  const rows: [GatherResult, string, GatherLineAction["kind"] | null][] = [
    [{ ...base, kind: "player", count: 12, confirmed: true, closed: 12, navigated: 0 }, "Gathered 12 videos into YouTube's player.", null],
    [{ ...base, kind: "player", count: 12, confirmed: false, closed: 0, navigated: 0 }, "Couldn't confirm YouTube made the list, so all tabs stay open.", null],
    [
      { ...base, kind: "queue", count: 60, why: "player-takes-50", left: 0, outcome: "confirmed", closed: 60, navigated: 0 },
      "Gathered 60 videos into YouTube's queue, because YouTube's player takes 50.",
      null
    ],
    [
      { ...base, kind: "queue", count: 200, why: "chosen", left: 3, outcome: "confirmed", closed: 200, navigated: 0 },
      "Gathered 200 videos into YouTube's queue. 3 tabs stay open, because the queue takes 200 at a time.",
      null
    ],
    [
      { ...base, kind: "queue", count: 5, why: "chosen", left: 0, outcome: "not-loaded", closed: 0, navigated: 0 },
      "Couldn't build YouTube's queue, because its tab didn't load in time. All tabs stay open.",
      null
    ],
    [
      { ...base, kind: "queue", count: 5, why: "chosen", left: 0, outcome: "not-confirmed", closed: 0, navigated: 0 },
      "Couldn't confirm all 5 videos reached YouTube's queue, so all tabs stay open.",
      null
    ],
    [playlist({ already: 2 }), "Saved 9 videos to Later. 2 were already in it.", "undo"],
    [playlist({ closed: 9 }), "Saved 9 videos to Later and closed their tabs.", "undo"],
    [playlist({ failed: failed("refused"), retry: true }), "Saved 9 videos to Later. Couldn't save 1 video, because YouTube doesn't allow saving it. Its tab stays open.", "retry"],
    [
      playlist({ failed: failed("rate-limited", 3), retry: true }),
      "Saved 9 videos to Later. Couldn't save 3 videos, because YouTube is limiting requests. Try again in a minute. Their tabs stay open.",
      "retry"
    ],
    [playlist({ saved: 0, undo: null, failed: failed("missing", 4) }), "Couldn't gather into Later, because it doesn't exist anymore. All tabs stay open.", "choose"],
    [playlist({ saved: 0, undo: null, failed: failed("full", 4) }), "Couldn't gather into Later, because it's full. All tabs stay open.", "choose"],
    [playlist({ auto: true, closed: 9 }), "Gathered 9 videos into Later by itself, 2 hours ago.", "undo"],
    [{ ...base, kind: "no-videos" }, "No YouTube videos are open in this window.", null],
    [{ ...base, kind: "choose", acct: "AAAAAAAAAAAAAAAA" as AccountKey }, "Choose a gather playlist for Ann first.", "choose"],
    [{ ...base, kind: "signed-out" }, "Sign in to YouTube to gather into a playlist.", "sign-in"],
    [{ ...base, kind: "no-tab" }, "Open YouTube to gather into a playlist. All tabs stay open.", "open-youtube"],
    [{ ...base, kind: "unhealthy", to: "queue" }, "Gathering into YouTube's queue isn't working right now because YouTube changed something.", null]
  ]
  for (const [result, text, action] of rows) {
    const line = resultLine(result, context)
    expect({ text: line?.text, action: line?.action?.kind ?? null }).toEqual({ text, action })
  }
  expect(resultLine({ ...base, kind: "busy" }, context)).toBeNull()
})

test("a gather's toast is worded for the page, and an automatic one says it ran by itself", () => {
  expect(resultLine(playlist({ closed: 9 }), context, "toast")?.text).toBe("Gathered 9 videos into Later and closed their tabs")
  expect(resultLine(playlist({ auto: true, closed: 1, saved: 1 }), context, "toast")?.text).toBe("Gathered 1 video into Later by itself and closed its tab")
  expect(resultLine(playlist({ failed: failed("refused"), retry: true }), context, "toast")?.action).toEqual({ kind: "undo", id: "g1" })
})

test("progress, Undo and the last gather read as the row shows them", () => {
  expect(progressLine(12, 40, i18n).text).toBe("Checking 12 of 40…")
  expect(progressLine(40, 40, i18n).text).toBe("Saving 40 videos…")
  expect(undoLine({ kind: "undone", reopened: 9 }, { count: 9, title: "Later" }, i18n).text).toBe("Removed 9 videos from Later and reopened their tabs.")
  expect(undoLine({ kind: "undo-failed" }, { count: 9, title: "Later" }, i18n)).toEqual({ text: "Couldn't undo.", tone: "failure", action: null })
  expect(lastLine({ id: "g1", at: now - 5 * 60_000, auto: false, count: 3, destination: { kind: "queue" }, undo: false }, context)).toEqual({
    text: "Last gather: 3 videos into YouTube's queue, 5 minutes ago",
    tone: "muted",
    action: null
  })
  expect(lastLine({ id: "g1", at: now, auto: false, count: 1, destination: { kind: "playlist", title: "Later" }, undo: true }, context)).toEqual({
    text: "Last gather: 1 video into Later, this minute",
    tone: "muted",
    action: { kind: "undo", id: "g1" }
  })
})
