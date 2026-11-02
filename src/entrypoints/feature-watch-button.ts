import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { definePageFeature } from "../site/feature"
import { watchButton } from "../site/features/watch-button/feature"
import { loadPopovers } from "../site/popovers/loader"

export default defineUnlistedScript(() => definePageFeature("feature-watch-button", "www", watchButton, core => {
  const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id) }
  return { document: core.document, page: core.page, actions: core.actions, i18n: core.i18n, notices: core.notices,
    popovers: () => loadPopovers(core.actions.need, timer), thisVideo: core.thisVideo, os: osOf(navigator.platform) }
}))
