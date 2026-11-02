import { expect, test } from "bun:test"
import { createSiteHealth, HEALTH_SEND_MS } from "./health"
import type { BreakageSignal } from "../../shared/contracts/diagnostics"
import type { TabHealthReport } from "../../shared/contracts/tab-health"

function reporter() {
  let now = 10_000
  const timers: { at: number; run: () => void }[] = [], batches: (readonly TabHealthReport[])[] = []
  let listener: (signal: BreakageSignal) => void = () => {}
  const health = createSiteHealth({
    site: "www", now: () => now, online: () => true, send: reports => { batches.push(reports) },
    later(run, ms) { const timer = { at: now + ms, run }; timers.push(timer); return () => { timers.splice(timers.indexOf(timer), 1) } },
    page: { onSignal(fn) { listener = fn; return () => {} }, state: { kind: "ready", snapshot: { pageType: "watch" } } as never }
  })
  function advance(ms: number) {
    now += ms
    for (const timer of [...timers].sort((x, y) => x.at - y.at)) if (timer.at <= now) { timers.splice(timers.indexOf(timer), 1); timer.run() }
  }
  const signal = (kind: BreakageSignal["kind"], job: BreakageSignal["job"] = "add"): BreakageSignal => ({ site: "www", feature: null, job, route: "service.add" as never,
    kind, watchId: null, shape: null, clientVersion: null, pageType: "watch", count: 1, firstSeen: now, lastSeen: now })
  return { health, batches, advance, emit: (value: BreakageSignal) => listener(value), signal }
}
const kinds = (batch: readonly TabHealthReport[] | undefined) => batch?.map(report => report.kind === "signal" ? report.signal.kind : report.kind)

test("signals go out in one batch, then at most every 5 s, and a repeated one goes only once (HEALTH-28)", () => {
  const r = reporter()
  r.emit(r.signal("missing")); r.emit(r.signal("missing")); r.emit(r.signal("unrecognised"))
  r.advance(0)
  expect(kinds(r.batches[0])).toEqual(["missing", "unrecognised"])
  r.emit(r.signal("rejected"))
  r.advance(HEALTH_SEND_MS - 1)
  expect(r.batches).toHaveLength(1)
  r.advance(1)
  expect(kinds(r.batches[1])).toEqual(["rejected"])
})

test("timeouts keep up to three in a batch, since only three in a row count (HEALTH-01)", () => {
  const r = reporter()
  for (let n = 0; n < 5; n++) r.emit(r.signal("timeout"))
  r.advance(0)
  expect(kinds(r.batches[0])).toEqual(["timeout", "timeout", "timeout"])
  expect(r.batches[0]?.[0]).toMatchObject({ evidence: "job", online: true, answered: false })
})

test("a success goes only for a job with a signal, and after it the job's failure is reported again (HEALTH-12)", () => {
  const r = reporter()
  r.health.succeeded("membership")
  r.emit(r.signal("missing")); r.advance(0)
  r.health.succeeded("add"); r.advance(HEALTH_SEND_MS)
  expect(kinds(r.batches[1])).toEqual(["success"])
  r.emit(r.signal("missing")); r.advance(HEALTH_SEND_MS)
  expect(kinds(r.batches[2])).toEqual(["missing"])
  expect(r.batches.flat().filter(report => report.kind === "success")).toEqual([{ kind: "success", job: "add" }])
})

test("a feature's own breakage names the feature; a measurable playback is sent only after one that wasn't (HEALTH-11)", () => {
  const r = reporter()
  r.health.measured()
  r.health.itemUnrecognised("shortcuts"); r.health.cantMeasure(); r.health.measured()
  r.advance(0)
  expect(r.batches[0]?.map(report => report.kind === "signal" ? [report.signal.kind, report.signal.feature, report.evidence] : [report.kind]))
    .toEqual([["item-unrecognised", "shortcuts", "diagnostic"], ["cannot-measure", "auto-add", "playback"], ["measured"]])
})

test("only a visible page with too few recognised cards reports them missing (HEALTH-02)", () => {
  const r = reporter()
  const settled = { kind: "page-settle", site: "www", anchor: "www-cards", navigation: {} as never, delayMs: 3000, relevant: true, distinctMainLinks: 8, recognised: 1 } as const
  r.health.settled({ ...settled, visible: false, anchorMissing: true })
  r.health.settled({ ...settled, visible: true, anchorMissing: false, recognised: 7 })
  r.health.settled({ ...settled, visible: true, anchorMissing: true })
  r.advance(0)
  expect(r.batches[0]).toEqual([{ kind: "anchor", anchor: "www-cards", signal: expect.objectContaining({ kind: "anchor-missing", feature: null }),
    observation: { relevant: true, visible: true, settledMs: 3000, distinctMainLinks: 8, recognised: 1 } }])
})
