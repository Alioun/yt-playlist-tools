import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { createLiveWwwReads } from "../page/adapters/live-www-reads"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: "www", createReads: createLiveWwwReads, build: platform.build, window, document })
})
