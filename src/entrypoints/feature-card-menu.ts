import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { definePageFeature } from "../site/feature"
import { cardMenuFeature } from "../site/features/card-menu/card-menu"

export default defineUnlistedScript(() =>
  definePageFeature("feature-card-menu", "www", cardMenuFeature, core => ({ document: core.document, items: core.items, page: core.page, notice: core.notice }))
)
