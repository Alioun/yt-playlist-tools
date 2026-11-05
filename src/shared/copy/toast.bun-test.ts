import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { describe, expect, test } from "bun:test"
import { isPlaylistId, type PlaylistId } from "../model"
import { toastPlan, type Report } from "../rules/outcomes"
import { toastText, type Titles } from "./index"

const i18n = englishI18n()

function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("Invalid synthetic playlist ID")
  return value
}

const ids = ["PLa", "PLb", "PLc", "PLd", "PLe"].map(playlist)
const [a, b, c, d, e] = ids as [PlaylistId, PlaylistId, PlaylistId, PlaylistId, PlaylistId]
const names = { [a]: "Music", [b]: "Learning", [c]: "Watch later", [d]: "Gym", [e]: "Chill" }

function text(report: Report, titles: Titles, site: "www" | "music" = "www", feedback = true) {
  const plan = toastPlan(report, feedback)
  if (!plan) throw new Error("Expected a toast")
  return toastText(plan, titles, site, i18n)
}
const saved = (...playlists: PlaylistId[]): Report => ({ kind: "shortcut", outcomes: Object.fromEntries(playlists.map(id => [id, { kind: "added" }])) })

describe("toast copy rules", () => {
  test("removal and Undo failure use the settled copy on both sites", () => {
    for (const site of ["www", "music"] as const) {
      expect(text({ kind: "removed", playlist: a }, { video: "Get Lucky", playlists: { [a]: "Favourites" } }, site)).toBe("Removed “Get Lucky” from Favourites")
      expect(text({ kind: "undo-failed" }, {}, site, false)).toBe("Couldn't undo.")
    }
    expect(text({ kind: "removed", playlist: a }, { playlists: names }, "music")).toBe("Removed this song from Music")
  })
  test("lists read one, two, three, or two and more", () => {
    const titles = { video: "Song", playlists: names }
    expect(text(saved(a), titles)).toBe("Saved “Song” to Music")
    expect(text(saved(a, b), titles)).toBe("Saved “Song” to Music and Learning")
    expect(text(saved(a, b, c), titles)).toBe("Saved “Song” to Music, Learning and Watch later")
    expect(text(saved(a, b, c, d), titles)).toBe("Saved “Song” to Music, Learning and 2 more")
    expect(text(saved(a, b, c, d, e), titles)).toBe("Saved “Song” to Music, Learning and 3 more")
  })

  test("video and playlist titles are cut at 40 characters with an ellipsis", () => {
    const forty = "x".repeat(40)
    expect(text(saved(a), { video: forty, playlists: { [a]: forty } })).toBe(`Saved “${forty}” to ${forty}`)
    expect(text(saved(a), { video: `${forty}yz`, playlists: { [a]: `${forty}!` } })).toBe(`Saved “${forty}…” to ${forty}…`)
  })

  test("cuts count user-perceived characters and never split one", () => {
    const family = "👨‍👩‍👧‍👦"
    const accented = "é"
    expect(text(saved(a), { video: family.repeat(41), playlists: { [a]: accented.repeat(41) } })).toBe(`Saved “${family.repeat(40)}…” to ${accented.repeat(40)}…`)
    expect(text(saved(a), { video: `${"a".repeat(39)}🎵🎵`, playlists: { [a]: "日本語のプレイリスト" } })).toBe(`Saved “${"a".repeat(39)}🎵…” to 日本語のプレイリスト`)
  })

  test("an unknown or blank video title reads this video, or this song on YouTube Music", () => {
    const titles = { playlists: names }
    expect(text(saved(a), titles)).toBe("Saved this video to Music")
    expect(text(saved(a), { ...titles, video: "  " })).toBe("Saved this video to Music")
    expect(text(saved(a), titles, "music")).toBe("Saved this song to Music")
    expect(text({ kind: "quick-save", outcomes: { [a]: { kind: "already-in" } } }, titles)).toBe("This video is already in Music")
    expect(text({ kind: "auto-add", outcomes: { [a]: { kind: "failed", failure: "membership-unreadable" } }, shown: { tab: new Set(), session: new Set() } }, titles)).toBe(
      "Couldn't check this video's playlists, so auto-add didn't run."
    )
  })

  test("an unknown playlist title reads as no longer available", () => {
    expect(text(saved(a, b), { video: "Song", playlists: { [a]: "Music" } })).toBe("Saved “Song” to Music and a playlist that's no longer available")
  })

  test("only the shortcut confirmation quotes a playlist title, and cuts it", () => {
    const long = "y".repeat(45)
    expect(text({ kind: "choose-shortcut", outcomes: { [a]: { kind: "added" } } }, { shortcut: "Gym mix", playlists: { [a]: long } })).toBe(`Gym mix now saves to “${"y".repeat(40)}…”.`)
  })

  test("an account without a label reads Unnamed account", () => {
    expect(text({ kind: "no-playlist" }, { shortcut: "Alt+1" }, "www", false)).toBe("Alt+1 has no playlist on Unnamed account yet.")
  })

  test("YouTube Music uses its own name and song", () => {
    const titles = { video: "Get Lucky", playlists: { [a]: "Favourites" } }
    const failed = (failure: "signed-out" | "unconfirmed" | "refused" | "rate-limited" | "unrecognised" | "missing"): Report => ({ kind: "quick-save", outcomes: { [a]: { kind: "failed", failure } } })
    expect(text(saved(a), titles, "music")).toBe("Saved “Get Lucky” to Favourites")
    expect(text(failed("signed-out"), titles, "music")).toBe("Sign in to YouTube Music to save songs.")
    expect(text(failed("unconfirmed"), titles, "music")).toBe("Couldn't confirm “Get Lucky” was saved to Favourites. YouTube Music didn't answer.")
    expect(text(failed("refused"), titles, "music")).toBe("YouTube Music doesn't allow saving “Get Lucky” to playlists.")
    expect(text(failed("rate-limited"), titles, "music")).toBe("Couldn't save “Get Lucky”. YouTube Music is limiting requests, so try again in a minute.")
    expect(text(failed("unrecognised"), titles, "music")).toBe("Couldn't save “Get Lucky” to Favourites. Try YouTube Music's ⋮ menu.")
    expect(text(failed("missing"), titles, "music")).toBe("Couldn't save “Get Lucky”, because Favourites doesn't exist anymore.")
  })

  for (const site of ["www", "music"] as const) {
    test(`known not-sent reports keep the exact offline copy on ${site}`, () => {
      const outcomes = { [a]: { kind: "failed", failure: "not-sent" } } as const
      const titles = { video: "Song", playlists: names }
      expect(text({ kind: "quick-save", outcomes }, titles, site, false)).toBe("Couldn't save “Song” to Music. Check your connection.")
      expect(text({ kind: "auto-add", outcomes, shown: { tab: new Set(), session: new Set() } }, titles, site, false)).toBe("Couldn't auto-add “Song” to Music. Check your connection.")
    })
  }

  test("titles keep their own text and quotes", () => {
    expect(text(saved(c), { video: "\"Live\" at 'Wembley'", playlists: { [c]: "Watch later" } })).toBe("Saved “\"Live\" at 'Wembley'” to Watch later")
  })
})
