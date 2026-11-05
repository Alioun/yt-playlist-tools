import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { createLiveMusicReads } from "../page/adapters/live-music-reads"
import { startPage } from "../page/start"
import { platform } from "../shared/platform"

export default defineUnlistedScript(() => {
  startPage({ site: "music", createReads: createLiveMusicReads, build: platform.build, window, document })
})
