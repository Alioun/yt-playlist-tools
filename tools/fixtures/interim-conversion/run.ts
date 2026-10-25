import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { executeInterimRetention, readRetainedInterim, readRetainedCheckpoint, projectInterimNote, isInterimSourceKey, isInterimCanonicalKey, type InterimPersistenceSnapshot, type StoreStartupHost } from "../../../src/background/store/interim-persistence"
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
export function interimSnapshot(records: Readonly<Record<string, unknown>>): InterimPersistenceSnapshot {
  const select = (keep: (key: string) => boolean) => Object.defineProperties({}, Object.fromEntries(Object.keys(records).filter(keep).map(key => [key, Object.getOwnPropertyDescriptor(records, key)!])))
  return { source: select(isInterimSourceKey), canonical: select(isInterimCanonicalKey),
    checkpoint: Object.hasOwn(records, "interimConversion") ? { kind: "present", value: Object.getOwnPropertyDescriptor(records, "interimConversion")?.value } : { kind: "absent" },
    historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }
}
type SetMode = "normal" | "rejected-unchanged" | "rejected-applied" | "resolved-partial" | "resolved-missing" | "rejected-divergent"
export function createInterimHarness(initial: JsonObject = interimFixture(), mode: SetMode = "normal") {
  let records = copy(initial), reads = 0
  const effects: unknown[] = [], writes: JsonObject[] = []
  let beforeSnapshot: ((n: number, records: JsonObject) => Promise<void>) | undefined
  let beforeSet: (() => Promise<void>) | undefined
  const error = new Error("Synthetic retention write failure"), readError = new Error("Synthetic snapshot failure")
  const startup: StoreStartupHost = {
    context: { deviceId: "synthetic-device", settingsGen: "synthetic-capture", at: 123, shortcutId: "conv01", platform: { browser: "firefox", os: "linux" }, commands: [] },
    async readInterimSnapshot() { reads++; effects.push({ snapshot: reads }); await beforeSnapshot?.(reads, records); return interimSnapshot(copy(records)) },
    async readSnapshot() { throw Error("Interim hold cannot enter legacy startup") },
    async removeLocal() { throw Error("Interim hold cannot remove source") }, async deleteDatabase() { throw Error("Interim hold cannot delete database") }, async removeSession() { throw Error("Interim hold cannot remove session") }
  }
  const deps = { startup,
    local: {
      async get(keys: readonly string[] | null) { effects.push({ get: keys }); return copy(keys === null ? records : Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))) },
      async set(items: Readonly<Record<string, JsonValue>>) {
        if (!object(items)) throw Error("Non-JSON retention write")
        effects.push({ set: copy(items) }); writes.push(copy(items)); await beforeSet?.()
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
  return { deps, effects, writes, error, readError, records: () => copy(records), mode(value: SetMode) { mode = value }, foreign(fn: (records: JsonObject) => void) { fn(records) }, snapshot(fn: typeof beforeSnapshot) { beforeSnapshot = fn }, set(fn: typeof beforeSet) { beforeSet = fn } }
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
  return { mode: "actual-owner-durable-synthetic-restart", assertions, observations, agreementObservations, production: "not-connected", native: "waived-and-unproven" }
}

if (import.meta.main) process.stdout.write(JSON.stringify(await runInterimConversion(), (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value, 2) + "\n")
