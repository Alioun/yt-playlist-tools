import { describe, expect, test } from "bun:test"
import { isVideoId } from "../../../shared/model"
import {
  createTracker, evaluateGoals, progress, recordOutcome, recordReading, updateTracker,
  type DestinationOutcome, type Parts, type PlaybackFacts, type Tracker, type TrackerSettings,
} from "./tracker"

function video(value: string) {
  if (!isVideoId(value)) throw new Error("Invalid synthetic video ID")
  return value
}
const id = video("aaaaaaaaaaa")
const other = video("bbbbbbbbbbb")
const facts: PlaybackFacts = { content: "video", duration: 100, listedDuration: 100 }
const settings: TrackerSettings = {
  playlists: [{ pl: "PLvideos", takes: "both" }], defaultPct: 100, paused: false, skipped: [],
}

function tracker(options: { facts?: Partial<PlaybackFacts>; settings?: Partial<TrackerSettings>; kind?: Tracker["kind"]; parts?: Parts; length?: number } = {}) {
  return createTracker({
    video: id, kind: options.kind ?? "videos",
    facts: { ...facts, ...options.facts }, settings: { ...settings, ...options.settings },
    remembered: options.parts ? { length: options.length ?? 100, parts: options.parts } : undefined,
  })
}

function play(state: Tracker, position: number, at = position, rate = 1): Tracker {
  return recordReading(state, { kind: "playing", video: id, position, at, rate })
}

function stretch(state: Tracker, start: number, end: number, at = 0, rate = 1): Tracker {
  state = recordReading(state, { kind: "seeking" })
  return play(play(state, start, at, rate), end, at + (end - start) / rate, rate)
}

describe("unique played portions", () => {
  test("a resume point and a timestamp start earn no credit", () => {
    let state = play(tracker(), 80, 0)
    expect(progress(state).counted).toBe(0)
    state = play(state, 81, 1)
    expect(progress(state).counted).toBe(1)
    expect(evaluateGoals(state).due).toEqual([])
  })

  test("replayed, overlapping, nested, and out-of-order portions count once", () => {
    let state = tracker()
    const portions: Parts = [[20, 30], [0, 10], [5, 25], [8, 9], [0, 30]]
    for (const [start, end] of portions) state = stretch(state, start, end)
    expect(progress(state).counted).toBe(30)
    expect(progress(state).remembered?.parts).toEqual([[0, 30]])
  })

  const gaps: [number, number][] = [[0.999, 20.999], [1, 21], [1.001, 20]]
  for (const [gap, counted] of gaps) {
    test(`a ${gap} second gap counts ${counted} seconds`, () => {
      const state = stretch(stretch(tracker(), 0, 10), 10 + gap, 20 + gap)
      expect(progress(state).counted).toBeCloseTo(counted, 8)
    })
  }

  test("bridging two gaps joins all portions without double counting", () => {
    let state = stretch(stretch(tracker(), 0, 10), 22, 30)
    state = stretch(state, 11, 21)
    expect(progress(state).remembered?.parts).toEqual([[0, 30]])
  })

  test("a forward jump is rejected, then a new stretch starts there", () => {
    let state = play(play(tracker(), 0, 0), 1, 1)
    state = play(state, 20, 2)
    expect(progress(state).counted).toBe(1)
    state = play(state, 21, 3)
    expect(progress(state).counted).toBe(2)
  })

  for (const rate of [0.25, 1, 2, 4, 16]) {
    test(`counts video seconds at ${rate}x, with the exact jump allowance`, () => {
      const initial = play(tracker(), 0, 0, rate)
      expect(progress(play(initial, rate + 1, 1, rate)).counted).toBe(rate + 1)
      expect(progress(play(initial, rate + 1.001, 1, rate)).counted).toBe(0)
      expect(progress(stretch(tracker(), 0, 20, 0, rate)).counted).toBe(20)
    })
  }

  test("rate changes apply to the following interval", () => {
    let state = play(play(tracker(), 0, 0), 2, 2, 16)
    state = play(state, 18, 3, 0.25)
    state = play(state, 18.25, 4, 0.25)
    expect(progress(state).counted).toBe(18.25)
  })

  for (const kind of ["paused", "buffering", "seeking", "ad", "ended"] satisfies ("paused" | "buffering" | "seeking" | "ad" | "ended")[]) {
    test(`${kind} interrupts continuity and its elapsed time earns nothing`, () => {
      let state = stretch(tracker(), 0, 10)
      state = recordReading(state, { kind })
      state = play(state, 50, 100)
      expect(progress(state).counted).toBe(10)
      state = play(state, 51, 101)
      expect(progress(state).counted).toBe(11)
    })
  }

  test("an ad resumes at the content position without a wall-clock gap", () => {
    let state = stretch(tracker(), 0, 10)
    state = recordReading(state, { kind: "ad" })
    state = play(play(state, 10, 60), 11, 61)
    expect(progress(state).remembered?.parts).toEqual([[0, 11]])
  })

  test("a different video cannot bridge two readings of this playback", () => {
    let state = play(tracker(), 0, 0)
    state = recordReading(state, { kind: "playing", video: other, position: 90, at: 90, rate: 1 })
    state = play(play(state, 30, 100), 31, 101)
    expect(progress(state).counted).toBe(1)
  })

  test("a Short loop is a jump and a second loop repeats the same portions", () => {
    let state = tracker({ kind: "shorts", facts: { duration: 10, listedDuration: 10 } })
    state = play(play(state, 0, 0), 8, 8)
    state = play(play(state, 0, 10), 8, 18)
    expect(progress(state).counted).toBe(8)
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("zero or backwards clock movement never earns credit", () => {
    const initial = play(tracker(), 0, 10)
    expect(progress(play(initial, 1, 10)).counted).toBe(0)
    expect(progress(play(initial, 1, 9)).counted).toBe(0)
  })
})

describe("goals and duration", () => {
  const boundaries: [duration: number, pct: number, goal: number][] = [
    [0.5, 0, 0.5], [0.5, 100, 0.5], [1, 0, 1], [1, 100, 1],
    [2.999, 0, 1], [2.999, 100, 2.999], [3, 0, 1], [3, 100, 1],
    [3.001, 100, 1.001], [100, 0, 1], [100, 50, 50], [100, 100, 98],
  ]
  for (const [duration, pct, goal] of boundaries) {
    test(`${pct}% of ${duration}s fires at ${goal}s, never just below`, () => {
      let state = tracker({ facts: { duration, listedDuration: duration }, settings: { defaultPct: pct } })
      state = play(play(state, 0, 0), goal - 0.0001, goal - 0.0001)
      expect(evaluateGoals(state).due).toEqual([])
      state = play(state, goal, goal)
      expect(evaluateGoals(state).due).toEqual(["PLvideos"])
    })
  }

  test("100% cannot use a large skipped portion to reach its goal", () => {
    let state = stretch(tracker(), 0, 40)
    state = stretch(state, 50, 100)
    expect(progress(state).counted).toBe(90)
    expect(evaluateGoals(state).due).toEqual([])
  })

  test("unknown length accumulates seconds and evaluates once known", () => {
    let state = stretch(tracker({ facts: { duration: null, listedDuration: null } }), 30, 80)
    expect(progress(state).counted).toBe(50)
    expect(progress(state).percentage).toBeNull()
    expect(evaluateGoals(state).due).toEqual([])
    state = updateTracker(state, { facts })
    state = updateTracker(state, { settings: { defaultPct: 50 } })
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  for (const difference of [2, 2.001]) {
    test(`a ${difference}s listed-length disagreement uses the exact >2s boundary`, () => {
      const state = stretch(tracker({ facts: { listedDuration: 100 + difference } }), 0, 98)
      expect(state.measurement).toBe(difference === 2 ? "measurable" : "cant-measure")
      expect(evaluateGoals(state).due).toEqual(difference === 2 ? ["PLvideos"] : [])
    })
  }

  test("a disagreement invalidates this playback even if later lengths agree", () => {
    let state = stretch(tracker(), 0, 40)
    state = updateTracker(state, { facts: { ...facts, listedDuration: 103 } })
    state = updateTracker(state, { facts })
    state = stretch(state, 40, 100)
    expect(progress(state).counted).toBe(0)
    expect(evaluateGoals(state).due).toEqual([])
  })

  test("the player duration, not the listed duration, determines the goal", () => {
    const state = stretch(tracker({ facts: { listedDuration: 102 }, settings: { defaultPct: 50 } }), 0, 50)
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("an ad cannot fire a newly lowered goal", () => {
    let state = recordReading(stretch(tracker(), 0, 10), { kind: "ad" })
    state = updateTracker(state, { settings: { defaultPct: 0 } })
    expect(evaluateGoals(state).due).toEqual([])
    state = play(state, 10, 100)
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("facts and pause changes cannot end an ad interruption", () => {
    let state = recordReading(stretch(tracker(), 0, 98), { kind: "ad" })
    state = updateTracker(state, { facts, settings: { paused: true } })
    state = updateTracker(state, { settings: { paused: false } })
    expect(evaluateGoals(state).due).toEqual([])
    state = play(state, 98, 200)
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("playlists have independent overrides and new choices apply immediately", () => {
    let state = stretch(tracker({ settings: { playlists: [
      { pl: "PLlow", takes: "videos", pct: 10 }, { pl: "PLhigh", takes: "both", pct: 90 },
    ] } }), 0, 50)
    const first = evaluateGoals(state)
    expect(first.due).toEqual(["PLlow"])
    state = updateTracker(first.tracker, { settings: { playlists: [
      { pl: "PLlow", takes: "videos", pct: 0 }, { pl: "PLhigh", takes: "both", pct: 50 },
      { pl: "PLnew", takes: "videos", pct: 50 },
    ] } })
    expect(evaluateGoals(state).due).toEqual(["PLhigh", "PLnew"])
  })
})

describe("which playback counts", () => {
  for (const excluded of [
    { isPostLiveDvr: true }, { isLive: true, isLiveContent: true },
    { isLive: true, isLiveContent: false }, { isUpcoming: true },
    { isLiveContent: true, duration: null, listedDuration: null },
    { content: "clip" }, { content: "made-for-kids" },
  ] satisfies Partial<PlaybackFacts>[]) {
    test(`does not count ${JSON.stringify(excluded)}`, () => {
      const state = stretch(tracker({ facts: excluded }), 0, 98)
      expect(progress(state).counted).toBe(0)
      expect(progress(state).needsSamples).toBe(false)
      expect(evaluateGoals(state).due).toEqual([])
    })
  }

  for (const isLiveContent of [false, true]) {
    test(`a fixed-length replay counts with isLiveContent=${isLiveContent}`, () => {
      const state = stretch(tracker({ facts: { isLiveContent } }), 0, 98)
      expect(evaluateGoals(state).due).toEqual(["PLvideos"])
    })
  }

  test("live-to-recorded starts counting at the transition without live credit", () => {
    let state = stretch(tracker({ facts: { isLive: true, isLiveContent: true } }), 0, 50)
    state = updateTracker(state, { facts: { ...facts, isLiveContent: true } })
    state = play(play(state, 50, 50), 60, 60)
    expect(progress(state).counted).toBe(10)
  })

  for (const kind of ["videos", "shorts"] satisfies Tracker["kind"][]) {
    test(`${kind} only counts toward matching Takes settings`, () => {
      let state = tracker({ kind, settings: { playlists: [
        { pl: "PLvideo", takes: "videos" }, { pl: "PLshort", takes: "shorts" }, { pl: "PLboth", takes: "both" },
      ] } })
      state = stretch(state, 0, 98)
      expect(evaluateGoals(state).due).toEqual([kind === "videos" ? "PLvideo" : "PLshort", "PLboth"])
    })
  }

  test("no matching playlist means no tracking, including after settings change", () => {
    let state = stretch(tracker({ kind: "shorts", settings: { playlists: [{ pl: "PLvideo", takes: "videos" }] } }), 0, 50)
    expect(progress(state).counted).toBe(0)
    state = updateTracker(state, { settings })
    state = play(state, 60, 60)
    expect(progress(state).counted).toBe(0)
    state = play(state, 61, 61)
    expect(progress(state).counted).toBe(1)
  })

  test("pausing auto-add excludes all progress until a new baseline after resume", () => {
    let state = stretch(tracker(), 0, 10)
    state = updateTracker(state, { settings: { paused: true } })
    state = stretch(state, 10, 80)
    expect(progress(state).counted).toBe(10)
    expect(evaluateGoals(state).due).toEqual([])
    state = updateTracker(state, { settings: { paused: false } })
    state = play(play(state, 80, 80), 90, 90)
    expect(progress(state).counted).toBe(20)
  })
})

describe("progress, skips, and destination completion", () => {
  test("remembered portions union across visits; outcomes reset only the next visit", () => {
    const first = stretch(tracker(), 0, 40)
    const remembered = progress(first).remembered
    if (!remembered) throw new Error("Expected remembered progress")
    let second = createTracker({ video: id, kind: "videos", facts, settings, remembered })
    second = stretch(second, 40, 98)
    expect(progress(second).counted).toBe(98)
    second = recordOutcome(evaluateGoals(second).tracker, { playlist: "PLvideos", outcome: "added" })
    expect(progress(second).hasRun).toBe(true)
    expect(progress(second).remembered).toBeNull()
    expect(progress(second).counted).toBe(98)
    expect(evaluateGoals(stretch(second, 0, 100)).due).toEqual([])
    expect(progress(tracker()).counted).toBe(0)
  })

  for (const length of [98, 97.999]) {
    test(`remembered duration ${length} uses the exact >2s invalidation boundary`, () => {
      const state = tracker({ length, parts: [[0, 40]] })
      expect(progress(state).counted).toBe(length === 98 ? 40 : 0)
    })
  }

  test("late duration discovery drops old mismatched portions but keeps this visit's playback", () => {
    let state = tracker({ facts: { duration: null, listedDuration: null }, length: 200, parts: [[0, 40]] })
    state = stretch(state, 50, 60)
    state = updateTracker(state, { facts })
    expect(progress(state).counted).toBe(10)
  })

  test("a session skip preserves and accumulates progress, then unskip checks immediately", () => {
    let state = tracker({ settings: { skipped: ["PLvideos"] } })
    expect(progress(state).needsSamples).toBe(true)
    state = stretch(state, 0, 98)
    expect(evaluateGoals(state).due).toEqual([])
    expect(progress(state).needsSamples).toBe(false)
    expect(progress(state).hasRun).toBe(false)
    expect(progress(state).remembered?.parts).toEqual([[0, 98]])
    state = updateTracker(state, { settings: { skipped: [] } })
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("only added and already-in settle a complete destination run", () => {
    for (const outcome of ["added", "already-in", "filtered", "failed", "skipped"] satisfies DestinationOutcome[]) {
      let state = stretch(tracker(), 0, 98)
      state = recordOutcome(evaluateGoals(state).tracker, { playlist: "PLvideos", outcome })
      expect(progress(state).hasRun).toBe(outcome === "added" || outcome === "already-in")
      expect(progress(state).remembered === null).toBe(outcome === "added" || outcome === "already-in")
      expect(evaluateGoals(state).due).toEqual(outcome === "skipped" ? ["PLvideos"] : [])
    }
  })

  test("partial success keeps progress until every taking playlist succeeds", () => {
    let state = stretch(tracker({ settings: { playlists: [
      { pl: "PLfirst", takes: "videos", pct: 0 }, { pl: "PLlater", takes: "both", pct: 100 },
      { pl: "PLshort", takes: "shorts", pct: 0 },
    ] } }), 0, 1)
    state = recordOutcome(evaluateGoals(state).tracker, { playlist: "PLfirst", outcome: "added" })
    expect(progress(state).hasRun).toBe(false)
    expect(progress(state).remembered).not.toBeNull()
    expect(progress(state).needsSamples).toBe(true)
    state = stretch(state, 1, 98)
    state = recordOutcome(evaluateGoals(state).tracker, { playlist: "PLlater", outcome: "already-in" })
    expect(progress(state).hasRun).toBe(true)
    expect(progress(state).needsSamples).toBe(false)
  })

  const runs: [first: DestinationOutcome, second: DestinationOutcome, complete: boolean][] = [
    ["added", "added", true], ["added", "already-in", true], ["already-in", "already-in", true],
    ["added", "filtered", false], ["added", "failed", false], ["already-in", "skipped", false],
    ["filtered", "filtered", false], ["failed", "failed", false], ["skipped", "skipped", false],
  ]
  for (const [first, second, complete] of runs) {
    test(`a destination run with ${first} and ${second} ${complete ? "drops" : "keeps"} progress`, () => {
      const initial = stretch(tracker({ settings: { playlists: [
        { pl: "PLfirst", takes: "videos" }, { pl: "PLsecond", takes: "both" },
      ] } }), 0, 98)
      let state = evaluateGoals(initial).tracker
      expect(progress(state).hasRun).toBe(false)
      state = recordOutcome(state, { playlist: "PLfirst", outcome: first })
      expect(progress(state).hasRun).toBe(false)
      state = recordOutcome(state, { playlist: "PLsecond", outcome: second })
      expect(progress(state).hasRun).toBe(complete)
      expect(progress(state).remembered === null).toBe(complete)
    })
  }

  test("a settled destination ignores duplicate or contradictory completions", () => {
    let state = evaluateGoals(stretch(tracker(), 0, 98)).tracker
    state = recordOutcome(state, { playlist: "PLvideos", outcome: "added" })
    expect(recordOutcome(state, { playlist: "PLvideos", outcome: "failed" })).toBe(state)
    expect(progress(state).hasRun).toBe(true)
  })

  test("a newly selected higher goal keeps this playback's counted portions", () => {
    let state = tracker({ settings: { defaultPct: 10 } })
    state = recordOutcome(evaluateGoals(stretch(state, 0, 10)).tracker, { playlist: "PLvideos", outcome: "added" })
    expect(progress(state).remembered).toBeNull()
    state = updateTracker(state, { settings: { playlists: [
      { pl: "PLvideos", takes: "both" }, { pl: "PLnew", takes: "videos", pct: 50 },
    ] } })
    expect(progress(state).needsSamples).toBe(true)
    expect(progress(state).counted).toBe(10)
    state = stretch(state, 10, 50)
    expect(evaluateGoals(state).due).toEqual(["PLnew"])
  })

  test("restarting for a newly selected playlist cannot credit time while not listening", () => {
    let state = tracker({ settings: { defaultPct: 10 } })
    state = evaluateGoals(stretch(state, 0, 10)).tracker
    expect(progress(state).needsSamples).toBe(false)
    state = updateTracker(state, { settings: { playlists: [
      { pl: "PLvideos", takes: "both" }, { pl: "PLnew", takes: "videos", pct: 50 },
    ] } })
    state = play(state, 60, 60)
    expect(progress(state).counted).toBe(10)
    state = play(state, 61, 61)
    expect(progress(state).counted).toBe(11)
    expect(evaluateGoals(state).due).toEqual([])
  })

  test("raising a reached skipped goal also restarts with a fresh sample", () => {
    let state = tracker({ settings: { defaultPct: 10, skipped: ["PLvideos"] } })
    state = evaluateGoals(stretch(state, 0, 10)).tracker
    expect(progress(state).needsSamples).toBe(false)
    state = updateTracker(state, { settings: { defaultPct: 100 } })
    state = play(play(state, 60, 60), 70, 70)
    expect(progress(state).counted).toBe(20)
  })

  test("once per playback includes in-flight, filtered and failed destinations", () => {
    let state = stretch(tracker(), 0, 98)
    state = evaluateGoals(state).tracker
    expect(evaluateGoals(state).due).toEqual([])
    state = updateTracker(state, { settings: { playlists: [] } })
    state = recordOutcome(state, { playlist: "PLvideos", outcome: "failed" })
    state = updateTracker(state, { settings })
    expect(evaluateGoals(state).due).toEqual([])
    expect(progress(state).remembered).not.toBeNull()
  })

  test("a skip set while an add is in flight releases that destination for later unskip", () => {
    let state = evaluateGoals(stretch(tracker(), 0, 98)).tracker
    state = updateTracker(state, { settings: { skipped: ["PLvideos"] } })
    state = recordOutcome(state, { playlist: "PLvideos", outcome: "skipped" })
    expect(evaluateGoals(state).due).toEqual([])
    state = updateTracker(state, { settings: { skipped: [] } })
    expect(evaluateGoals(state).due).toEqual(["PLvideos"])
  })

  test("an outcome cannot settle an unissued destination", () => {
    const state = stretch(tracker({ settings: { skipped: ["PLvideos"] } }), 0, 98)
    expect(recordOutcome(state, { playlist: "PLvideos", outcome: "added" })).toBe(state)
    expect(progress(state).hasRun).toBe(false)
  })

  test("all functions leave frozen inputs unchanged", () => {
    const remembered = { length: 100, parts: [[0, 10]] satisfies Parts }
    Object.freeze(remembered.parts[0])
    Object.freeze(remembered.parts)
    Object.freeze(remembered)
    const state = createTracker({ video: id, kind: "videos", facts, settings, remembered })
    Object.freeze(state.facts)
    for (const part of state.remembered?.parts ?? []) Object.freeze(part)
    Object.freeze(state.remembered?.parts)
    Object.freeze(state.settings.playlists[0])
    Object.freeze(state.settings.playlists)
    Object.freeze(state.settings.skipped)
    Object.freeze(state.settings)
    Object.freeze(state.parts)
    Object.freeze(state.runs)
    Object.freeze(state)
    const before = JSON.stringify(state)
    const changed = stretch(state, 10, 98)
    const due = evaluateGoals(changed)
    const completed = recordOutcome(due.tracker, { playlist: "PLvideos", outcome: "added" })
    expect(progress(completed).hasRun).toBe(true)
    expect(progress(updateTracker(state, { settings: { defaultPct: 0 } })).counted).toBe(10)
    expect(JSON.stringify(state)).toBe(before)
    expect(remembered.parts).toEqual([[0, 10]])
  })
})
