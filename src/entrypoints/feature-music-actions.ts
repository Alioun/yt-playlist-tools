import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { definePageFeature } from "../site/feature"
import { musicActions } from "../site/features/music-actions/feature"
import { loadPopovers } from "../site/popovers/loader"

export default defineUnlistedScript(() =>
  definePageFeature("feature-music-actions", "music", musicActions, (core, kit) => {
    if (!kit?.music) throw new Error("Quick actions need YouTube Music's kit")
    const timer = (ms: number, done: () => void) => {
      const id = setTimeout(done, ms)
      return () => clearTimeout(id)
    }
    return {
      document: core.document,
      items: core.items,
      page: core.page,
      quick: kit.music,
      actions: core.actions,
      i18n: core.i18n,
      notices: core.notices,
      health: core.health,
      preload: () => {
        void loadPopovers(core.actions.need, timer)
      },
      os: osOf(navigator.platform)
    }
  })
)
