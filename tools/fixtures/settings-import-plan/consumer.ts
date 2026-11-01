import { deepStrictEqual, strictEqual } from "node:assert"
import { documentKey } from "../../../src/shared/model"
import { planSettingsImport } from "../../../src/background/store/settings-import-plan"
import { prepareDocumentBody } from "../../../src/background/store/write-preparation"
import { planSyncWrite } from "../../../src/background/store/sync-write-admission"
import { projectSyncWrite } from "../../../src/background/store/sync-codec"
import { decodeSettings } from "../../../src/shared/model"
import { expectedPuts, expectedSettings, expectedSession, expectedTombstones, expectedSyncBatch, scenario } from "./specimens"

export function consume(syncOn: boolean): { case: string; documentChanges: number; removedAccounts: number; receipt: false } {
  const input = scenario(syncOn), result = planSettingsImport(input)
  if (result.kind !== "planned") throw new Error(`Consumer refused ${JSON.stringify(result)}`)
  const expectedDocuments = { ...expectedPuts(), ...(syncOn ? expectedTombstones() : {}) }
  const actual = Object.fromEntries(result.documents.changes.filter(change => change.kind === "put").map(change => [documentKey(change.key), change.document]))
  deepStrictEqual(JSON.parse(JSON.stringify(actual)), expectedDocuments, "consumer complete independently expected documents")
  deepStrictEqual(JSON.parse(JSON.stringify(result.expected.session)), expectedSession(), "consumer complete independently expected cleanup")
  deepStrictEqual(JSON.parse(JSON.stringify(prepareDocumentBody({ kind: "settings", data: decodeSettings(expectedSettings()) }))), { kind: "prepared", data: expectedSettings() }, "consumer actual preparation")
  if (syncOn) {
    if (input.sync.kind !== "on" || result.documents.sync.kind !== "on") throw new Error("consumer sync facts")
    const [first, ...rest] = expectedSyncBatch()
    if (!first) throw new Error("consumer independent Settings batch")
    const admitted = planSyncWrite({ local: input.local, sync: input.sync.records, intent: { kind: "changed-batch", documents: [first, ...rest] } })
    if (admitted.kind !== "planned") throw new Error("consumer independent admission")
    deepStrictEqual(JSON.parse(JSON.stringify(result.documents.sync.admission)), JSON.parse(JSON.stringify(admitted)), "consumer canonical changed-batch admission")
    const usage = projectSyncWrite({ current: Object.entries(input.sync.records).map(([key, value]) => ({ key, value })), set: admitted.items })
    strictEqual(usage.kind, "fits", "consumer real serialized occupancy")
  }
  return { case: syncOn ? "complete-sync" : "complete-local", documentChanges: result.documents.changes.length, removedAccounts: result.cleanup.accounts.length, receipt: false }
}
