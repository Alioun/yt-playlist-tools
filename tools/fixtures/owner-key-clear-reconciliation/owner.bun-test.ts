import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { clearFixture, sharedSync, settingsOrigin, check, copy } from "../clear-all/harness"
import { seed, object, shortcut } from "../key-settings/harness"
import { keyForWire } from "../../../src/shared/contracts/key-settings-fields"
import { keySettingsProgressKey } from "../../../src/background/store/key-settings-progress"
import { featureProgressKey } from "../../../src/background/store/feature-settings-progress"
import { receivedResetKey } from "../../../src/background/store/sync-reset-receive"
import { classifyConsentWork } from "../../../src/background/store/consent-recovery"
import { uiContract } from "../../../src/shared/contracts/ui"
import { decodeSettings } from "../../../src/shared/model"
import { messagePlaceholders } from "../../../src/shared/i18n/parameters"
import type { JsonObject } from "../../../src/shared/contracts/json"

if (settingsOrigin.kind !== "ui") throw Error("Expected the settings page UI origin")
const origin = settingsOrigin.origin
const principal = "reconciliation-settings-document"
const account = "AAAAAAAAAAAAAAAA"
const remoteReset = () => sharedSync({ "s:meta": { v: 1, reset: true, id: "reset", created: 1 } })

function keySeed(syncOn: boolean, untargeted = false): JsonObject {
  const initial = seed()
  object(initial.device).syncOn = syncOn
  if (syncOn) Object.assign(object(initial.sync), { joined: "history", status: "ok" })
  if (untargeted) delete object(object(object(initial[`doc:setup:${account}`]).data).targets).save01
  return initial
}

async function removeSaveRow(h: ReturnType<typeof clearFixture>) {
  await h.lifecycle().ready()
  const owner = h.lifecycle().owner(); check(owner, "real owner for key edit")
  await owner.ready()
  const row = decodeSettings(object(h.records()["doc:settings"]).data).shortcuts.list.find(row => row.id === "save01")
  check(row, "seeded shortcut row")
  const removed = await owner.changeKeySetting(origin, { kind: "shortcut-remove", id: shortcut("save01"),
    expected: { id: row.id, key: keyForWire(row.key), label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount } }, principal)
  check(removed.kind === "removed", "shortcut removal issues a six-second Undo receipt")
  return { owner, receipt: removed.receipt }
}

test("received reset revokes six-second shortcut Undo even without account targets", async () => {
  const shared = sharedSync(), h = clearFixture(keySeed(true, true), shared)
  try {
    const { owner, receipt } = await removeSaveRow(h)
    shared.replace(remoteReset().records())
    expect((await owner.receiveSyncReset()).kind, "remote reset completes").toBe("reset-received")
    const after = h.records()
    expect(Object.keys(after).filter(name => /^(doc:setup|doc:filter|cache:|progress:)/.test(name) && name.includes(account)), "reset erased the account's setup, filters, cache and shards").toEqual([])
    expect(await owner.changeKeySetting(origin, { kind: "shortcut-undo", receipt }, principal), "old Undo cannot restore pre-reset rows").toEqual({ kind: "refused", reason: "expired" })
    expect(h.records(), "refused Undo leaves the reset result").toEqual(after)
  } finally { await h.dispose() }
})

test("local Clear all ends old Undo and caller authority with the drained owner", async () => {
  const h = clearFixture(keySeed(false))
  try {
    const { owner, receipt } = await removeSaveRow(h)
    expect((await h.clear({ alsoSynced: false })).kind, "unticked clear completes").toBe("cleared")
    expect((await owner.changeKeySetting(origin, { kind: "shortcut-undo", receipt }, principal)).kind, "old owner cannot honour Undo after clear").toBe("refused")
    const fresh = h.lifecycle().owner(); check(fresh, "fresh owner after clear")
    await fresh.ready()
    expect(await fresh.changeKeySetting(origin, { kind: "shortcut-undo", receipt }, principal), "new owner never inherits Undo").toEqual({ kind: "refused", reason: "expired" })
    expect(Object.hasOwn(h.records(), keySettingsProgressKey), "key progress erased by clear").toBe(false)
  } finally { await h.dispose() }
})

for (const [name, key] of [["key", keySettingsProgressKey], ["feature", featureProgressKey]] as const)
  test(`pending ${name} progress holds remote reset before any marker or erasure`, async () => {
    const initial = keySeed(true)
    initial[key] = { v: 1, kind: `${name}-settings-progress`, state: "accepted" }
    const h = clearFixture(initial, remoteReset())
    try {
      const before = h.records()
      await h.lifecycle().ready().catch(() => undefined)
      const owner = h.lifecycle().owner(); check(owner, "held owner remains inspectable")
      expect((await owner.receiveSyncReset()).kind, "pending local operation holds reset").toBe("reset-held")
      expect(h.records(), "no reset marker and no erasure over pending progress").toEqual(before)
    } finally { await h.dispose() }
  })

test("an unreadable reset marker remains recognized held work", () => {
  const records = keySeed(true)
  records[receivedResetKey] = { v: 1, kind: "received-reset", phase: "session" }
  expect(classifyConsentWork(records), "lost reset operation stays recognized").toContainEqual(
    { kind: "unsupported", operation: "control", reason: "invalid", inspection: { key: receivedResetKey } })
})

test("renewed agreement with later key progress cannot continue the old reset", async () => {
  const h = clearFixture(keySeed(true), remoteReset())
  try {
    await h.lifecycle().ready(); const owner = h.lifecycle().owner(); check(owner, "receiving owner"); await owner.ready()
    h.fault.set("local.remove", "before")
    expect((await owner.receiveSyncReset()).kind, "interrupted reception holds before success").toBe("reset-held")
    check(h.records()[receivedResetKey], "admitted receive marker retained")
    h.h.mutate(records => {
      object(records.device).consent = { v: 1, at: 2 }
      records[keySettingsProgressKey] = copy({ v: 1, kind: "key-settings-progress", state: "accepted" })
    })
    const before = h.records()
    await h.restart().catch(() => undefined)
    const next = h.lifecycle().owner(); check(next, "held owner remains inspectable")
    expect((await next.receiveSyncReset()).kind, "renewed agreement does not replay old cleanup").toBe("reset-held")
    expect(h.records(), "no replay write").toEqual(before)
  } finally { await h.dispose() }
})

test("single catalogue carries ui.clearAll and ui.change without a parallel feature route", () => {
  expect(Object.keys(uiContract).sort()).toEqual(["ui.accountInView", "ui.add", "ui.addUndo", "ui.change", "ui.claimSeen", "ui.clearAll", "ui.create", "ui.device", "ui.diagnostics",
    "ui.discardUnclaimed", "ui.exportSettings", "ui.filter", "ui.filterChannel", "ui.gather", "ui.gatherUndo", "ui.gathers", "ui.importSettings", "ui.membership",
    "ui.noteAgree", "ui.noteSeen", "ui.pause", "ui.pausedWork", "ui.playingNow", "ui.playlists", "ui.recentAdds", "ui.remove", "ui.removeKeptFilters",
    "ui.removeSetup", "ui.resolveChannel", "ui.skip", "ui.status", "ui.syncedChoices", "ui.thisTab", "ui.withdraw"])
  expect(Object.keys(uiContract).some(kind => kind.startsWith("ui.feature"))).toBe(false)
})

test("toaster and notice copy is localized with exact parameters", () => {
  const messages = JSON.parse(readFileSync(new URL("../../../src/public/_locales/en/messages.json", import.meta.url), "utf8")) as Record<string, { message: string; placeholders?: Record<string, unknown> }>
  const added = ["toast_action_undo", "toast_action_try_again", "toast_action_settings", "toast_action_choose", "toast_action_sign_in", "toast_action_reload",
    "toast_nothingToUndo", "toast_details", "toast_dismiss", "notice_www_one", "notice_www_other", "notice_watch", "notice_music_one", "notice_music_other",
    "notice_feature_auto_add", "notice_feature_shortcuts", "notice_feature_quick_save", "notice_feature_queue_button", "notice_feature_watch_button",
    "notice_feature_card_menu", "notice_feature_gather", "notice_feature_music_actions", "notice_feature_music_keys"] as const
  for (const key of added) {
    expect(Object.hasOwn(messages, key), `${key} localized`).toBe(true)
    const names: readonly string[] = messagePlaceholders[key] ?? []
    expect(Object.keys(messages[key]?.placeholders ?? {}).sort(), `${key} placeholders`).toEqual([...names].sort())
  }
  const parameterized = Object.keys(messages).filter(key => Object.keys(messages[key]?.placeholders ?? {}).length)
  expect(parameterized.sort(), "every message with placeholders names them").toEqual(Object.keys(messagePlaceholders).sort())
})
