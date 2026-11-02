import namespaces from "virtual:page-link-svelte"
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import * as lib from "../site/kit"
import { createMusicQuick } from "../site/kit/music/quick"
import { startKit } from "../site/kit/start"

export default defineUnlistedScript(() => {
  startKit("music", namespaces, lib, createMusicQuick)
})
