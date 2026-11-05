import { expect, test } from "bun:test"
import {
  executeInterimRetention,
  readRetainedInterim,
  readRetainedCheckpoint,
  recoveredRetainedV1AgreementDifference,
  retainedCheckpointDifference,
  projectInterimNote,
  type InterimPersistenceSnapshot
} from "./interim-persistence"
import { createStartingLocalFilterWriter, createLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { createInterimHarness, interimSnapshot, runInterimConversion, withdrawalRetainedV1Fixture } from "../../../tools/fixtures/interim-conversion/run"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { isAccountKey } from "../../shared/model/validation"
import { isJsonValue, type JsonValue, type JsonObject } from "../../shared/contracts/json"

test("V1 recovery comparison pins complete history and permits only the current-consent canonical projection", async () => {
  const fixture = await withdrawalRetainedV1Fixture(),
    h = createInterimHarness(fixture.stores.local),
    owner = createStartingLocalFilterWriter(h.deps)
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const read = await owner.readWithdrawnWork({ kind: "ui", windowId: 1, incognito: false })
  if (read.kind !== "held") throw Error("V1 review absent")
  const selected = read.work.find(view => view.kind === "retained-v1-acceptance")
  if (!selected || selected.kind !== "retained-v1-acceptance") throw Error("V1 selection absent")
  const result = await owner.recoverWithdrawnWork({ kind: "ui", windowId: 1, incognito: false }, { review: read.review, job: selected.selection })
  expect(result.kind).toBe("recovered")
  const retained = readRetainedInterim(fixture.stores.local.interimConversion),
    accepted = readRetainedCheckpoint(h.writes[2]?.interimConversion)
  if (retained.kind !== "valid" || accepted.kind !== "agreement" || accepted.checkpoint.agreement.kind !== "accepted") throw Error("Actual checkpoints absent")
  const fixed = { ...accepted.checkpoint, agreement: accepted.checkpoint.agreement },
    current = interimSnapshot(fixture.stores.local),
    agreement = { v: 1, at: 300 }
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, current, agreement, "v1")).toBeUndefined()
  expect(retainedCheckpointDifference(retained.checkpoint, current)).toBe("canonical")
  expect(
    recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, interimSnapshot({ ...fixture.stores.local, interimConversion: h.writes[2]!.interimConversion! }), agreement, "accepted")
  ).toBeUndefined()
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, interimSnapshot(h.records()), agreement, "confirmed")).toBeUndefined()
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, current, agreement, "accepted")).toBe("checkpoint")
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, { ...current, source: { ...current.source, sessionConsent: 2 } }, agreement, "v1")).toBe("source")
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, { ...current, historicalAuthorization: { kind: "known", value: true } }, agreement, "v1")).toBe("history")
  const rawDevice: unknown = current.canonical.device
  if (!isJsonValue(rawDevice) || !rawDevice || typeof rawDevice !== "object" || Array.isArray(rawDevice)) throw Error("Current Device absent")
  expect(
    recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, { ...current, canonical: { ...current.canonical, device: { ...rawDevice, future: { changed: true } } } }, agreement, "v1")
  ).toBe("canonical")
  expect(recoveredRetainedV1AgreementDifference(retained.checkpoint, fixed, current, { v: 1, at: 301 }, "v1")).toBe("canonical")
  await owner.dispose()
})
import type { InterimConversionContext } from "./interim-conversion"
import { createRecoveryHarness, recoveryAgree, recoveryDiscardSelection, recoveryAcceptanceFixture, recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"

const context: InterimConversionContext = { deviceId: "fixture", at: 1, platform: { browser: "chrome", os: "linux" }, commands: [], interimShortcutId: "conv01", documentGenerations: {} }

test("confirmed discard restarts as recovery evidence without replay or fresh conversion context", async () => {
  const h = createRecoveryHarness(recoveryAcceptanceFixture.seed),
    owner = createStartingLocalFilterWriter(h.deps)
  await recoveryAgree(owner, h)
  const { opened, item } = await recoveryDiscardSelection(owner, "playlists", [0])
  expect((await owner.discardInterimItem(recoveryUi, { capture: opened.capture, item: item.id })).kind).toBe("committed")
  const serialized = JSON.stringify(h.records())
  await owner.dispose()
  const records = JSON.parse(serialized),
    restarted = createRecoveryHarness(records)
  let allocations = 0
  const result = await executeInterimRetention({
    local: restarted.deps.local,
    snapshot: restarted.deps.startup.readInterimSnapshot,
    context() {
      allocations++
      throw Error("Discard restart cannot allocate context")
    },
    isStopped: () => false
  })
  expect(result).toMatchObject({ kind: "confirmed-recovery", checkpoint: { v: 4, pending: { kind: "none" }, resolutions: [{ kind: "discarded", item: { sourceKey: "playlists", path: [0] } }] } })
  expect(allocations).toBe(0)
  expect(restarted.writes).toEqual([])
  expect(restarted.records()).toEqual(records)
})

test("the actual command confirms complete retention and reads it across discarded owner lifetimes", async () => {
  const result = await runInterimConversion()
  expect(result.assertions).toBeGreaterThan(1500)
  expect(result.observations.length).toBeGreaterThan(50)
  expect(result.production).toBe("not-connected")
}, 60000)

test("unrepresentable selected source never executes hooks, writes a subset or invents recovery", async () => {
  let hooks = 0
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const getter = Object.defineProperty({}, "saved", {
    enumerable: true,
    get() {
      hooks++
      throw Error("Getter executed")
    }
  })
  const hook = {
    toJSON() {
      hooks++
      throw Error("Hook executed")
    }
  }
  const sparse = Array(2)
  const values: unknown[] = [undefined, () => {}, cycle, getter, hook, sparse, Infinity, new Map(), 1n]
  for (const value of values) {
    const source = { "account:unrepresentable": value, savedAccountKeys: [] }
    let writes = 0,
      allocations = 0
    const result = await executeInterimRetention({
      local: {
        async get() {
          throw Error("Sanitized snapshot required")
        },
        async set() {
          writes++
        }
      },
      snapshot: async () => ({ source, canonical: {}, checkpoint: { kind: "absent" }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }),
      context() {
        allocations++
        return context
      },
      isStopped: () => false
    })
    expect(result).toEqual({ kind: "unrepresentable", reason: "source" })
    expect(writes).toBe(0)
    expect(allocations).toBe(0)
    expect(Object.getOwnPropertyDescriptor(source, "account:unrepresentable")?.value).toBe(value)
  }
  const source = Object.defineProperty({ sessionConsent: false }, "account:accessor", {
    enumerable: true,
    get() {
      hooks++
      throw Error("Top getter executed")
    }
  })
  const result = await executeInterimRetention({
    local: {
      async get() {
        return {}
      },
      async set() {
        throw Error("Accessor write")
      }
    },
    snapshot: async () => ({ source, canonical: {}, checkpoint: { kind: "absent" }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }),
    context: () => context,
    isStopped: () => false
  })
  expect(result).toEqual({ kind: "unrepresentable", reason: "source" })
  expect(hooks).toBe(0)
})

test("newer checkpoint and global schema precede payload interpretation", async () => {
  let hooks = 0
  const raw = Object.defineProperty({ v: 2 }, "payload", {
    get() {
      hooks++
      throw Error("New payload read")
    }
  })
  expect(readRetainedInterim(raw)).toEqual({ kind: "newer-version", version: 2 })
  const current: InterimPersistenceSnapshot = {
    source: { "account:bad": undefined },
    canonical: { schema: 2 },
    checkpoint: { kind: "present", value: raw },
    historicalAuthorization: { kind: "unknown" },
    priorCredentialPresence: { kind: "unknown" }
  }
  expect(
    await executeInterimRetention({
      snapshot: async () => current,
      local: {
        async get() {
          throw Error("get")
        },
        async set() {
          throw Error("set")
        }
      },
      context: () => {
        throw Error("context")
      },
      isStopped: () => false
    })
  ).toEqual({ kind: "newer-layout", version: 2 })
  expect(projectInterimNote({ checkpoint: raw, current })).toEqual({ kind: "held", reason: "newer-layout" })
  expect(hooks).toBe(0)
})

test("saved context is detached before awaited preflight and restart allocates no replacement", async () => {
  let record: JsonValue | undefined,
    snapshots = 0,
    allocations = 0
  const supplied = { ...context, platform: { ...context.platform }, documentGenerations: {} }
  const base = interimSnapshot({ sessionConsent: false })
  const result = await executeInterimRetention({
    local: {
      async get() {
        return {}
      },
      async set(items) {
        record = items.interimConversion
      }
    },
    async snapshot() {
      if (++snapshots === 2) {
        supplied.at = 99
        supplied.platform.browser = "firefox"
        supplied.interimShortcutId = "wrong1"
      }
      return { ...base, checkpoint: record === undefined ? { kind: "absent" } : { kind: "present", value: record } }
    },
    context() {
      allocations++
      return supplied
    },
    isStopped: () => false
  })
  expect(result.kind).toBe("retained-but-held")
  if (result.kind !== "retained-but-held") throw Error("Missing retained capture")
  expect(result.checkpoint.context.at).toBe(1)
  expect(result.checkpoint.context.interimShortcutId).toBe("conv01")
  expect(result.checkpoint.context.platform.browser).toBe("chrome")
  expect(isJsonValue(record)).toBe(true)
  const restarted = await executeInterimRetention({
    local: {
      async get() {
        return {}
      },
      async set() {
        throw Error("Restart write")
      }
    },
    snapshot: async () => ({ ...base, checkpoint: { kind: "present", value: record } }),
    context() {
      allocations++
      throw Error("Restart allocation")
    },
    isStopped: () => false
  })
  expect(restarted.kind).toBe("retained-but-held")
  expect(allocations).toBe(1)
})

test("a blocked original context that was not reached stays recovery unavailable", async () => {
  const h = createInterimHarness({ schema: 0, sessionConsent: 0 }),
    owner = createStartingLocalFilterWriter(h.deps)
  try {
    await owner.ready()
    throw Error("Unexpected ready")
  } catch (error) {
    expect(error).toBeInstanceOf(StartupReadinessError)
  }
  const note = await owner.readInterimNote()
  expect(note.kind).toBe("blocked-source")
  if (note.kind !== "blocked-source") throw Error("Missing refused source")
  expect(note.checkpoint.recovery).toBe("unavailable")
  expect(note.checkpoint.outcome.kind).toBe("blocked")
  expect(note.checkpoint.outcome.reviewFacts.conversionShortcut.kind).toBe("not-validated")
  expect(h.records().schema).toBe(0)
  await owner.dispose()
})

test("compatible checkpoint extensions and inert toJSON and __proto__ data stay detached", async () => {
  const h = createInterimHarness(),
    owner = createStartingLocalFilterWriter(h.deps)
  await owner.ready().catch(() => {})
  const state = h.records(),
    raw = state.interimConversion
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw Error("Missing checkpoint")
  Object.defineProperty(raw, "__proto__", { value: { kept: [false] }, enumerable: true, configurable: true, writable: true })
  raw.toJSON = "inert"
  raw.future = { retained: [1, null] }
  const read = readRetainedInterim(raw)
  expect(read.kind).toBe("valid")
  if (read.kind !== "valid") throw Error("Invalid compatible record")
  expect(Object.isFrozen(read.checkpoint.source)).toBe(true)
  expect(Object.getOwnPropertyDescriptor(read.checkpoint, "__proto__")?.value).toEqual({ kept: [false] })
  const future = raw.future
  if (future && typeof future === "object" && !Array.isArray(future)) future.retained = []
  expect(Object.getOwnPropertyDescriptor(read.checkpoint, "future")?.value).toEqual({ retained: [1, null] })
  await owner.dispose()
})

test("actual pending removal and interim capture are preserved without cleanup on either constructor", async () => {
  const h = createRemovalHarness(removalFixture(), { details: true }),
    owner = createLocalFilterWriter(h.deps)
  const acct = "AAAAAAAAAAAAAAAA",
    ui = { kind: "ui", windowId: 1, incognito: false } as const
  if (!isAccountKey(acct)) throw Error("Invalid synthetic account")
  const prepared = await owner.prepareAccountRemoval(ui, acct)
  if (prepared.kind !== "confirmation-required") throw Error("No actual confirmation")
  expect(await owner.removeAccountSetup(ui, prepared.confirmation)).toEqual({ kind: "committed" })
  const accepted = h.mutations[0]?.after
  if (!accepted) throw Error("Missing actual durable pending record")
  await owner.dispose()
  const capture = createInterimHarness(),
    held = createStartingLocalFilterWriter(capture.deps)
  await held.ready().catch(() => {})
  await held.dispose()
  for (const constructor of ["starting", "preinitialized"]) {
    const state = JSON.parse(JSON.stringify(accepted))
    Object.assign(state.local, { sessionConsent: 1, interimConversion: capture.records().interimConversion })
    const resumed = createRemovalHarness(state)
    const starting = constructor === "starting" ? createStartingLocalFilterWriter({ ...resumed.deps, startup: resumed.startup }) : undefined
    const writer = starting ?? createLocalFilterWriter(resumed.deps)
    if (starting)
      await starting.ready().catch(error => {
        expect(error).toBeInstanceOf(StartupReadinessError)
      })
    expect((await writer.prepareAccountRemoval(ui, acct)).kind).toBe("unavailable")
    expect((await writer.read("settings")).kind).toBe("unavailable")
    expect((await writer.claim()).kind).toBe("unavailable")
    expect((await writer.flushSync()).kind).toBe("unavailable")
    await writer.startSync()
    expect(resumed.state()).toEqual(state)
    expect(resumed.mutations).toEqual([])
    expect(resumed.counts().subscriptions).toBe(0)
    await writer.dispose()
  }
})

test("a checkpoint without any markers closes every preinitialized first operation", async () => {
  const capture = createInterimHarness(),
    held = createStartingLocalFilterWriter(capture.deps)
  await held.ready().catch(() => {})
  await held.dispose()
  const canonical: JsonObject = {
    schema: 1,
    device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:settings": { v: 1, gen: "g", at: 1, by: "fixture", data: {} },
    unclaimed: null,
    interimConversion: capture.records().interimConversion!
  }
  const acct = "AAAAAAAAAAAAAAAA",
    ui = { kind: "ui", windowId: 1, incognito: false } as const
  if (!isAccountKey(acct)) throw Error("Invalid synthetic account")
  for (const operation of ["settings", "edit", "claim", "notice", "removal", "flush", "receive", "start"]) {
    const h = createInterimHarness(canonical),
      writer = createLocalFilterWriter(h.deps)
    const result =
      operation === "settings"
        ? await writer.read("settings")
        : operation === "edit"
          ? await writer.changeSharedSetting(ui, { kind: "theme", value: "dark" })
          : operation === "claim"
            ? await writer.claim()
            : operation === "notice"
              ? await writer.readClaimNotice()
              : operation === "removal"
                ? await writer.prepareAccountRemoval(ui, acct)
                : operation === "flush"
                  ? await writer.flushSync()
                  : operation === "receive"
                    ? await writer.receiveSyncDocument({ kind: "settings" })
                    : await writer.startSync()
    if (result) expect(result.kind).toBe("unavailable")
    expect(h.writes).toEqual([])
    expect(h.records()).toEqual(canonical)
    expect(h.effects).not.toContain("sync-get")
    expect(h.effects).not.toContain("sync-subscribe")
    expect(h.effects).not.toContain("timer")
    await writer.dispose()
  }
})

test("a checkpoint observed during legacy startup cannot be overwritten by the final readiness assignment", async () => {
  const h = createInterimHarness({ schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 1 }, syncOn: false }, unclaimed: null })
  h.deps.startup.readSnapshot = async () => {
    h.foreign(records => {
      records.interimConversion = { v: 9, keep: [null] }
    })
    return { schema: 1, device: h.records().device, settingsDocument: undefined, unclaimed: null, legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] }
  }
  const owner = createStartingLocalFilterWriter(h.deps)
  let caught: unknown
  try {
    await owner.ready()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(StartupReadinessError)
  if (!(caught instanceof StartupReadinessError)) throw Error("A late checkpoint released readiness")
  expect(caught.result.kind).toBe("interim-held")
  expect((await owner.read("settings")).kind).toBe("unavailable")
  expect((await owner.readClaimNotice()).kind).toBe("unavailable")
  expect(h.writes).toEqual([])
  expect(h.records().interimConversion).toEqual({ v: 9, keep: [null] })
  await owner.dispose()
})

test("owned v2 accepts only the exact consent overlay and preserves both root extension levels", async () => {
  const h = createInterimHarness({ schema: 1, sessionConsent: 1 })
  const owner = createStartingLocalFilterWriter(h.deps)
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  h.foreign(raw => {
    const checkpoint = raw.interimConversion
    if (checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint)) checkpoint.extension = { keep: [null, true] }
  })
  await owner.dispose()
  const starting = createStartingLocalFilterWriter(h.deps)
  await expect(starting.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const origin = { kind: "ui", windowId: 1, incognito: true } as const
  const read = await starting.readAgreement(origin)
  if (read.kind !== "review") throw Error("No retained review")
  const accepted = await starting.agree(origin, {
    review: read.review,
    displayedVersion: read.version,
    choice: { kind: "retained-disclosure" },
    access: Promise.resolve({ www: false, music: false, browserMenu: false })
  })
  expect(accepted.kind).toBe("committed")
  await starting.dispose()
  const saved = h.records()
  const { readRetainedCheckpoint } = await import("./interim-persistence")
  const receipt = readRetainedCheckpoint(saved.interimConversion)
  if (receipt.kind !== "agreement") throw Error("Invalid actual receipt")
  expect(receipt.checkpoint.retained.v).toBe(1)
  const root = saved.interimConversion
  if (!root || typeof root !== "object" || Array.isArray(root)) throw Error("No receipt")
  root.extension = { root: [false] }
  expect(readRetainedCheckpoint(root).kind).toBe("agreement")
  expect(readRetainedInterim(root)).toEqual({ kind: "newer-version", version: 2 })
  expect(readRetainedCheckpoint({ v: 6, payload: { opaque: true } })).toEqual({ kind: "newer-version", version: 6 })
  for (const change of ["foreign-device", "unclaimed", "source", "canonical-install"] as const) {
    const current = JSON.parse(JSON.stringify(saved))
    if (change === "foreign-device") current.device.foreign = true
    if (change === "unclaimed") current.unclaimed = null
    if (change === "source") delete current.sessionConsent
    if (change === "canonical-install") current["doc:settings"] = { v: 1, gen: "candidate", at: 123, by: "synthetic-device", data: {} }
    const view = projectInterimNote({ checkpoint: root, current: interimSnapshot(current) })
    expect(view.kind).toBe("held")
  }
})
