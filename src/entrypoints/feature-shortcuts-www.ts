import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { definePageFeature } from "../site/feature"
import { shortcutsWww } from "../site/features/shortcuts/www"
import { loadPopovers } from "../site/popovers/loader"

export default defineUnlistedScript(() => definePageFeature("feature-shortcuts-www", "www", shortcutsWww, (core, kit) => {
  if (!kit) throw new Error("Playlist shortcuts need the kit")
  const timer = (ms: number, done: () => void) => { const id = setTimeout(done, ms); return () => clearTimeout(id) }
  return { document: core.document, items: core.items, keys: core.keys, actions: core.actions, feedback: kit.feedback, i18n: core.i18n,
    notices: core.notices, popovers: () => loadPopovers(core.actions.need, timer), location: window.location }
}))
