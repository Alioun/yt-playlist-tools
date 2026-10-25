import { defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId, type Unclaimed } from "../../../src/shared/model"
import type { JsonValue } from "../../../src/shared/contracts/json"
import type { ClaimAuthority, ClaimAuthorityState } from "../../../src/background/store/local-claim-writer"
import { createStartingLocalFilterWriter, type SettingsRead } from "../../../src/background/store/local-filter-writer"

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
    const writer = createStartingLocalFilterWriter(deps)
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
    const restarted = createStartingLocalFilterWriter(deps)
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
    let writer = createStartingLocalFilterWriter(deps)
    if (await writer.ready() !== "ok") throw Error("Notice startup not ready")
    const claim = await writer.claim()
    if (claim.kind !== "committed") throw Error("Notice claim did not commit")
    const savedBeforeOK = JSON.parse(JSON.stringify(records)), claimBatches = batches.length
    const first = await writer.readClaimNotice(), second = await writer.readClaimNotice()
    if (first.kind !== "pending" || JSON.stringify(first) !== JSON.stringify(second)) throw Error("Saved notice not pending")
    await writer.dispose()
    records = JSON.parse(JSON.stringify(records))
    writer = createStartingLocalFilterWriter(deps)
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
    const restarted = createStartingLocalFilterWriter(deps)
    if (await restarted.ready() !== "ok") throw Error("Notice final restart not ready")
    const restart = await restarted.readClaimNotice(), consumed = await restarted.claim()
    await restarted.dispose()
    if (restart.kind !== "empty" || consumed.kind !== "consumed" || JSON.stringify(records) !== JSON.stringify(expectedSaved)) throw Error("Notice removal did not survive restart")
    noticeOutcomes.push({ name: "claim-notice", input, claim, first, second, pendingAfterRestart, savedBeforeOK, presentation, action, acknowledgement, reread, duplicateOK, restart, consumed, before, after, counters, saved: records, batches, effects, events })
  }
  return { fixture: "exclusive-synthetic-atomic-local-only", outcomes, startupOutcomes, settingsOutcomes, noticeOutcomes }
}

export const fixtureRun = runClaimFixture()
fixtureRun.then(result => console.log(JSON.stringify(result)))
