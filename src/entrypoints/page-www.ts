import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { createLiveWwwGateway } from "../page/adapters/live-www-gateway"
import { wwwGateway } from "../page/gateway/www"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: wwwGateway, createGateway: createLiveWwwGateway, build: platform.build, window, document })
})
