import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { vocabularyFor } from "../page/gateway/port"
import { musicRoutes } from "../page/routes/music"
import { platform } from "../shared/platform"
import { startNativeCore } from "../site/core/adapters/start-core"
import { MusicItems } from "../site/core/items-music"

export default defineUnlistedScript(() => {
  startNativeCore("music", platform.build, vocabularyFor(musicRoutes), options => new MusicItems(options))
})
