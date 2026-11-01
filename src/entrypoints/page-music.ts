import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: "music", build: platform.build, window, document })
})
