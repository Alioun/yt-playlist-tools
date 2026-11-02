import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { coreFor, pageGlobal } from "../site/global"
import { announcePopovers } from "../site/popovers/loader"
import { createPopovers } from "../site/popovers/picker"
import { pagePicker } from "../ui/picker/page"

export default defineUnlistedScript(() => {
  const global = pageGlobal(), core = coreFor("www")
  if (global.popovers || !core) return
  global.loaded.set("popovers", core.build)
  const os = osOf(navigator.platform)
  announcePopovers(createPopovers({ core: () => coreFor("www"), kit: () => global.kit, document, os, renderer: pagePicker }))
})
