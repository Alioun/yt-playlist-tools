import { describe, expect, test } from "bun:test"
import { defaultSettings, defaultSetup, isAccountKey, isVideoId, type GatherOrder, type Settings } from "../model"
import {
  languageTitle, order, pick, videoOf,
  type GatherAccess, type GatherAutoTab, type GatherLanguage, type GatherLeaveReason,
  type GatherPace, type GatherPickMemory, type GatherStart, type GatherTabDecision, type GatherWindow,
} from "./gather"

function video(value: string) {
  if (!isVideoId(value)) throw new Error("Invalid synthetic video ID")
  return value
}

function account(value: string) {
  if (!isAccountKey(value)) throw new Error("Invalid synthetic account key")
  return value
}

const A = video("aaaaaaaaaaa")
const B = video("bbbbbbbbbbb")
const C = video("ccccccccccc")
const D = video("ddddddddddd")
const now = 1_000_000_000
const access: GatherAccess = Object.freeze({ www: true, music: true, musicSection: true })
const observed: GatherStart = Object.freeze({
  kind: "observed", hidden: true, fresh: true, restored: false,
  loadedInStartupMinute: false, switchedToSincePageStart: false,
})

function tab(id: number, changes: Partial<GatherAutoTab> = {}): GatherAutoTab {
  return {
    id, index: id - 1, video: video(`v${String(id).padStart(10, "0")}`),
    lastAccessed: now - 86_400_000, active: false, pinned: false, audible: false,
    incognito: false, start: observed, ...changes,
  }
}

function windowOf(tabs: readonly GatherAutoTab[], incognito = false): GatherWindow {
  return { windowId: 7, incognito, tabs }
}

function automatic(auto: Partial<Settings["gather"]["auto"]> = {}): Settings["gather"] {
  const settings = defaultSettings().gather
  return {
    ...settings, on: true,
    auto: { ...settings.auto, unvisited: true, background: true, count: true, n: 5, ...auto },
  }
}

function memory(tabs: readonly GatherAutoTab[], changes: Partial<GatherPickMemory> = {}): GatherPickMemory {
  return {
    account: account("AAAAAAAAAAAAAAAA"), refused: new Set(), kept: new Set(), lastGatherAt: null,
    checks: { unvisited: "due", background: new Set(tabs.map(t => t.id)), count: "due" },
    ...changes,
  }
}

function picked(decisions: readonly GatherTabDecision[]): number[] {
  return decisions.filter(d => d.kind === "picked").map(d => d.tabId)
}

function reasons(decisions: readonly GatherTabDecision[], id = 1): readonly GatherLeaveReason[] {
  const result = decisions.find(d => d.tabId === id)
  if (!result || result.kind !== "left-out") throw new Error(`Expected tab ${id} to be left out`)
  return result.reasons
}

function unusedRandom(): never {
  throw new Error("This order must not request randomness")
}

function source(tabs: readonly GatherAutoTab[], id: number): GatherAutoTab {
  const found = tabs.find(t => t.id === id)
  if (!found) throw new Error(`Missing synthetic source tab ${id}`)
  return found
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

describe("Gather URL recognition", () => {
  const historical: readonly [string, string | null][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5I", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?app=desktop&v=jNQXAC9IVRw&t=10s", "jNQXAC9IVRw"],
    ["https://m.youtube.com/watch?v=jNQXAC9IVRw", null],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/jfKfPfyJRdk?si=abc", "jfKfPfyJRdk"],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", null],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", null],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", null],
    ["https://youtu.be/dQw4w9WgXcQ", null],
    ["https://www.youtube.com/@Veritasium/videos", null],
    ["https://www.youtube.com/@3blue1brown", null],
    ["https://www.youtube.com/@TechnologyConnections", null],
    ["https://www.youtube.com/", null],
    ["https://www.youtube.com/playlist?list=WL", null],
    ["https://www.google.com/search?q=youtube+downloader", null],
    ["https://en.wikipedia.org/wiki/YouTube", null],
    ["https://www.reddit.com/r/youtube/", null],
    ["https://news.example/article", null],
    ["https://studio.youtube.com/channel/UCabc/videos", null],
    ["chrome-extension://noogafoofpebimajpfpamcfhoaifemoa/suspended.html#ttl=R", null],
    ["https://www.youtube.com/watch?v=PLAYLISTabc", "PLAYLISTabc"],
  ]
  for (const [index, [url, expected]] of historical.entries()) {
    test(`historical address ${index + 1} has its target-spec answer`, () => {
      expect(videoOf(url, access)).toBe(expected === null ? null : video(expected))
    })
  }

  for (const url of [
    "", "not a URL", "/watch?v=aaaaaaaaaaa", "https://", "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=", "https://www.youtube.com/watch?v=aaaaaaaaaa",
    "https://www.youtube.com/watch?v=aaaaaaaaaaaa", "https://www.youtube.com/watch?v=aaaaa.aaaaa",
    "https://www.youtube.com/watch?v=aaaaa%2Faaaaa", "https://www.youtube.com/watch?v=aaaaaaaaaa%20",
    "https://www.youtube.com/feed?v=aaaaaaaaaaa", "https://www.youtube.com/results?v=aaaaaaaaaaa",
    "https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa", "https://www.youtube.com/watch/extra?v=aaaaaaaaaaa",
    "https://www.youtube.com/live/aaaaaaaaaaa/extra", "https://www.youtube.com/live/aaaaaaaaaaa/",
    "https://www.youtube.com/live/aaaaaaaaaa", "https://www.youtube.com/live/aaaaaaaaaa%61",
    "https://www.youtube.com/%77atch?v=aaaaaaaaaaa", "https://www.youtube.com/WATCH?v=aaaaaaaaaaa",
    "https://www.youtube.com/shorts/aaaaaaaaaaa?v=bbbbbbbbbbb",
    "https://music.youtube.com/live/aaaaaaaaaaa", "https://music.youtube.com/shorts/aaaaaaaaaaa",
    "https://music.youtube.com/playlist?v=aaaaaaaaaaa", "http://www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://youtube.com/watch?v=aaaaaaaaaaa", "https://mobile.youtube.com/watch?v=aaaaaaaaaaa",
    "https://other.youtube.com/watch?v=aaaaaaaaaaa", "https://www.youtube.com.example/watch?v=aaaaaaaaaaa",
    "https://www.youtube.com:444/watch?v=aaaaaaaaaaa", "https://user@www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://www.youtube.com/watch?v=aaaaaaaaaaa&v=bbbbbbbbbbb",
    "https://www.youtube.com/watch?v=aaaaaaaaaaa&v=aaaaaaaaaaa",
    "https://suspender.example/?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Daaaaaaaaaaa",
    "moz-extension://synthetic/suspended.html#https://www.youtube.com/watch?v=aaaaaaaaaaa",
  ]) {
    test(`rejects unsupported or ambiguous address ${url}`, () => expect(videoOf(url, access)).toBeNull())
  }

  test("www watch and live need www access independently of Music", () => {
    for (const path of ["watch?v=aaaaaaaaaaa", "live/aaaaaaaaaaa"]) {
      expect(videoOf(`https://www.youtube.com/${path}`, { ...access, www: false })).toBeNull()
      expect(videoOf(`https://www.youtube.com/${path}`, { ...access, music: false, musicSection: false })).toBe(A)
    }
  })

  for (const music of [false, true]) for (const musicSection of [false, true]) {
    test(`Music watch gates access=${music}, section=${musicSection}`, () => {
      expect(videoOf(`https://music.youtube.com/watch?v=${A}`, { www: false, music, musicSection }))
        .toBe(music && musicSection ? A : null)
    })
  }

  test("ignores unrelated query fields and fragments, validates URL-safe IDs", () => {
    const id = video("aB0_-aB0_-a")
    expect(videoOf(`https://www.youtube.com/watch?t=10&v=${id}&list=WL&app=desktop#v=bad`, access)).toBe(id)
    expect(videoOf(`https://www.youtube.com/live/${id}?v=bad#fragment`, access)).toBe(id)
  })
})

describe("Gather ordering", () => {
  const tabs = [
    tab(1, { video: A, lastAccessed: 100 }), tab(2, { video: B, lastAccessed: 400 }),
    tab(3, { video: C, lastAccessed: 200 }), tab(4, { video: D, lastAccessed: 300 }),
  ]
  const languages = new Map<number, GatherLanguage>([[1, "other"], [2, "english"], [3, "no-answer"], [4, "english"]])
  const cases: readonly [GatherOrder, readonly number[]][] = [
    ["newest", [2, 4, 3, 1]], ["oldest", [1, 3, 4, 2]],
    ["left-to-right", [1, 2, 3, 4]], ["right-to-left", [4, 3, 2, 1]],
    ["english", [2, 4, 3, 1]], ["non-english", [1, 3, 2, 4]],
    ["shuffled", [4, 3, 2, 1]],
  ]
  for (const [mode, ids] of cases) {
    test(`${mode} gives the full video sequence and source groups`, () => {
      const expected = ids.map(id => ({ video: source(tabs, id).video, firstTabId: id, tabIds: [id] }))
      expect(order(tabs, mode, languages, mode === "shuffled" ? seeded(1) : unusedRandom)).toEqual(expected)
      expect(order([...tabs].reverse(), mode, languages, mode === "shuffled" ? seeded(1) : unusedRandom)).toEqual(expected)
    })
  }

  test("cleans only the leading count and terminal site suffix", () => {
    for (const [title, expected] of [
      ["(3) How to cook rice - YouTube", "How to cook rice"],
      ["(12) 日本の料理 - YouTube Music", "日本の料理"],
      ["How YouTube Music works - YouTube", "How YouTube Music works"],
      ["YouTube - YouTube Music inside a title", "YouTube - YouTube Music inside a title"],
      ["(live) Song - YouTube", "(live) Song"], ["Song (3) - YouTube Music", "Song (3)"],
      ["(3) A - YouTube remix - YouTube", "A - YouTube remix"], ["", ""],
    ] satisfies [string, string][]) expect(languageTitle(title)).toBe(expected)
  })

  test("a missing language answer stays between the two groups", () => {
    const missing = new Map(languages)
    missing.delete(3)
    expect(order(tabs, "english", missing, unusedRandom).map(g => g.firstTabId)).toEqual([2, 4, 3, 1])
    expect(order(tabs, "non-english", missing, unusedRandom).map(g => g.firstTabId)).toEqual([1, 3, 2, 4])
    expect(order([...tabs].reverse(), "english", new Map(), unusedRandom).map(g => g.firstTabId)).toEqual([1, 2, 3, 4])
  })

  test("deduplicates after ordering and retains every occurrence in index order", () => {
    const duplicates = [tab(3, { video: A, lastAccessed: 200 }), tab(1, { video: A, lastAccessed: 100 }), tab(2, { video: B, lastAccessed: 300 })]
    const answers = new Map<number, GatherLanguage>([[1, "other"], [2, "english"], [3, "english"]])
    const representatives: readonly [GatherOrder, readonly number[]][] = [
      ["newest", [2, 3]], ["oldest", [1, 2]], ["left-to-right", [1, 2]],
      ["right-to-left", [3, 2]], ["english", [2, 3]], ["non-english", [1, 2]], ["shuffled", [2, 3]],
    ]
    for (const [mode, ids] of representatives) {
      const expected = ids.map(id => id === 2
        ? { video: B, firstTabId: 2, tabIds: [2] }
        : { video: A, firstTabId: id, tabIds: [1, 3] })
      expect(order(duplicates, mode, answers, mode === "shuffled" ? seeded(1) : unusedRandom)).toEqual(expected)
    }
  })

  test("equal timestamps use the engineering tie-break of left-to-right", () => {
    const tied = tabs.map(t => ({ ...t, lastAccessed: 100 })).reverse()
    for (const mode of ["newest", "oldest"] satisfies GatherOrder[]) {
      expect(order(tied, mode, new Map(), unusedRandom).map(g => g.firstTabId)).toEqual([1, 2, 3, 4])
    }
  })

  test("Fisher-Yates uses a fresh supplied stream and preserves source occurrences", () => {
    expect(order(tabs, "shuffled", new Map(), seeded(1))).toEqual(order(tabs, "shuffled", new Map(), seeded(1)))
    for (const [value, expected] of [[0, [2, 3, 4, 1]], [0.999, [1, 2, 3, 4]]] satisfies [number, number[]][]) {
      let calls = 0
      expect(order(tabs, "shuffled", new Map(), () => { calls++; return value }).map(g => g.firstTabId)).toEqual(expected)
      expect(calls).toBe(3)
    }
    const duplicates = [tab(1, { video: A }), tab(2, { video: B }), tab(3, { video: A })]
    expect(order(duplicates, "shuffled", new Map(), () => 0.5)).toEqual([
      { video: A, firstTabId: 1, tabIds: [1, 3] }, { video: B, firstTabId: 2, tabIds: [2] },
    ])
    expect(order(duplicates, "shuffled", new Map(), () => 0)).toEqual([
      { video: B, firstTabId: 2, tabIds: [2] }, { video: A, firstTabId: 3, tabIds: [1, 3] },
    ])
  })

  test("non-language orders never consult language answers", () => {
    class UnusedLanguages extends Map<number, GatherLanguage> {
      override get(): GatherLanguage | undefined { throw new Error("This order must not read language answers") }
    }
    for (const mode of ["newest", "oldest", "left-to-right", "right-to-left", "shuffled"] satisfies GatherOrder[]) {
      expect(order(tabs, mode, new UnusedLanguages(), mode === "shuffled" ? seeded(1) : unusedRandom)).toHaveLength(4)
    }
  })

  test("empty and singleton inputs need no random samples", () => {
    for (const [mode] of cases) {
      expect(order([], mode, new Map(), unusedRandom)).toEqual([])
      expect(order([tab(1, { video: A })], mode, new Map(), unusedRandom)).toEqual([{ video: A, firstTabId: 1, tabIds: [1] }])
    }
  })
})

describe("Gather automatic eligibility", () => {
  test("canonical defaults and every independent toggle combination", () => {
    const tabs = Array.from({ length: 5 }, (_, i) => tab(i + 1))
    expect(defaultSetup().gather).toBeNull()
    expect(pick(windowOf(tabs), defaultSettings().gather, now, memory(tabs)).selected).toEqual([])
    for (const on of [false, true]) for (const unvisited of [false, true]) {
      for (const background of [false, true]) for (const count of [false, true]) {
        const result = pick(windowOf(tabs), { ...automatic({ unvisited, background, count }), on }, now, memory(tabs))
        for (const [enabled, decisions] of [[unvisited, result.unvisited], [background, result.background], [count, result.count]] satisfies [boolean, readonly GatherTabDecision[]][]) {
          expect(picked(decisions)).toEqual(on && enabled ? [1, 2, 3, 4, 5] : [])
          if (!on) expect(reasons(decisions)).toContain("feature-off")
          if (!enabled) expect(reasons(decisions)).toContain("trigger-off")
        }
        expect(result.selected).toEqual(on && (unvisited || background || count) ? [1, 2, 3, 4, 5] : [])
      }
    }
  })

  test("manual destination, closing, and feedback choices do not change automatic selection", () => {
    const tabs = [tab(1)]
    for (const to of ["player", "queue", "playlist"] satisfies Settings["gather"]["to"][]) {
      for (const close of [false, true]) for (const feedback of [false, true]) {
        expect(pick(windowOf(tabs), { ...automatic(), to, close, feedback }, now, memory(tabs)).selected).toEqual([1])
      }
    }
  })

  const durations: readonly [Settings["gather"]["auto"]["after"], number][] = [
    ["1h", 3_600_000], ["1d", 86_400_000], ["1w", 604_800_000],
  ]
  for (const [after, duration] of durations) for (const delta of [-1, 0, 1]) {
    test(`unvisited ${after}, age duration ${delta < 0 ? "minus" : "plus"} ${Math.abs(delta)} ms`, () => {
      const tabs = [tab(1, { lastAccessed: now - duration - delta, start: { kind: "unobserved" } })]
      const result = pick(windowOf(tabs), automatic({ after, background: false, count: false }), now, memory(tabs))
      expect(result.selected).toEqual(delta >= 0 ? [1] : [])
      if (delta < 0) expect(reasons(result.unvisited)).toEqual(["too-recent"])
    })
  }

  test("future lastAccessed is too recent and a never-visited tab uses its supplied opened-at time", () => {
    const tabs = [tab(1, { lastAccessed: now + 1 }), tab(2, { lastAccessed: now - 3_600_000, start: { kind: "unobserved" } })]
    const result = pick(windowOf(tabs), automatic({ after: "1h", background: false, count: false }), now, memory(tabs))
    expect(result.selected).toEqual([2])
    expect(reasons(result.unvisited)).toEqual(["too-recent"])
  })

  const exclusions: readonly [GatherLeaveReason, Partial<GatherAutoTab>][] = [
    ["active", { active: true }], ["pinned", { pinned: true }], ["audible", { audible: true }],
    ["private", { incognito: true }], ["undo-kept", {}], ["lasting-failure", {}],
  ]
  for (const [reason, changes] of exclusions) {
    test(`${reason} excludes a tab from every trigger and the count denominator`, () => {
      const tabs = [tab(1, changes), ...Array.from({ length: 4 }, (_, i) => tab(i + 2))]
      const state = memory(tabs, {
        kept: new Set(reason === "undo-kept" ? [1] : []),
        refused: new Set(reason === "lasting-failure" ? [tab(1).video] : []),
      })
      const result = pick(windowOf(tabs), automatic(), now, state)
      expect(reasons(result.unvisited)).toEqual([reason])
      expect(reasons(result.background)).toEqual([reason])
      expect(new Set(reasons(result.count))).toEqual(new Set([reason, "below-count"]))
      expect(picked(result.count)).toEqual([])
      expect(result.selected).toEqual([2, 3, 4, 5])
    })
  }

  test("reports simultaneous common exclusions without inventing precedence", () => {
    const tabs = [tab(1, { active: true, pinned: true, audible: true, incognito: true })]
    const result = pick(windowOf(tabs), automatic(), now, memory(tabs, { kept: new Set([1]), refused: new Set([tab(1).video]) }))
    const expected = new Set<GatherLeaveReason>(["private", "active", "pinned", "audible", "undo-kept", "lasting-failure"])
    expect(new Set(reasons(result.unvisited))).toEqual(expected)
    expect(new Set(reasons(result.background))).toEqual(expected)
    expect(new Set(reasons(result.count))).toEqual(new Set<GatherLeaveReason>([...expected, "below-count"]))
    expect(result.selected).toEqual([])
  })

  test("a private window never selects or counts even if its tab projections are normal", () => {
    const tabs = Array.from({ length: 5 }, (_, i) => tab(i + 1))
    const result = pick(windowOf(tabs, true), automatic(), now, memory(tabs))
    expect(result.selected).toEqual([])
    for (const t of tabs) {
      expect(reasons(result.unvisited, t.id)).toEqual(["private"])
      expect(reasons(result.background, t.id)).toEqual(["private"])
      expect(new Set(reasons(result.count, t.id))).toEqual(new Set(["private", "below-count"]))
    }
  })

  const starts: readonly [GatherLeaveReason, GatherStart][] = [
    ["start-unobserved", { kind: "unobserved" }],
    ["not-started-hidden", { ...observed, hidden: false }],
    ["not-first-load", { ...observed, fresh: false }],
    ["restored", { ...observed, restored: true }],
    ["startup-minute", { ...observed, loadedInStartupMinute: true }],
    ["switched-since-page-start", { ...observed, switchedToSincePageStart: true }],
  ]
  for (const [reason, start] of starts) {
    test(`${reason} only suppresses the background trigger`, () => {
      const tabs = [tab(1, { start }), ...Array.from({ length: 4 }, (_, i) => tab(i + 2))]
      const result = pick(windowOf(tabs), automatic(), now, memory(tabs))
      expect(reasons(result.background)).toEqual([reason])
      expect(picked(result.background)).toEqual([2, 3, 4, 5])
      expect(picked(result.unvisited)).toEqual([1, 2, 3, 4, 5])
      expect(picked(result.count)).toEqual([1, 2, 3, 4, 5])
    })
  }

  test("all observed background exclusions remain distinct even when the tab is now hidden", () => {
    const tabs = [tab(1, { active: false, start: {
      kind: "observed", hidden: false, fresh: false, restored: true,
      loadedInStartupMinute: true, switchedToSincePageStart: true,
    } })]
    const result = pick(windowOf(tabs), automatic(), now, memory(tabs))
    expect(new Set(reasons(result.background))).toEqual(new Set([
      "not-started-hidden", "not-first-load", "restored", "startup-minute", "switched-since-page-start",
    ]))
    expect(picked(result.unvisited)).toEqual([1])
  })

  test("startup-minute boundary consumes a normalized caller fact, not a guessed page timestamp", () => {
    const browserStartedAt = 100_000
    for (const elapsed of [59_999, 60_000]) {
      const loadAt = browserStartedAt + elapsed
      const tabs = [tab(1, { start: { ...observed, loadedInStartupMinute: loadAt - browserStartedAt < 60_000 } })]
      const result = pick(windowOf(tabs), automatic({ unvisited: false, count: false }), loadAt + 1_000, memory(tabs))
      expect(result.selected).toEqual(elapsed < 60_000 ? [] : [1])
      if (elapsed < 60_000) expect(reasons(result.background)).toEqual(["startup-minute"])
    }
  })

  test("background authorization names pending tab IDs, never every currently hidden tab", () => {
    const tabs = [tab(1), tab(2)]
    const result = pick(windowOf(tabs), automatic({ unvisited: false, count: false }), now, memory(tabs, {
      checks: { unvisited: "due", background: new Set([2, 999]), count: "due" },
    }))
    expect(result.selected).toEqual([2])
    expect(reasons(result.background)).toEqual(["not-in-background-burst"])
  })

  for (const n of [5, 10, 15, 20, 30, 50] satisfies Settings["gather"]["auto"]["n"][]) {
    test(`count threshold ${n} counts eligible tabs before video deduplication`, () => {
      const tabs = Array.from({ length: n }, (_, i) => tab(i + 1, { video: i === 0 || i === n - 1 ? A : video(`v${String(i).padStart(10, "0")}`) }))
      const options = automatic({ unvisited: false, background: false, count: true, n })
      const below = tabs.slice(0, -1)
      const insufficient = pick(windowOf(below), options, now, memory(below))
      expect(insufficient.selected).toEqual([])
      for (const t of below) expect(reasons(insufficient.count, t.id)).toEqual(["below-count"])
      const withActive = [...tabs, tab(n + 1, { active: true })]
      const result = pick(windowOf(withActive), options, now, memory(withActive))
      expect(result.selected).toEqual(tabs.map(t => t.id))
      expect(picked(result.count)).toHaveLength(n)
      expect(reasons(result.count, n + 1)).toEqual(["active"])
      expect(order(tabs, "left-to-right", new Map(), unusedRandom)).toHaveLength(n - 1)
    })
  }

  test("each due authorization is independent of toggles and other triggers", () => {
    const tabs = Array.from({ length: 5 }, (_, i) => tab(i + 1))
    for (const unvisited of ["due", "not-due"] satisfies GatherPickMemory["checks"]["unvisited"][]) {
      for (const count of ["due", "not-due"] satisfies GatherPickMemory["checks"]["count"][]) {
        const result = pick(windowOf(tabs), automatic(), now, memory(tabs, { checks: { unvisited, count, background: new Set() } }))
        expect(picked(result.unvisited)).toEqual(unvisited === "due" ? [1, 2, 3, 4, 5] : [])
        expect(picked(result.count)).toEqual(count === "due" ? [1, 2, 3, 4, 5] : [])
        expect(picked(result.background)).toEqual([])
        if (unvisited === "not-due") expect(reasons(result.unvisited)).toEqual(["check-not-due"])
        if (count === "not-due") expect(reasons(result.count)).toEqual(["check-not-due"])
      }
    }
  })

  test("popup open and option switch-on do not authorize count in an already over-N window", () => {
    const tabs = Array.from({ length: 6 }, (_, i) => tab(i + 1))
    const options = automatic({ unvisited: false, background: false })
    const state = memory(tabs, { checks: { unvisited: "not-due", background: new Set(), count: "not-due" } })
    expect(pick(windowOf(tabs), options, now, state).selected).toEqual([])
    expect(pick(windowOf(tabs), options, now, { ...state, checks: { ...state.checks, count: "due" } }).selected).toEqual([1, 2, 3, 4, 5, 6])
  })

  test("the union includes each candidate once while preserving every trigger decision", () => {
    const tabs = [tab(1), tab(2, { lastAccessed: now }), tab(3, { start: { kind: "unobserved" } }), tab(4), tab(5)]
    const result = pick(windowOf(tabs), automatic(), now, memory(tabs))
    expect(picked(result.unvisited)).toEqual([1, 3, 4, 5])
    expect(picked(result.background)).toEqual([1, 2, 4, 5])
    expect(picked(result.count)).toEqual([1, 2, 3, 4, 5])
    expect(new Set(result.selected)).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(result.selected).toHaveLength(5)
    for (const decisions of [result.unvisited, result.background, result.count]) {
      expect(decisions.map(d => d.tabId)).toEqual(tabs.map(t => t.id))
    }
  })

  test("refusals are a saving-account projection and kept protection is tab-specific", () => {
    const tabs = [tab(1, { video: A }), tab(2, { video: A }), tab(3, { video: B })]
    const x = memory(tabs, { account: account("XXXXXXXXXXXXXXXX"), refused: new Set([A]), kept: new Set([3]) })
    const y = memory(tabs, { account: account("YYYYYYYYYYYYYYYY"), refused: new Set(), kept: new Set([1]) })
    expect(pick(windowOf(tabs), automatic(), now, x).selected).toEqual([])
    expect(pick(windowOf(tabs), automatic(), now, y).selected).toEqual([2, 3])
    expect(pick(windowOf(tabs), automatic(), now, { ...y, kept: new Set() }).selected).toEqual([1, 2, 3])
  })

  test("pace is separate from candidates, exact at 60 seconds, and never consumed by a check", () => {
    const tabs = [tab(1)]
    const state = memory(tabs, { lastGatherAt: 100_000 })
    const options = automatic({ after: "1h", unvisited: false, count: false })
    for (const [at, expected] of [[159_999, { kind: "wait", nextAllowedAt: 160_000 }], [160_000, { kind: "allowed" }], [160_001, { kind: "allowed" }]] satisfies [number, GatherPace][]) {
      const result = pick(windowOf(tabs), options, at, state)
      expect(result.pace).toEqual(expected)
      expect(result.selected).toEqual([1])
      expect(pick(windowOf(tabs), options, at, state)).toEqual(result)
    }
    expect(pick(windowOf(tabs), options, 0, memory(tabs)).pace).toEqual({ kind: "allowed" })
    expect(pick(windowOf(tabs), options, 59_999, memory(tabs, { lastGatherAt: 0 })).pace).toEqual({ kind: "wait", nextAllowedAt: 60_000 })
    expect(pick(windowOf(tabs), options, 60_000, memory(tabs, { lastGatherAt: 0 })).pace).toEqual({ kind: "allowed" })
    expect(pick(windowOf([]), options, 159_999, state)).toEqual({
      unvisited: [], background: [], count: [], selected: [], pace: { kind: "wait", nextAllowedAt: 160_000 },
    })
    expect(state.lastGatherAt).toBe(100_000)
  })
})

describe("Gather caller composition and purity", () => {
  test("automatic callers filter excluded duplicates, then order, then cap 50 unique videos", () => {
    const eligibleDuplicates = Array.from({ length: 60 }, (_, i) => tab(i + 1, { video: A }))
    const unique = Array.from({ length: 50 }, (_, i) => tab(i + 61))
    const excluded = [
      tab(111, { video: A, active: true }), tab(112, { video: A, pinned: true }),
      tab(113, { video: A, audible: true }), tab(114, { video: A, incognito: true }), tab(115, { video: A }),
    ]
    const tabs = [...eligibleDuplicates, ...unique, ...excluded].reverse()
    const state = memory(tabs, { kept: new Set([115]) })
    const result = pick(windowOf(tabs), automatic(), now, state)
    expect(result.selected).toHaveLength(110)
    const selected = new Set(result.selected)
    const eligible = tabs.filter(t => selected.has(t.id))
    const groups = order(eligible, "left-to-right", new Map(), unusedRandom)
    const planned = groups.slice(0, 50)
    const deferred = groups.slice(50)
    expect(groups).toHaveLength(51)
    expect(planned).toHaveLength(50)
    expect(planned[0]).toEqual({ video: A, firstTabId: 1, tabIds: eligibleDuplicates.map(t => t.id) })
    expect(planned.flatMap(g => g.tabIds)).toEqual([...eligibleDuplicates, ...unique.slice(0, 49)].map(t => t.id))
    expect(deferred).toEqual([{ video: tab(110).video, firstTabId: 110, tabIds: [110] }])
    for (const t of excluded) expect(groups.flatMap(g => g.tabIds)).not.toContain(t.id)
    const rightToLeft = order(eligible, "right-to-left", new Map(), unusedRandom).slice(0, 50)
    expect(rightToLeft.map(g => g.firstTabId)).toEqual([...unique].reverse().map(t => t.id))
    expect(rightToLeft.some(g => g.video === A)).toBe(false)
  })

  test("manual callers use URL recognition and order without automatic exclusions or pace", () => {
    const raw = [
      { url: `https://www.youtube.com/watch?v=${A}`, facts: tab(1, { video: A, active: true, pinned: true, audible: true, incognito: true }) },
      { url: `https://www.youtube.com/live/${B}`, facts: tab(2, { video: B }) },
      { url: `https://www.youtube.com/shorts/${C}`, facts: tab(3, { video: C }) },
    ]
    const supported = raw.flatMap(({ url, facts }) => {
      const id = videoOf(url, access)
      return id === null ? [] : [{ ...facts, video: id }]
    })
    expect(order(supported, "left-to-right", new Map(), unusedRandom)).toEqual([
      { video: A, firstTabId: 1, tabIds: [1] }, { video: B, firstTabId: 2, tabIds: [2] },
    ])
  })

  test("frozen inputs and Map/Set contents survive repeated selection and every order", () => {
    const tabs = Object.freeze([
      Object.freeze(tab(1, { video: A, start: Object.freeze({ ...observed }) })),
      Object.freeze(tab(2, { video: B, start: Object.freeze({ kind: "unobserved" }) })),
      Object.freeze(tab(3, { video: A })),
    ])
    const window = Object.freeze(windowOf(tabs))
    const options = automatic()
    Object.freeze(options.auto)
    Object.freeze(options)
    const state = memory(tabs, { refused: Object.freeze(new Set([B])), kept: Object.freeze(new Set([3])) })
    Object.freeze(state.checks.background)
    Object.freeze(state.checks)
    Object.freeze(state)
    const languages = Object.freeze(new Map<number, GatherLanguage>([[1, "english"], [2, "other"]]))
    const before = JSON.stringify({ window, options, state })
    const containers = {
      refused: [...state.refused], kept: [...state.kept], background: [...state.checks.background], languages: [...languages],
    }
    const first = pick(window, options, now, state)
    expect(pick(window, options, now, state)).toEqual(first)
    for (const mode of ["newest", "oldest", "left-to-right", "right-to-left", "english", "non-english", "shuffled"] satisfies GatherOrder[]) {
      expect(order(tabs, mode, languages, seeded(1))).toEqual(order(tabs, mode, languages, seeded(1)))
    }
    expect(JSON.stringify({ window, options, state })).toBe(before)
    expect({ refused: [...state.refused], kept: [...state.kept], background: [...state.checks.background], languages: [...languages] }).toEqual(containers)
    expect(videoOf(`https://www.youtube.com/watch?v=${A}`, access)).toBe(A)
    expect(access).toEqual({ www: true, music: true, musicSection: true })
  })
})
