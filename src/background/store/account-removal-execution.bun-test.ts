import { expect, test } from "bun:test"
import { accountRemovalLocalName, parsePendingAccountRemoval, pendingAccountRemovalKey } from "./account-removal-execution"
import { isAccountKey } from "../../shared/model"
import { runAccountRemovalExecution, createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { createLocalFilterWriter } from "./local-filter-writer"

const acct = "AAAAAAAAAAAAAAAA"
if (!isAccountKey(acct)) throw Error("Invalid synthetic account")

test("actual prepare/remove, exact cleanup, interruption and restart, failed IO and flush", async () => {
  const result = await runAccountRemovalExecution()
  expect(result.cases).toBeGreaterThan(400)
  expect(result.assertions).toBeGreaterThan(2500)
}, 300000)

test("pending records reject forged manifests, future values and accessors without executing them", async () => {
  const h = createRemovalHarness(removalFixture(), { details: true }), writer = createLocalFilterWriter(h.deps)
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const prepared = await writer.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing confirmation")
  await writer.removeAccountSetup(origin, prepared.confirmation)
  const raw = h.mutations[0]?.after?.local[pendingAccountRemovalKey]
  const record = parsePendingAccountRemoval(raw)
  expect(record?.record.mode).toBe("local")
  if (!record) throw Error("Missing actual pending record")
  const copy = () => JSON.parse(JSON.stringify(raw))
  const variants = [() => { const value = copy(); value.v = 2; return value },
    () => { const value = copy(); value.documents = []; return value },
    () => { const value = copy(); value.documents.push(value.documents[0]); return value },
    () => { const value = copy(); value.documents[0].key.acct = "BBBBBBBBBBBBBBBB"; return value },
    () => { const value = copy(); value.documents[0].before = null; return value },
    () => { const value = copy(); value.documents[0].before.v = 2; return value },
    () => { const value = copy(); value.documents[1].key.playlist = "non:canonical"; return value },
    () => { const value = copy(); value.documents[0].after = { deleted: true }; return value },
    () => { const value = copy(); value.joined = "unexpected"; return value }]
  for (const variant of variants) expect(parsePendingAccountRemoval(variant())).toBeUndefined()
  let calls = 0
  expect(parsePendingAccountRemoval(Object.defineProperty({}, "v", { enumerable: true, get() { calls++; return 1 } }))).toBeUndefined()
  expect(calls).toBe(0)
  expect(parsePendingAccountRemoval({ ...copy(), extension: { compatible: [null, 1] } })?.raw.extension).toEqual({ compatible: [null, 1] })
  expect(accountRemovalLocalName({ kind: "progress", acct, shard: 15 }, acct)).toBe(`progress:${acct}:15`)
  await writer.dispose()
})

test("uncertain acceptance blocks already queued reads, writes, claims, receives and flushes", async () => {
  const h = createRemovalHarness(), local = h.deps.local
  let enter = () => {}, release = () => {}
  const entered = new Promise<void>(resolve => { enter = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  const writer = createLocalFilterWriter({ ...h.deps, local: { get: keys => local.get(keys), async set(items) {
    if (Object.hasOwn(items, pendingAccountRemovalKey)) { enter(); await gate; return }
    await local.set(items)
  } } })
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const prepared = await writer.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing explicit confirmation")
  const work = writer.removeAccountSetup(origin, prepared.confirmation)
  await entered
  const read = writer.read("settings"), notice = writer.readClaimNotice(), change = writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }),
    claim = writer.claim(), receive = writer.receiveSyncDocument({ kind: "settings" }), flush = writer.flushSync(), next = writer.prepareAccountRemoval(origin, acct)
  const before = h.state()
  release()
  expect(await work).toEqual({ kind: "unconfirmed", stage: "accept", mutation: { kind: "resolved" }, cause: { kind: "readback" } })
  for (const result of await Promise.all([read, notice, change, claim, receive, flush, next])) expect(result.kind).toBe("unavailable")
  expect(h.state()).toEqual(before)
  expect(h.mutations).toEqual([])
  expect(h.schedules).toEqual([])
  await writer.dispose()
})


test("removal does not mark provenance before its first confirmed document deletion", async () => {
  const h = createRemovalHarness(), remove = h.deps.removal
  if (remove.kind !== "fixture") throw Error("Missing synthetic removal host")
  const marker = { synthetic: "first-delete" }
  const writer = createLocalFilterWriter({ ...h.deps, removal: { ...remove, async removeLocal(keys) {
    if (keys.some(key => key.kind === "document")) throw marker
    await remove.removeLocal(keys)
  } } })
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const initial = h.state(), preparation = await writer.prepareAccountRemoval(origin, acct)
  if (preparation.kind !== "confirmation-required") throw Error("Missing actual confirmation")
  expect(await writer.removeAccountSetup(origin, preparation.confirmation)).toEqual({ kind: "failed", stage: "documents", error: marker })
  expect(h.state().local.sync).toEqual(initial.local.sync)
  expect(h.state().local[`doc:setup:${acct}`]).toEqual(initial.local[`doc:setup:${acct}`])
  expect(Object.hasOwn(h.state().local, pendingAccountRemovalKey)).toBe(true)
  await writer.dispose()
})
