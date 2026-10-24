import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import {
  decodeFilter, decodeSettings, decodeSetup, defaultSettings, defaultSetup, documentKey,
  isAccountKey, isPlaylistId, isShortcutId
} from "../../shared/model"
import type { AccountKey, PlaylistId, Settings, Setup } from "../../shared/model"
import * as operations from "./accounts"
import type { AccountChoice, AccountChoiceResult, AccountSnapshot, SetupRemoval } from "./accounts"
import { encodeSyncDocument } from "./sync-codec"

function account(value: string): AccountKey {
  if (!isAccountKey(value)) throw new Error("Invalid synthetic account")
  return value
}
function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("Invalid synthetic playlist")
  return value
}
const acct = account("synthetic_acct01")
const acct2 = account("synthetic_acct02")
const acct3 = account("synthetic_acct03")
const acct4 = account("synthetic_acct04")
const one = playlist("PLone"), two = playlist("PLtwo"), orphan = playlist("PLorphan"), wl = playlist("WL")
const save = "save01", keep = "keep01", gone = "gone01"
if (!isShortcutId(save) || !isShortcutId(keep) || !isShortcutId(gone)) throw new Error("Invalid synthetic shortcut")
const settings = decodeSettings({
  ...defaultSettings(), futureSettings: { enabled: false },
  shortcuts: {
    ...defaultSettings().shortcuts, preset: true, futureSection: [1, 2],
    list: [
      { id: save, key: null, label: "Save", watchLaterOnEveryAccount: false, futureRow: "removed" },
      { id: keep, key: { char: "k", code: "KeyK", ctrl: false, alt: true, shift: false, meta: false }, label: " Keep ", watchLaterOnEveryAccount: false, futureRow: { untouched: true } }
    ]
  }
})
const settingsWithDefaults: Settings = {
  ...settings, shortcuts: { ...settings.shortcuts, list: settings.shortcuts.list.map(shortcut => ({ ...shortcut, watchLaterOnEveryAccount: true })) }
}
const absent = { kind: "absent" } satisfies AccountSnapshot
const offFilter = decodeFilter({ mode: "allow", on: false, channels: [], futureFilter: { kept: true } })
const futureFilter = decodeFilter({
  mode: "deny", on: true, futureFilter: "unchanged",
  channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Untrimmed ".repeat(15), null, { futureColumn: true }]]
})
function present(setup: Setup, filters = {}): AccountSnapshot {
  return { kind: "present", bodies: { setup, filters } }
}
function removal(acct: AccountKey, playlists: readonly PlaylistId[] = []): SetupRemoval {
  return {
    acct, documents: [{ kind: "setup", acct }, ...playlists.map(playlist => ({ kind: "filter", acct, playlist } satisfies SetupRemoval["documents"][number]))],
    cacheKey: `cache:${acct}`,
    progressKeys: [
      `progress:${acct}:0`, `progress:${acct}:1`, `progress:${acct}:2`, `progress:${acct}:3`,
      `progress:${acct}:4`, `progress:${acct}:5`, `progress:${acct}:6`, `progress:${acct}:7`,
      `progress:${acct}:8`, `progress:${acct}:9`, `progress:${acct}:10`, `progress:${acct}:11`,
      `progress:${acct}:12`, `progress:${acct}:13`, `progress:${acct}:14`, `progress:${acct}:15`
    ], clearAccountSession: true, clearLastAccountIfMatches: true
  }
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (value instanceof Set) {
      Object.defineProperties(value, Object.fromEntries(["add", "delete", "clear"].map(name => [name, { value() { throw new Error("Mutated caller context") } }])))
    }
    Object.values(value).forEach(frozen)
    Object.freeze(value)
  }
  return value
}
type ChoiceFixture = { name: string; input: Parameters<typeof operations.changeAccountChoice>[0]; expected: AccountChoiceResult }
function choiceCase(name: string, current: AccountSnapshot, choice: AccountChoice, expected: AccountChoiceResult, additionalChosenPlaylists = new Set<PlaylistId>(), sharedSettings = settings): ChoiceFixture {
  return { name, input: { acct, current, choice, settings: sharedSettings, additionalChosenPlaylists }, expected }
}
function saved(setup: Setup, filters = {}): AccountChoiceResult {
  return { kind: "save", acct, bodies: { setup, filters } }
}
const unchanged = { kind: "unchanged" } satisfies AccountChoiceResult
const initial = decodeSetup({ ...defaultSetup(), autoAdd: [{ pl: one, takes: "both", pct: 73, futureEntry: { keep: true } }] })
const baseEntry = initial.autoAdd[0]!
const withTakes = { ...initial, autoAdd: [{ ...baseEntry, takes: "shorts" }] } satisfies Setup
const resetEntry = { pl: one, takes: "both", futureEntry: { keep: true } }

const groups: { name: string; cases: ChoiceFixture[] }[] = [
  { name: "1. absent accounts and positive first choices", cases: [
    choiceCase("untick absent", absent, { kind: "auto-add", playlist: one, chosen: false }, unchanged),
    choiceCase("clear shortcut", absent, { kind: "shortcut-target", shortcut: save, playlist: null }, unchanged, new Set([wl]), settingsWithDefaults),
    ...(["quickSave", "musicSave", "gather"] as const).map(field => choiceCase(`clear ${field}`, absent, { kind: "save-target", field, playlist: null }, unchanged)),
    choiceCase("first auto-add", absent, { kind: "auto-add", playlist: playlist("PLnew"), chosen: true }, saved({ ...defaultSetup(), autoAdd: [{ pl: "PLnew", takes: "videos" }] })),
    choiceCase("first shortcut while off and keyless", absent, { kind: "shortcut-target", shortcut: save, playlist: wl }, saved({ ...defaultSetup(), targets: { [save]: wl } })),
    choiceCase("missing shortcut", absent, { kind: "shortcut-target", shortcut: gone, playlist: one }, { kind: "invalid", reason: "missing-shortcut" })
  ] },
  { name: "2. ordered entries, Takes and exact percentage resets", cases: [
    choiceCase("repeat selected", present(initial), { kind: "auto-add", playlist: one, chosen: true }, unchanged),
    choiceCase("append preserves entry", present(initial), { kind: "auto-add", playlist: two, chosen: true }, saved({ ...initial, autoAdd: [baseEntry, { pl: two, takes: "videos" }] })),
    choiceCase("Takes preserves override", present(initial), { kind: "takes", playlist: one, takes: "shorts" }, saved(withTakes)),
    choiceCase("same Takes", present(initial), { kind: "takes", playlist: one, takes: "both" }, unchanged),
    choiceCase("reset deletes pct", present(initial), { kind: "percentage", playlist: one, pct: null }, saved(decodeSetup({ ...initial, autoAdd: [resetEntry] }))),
    choiceCase("same percentage", present(initial), { kind: "percentage", playlist: one, pct: 73 }, unchanged),
    choiceCase("reset absent override", present({ ...defaultSetup(), autoAdd: [{ pl: one, takes: "videos" }] }), { kind: "percentage", playlist: one, pct: null }, unchanged),
    ...[0, 100].map(pct => choiceCase(`exact ${pct}`, present(initial), { kind: "percentage", playlist: one, pct }, saved({ ...initial, autoAdd: [{ ...baseEntry, pct }] }))),
    ...[-1, 101, 12.5, NaN, Infinity, -Infinity].map(pct => choiceCase(`invalid ${pct}`, present(initial), { kind: "percentage", playlist: one, pct }, { kind: "invalid", reason: "invalid-percentage" })),
    choiceCase("missing Takes entry", absent, { kind: "takes", playlist: one, takes: "both" }, { kind: "invalid", reason: "missing-auto-add" }),
    choiceCase("missing percentage entry", present(initial), { kind: "percentage", playlist: two, pct: 50 }, { kind: "invalid", reason: "missing-auto-add" })
  ] },
  { name: "3. unticking retains off and empty kept filters", cases: [
    choiceCase("off empty filter retains setup", present(initial, { [one]: offFilter }), { kind: "auto-add", playlist: one, chosen: false }, saved(defaultSetup(), { [one]: offFilter })),
    choiceCase("re-tick reuses filter without Takes or override", present(defaultSetup(), { [one]: offFilter }), { kind: "auto-add", playlist: one, chosen: true }, saved({ ...defaultSetup(), autoAdd: [{ pl: one, takes: "videos" }] }, { [one]: offFilter })),
    choiceCase("last untick removes unfiltered setup", present(initial), { kind: "auto-add", playlist: one, chosen: false }, { kind: "remove", removal: removal(acct) })
  ] },
  { name: "4. Gather and kept orphan choices retain a setup", cases: [
    ...(["quickSave", "musicSave", "gather"] as const).flatMap(field => [
      choiceCase(`${field} Watch Later creates setup`, absent, { kind: "save-target", field, playlist: wl }, saved({ ...defaultSetup(), [field]: wl })),
      choiceCase(`${field} survives last untick`, present({ ...initial, [field]: two }), { kind: "auto-add", playlist: one, chosen: false }, saved({ ...defaultSetup(), [field]: two }))
    ]),
    choiceCase("label alone is empty", present({ ...initial, label: { name: "Synthetic", handle: "@synthetic" } }), { kind: "auto-add", playlist: one, chosen: false }, { kind: "remove", removal: removal(acct) }),
    choiceCase("marks alone are empty even with effective shared default", present({ ...initial, marks: { [wl]: "missing" } }), { kind: "auto-add", playlist: one, chosen: false }, { kind: "remove", removal: removal(acct) }, new Set([wl]), settingsWithDefaults),
    choiceCase("orphan filter retains setup", present(initial, { [orphan]: offFilter }), { kind: "auto-add", playlist: one, chosen: false }, saved(defaultSetup(), { [orphan]: offFilter }))
  ] },
  { name: "5. actual shortcuts and caller-resolved defaults", cases: [
    ...[true, false].map(effective => choiceCase(`effective Watch Later ${effective}`,
      present({ ...initial, targets: { [save]: two, [gone]: one, ...(!effective ? { [keep]: two } : {}) }, marks: { [one]: "full", [two]: "missing", [wl]: "full", PLstale: "missing" } }),
      { kind: "takes", playlist: one, takes: "shorts" },
      saved({ ...withTakes, targets: { [save]: two, ...(!effective ? { [keep]: two } : {}) }, marks: { [one]: "full", [two]: "missing", ...(effective ? { [wl]: "full" as const } : {}) } }), effective ? new Set([wl]) : new Set<PlaylistId>(), settingsWithDefaults)),
    choiceCase("unchanged does not sanitize dangling data", present({ ...initial, targets: { [gone]: one }, marks: { PLstale: "full" } }), { kind: "auto-add", playlist: one, chosen: true }, unchanged),
    choiceCase("reset override restores effective shared default", present({ ...defaultSetup(), gather: one, targets: { [save]: two }, marks: { [one]: "full", [two]: "missing", [wl]: "full" } }),
      { kind: "shortcut-target", shortcut: save, playlist: null }, saved({ ...defaultSetup(), gather: one, marks: { [one]: "full", [wl]: "full" } }), new Set([wl]), settingsWithDefaults),
    choiceCase("another role retains mark", present({ ...initial, quickSave: one, marks: { [one]: "full" } }), { kind: "auto-add", playlist: one, chosen: false }, saved({ ...defaultSetup(), quickSave: one, marks: { [one]: "full" } })),
    choiceCase("save target changes only one role", present({ ...initial, quickSave: one, musicSave: one, gather: one }), { kind: "save-target", field: "musicSave", playlist: two }, saved({ ...initial, quickSave: one, musicSave: two, gather: one }))
  ] }
]

for (const group of groups) describe(group.name, () => {
  for (const fixture of group.cases) test(fixture.name, () => {
    const before = structuredClone(fixture.input)
    expect(operations.changeAccountChoice(frozen(fixture.input))).toEqual(fixture.expected)
    expect(fixture.input).toEqual(before)
  })
})

const sharedInput: Parameters<typeof operations.removeSharedShortcut>[0] = {
  settings: settingsWithDefaults, shortcut: save, accounts: [
    { acct, current: present(decodeSetup({ ...defaultSetup(), futureSetup: "kept", targets: { [save]: one, [keep]: two, [gone]: one }, marks: { [one]: "full", [two]: "missing", [wl]: "full" } })), additionalChosenPlaylists: new Set() },
    { acct: acct2, current: present({ ...defaultSetup(), label: { name: "Synthetic" }, targets: { [save]: one }, marks: { [one]: "full" } }), additionalChosenPlaylists: new Set([wl]) },
    { acct: acct3, current: present({ ...defaultSetup(), targets: { [save]: one }, gather: two, marks: { [wl]: "full" } }), additionalChosenPlaylists: new Set([wl]) },
    { acct: acct4, current: present({ ...defaultSetup(), targets: { [save]: one } }, { [orphan]: offFilter }), additionalChosenPlaylists: new Set([wl]) },
    { acct: account("synthetic_acct05"), current: present({ ...defaultSetup(), targets: { [gone]: one }, marks: { [wl]: "full" } }), additionalChosenPlaylists: new Set([wl]) },
    { acct: account("synthetic_acct06"), current: absent, additionalChosenPlaylists: new Set([wl]) }
  ]
}
const survivingShortcut = settingsWithDefaults.shortcuts.list[1]!
const sharedExpected: ReturnType<typeof operations.removeSharedShortcut> = {
  kind: "removed", settings: { ...settingsWithDefaults, shortcuts: { ...settingsWithDefaults.shortcuts, list: [{ ...survivingShortcut, label: "Keep" }] } },
  accounts: [
    { kind: "save", acct, bodies: { setup: decodeSetup({ ...defaultSetup(), futureSetup: "kept", targets: { [keep]: two }, marks: { [two]: "missing" } }), filters: {} } },
    { kind: "remove", removal: removal(acct2) },
    { kind: "save", acct: acct3, bodies: { setup: { ...defaultSetup(), gather: two, marks: { [wl]: "full" } }, filters: {} } },
    { kind: "save", acct: acct4, bodies: { setup: defaultSetup(), filters: { [orphan]: offFilter } } }
  ]
}
describe("6. shared shortcut deletion", () => {
  test("changes only affected setups and preserves complete settings", () => {
    const before = structuredClone(sharedInput)
    expect(operations.removeSharedShortcut(frozen(sharedInput))).toEqual(sharedExpected)
    expect(sharedInput).toEqual(before)
    if (sharedExpected.kind !== "removed") throw new Error("Invalid fixture")
    expect(operations.removeSharedShortcut({ ...sharedInput, settings: sharedExpected.settings })).toEqual(unchanged)
  })
  test("the last row never reapplies a preset and absent deletion never sanitizes", () => {
    const only = { ...settings, shortcuts: { ...settings.shortcuts, list: [settings.shortcuts.list[0]!] } }
    expect(operations.removeSharedShortcut(frozen({ settings: only, shortcut: save, accounts: [] }))).toEqual({ kind: "removed", settings: { ...only, shortcuts: { ...only.shortcuts, list: [] } }, accounts: [] })
    expect(operations.removeSharedShortcut({ ...sharedInput, shortcut: gone })).toEqual(unchanged)
  })
})

const removalInput = { acct, current: present(initial, { [one]: futureFilter, [two]: offFilter, [orphan]: offFilter }) }
describe("7. complete semantic setup removal", () => {
  test("includes every filter, cache, sixteen shards and conditional cleanup", () => {
    const before = structuredClone(removalInput)
    const result = operations.planSetupRemoval(frozen(removalInput))
    expect(result).toEqual({ kind: "remove", removal: removal(acct, [one, two, orphan]) })
    if (result.kind !== "remove") throw new Error("Removal refused")
    expect(result.removal.documents.map(documentKey)).toEqual([`doc:setup:${acct}`, `doc:filter:${acct}:PLone`, `doc:filter:${acct}:PLtwo`, `doc:filter:${acct}:PLorphan`])
    expect(new Set(result.removal.progressKeys).size).toBe(16)
    expect(removalInput).toEqual(before)
    expect(operations.planSetupRemoval({ acct, current: absent })).toEqual(unchanged)
  })
})

const extended = decodeSetup({
  ...initial, futureSetup: { value: [1, 2] },
  label: { name: "Synthetic", handle: "@synthetic", avatar: "synthetic-avatar", futureLabel: { enabled: true } },
  quickSave: two, musicSave: wl, gather: two, targets: { [save]: one }
})
const extensionCase = choiceCase("preserve all extensions", present(extended, { [one]: futureFilter, [orphan]: offFilter }),
  { kind: "percentage", playlist: one, pct: null }, saved(decodeSetup({ ...extended, autoAdd: [resetEntry] }), { [one]: futureFilter, [orphan]: offFilter }))
describe("8. immutable decoded bodies and future extensions", () => {
  test("preserves setup, label, entry, filter and tuple extensions exactly", () => {
    const before = structuredClone(extensionCase.input)
    const result = operations.changeAccountChoice(frozen(extensionCase.input))
    expect(result).toEqual(extensionCase.expected)
    expect(extensionCase.input).toEqual(before)
    if (result.kind !== "save") throw new Error("Save refused")
    expect(Object.hasOwn(result.bodies.setup.autoAdd[0]!, "pct")).toBe(false)
    const channel: readonly unknown[] | undefined = result.bodies.filters[one]!.channels[0]
    expect(channel).toEqual(["UCaaaaaaaaaaaaaaaaaaaaaa", "Untrimmed ".repeat(15), undefined, { futureColumn: true }])
    expect(operations.changeAccountChoice({ ...extensionCase.input, current: { kind: "present", bodies: result.bodies } })).toEqual(unchanged)
    expect(encodeSyncDocument({ key: { kind: "filter", acct, playlist: one }, document: { v: 1, gen: "synthetic", at: 0, by: "synthetic", data: result.bodies.filters[one] } })).toEqual({ kind: "invalid", field: "document", reason: "json" })
  })
})

const ambientGuards = `
  const fail = () => { throw Error("Forbidden ambient effect"); };
  for (const name of ["browser","chrome","window","document","navigator","indexedDB","localStorage","sessionStorage","fetch","XMLHttpRequest","WebSocket","EventSource","Date","performance","crypto","process","Bun","Deno","setTimeout","setInterval","clearTimeout","clearInterval","queueMicrotask"]) {
    Object.defineProperty(globalThis, name, { get: fail });
  }
  Object.defineProperty(Math, "random", { get: fail });
`

describe("actual browser artifact", () => {
  test("executes all public operations against complete frozen fixtures with no ambient access", async () => {
    const entrypoint = resolve(import.meta.dir, "accounts.ts")
    const visited = new Set<string>()
    async function inspect(file: string): Promise<void> {
      if (visited.has(file)) return
      visited.add(file)
      expect(file === entrypoint || file.startsWith(resolve(import.meta.dir, "../../shared/model") + "/")).toBe(true)
      const source = await readFile(file, "utf8")
      for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(source)) {
        expect(imported.path.startsWith(".")).toBe(true)
        const base = resolve(dirname(file), imported.path)
        await inspect(await Bun.file(`${base}.ts`).exists() ? `${base}.ts` : resolve(base, "index.ts"))
      }
    }
    await inspect(entrypoint)
    const program = ts.createProgram([...visited], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] })
    const checker = program.getTypeChecker()
    const forbidden = new Set(["Date", "performance", "crypto", "process", "Bun", "Deno", "browser", "chrome", "window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "setTimeout", "setInterval"])
    for (const file of visited) {
      const source = program.getSourceFile(file)
      if (!source) throw new Error("Missing graph source")
      function check(node: ts.Node): void {
        if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) return
        if (ts.isIdentifier(node) && forbidden.has(node.text)) {
          const property = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node || ts.isPropertyAssignment(node.parent) && node.parent.name === node
          if (!property) expect(checker.getSymbolAtLocation(node)?.declarations?.some(declaration => visited.has(declaration.getSourceFile().fileName)), `${file} reads ambient ${node.text}`).toBe(true)
        }
        if (ts.isPropertyAccessExpression(node)) expect(node.getText(source)).not.toMatch(/^(?:Math\.random|import\.meta\.env|globalThis\.(?:Date|performance|crypto|process|Bun|Deno|browser|chrome|window|document|navigator|indexedDB|localStorage|sessionStorage|fetch|XMLHttpRequest))(?:\.|$)/)
        ts.forEachChild(node, check)
      }
      check(source)
    }
    const fixtures = [
      ...groups.flatMap(group => group.cases).concat(extensionCase).map(fixture => ({ ...fixture, operation: "changeAccountChoice" })),
      { name: "shared deletion", operation: "removeSharedShortcut", input: sharedInput, expected: sharedExpected },
      { name: "semantic removal", operation: "planSetupRemoval", input: removalInput, expected: { kind: "remove", removal: removal(acct, [one, two, orphan]) } }
    ]
    const payload = JSON.stringify(fixtures, (_, value) => value instanceof Set ? { $set: [...value] } : value === undefined ? { $undefined: true } : typeof value === "number" && !Number.isFinite(value) ? { $number: String(value) } : value)
    const build = await Bun.build({ entrypoints: [entrypoint], target: "browser", format: "cjs", minify: true })
    expect(build.success).toBe(true)
    expect(build.outputs).toHaveLength(1)
    const artifact = await build.outputs[0]!.text()
    expect(artifact.length).toBeGreaterThan(0)
    const evidence = JSON.parse(runInNewContext(ambientGuards + artifact + `
      ;(() => {
        const restore = value => {
          if (value && typeof value === "object") {
            if (value.$set) return new Set(value.$set);
            if (value.$undefined) return undefined;
            if (value.$number) return Number(value.$number);
            if (Array.isArray(value)) return value.map(restore);
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]));
          }
          return value;
        };
        const stable = value => {
          if (value instanceof Set) return {$set:[...value]};
          if (Array.isArray(value)) return value.map(stable);
          if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
          if (value === undefined) return {$undefined:true};
          if (typeof value === "number" && !Number.isFinite(value)) return {$number:String(value)};
          return value;
        };
        const freeze = value => {
          if (value && typeof value === "object") {
            if (value instanceof Set) for (const name of ["add","delete","clear"]) Object.defineProperty(value,name,{value() { throw Error("Context mutated"); }});
            Object.values(value).forEach(freeze); Object.freeze(value);
          }
          return value;
        };
        let guarded = 0;
        for (const probe of [() => globalThis.fetch, () => Date, () => Math.random]) { try { probe(); } catch { guarded++; } }
        if (guarded !== 3) throw Error("Ambient controls failed");
        const fixtures = restore(JSON.parse(${JSON.stringify(payload)}));
        for (const fixture of fixtures) {
          const before = JSON.stringify(stable(fixture.input));
          const actual = module.exports[fixture.operation](freeze(fixture.input));
          if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(fixture.expected))) throw Error(fixture.name + " returned wrong complete result");
          if (JSON.stringify(stable(fixture.input)) !== before) throw Error(fixture.name + " mutated input");
        }
        return JSON.stringify({exports:Object.keys(module.exports).sort(),fixtures:fixtures.length,guarded});
      })()
    `, { module: { exports: {} } }, { timeout: 15000 }))
    expect(evidence).toEqual({ exports: ["changeAccountChoice", "planSetupRemoval", "removeSharedShortcut"], fixtures: fixtures.length, guarded: 3 })
  })
})
