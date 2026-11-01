import { expect, test } from "bun:test"
import { choiceHarness, acct, one, two, ui, captured, change, seed, stamp, setupKey } from "../../../tools/fixtures/auto-add-choice/harness"
import { gate, check } from "../../../tools/fixtures/first-run-backend/harness"
import { autoAddFact } from "./auto-add-choice"
import type { AutoAddEdit } from "../../shared/contracts/auto-add-choice"
import { projectAutoAddChoice } from "../router/first-run-results"

test("explicit selection creates Setup in tick order with Videos and preserves first-edit provenance", async () => {
  const h = await choiceHarness()
  try {
    const first = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const second = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: two }))
    const events: unknown[] = [], off = h.owner.subscribeSetup(event => events.push(event))
    const a = h.owner.changeAutoAddChoice(ui, change(first, { kind: "auto-add", expected: false, chosen: true }))
    const b = h.owner.changeAutoAddChoice(ui, change(second, { kind: "auto-add", expected: false, chosen: true }))
    expect((await a).kind).toBe("committed")
    expect((await b).kind).toBe("committed")
    const view = await h.owner.readSetup(acct)
    check(view.kind === "value" && view.view.kind === "live", "fresh explicit choice creates live Setup")
    expect(view.view.setup.autoAdd).toEqual([{ pl: one, takes: "videos" }, { pl: two, takes: "videos" }])
    expect(events).toEqual([{ kind: "setup-changed", source: "local", acct }, { kind: "setup-changed", source: "local", acct }])
    expect(h.store.records().sync).toMatchObject({ everEdited: true, editedSinceOff: true })
    off()
  } finally { await h.dispose() }
})
test("no-op, invalid and private edits allocate no document generation, timestamp or write", async () => {
  const h = await choiceHarness()
  try {
    const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const before = h.store.counters(), effects = h.store.effects.length, batches = h.store.batches.length
    const same = await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "auto-add", expected: false, chosen: false }))
    expect(same.kind).toBe("current")
    expect(h.store.counters().generations).toBe(before.generations)
    expect(h.store.batches.length).toBe(batches)
    expect(h.store.effects.slice(effects).filter(value => value === "wall" || typeof value === "object" && value !== null && ("stamp" in value || "generation" in value))).toEqual([])
    const beforePrivate = h.store.counters()
    expect(await h.owner.changeAutoAddChoice({ ...ui, incognito: true }, change(capture, { kind: "auto-add", expected: false, chosen: true }))).toEqual({ kind: "result", result: { refused: "private" } })
    expect(await h.owner.readAutoAddChoice({ ...ui, incognito: true }, { kind: "auto-add-read", acct, playlist: one })).toEqual({ kind: "refused", reason: "private" })
    expect(h.store.counters()).toEqual(beforePrivate)
    for (const pct of [-1, 101, 0.1]) expect(await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "percentage", expected: null, pct }))).toEqual({ kind: "result", result: { refused: "invalid" } })
    expect(h.store.counters()).toEqual(beforePrivate)
  } finally { await h.dispose() }
})
test("independent Takes and percentage edits retain each other and stale fields write nothing", async () => {
  const h = await choiceHarness(seed({ autoAdd: [{ pl: one, takes: "videos" }] }))
  try {
    const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const a = h.owner.changeAutoAddChoice(ui, change(capture, { kind: "takes", expected: "videos", takes: "both" }))
    const b = h.owner.changeAutoAddChoice(ui, change(capture, { kind: "percentage", expected: null, pct: 0 }))
    expect((await a).kind).toBe("committed")
    expect((await b).kind).toBe("committed")
    const before = h.store.batches.length
    expect(await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "takes", expected: "videos", takes: "shorts" }))).toEqual({ kind: "stale", reason: "destination" })
    expect(h.store.batches.length).toBe(before)
    const view = await h.owner.readSetup(acct)
    check(view.kind === "value", "independent choices readable")
    expect(autoAddFact(view.view, one)).toEqual({ kind: "selected", takes: "both", pct: 0 })
    const next = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect((await h.owner.changeAutoAddChoice(ui, change(next, { kind: "percentage", expected: 0, pct: 100 }))).kind).toBe("committed")
    expect((await h.owner.changeAutoAddChoice(ui, change(next, { kind: "percentage", expected: 100, pct: null }))).kind).toBe("committed")
    const cleared = await h.owner.readSetup(acct)
    check(cleared.kind === "value" && cleared.view.kind === "live", "percentage clear remains live")
    expect(cleared.view.setup.autoAdd).toEqual([{ pl: one, takes: "both" }])
  } finally { await h.dispose() }
})
test("Takes and percentage never create absent auto-add rows", async () => {
  for (const edit of [{ kind: "takes", expected: "videos", takes: "both" }, { kind: "percentage", expected: null, pct: 50 }] satisfies AutoAddEdit[]) {
    const h = await choiceHarness()
    try {
      const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
      expect((await h.owner.changeAutoAddChoice(ui, change(capture, edit))).kind).toBe("stale")
      expect(h.store.batches).toEqual([])
      expect(Object.hasOwn(h.store.records(), setupKey)).toBe(false)
    } finally { await h.dispose() }
  }
})
test("untick keeps the exact filter and retick defaults only the new row", async () => {
  const filterKey = `doc:filter:${acct}:${one}`, filter = { ...stamp, data: { mode: "allow", on: true, channels: [], future: { kept: true } } }
  const records = seed({ autoAdd: [{ pl: one, takes: "shorts", pct: 40 }] }); records[filterKey] = filter
  const h = await choiceHarness(records)
  try {
    const before = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect((await h.owner.changeAutoAddChoice(ui, change(before, { kind: "auto-add", expected: true, chosen: false }))).kind).toBe("committed")
    const kept = await h.owner.readSetup(acct)
    check(kept.kind === "value" && kept.view.kind === "live", "kept filter keeps Setup alive")
    expect(kept.view.setup.autoAdd).toEqual([])
    expect(h.store.records()[filterKey]).toEqual(filter)
    const next = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect((await h.owner.changeAutoAddChoice(ui, change(next, { kind: "auto-add", expected: false, chosen: true }))).kind).toBe("committed")
    expect(h.store.records()[filterKey]).toEqual(filter)
    const view = await h.owner.readSetup(acct)
    check(view.kind === "value" && view.view.kind === "live", "reticked Setup live")
    expect(view.view.setup.autoAdd).toEqual([{ pl: one, takes: "videos" }])
  } finally { await h.dispose() }
})
test("last-choice removal clears real account state and revokes captures across recreation", async () => {
  const records = seed({ autoAdd: [{ pl: one, takes: "videos" }] })
  records[`cache:${acct}`] = { kept: true }; records[`progress:${acct}:0`] = { kept: true }
  const h = await choiceHarness(records)
  try {
    const old = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const removed = await h.owner.changeAutoAddChoice(ui, change(old, { kind: "auto-add", expected: true, chosen: false }))
    expect(removed.kind).toBe("committed")
    expect(h.removal.removed).toContain(setupKey)
    expect(Object.hasOwn(h.store.records(), setupKey)).toBe(false)
    expect(Object.hasOwn(h.store.records(), `cache:${acct}`)).toBe(false)
    expect(Object.hasOwn(h.store.records(), `progress:${acct}:0`)).toBe(false)
    expect(Object.hasOwn(h.removal.session(), `skips:${acct}`)).toBe(false)
    expect(h.store.records().lastAccount ?? null).toBeNull()
    const fresh = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect((await h.owner.changeAutoAddChoice(ui, change(fresh, { kind: "auto-add", expected: false, chosen: true }))).kind).toBe("committed")
    const before = h.store.records()
    expect(await h.owner.changeAutoAddChoice(ui, change(old, { kind: "auto-add", expected: true, chosen: false }))).toEqual({ kind: "stale", reason: "setup" })
    expect(h.store.records()).toEqual(before)
    expect(h.removal.session().unknown).toEqual({ keep: true })
  } finally { await h.dispose() }
})
test("a queued edit captured before account removal cannot recreate Setup", async () => {
  const h = await choiceHarness(seed({ autoAdd: [{ pl: one, takes: "videos" }] }))
  try {
    const selected = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const absent = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: two }))
    const removed = h.owner.changeAutoAddChoice(ui, change(selected, { kind: "auto-add", expected: true, chosen: false }))
    const queued = h.owner.changeAutoAddChoice(ui, change(absent, { kind: "auto-add", expected: false, chosen: true }))
    expect((await removed).kind).toBe("committed")
    expect(await queued).toEqual({ kind: "stale", reason: "setup" })
    expect(Object.hasOwn(h.store.records(), setupKey)).toBe(false)
  } finally { await h.dispose() }
})
test("newer Settings preserves unknown shortcut references and marks while readable Setup remains editable", async () => {
  const h = await choiceHarness(seed({ autoAdd: [{ pl: one, takes: "videos" }], targets: { future: two }, marks: { PL_two: "missing" } }))
  try {
    h.store.foreign(records => { records["doc:settings"] = { ...stamp, v: 2, data: { unknown: true } } })
    const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    const result = await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "takes", expected: "videos", takes: "both" }))
    check(result.kind === "committed" && result.view.kind === "live", "newer Settings does not block readable Setup")
    expect(result.view.setup.targets).toEqual({ future: two })
    expect(result.view.setup.marks).toEqual({ PL_two: "missing" })
    h.store.foreign(records => { records[setupKey] = { ...stamp, v: 2, data: { unknown: true } } })
    const before = h.store.records()
    expect(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one })).toEqual({ kind: "refused", reason: "update-needed" })
    expect(await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "takes", expected: "both", takes: "shorts" }))).toEqual({ kind: "result", result: { refused: "update-needed" } })
    expect(h.store.records()).toEqual(before)
  } finally { await h.dispose() }
})
for (const [mode, kind] of [["rejected-unchanged", "failed"], ["ignored", "unconfirmed"], ["divergent", "unconfirmed"], ["read-failed", "unconfirmed"], ["rejected-applied", "unconfirmed"]] as const) {
  test(`actual owner confirmation preserves ${mode}`, async () => {
    const h = await choiceHarness()
    try {
      const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
      const events: unknown[] = []; h.owner.subscribeSetup(event => events.push(event))
      h.store.mode(mode)
      const request = change(capture, { kind: "auto-add", expected: false, chosen: true })
      const result = await h.owner.changeAutoAddChoice(ui, request)
      expect(result.kind).toBe(kind)
      expect(projectAutoAddChoice(request, result).kind).toBe("refused")
      expect(events).toEqual([])
      h.store.mode("normal")
      const count = h.store.counters()
      expect((await h.owner.changeAutoAddChoice(ui, request)).kind).toBe("unavailable")
      expect(h.store.counters()).toEqual(count)
    } finally { await h.dispose() }
  })
}
test("disposal during the real write never emits a confirmed choice", async () => {
  const h = await choiceHarness(), entered = gate(), release = gate()
  try {
    const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    h.store.set(async () => { entered.release(); await release.waiting })
    const pending = h.owner.changeAutoAddChoice(ui, change(capture, { kind: "auto-add", expected: false, chosen: true }))
    await entered.waiting
    const closed = h.owner.dispose()
    release.release()
    expect((await pending).kind).toBe("unconfirmed")
    await closed
  } finally { release.release(); await h.dispose() }
})

test("sync quota and newer Setup admission return actual refusals without a write", async () => {
  for (const mode of ["full", "newer", "reset"] as const) {
    const h = await choiceHarness(seed({ autoAdd: [{ pl: one, takes: "videos" }] }))
    try {
      const capture = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
      h.store.foreign(records => {
        records.device = { id: "fixture", consent: { v: 1, at: 2 }, syncOn: true, legacyCleared: true }
        records.sync = { joined: "history", pushed: { "doc:settings": "original", [setupKey]: "original" }, status: "ok", editedSinceOff: false, everEdited: true }
      })
      // The authority change revokes captures. Capture the current authority before the admitted edit.
      const current = captured(await h.owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
      h.store.remote(records => {
        records["s:meta"] = { v: 1, id: "history", created: 0, ...(mode === "reset" ? { reset: true } : {}) }
        records["s:settings"] = { ...stamp, data: {} }
        records[`s:setup:${acct}`] = { ...stamp, ...(mode === "newer" ? { v: 2 } : {}), data: { autoAdd: [{ pl: one, takes: "videos" }] } }
        if (mode === "full") for (let i = 0; i < 480; i++) records[`s:setup:${acct}@unproven.${i}`] = "kept"
      })
      const before = h.store.batches.length
      const result = await h.owner.changeAutoAddChoice(ui, change(current, { kind: "takes", expected: "videos", takes: "both" }))
      expect(result).toEqual(mode === "full" ? { kind: "result", result: { refused: "sync-full" } }
        : mode === "newer" ? { kind: "result", result: { refused: "update-needed" } } : { kind: "unavailable", reason: "sync-writer-required" })
      expect(h.store.batches.length).toBe(before)
      expect(await h.owner.changeAutoAddChoice(ui, change(capture, { kind: "takes", expected: "videos", takes: "shorts" }))).toEqual({ kind: "stale", reason: "setup" })
    } finally { await h.dispose() }
  }
})
