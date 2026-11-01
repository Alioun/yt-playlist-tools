import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { expect, test } from "bun:test"
import { musicHintText, wwwHintText } from "./hints"

const i18n = englishI18n()

test("YouTube Music hints name the action and the kind of item", () => {
  const unsupported = (reason: "queue-only" | "autoplay" | "songs-only" | "action-unavailable", action: "like" | "next" | "save", kind: "album" | "artist" | "other") =>
    musicHintText({ kind: "unsupported-item", reason, action, item: { kind } }, i18n)
  expect(unsupported("action-unavailable", "like", "album")).toBe("Like isn't available for albums.")
  expect(unsupported("action-unavailable", "next", "artist")).toBe("Play next isn't available for artists.")
  expect(unsupported("action-unavailable", "next", "other")).toBe("Play next isn't available for this item.")
  expect(unsupported("songs-only", "save", "album")).toBe("Only songs can be saved to playlists.")
  expect(unsupported("autoplay", "next", "other")).toBe("Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy.")
  expect(musicHintText({ kind: "no-queue-target" }, i18n)).toBe("Point at a song in the queue to remove it.")
  expect(musicHintText({ kind: "nothing-playing" }, i18n)).toBe("Nothing is playing")
  expect(musicHintText({ kind: "ad-playing" }, i18n)).toBe("An ad is playing")
  expect(musicHintText({ kind: "casting" }, i18n)).toBe("Not available while casting")
})

test("YouTube and YouTube Music share the unrecognised-item answer", () => {
  const text = "Couldn't tell which item you meant. Point at it again, or use the player."
  expect(musicHintText({ kind: "unrecognised-item" }, i18n)).toBe(text)
  expect(wwwHintText({ kind: "unrecognised-item" }, i18n)).toBe(text)
})

test("YouTube hints answer a key with nothing to save", () => {
  expect(wwwHintText({ kind: "no-pointed-item" }, i18n)).toBe("Point at a video to save it.")
  for (const reason of ["playlist", "mix", "channel", "post"] as const)
    expect(wwwHintText({ kind: "unsupported-item", reason }, i18n)).toBe("Only videos can be saved to playlists.")
  expect(wwwHintText({ kind: "unsupported-item", reason: "ad" }, i18n)).toBe("Ads can't be saved.")
})
