import { test, expect } from "bun:test"
import type { ClaimNotice } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { projectClaimNotice, executeClaimNoticeAcknowledgement } from "./claim-notice"
import { executeSyntheticNodeRealm } from "../../../tools/fixtures/owner-services-reconciliation/node-realm-transport"

export async function noticeAcceptance(api: { project: typeof projectClaimNotice; execute: typeof executeClaimNoticeAcknowledgement }) {
  let checks = 0
  const observations: unknown[] = []
  function stable(value: unknown): string {
    return JSON.stringify(value, (_key, child) =>
      child && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(
            Object.keys(child)
              .sort()
              .map(key => [key, child[key]])
          )
        : child
    )
  }
  function equal(actual: unknown, expected: unknown, label: string) {
    checks++
    if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable({ actual, expected }))
  }
  function check(value: unknown, label: string) {
    checks++
    if (!value) throw Error(label)
  }
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const minimum = { acct: "AAAAAAAAAAAAAAAA", dropped: 2 }
  const full = {
    ...minimum,
    claim: { autoAddAdded: 1, filtersAdded: 2, shortcut: { kind: "skipped" as const, reason: "deleted-original" as const, extension: [1, { keep: true }] }, extension: { kept: true } },
    extension: { nested: [1, { keep: true }] }
  }
  const seed = (notice: unknown = full) => ({
    schema: 1,
    device: { id: "fixture", consent: { v: 1, at: 1 }, claimNotice: notice, extension: { keep: true } },
    unclaimed: null,
    other: { preserve: [1, 2] }
  })
  equal(api.project({ records: { schema: 1 } }), { kind: "held", reason: "consent" }, "schema-only consent hold")
  equal(api.project({ records: {} }), { kind: "unavailable", reason: "startup" }, "missing schema")
  equal(api.project({ records: { schema: 2 } }), { kind: "unavailable", reason: "newer-layout" }, "newer layout")
  for (const schema of [null, "1", 0, 1.5, Infinity]) equal(api.project({ records: { schema } }), { kind: "invalid", field: "schema" }, "invalid schema")
  for (const key of ["legacyClaimed", "sessionConsent", "savedAccountKeys", "account:old", "playlists"])
    equal(api.project({ records: { ...seed(), [key]: null } }), { kind: "unavailable", reason: "startup" }, "interim/legacy refuses")
  for (const shortcut of [
    { kind: "filled", shortcut: "orig01" },
    { kind: "already-set", shortcut: "orig01" },
    { kind: "not-owned" },
    { kind: "not-carried" },
    ...["missing-provenance", "deleted-original", "target-filled"].map(reason => ({ kind: "skipped", reason }))
  ]) {
    const notice = { acct: "AAAAAAAAAAAAAAAA", dropped: 0, claim: { autoAddAdded: 0, filtersAdded: 0, shortcut } }
    equal(api.project({ records: seed(notice) }), { kind: "pending", notice }, "notice variant")
  }
  equal(api.project({ records: seed(minimum) }), { kind: "pending", notice: minimum }, "old minimum notice")
  equal(api.project({ records: seed(null) }), { kind: "empty" }, "null notice")
  equal(api.project({ records: { schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 } } } }), { kind: "empty" }, "partial Device in-memory defaults")
  for (const v of [null, { v: 2, at: 1 }, { v: 3, at: 1 }])
    equal(api.project({ records: { schema: 1, device: { ...seed().device, consent: v } } }), { kind: "held", reason: "consent" }, "current consent equality")
  const details = {
    from: "1.5.0",
    autoAdd: { kept: 0, dropped: 0 },
    pct: { value: 50, wasUnset: true, authorised: false },
    feedback: true,
    shortcut: { raw: "", key: null, playlist: false, note: "none" },
    credentialsDeleted: true
  }
  const noteDevice = { ...seed().device, upgradeNote: { state: "pending", details } }
  equal(api.project({ records: { schema: 1, device: noteDevice } }), { kind: "held", reason: "upgrade-note" }, "note withholds notice")
  const projectedInput = seed(),
    projected = api.project({ records: projectedInput })
  check(projected.kind === "pending", "pending notice")
  if (projected.kind !== "pending") throw Error("pending required")
  check(Object.isFrozen(projected.notice), "root frozen")
  const projectedRaw = Reflect.get(projected.notice, "extension")
  check(Object.isFrozen(projectedRaw) && Object.isFrozen(projectedRaw.nested) && Object.isFrozen(projectedRaw.nested[1]), "extensions recursively frozen")
  try {
    projectedRaw.nested[1].keep = false
  } catch {}
  equal(projectedInput, seed(), "caller mutation cannot change storage")
  projectedInput.device.claimNotice = { ...full, dropped: 9 }
  equal(projected.notice, full, "later storage mutation cannot change snapshot")
  equal(api.project({ records: seed() }), { kind: "pending", notice: full }, "later read independent")
  let accessorCalls = 0
  const accessor = Object.defineProperty({}, "acct", {
    enumerable: true,
    get() {
      accessorCalls++
      throw Error("getter")
    }
  })
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const symbol = { ...minimum, [Symbol("bad")]: 1 }
  const malformed = [
    accessor,
    cycle,
    symbol,
    { ...full, dropped: -1 },
    { ...full, acct: "raw" },
    { ...full, dropped: NaN },
    { ...full, extension: { x: undefined } },
    { ...full, extension: { x: Infinity } },
    { ...full, claim: { ...full.claim, shortcut: { kind: "skipped", reason: "unknown" } } }
  ]
  for (const notice of malformed) {
    equal(api.project({ records: seed(notice) }), { kind: "invalid", field: "device" }, "malformed notice rejected")
    equal(api.project({ records: { schema: 1, device: { ...seed(notice).device, consent: null } } }), { kind: "invalid", field: "device" }, "withheld malformed notice validated")
    equal(api.project({ records: { schema: 1, device: { ...noteDevice, claimNotice: notice } } }), { kind: "invalid", field: "device" }, "pending note malformed validated")
  }
  equal(accessorCalls, 0, "getter never evaluated")
  equal(
    api.project({
      records: Object.defineProperty({}, "schema", {
        enumerable: true,
        get() {
          accessorCalls++
          return 1
        }
      })
    }),
    { kind: "invalid", field: "records" },
    "records accessor"
  )
  for (const device of [null, [], {}, { id: "fixture", consent: { v: 0, at: 1 } }]) equal(api.project({ records: { schema: 1, device } }), { kind: "invalid", field: "device" }, "malformed Device")
  function harness(initial: Record<string, unknown> = seed()) {
    let records = clone(initial),
      reads = 0,
      stopped = false
    const batches: unknown[] = [],
      marker = { synthetic: "original set rejection" },
      readError = { synthetic: "original read rejection" }
    let mode = "normal"
    const local = {
      async get() {
        reads++
        if (mode === "before-error" || (mode === "preflight-error" && reads === 2) || (["read-error", "reject-read-error"].includes(mode) && reads === 3)) throw readError
        if (mode === "stale" && reads === 2) records.other = { intervening: true }
        if (mode === "stop-load" || (mode === "stop-preflight" && reads === 2) || (mode === "stop-readback" && reads === 3)) stopped = true
        return clone(records)
      },
      async set(items: Readonly<Record<string, unknown>>) {
        batches.push(clone(items))
        if (!["reject-no-apply", "resolve-no-apply"].includes(mode)) records = { ...records, ...clone(items) }
        if (["divergent", "reject-divergent"].includes(mode)) records.other = { raced: true }
        if (["stop-set", "reject-stop-set"].includes(mode)) stopped = true
        if (mode.startsWith("reject")) throw marker
      }
    }
    return {
      local,
      marker,
      readError,
      batches,
      get records() {
        return records
      },
      get reads() {
        return reads
      },
      stop: () => {
        stopped = true
      },
      mode: (value: string) => {
        mode = value
      },
      run: (expected: Snapshot<ClaimNotice> = full) => api.execute({ local, expected, isStopped: () => stopped })
    }
  }
  for (const status of ["off", "ok", "waiting", "full", "update-needed"]) {
    const input = {
      ...seed(),
      device: { ...seed().device, syncOn: status !== "off" },
      sync: {
        joined: "history",
        pushed: { untouched: "g1" },
        status,
        editedSinceOff: false,
        opaqueWrite: { gate: { kind: "held", notBefore: 999999999 }, diagnostic: { name: null, message: "keep" } }
      },
      "doc:settings": { v: 99, gen: "new", at: 1, by: "future", data: {} }
    }
    const h = harness(input)
    equal(await h.run(), { kind: "committed", write: { kind: "resolved" } }, "local notice independent of sync status")
    equal(h.batches, [{ device: { ...input.device, claimNotice: null } }], "only raw Device write")
    equal(h.records, { ...input, device: { ...input.device, claimNotice: null } }, "complete saved state")
    equal(await h.run(), { kind: "unchanged", reason: "empty" }, "duplicate OK")
    equal(h.batches.length, 1, "duplicate no write")
    observations.push({ status, input, result: h.records, batches: h.batches, reads: h.reads })
  }
  for (const access of ["denied", "revoked"]) {
    const input = { ...seed(), siteAccess: { youtube: access }, features: { enabled: false } },
      h = harness(input)
    equal(await h.run(), { kind: "committed", write: { kind: "resolved" } }, "permission-independent acknowledgement")
    equal(h.records, { ...input, device: { ...input.device, claimNotice: null } }, "site access keeps consent and feature off")
  }
  {
    const h = harness(seed(minimum))
    equal(await h.run(minimum), { kind: "committed", write: { kind: "resolved" } }, "minimum old notice acknowledgement")
    equal(h.records, { ...seed(minimum), device: { ...seed(minimum).device, claimNotice: null } }, "minimum raw omissions preserved")
  }
  for (const expected of [
    { ...full, acct: "BBBBBBBBBBBBBBBB" },
    { ...full, dropped: 3 },
    { ...full, claim: { ...full.claim, autoAddAdded: 9 } },
    { ...full, claim: { ...full.claim, shortcut: { ...full.claim.shortcut, reason: "target-filled" as const } } },
    { ...full, extension: { nested: [1, { keep: false }] } },
    { ...full, claim: { ...full.claim, extension: { kept: false } } },
    minimum
  ]) {
    const h = harness()
    equal(await h.run(expected), { kind: "unchanged", reason: "different-notice" }, "exact notice comparison")
    equal(h.batches, [], "different notice zero writes")
    equal(h.records, seed(), "different notice retained")
  }
  const reordered = { extension: full.extension, claim: { extension: full.claim.extension, shortcut: full.claim.shortcut, filtersAdded: 2, autoAddAdded: 1 }, dropped: 2, acct: full.acct }
  equal(await harness().run(reordered), { kind: "committed", write: { kind: "resolved" } }, "key order irrelevant")
  for (const expected of malformed) {
    const h = harness()
    const result = await Reflect.apply(api.execute, undefined, [{ local: h.local, expected, isStopped: () => false }])
    equal(result, { kind: "refused", reason: "invalid" }, "invalid expected")
    equal(h.batches, [], "invalid expected zero writes")
    equal(h.reads, 0, "invalid expected zero IO")
  }
  for (const input of [
    { schema: 1 },
    { ...seed(), device: { ...seed().device, consent: { v: 2, at: 1 } } },
    { ...seed(), device: { ...seed().device, consent: null } },
    { schema: 1, device: noteDevice },
    { ...seed(), schema: 2 },
    { ...seed(), legacyClaimed: true }
  ]) {
    const h = harness(input),
      projected = api.project({ records: input })
    equal(await h.run(), projected.kind === "held" || projected.kind === "unavailable" ? { kind: "unavailable", reason: projected.reason } : "unexpected", "held acknowledgement")
    equal(h.batches, [], "held zero writes")
  }
  for (const mode of [
    "normal",
    "reject-applied",
    "reject-no-apply",
    "resolve-no-apply",
    "divergent",
    "reject-divergent",
    "read-error",
    "reject-read-error",
    "before-error",
    "preflight-error",
    "stale",
    "stop-load",
    "stop-preflight",
    "stop-set",
    "reject-stop-set",
    "stop-readback"
  ]) {
    const h = harness()
    h.mode(mode)
    const result = await h.run()
    const expected =
      mode === "normal"
        ? { kind: "committed", write: { kind: "resolved" } }
        : mode === "reject-applied"
          ? { kind: "committed", write: { kind: "rejected", error: h.marker } }
          : mode === "reject-no-apply"
            ? { kind: "failed", stage: "set-not-observed", error: h.marker }
            : ["before-error", "preflight-error"].includes(mode)
              ? { kind: "failed", stage: "before-set", error: h.readError }
              : ["stale", "stop-load", "stop-preflight"].includes(mode)
                ? { kind: "unavailable", reason: "stale" }
                : {
                    kind: "unconfirmed",
                    write: mode.startsWith("reject") ? { kind: "rejected", error: h.marker } : { kind: "resolved" },
                    cause: ["read-error", "reject-read-error"].includes(mode) ? { kind: "read-failed", error: h.readError } : { kind: mode.includes("stop") ? "stopped" : "readback" }
                  }
    equal(result, expected, "write observation " + mode)
    if (result.kind === "failed") check(result.error === (["before-error", "preflight-error"].includes(mode) ? h.readError : h.marker), "original error identity")
    if (result.kind === "committed" && result.write.kind === "rejected") check(result.write.error === h.marker, "rejected applied identity")
    if (result.kind === "unconfirmed" && result.cause.kind === "read-failed") check(result.cause.error === h.readError, "read failure identity")
    equal(h.batches.length, ["before-error", "preflight-error", "stale", "stop-load", "stop-preflight"].includes(mode) ? 0 : 1, "no automatic replay " + mode)
    observations.push({ mode, result, batches: h.batches, records: h.records, reads: h.reads })
  }
  return { checks, observations }
}

test("claim notice projector and non-owning executor preserve exact saved facts", async () => {
  expect((await noticeAcceptance({ project: projectClaimNotice, execute: executeClaimNoticeAcknowledgement })).checks).toBeGreaterThan(170)
})

test("saved browser notice bytes agree in two guarded realms and reject exact-match and write defects", async () => {
  const { readFile } = await import("node:fs/promises")
  const { resolve } = await import("node:path")
  const entry = resolve(import.meta.dir, "claim-notice.ts"),
    original = await readFile(entry, "utf8")
  const source = await noticeAcceptance({ project: projectClaimNotice, execute: executeClaimNoticeAcknowledgement })
  function run(bytes: string) {
    const script = `(async()=>{let accesses=0;const names=["browser","chrome","fetch","process","Bun","Date","performance","crypto","setTimeout","setInterval","localStorage","indexedDB","navigator","window","document"];for(const name of names)Object.defineProperty(globalThis,name,{get(){accesses++;throw Error("guard "+name)}});Object.defineProperty(Math,"random",{get(){accesses++;throw Error("guard random")}});const module={exports:{}};${bytes};let result,caught;try{result=await (${noticeAcceptance.toString()})({project:module.exports.projectClaimNotice,execute:module.exports.executeClaimNoticeAcknowledgement})}catch(error){caught=error.message}if(accesses)throw Error("forbidden access");let controls=0;for(const name of [...names,"random"]){let message;try{name==="random"?Math.random:globalThis[name]}catch(error){message=error.message}if(message!=="guard "+name)throw Error("inactive guard");controls++}return {result,caught,controls,accessesBeforeControls:0}})()`
    return JSON.parse(
      executeSyntheticNodeRealm(
        'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))',
        script,
        35000
      )
    )
  }
  const built = await Bun.build({ entrypoints: [entry], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (let round = 0; round < 2; round++) expect(run(bytes)).toEqual({ result: source, controls: 16, accessesBeforeControls: 0 })
  const controls = [
    { name: "account-only", before: "!sameSyncJson(view.notice, expectedNotice)", after: "view.notice.acct !== expectedNotice.acct", assertion: "exact notice comparison" },
    {
      name: "extensions-dropped",
      before: "!sameSyncJson(view.notice, expectedNotice)",
      after:
        '!sameSyncJson(JSON.parse(JSON.stringify(view.notice, (key, value) => key === "extension" ? undefined : value)), JSON.parse(JSON.stringify(expectedNotice, (key, value) => key === "extension" ? undefined : value)))',
      assertion: "exact notice comparison"
    },
    { name: "defaulted-Device", before: "...copyObject(loaded.device), claimNotice: null", after: "...decodeDevice(loaded.device), claimNotice: null", assertion: "only raw Device write" },
    { name: "no-preflight", before: "if (!jsonObject(preflight) || !sameSyncJson(preflight, baseline)) return stale", after: "void preflight", assertion: "write observation stale" },
    { name: "false-confirmation", before: 'return unconfirmed({ kind: "readback" })', after: 'return { kind: "committed", write }', assertion: "write observation resolve-no-apply" }
  ]
  for (const fault of controls) {
    expect(original.split(fault.before).length).toBe(2)
    const mutated = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "cjs",
      minify: true,
      plugins: [
        {
          name: fault.name,
          setup(builder) {
            builder.onLoad({ filter: /\/claim-notice\.ts$/ }, () => ({ loader: "ts", contents: original.replace(fault.before, fault.after) }))
          }
        }
      ]
    })
    expect(mutated.success).toBe(true)
    const observed = run(await mutated.outputs[0]!.text())
    expect(observed.caught?.startsWith(fault.assertion + ":")).toBe(true)
    expect(observed.controls).toBe(16)
    expect(observed.accessesBeforeControls).toBe(0)
  }
})
