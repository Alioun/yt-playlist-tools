import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { decodeFilter, isAccountKey, isChannelId, isPlaylistId } from "../../shared/model"
import { decide } from "../../shared/rules/channel-filter"
import { changeFilterSetting, type FilterSettingInput, type FilterSettingResult } from "./channel-filter-edit"
import { prepareDocumentBody } from "./write-preparation"
import { encodeSyncDocument, readSyncDocument } from "./sync-codec"
import { executeSyntheticNodeRealm } from "../../../tools/fixtures/owner-services-reconciliation/node-realm-transport"

function fixtureSuite(change: typeof changeFilterSetting, decode: typeof decodeFilter) {
  let assertions = 0
  function check(value: boolean, label: string): asserts value {
    assertions++
    if (!value) throw new Error(label)
  }
  function equal(actual: unknown, expected: unknown, label: string): void {
    if (Object.is(actual, expected)) return
    check(actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object", label)
    check(Array.isArray(actual) === Array.isArray(expected), label)
    const keys = Reflect.ownKeys(expected)
    check(Reflect.ownKeys(actual).length === keys.length, label)
    for (const key of keys) {
      const a = Object.getOwnPropertyDescriptor(actual, key)
      const b = Object.getOwnPropertyDescriptor(expected, key)
      check(a !== undefined && b !== undefined && "value" in a && "value" in b, label)
      equal(a.value, b.value, label)
    }
  }
  function freeze<T>(value: T): T {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child)
      Object.freeze(value)
    }
    return value
  }
  const A = "UCaaaaaaaaaaaaaaaaaaaaaa",
    B = "UCbbbbbbbbbbbbbbbbbbbbbb"
  const states: FilterSettingInput["desired"][] = [
    { mode: "deny", on: false },
    { mode: "deny", on: true },
    { mode: "allow", on: false },
    { mode: "allow", on: true }
  ]
  const rows = [
    [A, "A", "@a"],
    [B, "B", undefined, { future: "B" }]
  ]
  const retained = [
    { mode: "deny", on: false, channels: rows, future: { keep: true } },
    { mode: "deny", on: true, channels: rows, future: { keep: true } },
    { mode: "allow", on: false, channels: rows, future: { keep: true } },
    { mode: "allow", on: true, channels: rows, future: { keep: true } }
  ]
  const cleared = [
    { mode: "deny", on: false, channels: [], future: { keep: true } },
    { mode: "deny", on: true, channels: [], future: { keep: true } },
    { mode: "allow", on: false, channels: [], future: { keep: true } },
    { mode: "allow", on: true, channels: [], future: { keep: true } }
  ]
  const absentResults = [
    { kind: "unchanged" },
    { kind: "changed", filter: { mode: "deny", on: true, channels: [] } },
    { kind: "changed", filter: { mode: "allow", on: false, channels: [] } },
    { kind: "changed", filter: { mode: "allow", on: true, channels: [] } }
  ]
  const unconfirmed = [
    ["unchanged", "retained", "confirmation-required", "confirmation-required"],
    ["retained", "unchanged", "confirmation-required", "confirmation-required"],
    ["confirmation-required", "confirmation-required", "unchanged", "retained"],
    ["confirmation-required", "confirmation-required", "retained", "unchanged"]
  ]
  const confirmed = [
    ["unchanged", "retained", "cleared", "cleared"],
    ["retained", "unchanged", "cleared", "cleared"],
    ["cleared", "cleared", "unchanged", "retained"],
    ["cleared", "cleared", "retained", "unchanged"]
  ]
  function runMatrix(operation: typeof change) {
    let cases = 0,
      repeats = 0
    function run(input: FilterSettingInput, expected: unknown, previous: unknown, label: string) {
      const result = operation(freeze(input))
      equal(result, expected, label)
      equal(input.current, previous, `${label} preserves input`)
      cases++
      if (result.kind === "changed") {
        equal(operation(freeze({ ...input, current: result.filter })), { kind: "unchanged" }, `${label} repeat`)
        repeats++
      }
    }
    for (const clearListedChannels of ["not-confirmed", "confirmed"] satisfies FilterSettingInput["clearListedChannels"][]) {
      for (const [target, desired] of states.entries()) {
        run({ current: undefined, desired, clearListedChannels }, absentResults[target], undefined, `absence ${target} ${clearListedChannels}`)
        for (const [source] of states.entries()) {
          for (const populated of [false, true]) {
            const previous = populated ? retained[source] : cleared[source]
            const outcome = (clearListedChannels === "confirmed" ? confirmed : unconfirmed)[source]?.[target]
            const expected =
              source === target
                ? { kind: "unchanged" }
                : !populated
                  ? { kind: "changed", filter: cleared[target] }
                  : outcome === "confirmation-required"
                    ? { kind: "confirmation-required" }
                    : { kind: "changed", filter: outcome === "retained" ? retained[target] : cleared[target] }
            run({ current: decode(previous), desired, clearListedChannels }, expected, previous, `${source} to ${target} populated=${populated} ${clearListedChannels}`)
          }
        }
      }
    }
    const title = "  " + "🙂e\u0301".repeat(110) + "  "
    const handle = " @" + "𐐀".repeat(35) + " "
    const duplicates = [
      [B, title, undefined, { tail: [1, { keep: true }] }, "fifth"],
      [A, "A", handle],
      [B, "second B", "@b", { last: true }],
      [A, "Two columns"],
      [B, "Absent tail", undefined]
    ]
    for (const state of states) {
      const previous = { ...state, channels: duplicates, future: { keep: true } }
      for (const clearListedChannels of ["not-confirmed", "confirmed"] satisfies FilterSettingInput["clearListedChannels"][]) {
        run({ current: decode(previous), desired: state, clearListedChannels }, { kind: "unchanged" }, previous, "duplicate long-label no-op")
        const desired = { mode: state.mode, on: !state.on }
        run(
          { current: decode(previous), desired, clearListedChannels },
          {
            kind: "changed",
            filter: { mode: state.mode, on: !state.on, channels: duplicates, future: { keep: true } }
          },
          previous,
          "duplicate long-label switch"
        )
      }
    }
    return { cases, repeats }
  }
  const matrix = runMatrix(change)
  const controls: [string, typeof change][] = [
    [
      "no-op writes",
      input => {
        const result = change(input)
        return result.kind === "unchanged" ? { kind: "changed", filter: decode(input.current) } : result
      }
    ],
    ["missing off-mode confirmation", input => change({ ...input, clearListedChannels: input.current?.on === false ? "confirmed" : input.clearListedChannels })],
    [
      "retained channels on mode change",
      input => {
        const result = change(input)
        return result.kind === "changed" && input.current && input.current.mode !== input.desired.mode
          ? { kind: "changed", filter: decode({ ...result.filter, channels: input.current.channels }) }
          : result
      }
    ],
    [
      "lost body extension",
      input => {
        const result = change(input)
        return result.kind === "changed" ? { kind: "changed", filter: decode({ mode: result.filter.mode, on: result.filter.on, channels: result.filter.channels }) } : result
      }
    ],
    [
      "lost tuple columns",
      input => {
        const result = change(input)
        return result.kind === "changed" ? { kind: "changed", filter: decode({ ...result.filter, channels: result.filter.channels.map(([id, title, handle]) => [id, title, handle]) }) } : result
      }
    ],
    ["off deletes document", input => (input.desired.on ? change(input) : { kind: "unchanged" })],
    [
      "normalized labels and deduplicated order",
      input => {
        const result = change(input)
        return result.kind === "changed"
          ? { kind: "changed", filter: decode({ ...result.filter, channels: [...new Map(result.filter.channels.map(([id, title]) => [id, [id, title.slice(0, 100)]])).values()].reverse() }) }
          : result
      }
    ],
    [
      "mutated frozen input",
      input => {
        if (input.current) Object.defineProperty(input.current, "on", { value: input.desired.on })
        return change(input)
      }
    ]
  ]
  const caught: string[] = []
  for (const [name, alternative] of controls) {
    let failed = false
    try {
      runMatrix(alternative)
    } catch {
      failed = true
    }
    check(failed, `control escaped ${name}`)
    caught.push(name)
  }
  return { ...matrix, assertions, controls: caught }
}

test("literal mode/on matrix preserves immutable bodies and rejects broken alternatives", () => {
  const result = fixtureSuite(changeFilterSetting, decodeFilter)
  expect(result.cases).toBe(88)
  expect(result.repeats).toBe(54)
  expect(result.controls).toHaveLength(8)
})

test("equal settings return before inspecting channel data", () => {
  let reads = 0
  const current = Object.freeze({
    mode: "deny",
    on: false,
    get channels() {
      reads++
      return []
    }
  } satisfies NonNullable<FilterSettingInput["current"]>)
  expect(changeFilterSetting({ current, desired: { mode: "deny", on: false }, clearListedChannels: "confirmed" })).toEqual({ kind: "unchanged" })
  expect(reads).toBe(0)
  expect(changeFilterSetting({ current, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }).kind).toBe("changed")
  expect(reads).toBeGreaterThan(0)
})

test("real rule, preparation and sync preserve remembered list, tuple bridge and envelope extensions", () => {
  const A = "UCaaaaaaaaaaaaaaaaaaaaaa",
    B = "UCbbbbbbbbbbbbbbbbbbbbbb"
  const acct = "aaaaaaaaaaaaaaaa",
    playlist = "PL_A"
  if (!isChannelId(A) || !isAccountKey(acct) || !isPlaylistId(playlist)) throw new Error("Invalid synthetic IDs")
  const key = { kind: "filter", acct, playlist } satisfies Parameters<typeof encodeSyncDocument>[0]["key"]
  const initial = decodeFilter({
    mode: "deny",
    on: true,
    channels: [
      [A, "A", "@a"],
      [B, "B", undefined, { future: "B" }]
    ],
    future: { keep: true }
  })
  const previous = { v: 1, gen: "old", at: 1, by: "fixture", futureEnvelope: { keep: [true] }, data: initial }
  expect(encodeSyncDocument({ key, document: previous })).toEqual({ kind: "invalid", field: "document", reason: "json" })
  function save(result: FilterSettingResult) {
    if (result.kind !== "changed") throw new Error("Expected changed Filter")
    const prepared = prepareDocumentBody({ kind: "filter", data: result.filter })
    if (prepared.kind !== "prepared") throw new Error("Expected prepared body")
    const envelope = { ...previous, gen: "new", at: 2, data: prepared.data }
    const encoded = encodeSyncDocument({ key, document: envelope })
    if (encoded.kind !== "encoded") throw new Error("Expected encoded envelope")
    const read = readSyncDocument({ key, items: encoded.encoded.items })
    if (read.kind !== "value" || read.value.kind !== "filter") throw new Error("Expected filter readback")
    expect(read.json).toEqual(envelope)
    expect(read.json.futureEnvelope).toEqual({ keep: [true] })
    return { filter: read.value.document.data, json: prepared.data }
  }
  expect(decide(initial, A)).toBe("filtered")
  const off = save(changeFilterSetting({ current: initial, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }))
  expect(off.json).toEqual({
    mode: "deny",
    on: false,
    channels: [
      [A, "A", "@a"],
      [B, "B", null, { future: "B" }]
    ],
    future: { keep: true }
  })
  expect(decide(off.filter, A)).toBe("pass")
  const on = save(changeFilterSetting({ current: off.filter, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }))
  expect<unknown>(on.filter).toEqual({
    mode: "deny",
    on: true,
    channels: [
      [A, "A", "@a"],
      [B, "B", undefined, { future: "B" }]
    ],
    future: { keep: true }
  })
  expect(decide(on.filter, A)).toBe("filtered")
  expect(changeFilterSetting({ current: off.filter, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })).toEqual({ kind: "confirmation-required" })
  const allow = save(changeFilterSetting({ current: on.filter, desired: { mode: "allow", on: true }, clearListedChannels: "confirmed" }))
  expect<unknown>(allow.filter).toEqual({ mode: "allow", on: true, channels: [], future: { keep: true } })
  expect(decide(allow.filter, A)).toBe("filtered")
})

describe("actual browser artifact", () => {
  test("same public matrix executes on minified browser bytes in a fresh guarded VM", async () => {
    const entrypoint = resolve(import.meta.dir, "channel-filter-edit.ts")
    const visited = new Set<string>()
    async function inspect(file: string): Promise<void> {
      if (visited.has(file)) return
      visited.add(file)
      expect(file === entrypoint || file.startsWith(resolve(import.meta.dir, "../../shared/model") + "/")).toBe(true)
      for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(await readFile(file, "utf8"))) {
        expect(imported.path.startsWith(".")).toBe(true)
        const base = resolve(dirname(file), imported.path)
        await inspect((await Bun.file(`${base}.ts`).exists()) ? `${base}.ts` : resolve(base, "index.ts"))
      }
    }
    await inspect(entrypoint)
    async function artifact(path: string) {
      const build = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true })
      expect(build.success).toBe(true)
      expect(build.outputs).toHaveLength(1)
      return build.outputs[0]!.text()
    }
    const bytes = await artifact(entrypoint)
    const dependency = await artifact(resolve(import.meta.dir, "../../shared/model/index.ts"))
    const script = `
      let protectedReads = 0;
      const violation = {};
      const guarded = ["browser","chrome","localStorage","sessionStorage","indexedDB","fetch","XMLHttpRequest","WebSocket","window","document","navigator","location","Date","performance","crypto","process","Bun","Deno","setTimeout","setInterval","queueMicrotask","require"];
      for (const name of guarded) Object.defineProperty(globalThis, name, {get(){protectedReads++; throw violation}});
      Object.defineProperty(Math, "random", {get(){protectedReads++; throw violation}});
      const operation = (() => { const module = {exports:{}}; ${bytes}; return module.exports; })();
      const model = (() => { const module = {exports:{}}; ${dependency}; return module.exports; })();
      const fixtures = (${fixtureSuite.toString()})(operation.changeFilterSetting, model.decodeFilter);
      if (protectedReads !== 0) throw Error("Protected ambient reads during public matrix");
      const beforeControls = protectedReads;
      let controls = 0;
      for (const name of guarded) { try { globalThis[name]; } catch (error) { if (error !== violation) throw error; controls++; } }
      try { Math.random; } catch (error) { if (error !== violation) throw error; controls++; }
      JSON.stringify({exports:Object.keys(operation),fixtures,beforeControls,controls,protectedReads});
    `
    const result = JSON.parse(
      executeSyntheticNodeRealm(
        'import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; console.log(runInNewContext(readFileSync(0,"utf8"), {}, {timeout:30000}));',
        script,
        35000
      )
    )
    expect(result.exports).toEqual(["changeFilterChannel", "changeFilterSetting", "refreshChannelLabel"])
    expect(result.fixtures.cases).toBe(88)
    expect(result.fixtures.repeats).toBe(54)
    expect(result.fixtures.controls).toHaveLength(8)
    expect(result.beforeControls).toBe(0)
    expect(result.controls).toBe(23)
    expect(result.protectedReads).toBeGreaterThanOrEqual(23)
  })
})
