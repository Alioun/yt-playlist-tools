import { expect, test } from "bun:test"
import { consentObject } from "./consent-withdrawal"
import {
  parseConsentJobs,
  createConsentRecovery,
  consentJobsKey,
  executeExactRetainedInstallationAcceptance,
  type ExactRetainedInstallationAcceptancePermit,
  executeExactRetainedInstallation
} from "./consent-recovery"
import type { JsonObject } from "../../shared/contracts/json"
import { renewWithdrawalAgreement, createInterimHarness, interimSnapshot, withdrawalConfirmedInstallationFixture, newInstallationStage } from "../../../tools/fixtures/interim-conversion/run"
import { interimConversionKey } from "./interim-persistence"
import { origin, newInstallationOwner, newInstallationInput, completedNewInstallation, rawObject, confirmedInstallationSeed } from "../../../tools/fixtures/consent-recovery/cases"

test("new installation draft allocates only in the exact two-key acceptance and finishes installed done held", async () => {
  const { before, view, result, states, batches, records } = await completedNewInstallation()
  expect(batches.map(newInstallationStage)).toEqual(["prepare", "authorize", "accept", "documents", "retire", "record", "done"])
  for (const state of states.slice(0, 2)) {
    const ledger = parseConsentJobs(state[consentJobsKey])
    expect(ledger?.next).toBe(0)
    expect(ledger?.jobs).toEqual([])
    expect(ledger?.retainedInstallation?.registration).toEqual({ kind: "unregistered", expectedNext: 0 })
  }
  expect(Object.keys(batches[2]!)).toEqual([interimConversionKey, consentJobsKey])
  expect(parseConsentJobs(states[2]![consentJobsKey])?.next).toBe(1)
  expect(parseConsentJobs(records[consentJobsKey])?.retainedInstallation?.registration).toEqual({ kind: "registered", occurrence: 0 })
  expect(parseConsentJobs(records[consentJobsKey])?.jobs[0]?.permission.kind).toBe("done")
  expect(records.device).toEqual(before.device)
  expect(rawObject(records.interimConversion).agreed).toEqual(before.interimConversion)
  expect(view.descriptor.accepted.agreed.agreement.effect.consent.at).toBe(200)
  expect(view.current.at).toBe(300)
  expect(result.kind === "recovered" && result.completion.operation === "retained-installation-acceptance" && result.completion.result.installation.activation).toBe("held")
})
for (const rejected of [false, true])
  for (const mask of [0, 1, 2, 3])
    test(`new installation exact acceptance subset ${mask}, rejection ${rejected}`, async () => {
      const { h, writer, fixture } = await newInstallationOwner(),
        { input } = await newInstallationInput(writer)
      h.write(async (items, apply) => {
        if (newInstallationStage(items) !== "accept") {
          apply(items)
          return
        }
        apply(Object.fromEntries([interimConversionKey, consentJobsKey].filter((_, index) => mask & (2 ** index)).map(key => [key, items[key]!])))
        if (rejected) throw h.error
      })
      const result = await writer.recoverWithdrawnWork(origin, input)
      expect(result.kind).toBe(mask === 3 ? "recovered" : mask === 0 && rejected ? "failed" : "unconfirmed")
      if (mask !== 3) expect(h.writes.map(newInstallationStage)).toEqual(["prepare", "authorize", "accept"])
      if (result.kind === "failed" || result.kind === "unconfirmed") expect("confirmedPermissionWrites" in result && result.confirmedPermissionWrites.length).toBe(2)
      expect(parseConsentJobs(h.records()[consentJobsKey])?.next).toBe(mask & 2 ? 1 : 0)
      if (mask === 1 || mask === 2 || (mask === 0 && !rejected)) {
        const read = await writer.readWithdrawnWork(origin)
        expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
      }
      const captured = h.records()
      await writer.dispose()
      if (mask === 1 || mask === 2) {
        const renewal = await renewWithdrawalAgreement({ ...fixture.stores, local: captured }),
          restart = await newInstallationOwner(renewal.stores.local),
          fresh = await newInstallationInput(restart.writer)
        expect(fresh.view.registration.kind).toBe(mask === 1 ? "unregistered" : "registered")
        expect((await restart.writer.recoverWithdrawnWork(origin, fresh.input)).kind).toBe("recovered")
        expect(parseConsentJobs(restart.h.records()[consentJobsKey])?.next).toBe(1)
        expect(restart.h.writes.map(newInstallationStage)).toContain("accept")
        expect(rawObject(restart.h.records().interimConversion).agreed).toEqual(
          rawObject(captured.interimConversion).v === 3 ? rawObject(captured.interimConversion).agreed : captured.interimConversion
        )
        await restart.writer.dispose()
      }
    })
for (const kind of ["receipt", "v1"] as const)
  test(`actual completed ${kind} permits a separate installation occurrence and preserves history`, async () => {
    const fixture = await withdrawalConfirmedInstallationFixture(kind),
      before = parseConsentJobs(fixture.stores.local[consentJobsKey]),
      { h, writer } = await newInstallationOwner(fixture.stores.local),
      { input, view } = await newInstallationInput(writer)
    expect(before?.next).toBe(1)
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
    const after = parseConsentJobs(h.records()[consentJobsKey])
    expect(after?.next).toBe(2)
    expect(after?.jobs[0]).toEqual(before?.jobs[0])
    expect(after?.retainedV1).toEqual(before?.retainedV1)
    expect(after?.jobs[1]?.identity.original).toEqual(view.descriptor.accepted.agreed.agreement.effect.consent)
    if (kind === "v1") {
      expect(view.current.at).toBe(301)
      expect(view.descriptor.accepted.agreed.agreement.effect.consent.at).toBe(300)
    }
    await writer.dispose()
  })
test("installation witness parser rejects malformed and non-plain drafts without invoking accessors", async () => {
  const { states } = await completedNewInstallation(),
    valid = rawObject(states[0]![consentJobsKey])
  expect(parseConsentJobs(valid)).toBeDefined()
  for (const mutate of [
    (raw: JsonObject) => {
      raw.extra = true
    },
    (raw: JsonObject) => {
      rawObject(raw.retainedInstallation).extra = true
    },
    (raw: JsonObject) => {
      rawObject(rawObject(raw.retainedInstallation).registration).expectedNext = -1
    },
    (raw: JsonObject) => {
      rawObject(rawObject(raw.retainedInstallation).descriptor).effect = {}
    },
    (raw: JsonObject) => {
      rawObject(rawObject(raw.retainedInstallation).descriptor).deviceId = "foreign"
    },
    (raw: JsonObject) => {
      rawObject(raw.retainedInstallation).registration = { kind: "registered", occurrence: 0 }
    },
    (raw: JsonObject) => {
      rawObject(rawObject(raw.retainedInstallation).permission).kind = "done"
    }
  ]) {
    const raw = rawObject(JSON.parse(JSON.stringify(valid)))
    mutate(raw)
    expect(parseConsentJobs(raw)).toBeUndefined()
  }
  let invoked = 0
  const accessor = rawObject(JSON.parse(JSON.stringify(valid)))
  Object.defineProperty(rawObject(accessor.retainedInstallation), "descriptor", {
    enumerable: true,
    get() {
      invoked++
      throw Error("Getter called")
    }
  })
  expect(parseConsentJobs(accessor)).toBeUndefined()
  expect(invoked).toBe(0)
})
test("new installation V3-only counter drift suppresses old-V3 fallback", async () => {
  const { before, states, batches } = await completedNewInstallation(),
    ledger = rawObject(JSON.parse(JSON.stringify(states[1]![consentJobsKey])))
  ledger.next = 1
  const { h, writer } = await newInstallationOwner({ ...before, interimConversion: batches[2]!.interimConversion!, [consentJobsKey]: ledger })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
  expect(h.writes).toEqual([])
  await writer.dispose()
})
test("new installation done history blocks identical V2 or accepted V3 reappearance", async () => {
  const { records, before, batches } = await completedNewInstallation()
  for (const checkpoint of [before.interimConversion, batches[2]!.interimConversion]) {
    const { h, writer } = await newInstallationOwner({ ...records, interimConversion: checkpoint! }),
      read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
    expect(h.writes).toEqual([])
    await writer.dispose()
  }
})
test("new installation private confirmation consumes review and writes nothing", async () => {
  const { h, writer } = await newInstallationOwner(),
    { input } = await newInstallationInput(writer)
  expect(await writer.recoverWithdrawnWork({ ...origin, incognito: true }, input)).toEqual({ kind: "refused", reason: "private" })
  expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes).toEqual([])
  await writer.dispose()
})

for (const stage of ["prepare", "authorize", "accept", "documents", "retire", "record", "done"] as const)
  test(`new installation ${stage} stops after actual withdrawal and re-agreement`, async () => {
    const { h, writer, fixture } = await newInstallationOwner(),
      { input } = await newInstallationInput(writer)
    let fired = false
    const queued: Promise<unknown>[] = []
    h.write(async (items, apply) => {
      apply(items)
      if (newInstallationStage(items) !== stage || fired) return
      fired = true
      queued.push(writer.resumeInterimInstallation(origin), writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }), writer.recoverWithdrawnWork(origin, input))
      const renewal = await renewWithdrawalAgreement({ ...fixture.stores, local: h.records() })
      h.foreign(records => {
        for (const key of Object.keys(records)) delete records[key]
        Object.assign(records, renewal.stores.local)
      })
    })
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).not.toBe("recovered")
    expect(fired).toBe(true)
    expect(h.writes.map(newInstallationStage)).toEqual(
      (["prepare", "authorize", "accept", "documents", "retire", "record", "done"] as const).slice(0, ["prepare", "authorize", "accept", "documents", "retire", "record", "done"].indexOf(stage) + 1)
    )
    for (const value of await Promise.all(queued)) expect(rawObject(value).kind).not.toBe("committed")
    const read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
    await writer.dispose()
  })
test("new installation terminal continuation preserves progress and never repairs documents", async () => {
  const { states } = await completedNewInstallation(),
    fixture = await confirmedInstallationSeed()
  const renewed = await renewWithdrawalAgreement({ ...fixture.stores, local: states[4]! }),
    { h, writer } = await newInstallationOwner(renewed.stores.local),
    { input } = await newInstallationInput(writer)
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
  expect(h.writes.map(newInstallationStage)).toEqual(["prepare", "authorize", "retire", "record", "done"])
  for (const items of h.writes.filter(items => Object.hasOwn(items, consentJobsKey))) expect(parseConsentJobs(items[consentJobsKey])?.jobs[0]?.progress.kind).toBe("terminal")
  await writer.dispose()
  const missing = rawObject(JSON.parse(JSON.stringify(renewed.stores.local))),
    documents = Object.keys(states[3]!).filter(key => key.startsWith("doc:"))
  delete missing[documents[0]!]
  const invalid = await newInstallationOwner(missing),
    read = await invalid.writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  expect(invalid.h.writes).toEqual([])
  await invalid.writer.dispose()
})
test("new installation independent completion retains a confirmed executor and independent read failure", async () => {
  const { h, writer } = await newInstallationOwner(),
    { input } = await newInstallationInput(writer)
  let done = false,
    reads = 0
  h.write(async (items, apply) => {
    apply(items)
    if (newInstallationStage(items) === "done") done = true
  })
  h.get(async () => {
    if (done && ++reads === 5) {
      h.get(undefined)
      throw h.readError
    }
  })
  const result = await writer.recoverWithdrawnWork(origin, input)
  if (result.kind !== "authorized-pending" || !("completionCheck" in result)) throw Error("Missing independent acceptance completion")
  expect(result.observation.kind).toBe("confirmed")
  expect(result.completionCheck).toEqual({ kind: "read-failed", error: h.readError })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  await writer.dispose()
})
for (const target of ["device-extension", "device-id", "history", "source", "canonical", "checkpoint"] as const)
  test(`new installation complete ${target} drift invalidates its review`, async () => {
    const { h, writer } = await newInstallationOwner(),
      { input } = await newInstallationInput(writer)
    h.foreign(records => {
      if (target === "device-extension") rawObject(records.device).future = { changed: true }
      else if (target === "device-id") rawObject(records.device).id = "foreign"
      else if (target === "history") rawObject(records.sync).extra = { changed: true }
      else if (target === "source") records.toastEnabled = true
      else if (target === "canonical") records["doc:settings"] = { v: 99 }
      else rawObject(records.interimConversion).future = { changed: true }
    })
    const before = h.records()
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unavailable")
    expect(h.records()).toEqual(before)
    expect(h.writes).toEqual([])
    await writer.dispose()
  })
test("new installation observed Device A-B-A during acceptance closes its owner", async () => {
  const { h, writer } = await newInstallationOwner(),
    { input } = await newInstallationInput(writer)
  h.write(async (items, apply) => {
    apply(items)
    if (newInstallationStage(items) !== "accept") return
    const actual = h.records()
    h.get(async () => {
      h.foreign(records => {
        rawObject(records.device).future = { changed: true }
      })
      h.get(async () => {
        h.get(undefined)
        h.foreign(records => {
          records.device = actual.device!
        })
      })
    })
  })
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unconfirmed")
  h.get(undefined)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  expect(h.writes.map(newInstallationStage)).toEqual(["prepare", "authorize", "accept"])
  await writer.dispose()
})
test("installation acceptance permits are separate one-use references and revoked before executor authority", async () => {
  const fixture = await confirmedInstallationSeed(),
    h = createInterimHarness(fixture.stores.local)
  let captured: ExactRetainedInstallationAcceptancePermit | undefined,
    accepted = 0
  const acceptancePorts = {
    async setAccepted(batch: import("./consent-recovery").RetainedInstallationAcceptanceBatch) {
      accepted++
      if (!captured) throw Error("Missing acceptance permit")
      expect(await executeExactRetainedInstallationAcceptance(captured, acceptancePorts)).toEqual({ kind: "unavailable", reason: "stale" })
      if (!consentObject(batch)) throw Error("Invalid batch JSON")
      await h.deps.local.set(batch)
    }
  }
  const recovery = createConsentRecovery({
    observe: () => h.deps.local.get(null),
    observeRetainedAgreement: async () => interimSnapshot(h.records()),
    revision: () => 0,
    stopped: () => false,
    set: items => h.deps.local.set(items),
    onRetainedV1Uncertainty() {},
    onRetainedInstallationUncertainty() {},
    async execute() {
      throw Error("Unexpected removal")
    },
    async executeRetainedInstallationAcceptance(permit) {
      captured = permit
      expect(await executeExactRetainedInstallationAcceptance({ ...permit }, acceptancePorts)).toEqual({ kind: "unavailable", reason: "stale" })
      return executeExactRetainedInstallationAcceptance(permit, acceptancePorts)
    },
    async executeRetainedInstallation(permit) {
      if (!captured) throw Error("Missing prior acceptance")
      expect(await executeExactRetainedInstallationAcceptance(captured, acceptancePorts)).toEqual({ kind: "unavailable", reason: "stale" })
      return executeExactRetainedInstallation(permit, {
        async setDocuments(effect) {
          const items: JsonObject = Object.fromEntries([...effect.documents.map(x => [x.path, x.document]), ...effect.caches.map(x => [x.path, x.data])])
          if (effect.schema.kind === "set") items.schema = effect.schema.value
          await h.deps.local.set(items)
        },
        setLedger: ledger => h.deps.local.set({ [consentJobsKey]: ledger }),
        async setInstalled(record) {
          if (!consentObject(record)) throw Error("Invalid receipt")
          await h.deps.local.set({ interimConversion: record })
        }
      })
    }
  })
  const read = await recovery.read(origin)
  if (read.kind !== "held") throw Error("Missing acceptance review")
  const view = read.work.find(view => view.kind === "retained-installation-acceptance")
  if (view?.kind !== "retained-installation-acceptance") throw Error("Missing acceptance selection")
  expect((await recovery.recover(origin, { review: read.review, job: view.selection })).kind).toBe("recovered")
  expect(accepted).toBe(1)
  if (!captured) throw Error("Missing consumed permit")
  expect(await executeExactRetainedInstallationAcceptance(captured, acceptancePorts)).toEqual({ kind: "unavailable", reason: "stale" })
})
