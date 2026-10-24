import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { chromium } from "playwright"

const { values } = parseArgs({ options: {
  "fixture-dir": { type: "string" }, "evidence-dir": { type: "string" }, "executable-path": { type: "string" }
} })
assert(values["fixture-dir"] && values["evidence-dir"], "Pass --fixture-dir and --evidence-dir")
const fixture = resolve(values["fixture-dir"]), evidence = resolve(values["evidence-dir"])
const source = fileURLToPath(new URL(".", import.meta.url))
await mkdir(fixture, { recursive: true })
await mkdir(evidence, { recursive: true })
for (const name of ["manifest.json", "options.html"]) await copyFile(join(source, name), join(fixture, name))
const artifactHashes = {}
for (const name of ["manifest.json", "options.html", "background.js", "options.js"]) {
  const bytes = await readFile(join(fixture, name))
  artifactHashes[name] = createHash("sha256").update(bytes).digest("hex")
  await copyFile(join(fixture, name), join(evidence, name))
}
const extensionPath = await realpath(fixture)
const extensionId = createHash("sha256").update(extensionPath).digest("hex").slice(0, 32)
  .replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)))
const profile = await mkdtemp(join(evidence, "fresh-profile-"))
const executable = values["executable-path"] || chromium.executablePath()
const optionsUrl = `chrome-extension://${extensionId}/options.html`
const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", setupKey = "doc:setup:AAAAAAAAAAAAAAAA"
const request = { acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P", desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }
const ok = { kind: "result", result: { ok: true } }
const invalid = { kind: "result", result: { refused: "invalid" } }
const own = JSON.parse('{"__proto__":{"keep":"own"},"toJSON":"inert"}')
const initial = {
  schema: 1,
  device: { id: "synthetic-durable-device", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: null,
    claimNotice: null, lastAccount: null, newPlaylistVisibility: null, pickerSortAZ: false,
    detailedLog: false, recentAdds: true, legacyCleared: true, extra: "device" },
  [setupKey]: { v: 1, gen: "setup", at: 1, by: "old", extra: "setup-envelope", data: {
    label: { name: "Synthetic account", extra: true }, autoAdd: [{ pl: "PL_P", takes: "videos", future: 1 }, { pl: "PL_Q", takes: "both" }],
    targets: { abcdef: "PL_Q" }, quickSave: null, musicSave: null, gather: "PL_kept", marks: { PL_Q: "full" }, extra: "setup-body"
  } },
  [key]: { v: 1, gen: "old", at: 1, by: "old", extra: { envelope: true }, ...own, data: {
    mode: "deny", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]], future: { body: true }, ...own
  } },
  "doc:filter:AAAAAAAAAAAAAAAA:PL_Q": { v: 99, gen: "Q", at: 1, by: "old", data: { future: true } },
  "doc:filter:AAAAAAAAAAAAAAAA:PL_kept": { v: 1, gen: "kept", at: 1, by: "old", data: {} },
  "doc:setup:BBBBBBBBBBBBBBBB": { anotherAccount: true }
}
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const equal = (actual, expected, message) => assert.equal(stable(actual), stable(expected), message)
const result = { extensionId, extensionPath, profile, executable, artifactHashes, rounds: [], limits: [] }
async function exactWorker(context) {
  const url = `chrome-extension://${extensionId}/background.js`
  return context.serviceWorkers().find(worker => worker.url() === url)
    || context.waitForEvent("serviceworker", { predicate: worker => worker.url() === url, timeout: 20000 })
}
async function open() {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: executable, headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging",
      "--disable-sync", "--disable-background-networking", "--disable-component-update", "--no-first-run",
      "--host-resolver-rules=MAP * ~NOTFOUND"]
  })
  try {
    const worker = await exactWorker(context)
    assert.equal(worker.url(), `chrome-extension://${extensionId}/background.js`)
    const native = await worker.evaluate(() => ({ href: location.href, id: chrome.runtime.id, storage: typeof chrome.storage.local.get }))
    assert.deepEqual(native, { href: `chrome-extension://${extensionId}/background.js`, id: extensionId, storage: "function" })
    const page = await context.newPage()
    await page.goto(optionsUrl)
    await page.waitForFunction(() => typeof globalThis.requestLocalFilterChange === "function")
    return { context, page, worker, version: context.browser()?.version(), native }
  } catch (error) { await context.close(); throw error }
}
async function effects(browser) {
  return JSON.parse(await browser.worker.evaluate(() => {
    const f = globalThis.localFilterFixture
    return JSON.stringify({ reads: f.reads, sets: f.sets, events: f.events, senders: f.senders, syncAccesses: f.syncAccesses() })
  }))
}
async function read(browser) { return JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.localFilterFixture.read(null)))) }
async function settle(browser) { await browser.page.waitForTimeout(100) }
async function reset(browser) { await settle(browser); await browser.worker.evaluate(() => globalThis.localFilterFixture.clearEffects()) }
async function send(browser, raw = request) { return browser.page.evaluate(raw => globalThis.requestLocalFilterChange(raw), raw) }
async function seed(browser, items) { await browser.worker.evaluate(text => globalThis.localFilterFixture.seed(JSON.parse(text)), JSON.stringify(items)); await reset(browser) }
async function remove(browser, keys) { await browser.worker.evaluate(keys => chrome.storage.local.remove(keys), keys); await reset(browser) }
async function inert(browser, raw, expected) {
  const before = await read(browser)
  await reset(browser)
  equal(await send(browser, raw), expected, "native refusal/no-op result")
  await settle(browser)
  equal(await read(browser), before, "inert request preserves full own data")
  const observed = await effects(browser)
  assert.equal(observed.sets.length, 0)
  assert.equal(observed.events.length, 0)
  assert.equal(observed.syncAccesses, 0)
  return observed
}
let browser = await open()
let durable
try {
  result.version = browser.version
  await seed(browser, initial)
  equal(await read(browser), initial, "literal native seed roundtrip including own fields")
  const started = Date.now()
  equal(await send(browser), ok, "real settings sender commits off")
  await settle(browser)
  const first = await read(browser), saved = first[key], observed = await effects(browser)
  assert.equal(typeof saved.gen, "string")
  assert.notEqual(saved.gen, "old")
  assert(saved.at >= started && saved.at <= Date.now())
  const expectedOff = { v: 1, gen: saved.gen, at: saved.at, by: "synthetic-durable-device", extra: { envelope: true }, ...own, data: {
    mode: "deny", on: false, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]], future: { body: true }, ...own
  } }
  equal(first, { ...initial, [key]: expectedOff }, "only addressed record changes with full extensions")
  equal(observed.reads, [["schema", "device", "sync", setupKey, key]], "real adapter exact read")
  equal(observed.sets, [{ [key]: expectedOff }], "real native exact set")
  assert.equal(observed.events.length, 1)
  equal(observed.events[0], { area: "local", changes: { [key]: { oldValue: initial[key], newValue: expectedOff } } }, "native storage event full own values")
  assert.equal(observed.syncAccesses, 0)
  const sender = observed.senders[0]
  assert.equal(sender.id, extensionId)
  assert.equal(sender.url, optionsUrl)
  assert.equal(sender.frameId, 0)
  assert.equal(sender.tab.incognito, false)
  assert(Number.isInteger(sender.tab.windowId))
  result.rounds.push({ stage: "native-off", native: browser.native, observed, fullReadback: first })
  await inert(browser, request, ok)
  await inert(browser, { ...request, desired: { mode: "allow", on: true } }, invalid)
  await reset(browser)
  equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "restore remembered list")
  await settle(browser)
  const on = (await read(browser))[key]
  equal(on.data, { ...expectedOff.data, on: true }, "on preserves remembered list")
  await inert(browser, { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: saved.gen }, invalid)
  await reset(browser)
  const confirmed = { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: on.gen }
  equal(await send(browser, confirmed), ok, "fresh confirmation clears")
  await settle(browser)
  durable = await read(browser)
  equal(durable[key].data, { mode: "allow", on: false, channels: [], future: { body: true }, ...own }, "literal cleared body")
  assert.notEqual(durable[key].gen, on.gen)
  result.rounds.push({ stage: "native-confirmed", fullReadback: durable, observed: await effects(browser) })
  await inert(browser, { ...confirmed, expectedGeneration: "old" }, ok)
  for (const extra of [{ origin: { kind: "background" } }, { incognito: false }, { source: "sync" }, { background: true }, { windowId: 1 }]) {
    await inert(browser, { ...request, ...extra }, invalid)
  }
  for (const sync of [null, false, 0, "malformed", {}, { joined: null, status: "off" }]) {
    await seed(browser, { sync })
    const raw = await read(browser)
    assert(Object.hasOwn(raw, "sync"), "native history presence survives even null")
    await inert(browser, request, { kind: "unavailable", reason: "sync-writer-required" })
  }
  await remove(browser, ["sync"])
  await seed(browser, { device: { ...initial.device, syncOn: true } })
  await inert(browser, request, { kind: "unavailable", reason: "sync-writer-required" })
  await seed(browser, { device: initial.device, schema: 2 })
  await inert(browser, request, { kind: "unavailable", reason: "newer-layout" })
  await seed(browser, { schema: 1, [key]: { v: 2, gen: "newer", at: 1, by: "other", data: { unknown: true } } })
  await inert(browser, request, { kind: "result", result: { refused: "update-needed" } })
  await remove(browser, [key])
  await inert(browser, request, ok)
  await reset(browser)
  equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "selected absent creates")
  await settle(browser)
  equal((await read(browser))[key].data, { mode: "deny", on: true, channels: [] }, "literal default creation")
  await remove(browser, [setupKey])
  await inert(browser, request, { kind: "unavailable", reason: "account-context" })
  await remove(browser, [key])
  await inert(browser, { ...request, desired: { mode: "deny", on: true } }, { kind: "unavailable", reason: "account-context" })
  await seed(browser, { [setupKey]: initial[setupKey], [key]: initial[key] })
  equal(await browser.page.evaluate(async raw => Promise.all([
    globalThis.requestLocalFilterChange(raw), globalThis.requestLocalFilterChange(raw)
  ]), request), [ok, ok], "overlapping native desired states converge")
  await settle(browser)
  const overlapping = await effects(browser)
  assert.equal(overlapping.reads.length, 2)
  assert.equal(overlapping.sets.length, 1)
  assert.equal(overlapping.events.length, 1)
  assert.equal(overlapping.syncAccesses, 0)
  result.rounds.push({ stage: "native-overlapping-requests", observed: overlapping })
  await seed(browser, { [key]: { v: 1, gen: "omitted", at: 1, by: "old", data: {
    channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]]
  } } })
  await inert(browser, request, ok)
  await remove(browser, [key])
  const quota = await browser.worker.evaluate(async () => {
    const limit = chrome.storage.local.QUOTA_BYTES
    const before = await chrome.storage.local.getBytesInUse(null)
    const paddingKey = "fixture-quota-padding"
    await globalThis.localFilterFixture.seed({ [paddingKey]: "x".repeat(limit - before - paddingKey.length - 2 - 32) })
    return { limit, before, filled: await chrome.storage.local.getBytesInUse(null), paddingKey }
  })
  await reset(browser)
  const createRequest = { ...request, desired: { mode: "deny", on: true } }
  const failed = await send(browser, createRequest)
  assert.equal(typeof failed.fixtureError, "string")
  assert.match(failed.fixtureError, /quota/i)
  await settle(browser)
  const failedEffects = await effects(browser)
  assert.equal(failedEffects.sets.length, 1)
  assert.equal(failedEffects.events.length, 0)
  assert.equal(failedEffects.syncAccesses, 0)
  const absentAfterFailure = await browser.worker.evaluate(key => globalThis.localFilterFixture.read([key]), key)
  assert.equal(Object.hasOwn(absentAfterFailure, key), false)
  await remove(browser, [quota.paddingKey])
  equal(await send(browser, createRequest), ok, "native lane recovers after real quota rejection")
  await settle(browser)
  const recovered = await effects(browser)
  assert.equal(recovered.sets.length, 1)
  assert.equal(recovered.events.length, 1)
  assert.notEqual(recovered.sets[0][key].gen, failedEffects.sets[0][key].gen)
  result.rounds.push({ stage: "native-IO-rejection-and-recovery", quota, failed, failedEffects, recovered })
  await seed(browser, { [setupKey]: initial[setupKey], [key]: durable[key] })
  const permission = await browser.worker.evaluate(() => globalThis.localFilterFixture.incognitoAllowed())
  result.nativeIncognito = { allowed: permission, privateSettingsAdmissionExecuted: false }
  assert.equal(permission, false, "fresh extension has no incognito permission")
  const privateContext = await browser.context.browser().newContext()
  try {
    const privatePage = await privateContext.newPage()
    try { await privatePage.goto(optionsUrl, { timeout: 5000 }) } catch (error) { result.nativeIncognito.deniedNavigation = String(error) }
    await privatePage.waitForTimeout(200)
    result.nativeIncognito.deniedRuntime = await privatePage.evaluate(() => ({
      href: location.href, requestAvailable: typeof globalThis.requestLocalFilterChange === "function",
      extensionId: globalThis.chrome?.runtime?.id ?? null
    }))
    assert.equal(result.nativeIncognito.deniedRuntime.requestAvailable, false)
    assert.notEqual(result.nativeIncognito.deniedRuntime.extensionId, extensionId)
    result.nativeIncognito.permissionDenialObserved = true
  } finally { await privateContext.close() }
  result.limits.push("Private settings admission with native incognito permission granted is not executed. The fresh profile denies extension access in private context. Synthetic metadata fixtures cover private and unknown policy.")
  await writeFile(join(evidence, "native-incognito.json"), JSON.stringify(result.nativeIncognito, null, 2) + "\n")
  result.rounds.push({ stage: "native-controls", fullReadback: await read(browser), syncAccesses: (await effects(browser)).syncAccesses })
} finally { await browser.context.close() }
browser = await open()
try {
  equal(await read(browser), durable, "full browser restart preserves exact complete storage")
  const retry = { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: "old" }
  const observed = await inert(browser, retry, ok)
  result.rounds.push({ stage: "clean-full-browser-restart", native: browser.native, fullReadback: await read(browser), observed })
  result.desiredStateRetryConverged = true
} finally { await browser.context.close() }
result.limits.push("Clean restart proves resolved native persistence and desired-state retry convergence. It does not prove power-loss atomicity, uncertain in-flight set behavior, Firefox, or production integration.")
await writeFile(join(evidence, "native-result.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ extensionId, version: result.version, stages: result.rounds.map(round => round.stage), nativeIncognito: result.nativeIncognito, desiredStateRetryConverged: result.desiredStateRetryConverged, evidence }, null, 2))
