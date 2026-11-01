import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import { tabHelloMessages, tabMessages, type TabHelloMessages, type TabMessages } from "../../../src/shared/contracts/tabs"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createRpc, createRpcCaller } from "../../../src/shared/rpc/rpc"
import { createExtLink } from "../../../src/site/core/extlink"
import { build, harness as pageHarness, route } from "../page-link/support"
import { settle } from "../extlink/harness"
import { wwwView } from "./views"

export { settle }
export function lifecycleHarness(changeAccount = false) {
  const page = pageHarness(changeAccount ? { run: async () => ({ ok: false, reason: "accountChanged" }) } : {
    run: async () => ({ ok: true, data: null, route })
  })
  type Sender = { readonly id: string }
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const background = network.connect({ id: "synthetic-lifecycle-extension" })
  const site = network.connect({ id: "synthetic-lifecycle-extension" })
  let identity: string | undefined = "synthetic-lifecycle-extension"
  const deadline = page.clock.after.bind(page.clock)
  const hello = createRpc<TabHelloMessages<TabView>, Sender>(background, { build, deadline, contract: tabHelloMessages(isTabView) })
  hello.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: { "tab.hello": () => wwwView() } })
  const caller = createRpcCaller<TabMessages<TabView>>(background, { build, deadline, contract: tabMessages(isTabView) })
  const ext = createExtLink({
    build, site: "www", page: page.link, deadline, hiddenAtStart: false, isView: isTabView,
    runtime: { transport: site, identity: () => identity, senderId: sender => sender.id }
  })
  return {
    page, ext,
    push: (view: TabView) => caller.call("bg.view", view),
    orphan() { identity = undefined; return ext.view },
    dispose() { ext.dispose(); caller.dispose(); hello.dispose(); page.dispose() }
  }
}
