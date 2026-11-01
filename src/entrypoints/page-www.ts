import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: "www", build: platform.build, window, document })
})
