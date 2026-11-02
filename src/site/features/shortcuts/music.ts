import type { I18n } from "../../../shared/i18n"
import type { Key, ShortcutId } from "../../../shared/model"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { MusicItems } from "../../core/items-music"
import type { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import type { Feedback } from "../../kit/feedback"
import { brokenKeyText, statusOf } from "../../kit/music/actions"
import type { MusicQuick } from "../../kit/music/quick"

export type MusicShortcutServices = {
  readonly document: Document
  readonly items: Pick<MusicItems, "track">
  readonly keys: Pick<Keys, "register">
  readonly quick: Pick<MusicQuick, "pressShortcut">
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "shortcuts"): void }
  readonly os: "macos" | "windows" | "linux"
}
type Entry = { readonly id: ShortcutId; readonly key: Key; readonly label: string; readonly watchLaterOnEveryAccount: boolean }

const ignore = () => {}

function options(view: SiteView<"music"> | null) {
  const feature = view?.features.find(entry => entry.id === "shortcuts")
  return feature?.id === "shortcuts" ? feature.options : undefined
}

/**
 * Playlist shortcuts with "Also on YouTube Music" (03 §18). The tab view lists the feature here only while that
 * option is on. The picker key stays on YouTube; Quick-action shortcuts' Save… key does its job here (YM-PS-7).
 */
function start(context: FeatureContext<"music", MusicShortcutServices>): void {
  const { scope, view, document, items, keys, quick, i18n, notices } = context
  items.track(scope)
  let bound: Scope | null = null
  let signature: string | null = null

  async function save(entry: Entry) {
    const current = view.read(), settings = options(current)
    const feedback = context.feedback.use(scope)
    if (!current || !settings || !feedback) return
    const status = statusOf(current, "shortcuts")
    const broken = brokenKeyText(status, "save", entry.key, i18n, context.os)
    if (broken) {
      if (status?.state === "not-working") notices.wouldAct("shortcuts")
      feedback.toaster.show({ text: broken, tone: "failure", auto: false, action: null })
      return
    }
    await quick.pressShortcut(entry, { opener: "shortcuts", feedback: settings.feedback, by: "key" })
  }

  function bind() {
    const settings = options(view.read())
    const entries = (settings?.list ?? []).flatMap(row => row.key ? [{ ...row, id: row.id as ShortcutId, key: row.key as Key }] : [])
    const next = settings ? JSON.stringify(entries) : null
    if (next === signature) return
    signature = next
    bound?.dispose()
    bound = null
    if (!settings) return
    const child = new Scope({ document, onError: ignore })
    scope.add(() => child.dispose())
    bound = child
    for (const entry of entries) keys.register(child, { target: { kind: "playlist", id: entry.id }, run: () => save(entry) }, { kind: "enabled", key: entry.key })
  }
  view.subscribe(bind)
  bind()
}

export const shortcutsMusic: FeatureDefinition<"music", MusicShortcutServices> = { id: "shortcuts", start }
