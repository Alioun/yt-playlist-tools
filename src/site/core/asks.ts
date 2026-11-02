import { tabAskContract, type TabAskMessages } from "../../shared/contracts/tab-actions"
import type { BuildId } from "../../shared/contracts/vocabulary"
import type { I18n } from "../../shared/i18n"
import { createRpc, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import { explicitContent } from "../explicit"
import { pageGlobal } from "../global"
import { loadPopovers } from "../popovers/loader"
import { pickerAnchor } from "../popovers/types"
import type { TabActions } from "./actions"
import type { Scope } from "./scope"

/**
 * The tab's answer to the background's asks (YT-ANY-06, YT-BM-03): an add's toast in this tab, held by the
 * toaster while the tab is hidden, and the picker opened here. Both need the kit, which the background injects
 * with the core before it asks.
 */
export function serveTabAsks<Sender>(options: {
  readonly transport: Transport<Sender>
  readonly build: BuildId
  readonly deadline: Deadline
  readonly document: Document
  readonly root: Scope
  readonly actions: TabActions
  readonly i18n: I18n
  readonly identity: () => string | undefined
  senderId(sender: Sender): string | undefined
}): () => void {
  const rpc = createRpc<TabAskMessages, Sender>(options.transport, { build: options.build, deadline: options.deadline, contract: tabAskContract })
  const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id) }
  async function openPicker(payload: TabAskMessages["bg.picker"]["payload"]): Promise<boolean> {
    const popovers = await loadPopovers(options.actions.need, timer)
    if (!popovers) {
      const session = pageGlobal().kit?.feedback.use(options.root)
      session?.toaster.show({ text: options.i18n.message("picker_loadFailed"), tone: "failure", auto: false, action: null })
      return false
    }
    popovers.openPicker({ video: payload.video, ...(payload.title ? { title: payload.title } : {}), anchor: pickerAnchor(options.document, null),
      mode: payload.choose ? { kind: "choose", shortcut: null } : { kind: "save" }, opener: payload.opener })
    return true
  }
  const unbind = rpc.handle({
    authenticate({ sender }) {
      const id = options.identity()
      return id !== undefined && options.senderId(sender) === id ? { kind: "accepted", context: null } : { kind: "rejected" }
    },
    handlers: {
      "bg.toast"(payload) {
        const session = pageGlobal().kit?.feedback.use(options.root)
        if (!session) return null
        const content = explicitContent({ session, actions: options.actions, i18n: options.i18n, location: window.location }, payload.answer,
          payload.title ? { video: payload.title } : {}, { choose: () => { void openPicker({ ...payload, choose: true }) } })
        if (content) session.toaster.show(content)
        return null
      },
      async "bg.picker"(payload) { return { kind: await openPicker(payload) ? "opened" : "failed" } }
    }
  })
  return () => { unbind(); rpc.dispose() }
}
