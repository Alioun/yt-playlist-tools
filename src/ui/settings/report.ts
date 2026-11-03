import type { FeatureId } from "../../shared/contracts/vocabulary"

export type ReportKind = "not-working" | "problem" | "idea"
export type ReportFeature = FeatureId | "upgrade" | "pages" | "other"
const forms = { "not-working": "not-working.yml", problem: "problem.yml", idea: "idea.yml" } as const satisfies Record<ReportKind, string>
const repository = "https://github.com/Alioun/yt-playlist-tools"
export const knownProblems = `${repository}/issues?q=is%3Aissue+is%3Aopen+label%3Ayoutube-change`

/**
 * Report a problem's prefilled address (REL-STORE-37, R89): the form, its title and the four values, every one
 * URL-encoded. It never carries a video, playlist, channel, account or the diagnostics report.
 */
export function reportAddress(input: { readonly kind: ReportKind; readonly version: string; readonly browser: string; readonly feature: string; readonly status: string }): string {
  const title = input.kind === "problem" ? `${input.feature}: ` : input.kind === "not-working" ? `${input.feature} isn't working` : ""
  const values: [string, string][] = [
    ["template", forms[input.kind]],
    ["title", title],
    ["version", input.version],
    ["browser", input.browser],
    ["feature", input.feature]
  ]
  if (input.kind !== "idea") values.push(["status", input.status])
  return `${repository}/issues/new?${values.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`
}
/** "Firefox 141", from the user agent's major version only. */
export function browserLabel(userAgent: string, browser: "chrome" | "firefox"): string {
  const match = browser === "firefox" ? /Firefox\/(\d+)/.exec(userAgent) : /Chrome\/(\d+)/.exec(userAgent)
  return `${browser === "firefox" ? "Firefox" : "Chrome"}${match ? ` ${match[1]}` : ""}`
}
