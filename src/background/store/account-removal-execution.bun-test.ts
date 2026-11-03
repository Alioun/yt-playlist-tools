import { expect, test } from "bun:test"
import { accountRemovalLocalName, planAccountDocumentWrite, parsePendingAccountRemoval, pendingAccountRemovalKey } from "./account-removal-execution"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey } from "../../shared/model"
import { runAccountRemovalExecution, accountRemovalExecutionPartitionCount, createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { createLocalFilterWriter } from "./local-filter-writer"

const acct = "AAAAAAAAAAAAAAAA"
if (!isAccountKey(acct)) throw Error("Invalid synthetic account")

test("account admission preserves unreadable unrelated documents, remote quotas and addressed version refusal", () => {
  const other = "BBBBBBBBBBBBBBBB"
  if (!isAccountKey(other)) throw Error("Invalid synthetic account")
  const name = `doc:setup:${acct}`,
    sibling = `doc:setup:${other}`,
    stamp = { v: 1, gen: "g0", at: 1, by: "fixture" }
  const candidate = { ...stamp, gen: "g1", at: 2, data: { quickSave: "PL_new" } }
  for (const opaqueName of ["doc:settings", sibling]) {
    for (const counterpart of ["absent", "supported", "newer"] as const) {
      const local: JsonObject = {
        [name]: { ...stamp, data: { quickSave: "PL_old" } },
        "doc:settings": { ...stamp, data: {} },
        [sibling]: { ...stamp, data: { quickSave: "PL_other" } },
        sync: { joined: "H", status: "ok", pushed: { [name]: "g0", "doc:settings": "g0", [sibling]: "g0" }, editedSinceOff: false }
      }
      const remote: JsonObject = { "s:meta": { v: 1, id: "H", created: 0 }, [`s:setup:${acct}`]: local[name]!, "s:settings": local["doc:settings"]!, [`s:setup:${other}`]: local[sibling]! }
      const remoteName = `s:${opaqueName.slice(4)}`
      local[opaqueName] = { v: 2, gen: "future-local", at: 3, by: "future", data: { unknown: ["keep"] } }
      if (counterpart === "absent") delete remote[remoteName]
      if (counterpart === "newer") remote[remoteName] = { v: 4, gen: "future-remote", at: 4, by: "future", data: { unknown: [0] } }
      const before = JSON.stringify({ local, remote })
      const plan = planAccountDocumentWrite({ local, sync: remote, intent: { kind: "changed", key: { kind: "setup", acct }, document: candidate } })
      expect(plan.kind).toBe("planned")
      if (plan.kind !== "planned") throw Error("Supported Setup edit was blocked by an unrelated newer document")
      expect(plan.sent.map(item => item.name)).toEqual([name])
      expect(plan.repairs.some(item => item.name === opaqueName)).toBe(false)
      expect(JSON.stringify({ local, remote })).toBe(before)
      remote[`s:setup:${acct}`] = { v: 2, gen: "future-target", at: 3, by: "future", data: {} }
      expect(planAccountDocumentWrite({ local, sync: remote, intent: { kind: "changed", key: { kind: "setup", acct }, document: candidate } })).toEqual({ kind: "refused", reason: "update-needed" })
      remote[`s:setup:${acct}`] = local[name]!
      for (let item = 0; item < 480; item++) remote[`retained:${item}`] = "kept"
      expect(planAccountDocumentWrite({ local, sync: remote, intent: { kind: "changed", key: { kind: "setup", acct }, document: candidate } })).toEqual({ kind: "refused", reason: "sync-full" })
    }
  }
})

const removalGroups: { ids: number[]; planned: number; cases: number; assertions: number }[] = []
for (let index = 0; index < accountRemovalExecutionPartitionCount; index++) {
  test(`actual prepare/remove, exact cleanup, interruption and restart, failed IO and flush, partition ${index + 1}/${accountRemovalExecutionPartitionCount}`, async () => {
    const ids: number[] = []
    let planned = -1
    const result = await runAccountRemovalExecution(undefined, {
      partition: { index, count: accountRemovalExecutionPartitionCount },
      onObservation(caseIndex) {
        ids.push(caseIndex)
      },
      onComplete(cases) {
        planned = cases
      }
    })
    expect(ids.length).toBe(result.cases)
    expect(ids.every(caseIndex => caseIndex % accountRemovalExecutionPartitionCount === index)).toBe(true)
    removalGroups.push({ ids, planned, cases: result.cases, assertions: result.assertions })
  }, 180000)
}

test("removal partitions cover every original case exactly once", () => {
  expect(removalGroups.length).toBe(accountRemovalExecutionPartitionCount)
  const planned = removalGroups[0]!.planned
  expect(removalGroups.every(group => group.planned === planned)).toBe(true)
  const ids = removalGroups.flatMap(group => group.ids).sort((a, b) => a - b)
  expect(ids).toEqual(Array.from({ length: planned }, (_, index) => index))
  expect(removalGroups.reduce((sum, group) => sum + group.cases, 0)).toBeGreaterThan(400)
  expect(removalGroups.reduce((sum, group) => sum + group.assertions, 0)).toBeGreaterThan(2500)
})

test("pending records reject forged manifests, future values and accessors without executing them", async () => {
  const h = createRemovalHarness(removalFixture(), { details: true }),
    writer = createLocalFilterWriter(h.deps)
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const prepared = await writer.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing confirmation")
  await writer.removeAccountSetup(origin, prepared.confirmation)
  const raw = h.mutations[0]?.after?.local[pendingAccountRemovalKey]
  const record = parsePendingAccountRemoval(raw)
  expect(record?.record.mode).toBe("local")
  if (!record) throw Error("Missing actual pending record")
  const copy = () => JSON.parse(JSON.stringify(raw))
  const variants = [
    () => {
      const value = copy()
      value.v = 2
      return value
    },
    () => {
      const value = copy()
      value.documents = []
      return value
    },
    () => {
      const value = copy()
      value.documents.push(value.documents[0])
      return value
    },
    () => {
      const value = copy()
      value.documents[0].key.acct = "BBBBBBBBBBBBBBBB"
      return value
    },
    () => {
      const value = copy()
      value.documents[0].before = null
      return value
    },
    () => {
      const value = copy()
      value.documents[0].before.v = 2
      return value
    },
    () => {
      const value = copy()
      value.documents[1].key.playlist = "non:canonical"
      return value
    },
    () => {
      const value = copy()
      value.documents[0].after = { deleted: true }
      return value
    },
    () => {
      const value = copy()
      value.joined = "unexpected"
      return value
    }
  ]
  for (const variant of variants) expect(parsePendingAccountRemoval(variant())).toBeUndefined()
  let calls = 0
  expect(
    parsePendingAccountRemoval(
      Object.defineProperty({}, "v", {
        enumerable: true,
        get() {
          calls++
          return 1
        }
      })
    )
  ).toBeUndefined()
  expect(calls).toBe(0)
  expect(parsePendingAccountRemoval({ ...copy(), extension: { compatible: [null, 1] } })?.raw.extension).toEqual({ compatible: [null, 1] })
  expect(accountRemovalLocalName({ kind: "progress", acct, shard: 15 }, acct)).toBe(`progress:${acct}:15`)
  await writer.dispose()
})

test("uncertain acceptance blocks already queued reads, writes, claims, receives and flushes", async () => {
  const h = createRemovalHarness(),
    local = h.deps.local
  let enter = () => {},
    release = () => {}
  const entered = new Promise<void>(resolve => {
      enter = resolve
    }),
    gate = new Promise<void>(resolve => {
      release = resolve
    })
  const writer = createLocalFilterWriter({
    ...h.deps,
    local: {
      get: keys => local.get(keys),
      async set(items) {
        if (Object.hasOwn(items, pendingAccountRemovalKey)) {
          enter()
          await gate
          return
        }
        await local.set(items)
      }
    }
  })
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const prepared = await writer.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing explicit confirmation")
  const work = writer.removeAccountSetup(origin, prepared.confirmation)
  await entered
  const read = writer.read("settings"),
    notice = writer.readClaimNotice(),
    change = writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }),
    claim = writer.claim(),
    receive = writer.receiveSyncDocument({ kind: "settings" }),
    flush = writer.flushSync(),
    next = writer.prepareAccountRemoval(origin, acct)
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
  const h = createRemovalHarness(),
    remove = h.deps.removal
  if (remove.kind !== "fixture") throw Error("Missing synthetic removal host")
  const marker = { synthetic: "first-delete" }
  const writer = createLocalFilterWriter({
    ...h.deps,
    removal: {
      ...remove,
      async removeLocal(keys) {
        if (keys.some(key => key.kind === "document")) throw marker
        await remove.removeLocal(keys)
      }
    }
  })
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const initial = h.state(),
    preparation = await writer.prepareAccountRemoval(origin, acct)
  if (preparation.kind !== "confirmation-required") throw Error("Missing actual confirmation")
  expect(await writer.removeAccountSetup(origin, preparation.confirmation)).toEqual({ kind: "failed", stage: "documents", error: marker })
  expect(h.state().local.sync).toEqual(initial.local.sync)
  expect(h.state().local[`doc:setup:${acct}`]).toEqual(initial.local[`doc:setup:${acct}`])
  expect(Object.hasOwn(h.state().local, pendingAccountRemovalKey)).toBe(true)
  await writer.dispose()
})
