import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createImportPlanner, exportFile } from "../../../src/shared/settings-file"
import { canonicalSource, expectedPlanText, expectedText, fixture, freeze } from "./specimens"

const source = freeze(canonicalSource())
const before = JSON.stringify(source)
const exported = exportFile({ source, version: "2.0.0-rc.1+fixture", date: "2026-10-29" })
assert.equal(exported.kind, "exported")
if (exported.kind !== "exported") throw new Error("consumer-export-refused")
assert.equal(exported.file.text, expectedText)
assert.equal(exported.file.filename, "perchling-settings-2026-10-29.json")
assert.equal(exported.file.mime, "application/json")
const planner = createImportPlanner("normal")
const plan = planner.importFile(exported.file.text)
assert.deepEqual(plan, fixture(expectedPlanText))
assert.deepEqual(planner.importFile(expectedText), fixture(expectedPlanText))
assert.equal(JSON.stringify(source), before)
assert.deepEqual(createImportPlanner("private").importFile(expectedText), { kind: "refused", reason: "private", copy: "DATA-54.private" })
if (plan.kind !== "import-plan") throw new Error("consumer-plan-refused")
process.stdout.write(
  JSON.stringify({
    kind: "settings-file-consumer",
    filename: exported.file.filename,
    mime: exported.file.mime,
    fileBytes: Buffer.byteLength(exported.file.text),
    fileSha256: createHash("sha256").update(exported.file.text).digest("hex"),
    accountCount: plan.accountCount,
    accounts: plan.accounts.map(entry => entry.account),
    filterPlaylists: plan.accounts.map(entry => entry.filters.map(filter => filter.playlist)),
    absentAccounts: plan.replacement.absentAccounts,
    provenance: plan.provenance
  }) + "\n"
)
