import { defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId, type Unclaimed } from "../../../src/shared/model"
import type { JsonValue } from "../../../src/shared/contracts/json"
import type { ClaimAuthority, ClaimAuthorityState } from "../../../src/background/store/local-claim-writer"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"

import { LEGACY_DELETE_KEYS, type LegacyEvidence } from "../../../src/background/store/legacy"
import type { StartupHost } from "../../../src/background/store/legacy-execution"

const context: StartupHost["context"] = { deviceId: "fixture-device", settingsGen: "migration", at: 1,
  shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] }

function startupHost(area: { read(): Record<string, unknown>; remove(keys: readonly string[]): void }, effects: unknown[]): StartupHost {
  return {
    context,
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

export async function runClaimFixture() {
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
    const writer = createStartingLocalFilterWriter({ ...deps, startup })
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
    await writer.dispose()
    const serialized = JSON.stringify(records)
    records = JSON.parse(serialized)
    const restarted = createStartingLocalFilterWriter({ ...deps, startup })
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
      const first = createStartingLocalFilterWriter({ ...deps, startup: { ...startup, async deleteDatabase() { throw Error("Synthetic interrupted cleanup") } } })
      try { await first.ready(); throw Error("Interrupted cleanup released") } catch (error) {
        if (!(error instanceof Error) || error.message !== "Synthetic interrupted cleanup") throw error
      }
      await first.dispose()
      records = JSON.parse(JSON.stringify(records))
    }
    const writer = createStartingLocalFilterWriter(deps)
    const ready = await writer.ready()
    const claim = await writer.claim()
    await writer.dispose()
    if (ready !== "ok" || records.schema !== 1 || LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key))) throw Error("Startup fixture failed")
    if (claim.kind !== "unavailable" || claim.reason !== "startup") throw Error("Startup consent/note guard bypassed")
    startupOutcomes.push({ name, ready, claim, saved: records, batches, effects })
  }
  return { fixture: "exclusive-synthetic-atomic-local-only", outcomes, startupOutcomes }
}

export const fixtureRun = runClaimFixture()
fixtureRun.then(result => console.log(JSON.stringify(result)))
