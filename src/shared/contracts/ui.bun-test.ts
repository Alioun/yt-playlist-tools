import { expect, test } from "bun:test"
import { uiContract } from "./ui"
import { firstRunContract } from "./first-run"
import { playlistUiContract } from "./ui-playlists"
import { pageContract } from "./ui-pages"

test("one composed UI catalogue preserves first-run entries by identity", () => {
  expect(Object.keys(uiContract).sort()).toEqual([
    "ui.accountInView",
    "ui.add",
    "ui.addUndo",
    "ui.change",
    "ui.claimSeen",
    "ui.clearAll",
    "ui.create",
    "ui.device",
    "ui.diagnostics",
    "ui.discardUnclaimed",
    "ui.exportSettings",
    "ui.filter",
    "ui.filterChannel",
    "ui.gather",
    "ui.gatherUndo",
    "ui.gathers",
    "ui.heldAgree",
    "ui.importSettings",
    "ui.membership",
    "ui.noteAgree",
    "ui.noteSeen",
    "ui.pause",
    "ui.pausedWork",
    "ui.playingNow",
    "ui.playlists",
    "ui.recentAdds",
    "ui.remove",
    "ui.removeKeptFilters",
    "ui.removeSetup",
    "ui.resolveChannel",
    "ui.skip",
    "ui.status",
    "ui.sync",
    "ui.syncedChoices",
    "ui.thisTab",
    "ui.withdraw"
  ])
  expect(uiContract["ui.status"]).toBe(pageContract["ui.status"])
  expect(uiContract["ui.change"]).toBe(firstRunContract["ui.change"])
  expect(uiContract["ui.syncedChoices"]).toBe(firstRunContract["ui.syncedChoices"])
  expect(uiContract["ui.playlists"]).toBe(playlistUiContract["ui.playlists"])
  expect(firstRunContract["ui.change"].payload({ change: { kind: "create", title: "Wrong handler" } })).toBe(false)
})

test("held Agree reports whether features run as a boolean and rejects missing or invalid activation results", () => {
  const accepts = uiContract["ui.heldAgree"].result
  expect(accepts({ kind: "held", paused: 2 })).toBe(true)
  for (const features of [true, false]) expect(accepts({ kind: "agreed", paused: 2, features })).toBe(true)
  for (const features of [undefined, null, "on", "held", 0, 1]) expect(accepts({ kind: "agreed", paused: 2, features })).toBe(false)
  expect(accepts({ kind: "agreed", paused: -1, features: true })).toBe(false)
  expect(accepts({ kind: "agreed", paused: 0.5, features: false })).toBe(false)
})
