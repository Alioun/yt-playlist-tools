import { expect, test } from "bun:test"
import { readSyncJoinCheckpoint, pendingSyncJoinKey, transitionSyncJoin, joinJson } from "./sync-join-persistence"
import { syncJoinHarness, syncReconciliationFixtures } from "../../../tools/fixtures/account-removal-admission/run"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

async function accepted() {
  const h = syncJoinHarness({ local: { schema: 1, device: { id: "L", consent: { v: 1, at: 1 }, syncOn: false }, "doc:settings": { v: 1, gen: "L", at: 1, by: "L", data: { theme: "light" } } }, sync: { "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": { v: 1, gen: "R", at: 2, by: "R", data: { theme: "dark" } } } })
  const owner = h.owner(); await owner.ready(); h.fault("materialize", "rejected-unchanged")
  const review = await owner.beginSyncJoin({ kind: "ui", windowId: 1, incognito: false }).result
  if (review.kind !== "choice-required") throw Error("Missing review")
  await owner.applySyncJoin({ kind: "ui", windowId: 1, incognito: false }, { kind: "choice", review: review.review, choice: "use-this-browser" })
  await owner.dispose(); return joinJson(h.state().local[pendingSyncJoinKey])
}

test("loader reconstructs actual accepted selection, Device and truthful target history", async () => {
  const record = await accepted()
  expect(readSyncJoinCheckpoint(record).kind).toBe("valid")
  const faults: ((raw: JsonObject) => void)[] = [
    raw => { joinJson(raw.effect); (raw.effect as JsonObject).documents = [] },
    raw => { ((raw.effect as JsonObject).history as JsonObject).after = { joined: "H", pushed: { "doc:settings": "R" }, status: "joining", editedSinceOff: false } },
    raw => { (((raw.effect as JsonObject).device as JsonObject).after as JsonObject).id = "foreign" },
    raw => { (((raw.effect as JsonObject).device as JsonObject).after as JsonObject).consent = { v: 1, at: 999 } },
    raw => { ((raw.effect as JsonObject).selection as JsonObject).decision = { kind: "proven-never-edited" } },
    raw => { ((raw.effect as JsonObject).selection as JsonObject).remoteDocuments = [] },
    raw => { ((raw.effect as JsonObject).debt as JsonObject).outgoing = [] },
    raw => { (raw.effect as JsonObject).removeKeys = ["unclaimed"] },
    raw => { (raw.effect as JsonObject).removedAccounts = ["AAAAAAAAAAAAAAAA"] },
    raw => { raw.debt = {} },
    raw => { raw.phase = "unsupported" },
    raw => { ((raw.effect as JsonObject).history as JsonObject).before = { kind: "present", value: null } }
  ]
  for (const mutate of faults) { const altered = joinJson(record); mutate(altered); expect(readSyncJoinCheckpoint(altered).kind).toBe("invalid") }
  const newer = { v: 3, kind: "sync-join", phase: "arbitrary", unsupported: [null] }
  expect(readSyncJoinCheckpoint(newer)).toEqual({ kind: "newer-version", version: 3 })
  expect(readSyncJoinCheckpoint(undefined)).toEqual({ kind: "absent" }); expect(readSyncJoinCheckpoint(null)).toEqual({ kind: "invalid" })
})

test("compatible root fields and inert own properties survive named transitions without before-document retention", async () => {
  const record = await accepted(), parsed = readSyncJoinCheckpoint(record)
  if (parsed.kind !== "valid" || parsed.checkpoint.phase !== "accepted" || parsed.checkpoint.effect.kind !== "join") throw Error("Missing actual effect")
  const root: JsonObject = { ...record, future: { retain: true }, ...JSON.parse('{"__proto__":{"inert":true},"toJSON":"inert"}') }
  const next = transitionSyncJoin(root, { v: 1, kind: "sync-join", phase: "outbound", debt: parsed.checkpoint.effect.debt })
  expect(next.future).toEqual({ retain: true }); expect(Object.hasOwn(next,"__proto__")).toBe(true); expect(next.toJSON).toBe("inert")
  expect(Object.hasOwn(next,"effect")).toBe(false); expect(readSyncJoinCheckpoint(next).kind).toBe("valid")
  const off = transitionSyncJoin(next, { v: 1, kind: "sync-join", phase: "off", unfinishedTarget: "H" })
  expect(Object.hasOwn(off,"debt")).toBe(false); expect(off.unfinishedTarget).toBe("H")
})


test("v2 checkpoints reconstruct all six complete effects and reject forged owned fields", () => {
  const fixtures = syncReconciliationFixtures()
  for (const fixture of fixtures) {
    const record = joinJson(fixture.expectedAcceptedCheckpoint)
    expect(readSyncJoinCheckpoint(record).kind).toBe("valid")
    const downgraded = { ...record, v: 1 }
    expect(readSyncJoinCheckpoint(downgraded).kind).toBe("invalid")
    const future = { ...record, v: 3 }
    expect(readSyncJoinCheckpoint(future)).toEqual({ kind: "newer-version", version: 3 })
  }
  const same = joinJson(fixtures[0]!.expectedAcceptedCheckpoint), drift = joinJson(fixtures[1]!.expectedAcceptedCheckpoint)
  const faults: ((raw: JsonObject) => void)[] = [
    raw => { joinJson(raw.effect); json(raw.effect).basis = { kind: "outbound-drift" } },
    raw => { json(json(raw.effect).basis).earlierEffect = {} },
    raw => { json(json(json(raw.effect).basis).priorDebt).basis = {} },
    raw => { json(json(raw.effect).basis).localDocuments = [] },
    raw => { json(json(raw.effect).device).after = { ...json(json(json(raw.effect).device).after), extension: "forged" } },
    raw => { json(json(raw.effect).history).after = { ...json(json(json(raw.effect).history).after), everEdited: true } },
    raw => { json(json(json(raw.effect).history).after).pushed = { "doc:setup:AAAAAAAAAAAAAAAA": "setup-AL" } },
    raw => { json(raw.effect).documents = [] },
    raw => { json(json(raw.effect).debt).outgoing = [] },
    raw => { json(raw.effect).clearProgress = [{ acct: "AAAAAAAAAAAAAAAA", shard: 0 }] },
    raw => { json(raw.effect).removedAccounts = ["AAAAAAAAAAAAAAAA"] },
    raw => { json(json(raw.effect).basis).metadataBefore = { kind: "present", value: { v: 1, id: "H2", created: 0 } } },
    raw => { raw.phase = "unknown" },
    raw => { raw.suspended = { kind: "none" } }
  ]
  for (const mutate of faults) {
    const altered = joinJson(drift); mutate(altered)
    expect(readSyncJoinCheckpoint(altered).kind).toBe("invalid")
  }
  for (const mutate of [
    (raw: JsonObject) => { delete json(json(json(raw.effect).history).before).value },
    (raw: JsonObject) => { json(json(json(json(raw.effect).history).before).value).editedSinceOff = true },
    (raw: JsonObject) => { json(json(json(json(raw.effect).history).before).value).joined = "other" },
    (raw: JsonObject) => { json(json(json(json(raw.effect).device).before).value).syncOn = true },
    (raw: JsonObject) => { json(json(raw.effect).selection).decision = { kind: "proven-never-edited" } }
  ]) {
    const altered = joinJson(same); mutate(altered)
    expect(readSyncJoinCheckpoint(altered).kind).toBe("invalid")
  }
})
function json(raw: unknown): JsonObject { if (!isJsonValue(raw) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Missing owned fixture object"); return raw }
