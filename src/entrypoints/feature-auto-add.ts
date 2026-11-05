import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { autoAddText } from "../shared/copy"
import { definePageFeature } from "../site/feature"
import { autoAdd } from "../site/features/auto-add"

// oxfmt-ignore
export default defineUnlistedScript(() => definePageFeature("feature-auto-add", "www", autoAdd, (core, kit) => {
  if (!kit) throw new Error("Auto-add needs the kit")
  return { document: core.document, page: core.page, actions: core.actions, feedback: kit.feedback, text: autoAddText(core.i18n),
    clock: { now: () => performance.now() }, thisVideo: view => core.thisVideo.publish(view), log: (message: string) => console.info(`[Perchling] ${message}`) }
}))
