import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright"

if (process.argv.length !== 2) throw Error("check-development.mjs accepts no arguments")
const root = fileURLToPath(new URL("./", import.meta.url))
const repository = resolve(root, "../../../..")
const fixture = resolve(root, ".output/development-case")
await rm(fixture, { recursive: true, force: true })
await mkdir(fixture, { recursive: true })
await cp(resolve(root, "src"), resolve(fixture, "src"), { recursive: true })
await cp(resolve(root, "tsconfig.json"), resolve(fixture, "tsconfig.json"))
await writeFile(resolve(fixture, "wxt.config.ts"), (await readFile(resolve(root, "wxt.config.ts"), "utf8")).replace('"../../../../build/page-link"', JSON.stringify(resolve(repository, "build/page-link.ts"))))
const expectedProcess = spawnSync(process.execPath, ["--conditions=browser", "--input-type=module", "-e", 'import * as root from "svelte"; import * as client from "svelte/internal/client"; console.log(JSON.stringify({root:Object.keys(root).sort(),client:Object.keys(client).sort()}))'], { cwd: repository, encoding: "utf8" })
assert.equal(expectedProcess.status, 0, expectedProcess.stderr)
const expected = JSON.parse(expectedProcess.stdout)
const server = createServer()
await new Promise((done) => server.listen(0, "127.0.0.1", done))
const port = server.address().port
await new Promise((done) => server.close(done))
const child = spawn(process.execPath, [resolve(repository, "node_modules/wxt/bin/wxt.mjs"), fixture, "--port", String(port)], { cwd: repository, env: { ...process.env, NO_COLOR: "1" } })
let output = ""
child.stdout.on("data", (data) => output += data)
child.stderr.on("data", (data) => output += data)
const exited = new Promise((done) => child.on("exit", done))
async function waitFor(read, description) {
  const deadline = Date.now() + 30000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error(`WXT dev exited before ${description}\n${output}`)
    try { const result = await read(); if (result) return result } catch (error) { lastError = error }
    await delay(200)
  }
  throw Error(`Timed out waiting for ${description}\n${lastError ?? "No thrown error"}\n${output}`)
}
async function proveInstalledOutput(label) {
  const profile = await mkdtemp(resolve(tmpdir(), "page-link-dev-"))
  let context
  try {
    const extension = resolve(fixture, ".output/chrome-mv3-dev")
    context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
    await context.route(/^https?:/, (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === "localhost" && url.port === String(port)) return route.continue()
      if (["www.youtube.com", "music.youtube.com"].includes(url.hostname)) return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body>Development fixture</body></html>" })
      return route.abort()
    })
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
    const extensionId = new URL(worker.url()).hostname
    const control = await context.newPage()
    await control.goto(`chrome-extension://${extensionId}/control.html`)
    await control.waitForFunction(() => !!window.fixture)
    const call = (method, ...values) => control.evaluate(({ method, values }) => window.fixture[method](...values), { method, values })
    await call("register")
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("https://www.youtube.com/dev-linker")
    await page.getByRole("button", { name: `${label} 0`, exact: true }).click()
    await page.getByRole("button", { name: `${label} 1`, exact: true }).waitFor()
    const result = (await call("inspect", await call("tab", page.url())))[0].result
    assert.deepEqual(result.root, expected.root)
    assert.deepEqual(result.client, expected.client)
    assert.deepEqual(errors, [])
    await mkdir(resolve(root, ".output/browser"), { recursive: true })
    await page.screenshot({ path: resolve(root, `.output/browser/development-${label.replaceAll(" ", "-")}.png`) })
    return result
  } finally {
    try { if (context) await context.close() }
    finally { await rm(profile, { recursive: true, force: true }) }
  }
}
try {
  const evidencePath = resolve(fixture, ".output/evidence/chrome-dev/kit-www.json")
  await waitFor(async () => JSON.parse(await readFile(evidencePath, "utf8")).development, "initial development kit")
  await waitFor(async () => (await readFile(resolve(fixture, ".output/chrome-mv3-dev/manifest.json"), "utf8")).length, "development manifest")
  const before = await proveInstalledOutput("Count")
  const componentPath = resolve(fixture, "src/site/consumer/Consumer.svelte")
  await writeFile(componentPath, (await readFile(componentPath, "utf8")).replace("Count {counter.value}", "Dev edit {counter.value}"))
  await waitFor(async () => (await readFile(resolve(fixture, ".output/chrome-mv3-dev/consumer-www.js"), "utf8")).includes("Dev edit") && output.includes("Reloaded extension"), "WXT consumer edit rebuild")
  const after = await proveInstalledOutput("Dev edit")
  await writeFile(resolve(root, ".output/development.json"), JSON.stringify({ command: "wxt <fixture> --port <temporary-port>", profiles: "separate fresh installed-extension profiles before and after edit", before, after, expected }, null, 2))
  console.log("Real WXT development command exposed exact full namespaces and rebuilt a consumer edit. Both outputs ran in fresh installed Chromium profiles.")
} finally {
  child.kill("SIGINT")
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null) { child.kill("SIGKILL"); await exited }
  await writeFile(resolve(root, ".output/development.log"), output)
}
