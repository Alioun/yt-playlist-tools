import { describe, expect, test } from "bun:test"
import type { JsonObject } from "../../shared/contracts/json"
import { prepareFirstEditHistory, readFirstEditProvenance, type FirstEditHistoryPatch, type FirstEditProvenance, type StoredEditHistory } from "./first-edit-provenance"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type FirstEditProofs = [
  Check<Equal<StoredEditHistory, { readonly kind: "absent" } | { readonly kind: "present"; readonly raw: unknown }>>,
  Check<Equal<FirstEditProvenance,
    { readonly kind: "unedited" } | { readonly kind: "edited" } | { readonly kind: "unknown" } | { readonly kind: "invalid" }>>,
  Check<Equal<FirstEditHistoryPatch,
    { readonly kind: "unchanged" } | { readonly kind: "set"; readonly sync: JsonObject } |
    { readonly kind: "unavailable"; readonly reason: "history" }>>,
  Check<Equal<typeof readFirstEditProvenance, (history: StoredEditHistory) => FirstEditProvenance>>,
  Check<Equal<typeof prepareFirstEditHistory,
    (input: { readonly history: StoredEditHistory; readonly syncOn: boolean }) => FirstEditHistoryPatch>>
]

const old = { joined: null, pushed: {}, status: "off", editedSinceOff: false }
const first = { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
function present(raw: unknown): StoredEditHistory { return { kind: "present", raw } }

describe("first-edit provenance", () => {
  test("absence and old false edit bits never certify an unedited lineage", () => {
    expect(readFirstEditProvenance({ kind: "absent" })).toEqual({ kind: "unknown" })
    for (const joined of [null, "synthetic-history"]) {
      for (const status of ["off", "joining", "ok", "full", "update-needed", "waiting"]) {
        expect(readFirstEditProvenance(present({ ...old, joined, status }))).toEqual({ kind: "unknown" })
      }
    }
  })

  test("new boolean facts, old true evidence and contradictions have distinct results", () => {
    for (const joined of [null, "synthetic-history"]) {
      for (const status of ["off", "joining", "ok", "full", "update-needed", "waiting"]) {
        const raw = { ...old, joined, status }
        expect(readFirstEditProvenance(present({ ...raw, everEdited: false }))).toEqual({ kind: "unedited" })
        expect(readFirstEditProvenance(present({ ...raw, everEdited: true }))).toEqual({ kind: "edited" })
        expect(readFirstEditProvenance(present({ ...raw, editedSinceOff: true }))).toEqual({ kind: "edited" })
        expect(readFirstEditProvenance(present({ ...raw, editedSinceOff: true, everEdited: true }))).toEqual({ kind: "edited" })
        expect(readFirstEditProvenance(present({ ...raw, editedSinceOff: true, everEdited: false }))).toEqual({ kind: "invalid" })
      }
    }
  })

  test("only absent off history yields the exact new record", () => {
    const history: StoredEditHistory = { kind: "absent" }
    expect(prepareFirstEditHistory({ history, syncOn: false })).toEqual({ kind: "set", sync: first })
    expect(prepareFirstEditHistory({ history, syncOn: true })).toEqual({ kind: "unavailable", reason: "history" })
    const patch = prepareFirstEditHistory({ history, syncOn: false })
    if (patch.kind !== "set") throw new Error("Expected a new record")
    patch.sync.pushed = { changed: "only-this-output" }
    expect(prepareFirstEditHistory({ history, syncOn: false })).toEqual({ kind: "set", sync: first })
    expect(history).toEqual({ kind: "absent" })
  })

  test("actual edits set only their owned fields and remain monotone across serialization", () => {
    for (const joined of [null, "synthetic-history"]) {
      for (const status of ["off", "joining", "ok", "full", "update-needed", "waiting"]) {
        for (const everEdited of [undefined, false, true]) {
          const raw = { ...old, joined, status, ...(everEdited === undefined ? {} : { everEdited }) }
          for (const syncOn of [false, true]) {
            const before = JSON.stringify(raw)
            const patch = prepareFirstEditHistory({ history: present(raw), syncOn })
            expect(patch).toEqual(everEdited === true && syncOn ? { kind: "unchanged" } : {
              kind: "set", sync: { ...raw, everEdited: true, ...(!syncOn ? { editedSinceOff: true } : {}) }
            })
            expect(JSON.stringify(raw)).toBe(before)
            if (patch.kind !== "set") continue
            const restarted: unknown = JSON.parse(JSON.stringify(patch.sync))
            expect(readFirstEditProvenance(present(restarted))).toEqual({ kind: "edited" })
            expect(prepareFirstEditHistory({ history: present(restarted), syncOn })).toEqual({ kind: "unchanged" })
          }
        }
      }
    }
    expect(prepareFirstEditHistory({ history: present(first), syncOn: false })).toEqual({ kind: "unchanged" })
    expect(prepareFirstEditHistory({ history: present({ ...old, editedSinceOff: true }), syncOn: true }))
      .toEqual({ kind: "set", sync: first })
  })

  test("retains every raw extension, acknowledged repair and R155 value with detached output", () => {
    const raw: JsonObject = JSON.parse('{"joined":"synthetic-history","pushed":{"doc:settings":"repaired-generation","__proto__":"opaque-generation"},"status":"waiting","editedSinceOff":false,"opaqueWrite":{"gate":{"kind":"held","notBefore":60000,"extension":[null,{"keep":true}]},"diagnostic":{"name":null,"message":"original diagnostic","extension":{"keep":[1]}},"__proto__":{"opaque":true}},"future":{"items":[{"keep":true}]},"__proto__":{"inert":true},"toJSON":"inert"}')
    const before = JSON.stringify(raw)
    for (const syncOn of [false, true]) {
      const patch = prepareFirstEditHistory({ history: present(raw), syncOn })
      expect(patch).toEqual({ kind: "set", sync: { ...raw, everEdited: true, ...(!syncOn ? { editedSinceOff: true } : {}) } })
      expect(JSON.stringify(raw)).toBe(before)
      if (patch.kind !== "set") throw new Error("Expected a patch")
      expect(Object.hasOwn(patch.sync, "__proto__")).toBe(true)
      function detached(output: unknown, input: unknown): void {
        if (output === null || typeof output !== "object") return
        expect(output).not.toBe(input)
        for (const [key, value] of Object.entries(output)) {
          const source: unknown = input !== null && typeof input === "object" ? Reflect.get(input, key) : undefined
          detached(value, source)
        }
      }
      detached(patch.sync, raw)
      const opaque = patch.sync.opaqueWrite
      if (opaque === null || typeof opaque !== "object" || Array.isArray(opaque)) throw new Error("Missing opaque record")
      opaque.diagnostic = null
      expect(JSON.stringify(raw)).toBe(before)
    }
  })

  test("refuses malformed owned fields and non-JSON extensions without defaulting or input changes", () => {
    const cyclic: Record<string, unknown> = { ...old }
    cyclic.extension = cyclic
    let accessorCalls = 0
    const accessor = Object.defineProperty({ ...old }, "extension", { enumerable: true, get() { accessorCalls++; return true } })
    const malformed: unknown[] = [undefined, null, false, 0, "off", [], {},
      ...Object.keys(old).map(key => Object.fromEntries(Object.entries(old).filter(([field]) => field !== key))),
      ...[null, "false", 0, 1, [], {}, undefined].map(everEdited => ({ ...old, everEdited })),
      { ...old, joined: "" }, { ...old, pushed: [] }, { ...old, pushed: { other: "" } },
      { ...old, status: "unsupported" }, { ...old, editedSinceOff: null },
      { ...old, editedSinceOff: true, everEdited: false },
      { ...old, opaqueWrite: { gate: { kind: "held", notBefore: -1 }, diagnostic: null } },
      { ...old, opaqueWrite: { gate: null, diagnostic: { name: 1, message: null } } },
      { ...old, extension: undefined }, { ...old, extension: Infinity }, { ...old, extension: NaN },
      { ...old, extension: () => true }, { ...old, extension: Symbol("invalid") }, { ...old, extension: 1n },
      { ...old, extension: new Map() }, { ...old, extension: Array(1) }, cyclic, accessor,
      Object.defineProperty({ ...old }, "hidden", { value: true }),
      { ...old, [Symbol("invalid")]: true }
    ]
    for (const raw of malformed) {
      expect(readFirstEditProvenance(present(raw))).toEqual({ kind: "invalid" })
      for (const syncOn of [false, true]) {
        expect(prepareFirstEditHistory({ history: present(raw), syncOn })).toEqual({ kind: "unavailable", reason: "history" })
      }
    }
    expect(accessorCalls).toBe(0)
    expect(cyclic.extension).toBe(cyclic)
  })
})
