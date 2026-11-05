import { readStorageForTab, bindNativeRoutingAccounts } from "./consumer"
import { a, b, projectionWorld } from "./harness"
import { build, nativeTab, signedIn, signedOut } from "../tabs/harness"
import expected from "./expected.json"
import { isDeepStrictEqual } from "node:util"

export async function runTabProjectionConsumer() {
  const h = projectionWorld()
  try {
    const context = { tab: { ...nativeTab(1), site: "www" as const }, info: signedIn(a) }
    const normal = await readStorageForTab(h.owner, context)
    const privateRead = await readStorageForTab(h.owner, { ...context, tab: { ...context.tab, incognito: true } })
    const out = await readStorageForTab(h.owner, { ...context, info: signedOut() })
    const unknown = await h.owner.readTabProjection({ private: false, account: { kind: "unknown" } })
    const accounts = bindNativeRoutingAccounts({
      owner: h.owner,
      native: {
        async requester() {
          return { kind: "requester", req: { windowId: 1, incognito: false, activeTabId: null } }
        }
      },
      sender: {},
      popupWindowId: 1
    })
    const routing = await accounts.lastAccount()
    const records = { normal, private: privateRead, signedOut: out, unknown, routing }
    if (!isDeepStrictEqual(records, expected)) throw Error("Real-owner consumer records differ from the authored expectation")
    if (routing !== b || !(await accounts.hasSetup(b))) throw Error("Routing requires a surviving Setup")
    if (h.writes().length || h.syncReads().length) throw Error("Read consumer performed a write or sync lookup")
    return { build, records, writes: h.writes().length, syncReads: h.syncReads().length }
  } finally {
    await h.owner.dispose()
  }
}
if (import.meta.main) process.stdout.write(JSON.stringify(await runTabProjectionConsumer()) + "\n")
