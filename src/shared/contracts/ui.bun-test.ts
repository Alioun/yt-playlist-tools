import { expect, test } from "bun:test"
import { uiContract } from "./ui"
import { firstRunContract } from "./first-run"
import { playlistUiContract } from "./ui-playlists"
import { pageContract } from "./ui-pages"

test("one composed UI catalogue preserves first-run entries by identity", () => {
  expect(Object.keys(uiContract).sort()).toEqual(["ui.accountInView", "ui.change", "ui.clearAll", "ui.create", "ui.playingNow", "ui.playlists", "ui.resolveChannel", "ui.syncedChoices"])
  expect(uiContract["ui.change"]).toBe(firstRunContract["ui.change"])
  expect(uiContract["ui.syncedChoices"]).toBe(firstRunContract["ui.syncedChoices"])
  expect(uiContract["ui.playlists"]).toBe(playlistUiContract["ui.playlists"])
  expect(firstRunContract["ui.change"].payload({ change: { kind: "create", title: "Wrong handler" } })).toBe(false)
})
