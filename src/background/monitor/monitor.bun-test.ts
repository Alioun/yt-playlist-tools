import { expect, test } from "bun:test"
import { anchorMissing, enabledBackground } from "./derive"
import type { AnchorObservation, EnabledMonitorFeature } from "./ports"
import type { AnchorId } from "../../shared/features/registry"
import { context, monitorWorld, pageFeature, signalValue, syntheticHealthFacts, instance } from "../../../tools/fixtures/monitor/harness"
import { deferred, a, b } from "../../../tools/fixtures/tabs/harness"
import { isTabView, type FeatureStatus } from "../../shared/contracts/tab-view"
import { defaultSettings } from "../../shared/model"
import type { TabContext } from "../tabs/ports"

const answered = { kind: "job", online: true, otherRequestsAnswer: true } as const
const visible = { visible: true, fullscreen: false }
async function statuses(h: ReturnType<typeof monitorWorld>, c: TabContext, enabled: readonly EnabledMonitorFeature[] = [pageFeature("auto-add")]) {
  const result = await h.monitor.statuses(c, enabled)
  if (result.kind !== "statuses") throw Error("Expected actual Monitor statuses")
  return result.statuses
}
async function state(h: ReturnType<typeof monitorWorld>, c: TabContext, enabled?: readonly EnabledMonitorFeature[]) { return (await statuses(h, c, enabled))[0]?.state }
function seeded(c = context()) {
  const h = monitorWorld()
  h.seedContext(c, visible, syntheticHealthFacts(c.tab.site))
  return { h, c }
}

test("three eligible consecutive timeouts gate failure and success clears it", async () => {
  const { h, c } = seeded()
  try {
    h.routes(c, "add", "timeout")
    expect(await state(h, c)).toBe("working")
    for (let n = 0; n < 2; n++) { await h.monitor.signal(c, signalValue("timeout"), answered); expect(await state(h, c)).toBe("working") }
    await h.monitor.interrupted(c, "add", "offline")
    await h.monitor.signal(c, signalValue("timeout"), answered)
    expect(await state(h, c)).toBe("working")
    await h.monitor.signal(c, signalValue("timeout"), { ...answered, otherRequestsAnswer: false })
    await h.monitor.signal(c, signalValue("timeout"), { ...answered, online: false })
    for (let n = 0; n < 2; n++) await h.monitor.signal(c, signalValue("timeout"), answered)
    expect(await state(h, c)).toBe("working")
    await h.monitor.signal(c, signalValue("timeout"), answered)
    expect(await state(h, c)).toBe("not-working")
    await h.monitor.succeeded(c, "add")
    expect(await state(h, c)).toBe("working")
    expect((await h.monitor.diagnostics(c))?.signals.some(row => row.signal.kind === "timeout" && !row.active)).toBe(true)
  } finally { await h.dispose() }
})

test("two no-effects are required and an intervening success resets the run", async () => {
  const { h, c } = seeded()
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    expect(await state(h, c)).toBe("working")
    await h.monitor.succeeded(c, "add")
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    expect(await state(h, c)).toBe("working")
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    expect(await state(h, c)).toBe("not-working")
    await h.monitor.reloadPassed(c)
    expect(await state(h, c)).toBe("working")
  } finally { await h.dispose() }
})

test("cannot-measure is partial until the third playback and measured playback recovers", async () => {
  const { h, c } = seeded()
  const value = signalValue("cannot-measure", { job: null, route: null })
  try {
    expect(await state(h, c)).toBe("working")
    for (let n = 0; n < 2; n++) { await h.monitor.signal(c, value, { kind: "playback" }); expect(await state(h, c)).toBe("partly-working") }
    await h.monitor.measured(c)
    expect(await state(h, c)).toBe("working")
    for (let n = 0; n < 2; n++) await h.monitor.signal(c, value, { kind: "playback" })
    expect(await state(h, c)).toBe("partly-working")
    await h.monitor.signal(c, value, { kind: "playback" })
    expect(await state(h, c)).toBe("not-working")
    await h.monitor.measured(c)
    expect(await state(h, c)).toBe("working")
  } finally { await h.dispose() }
})

test("anchors require settled relevant visible content, six distinct links and fewer than half recognised", () => {
  const observation = { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3_000, distinctMainLinks: 6, recognised: 2 } as const
  expect(anchorMissing({ ...observation, observedAt: 2_999 })).toBe(false)
  expect(anchorMissing(observation)).toBe(true)
  expect(anchorMissing({ ...observation, distinctMainLinks: 5 })).toBe(false)
  expect(anchorMissing({ ...observation, recognised: 3 })).toBe(false)
  expect(anchorMissing({ ...observation, recognised: 4 })).toBe(false)
  expect(anchorMissing({ ...observation, relevant: false })).toBe(false)
  expect(anchorMissing({ ...observation, visible: false })).toBe(false)
  expect(anchorMissing({ kind: "player-bar", requiredHere: false, visible: true, navigationAt: 0, observedAt: 3_000, present: false })).toBe(false)
  expect(anchorMissing({ kind: "player-bar", requiredHere: true, visible: true, navigationAt: 0, observedAt: 2_999, present: false })).toBe(false)
  expect(anchorMissing({ kind: "player-bar", requiredHere: true, visible: true, navigationAt: 0, observedAt: 3_000, present: false })).toBe(true)
})

test("one shipped fallback keeps the required job working and exhaustion breaks it", async () => {
  const { h, c } = seeded()
  try {
    h.routes(c, "add", "missing", "usable")
    await h.monitor.signal(c, signalValue("missing"), answered)
    expect(await state(h, c)).toBe("working")
    h.routes(c, "add", "missing", "missing")
    expect(await state(h, c)).toBe("not-working")
    await h.monitor.signal(c, signalValue("fell-back"), { kind: "diagnostic" })
    expect(await state(h, c)).toBe("working")
  } finally { await h.dispose() }
})

test("optional jobs and anchors are partial while required anchors stop the feature", async () => {
  const { h, c } = seeded()
  try {
    h.routes(c, "remove", "rejected")
    expect(await state(h, c)).toBe("partly-working")
    h.changeHealth(c, facts => ({ ...facts, anchors: new Map<AnchorId, AnchorObservation>([...facts.anchors, ["www-cards", { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3_000, distinctMainLinks: 6, recognised: 2 }]]) }))
    expect(await state(h, c, [pageFeature("shortcuts")])).toBe("partly-working")
    expect(await state(h, c, [pageFeature("quick-save")])).toBe("not-working")
  } finally { await h.dispose() }
})

test("core failure stops the site while missing account keys preserve queue actions", async () => {
  const { h, c } = seeded()
  const enabled = [pageFeature("auto-add"), pageFeature("queue-button"), pageFeature("card-menu")]
  try {
    h.changeHealth(c, facts => ({ ...facts, accountKeys: "missing" }))
    expect((await statuses(h, c, enabled)).map(row => row.state)).toEqual(["not-working", "working", "working"])
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    expect((await statuses(h, c, enabled)).map(row => row.state)).toEqual(["not-working", "not-working", "not-working"])
  } finally { await h.dispose() }
})

test("Music action detail names unavailable enabled actions and preserves queue actions", async () => {
  const c = context("music"), { h } = seeded(c)
  const feature = pageFeature("music-actions")
  if (feature.id !== "music-actions") throw Error("Expected Music feature")
  const enabled = [{ ...feature, options: { ...feature.options, buttons: { ...feature.options.buttons, save: true, like: true } } }]
  try {
    h.changeHealth(c, facts => ({ ...facts, accountKeys: "missing" }))
    expect(await statuses(h, c, enabled)).toEqual([{ feature: "music-actions", state: "partly-working", jobs: ["account"], anchors: [], actions: ["save", "like"], kinds: ["missing"], destinations: [] }])
    h.routes(c, "queueInsert", "missing")
    expect((await statuses(h, c, enabled))[0]?.actions).toEqual(["next", "queue", "save", "like"])
    expect(await state(h, c, enabled)).toBe("not-working")
    const keys = pageFeature("music-keys")
    expect((await statuses(h, c, [keys]))[0]?.actions).toEqual(["next", "queue", "save", "like", "library"])
  } finally { await h.dispose() }
})

test("Gather failures name destinations and only a failed player stops Gather", async () => {
  const { h, c } = seeded()
  try {
    h.changeHealth(c, facts => ({ ...facts, gather: { player: "usable", queue: "unavailable", playlist: "usable" } }))
    expect((await statuses(h, c, [pageFeature("gather")]))[0]).toMatchObject({ state: "partly-working", destinations: ["queue"] })
    h.changeHealth(c, facts => ({ ...facts, gather: { ...facts.gather, player: "no-effect" } }))
    const signal = signalValue("no-effect", { feature: "gather", job: null, route: null })
    await h.monitor.signal(c, signal, { kind: "gather", destination: "player" })
    expect(await state(h, c, [pageFeature("gather")])).toBe("partly-working")
    await h.monitor.signal(c, signal, { kind: "gather", destination: "player" })
    expect((await statuses(h, c, [pageFeature("gather")]))[0]).toMatchObject({ state: "not-working", destinations: ["player", "queue"] })
  } finally { await h.dispose() }
})

test("diagnostic-only fallback and cosmetic records never cause failure or notices", async () => {
  const { h, c } = seeded()
  try {
    for (const kind of ["cosmetic", "fell-back", "resolver-ambiguous"] as const) await h.monitor.signal(c, signalValue(kind), { kind: "diagnostic" })
    expect(await state(h, c)).toBe("working")
    await h.monitor.wouldAct(c, [pageFeature("auto-add")], "auto-add")
    await h.advance(60)
    const result = await h.monitor.noticeProducer.read(c, [{ feature: "auto-add", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }])
    expect(result.kind === "notices" ? result.notices : undefined).toEqual([])
    expect((await h.monitor.diagnostics(c))?.signals).toHaveLength(3)
  } finally { await h.dispose() }
})

test("quiet-route-noisy is partial on both sites with feedback disabled", async () => {
  for (const site of ["www", "music"] as const) {
    const c = context(site), { h } = seeded(c)
    const feature = pageFeature(site === "www" ? "queue-button" : "music-actions")
    if (feature.id !== "queue-button" && feature.id !== "music-actions") throw Error("Expected queue feature")
    const disabledFeedback = feature.id === "queue-button" ? { ...feature, options: { ...feature.options, feedback: false } } : { ...feature, options: { ...feature.options, feedback: false } }
    try {
      await h.monitor.signal(c, signalValue("quiet-route-noisy", { site, feature: feature.id, job: site === "www" ? "queueAdd" : "queueInsert" }), answered)
      expect(await state(h, c, [disabledFeedback])).toBe("partly-working")
    } finally { await h.dispose() }
  }
})

test("per-tab, per-site, per-account and private facts stay isolated and snapshots are detached", async () => {
  const { h, c } = seeded()
  const otherTab = context("www", false, 2), music = context("music", false, 3), privateTab = context("www", true, 4), otherAccount = context("www", false, 5, b)
  try {
    for (const input of [otherTab, music, privateTab, otherAccount]) h.seedContext(input, visible, syntheticHealthFacts(input.tab.site))
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    expect(await state(h, c)).toBe("not-working")
    expect(await state(h, otherTab)).toBe("working")
    expect(await state(h, otherAccount)).toBe("working")
    expect(await state(h, privateTab)).toBe("working")
    expect(await state(h, music, [pageFeature("music-actions")])).toBe("working")
    const snapshot = await h.monitor.diagnostics(c)
    const first = snapshot?.signals[0]
    if (!first) throw Error("Expected signal")
    first.signal.count = 900
    expect((await h.monitor.diagnostics(c))?.signals[0]?.signal.count).toBe(2)
  } finally { await h.dispose() }
})

test("private signal, counters and notice acknowledgements never persist", async () => {
  const c = context("www", true), { h } = seeded(c)
  try {
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    await h.monitor.signal(c, signalValue("cannot-measure", { job: null, route: null }), { kind: "playback" })
    await h.monitor.wouldAct(c, [pageFeature("auto-add")], "auto-add")
    await h.advance(60)
    const read = await h.monitor.statusProducer.read(c, [pageFeature("auto-add")])
    if (read.kind !== "statuses") throw Error("Expected statuses")
    const delivery = await h.monitor.claimNotice(c, read)
    if (delivery.kind !== "delivery") throw Error("Expected delivery")
    await h.monitor.acknowledgeNotice(c, delivery.token)
    await h.advance(10_000)
    expect(await h.monitor.flush()).toEqual({ kind: "idle" })
    expect(h.stored()).toEqual({ unknown: { keep: true } })
    expect(h.sessionWrites()).toEqual([])
  } finally { await h.dispose() }
})

test("normal signals coalesce for ten seconds and two engines merge over one real owner", async () => {
  const { h, c } = seeded()
  const second = h.addMonitor(instance("0000000000000002"))
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    await second.signal(c, signalValue("no-effect"), answered)
    await h.advance(9_999)
    expect(h.sessionWrites()).toEqual([])
    await h.advance(1)
    await h.monitor.flush(); await second.flush()
    expect(h.sessionWrites()).toHaveLength(1)
    await h.advance(10_000)
    await second.flush()
    expect(h.sessionWrites()).toHaveLength(2)
    const journal = await h.monitor.diagnostics(c)
    expect(journal?.signals[0]?.signal.count).toBe(2)
    expect(journal?.counters.find(row => row.job === "add")?.noEffects).toBe(2)
    expect(await state(h, c)).toBe("not-working")
    expect(h.stored().unknown).toEqual({ keep: true })
  } finally { await h.dispose() }
})

test("restart restores normal threshold counters and once state", async () => {
  const { h, c } = seeded()
  let next: ReturnType<typeof monitorWorld> | undefined
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    await h.advance(10_000); await h.monitor.flush()
    const seed = h.removal.state()
    next = monitorWorld(seed)
    next.seedContext(c, visible, syntheticHealthFacts("www"))
    const restarted = next.addMonitor(instance("0000000000000003"))
    await restarted.signal(c, signalValue("no-effect"), answered)
    const result = await restarted.statuses(c, [pageFeature("auto-add")])
    expect(result.kind === "statuses" ? result.statuses[0]?.state : undefined).toBe("not-working")
  } finally { await next?.dispose(); await h.dispose() }
})

test("the oldest distinct signal is evicted at two hundred records", async () => {
  const h = monitorWorld()
  try {
    for (let index = 0; index <= 200; index++) {
      const c = context("www", false, index)
      h.seedContext(c, visible, syntheticHealthFacts("www"))
      await h.monitor.signal(c, signalValue("cosmetic", { firstSeen: index, lastSeen: index }), { kind: "diagnostic" })
    }
    await h.advance(10_000); await h.monitor.flush()
    const journal = await h.monitor.diagnostics(context("www", false, 200))
    expect(journal?.signals).toHaveLength(200)
    expect(journal?.signals[0]?.tabId).toBe(1)
    expect(journal?.signals.at(-1)?.tabId).toBe(200)
  } finally { await h.dispose() }
})

test("real account removal revokes a pending flush and never resurrects the account", async () => {
  const { h, c } = seeded()
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    const origin = { kind: "ui", windowId: 1, incognito: false } as const
    const prepared = await h.owner.prepareAccountRemoval(origin, a)
    if (prepared.kind !== "confirmation-required") throw Error("Expected real removal preparation")
    expect((await h.owner.removeAccountSetup(origin, prepared.confirmation)).kind).toBe("committed")
    await h.advance(10_000); await h.monitor.flush()
    const read = await h.owner.readSession()
    expect(read.kind === "memory" ? read.memory.breakage.accounts.has(a) : undefined).toBe(false)
    expect(h.sessionWrites().filter(name => name === "session.set:breakage")).toEqual([])
  } finally { await h.dispose() }
})

async function signalSetOrdinal() {
  const { h, c } = seeded()
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    await h.advance(10_000); await h.monitor.flush()
    const operation = h.removal.io.find(row => row.phase === "invoked" && row.kind === "session.set:breakage")
    if (!operation) throw Error("Expected real session set boundary")
    return operation.n
  } finally { await h.dispose() }
}
test("clean rejected writes retain queued evidence for an explicit later flush", async () => {
  const ordinal = await signalSetOrdinal(), { h, c } = seeded()
  try {
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    h.removal.fault({ at: ordinal, kind: "reject", when: "before" })
    h.clock.advance(10_000)
    const rejected = await h.monitor.flush()
    expect(rejected).toMatchObject({ kind: "failed", applied: false })
    expect(h.stored().breakage).toBeUndefined()
    expect((await h.monitor.diagnostics(c))?.signals[0]?.signal.count).toBe(1)
    h.removal.fault()
    expect((await h.monitor.flush()).kind).toBe("committed")
    expect((await h.monitor.diagnostics(c))?.signals[0]?.signal.count).toBe(1)
  } finally { await h.dispose() }
})

test("applied rejected and unconfirmed writes remain unavailable rather than reporting confirmed success", async () => {
  const ordinal = await signalSetOrdinal()
  for (const kind of ["reject", "ignore"] as const) {
    const { h, c } = seeded()
    try {
      await h.monitor.signal(c, signalValue("no-effect"), answered)
      h.removal.fault({ at: ordinal, kind, when: "after" })
      h.clock.advance(10_000)
      const result = await h.monitor.flush()
      expect(result).toMatchObject(kind === "reject" ? { kind: "failed", applied: true } : { kind: "unconfirmed" })
      expect((await h.owner.readSession()).kind).toBe("unavailable")
      expect(await h.monitor.statusProducer.read(c, [pageFeature("auto-add")])).toEqual({ kind: "unavailable" })
    } finally { await h.dispose() }
  }
})

test("notices batch at sixty milliseconds, defer visibility and require actual acknowledgement", async () => {
  const { h, c } = seeded()
  const enabled = [pageFeature("auto-add"), pageFeature("shortcuts")]
  try {
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    await h.monitor.wouldAct(c, enabled, "auto-add")
    await h.advance(59)
    await h.monitor.wouldAct(c, enabled, "shortcuts")
    const read = await h.monitor.statusProducer.read(c, enabled)
    if (read.kind !== "statuses") throw Error("Expected actual statuses")
    expect((await h.monitor.noticeProducer.read(c, read.statuses))).toMatchObject({ kind: "notices", notices: [] })
    await h.advance(1)
    h.visibility(c, false, false)
    expect(await h.monitor.noticeProducer.read(c, read.statuses)).toMatchObject({ kind: "notices", notices: [] })
    h.visibility(c, true, true)
    expect(await h.monitor.noticeProducer.read(c, read.statuses)).toMatchObject({ kind: "notices", notices: [] })
    h.visibility(c, true, false)
    const expected = [{ kind: "not-working", features: ["auto-add", "shortcuts"] }]
    for (let n = 0; n < 2; n++) expect(await h.monitor.noticeProducer.read(c, read.statuses)).toMatchObject({ kind: "notices", notices: expected })
    expect((await h.owner.readSession()).kind).toBe("memory")
    expect(h.stored().shown).toBeUndefined()
    const fresh = await h.monitor.statusProducer.read(c, enabled)
    if (fresh.kind !== "statuses") throw Error("Expected current delivery statuses")
    const delivery = await h.monitor.claimNotice(c, fresh)
    if (delivery.kind !== "delivery") throw Error("Expected explicit delivery")
    expect((await h.monitor.acknowledgeNotice(c, delivery.token)).kind).toBe("accepted")
    await h.monitor.wouldAct(c, enabled, "auto-add")
    await h.advance(60)
    expect(await h.monitor.noticeProducer.read(c, read.statuses)).toMatchObject({ kind: "notices", notices: [] })
    await h.advance(10_000); await h.monitor.flush()
    const normal = await h.owner.readSession()
    expect(normal.kind === "memory" ? [...normal.memory.shown.global] : undefined).toEqual(["monitor:www:auto-add", "monitor:www:shortcuts"])
    expect(await h.monitor.acknowledgeNotice(c, delivery.token)).toEqual({ kind: "unavailable" })
  } finally { await h.dispose() }
})

test("the first eligible visible tab claims delivery and a later tab cannot acknowledge it", async () => {
  const { h, c } = seeded(), other = context("www", false, 2)
  try {
    h.seedContext(other, visible, { ...syntheticHealthFacts("www"), core: "missing" })
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    h.visibility(c, false, false)
    await h.monitor.wouldAct(c, [pageFeature("auto-add")], "auto-add")
    await h.advance(60)
    const read = await h.monitor.statusProducer.read(other, [pageFeature("auto-add")])
    if (read.kind !== "statuses") throw Error("Expected statuses")
    const delivery = await h.monitor.claimNotice(other, read)
    if (delivery.kind !== "delivery") throw Error("Expected visible delivery")
    expect(await h.monitor.acknowledgeNotice(c, delivery.token)).toEqual({ kind: "unavailable" })
    expect((await h.monitor.acknowledgeNotice(other, delivery.token)).kind).toBe("accepted")
  } finally { await h.dispose() }
})

test("two engines claim one normal notice through the real owner and restart restores once", async () => {
  const { h, c } = seeded()
  const second = h.addMonitor(instance("0000000000000002"))
  const enabled = [pageFeature("auto-add")]
  let restarted: ReturnType<typeof monitorWorld> | undefined
  try {
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    await h.monitor.wouldAct(c, enabled, "auto-add"); await second.wouldAct(c, enabled, "auto-add")
    await h.advance(60)
    const firstRead = await h.monitor.statusProducer.read(c, enabled), secondRead = await second.statusProducer.read(c, enabled)
    if (firstRead.kind !== "statuses" || secondRead.kind !== "statuses") throw Error("Expected actual status producers")
    const delivery = await h.monitor.claimNotice(c, firstRead)
    if (delivery.kind !== "delivery") throw Error("Expected first delivery")
    const competing = await second.statusProducer.read(c, enabled)
    if (competing.kind !== "statuses") throw Error("Expected fresh competing authority")
    expect(await second.claimNotice(c, competing)).toEqual({ kind: "none" })
    expect((await h.owner.readSession()).kind).toBe("memory")
    expect((await h.monitor.acknowledgeNotice(c, delivery.token)).kind).toBe("accepted")
    restarted = monitorWorld(h.removal.state())
    restarted.seedContext(c, visible, { ...syntheticHealthFacts("www"), core: "missing" })
    await restarted.monitor.wouldAct(c, enabled, "auto-add")
    await restarted.advance(60)
    const restored = await restarted.monitor.statusProducer.read(c, enabled)
    if (restored.kind !== "statuses") throw Error("Expected restored status authority")
    expect(await restarted.monitor.noticeProducer.read(c, restored.statuses)).toMatchObject({ kind: "notices", notices: [] })
  } finally { await restarted?.dispose(); await h.dispose() }
})

test("explicit release allows the next eligible tab and stale delivery tokens cannot acknowledge", async () => {
  const { h, c } = seeded(), other = context("www", false, 2)
  const enabled = [pageFeature("auto-add")]
  try {
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    h.seedContext(other, visible, { ...syntheticHealthFacts("www"), core: "missing" })
    await h.monitor.wouldAct(c, enabled, "auto-add"); await h.advance(60)
    const read = await h.monitor.statusProducer.read(c, enabled)
    if (read.kind !== "statuses") throw Error("Expected statuses")
    const first = await h.monitor.claimNotice(c, read)
    if (first.kind !== "delivery") throw Error("Expected delivery")
    h.visibility(c, false, false)
    expect(first.current()).toBe(false)
    expect((await h.monitor.releaseNotice(first.token)).kind).toBe("accepted")
    const nextRead = await h.monitor.statusProducer.read(other, enabled)
    if (nextRead.kind !== "statuses") throw Error("Expected next tab authority")
    const next = await h.monitor.claimNotice(other, nextRead)
    expect(next.kind).toBe("delivery")
    expect(await h.monitor.acknowledgeNotice(c, first.token)).toEqual({ kind: "unavailable" })
  } finally { await h.dispose() }
})

test("missing current route or probe authority remains unavailable", async () => {
  const { h, c } = seeded()
  try {
    h.changeHealth(c, facts => { const jobs = new Map(facts.jobs); jobs.delete("add"); return { ...facts, jobs } })
    expect(await h.monitor.statusProducer.read(c, [pageFeature("auto-add")])).toEqual({ kind: "unavailable" })
    expect(await h.producer.produce(c)).toEqual({ kind: "unavailable" })
  } finally { await h.dispose() }
})

test("Gather names playlist exhaustion without stopping its working player", async () => {
  const { h, c } = seeded()
  const gather = pageFeature("gather")
  if (gather.id !== "gather") throw Error("Expected Gather options")
  const enabled = [{ ...gather, options: { ...gather.options, to: "playlist" as const } }]
  try {
    h.routes(c, "addBatch", "rejected")
    expect((await statuses(h, c, enabled))[0]).toMatchObject({ state: "partly-working", jobs: ["addBatch"], destinations: ["playlist"] })
    h.routes(c, "addBatch", "usable")
    h.changeHealth(c, facts => ({ ...facts, accountKeys: "missing" }))
    expect((await statuses(h, c, enabled))[0]).toMatchObject({ state: "partly-working", jobs: ["account"], destinations: ["playlist"] })
  } finally { await h.dispose() }
})

test("repeated pending features retain one notice timer and subscriptions stop at disposal", async () => {
  const { h, c } = seeded()
  let updates = 0
  const unsubscribe = h.monitor.subscribe(() => { updates++ })
  try {
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    const enabled = [pageFeature("auto-add")]
    await h.monitor.wouldAct(c, enabled, "auto-add")
    expect(h.clock.pending).toBe(1)
    for (let n = 0; n < 3; n++) await h.monitor.wouldAct(c, enabled, "auto-add")
    expect(h.clock.pending).toBe(1)
    expect(updates).toBeGreaterThan(0)
    h.monitor.dispose()
    const before = updates
    await h.advance(60)
    h.visibility(c, true, false)
    expect(updates).toBe(before)
    expect(h.clock.pending).toBe(0)
  } finally { unsubscribe(); await h.dispose() }
})

test("diagnostic ingress rejects unlisted route and watch names, raw values and account data", async () => {
  const { h, c } = seeded()
  const valid = signalValue("unrecognised")
  try {
    for (const value of [{ ...valid, route: "unlisted-route" }, { ...valid, watchId: "unlisted-watch" },
      { ...valid, acct: "synthetic-account-data" }, { ...valid, shape: { kind: "string", value: "synthetic-raw-response" } }]) {
      expect(await h.monitor.signal(c, value, answered)).toEqual({ kind: "invalid" })
    }
    expect((await h.monitor.diagnostics(c))?.signals).toEqual([])
    expect(h.sessionWrites()).toEqual([])
  } finally { await h.dispose() }
})

test("producer authority, context changes, notice changes and disposal revoke captured reads", async () => {
  const { h, c } = seeded()
  try {
    const captured = await h.monitor.statusProducer.read(c, [pageFeature("auto-add")])
    if (captured.kind !== "statuses") throw Error("Expected statuses")
    expect(captured.current()).toBe(true)
    h.visibility(c, false, false)
    expect(captured.current()).toBe(false)
    h.hold(true)
    expect(await h.producer.produce(c)).toEqual({ kind: "unavailable" })
    h.hold(false)
    h.visibility(c, true, false)
    h.changeHealth(c, facts => ({ ...facts, core: "missing" }))
    const beforeNotice = await h.monitor.statusProducer.read(c, [pageFeature("auto-add")])
    if (beforeNotice.kind !== "statuses") throw Error("Expected statuses")
    await h.monitor.wouldAct(c, [pageFeature("auto-add")], "auto-add")
    expect(beforeNotice.current()).toBe(false)
    const gate = deferred<void>(), entered = deferred<void>()
    h.beforeHealth(async () => { entered.resolve(); await gate.promise })
    const pending = h.monitor.statusProducer.read(c, [pageFeature("auto-add")])
    await entered.promise
    h.monitor.dispose(); gate.resolve()
    expect(await pending).toEqual({ kind: "unavailable" })
    expect(h.clock.pending).toBe(0)
  } finally { await h.dispose() }
})

test("background-only registry features use the wider union without entering the page union", async () => {
  const { h, c } = seeded()
  try {
    const settings = defaultSettings(); settings.browserMenu.on = true; settings.anyTabKeys.on = true; settings.gather.on = true
    const enabled = enabledBackground({ settings, site: "www", syncOn: true })
    expect(enabled.map(row => row.id)).toEqual(["browser-menu", "any-tab-keys", "gather", "sync"])
    expect((await statuses(h, c, enabled)).map(row => row.feature)).toEqual(["browser-menu", "any-tab-keys", "gather", "sync"])
    expect(isTabView({ features: enabled })).toBe(false)
  } finally { await h.dispose() }
})


test("view subscribers compare actual statuses while generic subscribers still observe bookkeeping", async () => {
  const { h, c } = seeded(), projected: number[] = [], generic: number[] = []
  const stop = h.monitor.subscribeView(event => projected.push(event.tabId))
  const stopGeneric = h.monitor.subscribe(() => generic.push(1))
  try {
    expect((await h.producer.produce(c)).kind).toBe("view")
    await h.monitor.signal(c, signalValue("no-effect"), answered); await h.advance(0)
    expect(generic).toHaveLength(1)
    expect(projected).toEqual([])
    await h.monitor.signal(c, signalValue("no-effect"), answered); await h.advance(0)
    expect(projected).toEqual([c.tab.tabId])
    await h.monitor.flush(); await h.advance(0)
    expect(projected).toEqual([c.tab.tabId])
    stop(); stop()
    await h.monitor.succeeded(c, "add"); await h.advance(0)
    expect(projected).toEqual([c.tab.tabId])
  } finally { stop(); stopGeneric(); await h.dispose() }
})

test("a due-notice transition notifies the observed tab only after the actual deadline", async () => {
  const { h, c } = seeded(), projected: number[] = []
  const stop = h.monitor.subscribeView(event => projected.push(event.tabId))
  try {
    expect((await h.producer.produce(c)).kind).toBe("view")
    await h.monitor.signal(c, signalValue("no-effect"), answered)
    await h.monitor.signal(c, signalValue("no-effect"), answered); await h.advance(0)
    expect((await h.producer.produce(c)).kind).toBe("view")
    projected.length = 0
    await h.monitor.wouldAct(c, [pageFeature("auto-add")], "auto-add"); await h.advance(0)
    expect(projected).toEqual([])
    await h.advance(59)
    expect(projected).toEqual([])
    await h.advance(1)
    expect(projected).toEqual([c.tab.tabId])
    const view = await h.producer.produce(c)
    expect(view.kind === "view" && view.view.notices).toEqual([{ kind: "not-working", features: ["auto-add"] }])
  } finally { stop(); await h.dispose() }
})
