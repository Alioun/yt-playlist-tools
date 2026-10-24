import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { mount } from "svelte"
import Popover from "../site/popovers/Popover.svelte"

export default defineUnlistedScript(() => {
  const target = document.createElement("section")
  globalThis.__pp.kit.layer.append(target)
  mount(Popover, { target, props: { portalTarget: globalThis.__pp.kit.layer } })
  globalThis.__pp.popovers = { mounted: true }
  globalThis.__pp.core.trace.push("popovers")
})
