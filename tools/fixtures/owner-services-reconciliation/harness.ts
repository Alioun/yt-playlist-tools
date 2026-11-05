import type { AccountLabelSeen } from "../../../src/background/store/account-label"
import type { ConfirmedViewChange } from "../../../src/background/store/local-filter-writer"
import { exportFile } from "../../../src/shared/settings-file"
import { world, seed } from "../accounts-label/harness"
export { a, b, alpha, beta, epoch, origin, object, success, deferred, signedOut } from "../accounts-label/harness"

export function compose(initial = seed()) {
  const h = world(initial),
    events: ConfirmedViewChange[] = []
  let revocations = 0
  const unsubscribe = h.owner.subscribeView(
    event => events.push(event),
    () => {
      revocations++
    }
  )
  return {
    h,
    events,
    get revocations() {
      return revocations
    },
    async dispose() {
      unsubscribe()
      await h.dispose()
    }
  }
}

export function reservation(seen: AccountLabelSeen) {
  if (seen.kind !== "lookup") throw Error("Expected actual owner label reservation")
  return seen
}

export async function fileFrom(owner: ReturnType<typeof world>["owner"]) {
  const read = await owner.exportSettings({ kind: "ui", windowId: 1, incognito: false })
  if (read.kind !== "source") throw Error("Expected fresh owner export source")
  const exported = exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
  if (exported.kind !== "exported") throw Error("Expected declared settings file")
  return { read, text: exported.file.text }
}
