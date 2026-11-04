import type { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { TabProjectionRead } from "../../../src/background/store/tab-projection"
import type { TabContext, TabsPorts } from "../../../src/background/tabs/ports"
import type { createBrowserTabs } from "../../../src/background/adapters/tabs"
import type { NativeSender } from "../../../src/background/adapters/sender-origin"

type Owner = Pick<ReturnType<typeof createLocalFilterWriter>, "readTabProjection" | "readLastAccount" | "readSetup">
type NativeTabs = Pick<ReturnType<typeof createBrowserTabs>, "requester">

// Tabs calls this after binding the page account to native tab and window facts.
export function readStorageForTab(owner: Owner, context: TabContext): Promise<TabProjectionRead> {
  if (context.info.site !== context.tab.site) return Promise.resolve({ kind: "invalid", part: "request" })
  return owner.readTabProjection({ private: context.tab.incognito, account: context.info.signedIn ? { kind: "signed-in", acct: context.info.acct } : { kind: "signed-out" } })
}

// The binding reads its normal-window scope from its own sender, so its last-account read needs none from Tabs.
export function bindNativeRoutingAccounts(input: { readonly owner: Owner; readonly native: NativeTabs; readonly sender: NativeSender; readonly popupWindowId: unknown }): {
  lastAccount(): ReturnType<TabsPorts["accounts"]["lastAccount"]>
  hasSetup: TabsPorts["accounts"]["hasSetup"]
} {
  const { owner, native, sender, popupWindowId } = input
  async function normalRequester() {
    const result = await native.requester(sender, popupWindowId)
    return result.kind === "requester" && result.req.incognito === false ? result.req : null
  }
  return {
    async lastAccount() {
      const req = await normalRequester()
      if (!req) return null
      const read = await owner.readLastAccount({ kind: "normal-window", windowId: req.windowId, incognito: false })
      const current = await normalRequester()
      return current?.windowId === req.windowId && read.kind === "account" ? read.acct : null
    },
    async hasSetup(acct) {
      const req = await normalRequester()
      if (!req) return false
      const read = await owner.readSetup(acct)
      const current = await normalRequester()
      return current?.windowId === req.windowId && read.kind === "value" && read.view.kind === "live"
    }
  }
}
