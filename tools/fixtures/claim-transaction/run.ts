import type { AgreementChoice, AgreementInput, AgreementResult } from "../../../src/background/store/consent-agreement"
import { decodeDocument, decodeSettings, defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId, type Unclaimed } from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import type { ClaimAuthority, ClaimAuthorityState } from "../../../src/background/store/local-claim-writer"
import { createLocalFilterWriter, createStartingLocalFilterWriter, type SettingsRead } from "../../../src/background/store/local-filter-writer"

import { LEGACY_DELETE_KEYS, type LegacyEvidence } from "../../../src/background/store/legacy"
import { isInterimSourceKey, isInterimCanonicalKey, type StoreStartupHost } from "../../../src/background/store/interim-persistence"

const context: StoreStartupHost["context"] = { deviceId: "fixture-device", settingsGen: "migration", at: 1,
  shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] }

function startupHost(area: { read(): Record<string, unknown>; remove(keys: readonly string[]): void }, effects: unknown[]): StoreStartupHost {
  return {
    context,
    async readInterimSnapshot() {
      const saved = area.read()
      return { source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
        canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
        checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
        historicalAuthorization: { kind: "unknown" as const }, priorCredentialPresence: { kind: "unknown" as const } }
    },
    async readSnapshot() {
      const records = area.read()
      const values: LegacyEvidence["values"] = {}
      for (const key of ["playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "channelFilters", "channelLabels"] as const) {
        if (Object.hasOwn(records, key)) values[key] = records[key]
      }
      return { schema: records.schema, device: records.device, settingsDocument: records["doc:settings"], unclaimed: records.unclaimed,
        legacy: { presentKeys: LEGACY_DELETE_KEYS.filter(key => Object.hasOwn(records, key)), values, refreshTokenWasNonempty: false },
        interimKeysPresent: Object.keys(records).filter(key => key.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(key)) }
    },
    async removeLocal(keys) { effects.push({ removeLocal: keys }); area.remove(keys) },
    async deleteDatabase(name) { effects.push({ deleteDatabase: name }) },
    async removeSession(keys) { effects.push({ removeSession: keys }) }
  }
}

export function followSettings(owner: Pick<ReturnType<typeof createStartingLocalFilterWriter>, "read" | "subscribe">, publish: (view: SettingsRead) => void) {
  let active = true, revision = 0
  let pending: Promise<void> = Promise.resolve()
  function refresh() {
    const reading = ++revision
    pending = owner.read("settings").then(view => {
      if (active && reading === revision) publish(view)
    })
    return pending
  }
  const unsubscribe = owner.subscribe(() => { void refresh().catch(() => {}) })
  const initial = refresh()
  return {
    initial,
    async settled() { for (;;) { const current = pending; await current; if (current === pending) return } },
    dispose() { active = false; revision++; unsubscribe() }
  }
}


export function agreementHarness(initial: JsonObject = {}, remote: JsonObject = {}) {
  let records = cloneAgreement(initial), syncRecords = cloneAgreement(remote), now = 200, generations = 0, reads = 0
  let setMode: "normal" | "rejected-applied" | "rejected-unchanged" | "ignored" | "partial" | "divergent" | "read-failed" | "rejected-read-failed" = "normal"
  let beforeGet: (() => Promise<void>) | undefined, beforeSet: (() => Promise<void>) | undefined
  const effects: unknown[] = [], batches: JsonObject[] = [], events: unknown[] = [], memory = new Map<string, unknown>([["remembered", true]])
  const writeError = new Error("Synthetic agreement write"), readError = new Error("Synthetic agreement readback")
  const host = startupHost({ read: () => cloneAgreement(records), remove(keys) { for (const key of keys) delete records[key] } }, effects)
  const deps = { startup: host,
    local: { async get(keys: readonly string[] | null) {
      effects.push({ get: keys }); reads++; await beforeGet?.()
      if ((setMode === "read-failed" || setMode === "rejected-read-failed") && batches.length > 0) throw readError
      return cloneAgreement(keys === null ? records : Object.fromEntries(Object.entries(records).filter(([key]) => keys.includes(key))))
    }, async set(items: Readonly<Record<string, JsonValue>>) {
      if (!isAgreementObject(items)) throw Error("Agreement non-JSON batch")
      batches.push(cloneAgreement(items)); effects.push({ set: cloneAgreement(items) }); await beforeSet?.()
      if (setMode === "rejected-unchanged") throw writeError
      if (setMode === "ignored") return
      if (setMode === "partial") records.device = cloneAgreement(items.device ?? null)
      else records = { ...records, ...cloneAgreement(items) }
      if (setMode === "divergent") records.foreign = true
      if (setMode === "rejected-applied" || setMode === "rejected-read-failed") throw writeError
    } },
    claim: { kind: "unavailable" as const },
    sync: { async get() { effects.push("sync-get"); return cloneAgreement(syncRecords) }, async set() { effects.push("sync-set"); throw Error("Agree cannot push") }, subscribe() { effects.push("sync-subscribe"); throw Error("Agree cannot subscribe") } },
    syncClock: { now() { effects.push("mono"); return 0 }, wallNow() { effects.push("wall"); return 1000000 }, after() { effects.push("timer"); throw Error("Agree cannot schedule") } },
    now() { effects.push({ stamp: now }); return now }, generation() { const gen = `agreement-${++generations}`; effects.push({ generation: gen }); return gen }, onSyncResult() { throw Error("Agree automatic callback") }
  }
  return { deps, effects, batches, events, memory, writeError, readError, records: () => cloneAgreement(records), counters: () => ({ reads, generations }),
    time(value: number) { now = value }, mode(value: typeof setMode) { setMode = value }, get(fn: typeof beforeGet) { beforeGet = fn }, set(fn: typeof beforeSet) { beforeSet = fn },
    foreign(fn: (raw: JsonObject) => void) { fn(records) }, remote(fn: (raw: JsonObject) => void) { fn(syncRecords) },
    retire(result: AgreementResult) { if (result.kind === "committed" && isAgreementObject(records["doc:settings"]) && isAgreementObject(records["doc:settings"].data) && isAgreementObject(records["doc:settings"].data.autoAdd) && records["doc:settings"].data.autoAdd.on === false) { memory.clear(); effects.push("memory-retired-before-activation") } }
  }
}
function cloneAgreement<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function isAgreementObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value) }
function stableAgreement(value: unknown): string { return JSON.stringify(value, (_, raw: unknown) => raw instanceof Error ? { name: raw.name, message: raw.message } : raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) : raw) }
export async function runCanonicalAgreements(api = { create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter }) {
  const outcomes: unknown[] = []
  let assertions = 0
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  const privateUi = { ...ui, incognito: true }
  const allowed = { www: true, music: true, browserMenu: true }, denied = { www: true, music: false, browserMenu: false }
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture-device", future: [null] }
  const canonical = (settings = defaultSettings(), syncOn = false): JsonObject => ({ schema: 1, device: { id: "stored-identity", consent: null, syncOn, future: { keep: true } }, "doc:settings": { ...stamp, data: settings as unknown as JsonObject } })
  async function execute(name: string, initial: JsonObject, choice: AgreementChoice, access = allowed, remote: JsonObject = {}) {
    const h = agreementHarness(initial, remote), owner = api.create(h.deps)
    check(await owner.ready() === "ok", "agreement actual startup")
    owner.subscribe(event => h.events.push(event))
    const review = await owner.readAgreement(ui)
    check(review.kind === "review", "agreement canonical review")
    const before = h.records(), begin = h.effects.length
    h.effects.push("initiating-explicit-Agree")
    function requestMusic() { h.effects.push("request-music-before-await"); return Promise.resolve(access.music) }
    function requestMenu() { h.effects.push("request-menu-before-await"); return Promise.resolve(access.browserMenu) }
    const music = requestMusic(), menu = requestMenu()
    const observation = Promise.all([music, menu]).then(([music, browserMenu]) => ({ www: access.www, music, browserMenu }))
    const input = { review: review.review, displayedVersion: review.version, choice, access: observation }
    const result = await owner.agree(ui, input)
    h.retire(result)
    check(result.kind === "committed", "agreement combined commit")
    check(result.consent.at === 200 && result.consent.v === 1, "agreement invocation clock")
    check(h.effects.slice(begin).indexOf("request-menu-before-await") < h.effects.slice(begin).findIndex(effect => isAgreementObject(effect) && "get" in effect), "permissions initiated before Store await")
    const rawDevice = h.records().device
    check(isAgreementObject(rawDevice) && (isAgreementObject(before.device) ? rawDevice.id === before.device.id : rawDevice.id === context.deviceId), "agreement existing identity wins")
    h.time(999)
    const duplicate = await owner.agree(ui, input)
    check(duplicate.kind === "unchanged" && duplicate.consent.at === 200, "agreement duplicate keeps time")
    const saved = h.records(), serialized = JSON.stringify(saved), writes = h.batches.length
    await owner.dispose()
    const restartHarness = agreementHarness(JSON.parse(serialized), remote), restarted = api.create(restartHarness.deps)
    check(await restarted.ready() === "ok", "canonical agreement restart ready")
    const restart = await restarted.readAgreement(privateUi)
    check(restart.kind === "review" && restart.presentation.kind === "canonical" && restart.presentation.consent?.at === 200, "canonical agreement restart consent")
    check(restartHarness.batches.length === 0 && restartHarness.counters().generations === 0 && h.batches.length === writes, "restart has no restamp or preset replay")
    await restarted.dispose()
    outcomes.push({ name, initial, before, disclosure: review.presentation, choice, access, result, duplicate, serialized, saved, restart, restartEffects: restartHarness.effects, batches: h.batches, effects: h.effects, events: h.events, counters: h.counters(), memorySize: h.memory.size })
    return { h, result, saved }
  }
  const zero = await execute("first-run-zero", {}, { kind: "first-run", selected: [], syncOn: false })
  check(!Object.hasOwn(zero.saved, "doc:settings") && !Object.hasOwn(zero.saved, "sync"), "zero feature consent creates no Settings or history")
  const first = await execute("first-run-held-presets", {}, { kind: "first-run", selected: ["shortcuts", "music-keys", "browser-menu"], syncOn: false }, denied)
  check(first.result.settingsChanged && first.result.applications.some(app => app.state.kind === "held"), "first run denied features saved held")
  check(isAgreementObject(first.saved.sync) && first.saved.sync.everEdited === true && first.saved.sync.editedSinceOff === true, "agreement actual edit uses true provenance")
  const upgrade = await execute("original-upgrade-agree", { playlists: ["PLabcdefghijklmnop"], watchLaterShortcut: "k" }, { kind: "upgrade-note", selected: ["auto-add", "shortcuts"], syncOn: false, percentage: "half" })
  check(isAgreementObject(upgrade.saved.device) && isAgreementObject(upgrade.saved.device.upgradeNote) && upgrade.saved.device.upgradeNote.state === "done", "original note completes only via Agree")
  check(isAgreementObject(upgrade.saved["doc:settings"]) && isAgreementObject(upgrade.saved["doc:settings"].data) && isAgreementObject(upgrade.saved["doc:settings"].data.autoAdd) && upgrade.saved["doc:settings"].data.autoAdd.pct === 50, "original unset percentage choice")
  for (const feature of ["music-actions", "music-keys", "shortcuts", "any-tab-keys", "browser-menu"] as const) {
    const result = await execute(`denied-${feature}`, canonical(), { kind: "feature", feature }, denied)
    const data = result.saved["doc:settings"]
    if (feature === "music-keys") check(isAgreementObject(data) && isAgreementObject(data.data) && isAgreementObject(data.data.musicKeys) && data.data.musicKeys.on === false && data.data.musicKeys.preset === false, "denied feature does not spend preset")
    if (feature === "shortcuts") check(isAgreementObject(data) && isAgreementObject(data.data) && isAgreementObject(data.data.shortcuts) && data.data.shortcuts.on === true && data.data.shortcuts.music === false, "shortcuts exception saves YouTube only")
    if (feature === "any-tab-keys") check(result.result.applications.some(app => app.scope === "music" && app.state.kind === "held"), "any tab exception keeps feature held")
  }
  const settings = defaultSettings(); settings.autoAdd.on = true
  const progress = await execute("original-auto-add-off-clears-all-progress", { playlists: ["PLabcdefghijklmnop"], "progress:AAAAAAAAAAAAAAAA:0": { remembered: 1 }, "progress:BBBBBBBBBBBBBBBB:15": { remembered: 2 } }, { kind: "upgrade-note", selected: [], percentage: "keep", syncOn: false })
  check(stableAgreement(progress.saved["progress:AAAAAAAAAAAAAAAA:0"]) === "{}" && stableAgreement(progress.saved["progress:BBBBBBBBBBBBBBBB:15"]) === "{}" && progress.h.memory.size === 0, "agreement progress and memory retired")
  const joined = canonical(defaultSettings(), true)
  joined.sync = { joined: "history", pushed: { "doc:settings": "old" }, status: "ok", editedSinceOff: false, everEdited: false, opaqueWrite: { gate: { kind: "held", notBefore: 1060000, future: [null] }, diagnostic: { name: "Original", message: "opaque", keep: true } }, future: { keep: true } }
  const remote: JsonObject = { "s:meta": { v: 1, id: "history", created: 0 }, "s:settings": joined["doc:settings"]! }
  const edited = await execute("stable-joined-feature", joined, { kind: "feature", feature: "queue-button" }, allowed, remote)
  check(isAgreementObject(edited.saved.sync) && edited.saved.sync.everEdited === true && edited.saved.sync.editedSinceOff === false && stableAgreement(edited.saved.sync.opaqueWrite) === stableAgreement((joined.sync as JsonObject).opaqueWrite), "joined provenance preserves R155")
  const deviceOnly = await execute("joined-device-only-disclosure", joined, { kind: "disclosure" }, allowed, remote)
  check(!deviceOnly.h.effects.includes("sync-get") && stableAgreement(deviceOnly.saved.sync) === stableAgreement(joined.sync), "device-only agreement has no sync effect")
  for (const mode of ["rejected-applied", "rejected-unchanged", "ignored", "partial", "divergent", "read-failed", "rejected-read-failed"] as const) {
    const h = agreementHarness(canonical()), owner = api.create(h.deps); await owner.ready()
    const review = await owner.readAgreement(ui); check(review.kind === "review", "fault canonical review")
    h.mode(mode)
    const result = await owner.agree(ui, { review: review.review, displayedVersion: review.version, choice: { kind: "feature", feature: "queue-button" }, access: Promise.resolve(allowed) })
    const expected = mode === "rejected-applied" ? "committed" : mode === "rejected-unchanged" ? "failed" : "unconfirmed"
    check(result.kind === expected, "canonical exact observation classification " + mode)
    if (mode === "rejected-applied") check(result.kind === "committed" && result.mutations[0]?.write.kind === "rejected" && result.mutations[0].write.error === h.writeError, "applied rejection preserves identity")
    if (mode === "rejected-unchanged") check(result.kind === "failed" && result.stage === "canonical" && result.write.error === h.writeError, "unchanged rejection preserves identity")
    if (mode === "read-failed" || mode === "rejected-read-failed") check(result.kind === "unconfirmed" && result.cause.kind === "read-failed" && result.cause.error === h.readError, "distinct read error retained")
    if (mode === "rejected-read-failed") check(result.kind === "unconfirmed" && result.write.kind === "rejected" && result.write.error === h.writeError, "independent write and read errors retained")
    const barrier = await owner.readAgreement(ui)
    if (expected === "unconfirmed") {
      check(barrier.kind === "unavailable" && barrier.reason === "stale", "agreement uncertainty closes agreement reads")
      check((await owner.read("settings")).kind === "unavailable" && (await owner.claim()).kind === "unavailable" && (await owner.flushSync()).kind === "unavailable", "agreement uncertainty closes ordinary owner")
    }
    await owner.dispose(); outcomes.push({ name: `canonical-${mode}`, result, barrier, records: h.records(), batches: h.batches, effects: h.effects, counters: h.counters() })
  }
  for (const fault of ["full", "newer", "reset", "different-history", "ticked-sync", "stale-review", "copied-review", "private-origin-mismatch", "access-rejection"] as const) {
    const h = agreementHarness(fault === "ticked-sync" ? {} : joined, remote), owner = api.create(h.deps); await owner.ready()
    const review = await owner.readAgreement(ui); check(review.kind === "review", "admission review")
    if (fault === "full") h.remote(raw => { for (let i = 0; i < 481; i++) raw[`occupied-${i}`] = "retained" })
    if (fault === "newer") h.remote(raw => { raw["s:settings"] = { ...stamp, v: 2, data: {} } })
    if (fault === "reset") h.remote(raw => { raw["s:meta"] = { v: 1, id: "history", created: 0, reset: true } })
    if (fault === "different-history") h.remote(raw => { raw["s:meta"] = { v: 1, id: "other", created: 0 } })
    if (fault === "stale-review") h.foreign(raw => { raw.extra = true })
    const before = h.records(), writes = h.batches.length
    const choice = fault === "ticked-sync" ? { kind: "first-run", selected: [], syncOn: true } : { kind: "feature", feature: "queue-button" }
    const input = { review: fault === "copied-review" ? { ...review.review } : review.review, displayedVersion: review.version, choice, access: fault === "access-rejection" ? Promise.reject(h.writeError) : Promise.resolve(allowed) }
    const result = await owner.agree(fault === "private-origin-mismatch" ? privateUi : ui, input as AgreementInput)
    check(result.kind !== "committed" && h.batches.length === writes && stableAgreement(before) === stableAgreement(h.records()), "refusal saves neither consent nor Settings " + fault)
    if (fault === "full" || fault === "newer") check(result.kind === "refused" && result.reason === (fault === "full" ? "sync-full" : "update-needed"), "R161 refusal reason")
    if (fault === "ticked-sync") check(result.kind === "unavailable" && result.reason === "join-required", "true sync tick is never dropped")
    await owner.dispose(); outcomes.push({ name: fault, result, records: h.records(), batches: h.batches, effects: h.effects })
  }
  {
    const acct = "AAAAAAAAAAAAAAAA", playlist = "PLabcdefghijklmnop"
    if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid agreement claim identifiers")
    const h = agreementHarness(upgrade.saved)
    let lookups = 0
    const authority: ClaimAuthority = { acct, lease: "after-agreement", browserSession: "synthetic-session", consentGeneration: "canonical", signedIn: true, incognito: false }
    const owner = api.create({ ...h.deps, claim: {
      kind: "fixture",
      authority: { async read() { return { kind: "ready", authority } } },
      session: { async takeLookup() { return true } },
      ownership: { async lookup() { lookups++; return { kind: "fixture-owned", authority, lineage: "local-migration-only", ownedPlaylistIds: new Set([playlist]) } } }
    } })
    await owner.ready()
    const claim = await owner.claim(), pending = await owner.readClaimNotice()
    check(claim.kind === "committed" && pending.kind === "pending" && lookups === 1, "claim is a separate normal ownership action after actual Agree")
    const acknowledgement = await owner.acknowledgeClaimNotice(ui, pending.notice)
    check(acknowledgement.kind === "committed" && (await owner.readClaimNotice()).kind === "empty", "claim notice needs separate OK after Agree")
    await owner.dispose(); outcomes.push({ name: "actual-agreement-then-claim-and-notice-OK", agreementSaved: upgrade.saved, claim, pending, acknowledgement, lookups, records: h.records(), batches: h.batches, effects: h.effects })
  }
  {
    const setup = "doc:setup:AAAAAAAAAAAAAAAA", local = cloneAgreement(joined), sync = cloneAgreement(remote)
    local[setup] = { ...stamp, gen: "setup-ack", data: {} }; sync["s:setup:AAAAAAAAAAAAAAAA"] = cloneAgreement(local[setup]!)
    check(isAgreementObject(local.sync) && isAgreementObject(local.sync.pushed), "repair history input")
    local.sync.pushed[setup] = "before-ack"
    const changed = await execute("joined-repair-before-first-edit", local, { kind: "feature", feature: "queue-button" }, allowed, sync)
    check(isAgreementObject(changed.saved.sync) && isAgreementObject(changed.saved.sync.pushed) && changed.saved.sync.pushed[setup] === "setup-ack" && changed.saved.sync.everEdited === true, "agreement composes admitted repair before provenance")
  }
  for (const fault of ["noop-full", "noop-newer", "private-agreement", "reserved-preset", "deleted-original", "saved-percentage", "off-edit-back-to-defaults"] as const) {
    const savedSettings = defaultSettings()
    savedSettings.queueButton.on = fault === "noop-full" || fault === "noop-newer"
    savedSettings.musicKeys.on = fault === "off-edit-back-to-defaults"
    const local = fault === "saved-percentage" ? { playlists: ["PLabcdefghijklmnop"], requiredWatchPercentage: 82 } : canonical(savedSettings, fault.startsWith("noop-"))
    if (fault.startsWith("noop-") && isAgreementObject(local)) local.sync = cloneAgreement(joined.sync!)
    if (fault === "reserved-preset" || fault === "deleted-original") {
      local.unclaimed = { from: "1.4.5", autoAdd: [], shortcutPlaylist: "WL", originalShortcutId: "orig01", filters: {}, at: 1 }
      if (fault === "deleted-original") { savedSettings.shortcuts.preset = true; local["doc:settings"] = { ...stamp, data: savedSettings as unknown as JsonObject } }
    }
    const sync = cloneAgreement(remote)
    if (fault === "noop-full") { sync["s:settings"] = cloneAgreement(local["doc:settings"]!); for (let i = 0; i < 481; i++) sync[`occupied-${i}`] = "retained" }
    if (fault === "noop-newer") sync["s:settings"] = { ...stamp, v: 2, data: {} }
    const h = agreementHarness(local as JsonObject, sync), owner = api.create(h.deps); await owner.ready()
    const origin = fault === "private-agreement" ? privateUi : ui
    const review = await owner.readAgreement(origin); check(review.kind === "review", "extra agreement review")
    const choice: AgreementChoice = fault === "saved-percentage" ? { kind: "upgrade-note", selected: ["auto-add"], percentage: "keep", syncOn: false }
      : fault === "off-edit-back-to-defaults" ? { kind: "feature", feature: "music-keys" }
      : { kind: "feature", feature: fault === "reserved-preset" || fault === "deleted-original" ? "shortcuts" : "queue-button" }
    const result = await owner.agree(origin, { review: review.review, displayedVersion: review.version, choice, access: Promise.resolve(fault === "off-edit-back-to-defaults" ? denied : allowed) })
    check(result.kind === (fault === "reserved-preset" || fault === "noop-newer" ? "refused" : "committed"), "extra agreement result " + fault)
    const saved = h.records()
    if (fault === "noop-full") check(result.kind === "committed" && result.settingsChanged === false && h.batches.length === 1 && Object.keys(h.batches[0]!).length === 1 && stableAgreement(saved.sync) === stableAgreement(joined.sync), "full no-op changes Device only without repair")
    if (fault === "deleted-original") { const view = decodeDocument(saved["doc:settings"], decodeSettings); check(view.kind === "value" && view.document.data.shortcuts.list.length === 0, "deleted migrated row never recreated by Agree") }
    if (fault === "saved-percentage") { const view = decodeDocument(saved["doc:settings"], decodeSettings); check(view.kind === "value" && view.document.data.autoAdd.pct === 82, "Agree preserves saved percentage") }
    if (fault === "off-edit-back-to-defaults") check(isAgreementObject(saved.sync) && saved.sync.everEdited === true, "actual edit back to defaults has true provenance")
    await owner.dispose(); outcomes.push({ name: fault, result, records: saved, batches: h.batches, effects: h.effects, counters: h.counters() })
  }

  {
    const local = cloneAgreement(joined)
    if (!isAgreementObject(local.device)) throw Error("No active Device")
    local.device.consent = { v: 1, at: 1 }
    const h = agreementHarness(local, remote), callbacks: (() => void)[] = [], timers: { run: () => void; cancelled: boolean }[] = [], automatic: unknown[] = []
    let unsubscribed = 0
    const owner = api.create({ ...h.deps,
      sync: { ...h.deps.sync, subscribe(changed) { callbacks.push(changed); return () => { unsubscribed++ } } },
      syncClock: { ...h.deps.syncClock, after(_milliseconds, run) { const timer = { run, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true } } },
      onSyncResult(result) { automatic.push(result) }
    })
    await owner.ready(); await owner.startSync()
    check(callbacks.length === 1, "active owner subscription control")
    const shown = await owner.readAgreement(ui); check(shown.kind === "review", "active agreement review")
    h.mode("ignored")
    const result = await owner.agree(ui, { review: shown.review, displayedVersion: shown.version, choice: { kind: "feature", feature: "queue-button" }, access: Promise.resolve(allowed) })
    check(result.kind === "unconfirmed", "active ignored Agree stays uncertain")
    const before = h.effects.length
    for (const callback of callbacks) callback()
    for (const timer of timers) timer.run()
    await owner.startSync(); await owner.flushSync(); await owner.read("settings"); await owner.readClaimNotice(); await owner.claim()
    check(h.effects.length === before && unsubscribed === 1 && timers.every(timer => timer.cancelled), "agreement barrier retires subscription and stale timer ingress")
    await owner.dispose(); outcomes.push({ name: "active-agreement-global-barrier", result, automatic, unsubscribed, timers: timers.map(timer => ({ cancelled: timer.cancelled })), records: h.records(), batches: h.batches, effects: h.effects })
  }
  for (const terminal of [false, true]) {
    const h = agreementHarness(canonical()), owner = api.create(h.deps); await owner.ready()
    const shown = await owner.readAgreement(ui); check(shown.kind === "review", "A-B-A actual review")
    const input = { review: shown.review, displayedVersion: shown.version, choice: { kind: "feature", feature: "queue-button" } as const, access: Promise.resolve(allowed) }
    if (terminal) check((await owner.agree(ui, input)).kind === "committed", "terminal A-B-A actual agreement")
    const saved = h.records(), writes = h.batches.length
    h.foreign(raw => { raw["doc:settings"] = { ...stamp, gen: "observed-B", data: { theme: "dark" } } })
    await owner.read("settings")
    h.foreign(raw => { raw["doc:settings"] = cloneAgreement(saved["doc:settings"]!) })
    await owner.read("settings")
    const result = await owner.agree(ui, input)
    check(result.kind === "unavailable" && result.reason === "stale" && h.batches.length === writes, "observed A-B-A permanently invalidates " + (terminal ? "terminal" : "review"))
    await owner.dispose(); outcomes.push({ name: terminal ? "terminal-observed-A-B-A" : "review-observed-A-B-A", result, saved: h.records(), batches: h.batches, effects: h.effects })
  }
  return { assertions, outcomes }
}

export async function runClaimFixture(api = { create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter }) {
  const acct = "synthetic_acct01", playlist = "PLowned"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw new Error("Invalid synthetic fixture identifiers")
  const authority: ClaimAuthority = { acct, lease: "fixture-lease", browserSession: "fixture-session",
    consentGeneration: "fixture-consent", signedIn: true, incognito: false }
  const device = { ...defaultDevice("fixture-device"), consent: { v: 1, at: 1 }, extension: { keep: true } }
  const settings = defaultSettings()
  settings.shortcuts.list = [{ id: "orig01", key: null, label: "Renamed", watchLaterOnEveryAccount: true }]
  const envelope = (data: unknown) => ({ v: 1, gen: "old", at: 1, by: "fixture-device", data, extension: "retained" })
  const carried: Unclaimed = { from: "1.5.0", autoAdd: [playlist], shortcutPlaylist: playlist,
    originalShortcutId: "orig01", filters: { [playlist]: { mode: "allow", on: false, channels: [] } }, at: 1 }
  const cases = ["choices", "existing", "filter-only", "skipped-empty", "joint"] as const
  const outcomes = []
  for (const name of cases) {
    const source: Unclaimed = name === "filter-only" ? { ...carried, autoAdd: [], shortcutPlaylist: null }
      : name === "skipped-empty" ? { ...carried, autoAdd: [], filters: {}, originalShortcutId: "gone01" } : carried
    let records: Record<string, unknown> = {
      schema: 1, device, "doc:settings": envelope(settings), unclaimed: source,
      sync: { joined: "old-history", pushed: {}, status: "off", editedSinceOff: false, extension: "keep" }
    }
    if (name === "existing") {
      records[`doc:setup:${acct}`] = envelope({ ...defaultSetup(), autoAdd: [{ pl: playlist, takes: "shorts", pct: 0 }], targets: { orig01: playlist } })
      records[`doc:filter:${acct}:${playlist}`] = envelope({ mode: "deny", on: true, channels: [] })
    }
    const batches: Readonly<Record<string, JsonValue>>[] = []
    const checked = new Set<string>()
    let lookups = 0, generations = 0, reads = 0
    let releaseLookup = () => {}, enteredLookup = () => {}
    const held = new Promise<void>(resolve => { releaseLookup = resolve })
    const entered = new Promise<void>(resolve => { enteredLookup = resolve })
    const deps = {
      local: {
        async get() { reads++; const saved: Record<string, unknown> = JSON.parse(JSON.stringify(records)); return saved },
        async set(items: Readonly<Record<string, JsonValue>>) {
          const saved: Record<string, JsonValue> = JSON.parse(JSON.stringify(items))
          batches.push(saved)
          records = { ...records, ...saved }
        }
      },
      claim: { kind: "fixture" as const,
        authority: { async read(): Promise<ClaimAuthorityState> { return { kind: "ready", authority } } },
        session: { async takeLookup(active: ClaimAuthority) {
          const key = `${active.acct}:${active.browserSession}`
          if (checked.has(key)) return false
          checked.add(key)
          return true
        } },
        ownership: { async lookup(active: ClaimAuthority) {
          lookups++
          if (name === "joint") { enteredLookup(); await held }
          return { kind: "fixture-owned" as const, authority: active,
            lineage: "local-migration-only" as const, ownedPlaylistIds: new Set([playlist]) }
        } }
      },
      sync: { async get() { throw Error("Unexpected sync read") }, async set() { throw Error("Unexpected sync write") }, subscribe() { throw Error("Unexpected subscription") } },
      syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Unexpected timer") } },
      onSyncResult() {},
      now: () => 100, generation: () => `fixture-${++generations}`
    }
    const startupEffects: unknown[] = []
    const startup = startupHost({ read: () => JSON.parse(JSON.stringify(records)), remove(keys) { for (const key of keys) delete records[key] } }, startupEffects)
    const writer = api.create({ ...deps, startup })
    if (await writer.ready() !== "ok") throw Error("Canonical startup was not ready")
    const claiming = writer.claim()
    let joint
    if (name === "joint") {
      await entered
      const before = { reads, sets: batches.length }
      const editing = writer.change({ kind: "ui", windowId: 1, incognito: false }, {
        acct, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed"
      })
      for (let turn = 0; turn < 20; turn++) await Promise.resolve()
      if (reads !== before.reads || batches.length !== before.sets) throw Error("Filter entered held claim lane")
      releaseLookup()
      const claimed = await claiming
      const savedNotice = JSON.stringify(records.device)
      const edit = await editing
      if (claimed.kind !== "committed" || edit.kind !== "result" || !("ok" in edit.result) ||
        records.unclaimed !== null || JSON.stringify(records.device) !== savedNotice || batches.length !== 2) throw Error("Joint claim/edit did not preserve notice/null")
      joint = { held: before, edit, filter: records[`doc:filter:${acct}:${playlist}`], preservedNoticeAndNull: true }
    }
    const result = await claiming
    if (result.kind === "committed") {
      const sync = records.sync
      if (!sync || typeof sync !== "object" || !("editedSinceOff" in sync)) throw Error("Missing saved history")
      const changed = generations > 0
      if (changed ? !("everEdited" in sync) || sync.everEdited !== true || sync.editedSinceOff !== true : "everEdited" in sync || sync.editedSinceOff !== false) throw Error("Claim provenance follows actual documents only")
    }
    await writer.dispose()
    const serialized = JSON.stringify(records)
    records = JSON.parse(serialized)
    const restarted = api.create({ ...deps, startup })
    if (await restarted.ready() !== "ok") throw Error("Consumed restart was not ready")
    const restart = await restarted.claim()
    await restarted.dispose()
    outcomes.push({ name, initialization: "separately-preinitialized-consented-fixture", startupEffects, result, restart, ...(joint ? { joint } : {}), saved: records, batches, lookups, generations })
  }
  const startupOutcomes = []
  for (const name of ["fresh", "released-legacy", "cleanup-resume"] as const) {
    let records: Record<string, unknown> = name === "fresh" ? {} : { playlists: ["PLabcdefghijklmnop"], watchLaterShortcut: "k" }
    const effects: unknown[] = []
    const batches: Readonly<Record<string, JsonValue>>[] = []
    const startup = startupHost({ read: () => JSON.parse(JSON.stringify(records)), remove(keys) { for (const key of keys) delete records[key] } }, effects)
    const deps = {
      startup,
      local: { async get() { return JSON.parse(JSON.stringify(records)) }, async set(items: Readonly<Record<string, JsonValue>>) {
        batches.push(JSON.parse(JSON.stringify(items))); records = { ...records, ...items }
      } },
      claim: { kind: "fixture" as const,
        authority: { async read(): Promise<ClaimAuthorityState> { return { kind: "ready", authority } } },
        session: { async takeLookup() { throw Error("Startup claim reached lookup budget") } },
        ownership: { async lookup() { throw Error("Startup claim reached ownership") } }
      },
      sync: { async get() { throw Error("Unexpected startup sync read") }, async set() { throw Error("Unexpected startup sync write") }, subscribe() { throw Error("Unexpected startup subscription") } },
      syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Unexpected startup timer") } },
      onSyncResult() {}, now: () => 100, generation() { throw Error("Unexpected startup generation") }
    }
    if (name === "cleanup-resume") {
      const first = api.create({ ...deps, startup: { ...startup, async deleteDatabase() { throw Error("Synthetic interrupted cleanup") } } })
      try { await first.ready(); throw Error("Interrupted cleanup released") } catch (error) {
        if (!(error instanceof Error) || error.message !== "Synthetic interrupted cleanup") throw error
      }
      await first.dispose()
      records = JSON.parse(JSON.stringify(records))
    }
    const writer = api.create(deps)
    const ready = await writer.ready()
    const claim = await writer.claim()
    await writer.dispose()
    if (ready !== "ok" || records.schema !== 1 || LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key))) throw Error("Startup fixture failed")
    if (claim.kind !== "unavailable" || claim.reason !== "startup") throw Error("Startup consent/note guard bypassed")
    startupOutcomes.push({ name, ready, claim, saved: records, batches, effects })
  }
  const settingsOutcomes = []
  for (const name of ["canonical-settings-load-edit-follow", "preconsent-settings-read"] as const) {
    const consented = name === "canonical-settings-load-edit-follow"
    const savedClaim = JSON.parse(JSON.stringify(outcomes[0]?.saved))
    let records: Record<string, unknown> = consented ? savedClaim : { schema: 1 }
    const preservedDevice = JSON.stringify(records.device), preservedUnclaimed = JSON.stringify(records.unclaimed)
    const batches: Readonly<Record<string, JsonValue>>[] = [], effects: unknown[] = []
    let generations = 0
    const deps = {
      startup: startupHost({ read: () => JSON.parse(JSON.stringify(records)), remove(keys) { for (const key of keys) delete records[key] } }, effects),
      local: { async get(keys: readonly string[] | null) { return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))) },
        async set(items: Readonly<Record<string, JsonValue>>) { batches.push(JSON.parse(JSON.stringify(items))); records = { ...records, ...items } } },
      claim: { kind: "unavailable" as const },
      sync: { async get() { throw Error("Settings read/edit while off reached sync") }, async set() { throw Error("Settings read/edit while off pushed") }, subscribe() { throw Error("Settings follow created native subscription") } },
      syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Settings follow scheduled work") } },
      onSyncResult() { throw Error("Settings follow attempted sync") }, now: () => 100, generation: () => `settings-${++generations}`
    }
    const writer = api.create(deps)
    if (await writer.ready() !== "ok") throw Error("Settings owner not ready")
    const followed: SettingsRead[] = []
    const follower = followSettings(writer, view => { followed.push(view) })
    await follower.initial
    const theme = await writer.changeSharedSetting({ kind: "ui", windowId: 1, incognito: true }, { kind: "theme", value: "dark" })
    await follower.settled()
    const percentage = await writer.changeSharedSetting({ kind: "ui", windowId: 1, incognito: false }, { kind: "default-percentage", value: 0 })
    await follower.settled()
    const final = await writer.read("settings")
    if (final.kind !== "value") throw Error("Settings view not readable")
    if (consented) {
      if (theme.kind !== "committed" || percentage.kind !== "committed" || final.settings.theme !== "dark" || final.settings.autoAdd.pct !== 0 || followed.length !== 3 ||
        followed[1]?.kind !== "value" || followed[1].settings.theme !== "dark" || followed[2]?.kind !== "value" || followed[2].settings.autoAdd.pct !== 0) throw Error("Settings follow did not observe both confirmed values")
    } else if (theme.kind !== "unavailable" || theme.reason !== "startup" || percentage.kind !== "unavailable" || final.settings.theme !== "system" || final.settings.autoAdd.pct !== 50 || batches.length || generations) throw Error("Preconsent Settings read/write boundary failed")
    follower.dispose(); await writer.dispose()
    records = JSON.parse(JSON.stringify(records))
    const restarted = api.create(deps)
    if (await restarted.ready() !== "ok") throw Error("Settings restart not ready")
    const restart = await restarted.read("settings")
    await restarted.dispose()
    if (JSON.stringify(restart) !== JSON.stringify(final) || JSON.stringify(records.device) !== preservedDevice || JSON.stringify(records.unclaimed) !== preservedUnclaimed) throw Error("Settings restart changed view or saved claim notice/null")
    settingsOutcomes.push({ name, origin: "trusted-synthetic-injection-no-production-sender-validation", followed, theme, percentage, final, restart, batches, effects, generations, saved: records })
  }
  const noticeOutcomes = []
  {
    let records: Record<string, unknown> = { schema: 1, device: JSON.parse(JSON.stringify(device)),
      "doc:settings": envelope(settings), unclaimed: JSON.parse(JSON.stringify(carried)),
      sync: { joined: "old-history", pushed: {}, status: "off", editedSinceOff: false, extension: "keep" } }
    const input = JSON.parse(JSON.stringify(records))
    const batches: Readonly<Record<string, JsonValue>>[] = [], effects: unknown[] = [], events: unknown[] = []
    const counters = { reads: 0, generations: 0, stamps: 0, monotonic: 0, wall: 0, lookups: 0, authority: 0, sync: 0, timers: 0 }
    const deps = {
      startup: startupHost({ read: () => JSON.parse(JSON.stringify(records)), remove(keys) { for (const key of keys) delete records[key] } }, effects),
      local: { async get() { counters.reads++; return JSON.parse(JSON.stringify(records)) }, async set(items: Readonly<Record<string, JsonValue>>) {
        const saved = JSON.parse(JSON.stringify(items)); batches.push(saved); records = { ...records, ...saved }
      } },
      claim: { kind: "fixture" as const,
        authority: { async read(): Promise<ClaimAuthorityState> { counters.authority++; return { kind: "ready", authority } } },
        session: { async takeLookup() { return true } },
        ownership: { async lookup(active: ClaimAuthority) { counters.lookups++; return { kind: "fixture-owned" as const, authority: active, lineage: "local-migration-only" as const, ownedPlaylistIds: new Set([playlist]) } } }
      },
      sync: { async get() { counters.sync++; throw Error("Notice accessed sync") }, async set() { counters.sync++; throw Error("Notice wrote sync") }, subscribe() { counters.sync++; throw Error("Notice subscribed") } },
      syncClock: { now() { counters.monotonic++; return 0 }, wallNow() { counters.wall++; return 1000000 }, after() { counters.timers++; throw Error("Notice scheduled timer") } },
      now() { counters.stamps++; return 100 }, generation() { return `notice-${++counters.generations}` }, onSyncResult() { throw Error("Notice emitted sync result") }
    }
    let writer = api.create(deps)
    if (await writer.ready() !== "ok") throw Error("Notice startup not ready")
    const claim = await writer.claim()
    if (claim.kind !== "committed") throw Error("Notice claim did not commit")
    const savedBeforeOK = JSON.parse(JSON.stringify(records)), claimBatches = batches.length
    const first = await writer.readClaimNotice(), second = await writer.readClaimNotice()
    if (first.kind !== "pending" || JSON.stringify(first) !== JSON.stringify(second)) throw Error("Saved notice not pending")
    await writer.dispose()
    records = JSON.parse(JSON.stringify(records))
    writer = api.create(deps)
    if (await writer.ready() !== "ok") throw Error("Notice pending restart not ready")
    const pendingAfterRestart = await writer.readClaimNotice()
    if (JSON.stringify(pendingAfterRestart) !== JSON.stringify(first) || JSON.stringify(records) !== JSON.stringify(savedBeforeOK) || batches.length !== claimBatches) throw Error("Read/restart acknowledged notice")
    const displayed = pendingAfterRestart
    if (displayed.kind !== "pending") throw Error("No notice for popup")
    const presentation = { kind: "synthetic-popup-presentation", visible: true, selected: "claim-notice", notice: displayed.notice }
    const action = { kind: "explicit-popup-OK", origin: { kind: "ui", windowId: 1, incognito: false } as const }
    writer.subscribe(event => events.push(event))
    const before = { ...counters }
    const acknowledgement = await writer.acknowledgeClaimNotice(action.origin, presentation.notice)
    const reread = await writer.readClaimNotice(), duplicateOK = await writer.acknowledgeClaimNotice(action.origin, presentation.notice)
    const after = { ...counters }
    if (acknowledgement.kind !== "committed" || reread.kind !== "empty" || duplicateOK.kind !== "unchanged" || duplicateOK.reason !== "empty" || batches.length !== claimBatches + 1 || events.length ||
      ["generations", "stamps", "monotonic", "wall", "authority", "lookups", "sync", "timers"].some(key => before[key as keyof typeof before] !== after[key as keyof typeof after])) throw Error("Notice OK effects mismatch")
    const noticeBatch = batches[claimBatches]
    const expectedSaved = JSON.parse(JSON.stringify(savedBeforeOK)); expectedSaved.device.claimNotice = null
    if (JSON.stringify(records) !== JSON.stringify(expectedSaved) || JSON.stringify(noticeBatch) !== JSON.stringify({ device: expectedSaved.device })) throw Error("Notice changed other saved fields")
    await writer.dispose(); records = JSON.parse(JSON.stringify(records))
    const restarted = api.create(deps)
    if (await restarted.ready() !== "ok") throw Error("Notice final restart not ready")
    const restart = await restarted.readClaimNotice(), consumed = await restarted.claim()
    await restarted.dispose()
    if (restart.kind !== "empty" || consumed.kind !== "consumed" || JSON.stringify(records) !== JSON.stringify(expectedSaved)) throw Error("Notice removal did not survive restart")
    noticeOutcomes.push({ name: "claim-notice", input, claim, first, second, pendingAfterRestart, savedBeforeOK, presentation, action, acknowledgement, reread, duplicateOK, restart, consumed, before, after, counters, saved: records, batches, effects, events })
  }
  return { fixture: "exclusive-synthetic-atomic-local-only", outcomes, startupOutcomes, settingsOutcomes, noticeOutcomes, agreementOutcomes: await runCanonicalAgreements(api) }
}

export const fixtureRun = runClaimFixture()
if (import.meta.main) fixtureRun.then(result => console.log(JSON.stringify(result, (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value)))
