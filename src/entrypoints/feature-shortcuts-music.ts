import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { definePageFeature } from "../site/feature"
import { shortcutsMusic } from "../site/features/shortcuts/music"

export default defineUnlistedScript(() => definePageFeature("feature-shortcuts-music", "music", shortcutsMusic, (core, kit) => {
  if (!kit?.music) throw new Error("Playlist shortcuts on YouTube Music need its kit")
  return { items: core.items, keys: core.keys, quick: kit.music }
}))
