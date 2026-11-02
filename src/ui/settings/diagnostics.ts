import type { UiCheck, UiFeatureHealth, UiSignal } from "../../shared/contracts/ui-pages"
import type { Site } from "../../shared/contracts/vocabulary"
import type { FeatureId } from "../../shared/contracts/vocabulary"
import type { PageView } from "../../shared/model/page-view"
import { firstRunFeatures } from "../onboarding/features"
import { isOn, type SiteAccess } from "../lib/held"

type View = Extract<PageView, { kind: "view" }>
const siteName = (site: Site) => site === "www" ? "YouTube" : "YouTube Music"
/**
 * The diagnostics report (HEALTH-24, HEALTH-25), plain text in English for the developer. It names features,
 * statuses and versions only: never an account, video, playlist, channel, address or setting value.
 */
export function diagnosticsReport(input: {
  readonly view: View; readonly version: string; readonly beta: boolean; readonly browser: string; readonly os: string
  readonly access: SiteAccess | null; readonly health: readonly UiFeatureHealth[]; readonly signedIn: boolean | null
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
    `Site access: YouTube ${input.access ? input.access.www ? "yes" : "no" : "unknown"}, YouTube Music ${input.access ? input.access.music ? "yes" : "no" : "unknown"}`,
    `Settings sync: ${device?.syncOn ? `on, ${view.sync?.status ?? "unknown"}` : "off"}`,
    `Signed in: ${input.signedIn === null ? "no tab" : input.signedIn ? "yes" : "no"}`,
    "Status:",
    ...input.health.length ? input.health.map(row => `  ${row.feature} on ${row.site === "www" ? "YouTube" : "YouTube Music"}: ${row.state}${row.gaps.length ? ` (${row.gaps.join(", ")})` : ""}`) : ["  no open tab reported"],
    // HEALTH-24: the session's breakage signals with their shape outlines, and Check now's result. Signals name no user data (HEALTH-03).
    "Check now:",
    ...input.evidence?.checks.length ? input.evidence.checks.map(check => `  ${siteName(check.site)}: ${check.jobs.map(job => `${job.job} ${job.ok ? "ok" : "failed"}`).join(", ")}`) : ["  not run"],
    "Breakage signals:",
    ...input.evidence?.signals.length ? input.evidence.signals.map(signal => `  ${siteName(signal.site)} ${signal.kind}${signal.feature ? ` feature=${signal.feature}` : ""}${signal.job ? ` job=${signal.job}` : ""}` +
      `${signal.route ? ` route=${signal.route}` : ""} page=${signal.pageType}${signal.clientVersion ? ` client=${signal.clientVersion}` : ""} ×${signal.count}${signal.shape ? ` shape=${signal.shape}` : ""}`) : ["  none this session"]
  ]
  return lines.join("\n")
}
