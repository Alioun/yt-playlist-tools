import type { JobOf } from "../../../shared/contracts"
import type { QueueButtonText, QueueButtonToast } from "../../../shared/copy"
import type { ToastPlan } from "../../../shared/rules/outcomes"
import { toastPlan } from "$kit"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { WwwItems, WwwItemTarget, WwwPointed } from "../../core/items-www"
import type { PageLink } from "../../core/page-link"
import type { Dispose, Scope } from "../../core/scope"
import type { Feedback } from "../../kit/feedback"
import type { OverlayAnchor, OverlayKit } from "../../kit/overlay"
import type { ToastContent, ToastHandle } from "../../kit/toaster/types"
import type { ThumbnailCorner } from "../../../shared/model/validation"
import { glyph } from "./glyphs"
import { busy, failedForMs, idle, outcomeOf, pageOutcomes, settled, toastOf, visuals, type QueueEntry, type QueueOutcome } from "./model"

export interface QueueNotices {
  wouldAct(feature: "queue-button"): void
}
export type QueueButtonServices = {
  readonly document: Document
  readonly items: Pick<WwwItems, "track" | "readPointed" | "recognise">
  readonly page: Pick<PageLink, "run" | "watch" | "onState">
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly overlay: Pick<OverlayKit, "use">
  readonly text: QueueButtonText
  readonly notices: QueueNotices
}
type Authority = { readonly feedback: boolean; readonly working: boolean; readonly corner: ThumbnailCorner }
type Shown = { readonly target: WwwItemTarget; readonly link: HTMLElement; readonly checks: Dispose[] }

export const nativeQueue = "[aria-label='Add to queue']"
export const recheckAfterMs = [150, 900] as const
const thumbnails = "a#thumbnail, a.yt-lockup-view-model__content-image, a.ytLockupViewModelContentImage, a.ytd-thumbnail"
const titles = "#video-title, #video-title-link, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title, h3"
const players = "#movie_player, #shorts-player, ytd-player, ytd-miniplayer, .html5-video-player"
const tones = { added: "confirmation", unconfirmed: "hint", failed: "failure" } as const satisfies Record<QueueButtonToast, ToastPlan["tone"]>
const nothing: Dispose = () => {}
const fail = (message: string): never => { throw new Error(message) }

function authority(view: SiteView<"www"> | null): Authority | null {
  const feature = view?.features.find(entry => entry.id === "queue-button")
  if (!view || !feature || feature.id !== "queue-button") return null
  const status = view.statuses.find(entry => entry.feature === "queue-button")
  return { feedback: feature.options.feedback, working: status?.state !== "not-working", corner: feature.options.corner }
}
function supported(pointed: WwwPointed): WwwItemTarget | null {
  if (pointed.kind !== "pointed-item") return null
  const target = pointed.target
  return target.family !== "shorts" && target.identity.kind === "video" ? target : null
}
function sameItem(a: WwwItemTarget, b: WwwItemTarget): boolean {
  return a.element === b.element && a.family === b.family && a.identity.videoId === b.identity.videoId &&
    a.identity.kind === b.identity.kind && a.identity.signature === b.identity.signature
}
function thumbnailOf(target: WwwItemTarget): HTMLElement | null {
  const realm = target.element.ownerDocument.defaultView
  if (!realm) return null
  for (const link of target.element.querySelectorAll(thumbnails)) {
    if (link.closest(players) || !(link instanceof realm.HTMLElement)) continue
    const href = link.getAttribute("href")
    if (href === null) continue
    try {
      const url = new URL(href, "https://www.youtube.com/")
      if (url.pathname === "/watch" && url.searchParams.get("v") === target.identity.videoId) return link
    } catch { continue }
  }
  return null
}
function titleOf(target: WwwItemTarget): string | undefined {
  return target.element.querySelector(titles)?.textContent?.trim() || undefined
}
function start(context: FeatureContext<"www", QueueButtonServices>): void {
  const { scope, view, document, items, page, overlay, text, notices } = context
  const lease = overlay.use(scope, "queue") ?? fail("Queue overlay slot is unavailable")
  items.track(scope)
  const outcomes = pageOutcomes()
  const button = document.createElement("button")
  button.type = "button"
  button.className = "button"
  lease.slot.append(button)
  let shown: Shown | null = null
  let noticed = false

  function conceal() {
    const current = shown
    shown = null
    if (current) for (const cancel of current.checks) cancel()
    lease.hideTooltip()
    lease.place(null)
  }
  function anchorOf(current: Shown): OverlayAnchor | null {
    const allowed = authority(view.read())
    if (!allowed || current.target.element.querySelector(nativeQueue)) return null
    return { kind: "thumbnail", link: current.link, corner: allowed.corner }
  }
  function current(): Shown | null {
    const value = shown
    if (!value) return null
    const fresh = value.target.element.isConnected ? supported(items.recognise(value.target.element)) : null
    if (!fresh || !sameItem(fresh, value.target) || !value.link.isConnected) { conceal(); return null }
    return value
  }
  function render() {
    const value = current()
    if (!value) return
    const allowed = authority(view.read())
    if (!allowed?.working) { conceal(); return }
    const state = outcomes.read(value.target.identity.videoId).kind
    const visual = visuals[state]
    button.dataset.state = state
    button.setAttribute("aria-label", text.label(visual.label))
    button.setAttribute("aria-disabled", String(!visual.sends))
    button.replaceChildren(glyph(document, visual.glyph))
  }
  function place(value: Shown) {
    if (shown !== value || !current()) return
    const anchor = anchorOf(value)
    lease.place(anchor)
    render()
  }
  function show(target: WwwItemTarget) {
    conceal()
    const link = thumbnailOf(target)
    if (!link) return
    const value: Shown = { target, link, checks: [] }
    shown = value
    for (const ms of recheckAfterMs) value.checks.push(scope.timeout(() => place(value), ms))
    place(value)
  }
  function refresh() {
    if (scope.disposed) return
    const target = supported(items.readPointed())
    if (!target) { conceal(); return }
    const allowed = authority(view.read())
    if (!allowed) { conceal(); return }
    if (!allowed.working) {
      conceal()
      if (!noticed) { noticed = true; notices.wouldAct("queue-button") }
      return
    }
    if (shown && sameItem(shown.target, target) && current()) return
    show(target)
  }
  function announce(outcome: QueueOutcome, title: string | undefined, video: WwwItemTarget["identity"]["videoId"], revision: number, feedback: boolean) {
    const kind = toastOf(outcome, feedback)
    if (!kind) return
    const session = context.feedback.use(scope)
    if (!session) return
    let handle: ToastHandle | null = null
    const entry = outcome.kind === "confirmed" ? outcome.entry : null
    const action = kind === "added" && entry ? session.action("undo", () => undo(session, entry, video, revision, () => handle)) : null
    const content: ToastContent = { text: text.toast(kind, title), tone: tones[kind], auto: false, action }
    handle = session.toaster.show(content)
  }
  async function undo(session: Feedback, entry: QueueEntry, video: WwwItemTarget["identity"]["videoId"], revision: number, handle: () => ToastHandle | null): Promise<ToastContent | null> {
    const answer = await page.run<JobOf<"queueUndo">>({ job: { kind: "queueUndo", listId: entry.listId, setVideoId: entry.setVideoId } })
    if (scope.disposed) return null
    if (!answer.ok) {
      const plan = toastPlan({ kind: "undo-failed" }, true)
      if (!plan) throw new Error("Canonical Undo failure plan unavailable")
      return session.format(plan, {}, null)
    }
    handle()?.release()
    const state = outcomes.read(video)
    if (outcomes.revision === revision && state.kind === "added" && state.entry === entry) { outcomes.write(video, idle); render() }
    return null
  }
  async function invoke() {
    const value = current()
    if (!value) return
    const target = supported(items.readPointed())
    if (!target || !sameItem(target, value.target)) { refresh(); return }
    const allowed = authority(view.read())
    if (!allowed?.working) return
    const video = target.identity.videoId
    if (!visuals[outcomes.read(video).kind].sends) return
    const revision = outcomes.revision
    const title = titleOf(target)
    outcomes.write(video, busy)
    render()
    const answer = await page.run<JobOf<"queueAdd">>({ job: { kind: "queueAdd" } }, { target: target.element })
    if (scope.disposed) return
    const after = authority(view.read())
    if (!after) return
    const outcome = outcomeOf(answer)
    if (outcomes.revision === revision) {
      const next = settled(outcome)
      outcomes.write(video, next)
      if (next.kind === "failed") scope.timeout(() => {
        if (outcomes.revision === revision && outcomes.read(video) === next) { outcomes.write(video, idle); render() }
      }, failedForMs)
      render()
    }
    announce(outcome, title, video, revision, after.feedback)
  }

  let stopNav: Dispose = nothing
  scope.add(page.onState(state => {
    if (scope.disposed) return
    if (state.kind !== "ready") {
      stopNav(); stopNav = nothing
      outcomes.reset(); conceal()
      return
    }
    if (stopNav === nothing) stopNav = scope.add(page.watch("nav", () => { outcomes.reset(); render() }))
  }))
  scope.add(() => { stopNav(); conceal() })
  view.subscribe(() => { if (shown) place(shown) })
  lease.tooltip(button, () => {
    const value = shown
    return text.label(visuals[value ? outcomes.read(value.target.identity.videoId).kind : "idle"].label)
  })
  scope.on(button, "click", () => { void invoke() })
  scope.on(document, "pointerover", refresh, { capture: true, passive: true })
  scope.on(document, "focusin", refresh, true)
  scope.on(document, "pointerout", event => { if (event.relatedTarget === null) conceal() }, true)
  scope.on(document, "fullscreenchange", refresh)
}

export const queueButton: FeatureDefinition<"www", QueueButtonServices> = { id: "queue-button", start }
