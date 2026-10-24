import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { parseSync } from "vite"
import { createPageLink } from "../../../../build/page-link.ts"

if (process.argv.length !== 2) throw Error("check-regressions.mjs accepts no arguments")
const root = fileURLToPath(new URL("./", import.meta.url))
const repository = resolve(root, "../../../..")
const cases = resolve(root, ".output/regressions")
const results = []
await mkdir(cases, { recursive: true })

async function check(name, run) {
  try {
    const evidence = await run()
    results.push({ name, status: "pass", evidence })
    console.log(`${name} passed`)
  } catch (error) {
    results.push({ name, status: "fail", error: String(error) })
    console.error(`${name} failed: ${error}`)
  }
  await writeFile(resolve(cases, "results.json"), JSON.stringify(results, null, 2))
}

await check("transformed-module-identity", async () => {
  const link = createPageLink({ siteRoot: resolve(root, "src/site"), kitIndex: resolve(root, "src/site/kit/index.ts"), evidenceDir: resolve(cases, "state") })
  const entry = (name) => ({ type: "unlisted-script", name })
  const plugin = (name) => {
    const config = {}
    link.hooks["vite:build:extendConfig"]([entry(name)], config)
    return config.plugins.at(-1)
  }
  const context = { parse: (code) => parseSync("probe.js", code, { sourceType: "module" }).program }
  const transform = (plugin, id, code) => plugin.transform.handler.call(context, code, id)
  const kit = (site) => plugin(`kit-${site}`).load("\0virtual:page-link-svelte")
  const www = plugin("consumer-www"), music = plugin("consumer-music")
  transform(www, "same.js", 'import { tick } from "svelte";')
  transform(www, "same.js?variant", 'import { untrack } from "svelte";')
  transform(music, "same.js", 'import { hydrate } from "svelte";')
  assert.match(kit("www"), /"tick":root\["tick"\]/)
  assert.match(kit("www"), /"untrack":root\["untrack"\]/)
  transform(www, "same.js", 'import { unmount } from "svelte";')
  assert.doesNotMatch(kit("www"), /"tick":/)
  assert.match(kit("www"), /"unmount":/)
  transform(www, "same.js?variant", 'export default "raw";')
  assert.doesNotMatch(kit("www"), /"untrack":/)
  assert.match(kit("www"), /"unmount":/)
  transform(www, "same.js", "export default 42;")
  assert.match(kit("www"), /root:\{\}/)
  assert.match(kit("music"), /"hydrate":/)
  link.hooks["entrypoints:grouped"]({}, [entry("kit-www"), entry("consumer-www")])
  assert.match(kit("music"), /root:\{\}/)
  assert.match(kit("www"), /root:\{\}/)
  return { replacement: true, removal: true, variants: true, siteIndependence: true, generationReset: true }
})

async function fixture(name) {
  const path = resolve(cases, name)
  await rm(path, { recursive: true, force: true })
  await mkdir(path, { recursive: true })
  await cp(resolve(root, "src"), resolve(path, "src"), { recursive: true })
  await cp(resolve(root, "tsconfig.json"), resolve(path, "tsconfig.json"))
  await writeFile(resolve(path, "wxt.config.ts"), (await readFile(resolve(root, "wxt.config.ts"), "utf8")).replace('"../../../../build/page-link"', JSON.stringify(resolve(repository, "build/page-link.ts"))))
  return path
}
async function prepend(path, file, code) {
  const target = resolve(path, `src/${file}`)
  await writeFile(target, `${code}\n${await readFile(target, "utf8")}`)
}
async function configure(path, code) {
  const target = resolve(path, "wxt.config.ts")
  await writeFile(target, (await readFile(target, "utf8")).replace("css: { postcss: {} },", `css: { postcss: {} }, ${code}`))
}
async function packageRoot(name) {
  let directory = dirname(await realpath(fileURLToPath(import.meta.resolve(name))))
  while (true) {
    try {
      if (JSON.parse(await readFile(resolve(directory, "package.json"), "utf8")).name === name) return directory
    } catch (error) { if (error.code !== "ENOENT") throw error }
    const parent = dirname(directory)
    assert.notEqual(parent, directory, `package root for ${name}`)
    directory = parent
  }
}
async function aliases(path, linked) {
  for (const name of ["svelte", "bits-ui"]) {
    const copy = resolve(path, `packages/renamed-${name}`)
    await cp(await packageRoot(name), copy, { recursive: true })
    const target = resolve(path, `node_modules/fixture-${name}`)
    await mkdir(dirname(target), { recursive: true })
    if (linked) await symlink(copy, target)
    else await cp(copy, target, { recursive: true })
  }
}
async function build(path) {
  const result = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(repository, "node_modules/wxt/bin/wxt.mjs"), "build", path], { cwd: repository, env: { ...process.env, NO_COLOR: "1" } })
    let output = ""
    child.stdout.on("data", (data) => output += data)
    child.stderr.on("data", (data) => output += data)
    child.on("error", reject)
    child.on("exit", (status) => done({ status, output }))
  })
  await writeFile(resolve(path, "build.log"), result.output)
  return result
}
async function installed(path) {
  const extension = resolve(path, ".output/chrome-mv3")
  const profile = await mkdtemp(resolve(tmpdir(), "page-link-regression-"))
  let context
  const evidence = { exceptions: [] }
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
    await context.route(/^https?:/, (route) => new URL(route.request().url()).hostname === "www.youtube.com"
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Synthetic regression fixture</body></html>" }) : route.abort())
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
    const control = await context.newPage()
    await control.goto(`chrome-extension://${new URL(worker.url()).hostname}/control.html`)
    await control.waitForFunction(() => !!window.fixture)
    const call = (method, ...args) => control.evaluate(({ method, args }) => window.fixture[method](...args), { method, args })
    const page = await context.newPage()
    const session = await context.newCDPSession(page)
    await session.send("Runtime.enable")
    let finishException
    const exception = new Promise((done) => { finishException = done })
    session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      evidence.exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text)
      finishException("exception")
    })
    await page.goto("https://www.youtube.com/linker-regression")
    const tabId = await call("tab", page.url())
    await call("files", tabId, ["core-www.js", "kit-www.js", "consumer-www.js"])
    let timeout
    try {
      await Promise.race([page.getByRole("button", { name: "Count 0", exact: true }).waitFor({ timeout: 5000 }), exception,
        new Promise((done) => { timeout = setTimeout(done, 5500) })])
    } finally { clearTimeout(timeout) }
    evidence.state = (await control.evaluate((tabId) => chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => ({
      trace: globalThis.__pp.core.trace, root: Object.keys(globalThis.__pp.svelte.root).sort(), client: Object.keys(globalThis.__pp.svelte.client).sort(),
      value: globalThis.__regressionValue ?? null, raw: globalThis.__regressionRaw ?? null,
      disclosed: [...(window.__svelte?.v ?? [])], safe: globalThis.__safeAlias ?? null
    }) }), tabId))[0].result
    evidence.rendered = await page.getByRole("button", { name: "Count 0", exact: true }).count()
    await page.screenshot({ path: resolve(path, "installed.png") })
    await writeFile(resolve(path, "installed.json"), JSON.stringify(evidence, null, 2))
    assert.deepEqual(evidence.exceptions, [])
    assert.equal(evidence.rendered, 1)
    assert.deepEqual(evidence.state.trace, ["core", "kit", "consumer"])
    assert(evidence.state.disclosed.includes("5"))
    await page.getByRole("button", { name: "Count 0", exact: true }).click()
    await page.getByText("Branch 1", { exact: true }).waitFor()
    return evidence
  } finally {
    if (context) await context.close()
    await rm(profile, { recursive: true, force: true })
  }
}

const positives = [
  { name: "escaped-namespace", code: 'import * as S from "\\x73velte"; globalThis.__regressionValue = S.untrack(() => 42);', value: 42 },
  { name: "escaped-named", code: 'import { untrack } from "\\u0073velte"; globalThis.__regressionValue = untrack(() => 42);', value: 42 },
  { name: "escaped-reexport", code: 'export { untrack } from "\\x73velte";', setup: async (path) => {
    await prepend(path, "site/consumer/mount.ts", 'import { untrack } from "./probe.js"; globalThis.__regressionValue = untrack(() => 42);')
  }, value: 42 },
  { name: "unescaped-control", code: 'import * as S from "svelte"; globalThis.__regressionValue = S.untrack(() => 42);', value: 42 },
  { name: "raw-later-entry", code: 'export { untrack } from "svelte";', entryOnly: true, setup: async (path) => {
    await prepend(path, "entrypoints/consumer-www.ts", 'import { untrack } from "../site/consumer/probe.js"; globalThis.__regressionValue = untrack(() => 42);')
    await prepend(path, "entrypoints/late-www.ts", 'import raw from "../site/consumer/probe.js?raw"; globalThis.__regressionRaw = raw;')
  }, value: 42 },
  { name: "raw-rune-same-entry", code: 'import raw from "./raw-0.js"; globalThis.__regressionRaw = raw;', setup: async (path) => {
    for (let index = 0; index < 30; index++) await writeFile(resolve(path, `src/site/consumer/raw-${index}.js`), `export { default } from ${JSON.stringify(index === 29 ? "./counter.svelte.ts?raw" : `./raw-${index + 1}.js`)};`)
  } },
  { name: "foreign-import-names", code: 'import * as tick from "svelte"; import { tick as alias } from "svelte"; import { tick as scalar } from "./helper.js"; globalThis.__regressionValue = scalar; globalThis.__regressionFunctions = [tick.onMount, alias];', setup: async (path) => {
    await writeFile(resolve(path, "src/site/consumer/helper.js"), "export const tick = 42;")
  }, value: 42 },
  { name: "unrelated-import-name", code: 'import * as S from "svelte"; import { S as scalar } from "./helper.js"; globalThis.__regressionValue = scalar; globalThis.__regressionTick = S.tick;', setup: async (path) => {
    await writeFile(resolve(path, "src/site/consumer/helper.js"), "export const S = 42;")
  }, value: 42 },
  { name: "query-variants", code: 'import "./query.js?first"; import "./query.js?second";', setup: async (path) => {
    await writeFile(resolve(path, "src/site/consumer/query.js"), "")
    await configure(path, `plugins: [{ name: "fixture-query-transform", transform(code, id) {
      if (id.endsWith("query.js?first")) return 'import { untrack } from "svelte"; globalThis.__regressionValue = untrack(() => 42);';
      if (id.endsWith("query.js?second")) return 'import { tick } from "svelte"; globalThis.__queryTick = tick;';
    } }],`)
  }, value: 42 },
  { name: "foreign-reexport-names", code: 'import * as S from "svelte"; export { S as scalar } from "./helper.js"; export { tick as S } from "svelte"; globalThis.__regressionValue = S.untrack(() => 42);', setup: async (path) => {
    await writeFile(resolve(path, "src/site/consumer/helper.js"), "export const S = 42;")
  }, value: 42 },
  ...["object", "callback"].map((kind) => ({ name: `external-${kind}`, code: 'import { answer } from "fixture-existing"; globalThis.__regressionValue = answer;', setup: async (path) => {
    await configure(path, `build: { rollupOptions: { external: ${kind === "object" ? '["fixture-existing"]' : '(id) => id === "fixture-existing"'}, output: { globals: ${kind === "object" ? '{ "fixture-existing": "globalThis.__fixtureExisting" }' : '(id) => id === "fixture-existing" ? "globalThis.__fixtureExisting" : id'} } } },`)
    const target = resolve(path, "src/entrypoints/core-www.ts")
    await writeFile(target, (await readFile(target, "utf8")).replace("=> {", "=> {\nObject.assign(globalThis, { __fixtureExisting: { answer: 42 } });"))
  }, value: 42 }))
]
for (const item of positives) await check(item.name, async () => {
  const path = await fixture(item.name)
  await writeFile(resolve(path, "src/site/consumer/probe.js"), item.code)
  if (!item.entryOnly) await prepend(path, "site/consumer/mount.ts", 'import "./probe.js";')
  if (item.setup) await item.setup(path)
  const result = await build(path)
  assert.equal(result.status, 0, result.output)
  const runtime = await installed(path)
  if (item.value !== undefined) assert.equal(runtime.state.value, item.value)
  if (item.name.startsWith("raw-")) {
    const late = item.name === "raw-later-entry"
    const names = JSON.parse(await readFile(resolve(path, ".output/evidence/chrome-build/kit-www.json"), "utf8")).names
    for (const name of late ? ["untrack"] : ["get", "state", "update"]) assert(names[late ? "root" : "client"].includes(name))
  }
  return { build: result.status, runtime }
})

for (const linked of [false, true]) for (const name of ["svelte", "bits-ui"]) await check(`aliased-${name}-${linked ? "symlink" : "copy"}`, async () => {
  const path = await fixture(`aliased-${name}-${linked ? "symlink" : "copy"}`)
  await aliases(path, linked)
  const target = resolve(path, `src/entrypoints/${name === "svelte" ? "consumer-www" : "kit-www"}.ts`)
  const source = await readFile(target, "utf8")
  await writeFile(target, name === "svelte"
    ? `import { tick } from "fixture-svelte";\n${source.replace('=> install("consumer")', '=> { globalThis.__privateTick = tick; return install("consumer") }')}`
    : `import { Popover } from "fixture-bits-ui";\n${source.replace("=> {", "=> { globalThis.__eagerBits = Popover;")}`)
  const result = await build(path)
  assert.notEqual(result.status, 0, "aliased package unexpectedly bundled")
  const predicate = name === "svelte" ? "noFeatureRuntime" : "lazyBitsOnly"
  assert(result.output.includes(predicate), result.output)
  return { build: result.status, predicate }
})

await check("safe-alias-and-lazy-packages", async () => {
  const path = await fixture("safe-alias-and-lazy-packages")
  await aliases(path, true)
  const safe = resolve(path, "node_modules/fixture-safe")
  await mkdir(safe, { recursive: true })
  await writeFile(resolve(safe, "package.json"), JSON.stringify({ name: "fixture-safe", type: "module", exports: "./index.js" }))
  await writeFile(resolve(safe, "index.js"), "export const answer = 42;")
  await prepend(path, "site/consumer/mount.ts", 'import { answer } from "fixture-safe"; globalThis.__safeAlias = answer;')
  for (const file of ["entrypoints/popovers.ts", "site/popovers/Popover.svelte"]) {
    const target = resolve(path, `src/${file}`)
    await writeFile(target, (await readFile(target, "utf8")).replaceAll('from "svelte"', 'from "fixture-svelte"').replaceAll('from "bits-ui"', 'from "fixture-bits-ui"'))
  }
  const result = await build(path)
  assert.equal(result.status, 0, result.output)
  const runtime = await installed(path)
  assert.equal(runtime.state.safe, 42)
  return { build: result.status, runtime }
})

for (const item of [
  { name: "escaped-escape", code: 'import * as S from "\\x73velte"; globalThis.__escape = S;', predicate: "namespace escape" },
  { name: "local-namespace-export", code: 'import * as S from "svelte"; export { S as scalar };', predicate: "namespace escape" },
  { name: "dynamic-import", code: 'globalThis.__dynamic = import("svelte");', predicate: "unlistedIifeOnly" }
]) await check(item.name, async () => {
  const path = await fixture(item.name)
  await writeFile(resolve(path, "src/site/consumer/probe.js"), item.code)
  await prepend(path, "site/consumer/mount.ts", 'import "./probe.js";')
  const result = await build(path)
  assert.notEqual(result.status, 0, `${item.name} unexpectedly built`)
  assert(result.output.includes(item.predicate), result.output)
  return { build: result.status, predicate: item.predicate }
})
assert(results.every((result) => result.status === "pass"), `${results.filter((result) => result.status === "fail").length} linker regressions failed. Evidence is ${resolve(cases, "results.json")}`)
