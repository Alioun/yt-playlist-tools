import { defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId, type Unclaimed } from "../../../src/shared/model"
import type { JsonValue } from "../../../src/shared/contracts/json"
import { createLocalClaimWriter, type ClaimAuthority, type ClaimAuthorityState } from "../../../src/background/store/local-claim-writer"

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
  const cases = ["choices", "existing", "filter-only", "skipped-empty"] as const
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
    let lookups = 0, generations = 0
    const deps = {
      local: {
        async get() { const saved: Record<string, unknown> = JSON.parse(JSON.stringify(records)); return saved },
        async set(items: Readonly<Record<string, JsonValue>>) {
          const saved: Record<string, JsonValue> = JSON.parse(JSON.stringify(items))
          batches.push(saved)
          records = { ...records, ...saved }
        }
      },
      authority: { async read(): Promise<ClaimAuthorityState> { return { kind: "ready", authority } } },
      session: { async takeLookup(active: ClaimAuthority) {
        const key = `${active.acct}:${active.browserSession}`
        if (checked.has(key)) return false
        checked.add(key)
        return true
      } },
      ownership: { async lookup(active: ClaimAuthority) {
        lookups++
        return { kind: "fixture-owned" as const, authority: active,
          lineage: "local-migration-only" as const, ownedPlaylistIds: new Set([playlist]) }
      } },
      now: () => 100, generation: () => `fixture-${++generations}`
    }
    const writer = createLocalClaimWriter(deps)
    const result = await writer.claim()
    await writer.dispose()
    const serialized = JSON.stringify(records)
    records = JSON.parse(serialized)
    const restarted = createLocalClaimWriter(deps)
    const restart = await restarted.claim()
    await restarted.dispose()
    outcomes.push({ name, result, restart, saved: records, batches, lookups, generations })
  }
  return { fixture: "exclusive-synthetic-atomic-local-only", outcomes }
}

export const fixtureRun = runClaimFixture()
fixtureRun.then(result => console.log(JSON.stringify(result)))
