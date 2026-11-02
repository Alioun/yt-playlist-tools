import type { TabAskMessages } from "../../shared/contracts/tab-actions"
import type { I18n } from "../../shared/i18n"
import { explicitContent } from "../explicit"
import type { Feedback } from "../kit/feedback"
import { loadPopovers } from "../popovers/loader"
import { musicPickerAnchor, pickerAnchor } from "../popovers/types"
import type { Site } from "../../shared/contracts"
import type { TabActions } from "./actions"

export type TabAsks = {
  toast(payload: TabAskMessages["bg.toast"]["payload"]): void
  gatherToast(payload: TabAskMessages["bg.gatherToast"]["payload"]): void
  picker(payload: TabAskMessages["bg.picker"]["payload"]): Promise<"opened" | "failed">
  /** Only YouTube Music's kit answers these. */
  music?(payload: TabAskMessages["bg.music"]["payload"]): Promise<TabAskMessages["bg.music"]["result"]>
}

/**
 * The kit's answers to the background's asks (YT-ANY-06, YT-BM-03): an add's answer as this tab's toast, held
 * by the toaster while the tab is hidden, and the picker opened here. The core receives the asks and hands
 * them here once the kit is in the page.
 */
export function tabAsks(options: {
  readonly site: Site
  readonly document: Document
  readonly actions: TabActions
  readonly i18n: I18n
  readonly feedback: () => Feedback | null
}): TabAsks {
  const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id) }
  async function picker(payload: TabAskMessages["bg.picker"]["payload"]): Promise<"opened" | "failed"> {
    const popovers = await loadPopovers(options.actions.need, timer)
    if (!popovers) {
      options.feedback()?.toaster.show({ text: options.i18n.message("picker_loadFailed"), tone: "failure", auto: false, action: null })
      return "failed"
    }
    popovers.openPicker({ video: payload.video, ...(payload.title ? { title: payload.title } : {}), anchor: options.site === "music" ? musicPickerAnchor(options.document, null) : pickerAnchor(options.document, null),
      mode: payload.choose ? { kind: "choose", shortcut: null } : { kind: "save" }, opener: payload.opener })
    return "opened"
  }
  return {
    picker,
    toast(payload) {
      const session = options.feedback()
      if (!session) return
      const content = explicitContent({ session, actions: options.actions, i18n: options.i18n, location: window.location }, payload.answer,
        payload.title ? { video: payload.title } : {}, { choose: () => { void picker({ ...payload, choose: true }) } })
      if (content) session.toaster.show(content)
    },
    // A gather's toast carries Undo at most. Undo answers with the toast's next line, or closes it once it worked (YT-GT-21).
    gatherToast({ text, tone, auto, undo }) {
      const session = options.feedback()
      if (!session) return
      const action = undo === null ? null : session.action("undo", async () => {
        const answer = await options.actions.gatherUndo(undo)
        if (answer === null) return null
        return "kind" in answer ? { text: options.i18n.message("gather_undoFailed"), tone: "failure", auto: false, action: null }
          : { text: answer.text, tone: answer.tone, auto: false, action: null }
      })
      session.toaster.show({ text, tone, auto, action })
    }
  }
}
