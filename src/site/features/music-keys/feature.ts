import type { I18n } from "../../../shared/i18n"
import type { Key } from "../../../shared/model"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { MusicItems } from "../../core/items-music"
import type { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import type { Feedback } from "../../kit/feedback"
import { brokenKeyText, statusOf, type QuickAction } from "../../kit/music/actions"
import type { MusicQuick } from "../../kit/music/quick"

export type MusicKeyServices = {
  readonly document: Document
  readonly items: Pick<MusicItems, "track">
  readonly keys: Pick<Keys, "register">
  readonly quick: Pick<MusicQuick, "press">
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "music-keys"): void }
  readonly os: "macos" | "windows" | "linux"
}

const ignore = () => {}

function options(view: SiteView<"music"> | null) {
  const feature = view?.features.find(entry => entry.id === "music-keys")
  return feature?.id === "music-keys" ? feature.options : undefined
}

/** Quick-action shortcuts (03 §12): one key per quick action, on the pointed-at item, else the playing song. */
function start(context: FeatureContext<"music", MusicKeyServices>): void {
  const { scope, view, document, items, keys, quick, i18n, notices } = context
  items.track(scope)
  let bound: Scope | null = null
  let signature: string | null = null

  async function run(action: QuickAction, key: Key) {
    const current = view.read(), settings = options(current)
    const feedback = context.feedback.use(scope)
    if (!current || !settings || !feedback) return
    const status = statusOf(current, "music-keys")
    const broken = brokenKeyText(status, action, key, i18n, context.os)
    if (broken) {
      if (status?.state === "not-working") notices.wouldAct("music-keys")
      feedback.toaster.show({ text: broken, tone: "failure", auto: false, action: null })
      return
    }
    await quick.press(action, { opener: "music-keys", feedback: settings.feedback, by: "key" })
  }

  function bind() {
    const settings = options(view.read())
    const entries = settings ? (Object.entries(settings.keys) as [QuickAction, Key | null][]).filter((entry): entry is [QuickAction, Key] => entry[1] !== null) : []
    const next = settings ? JSON.stringify(entries) : null
    if (next === signature) return
    signature = next
    bound?.dispose()
    bound = null
    if (!settings) return
    const child = new Scope({ document, onError: ignore })
    scope.add(() => child.dispose())
    bound = child
    for (const [action, key] of entries) {
      keys.register(child, { target: { kind: "music", action }, run: () => run(action, key) }, { kind: "enabled", key })
    }
  }
  view.subscribe(bind)
  bind()
}

export const musicKeys: FeatureDefinition<"music", MusicKeyServices> = { id: "music-keys", start }
