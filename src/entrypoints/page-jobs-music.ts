import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { createLiveMusicJobs } from "../page/adapters/live-music-jobs"
import { offerJobs } from "../page/jobs-port"
import { platform } from "../shared/platform"

// Injected by the Registrar into one tab on that page's first job (G42); it hands itself to the page half.
export default defineUnlistedScript(() => {
  offerJobs(document, { site: "music", build: platform.build, create: createLiveMusicJobs })
})
