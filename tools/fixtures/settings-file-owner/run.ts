import { harness, normal, privateWindow } from "./harness"
import { exportFile } from "../../../src/shared/settings-file"

const h = harness()
try {
  await h.ready()
  const read = await h.owner.exportSettings(privateWindow)
  if (read.kind !== "source") throw Error("consumer-source-unavailable")
  const file = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (file.kind !== "exported") throw Error("consumer-export-refused")
  const plan = await h.owner.importCheck(normal, file.file.text)
  const privateCheck = await h.owner.importCheck(privateWindow, file.file.text)
  if (plan.kind !== "import-plan" || plan.accountCount !== 3 || privateCheck.kind !== "refused" || privateCheck.reason !== "private") throw Error("consumer-check-failed")
  if (JSON.stringify(h.calls) !== JSON.stringify([{ get: null }, { get: null }, { get: null }, { get: null }])) throw Error("consumer-effects")
  console.log(JSON.stringify({ kind: "settings-file-owner", accountCount: plan.accountCount, privateCheck: privateCheck.reason, storageReads: 4, writes: 0 }))
} finally {
  await h.owner.dispose()
}
