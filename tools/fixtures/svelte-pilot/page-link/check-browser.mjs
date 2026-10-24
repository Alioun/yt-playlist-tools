import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const args = process.argv.slice(2)
if (![2, 4].includes(args.length) || args[0] !== "--browser" || !["chromium", "firefox"].includes(args[1]) || (args.length === 4 && (args[2] !== "--fixture-root" || !args[3]))) throw Error("Usage: check-browser.mjs --browser chromium|firefox [--fixture-root <generated-fixture>]")
if (args[1] === "firefox") throw Error("Could not run Firefox installed-extension proof. Prerequisite: dependency owner must install the agreed Puppeteer 24.43.1 and Firefox 158 BiDi runtime. No Firefox driver is implemented by this unit.")
const root = args[3] ? resolve(args[3]) : fileURLToPath(new URL("./", import.meta.url))
const extension = resolve(root, ".output/chrome-mv3")
const artifactDir = resolve(root, ".output/browser")
await mkdir(artifactDir, { recursive: true })
const profile = await mkdtemp(resolve(tmpdir(), "page-link-chromium-"))
let context
const evidence = { browser: "", sites: [], negative: [], selections: [] }
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  await context.route(/^https?:/, (route) => {
    const url = new URL(route.request().url())
    if (!["www.youtube.com", "music.youtube.com"].includes(url.hostname)) return route.abort()
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><style>.counter{color:rgb(255,0,0)!important}.fixture-popover{background:red!important}</style></head><body><main>Synthetic fixture only</main></body></html>' })
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const extensionId = new URL(worker.url()).hostname
  const control = await context.newPage()
  await control.goto(`chrome-extension://${extensionId}/control.html`)
  await control.waitForFunction(() => !!window.fixture)
  const call = (method, ...values) => control.evaluate(({ method, values }) => window.fixture[method](...values), { method, values })
  async function register(selection = "consumers") {
    const plan = await call("plan", selection)
    const actual = await call("register", selection)
    const fields = ["id", "matches", "js", "world", "runAt", "allFrames", "persistAcrossSessions"]
    const normalize = (rows) => rows.map((row) => Object.fromEntries(fields.map((field) => [field, field === "matches" ? [...row.matches].sort() : row[field]]))).sort((a, b) => a.id.localeCompare(b.id))
    assert.deepEqual(normalize(actual), normalize(plan.expected))
    evidence.selections.push({ selection, plan, actual })
    return actual
  }
  const registered = await register()
  assert.equal(registered.length, 4)
  for (const site of ["www", "music"]) {
    const main = registered.find((entry) => entry.id === `pp-${site}-page`)
    const isolated = registered.find((entry) => entry.id === `pp-${site}`)
    assert.equal(main.world, "MAIN")
    assert.equal(main.runAt, "document_start")
    assert.equal(isolated.world, "ISOLATED")
    assert.equal(isolated.runAt, "document_idle")
    assert.deepEqual(isolated.js, [`core-${site}.js`, `kit-${site}.js`, `consumer-${site}.js`])
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
    const url = `https://${site}.youtube.com/linker-fixture`
    await page.goto(url)
    await page.getByRole("button", { name: "Count 0", exact: true }).waitFor()
    const tabId = await call("tab", url)
    const inspect = async () => (await call("inspect", tabId))[0].result
    let result = await inspect()
    assert.deepEqual(result.trace, ["core", "kit", "consumer"])
    assert.equal(result.marker, "preserved")
    assert.equal(result.popovers, false)
    assert(result.disclosed.includes("5"))
    const collected = JSON.parse(await readFile(resolve(root, `.output/evidence/chrome-build/kit-${site}.json`), "utf8"))
    assert.deepEqual(result.root, collected.names.root)
    assert.deepEqual(result.client, collected.names.client)
    assert(!result.root.includes("hydrate"))
    await page.getByRole("button", { name: "Count 0", exact: true }).click()
    await page.getByText("Branch 1", { exact: true }).waitFor()
    await page.getByRole("button", { name: "Shared kit 1", exact: true }).click()
    await page.getByRole("button", { name: "Count 2", exact: true }).waitFor()
    result = await inspect()
    assert.equal(result.mounted, 1)
    assert.equal(result.events, 2)
    const styles = await page.evaluate(() => {
      const shadow = document.querySelector("#fixture-host").shadowRoot
      return { color: getComputedStyle(shadow.querySelector(".counter")).color, styles: shadow.querySelectorAll("style").length, headStyles: document.head.querySelectorAll("style").length, mainCannotRead: document.documentElement.dataset.mainCannotRead, mainRan: document.documentElement.dataset.mainRan, mainAfterCore: typeof globalThis.__pp, mainReadyState: document.documentElement.dataset.mainReadyState }
    })
    assert.equal(styles.color, "rgb(20, 80, 140)")
    assert(styles.styles > 0)
    assert.equal(styles.headStyles, 1)
    assert.equal(styles.mainCannotRead, "true")
    assert.equal(styles.mainRan, "true")
    assert.equal(styles.mainAfterCore, "undefined")
    assert.equal(styles.mainReadyState, "loading")
    assert.notEqual(result.readyStateAtCore, "loading")
    assert.equal(await page.getByText("Real Bits UI", { exact: true }).count(), 0)
    await call("targetLazy", tabId)
    await control.getByRole("button", { name: "Load lazy fixture UI" }).click()
    await call("lazyLoaded")
    await page.getByRole("button", { name: "Open lazy popover", exact: true }).click()
    const content = page.getByText("Real Bits UI", { exact: true })
    await content.waitFor({ state: "visible" })
    await page.getByRole("textbox", { name: "Lazy input" }).waitFor()
    await page.waitForFunction(() => {
      const shadow = document.querySelector("#fixture-host").shadowRoot
      return shadow.activeElement?.getAttribute("aria-label") === "Lazy input"
    })
    const position = await page.evaluate(() => {
      const shadow = document.querySelector("#fixture-host").shadowRoot
      const trigger = shadow.querySelector("[data-popover-trigger]")
      const content = shadow.querySelector(".fixture-popover")
      const a = trigger.getBoundingClientRect(), b = content.getBoundingClientRect()
      return { background: getComputedStyle(content).backgroundColor, position: getComputedStyle(content.closest("[data-bits-floating-content-wrapper]")).position, offset: b.y - a.bottom, width: b.width, outer: !!document.querySelector(".fixture-popover"), headStyles: document.head.querySelectorAll("style").length }
    })
    assert.equal(position.background, "rgb(240, 245, 250)")
    assert.equal(position.position, "fixed")
    assert(position.width > 0)
    assert(Math.abs(position.offset - 8) <= 1)
    assert.equal(position.outer, false)
    assert.equal(position.headStyles, 1)
    await page.keyboard.press("Escape")
    await content.waitFor({ state: "hidden" })
    assert.equal(await page.getByRole("button", { name: "Open lazy popover" }).evaluate((node) => node.getRootNode().activeElement === node), true)
    await call("files", tabId, [`late-${site}.js`])
    await page.getByRole("button", { name: "Count 0", exact: true }).click()
    await page.getByRole("button", { name: "Shared kit 1", exact: true }).waitFor()
    result = await inspect()
    assert.deepEqual(result.trace, ["core", "kit", "consumer", "popovers", "late"])
    assert.equal(result.mounted, 2)
    assert.deepEqual(result.root, collected.names.root)
    assert.deepEqual(result.client, collected.names.client)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: resolve(artifactDir, `${site}.png`) })
    evidence.sites.push({ site, registered: [main, isolated], result, styles, position, errors })
    await page.close()
  }
  await register("unsuffixed")
  const unsuffixed = await context.newPage()
  await unsuffixed.goto("https://www.youtube.com/unsuffixed")
  await unsuffixed.getByRole("button", { name: "Unsuffixed 1", exact: true }).click()
  await unsuffixed.getByText("Unsuffixed item 2", { exact: true }).waitFor()
  const unsuffixedResult = (await call("inspect", await call("tab", unsuffixed.url())))[0].result
  assert.deepEqual(unsuffixedResult.trace, ["core", "kit", "unsuffixed"])
  assert(unsuffixedResult.client.includes("each"))
  evidence.selections.at(-1).execution = unsuffixedResult
  await unsuffixed.screenshot({ path: resolve(artifactDir, "unsuffixed.png") })
  await register("off")
  for (const site of ["www", "music"]) {
    const off = await context.newPage()
    await off.goto(`https://${site}.youtube.com/unselected`)
    const offResult = (await call("probe", await call("tab", off.url())))[0].result
    assert.deepEqual(offResult, { trace: [], kit: false, host: false })
    assert.equal(await off.getByRole("button", { name: "Count 0", exact: true }).count(), 0)
    evidence.selections.push({ selection: "off-route", site, result: offResult })
    await off.close()
  }
  assert.equal(await unsuffixed.getByText("Unsuffixed item 2", { exact: true }).count(), 1)
  await unsuffixed.close()
  await register("gather")
  for (const path of ["/watch?v=synthetic", "/live/synthetic", "/"]) {
    const page = await context.newPage()
    await page.goto(`https://www.youtube.com${path}`)
    const tabId = await call("tab", page.url())
    if (path !== "/") {
      await page.waitForFunction(() => document.documentElement.dataset.mainRan === "true")
      await control.waitForFunction(async (tabId) => (await window.fixture.probe(tabId))[0].result.trace.includes("core"), tabId)
    }
    const result = (await call("probe", tabId))[0].result
    assert.deepEqual(result, { trace: path === "/" ? [] : ["core"], kit: false, host: false })
    assert.equal(await page.getByRole("button").count(), 0)
    const main = await page.evaluate(() => document.documentElement.dataset.mainRan ?? null)
    assert.equal(main, path === "/" ? null : "true")
    evidence.selections.push({ selection: "gather-route", path, result, main })
    await page.close()
  }
  await call("unregister")
  for (const failure of ["missing-export", "absent-kit"]) {
    const page = await context.newPage()
    await page.goto(`https://www.youtube.com/${failure}`)
    const tabId = await call("tab", page.url())
    const exceptions = []
    const session = await context.newCDPSession(page)
    await session.send("Runtime.enable")
    let receivedException
    const exception = new Promise((done) => { receivedException = done })
    session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text)
      receivedException()
    })
    await call("files", tabId, ["core-www.js"])
    if (failure === "missing-export") {
      await call("files", tabId, ["kit-www.js"])
      await call("removeExport", tabId)
    }
    let rejection = ""
    try { await call("files", tabId, ["consumer-www.js"]) } catch (error) { rejection = String(error) }
    const rendered = await page.getByRole("button", { name: "Count 0", exact: true }).count()
    assert.equal(rendered, 0)
    const failed = await control.evaluate(async (tabId) => (await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => ({ trace: globalThis.__pp.core.trace, present: !!document.querySelector("#fixture-host")?.shadowRoot?.querySelector(".counter") }) }))[0].result, tabId)
    assert(!failed.trace.includes("consumer"))
    let timeout
    try {
      await Promise.race([exception, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error(`${failure} did not raise a runtime exception`)), 5000) })])
    } finally { clearTimeout(timeout) }
    assert(exceptions.some((message) => failure === "missing-export" ? /if.*(function|undefined)/.test(message) : /(__pp|svelte|undefined)/.test(message)), `${failure} did not raise its expected runtime error: ${exceptions}`)
    evidence.negative.push({ failure, rejection, failed, exceptions })
    await session.detach()
    await page.close()
  }
  evidence.browser = await worker.evaluate(() => navigator.userAgent)
  await writeFile(resolve(artifactDir, "chromium.json"), JSON.stringify(evidence, null, 2))
} finally {
  try { if (context) await context.close() }
  finally { await rm(profile, { recursive: true, force: true }) }
}

if (!args[3]) {
  evidence.precision = []
  for (const label of ["added", "removed"]) {
    const snapshot = resolve(root, `.output/cases/precision-${label}`)
    await readFile(resolve(snapshot, ".output/chrome-mv3/manifest.json"))
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--browser", "chromium", "--fixture-root", snapshot], { encoding: "utf8" })
    await writeFile(resolve(root, `.output/cases/precision-${label}-browser.log`), `${result.stdout ?? ""}${result.stderr ?? ""}`)
    if (result.error) throw result.error
    assert.equal(result.status, 0, `precision ${label} runtime failed\n${result.stdout}\n${result.stderr}`)
    evidence.precision.push({ label, status: "pass", artifact: resolve(snapshot, ".output/browser/chromium.json") })
  }
  await writeFile(resolve(artifactDir, "chromium.json"), JSON.stringify(evidence, null, 2))
}
console.log("Installed Chromium extension passed both sites, shared components/runes, namespaces, worlds, styles, lazy Bits UI, later executeScript, and missing-export/absent-kit controls" + (args[3] ? "" : ". Added and removed music-only constructs passed the same checks."))
