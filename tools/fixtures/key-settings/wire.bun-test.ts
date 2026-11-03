import { expect, test } from "bun:test"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import { uiContract } from "../../../src/shared/contracts/ui"
import { keyForWire } from "../../../src/shared/contracts/key-settings-fields"
import { build } from "../tabs/harness"
import { world, chord, object, seed } from "./harness"

test("one catalogue authenticates private shared key/options/feature edits and retains first-run/account refusal", async () => {
  const w = world("wire", seed(), true)
  try {
    await w.owner.ready()
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
    expect(await w.assign({ kind: "undo" }, chord("z"))).toMatchObject({ kind: "confirmed" })
    expect(await w.backend.change({ kind: "theme", value: "dark" })).toMatchObject({ kind: "confirmed" })
    expect(await w.backend.change({ kind: "music-section", value: true })).toMatchObject({ kind: "confirmed" })
    const before = w.h.records()
    expect(await w.backend.change({ kind: "first-run-agree", displayedVersion: 1, attempt: 1, selected: [], syncOn: false })).toMatchObject({ kind: "not-agreed" })
    const answer = await w.network.connect(w.sender).send({
      v: CONTRACT_VERSION,
      build,
      id: "private-account",
      kind: "ui.change",
      payload: { windowId: 2, change: { kind: "setup-destination", acct: "AAAAAAAAAAAAAAAA", destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist: null } }
    })
    expect(answer).toBeUndefined()
    expect(w.h.records()).toEqual(before)
  } finally {
    await w.dispose()
  }
})

test("forged key targets, raw Origin, snapshots and fake Undo authority are rejected before effects", async () => {
  const w = world("wire")
  try {
    await w.owner.ready()
    const changes = [
      { kind: "key", target: { kind: "music" }, expected: null, key: chord("z"), confirmation: { kind: "none" } },
      { kind: "key", target: { kind: "picker", site: "music" }, expected: null, key: chord("z"), confirmation: { kind: "none" } },
      { kind: "key", target: { kind: "undo" }, expected: null, key: { ...chord("z"), injected: true }, confirmation: { kind: "none" } },
      { kind: "shortcut-undo", receipt: "fake", targets: { save01: "PL_private" } },
      { kind: "shortcut-remove", id: "save01", expected: { ...w.settings().shortcuts.list[0], account: "AAAAAAAAAAAAAAAA" } },
      { kind: "settings", value: w.settings() }
    ]
    const before = w.h.records()
    for (const [index, change] of changes.entries())
      await expect(w.network.connect(w.sender).send({ v: CONTRACT_VERSION, build, id: `forged-${index}`, kind: "ui.change", payload: { windowId: 1, change } })).rejects.toThrow("Memory send failed")
    await expect(
      w.network.connect(w.sender).send({
        v: CONTRACT_VERSION,
        build,
        id: "raw-origin",
        kind: "ui.change",
        payload: {
          windowId: 1,
          origin: { kind: "ui", windowId: 1, incognito: false },
          change: { kind: "shortcut-add" }
        }
      })
    ).rejects.toThrow("Memory send failed")
    expect(
      await w.network
        .connect({ ...w.sender, url: "https://www.youtube.com/watch?v=forged" })
        .send({ v: CONTRACT_VERSION, build, id: "wrong-native", kind: "ui.change", payload: { windowId: 1, change: { kind: "shortcut-add" } } })
    ).toBeUndefined()
    expect(w.h.records()).toEqual(before)
    expect(w.batches).toEqual([])
    expect(w.events).toEqual([])
  } finally {
    await w.dispose()
  }
})

test("a real removal receipt is bound to the native extension document and cannot authorize another caller", async () => {
  const w = world("wire")
  try {
    await w.owner.ready()
    const removed = await w.remove()
    if (removed.kind !== "removed") throw Error("Expected removal receipt")
    const before = w.h.records()
    const stolen = await w.network
      .connect({ ...w.sender, documentId: "keys-popup-b" })
      .send({ v: CONTRACT_VERSION, build, id: "stolen-undo", kind: "ui.change", payload: { windowId: 1, change: { kind: "shortcut-undo", receipt: removed.receipt } } })
    expect(object(stolen).result).toEqual({ kind: "key-setting", outcome: { kind: "refused", reason: "expired" } })
    expect(w.h.records()).toEqual(before)
    expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toMatchObject({ kind: "confirmed" })
  } finally {
    await w.dispose()
  }
})

test("native document identity is required for removal and obsolete feature wire names are absent", async () => {
  const w = world("wire")
  try {
    await w.owner.ready()
    const before = w.h.records()
    await expect(
      w.network.connect(w.sender).send({ v: CONTRACT_VERSION, build, id: "obsolete-feature", kind: "ui.featureSetting", payload: { windowId: 1, change: { kind: "music-section", value: true } } })
    ).rejects.toThrow("Memory send failed")
    const row = w.settings().shortcuts.list[0]
    if (!row) throw Error("Expected row")
    const sender = { id: w.sender.id, url: w.sender.url }
    const answer = await w.network.connect(sender).send({
      v: CONTRACT_VERSION,
      build,
      id: "missing-document",
      kind: "ui.change",
      payload: {
        windowId: 1,
        change: { kind: "shortcut-remove", id: row.id, expected: { id: row.id, key: keyForWire(row.key), label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount } }
      }
    })
    expect(object(answer).result).toEqual({ kind: "key-setting", outcome: { kind: "refused", reason: "unavailable" } })
    expect(w.h.records()).toEqual(before)
  } finally {
    await w.dispose()
  }
})
