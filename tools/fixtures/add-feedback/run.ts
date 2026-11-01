import { englishI18n } from "../localization/scripted"
import { isJobFailure, type Site } from "../../../src/shared/contracts"
import { isPlaylistId, type PlaylistId } from "../../../src/shared/model"
import { failureOf, toastPlan, type ExplicitOutcome, type Outcome, type Report } from "../../../src/shared/rules/outcomes"
import { toastText, type Titles } from "../../../src/shared/copy"

const i18n = englishI18n()

type Answer = { added: true } | { alreadyIn: true } | { filtered: "filtered" | "filtered-unknown-channel" } | { skipped: true } | { notSent: true } | { raw: unknown }
type Step =
  | { tab: string; site: Site; feedback: boolean; via: "auto-add"; answers: Record<string, Answer> }
  | { tab: string; site: Site; feedback: boolean; via: "shortcut" | "quick-save" | "picker"; answers: Record<string, Answer> }
  | { tab: string; site: Site; feedback: boolean; via: "pending"; playlists: string[] }
  | { tab: string; site: Site; feedback: boolean; via: "no-playlist" }

function id(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error(`Invalid fixture playlist ID ${value}`)
  return value
}

const titles: Titles = {
  video: "A synthetic video whose title runs longer than forty characters",
  playlists: { [id("PLmusic")]: "Music", [id("PLlearning")]: "Learning", [id("WL")]: "Watch later", [id("PLold")]: "Old stuff", [id("PLgym")]: "Gym" },
  channel: "Synthetic channel", shortcut: "Alt+1", account: "Synthetic account"
}

export const steps: readonly Step[] = [
  { tab: "a", site: "www", feedback: true, via: "auto-add", answers: { PLmusic: { added: true }, PLlearning: { alreadyIn: true } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { added: true } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { added: true }, PLold: { raw: { ok: false, reason: "failed", http: 500 } } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { raw: { ok: false, reason: "failed", http: 429 } } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { raw: { ok: false, reason: "accountChanged" } } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { raw: { ok: false, reason: "accountChanged" } } } },
  { tab: "b", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { raw: { ok: false, reason: "accountChanged" } } } },
  { tab: "b", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { filtered: "filtered-unknown-channel" } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { filtered: "filtered-unknown-channel" } } },
  { tab: "a", site: "www", feedback: false, via: "auto-add", answers: { PLmusic: { raw: { ok: false, reason: "signedOut" } } } },
  { tab: "a", site: "www", feedback: false, via: "shortcut", answers: { PLmusic: { raw: { ok: false, reason: "signedOut" } } } },
  { tab: "a", site: "www", feedback: false, via: "shortcut", answers: { PLmusic: { raw: { ok: false, reason: "accountChanged" } } } },
  { tab: "a", site: "www", feedback: false, via: "quick-save", answers: { PLgym: { alreadyIn: true } } },
  { tab: "a", site: "www", feedback: false, via: "pending", playlists: ["PLgym"] },
  { tab: "a", site: "www", feedback: true, via: "pending", playlists: ["PLgym"] },
  { tab: "a", site: "www", feedback: false, via: "no-playlist" },
  { tab: "a", site: "www", feedback: true, via: "shortcut", answers: { PLmusic: { added: true }, PLlearning: { added: true }, WL: { added: true }, PLgym: { added: true } } },
  { tab: "a", site: "www", feedback: true, via: "picker", answers: { PLmusic: { added: true }, PLold: { raw: { ok: false, reason: "failed", http: 500 } } } },
  { tab: "m", site: "music", feedback: true, via: "quick-save", answers: { PLgym: { raw: { ok: false, reason: "unavailable" } } } },
  { tab: "m", site: "music", feedback: true, via: "quick-save", answers: { PLgym: { raw: { ok: false, reason: "unconfirmed" } } } },
  { tab: "a", site: "www", feedback: true, via: "shortcut", answers: { PLmusic: { raw: { reason: "missing" } } } },
  { tab: "a", site: "www", feedback: false, via: "quick-save", answers: { PLgym: { raw: { ok: false, reason: "unavailable" } } } },
  { tab: "a", site: "www", feedback: false, via: "quick-save", answers: { PLgym: { notSent: true } } },
  { tab: "m", site: "music", feedback: false, via: "quick-save", answers: { PLgym: { notSent: true } } },
]

function outcomeOf(answer: Answer): Outcome | "rejected-answer" {
  if ("added" in answer) return { kind: "added" }
  if ("alreadyIn" in answer) return { kind: "already-in" }
  if ("filtered" in answer) return { kind: "filtered", decision: answer.filtered }
  if ("skipped" in answer) return { kind: "skipped" }
  if ("notSent" in answer) return { kind: "failed", failure: "not-sent" }
  return isJobFailure(answer.raw) ? { kind: "failed", failure: failureOf(answer.raw) } : "rejected-answer"
}

function explicitOf(outcome: Outcome): ExplicitOutcome {
  if (outcome.kind === "added" || outcome.kind === "already-in") return outcome
  if (outcome.kind === "failed" && outcome.failure !== "membership-unreadable") return { kind: "failed", failure: outcome.failure }
  throw new Error("Explicit fixture steps carry only explicit outcomes")
}

export function runAddFeedbackFixture(input: readonly Step[] = steps) {
  const session = new Set<string>()
  const tabs = new Map<string, Set<string>>()
  return input.map((step, index) => {
    const tab = tabs.get(step.tab) ?? new Set<string>()
    tabs.set(step.tab, tab)
    let report: Report
    if (step.via === "pending") report = { kind: "pending", playlists: step.playlists.map(id) }
    else if (step.via === "no-playlist") report = { kind: "no-playlist" }
    else {
      const outcomes: Record<PlaylistId, Outcome> = {}
      for (const [playlist, answer] of Object.entries(step.answers)) {
        const outcome = outcomeOf(answer)
        if (outcome === "rejected-answer") return { step: index, tab: step.tab, rejected: "answer is not a JobFailure" }
        outcomes[id(playlist)] = outcome
      }
      if (step.via === "auto-add") report = { kind: "auto-add", outcomes, shown: { tab, session } }
      else {
        const explicit: Record<PlaylistId, ExplicitOutcome> = {}
        for (const [playlist, outcome] of Object.entries(outcomes)) explicit[id(playlist)] = explicitOf(outcome)
        report = { kind: step.via, outcomes: explicit }
      }
    }
    const plan = toastPlan(report, step.feedback)
    for (const key of plan?.remember.tab ?? []) tab.add(key)
    for (const key of plan?.remember.session ?? []) session.add(key)
    return {
      step: index, tab: step.tab, site: step.site, via: step.via, feedback: step.feedback,
      toast: plan && { text: toastText(plan, titles, step.site, i18n), tone: plan.tone, auto: plan.auto, action: plan.action, remember: plan.remember }
    }
  })
}

if (import.meta.main) {
  for (const line of runAddFeedbackFixture()) process.stdout.write(`${JSON.stringify(line)}\n`)
}
