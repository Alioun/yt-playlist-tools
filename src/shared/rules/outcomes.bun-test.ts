import { describe, expect, test } from "bun:test"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { isJobFailure, type JobFailure, type Site } from "../contracts"
import { isPlaylistId, type PlaylistId } from "../model"
import { toastText, type Titles } from "../copy"
import { failureOf, toastPlan, type Action, type ExplicitOutcome, type Outcome, type Report, type Shown, type ToastPlan } from "./outcomes"

const i18n = englishI18n()

function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("Invalid synthetic playlist ID")
  return value
}

const music = playlist("PLmusic")
const learning = playlist("PLlearning")
const later = playlist("WL")
const old = playlist("PLold")
const titles: Titles = {
  video: "Never Gonna Give You Up",
  playlists: { [music]: "Music", [learning]: "Learning", [later]: "Watch later", [old]: "Old stuff" },
  channel: "Rick Astley", shortcut: "Gym mix", account: "Sam"
}
const fresh = (): Shown => ({ tab: new Set(), session: new Set() })
const auto = (outcomes: Record<PlaylistId, Outcome>, shown = fresh()): Report => ({ kind: "auto-add", outcomes, shown })
const failed = <F extends Extract<Outcome, { kind: "failed" }>["failure"]>(failure: F) => ({ kind: "failed", failure }) as const
const added = { kind: "added" } as const
const alreadyIn = { kind: "already-in" } as const

type Seen = { text: string; tone: ToastPlan["tone"]; action: Action | null } | null
function seen(report: Report, feedback: boolean, site: Site = "www", names: Titles = titles): Seen {
  const plan = toastPlan(report, feedback)
  return plan && { text: toastText(plan, names, site, i18n), tone: plan.tone, action: plan.action }
}

const T = "“Never Gonna Give You Up”"
type Row = [name: string, report: Report, on: Seen, off: Seen | "same"]
const settledCases: Row[] = [
  ["untick confirmation", { kind: "removed", playlist: music },
    { text: `Removed ${T} from Music`, tone: "confirmation", action: { kind: "undo" } }, null],
  ["Undo failed", { kind: "undo-failed" },
    { text: "Couldn't undo.", tone: "failure", action: null }, "same"],
  ["explicit add saved it", { kind: "shortcut", outcomes: { [music]: added } },
    { text: `Saved ${T} to Music`, tone: "confirmation", action: { kind: "undo" } }, null],
  ["first pick in choose mode", { kind: "choose-quick-save", outcomes: { [music]: added } },
    { text: `Saved ${T} to Music. One click now saves there.`, tone: "confirmation", action: { kind: "undo" } }, null],
  ["shortcut playlist chosen through Choose", { kind: "choose-shortcut", outcomes: { [music]: added } },
    { text: "Gym mix now saves to “Music”.", tone: "confirmation", action: { kind: "undo" } }, null],
  ["explicit add found it already in", { kind: "quick-save", outcomes: { [music]: alreadyIn } },
    { text: `${T} is already in Music`, tone: "hint", action: null }, "same"],
  ["shortcut with no playlist on this account", { kind: "no-playlist" },
    { text: "Gym mix has no playlist on Sam yet.", tone: "hint", action: { kind: "choose" } }, "same"],
  ["pending key-triggered add", { kind: "pending", playlists: [music] },
    { text: `Saving ${T} to Music…`, tone: "progress", action: null }, null],
  ["signed out explicit add", { kind: "quick-save", outcomes: { [music]: failed("signed-out") } },
    { text: "Sign in to YouTube to save videos.", tone: "failure", action: { kind: "sign-in" } }, "same"],
  ["explicit offline", { kind: "shortcut", outcomes: { [music]: failed("not-sent") } },
    { text: `Couldn't save ${T} to Music. Check your connection.`, tone: "failure", action: null }, "same"],
  ["explicit no answer", { kind: "shortcut", outcomes: { [music]: failed("unconfirmed") } },
    { text: `Couldn't confirm ${T} was saved to Music. YouTube didn't answer.`, tone: "failure", action: null }, "same"],
  ["shortcut missing playlist", { kind: "shortcut", outcomes: { [old]: failed("missing") } },
    { text: `Couldn't save ${T}, because Old stuff doesn't exist anymore.`, tone: "failure", action: { kind: "settings", feature: "shortcuts", playlist: old } }, "same"],
  ["shortcut full playlist", { kind: "shortcut", outcomes: { [old]: failed("full") } },
    { text: `Couldn't save ${T}, because Old stuff is full.`, tone: "failure", action: { kind: "settings", feature: "shortcuts", playlist: old } }, "same"],
  ["quick-save missing playlist", { kind: "quick-save", outcomes: { [old]: failed("missing") } },
    { text: `Couldn't save ${T}, because Old stuff doesn't exist anymore.`, tone: "failure", action: { kind: "choose" } }, "same"],
  ["quick-save full playlist", { kind: "quick-save", outcomes: { [old]: failed("full") } },
    { text: `Couldn't save ${T}, because Old stuff is full.`, tone: "failure", action: { kind: "choose" } }, "same"],
  ["first pick missing playlist has no fix", { kind: "choose-quick-save", outcomes: { [old]: failed("missing") } },
    { text: `Couldn't save ${T}, because Old stuff doesn't exist anymore.`, tone: "failure", action: null }, "same"],
  ["picker tick answers on its row", { kind: "picker", outcomes: { [old]: failed("missing") } }, null, null],
  ["YouTube refuses the video", { kind: "quick-save", outcomes: { [music]: failed("refused") } },
    { text: `YouTube doesn't allow saving ${T} to playlists.`, tone: "failure", action: null }, "same"],
  ["explicit rate-limited", { kind: "shortcut", outcomes: { [music]: failed("rate-limited") } },
    { text: `Couldn't save ${T}. YouTube is limiting requests, so try again in a minute.`, tone: "failure", action: null }, "same"],
  ["explicit add during a rate-limit pause", { kind: "shortcut", outcomes: { [music]: failed("paused") } },
    { text: `Couldn't save ${T}. YouTube is limiting requests, so try again in a minute.`, tone: "failure", action: null }, "same"],
  ["explicit account changed", { kind: "quick-save", outcomes: { [music]: failed("account-changed") } },
    { text: "Your YouTube account changed in another tab. Reload this page to keep saving here.", tone: "failure", action: { kind: "reload" } }, "same"],
  ["account can't use playlists", { kind: "quick-save", outcomes: { [music]: failed("account-refused") } },
    { text: "YouTube doesn't let this account save to playlists.", tone: "failure", action: null }, "same"],
  ["explicit unrecognised answer", { kind: "shortcut", outcomes: { [music]: failed("unrecognised") } },
    { text: `Couldn't save ${T} to Music. Use YouTube's own Save for now.`, tone: "failure", action: null }, "same"],
  ["explicit saved and failed", { kind: "shortcut", outcomes: { [music]: added, [old]: failed("missing") } },
    { text: `Saved ${T} to Music. Couldn't add it to Old stuff, because it doesn't exist anymore.`, tone: "failure", action: { kind: "settings", feature: "shortcuts", playlist: old } }, "same"],
  ["auto-add saved it", auto({ [music]: added, [learning]: added, [later]: alreadyIn }),
    { text: `Auto-added ${T} to Music and Learning`, tone: "confirmation", action: { kind: "undo" } }, null],
  ["auto-add found it already in everywhere", auto({ [music]: alreadyIn, [learning]: alreadyIn }), null, null],
  ["auto-add skipped by the session skip", auto({ [music]: { kind: "skipped" } }), null, null],
  ["auto-add every remaining playlist filtered out", auto({ [music]: { kind: "filtered", decision: "filtered" }, [learning]: { kind: "skipped" } }),
    { text: `Didn't auto-add ${T}, because Rick Astley is filtered out of Music`, tone: "confirmation", action: null }, null],
  ["auto-add unknown channel", auto({ [music]: { kind: "filtered", decision: "filtered-unknown-channel" } }),
    { text: `Didn't auto-add ${T} to Music, because Perchling couldn't tell which channel it's from.`, tone: "hint", action: null }, "same"],
  ["auto-add some saved, the rest filtered out", auto({ [music]: added, [learning]: { kind: "filtered", decision: "filtered" }, [later]: { kind: "filtered", decision: "filtered-unknown-channel" } }),
    { text: `Auto-added ${T} to 1 playlist · filtered out of 2 playlists`, tone: "confirmation", action: { kind: "undo" } }, null],
  ["auto-add partial example", auto({ [music]: added, [old]: failed("missing") }),
    { text: `Auto-added ${T} to Music. Couldn't add it to Old stuff, because it doesn't exist anymore.`, tone: "failure", action: { kind: "settings", feature: "auto-add", playlist: old } }, "same"],
  ["auto-add signed out stays silent", auto({ [music]: failed("signed-out") }), null, null],
  ["auto-add during a rate-limit pause stays silent", auto({ [music]: failed("paused") }), null, null],
  ["auto-add offline", auto({ [music]: failed("not-sent"), [learning]: alreadyIn }),
    { text: `Couldn't auto-add ${T} to Music. Check your connection.`, tone: "failure", action: { kind: "try-again", playlists: [music] } }, "same"],
  ["auto-add no answer", auto({ [music]: failed("unconfirmed") }),
    { text: `Couldn't confirm ${T} was auto-added to Music. YouTube didn't answer.`, tone: "failure", action: { kind: "try-again", playlists: [music] } }, "same"],
  ["auto-add missing playlist", auto({ [old]: failed("missing") }),
    { text: `Couldn't auto-add ${T}, because Old stuff doesn't exist anymore.`, tone: "failure", action: { kind: "settings", feature: "auto-add", playlist: old } }, "same"],
  ["auto-add full playlist", auto({ [old]: failed("full") }),
    { text: `Couldn't auto-add ${T}, because Old stuff is full.`, tone: "failure", action: { kind: "settings", feature: "auto-add", playlist: old } }, "same"],
  ["auto-add refused video", auto({ [music]: failed("refused") }),
    { text: `YouTube doesn't allow auto-adding ${T} to playlists.`, tone: "failure", action: null }, "same"],
  ["auto-add rate-limited", auto({ [music]: failed("rate-limited") }),
    { text: `Couldn't auto-add ${T}. YouTube is limiting requests, so try again in a minute.`, tone: "failure", action: null }, "same"],
  ["auto-add account changed", auto({ [music]: failed("account-changed") }),
    { text: "Your YouTube account changed in another tab. Reload this page to keep saving here.", tone: "failure", action: { kind: "reload" } }, "same"],
  ["auto-add account can't use playlists", auto({ [music]: failed("account-refused") }),
    { text: "YouTube doesn't let this account save to playlists.", tone: "failure", action: null }, "same"],
  ["auto-add membership can't be read", auto({ [music]: failed("membership-unreadable") }),
    { text: `Couldn't check ${T}'s playlists, so auto-add didn't run.`, tone: "failure", action: null }, "same"],
  ["auto-add unrecognised answer", auto({ [music]: failed("unrecognised") }),
    { text: `Couldn't auto-add ${T} to Music. Use YouTube's own Save for now.`, tone: "failure", action: { kind: "try-again", playlists: [music] } }, "same"],
  ["empty report", { kind: "shortcut", outcomes: {} }, null, null],
]

describe("picker ticks answer inline", () => {
  const every: [string, ExplicitOutcome][] = [
    ["added", added], ["already in", alreadyIn],
    ...(["signed-out", "not-sent", "unconfirmed", "missing", "full", "refused", "rate-limited", "paused",
      "account-changed", "account-refused", "unrecognised"] as const).map((failure): [string, ExplicitOutcome] => [failure, failed(failure)]),
  ]
  for (const [name, outcome] of every) {
    test(`an ordinary tick that ends ${name} raises no toast`, () => {
      const report: Report = { kind: "picker", outcomes: { [music]: outcome, [learning]: added } }
      expect(toastPlan(report, true)).toBeNull()
      expect(toastPlan(report, false)).toBeNull()
      expect(report.kind === "picker" && report.outcomes[music]).toEqual(outcome)
    })
  }

  test("choose mode's first pick still answers by toast", () => {
    expect(seen({ kind: "choose-quick-save", outcomes: { [music]: added } }, true)?.action).toEqual({ kind: "undo" })
    expect(seen({ kind: "choose-shortcut", outcomes: { [music]: failed("unrecognised") } }, false)?.tone).toBe("failure")
  })
})

describe("add feedback case table", () => {
  for (const [name, report, on, off] of settledCases) {
    test(name, () => {
      expect(seen(report, true)).toEqual(on)
      expect(seen(report, false)).toEqual(off === "same" ? on : off)
    })
  }

  test("auto-add toasts are unasked, explicit answers are asked", () => {
    expect(toastPlan(auto({ [music]: added }), true)?.auto).toBe(true)
    expect(toastPlan(auto({ [music]: failed("missing") }), false)?.auto).toBe(true)
    expect(toastPlan({ kind: "shortcut", outcomes: { [music]: added } }, true)?.auto).toBe(false)
    expect(toastPlan({ kind: "no-playlist" }, false)?.auto).toBe(false)
  })
})

describe("auto-add suppression is explicit data", () => {
  function run(steps: { tab: string; report: (shown: Shown) => Report }[]) {
    const session = new Set<string>()
    const tabs = new Map<string, Set<string>>()
    return steps.map(({ tab, report }) => {
      const tabKeys = tabs.get(tab) ?? new Set<string>()
      tabs.set(tab, tabKeys)
      const plan = toastPlan(report({ tab: tabKeys, session }), false)
      for (const key of plan?.remember.tab ?? []) tabKeys.add(key)
      for (const key of plan?.remember.session ?? []) session.add(key)
      return plan && toastText(plan, titles, "www", i18n)
    })
  }

  test("missing and full show once per playlist per browser session", () => {
    const missing = (id: PlaylistId) => (shown: Shown) => auto({ [id]: failed("missing") }, shown)
    expect(run([
      { tab: "a", report: missing(old) }, { tab: "b", report: missing(old) },
      { tab: "a", report: missing(music) }, { tab: "a", report: shown => auto({ [old]: failed("full") }, shown) }
    ])).toEqual([
      `Couldn't auto-add ${T}, because Old stuff doesn't exist anymore.`, null,
      `Couldn't auto-add ${T}, because Music doesn't exist anymore.`, `Couldn't auto-add ${T}, because Old stuff is full.`
    ])
  })

  test("a refused video and the unknown-channel note show once per browser session", () => {
    const refused = (shown: Shown) => auto({ [music]: failed("refused") }, shown)
    const unknown = (shown: Shown) => auto({ [music]: { kind: "filtered", decision: "filtered-unknown-channel" } }, shown)
    expect(run([{ tab: "a", report: refused }, { tab: "b", report: refused }, { tab: "a", report: unknown }, { tab: "b", report: unknown }]))
      .toEqual([`YouTube doesn't allow auto-adding ${T} to playlists.`, null, `Didn't auto-add ${T} to Music, because Perchling couldn't tell which channel it's from.`, null])
  })

  test("account changed and account refused show once per tab", () => {
    const changed = (shown: Shown) => auto({ [music]: failed("account-changed") }, shown)
    const refused = (shown: Shown) => auto({ [music]: failed("account-refused") }, shown)
    const text = "Your YouTube account changed in another tab. Reload this page to keep saving here."
    expect(run([{ tab: "a", report: changed }, { tab: "a", report: changed }, { tab: "b", report: changed }, { tab: "a", report: refused }, { tab: "a", report: refused }]))
      .toEqual([text, null, text, "YouTube doesn't let this account save to playlists.", null])
  })

  test("unlimited auto-add failures repeat", () => {
    const offline = (shown: Shown) => auto({ [music]: failed("not-sent") }, shown)
    expect(run([{ tab: "a", report: offline }, { tab: "a", report: offline }]).every(text => text?.startsWith("Couldn't auto-add"))).toBe(true)
  })

  test("a suppressed failure gives way to the next failure or to the confirmation", () => {
    const shown: Shown = { tab: new Set(), session: new Set([`missing:${old}`]) }
    expect(seen(auto({ [old]: failed("missing"), [learning]: failed("unrecognised") }, shown), false)?.text)
      .toBe(`Couldn't auto-add ${T} to Learning. Use YouTube's own Save for now.`)
    expect(seen(auto({ [music]: added, [old]: failed("missing") }, shown), true))
      .toEqual({ text: `Auto-added ${T} to Music`, tone: "confirmation", action: { kind: "undo" } })
    expect(seen(auto({ [music]: added, [old]: failed("missing") }, shown), false)).toBeNull()
  })

  test("explicit actions are never suppressed and remember nothing", () => {
    for (const failure of ["missing", "refused", "account-changed", "account-refused", "paused"] as const) {
      const plan = toastPlan({ kind: "quick-save", outcomes: { [old]: failed(failure) } }, false)
      expect(plan?.tone).toBe("failure")
      expect(plan?.remember).toEqual({ tab: [], session: [] })
    }
  })
})

describe("mixed outcomes and precedence", () => {
  test("saved and failed exposes the failure's fix instead of Undo", () => {
    const plan = toastPlan(auto({ [music]: added, [learning]: failed("not-sent") }), false)
    expect(plan?.action).toEqual({ kind: "try-again", playlists: [learning] })
    expect(plan && toastText(plan, titles, "www", i18n)).toBe(`Auto-added ${T} to Music. Couldn't add it to Learning. Check your connection.`)
  })

  test("one leading failure names its playlists and carries one action", () => {
    const plan = toastPlan(auto({ [music]: failed("missing"), [old]: failed("missing"), [learning]: failed("unrecognised") }), true)
    expect(plan?.action).toEqual({ kind: "settings", feature: "auto-add", playlist: music })
    expect(plan?.remember.session).toEqual([`missing:${music}`, `missing:${old}`])
    expect(plan && toastText(plan, titles, "www", i18n)).toBe(`Couldn't auto-add ${T}, because Music and Old stuff don't exist anymore.`)
  })

  test("explicit precedence follows the failure table's order", () => {
    const outcomes: Record<PlaylistId, ExplicitOutcome> = { [music]: failed("unrecognised"), [old]: failed("full"), [learning]: failed("not-sent") }
    expect(seen({ kind: "shortcut", outcomes }, false)?.text).toBe(`Couldn't save ${T} to Learning. Check your connection.`)
  })
})

describe("failureOf narrows only the gateway's observable facts", () => {
  const answer = (value: unknown): JobFailure => {
    if (!isJobFailure(value)) throw new Error("Invalid synthetic job failure")
    return value
  }
  const table: [unknown, ReturnType<typeof failureOf>][] = [
    [{ ok: false, reason: "signedOut" }, "signed-out"],
    [{ ok: false, reason: "accountChanged" }, "account-changed"],
    [{ ok: false, reason: "unavailable" }, "unrecognised"],
    [{ ok: false, reason: "unconfirmed" }, "unconfirmed"],
    [{ ok: false, reason: "failed", http: 429 }, "rate-limited"],
    [{ ok: false, reason: "failed", http: 500 }, "unrecognised"],
    [{ ok: false, reason: "failed", http: 200, status: "synthetic-status" }, "unrecognised"],
    [{ ok: false, reason: "failed" }, "unrecognised"],
  ]
  for (const [raw, expected] of table) {
    test(JSON.stringify(raw), () => expect(failureOf(answer(raw))).toBe(expected))
  }

  for (const site of ["www", "music"] as const) {
    for (const via of ["quick-save", "auto-add"] as const) {
      test(`unavailable answer uses generic copy on ${site} for ${via}`, () => {
        const raw = Object.freeze({ ok: false, reason: "unavailable" })
        const failure = failureOf(answer(raw))
        if (failure === "membership-unreadable") throw new Error("Gateway failure cannot be membership-unreadable")
        const outcomes = Object.freeze({ [music]: Object.freeze(failed(failure)) })
        const shown = fresh()
        const report: Report = via === "auto-add"
          ? { kind: via, outcomes, shown }
          : { kind: via, outcomes }
        const before = JSON.stringify([raw, report, [...shown.tab], [...shown.session]])
        const save = via === "auto-add" ? "auto-add" : "save"
        const fix = site === "music" ? "Try YouTube Music's ⋮ menu." : "Use YouTube's own Save for now."
        const expected: Seen = {
          text: `Couldn't ${save} ${T} to Music. ${fix}`,
          tone: "failure",
          action: via === "auto-add" ? { kind: "try-again", playlists: [music] } : null,
        }
        expect(seen(report, false, site)).toEqual(expected)
        expect(seen(report, true, site)).toEqual(expected)
        expect(seen(report, false, site)?.text).not.toContain("Check your connection")
        expect(seen(report, false, site)).toEqual(seen(report, false, site))
        expect(JSON.stringify([raw, report, [...shown.tab], [...shown.session]])).toBe(before)
      })
    }
  }
})

describe("plans are pure", () => {
  test("inputs stay unchanged and output is deterministic", () => {
    const outcomes = Object.freeze({ [music]: Object.freeze(added), [old]: Object.freeze(failed("missing")) })
    const shown = { tab: new Set<string>(), session: new Set<string>(["refused"]) }
    const report = Object.freeze({ kind: "auto-add", outcomes, shown } as const)
    const before = JSON.stringify([report, [...shown.session], [...shown.tab]])
    const first = toastPlan(report, true)
    expect(toastPlan(report, true)).toEqual(first)
    expect(JSON.stringify([report, [...shown.session], [...shown.tab]])).toBe(before)
  })
})
