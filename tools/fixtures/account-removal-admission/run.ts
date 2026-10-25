import {
  defaultDevice, defaultSettings, defaultSetup, documentKey, isAccountKey, isPlaylistId, isShortcutId,
  type DocumentKey, type Filter, type PlaylistId
} from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { planSetupRemoval, removeSharedShortcut } from "../../../src/background/store/accounts"
import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { encodeSyncDocument, projectSyncWrite } from "../../../src/background/store/sync-codec"
import { planSyncWrite, type SyncWritePlanInput } from "../../../src/background/store/sync-write-admission"

type Candidate = Extract<SyncWritePlanInput["intent"], { kind: "changed-batch" }>["documents"][number]
function account(value: string) { if (!isAccountKey(value)) throw Error("Invalid fixture account"); return value }
function list(value: string) { if (!isPlaylistId(value)) throw Error("Invalid fixture playlist"); return value }
function shortcutId(value: string) { if (!isShortcutId(value)) throw Error("Invalid fixture shortcut"); return value }
const acct = account("AAAAAAAAAAAAAAAA"), retained = account("BBBBBBBBBBBBBBBB"), empty = account("CCCCCCCCCCCCCCCC")
const playlist = list("PL_selected"), kept = list("PL_kept"), shortcut = shortcutId("orig01")
const setupKey: DocumentKey = { kind: "setup", acct }
const selectedKey: DocumentKey = { kind: "filter", acct, playlist }
const keptKey: DocumentKey = { kind: "filter", acct, playlist: kept }
const pendingKey: DocumentKey = { kind: "settings" }
const restorationKey: DocumentKey = { kind: "setup", acct: retained }
const metadata = { v: 1, id: "fixture-history", created: 0, extension: { keep: true } }
const filter: Filter = { mode: "deny", on: false, channels: [] }
const setup = { ...defaultSetup(), autoAdd: [{ pl: playlist, takes: "videos" as const }] }
const bodies = { setup, filters: { [playlist]: filter, [kept]: filter } }

function json(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid fixture JSON")
  return value
}
function copy(value: JsonObject): JsonObject { return json(JSON.parse(JSON.stringify(value))) }
function envelope(data: unknown, gen = "old"): JsonObject {
  return json({ v: 1, gen, at: 1, by: "fixture-old", extension: { nested: [null, true] },
    ...JSON.parse('{"__proto__":{"preserve":true},"toJSON":"inert"}'), data })
}
function tombstone(raw: JsonObject, gen: string): JsonObject {
  const next = { ...raw, gen, at: 100, by: "fixture-device", deleted: true }
  Reflect.deleteProperty(next, "data")
  return next
}
function wire(key: DocumentKey, document: JsonObject) {
  const result = encodeSyncDocument({ key, document })
  if (result.kind !== "encoded") throw Error("Fixture did not encode")
  return result.encoded.items
}
function base(key: DocumentKey) { return `s:${documentKey(key).slice(4)}` }
function baseline(entries: readonly Candidate[]) {
  const local = json({ schema: 1, device: { ...defaultDevice("fixture-device"), consent: { v: 1, at: 1 }, syncOn: true,
    lastAccount: acct, extension: "keep-device" },
    sync: { joined: "fixture-history", pushed: Object.fromEntries(entries.map(({ key, document }) => [documentKey(key), document.gen])),
      status: "ok", editedSinceOff: false, extension: { keep: true } },
    [`cache:${acct}`]: { fixture: "untouched-cache" }, [`progress:${acct}:0`]: { fixture: "untouched-progress" },
    fixtureSession: { fixture: "untouched-session" }, unclaimed: { originalShortcutId: shortcut },
    ...Object.fromEntries(entries.map(({ key, document }) => [documentKey(key), document])) })
  const sync = json({ "s:meta": metadata, ...Object.fromEntries(entries.flatMap(({ key, document }) => wire(key, document)).map(item => [item.key, item.value])) })
  return { local, sync }
}
function batch(documents: readonly [Candidate, ...Candidate[]]): SyncWritePlanInput["intent"] {
  return { kind: "changed-batch", documents }
}
function physical(records: JsonObject) { return Object.entries(records).map(([key, value]) => ({ key, value })) }
const oldEntries = [
  { key: setupKey, document: envelope(setup) }, { key: selectedKey, document: envelope(filter) },
  { key: keptKey, document: envelope(filter) }
]

export async function runAccountRemovalAdmission() {
  const assertions: string[] = []
  function check(value: unknown, label: string): asserts value {
    assertions.push(label)
    if (!value) throw Error(label)
  }
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) { const match = stable(actual) === stable(expected); check(match, match ? label : `${label}: ${stable(actual)} != ${stable(expected)}`) }
  const observations: unknown[] = []
  function plan(input: SyncWritePlanInput) {
    const result = planSyncWrite(input)
    observations.push({ case: "admission-snapshot", ...copy(json({ input, result })) })
    return result
  }
  const seed = baseline(oldEntries)
  const removal = planSetupRemoval({ acct, current: { kind: "present", bodies } })
  check(removal.kind === "remove", "Setup removal has complete selected and kept Filter inventory")
  equal(removal.removal.documents, [setupKey, selectedKey, keptKey], "exact account removal documents")
  equal(removal.removal.progressKeys.length, 16, "semantic removal names sixteen shards without deleting them")
  const proposed = removal.removal.documents.map((key, i) => {
    const raw = seed.local[documentKey(key)]
    return { key, document: tombstone(json(raw), `removed-${i}`) }
  })
  const [first, ...rest] = proposed
  check(first, "nonempty account tombstones")
  const intent = batch([first, ...rest])
  for (const item of proposed) {
    equal(item.document.extension, json(seed.local[documentKey(item.key)]).extension, "tombstone preserves envelope extensions")
    check(!Object.hasOwn(item.document, "data") && Object.hasOwn(item.document, "__proto__"), "tombstone drops superseded body and retains own fields")
  }
  const pending = envelope(defaultSettings(), "pending-settings")
  const restoration = envelope({ ...defaultSetup(), gather: "PL_restore" }, "acknowledged-restoration")
  seed.local[documentKey(pendingKey)] = pending
  seed.local[documentKey(restorationKey)] = restoration
  json(json(seed.local.sync).pushed)[documentKey(restorationKey)] = restoration.gen!
  const original = copy(json(seed))
  const admission = plan({ ...seed, intent })
  check(admission.kind === "planned", "complete removal candidate set admitted")
  const expectedDocuments = [...proposed, { key: pendingKey, document: pending }, { key: restorationKey, document: restoration }]
  const expectedSent = expectedDocuments.map(({ key, document }) => ({ key, name: documentKey(key), gen: document.gen, document }))
  equal(admission.sent, expectedSent.slice(3).concat(expectedSent.slice(0, 3)), "exact batch candidates plus independent pending and disappeared restoration")
  equal(admission.items, admission.sent.flatMap(({ key, document }) => wire(key, document)), "exact combined outgoing wire records")
  equal(admission.repairs, [], "planning does not acknowledge candidates")
  equal(admission.metadata, metadata, "raw metadata extensions preserved")
  equal(seed, original, "admission leaves full snapshots unchanged")

  function ownerHarness(initial: { local: JsonObject; sync: JsonObject }) {
    let local = copy(initial.local), sync = copy(initial.sync), now = 0, generations = 0
    const localSets: JsonObject[] = [], syncSets: JsonObject[] = [], schedules: number[] = []
    const ports = {
      local: { async get() { return copy(local) }, async set(items: Readonly<Record<string, JsonValue>>) {
        localSets.push(copy(json(items))); local = { ...local, ...copy(json(items)) }
      } },
      sync: { async get() { return copy(sync) }, async set(items: Readonly<Record<string, JsonValue>>) {
        syncSets.push(copy(json(items))); sync = { ...sync, ...copy(json(items)) }
      }, subscribe() { return () => {} } },
      claim: { kind: "unavailable" as const }, now: () => 100, generation: () => `filter-edit-${++generations}`,
      syncClock: { now: () => now, wallNow: () => 1000000 + now, after(ms: number) { schedules.push(ms); return () => {} } },
      onSyncResult() {}
    }
    return { ports, localSets, syncSets, schedules, clock(value: number) { now = value },
      state: () => ({ local: copy(local), sync: copy(sync) }), counts: () => ({ generations }) }
  }
  const h = ownerHarness(seed), owner = createLocalFilterWriter(h.ports)
  const staging = json(Object.fromEntries(proposed.map(({ key, document }) => [documentKey(key), document])))
  await h.ports.local.set(staging)
  equal(await h.ports.local.get(), { ...seed.local, ...staging }, "fixture staging confirms full exact local readback")
  const staged = h.state()
  equal(await owner.flushSync(), { kind: "deferred", notBefore: 5000 }, "actual owner first defers until shared opportunity")
  equal(h.syncSets, [], "deferred owner sends nothing")
  h.clock(5000)
  const flushed = await owner.flushSync()
  equal(flushed, { kind: "pushed", sent: expectedSent, repaired: [] }, "actual owner sends all admitted candidates and independent records")
  equal(h.syncSets, [Object.fromEntries(admission.items.map(item => [item.key, item.value]))], "one exact combined sync set")
  const acknowledged = h.state()
  const pushed = { ...json(json(seed.local.sync).pushed), ...Object.fromEntries(admission.sent.map(item => [item.name, item.gen])) }
  equal(acknowledged.local, { ...staged.local, sync: { ...json(seed.local.sync), pushed } }, "exact acknowledgement readback without local cleanup")
  await owner.dispose()
  const serialized = JSON.stringify(acknowledged)
  const restart = ownerHarness(JSON.parse(serialized)), restarted = createLocalFilterWriter(restart.ports)
  equal(await restarted.flushSync(), { kind: "idle" }, "serialized restart is idle without duplicate push")
  equal(restart.syncSets, [], "restart performs no sync set")
  await restarted.dispose()
  observations.push({ case: "account-removal", removal, admission, before: original, "fixture-staged-documents": staging,
    staged, "owner-flush-result": flushed, acknowledged, localSets: h.localSets, syncSets: h.syncSets, serialized, restart: restart.state() })

  const refused = { kind: "refused", reason: "sync-full" }, unavailable = { kind: "unavailable" }
  const debtCases: [string, JsonValue, unknown][] = [
    ["addressed newer", { v: 2, gen: "future", at: 2, by: "other", data: {} }, { kind: "refused", reason: "update-needed" }],
    ["addressed malformed", {}, unavailable], ["addressed present null", null, unavailable],
    ["addressed incomplete", { v: 1, gen: "parts", at: 2, by: "other", n: 2 }, unavailable],
    ["same generation divergence", { ...oldEntries[1]!.document, extra: true }, unavailable],
    ["unresolved lineage", envelope(filter, "other-history"), unavailable]
  ]
  for (const [label, value, expected] of debtCases) {
    const state = baseline(oldEntries); state.sync[base(selectedKey)] = value
    const before = JSON.stringify(state), result = plan({ ...state, intent })
    equal(result, expected, `${label} rejects whole batch`)
    equal(JSON.stringify(state), before, `${label} leaves raw state byte-for-byte unchanged`)
    observations.push({ case: label, result, before: JSON.parse(before), after: state, "fixture-staged-documents": null })
  }
  const futureState = baseline(oldEntries)
  futureState.sync["s:setup:DDDDDDDDDDDDDDDD"] = { v: 2, gen: "future", at: 2, by: "other", data: {} }
  check(plan({ ...futureState, intent }).kind === "planned", "unrelated newer remote remains protected occupancy")
  const invalidBaseline = baseline(oldEntries); invalidBaseline.local[documentKey(selectedKey)] = { bad: true }
  equal(plan({ ...invalidBaseline, intent }), unavailable, "candidate overlay cannot repair malformed local baseline")

  const large = proposed.map(item => ({ ...item, document: { ...item.document, extension: "x".repeat(51000) } }))
  const [largeFirst, ...largeRest] = large
  check(largeFirst, "large batch nonempty")
  for (const item of large) check(plan({ ...baseline(oldEntries), intent: { kind: "changed", ...item } }).kind === "planned", "each proposed replacement fits independently")
  const combined = baseline(oldEntries), combinedBefore = JSON.stringify(combined)
  const combinedResult = plan({ ...combined, intent: batch([largeFirst, ...largeRest]) })
  equal(combinedResult, refused, "combined quota refuses independently fitting candidates")
  equal(JSON.stringify(combined), combinedBefore, "combined quota refusal stages nothing")
  observations.push({ case: "combined-budget", before: JSON.parse(combinedBefore), result: combinedResult, after: combined, "fixture-staged-documents": null })

  const superseded = baseline(oldEntries)
  for (const item of oldEntries) superseded.local[documentKey(item.key)] = { ...item.document, gen: "unsent-huge", extension: "x".repeat(100000) }
  superseded.sync = { "s:meta": metadata }
  const replaced = plan({ ...superseded, intent })
  check(replaced.kind === "planned", "replace every superseded oversized candidate before encoding")
  const retainedChunks = baseline(oldEntries)
  const hugeOld = { ...oldEntries[0]!.document, extension: "x".repeat(100000) }
  retainedChunks.local[documentKey(setupKey)] = hugeOld
  retainedChunks.sync = { ...retainedChunks.sync, ...Object.fromEntries(wire(setupKey, hugeOld).map(item => [item.key, item.value])) }
  equal(plan({ ...retainedChunks, intent }), refused, "retained old chunks earn no speculative quota credit")
  const smallChunked = { ...oldEntries[0]!.document, extension: "x".repeat(15000) }
  const chunkState = baseline(oldEntries)
  chunkState.local[documentKey(setupKey)] = smallChunked
  chunkState.sync = { ...chunkState.sync, ...Object.fromEntries(wire(setupKey, smallChunked).map(item => [item.key, item.value])) }
  const chunkPlan = plan({ ...chunkState, intent })
  check(chunkPlan.kind === "planned", "retained chunks can fit with admitted tombstones")
  const chunkOwner = ownerHarness(chunkState)
  await chunkOwner.ports.local.set(staging)
  const chunkWriter = createLocalFilterWriter(chunkOwner.ports)
  chunkOwner.clock(5000)
  equal(await chunkWriter.flushSync(), { kind: "pushed", sent: chunkPlan.sent, repaired: [] }, "owner sends tombstones over chunked remote")
  const chunkAfter = chunkOwner.state()
  for (const [key, value] of Object.entries(chunkState.sync).filter(([key]) => key.includes("@"))) equal(chunkAfter.sync[key], value, "actual owner retains exact old physical chunk")
  await chunkWriter.dispose()
  observations.push({ case: "retained-chunks", before: chunkState, admission: chunkPlan, after: chunkAfter, syncSets: chunkOwner.syncSets })

  const occupancy = baseline(oldEntries)
  Object.assign(occupancy.sync, Object.fromEntries(Array.from({ length: 476 }, (_, i) => [`unknown:${i}`, 0])))
  check(plan({ ...occupancy, intent }).kind === "planned", "exact 480 physical items admitted")
  occupancy.sync.excess = 0
  equal(plan({ ...occupancy, intent }), refused, "481 physical items refuse whole batch")
  const itemLimit = baseline(oldEntries); itemLimit.sync.unknown = "x".repeat(8192)
  equal(plan({ ...itemLimit, intent }), refused, "unknown physical per-item excess refuses whole batch")
  const debt = baseline(oldEntries)
  debt.local[documentKey(pendingKey)] = envelope({ future: "x".repeat(51000) }, "large-pending")
  debt.local[documentKey(restorationKey)] = tombstone(envelope({}, "large-restoration"), "large-restoration")
  json(debt.local[documentKey(restorationKey)]).extension = "x".repeat(51000)
  json(json(debt.local.sync).pushed)[documentKey(restorationKey)] = "large-restoration"
  for (const key of [pendingKey, restorationKey]) {
    const document = json(debt.local[documentKey(key)])
    check(projectSyncWrite({ current: physical(debt.sync), set: [...wire(key, document), ...proposed.flatMap(item => wire(item.key, item.document))] }).kind === "fits", "pending or acknowledged disappearance fits alone with candidates")
  }
  equal(plan({ ...debt, intent }), refused, "pending plus acknowledged disappearance exceed combined budget")
  observations.push({ case: "pending-restoration-budget", before: debt, result: plan({ ...debt, intent }), "fixture-staged-documents": null })

  const settings = defaultSettings()
  settings.shortcuts.list = [{ id: shortcut, key: null, label: "Edited label", watchLaterOnEveryAccount: false }]
  const accounts = [
    { acct, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist }, gather: kept }, filters: {} } }, additionalChosenPlaylists: new Set<PlaylistId>() },
    { acct: retained, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist } }, filters: { [kept]: filter } } }, additionalChosenPlaylists: new Set<PlaylistId>() },
    { acct: empty, current: { kind: "present" as const, bodies: { setup: { ...defaultSetup(), targets: { [shortcut]: playlist } }, filters: {} } }, additionalChosenPlaylists: new Set<PlaylistId>() }
  ]
  const shared = removeSharedShortcut({ settings, shortcut, accounts })
  check(shared.kind === "removed", "shared shortcut removal planned by existing helper")
  equal(shared.accounts.map(item => item.kind), ["save", "save", "remove"], "shared removal saves choices and off empty kept Filter account but removes empty Setup")
  const sharedEntries: Candidate[] = [{ key: pendingKey, document: envelope(settings) },
    ...accounts.map(item => ({ key: { kind: "setup" as const, acct: item.acct }, document: envelope(item.current.bodies.setup) })),
    { key: { kind: "filter", acct: retained, playlist: kept }, document: envelope(filter) }]
  const sharedState = baseline(sharedEntries)
  const sharedCandidates: [Candidate, ...Candidate[]] = [{ key: pendingKey, document: envelope(shared.settings, "shared-settings") }]
  for (const effect of shared.accounts) {
    if (effect.kind === "save") sharedCandidates.push({ key: { kind: "setup", acct: effect.acct }, document: envelope(effect.bodies.setup, `shared-${effect.acct}`) })
    else for (const key of effect.removal.documents) sharedCandidates.push({ key, document: tombstone(json(sharedState.local[documentKey(key)]), `shared-${documentKey(key)}`) })
  }
  const sharedBefore = JSON.stringify(sharedState), sharedPlan = plan({ ...sharedState, intent: batch(sharedCandidates) })
  check(sharedPlan.kind === "planned", "Settings row removal and affected saved or empty Setups admitted together")
  equal(JSON.stringify(sharedState), sharedBefore, "pure shared planning stages nothing")
  const identity = settings.shortcuts.list[0], provenance = sharedState.local.unclaimed
  const noOp = removeSharedShortcut({ settings: shared.settings, shortcut, accounts })
  equal(noOp, { kind: "unchanged" }, "missing shared shortcut is no-op")
  check(settings.shortcuts.list[0] === identity && sharedState.local.unclaimed === provenance, "no-op preserves original identity and provenance references")
  equal(JSON.stringify(sharedState), sharedBefore, "missing shortcut leaves full raw state unchanged")
  observations.push({ case: "shared-shortcut-pure-input", shared, candidates: sharedCandidates, result: sharedPlan, noOp, before: JSON.parse(sharedBefore), after: sharedState, "fixture-staged-documents": null })

  const editState = baseline(oldEntries), edit = ownerHarness(editState), editor = createLocalFilterWriter(edit.ports)
  const change = { acct, playlist, desired: { mode: "deny" as const, on: true }, clearListedChannels: "not-confirmed" as const }
  equal(await editor.change({ kind: "ui", windowId: 1, incognito: false }, change), { kind: "result", result: { ok: true } }, "actual Filter singleton transaction uses generalized admission")
  equal(edit.counts(), { generations: 1 }, "real Filter edit creates one stamp")
  equal(await editor.flushSync(), { kind: "deferred", notBefore: 5000 }, "singleton preserves debounce and pacing")
  edit.clock(5000)
  const editFlush = await editor.flushSync()
  check(editFlush.kind === "pushed" && editFlush.sent.length === 1, "actual singleton flush sends one Filter")
  const edited = edit.state(), localWrites = edit.localSets.length
  equal(await editor.change({ kind: "ui", windowId: 1, incognito: false }, change), { kind: "result", result: { ok: true } }, "achieved Filter change stays no-op")
  equal(edit.localSets.length, localWrites, "singleton no-op writes nothing")
  equal(edit.counts(), { generations: 1 }, "singleton no-op generates no stamp")
  await editor.dispose()
  observations.push({ case: "actual-filter-singleton", before: editState, "owner-flush-result": editFlush, after: edited, localSets: edit.localSets, syncSets: edit.syncSets, schedules: edit.schedules })
  return { fixture: "exclusive-synthetic", boundary: "production-removal-not-implemented", localCleanup: "not-implemented",
    native: "waived-unproven", assertions, observations }
}

export const fixtureRun = runAccountRemovalAdmission()
fixtureRun.then(result => console.log(JSON.stringify(result)))
