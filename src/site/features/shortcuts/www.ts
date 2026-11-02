import type { ShortcutId, PlaylistId, Key, VideoId } from "../../../shared/model"
import { wwwHintText, type WwwHint } from "../../../shared/copy"
import type { I18n } from "../../../shared/i18n"
import type { TabActions } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { WwwItems } from "../../core/items-www"
import type { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import type { Feedback } from "../../kit/feedback"
import { pickerAnchor, type Popovers } from "../../popovers/types"
import { explicitAdd, explicitContent, type ExplicitContext } from "../../explicit"

export type ShortcutServices = {
  readonly document: Document
  readonly items: Pick<WwwItems, "track" | "resolve">
  readonly keys: Pick<Keys, "register">
  readonly actions: TabActions
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "shortcuts"): void }
  /** Loads `popovers.js`, null when it didn't load within 5 s (YT-PK-11). */
  readonly popovers: () => Promise<Popovers | null>
  readonly location: Pick<Location, "href" | "assign">
}
type Target = { readonly video: VideoId; readonly title: string | undefined; readonly element: Element | null }

const ignore = () => {}

function feature(view: SiteView<"www"> | null) {
  const found = view?.features.find(entry => entry.id === "shortcuts")
  return found?.id === "shortcuts" ? found : undefined
}

function start(context: FeatureContext<"www", ShortcutServices>): void {
  const { scope, view, document, items, keys, actions, i18n, notices } = context
  items.track(scope)
  let bound: Scope | null = null
  let signature: string | null = null

  function session(): Feedback | null { return context.feedback.use(scope) }
  function explicit(feedback: Feedback): ExplicitContext { return { session: feedback, actions, i18n, location: context.location } }
  function hint(feedback: Feedback, value: WwwHint) {
    feedback.toaster.show({ text: wwwHintText(value, i18n), tone: value.kind === "unrecognised-item" ? "failure" : "hint", auto: false, action: null })
  }
  // The pointed-at item, else the current video. An unsupported or unrecognised item never falls back (YT-KEY-16, YT-ITEM-07).
  async function target(feedback: Feedback): Promise<Target | null> {
    const resolved = await items.resolve()
    switch (resolved.kind) {
      case "pointed-item": return { video: resolved.video.videoId, title: resolved.video.title || undefined, element: resolved.target.element }
      case "current-video": return { video: resolved.video.videoId, title: resolved.video.title || undefined, element: null }
      case "unsupported-item": hint(feedback, { kind: "unsupported-item", reason: resolved.reason }); return null
      case "unrecognised-item": hint(feedback, { kind: "unrecognised-item" }); return null
      case "inactive": return null
      default: hint(feedback, { kind: "no-pointed-item" }); return null
    }
  }
  function working(current: SiteView<"www">): boolean {
    if (current.statuses.find(status => status.feature === "shortcuts")?.state !== "not-working") return true
    notices.wouldAct("shortcuts")
    return false
  }
  async function openPicker(feedback: Feedback, video: VideoId, title: string | undefined, element: Element | null, shortcut: ShortcutId | null) {
    const popovers = await context.popovers()
    if (scope.disposed) return
    if (!popovers) {
      feedback.toaster.show({ text: i18n.message("picker_loadFailed"), tone: "failure", auto: false, action: null })
      return
    }
    popovers.openPicker({ video, ...(title ? { title } : {}), anchor: pickerAnchor(document, element),
      mode: shortcut ? { kind: "choose", shortcut } : { kind: "save" }, opener: "shortcuts" })
  }

  async function save(id: ShortcutId) {
    const current = view.read(), options = feature(current)
    const feedback = session()
    if (!current || !options || !feedback || !working(current)) return
    const found = await target(feedback)
    if (!found || scope.disposed) return
    const shortcut = options.options.list.find(entry => entry.id === id)
    const setup = current.setup?.kind === "live" ? current.setup.setup : null
    const playlist = shortcut?.watchLaterOnEveryAccount ? "WL" : setup?.targets[id]
    await explicitAdd(explicit(feedback), {
      feedback: options.options.feedback, keyWithoutButton: true, pending: playlist ? [playlist as PlaylistId] : [],
      titles: { ...(found.title ? { video: found.title } : {}), ...(shortcut?.label ? { shortcut: shortcut.label } : {}),
        ...(setup?.label?.name ? { account: setup.label.name } : {}) },
      handlers: {
        choose: () => { void openPicker(feedback, found.video, found.title, found.element, id) },
        retry: () => { void save(id) }
      }
    }, () => actions.add({ site: "www", video: found.video, via: "shortcut", shortcut: id }))
  }

  async function pick() {
    const current = view.read()
    const feedback = session()
    if (!current || !feedback || !working(current)) return
    const found = await target(feedback)
    if (!found || scope.disposed) return
    if (!current.signedIn) {
      const signedOut = explicitContent(explicit(feedback), { kind: "signed-out" }, {}, {})
      if (signedOut) feedback.toaster.show(signedOut)
      return
    }
    await openPicker(feedback, found.video, found.title, found.element, null)
  }

  function bind() {
    const options = feature(view.read())?.options
    const next = options ? JSON.stringify([options.list.map(entry => [entry.id, entry.key]), options.picker]) : null
    if (next === signature) return
    signature = next
    bound?.dispose()
    bound = null
    if (!options) return
    const child = new Scope({ document, onError: ignore })
    scope.add(() => child.dispose())
    bound = child
    for (const entry of options.list) {
      if (!entry.key) continue
      const id = entry.id as ShortcutId
      keys.register(child, { target: { kind: "playlist", id }, run: () => save(id) }, { kind: "enabled", key: entry.key as Key })
    }
    if (options.picker) keys.register(child, { target: { kind: "picker" }, run: () => pick() }, { kind: "enabled", key: options.picker as Key })
  }
  view.subscribe(bind)
  bind()
}

export const shortcutsWww: FeatureDefinition<"www", ShortcutServices> = { id: "shortcuts", start }
