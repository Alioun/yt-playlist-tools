import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { autoAddText } from "../shared/copy"
import { definePageFeature } from "../site/feature"
import { autoAdd } from "../site/features/auto-add"

export default defineUnlistedScript(() => definePageFeature("feature-auto-add", "www", autoAdd, (core, kit) => {
  if (!kit) throw new Error("Auto-add needs the kit")
  return { document: core.document, page: core.page, background: core.background, feedback: kit.feedback, text: autoAddText(core.i18n),
    clock: { now: () => performance.now() }, log: (message: string) => console.info(`[Perchling] ${message}`) }
}))
