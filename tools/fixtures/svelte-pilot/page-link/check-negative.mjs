import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createPageLink } from "../../../../build/page-link.ts"
import { fixtureEntries } from "./src/registration.ts"

if (process.argv.length !== 2) throw Error("check-negative.mjs accepts no arguments")
const root = fileURLToPath(new URL("./", import.meta.url))
const repository = resolve(root, "../../../..")
const cases = resolve(root, ".output/cases")
const results = []
const hooks = createPageLink({ entries: fixtureEntries, siteRoot: resolve(root, "src/site"), kitIndex: resolve(root, "src/site/kit/index.ts"), evidenceDir: resolve(root, ".output/hook-checks") }).hooks
assert.throws(() => hooks["vite:build:extendConfig"]([{ type: "unlisted-script", name: "undeclared-www" }], {}), /missing entry ownership/)
const feature = { type: "unlisted-script", name: "consumer-www" }
const kitWww = { type: "unlisted-script", name: "kit-www" }
const kitMusic = { type: "unlisted-script", name: "kit-music" }
const unrelated = [{ type: "background", name: "background" }, { type: "unlisted-page", name: "control" }]
const core = { type: "unlisted-script", name: "core-www" }
const groups = [kitMusic, unrelated, feature, kitWww, core]
hooks["entrypoints:grouped"]({}, groups)
assert.deepEqual(groups, [unrelated, feature, core, kitMusic, kitWww])
assert.throws(() => hooks["entrypoints:grouped"]({}, [[kitWww, feature]]), /mixed kit group/)
const externalCalls = []
const outputs = [
  { format: "iife", name: "OriginalOne", entryFileNames: "original-one.js", globals: (id) => `original.${id}` },
  { format: "iife", name: "OriginalTwo", entryFileNames: "original-two.js", globals: { existing: "OriginalGlobal" } }
]
const config = { build: { rollupOptions: { external: (...values) => { externalCalls.push(values); return values[0] === "existing" }, output: outputs } } }
hooks["vite:build:extendConfig"]([feature], config)
assert.equal(config.build.rollupOptions.external("existing", "caller", false), true)
assert.deepEqual(externalCalls, [["existing", "caller", false]])
assert.equal(config.build.rollupOptions.external("svelte", "caller", false), true)
assert.throws(() => config.build.rollupOptions.external("svelte/unknown", "caller", false), /knownSvelteSpecifier.*caller/)
assert.equal(outputs[0].name, "OriginalOne")
assert.equal(outputs[1].entryFileNames, "original-two.js")
assert.equal(outputs[0].globals("existing"), "original.existing")
assert.equal(outputs[1].globals("existing"), "OriginalGlobal")
assert.equal(outputs[0].globals("svelte/internal/client"), "globalThis.__pp.svelte.client")
const arrayExternal = { build: { rollupOptions: { external: ["existing", /^other$/g], output: { format: "iife", globals: { existing: "Existing" } } } } }
hooks["vite:build:extendConfig"]([feature], arrayExternal)
assert(arrayExternal.build.rollupOptions.external("existing", undefined, false))
assert(arrayExternal.build.rollupOptions.external("other", undefined, false))
assert(arrayExternal.build.rollupOptions.external("other", undefined, false))
assert.equal(arrayExternal.build.rollupOptions.output.globals("existing"), "Existing")
console.log("Native WXT hook shapes preserved singleton and array groups, existing externals, globals callbacks and output arrays")
async function fixture(name) {
  const path = resolve(cases, name)
  await rm(path, { recursive: true, force: true })
  await mkdir(path, { recursive: true })
  await cp(resolve(root, "src"), resolve(path, "src"), { recursive: true })
  const registration = resolve(path, "src/registration.ts")
  await writeFile(registration, (await readFile(registration, "utf8")).replaceAll('"../../../../../src/shared/', `"${repository}/src/shared/`))
  await cp(resolve(root, "tsconfig.json"), resolve(path, "tsconfig.json"))
  const config = (await readFile(resolve(root, "wxt.config.ts"), "utf8")).replace('"../../../../build/page-link"', JSON.stringify(resolve(repository, "build/page-link.ts")))
  await writeFile(resolve(path, "wxt.config.ts"), config)
  return path
}
async function build(path, flags = []) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(repository, "node_modules/wxt/bin/wxt.mjs"), "build", path, ...flags], { cwd: repository, env: { ...process.env, NO_COLOR: "1" } })
    let output = ""
    child.stdout.on("data", (data) => output += data)
    child.stderr.on("data", (data) => output += data)
    child.on("error", reject)
    child.on("exit", (status) => resolveResult({ status, output }))
  })
}
async function snapshot(path, label) {
  const destination = resolve(cases, `precision-${label}/.output`)
  await rm(resolve(cases, `precision-${label}`), { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  await cp(resolve(path, ".output/chrome-mv3"), resolve(destination, "chrome-mv3"), { recursive: true })
  await cp(resolve(path, ".output/evidence/chrome-build"), resolve(destination, "evidence/chrome-build"), { recursive: true })
}
const svelteClient = fileURLToPath(import.meta.resolve("svelte")).replace("index-server.js", "index-client.js")
const negatives = [
  { name: "unknown-svelte", entry: "consumer-www", code: 'import "svelte/not-a-real-export";', predicate: "knownSvelteSpecifier" },
  { name: "bundled-runtime", entry: "consumer-www", code: `import { tick as privateTick } from ${JSON.stringify(svelteClient)}; globalThis.__badRuntime = privateTick;`, predicate: "noFeatureRuntime" },
  { name: "direct-kit", entry: "consumer-www", code: 'import { Badge as PrivateBadge } from "../site/kit"; globalThis.__badKit = PrivateBadge;', predicate: "noFeatureKitImplementation" },
  { name: "eager-bits", entry: "kit-www", code: 'import { Popover } from "bits-ui"; globalThis.__badBits = Popover;', predicate: "lazyBitsOnly" },
  { name: "page-css", entry: "core-www", code: 'import "../site/bad.css";', predicate: "noPageCss" },
  { name: "namespace-escape", entry: "consumer-www", code: 'import * as SvelteNamespace from "svelte"; globalThis.__badNamespace = SvelteNamespace;', predicate: "namespace escape" },
  { name: "dynamic-namespace", entry: "consumer-www", code: 'import * as SvelteNamespace from "svelte"; globalThis.__badDynamic = SvelteNamespace[globalThis.__fixtureKey];', predicate: "dynamic namespace access" }
]
await mkdir(cases, { recursive: true })
for (const negative of negatives) {
  const path = await fixture(negative.name)
  const entry = resolve(path, `src/entrypoints/${negative.entry}.ts`)
  const imports = negative.code.match(/import[^;]+;/g) ?? []
  const effect = negative.code.replace(/import[^;]+;/g, "")
  const original = await readFile(entry, "utf8")
  const source = original.includes("=> {")
    ? original.replace("=> {", `=> {\n${effect}`)
    : original.replace('=> install("consumer")', `=> { ${effect}; return install("consumer") }`)
  await writeFile(entry, `${imports.join("\n")}\n${source}`)
  if (negative.name === "page-css") await writeFile(resolve(path, "src/site/bad.css"), ".negative-control{color:red}")
  const result = await build(path)
  await writeFile(resolve(cases, `${negative.name}.log`), result.output)
  assert.notEqual(result.status, 0, `${negative.name} unexpectedly built`)
  assert(result.output.includes(negative.predicate), `${negative.name} failed for the wrong reason\n${result.output}`)
  results.push({ name: negative.name, status: result.status, predicate: negative.predicate })
  console.log(`${negative.name} rejected by ${negative.predicate}`)
}
const suffix = await fixture("old-suffix-classification")
const suffixConfig = resolve(suffix, "wxt.config.ts")
await writeFile(suffixConfig, (await readFile(suffixConfig, "utf8")).replace("entries: fixtureEntries", 'entries: { ...fixtureEntries, "feature-auto-add": { kind: "page" } }'))
const suffixResult = await build(suffix)
await writeFile(resolve(cases, "old-suffix-classification.log"), suffixResult.output)
assert.notEqual(suffixResult.status, 0, "Old suffix classification unexpectedly accepted the unsuffixed Svelte feature")
assert(suffixResult.output.includes("noFeatureRuntime feature-auto-add"), suffixResult.output)
results.push({ name: "old-suffix-classification", status: suffixResult.status, predicate: "noFeatureRuntime feature-auto-add" })
const precision = await fixture("precision")
const consumer = resolve(precision, "src/entrypoints/consumer-music.ts")
const original = await readFile(consumer, "utf8")
const readNames = async (site) => JSON.parse(await readFile(resolve(precision, `.output/evidence/chrome-build/kit-${site}.json`), "utf8")).names
let result = await build(precision)
assert.equal(result.status, 0, result.output)
const before = { www: await readNames("www"), music: await readNames("music") }
await writeFile(resolve(precision, "src/site/consumer/MusicOnly.svelte"), '<script lang="ts">let items = $state([1,2]);</script>{#each items as item}<span>{item}</span>{/each}')
await writeFile(consumer, `import MusicOnly from "../site/consumer/MusicOnly.svelte";\nimport { mount as musicMount } from "svelte";\n${original.replace('=> install("consumer")', '=> { install("consumer"); musicMount(MusicOnly, { target: globalThis.__pp.kit.layer }) }')}`)
result = await build(precision)
assert.equal(result.status, 0, result.output)
const added = { www: await readNames("www"), music: await readNames("music") }
assert.deepEqual(added.www, before.www)
assert(added.music.client.includes("each"))
assert(!before.music.client.includes("each"))
await snapshot(precision, "added")
await writeFile(consumer, original)
await rm(resolve(precision, "src/site/consumer/MusicOnly.svelte"))
result = await build(precision)
assert.equal(result.status, 0, result.output)
assert.deepEqual(await readNames("music"), before.music)
await snapshot(precision, "removed")
result = await build(precision, ["--mode", "beta"])
assert.equal(result.status, 0, result.output)
const beta = JSON.parse(await readFile(resolve(precision, ".output/evidence/chrome-build/kit-www.json"), "utf8"))
assert.equal(beta.development, false)
assert(!beta.names.root.includes("hydrate"))
const alias = await fixture("binding-precision")
const entry = resolve(alias, "src/entrypoints/consumer-www.ts")
await writeFile(entry, `${await readFile(entry, "utf8")}\nimport * as S from "svelte";\nimport * as C from "svelte/internal/client";\nvoid S.tick; void S.untrack; void C["if"]; void C["index"];
export { flushSync as fixtureFlush } from "svelte";\nfunction shadow(S) { return S.neverExportThis; }\nfunction hoisted() { void S.neverExportVar; var S = {}; }\nconst property = { S: 1 }; void property.S;\nclass StaticShadow { static { var S = { noStaticExport: 1 }; void S.noStaticExport; } }\nvoid S.unmount;\nfunction defaults(value = S.hydratable) { var S = {}; return value; }\nswitch (S.getAllContexts) { case null: let S = {}; void S.noSwitchExport; }\nvoid defaults; void StaticShadow;\nvoid shadow; void hoisted; void property;\n`)
result = await build(alias)
assert.equal(result.status, 0, result.output)
const boundNames = JSON.parse(await readFile(resolve(alias, ".output/evidence/chrome-build/kit-www.json"), "utf8")).names
assert.deepEqual(boundNames, { ...before.www, root: [...new Set([...before.www.root, "untrack", "flushSync", "unmount", "hydratable", "getAllContexts"])].sort(), client: [...new Set([...before.www.client, "index"])].sort() })
await writeFile(resolve(root, ".output/negative.json"), JSON.stringify({ hooks: { grouping: "pass", mixedKit: "rejected", externals: "callback and string/regexp arrays preserved", globals: "object and callback output arrays preserved" }, negatives: results, precision: { before, added, removed: before.music, runtimeFixtures: ["precision-added", "precision-removed"] }, bindings: boundNames, beta: beta.names }, null, 2))
console.log("Per-site add/remove, beta-mode subset, aliases, reserved properties and lexical shadowing passed")
