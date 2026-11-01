import type { DueNotice, WwwFeature } from "../../../shared/contracts/tab-view"
import { cardMenuButtons } from "../../../shared/youtube/card-menu-buttons"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import { linkedVideo, recogniseWwwItem, type WwwItemTarget, type WwwPointed } from "../../core/items-www"
import type { PageLink } from "../../core/page-link"

export interface CardMenuNotice {
  request(due: DueNotice): void
}
export type CardMenuServices = {
  readonly document: Document
  readonly page: Pick<PageLink, "run" | "state">
  readonly notice: CardMenuNotice
}
export type CardMenuContext = FeatureContext<"www", CardMenuServices>
export type CardMenuKeep =
  | "handled" | "shift" | "revoked" | "not-working" | "page-not-ready" | "no-card" | "unsupported"
  | "unrecognised" | "detached" | "link" | "channel" | "own-link" | "no-button" | "foreign-button"
export type CardMenuDecision =
  | { readonly kind: "open"; readonly target: WwwItemTarget }
  | { readonly kind: "keep"; readonly reason: CardMenuKeep }

const channelParts = "ytd-channel-name, #channel-name, #channel-info, #avatar, #avatar-link, #avatar-container, " +
  "yt-decorated-avatar-view-model, yt-avatar-shape, .yt-lockup-metadata-view-model__avatar"
const links = "a[href], area[href]"
const keep = (reason: CardMenuKeep): CardMenuDecision => ({ kind: "keep", reason })

function cardPart(path: readonly Element[]): WwwPointed {
  for (const element of path) {
    const result = recogniseWwwItem(element)
    if (result.kind !== "no-pointed-item" || result.reason === "player") return result
  }
  return { kind: "no-pointed-item", reason: "ordinary" }
}
function hiddenWithin(element: Element, card: Element): boolean {
  for (let node: Element | null = element; node && node !== card; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true
  }
  return false
}
function ownMenuButton(target: WwwItemTarget): HTMLElement | "foreign" | undefined {
  for (const selector of cardMenuButtons) {
    const button = target.element.querySelector(selector)
    if (!(button instanceof HTMLElement) || !button.isConnected) continue
    const owner = recogniseWwwItem(button)
    if (owner.kind !== "pointed-item" || owner.target.element !== target.element) return "foreign"
    if (button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true" || hiddenWithin(button, target.element)) return undefined
    return button
  }
  return undefined
}

export function decideCardMenu(event: MouseEvent, view: SiteView<"www"> | null, services: CardMenuServices): CardMenuDecision {
  if (event.defaultPrevented) return keep("handled")
  if (event.shiftKey) return keep("shift")
  const feature = view?.features.find((entry): entry is Extract<WwwFeature, { id: "card-menu" }> => entry.id === "card-menu")
  if (!view || !feature) return keep("revoked")
  if (view.statuses.some(status => status.feature === "card-menu" && status.state === "not-working")) return keep("not-working")
  if (services.page.state.kind !== "ready") return keep("page-not-ready")
  const path = event.composedPath().filter((node): node is Element => node instanceof Element)
  const pointed = cardPart(path)
  if (pointed.kind === "unsupported-item") return keep("unsupported")
  if (pointed.kind === "unrecognised-item") return keep("unrecognised")
  if (pointed.kind === "no-pointed-item") return keep("no-card")
  const target = pointed.target
  const card = path.indexOf(target.element)
  if (!target.element.isConnected || target.element.ownerDocument !== services.document || card < 0) return keep("detached")
  for (const [index, element] of path.entries()) {
    if (index < card && element.matches(channelParts)) return keep("channel")
    if (!element.matches(links)) continue
    if (linkedVideo(element)?.videoId !== target.identity.videoId) return keep("link")
    if (feature.options.keepLinkMenu) return keep("own-link")
  }
  const button = ownMenuButton(target)
  if (button === "foreign") return keep("foreign-button")
  if (!button) return keep("no-button")
  return { kind: "open", target }
}

function dueNotice(view: SiteView<"www"> | null): DueNotice | undefined {
  return view?.notices.find(notice => notice.features.includes("card-menu"))
}

export const cardMenuFeature: FeatureDefinition<"www", CardMenuServices> = {
  id: "card-menu",
  start(context: CardMenuContext): void {
    const { scope, view, document, page, notice } = context
    let requested = false
    view.subscribe(next => { if (!dueNotice(next)) requested = false })
    scope.on(document, "contextmenu", event => {
      const current = view.read()
      const decision = decideCardMenu(event, current, context)
      if (decision.kind === "keep") {
        const due = decision.reason === "not-working" ? dueNotice(current) : undefined
        if (due && !requested) {
          requested = true
          notice.request(due)
        }
        return
      }
      event.preventDefault()
      void page.run({ job: { kind: "openCardMenu", videoId: decision.target.identity.videoId } }, { target: decision.target.element }).catch(() => undefined)
    }, { capture: true })
  }
}
