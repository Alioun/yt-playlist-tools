import { expect, test } from "bun:test"
import { agreementHarness, runCanonicalAgreements, runJoinedAgreements, fixtureRun } from "../../../tools/fixtures/claim-transaction/run"
import { createInterimHarness } from "../../../tools/fixtures/interim-conversion/run"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { defaultSettings, decodeDocument, decodeSettings } from "../../shared/model"
import { desired, type RegistrationFeature } from "../../shared/features/registration"
import { parseAgreementChoice, type AgreementInput, type AgreementRead } from "./consent-agreement"
import type { JsonObject } from "../../shared/contracts/json"

const ui = { kind: "ui", windowId: 1, incognito: false } as const
const access = { www: true, music: true, browserMenu: true }
const seed = (): JsonObject => ({ schema: 1, device: { id: "stored", consent: null, syncOn: false, extension: { keep: true } } })
function review(read: AgreementRead) { expect(read.kind).toBe("review"); if (read.kind !== "review") throw Error("Expected review"); return read }
function input(read: ReturnType<typeof review>): AgreementInput { return { review: read.review, displayedVersion: read.version, choice: { kind: "feature", feature: "music-keys" }, access: Promise.resolve(access) } }
function gate() { let release = () => {}; const waiting = new Promise<void>(resolve => { release = resolve }); return { waiting, release } }

test("actual canonical command preserves eleven original cases and executes complete Agree outcomes", async () => {
  const complete = await fixtureRun
  expect(complete.outcomes.length + complete.startupOutcomes.length + complete.settingsOutcomes.length + complete.noticeOutcomes.length).toBe(11)
  const result = await runCanonicalAgreements()
  expect(result.assertions).toBeGreaterThan(190)
  expect(result.outcomes.length).toBeGreaterThan(30)
})

test("actual true-ticked Agree executes all sixteen joined transaction cases", async () => {
  const result = await runJoinedAgreements()
  expect(result.outcomes).toHaveLength(16)
  expect(result.assertions.length).toBeGreaterThan(100)
  expect(result.productionConnected).toBe(false)
})

test("review captures are detached, owner-bound, origin-bound and permanently stale after observed A-B-A", async () => {
  const initial = seed(), h = agreementHarness(initial), owner = createStartingLocalFilterWriter(h.deps)
  await owner.ready()
  const shown = review(await owner.readAgreement(ui)), requested = input(shown)
  const other = createStartingLocalFilterWriter(agreementHarness(initial).deps); await other.ready()
  expect(await other.agree(ui, requested)).toEqual({ kind: "unavailable", reason: "stale" }); await other.dispose()
  expect(await owner.agree({ ...ui, incognito: true }, requested)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.agree(ui, { ...requested, review: { ...shown.review } })).toEqual({ kind: "unavailable", reason: "stale" })
  h.foreign(raw => { raw["doc:settings"] = { v: 1, gen: "B", at: 1, by: "foreign", data: { theme: "dark" } } })
  await owner.read("settings")
  h.foreign(raw => { delete raw["doc:settings"] })
  await owner.read("settings")
  expect(await owner.agree(ui, requested)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.batches).toEqual([])
  await owner.dispose()
})

test("successful reviews reject an observed A-B-A after their exact terminal result", async () => {
  const h = agreementHarness(seed()), owner = createStartingLocalFilterWriter(h.deps); await owner.ready()
  const shown = review(await owner.readAgreement(ui)), requested = input(shown)
  const committed = await owner.agree(ui, requested)
  expect(committed.kind).toBe("committed")
  expect((await owner.agree(ui, requested)).kind).toBe("unchanged")
  const saved = h.records(), writes = h.batches.length
  h.foreign(raw => { raw["doc:settings"] = { v: 1, gen: "B", at: 1, by: "foreign", data: { theme: "dark" } } })
  await owner.read("settings")
  h.foreign(raw => { raw["doc:settings"] = saved["doc:settings"]! })
  await owner.read("settings")
  expect(await owner.agree(ui, requested)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.batches.length).toBe(writes)
  await owner.dispose()
})

test("retained reviews invalidate when history facts are observed to change and return", async () => {
  const h = createInterimHarness({ schema: 1, sessionConsent: 1 })
  let known = false
  const owner = createStartingLocalFilterWriter({ ...h.deps, startup: { ...h.deps.startup,
    async readInterimSnapshot() {
      const current = await h.deps.startup.readInterimSnapshot()
      return { ...current, historicalAuthorization: known ? { kind: "known", value: false } as const : { kind: "unknown" } as const }
    }
  } })
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const shown = review(await owner.readAgreement(ui)), writes = h.writes.length
  known = true; expect((await owner.readInterimNote()).kind).toBe("held")
  known = false; expect((await owner.readInterimNote()).kind).toBe("inactive-proposal")
  expect(await owner.agree(ui, { ...input(shown), choice: { kind: "retained-disclosure" } })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes.length).toBe(writes)
  await owner.dispose()
})

test("queued Agree captures invocation time, immutable request and promptly handled access observation", async () => {
  const h = agreementHarness(seed()), owner = createStartingLocalFilterWriter(h.deps); await owner.ready()
  const shown = review(await owner.readAgreement(ui)), pause = gate(), entered = gate()
  let first = true
  h.get(async () => { if (!first) return; first = false; entered.release(); await pause.waiting })
  const reading = owner.read("settings"); await entered.waiting
  const choice = { kind: "feature", feature: "music-keys" } as const
  const observation = { ...access }, caller: { kind: "ui"; windowId: number; incognito: boolean } = { ...ui }, requested: AgreementInput = { ...input(shown), choice, access: Promise.resolve(observation) }
  const saving = owner.agree(caller, requested)
  await Promise.resolve(); await Promise.resolve()
  h.time(900); observation.music = false; caller.windowId = 9
  Object.assign(choice, { feature: "queue-button" })
  pause.release(); await reading
  const result = await saving
  expect(result.kind).toBe("committed")
  if (result.kind === "committed") expect(result.consent.at).toBe(200)
  const settings = decodeDocument(h.records()["doc:settings"], decodeSettings)
  expect(settings.kind).toBe("value")
  if (settings.kind === "value") { expect(settings.document.data.musicKeys.on).toBe(true); expect(settings.document.data.queueButton.on).toBe(false) }
  await owner.dispose()
})

test("port-returned nested aliases cannot mutate a reviewed baseline while Agree is queued", async () => {
  const h = agreementHarness(seed()), originalGet = h.deps.local.get
  const returned: JsonObject[] = []
  h.deps.local.get = async keys => { const records = await originalGet(keys); returned.push(records); return records }
  const owner = createStartingLocalFilterWriter(h.deps); await owner.ready()
  const shown = review(await owner.readAgreement(ui)), accessGate = gate()
  const saving = owner.agree(ui, { ...input(shown), access: accessGate.waiting.then(() => access) })
  for (const records of returned) {
    const device = records.device
    if (device && typeof device === "object" && !Array.isArray(device)) device.extension = { changedAlias: true }
  }
  accessGate.release()
  expect((await saving).kind).toBe("committed")
  const stored = h.records().device
  expect(stored && typeof stored === "object" && !Array.isArray(stored) && stored.extension).toEqual({ keep: true })
  await owner.dispose()
})

test("canonical cancellation is read-only and malformed, future or pending addressed state cannot agree", async () => {
  const cases: JsonObject[] = [seed(), { ...seed(), device: { id: "bad", consent: null } }, { ...seed(), device: { id: "future", consent: { v: 2, at: 1 }, syncOn: false } }, { ...seed(), "pending:account-removal": { v: 99 } }]
  for (const initial of cases) {
    const h = agreementHarness(initial), owner = createLocalFilterWriter(h.deps), before = h.counters()
    const shown = await owner.readAgreement(ui)
    expect(h.batches).toEqual([]); expect(h.counters().generations).toBe(before.generations)
    expect(h.effects.filter(effect => typeof effect === "object" && effect && "stamp" in effect)).toEqual([])
    if (shown.kind === "review") expect(Object.isFrozen(shown.presentation)).toBe(true)
    await owner.dispose()
  }
  expect(parseAgreementChoice({ kind: "first-run", selected: [], syncOn: true })).toEqual({ kind: "unavailable", reason: "join-required" })
  expect(parseAgreementChoice({ kind: "disclosure", hidden: true })).toEqual({ kind: "refused", reason: "invalid" })
})

test("starting identity materialization uses the same detached context that startup validates", async () => {
  for (const valid of [true, false]) {
    const h = agreementHarness({}), supplied = { ...h.deps.startup.context, deviceId: "captured-identity", at: valid ? 1 : -1 }
    const owner = createStartingLocalFilterWriter({ ...h.deps, startup: { ...h.deps.startup, context: supplied } })
    supplied.deviceId = "later-identity"; supplied.at = 10
    if (!valid) {
      await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
      expect(h.batches).toEqual([])
    } else {
      await owner.ready()
      const shown = review(await owner.readAgreement(ui))
      expect((await owner.agree(ui, { ...input(shown), choice: { kind: "first-run", selected: [], syncOn: false } })).kind).toBe("committed")
      const device = h.records().device
      expect(device && typeof device === "object" && !Array.isArray(device) && device.id).toBe("captured-identity")
    }
    await owner.dispose()
  }
})

test("preinitialized owners require explicit creation context for new identities and preset rows", async () => {
  for (const initial of [{ schema: 1 }, seed()]) {
    const h = agreementHarness(initial), owner = createLocalFilterWriter(h.deps), shown = review(await owner.readAgreement(ui))
    const result = await owner.agree(ui, { ...input(shown), choice: Object.hasOwn(initial, "device") ? { kind: "feature", feature: "shortcuts" } : { kind: "disclosure" } })
    expect(result).toEqual({ kind: "unavailable", reason: "creation-context" }); expect(h.batches).toEqual([])
    await owner.dispose()
  }
})

test("disposal before and during attempted agreement cannot publish success", async () => {
  for (const when of ["before", "during"] as const) {
    const h = agreementHarness(seed()), owner = createStartingLocalFilterWriter(h.deps); await owner.ready()
    const shown = review(await owner.readAgreement(ui))
    if (when === "before") await owner.dispose()
    else h.set(async () => { void owner.dispose() })
    const result = await owner.agree(ui, input(shown))
    expect(result.kind).toBe(when === "before" ? "unavailable" : "unconfirmed")
    expect(h.batches.length).toBe(when === "before" ? 0 : 1)
    await owner.dispose()
  }
})

test("confirmed consent follows ordinary current-access gates and retained agreement never registers", async () => {
  const registry: readonly RegistrationFeature[] = [{ id: "music-keys", setting: "musicKeys", pages: { music: { needs: [], file: "music-keys" } } }]
  const h = agreementHarness(seed()), owner = createStartingLocalFilterWriter(h.deps); await owner.ready()
  const shown = review(await owner.readAgreement(ui)); const result = await owner.agree(ui, input(shown))
  expect(result.kind).toBe("committed")
  const settings = decodeDocument(h.records()["doc:settings"], decodeSettings)
  if (settings.kind !== "value") throw Error("No Settings")
  expect(desired(registry, settings.document.data, true, { www: true, music: true }, true).length).toBe(2)
  expect(desired(registry, settings.document.data, true, { www: true, music: false }, true)).toEqual([])
  await owner.dispose()
  const retained = createInterimHarness({ schema: 1, sessionConsent: 1 }), held = createStartingLocalFilterWriter(retained.deps)
  await expect(held.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const retainedRead = review(await held.readAgreement(ui))
  const accepted = await held.agree(ui, { ...input(retainedRead), choice: { kind: "retained-disclosure" } })
  expect(accepted.kind).toBe("committed")
  if (accepted.kind === "committed") expect(accepted.activation).toBe("held")
  await expect(held.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(desired(registry, defaultSettings(), true, access, false)).toEqual([])
  await held.dispose()
})
