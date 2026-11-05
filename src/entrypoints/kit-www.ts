import namespaces from "virtual:page-link-svelte"
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import * as lib from "../site/kit"
import { startKit } from "../site/kit/start"

export default defineUnlistedScript(() => {
  startKit("www", namespaces, lib)
})
