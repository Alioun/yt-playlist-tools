import { expect, test } from "bun:test"
import { expectDestination, parseSetupDestinationChange, planSetupDestination, readAccountSetup, type SetupDestinationChange } from "./setup-edit"
import { isAccountKey, isPlaylistId, isShortcutId, type AccountKey, type PlaylistId, type ShortcutId } from "../../shared/model"
import type { JsonObject, JsonValue } from "../../shared/contracts/json"

export function setupPlanAcceptance(api: { plan: typeof planSetupDestination; parse: typeof parseSetupDestinationChange; read: typeof readAccountSetup; expect: typeof expectDestination }) {
  let checks = 0
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) {
    checks++
    const stable = (value: unknown) => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
    if (stable(actual) !== stable(expected)) throw Error(`${label}: ${stable(actual)} != ${stable(expected)}`)
  }
  function brand<T>(guard: (value: unknown) => value is T, value: string): T { if (!guard(value)) throw Error(`fixture ${value}`); return value }
  const A = brand(isAccountKey, "AAAAAAAAAAAAAAAA"), B = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
  const one = brand(isPlaylistId, "PL_one"), two = brand(isPlaylistId, "PL_two"), music = brand(isPlaylistId, "PL_music"), gather = brand(isPlaylistId, "PL_gather")
  const s1 = brand(isShortcutId, "short1"), s2 = brand(isShortcutId, "short2")
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture", extension: { keep: true } }
  const settings = { ...stamp, data: { shortcuts: { list: [
    { id: s1, key: null, label: "One", watchLaterOnEveryAccount: false },
    { id: s2, key: null, label: "Two", watchLaterOnEveryAccount: true }] } } }
  const full = { label: { name: "Main" }, autoAdd: [{ pl: two, takes: "both", pct: 10 }], targets: { [s1]: one, gone01: two },
    quickSave: one, musicSave: music, gather, marks: { [one]: "full", [two]: "missing", PL_unchosen: "full" }, future: [1] }
  function records(setup: JsonValue | undefined, extra: JsonObject = {}): JsonObject {
    const base: JsonObject = { schema: 1, "doc:settings": copy(settings), [`doc:setup:${B}`]: { ...stamp, data: { quickSave: two } }, ...extra }
    if (setup !== undefined) base[`doc:setup:${A}`] = copy(setup)
    return base
  }
  const change = (destination: SetupDestinationChange["destination"], expected: SetupDestinationChange["expected"], playlist: PlaylistId | null, acct: AccountKey = A): SetupDestinationChange => ({ acct, destination, expected, playlist })
  const quick = { kind: "quick-save" } as const, musicSave = { kind: "music-save" } as const, gatherSave = { kind: "gather" } as const
  const shortcut = (id: ShortcutId) => ({ kind: "shortcut", shortcut: id }) as const
  const live = (playlist: PlaylistId | null) => ({ setup: "live", playlist }) as const
  const none = { setup: "none" } as const

  for (const raw of [
    change(quick, none, one), change(musicSave, live(null), null), change(gatherSave, live(gather), two), change(shortcut(s1), live(one), null)
  ]) {
    const parsed = api.parse(copy(raw))
    equal(parsed, raw, "valid change round-trips")
    check(parsed && Object.isFrozen(parsed) && Object.isFrozen(parsed.destination) && Object.isFrozen(parsed.expected), "parsed change is frozen")
  }
  const valid = change(shortcut(s1), live(one), two)
  for (const raw of [
    null, [], "change", { ...valid, acct: "short" }, { ...valid, playlist: "x" }, { ...valid, playlist: "PL bad" }, { ...valid, extra: 1 },
    { ...valid, destination: { kind: "shortcut", shortcut: "toolong1" } }, { ...valid, destination: { kind: "shortcut" } },
    { ...valid, destination: { kind: "quick-save", shortcut: s1 } }, { ...valid, destination: { kind: "label" } },
    { ...valid, expected: { setup: "live" } }, { ...valid, expected: { setup: "none", playlist: null } }, { ...valid, expected: { setup: "deleted" } },
    { ...valid, expected: { setup: "live", playlist: "?" } }, { acct: A, destination: quick, expected: none },
    Object.assign(Object.create({ inherited: true }), valid), { ...valid, [Symbol("hidden")]: 1 }, { ...valid, playlist: undefined }
  ]) equal(api.parse(raw), undefined, `malformed change refused: ${String(JSON.stringify(raw))}`)

  for (const absent of [undefined, null, { ...stamp, deleted: true }]) {
    const input = records(absent), before = copy(input)
    equal(api.plan({ records: input, change: change(quick, none, null) }), { kind: "unchanged" }, "clearing an absent destination is a no-op")
    equal(api.plan({ records: input, change: change(shortcut(s1), live(null), one) }), { kind: "stale", reason: "setup" }, "a live capture never recreates a removed setup")
    const created = api.plan({ records: input, change: change(musicSave, none, music) })
    check(created.kind === "save", "explicit fresh choice creates a setup")
    equal(created.setup, { label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: music, gather: null, marks: {} }, "new setup holds only the choice")
    equal(created.key, { kind: "setup", acct: A }, "new setup addresses its own account")
    equal([...created.context.shortcutIds], [s1, s2], "context carries current shortcut IDs")
    equal(input, before, "planning never mutates records")
  }
  {
    const input = records({ ...stamp, data: full })
    equal(api.plan({ records: input, change: change(quick, none, two) }), { kind: "stale", reason: "setup" }, "a capture without a setup cannot edit a live one")
    equal(api.plan({ records: input, change: change(quick, live(two), music) }), { kind: "stale", reason: "destination" }, "changed destination is stale")
    equal(api.plan({ records: input, change: change(shortcut(brand(isShortcutId, "gone01")), live(two), one) }), { kind: "stale", reason: "shortcut" }, "orphaned shortcut target is not editable")
    equal(api.plan({ records: input, change: change(shortcut(brand(isShortcutId, "short9")), none, one) }), { kind: "stale", reason: "shortcut" }, "deleted shortcut row is never recreated")
    equal(api.plan({ records: input, change: change(quick, live(one), one) }), { kind: "unchanged" }, "same destination is a no-op")
    equal(api.plan({ records: input, change: change(shortcut(s2), live(null), null) }), { kind: "unchanged" }, "clearing an empty shortcut target is a no-op")
    const unrelated = { label: { name: "Main" }, autoAdd: [{ pl: two, takes: "both", pct: 10 }], future: [1] }
    const cases = [
      { change: change(quick, live(one), two), field: { quickSave: two }, marks: { [one]: "full", [two]: "missing" } },
      { change: change(musicSave, live(music), null), field: { musicSave: null }, marks: { [one]: "full", [two]: "missing" } },
      { change: change(gatherSave, live(gather), one), field: { gather: one }, marks: { [one]: "full", [two]: "missing" } },
      { change: change(shortcut(s1), live(one), null), field: { targets: {} }, marks: { [one]: "full", [two]: "missing" } },
      { change: change(shortcut(s2), live(null), two), field: { targets: { [s1]: one, [s2]: two } }, marks: { [one]: "full", [two]: "missing" } }
    ]
    for (const item of cases) {
      const result = api.plan({ records: input, change: item.change })
      check(result.kind === "save", `edit saves ${JSON.stringify(item.change.destination)}`)
      equal(result.setup, { quickSave: one, musicSave: music, gather, targets: { [s1]: one }, ...unrelated, ...item.field, marks: item.marks },
        `only the addressed destination changes, orphans and unchosen marks normalize ${JSON.stringify(item.change.destination)}`)
    }
  }
  {
    const only = (data: JsonObject) => records({ ...stamp, data: { label: { name: "Kept label" }, marks: { [one]: "full" }, ...data } })
    equal(api.plan({ records: only({ quickSave: one }), change: change(quick, live(one), null) }), { kind: "remove" }, "clearing the last choice removes the setup")
    equal(api.plan({ records: only({ targets: { [s1]: one } }), change: change(shortcut(s1), live(one), null) }), { kind: "remove" }, "clearing the last target removes the setup")
    equal(api.plan({ records: only({ quickSave: one, targets: { gone01: two } }), change: change(quick, live(one), null) }), { kind: "remove" }, "an orphaned target does not keep a setup alive")
    const gatherOnly = api.plan({ records: only({ quickSave: one, gather }), change: change(quick, live(one), null) })
    check(gatherOnly.kind === "save" && gatherOnly.setup.gather === gather, "a gather playlist keeps the setup alive")
    const kept = api.plan({ records: only({ quickSave: one }), change: change(quick, live(one), null) })
    check(kept.kind === "remove", "control without filters")
    const filtered = api.plan({ records: { ...only({ quickSave: one }), [`doc:filter:${A}:${two}`]: { ...stamp, data: { mode: "deny", on: false, channels: [] } } }, change: change(quick, live(one), null) })
    check(filtered.kind === "save", "a kept filter keeps the setup alive")
    const newerFilter = api.plan({ records: { ...only({ quickSave: one }), [`doc:filter:${A}:${two}`]: { ...stamp, v: 2, data: { unknown: true } } }, change: change(quick, live(one), null) })
    check(newerFilter.kind === "save", "an unreadable newer filter still counts as kept")
    const deletedFilter = api.plan({ records: { ...only({ quickSave: one }), [`doc:filter:${A}:${two}`]: { ...stamp, deleted: true } }, change: change(quick, live(one), null) })
    check(deletedFilter.kind === "remove", "a filter tombstone does not keep the setup alive")
  }
  {
    const input = records({ ...stamp, data: { quickSave: one, marks: { WL: "full" } } })
    const wlKept = api.plan({ records: input, change: change(musicSave, live(null), music) })
    check(wlKept.kind === "save", "Watch later edit saves")
    equal(wlKept.setup.marks, { WL: "full" }, "Watch later mark survives while a shortcut falls back to it")
    equal([...wlKept.context.additionalChosenPlaylists], ["WL"], "context names the shared Watch later choice")
    const wlOverridden = api.plan({ records: input, change: change(shortcut(s2), live(null), two) })
    check(wlOverridden.kind === "save", "override saves")
    equal(wlOverridden.setup.marks, {}, "Watch later mark normalizes away once no shortcut falls back to it")
  }
  {
    equal(api.plan({ records: records({ ...stamp, v: 2, data: { future: true } }), change: change(quick, live(one), two) }), { kind: "update-needed" }, "newer setup is refused as update-needed")
    const input = { ...records({ ...stamp, data: full }), "doc:settings": { ...stamp, v: 2, data: { future: ["opaque"] } } }
    const before = copy(input)
    for (const destination of [quick, musicSave, gatherSave, shortcut(s1)]) {
      const result = api.plan({ records: input, change: change(destination, live(destination === musicSave ? music : destination === gatherSave ? gather : one), two) })
      check(result.kind === "save", "newer Settings does not block a supported Setup edit")
      equal(result.setup.targets.gone01, two, "unknown shortcut target is retained")
      equal(result.setup.marks, full.marks, "unknown shared choices cannot prune marks")
    }
    equal(input, before, "newer raw bytes are never changed by planning")
    equal(api.plan({ records: records({ ...stamp, data: { quickSave: "bad id" } }), change: change(quick, live(null), two) }), { kind: "invalid" }, "corrupt setup is invalid")
    equal(api.plan({ records: records({ ...stamp, gen: "", data: {} }), change: change(quick, live(null), two) }), { kind: "invalid" }, "corrupt envelope is invalid")
    equal(api.plan({ records: { ...records({ ...stamp, data: full }), "doc:settings": { ...stamp, data: { theme: "blue" } } }, change: change(quick, live(one), two) }), { kind: "invalid" }, "corrupt settings are invalid")
    equal(api.plan({ records: { ...records({ ...stamp, data: full }), [`doc:filter:${A}:${two}`]: { ...stamp, data: { mode: "sideways" } } }, change: change(quick, live(one), two) }), { kind: "invalid" }, "corrupt same-account filter is invalid")
    const sibling = api.plan({ records: { ...records({ ...stamp, data: full }), [`doc:filter:${B}:${two}`]: { ...stamp, data: { mode: "sideways" } }, [`doc:setup:${B}`]: { ...stamp, v: 2, data: {} } }, change: change(quick, live(one), two) })
    check(sibling.kind === "save" && sibling.key.acct === A, "another account's documents never affect this account")
    const second = api.plan({ records: records({ ...stamp, data: full }), change: change(quick, live(two), music, B) })
    check(second.kind === "save" && second.key.acct === B && second.setup.quickSave === music, "second account edits its own setup")
    equal(api.plan({ records: records({ ...stamp, data: full }), change: change(quick, live(one), music, B) }), { kind: "stale", reason: "destination" }, "another account's destination never satisfies this expectation")
  }
  {
    const input = records({ ...stamp, data: full }), before = copy(input)
    const read = api.read(input, A)
    check(read.kind === "value" && read.view.kind === "live", "live setup reads")
    equal(read.view.setup.targets, { [s1]: one }, "read view hides orphaned targets")
    equal(read.view.setup.quickSave, one, "read view keeps destinations")
    equal(api.expect(read.view, quick), live(one), "expectation follows the read view")
    equal(api.expect(read.view, shortcut(s2)), live(null), "missing target expects null")
    equal(input, before, "read never mutates or materializes records")
    for (const absent of [undefined, null, { ...stamp, deleted: true }]) {
      const view = api.read(records(absent), A)
      equal(view, { kind: "value", view: { kind: "none", acct: A } }, "absent and removed setups read as none")
      check(view.kind === "value", "none view")
      equal(api.expect(view.view, gatherSave), none, "none view expects none")
    }
    equal(api.read(records({ ...stamp, v: 2, data: {} }), A), { kind: "newer-version" }, "newer setup read")
    equal(api.read(records({ ...stamp, data: { gather: 5 } }), A), { kind: "invalid" }, "invalid setup read")
    equal(api.read({ ...records(undefined), "doc:settings": { ...stamp, v: 3, data: {} } }, A), { kind: "value", view: { kind: "none", acct: A } }, "newer settings does not hide an absent Setup")
  }
  return { checks }
}

test("Setup destination plans address one canonical field and refuse stale, removed or malformed choices", () => {
  expect(setupPlanAcceptance({ plan: planSetupDestination, parse: parseSetupDestinationChange, read: readAccountSetup, expect: expectDestination }).checks).toBeGreaterThan(90)
})
