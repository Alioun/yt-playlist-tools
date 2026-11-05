import { expect, test } from "bun:test"
import { deriveInterimInstallationEffect, readInterimInstallationHistory, retainedInstallationDifference } from "./interim-installation"
import { readRetainedCheckpoint, retainedCheckpointDifference, projectInterimNote, projectInterimInstallationNote } from "./interim-persistence"
import { createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { createInterimHarness, interimSnapshot, runInterimConversion } from "../../../tools/fixtures/interim-conversion/run"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

const ui = { kind: "ui", windowId: 1, incognito: false } as const
function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
async function installed() {
  const h = createInterimHarness({ sessionConsent: 1 }),
    owner = createStartingLocalFilterWriter(h.deps)
  await owner.ready().catch(() => {})
  const review = await owner.readAgreement(ui)
  if (review.kind !== "review") throw Error("Missing actual disclosure")
  await owner.agree(ui, { review: review.review, displayedVersion: review.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  const shown = await owner.readInterimInstallation(ui)
  if (shown.kind !== "review") throw Error("Missing actual installation review")
  expect(await owner.installInterimConversion(ui, shown.review)).toMatchObject({ kind: "committed", activation: "held" })
  await owner.dispose()
  const read = readRetainedCheckpoint(h.records().interimConversion)
  if (read.kind !== "installation") throw Error("Missing actual v3")
  return { h, checkpoint: read.checkpoint }
}

test("the actual command executes complete installation, fault stages and fresh explicit continuation", async () => {
  const result = await runInterimConversion()
  expect(result.installationObservations.length).toBeGreaterThan(60)
  expect(result.native).toBe("waived-and-unproven")
}, 60000)

test("raw off history stays lossless and unsupported or inconsistent histories refuse", () => {
  const raw = {
    joined: "old",
    pushed: { opaque: "gen" },
    status: "off",
    editedSinceOff: false,
    future: { keep: [false, null] },
    opaqueWrite: { gate: { kind: "held", notBefore: 60000 }, diagnostic: { name: "original", message: "opaque" } }
  }
  expect(readInterimInstallationHistory({ sync: raw })).toEqual({ kind: "history", history: { kind: "present", raw } })
  expect(readInterimInstallationHistory({})).toEqual({ kind: "history", history: { kind: "absent" } })
  for (const sync of [null, { ...raw, status: "ok" }, { ...raw, editedSinceOff: true, everEdited: false }, { ...raw, future: undefined }]) {
    expect(readInterimInstallationHistory({ sync } as unknown as JsonObject)).toEqual({ kind: "unavailable", reason: "history" })
  }
})

test("v3 needs explicit history and exact installed presence, while v1 and v2 gain no candidate exemptions", async () => {
  const { h, checkpoint } = await installed(),
    current = interimSnapshot(h.records())
  expect(retainedInstallationDifference({ checkpoint, current, history: { kind: "absent" } })).toBeUndefined()
  expect(Reflect.apply(retainedCheckpointDifference, undefined, [checkpoint, current])).toBe("history")
  expect(projectInterimNote({ checkpoint, current })).toEqual({ kind: "held", reason: "history" })
  expect(projectInterimInstallationNote({ checkpoint, current, history: { kind: "absent" } }).kind).toBe("installed-interim")
  const deleted = h.records()
  delete deleted.schema
  expect(retainedInstallationDifference({ checkpoint, current: interimSnapshot(deleted), history: { kind: "absent" } })).toBe("canonical")
  const effect = deriveInterimInstallationEffect(checkpoint.agreed)
  expect(effect).toEqual({ kind: "effect", effect: { documents: [], caches: [], schema: { kind: "set", value: 1 } } })
  const original = checkpoint.agreed.retained
  expect(retainedCheckpointDifference(checkpoint.agreed, { ...current, checkpoint: { kind: "present", value: checkpoint.agreed } })).toBe("canonical")
  expect(retainedCheckpointDifference(original, { ...current, checkpoint: { kind: "present", value: original } })).toBe("canonical")
})

test("named v3 validates closed stage and history variants and preserves compatible root extensions", async () => {
  const { h } = await installed(),
    raw = h.records().interimConversion
  if (!object(raw)) throw Error("Missing actual receipt")
  const extended = { ...raw, future: [null, false], toJSON: "inert", ["__proto__"]: { retained: true } }
  const read = readRetainedCheckpoint(extended)
  expect(read.kind).toBe("installation")
  if (read.kind !== "installation") throw Error("Missing extended v3")
  expect<unknown>(read.checkpoint).toEqual(extended)
  for (const installation of [
    { kind: "installed", history: { kind: "absent", raw: null } },
    { kind: "installed", history: { kind: "absent" }, overlay: {} },
    { kind: "installed", history: { kind: "present" } }
  ]) {
    expect(readRetainedCheckpoint({ ...raw, installation })).toEqual({ kind: "invalid" })
  }
  expect(
    readRetainedCheckpoint({
      v: 6,
      get payload() {
        throw Error("Newer payload executed")
      }
    })
  ).toEqual({ kind: "newer-version", version: 6 })
})

test("queued caller changes and nested port aliases cannot alter accepted installation authority", async () => {
  const h = createInterimHarness({ sessionConsent: 1 })
  let leaked: Readonly<Record<string, unknown>> | undefined
  const owner = createStartingLocalFilterWriter({
    ...h.deps,
    local: {
      ...h.deps.local,
      async get(keys) {
        leaked = await h.deps.local.get(keys)
        return leaked
      }
    }
  })
  await owner.ready().catch(() => {})
  const disclosure = await owner.readAgreement(ui)
  if (disclosure.kind !== "review") throw Error("Missing disclosure")
  await owner.agree(ui, { review: disclosure.review, displayedVersion: 1, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
  const shown = await owner.readInterimInstallation(ui)
  if (shown.kind !== "review") throw Error("Missing installation")
  if (leaked && object(leaked.device)) leaked.device.syncOn = true
  let release = () => {},
    entered = () => {}
  const pause = new Promise<void>(done => {
      release = done
    }),
    reached = new Promise<void>(done => {
      entered = done
    })
  h.snapshot(async () => {
    h.snapshot(undefined)
    entered()
    await pause
  })
  const blocking = owner.readAgreement(ui)
  await reached
  const caller = { kind: "ui" as const, windowId: 1, incognito: false }
  const pending = owner.installInterimConversion(caller, shown.review)
  caller.incognito = true
  caller.windowId = 99
  release()
  await blocking
  expect(await pending).toMatchObject({ kind: "committed", activation: "held" })
  const before = h.records(),
    writes = h.writes.length
  h.foreign(raw => {
    raw.unrelated = true
  })
  await owner.readAgreement(ui)
  h.foreign(raw => {
    delete raw.unrelated
  })
  await owner.readAgreement(ui)
  expect(h.records()).toEqual(before)
  expect(await owner.installInterimConversion(ui, shown.review)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes.length).toBe(writes)
  await owner.dispose()
})

test("disposal drains explicit continuation at both remaining write stages without publishing success", async () => {
  for (const stage of ["install", "confirm"] as const)
    for (const applied of [false, true]) {
      const h = createInterimHarness({ sessionConsent: 1 }),
        original = createStartingLocalFilterWriter(h.deps)
      await original.ready().catch(() => {})
      const disclosure = await original.readAgreement(ui)
      if (disclosure.kind !== "review") throw Error("Missing disclosure")
      await original.agree(ui, { review: disclosure.review, displayedVersion: 1, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: false, music: false, browserMenu: false }) })
      const shown = await original.readInterimInstallation(ui)
      if (shown.kind !== "review") throw Error("Missing installation review")
      let attempt = 0
      h.write(async (items, apply) => {
        if (++attempt === 1) apply(items)
        else throw h.error
      })
      expect(await original.installInterimConversion(ui, shown.review)).toMatchObject({ kind: "failed", stage: "install" })
      await original.dispose()
      const fresh = createInterimHarness(JSON.parse(JSON.stringify(h.records()))),
        owner = createStartingLocalFilterWriter({
          ...fresh.deps,
          now() {
            throw Error("Resume clock")
          },
          generation() {
            throw Error("Resume generation")
          }
        })
      await owner.ready().catch(() => {})
      expect(fresh.writes).toEqual([])
      let drain: Promise<void> | undefined
      fresh.write(async (items, apply) => {
        const current = Object.hasOwn(items, "interimConversion") ? "confirm" : "install"
        if (current !== stage) {
          apply(items)
          return
        }
        if (applied) apply(items)
        drain = owner.dispose()
      })
      expect(await owner.resumeInterimInstallation(ui)).toMatchObject({ kind: "unconfirmed", stage, cause: { kind: "stopped" } })
      await drain
      expect(await owner.readInterimInstallation(ui)).toEqual({ kind: "unavailable", reason: "disposed" })
      expect(fresh.writes.length).toBe(stage === "install" ? 1 : 2)
    }
})

import { recoveredRetainedInstallationDifference } from "./interim-installation"
import { withdrawalRetainedInstallationFixture } from "../../../tools/fixtures/interim-conversion/run"
import { withdrawalConfirmedInstallationFixture } from "../../../tools/fixtures/interim-conversion/run"
test("new installation draft comparison requires exact confirmed V2 and canonical before-images", async () => {
  const fixture = await withdrawalConfirmedInstallationFixture(),
    h = createInterimHarness(fixture.stores.local),
    owner = createStartingLocalFilterWriter(h.deps)
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const read = await owner.readWithdrawnWork(ui)
  if (read.kind !== "held") throw Error("Missing new installation review")
  const view = read.work.find(view => view.kind === "retained-installation-acceptance")
  if (view?.kind !== "retained-installation-acceptance") throw Error("Missing installation draft")
  const parsed = readRetainedCheckpoint(view.descriptor.accepted),
    history = readInterimInstallationHistory(fixture.stores.local)
  if (parsed.kind !== "installation" || parsed.checkpoint.installation.kind !== "accepted" || history.kind !== "history") throw Error("Missing draft history")
  const accepted = { ...parsed.checkpoint, installation: parsed.checkpoint.installation },
    input = {
      accepted,
      effect: view.descriptor.effect,
      current: interimSnapshot(fixture.stores.local),
      history: history.history,
      agreement: view.current,
      expected: { checkpoint: "agreed" as const, progress: "draft" as const }
    }
  expect(recoveredRetainedInstallationDifference(input)).toBeUndefined()
  const batch = Object.fromEntries([...view.descriptor.effect.documents.map(x => [x.path, x.document]), ...view.descriptor.effect.caches.map(x => [x.path, x.data])])
  for (const [key, value] of Object.entries(batch))
    expect(recoveredRetainedInstallationDifference({ ...input, current: { ...input.current, canonical: { ...input.current.canonical, [key]: value } } })).toBe("canonical")
  expect(
    recoveredRetainedInstallationDifference({
      ...input,
      current: { ...input.current, checkpoint: { kind: "present", value: view.descriptor.accepted } },
      expected: { checkpoint: "accepted", progress: "draft" }
    })
  ).toBeUndefined()
  await owner.dispose()
})

test("live installation comparison projects current consent and keeps exact history and before-after inventory", async () => {
  const fixture = await withdrawalRetainedInstallationFixture()
  if (fixture.kind !== "ready") throw Error("Unreachable original installation")
  const parsed = readRetainedCheckpoint(fixture.stores.local.interimConversion),
    history = readInterimInstallationHistory(fixture.stores.local)
  if (parsed.kind !== "installation" || parsed.checkpoint.installation.kind !== "accepted" || history.kind !== "history") throw Error("Missing accepted V3")
  const accepted = { ...parsed.checkpoint, installation: parsed.checkpoint.installation },
    derived = deriveInterimInstallationEffect(accepted.agreed)
  if (derived.kind !== "effect") throw Error("Invalid fixed installation effect")
  const input = {
    accepted,
    effect: derived.effect,
    current: interimSnapshot(fixture.stores.local),
    history: history.history,
    agreement: { v: 1 as const, at: 300 },
    expected: { checkpoint: "accepted" as const, progress: "accepted" as const }
  }
  expect(retainedInstallationDifference({ checkpoint: accepted, current: input.current, history: history.history })).toBe("canonical")
  expect(recoveredRetainedInstallationDifference(input)).toBeUndefined()
  const keys = Object.keys(fixture.original.batch)
  expect(keys.length).toBe(6)
  for (let mask = 0; mask < 64; mask++) {
    const canonical = { ...input.current.canonical, ...Object.fromEntries(keys.filter((_, index) => mask & (2 ** index)).map(key => [key, fixture.original.batch[key]!])) }
    const current = { ...input.current, canonical }
    expect(recoveredRetainedInstallationDifference({ ...input, current })).toBeUndefined()
    expect(recoveredRetainedInstallationDifference({ ...input, current, expected: { checkpoint: "accepted", progress: "terminal" } })).toBe(mask === 63 ? undefined : "canonical")
  }
  const canonical = { ...input.current.canonical, ...fixture.original.batch }
  const installed = { ...accepted, installation: { ...accepted.installation, kind: "installed" } }
  expect(
    recoveredRetainedInstallationDifference({
      ...input,
      current: { ...input.current, canonical, checkpoint: { kind: "present", value: installed } },
      expected: { checkpoint: "installed", progress: "terminal" }
    })
  ).toBeUndefined()
  for (const device of [
    { ...(object(input.current.canonical.device) && input.current.canonical.device), future: { changed: true } },
    { ...(object(input.current.canonical.device) && input.current.canonical.device), syncOn: true },
    { ...(object(input.current.canonical.device) && input.current.canonical.device), lastAccount: null }
  ]) {
    expect(recoveredRetainedInstallationDifference({ ...input, current: { ...input.current, canonical: { ...input.current.canonical, device } } })).toBe("canonical")
  }
  expect(recoveredRetainedInstallationDifference({ ...input, current: { ...input.current, source: { ...input.current.source, sessionConsent: 2 } } })).toBe("source")
  expect(recoveredRetainedInstallationDifference({ ...input, history: { kind: "absent" } })).toBe("history")
  expect(
    recoveredRetainedInstallationDifference({ ...input, current: { ...input.current, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "known", value: true } } })
  ).toBe("history")
  expect(recoveredRetainedInstallationDifference({ ...input, current: { ...input.current, canonical: { ...canonical, "doc:filter:AAAAAAAAAAAAAAAA:PL_EXTRA": null } } })).toBe("canonical")
})
