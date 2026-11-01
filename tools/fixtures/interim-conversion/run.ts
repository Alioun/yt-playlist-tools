import { deriveInterimInstallationEffect } from "../../../src/background/store/interim-installation"
import { parseConsentJobs, consentJobsKey, type HeldWorkRead, type HeldWorkView } from "../../../src/background/store/consent-recovery"
import { readConsentDevice } from "../../../src/background/store/consent-withdrawal"
import { createStoreLifecycle } from "../../../src/background/store/store-lifecycle"
import { createLifecycleHarness, settingsOrigin } from "../device-lifecycle/run"
import { sameSyncJson } from "../../../src/background/store/sync-write-admission"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { interimConversionKey, executeInterimRetention, readRetainedInterim, readRetainedCheckpoint, projectInterimNote, type InterimPersistenceSnapshot } from "../../../src/background/store/interim-persistence"
import { createStoreStartupHost, isStartupValueKey, projectInterimSnapshot, type SanitizedStartupInventory } from "../../../src/background/adapters/startup-source"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import { isAccountKey, isPlaylistId } from "../../../src/shared/model/validation"
import { decodeDocument, decodeFilter, decodeSettings, decodeSetup } from "../../../src/shared/model"
import type { InterimConversionContext } from "../../../src/background/store/interim-conversion"

const A = "AAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBB", C = "CCCCCCCCCCCCCCCC", D = "DDDDDDDDDDDDDDDD", E = "EEEEEEEEEEEEEEEE"
const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function object(raw: unknown): raw is JsonObject { return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw) }
function body(): JsonObject { return { playlists: [], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null } }
export function interimFixture(): JsonObject {
  return { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: true, future: { retained: true } }, unclaimed: null,
    sync: { joined: "history", pushed: {}, status: "ok", editedSinceOff: false, opaqueWrite: { gate: { kind: "held", notBefore: 1060000 }, diagnostic: { name: "Original", message: "opaque" } } },
    [`account:${A}`]: { ...body(), playlists: ["PL_SECOND", "PL_FIRST"], shortcutPlaylistId: "WL",
      filters: { PL_KEPT: { mode: "deny", enabled: false, channels: [channel] }, PL_ORPHAN: { mode: "allow", enabled: true, channels: [] } },
      labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" } }, cachedPlaylists: [{ id: "PL_FIRST", title: "Synthetic playlist" }], cachedAt: 10 },
    [`account:${B}`]: { ...body(), playlists: ["PL_OTHER"], shortcutPlaylistId: "PL_OTHER_TARGET" },
    [`account:${D}`]: { ...body(), cachedPlaylists: [{ id: "PL_CACHE", title: "Cache only" }], cachedAt: 5 }, [`account:${E}`]: body(),
    savedAccountKeys: [A, A, C], sessionConsent: 1, sessionGeneration: "synthetic-session", legacyClaimed: false,
    playlists: ["PL_RETAINED_GLOBAL", "PL_RETAINED_GLOBAL"], addToPlaylistID: "PL_RETAINED_TARGET", watchLaterShortcut: "Control+Shift+S",
    requiredWatchPercentage: 82, toastEnabled: false, queueButtonEnabled: true, unrelated: { keep: [null, false] } }
}
export function syntheticStartupInventory(records: Readonly<Record<string, unknown>>, facts: Omit<SanitizedStartupInventory, "presentLocalKeys" | "values">): SanitizedStartupInventory {
  const names = Object.keys(records)
  return { presentLocalKeys: names, values: Object.defineProperties({}, Object.fromEntries(names.filter(isStartupValueKey).map(name => [name, Object.getOwnPropertyDescriptor(records, name)!]))), ...facts }
}
const interimFacts = { legacyAuthorization: { kind: "unavailable" }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } } as const
export function interimSnapshot(records: Readonly<Record<string, unknown>>): InterimPersistenceSnapshot {
  return projectInterimSnapshot(syntheticStartupInventory(records, interimFacts))
}
type SetMode = "normal" | "rejected-unchanged" | "rejected-applied" | "resolved-partial" | "resolved-missing" | "rejected-divergent"
export function createInterimHarness(initial: JsonObject = interimFixture(), mode: SetMode = "normal") {
  let records = copy(initial), reads = 0
  const effects: unknown[] = [], writes: JsonObject[] = []
  let beforeSnapshot: ((n: number, records: JsonObject) => Promise<void>) | undefined
  let beforeSet: (() => Promise<void>) | undefined
  let beforeGet: (() => Promise<void>) | undefined
  let overrideWrite: ((items: JsonObject, apply: (items: JsonObject) => void) => Promise<void>) | undefined
  const error = new Error("Synthetic retention write failure"), readError = new Error("Synthetic snapshot failure")
  const startup = createStoreStartupHost({
    context: { deviceId: "synthetic-device", settingsGen: "synthetic-capture", at: 123, shortcutId: "conv01", platform: { browser: "firefox", os: "linux" }, commands: [] },
    source: { async readInventory() { reads++; effects.push({ snapshot: reads }); await beforeSnapshot?.(reads, records); return syntheticStartupInventory(copy(records), interimFacts) } },
    cleanup: { async removeLocal() { throw Error("Interim hold cannot remove source") }, async deleteDatabase() { throw Error("Interim hold cannot delete database") }, async removeSession() { throw Error("Interim hold cannot remove session") } }
  })
  const deps = { startup,
    local: {
      async get(keys: readonly string[] | null) { effects.push({ get: keys }); await beforeGet?.(); return copy(keys === null ? records : Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))) },
      async set(items: Readonly<Record<string, JsonValue>>) {
        if (!object(items)) throw Error("Non-JSON retention write")
        effects.push({ set: copy(items) }); writes.push(copy(items)); await beforeSet?.()
        if (overrideWrite) { await overrideWrite(copy(items), value => { records = { ...records, ...copy(value) } }); return }
        if (mode === "rejected-unchanged") throw error
        if (mode === "resolved-missing") return
        if (mode === "resolved-partial") records.interimConversion = { v: 1, kind: "retained-interim" }
        else records = { ...records, ...copy(items) }
        if (mode === "rejected-divergent") records.savedAccountKeys = []
        if (mode === "rejected-applied" || mode === "rejected-divergent") throw error
      }
    },
    claim: { kind: "unavailable" as const }, removal: { kind: "unavailable" as const },
    sync: { async get() { effects.push("sync-get"); throw Error("Held sync read") }, async set() { effects.push("sync-set"); throw Error("Held sync write") }, subscribe() { effects.push("sync-subscribe"); throw Error("Held subscription") } },
    syncClock: { now() { effects.push("mono"); return 0 }, wallNow() { effects.push("wall"); return 1000000 }, after() { effects.push("timer"); throw Error("Held timer") } },
    now() { effects.push("stamp"); return 100 }, generation() { effects.push("generation"); return "never" }, onSyncResult(result: unknown) { effects.push({ automatic: result }) }
  }
  return { deps, effects, writes, error, readError, records: () => copy(records), mode(value: SetMode) { mode = value }, foreign(fn: (records: JsonObject) => void) { fn(records) }, snapshot(fn: typeof beforeSnapshot) { beforeSnapshot = fn }, set(fn: typeof beforeSet) { beforeSet = fn }, get(fn: typeof beforeGet) { beforeGet = fn }, write(fn: typeof overrideWrite) { overrideWrite = fn } }
}

export async function runInterimConversion(api = { create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter, Error: StartupReadinessError, execute: executeInterimRetention, read: readRetainedInterim, project: projectInterimNote }) {
  let assertions = 0
  const observations: unknown[] = []
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  const stable = (value: unknown): string => JSON.stringify(value, (_, child: unknown) => child instanceof Error ? { name: child.name, message: child.message }
    : child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : child)
  function equal(actual: unknown, expected: unknown, label: string) { check(stable(actual) === stable(expected), label) }
  async function held(owner: ReturnType<typeof api.create>) {
    let caught: unknown
    try { await owner.ready() } catch (error) { caught = error }
    check(caught instanceof api.Error && caught.result.kind === "interim-held", "retention never grants readiness")
    return caught.result.result
  }
  async function closed(owner: ReturnType<typeof api.create>, h: ReturnType<typeof createInterimHarness>) {
    const acct = A, playlist = "PL_FIRST"
    if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic account or playlist")
    const ui = { kind: "ui", windowId: 1, incognito: false } as const
    const before = copy(h.effects), records = h.records()
    equal(await owner.read("settings"), { kind: "unavailable", reason: "startup" }, "held Settings read")
    equal(await owner.readClaimNotice(), { kind: "unavailable", reason: "startup" }, "held notices")
    equal(await owner.acknowledgeClaimNotice(ui, { acct, dropped: 0 }), { kind: "unavailable", reason: "startup" }, "held notice acknowledgement")
    equal(await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "held Settings edit")
    equal(await owner.change(ui, { acct, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" }), { kind: "unavailable", reason: "startup" }, "held Filter edit")
    equal(await owner.prepareAccountRemoval(ui, acct), { kind: "unavailable", reason: "startup" }, "held account removal preparation")
    equal(await owner.removeAccountSetup(ui, { kind: "account-removal-confirmation" }), { kind: "unavailable", reason: "startup" }, "held account removal execution")
    equal(await owner.claim(), { kind: "unavailable", reason: "startup" }, "held claim")
    equal(await owner.receiveSyncDocument({ kind: "settings" }), { kind: "unavailable", reason: "authority" }, "held incoming sync")
    equal(await owner.flushSync(), { kind: "unavailable" }, "held outgoing sync")
    const stop = owner.subscribe(() => { throw Error("Held Settings event") }); stop(); stop(); await owner.startSync()
    equal(h.effects, before, "held operations have zero effects")
    equal(h.records(), records, "held operations preserve complete store")
  }
  const stamp = { v: 1, gen: "canonical", at: 1, by: "synthetic-other", future: [null] }
  const base = interimFixture()
  const fixtures: { name: string; records: JsonObject; expected: "inactive-proposal" | "blocked-source" }[] = [
    { name: "ordered-unindexed-index-only-cache-only-empty", records: base, expected: "inactive-proposal" },
    { name: "explicit-global-recovery", records: { ...base, legacyClaimed: true }, expected: "inactive-proposal" },
    { name: "false-empty-markers", records: { schema: 1, savedAccountKeys: [], sessionConsent: 0, sessionGeneration: "", legacyClaimed: false }, expected: "inactive-proposal" },
    { name: "fallbacks", records: { schema: 1, sessionConsent: 0, [`account:${A}`]: { ...body(), playlists: ["PL_FIRST"] } }, expected: "inactive-proposal" },
    { name: "malformed-unindexed", records: { ...base, "account:malformed suffix": { arbitrary: [null, false, { kept: 1 }] } }, expected: "blocked-source" },
    { name: "unknown-body-field", records: { ...base, [`account:${B}`]: { ...body(), future: { kept: [true] } } }, expected: "blocked-source" },
    { name: "unsupported-identity", records: { ...base, "account:AAAAAAAAAAAAAAAAAAAAAAAA": body() }, expected: "blocked-source" },
    { name: "invalid-index", records: { ...base, savedAccountKeys: { retained: [null, 1] } }, expected: "blocked-source" },
    { name: "unvalidated-review-context", records: { ...base, toastEnabled: "invalid" }, expected: "blocked-source" },
    { name: "reserved-original-row", records: { ...base, unclaimed: { from: "1.4.5", autoAdd: [], shortcutPlaylist: "PL_TARGET", originalShortcutId: "conv01", filters: {}, at: 1 } }, expected: "blocked-source" },
    { name: "deleted-original-equal-replacement", records: { ...base, unclaimed: { from: "1.4.5", autoAdd: [], shortcutPlaylist: "PL_TARGET", originalShortcutId: "orig01", filters: {}, at: 1 }, "doc:settings": { ...stamp, data: { shortcuts: { list: [{ id: "equal1", label: "", key: null, watchLaterOnEveryAccount: false }] } } } }, expected: "blocked-source" }
  ]
  for (const path of ["doc:settings", `doc:setup:${A}`, `doc:filter:${A}:PL_KEPT`]) {
    for (const kind of ["live", "tombstone", "invalid", "newer"]) {
      const data: JsonObject = path.startsWith("doc:filter:") ? { mode: "deny", on: true, channels: [] } : {}
      fixtures.push({ name: `${path}-${kind}`, records: { ...base, [path]: kind === "tombstone" ? { ...stamp, deleted: true } : { ...stamp, v: kind === "newer" ? 2 : 1, data: kind === "invalid" ? "invalid" : data } }, expected: "blocked-source" })
    }
  }
  fixtures.push({ name: "occupied-cache", records: { ...base, [`cache:${A}`]: { future: [false] } }, expected: "blocked-source" })
  let validSaved: JsonObject | undefined
  for (const fixture of fixtures) {
    const h = createInterimHarness(fixture.records), owner = api.create(h.deps)
    const result = await held(owner)
    check(result.kind === "retained-but-held", "complete retention confirmed")
    check(result.observation.kind === "resolved", "new checkpoint has confirmed resolved write")
    equal(h.writes.length, 1, "one retention write")
    equal(Object.keys(h.writes[0] ?? {}), ["interimConversion"], "checkpoint-only write")
    const saved = h.records(), checkpoint = saved.interimConversion
    check(object(checkpoint), "durable checkpoint object")
    equal(checkpoint.source, interimSnapshot(fixture.records).source, "complete source retention including unindexed evidence")
    equal(checkpoint.canonical, interimSnapshot(fixture.records).canonical, "complete canonical comparison retention")
    equal(Object.fromEntries(Object.entries(saved).filter(([key]) => key !== "interimConversion")), fixture.records, "all original bytes remain")
    const note = await owner.readInterimNote()
    equal(note.kind, fixture.expected, "actual owner note matches conversion outcome")
    check(Object.isFrozen(note) && (note.kind === "inactive-proposal" || note.kind === "blocked-source") && Object.isFrozen(note.checkpoint.source), "detached deeply frozen held read")
    check(api.read(checkpoint).kind === "valid", "actual checkpoint decoder validates complete outcome")
    if (fixture.name === "ordered-unindexed-index-only-cache-only-empty") {
      check(note.kind === "inactive-proposal", "valid account proposal")
      equal(note.note.percentage, { kind: "saved", value: 82 }, "saved required percentage")
      equal(note.note.feedback, { kind: "saved", value: false }, "saved Show feedback")
      const plan = result.checkpoint.outcome
      check(plan.kind === "inactive-proposal", "saved full proposal")
      const settings = plan.documents.find(candidate => candidate.kind === "settings")
      check(settings?.kind === "settings", "proposed shared Settings")
      equal(settings.document.data.shortcuts.list.map(row => row.id), ["conv01"], "deliberate shared row")
      const setup = plan.documents.find(candidate => candidate.path === `doc:setup:${A}`)
      check(setup?.kind === "setup", "proposed account Setup")
      equal(setup.document.data.autoAdd.map(row => row.pl), ["PL_SECOND", "PL_FIRST"], "ordered playlist choices")
      equal(setup.document.data.targets, { conv01: "WL" }, "account target depends on deliberate row")
      check(plan.documents.some(candidate => candidate.path === `doc:setup:${B}`) && !plan.documents.some(candidate => [C, D, E].some(acct => candidate.path === `doc:setup:${acct}`)), "unindexed choices count and empty/index/cache-only do not invent setups")
      const off = plan.documents.find(candidate => candidate.path === `doc:filter:${A}:PL_KEPT`)
      check(off?.kind === "filter" && off.document.data.on === false && off.document.data.channels[0]?.[1] === "Synthetic channel", "disabled kept filter and label survive")
      const orphan = plan.documents.find(candidate => candidate.path === `doc:filter:${A}:PL_ORPHAN`)
      check(orphan?.kind === "filter" && orphan.document.data.mode === "allow", "orphan filter survives")
      for (const candidate of plan.documents) {
        const decoded = candidate.kind === "settings" ? decodeDocument(candidate.document, decodeSettings) : candidate.kind === "setup" ? decodeDocument(candidate.document, decodeSetup) : decodeDocument(candidate.document, decodeFilter)
        equal(decoded.kind, "value", "actual canonical candidate decoder")
      }
      validSaved = copy(saved)
    }
    if (fixture.name === "fallbacks") { check(note.kind === "inactive-proposal", "fallback proposal"); equal(note.note.percentage, { kind: "interim-fallback", value: 50 }, "interim percentage fallback"); equal(note.note.feedback, { kind: "interim-fallback", value: true }, "interim feedback fallback") }
    if (fixture.name === "explicit-global-recovery") { check(note.kind === "inactive-proposal", "global proposal"); equal(note.note.globals.kind, "explicit-review-required", "legacyClaimed globals remain recoverable") }
    if (note.kind === "blocked-source") { equal(note.checkpoint.outcome.kind, "blocked", "whole proposal blocked"); check(!("note" in note.checkpoint.outcome) && !("documents" in note.checkpoint.outcome), "blocked capture invents no percentage or partial candidates") }
    await closed(owner, h)
    const stablePromise = owner.ready(); try { await stablePromise } catch {} check(stablePromise === owner.ready(), "queue recovery cannot release readiness")
    await owner.dispose()
    equal(await owner.readInterimNote(), { kind: "unavailable", reason: "disposed" }, "disposed note unavailable")
    const serialized = JSON.stringify(h.records()), restarted = createInterimHarness(JSON.parse(serialized))
    const fresh = api.create({ ...restarted.deps, startup: { ...restarted.deps.startup, context: { ...restarted.deps.startup.context, settingsGen: "wrong-new-context", shortcutId: "other1", at: 999 } } }), restart = await held(fresh)
    check(restart.kind === "retained-but-held" && restart.observation.kind === "existing", "fresh owner reuses saved outcome")
    equal(restarted.writes, [], "restart allocates and writes nothing")
    equal(await fresh.readInterimNote(), note, "fresh owner note equals entire saved outcome")
    equal(restarted.records(), saved, "fresh owner preserves complete serialized backing store")
    await closed(fresh, restarted); await fresh.dispose()
    observations.push({ name: fixture.name, result, note, first: { records: saved, effects: h.effects }, restart: { result: restart, records: restarted.records(), effects: restarted.effects } })
  }
  check(validSaved, "retained reference from actual owner")
  for (const defect of ["missing-source", "changed-source", "changed-canonical", "missing-markers", "malformed", "newer", "partial", "forged-context", "forged-facts", "blockers-only", "undefined-present"] as const) {
    const state = copy(validSaved), checkpoint = state.interimConversion
    check(object(checkpoint), "reference checkpoint")
    if (defect === "missing-source") delete state[`account:${B}`]
    if (defect === "changed-source") state.savedAccountKeys = []
    if (defect === "changed-canonical") state[`doc:setup:${A}`] = { ...stamp, deleted: true }
    if (defect === "missing-markers") for (const key of Object.keys(state).filter(key => key.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(key))) delete state[key]
    if (defect === "malformed") state.interimConversion = [null]
    if (defect === "newer") state.interimConversion = { v: 2, payload: { retained: [true] } }
    if (defect === "partial") delete checkpoint.source
    if (defect === "forged-context" && object(checkpoint.context)) checkpoint.context.interimShortcutId = "other1"
    if (defect === "forged-facts" && object(checkpoint.outcome)) checkpoint.outcome.reviewFacts = { invented: true }
    if (defect === "blockers-only") checkpoint.outcome = { kind: "blocked", blockers: [] }
    if (defect === "undefined-present") { delete state.interimConversion }
    const h = createInterimHarness(state)
    if (defect === "undefined-present") h.deps.startup.readInterimSnapshot = async () => ({ ...interimSnapshot(state), checkpoint: { kind: "present", value: undefined } })
    const owner = api.create(h.deps), result = await held(owner)
    check(result.kind !== "retained-but-held", "stale or incompatible checkpoint remains held")
    equal(h.writes, [], "protected checkpoint never overwritten")
    await closed(owner, h); equal(h.records(), state, "stale evidence and originals unchanged"); await owner.dispose()
    observations.push({ name: defect, result, records: h.records(), effects: h.effects })
  }
  for (const mode of ["normal", "rejected-unchanged", "rejected-applied", "resolved-partial", "resolved-missing", "rejected-divergent"] as const) {
    const h = createInterimHarness(base, mode), owner = api.create(h.deps), result = await held(owner)
    const expected = mode === "normal" || mode === "rejected-applied" ? "retained-but-held" : mode === "rejected-unchanged" ? "failed" : "unconfirmed"
    equal(result.kind, expected, "complete readback classifies retention IO")
    if ("observation" in result && result.observation.kind === "rejected") check(result.observation.error === h.error, "original write rejection identity retained")
    equal(h.writes.length, 1, "never retry a rejected or partial set")
    await closed(owner, h); await closed(owner, h); await owner.dispose()
    observations.push({ name: mode, result, records: h.records(), effects: h.effects })
  }
  for (const fault of ["preflight-source", "preflight-canonical", "preflight-checkpoint", "preflight-read", "readback-failure", "readback-source", "readback-canonical"] as const) {
    const h = createInterimHarness(base)
    h.snapshot(async (n, records) => {
      if (fault === "preflight-read" && n === 2 || fault === "readback-failure" && n === 3) throw h.readError
      if (n === 2 && fault === "preflight-source" || n === 3 && fault === "readback-source") records.savedAccountKeys = []
      if (n === 2 && fault === "preflight-canonical" || n === 3 && fault === "readback-canonical") records[`doc:setup:${A}`] = { ...stamp, deleted: true }
      if (n === 2 && fault === "preflight-checkpoint") records.interimConversion = { v: 9 }
    })
    const owner = api.create(h.deps), result = await held(owner)
    equal(result.kind, fault.startsWith("readback-") ? "unconfirmed" : fault === "preflight-read" ? "failed" : "stale", "preflight and readback freshness")
    equal(h.writes.length, fault.startsWith("readback-") ? 1 : 0, "stale preflight writes nothing")
    if (result.kind === "failed" && result.stage !== "set") check(result.error === h.readError, "original preflight read rejection")
    if (result.kind === "unconfirmed" && result.cause.kind === "read-failed") check(result.cause.error === h.readError, "original readback rejection")
    await closed(owner, h); await owner.dispose(); observations.push({ name: fault, result, records: h.records(), effects: h.effects })
  }
  for (const step of [1, 2, 3, "set", "note"] as const) {
    const h = createInterimHarness(base)
    let enter = () => {}, release = () => {}
    const entered = new Promise<void>(resolve => { enter = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    h.snapshot(async n => { if (n === step || step === "note" && n === 4) { enter(); await gate } })
    if (step === "set") h.set(async () => { enter(); await gate })
    const owner = api.create(h.deps)
    if (step === "note") await held(owner)
    const pending = step === "note" ? owner.readInterimNote() : owner.ready()
    await entered
    let drained = false
    const drain = owner.dispose().then(() => { drained = true })
    await Promise.resolve(); equal(drained, false, "disposal drains accepted IO")
    release()
    let result: unknown; try { result = await pending } catch (error) { result = error instanceof api.Error ? error.result : error }
    await drain
    check(step === "note" ? object(result) && result.kind === "unavailable" : object(result) && result.kind === "disposed", "disposal prevents publication")
    equal(h.writes.length, step === 1 || step === 2 ? 0 : 1, "disposal before set writes nothing and accepted set drains")
    observations.push({ name: `dispose-${step}`, result, records: h.records(), effects: h.effects })
  }
  for (const stage of ["during-note-source", "during-note-canonical", "during-note-checkpoint"]) {
    const h = createInterimHarness(base), owner = api.create(h.deps); await held(owner)
    h.snapshot(async (n, records) => { if (n === 5) {
      if (stage.endsWith("source")) delete records[`account:${B}`]
      else if (stage.endsWith("canonical")) records[`doc:setup:${A}`] = { ...stamp, deleted: true }
      else records.interimConversion = { v: 99 }
    } })
    const note = await owner.readInterimNote(); check(note.kind === "held", "reader rechecks freshness after awaited reads")
    await closed(owner, h); await owner.dispose(); observations.push({ name: stage, note, records: h.records(), effects: h.effects })
  }
  {
    const h = createInterimHarness({ ...base, schema: 2, interimConversion: { v: 99 } }), owner = api.create(h.deps)
    equal(await owner.ready(), "newer-layout", "global newer schema takes priority"); equal(h.writes, [], "newer schema stays inert"); await owner.dispose()
    observations.push({ name: "global-newer", records: h.records(), effects: h.effects })
  }
  const agreementObservations: unknown[] = []
  let interruptedBeforeDevice: JsonObject | undefined
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const privateUi = { ...ui, incognito: true }, access = { www: false, music: false, browserMenu: false }
  const agreementFixtures: { name: string; records: JsonObject }[] = [
    { name: "empty-marker", records: { schema: 1, sessionConsent: 1 } },
    { name: "proposal-with-existing-current-consent", records: base },
    { name: "supported-collision", records: { ...base, "doc:settings": { ...stamp, data: {} } } },
    { name: "lossless-malformed-source", records: { schema: 1, sessionConsent: 1, "account:malformed": { preserved: [null, false] } } }
  ]
  for (const fixture of agreementFixtures) {
    const h = createInterimHarness(fixture.records), owner = api.create({ ...h.deps, now() { h.effects.push({ stamp: 200 }); return 200 } })
    await held(owner)
    const v1 = h.records(), capture = v1.interimConversion
    check(object(capture) && capture.v === 1, "agreement starts from actual v1 retention")
    const review = await owner.readAgreement(privateUi)
    check(review.kind === "review" && review.presentation.kind === "retained" && review.presentation.agreement === "required", "actual held disclosure requires fresh agreement")
    const writes = h.writes.length, effects = h.effects.length
    h.effects.push("initiating-explicit-retained-Agree")
    const observation = Promise.resolve(access)
    const input = { review: review.review, displayedVersion: review.version, choice: { kind: "retained-disclosure" } as const, access: observation }
    const result = await owner.agree(privateUi, input)
    check(result.kind === "committed" && result.consent.at === 200 && result.activation === "held" && result.settingsChanged === false && result.applications.length === 0, "retained consent-only agreement confirmed")
    equal(h.writes.slice(writes).map(batch => Object.keys(batch)), [["interimConversion"], ["device"], ["interimConversion"]], "retained exact accepted Device confirmed order")
    const saved = h.records(), receipt = readRetainedCheckpoint(saved.interimConversion)
    check(receipt.kind === "agreement" && receipt.checkpoint.agreement.kind === "confirmed", "actual receipt validates")
    equal(receipt.checkpoint.retained, capture, "agreement preserves immutable original v1")
    equal(Object.fromEntries(Object.entries(saved).filter(([key]) => !["device", "interimConversion"].includes(key))), Object.fromEntries(Object.entries(v1).filter(([key]) => !["device", "interimConversion"].includes(key))), "agreement preserves all other source canonical history progress")
    const duplicate = await owner.agree(privateUi, input)
    check(duplicate.kind === "unchanged" && duplicate.consent.at === 200, "retained duplicate original time")
    await closed(owner, h)
    const readiness = await held(owner)
    await owner.dispose()
    const serialized = JSON.stringify(saved)
    const fresh = createInterimHarness(JSON.parse(serialized)), restarted = api.create({ ...fresh.deps, now() { throw Error("Retained restart cannot allocate time") }, generation() { throw Error("Retained restart cannot allocate generation") }, startup: { ...fresh.deps.startup, context: { ...fresh.deps.startup.context, deviceId: "different-restart-context", at: 999, shortcutId: "fresh1" } } })
    await held(restarted)
    const restartedReview = await restarted.readAgreement(ui), note = await restarted.readInterimNote()
    check(restartedReview.kind === "review" && restartedReview.presentation.kind === "retained" && restartedReview.presentation.agreement === "confirmed", "fresh owner reads confirmed agreement")
    check((note.kind === "inactive-proposal" || note.kind === "blocked-source") && note.agreement === "confirmed", "conversion note distinguishes current agreement")
    const resumed = await restarted.resumeRetainedAgreement(ui)
    check(resumed.kind === "unchanged" && resumed.consent.at === 200, "confirmed explicit resume has no restamp")
    equal(fresh.writes, [], "confirmed restart performs no writes")
    await closed(restarted, fresh); await restarted.dispose()
    check(!h.effects.slice(effects).some(effect => typeof effect === "string" && ["sync-get", "sync-set", "sync-subscribe", "timer", "generation"].includes(effect)), "retained disclosure has no sync allocation or activation")
    agreementObservations.push({ name: fixture.name, input: fixture.records, v1, disclosure: review.presentation, result, duplicate, readiness, saved, serialized, writes: h.writes, effects: h.effects, restartedReview, note, resumed, restartWrites: fresh.writes, restartEffects: fresh.effects })
  }
  for (const stage of ["accept", "device", "record"] as const) for (const mode of ["rejected-unchanged", "rejected-applied", "resolved-missing", "rejected-divergent", "resolved-partial", "read-failed", "rejected-read-failed", "disposed"] as const) {
    const h = createInterimHarness({ schema: 1, sessionConsent: 1 }), owner = api.create(h.deps); await held(owner)
    const review = await owner.readAgreement(ui); check(review.kind === "review", "interrupted agreement review")
    const target = { accept: 2, device: 3, record: 4 }[stage]
    h.set(async () => {
      if (h.writes.length !== target) { h.mode("normal"); return }
      if (mode === "disposed") { void owner.dispose(); return }
      h.mode(mode === "read-failed" ? "normal" : mode === "rejected-read-failed" ? "rejected-applied" : mode)
    })
    if (mode === "read-failed" || mode === "rejected-read-failed") h.snapshot(async () => { if (h.writes.length === target) throw h.readError })
    const result = await owner.agree(ui, { review: review.review, displayedVersion: review.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
    const expected = mode === "rejected-applied" ? "committed" : mode === "rejected-unchanged" ? "failed" : "unconfirmed"
    check(result.kind === expected, "retained exact stage classification " + stage + mode)
    if (mode === "rejected-unchanged") check(result.kind === "failed" && result.stage === stage && result.write.error === h.error, "retained stage rejected error identity")
    if (mode === "rejected-applied") check(result.kind === "committed" && result.mutations.some(mutation => mutation.stage === stage && mutation.write.kind === "rejected" && mutation.write.error === h.error), "retained applied error identity")
    if (mode === "read-failed" || mode === "rejected-read-failed") check(result.kind === "unconfirmed" && result.cause.kind === "read-failed" && result.cause.error === h.readError, "retained readback error identity")
    if (mode === "rejected-read-failed") check(result.kind === "unconfirmed" && result.write.kind === "rejected" && result.write.error === h.error, "retained independent write and read errors")
    const writes = h.writes.length, saved = h.records()
    if (stage === "device" && mode === "rejected-unchanged") interruptedBeforeDevice = copy(saved)
    if (expected === "unconfirmed" && mode !== "disposed") {
      const barrier = await owner.readAgreement(ui)
      check(barrier.kind === "unavailable" && barrier.reason === "stale", "retained uncertainty closes held reads")
      check((await owner.readInterimNote()).kind === "unavailable", "retained uncertainty closes held note")
      await closed(owner, h)
    }
    await owner.dispose(); equal(h.writes.length, writes, "no automatic retained retry")
    const serialized = JSON.stringify(saved), fresh = createInterimHarness(JSON.parse(serialized)), restarted = api.create({ ...fresh.deps, now() { throw Error("Resume cannot restamp") }, generation() { throw Error("Resume cannot allocate") } })
    await held(restarted)
    const pending = await restarted.readAgreement(ui)
    let resume: unknown
    if (pending.kind === "pending") {
      resume = await restarted.resumeRetainedAgreement(privateUi)
      check(object(resume) && resume.kind === "committed" && object(resume.consent) && resume.consent.at === 100 && resume.activation === "held", "fresh explicit resume uses original fixed time")
      check(readRetainedCheckpoint(fresh.records().interimConversion).kind === "agreement", "resumed receipt remains valid")
      await held(restarted)
    } else {
      resume = await restarted.resumeRetainedAgreement(ui)
      if (mode === "rejected-applied") check(object(resume) && resume.kind === "unchanged", "confirmed restart duplicate")
      else if (stage === "accept" && mode === "rejected-unchanged") check(object(resume) && resume.kind === "unavailable", "unaccepted choice cannot resume")
      else check(fresh.writes.length === 0, "invalid or divergent restart stays held")
    }
    await restarted.dispose()
    agreementObservations.push({ name: `${stage}-${mode}`, result, saved, serialized, writes: h.writes, effects: h.effects, pending, resume, restartWrites: fresh.writes, restartRecords: fresh.records(), restartEffects: fresh.effects })
  }
  check(interruptedBeforeDevice, "actual accepted interruption captured")
  for (const fault of ["third-device", "source-loss", "tombstone", "foreign-cache", "v2-root-extension"] as const) {
    const initial = copy(interruptedBeforeDevice)
    if (fault === "third-device") initial.device = { id: "synthetic-device", consent: { v: 1, at: 100 }, syncOn: false, foreign: true }
    if (fault === "source-loss") delete initial.sessionConsent
    if (fault === "tombstone") initial["doc:settings"] = { v: 1, gen: "foreign", at: 1, by: "foreign", deleted: true }
    if (fault === "foreign-cache") initial["cache:AAAAAAAAAAAAAAAA"] = { foreign: [null] }
    if (fault === "v2-root-extension" && object(initial.interimConversion)) initial.interimConversion.extension = { keep: [null, false] }
    const h = createInterimHarness(initial), owner = api.create(h.deps); await held(owner)
    equal(h.writes, [], "accepted restart does not write")
    const read = await owner.readAgreement(ui), resumed = await owner.resumeRetainedAgreement(ui)
    if (fault === "v2-root-extension") {
      check(read.kind === "pending" && resumed.kind === "committed", "extended accepted state explicitly resumes")
      const current = h.records().interimConversion
      check(object(current) && object(current.extension) && Array.isArray(current.extension.keep), "v2 compatible root extension survives confirmation")
    } else { check(read.kind !== "review" && read.kind !== "pending" && resumed.kind !== "committed", "third accepted state stays held"); equal(h.writes, [], "third accepted state no resume effect") }
    await owner.dispose(); agreementObservations.push({ name: `accepted-restart-${fault}`, initial, read, resumed, records: h.records(), writes: h.writes, effects: h.effects })
  }
  for (const fault of ["third-device", "source-loss", "tombstone-added", "nested-rebase", "newer-checkpoint", "copied-review", "old-current-consent", "pending-removal"] as const) {
    const h = createInterimHarness({ schema: 1, sessionConsent: 1 }), owner = api.create(h.deps); await held(owner)
    const review = await owner.readAgreement(ui); check(review.kind === "review", "retained drift review")
    if (fault === "third-device") h.foreign(raw => { raw.device = { id: "foreign", consent: null, syncOn: false } })
    if (fault === "source-loss") h.foreign(raw => { delete raw.sessionConsent })
    if (fault === "tombstone-added") h.foreign(raw => { raw["doc:settings"] = { v: 1, gen: "foreign", at: 1, by: "foreign", deleted: true } })
    if (fault === "nested-rebase") h.foreign(raw => { if (object(raw.interimConversion) && object(raw.interimConversion.canonical)) raw.interimConversion.canonical.device = { id: "foreign", consent: null, syncOn: false } })
    if (fault === "newer-checkpoint") h.foreign(raw => { raw.interimConversion = { v: 3, opaque: true } })
    if (fault === "old-current-consent") h.foreign(raw => { raw.device = { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false } })
    if (fault === "pending-removal") h.foreign(raw => { raw["pending:account-removal"] = { v: 99 } })
    const before = h.records(), writes = h.writes.length
    const result = await owner.agree(ui, { review: fault === "copied-review" ? { ...review.review } : review.review, displayedVersion: review.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
    check(result.kind !== "committed", "retained drift refuses")
    equal(h.records(), before, "retained drift preserves full raw inventory"); equal(h.writes.length, writes, "retained drift zero new writes")
    await owner.dispose(); agreementObservations.push({ name: fault, result, saved: h.records(), writes: h.writes, effects: h.effects })
  }

  {
    const h = createInterimHarness({ schema: 1, sessionConsent: 1 })
    let known = false
    const owner = api.create({ ...h.deps, startup: { ...h.deps.startup,
      async readInterimSnapshot() {
        const current = await h.deps.startup.readInterimSnapshot()
        return { ...current, historicalAuthorization: known ? { kind: "known", value: false } as const : { kind: "unknown" } as const }
      }
    } })
    await held(owner)
    const shown = await owner.readAgreement(ui); check(shown.kind === "review", "history observation review")
    const writes = h.writes.length
    known = true; check((await owner.readInterimNote()).kind === "held", "changed history observation held")
    known = false; check((await owner.readInterimNote()).kind === "inactive-proposal", "restored history remains immutable original")
    const result = await owner.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
    check(result.kind === "unavailable" && result.reason === "stale" && h.writes.length === writes, "observed historical A-B-A invalidates retained review")
    await owner.dispose(); agreementObservations.push({ name: "historical-observed-A-B-A", result, writes: h.writes, effects: h.effects, records: h.records() })
  }
  const installationObservations: unknown[] = []
  function offFixture(): JsonObject {
    const raw = interimFixture()
    check(object(raw.device) && object(raw.sync), "off fixture dependencies")
    raw.device.syncOn = false; raw.sync.status = "off"; raw.legacyClaimed = true
    return raw
  }
  async function agreedHarness(initial: JsonObject) {
    const h = createInterimHarness(initial), owner = api.create({ ...h.deps, now() { h.effects.push({ stamp: 200 }); return 200 } })
    await held(owner)
    const original = h.records().interimConversion
    equal(await owner.readInterimInstallation(ui), { kind: "unavailable", reason: "agreement-required" }, "v1 is not installation authority")
    const disclosure = await owner.readAgreement(ui)
    check(disclosure.kind === "review", "installation executes actual disclosure")
    const agreement = await owner.agree(ui, { review: disclosure.review, displayedVersion: disclosure.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
    check(agreement.kind === "committed", "installation executes actual confirmed Agree")
    const read = readRetainedCheckpoint(h.records().interimConversion)
    check(read.kind === "agreement" && read.checkpoint.agreement.kind === "confirmed", "actual confirmed v2 prerequisite")
    equal(read.checkpoint.retained, original, "actual v2 retains complete original v1")
    return { h, owner, original, agreed: h.records() }
  }
  async function installedRestart(saved: JsonObject, expected: "pending-installation" | "installed-interim") {
    const serialized = JSON.stringify(saved), h = createInterimHarness(JSON.parse(serialized))
    const owner = api.create({ ...h.deps, now() { throw Error("Restart must not allocate time") }, generation() { throw Error("Restart must not allocate generation") },
      startup: { ...h.deps.startup, context: { ...h.deps.startup.context, at: 999, settingsGen: "unused-restart", shortcutId: "other1" } } })
    const result = await held(owner)
    equal(result.kind, expected, "fresh startup exposes exact installation stage")
    equal(h.writes, [], "installation startup never replays")
    equal(h.records(), saved, "complete installation restart bytes preserved")
    const note = await owner.readInterimNote(), status = await owner.readInterimInstallation(ui), agreement = await owner.readAgreement(ui)
    equal(note.kind, expected, "installation note exposes truthful held stage")
    equal(status.kind, expected === "installed-interim" ? "installed" : "pending", "dedicated held installation reader")
    if (expected === "installed-interim") {
      check(agreement.kind === "review" && agreement.presentation.kind === "retained" && agreement.presentation.agreement === "confirmed", "installed restart retains actual agreement")
      const duplicate = await owner.agree(ui, { review: agreement.review, displayedVersion: agreement.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
      equal(duplicate, { kind: "unchanged", reason: "already-agreed", consent: { v: 1, at: 200 }, activation: "held" }, "actual installed restart Agree allocates nothing")
      equal(await owner.resumeRetainedAgreement(ui), { kind: "unchanged", reason: "already-agreed", consent: { v: 1, at: 200 }, activation: "held" }, "installed agreement resume never rewrites v3")
    } else check(agreement.kind === "unavailable", "pending installation cannot issue another agreement capability")
    await closed(owner, h)
    equal(h.writes, [], "held installed readers have zero writes")
    return { h, owner, result, note, status, agreement }
  }
  let acceptedStore: JsonObject | undefined, appliedStore: JsonObject | undefined, installedStore: JsonObject | undefined
  for (const fixture of [{ name: "rich-off-history", records: offFixture() }, { name: "empty-absent-schema-history", records: { sessionConsent: 1 } },
    { name: "globals-only", records: { schema: 1, sessionConsent: 1, playlists: ["PL_GLOBAL", "PL_GLOBAL"], legacyClaimed: true } }] satisfies { name: string; records: JsonObject }[]) {
    const { h, owner, original, agreed } = await agreedHarness(fixture.records)
    const shown = await owner.readInterimInstallation(ui)
    check(shown.kind === "review" && shown.activation === "held", "explicit complete installation review")
    check(Object.isFrozen(shown) && Object.isFrozen(shown.documents) && Object.isFrozen(shown.note), "installation presentation is immutable")
    const receipt = readRetainedCheckpoint(agreed.interimConversion)
    check(receipt.kind === "agreement" && receipt.checkpoint.retained.outcome.kind === "inactive-proposal", "whole saved proposal eligible")
    const proposal = receipt.checkpoint.retained.outcome
    equal(shown.documents, proposal.documents.map(x => ({ kind: x.kind, path: x.path })), "review contains every original document in order")
    equal(shown.caches, proposal.caches.map(x => x.path), "review contains every original cache in order")
    equal(shown.consent, { v: 1, at: 200 }, "review shows actual agreement time")
    const batch: JsonObject = Object.fromEntries([...proposal.documents.map(x => [x.path, x.document]), ...proposal.caches.map(x => [x.path, x.data])])
    if (!Object.hasOwn(fixture.records, "schema")) batch.schema = 1
    const states: JsonObject[] = []
    h.write(async (items, apply) => { apply(items); states.push(h.records()) })
    const writes = h.writes.length, effects = h.effects.length
    const installed = await owner.installInterimConversion(ui, shown.review)
    check(installed.kind === "committed" && installed.activation === "held", "actual owner installs complete saved proposal")
    const batches = h.writes.slice(writes)
    equal(batches.map(x => Object.keys(x)), Object.keys(batch).length ? [["interimConversion"], Object.keys(batch), ["interimConversion"]] : [["interimConversion"], ["interimConversion"]], "actual accept complete batch confirm order")
    equal(batches.find(x => !Object.hasOwn(x, "interimConversion")) ?? {}, batch, "installation uses exact original envelopes and caches")
    const final = h.records(), read = readRetainedCheckpoint(final.interimConversion)
    check(read.kind === "installation" && read.checkpoint.installation.kind === "installed", "real installed v3 decoder")
    equal(read.checkpoint.agreed, agreed.interimConversion, "entire actual v2 remains immutable under v3")
    equal(read.checkpoint.agreed.retained, original, "original v1 never rebased onto installation")
    equal(final, { ...agreed, ...batch, interimConversion: final.interimConversion }, "complete installed inventory has no additional effects")
    equal(read.checkpoint.installation.history, Object.hasOwn(agreed, "sync") ? { kind: "present", raw: agreed.sync } : { kind: "absent" }, "raw history presence and bytes unchanged")
    equal(await owner.installInterimConversion(ui, shown.review), { kind: "unchanged", reason: "already-installed", activation: "held" }, "exact terminal token duplicate unchanged")
    equal(h.writes.length, writes + batches.length, "duplicate install never replays")
    const agreement = await owner.readAgreement(ui)
    check(agreement.kind === "review", "installed owner still discloses confirmed agreement")
    const again = await owner.agree(ui, { review: agreement.review, displayedVersion: agreement.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve(access) })
    check(again.kind === "unchanged" && again.consent.at === 200, "actual Agree after install keeps original time")
    const note = await owner.readInterimNote()
    equal(note.kind, "installed-interim", "successful installation note remains held")
    await closed(owner, h); await owner.dispose()
    const restarted = await installedRestart(final, "installed-interim")
    equal(await restarted.owner.resumeInterimInstallation(ui), { kind: "unchanged", reason: "already-installed", activation: "held" }, "installed resume has zero replay")
    await restarted.owner.dispose()
    check(!h.effects.slice(effects).some(x => ["generation", "stamp", "sync-get", "sync-set", "sync-subscribe", "mono", "wall", "timer"].includes(String(x))), "installation allocates and transmits nothing")
    installationObservations.push({ name: fixture.name, input: fixture.records, original, agreed, shown, batch, installed, states, final, restarted: { result: restarted.result, note: restarted.note, status: restarted.status, agreement: restarted.agreement, records: restarted.h.records(), writes: restarted.h.writes, effects: restarted.h.effects }, writes: h.writes, effects: h.effects })
    if (fixture.name === "rich-off-history") { acceptedStore = states[0]; appliedStore = states[1]; installedStore = final; equal(proposal.documents.length, 5, "rich original five documents"); equal(proposal.caches.length, 1, "rich original one cache") }
  }
  check(acceptedStore && appliedStore && installedStore, "actual principal stage stores captured")
  for (const phase of ["original", "after", "subset"] as const) {
    const seed = phase === "after" ? copy(appliedStore) : copy(acceptedStore)
    if (phase === "subset") {
      const entry = Object.entries(appliedStore).find(([key]) => key.startsWith("doc:"))
      check(entry, "own-fixed subset path"); seed[entry[0]] = copy(entry[1])
    }
    const restarted = await installedRestart(seed, "pending-installation"), before = restarted.h.records()
    const result = await restarted.owner.resumeInterimInstallation(ui)
    check(result.kind === "committed", "explicit fresh-owner continuation completes fixed installation")
    equal(restarted.h.records(), installedStore, "resumed exact original full installed state")
    equal(result.mutations.map(x => x.stage), phase === "after" ? ["confirm"] : ["install", "confirm"], "explicit continuation skips only already exact batch")
    await restarted.owner.dispose()
    installationObservations.push({ name: `accepted-restart-${phase}`, before, result, records: restarted.h.records(), writes: restarted.h.writes, effects: restarted.h.effects })
  }
  for (const fault of ["document-third", "tombstone", "new-key", "source", "history", "history-absent", "device", "installed-deleted", "pending-removal", "pending-join", "host-history", "host-inventory"] as const) {
    const seed = copy(fault === "installed-deleted" ? installedStore : acceptedStore)
    if (fault === "document-third") seed["doc:settings"] = { third: true }
    if (fault === "tombstone") seed["doc:settings"] = { v: 1, gen: "foreign", at: 1, by: "foreign", deleted: true }
    if (fault === "new-key") seed["cache:FFFFFFFFFFFFFFFF"] = { third: true }
    if (fault === "source") delete seed.sessionConsent
    if (fault === "history" && object(seed.sync)) seed.sync.editedSinceOff = true
    if (fault === "history-absent") delete seed.sync
    if (fault === "device" && object(seed.device)) seed.device.syncOn = true
    if (fault === "installed-deleted") delete seed["doc:settings"]
    if (fault === "pending-removal") seed["pending:account-removal"] = { v: 99 }
    if (fault === "pending-join") seed["pending:sync-join"] = { v: 99 }
    const h = createInterimHarness(seed), owner = api.create({ ...h.deps, startup: { ...h.deps.startup, async readInterimSnapshot() {
      const current = await h.deps.startup.readInterimSnapshot()
      return fault === "host-history" ? { ...current, historicalAuthorization: { kind: "known", value: false } } : fault === "host-inventory" ? { ...current, canonical: {} } : current
    } } })
    await owner.ready().catch(() => {})
    const note = await owner.readInterimNote(), status = await owner.readInterimInstallation(ui), resumed = await owner.resumeInterimInstallation(ui)
    check(status.kind !== "review" && status.kind !== "installed" && resumed.kind !== "committed" && resumed.kind !== "unchanged", "third state and pending independent transactions stay held")
    equal(h.writes, [], "invalid continuation never writes or resumes removal"); equal(h.records(), seed, "invalid continuation preserves complete original store")
    await owner.dispose(); installationObservations.push({ name: `restart-refusal-${fault}`, seed, note, status, resumed, records: h.records(), writes: h.writes, effects: h.effects })
  }
  for (const fixture of [{ name: "saved-sync-on", records: interimFixture(), reason: "sync-writer-required" },
    ...["doc:settings", `doc:setup:${A}`, `cache:${A}`].map(path => ({ name: `collision-${path}`, records: { ...offFixture(), [path]: { v: 1, gen: "foreign", at: 1, by: "foreign", deleted: true } }, reason: "blocked-source" })),
    { name: "malformed-source", records: { ...offFixture(), "account:invalid": { keep: true } }, reason: "blocked-source" },
    ...Array.of<JsonObject>({ joined: null, pushed: {}, status: "waiting", editedSinceOff: false }, { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: false }, { malformed: true }).map((sync, index) => ({ name: `invalid-history-${index}`, records: { sessionConsent: 1, sync }, reason: "history" }))] satisfies { name: string; records: JsonObject; reason: string }[]) {
    const { h, owner } = await agreedHarness(fixture.records), before = h.records(), writes = h.writes.length
    equal(await owner.readInterimInstallation(ui), { kind: "unavailable", reason: fixture.reason }, "whole proposal and history refusal")
    const result = await owner.resumeInterimInstallation(ui)
    check(result.kind !== "committed", "refused review has no continuation")
    equal(h.records(), before, "refused install preserves complete inventory"); equal(h.writes.length, writes, "refused install writes nothing")
    await owner.dispose(); installationObservations.push({ name: fixture.name, result, records: h.records(), writes: h.writes, effects: h.effects })
  }
  for (const stage of ["accept", "install", "confirm"] as const) for (const fault of ["rejected-unchanged", "rejected-applied", "ignored", "partial", "divergent", "read-failed", "rejected-read-failed", "disposed-unchanged", "disposed-applied"] as const) {
    const { h, owner } = await agreedHarness(offFixture()), shown = await owner.readInterimInstallation(ui)
    check(shown.kind === "review", "stage fault starts from real installation review")
    const before = h.records(), writes = h.writes.length, states: JsonObject[] = []
    let attempt = 0, disposal: Promise<void> | undefined
    h.write(async (items, apply) => {
      const current = ["accept", "install", "confirm"][attempt++]
      if (current !== stage) { apply(items); states.push(h.records()); return }
      if (fault === "rejected-unchanged") throw h.error
      if (fault === "ignored") return
      if (fault === "disposed-unchanged") { disposal = owner.dispose(); return }
      if (fault === "partial" && stage === "install") apply(Object.fromEntries(Object.entries(items).slice(0, 2)))
      else if (fault === "partial") apply({ interimConversion: { v: 3, kind: "retained-interim" } })
      else apply(items)
      if (fault === "divergent") h.foreign(raw => { raw.unrelated = { divergent: true } })
      states.push(h.records())
      if (fault === "disposed-applied") disposal = owner.dispose()
      if (fault === "read-failed" || fault === "rejected-read-failed") h.get(async () => { throw h.readError })
      if (fault === "rejected-applied" || fault === "rejected-read-failed") throw h.error
    })
    const resultPromise = owner.installInterimConversion(ui, shown.review)
    const queued = owner.readInterimInstallation(ui), queuedNote = owner.readInterimNote(), queuedAgreement = owner.readAgreement(ui)
    const result = await resultPromise
    if (fault === "rejected-applied") {
      check(result.kind === "committed", "exact applied rejected stage completes")
      const observation = result.mutations.find(x => x.stage === stage)?.write
      check(observation?.kind === "rejected" && observation.error === h.error, "applied original rejection identity preserved")
    } else if (fault === "rejected-unchanged") {
      check(result.kind === "failed" && result.stage === stage && "write" in result && result.write.error === h.error, "unchanged rejected stage returns original error")
    } else {
      check(result.kind === "unconfirmed" && result.stage === stage, "uncertain attempted stage never publishes success")
      if (fault === "read-failed" || fault === "rejected-read-failed") check(result.cause.kind === "read-failed" && result.cause.error === h.readError, "readback error identity retained")
      if (fault === "rejected-read-failed") check(result.write.kind === "rejected" && result.write.error === h.error, "independent write and read errors retained")
      const closedStatus = await queued, closedNote = await queuedNote, closedAgreement = await queuedAgreement
      check(closedStatus.kind === "unavailable" && closedNote.kind === "unavailable" && closedAgreement.kind === "unavailable", "uncertainty closes queued held ingress before lane release")
    }
    await queued; await queuedNote; await queuedAgreement
    h.get(undefined); h.write(undefined); await disposal; await owner.dispose()
    if (fault !== "rejected-applied") equal(h.writes.length - writes, ["accept", "install", "confirm"].indexOf(stage) + 1, "no later stage on failed or uncertain write")
    const saved = h.records(), read = readRetainedCheckpoint(saved.interimConversion)
    if (read.kind === "installation" && read.checkpoint.installation.kind === "accepted" && !["divergent"].includes(fault)) {
      const fresh = createInterimHarness(JSON.parse(JSON.stringify(saved))), restarted = api.create(fresh.deps)
      const startup = await held(restarted)
      if (startup.kind === "pending-installation") {
        equal(fresh.writes, [], "interrupted startup stays effect free")
        const resumed = await restarted.resumeInterimInstallation(ui)
        check(resumed.kind === "committed", "each recognizable accepted interruption explicitly resumes")
        equal(fresh.records(), installedStore, "interrupted explicit continuation uses exact original fixed bytes")
      }
      await restarted.dispose()
    }
    installationObservations.push({ name: `${stage}-${fault}`, before, result, states, saved, writes: h.writes, effects: h.effects })
  }
  for (const fault of ["copied", "foreign-owner", "wrong-origin", "private", "invalid-origin", "inventory-A-B-A", "history-A-B-A", "host-history-A-B-A", "consumed", "disposed"] as const) {
    const { h, owner } = await agreedHarness(offFixture())
    let known = false
    const actualHost = h.deps.startup.readInterimSnapshot
    if (fault === "host-history-A-B-A") {
      await owner.dispose()
    }
    const active = fault === "host-history-A-B-A" ? api.create({ ...h.deps, startup: { ...h.deps.startup, async readInterimSnapshot() { const current = await actualHost(); return { ...current, historicalAuthorization: known ? { kind: "known", value: false } : { kind: "unknown" } } } } }) : owner
    if (active !== owner) await held(active)
    const shown = await active.readInterimInstallation(ui)
    check(shown.kind === "review", "capability control real review")
    const other = api.create(createInterimHarness(h.records()).deps)
    await held(other)
    const before = h.records(), writes = h.writes.length
    if (fault === "inventory-A-B-A") { h.foreign(raw => { raw.unrelated = { changed: true } }); await active.readAgreement(ui); h.foreign(raw => { raw.unrelated = copy(before.unrelated!) }); await active.readAgreement(ui) }
    if (fault === "history-A-B-A") { h.foreign(raw => { if (object(raw.sync)) raw.sync.future = true }); await active.readInterimNote(); h.foreign(raw => { if (object(raw.sync)) delete raw.sync.future }); await active.readInterimNote() }
    if (fault === "host-history-A-B-A") { known = true; await active.readInterimNote(); known = false; await active.readInterimNote() }
    if (fault === "consumed") { h.mode("rejected-unchanged"); const failed = await active.installInterimConversion(ui, shown.review); check(failed.kind === "failed", "acceptance attempted token consumed"); h.mode("normal") }
    if (fault === "disposed") await active.dispose()
    const result = await (fault === "foreign-owner" ? other : active).installInterimConversion(fault === "wrong-origin" ? { ...ui, windowId: 2 } : fault === "private" ? privateUi : fault === "invalid-origin" ? { ...ui, windowId: -1 } : ui, fault === "copied" ? { ...shown.review } : shown.review)
    check(result.kind !== "committed" && result.kind !== "unchanged", "private capability invalidation refuses")
    equal(h.records(), before, "invalid capability cannot change storage"); equal(h.writes.length, writes + (fault === "consumed" ? 1 : 0), "invalid capability cannot set")
    await active.dispose(); await other.dispose()
    installationObservations.push({ name: `capability-${fault}`, result, records: h.records(), writes: h.writes, effects: h.effects })
  }

  {
    const { h, owner } = await agreedHarness(offFixture())
    await owner.dispose()
    h.foreign(raw => {
      check(object(raw.interimConversion) && object(raw.interimConversion.retained), "actual extension prerequisite")
      raw.interimConversion.futureV2 = { keep: [null, false] }
      raw.interimConversion.retained.futureV1 = { keep: [true] }
      Object.defineProperty(raw.interimConversion, "__proto__", { value: { retained: true }, enumerable: true, configurable: true, writable: true })
      raw.interimConversion.toJSON = "inert"
    })
    const extendedV2 = h.records().interimConversion, active = api.create(h.deps)
    await held(active)
    const shown = await active.readInterimInstallation(ui)
    check(shown.kind === "review", "complete actual extended v2 review")
    h.write(async (items, apply) => {
      apply(items)
      if (object(items.interimConversion) && object(items.interimConversion.installation) && items.interimConversion.installation.kind === "accepted") throw h.error
    })
    const result = await active.installInterimConversion(ui, shown.review)
    check(result.kind === "committed", "root extensions install through real owner")
    const saved = h.records(), receipt = readRetainedCheckpoint(saved.interimConversion)
    check(receipt.kind === "installation", "extended actual installed receipt")
    equal(receipt.checkpoint.agreed, extendedV2, "full actual raw v2 including own __proto__ and inert toJSON preserved")
    await active.dispose()
    const accepted = copy(acceptedStore)
    check(object(accepted.interimConversion), "actual accepted receipt extension")
    accepted.interimConversion.futureV3 = { keep: [null, true] }
    accepted.interimConversion.toJSON = "inert"
    Object.defineProperty(accepted.interimConversion, "__proto__", { value: { keep: true }, enumerable: true, configurable: true, writable: true })
    const restarted = await installedRestart(accepted, "pending-installation")
    const resumed = await restarted.owner.resumeInterimInstallation(ui)
    check(resumed.kind === "committed", "actual extended accepted operation explicitly resumes")
    const final = restarted.h.records().interimConversion
    check(object(final), "actual extended terminal receipt")
    equal(final.futureV3, { keep: [null, true] }, "v3 compatible root extension retained through confirmation")
    equal(Object.getOwnPropertyDescriptor(final, "__proto__")?.value, { keep: true }, "v3 own __proto__ preserved")
    equal(final.toJSON, "inert", "v3 inert toJSON preserved")
    await restarted.owner.dispose()
    installationObservations.push({ name: "compatible-v1-v2-v3-root-extensions", extendedV2, result, saved, accepted, resumed, records: restarted.h.records(), writes: restarted.h.writes, effects: restarted.h.effects })
  }
  return { mode: "actual-owner-durable-synthetic-restart", assertions, observations, agreementObservations, installationObservations, production: "not-connected", native: "waived-and-unproven" }
}

if (import.meta.main) process.stdout.write(JSON.stringify(await (process.argv.includes("--withdrawal-v2-only") ? runWithdrawalRetainedAgreement() : runInterimConversion()), (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value, 2) + "\n")

export async function withdrawalRetainedAgreementFixture() {
  const initial: JsonObject = { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false, future: { keep: [null, false] } },
    sessionConsent: 1, unrelated: { keep: [null, false] }, sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false } }
  const session: JsonObject = { channelCache: { preserved: [null, true] } }, sync: JsonObject = { unrelated: { keep: [null, true] } }
  const h = createInterimHarness(initial), owner = createStartingLocalFilterWriter(h.deps)
  try { await owner.ready() } catch (error) { if (!(error instanceof StartupReadinessError) || error.result.kind !== "interim-held") throw error }
  const v1 = h.records(), ui = { kind: "ui", windowId: 1, incognito: false } as const, review = await owner.readAgreement(ui)
  if (review.kind !== "review") throw Error("Actual V1 disclosure unavailable")
  h.write(async (items, apply) => {
    const receipt = readRetainedCheckpoint(items.interimConversion)
    if (receipt.kind === "agreement" && receipt.checkpoint.agreement.kind === "confirmed") throw h.error
    apply(items)
  })
  const agreement = await owner.agree(ui, { review: review.review, displayedVersion: review.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (agreement.kind !== "failed" || agreement.stage !== "record") throw Error("Actual confirmed-receipt interruption missing")
  const accepted = { local: h.records(), session, sync }, parsed = readRetainedCheckpoint(accepted.local.interimConversion)
  if (parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "accepted") throw Error("Actual accepted V2 did not parse")
  const acceptance = { initial, v1, agreement, stores: copy(accepted), writes: copy(h.writes), effects: copy(h.effects), source: interimSnapshot(accepted.local) }
  await owner.dispose()
  const lifecycle = createLifecycleHarness({ local: accepted.local, session, database: "present" }), deps = lifecycle.deps(), port = deps.consentDevice
  if (!port) throw Error("Missing named consent port")
  const withdrawalWrites: { before: ReturnType<typeof lifecycle.stores>; items: unknown; after: ReturnType<typeof lifecycle.stores> }[] = []
  const supervisor = createStoreLifecycle({ ...deps, consentDevice: { get: keys => port.get(keys), async set(items) { const before = lifecycle.stores(); await port.set(items); withdrawalWrites.push({ before, items: copy(items), after: lifecycle.stores() }) } } })
  const read = readConsentDevice(accepted.local)
  if (read.kind !== "supported") throw Error("Actual accepted Device invalid")
  const withdrawn = await supervisor.withdrawConsent(settingsOrigin, read.device.consent)
  if (withdrawn.kind !== "withdrawn") throw Error("Actual withdrawal did not confirm")
  const withdrawnStores = { local: lifecycle.stores().local, session: lifecycle.stores().session, sync: copy(sync) }
  await supervisor.dispose()
  const fresh = createInterimHarness(withdrawnStores.local), held = createStartingLocalFilterWriter({ ...fresh.deps, now: () => 300 })
  try { await held.ready() } catch (error) { if (!(error instanceof StartupReadinessError) || error.result.kind !== "consent-held") throw error }
  const shown = await held.readAgreement(ui)
  if (shown.kind !== "review" || shown.presentation.kind !== "held") throw Error("Actual withdrawn disclosure unavailable")
  const agreed = await held.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "disclosure" }, access: new Promise(() => {}) })
  if (agreed.kind !== "committed" || agreed.consent.at !== 300 || fresh.writes.length !== 1 || !sameSyncJson(Object.keys(fresh.writes[0]!).sort(), ["consent:state", "device"])) throw Error("Actual held agreement continued work")
  const stores = { local: fresh.records(), session: copy(withdrawnStores.session), sync: copy(sync) }
  if (!sameSyncJson(stores.local.interimConversion!, accepted.local.interimConversion!)) throw Error("Held agreement changed historical V2")
  await held.dispose()
  return { acceptance, withdrawal: { result: withdrawn, writes: withdrawalWrites, stores: withdrawnStores, calls: lifecycle.calls, ledger: lifecycle.ledger }, agreement: { result: agreed, stores, writes: fresh.writes, effects: fresh.effects }, stores }
}

export async function withdrawalRetainedV1Fixture() {
  const initial: JsonObject = { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false, future: { keep: [null, false] } },
    sessionConsent: 1, unrelated: { keep: [null, false] }, sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false } }
  const session: JsonObject = { channelCache: { preserved: [null, true] } }, sync: JsonObject = { unrelated: { keep: [null, true] } }
  const h = observedWithdrawalHarness(initial), owner = createStartingLocalFilterWriter(h.deps)
  let readiness: unknown
  try { await owner.ready() } catch (error) { if (!(error instanceof StartupReadinessError) || error.result.kind !== "interim-held" || error.result.result.kind !== "retained-but-held") throw error; readiness = { error, result: error.result } }
  const retained = h.records()
  if (readRetainedInterim(retained.interimConversion).kind !== "valid" || h.writes.length !== 1 || Object.keys(h.writes[0]!).join() !== interimConversionKey) throw Error("Actual V1 retention missing")
  const retention = { initial: { local: initial, session, sync }, readiness, stores: { local: retained, session, sync }, writes: h.writes, effects: h.effects, reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources }
  await owner.dispose()
  const lifecycle = createLifecycleHarness({ local: retained, session, database: "present" }), deps = lifecycle.deps(), port = deps.consentDevice
  if (!port) throw Error("Missing named consent port")
  const writes: { before: ReturnType<typeof lifecycle.stores>; items: unknown; after: ReturnType<typeof lifecycle.stores> }[] = []
  const supervisor = createStoreLifecycle({ ...deps, consentDevice: { get: keys => port.get(keys), async set(items) { const before = lifecycle.stores(); await port.set(items); writes.push({ before, items: copy(items), after: lifecycle.stores() }) } } })
  const withdrawn = await supervisor.withdrawConsent(settingsOrigin, { v: 1, at: 1 })
  if (withdrawn.kind !== "withdrawn" || writes.length !== 2) throw Error("Actual V1 withdrawal missing")
  const withdrawnStores = { local: lifecycle.stores().local, session: lifecycle.stores().session, sync: copy(sync) }
  await supervisor.dispose()
  const fresh = observedWithdrawalHarness(withdrawnStores.local), held = createStartingLocalFilterWriter({ ...fresh.deps, now: () => 300 })
  try { await held.ready() } catch (error) { if (!(error instanceof StartupReadinessError) || error.result.kind !== "consent-held") throw error }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const, shown = await held.readAgreement(ui)
  if (shown.kind !== "review" || shown.presentation.kind !== "held") throw Error("Actual V1 withdrawn disclosure missing")
  const agreed = await held.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "disclosure" }, access: new Promise(() => {}) })
  if (agreed.kind !== "committed" || agreed.consent.at !== 300 || fresh.writes.length !== 1 || !sameSyncJson(Object.keys(fresh.writes[0]!).sort(), ["consent:state", "device"]) || !sameSyncJson(fresh.records().interimConversion!, retained.interimConversion!)) throw Error("V1 held agreement continued retained work")
  const stores = { local: fresh.records(), session: copy(withdrawnStores.session), sync: copy(sync) }
  await held.dispose()
  return { retention, withdrawal: { result: withdrawn, writes, stores: withdrawnStores, calls: lifecycle.calls, ledger: lifecycle.ledger }, agreement: { result: agreed, stores, writes: fresh.writes, effects: fresh.effects, reads: fresh.reads, sourceSnapshots: fresh.sources }, stores }
}
export async function renewWithdrawalAgreement(stores: { local: JsonObject; session: JsonObject; sync: JsonObject }) {
  const lifecycle = createLifecycleHarness({ local: stores.local, session: stores.session, database: "present" }), deps = lifecycle.deps(), port = deps.consentDevice
  if (!port) throw Error("Missing renewal consent port")
  const reads: unknown[] = [], writes: unknown[] = []
  const supervisor = createStoreLifecycle({ ...deps, consentDevice: { async get(keys) { const result = await port.get(keys); reads.push({ keys, result: copy(result) }); return result },
    async set(items) { const before = lifecycle.stores(); await port.set(items); writes.push({ before, items, after: lifecycle.stores() }) } } })
  const read = readConsentDevice(stores.local)
  if (read.kind !== "supported" || !read.device.consent) throw Error("Missing renewal agreement")
  const withdrawal = await supervisor.withdrawConsent(settingsOrigin, read.device.consent), withdrawn = lifecycle.stores()
  if (withdrawal.kind !== "withdrawn") throw Error("Renewal withdrawal did not confirm")
  await supervisor.dispose()
  const h = observedWithdrawalHarness(withdrawn.local), owner = createStartingLocalFilterWriter({ ...h.deps, now: () => 300 })
  try { await owner.ready() } catch (error) { if (!(error instanceof StartupReadinessError) || error.result.kind !== "consent-held") throw error }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const, shown = await owner.readAgreement(ui)
  if (shown.kind !== "review" || shown.presentation.kind !== "held") throw Error("Renewal disclosure missing")
  const agreement = await owner.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "disclosure" }, access: new Promise(() => {}) })
  if (agreement.kind !== "committed" || h.writes.length !== 1 || !sameSyncJson(Object.keys(h.writes[0]!).sort(), ["consent:state", "device"])) throw Error("Renewal continued recovery")
  await owner.dispose()
  return { withdrawal: { result: withdrawal, reads, writes, stores: withdrawn, calls: lifecycle.calls, ledger: lifecycle.ledger }, agreement: { result: agreement, reads: h.reads, writes: h.writes, sourceSnapshots: h.sources, effects: h.effects },
    stores: { local: h.records(), session: copy(withdrawn.session), sync: copy(stores.sync) } }
}

function inspectedWork(view: HeldWorkView) {
  if (view.kind === "unsupported") return view
  const { selection, ...inspection } = view
  return inspection
}
function inspectedRead(read: HeldWorkRead) {
  return read.kind === "held" ? { kind: read.kind, consent: read.consent, work: read.work.map(inspectedWork) } : read
}
function observedWithdrawalHarness(initial: JsonObject) {
  const h = createInterimHarness(initial), sources: InterimPersistenceSnapshot[] = [], reads: unknown[] = [], sourceReads: unknown[] = []
  const local = { ...h.deps.local, async get(keys: readonly string[] | null) {
    try { const records = await h.deps.local.get(keys); reads.push({ kind: "read", keys, records: copy(records) }); return records }
    catch (error) { reads.push({ kind: "failed", keys, error }); throw error }
  } }
  const startup = { ...h.deps.startup, async readInterimSnapshot() {
    try { const source = await h.deps.startup.readInterimSnapshot(); sources.push(copy(source)); sourceReads.push({ kind: "read", source: copy(source) }); return source }
    catch (error) { sourceReads.push({ kind: "failed", error }); throw error }
  } }
  return { ...h, deps: { ...h.deps, startup, local }, sources, reads, sourceReads }
}

export async function runWithdrawalRetainedAgreement() {
  let assertions = 0
  const check = (value: unknown, label: string) => { assertions++; if (!value) throw Error(label) }
  const equal = (left: unknown, right: unknown, label: string) => check(isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right), label)
  const fixture = await withdrawalRetainedAgreementFixture(), ui = { kind: "ui", windowId: 1, incognito: false } as const
  const observations: unknown[] = [], restarts: unknown[] = []
  const stages = ["prepare", "authorize", "retire", "record", "done"] as const
  const modes = ["rejected-unchanged", "rejected-applied", "resolved-missing", "partial", "divergent", "read-failed", "rejected-read-failed", "disposed"] as const
  function stageOf(items: JsonObject) {
    if (Object.hasOwn(items, interimConversionKey)) return "record"
    const permission = parseConsentJobs(items[consentJobsKey])?.jobs[0]?.permission.kind
    return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : permission === "done" ? "done" : "unknown"
  }
  for (const origin of [ui, { ...ui, incognito: true }]) {
    const h = observedWithdrawalHarness(copy(fixture.stores.local)), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Recovery startup held") }
    const stores = () => ({ local: h.records(), session: copy(fixture.stores.session), sync: copy(fixture.stores.sync) })
    const before = stores(), boundaries: { stage: string; before: ReturnType<typeof stores>; items: JsonObject; after: ReturnType<typeof stores> }[] = []
    h.write(async (items, apply) => { const before = stores(); apply(items); boundaries.push({ stage: stageOf(items), before, items, after: stores() }) })
    const review = await owner.readWithdrawnWork(origin)
    if (review.kind !== "held") throw Error("Actual retained work review missing")
    const selected = review.work.find(view => view.kind === "retained-agreement")
    if (selected?.kind !== "retained-agreement") throw Error("Actual retained selection missing")
    equal(stores(), before, "Inspection has zero writes")
    equal(await owner.resumeRetainedAgreement(origin), { kind: "unavailable", reason: "consent-held" }, "Public resume remains fenced")
    const effectsBefore = h.effects.length
    const result = await owner.recoverWithdrawnWork(origin, { review: review.review, job: selected.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-agreement" && result.completion.result.kind === "confirmed", "Selected V2 receipt recovered")
    equal(boundaries.map(boundary => boundary.stage), stages, "Permission and terminal stage order exact")
    equal(stores().local.device, before.local.device, "Current Device stays byte-equivalent JSON")
    const final = readRetainedCheckpoint(stores().local.interimConversion)
    check(final.kind === "agreement" && final.checkpoint.agreement.kind === "confirmed", "Final receipt intrinsically valid")
    equal(parseConsentJobs(stores().local[consentJobsKey])?.jobs[0]?.identity.operation.record, before.local.interimConversion, "Original accepted record exact")
    equal(stores().session, before.session, "Complete session store preserved"); equal(stores().sync, before.sync, "Complete sync store preserved")
    check(h.writes.every(batch => Object.keys(batch).length === 1 && (Object.hasOwn(batch, consentJobsKey) || Object.hasOwn(batch, interimConversionKey))), "Only ledger and receipt setters invoked")
    check(!h.effects.slice(effectsBefore).some(effect => typeof effect === "string"), "No clock allocation, generation, sync, timer or subscription effect")
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "Selected completion leaves owner held")
    equal(await owner.recoverWithdrawnWork(origin, { review: review.review, job: selected.selection }), { kind: "unavailable", reason: "stale" }, "Review consumed")
    const remaining = await owner.readWithdrawnWork(origin)
    check(remaining.kind === "held" && !remaining.work.some(view => view.kind === "retained-agreement"), "Confirmed receipt creates no executable job")
    await owner.dispose()
    observations.push({ name: origin.incognito ? "private" : "normal", origin, initial: before, source: interimSnapshot(before.local), review: { kind: review.kind, work: review.work.map(inspectedWork), consent: review.consent }, result, boundaries, reads: h.reads, writes: h.writes, effects: h.effects, sourceSnapshots: h.sources, after: stores(), remaining: inspectedRead(remaining) })
    if (!origin.incognito) for (const boundary of boundaries) {
      const seed = JSON.parse(JSON.stringify(boundary.after)), restart = observedWithdrawalHarness(seed.local), fresh = createStartingLocalFilterWriter(restart.deps)
      try { await fresh.ready() } catch (error) { check(error instanceof StartupReadinessError, "Serialized restart held") }
      const read = await fresh.readWithdrawnWork(ui)
      equal(restart.writes, [], "Saved authority never executes at startup")
      equal(restart.records(), seed.local, "Restart preserves complete local store")
      let recovery: unknown
      if (read.kind === "held") {
        const selection = read.work.find(view => view.kind === "retained-agreement")
        if (selection?.kind === "retained-agreement") {
          recovery = await fresh.recoverWithdrawnWork(ui, { review: read.review, job: selection.selection })
          check(object(recovery) && recovery.kind === "recovered", "Fresh explicit selection completes interrupted receipt")
        } else check(boundary.stage === "done", "Only done boundary lacks retained job")
      }
      await fresh.dispose()
      restarts.push({ boundary: boundary.stage, seed, read: inspectedRead(read), recovery, source: interimSnapshot(restart.records()), after: { ...seed, local: restart.records() }, writes: restart.writes, effects: restart.effects, sourceSnapshots: restart.sources, reads: restart.reads })
    }
  }
  for (const stage of stages) for (const mode of modes) {
    const h = observedWithdrawalHarness(copy(fixture.stores.local)), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Fault startup held") }
    let fired = false, failRead = false, stop: Promise<void> | undefined
    const boundaries: unknown[] = [], reads: unknown[] = []
    const stores = () => ({ local: h.records(), session: copy(fixture.stores.session), sync: copy(fixture.stores.sync) })
    h.get(async () => { reads.push(stores()); if (failRead) { failRead = false; throw h.readError } })
    h.write(async (items, apply) => {
      const before = stores(), selectedStage = stageOf(items)
      if (selectedStage !== stage || fired) { apply(items); boundaries.push({ stage: selectedStage, before, items, after: stores() }); return }
      fired = true
      if (mode === "disposed") stop = owner.dispose()
      if (mode === "partial") apply({ [Object.keys(items)[0]!]: { v: 1, kind: "partial" } })
      else if (mode !== "rejected-unchanged" && mode !== "resolved-missing") apply(items)
      if (mode === "divergent") apply({ unrelated: { changed: true } })
      boundaries.push({ stage: selectedStage, before, items, after: stores() })
      if (mode === "read-failed" || mode === "rejected-read-failed") failRead = true
      if (mode.startsWith("rejected")) throw h.error
    })
    const review = await owner.readWithdrawnWork(ui)
    if (review.kind !== "held") throw Error("Fault review missing")
    const selected = review.work.find(view => view.kind === "retained-agreement")
    if (selected?.kind !== "retained-agreement") throw Error("Fault selection missing")
    const result = await owner.recoverWithdrawnWork(ui, { review: review.review, job: selected.selection })
    await stop
    check(fired, "Fault reached selected stage")
    if (mode === "rejected-applied") {
      check(result.kind === "recovered", "Exact applied rejection confirms")
      if (result.kind === "recovered" && result.completion.operation === "retained-agreement" && "permissionWrites" in result) check([...result.permissionWrites, ...result.completion.result.mutations].some(write => write.stage === stage && write.write.kind === "rejected" && write.write.error === h.error), "Applied write rejection retained")
    } else {
      check(result.kind !== "recovered", "Uncertain or failed stage never recovers")
      equal(h.writes.length, stages.indexOf(stage) + 1, "Unconfirmed stage invokes no later effect")
      if (stage === "prepare" || stage === "authorize") check((result.kind === "failed" || result.kind === "unconfirmed") && result.stage === stage, "Outer permission stage preserved")
      else check(result.kind === "authorized-pending" && "completionCheck" in result && (result.observation.kind === "failed" || result.observation.kind === "unconfirmed") && result.observation.stage === stage, "Executor stage preserved")
      if (mode === "rejected-read-failed") {
        const observation = result.kind === "authorized-pending" ? result.observation : result
        check(observation.kind === "unconfirmed" && "write" in observation && typeof observation.write === "object" && observation.write.kind === "rejected" && observation.write.error === h.error && "error" in observation && observation.error === h.readError, "Independent write and read errors retained")
      }
    }
    check(h.writes.every(batch => !Object.hasOwn(batch, "device")), "Fault path has zero Device writes")
    const after = stores(), writes = h.writes.length
    await owner.dispose(); equal(h.writes.length, writes, "Disposal adds no retry")
    const seed = JSON.parse(JSON.stringify(after)), restart = observedWithdrawalHarness(seed.local), fresh = createStartingLocalFilterWriter(restart.deps)
    try { await fresh.ready() } catch (error) { check(error instanceof StartupReadinessError, "Fault restart held") }
    const read = await fresh.readWithdrawnWork(ui)
    equal(restart.writes, [], "Fault restart remains read-only")
    await fresh.dispose()
    observations.push({ name: `${stage}-${mode}`, origin: ui, initial: fixture.stores, source: interimSnapshot(fixture.stores.local), result, boundaries, reads: h.reads, readAttempts: reads, writes: h.writes, errors: { write: h.error, read: h.readError }, after, effects: h.effects, sourceSnapshots: h.sources, restart: { seed, read: inspectedRead(read), after: { ...seed, local: restart.records() }, writes: restart.writes, effects: restart.effects, sourceSnapshots: restart.sources, reads: restart.reads } })
  }
  return { v3Installation: await runWithdrawalRetainedInstallation(), v1Acceptance: await runWithdrawalRetainedV1Acceptance(), mode: "actual-withdrawal-retained-v2-receipt", assertions, cases: observations.length, fixture, observations, restarts, unsupportedCombination: "A positive V5 plus completed withdrawal occurrence sequence requires unavailable later units. Static combined inventories remain specification-only.", native: "waived-and-unproven", production: "not-connected" }
}

export async function runWithdrawalRetainedV1Acceptance() {
  let assertions = 0
  const check = (value: unknown, label: string) => { assertions++; if (!value) throw Error(label) }
  const equal = (left: unknown, right: unknown, label: string) => check(isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right), label)
  const fixture = await withdrawalRetainedV1Fixture(), ui = { kind: "ui", windowId: 1, incognito: false } as const
  const observations: unknown[] = [], restarts: unknown[] = [], subsets: unknown[] = [], renewals: unknown[] = []
  const renewalSeeds: { name: string; stores: typeof fixture.stores; fixed: boolean }[] = []
  const stages = ["prepare", "authorize", "accept", "retire", "record", "done"] as const
  const modes = ["rejected-unchanged", "rejected-applied", "resolved-missing", "partial", "divergent", "read-failed", "rejected-read-failed", "disposed"] as const
  function stageOf(items: JsonObject) {
    if (Object.hasOwn(items, interimConversionKey)) return Object.hasOwn(items, consentJobsKey) ? "accept" : "record"
    const ledger = parseConsentJobs(items[consentJobsKey])
    const draft = ledger && "retainedV1" in ledger ? ledger.retainedV1 : undefined
    const permission = draft && "permission" in draft ? draft.permission.kind : ledger?.jobs[0]?.permission.kind
    return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : permission === "done" ? "done" : "unknown"
  }
  for (const origin of [ui, { ...ui, incognito: true }]) {
    const h = observedWithdrawalHarness(copy(fixture.stores.local)), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Recovery startup held") }
    const stores = () => ({ local: h.records(), session: copy(fixture.stores.session), sync: copy(fixture.stores.sync) })
    const before = stores(), boundaries: { stage: string; before: ReturnType<typeof stores>; items: JsonObject; after: ReturnType<typeof stores> }[] = []
    h.write(async (items, apply) => { const before = stores(); apply(items); boundaries.push({ stage: stageOf(items), before, items, after: stores() }) })
    const review = await owner.readWithdrawnWork(origin)
    if (review.kind !== "held") throw Error("Actual retained work review missing")
    const selected = review.work.find(view => view.kind === "retained-v1-acceptance")
    if (selected?.kind !== "retained-v1-acceptance") throw Error("Actual retained selection missing")
    equal(stores(), before, "Inspection has zero writes")
    equal(await owner.resumeRetainedAgreement(origin), { kind: "unavailable", reason: "consent-held" }, "Public resume remains fenced")
    const effectsBefore = h.effects.length
    const result = await owner.recoverWithdrawnWork(origin, { review: review.review, job: selected.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-v1-acceptance" && result.completion.result.kind === "confirmed", "Selected V1 acceptance recovered")
    equal(boundaries.map(boundary => boundary.stage), stages, "Permission and terminal stage order exact")
    equal(stores().local.device, before.local.device, "Current Device stays byte-equivalent JSON")
    const final = readRetainedCheckpoint(stores().local.interimConversion)
    check(final.kind === "agreement" && final.checkpoint.agreement.kind === "confirmed", "Final receipt intrinsically valid")
    const ledger = parseConsentJobs(stores().local[consentJobsKey])
    equal(ledger?.jobs[0]?.identity.operation.record.retained, before.local.interimConversion, "Complete historical V1 exact")
    equal(ledger?.next, 1, "Only one occurrence allocated")
    equal(ledger?.jobs[0]?.identity.occurrence, 0, "First occurrence is zero")
    equal(ledger?.jobs[0]?.identity.original, { v: 1, at: 300 }, "Fixed effect uses the accepting consent")
    equal(stores().session, before.session, "Complete session store preserved"); equal(stores().sync, before.sync, "Complete sync store preserved")
    check(h.writes.every(batch => Object.keys(batch).length === (Object.hasOwn(batch, consentJobsKey) && Object.hasOwn(batch, interimConversionKey) ? 2 : 1) && !Object.hasOwn(batch, "device")), "Only exact acceptance, ledger and receipt setters invoked")
    check(!h.effects.slice(effectsBefore).some(effect => typeof effect === "string"), "No clock allocation, generation, sync, timer or subscription effect")
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "Selected completion leaves owner held")
    equal(await owner.recoverWithdrawnWork(origin, { review: review.review, job: selected.selection }), { kind: "unavailable", reason: "stale" }, "Review consumed")
    const remaining = await owner.readWithdrawnWork(origin)
    check(remaining.kind === "held" && !remaining.work.some(view => view.kind === "retained-v1-acceptance"), "Confirmed receipt creates no executable job")
    await owner.dispose()
    observations.push({ name: origin.incognito ? "private" : "normal", origin, initial: before, source: interimSnapshot(before.local), review: { kind: review.kind, work: review.work.map(inspectedWork), consent: review.consent }, result, boundaries, reads: h.reads, writes: h.writes, effects: h.effects, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, after: stores(), remaining: inspectedRead(remaining) })
    if (!origin.incognito) for (const boundary of boundaries) {
      if (["authorize", "accept", "retire", "record"].includes(boundary.stage)) renewalSeeds.push({ name: boundary.stage, stores: boundary.after, fixed: boundary.stage !== "authorize" })
      const seed = JSON.parse(JSON.stringify(boundary.after)), restart = observedWithdrawalHarness(seed.local), fresh = createStartingLocalFilterWriter(restart.deps)
      try { await fresh.ready() } catch (error) { check(error instanceof StartupReadinessError, "Serialized restart held") }
      const read = await fresh.readWithdrawnWork(ui)
      equal(restart.writes, [], "Saved authority never executes at startup")
      equal(restart.records(), seed.local, "Restart preserves complete local store")
      let recovery: unknown
      if (read.kind === "held") {
        const selection = read.work.find(view => view.kind === "retained-v1-acceptance")
        if (selection?.kind === "retained-v1-acceptance") {
          recovery = await fresh.recoverWithdrawnWork(ui, { review: read.review, job: selection.selection })
          check(object(recovery) && recovery.kind === "recovered", "Fresh explicit selection completes interrupted receipt")
        } else check(boundary.stage === "done", "Only done boundary lacks retained job")
      }
      await fresh.dispose()
      restarts.push({ boundary: boundary.stage, seed, read: inspectedRead(read), recovery, source: interimSnapshot(restart.records()), after: { ...seed, local: restart.records() }, writes: restart.writes, effects: restart.effects, sourceReadAttempts: restart.sourceReads, sourceSnapshots: restart.sources, reads: restart.reads })
    }
  }
  for (const stage of stages) for (const mode of modes) {
    const h = observedWithdrawalHarness(copy(fixture.stores.local)), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Fault startup held") }
    let fired = false, failRead = false, stop: Promise<void> | undefined
    const boundaries: unknown[] = [], reads: unknown[] = []
    const stores = () => ({ local: h.records(), session: copy(fixture.stores.session), sync: copy(fixture.stores.sync) })
    h.get(async () => { reads.push(stores()); if (failRead) { failRead = false; throw h.readError } })
    h.write(async (items, apply) => {
      const before = stores(), selectedStage = stageOf(items)
      if (selectedStage !== stage || fired) { apply(items); boundaries.push({ stage: selectedStage, before, items, after: stores() }); return }
      fired = true
      if (mode === "disposed") stop = owner.dispose()
      if (mode === "partial") apply({ [Object.keys(items)[0]!]: { v: 1, kind: "partial" } })
      else if (mode !== "rejected-unchanged" && mode !== "resolved-missing") apply(items)
      if (mode === "divergent") apply({ unrelated: { changed: true } })
      boundaries.push({ stage: selectedStage, before, items, after: stores() })
      if (mode === "read-failed" || mode === "rejected-read-failed") failRead = true
      if (mode.startsWith("rejected")) throw h.error
    })
    const review = await owner.readWithdrawnWork(ui)
    if (review.kind !== "held") throw Error("Fault review missing")
    const selected = review.work.find(view => view.kind === "retained-v1-acceptance")
    if (selected?.kind !== "retained-v1-acceptance") throw Error("Fault selection missing")
    const result = await owner.recoverWithdrawnWork(ui, { review: review.review, job: selected.selection })
    await stop
    check(fired, "Fault reached selected stage")
    if (mode === "rejected-applied") {
      check(result.kind === "recovered", "Exact applied rejection confirms")
      if (result.kind === "recovered" && result.completion.operation === "retained-v1-acceptance" && "permissionWrites" in result) check([...result.permissionWrites, ...(result.completion.result.acceptance.kind === "confirmed" ? [{ stage: "accept", write: result.completion.result.acceptance.write }] : []), ...result.completion.result.receipt.mutations].some(write => write.stage === stage && write.write.kind === "rejected" && write.write.error === h.error), "Applied write rejection retained")
    } else {
      check(result.kind !== "recovered", "Uncertain or failed stage never recovers")
      equal(h.writes.length, stages.indexOf(stage) + 1, "Unconfirmed stage invokes no later effect")
      if (stage === "prepare" || stage === "authorize" || stage === "accept") check((result.kind === "failed" || result.kind === "unconfirmed") && result.stage === stage, "Outer permission stage preserved")
      else check(result.kind === "authorized-pending" && "completionCheck" in result && (result.observation.kind === "failed" || result.observation.kind === "unconfirmed") && result.observation.stage === stage, "Executor stage preserved")
      if (mode === "rejected-read-failed") {
        const observation = result.kind === "authorized-pending" ? result.observation : result
        check(observation.kind === "unconfirmed" && "write" in observation && typeof observation.write === "object" && observation.write.kind === "rejected" && observation.write.error === h.error && "error" in observation && observation.error === h.readError, "Independent write and read errors retained")
      }
    }
    check(h.writes.every(batch => !Object.hasOwn(batch, "device")), "Fault path has zero Device writes")
    const after = stores(), writes = h.writes.length
    await owner.dispose(); equal(h.writes.length, writes, "Disposal adds no retry")
    const seed = JSON.parse(JSON.stringify(after)), restart = observedWithdrawalHarness(seed.local), fresh = createStartingLocalFilterWriter(restart.deps)
    try { await fresh.ready() } catch (error) { check(error instanceof StartupReadinessError, "Fault restart held") }
    const read = await fresh.readWithdrawnWork(ui)
    equal(restart.writes, [], "Fault restart remains read-only")
    await fresh.dispose()
    observations.push({ name: `${stage}-${mode}`, origin: ui, initial: fixture.stores, source: interimSnapshot(fixture.stores.local), result, boundaries, reads: h.reads, readAttempts: reads, writes: h.writes, errors: { write: h.error, read: h.readError }, after, effects: h.effects, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, restart: { seed, read: inspectedRead(read), after: { ...seed, local: restart.records() }, writes: restart.writes, effects: restart.effects, sourceReadAttempts: restart.sourceReads, sourceSnapshots: restart.sources, reads: restart.reads } })
  }
  for (const appliedKeys of [[], [interimConversionKey], [consentJobsKey], [interimConversionKey, consentJobsKey]]) for (const rejected of [false, true]) {
    const h = observedWithdrawalHarness(fixture.stores.local), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Subset startup held") }
    let captured: typeof fixture.stores | undefined
    const boundaries: unknown[] = []
    h.write(async (items, apply) => {
      const before = h.records(), stage = stageOf(items)
      if (stage === "accept" && !captured) {
        apply(Object.fromEntries(Object.entries(items).filter(([key]) => appliedKeys.includes(key))))
        captured = { ...copy(fixture.stores), local: h.records() }
        boundaries.push({ stage, before, items, after: h.records(), appliedKeys })
        if (rejected) throw h.error
      } else { apply(items); boundaries.push({ stage, before, items, after: h.records() }) }
    })
    const shown = await owner.readWithdrawnWork(ui)
    if (shown.kind !== "held") throw Error("Subset review missing")
    const selected = shown.work.find(view => view.kind === "retained-v1-acceptance")
    if (!selected || selected.kind !== "retained-v1-acceptance") throw Error("Subset selection missing")
    const result = await owner.recoverWithdrawnWork(ui, { review: shown.review, job: selected.selection })
    check(captured, "Subset captured actual invoked acceptance")
    if (!captured) throw Error("Subset capture absent")
    check((result.kind === "recovered") === (appliedKeys.length === 2), "Only complete acceptance progresses")
    if (appliedKeys.length < 2) equal(h.writes.length, 3, "Partial acceptance never retires in its attempt")
    const inspection = await owner.readWithdrawnWork(ui)
    if (appliedKeys.length < 2 && !(rejected && appliedKeys.length === 0)) check(inspection.kind === "held" && !inspection.work.some(view => view.kind === "retained-v1-acceptance"), "Uncertain V1 owner inspection has no authority")
    await owner.dispose()
    const seed = JSON.parse(JSON.stringify(captured)), restart = observedWithdrawalHarness(seed.local), fresh = createStartingLocalFilterWriter(restart.deps)
    try { await fresh.ready() } catch (error) { check(error instanceof StartupReadinessError, "Subset serialized restart held") }
    const read = await fresh.readWithdrawnWork(ui)
    equal(restart.writes, [], "Subset restart never executes saved permission")
    if (read.kind !== "held") throw Error("Subset restart review missing")
    const choice = read.work.find(view => view.kind === "retained-v1-acceptance")
    if (!choice || choice.kind !== "retained-v1-acceptance") throw Error("Subset restart explicit selection missing")
    const recovery = await fresh.recoverWithdrawnWork(ui, { review: read.review, job: choice.selection })
    check(recovery.kind === "recovered" && recovery.completion.operation === "retained-v1-acceptance", "Fresh explicit subset repair completes")
    const ledger = parseConsentJobs(restart.records()[consentJobsKey])
    equal(ledger?.next, 1, "Subset repair never increments twice"); equal(ledger?.jobs.length, 1, "Subset repair has one exact occurrence")
    equal(restart.writes.filter(items => Object.hasOwn(items, "device")), [], "Subset repair has zero Device writes")
    equal(restart.writes.map(stageOf), appliedKeys.length === 2 ? ["prepare", "authorize", "retire", "record", "done"] : stages, "Subset repair exact stage sequence")
    await fresh.dispose()
    if (!rejected && appliedKeys.length === 1) renewalSeeds.push({ name: appliedKeys[0] === interimConversionKey ? "v2-only" : "ledger-only", stores: captured, fixed: true })
    subsets.push({ appliedKeys, settlement: rejected ? "rejected" : "resolved", initial: fixture.stores, result, boundaries, after: { ...copy(fixture.stores), local: h.records() }, inspection: inspectedRead(inspection), reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects,
      restart: { seed, read: inspectedRead(read), recovery, after: { ...seed, local: restart.records() }, writes: restart.writes, reads: restart.reads, sourceReadAttempts: restart.sourceReads, sourceSnapshots: restart.sources, effects: restart.effects } })
  }
  for (const capture of renewalSeeds) {
    const renewal = await renewWithdrawalAgreement(JSON.parse(JSON.stringify(capture.stores))), h = observedWithdrawalHarness(renewal.stores.local), owner = createStartingLocalFilterWriter(h.deps)
    const control = readConsentDevice(renewal.stores.local)
    check(control.kind === "supported" && control.control?.generation === 4 && control.device.consent?.at === 301, "Actual repeated-clock renewal advances consent and generation")
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError, "Renewed startup held") }
    const read = await owner.readWithdrawnWork(ui)
    equal(h.writes, [], "Renewed startup never accepts or resumes")
    if (read.kind !== "held") throw Error("Renewed work review missing")
    const choice = read.work.find(view => view.kind === "retained-v1-acceptance")
    if (!choice || choice.kind !== "retained-v1-acceptance") throw Error("Renewed explicit selection missing")
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: choice.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-v1-acceptance", "Renewed permission completes selected work")
    const checkpoint = readRetainedCheckpoint(h.records().interimConversion)
    check(checkpoint.kind === "agreement" && checkpoint.checkpoint.agreement.effect.consent.at === (capture.fixed ? 300 : 301), "Renewal preserves original accepted effect or reproposes only unaccepted V1")
    equal(h.records().device, renewal.stores.local.device, "Renewed current authorization remains exact")
    equal(parseConsentJobs(h.records()[consentJobsKey])?.next, 1, "Renewal reuses one occurrence")
    await owner.dispose()
    renewals.push({ name: capture.name, capture, renewal, read: inspectedRead(read), result, after: { ...renewal.stores, local: h.records() }, writes: h.writes, reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
  }
  return { mode: "actual-withdrawal-retained-v1-acceptance", assertions, cases: observations.length + subsets.length + renewals.length, fixture, observations, restarts, subsets, renewals, unsupportedCombination: "A positive V5 plus completed withdrawal occurrence sequence requires unavailable later units. Static combined inventories remain specification-only.", native: "waived-and-unproven", production: "not-connected" }
}


export async function withdrawalRetainedInstallationFixture(options: { readonly initial?: JsonObject; readonly mask?: number; readonly rejected?: boolean } = {}) {
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const rich = interimFixture()
  if (!object(rich.device) || !object(rich.sync)) throw Error("Missing off-history fixture")
  rich.device.syncOn = false; rich.sync.status = "off"; rich.legacyClaimed = true
  const initial = copy(options.initial ?? rich), session: JsonObject = { channelCache: { keep: [null, true] } }, sync: JsonObject = { unrelated: [null, false] }
  const h = observedWithdrawalHarness(initial), owner = createStartingLocalFilterWriter({ ...h.deps, now: () => 200 })
  try { await owner.ready() } catch (error) { if (!(error instanceof StartupReadinessError)) throw error }
  const retained = { local: h.records(), session, sync }, disclosure = await owner.readAgreement(ui)
  if (disclosure.kind !== "review") throw Error("Missing original installation disclosure")
  const agreement = await owner.agree(ui, { review: disclosure.review, displayedVersion: disclosure.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (agreement.kind !== "committed") throw Error("Original installation agreement did not commit")
  const agreed = { local: h.records(), session, sync }, parsed = readRetainedCheckpoint(agreed.local.interimConversion)
  if (parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "confirmed") throw Error("Original confirmed V2 missing")
  const derived = deriveInterimInstallationEffect({ ...parsed.checkpoint, agreement: parsed.checkpoint.agreement })
  if (derived.kind !== "effect") throw Error("Original installation effect unavailable")
  const batch: JsonObject = Object.fromEntries([...derived.effect.documents.map(x => [x.path, x.document]), ...derived.effect.caches.map(x => [x.path, x.data])])
  if (derived.effect.schema.kind === "set") batch.schema = derived.effect.schema.value
  const keys = Object.keys(batch), mask = options.mask ?? 0
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= 2 ** keys.length) throw Error("Invalid actual installation mask")
  const shown = await owner.readInterimInstallation(ui)
  if (shown.kind !== "review") throw Error("Missing original installation review")
  const boundaries: { stage: string; before: JsonObject; items: JsonObject; after: JsonObject }[] = []
  h.write(async (items, apply) => {
    const before = h.records(), checkpoint = readRetainedCheckpoint(items.interimConversion)
    if (checkpoint.kind === "installation" && checkpoint.checkpoint.installation.kind === "installed") {
      boundaries.push({ stage: "original-record", before, items, after: h.records() }); throw h.error
    }
    if (Object.hasOwn(items, interimConversionKey)) apply(items)
    else apply(Object.fromEntries(keys.filter((_, index) => (mask & 2 ** index) !== 0).map(key => [key, items[key]!])) )
    boundaries.push({ stage: Object.hasOwn(items, interimConversionKey) ? "original-accept" : "original-documents", before, items, after: h.records() })
    if (!Object.hasOwn(items, interimConversionKey) && options.rejected) throw h.error
  })
  const installation = await owner.installInterimConversion(ui, shown.review), accepted = { local: h.records(), session, sync }
  const acceptedRead = readRetainedCheckpoint(accepted.local.interimConversion)
  if (acceptedRead.kind !== "installation" || acceptedRead.checkpoint.installation.kind !== "accepted") throw Error("Original operation did not leave accepted V3")
  const original = { initial: { local: initial, session, sync }, retained, agreed, accepted, agreement, shown, installation, batch, mask, rejected: options.rejected ?? false, appliedKeys: keys.filter((_, index) => (mask & 2 ** index) !== 0), boundaries,
    reads: h.reads, writes: h.writes, effects: h.effects, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources }
  await owner.dispose()
  if (accepted.local.schema !== 1) {
    const lifecycle = createLifecycleHarness({ local: accepted.local, session, database: "present" }), supervisor = createStoreLifecycle(lifecycle.deps())
    const withdrawal = await supervisor.withdrawConsent(settingsOrigin, acceptedRead.checkpoint.agreed.agreement.effect.consent)
    await supervisor.dispose()
    if (withdrawal.kind === "withdrawn") throw Error("Unsupported schema unexpectedly withdrew")
    return { kind: "schema-unreachable" as const, original, stores: accepted, refusedWithdrawal: { result: withdrawal, calls: lifecycle.calls, stores: lifecycle.stores(), ledger: lifecycle.ledger } }
  }
  const renewal = await renewWithdrawalAgreement(accepted)
  if (!sameSyncJson(renewal.stores.local.interimConversion!, accepted.local.interimConversion!)) throw Error("Withdrawal changed historical installation")
  return { kind: "ready" as const, original, renewal, stores: renewal.stores }
}

export async function runWithdrawalRetainedInstallation() {
  let assertions = 0
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  function equal(left: unknown, right: unknown, label: string) { check(isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right), label) }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const fixture = await withdrawalRetainedInstallationFixture()
  check(fixture.kind === "ready", "Actual old V3 withdrawal recipe is reachable")
  const observations: unknown[] = [], restarts: unknown[] = [], subsets: unknown[] = []
  const stages = ["prepare", "authorize", "documents", "retire", "record", "done"] as const
  function stageOf(items: JsonObject) {
    if (Object.hasOwn(items, interimConversionKey)) return "record"
    const ledger = parseConsentJobs(items[consentJobsKey]), permission = ledger?.jobs.find(job => job.identity.operation.kind === "retained-installation")?.permission.kind
    return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : permission === "done" ? "done" : "documents"
  }
  async function open(seed: typeof fixture.stores) {
    const h = observedWithdrawalHarness(JSON.parse(JSON.stringify(seed.local))), owner = createStartingLocalFilterWriter(h.deps)
    try { await owner.ready() } catch (error) { check(error instanceof StartupReadinessError && error.result.kind === "consent-held", "Installation startup stays consent held") }
    equal(h.writes, [], "Fresh installation owner is read only")
    const stores = () => ({ local: h.records(), session: copy(seed.session), sync: copy(seed.sync) })
    return { h, owner, stores }
  }
  async function select(owner: ReturnType<typeof createStartingLocalFilterWriter>, origin = ui) {
    const read = await owner.readWithdrawnWork(origin)
    check(read.kind === "held", "Installation review available")
    const view = read.work.find(view => view.kind === "retained-installation")
    check(view?.kind === "retained-installation", "Accepted V3 has its own selection")
    return { read, view }
  }
  const restartedStores = new Map<string, number>()
  async function restart(seed: typeof fixture.stores, name: string, execute = false) {
    const serialized = JSON.stringify(seed), prior = restartedStores.get(serialized)
    if (prior !== undefined) { restarts.push({ name, seed, equivalentRestart: prior, executed: false, reason: "identical-complete-stores" }); return }
    restartedStores.set(serialized, restarts.length)
    const { h, owner, stores } = await open(seed), read = await owner.readWithdrawnWork(ui)
    equal(stores(), seed, "Serialized restart preserves complete stores")
    let result: unknown
    if (read.kind === "held") {
      const selected = read.work.find(view => view.kind === "retained-installation")
      if (execute && selected?.kind === "retained-installation") {
        result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: selected.selection })
        check(object(result) && result.kind === "recovered", "Fresh explicit installation finishes")
        if (selected.progress === "terminal") check(h.writes.every(items => stageOf(items) !== "documents"), "Terminal restart has no documents callback")
      }
    }
    await owner.dispose()
    restarts.push({ name, seed, read: inspectedRead(read), result, after: stores(), reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
  }
  {
    const { h, owner, stores } = await open(fixture.stores), before = stores(), { read, view } = await select(owner)
    const boundaries: { stage: string; before: typeof before; items: JsonObject; after: typeof before }[] = []
    h.write(async (items, apply) => { const before = stores(); apply(items); boundaries.push({ stage: stageOf(items), before, items, after: stores() }) })
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection })
    check(result.kind === "recovered" && result.completion.operation === "retained-installation", "Accepted old V3 finishes under current agreement")
    equal(boundaries.map(boundary => boundary.stage), stages, "Six exact installation stages")
    equal(stores().local.device, before.local.device, "Installation never writes Device")
    const parsed = readRetainedCheckpoint(stores().local.interimConversion), ledger = parseConsentJobs(stores().local[consentJobsKey])
    check(parsed.kind === "installation" && parsed.checkpoint.installation.kind === "installed", "Installed receipt parses intrinsically")
    equal(parsed.checkpoint.agreed, view.identity.operation.record.agreed, "Historical complete V2 unchanged")
    equal(ledger?.jobs[0]?.identity, view.identity, "Accepted full identity stays exact")
    equal(ledger?.next, 1, "One durable occurrence allocated")
    equal(ledger?.jobs[0]?.permission, { kind: "done" }, "Done written last")
    equal(await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "Completion cannot activate")
    equal(await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection }), { kind: "unavailable", reason: "stale" }, "Review is one use")
    observations.push({ name: "normal", before, read: inspectedRead(read), result, boundaries, after: stores(), writes: h.writes, reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
    await owner.dispose()
    for (const boundary of boundaries) await restart(boundary.after, boundary.stage, true)
  }
  for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "resolved-missing", "partial", "divergent", "read-failed", "rejected-read-failed", "disposed-unchanged", "disposed-applied"] as const) {
    const { h, owner, stores } = await open(fixture.stores), before = stores(), { read, view } = await select(owner)
    let fired = false, disposal: Promise<void> | undefined
    const queued: Promise<unknown>[] = []
    const boundaries: unknown[] = []
    h.write(async (items, apply) => {
      const name = stageOf(items), before = stores()
      if (name !== stage || fired) { apply(items); boundaries.push({ stage: name, before, items, after: stores() }); return }
      fired = true
      queued.push(owner.readWithdrawnWork(ui).then(inspectedRead), owner.resumeInterimInstallation(ui), owner.changeSharedSetting(ui, { kind: "theme", value: "dark" }), owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection }))
      if (mode === "rejected-applied" || mode === "read-failed" || mode === "rejected-read-failed" || mode === "disposed-applied") apply(items)
      if (mode === "partial") {
        if (stage === "documents") apply(Object.fromEntries(Object.entries(items).slice(0, 1)))
        else apply({ unrelated: { changed: "partial-ledger-or-receipt-negative" } })
      }
      if (mode === "divergent") { apply(items); apply({ unrelated: { changed: "divergent" } }) }
      if (mode === "read-failed" || mode === "rejected-read-failed") h.get(async () => { h.get(undefined); throw h.readError })
      if (mode === "disposed-unchanged" || mode === "disposed-applied") disposal = owner.dispose()
      boundaries.push({ stage: name, mode, before, items, after: stores() })
      if (mode === "rejected-unchanged" || mode === "rejected-applied" || mode === "rejected-read-failed") throw h.error
    })
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection })
    check(fired, "Installation fault reached actual setter")
    if (mode === "rejected-applied") check(result.kind === "recovered", "Exact stable rejected applied installation can confirm")
    else check(result.kind !== "recovered", "Uncertain installation cannot recover")
    check(h.writes.every(items => !Object.hasOwn(items, "device")), "Every fault has zero Device writes")
    if (mode !== "rejected-applied") equal(h.writes.map(stageOf).at(-1), stage, "No next effect after failed or uncertain setter")
    if (mode === "rejected-read-failed") {
      const fault = result.kind === "unconfirmed" ? result : result.kind === "authorized-pending" ? result.observation : undefined
      check(fault?.kind === "unconfirmed" && "observation" in fault && fault.write.kind === "rejected" && fault.write.error === h.error && fault.observation.kind === "read-failed" && fault.observation.error === h.readError, "Write rejection and independent read error identities preserved")
    }
    const queuedResults = await Promise.all(queued)
    check(queuedResults.slice(1).every(result => object(result) && result.kind !== "committed" && result.kind !== "recovered"), "Queued effects cannot use consumed or uncertain installation authority")
    const inspection = await owner.readWithdrawnWork(ui)
    if (!["rejected-unchanged", "rejected-applied", "disposed-unchanged", "disposed-applied"].includes(mode)) check(inspection.kind === "held" && !inspection.work.some(view => view.kind === "retained-installation"), "Uncertainty closes execution but keeps inspection")
    if (disposal) await disposal; else await owner.dispose()
    observations.push({ stage, mode, before, result, queuedResults, inspection: inspectedRead(inspection), boundaries, after: stores(), writes: h.writes, reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
    if (mode !== "partial" && mode !== "divergent") await restart(stores(), `${stage}-${mode}`)
  }
  subsets.push(...(await runWithdrawalInstallationSubsets([0, 1, 31, 63])).cases)
  const schema = await withdrawalRetainedInstallationFixture({ initial: { sessionConsent: 1 }, mask: 1 })
  check(schema.kind === "ready", "Actual schema-first P3 can withdraw")
  await restart(schema.stores, "P3-schema-applied", true)
  const absentSchema = await withdrawalRetainedInstallationFixture({ initial: { sessionConsent: 1 }, mask: 0 })
  check(absentSchema.kind === "schema-unreachable", "Absent schema cannot be relabeled post-withdrawal positive")
  const empty = await withdrawalRetainedInstallationFixture({ initial: { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false }, sessionConsent: 1 } })
  check(empty.kind === "ready" && Object.keys(empty.original.batch).length === 0, "Actual empty fixed installation remains an explicit receipt action")
  await restart(empty.stores, "empty-fixed-effect", true)
  return { mode: "actual-withdrawal-accepted-v3-installation", newAcceptance: await runWithdrawalNewInstallationAcceptance(), assertions, cases: observations.length, fixture, observations, subsets, schema, absentSchema, empty, restarts, native: "waived-and-unproven", production: "not-connected", privacyWordingApproval: "pending" }
}

export async function withdrawalConfirmedInstallationFixture(kind: "ordinary" | "receipt" | "v1" = "ordinary", initial?: JsonObject) {
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  if (kind !== "ordinary") {
    const fixture = kind === "receipt" ? await withdrawalRetainedAgreementFixture() : await withdrawalRetainedV1Fixture()
    const h = observedWithdrawalHarness(fixture.stores.local), owner = createStartingLocalFilterWriter(h.deps)
    await owner.ready().catch(error => { if (!(error instanceof StartupReadinessError)) throw error })
    const read = await owner.readWithdrawnWork(ui)
    if (read.kind !== "held") throw Error("Missing actual receipt review")
    const selected = read.work.find(view => view.kind === (kind === "receipt" ? "retained-agreement" : "retained-v1-acceptance"))
    if (!selected || selected.kind === "unsupported") throw Error("Missing actual receipt selection")
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: selected.selection })
    if (result.kind !== "recovered") throw Error("Actual receipt did not complete")
    const agreed = { ...fixture.stores, local: h.records() }, parsed = readRetainedCheckpoint(agreed.local.interimConversion)
    if (parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "confirmed") throw Error("Actual receipt left no confirmed V2")
    await owner.dispose()
    const renewal = kind === "v1" ? await renewWithdrawalAgreement(agreed) : undefined
    return { kind, fixture, completion: { result, read: inspectedRead(read), stores: agreed, reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects }, renewal, stores: renewal?.stores ?? agreed }
  }
  const rich = interimFixture()
  if (!object(rich.device) || !object(rich.sync)) throw Error("Missing ordinary off fixture")
  rich.device.syncOn = false; rich.sync.status = "off"; rich.legacyClaimed = true
  const local = copy(initial ?? rich), session: JsonObject = { channelCache: { keep: [null, true] } }, sync: JsonObject = { unrelated: [null, false] }
  const h = observedWithdrawalHarness(local), owner = createStartingLocalFilterWriter({ ...h.deps, now: () => 200 })
  await owner.ready().catch(error => { if (!(error instanceof StartupReadinessError)) throw error })
  const retained = { local: h.records(), session, sync }, shown = await owner.readAgreement(ui)
  if (shown.kind !== "review") throw Error("Missing ordinary confirmed V2 disclosure")
  const result = await owner.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  if (result.kind !== "committed") throw Error("Ordinary V2 did not confirm")
  const agreed = { local: h.records(), session, sync }, parsed = readRetainedCheckpoint(agreed.local.interimConversion)
  if (parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "confirmed") throw Error("Ordinary V2 missing")
  await owner.dispose()
  const renewal = await renewWithdrawalAgreement(agreed)
  return { kind, initial: { local, session, sync }, retained, agreed, agreement: { result, reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects }, renewal, stores: renewal.stores }
}
export function newInstallationStage(items: JsonObject) {
  if (Object.hasOwn(items, interimConversionKey)) return Object.hasOwn(items, consentJobsKey) ? "accept" : "record"
  const ledger = parseConsentJobs(items[consentJobsKey]), draft = ledger?.retainedInstallation
  const permission = draft && "permission" in draft ? draft.permission.kind : ledger?.jobs.find(job => job.identity.operation.kind === "retained-installation")?.permission.kind
  return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : permission === "done" ? "done" : "documents"
}
export async function runWithdrawalNewInstallationAcceptance() {
  let assertions = 0
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  function equal(left: unknown, right: unknown, label: string) { check(isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right), label) }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const recipes = { ordinary: await withdrawalConfirmedInstallationFixture(), receipt: await withdrawalConfirmedInstallationFixture("receipt"), v1: await withdrawalConfirmedInstallationFixture("v1") }
  const observations: unknown[] = [], restarts: unknown[] = []
  const stages = ["prepare", "authorize", "accept", "documents", "retire", "record", "done"] as const
  async function open(seed: typeof recipes.ordinary.stores) {
    const h = observedWithdrawalHarness(copy(seed.local)), owner = createStartingLocalFilterWriter(h.deps)
    await owner.ready().catch(error => { check(error instanceof StartupReadinessError, "New acceptance startup held") })
    equal(h.writes, [], "Restart never reconstructs acceptance authority")
    const stores = () => ({ local: h.records(), session: copy(seed.session), sync: copy(seed.sync) })
    return { h, owner, stores }
  }
  async function select(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
    const read = await owner.readWithdrawnWork(ui)
    check(read.kind === "held", "New installation review available")
    const view = read.work.find(view => view.kind === "retained-installation-acceptance")
    check(view?.kind === "retained-installation-acceptance", "Confirmed V2 has a separate explicit installation selection")
    check(!read.work.some(view => view.kind === "retained-installation"), "One installation selection only")
    return { read, view }
  }
  async function restart(seed: typeof recipes.ordinary.stores, name: string, finish: boolean) {
    const { h, owner, stores } = await open(seed), read = await owner.readWithdrawnWork(ui)
    let result: unknown
    if (finish) {
      const selected = read.kind === "held" && read.work.find(view => view.kind === "retained-installation-acceptance")
      if (selected && selected.kind === "retained-installation-acceptance") {
        result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: selected.selection })
        check(object(result) && result.kind === "recovered", "Fresh explicit installation acceptance finishes")
      }
    }
    await owner.dispose()
    restarts.push({ name, seed, read: inspectedRead(read), result, after: stores(), reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
  }
  for (const [kind, recipe] of Object.entries(recipes)) for (const rejected of [false, true]) for (const mask of [0, 1, 2, 3]) {
    const { h, owner, stores } = await open(recipe.stores), { read, view } = await select(owner), before = stores(), boundaries: { stage: string; before: typeof before; items: JsonObject; after: typeof before }[] = []
    const next = parseConsentJobs(before.local[consentJobsKey])?.next ?? 0
    h.write(async (items, apply) => {
      const stage = newInstallationStage(items), before = stores()
      if (stage === "accept") {
        const keys = [interimConversionKey, consentJobsKey].filter((_, index) => mask & 2 ** index)
        apply(Object.fromEntries(keys.map(key => [key, items[key]!])) )
      } else apply(items)
      boundaries.push({ stage, before, items, after: stores() })
      if (stage === "accept" && rejected) throw h.error
    })
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection })
    check(mask === 3 ? result.kind === "recovered" && result.completion.operation === "retained-installation-acceptance" : result.kind !== "recovered", "Only complete acceptance can finish")
    for (const boundary of boundaries.filter(x => x.stage === "prepare" || x.stage === "authorize")) {
      equal(parseConsentJobs(boundary.after.local[consentJobsKey])?.next, next, "Draft permissions allocate no occurrence")
      equal(parseConsentJobs(boundary.after.local[consentJobsKey])?.jobs, parseConsentJobs(before.local[consentJobsKey])?.jobs ?? [], "Draft permissions append no job")
    }
    if (mask !== 3) equal(boundaries.map(x => x.stage), ["prepare", "authorize", "accept"], "Partial acceptance starts no executor effect")
    equal(stores().local.device, before.local.device, "New acceptance never writes Device")
    if (kind === "v1") equal(parseConsentJobs(stores().local[consentJobsKey])?.retainedV1, parseConsentJobs(before.local[consentJobsKey])?.retainedV1, "Completed V1 witness survives alongside installation")
    equal(parseConsentJobs(stores().local[consentJobsKey])?.next, next + (mask & 2 ? 1 : 0), "Acceptance allocation follows the applied ledger key")
    if (mask === 3 && rejected) check(result.kind === "recovered" && result.completion.operation === "retained-installation-acceptance" && result.completion.result.acceptance.kind === "confirmed" && result.completion.result.acceptance.write.kind === "rejected" && result.completion.result.acceptance.write.error === h.error, "Applied acceptance rejection identity retained")
    const after = stores(), inspection = await owner.readWithdrawnWork(ui)
    if (mask === 1 || mask === 2 || mask === 0 && !rejected) check(inspection.kind === "held" && !inspection.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance"), "Uncertain acceptance owner permits inspection only")
    await owner.dispose()
    observations.push({ kind, mask, rejected, before, read: inspectedRead(read), result, boundaries, after, inspection: inspectedRead(inspection), reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
    if (mask === 1 || mask === 2) {
      const renewal = await renewWithdrawalAgreement(after)
      restarts.push({ name: `${kind}-${mask}-${rejected}-actual-renewal`, renewal })
      await restart(renewal.stores, `${kind}-${mask}-${rejected}`, true)
    } else await restart(after, `${kind}-${mask}-${rejected}`, mask !== 3)
    if (kind === "ordinary" && mask === 3 && !rejected) for (const boundary of boundaries) await restart(boundary.after, `boundary-${boundary.stage}`, boundary.stage !== "done")
  }
  for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "resolved-ignored", "divergent", "read-failed", "rejected-read-failed", "disposed-unchanged", "disposed-applied"] as const) {
    const { h, owner, stores } = await open(recipes.ordinary.stores), { read, view } = await select(owner), before = stores(), boundaries: unknown[] = [], queued: Promise<unknown>[] = []
    let fired = false, disposal: Promise<void> | undefined
    h.write(async (items, apply) => {
      const name = newInstallationStage(items), before = stores()
      if (name !== stage || fired) { apply(items); boundaries.push({ stage: name, before, items, after: stores() }); return }
      fired = true
      queued.push(owner.readWithdrawnWork(ui).then(inspectedRead), owner.resumeInterimInstallation(ui), owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection }))
      if (!["rejected-unchanged", "resolved-ignored", "disposed-unchanged"].includes(mode)) apply(items)
      if (mode === "divergent") apply({ unrelated: { changed: true } })
      if (mode === "read-failed" || mode === "rejected-read-failed") h.get(async () => { h.get(undefined); throw h.readError })
      if (mode.startsWith("disposed")) disposal = owner.dispose()
      boundaries.push({ stage: name, mode, before, items, after: stores() })
      if (mode.startsWith("rejected")) throw h.error
    })
    const result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection })
    check(fired, "New acceptance stage fault reached")
    check(mode === "rejected-applied" ? result.kind === "recovered" : result.kind !== "recovered", "Fault result reflects exact readback")
    if (mode !== "rejected-applied") equal(h.writes.map(newInstallationStage).at(-1), stage, "No next effect after uncertainty or stop")
    check(h.writes.every(items => !Object.hasOwn(items, "device")), "Every new acceptance fault has zero Device writes")
    if (mode === "rejected-read-failed") {
      const fault = result.kind === "unconfirmed" ? result : result.kind === "authorized-pending" ? result.observation : undefined
      check(fault?.kind === "unconfirmed" && "observation" in fault && fault.write.kind === "rejected" && fault.write.error === h.error && fault.observation.kind === "read-failed" && fault.observation.error === h.readError, "New acceptance preserves independent write and read errors")
    }
    const queuedResults = await Promise.all(queued)
    check(queuedResults.slice(1).every(value => object(value) && value.kind !== "committed" && value.kind !== "recovered"), "Queued work stays fenced")
    if (disposal) await disposal; else await owner.dispose()
    observations.push({ stage, mode, before, read: inspectedRead(read), result, boundaries, queuedResults, after: stores(), reads: h.reads, writes: h.writes, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
  }
  const empty = await withdrawalConfirmedInstallationFixture("ordinary", { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false }, sessionConsent: 1 })
  await restart(empty.stores, "empty-fixed-effect", true)
  return { mode: "actual-confirmed-v2-new-installation-acceptance", assertions, cases: observations.length, recipes, observations, restarts, empty, native: "waived-and-unproven", production: "not-connected", privacyWordingApproval: "pending" }
}


export async function runWithdrawalInstallationSubsets(masks: readonly number[] = Array.from({ length: 64 }, (_, index) => index), initial?: JsonObject) {
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const cases: unknown[] = [], unreachable: unknown[] = []
  for (const rejected of [false, true]) for (const mask of masks) {
    const recipe = await withdrawalRetainedInstallationFixture({ mask, rejected, initial })
    if (recipe.kind === "schema-unreachable") { unreachable.push(recipe); continue }
    const h = observedWithdrawalHarness(recipe.stores.local), owner = createStartingLocalFilterWriter(h.deps)
    await owner.ready().catch(error => { if (!(error instanceof StartupReadinessError)) throw error })
    const read = await owner.readWithdrawnWork(ui)
    if (read.kind !== "held") throw Error("Original subset review unavailable")
    const view = read.work.find(view => view.kind === "retained-installation")
    if (view?.kind !== "retained-installation" || view.progress !== "accepted" || view.checkpoint !== "accepted" || h.writes.length) throw Error("Original subset not classified read only")
    let result: unknown
    const documentMask = Object.hasOwn(recipe.original.batch, "schema") ? mask % 2 ** (Object.keys(recipe.original.batch).length - 1) : mask
    if (masks.length < 64 || [0, 1, 2, 31, 62, 63].includes(documentMask)) {
      result = await owner.recoverWithdrawnWork(ui, { review: read.review, job: view.selection })
      if (!object(result) || result.kind !== "recovered") throw Error("Representative original subset did not finish")
      const batch = recipe.original.batch, allAfter = Object.entries(batch).every(([key, value]) => Object.hasOwn(recipe.stores.local, key) && sameSyncJson(recipe.stores.local[key]!, value))
      const documentWrites = h.writes.filter(items => !Object.hasOwn(items, interimConversionKey) && !Object.hasOwn(items, consentJobsKey))
      if (!sameSyncJson(documentWrites, allAfter ? [] : [batch])) throw Error("Subset continuation changed fixed batch")
    }
    cases.push({ mask, rejected, recipe, read: inspectedRead(read), result, after: { local: h.records(), session: recipe.stores.session, sync: recipe.stores.sync }, writes: h.writes, reads: h.reads, sourceReadAttempts: h.sourceReads, sourceSnapshots: h.sources, effects: h.effects })
    await owner.dispose()
  }
  return { masks: [...masks], settlements: ["resolved", "rejected"], cases, unreachable }
}
