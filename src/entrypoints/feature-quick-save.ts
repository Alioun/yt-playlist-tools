import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { definePageFeature } from "../site/feature"
import { quickSave } from "../site/features/quick-save/feature"
import { loadPopovers } from "../site/popovers/loader"

// oxfmt-ignore
export default defineUnlistedScript(() => definePageFeature("feature-quick-save", "www", quickSave, (core, kit) => {
  if (!kit) throw new Error("Quick-save needs the kit")
  const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id) }
  const os = osOf(navigator.platform)
  return { document: core.document, items: core.items, page: core.page, actions: core.actions, feedback: kit.feedback, overlay: kit.overlay,
    i18n: core.i18n, notices: core.notices, popovers: () => loadPopovers(core.actions.need, timer), location: window.location, os }
}))
