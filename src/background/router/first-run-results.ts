import type { AgreeChange, AgreementAnswer, DestinationChange, DestinationAnswer, FeatureApplication, FirstRunFeature } from "../../shared/contracts/first-run"
import type { AgreementAccess, AgreementApplication, AgreementResult } from "../store/consent-agreement"
import type { SetupDestinationResult } from "../store/setup-edit-execution"
import { confirmsAutoAdd, type AutoAddChoiceChange, type AutoAddChoiceAnswer } from "../../shared/contracts/auto-add-choice"
import { autoAddFact, type AutoAddChoiceResult } from "../store/auto-add-choice"

type Scope = AgreementApplication["scope"]
// consent-agreement's first-run planner owns these scopes. The parity check covers every canonical page feature.
export function agreementScopes(feature: FirstRunFeature): readonly Scope[] {
  return feature === "browser-menu"
    ? ["browser"]
    : feature === "shortcuts" || feature === "any-tab-keys"
      ? ["www", "music"]
      : feature === "music-actions" || feature === "music-keys"
        ? ["music"]
        : ["www"]
}
function matchesAccess(application: AgreementApplication, access: AgreementAccess): boolean {
  const allowed = application.scope === "browser" ? access.www && access.browserMenu : access[application.scope]
  return allowed
    ? application.state.kind === "enabled"
    : application.state.kind === "held" && application.state.reason === (application.scope === "browser" && !access.browserMenu ? "browser-menu-permission" : "site-access")
}
function fold(feature: FirstRunFeature, applications: readonly AgreementApplication[]): FeatureApplication | undefined {
  if (feature === "shortcuts") {
    const www = applications.find(row => row.scope === "www"),
      music = applications.find(row => row.scope === "music")
    if (www?.state.kind !== "enabled" || !music || music.state.kind === "off") return
    return { feature, state: "enabled", alsoOnMusic: music.state.kind === "enabled" ? "enabled" : "held-site-access" }
  }
  if (applications.some(row => row.state.kind === "off")) return
  const held = applications.find(row => row.state.kind === "held")
  return { feature, state: held?.state.kind === "held" ? (held.state.reason === "browser-menu-permission" ? "held-browser-menu" : "held-site-access") : "enabled" }
}
export function projectAgreement(change: AgreeChange, result: AgreementResult, access: AgreementAccess): AgreementAnswer {
  const refused = (reason: Extract<AgreementAnswer, { kind: "not-agreed" }>["reason"]): AgreementAnswer => ({ kind: "not-agreed", attempt: change.attempt, reason })
  switch (result.kind) {
    case "committed":
    case "joined": {
      if (result.activation !== "ordinary-gates" || result.consent.v !== change.displayedVersion) return refused("unconfirmed")
      const expected = change.selected.flatMap(feature => agreementScopes(feature).map(scope => ({ feature, scope })))
      if (result.applications.length !== expected.length) return refused("unconfirmed")
      const applications: FeatureApplication[] = []
      for (const item of expected) {
        const matches = result.applications.filter(row => row.feature === item.feature && row.scope === item.scope)
        if (matches.length !== 1 || !matches[0] || !matchesAccess(matches[0], access)) return refused("unconfirmed")
      }
      for (const feature of change.selected) {
        const row = fold(
          feature,
          result.applications.filter(application => application.feature === feature)
        )
        if (!row) return refused("unconfirmed")
        applications.push(row)
      }
      return { kind: "agreed", attempt: change.attempt, applications }
    }
    case "refused":
      return refused(result.reason)
    case "failed":
      return refused("rejected")
    case "unconfirmed":
    case "unchanged":
      return refused("unconfirmed")
    case "choice-required":
      return refused("join-required")
    case "unavailable":
      return refused(result.reason === "join-required" ? "join-required" : result.reason === "newer-layout" ? "update-needed" : "unavailable")
  }
}
export function projectDestination(change: DestinationChange, result: SetupDestinationResult): DestinationAnswer {
  if (result.kind === "committed") {
    if (result.view.acct !== change.acct) return { kind: "refused", reason: "unconfirmed" }
    if (result.view.kind === "none") return change.playlist === null ? { kind: "confirmed", playlist: null } : { kind: "refused", reason: "unconfirmed" }
    const setup = result.view.setup
    const playlist =
      change.destination.kind === "shortcut"
        ? (setup.targets[change.destination.shortcut] ?? null)
        : change.destination.kind === "quick-save"
          ? setup.quickSave
          : change.destination.kind === "music-save"
            ? setup.musicSave
            : setup.gather
    return playlist === change.playlist ? { kind: "confirmed", playlist: change.playlist } : { kind: "refused", reason: "unconfirmed" }
  }
  switch (result.kind) {
    case "unchanged":
    case "unconfirmed":
      return { kind: "refused", reason: "unconfirmed" }
    case "failed":
      return { kind: "refused", reason: "rejected" }
    case "stale":
      return { kind: "refused", reason: "stale" }
    case "result":
      return { kind: "refused", reason: result.result.refused }
    case "unavailable":
    case "removal":
      return { kind: "refused", reason: "unavailable" }
  }
}

export function projectAutoAddChoice(change: AutoAddChoiceChange, result: AutoAddChoiceResult): AutoAddChoiceAnswer {
  if (result.kind === "committed" || result.kind === "current") {
    const answer: AutoAddChoiceAnswer = { kind: "auto-add-confirmed", acct: result.view.acct, playlist: change.playlist, fact: autoAddFact(result.view, change.playlist) }
    return confirmsAutoAdd(change, answer) ? answer : { kind: "refused", reason: "unconfirmed" }
  }
  switch (result.kind) {
    case "unchanged":
    case "unconfirmed":
      return { kind: "refused", reason: "unconfirmed" }
    case "failed":
      return { kind: "refused", reason: "rejected" }
    case "stale":
      return { kind: "refused", reason: "stale" }
    case "result":
      return { kind: "refused", reason: result.result.refused }
    case "unavailable":
      return { kind: "refused", reason: result.reason === "newer-layout" ? "update-needed" : "unavailable" }
    case "removal": {
      const removal = result.result
      return removal.kind === "result"
        ? { kind: "refused", reason: removal.result.refused }
        : removal.kind === "unconfirmed"
          ? { kind: "refused", reason: "unconfirmed" }
          : removal.kind === "failed"
            ? { kind: "refused", reason: "rejected" }
            : { kind: "refused", reason: "unavailable" }
    }
  }
}
