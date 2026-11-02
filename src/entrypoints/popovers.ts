import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { pageGlobal } from "../site/global"
import { announcePopovers } from "../site/popovers/loader"
import { createPopovers } from "../site/popovers/picker"
import { pagePicker } from "../ui/picker/page"

export default defineUnlistedScript(() => {
  const global = pageGlobal()
  const live = () => global.core && !global.core.disposed ? global.core : undefined
  const core = live()
  if (global.popovers || !core) return
  global.loaded.set("popovers", core.build)
  announcePopovers(createPopovers({ core: live, kit: () => global.kit, document, os: osOf(navigator.platform), renderer: pagePicker }))
})
