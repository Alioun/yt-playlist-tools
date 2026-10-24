import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import namespaces from "virtual:page-link-svelte"
import * as lib from "../site/kit"
export default defineUnlistedScript(() => {
  const host = document.createElement("div")
  host.id = "fixture-host"
  const shadow = host.attachShadow({ mode: "open" })
  const layer = document.createElement("div")
  layer.id = "fixture-layer"
  shadow.append(layer)
  document.documentElement.append(host)
  globalThis.__pp.svelte = namespaces
  globalThis.__pp.kit = { lib, layer, mounted: 0, events: 0 }
  globalThis.__pp.core.trace.push("kit")
})
