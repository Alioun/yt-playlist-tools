import { expect, test } from "bun:test"
import { StartupReadinessError } from "./local-filter-writer"
import { exportFile } from "../../shared/settings-file"
import { isRecord } from "../../shared/model/codec"
import { defaultSettings, defaultSetup } from "../../shared/model"
import { harness, seed, gate, normal, privateWindow, accountA, accountB, accountC, kept, orphan, selected, document, stamp } from "../../../tools/fixtures/settings-file-owner/harness"

for (const origin of [normal, privateWindow]) test(`actual starting owner exports before consent in ${origin.incognito ? "private" : "normal"} window`, async () => {
  const h = harness(); await h.ready()
  const before = structuredClone(h.records)
  const read = await h.owner.exportSettings(origin)
  expect(h.calls).toEqual([{ get: null }, { get: null }])
  expect(h.records).toEqual(before)
  if (read.kind !== "source") throw Error("missing-owner-source")
  expect(read.source).toEqual({ kind: "settings-file-source",
    settings: { kind: "value", document: { ...stamp, data: defaultSettings() } },
    accounts: [
      { account: accountA, setup: { kind: "value", document: { ...stamp, data: { ...defaultSetup(), autoAdd: [{ pl: selected, takes: "videos" }] } } },
        filters: [
          { playlist: kept, document: { kind: "value", document: document({ mode: "allow", on: false, channels: [] }) } },
          { playlist: selected, document: { kind: "value", document: document({ mode: "deny", on: true, channels: [] }) } }
        ] },
      { account: accountB, setup: { kind: "value", document: document({ ...defaultSetup(), label: { name: "Second account" } }) }, filters: [] },
      { account: accountC, setup: { kind: "absent" }, filters: [
        { playlist: orphan, document: { kind: "value", document: document({ mode: "deny", on: false, channels: [["UC1234567890123456789012", "Orphan channel"]] }) } }
      ] }
    ] })
  const file = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (file.kind !== "exported") throw Error("missing-file")
  h.calls.length = 0
  if (origin.incognito) {
    expect(await h.owner.importCheck(origin, file.file.text)).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
  } else {
    const checked = await h.owner.importCheck(origin, file.file.text)
    expect(checked.kind === "import-plan" && checked.accountCount).toBe(3)
  }
  expect(h.calls).toEqual(origin.incognito ? [] : [{ get: null }, { get: null }])
  expect(h.records).toEqual(before)
  await h.owner.dispose()
})

test("new profile with no canonical settings exports defaults without any read-triggered write", async () => {
  const h = harness({ schema: 1 }); await h.ready()
  const read = await h.owner.exportSettings(privateWindow)
  if (read.kind !== "source") throw Error("missing-source")
  const file = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (file.kind !== "exported") throw Error("missing-file")
  expect(JSON.parse(file.file.text)).toEqual({ format: 1, product: "Perchling", version: "2.0.0", date: "2026-10-30", settings: defaultSettings(), accounts: {} })
  expect(h.calls).toEqual([{ get: null }, { get: null }])
  expect(h.records).toEqual({ schema: 1 })
  await h.owner.dispose()
})

test("private checking and malformed origin refuse without parsing, storage, or allocation", async () => {
  const h = harness(); await h.ready()
  const poison = { toString() { throw Error("parsed-private-input") } }
  expect(await h.owner.importCheck(privateWindow, poison)).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
  expect(await Reflect.apply(h.owner.importCheck, h.owner, [{ kind: "ui", windowId: 7 }, poison])).toEqual({ kind: "refused", reason: "privacy-unavailable", copy: "DATA-54.private" })
  expect(await Reflect.apply(h.owner.exportSettings, h.owner, [null])).toEqual({ kind: "unavailable", reason: "origin" })
  expect(h.calls).toEqual([])
  await h.owner.dispose()
})

test("valid consent-held startup permits read-only export but not unresolved recovery", async () => {
  const records = seed()
  records["consent:state"] = { v: 1, kind: "consent-state", deviceId: "synthetic-device", generation: 1,
    lastAgreementAt: 1, legacyBasis: { kind: "not-observed" }, state: { kind: "withdrawn", prior: { v: 1, at: 1 } } }
  const h = harness(records)
  await expect(h.owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  h.calls.length = 0
  expect((await h.owner.exportSettings(privateWindow)).kind).toBe("source")
  expect(h.calls).toEqual([{ get: null }, { get: null }])
  h.records["consent:jobs"] = { v: 99 }
  h.calls.length = 0
  expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "pending-recovery" })
  expect(h.calls).toEqual([{ get: null }])
  expect(h.records).toEqual({ ...records, "consent:jobs": { v: 99 } })
  await h.owner.dispose()
})

for (const marker of ["pending:account-removal", "pending:sync-join", "interimConversion"]) test(`read never resumes ${marker}`, async () => {
  const h = harness(); await h.ready()
  h.records[marker] = { v: 99 }
  const before = structuredClone(h.records)
  expect((await h.owner.exportSettings(normal)).kind).toBe("unavailable")
  expect(h.calls).toEqual([{ get: null }])
  expect(h.records).toEqual(before)
  await h.owner.dispose()
})

test("newer layouts and failed startup refuse without a fallback to raw startup storage", async () => {
  const h = harness({ schema: 2 }); expect(await h.owner.ready()).toBe("newer-layout")
  h.calls.length = 0
  expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "newer-layout" })
  expect(h.calls).toEqual([])
  await h.owner.dispose()
  const failed = harness({ schema: 0 })
  await expect(failed.owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  failed.calls.length = 0
  expect(await failed.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "startup" })
  expect(failed.calls).toEqual([])
  await failed.owner.dispose()
})

test("a lifecycle change during a read cannot expose a stale source", async () => {
  const h = harness(); await h.ready()
  const pause = gate(); h.hooks.read = pause.wait
  const reading = h.owner.exportSettings(normal)
  await pause.entered
  const checking = h.owner.importCheck(normal, "{}")
  const disposing = h.owner.dispose()
  pause.release()
  expect(await reading).toEqual({ kind: "unavailable", reason: "disposed" })
  expect(await checking).toEqual({ kind: "unavailable", reason: "disposed" })
  await disposing
  expect(h.calls).toEqual([{ get: null }])
  h.calls.length = 0
  expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "disposed" })
  expect(await h.owner.importCheck(normal, "{}")).toEqual({ kind: "unavailable", reason: "disposed" })
  expect(h.calls).toEqual([])
})

test("external changes between complete reads refuse instead of returning the first snapshot", async () => {
  const h = harness(); await h.ready()
  let calls = 0
  h.hooks.read = async () => { if (++calls === 2) h.records[`doc:filter:${accountA}:${kept}`] = document({ mode: "deny", on: true, channels: [] }) }
  expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.calls).toEqual([{ get: null }, { get: null }])
  await h.owner.dispose()
})

test("the serialized owner lane holds concurrent settings reads and import checking behind export", async () => {
  const h = harness(); await h.ready()
  const pause = gate(); let reads = 0
  h.hooks.read = async () => { if (++reads === 1) await pause.wait() }
  const first = h.owner.exportSettings(normal)
  await pause.entered
  const settings = h.owner.read("settings"), checking = h.owner.importCheck(normal, "{}"), second = h.owner.exportSettings(privateWindow)
  expect(h.calls).toEqual([{ get: null }])
  pause.release()
  expect((await first).kind).toBe("source")
  expect((await settings).kind).toBe("value")
  expect(await checking).toEqual({ kind: "refused", reason: "invalid-file", copy: "DATA-55.invalid-file" })
  expect((await second).kind).toBe("source")
  expect(h.calls).toEqual([{ get: null }, { get: null }, { get: null }, { get: null }, { get: null }])
  await h.owner.dispose()
})

test("returned sources are detached from both storage and future reads", async () => {
  const h = harness(); await h.ready()
  const first = await h.owner.exportSettings(normal)
  if (first.kind !== "source" || first.source.settings.kind !== "value") throw Error("missing-settings")
  first.source.settings.document.data.autoAdd.on = true
  const filter = first.source.accounts[0]?.filters[0]?.document
  if (filter?.kind === "value") filter.document.data.channels.push(["UC1234567890123456789012", "Mutation"])
  const next = await h.owner.exportSettings(normal)
  expect(next).not.toEqual(first)
  expect(h.records).toEqual(seed())
  await h.owner.dispose()
})

test("read errors return fixed failures without exception values", async () => {
  const h = harness(); await h.ready()
  h.hooks.read = async () => { throw Error("PRIVATE-error") }
  expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "read-failed" })
  expect(h.calls).toEqual([{ get: null }])
  await h.owner.dispose()
})

for (const name of ["doc:settings", `doc:setup:${accountA}`, `doc:filter:${accountA}:${kept}`, `doc:filter:${accountC}:${orphan}`]) {
  test(`actual owner refuses changed unsupported and invalid canonical documents ${name}`, async () => {
    const h = harness(); await h.ready()
    h.records[name] = { ...stamp, v: 2, deleted: true }
    expect(await h.owner.exportSettings(normal)).toEqual({ kind: "unavailable", reason: "unsupported-document" })
    expect(h.calls).toEqual([{ get: null }])
    h.calls.length = 0
    h.records[name] = { ...stamp, data: false }
    expect(await h.owner.exportSettings(privateWindow)).toEqual({ kind: "unavailable", reason: "invalid-document" })
    expect(h.calls).toEqual([{ get: null }])
    await h.owner.dispose()
  })
}

test("an export queued behind a real Settings write reads the committed generation", async () => {
  const records = seed()
  records.device = { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false }
  delete records.sync
  const h = harness(records); await h.ready()
  h.hooks.allocate = true
  const pause = gate(); h.hooks.set = pause.wait
  const writing = h.owner.changeSharedSetting(normal, { kind: "theme", value: "dark" })
  await pause.entered
  const before = cloneCalls(h.calls)
  const reading = h.owner.exportSettings(privateWindow), checking = h.owner.importCheck(normal, "{}")
  expect(h.calls).toEqual(before)
  pause.release()
  expect(await writing).toEqual({ kind: "committed" })
  const read = await reading
  if (read.kind !== "source" || read.source.settings.kind !== "value") throw Error("missing-postwrite-source")
  expect(read.source.settings.document.gen).toBe("fresh-generation")
  expect(read.source.settings.document.data.theme).toBe("dark")
  expect(await checking).toEqual({ kind: "refused", reason: "invalid-file", copy: "DATA-55.invalid-file" })
  const postSet = h.calls.findIndex(call => typeof call === "object" && call !== null && "set" in call)
  expect(postSet).toBe(4)
  expect(h.calls.slice(postSet + 1)).toEqual([{ get: null }, "clock.now", { get: null }, { get: null }])
  expect(h.calls.filter(call => call === "generation")).toHaveLength(1)
  expect(h.calls.filter(call => call === "now")).toHaveLength(1)
  await h.owner.dispose()
})
function cloneCalls(calls: unknown[]) { return structuredClone(calls) }

test("owner checking preserves exact fixed refusals and creates no account Setup", async () => {
  const h = harness(); await h.ready()
  const before = structuredClone(h.records)
  const read = await h.owner.exportSettings(normal)
  if (read.kind !== "source") throw Error("missing-source")
  const file = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (file.kind !== "exported") throw Error("missing-file")
  const raw: unknown = JSON.parse(file.file.text)
  if (!isRecord(raw)) throw Error("missing-file-object")
  h.calls.length = 0
  expect(await h.owner.importCheck(normal, JSON.stringify({ ...raw, format: 2 }))).toEqual({ kind: "refused", reason: "newer-format", copy: "DATA-55.newer-format" })
  expect(await h.owner.importCheck(normal, JSON.stringify({ ...raw, privacy: "normal" }))).toEqual({ kind: "refused", reason: "invalid-file", copy: "DATA-55.invalid-file" })
  expect(await h.owner.importCheck(privateWindow, JSON.stringify({ ...raw, privacy: "normal" }))).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
  const checked = await h.owner.importCheck(normal, file.file.text)
  expect(checked.kind === "import-plan" && checked.accountCount).toBe(3)
  expect(Object.hasOwn(h.records, `doc:setup:${accountC}`)).toBe(false)
  expect(h.records).toEqual(before)
  expect(h.calls).toEqual([{ get: null }, { get: null }])
  await h.owner.dispose()
})
