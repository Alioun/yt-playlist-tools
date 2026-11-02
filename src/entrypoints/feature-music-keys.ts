import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { osOf } from "../shared/keys/policy"
import { definePageFeature } from "../site/feature"
import { musicKeys } from "../site/features/music-keys/feature"

export default defineUnlistedScript(() => definePageFeature("feature-music-keys", "music", musicKeys, (core, kit) => {
  if (!kit?.music) throw new Error("Quick-action shortcuts need YouTube Music's kit")
  return { document: core.document, items: core.items, keys: core.keys, quick: kit.music, feedback: kit.feedback, i18n: core.i18n,
    notices: core.notices, os: osOf(navigator.platform) }
}))
