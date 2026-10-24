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
const offHistory = { joined: "history-id", pushed: { [key]: "pushed-old", "unrecognized:key": "opaque-gen" },
  status: "off", editedSinceOff: false, future: { nested: [1, null] }, ...own, v: 99 }
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
    return JSON.stringify({ reads: f.reads, sets: f.sets, events: f.events, senders: f.senders, syncAccesses: f.syncAccesses(), syncReads: f.syncReads, syncWrites: f.syncWrites })
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
async function accepted(browser, raw, data, nextHistory) {
  const before = await read(browser)
  await reset(browser)
  const started = Date.now()
  equal(await send(browser, raw), ok, "native history edit acknowledged")
  await settle(browser)
  const after = await read(browser), observed = await effects(browser), saved = after[key]
  assert.equal(typeof saved.gen, "string")
  assert.notEqual(saved.gen, before[key]?.gen)
  assert(saved.at >= started && saved.at <= Date.now())
  const expected = { ...before[key], v: 1, gen: saved.gen, at: saved.at, by: "synthetic-durable-device", data }
  const items = nextHistory === undefined ? { [key]: expected } : { [key]: expected, sync: nextHistory }
  equal(after, { ...before, ...items }, "native edit changes exact full records")
  equal(observed.sets, [items], "one exact native set contains the full candidate batch")
  equal(observed.reads, [["schema", "device", "sync", setupKey, key]], "native history edit reads exact keys")
  const changes = { [key]: { oldValue: before[key], newValue: expected } }
  if (nextHistory !== undefined) changes.sync = { oldValue: before.sync, newValue: nextHistory }
  equal(observed.events, [{ area: "local", changes }], "one native event contains exact old and new values")
  assert.equal(observed.syncAccesses, 0)
  return { fullReadback: after, observed }
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
  await seed(browser, { ...initial, sync: offHistory })
  equal(await read(browser), { ...initial, sync: offHistory }, "full raw off history seed survives JSON text transfer")
  await inert(browser, { ...request, desired: { mode: "allow", on: false } }, invalid)
  await inert(browser, { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: "stale" }, invalid)
  const batch = await accepted(browser, request, { ...initial[key].data, on: false }, { ...offHistory, editedSinceOff: true })
  result.rounds.push({ stage: "native-off-history-batch", ...batch })
  await inert(browser, request, ok)
  const back = await accepted(browser, { ...request, desired: { mode: "deny", on: true } }, initial[key].data)
  result.rounds.push({ stage: "native-already-true-history", ...back })
  await seed(browser, { sync: { ...offHistory, joined: null }, [key]: initial[key] })
  result.rounds.push({ stage: "native-null-joined-history", ...await accepted(browser, request,
    { ...initial[key].data, on: false }, { ...offHistory, joined: null, editedSinceOff: true }) })
  await seed(browser, { sync: offHistory })
  const current = (await read(browser))[key]
  await inert(browser, { ...request, clearListedChannels: "confirmed", expectedGeneration: "stale" }, ok)
  await inert(browser, { ...request, desired: { mode: "allow", on: false } }, invalid)
  await inert(browser, { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: "stale" }, invalid)
  result.rounds.push({ stage: "native-confirmed-history-batch", ...await accepted(browser,
    { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: current.gen },
    { ...initial[key].data, mode: "allow", on: false, channels: [] }, { ...offHistory, editedSinceOff: true }) })
  for (const raw of [undefined, { v: 1, gen: "omitted", at: 1, by: "old", data: {} },
    { v: 1, gen: "long", at: 1, by: "old", data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]] } }]) {
    await seed(browser, { sync: offHistory })
    if (raw === undefined) await remove(browser, [key])
    else await seed(browser, { [key]: raw })
    await inert(browser, request, ok)
  }
  for (const sync of [null, false, 0, "malformed", {},
    ...["joined", "pushed", "status", "editedSinceOff"].map(key => Object.fromEntries(Object.entries(offHistory).filter(([field]) => field !== key))),
    { ...offHistory, joined: "" }, { ...offHistory, pushed: { opaque: "" } },
    ...["joining", "ok", "full", "update-needed", "waiting", "future"].map(status => ({ ...offHistory, status }))]) {
    await seed(browser, { sync })
    await inert(browser, request, { kind: "unavailable", reason: "sync-writer-required" })
  }
  await seed(browser, { [key]: initial[key], sync: offHistory })
  equal(await browser.page.evaluate(async raw => Promise.all([
    globalThis.requestLocalFilterChange(raw), globalThis.requestLocalFilterChange(raw)
  ]), request), [ok, ok], "overlapping native history intents converge")
  await settle(browser)
  const queued = await effects(browser), queuedReadback = await read(browser)
  assert.equal(queued.reads.length, 2)
  equal(queued.sets, [{ [key]: queuedReadback[key], sync: { ...offHistory, editedSinceOff: true } }], "overlapping intents commit one full history batch")
  assert.equal(queued.events.length, 1)
  equal(Object.keys(queued.events[0].changes).sort(), [key, "sync"].sort(), "overlapping native event carries both keys")
  assert.equal(queued.syncAccesses, 0)
  result.rounds.push({ stage: "native-overlapping-history", fullReadback: queuedReadback, observed: queued })
  await seed(browser, { [key]: initial[key], sync: offHistory })
  const beforeQuota = await read(browser)
  const quota = await browser.worker.evaluate(async () => {
    const limit = chrome.storage.local.QUOTA_BYTES
    const before = await chrome.storage.local.getBytesInUse(null)
    const paddingKey = "fixture-quota-padding"
    await globalThis.localFilterFixture.seed({ [paddingKey]: "x".repeat(limit - before - paddingKey.length - 2 - 8) })
    return { limit, before, filled: await chrome.storage.local.getBytesInUse(null), paddingKey }
  })
  await reset(browser)
  const failed = await send(browser, request)
  assert.equal(typeof failed.fixtureError, "string")
  assert.match(failed.fixtureError, /quota/i)
  await settle(browser)
  const failedEffects = await effects(browser)
  assert.equal(failedEffects.sets.length, 1)
  assert.equal(failedEffects.events.length, 0)
  assert.equal(failedEffects.syncAccesses, 0)
  equal(Object.keys(failedEffects.sets[0]).sort(), [key, "sync"].sort(), "quota rejects the actual two-key batch")
  const afterQuota = await read(browser)
  delete afterQuota[quota.paddingKey]
  equal(afterQuota, beforeQuota, "native quota rejection preserves old Filter and false history exactly")
  await settle(browser)
  equal(await effects(browser), failedEffects, "quota rejection schedules no retry")
  await remove(browser, [quota.paddingKey])
  const recovery = await accepted(browser, request, { ...initial[key].data, on: false }, { ...offHistory, editedSinceOff: true })
  const recovered = recovery.observed
  assert.notEqual(recovered.sets[0][key].gen, failedEffects.sets[0][key].gen)
  durable = recovery.fullReadback
  result.rounds.push({ stage: "native-history-quota-rejection-and-recovery", quota, failed, beforeQuota, afterQuota, failedEffects, ...recovery })
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
  const retry = { ...request, clearListedChannels: "confirmed", expectedGeneration: "old" }
  const observed = await inert(browser, retry, ok)
  result.rounds.push({ stage: "clean-full-browser-restart", native: browser.native, fullReadback: await read(browser), observed })
  result.desiredStateRetryConverged = true
} finally { await browser.context.close() }
const syncBase = key.replace("doc:", "s:"), keptKey = "doc:filter:AAAAAAAAAAAAAAAA:PL_kept", keptBase = keptKey.replace("doc:", "s:")
const syncState = { joined: "history", pushed: { [key]: "old" }, status: "ok", editedSinceOff: false, future: { keep: true }, ...own, v: 99 }
const syncInitial = { schema: 1, device: { ...initial.device, syncOn: true }, sync: syncState,
  "doc:settings": { v: 1, gen: "settings-pending", at: 1, by: "old", data: {} }, [setupKey]: initial[setupKey], [key]: initial[key],
  [keptKey]: { v: 1, gen: "kept-pending", at: 1, by: "old", data: { mode: "allow", on: false, channels: [] } },
  "doc:filter:BBBBBBBBBBBBBBBB:PL_T": { v: 1, gen: "tomb-pending", at: 1, by: "old", deleted: true } }
const syncNative = { "s:meta": { v: 1, id: "history", created: 0, future: { keep: true } }, [syncBase]: initial[key],
  "unknown:occupied": "x", [`${syncBase}@old-orphan.0`]: "old chunk" }
async function syncRead(browser) { return JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.localFilterFixture.syncRead(null)))) }
async function seedJoined(browser, local = syncInitial, remote = syncNative) {
  await browser.worker.evaluate(async text => {
    const { local, remote } = JSON.parse(text), f = globalThis.localFilterFixture
    await f.localClear(); await f.syncClear(); await f.seed(local); await f.syncSeed(remote)
  }, JSON.stringify({ local, remote }))
  await reset(browser)
}
async function joinedInert(browser, expected, raw = request) {
  const before = await read(browser), beforeSync = await syncRead(browser)
  await reset(browser)
  equal(await send(browser, raw), expected, "joined refusal/no-op result")
  await settle(browser)
  const observed = await effects(browser)
  equal(await read(browser), before, "joined refusal/no-op local unchanged")
  equal(await syncRead(browser), beforeSync, "joined refusal/no-op sync unchanged")
  equal(observed.sets, [], "joined refusal/no-op no set")
  equal(observed.events, [], "joined refusal/no-op no event")
  equal(observed.syncWrites, [], "zero writer sync writes")
  return { observed, fullReadback: before, fullSyncSnapshot: beforeSync }
}
async function joinedAccepted(browser, raw = request) {
  const before = await read(browser), beforeSync = await syncRead(browser)
  await reset(browser)
  const started = Date.now()
  equal(await send(browser, raw), ok, "joined edit acknowledged after preflight")
  await settle(browser)
  const after = await read(browser), observed = await effects(browser), saved = after[key]
  assert.equal(typeof saved.gen, "string"); assert.notEqual(saved.gen, before[key]?.gen)
  assert(saved.at >= started && saved.at <= Date.now())
  const data = { ...before[key].data, on: raw.desired.on, mode: raw.desired.mode }
  if (before[key].data.mode !== raw.desired.mode) data.channels = []
  const expected = { ...before[key], v: 1, gen: saved.gen, at: saved.at, by: initial.device.id, data }
  equal(after, { ...before, [key]: expected }, "joined exact local effect with full raw retention")
  equal(observed.sets, [{ [key]: expected }], "joined one Filter-only set")
  equal(observed.reads, [["schema", "device", "sync", setupKey, key], null], "joined native full local read")
  equal(observed.syncReads, [null], "joined native full sync read")
  equal(observed.syncWrites, [], "joined zero writer sync writes")
  equal(await syncRead(browser), beforeSync, "joined no outgoing sync effect")
  equal(observed.events, [{ area: "local", changes: { [key]: { oldValue: before[key], newValue: expected } } }], "joined one exact Filter event and no history/sync event")
  return { observed, fullReadback: after, fullSyncSnapshot: beforeSync }
}
const largePending = gen => ({ v: 1, gen, at: 1, by: "old", data: { mode: "deny", on: false, channels: [], future: "x".repeat(51000) } })
browser = await open()
let syncDurable
try {
  for (const status of ["ok", "full", "update-needed"]) {
    await seedJoined(browser, { ...syncInitial, sync: { ...syncState, status, editedSinceOff: status === "full" } })
    result.rounds.push({ stage: `native-joined-${status}`, ...await joinedAccepted(browser) })
    result.rounds.push({ stage: `native-joined-${status}-noop`, ...await joinedInert(browser, ok) })
  }
  await seedJoined(browser, { ...syncInitial, [keptKey]: largePending("pending-one"), "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending-two") })
  result.rounds.push({ stage: "native-combined-pending-quota-refusal", ...await joinedInert(browser, { kind: "result", result: { refused: "sync-full" } }) })
  await seedJoined(browser, { ...syncInitial, [keptKey]: largePending("pushed-restore"),
    sync: { ...syncState, pushed: { [key]: "old", [keptKey]: "pushed-restore" } }, "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending-two") })
  await browser.worker.evaluate(async text => {
    const f = globalThis.localFilterFixture
    await f.seedSyncDocuments(JSON.parse(text))
  }, JSON.stringify({ [keptKey]: largePending("pushed-restore") }))
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), keptBase)
  await reset(browser)
  result.rounds.push({ stage: "native-disappeared-acknowledged-restoration-quota-refusal", ...await joinedInert(browser, { kind: "result", result: { refused: "sync-full" } }) })
  await seedJoined(browser, { ...syncInitial, [keptKey]: largePending("protected-local"), "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending") },
    { ...syncNative, [keptBase]: { v: 2, gen: "newer", at: 2, by: "future", data: { future: true } } })
  result.rounds.push({ stage: "native-protected-newer-unrelated", ...await joinedAccepted(browser) })
  await seedJoined(browser, syncInitial, { ...syncNative, [syncBase]: { v: 2, gen: "newer", at: 2, by: "future", data: {} } })
  result.rounds.push({ stage: "native-addressed-newer", ...await joinedInert(browser, { kind: "result", result: { refused: "update-needed" } }) })
  result.rounds.push({ stage: "native-achieved-addressed-newer", ...await joinedInert(browser, { kind: "result", result: { refused: "update-needed" } }, { ...request, desired: { mode: "deny", on: true } }) })
  const chunked = { ...initial[key], data: { ...initial[key].data, futureChunk: "x".repeat(15000) } }
  await seedJoined(browser, { ...syncInitial, [key]: chunked })
  await browser.worker.evaluate(text => globalThis.localFilterFixture.seedSyncDocuments(JSON.parse(text)), JSON.stringify({ [key]: chunked }))
  const completeSnapshot = await syncRead(browser), chunk = Object.keys(completeSnapshot).find(name => name.startsWith(`${syncBase}@old.`))
  assert(chunk)
  await browser.worker.evaluate(chunk => globalThis.localFilterFixture.syncRemove(chunk), chunk)
  await reset(browser)
  result.rounds.push({ stage: "native-incomplete-known-chunk", completeSnapshot, removedChunk: chunk,
    ...await joinedInert(browser, { kind: "unavailable", reason: "sync-writer-required" }) })
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), syncBase)
  await reset(browser)
  result.rounds.push({ stage: "native-removed-base-counted-orphans", ...await joinedAccepted(browser) })
  for (const meta of [null, { reset: true, id: "history", created: 0 }, { v: 1, id: "different", created: 0 }]) {
    await seedJoined(browser, syncInitial, { ...syncNative, "s:meta": meta })
    result.rounds.push({ stage: "native-unready-metadata", meta, ...await joinedInert(browser, { kind: "unavailable", reason: "sync-writer-required" }) })
  }
  for (const editedSinceOff of [false, true]) {
    const omitted = { v: 1, gen: "omitted", at: 1, by: "old", extra: own,
      data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]], ...own } }
    await seedJoined(browser, { ...syncInitial, sync: { ...syncState, editedSinceOff }, [key]: omitted },
      { ...syncNative, [syncBase]: omitted, ...Object.fromEntries(Array.from({ length: 481 }, (_, i) => [`unknown:${i}`, 0])) })
    const noOp = await joinedInert(browser, ok, { ...request, clearListedChannels: "confirmed", expectedGeneration: "stale" })
    equal(noOp.observed.syncReads, [null], "omitted-default no-op still reads full native sync")
    result.rounds.push({ stage: "native-joined-overfull-raw-noop", editedSinceOff, ...noOp })
    result.rounds.push({ stage: "native-joined-overfull-changed-refusal", ...await joinedInert(browser,
      { kind: "result", result: { refused: "sync-full" } }, { ...request, desired: { mode: "deny", on: true } }) })
  }
  await seedJoined(browser, { ...syncInitial, [key]: { ...initial[key], data: { ...initial[key].data, on: false } } },
    { ...syncNative, [syncBase]: { ...initial[key], data: { ...initial[key].data, on: false } } })
  const clear = { ...request, desired: { mode: "allow", on: false } }
  await joinedInert(browser, invalid, clear)
  await joinedInert(browser, invalid, { ...clear, clearListedChannels: "confirmed", expectedGeneration: "stale" })
  result.rounds.push({ stage: "native-joined-confirmed-off-list-clear", ...await joinedAccepted(browser,
    { ...clear, clearListedChannels: "confirmed", expectedGeneration: "old" }) })
  await seedJoined(browser)
  const beforeQuota = await read(browser)
  const quota = await browser.worker.evaluate(async () => {
    const limit = chrome.storage.local.QUOTA_BYTES, before = await chrome.storage.local.getBytesInUse(null), paddingKey = "fixture-quota-padding"
    await globalThis.localFilterFixture.seed({ [paddingKey]: "x".repeat(limit - before - paddingKey.length - 2 - 8) })
    return { limit, before, filled: await chrome.storage.local.getBytesInUse(null), paddingKey }
  })
  await reset(browser)
  const failed = await send(browser)
  assert.equal(typeof failed.fixtureError, "string"); assert.match(failed.fixtureError, /quota/i)
  await settle(browser)
  const failedEffects = await effects(browser)
  equal(failedEffects.syncReads, [null], "native local quota follows complete sync preflight")
  equal(failedEffects.syncWrites, [], "native quota failure no sync writes")
  assert.equal(failedEffects.sets.length, 1); equal(Object.keys(failedEffects.sets[0]), [key], "native quota attempted one Filter only")
  equal(failedEffects.events, [], "native quota rejection no events")
  const afterQuota = await read(browser); delete afterQuota[quota.paddingKey]
  equal(afterQuota, beforeQuota, "native quota rejection preserves all preceding records")
  await settle(browser); equal(await effects(browser), failedEffects, "no automatic retry")
  await remove(browser, [quota.paddingKey])
  const recovered = await joinedAccepted(browser)
  syncDurable = recovered.fullReadback
  result.rounds.push({ stage: "native-joined-local-quota-recovery", quota, beforeQuota, afterQuota, failed, failedEffects, ...recovered })
} finally { await browser.context.close() }
browser = await open()
try {
  equal(await read(browser), syncDurable, "full clean browser restart preserves joined accepted document and unchanged history")
  const retry = await joinedInert(browser, ok)
  equal(retry.observed.syncReads, [null], "restarted achieved intent rechecks full remote")
  result.rounds.push({ stage: "native-joined-full-browser-restart", native: browser.native, ...retry })
} finally { await browser.context.close() }

result.limits.push("Clean restart proves resolved native persistence and desired-state retry convergence. It does not prove power-loss atomicity, uncertain in-flight set behavior, Firefox, or production integration.")
await writeFile(join(evidence, "native-result.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ extensionId, version: result.version, stages: result.rounds.map(round => round.stage), nativeIncognito: result.nativeIncognito, desiredStateRetryConverged: result.desiredStateRetryConverged, evidence }, null, 2))
