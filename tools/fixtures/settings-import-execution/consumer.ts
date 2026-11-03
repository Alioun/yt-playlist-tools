import { deepStrictEqual, strictEqual, ok } from "node:assert"
import { parseConsentJobs } from "../../../src/background/store/consent-recovery"
import { readSettingsImport } from "../../../src/background/store/settings-import-persistence"
import { expectedPuts, expectedTombstones, expectedSession, removedNames } from "../settings-import-plan/specimens"
import { world, initial, payload, fileText, ui, object, A, B, C, D, E, F, settingsImportKey } from "./harness"

export async function consume(syncOn: boolean) {
  const seed = initial(syncOn),
    h = world(syncOn, seed)
  try {
    const omitted = Object.fromEntries(Object.entries(seed.local).filter(([key]) => key.includes(C)))
    const prepared = await h.prepare()
    deepStrictEqual(
      prepared.scope,
      { sharedSettings: "replace", includedAccounts: "replace-setup-and-all-filters", absentAccounts: "keep", accounts: [A, B, D, E, F] },
      "complete exact replacement scope"
    )
    strictEqual(h.counts().writes, 0, "preparation is a read")
    const checked = await h.owner.importCheck(ui, fileText())
    strictEqual(checked.kind, "import-plan", "actual owner parser remains a read")
    const result = await h.owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })
    strictEqual(result.kind, "committed", "receipt follows terminal readback")
    const expectedLocal = structuredClone(seed.local)
    for (const name of removedNames) delete expectedLocal[name]
    Object.assign(expectedLocal, expectedPuts(), syncOn ? expectedTombstones() : {})
    for (const account of [B, D]) {
      delete expectedLocal[`cache:${account}`]
      for (let shard = 0; shard < 16; shard++) delete expectedLocal[`progress:${account}:${shard}`]
    }
    expectedLocal.lastAccount = null
    expectedLocal.sync = { ...object(expectedLocal.sync), everEdited: true, ...(!syncOn ? { editedSinceOff: true } : {}) }
    deepStrictEqual(payload(h.h.state()), { local: expectedLocal, session: expectedSession(), sync: seed.sync }, "entire actual local, sync and session records")
    deepStrictEqual(Object.fromEntries(Object.entries(h.h.state().local).filter(([key]) => key.includes(C))), omitted, "omitted account is byte equivalent")
    const marker = readSettingsImport(h.h.state().local[settingsImportKey])
    deepStrictEqual(marker, { kind: "retired", receipt: { v: 1, kind: "settings-import-retired", occurrence: 0 } }, "retired durable receipt")
    const jobs = parseConsentJobs(h.h.state().local["consent:jobs"])
    strictEqual(jobs?.jobs.length, 1, "one complete import occurrence")
    strictEqual(jobs?.jobs[0]?.permission.kind, "done", "done permission is confirmed")
    const batch = h.calls.filter(call => call.kind.includes("doc:"))
    strictEqual(batch.length, 1, "all document puts materialize once in one local batch")
    ok(batch[0]?.kind.includes("doc:settings") && batch[0]?.kind.includes(`doc:setup:${A}`), "whole document batch")
    ok(h.counts().writes <= 36 && h.counts().reads <= 500, "finite complete consumer call bounds")
    strictEqual(h.counts().remoteReads, syncOn ? 2 : 0, "sync-off has no remote read")
    strictEqual(h.counts().generation, Object.keys(expectedPuts()).length + (syncOn ? Object.keys(expectedTombstones()).length : 0), "each admitted document receives one stable stamp")
    deepStrictEqual(
      h.events.map(row => row.event),
      [
        { kind: "settings-changed", source: "local" },
        { kind: "setup-changed", acct: A, source: "local" },
        { kind: "account-removed", acct: B, source: "local" },
        { kind: "account-removed", acct: D, source: "local" },
        { kind: "setup-changed", acct: E, source: "local" },
        { kind: "setup-changed", acct: F, source: "local" }
      ],
      "one confirmed publication sequence"
    )
    for (const row of h.events) deepStrictEqual(payload(row.state), payload(h.h.state()), "publication follows complete cleanup and terminal confirmation")
    const stable = h.h.state(),
      count = h.counts()
    strictEqual((await h.owner.resumeSettingsImport(ui)).kind, "idle", "retired import is idempotent")
    deepStrictEqual(h.h.state(), stable, "resume writes nothing after terminal completion")
    strictEqual(h.counts().writes, count.writes, "no repeated effect after completion")
    return { case: syncOn ? "complete-sync" : "complete-local", changedDocuments: 11, includedAccounts: 5, omittedAccounts: 1, emptiedAccounts: 2, receipt: true, publication: 6 }
  } finally {
    await h.dispose()
  }
}
