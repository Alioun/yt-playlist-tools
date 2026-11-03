import { prepareFirstEditHistory, readFirstEditProvenance, type StoredEditHistory } from "../../../src/background/store/first-edit-provenance"
import { decodeSyncState } from "../../../src/shared/model/decodeSyncState"
import { DecodeError } from "../../../src/shared/model/codec"
import type { JsonObject } from "../../../src/shared/contracts/json"

export function runFirstEditProvenanceFixture() {
  let assertions = 0
  function equal(actual: unknown, expected: unknown, label: string): void {
    assertions++
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label)
  }
  const old = { joined: null, pushed: {}, status: "off", editedSinceOff: false }
  const first = { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
  const retained: JsonObject = JSON.parse(
    '{"joined":"synthetic-history","pushed":{"doc:settings":"g1","opaque:key":"g2","__proto__":"g3"},"status":"waiting","editedSinceOff":false,"opaqueWrite":{"gate":{"kind":"held","notBefore":60000,"futureGate":[null,false]},"diagnostic":{"name":"SyntheticFailure","message":"original opaque message","futureDiagnostic":{"keep":true}},"futureOpaque":[1]},"future":{"items":[{"keep":true},null]},"__proto__":{"inert":true},"toJSON":"inert"}'
  )
  const cases: { name: string; history: StoredEditHistory; expected: string }[] = [
    { name: "absent", history: { kind: "absent" }, expected: "unknown" },
    { name: "old-null-joined", history: { kind: "present", raw: old }, expected: "unknown" },
    { name: "old-same-history", history: { kind: "present", raw: { ...old, joined: "synthetic-history" } }, expected: "unknown" },
    { name: "known-unedited", history: { kind: "present", raw: { ...old, everEdited: false } }, expected: "unedited" },
    { name: "known-edited", history: { kind: "present", raw: { ...old, everEdited: true } }, expected: "edited" },
    { name: "legacy-edited", history: { kind: "present", raw: { ...old, editedSinceOff: true } }, expected: "edited" },
    { name: "already-correct", history: { kind: "present", raw: first }, expected: "edited" },
    { name: "contradiction", history: { kind: "present", raw: { ...first, everEdited: false } }, expected: "invalid" },
    { name: "extensions-and-r155", history: { kind: "present", raw: retained }, expected: "unknown" },
    { name: "malformed-flag", history: { kind: "present", raw: { ...old, everEdited: "false" } }, expected: "invalid" },
    { name: "malformed-history", history: { kind: "present", raw: { ...old, pushed: { other: "" } } }, expected: "invalid" },
    { name: "present-null", history: { kind: "present", raw: null }, expected: "invalid" }
  ]
  const observations = cases.map(({ name, history, expected }) => {
    const before = JSON.stringify(history)
    const read = readFirstEditProvenance(history)
    const off = prepareFirstEditHistory({ history, syncOn: false })
    const on = prepareFirstEditHistory({ history, syncOn: true })
    equal(read, { kind: expected }, `${name}: read`)
    equal(JSON.stringify(history), before, `${name}: source unchanged`)
    if (expected === "invalid") {
      equal(off, { kind: "unavailable", reason: "history" }, `${name}: off refusal`)
      equal(on, { kind: "unavailable", reason: "history" }, `${name}: on refusal`)
    }
    return { name, input: history, read, off, on }
  })
  equal(observations[0]?.off, { kind: "set", sync: first }, "exact first off edit")
  equal(observations[0]?.on, { kind: "unavailable", reason: "history" }, "absent on refuses")
  equal(observations[6]?.off, { kind: "unchanged" }, "already-correct off")
  equal(observations[6]?.on, { kind: "unchanged" }, "already-correct on")
  const retainedOff = prepareFirstEditHistory({ history: { kind: "present", raw: retained }, syncOn: false })
  const retainedOn = prepareFirstEditHistory({ history: { kind: "present", raw: retained }, syncOn: true })
  equal(retainedOff, { kind: "set", sync: { ...retained, editedSinceOff: true, everEdited: true } }, "full off preservation")
  equal(retainedOn, { kind: "set", sync: { ...retained, everEdited: true } }, "full on preservation")
  const decoder = [old, { ...old, everEdited: false }, first, retained].map(raw => {
    const decoded = decodeSyncState(raw)
    equal(decoded, raw, "real decoder compatibility")
    return { input: raw, decoded }
  })
  let malformedFlagRejected = false
  try {
    decodeSyncState({ ...old, everEdited: "false" })
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    malformedFlagRejected = true
  }
  equal(malformedFlagRejected, true, "real decoder rejects invalid flag")

  const callerInput = { before: { theme: "system" }, after: { theme: "system" }, history: { kind: "absent" } } as const
  let helperCalls = 0
  const noOpPatch =
    JSON.stringify(callerInput.before) === JSON.stringify(callerInput.after)
      ? null
      : (() => {
          helperCalls++
          return prepareFirstEditHistory({ history: callerInput.history, syncOn: false })
        })()
  equal({ helperCalls, patch: noOpPatch }, { helperCalls: 0, patch: null }, "no-op caller does not request a patch")

  const ambiguity = [
    { name: "default-looking", settings: { theme: "system" }, initializedAt: 100, editedAt: 100 },
    { name: "rolled-back-clock", settings: { theme: "system" }, initializedAt: 100, editedAt: 0 }
  ].map(input => {
    const read = readFirstEditProvenance({ kind: "absent" })
    equal(read, { kind: "unknown" }, `${input.name}: no historical inference`)
    return { input, history: { kind: "absent" }, read }
  })
  const restartInput = JSON.parse(JSON.stringify(first))
  const restart = {
    input: restartInput,
    read: readFirstEditProvenance({ kind: "present", raw: restartInput }),
    patch: prepareFirstEditHistory({ history: { kind: "present", raw: restartInput }, syncOn: false })
  }
  equal(restart.read, { kind: "edited" }, "serialized edited fact")
  equal(restart.patch, { kind: "unchanged" }, "serialized patch idempotence")
  return {
    kind: "pure-derivation",
    production: "not-connected",
    "owner-integration": "pending",
    precondition: "admitted actual changed-document transaction",
    positiveInitialization: "not-implemented",
    observations,
    decoder,
    malformedFlagRejected,
    noOpCaller: { input: callerInput, helperCalls, patch: noOpPatch },
    ambiguity,
    restart,
    assertions
  }
}

if (import.meta.main) console.log(JSON.stringify(runFirstEditProvenanceFixture(), null, 2))
