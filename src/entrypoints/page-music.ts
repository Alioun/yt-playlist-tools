import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { createLiveMusicGateway } from "../page/adapters/live-music-gateway"
import { musicGateway } from "../page/gateway/music"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: musicGateway, createGateway: createLiveMusicGateway, build: platform.build, window, document })
})
