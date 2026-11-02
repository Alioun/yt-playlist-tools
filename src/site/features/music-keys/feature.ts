import type { Key } from "../../../shared/model"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { MusicItems } from "../../core/items-music"
import type { Keys } from "../../core/keys"
import type { Dispose } from "../../core/scope"
import type { MusicQuick } from "../../kit/music/quick"
import type { QuickAction } from "../../music/actions"

export type MusicKeyServices = {
  readonly items: Pick<MusicItems, "track">
  readonly keys: Pick<Keys, "register">
  readonly quick: Pick<MusicQuick, "press">
}

function options(view: SiteView<"music"> | null) {
  const feature = view?.features.find(entry => entry.id === "music-keys")
  return feature?.id === "music-keys" ? feature.options : undefined
}

/**
 * Quick-action shortcuts (03 §12): one key per quick action, on the pointed-at item, else the playing song. The
 * kit's quick actions answer every press, a key whose action can't run here included (YM-KEY-12).
 */
function start(context: FeatureContext<"music", MusicKeyServices>): void {
  const { scope, view, items, keys, quick } = context
  items.track(scope)
  let bound: Dispose[] = []
  let signature: string | null = null

  function bind() {
    const settings = options(view.read())
    const entries = settings ? (Object.entries(settings.keys) as [QuickAction, Key | null][]).filter((entry): entry is [QuickAction, Key] => entry[1] !== null) : []
    const next = settings ? JSON.stringify(entries) : null
    if (next === signature) return
    signature = next
    for (const release of bound.splice(0)) release()
    for (const [action, key] of entries) {
      bound.push(keys.register(scope, { target: { kind: "music", action }, run: async () => {
        const feedback = options(view.read())?.feedback
        if (feedback !== undefined) await quick.press(action, { opener: "music-keys", feedback, by: "key", key })
      } }, { kind: "enabled", key }).release)
    }
  }
  view.subscribe(bind)
  bind()
}

export const musicKeys: FeatureDefinition<"music", MusicKeyServices> = { id: "music-keys", start }
