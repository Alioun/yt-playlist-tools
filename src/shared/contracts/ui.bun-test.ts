import { expect, test } from "bun:test"
import { uiContract } from "./ui"
import { firstRunContract } from "./first-run"
import { playlistUiContract } from "./ui-playlists"
import { pageContract } from "./ui-pages"

test("one composed UI catalogue preserves first-run entries by identity", () => {
  expect(Object.keys(uiContract).sort()).toEqual(["ui.accountInView", "ui.change", "ui.clearAll", "ui.create", "ui.device", "ui.exportSettings", "ui.filter",
    "ui.importSettings", "ui.noteAgree", "ui.noteSeen", "ui.pause", "ui.playingNow", "ui.playingSave", "ui.playlists", "ui.recentAdds", "ui.removeSetup",
    "ui.resolveChannel", "ui.status", "ui.syncedChoices", "ui.withdraw"])
  expect(uiContract["ui.status"]).toBe(pageContract["ui.status"])
  expect(uiContract["ui.change"]).toBe(firstRunContract["ui.change"])
  expect(uiContract["ui.syncedChoices"]).toBe(firstRunContract["ui.syncedChoices"])
  expect(uiContract["ui.playlists"]).toBe(playlistUiContract["ui.playlists"])
  expect(firstRunContract["ui.change"].payload({ change: { kind: "create", title: "Wrong handler" } })).toBe(false)
})
