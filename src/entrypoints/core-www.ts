import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { vocabularyFor } from "../page/gateway/port"
import { wwwRoutes } from "../page/routes/www"
import { platform } from "../shared/platform"
import { startNativeCore } from "../site/core/adapters/start-core"
import { WwwItems } from "../site/core/items-www"

export default defineUnlistedScript(() => {
  startNativeCore("www", platform.build, vocabularyFor(wwwRoutes), options => new WwwItems(options))
})
