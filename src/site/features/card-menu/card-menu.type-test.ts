import type { FeatureDefinition, SiteView } from "../../core/feature-host"
import type { WwwItems } from "../../core/items-www"
import type { PageLink } from "../../core/page-link"
import { cardMenuFeature, decideCardMenu, type CardMenuDecision, type CardMenuKeep, type CardMenuServices } from "./card-menu"

declare const link: PageLink
declare const items: Pick<WwwItems, "recognise" | "linkedVideo">
declare const event: MouseEvent
declare const wwwView: SiteView<"www">
declare const musicView: SiteView<"music">

export const definitionControl: FeatureDefinition<"www", CardMenuServices> = cardMenuFeature
export const servicesControl: CardMenuServices = { document, items, page: link, notices: { wouldAct(feature) { void feature } } }
export const decisionControl: CardMenuDecision = decideCardMenu(event, wwwView, servicesControl)
export const keepControl: CardMenuDecision = { kind: "keep", reason: "shift" }
servicesControl.notices.wouldAct("card-menu")

// @ts-expect-error music-site-definition
export const musicDefinition: FeatureDefinition<"music", CardMenuServices> = cardMenuFeature
// @ts-expect-error services-require-document
export const missingDocument: CardMenuServices = { items, page: link, notices: { wouldAct() {} } }
// @ts-expect-error page-requires-state
export const missingState: CardMenuServices = { document, items, page: { run: link.run }, notices: { wouldAct() {} } }
// @ts-expect-error notice-names-the-card-menu
servicesControl.notices.wouldAct("queue-button")
// @ts-expect-error open-requires-target
export const openWithoutTarget: CardMenuDecision = { kind: "open" }
// @ts-expect-error keep-reason-is-closed
export const silentReason: CardMenuKeep = "silent"
// @ts-expect-error decision-requires-www-view
export const musicDecision = decideCardMenu(event, musicView, servicesControl)
