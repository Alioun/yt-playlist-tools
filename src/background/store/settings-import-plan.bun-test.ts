import { expect, test } from "bun:test"
import { documentKey, defaultSettings, defaultSetup, parseDocumentKey, type DocumentKey } from "../../shared/model"
import { createImportPlanner } from "../../shared/settings-file"
import type { JsonObject } from "../../shared/contracts/json"
import { planSettingsImport, type SettingsImportPlan, type SettingsImportPlanResult } from "./settings-import-plan"
import { prepareDocumentBody } from "./write-preparation"
import { encodeSyncDocument, projectSyncWrite, SYNC_BUDGET_ITEMS } from "./sync-codec"
import { planSyncWrite } from "./sync-write-admission"
import {
  A, B, C, D, E, F, at, deviceId, channel, expectedPuts, expectedSettings, expectedSession, expectedTombstones, expectedSyncBatch, expectedDocumentOrder,
  fileData, freeze, fresh, json, object, old, parse, playlist, removedNames, scenario, stamp, syncInventory
} from "../../../tools/fixtures/settings-import-plan/specimens"

function planned(result: SettingsImportPlanResult): SettingsImportPlan {
  if (result.kind !== "planned") throw new Error(`Expected plan, received ${JSON.stringify(result)}`)
  return result
}
function puts(plan: SettingsImportPlan): JsonObject {
  return Object.fromEntries(plan.documents.changes.filter(change => change.kind === "put").map(change => [documentKey(change.key), change.document]))
}
function changedNames(plan: SettingsImportPlan): string[] { return plan.documents.changes.map(change => documentKey(change.key)).sort() }

test("one local batch replaces shared settings and all included account documents", () => {
  const input = freeze(scenario()), before = JSON.stringify(input)
  const result = planned(planSettingsImport(input))
  expect(puts(result)).toEqual(expectedPuts())
  expect(result.documents.changes.filter(change => change.kind === "remove").map(change => documentKey(change.key)).sort()).toEqual([...removedNames].sort())
  expect(changedNames(result)).toEqual([...Object.keys(expectedPuts()), ...removedNames].sort())
  expect(result.expected.session).toEqual(expectedSession())
  const expectedLocal = { ...input.local, ...expectedPuts(), lastAccount: null,
    sync: { ...object(input.local.sync), everEdited: true, editedSinceOff: true } }
  for (const key of [...removedNames, `cache:${B}`, `progress:${B}:0`, `progress:${B}:15`]) Reflect.deleteProperty(expectedLocal, key)
  expect(result.expected.local).toEqual(expectedLocal)
  expect(JSON.stringify(input)).toBe(before)
  expect(result.execution).toBe("requires-owner-continuation")
})

test("omitted kept and orphan filters cannot survive replacement", () => {
  const result = planned(planSettingsImport(scenario()))
  expect(Object.hasOwn(result.expected.local, `doc:filter:${A}:PL_kept`)).toBe(false)
  expect(Object.hasOwn(result.expected.local, `doc:filter:${A}:PL_orphan`)).toBe(false)
  expect(puts(result)[`doc:filter:${A}:PL_in`]).toEqual(expectedPuts()[`doc:filter:${A}:PL_in`])
})

test("empty accounts have exact cleanup even without a prior Setup", () => {
  const result = planned(planSettingsImport(scenario()))
  expect(result.cleanup.accounts).toEqual([B, D].map(acct => ({ acct, cacheKey: `cache:${acct}`,
    progressKeys: Array.from({ length: 16 }, (_, i) => `progress:${acct}:${i}`), clearAccountSession: true, clearLastAccountIfMatches: true })))
  expect(result.cleanup.lastAccount).toEqual({ kind: "clear", acct: B })
  expect(result.cleanup.sessionEffects).toEqual([
    { kind: "remove", key: { kind: "skips", acct: B } }, { kind: "remove", key: { kind: "cooldown", acct: B } },
    ...(["recent", "recentAdds", "shown", "breakage", "gather", "tabs"] as const).map(key => ({ kind: "set" as const, key, value: json(expectedSession()[key]) }))
  ])
  expect(Object.hasOwn(result.expected.local, `doc:setup:${D}`)).toBe(false)
  expect(result.expected.local[`doc:setup:${E}`]).toEqual(expectedPuts()[`doc:setup:${E}`])
  expect(result.expected.local[`doc:setup:${F}`]).toEqual(expectedPuts()[`doc:setup:${F}`])
})

test("absent account data stays byte identical", () => {
  const input = scenario(), result = planned(planSettingsImport(input))
  for (const name of [`doc:setup:${C}`, `doc:filter:${C}:PL_C`, `cache:${C}`, `progress:${C}:3`, "unclaimed", "outside"]) {
    expect(JSON.stringify(result.expected.local[name])).toBe(JSON.stringify(input.local[name]))
  }
  expect(result.documents.changes.some(change => change.key.kind !== "settings" && change.key.acct === C)).toBe(false)
  const newer = scenario()
  newer.local[`doc:setup:${C}`] = { v: 8, gen: "unrelated-newer", at: 1, by: "future", data: { opaque: true } }
  const newerResult = planned(planSettingsImport(newer))
  expect(newerResult.expected.local[`doc:setup:${C}`]).toEqual(newer.local[`doc:setup:${C}`])
})

test("already applied presets and imported keys survive without preset application", () => {
  const result = planned(planSettingsImport(scenario())), settings = object(object(puts(result)["doc:settings"]).data)
  expect(settings).toEqual(expectedSettings())
  expect(object(settings.shortcuts).preset).toBe(true)
  expect(object(settings.musicKeys).preset).toBe(true)
  expect(object(settings.musicActions).preset).toBe(true)
  expect(object(settings.shortcuts).list).toEqual(object(expectedSettings().shortcuts).list)
  expect(object(result.expected.local.device).syncOn).toBe(false)
  expect(object(result.expected.local.device).consent).toEqual({ v: 1, at: 7 })
})

test("unknown fields and future tuple slots survive actual normalization", () => {
  const input = scenario(), result = planned(planSettingsImport(input))
  expect(puts(result)).toEqual(expectedPuts())
  const normalized = prepareDocumentBody({ kind: "filter", data: { mode: "allow", on: true, channels: [[channel, "t".repeat(110), "h".repeat(35)]] } })
  expect(normalized).toEqual({ kind: "prepared", data: { mode: "allow", on: true, channels: [[channel, "t".repeat(100), "h".repeat(30)]] } })
  const data = fileData(), accounts = object(data.accounts), a = object(accounts[A]), filters = object(a.filters)
  filters.PL_in = { mode: "allow", on: true, channels: [[channel, "new"]] }
  const noHandle = planned(planSettingsImport({ ...input, parsed: parse(data) }))
  expect(object(object(puts(noHandle)[`doc:filter:${A}:PL_in`]).data).channels).toEqual([[channel, "new", null, "future-column"]])
})

test("newer and malformed addressed documents refuse the whole import", () => {
  for (const name of ["doc:settings", `doc:setup:${A}`, `doc:filter:${A}:PL_kept`, `doc:filter:${A}:PL_orphan`]) {
    const input = scenario()
    input.local[name] = { v: 2, gen: "newer", at: 1, by: "future", data: { opaque: true } }
    expect(planSettingsImport(input)).toEqual({ kind: "refused", reason: "update-needed" })
  }
  for (const raw of [null, false, { v: 1, gen: "broken", at: 0, by: "x", data: { mode: "invalid" } }]) {
    const input = scenario(); input.local[`doc:filter:${A}:PL_orphan`] = raw
    expect(planSettingsImport(input)).toEqual({ kind: "unavailable", reason: "inventory" })
  }
  const malformedName = scenario(); malformedName.local[`doc:filter:${A}:bad:tail`] = {}
  expect(planSettingsImport(malformedName)).toEqual({ kind: "unavailable", reason: "inventory" })
})

test("sync on admits one complete independently constructed batch including tombstones", () => {
  const input = scenario(true)
  if (input.sync.kind !== "on") throw new Error("Expected sync facts")
  const result = planned(planSettingsImport(input)), documents = { ...expectedPuts(), ...expectedTombstones() }
  expect(puts(result)).toEqual(documents)
  expect(result.documents.changes.every(change => change.kind === "put")).toBe(true)
  const [first, ...rest] = expectedSyncBatch()
  if (!first) throw new Error("Independent Settings batch member")
  expect(result.documents.changes.map(change => documentKey(change.key))).toEqual(expectedDocumentOrder)
  const admission = planSyncWrite({ local: input.local, sync: input.sync.records, intent: { kind: "changed-batch", documents: [first, ...rest] } })
  if (result.documents.sync.kind !== "on" || admission.kind !== "planned") throw new Error("Expected admitted complete batch")
  expect(result.documents.sync.admission).toEqual(admission)
  const expectedItems = Object.entries(documents).flatMap(([name, document]) => {
    const key = parseDocumentKey(name)
    if (!key) throw new Error("Invalid independent encoding address")
    const encoded = encodeSyncDocument({ key, document })
    if (encoded.kind !== "encoded") throw new Error("Expected encoding")
    return encoded.encoded.items
  })
  const projection = projectSyncWrite({ current: Object.entries(input.sync.records).map(([key, value]) => ({ key, value })), set: expectedItems })
  expect(projection.kind).toBe("fits")
  expect(result.documents.sync.admission.items.map(item => item.key).sort()).toEqual(expectedItems.map(item => item.key).sort())
  expect(result.documents.history).toEqual({ kind: "set", sync: { ...object(input.local.sync), everEdited: true } })
})

test("remote newer addressed documents and changed join facts do not create a batch", () => {
  const input = scenario(true)
  if (input.sync.kind !== "on") throw new Error("Expected sync facts")
  input.sync.records[`s:filter:${A}:PL_kept`] = { v: 3, gen: "remote-newer", at: 1, by: "future", data: {} }
  expect(planSettingsImport(input)).toEqual({ kind: "refused", reason: "update-needed" })
  const mismatch = scenario(true)
  if (mismatch.sync.kind !== "on") throw new Error("Expected sync facts")
  mismatch.sync.records["s:meta"] = { v: 1, id: "other-join", created: 1 }
  expect(planSettingsImport(mismatch)).toEqual({ kind: "unavailable", reason: "sync-facts" })
})

test("canonical pushed-history repairs remain separate from fresh outgoing generations", () => {
  const input = scenario(true), oldHistory = object(input.local.sync), originalPushed = json(oldHistory.pushed)
  input.local.sync = { ...oldHistory, pushed: {}, everEdited: true }
  const result = planned(planSettingsImport(input))
  expect(result.documents.history).toEqual({ kind: "set", sync: { ...oldHistory, pushed: originalPushed, everEdited: true } })
  expect(object(result.expected.local.sync).editedSinceOff).toBe(false)
})

test("per-account partitions each fit but whole import refuses with no document batch", () => {
  const base = scenario(true), settings = json(defaultSettings()), setup = json({ ...defaultSetup(), quickSave: "PL_after" })
  const local: JsonObject = { schema: 1, device: base.local.device ?? null, sync: { joined: "joined-copy", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false },
    "doc:settings": old("quota-settings", settings), [`doc:setup:${A}`]: old("quota-A", setup), [`doc:setup:${B}`]: old("quota-B", setup) }
  const remote = syncInventory(local)
  for (let i = 0, n = SYNC_BUDGET_ITEMS - Object.keys(remote).length - 1; i < n; i++) remote[`retained:${i}`] = 0
  const parsed = parse({ format: 1, product: "Perchling", version: "2.0.0", date: "2026-10-30", settings,
    accounts: { [A]: { setup, filters: { PL_new: { mode: "deny", on: false, channels: [] } } }, [B]: { setup, filters: { PL_new: { mode: "deny", on: false, channels: [] } } } } })
  for (const acct of [A, B]) {
    const admission = planSyncWrite({ local, sync: remote, intent: { kind: "changed-batch", documents: [
      { key: { kind: "settings" }, document: stamp("doc:settings", settings) },
      { key: { kind: "setup", acct }, document: stamp(`doc:setup:${acct}`, setup) },
      { key: { kind: "filter", acct, playlist: playlist("PL_new") }, document: stamp(`doc:filter:${acct}:PL_new`, { mode: "deny", on: false, channels: [] }) }
    ] } })
    expect(admission.kind).toBe("planned")
  }
  const result = planSettingsImport({ parsed, local, session: {}, sync: { kind: "on", records: remote }, at, generation: fresh })
  expect(result).toEqual({ kind: "refused", reason: "sync-full" })
  expect(Object.hasOwn(result, "documents")).toBe(false)
})

test("retained occupancy and unsupported sync history yield no partial result", () => {
  const input = scenario(true)
  if (input.sync.kind !== "on") throw new Error("Expected sync facts")
  input.sync.records["retained:too-large"] = "x".repeat(8192)
  expect(planSettingsImport(input)).toEqual({ kind: "refused", reason: "sync-full" })
  for (const history of [null, {}, { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: false }]) {
    const off = scenario(); off.local.sync = json(history)
    expect(planSettingsImport(off)).toEqual({ kind: "unavailable", reason: "history" })
  }
  const noHistory = scenario(); delete noHistory.local.sync
  expect(planned(planSettingsImport(noHistory)).documents.history).toEqual({ kind: "set", sync: { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true } })
  const session = scenario(); session.session.tabs = { bad: true }
  expect(planSettingsImport(session)).toEqual({ kind: "unavailable", reason: "session" })
})

test("matching imported values still produce fresh generations", () => {
  const input = scenario()
  const oldSettings = object(expectedSettings())
  input.local["doc:settings"] = old("equal-old-generation", oldSettings)
  const result = planned(planSettingsImport(input)), settings = object(puts(result)["doc:settings"])
  expect(settings.data).toEqual(oldSettings)
  expect(settings.gen).toBe("fresh:doc:settings")
  expect(settings.at).toBe(at)
  expect(settings.by).toBe(deviceId)
  expect(planSettingsImport({ ...input, generation: () => "equal-old-generation" })).toEqual({ kind: "unavailable", reason: "stamp" })
  expect(planSettingsImport({ ...input, generation: () => "duplicated-generation" })).toEqual({ kind: "unavailable", reason: "stamp" })
})

test("capture detaches exact local session consent and join identities", () => {
  const input = scenario(true), result = planned(planSettingsImport(input))
  expect(result.capture.local).toEqual(input.local)
  expect(result.capture.session).toEqual(input.session)
  expect(result.capture.binding).toEqual({ deviceId, consent: { v: 1, at: 7 }, consentControl: null, joined: "joined-copy" })
  input.local[`doc:filter:${A}:PL_added_after_capture`] = old("late", { mode: "deny", on: false, channels: [] })
  input.session.outside = false
  if (input.sync.kind !== "on" || result.capture.sync.kind !== "on") throw new Error("Expected sync capture")
  input.sync.records.lateOccupancy = "late"
  expect(Object.hasOwn(result.capture.local, `doc:filter:${A}:PL_added_after_capture`)).toBe(false)
  expect(result.capture.session.outside).toEqual({ keep: true })
  expect(Object.hasOwn(result.capture.sync.records, "lateOccupancy")).toBe(false)
  const off = scenario(); off.local.lastAccount = C
  expect(planned(planSettingsImport(off)).cleanup.lastAccount).toEqual({ kind: "unchanged" })
})

test("file validation and consent remain separate from pure planning", () => {
  const raw = fileData(); object(raw.settings).consent = { v: 1, at: 1 }
  expect(createImportPlanner("normal").importFile(JSON.stringify(raw)).kind).toBe("refused")
  const newer = fileData(); newer.format = 2
  expect(createImportPlanner("normal").importFile(JSON.stringify(newer))).toEqual({ kind: "refused", reason: "newer-format", copy: "DATA-55.newer-format" })
  expect(createImportPlanner("private").importFile(JSON.stringify(fileData())).kind).toBe("refused")
  const input = scenario(); object(input.local.device).consent = null
  const result = planned(planSettingsImport(input))
  expect(result.capture.binding.consent).toBe(null)
  expect(object(result.expected.local.device).consent).toBe(null)
  expect(result.execution).toBe("requires-owner-continuation")
})

test("successive removed accounts share one final cleanup snapshot", () => {
  const input = scenario()
  input.session[`cooldown:${D}`] = 44
  for (const name of ["shown", "breakage", "gather"]) object(object(input.session[name]).accounts)[D] = { remove: true }
  const result = planned(planSettingsImport(input))
  expect(result.expected.session).toEqual(expectedSession())
  expect(result.cleanup.sessionEffects.filter(effect => effect.kind === "remove" && effect.key.acct === D)).toEqual([{ kind: "remove", key: { kind: "cooldown", acct: D } }])
  expect(result.cleanup.sessionEffects.filter(effect => effect.kind === "set" && effect.key === "gather")).toHaveLength(2)
})

test("an empty imported account removes orphan documents even without a current Setup", () => {
  const input = scenario(); delete input.local[`doc:setup:${B}`]
  const result = planned(planSettingsImport(input))
  expect(Object.hasOwn(result.expected.local, `doc:filter:${B}:PL_B_keep`)).toBe(false)
  expect(Object.hasOwn(result.expected.local, `cache:${B}`)).toBe(false)
  expect(result.cleanup.accounts.map(cleanup => cleanup.acct)).toEqual([B, D])
})

test("Settings alone is a nonempty fresh batch and preserves all absent accounts", () => {
  const input = scenario(), data = fileData(); data.accounts = {}
  const result = planned(planSettingsImport({ ...input, parsed: parse(data) }))
  expect(result.documents.changes).toHaveLength(1)
  expect(result.cleanup.accounts).toEqual([])
  for (const [name, value] of Object.entries(input.local)) if (name !== "doc:settings" && name !== "sync") expect(result.expected.local[name]).toEqual(value)
})

test("recognized consent generation is captured without granting execution", () => {
  const input = scenario()
  input.local["consent:state"] = { v: 1, kind: "consent-state", deviceId, generation: 4, lastAgreementAt: 7,
    legacyBasis: { kind: "observed", agreement: { v: 1, at: 7 } }, state: { kind: "agreed", current: { v: 1, at: 7 }, prior: null } }
  const result = planned(planSettingsImport(input))
  if (result.capture.binding.consentControl === null) throw Error("Expected captured consent control")
  expect(input.local["consent:state"]).toEqual(result.capture.binding.consentControl)
  expect(result.expected.local["consent:state"]).toEqual(input.local["consent:state"])
  expect(result.execution).toBe("requires-owner-continuation")
})

test("retained old chunks stay charged beside the actual new generation", () => {
  const input = scenario(true), name = `doc:filter:${A}:PL_in`, raw = object(input.local[name])
  object(raw.data).future = "f".repeat(18000)
  const remote = syncInventory(input.local)
  const result = planned(planSettingsImport({ ...input, sync: { kind: "on", records: remote } }))
  if (result.documents.sync.kind !== "on") throw new Error("Expected sync admission")
  const oldChunks = Object.keys(remote).filter(key => key.includes("@A-in-old."))
  expect(oldChunks.length).toBeGreaterThan(1)
  expect(result.documents.sync.admission.items.some(item => item.key.includes(`@fresh:${name}.`))).toBe(true)
  const projection = projectSyncWrite({ current: Object.entries(remote).map(([key, value]) => ({ key, value })), set: result.documents.sync.admission.items })
  if (projection.kind !== "fits") throw new Error("Expected constructed occupancy to fit")
  expect(projection.usage.items).toBe(new Set([...Object.keys(remote), ...result.documents.sync.admission.items.map(item => item.key)]).size)
  for (const key of oldChunks) expect(projection.usage.perItem.some(item => item.key === key)).toBe(true)
})
