import { expect, test } from "bun:test"
import { parseConsentJobs } from "../../../src/background/store/consent-recovery"
import { readSettingsImport } from "../../../src/background/store/settings-import-persistence"
import { defaultSettings, defaultSetup } from "../../../src/shared/model"
import { SYNC_BUDGET_ITEMS } from "../../../src/background/store/sync-codec"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { old, syncInventory } from "../settings-import-plan/specimens"
import { world, ui, initial, payload, fileText, object, A, B, C, settingsImportKey, type Fault } from "./harness"

test("private, pre-consent, invalid and stale input cause no mutation", async () => {
  for (const mode of ["private", "pre-consent", "invalid", "stale", "forged", "unconfirmed"] as const) {
    const seed = initial(), h = world(false, seed)
    try {
      if (mode === "private") expect(await h.owner.prepareSettingsImport({ ...ui, incognito: true }, fileText())).toEqual({ kind: "refused", reason: "private" })
      else if (mode === "pre-consent") {
        h.withdraw()
        expect((await h.owner.prepareSettingsImport(ui, fileText())).kind).toBe("refused")
      } else if (mode === "invalid") expect(await h.owner.prepareSettingsImport(ui, "{broken")).toEqual({ kind: "refused", reason: "invalid" })
      else if (mode === "forged") {
        // @ts-expect-error File plans cannot forge owner confirmation authority.
        expect((await h.owner.importSettings(ui, { confirmation: { kind: "import-plan" }, replace: "confirmed" })).kind).toBe("unavailable")
      } else {
        const p = await h.prepare()
        if (mode === "stale") h.h.foreign(state => { state.session.foreign = true })
        const input = mode === "unconfirmed" ? { confirmation: p.confirmation, replace: "not-confirmed" } : { confirmation: p.confirmation, replace: "confirmed" }
        // @ts-expect-error Runtime input also checks explicit confirmation.
        expect((await h.owner.importSettings(ui, input)).kind).toBe("unavailable")
      }
      expect(h.counts().writes).toBe(0)
      expect(h.events).toEqual([])
    } finally { await h.dispose() }
  }
})

test("whole-batch quota refusal precedes acceptance", async () => {
  const seed = initial(true), settings = object(defaultSettings()), setup = object({ ...defaultSetup(), quickSave: "PL_after" })
  seed.local = { schema: 1, device: seed.local.device ?? null, "consent:state": seed.local["consent:state"] ?? null,
    sync: { joined: "joined-copy", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false },
    "doc:settings": old("quota-settings", settings), [`doc:setup:${A}`]: old("quota-A", setup), [`doc:setup:${B}`]: old("quota-B", setup) }
  seed.session = {}; seed.sync = syncInventory(seed.local)
  for (let index = 0, count = SYNC_BUDGET_ITEMS - Object.keys(seed.sync).length - 1; index < count; index++) seed.sync[`retained:${index}`] = 0
  const text = JSON.stringify({ format: 1, product: "Perchling", version: "2.0.0", date: "2026-10-30", settings,
    accounts: { [A]: { setup, filters: { PL_new: { mode: "deny", on: false, channels: [] } } },
      [B]: { setup, filters: { PL_new: { mode: "deny", on: false, channels: [] } } } } })
  const h = world(true, seed)
  try {
    expect(await h.owner.prepareSettingsImport(ui, text)).toEqual({ kind: "refused", reason: "sync-full" })
    expect(h.counts().writes).toBe(0)
    expect(Object.hasOwn(h.h.state().local, settingsImportKey)).toBe(false)
  } finally { await h.dispose() }
})

test("delayed label, AddFlow session and import captures cannot recreate an emptied account", async () => {
  const seed = initial(); seed.session = {}; delete seed.local[`cache:${B}`]
  const h = world(false, seed)
  try {
    const label = await h.owner.seeAccountLabel({ acct: B, private: false, at: 9000 })
    if (label.kind !== "lookup") throw Error("Actual label reservation missing")
    const memory = await h.owner.readSession()
    if (memory.kind !== "memory") throw Error("Actual AddFlow session capture missing")
    const first = await h.prepare(), delayed = await h.prepare()
    expect((await h.owner.importSettings(ui, { confirmation: first.confirmation, replace: "confirmed" })).kind).toBe("committed")
    const before = h.h.state(), writes = h.counts().writes
    expect(await h.owner.completeAccountLabel(label.capture, { acct: B, label: { name: "Late label" } })).toEqual({ kind: "stale" })
    expect(await h.owner.changeSession({ revision: memory.revision, now: 9001, edits: [{ kind: "cooldown", acct: B, until: 10000 }] })).toEqual({ kind: "unavailable", reason: "revision" })
    expect((await h.owner.importSettings(ui, { confirmation: delayed.confirmation, replace: "confirmed" })).kind).toBe("unavailable")
    expect(h.h.state()).toEqual(before); expect(h.counts().writes).toBe(writes)
  } finally { await h.dispose() }
})

test("the cleanup collaborator is required before acceptance", async () => {
  const h = world(false, initial(), { cleanup: false })
  try {
    expect(await h.owner.prepareSettingsImport(ui, fileText())).toEqual({ kind: "unavailable", reason: "cleanup-host" })
    expect(h.counts().writes).toBe(0)
  } finally { await h.dispose() }
})

test("read-only paths neither execute a pending import nor expose a completed replacement", async () => {
  const h = world()
  try {
    const p = await h.prepare(); h.fault(2, "reject-before")
    expect(await h.owner.importSettings(ui, { confirmation: p.confirmation, replace: "confirmed" })).toMatchObject({ kind: "failed", stage: "documents", applied: false })
    const before = h.h.state(), writes = h.counts().writes
    expect((await h.owner.exportSettings(ui)).kind).toBe("unavailable")
    expect((await h.owner.importCheck(ui, fileText())).kind).toBe("unavailable")
    expect((await h.owner.readSetup(A)).kind).toBe("unavailable")
    expect((await h.owner.readPlaylistCache({ acct: A, private: false })).kind).toBe("unavailable")
    expect((await h.owner.readSession()).kind).toBe("unavailable")
    expect((await h.owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false })).kind).toBe("unavailable")
    expect((await h.owner.readTabProjection({ private: false, account: { kind: "signed-in", acct: A } })).kind).toBe("unavailable")
    expect(h.h.state()).toEqual(before); expect(h.counts().writes).toBe(writes)
  } finally { await h.dispose() }
})

test.each(["reject-before", "reject-after", "ignore", "mismatch"] satisfies Fault[])("exact write readback distinguishes %s", async mode => {
  const h = world()
  try {
    const p = await h.prepare(); h.fault(2, mode)
    const result = await h.owner.importSettings(ui, { confirmation: p.confirmation, replace: "confirmed" })
    expect(result).toMatchObject(mode === "reject-before" ? { kind: "failed", stage: "documents", applied: false }
      : mode === "reject-after" ? { kind: "failed", stage: "documents", applied: true } : { kind: "unconfirmed", stage: "documents" })
    expect(h.events).toEqual([])
    expect(readSettingsImport(h.h.state().local[settingsImportKey]).kind).toBe("valid")
  } finally { await h.dispose() }
})

test("restart after every accepted write boundary reuses the complete accepted effect", async () => {
  for (const syncOn of [false, true]) {
    const reference = world(syncOn), p = await reference.prepare()
    expect((await reference.owner.importSettings(ui, { confirmation: p.confirmation, replace: "confirmed" })).kind).toBe("committed")
    const final = payload(reference.h.state()), writes = reference.counts().writes
    await reference.dispose()
    for (let boundary = 1; boundary <= writes; boundary++) for (const mode of ["interrupt-before", "interrupt-after"] satisfies Fault[]) {
      const h = world(syncOn)
      try {
        const prepared = await h.prepare(); h.fault(boundary, mode)
        const result = await h.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })
        expect(result.kind).not.toBe("committed")
        const stamps = h.counts().generation
        expect((await h.restart()).kind).toBe("ready")
        expect(payload(h.h.state())).toEqual(boundary === 1 && mode === "interrupt-before" ? payload(initial(syncOn)) : final)
        expect(h.counts().generation).toBe(stamps)
        const stable = h.h.state(), count = h.counts().writes
        expect((await h.owner.resumeSettingsImport(ui)).kind).toBe("idle")
        expect(h.h.state()).toEqual(stable); expect(h.counts().writes).toBe(count)
      } finally { await h.dispose() }
    }
  }
}, 600000)

test("withdrawal around each write retains the original effect and a later Agree cannot resume it", async () => {
  const reference = world(), prepared = await reference.prepare()
  expect((await reference.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })).kind).toBe("committed")
  const count = reference.counts().writes; await reference.dispose()
  for (let boundary = 2; boundary < count; boundary++) for (const when of ["before", "after"] as const) {
    const h = world()
    try {
      const p = await h.prepare()
      h.hook((phase, ordinal) => { if (phase === when && ordinal === boundary) { h.hook(); h.withdraw() } })
      const result = await h.owner.importSettings(ui, { confirmation: p.confirmation, replace: "confirmed" })
      expect(result.kind).not.toBe("committed")
      const held = h.h.state(), marker = readSettingsImport(held.local[settingsImportKey])
      expect(marker.kind === "valid" || marker.kind === "retired").toBe(true)
      const job = parseConsentJobs(held.local["consent:jobs"])?.jobs[0]
      expect(job?.identity.original).toEqual({ v: 1, at: 7 })
      const writes = h.counts().writes
      h.agree()
      expect((await h.owner.resumeSettingsImport(ui)).kind).toBe("held")
      expect(h.counts().writes).toBe(writes)
      const review = await h.owner.readWithdrawnWork(ui)
      if (review.kind !== "held") throw Error("Expected recognized import recovery")
      const selected = review.work.find(view => view.kind === "settings-import")
      if (!selected || selected.kind !== "settings-import") throw Error("No import variant in held work")
      expect(selected.recoverability).toBe("exact-settings-import")
      const recovered = await h.owner.recoverWithdrawnWork(ui, { review: review.review, job: selected.selection })
      expect(recovered.kind).toBe("recovered")
      const done = h.h.state(), after = h.counts().writes
      expect((await h.owner.recoverWithdrawnWork(ui, { review: review.review, job: selected.selection })).kind).toBe("unavailable")
      expect(h.h.state()).toEqual(done); expect(h.counts().writes).toBe(after)
      expect(object(done.local.device).consent).not.toEqual({ v: 1, at: 7 })
      expect(done.local[`cache:${B}`]).toBeUndefined(); expect(done.local[`cache:${C}`]).toEqual(initial().local[`cache:${C}`])
    } finally { await h.dispose() }
  }
}, 120000)

test("invalid and newer continuations remain inspectable and blocked without mutation", async () => {
  const markers: readonly JsonObject[] = [{ v: 2, kind: "settings-import-continuation", future: true }, { v: 1, kind: "settings-import-continuation", next: 999 }]
  for (const marker of markers) {
    const h = world()
    try {
      h.h.foreign(state => { state.local[settingsImportKey] = marker })
      const before = h.h.state()
      expect((await h.owner.resumeSettingsImport(ui)).kind).toBe("unavailable")
      const held = await h.owner.readWithdrawnWork(ui)
      expect(held.kind === "held" && held.work.some(view => view.kind === "settings-import" && view.recoverability === "blocked")).toBe(true)
      expect(h.h.state()).toEqual(before); expect(h.counts().writes).toBe(0)
    } finally { await h.dispose() }
  }
})

test("disposed owners cannot accept or resume imports", async () => {
  const h = world(), p = await h.prepare(), before = h.h.state()
  await h.dispose()
  expect((await h.owner.importSettings(ui, { confirmation: p.confirmation, replace: "confirmed" })).kind).toBe("unavailable")
  expect((await h.owner.resumeSettingsImport(ui)).kind).toBe("unavailable")
  expect(h.h.state()).toEqual(before); expect(h.counts().writes).toBe(0)
})

test("actual Agree keeps the accepted import held until exact one-use recovery", async () => {
  const h = world()
  try {
    const prepared = await h.prepare(); h.fault(2, "reject-before")
    await h.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })
    h.withdraw(); expect((await h.restart()).kind).toBe("blocked")
    const before = h.h.state(), disclosure = await h.owner.readAgreement(ui)
    if (disclosure.kind !== "review") throw Error("Actual held disclosure missing")
    const agreed = await h.owner.agree(ui, { review: disclosure.review, displayedVersion: disclosure.version,
      choice: { kind: "disclosure" }, access: new Promise(() => {}) })
    expect(agreed.kind).toBe("committed")
    expect(h.h.state().local[settingsImportKey]).toEqual(before.local[settingsImportKey])
    expect(h.h.state().local["doc:settings"]).toEqual(before.local["doc:settings"])
    const writes = h.counts().writes
    expect((await h.owner.resumeSettingsImport(ui)).kind).toBe("held")
    expect(h.counts().writes).toBe(writes)
    const first = await h.owner.readWithdrawnWork(ui)
    if (first.kind !== "held") throw Error("Actual held import review missing")
    const selected = first.work.find(view => view.kind === "settings-import")
    if (!selected) throw Error("Recognized import selection missing")
    const substituted = { kind: "held-job-selection" } as const
    expect((await h.owner.recoverWithdrawnWork(ui, { review: first.review, job: substituted })).kind).toBe("unavailable")
    expect(h.counts().writes).toBe(writes)
    const second = await h.owner.readWithdrawnWork(ui)
    if (second.kind !== "held") throw Error("Fresh import review missing")
    const chosen = second.work.find(view => view.kind === "settings-import")
    if (!chosen) throw Error("Fresh import selection missing")
    expect((await h.owner.recoverWithdrawnWork(ui, { review: second.review, job: chosen.selection })).kind).toBe("recovered")
    const done = h.h.state(), count = h.counts().writes
    expect((await h.owner.recoverWithdrawnWork(ui, { review: second.review, job: chosen.selection })).kind).toBe("unavailable")
    expect(h.h.state()).toEqual(done); expect(h.counts().writes).toBe(count)
  } finally { await h.dispose() }
})

test("stale recovery inventories fail before authorization and old account captures stay revoked", async () => {
  const h = world()
  try {
    const cache = await h.owner.readPlaylistCache({ acct: A, private: false }), prepared = await h.prepare()
    if (cache.kind !== "cache" || cache.authority.kind !== "eligible") throw Error("Actual cache capture missing")
    h.fault(2, "reject-before")
    await h.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })
    const held = await h.owner.readWithdrawnWork(ui)
    if (held.kind !== "held") throw Error("Held import missing")
    const selected = held.work.find(view => view.kind === "settings-import")
    if (!selected) throw Error("Held selection missing")
    h.h.foreign(state => { state.session.unrelatedNewer = { v: 99, retain: true } })
    const writes = h.counts().writes
    expect((await h.owner.recoverWithdrawnWork(ui, { review: held.review, job: selected.selection })).kind).toBe("unavailable")
    expect(h.counts().writes).toBe(writes)
    expect((await h.owner.absorbPlaylistCache(cache.authority.capture, { kind: "list", acct: A, site: "www", at: 9001, rows: [] })).kind).toBe("refused")
    expect(h.h.state().session.unrelatedNewer).toEqual({ v: 99, retain: true })
  } finally { await h.dispose() }
})
