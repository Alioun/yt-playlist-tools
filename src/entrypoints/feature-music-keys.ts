import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { definePageFeature } from "../site/feature"
import { musicKeys } from "../site/features/music-keys/feature"

export default defineUnlistedScript(() =>
  definePageFeature("feature-music-keys", "music", musicKeys, (core, kit) => {
    if (!kit?.music) throw new Error("Quick-action shortcuts need YouTube Music's kit")
    return { items: core.items, keys: core.keys, quick: kit.music }
  })
)
