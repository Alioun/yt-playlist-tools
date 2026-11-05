import type { FeatureId } from "../../shared/contracts/vocabulary"

/** What the toolbar icon knows (FT-57, FT-58, UI-IA-08, YT-AA-42). */
export type BadgeFacts = {
  /** Consent or the upgrade note is pending, a new consent version included. */
  readonly consentPending: boolean
  /** Site access is missing for a site with something on that needs it. */
  readonly accessMissing: boolean
  /** Playlists marked Missing or Full in a setup. */
  readonly marks: boolean
  /** Auto-add is on and paused, and "Show on the toolbar icon while auto-add is paused" is on. */
  readonly paused: boolean
  /** Per tab: the features not working there. */
  readonly notWorking: ReadonlyMap<number, readonly FeatureId[]>
  /** Tabs whose current video auto-add added, while the tick setting is on. */
  readonly ticked: ReadonlySet<number>
}
export type BadgeColor = "violet" | "amber" | "slate" | "teal" | "crimson"
export type Badge =
  | { readonly text: ""; readonly color: null; readonly reason: "none" }
  | { readonly text: "!"; readonly color: "violet"; readonly reason: "consent" | "access" | "marks" }
  | { readonly text: "!"; readonly color: "amber"; readonly reason: "not-working"; readonly features: readonly FeatureId[] }
  | { readonly text: "II"; readonly color: "slate"; readonly reason: "paused" }
  | { readonly text: "✓"; readonly color: "teal"; readonly reason: "ticked" | "answer" }
  | { readonly text: "✕"; readonly color: "crimson"; readonly reason: "answer" }
export const badgeColors = { violet: "#7b5cd6", amber: "#c27803", slate: "#5e6875", teal: "#14a39a", crimson: "#d14343" } as const satisfies Record<BadgeColor, string>
const none: Badge = { text: "", color: null, reason: "none" }

/** The badge every tab shows: only the reasons that apply on every tab. */
export function everyTabBadge(facts: BadgeFacts): Badge {
  if (facts.consentPending) return { text: "!", color: "violet", reason: "consent" }
  if (facts.accessMissing) return { text: "!", color: "violet", reason: "access" }
  if (facts.marks) return { text: "!", color: "violet", reason: "marks" }
  if (facts.paused) return { text: "II", color: "slate", reason: "paused" }
  return none
}
/**
 * One tab's badge: one "!" at a time in FT-57's order, consent, site access, not working, Missing or Full; then
 * auto-add's "paused" and its tick. A per-tab reason shows only where it applies.
 */
export function badgeFor(facts: BadgeFacts, tabId: number): Badge {
  if (facts.consentPending) return { text: "!", color: "violet", reason: "consent" }
  if (facts.accessMissing) return { text: "!", color: "violet", reason: "access" }
  const broken = facts.notWorking.get(tabId)
  if (broken?.length) return { text: "!", color: "amber", reason: "not-working", features: broken }
  if (facts.marks) return { text: "!", color: "violet", reason: "marks" }
  if (facts.paused) return { text: "II", color: "slate", reason: "paused" }
  if (facts.ticked.has(tabId)) return { text: "✓", color: "teal", reason: "ticked" }
  return none
}
export function sameBadge(a: Badge, b: Badge): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
