// Shared setup for src/background/store/consent-recovery*.bun-test.ts.
import { expect } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { consentObject } from "../../../src/background/store/consent-withdrawal"
import { parseConsentJobs, consentJobsKey } from "../../../src/background/store/consent-recovery"
import { pendingAccountRemovalKey } from "../../../src/background/store/account-removal-execution"
import { createRemovalHarness, removalFixture, withdrawRemovalFixture } from "../account-removal-execution/run"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { isAccountKey } from "../../../src/shared/model"
import {
  withdrawalRetainedAgreementFixture,
  withdrawalRetainedV1Fixture,
  createInterimHarness,
  withdrawalConfirmedInstallationFixture,
  withdrawalRetainedInstallationFixture
} from "../interim-conversion/run"

export const origin = { kind: "ui", windowId: 1, incognito: false } as const
export function account(value: string) {
  if (!isAccountKey(value)) throw Error("Invalid synthetic account")
  return value
}
export const acct = account("AAAAAAAAAAAAAAAA")

export async function accepted(synced = false) {
  const h = createRemovalHarness(removalFixture(synced), { details: true })
  const writer = createLocalFilterWriter(h.deps)
  const preparation = await writer.prepareAccountRemoval(origin, acct)
  if (preparation.kind !== "confirmation-required") throw Error("Missing real removal confirmation")
  await writer.removeAccountSetup(origin, preparation.confirmation)
  await writer.dispose()
  const seed = h.mutations[0]?.after
  if (!seed || !seed.local[pendingAccountRemovalKey]) throw Error("Missing accepted removal seed")
  return (await withdrawRemovalFixture(seed)).state
}

export async function agreed(synced = false) {
  const h = createRemovalHarness(await accepted(synced), { details: true })
  const writer = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(h.mutations).toEqual([])
  const review = await writer.readAgreement(origin)
  if (review.kind !== "review" || review.presentation.kind !== "held") throw Error("Missing held disclosure")
  const result = await writer.agree(origin, { review: review.review, choice: { kind: "disclosure" }, displayedVersion: 1, access: new Promise(() => {}) })
  expect(result.kind).toBe("committed")
  expect(h.mutations.length).toBe(1)
  return { h, writer }
}

let retainedSeed: ReturnType<typeof withdrawalRetainedAgreementFixture> | undefined
export function retainedAgreementSeed() {
  return (retainedSeed ??= withdrawalRetainedAgreementFixture())
}
export async function retained() {
  const fixture = await retainedAgreementSeed()
  const h = createInterimHarness(fixture.stores.local),
    writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { h, writer, fixture }
}
export async function retainedSelection(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui = origin) {
  const review = await writer.readWithdrawnWork(ui)
  if (review.kind !== "held") throw Error("Missing retained review")
  const selected = review.work.find(view => view.kind === "retained-agreement")
  if (selected?.kind !== "retained-agreement") throw Error("Missing retained selection")
  return { review: review.review, job: selected.selection }
}

let newInstallationSeed: ReturnType<typeof withdrawalConfirmedInstallationFixture> | undefined
export function confirmedInstallationSeed() {
  return (newInstallationSeed ??= withdrawalConfirmedInstallationFixture())
}
export async function newInstallationOwner(raw?: JsonObject) {
  const fixture = await confirmedInstallationSeed()
  const h = createInterimHarness(raw ?? fixture.stores.local),
    writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(h.writes).toEqual([])
  return { h, writer, fixture }
}
export async function newInstallationInput(writer: ReturnType<typeof createStartingLocalFilterWriter>) {
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing new installation read")
  const view = read.work.find(view => view.kind === "retained-installation-acceptance")
  if (view?.kind !== "retained-installation-acceptance") throw Error("Missing new installation selection")
  expect(read.work.some(view => view.kind === "retained-installation")).toBe(false)
  return { input: { review: read.review, job: view.selection }, view }
}
export async function completedNewInstallation() {
  const { h, writer } = await newInstallationOwner(),
    { input, view } = await newInstallationInput(writer),
    before = h.records(),
    states: JsonObject[] = [],
    batches: JsonObject[] = []
  h.write(async (items, apply) => {
    apply(items)
    states.push(h.records())
    batches.push(items)
  })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("recovered")
  await writer.dispose()
  return { before, view, result, states, batches, records: h.records() }
}
let v1Seed: ReturnType<typeof withdrawalRetainedV1Fixture> | undefined
export function retainedV1Seed() {
  return (v1Seed ??= withdrawalRetainedV1Fixture())
}
export async function v1Owner() {
  const fixture = await retainedV1Seed(),
    h = createInterimHarness(fixture.stores.local),
    writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { fixture, h, writer }
}
export async function v1Selection(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui = origin) {
  const read = await writer.readWithdrawnWork(ui)
  if (read.kind !== "held") throw Error("V1 review missing")
  const selected = read.work.find(view => view.kind === "retained-v1-acceptance")
  if (!selected || selected.kind !== "retained-v1-acceptance") throw Error("V1 selection missing")
  return { review: read.review, job: selected.selection }
}
export function rawObject(raw: unknown): JsonObject {
  if (!consentObject(raw)) throw Error("Expected complete JSON object")
  return raw
}
export function v1Stage(items: JsonObject) {
  if (Object.hasOwn(items, "interimConversion")) return Object.hasOwn(items, consentJobsKey) ? "accept" : "record"
  const ledger = parseConsentJobs(items[consentJobsKey]),
    witness = ledger && "retainedV1" in ledger ? ledger.retainedV1 : undefined
  const permission = witness && "permission" in witness ? witness.permission.kind : ledger?.jobs[0]?.permission.kind
  return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : "done"
}
export const v1Stages = ["prepare", "authorize", "accept", "retire", "record", "done"] as const
let v1Completed: Promise<{ batches: JsonObject[]; records: JsonObject }> | undefined
export function completedV1() {
  return (v1Completed ??= (async () => {
    const { h, writer } = await v1Owner(),
      input = await v1Selection(writer)
    const result = await writer.recoverWithdrawnWork(origin, input)
    expect(result.kind).toBe("recovered")
    await writer.dispose()
    return { batches: h.writes, records: h.records() }
  })())
}

export function installationRawJob(ledger: JsonObject): JsonObject {
  if (!Array.isArray(ledger.jobs)) throw Error("Expected jobs array")
  return rawObject(ledger.jobs[0])
}
let installationSeed: ReturnType<typeof withdrawalRetainedInstallationFixture> | undefined
export function retainedInstallationSeed() {
  return (installationSeed ??= withdrawalRetainedInstallationFixture())
}
export async function installation(seed?: JsonObject) {
  const fixture = await retainedInstallationSeed()
  if (fixture.kind !== "ready") throw Error("Old accepted V3 fixture unreachable")
  const h = createInterimHarness(seed ?? fixture.stores.local),
    writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { h, writer, fixture }
}
export async function installationInput(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui: Parameters<typeof writer.readWithdrawnWork>[0] = origin) {
  const read = await writer.readWithdrawnWork(ui)
  if (read.kind !== "held") throw Error("Installation work not held")
  const view = read.work.find(view => view.kind === "retained-installation")
  if (view?.kind !== "retained-installation") throw Error("Installation selection absent")
  return { input: { review: read.review, job: view.selection }, view }
}
let installationDone: Promise<{ records: JsonObject; states: JsonObject[]; batches: JsonObject[] }> | undefined
export async function completedInstallation() {
  return (installationDone ??= (async () => {
    const { h, writer } = await installation(),
      states: JsonObject[] = []
    h.write(async (items, apply) => {
      apply(items)
      states.push(h.records())
    })
    const { input } = await installationInput(writer)
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
    const records = h.records()
    await writer.dispose()
    return { records, states, batches: h.writes }
  })())
}
