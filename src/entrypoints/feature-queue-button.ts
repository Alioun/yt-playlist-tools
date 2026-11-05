import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { queueButtonText } from "../shared/copy"
import { definePageFeature } from "../site/feature"
import { queueButton } from "../site/features/queue-button"

export default defineUnlistedScript(() =>
  definePageFeature("feature-queue-button", "www", queueButton, (core, kit) => {
    if (!kit?.overlay) throw new Error("The queue button needs the overlay kit")
    return { document: core.document, items: core.items, page: core.page, feedback: kit.feedback, overlay: kit.overlay, text: queueButtonText(core.i18n), notices: core.notices }
  })
)
