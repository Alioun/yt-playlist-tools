import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { readConsentDevice } from "../../../src/background/store/consent-withdrawal"
import { readSettingsImport } from "../../../src/background/store/settings-import-persistence"
import { documentKey } from "../../../src/shared/model"
import type { SettingsImportHost } from "../../../src/background/store/settings-import-execution"
import { createAuthorityHarness, installAuthorityFixture, releaseAuthorityFixture } from "../interim-recovery-review/run"
import { fileFrom } from "../owner-services-reconciliation/harness"
import { object, ui, settingsImportKey } from "./harness"

async function canonical() {
  const h = createAuthorityHarness(), installed = await installAuthorityFixture(h)
  expect((await releaseAuthorityFixture(h, installed.owner)).kind).toBe("restart-required")
  await installed.owner.dispose()
  h.foreign(records => {
    const read = readConsentDevice(records)
    if (read.kind !== "supported" || !read.device.consent) throw Error("Accepted canonical consent missing")
    if (!read.control) records["consent:state"] = { v: 1, kind: "consent-state", deviceId: read.device.id, generation: 1,
      lastAgreementAt: read.device.consent.at, legacyBasis: { kind: "observed", agreement: read.device.consent },
      state: { kind: "agreed", current: read.device.consent, prior: null } }
  })
  const settingsImport: SettingsImportHost = { kind: "fixture", session: { async get() { return {} }, async set() {}, async remove() {} },
    async removeLocal(keys) { h.foreign(records => { for (const key of keys) delete records[key.kind === "document" ? documentKey(key.key)
      : key.kind === "cache" ? `cache:${key.acct}` : `progress:${key.acct}:${key.shard}`] }) } }
  const owner = createStartingLocalFilterWriter({ ...h.actor("canonical-import"), settingsImport, generation: () => crypto.randomUUID() })
  expect(await owner.ready()).toBe("ok")
  return { h, owner, settingsImport }
}

test("retained-canonical startup resumes the same accepted import and preserves the archive", async () => {
  const p = await canonical()
  try {
    const source = await fileFrom(p.owner), before = p.h.records(), prepared = await p.owner.prepareSettingsImport(ui, source.text)
    if (prepared.kind !== "confirmation-required") throw Error("Canonical import confirmation missing")
    p.h.write(async (items, apply) => { apply(items); if (Object.keys(items).some(key => key.startsWith("doc:"))) throw p.h.error })
    expect(await p.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })).toMatchObject({ kind: "failed", stage: "documents", applied: true })
    expect(readSettingsImport(p.h.records()[settingsImportKey]).kind).toBe("valid")
    await p.owner.dispose(); p.h.write(undefined)
    const fresh = createStartingLocalFilterWriter({ ...p.h.actor("canonical-import-restart"), settingsImport: p.settingsImport,
      generation() { throw Error("Canonical restart must not allocate document stamps") } })
    try {
      expect(await fresh.ready()).toBe("ok")
      expect(readSettingsImport(p.h.records()[settingsImportKey]).kind).toBe("retired")
      expect(p.h.records().interimConversion).toEqual(before.interimConversion)
      expect(object(p.h.records().device).consent).toEqual(object(before.device).consent)
      const stable = p.h.records(), writes = p.h.writes.length
      expect((await fresh.resumeSettingsImport(ui)).kind).toBe("idle")
      expect(p.h.records()).toEqual(stable); expect(p.h.writes.length).toBe(writes)
    } finally { await fresh.dispose() }
  } finally { await p.owner.dispose() }
}, 60000)

test.each(["before", "after"] as const)("canonical capability loss %s a write cannot produce an import receipt", async when => {
  const p = await canonical()
  try {
    const source = await fileFrom(p.owner), prepared = await p.owner.prepareSettingsImport(ui, source.text)
    if (prepared.kind !== "confirmation-required") throw Error("Canonical confirmation missing")
    const writes = p.h.writes.length
    if (when === "before") p.h.revoke()
    else p.h.write(async (items, apply) => { apply(items); p.h.revoke() })
    const result = await p.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })
    expect(result.kind).not.toBe("committed")
    expect(p.h.writes.length).toBe(writes + (when === "after" ? 1 : 0))
    expect((await p.owner.exportSettings(ui)).kind).toBe("unavailable")
  } finally { await p.owner.dispose() }
}, 60000)
