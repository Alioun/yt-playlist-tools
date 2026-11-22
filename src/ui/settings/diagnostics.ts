import type { HealthGap, UiCheck, UiFeatureHealth, UiSignal } from "../../shared/contracts/ui-pages"
import type { Site } from "../../shared/contracts/vocabulary"
import type { FeatureId } from "../../shared/contracts/vocabulary"
import type { PageView } from "../../shared/model/page-view"
import type { Settings } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import { firstRunFeatures, type PageFeatureId } from "../onboarding/features"
import { heldOn, isOn, musicFeatures, type Held, type SiteAccess } from "../lib/held"
import type { PageState } from "../lib/page-state.svelte"
import type { ReportFeature } from "./report"

type View = Extract<PageView, { kind: "view" }>
const siteName = (site: Site) => (site === "www" ? "YouTube" : "YouTube Music")

/** One site's status for a feature that's on: held there, no tab of that site open, or what its tabs report. */
export type RowState = { readonly kind: "held"; readonly held: Held } | { readonly kind: "no-tab" } | { readonly kind: "health"; readonly health: UiFeatureHealth }
export type StatusRow = { readonly feature: PageFeatureId; readonly site: Site; readonly state: RowState }

/** The sites a feature that's on runs on, YouTube first. */
function sitesOf(settings: Snapshot<Settings>, feature: PageFeatureId): readonly Site[] {
  if (musicFeatures.includes(feature)) return ["music"]
  const music = settings.musicSection && (feature === "any-tab-keys" || (feature === "shortcuts" && settings.shortcuts.music))
  return music ? ["www", "music"] : ["www"]
}
/**
 * Diagnostics' status list (UI-SET-17): one row per site of each feature that's on, in feature order. The rows
 * depend on the settings alone, so a tab opening or closing changes a row's state, never which rows show.
 */
export function statusRows(page: Pick<PageState, "settings" | "agreed" | "access" | "status">): StatusRow[] {
  const settings = page.settings
  if (!settings) return []
  const access = page.access ?? { www: true, music: true, browserMenu: true }
  const reported = page.status?.kind === "status" ? page.status.health : []
  return firstRunFeatures
    .filter(row => isOn(settings, row.id))
    .flatMap(({ id }) =>
      sitesOf(settings, id).map((site): StatusRow => {
        const held = heldOn(site, id, settings, page.agreed, access)
        const health = reported.find(entry => entry.feature === id && entry.site === site)
        return { feature: id, site, state: held ? { kind: "held", held } : health ? { kind: "health", health } : { kind: "no-tab" } }
      })
    )
}

// The report and Report a problem's address are English for the developer, so these words aren't in the catalogue.
const heldWords = { consent: "waiting for consent", "site-access": "needs site access", "music-off": "YouTube Music is off", "browser-menu": "needs the browser menu permission" } as const satisfies Record<Held, string>
const gapWords = {
  playlists: "can't refresh the playlist list",
  actions: "some of its buttons can't run",
  casting: "queue changes may only affect this tab while casting",
  measure: "can't follow a video's progress",
  player: "can't gather into YouTube's player",
  queue: "can't gather into YouTube's queue",
  playlist: "can't gather into a playlist"
} as const satisfies Record<Exclude<HealthGap, "membership">, string>
const gapText = (gap: HealthGap, site: Site) => (gap === "membership" ? `can't show where a ${site === "music" ? "song" : "video"} is already saved` : gapWords[gap])

/** A row's state in words (HEALTH-07), as the report and Report a problem name it. */
function stateText(state: RowState, site: Site): string {
  if (state.kind === "held") return `Can't run yet (${heldWords[state.held]})`
  if (state.kind === "no-tab") return `No ${siteName(site)} tab open`
  const { health } = state
  if (health.state === "working") return "Working"
  if (health.state === "not-working") return "Not working"
  return health.gaps.length ? `Partly working (${health.gaps.map(gap => gapText(gap, site)).join(", ")})` : "Partly working"
}
/**
 * The status Report a problem sends for a feature (HEALTH-27): what its Diagnostics rows show, with the site named
 * when its two rows differ. Settings sync has no row, so it sends what its tab reports. The other choices send none.
 */
export function reportStatus(page: Pick<PageState, "settings" | "agreed" | "access" | "status">, feature: ReportFeature): string | null {
  if (feature === "upgrade" || feature === "pages" || feature === "other") return null
  if (feature === "sync") {
    const health = page.status?.kind === "status" ? page.status.health.find(entry => entry.feature === "sync") : undefined
    return health ? stateText({ kind: "health", health }, health.site) : null
  }
  const own = statusRows(page).filter(row => row.feature === feature)
  const texts = own.map(row => stateText(row.state, row.site))
  if (!texts.length) return "Off"
  return new Set(texts).size === 1 ? texts[0]! : own.map((row, index) => `${siteName(row.site)}: ${texts[index]}`).join("; ")
}
/**
 * The diagnostics report (HEALTH-24, HEALTH-25), plain text in English for the developer. It names features,
 * statuses and versions only: never an account, video, playlist, channel, address or setting value.
 */
export function diagnosticsReport(input: {
  readonly view: View
  readonly version: string
  readonly beta: boolean
  readonly browser: string
  readonly os: string
  readonly access: SiteAccess | null
  readonly rows: readonly StatusRow[]
  readonly signedIn: boolean | null
  readonly evidence?: { readonly checks: readonly UiCheck[]; readonly signals: readonly UiSignal[] } | null
}): string {
  const { view } = input
  const settings = view.settings.kind === "value" ? view.settings.settings : null
  const device = view.device.kind === "current" ? view.device.device : null
  const on: FeatureId[] = settings ? firstRunFeatures.map(row => row.id).filter(id => isOn(settings, id)) : []
  const lines = [
    `Perchling ${input.version}${input.beta ? " (beta)" : ""}`,
    `Browser: ${input.browser} · ${input.os}`,
    `Layout: ${view.layout === "current" ? "schema 1" : view.layout}`,
    `Consent: ${device?.consent ? "agreed" : "not agreed"}`,
    `Features on: ${on.length ? on.join(", ") : "none"}`,
    `YouTube Music section: ${settings?.musicSection === false ? "off" : "on"}`,
    `Site access: YouTube ${input.access ? (input.access.www ? "yes" : "no") : "unknown"}, YouTube Music ${input.access ? (input.access.music ? "yes" : "no") : "unknown"}`,
    `Settings sync: ${device?.syncOn ? `on, ${view.sync?.status ?? "unknown"}` : "off"}`,
    `Signed in: ${input.signedIn === null ? "no tab" : input.signedIn ? "yes" : "no"}`,
    "Status:",
    ...(input.rows.length ? input.rows.map(row => `  ${row.feature} on ${siteName(row.site)}: ${stateText(row.state, row.site)}`) : ["  no feature on"]),
    // HEALTH-24: the session's breakage signals with their shape outlines, and Check now's result. Signals name no user data (HEALTH-03).
    "Check now:",
    ...(input.evidence?.checks.length ? input.evidence.checks.map(check => `  ${siteName(check.site)}: ${check.jobs.map(job => `${job.job} ${job.ok ? "ok" : "failed"}`).join(", ")}`) : ["  not run"]),
    "Breakage signals:",
    ...(input.evidence?.signals.length
      ? input.evidence.signals.map(
          signal =>
            `  ${siteName(signal.site)} ${signal.kind}${signal.feature ? ` feature=${signal.feature}` : ""}${signal.job ? ` job=${signal.job}` : ""}` +
            `${signal.route ? ` route=${signal.route}` : ""} page=${signal.pageType}${signal.clientVersion ? ` client=${signal.clientVersion}` : ""} ×${signal.count}${signal.shape ? ` shape=${signal.shape}` : ""}`
        )
      : ["  none this session"])
  ]
  return lines.join("\n")
}
