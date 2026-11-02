import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { coreFor, pageGlobal } from "../site/global"
import { announcePopovers } from "../site/popovers/loader"
import { createPopovers } from "../site/popovers/picker"
import { pagePicker } from "../ui/picker/page"

export default defineUnlistedScript(() => {
  const global = pageGlobal(), core = coreFor("www")
  if (global.popovers || !core) return
  global.loaded.set("popovers", core.build)
  const os = /mac/i.test(navigator.platform) ? "macos" : /win/i.test(navigator.platform) ? "windows" : "linux"
  announcePopovers(createPopovers({ core: () => coreFor("www"), kit: () => global.kit, document, os, renderer: pagePicker }))
})
