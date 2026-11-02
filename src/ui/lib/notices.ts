import type { UiAccountInView } from "../../shared/contracts/ui-playlists"
import type { UiTabFacts } from "../../shared/contracts/ui-pages"
import type { Site } from "../../shared/contracts/vocabulary"
import { CONSENT_VERSION } from "../../shared/model/documents"
import type { PageView } from "../../shared/model/page-view"
import type { AccountKey } from "../../shared/model/validation"
import type { ClaimNotice } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import { needsAccess, type SiteAccess } from "./held"

type View = Extract<PageView, { kind: "view" }>
/**
 * The popup's banners and settings' connection strip, from one list (UI-POP-10, UI-SET-02). The popup shows the
 * first that applies; settings shows them all. Each says what applies, never the copy, so copy loads only with it.
 */
export type Banner =
  | { readonly kind: "newer-version" }
  | { readonly kind: "upgrade"; readonly carried: "both" | "auto-add" | "shortcut" | "nothing" }
  | { readonly kind: "consent" }
  | { readonly kind: "consent-version"; readonly version: number }
  | { readonly kind: "access"; readonly site: Site }
  | { readonly kind: "signed-out" }
  | { readonly kind: "private"; readonly setup: "in-use" | "none"; readonly acct: AccountKey | null }
  | { readonly kind: "no-tab"; readonly site: Site; readonly at: number | null }
  | { readonly kind: "sync"; readonly status: "waiting" | "full" | "update-needed" }
  | { readonly kind: "marks"; readonly count: number }
  | { readonly kind: "unclaimed" }
  | { readonly kind: "claimed"; readonly notice: Snapshot<ClaimNotice> }
  | { readonly kind: "reset"; readonly id: string }
export type BannerTone = "attention" | "info" | "done"
export const bannerTone = {
  "newer-version": "attention", upgrade: "attention", consent: "attention", "consent-version": "attention", access: "attention",
  "signed-out": "info", private: "info", "no-tab": "info", sync: "attention", marks: "attention", unclaimed: "attention", claimed: "done", reset: "info"
} as const satisfies Record<Banner["kind"], BannerTone>

export type NoticeFacts = {
  readonly view: View
  /** The sites whose access and tab rows apply: the popup's selected tab, or both in settings. */
  readonly sites: readonly Site[]
  readonly tab: UiTabFacts | null
  readonly account: UiAccountInView | null
  readonly access: SiteAccess | null
  readonly private: boolean
  /** The received reset this browser's pages already showed with OK, which they remember themselves. */
  readonly resetSeen?: string | null
}
/** KEY for the received reset's OK, kept by the extension pages, so the notice shows until it's dismissed once (DATA-40). */
export const RESET_SEEN_KEY = "perchling.resetSeen"
/** The reset another browser's ticked Clear all sent here, which the store keeps in the local sync record (DATA-40). */
export function receivedReset(view: View): string | null {
  const received: unknown = view.sync ? (view.sync as { readonly resetReceived?: unknown }).resetReceived : undefined
  return received !== null && typeof received === "object" && typeof (received as { id?: unknown }).id === "string" ? (received as { id: string }).id : null
}

function carried(view: View): Extract<Banner, { kind: "upgrade" }>["carried"] {
  const details = view.device.kind === "current" ? view.device.device.upgradeNote?.details : undefined
  const autoAdd = (details?.autoAdd.kept ?? 0) > 0
  const shortcut = details !== undefined && (details.shortcut.playlist || details.shortcut.key !== null)
  return autoAdd && shortcut ? "both" : autoAdd ? "auto-add" : shortcut ? "shortcut" : "nothing"
}
export function accountKeyOf(account: UiAccountInView | null): AccountKey | null {
  return account?.kind === "account" ? account.acct : null
}

export function banners(facts: NoticeFacts): Banner[] {
  const { view } = facts
  if (view.layout === "newer-version" || view.device.kind === "newer-version" || view.settings.kind === "newer-version") return [{ kind: "newer-version" }]
  const device = view.device.kind === "current" ? view.device.device : null
  const result: Banner[] = []
  if (device?.upgradeNote?.state === "pending") result.push({ kind: "upgrade", carried: carried(view) })
  else if (!device?.consent) result.push({ kind: "consent" })
  else if (device.consent.v < CONSENT_VERSION) result.push({ kind: "consent-version", version: CONSENT_VERSION })
  if (!device?.consent) return result
  const reset = receivedReset(view)
  if (reset !== null && reset !== facts.resetSeen) result.push({ kind: "reset", id: reset })
  const settings = view.settings.kind === "value" ? view.settings.settings : null
  for (const site of facts.sites) {
    if (settings && facts.access && !facts.access[site] && needsAccess(site, settings)) result.push({ kind: "access", site })
  }
  const acct = accountKeyOf(facts.account)
  const setup = acct ? view.setups.find(entry => entry.acct === acct) : undefined
  if (facts.tab?.kind === "site" && !facts.tab.signedIn && facts.sites.includes(facts.tab.site)) result.push({ kind: "signed-out" })
  if (facts.private && acct) result.push({ kind: "private", setup: setup ? "in-use" : "none", acct })
  // The account in view is YouTube's. YouTube Music's tab row belongs to Playing now (UI-POP-17).
  const tabless = facts.account?.kind === "none" || facts.account?.kind === "account" && facts.account.source === "last-account"
  if (tabless && facts.sites.includes("www")) result.push({ kind: "no-tab", site: "www", at: setup?.cache?.listAt ?? null })
  const status = view.sync?.status
  if (device.syncOn && (status === "waiting" || status === "full" || status === "update-needed")) result.push({ kind: "sync", status })
  const marks = setup ? Object.keys(setup.setup.marks).length : 0
  if (marks > 0) result.push({ kind: "marks", count: marks })
  if (view.unclaimed && acct && !view.setups.some(entry => entry.acct === acct)) result.push({ kind: "unclaimed" })
  // The claim result shows once, in a normal window, until OK (ACC-32).
  if (device.claimNotice && !facts.private) result.push({ kind: "claimed", notice: device.claimNotice })
  return result
}
