import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { mount } from "svelte"
import Unsuffixed from "../site/unsuffixed/Unsuffixed.svelte"
export default defineUnlistedScript(() => {
  mount(Unsuffixed, { target: globalThis.__pp.kit.layer })
  globalThis.__pp.core.trace.push("unsuffixed")
})
