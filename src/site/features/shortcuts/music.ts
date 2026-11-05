import type { Key, ShortcutId } from "../../../shared/model"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { MusicItems } from "../../core/items-music"
import type { Keys } from "../../core/keys"
import type { Dispose } from "../../core/scope"
import type { MusicQuick } from "../../kit/music/quick"

export type MusicShortcutServices = {
  readonly items: Pick<MusicItems, "track">
  readonly keys: Pick<Keys, "register">
  readonly quick: Pick<MusicQuick, "pressShortcut">
}

function options(view: SiteView<"music"> | null) {
  const feature = view?.features.find(entry => entry.id === "shortcuts")
  return feature?.id === "shortcuts" ? feature.options : undefined
}

/**
 * Playlist shortcuts with "Also on YouTube Music" (03 §18). The tab view lists the feature here only while that
 * option is on. The picker key stays on YouTube; Quick-action shortcuts' Save… key does its job here (YM-PS-7).
 */
function start(context: FeatureContext<"music", MusicShortcutServices>): void {
  const { scope, view, items, keys, quick } = context
  items.track(scope)
  let bound: Dispose[] = []
  let signature: string | null = null

  function bind() {
    const settings = options(view.read())
    const entries = (settings?.list ?? []).flatMap(row => row.key ? [{ ...row, id: row.id as ShortcutId, key: row.key as Key }] : [])
    const next = settings ? JSON.stringify(entries) : null
    if (next === signature) return
    signature = next
    for (const release of bound.splice(0)) release()
    for (const entry of entries) {
      bound.push(keys.register(scope, { target: { kind: "playlist", id: entry.id }, run: async () => {
        const feedback = options(view.read())?.feedback
        if (feedback !== undefined) await quick.pressShortcut(entry, { opener: "shortcuts", feedback, by: "key" })
      } }, { kind: "enabled", key: entry.key }).release)
    }
  }
  view.subscribe(bind)
  bind()
}

export const shortcutsMusic: FeatureDefinition<"music", MusicShortcutServices> = { id: "shortcuts", start }
