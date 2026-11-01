import type { DueNotice } from "../../../shared/contracts/tab-view"
import type { FeatureDefinition, SiteView } from "../../core/feature-host"
import type { PageLink } from "../../core/page-link"
import { cardMenuFeature, decideCardMenu, type CardMenuDecision, type CardMenuKeep, type CardMenuServices } from "./card-menu"

declare const link: PageLink
declare const event: MouseEvent
declare const wwwView: SiteView<"www">
declare const musicView: SiteView<"music">

export const definitionControl: FeatureDefinition<"www", CardMenuServices> = cardMenuFeature
export const servicesControl: CardMenuServices = { document, page: link, notice: { request(due) { void due } } }
export const decisionControl: CardMenuDecision = decideCardMenu(event, wwwView, servicesControl)
export const keepControl: CardMenuDecision = { kind: "keep", reason: "shift" }
export const dueControl: DueNotice = { kind: "not-working", features: ["card-menu"] }
servicesControl.notice.request(dueControl)

// @ts-expect-error music-site-definition
export const musicDefinition: FeatureDefinition<"music", CardMenuServices> = cardMenuFeature
// @ts-expect-error services-require-document
export const missingDocument: CardMenuServices = { page: link, notice: { request() {} } }
// @ts-expect-error page-requires-state
export const missingState: CardMenuServices = { document, page: { run: link.run }, notice: { request() {} } }
// @ts-expect-error notice-requires-due-notice
servicesControl.notice.request({ kind: "partly-working", features: ["card-menu"] })
// @ts-expect-error open-requires-target
export const openWithoutTarget: CardMenuDecision = { kind: "open" }
// @ts-expect-error keep-reason-is-closed
export const silentReason: CardMenuKeep = "silent"
// @ts-expect-error decision-requires-www-view
export const musicDecision = decideCardMenu(event, musicView, servicesControl)
