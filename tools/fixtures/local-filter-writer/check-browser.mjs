import { writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { chromium } from "playwright"

const { values } = parseArgs({
  options: {
    "fixture-dir": { type: "string" },
    "evidence-dir": { type: "string" },
    "executable-path": { type: "string" }
  }
})
assert(values["fixture-dir"] && values["evidence-dir"], "Pass --fixture-dir and --evidence-dir")
const fixture = resolve(values["fixture-dir"]),
  evidence = resolve(values["evidence-dir"])
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
const extensionId = createHash("sha256")
  .update(extensionPath)
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)))
const profile = await mkdtemp(join(evidence, "fresh-profile-"))
const executable = values["executable-path"] || chromium.executablePath()
const optionsUrl = `chrome-extension://${extensionId}/options.html`
const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P",
  setupKey = "doc:setup:AAAAAAAAAAAAAAAA"
const request = { acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P", desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }
const ok = { kind: "result", result: { ok: true } }
const invalid = { kind: "result", result: { refused: "invalid" } }
const own = JSON.parse('{"__proto__":{"keep":"own"},"toJSON":"inert"}')
const offHistory = { joined: "history-id", pushed: { [key]: "pushed-old", "unrecognized:key": "opaque-gen" }, status: "off", editedSinceOff: false, future: { nested: [1, null] }, ...own, v: 99 }
const initial = {
  schema: 1,
  device: {
    id: "synthetic-durable-device",
    consent: { v: 1, at: 1 },
    syncOn: false,
    upgradeNote: null,
    claimNotice: null,
    newPlaylistVisibility: null,
    pickerSortAZ: false,
    detailedLog: false,
    recentAdds: true,
    legacyCleared: true,
    extra: "device"
  },
  [setupKey]: {
    v: 1,
    gen: "setup",
    at: 1,
    by: "old",
    extra: "setup-envelope",
    data: {
      label: { name: "Synthetic account", extra: true },
      autoAdd: [
        { pl: "PL_P", takes: "videos", future: 1 },
        { pl: "PL_Q", takes: "both" }
      ],
      targets: { abcdef: "PL_Q" },
      quickSave: null,
      musicSave: null,
      gather: "PL_kept",
      marks: { PL_Q: "full" },
      extra: "setup-body"
    }
  },
  [key]: {
    v: 1,
    gen: "old",
    at: 1,
    by: "old",
    extra: { envelope: true },
    ...own,
    data: {
      mode: "deny",
      on: true,
      channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]],
      future: { body: true },
      ...own
    }
  },
  "doc:filter:AAAAAAAAAAAAAAAA:PL_Q": { v: 99, gen: "Q", at: 1, by: "old", data: { future: true } },
  "doc:filter:AAAAAAAAAAAAAAAA:PL_kept": { v: 1, gen: "kept", at: 1, by: "old", data: {} },
  "doc:setup:BBBBBBBBBBBBBBBB": { anotherAccount: true }
}
const stable = value =>
  JSON.stringify(value, (_, item) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item))
const equal = (actual, expected, message) => assert.equal(stable(actual), stable(expected), message)
function evidenceJson(value) {
  const padding = item =>
    typeof item === "string"
      ? { syntheticPaddingLength: item.length }
      : item && typeof item === "object"
        ? Object.fromEntries(Object.entries(item).map(([name, field]) => [name, padding(field)]))
        : item
  return JSON.stringify(value, (name, field) => (name === "fixture-quota-padding" || name.startsWith("fixture-sync-occupancy:") ? padding(field) : field), 2)
}
const result = { extensionId, extensionPath, profile, executable, artifactHashes, processes: [], rounds: [], limits: [] }
process.on("uncaughtExceptionMonitor", error => {
  writeFileSync(join(evidence, "failed-native-result.json"), evidenceJson({ ...result, failure: { name: error.name, message: error.message } }) + "\n")
})
async function exactWorker(context) {
  const url = `chrome-extension://${extensionId}/background.js`
  return context.serviceWorkers().find(worker => worker.url() === url) || context.waitForEvent("serviceworker", { predicate: worker => worker.url() === url, timeout: 20000 })
}
async function open() {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: executable,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-extension-debugging",
      "--disable-sync",
      "--disable-background-networking",
      "--disable-component-update",
      "--no-first-run",
      "--host-resolver-rules=MAP * ~NOTFOUND"
    ]
  })
  try {
    const processIds = execFileSync("pgrep", ["-f", profile], { encoding: "utf8" }).trim().split(/\s+/).map(Number)
    assert(processIds.length > 0 && processIds.every(Number.isSafeInteger), "identify only fresh fixture profile processes")
    const receipt = { processIds, openedAt: Date.now(), exited: false }
    result.processes.push(receipt)
    const close = context.close.bind(context)
    context.close = async () => {
      await close()
      const alive = pid => {
        try {
          process.kill(pid, 0)
          return true
        } catch (error) {
          if (error.code === "ESRCH") return false
          throw error
        }
      }
      for (let i = 0; i < 100 && processIds.some(alive); i++) await new Promise(done => setTimeout(done, 10))
      assert.equal(processIds.some(alive), false, "previous fixture browser processes exited before replacement owner")
      receipt.exited = true
      receipt.closedAt = Date.now()
    }
    const worker = await exactWorker(context)
    assert.equal(worker.url(), `chrome-extension://${extensionId}/background.js`)
    const native = await worker.evaluate(() => ({ href: location.href, id: chrome.runtime.id, storage: typeof chrome.storage.local.get }))
    assert.deepEqual(native, { href: `chrome-extension://${extensionId}/background.js`, id: extensionId, storage: "function" })
    const page = await context.newPage()
    await page.goto(optionsUrl)
    await page.waitForFunction(() => typeof globalThis.requestLocalFilterChange === "function")
    return { context, page, worker, version: context.browser()?.version(), native }
  } catch (error) {
    await context.close()
    throw error
  }
}
async function effects(browser) {
  return JSON.parse(
    await browser.worker.evaluate(() => {
      const f = globalThis.localFilterFixture
      return JSON.stringify({
        reads: f.reads,
        sets: f.sets,
        events: f.events,
        senders: f.senders,
        syncAccesses: f.syncAccesses(),
        syncReads: f.syncReads,
        syncWrites: f.syncWrites,
        automaticResults: f.automaticResults,
        nativeInvocations: f.nativeInvocations,
        heldSet: f.isSetHeld(),
        timers: f.timers,
        pendingTimers: f.pendingTimers(),
        unhandledRejections: f.unhandledRejections
      })
    })
  )
}
async function read(browser) {
  return JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.localFilterFixture.read(null))))
}
async function settle(browser) {
  await browser.page.waitForTimeout(100)
}
async function reset(browser) {
  await settle(browser)
  await browser.worker.evaluate(() => globalThis.localFilterFixture.clearEffects())
}
async function send(browser, raw = request) {
  return browser.page.evaluate(raw => globalThis.requestLocalFilterChange(raw), raw)
}
async function seed(browser, items) {
  await browser.worker.evaluate(text => globalThis.localFilterFixture.seed(JSON.parse(text)), JSON.stringify(items))
  await reset(browser)
}
async function remove(browser, keys) {
  await browser.worker.evaluate(keys => chrome.storage.local.remove(keys), keys)
  await reset(browser)
}
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
  const after = await read(browser),
    observed = await effects(browser),
    saved = after[key]
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
  const first = await read(browser),
    saved = first[key],
    observed = await effects(browser)
  assert.equal(typeof saved.gen, "string")
  assert.notEqual(saved.gen, "old")
  assert(saved.at >= started && saved.at <= Date.now())
  const expectedOff = {
    v: 1,
    gen: saved.gen,
    at: saved.at,
    by: "synthetic-durable-device",
    extra: { envelope: true },
    ...own,
    data: {
      mode: "deny",
      on: false,
      channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]],
      future: { body: true },
      ...own
    }
  }
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
  equal(
    await browser.page.evaluate(async raw => Promise.all([globalThis.requestLocalFilterChange(raw), globalThis.requestLocalFilterChange(raw)]), request),
    [ok, ok],
    "overlapping native desired states converge"
  )
  await settle(browser)
  const overlapping = await effects(browser)
  assert.equal(overlapping.reads.length, 2)
  assert.equal(overlapping.sets.length, 1)
  assert.equal(overlapping.events.length, 1)
  assert.equal(overlapping.syncAccesses, 0)
  result.rounds.push({ stage: "native-overlapping-requests", observed: overlapping })
  await seed(browser, {
    [key]: {
      v: 1,
      gen: "omitted",
      at: 1,
      by: "old",
      data: {
        channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]]
      }
    }
  })
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
  result.rounds.push({ stage: "native-null-joined-history", ...(await accepted(browser, request, { ...initial[key].data, on: false }, { ...offHistory, joined: null, editedSinceOff: true })) })
  await seed(browser, { sync: offHistory })
  const current = (await read(browser))[key]
  await inert(browser, { ...request, clearListedChannels: "confirmed", expectedGeneration: "stale" }, ok)
  await inert(browser, { ...request, desired: { mode: "allow", on: false } }, invalid)
  await inert(browser, { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: "stale" }, invalid)
  result.rounds.push({
    stage: "native-confirmed-history-batch",
    ...(await accepted(
      browser,
      { ...request, desired: { mode: "allow", on: false }, clearListedChannels: "confirmed", expectedGeneration: current.gen },
      { ...initial[key].data, mode: "allow", on: false, channels: [] },
      { ...offHistory, editedSinceOff: true }
    ))
  })
  for (const raw of [
    undefined,
    { v: 1, gen: "omitted", at: 1, by: "old", data: {} },
    { v: 1, gen: "long", at: 1, by: "old", data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]] } }
  ]) {
    await seed(browser, { sync: offHistory })
    if (raw === undefined) await remove(browser, [key])
    else await seed(browser, { [key]: raw })
    await inert(browser, request, ok)
  }
  for (const sync of [
    null,
    false,
    0,
    "malformed",
    {},
    ...["joined", "pushed", "status", "editedSinceOff"].map(key => Object.fromEntries(Object.entries(offHistory).filter(([field]) => field !== key))),
    { ...offHistory, joined: "" },
    { ...offHistory, pushed: { opaque: "" } },
    ...["joining", "ok", "full", "update-needed", "waiting", "future"].map(status => ({ ...offHistory, status }))
  ]) {
    await seed(browser, { sync })
    await inert(browser, request, { kind: "unavailable", reason: "sync-writer-required" })
  }
  await seed(browser, { [key]: initial[key], sync: offHistory })
  equal(
    await browser.page.evaluate(async raw => Promise.all([globalThis.requestLocalFilterChange(raw), globalThis.requestLocalFilterChange(raw)]), request),
    [ok, ok],
    "overlapping native history intents converge"
  )
  await settle(browser)
  const queued = await effects(browser),
    queuedReadback = await read(browser)
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
    try {
      await privatePage.goto(optionsUrl, { timeout: 5000 })
    } catch (error) {
      result.nativeIncognito.deniedNavigation = String(error)
    }
    await privatePage.waitForTimeout(200)
    result.nativeIncognito.deniedRuntime = await privatePage.evaluate(() => ({
      href: location.href,
      requestAvailable: typeof globalThis.requestLocalFilterChange === "function",
      extensionId: globalThis.chrome?.runtime?.id ?? null
    }))
    assert.equal(result.nativeIncognito.deniedRuntime.requestAvailable, false)
    assert.notEqual(result.nativeIncognito.deniedRuntime.extensionId, extensionId)
    result.nativeIncognito.permissionDenialObserved = true
  } finally {
    await privateContext.close()
  }
  result.limits.push(
    "Private settings admission with native incognito permission granted is not executed. The fresh profile denies extension access in private context. Synthetic metadata fixtures cover private and unknown policy."
  )
  await writeFile(join(evidence, "native-incognito.json"), JSON.stringify(result.nativeIncognito, null, 2) + "\n")
  result.rounds.push({ stage: "native-controls", fullReadback: await read(browser), syncAccesses: (await effects(browser)).syncAccesses })
} finally {
  await browser.context.close()
}
browser = await open()
try {
  equal(await read(browser), durable, "full browser restart preserves exact complete storage")
  const retry = { ...request, clearListedChannels: "confirmed", expectedGeneration: "old" }
  const observed = await inert(browser, retry, ok)
  result.rounds.push({ stage: "clean-full-browser-restart", native: browser.native, fullReadback: await read(browser), observed })
  result.desiredStateRetryConverged = true
} finally {
  await browser.context.close()
}
const syncBase = key.replace("doc:", "s:"),
  keptKey = "doc:filter:AAAAAAAAAAAAAAAA:PL_kept",
  keptBase = keptKey.replace("doc:", "s:")
const syncState = { joined: "history", pushed: { [key]: "old" }, status: "ok", editedSinceOff: false, future: { keep: true }, ...own, v: 99 }
const syncInitial = {
  schema: 1,
  device: { ...initial.device, syncOn: true },
  sync: syncState,
  "doc:settings": { v: 1, gen: "settings-pending", at: 1, by: "old", data: {} },
  [setupKey]: initial[setupKey],
  [key]: initial[key],
  [keptKey]: { v: 1, gen: "kept-pending", at: 1, by: "old", data: { mode: "allow", on: false, channels: [] } },
  "doc:filter:BBBBBBBBBBBBBBBB:PL_T": { v: 1, gen: "tomb-pending", at: 1, by: "old", deleted: true }
}
const syncNative = { "s:meta": { v: 1, id: "history", created: 0, future: { keep: true } }, [syncBase]: initial[key], "unknown:occupied": "x", [`${syncBase}@old-orphan.0`]: "old chunk" }
async function syncRead(browser) {
  return JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.localFilterFixture.syncRead(null))))
}
async function seedJoined(browser, local = syncInitial, remote = syncNative) {
  await browser.worker.evaluate(async text => {
    const { local, remote } = JSON.parse(text),
      f = globalThis.localFilterFixture
    await f.localClear()
    await f.syncClear()
    await f.seed(local)
    await f.syncSeed(remote)
  }, JSON.stringify({ local, remote }))
  await reset(browser)
}
async function joinedInert(browser, expected, raw = request) {
  const before = await read(browser),
    beforeSync = await syncRead(browser)
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
  const before = await read(browser),
    beforeSync = await syncRead(browser)
  await reset(browser)
  const started = Date.now()
  equal(await send(browser, raw), ok, "joined edit acknowledged after preflight")
  await settle(browser)
  const after = await read(browser),
    observed = await effects(browser),
    saved = after[key]
  assert.equal(typeof saved.gen, "string")
  assert.notEqual(saved.gen, before[key]?.gen)
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
    result.rounds.push({ stage: `native-joined-${status}`, ...(await joinedAccepted(browser)) })
    result.rounds.push({ stage: `native-joined-${status}-noop`, ...(await joinedInert(browser, ok)) })
  }
  await seedJoined(browser, { ...syncInitial, [keptKey]: largePending("pending-one"), "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending-two") })
  result.rounds.push({ stage: "native-combined-pending-quota-refusal", ...(await joinedInert(browser, { kind: "result", result: { refused: "sync-full" } })) })
  await seedJoined(browser, {
    ...syncInitial,
    [keptKey]: largePending("pushed-restore"),
    sync: { ...syncState, pushed: { [key]: "old", [keptKey]: "pushed-restore" } },
    "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending-two")
  })
  await browser.worker.evaluate(
    async text => {
      const f = globalThis.localFilterFixture
      await f.seedSyncDocuments(JSON.parse(text))
    },
    JSON.stringify({ [keptKey]: largePending("pushed-restore") })
  )
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), keptBase)
  await reset(browser)
  result.rounds.push({ stage: "native-disappeared-acknowledged-restoration-quota-refusal", ...(await joinedInert(browser, { kind: "result", result: { refused: "sync-full" } })) })
  await seedJoined(
    browser,
    { ...syncInitial, [keptKey]: largePending("protected-local"), "doc:filter:BBBBBBBBBBBBBBBB:PL_T": largePending("pending") },
    { ...syncNative, [keptBase]: { v: 2, gen: "newer", at: 2, by: "future", data: { future: true } } }
  )
  result.rounds.push({ stage: "native-protected-newer-unrelated", ...(await joinedAccepted(browser)) })
  await seedJoined(browser, syncInitial, { ...syncNative, [syncBase]: { v: 2, gen: "newer", at: 2, by: "future", data: {} } })
  result.rounds.push({ stage: "native-addressed-newer", ...(await joinedInert(browser, { kind: "result", result: { refused: "update-needed" } })) })
  result.rounds.push({
    stage: "native-achieved-addressed-newer",
    ...(await joinedInert(browser, { kind: "result", result: { refused: "update-needed" } }, { ...request, desired: { mode: "deny", on: true } }))
  })
  const chunked = { ...initial[key], data: { ...initial[key].data, futureChunk: "x".repeat(15000) } }
  await seedJoined(browser, { ...syncInitial, [key]: chunked })
  await browser.worker.evaluate(text => globalThis.localFilterFixture.seedSyncDocuments(JSON.parse(text)), JSON.stringify({ [key]: chunked }))
  const completeSnapshot = await syncRead(browser),
    chunk = Object.keys(completeSnapshot).find(name => name.startsWith(`${syncBase}@old.`))
  assert(chunk)
  await browser.worker.evaluate(chunk => globalThis.localFilterFixture.syncRemove(chunk), chunk)
  await reset(browser)
  result.rounds.push({ stage: "native-incomplete-known-chunk", completeSnapshot, removedChunk: chunk, ...(await joinedInert(browser, { kind: "unavailable", reason: "sync-writer-required" })) })
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), syncBase)
  await reset(browser)
  result.rounds.push({ stage: "native-removed-base-counted-orphans", ...(await joinedAccepted(browser)) })
  for (const meta of [null, { reset: true, id: "history", created: 0 }, { v: 1, id: "different", created: 0 }]) {
    await seedJoined(browser, syncInitial, { ...syncNative, "s:meta": meta })
    result.rounds.push({ stage: "native-unready-metadata", meta, ...(await joinedInert(browser, { kind: "unavailable", reason: "sync-writer-required" })) })
  }
  for (const editedSinceOff of [false, true]) {
    const omitted = { v: 1, gen: "omitted", at: 1, by: "old", extra: own, data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]], ...own } }
    await seedJoined(
      browser,
      { ...syncInitial, sync: { ...syncState, editedSinceOff }, [key]: omitted },
      { ...syncNative, [syncBase]: omitted, ...Object.fromEntries(Array.from({ length: 481 }, (_, i) => [`unknown:${i}`, 0])) }
    )
    const noOp = await joinedInert(browser, ok, { ...request, clearListedChannels: "confirmed", expectedGeneration: "stale" })
    equal(noOp.observed.syncReads, [null], "omitted-default no-op still reads full native sync")
    result.rounds.push({ stage: "native-joined-overfull-raw-noop", editedSinceOff, ...noOp })
    result.rounds.push({
      stage: "native-joined-overfull-changed-refusal",
      ...(await joinedInert(browser, { kind: "result", result: { refused: "sync-full" } }, { ...request, desired: { mode: "deny", on: true } }))
    })
  }
  await seedJoined(
    browser,
    { ...syncInitial, [key]: { ...initial[key], data: { ...initial[key].data, on: false } } },
    { ...syncNative, [syncBase]: { ...initial[key], data: { ...initial[key].data, on: false } } }
  )
  const clear = { ...request, desired: { mode: "allow", on: false } }
  await joinedInert(browser, invalid, clear)
  await joinedInert(browser, invalid, { ...clear, clearListedChannels: "confirmed", expectedGeneration: "stale" })
  result.rounds.push({ stage: "native-joined-confirmed-off-list-clear", ...(await joinedAccepted(browser, { ...clear, clearListedChannels: "confirmed", expectedGeneration: "old" })) })
  await seedJoined(browser)
  const beforeQuota = await read(browser)
  const quota = await browser.worker.evaluate(async () => {
    const limit = chrome.storage.local.QUOTA_BYTES,
      before = await chrome.storage.local.getBytesInUse(null),
      paddingKey = "fixture-quota-padding"
    await globalThis.localFilterFixture.seed({ [paddingKey]: "x".repeat(limit - before - paddingKey.length - 2 - 8) })
    return { limit, before, filled: await chrome.storage.local.getBytesInUse(null), paddingKey }
  })
  await reset(browser)
  const failed = await send(browser)
  assert.equal(typeof failed.fixtureError, "string")
  assert.match(failed.fixtureError, /quota/i)
  await settle(browser)
  const failedEffects = await effects(browser)
  equal(failedEffects.syncReads, [null], "native local quota follows complete sync preflight")
  equal(failedEffects.syncWrites, [], "native quota failure no sync writes")
  assert.equal(failedEffects.sets.length, 1)
  equal(Object.keys(failedEffects.sets[0]), [key], "native quota attempted one Filter only")
  equal(failedEffects.events, [], "native quota rejection no events")
  const afterQuota = await read(browser)
  delete afterQuota[quota.paddingKey]
  equal(afterQuota, beforeQuota, "native quota rejection preserves all preceding records")
  await settle(browser)
  equal(await effects(browser), failedEffects, "no automatic retry")
  await remove(browser, [quota.paddingKey])
  const recovered = await joinedAccepted(browser)
  syncDurable = recovered.fullReadback
  result.rounds.push({ stage: "native-joined-local-quota-recovery", quota, beforeQuota, afterQuota, failed, failedEffects, ...recovered })
} finally {
  await browser.context.close()
}
browser = await open()
try {
  equal(await read(browser), syncDurable, "full clean browser restart preserves joined accepted document and unchanged history")
  const retry = await joinedInert(browser, ok)
  equal(retry.observed.syncReads, [null], "restarted achieved intent rechecks full remote")
  result.rounds.push({ stage: "native-joined-full-browser-restart", native: browser.native, ...retry })
} finally {
  await browser.context.close()
}

const flushBase = key.replace("doc:", "s:"),
  tombKey = "doc:filter:BBBBBBBBBBBBBBBB:PL_T"
const flushG0 = { v: 1, gen: "g0", at: 1, by: "old", ...own, data: { mode: "deny", on: true, channels: [], future: { keep: true } } }
const flushG1 = { ...flushG0, gen: "g1", at: 10, data: { ...flushG0.data, on: false } }
const flushSettings = { v: 1, gen: "settings-pending", at: 1, by: "old", data: { future: "x".repeat(9000) } }
const flushTomb = { v: 1, gen: "tomb", at: 0, by: "old", deleted: true }
const flushHistory = { joined: "H", pushed: { [key]: "g0", [setupKey]: "setup" }, status: "full", editedSinceOff: true, future: { keep: [1, null, own] }, v: 99, ...own }
const flushLocal = {
  schema: 1,
  device: { ...initial.device, syncOn: true },
  sync: flushHistory,
  [setupKey]: initial[setupKey],
  [key]: flushG1,
  "doc:settings": flushSettings,
  [tombKey]: flushTomb,
  [keptKey]: { ...flushG0, gen: "protected-local" }
}
const flushRemote = {
  "s:meta": { v: 1, id: "H", created: 0, extra: own },
  [flushBase]: flushG0,
  "s:settings@old.0": "old chunk",
  "unknown:occupied": "x",
  [keptBase]: { v: 2, gen: "protected-newer", at: 20, by: "other", data: { future: true } }
}
const prefix = '{"at":1,"by":"old","data":{"future":"'
const flushItems = {
  [setupKey.replace("doc:", "s:")]: initial[setupKey],
  [flushBase]: flushG1,
  "s:settings": { v: 1, gen: "settings-pending", at: 1, by: "old", n: 2 },
  "s:settings@settings-pending.0": prefix + "x".repeat(8109),
  "s:settings@settings-pending.1": "x".repeat(891) + '"},"gen":"settings-pending","v":1}',
  "s:filter:BBBBBBBBBBBBBBBB:PL_T": flushTomb
}
const flushAck = { ...flushHistory, pushed: { ...flushHistory.pushed, [key]: "g1", "doc:settings": "settings-pending", [tombKey]: "tomb" } }
const flushRecord = (name, document, documentKey) => ({ key: documentKey, name, gen: document.gen, document })
const capturedFilter = flushRecord(key, flushG1, { kind: "filter", acct: request.acct, playlist: request.playlist })
const capturedBatch = [
  flushRecord(setupKey, initial[setupKey], { kind: "setup", acct: request.acct }),
  capturedFilter,
  flushRecord("doc:settings", flushSettings, { kind: "settings" }),
  flushRecord(tombKey, flushTomb, { kind: "filter", acct: "BBBBBBBBBBBBBBBB", playlist: "PL_T" })
]
function orderedOutcome(outcome) {
  for (const name of ["sent", "repaired", "repairs"]) if (Array.isArray(outcome[name])) outcome[name].sort((a, b) => a.name.localeCompare(b.name))
  if (outcome.source) orderedOutcome(outcome.source)
  return outcome
}
async function waitForPacing(browser) {
  const delay = await browser.worker.evaluate(() => globalThis.localFilterFixture.pacingDelay())
  if (delay > 0) await browser.page.waitForTimeout(delay + 25)
}
async function flush(browser) {
  await waitForPacing(browser)
  return orderedOutcome(JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.localFilterFixture.flush()))))
}
async function meaningfulRead(browser) {
  return JSON.parse(
    await browser.worker.evaluate(async () => {
      const records = await globalThis.localFilterFixture.read(null)
      delete records["fixture-quota-padding"]
      return JSON.stringify(records)
    })
  )
}
function pendingHistory(observed, raw) {
  const pending = observed.sets[0]?.sync
  assert(pending?.opaqueWrite?.gate?.kind === "pending", "native set must have a durable pending prearm")
  assert(Number.isSafeInteger(pending.opaqueWrite.gate.notBefore))
  equal({ ...pending, opaqueWrite: undefined }, { ...raw, opaqueWrite: undefined }, "prearm changes only local recovery bookkeeping")
  return pending
}

async function recordFlush(browser, stage, outcome) {
  await settle(browser)
  const observed = await effects(browser),
    fullReadback = await meaningfulRead(browser),
    fullSyncSnapshot = await syncRead(browser)
  const round = { stage, outcome, observed, fullReadback, fullSyncSnapshot }
  result.rounds.push(round)
  await writeFile(join(evidence, "native-progress.json"), evidenceJson(result) + "\n")
  console.log(JSON.stringify({ stage, kind: outcome.kind }))
  return round
}
async function padLocal(browser) {
  const quota = await browser.worker.evaluate(async () => {
    const f = globalThis.localFilterFixture,
      limit = chrome.storage.local.QUOTA_BYTES
    const before = await chrome.storage.local.getBytesInUse(null),
      paddingKey = "fixture-quota-padding"
    await f.seed({ [paddingKey]: "x".repeat(limit - before - paddingKey.length - 2 - 8) })
    return { limit, before, filled: await chrome.storage.local.getBytesInUse(null), paddingKey }
  })
  assert.equal(quota.filled, quota.limit - 8)
  await reset(browser)
  return quota
}
browser = await open()
let outboundDurable, outboundRemoteDurable
try {
  await seedJoined(browser, flushLocal, flushRemote)
  const pushed = await recordFlush(browser, "outbound-six-item-whole-push", await flush(browser))
  equal(pushed.outcome, { kind: "pushed", sent: [...capturedBatch].sort((a, b) => a.name.localeCompare(b.name)), repaired: [] }, "native complete captured generation result")
  equal(pushed.observed.syncWrites, [flushItems], "native literal complete six-item set")
  const pushedPending = pendingHistory(pushed.observed, flushHistory)
  equal(pushed.observed.sets, [{ sync: pushedPending }, { sync: flushAck }], "native exact full raw acknowledgement")
  equal(pushed.fullReadback, { ...flushLocal, sync: flushAck }, "native flush does not edit local documents")
  equal(pushed.fullSyncSnapshot, { ...flushRemote, ...flushItems }, "native preserves unknown protected and old occupancy")
  equal(pushed.observed.syncReads, [null, null, null], "native complete preflight and postflight")
  const syncChanges = Object.fromEntries(Object.entries(flushItems).map(([name, value]) => [name, { ...(Object.hasOwn(flushRemote, name) ? { oldValue: flushRemote[name] } : {}), newValue: value }]))
  equal(
    pushed.observed.events.filter(event => event.area === "sync"),
    [{ area: "sync", changes: syncChanges }],
    "one exact sync native event"
  )
  equal(
    pushed.observed.events.filter(event => event.area === "local"),
    [
      { area: "local", changes: { sync: { oldValue: flushHistory, newValue: pushedPending } } },
      { area: "local", changes: { sync: { oldValue: pushedPending, newValue: flushAck } } }
    ],
    "durable prearm precedes exact local acknowledgement event"
  )
  await reset(browser)
  const repeat = await recordFlush(browser, "outbound-identical-repeat", await flush(browser))
  equal(repeat.outcome, { kind: "idle" }, "native identical repeat idle")
  equal(repeat.observed.syncWrites, [], "native duplicate sends nothing")
  equal(repeat.observed.sets, [], "native duplicate acknowledges nothing")
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), flushBase)
  await reset(browser)
  const restored = await recordFlush(browser, "outbound-acknowledged-disappearance-restoration", await flush(browser))
  equal(restored.outcome, { kind: "pushed", sent: [capturedFilter], repaired: [] }, "native restoration preserves generation")
  equal(restored.observed.syncWrites, [{ [flushBase]: flushG1 }], "native restoration complete one item")
  equal(restored.observed.sets, [{ sync: pendingHistory(restored.observed, flushAck) }, { sync: flushAck }], "restoration clears its pending marker without a new generation")
  const small = { v: 1, gen: "small", at: 30, by: "device", data: {} }
  await seed(browser, { "doc:settings": small })
  const replaced = await recordFlush(browser, "outbound-chunked-to-single-retained-occupancy", await flush(browser))
  equal(replaced.observed.syncWrites, [{ "s:settings": small }], "native replacement only current small envelope")
  equal(replaced.fullSyncSnapshot, { ...restored.fullSyncSnapshot, "s:settings": small }, "native replacement retains every old chunk")
  await seedJoined(browser, { ...flushLocal, sync: flushHistory }, { ...flushRemote, ...flushItems })
  const repair = await recordFlush(browser, "outbound-readback-only-repair", await flush(browser))
  equal(
    repair.outcome,
    { kind: "reconciled", repaired: [capturedFilter, capturedBatch[2], capturedBatch[3]].sort((a, b) => a.name.localeCompare(b.name)) },
    "native repair identifies exact stale generations"
  )
  equal(repair.observed.syncWrites, [], "native repair no resend")
  equal(repair.observed.sets, [{ sync: flushAck }], "native readback only full history repair")
  await seedJoined(browser, flushLocal, { ...flushRemote, "s:settings": flushItems["s:settings"], "s:settings@settings-pending.0": flushItems["s:settings@settings-pending.0"] })
  const incomplete = await recordFlush(browser, "outbound-incomplete-known-refusal", await flush(browser))
  equal(incomplete.outcome, { kind: "unavailable" }, "native incomplete delivery unavailable")
  equal(incomplete.observed.syncWrites, [], "native incomplete no partial push")
  equal(incomplete.observed.sets, [], "native incomplete no acknowledgement")
  for (const authority of ["off", "metadata"]) {
    await seedJoined(browser, flushLocal, flushRemote)
    await browser.worker.evaluate(authority => {
      const f = globalThis.localFilterFixture
      if (authority === "off") f.switchOffAfterNextSet()
      else f.changeMetadataAfterNextSet()
    }, authority)
    const changed = await recordFlush(browser, `outbound-post-set-authority-${authority}`, await flush(browser))
    equal(
      changed.outcome,
      { kind: "unconfirmed", sent: [...capturedBatch].sort((a, b) => a.name.localeCompare(b.name)), cause: { kind: authority === "off" ? "authority" : "readback" } },
      "native authority loss retains resolved set outcome"
    )
    equal(changed.observed.syncWrites, [flushItems], "native stale authority had actual resolved set")
    equal(changed.observed.sets, [{ sync: pendingHistory(changed.observed, flushHistory) }], "native stale authority retains pending without acknowledgement")
    equal(changed.observed.syncReads, authority === "off" ? [null, null] : [null, null, null], "native off declines further sync access")
  }
  await seedJoined(browser, flushLocal, flushRemote)
  await browser.worker.evaluate(() => globalThis.localFilterFixture.fillSyncBeforeNextSet())
  const syncRejected = await recordFlush(browser, "outbound-genuine-native-sync-set-rejection", await flush(browser))
  equal(syncRejected.outcome.kind, "sync-set-failed", "native occupancy race rejects actual planned sync call")
  equal(
    syncRejected.outcome.sent,
    [...capturedBatch].sort((a, b) => a.name.localeCompare(b.name)),
    "native rejected call retains exact captured generations"
  )
  equal(syncRejected.outcome.error.name, "Error", "native rejection preserves unclassified error")
  equal(syncRejected.observed.syncWrites, [flushItems], "native rejected actual complete set was attempted once")
  const rejectedPending = pendingHistory(syncRejected.observed, flushHistory)
  const held = syncRejected.fullReadback.sync
  assert(held.opaqueWrite.gate.kind === "held", "opaque rejection retains durable hold")
  assert(held.opaqueWrite.gate.notBefore >= rejectedPending.opaqueWrite.gate.notBefore)
  equal(held.pushed, flushHistory.pushed, "native rejection acknowledges nothing")
  equal(syncRejected.observed.sets, [{ sync: rejectedPending }, { sync: held }], "native rejection finalizes held after prearm")
  equal(syncRejected.fullReadback, { ...flushLocal, sync: held }, "native rejection retains local documents and held bookkeeping")
  equal(
    syncRejected.fullSyncSnapshot,
    { ...flushRemote, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`fixture-sync-occupancy:${i}`, "x".repeat(7800)])) },
    "observed native rejection left only injected occupancy"
  )
  await settle(browser)
  equal((await effects(browser)).syncWrites, [flushItems], "native rejected call schedules no automatic retry")
  await seedJoined(browser, flushLocal, flushRemote)
  const quota = await padLocal(browser)
  const failed = await recordFlush(browser, "outbound-genuine-local-quota-prearm-failure", await flush(browser).catch(error => ({ kind: "rejected", error: { name: error.name } })))
  equal(failed.outcome.kind, "rejected", "native local quota refuses durable prearm before sync")
  assert.equal(failed.outcome.source, undefined, "prearm rejection has no native set source")
  assert.equal(failed.outcome.error.name, "Error")
  equal(failed.observed.syncWrites, [], "native quota prevents sync invocation")
  equal(failed.observed.sets, [{ sync: pendingHistory(failed.observed, flushHistory) }], "native quota attempted only durable prearm")
  equal(failed.fullReadback, flushLocal, "native quota leaves full old history and local generations")
  equal(failed.fullSyncSnapshot, flushRemote, "failed prearm leaves remote records unchanged")
  failed.quota = quota
  await settle(browser)
  equal((await effects(browser)).syncWrites, [], "failed prearm never automatically retries")
  await browser.worker.evaluate(() => globalThis.localFilterFixture.localRemove("fixture-quota-padding"))
  await reset(browser)
  const recovered = await recordFlush(browser, "outbound-local-quota-removed-fresh-push", await flush(browser))
  equal(recovered.outcome.kind, "pushed", "after local quota is removed a fresh pass can push")
  equal(recovered.observed.syncWrites, [flushItems], "fresh pass after prearm failure sends current documents")
  equal(recovered.fullReadback, { ...flushLocal, sync: flushAck }, "native quota recovery repairs exact full raw history")
  await seedJoined(browser, flushLocal, flushRemote)
  const queuedQuota = { syntheticAcknowledgementRejection: true }
  await waitForPacing(browser)
  await browser.worker.evaluate(() => {
    const f = globalThis.localFilterFixture
    f.rejectNextAcknowledgement()
    f.holdNextSyncSet()
    globalThis.pendingFixtureFlush = f.flush()
  })
  await driverWait(browser, observed => observed.heldSet, "manual native set reaches held state")
  const queuedEdit = send(browser, { ...request, desired: { mode: "deny", on: true } })
  await browser.page.waitForTimeout(100)
  equal((await effects(browser)).reads, [null, null, null, null], "actual native queued edit waits behind prearmed unresolved flush")
  await browser.worker.evaluate(() => globalThis.localFilterFixture.releaseSyncSet())
  const queuedFailure = orderedOutcome(JSON.parse(await browser.worker.evaluate(async () => JSON.stringify(await globalThis.pendingFixtureFlush))))
  equal(queuedFailure.kind, "acknowledgement-failed", "actual queued edit follows synthetic acknowledgement rejection")
  equal(await queuedEdit, ok, "actual settings sender repairs represented debt with new edit")
  const combined = await recordFlush(browser, "outbound-synthetic-ack-failure-queued-edit-combined-repair", queuedFailure)
  const newDoc = combined.fullReadback[key]
  assert.notEqual(newDoc.gen, "g1")
  equal(newDoc.data, { ...flushG1.data, on: true }, "queued actual changed intent saved")

  const combinedPending = pendingHistory(combined.observed, flushHistory)
  const pendingAck = { ...flushAck, opaqueWrite: combinedPending.opaqueWrite }
  equal(combined.fullReadback.sync, pendingAck, "queued edit records old captured g1 and unresolved pending marker")
  equal(combined.observed.sets, [{ sync: combinedPending }, { sync: flushAck }, { [key]: newDoc, sync: pendingAck }], "actual queued replacement repairs in one combined local set")
  equal(combined.observed.syncWrites, [flushItems], "actual queued edit did not push its own new generation")
  combined.quota = queuedQuota
  outboundDurable = combined.fullReadback
  outboundRemoteDurable = combined.fullSyncSnapshot
} finally {
  await browser.context.close()
}
browser = await open()
try {
  equal(await read(browser), outboundDurable, "native clean full restart retains queued repair and pending new gen")
  equal(await syncRead(browser), outboundRemoteDurable, "native clean full restart retains exact remote batch")
  const restart = await recordFlush(browser, "outbound-clean-full-browser-restart-retains-pending-hold", await flush(browser))
  equal(restart.outcome.kind, "deferred", "restarted pending marker requires conservative recovery hold")
  assert(restart.outcome.notBefore >= (await browser.worker.evaluate(() => performance.now())) + 59000)
  result.nativeRecoveryRestart = { holdObserved: true, postDeadlineRecovery: "waived and unproven" }
  await browser.worker.evaluate(
    async text => {
      const f = globalThis.localFilterFixture
      await f.dispose()
      await f.seed(JSON.parse(text))
      await f.freshOwner()
      f.clearEffects()
    },
    JSON.stringify({ sync: { ...flushAck } })
  )
  const admittedRestart = await recordFlush(browser, "outbound-clean-owner-after-explicit-fixture-gate-reset", await flush(browser))
  equal(admittedRestart.outcome.kind, "pushed", "explicit fixture reset establishes separate no-hold control")
  equal(admittedRestart.observed.syncWrites, [{ [key.replace("doc:", "s:")]: outboundDurable[key] }], "restart sends only unrepresented new generation")
  equal(admittedRestart.fullReadback.sync, { ...flushAck, pushed: { ...flushAck.pushed, [key]: outboundDurable[key].gen } }, "restart acknowledges exact pending generation")
  await reset(browser)
  const repeated = await recordFlush(browser, "outbound-final-identical-repeat", await flush(browser))
  equal(repeated.outcome, { kind: "idle" }, "restarted repeat converges")
  equal(repeated.observed.syncWrites, [], "restarted repeat no resend")
  equal(repeated.observed.sets, [], "restarted repeat no local write")
} finally {
  await browser.context.close()
}

const driverSetup = { v: 1, gen: "S", at: 1, by: "synthetic-device", data: { autoAdd: [{ pl: "PL_P", takes: "videos" }] } }
const driverG0 = { v: 1, gen: "g0", at: 1, by: "synthetic-device", data: { mode: "deny", on: true, channels: [] }, future: { keep: 1 } }
const driverHistory = { joined: "H", pushed: { [key]: "g0", [setupKey]: "S" }, status: "ok", editedSinceOff: false, future: { keep: true } }
const driverLocal = { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 0 }, syncOn: true }, sync: driverHistory, [setupKey]: driverSetup, [key]: driverG0 }
const driverRemote = { "s:meta": { v: 1, id: "H", created: 0 }, [setupKey.replace("doc:", "s:")]: driverSetup, [syncBase]: driverG0 }
async function driverWait(browser, condition, message) {
  for (let i = 0; i < 600; i++) {
    const observed = await effects(browser)
    if (condition(observed)) return observed
    await browser.page.waitForTimeout(25)
  }
  throw Error("Native driver timeout: " + message)
}
async function startDriver(browser) {
  await browser.worker.evaluate(() => globalThis.localFilterFixture.start())
}
async function driverRecord(browser, stage) {
  const round = { stage, observed: await effects(browser), fullReadback: await meaningfulRead(browser), fullSyncSnapshot: await syncRead(browser) }
  result.rounds.push(round)
  await writeFile(join(evidence, "native-progress.json"), evidenceJson(result) + "\n")
  console.log(JSON.stringify({ stage, invocations: round.observed.nativeInvocations, pendingTimers: round.observed.pendingTimers }))
  return round
}
function assertDriverIdle(observed) {
  equal(observed.unhandledRejections, [], "no native unhandled Promise rejection")
  assert.equal(observed.pendingTimers, 0, "no pending driver timer at terminal idle")
  assert(
    observed.timers.every(timer => timer.milliseconds >= 0 && timer.milliseconds <= 25000),
    "only bounded one-shot timers"
  )
}
let driverDurable, driverRemoteDurable
browser = await open()
try {
  await seedJoined(browser, driverLocal, driverRemote)
  await startDriver(browser)
  await startDriver(browser)
  const createdAt = await browser.worker.evaluate(() => globalThis.localFilterFixture.createdAt())
  equal(await send(browser), ok, "driver first real settings edit")
  await browser.page.waitForTimeout(150)
  equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "driver second real settings edit")
  const burstLocal = await read(browser),
    g2 = burstLocal[key]
  await browser.page.waitForTimeout(150)
  equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "driver real no-op")
  await driverWait(browser, o => o.automaticResults.some(entry => entry.result.kind === "pushed") && o.pendingTimers === 0, "first burst")
  await settle(browser)
  const first = await driverRecord(browser, "driver-native-burst-coalesces-exact-generation")
  equal(first.observed.syncWrites, [{ [syncBase]: g2 }], "automatic burst has one complete native set")
  assert(first.observed.nativeInvocations[0] >= createdAt + 5000, "real initial barrier at native invocation")
  equal(first.fullReadback, { ...burstLocal, sync: { ...driverHistory, pushed: { ...driverHistory.pushed, [key]: g2.gen } } }, "automatic exact raw acknowledgement")
  equal(first.fullSyncSnapshot, { ...driverRemote, [syncBase]: g2 }, "automatic complete sync readback")
  assertDriverIdle(first.observed)
  equal(await send(browser), ok, "driver second burst settings edit")
  await browser.page.waitForTimeout(100)
  equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "driver second burst latest generation")
  const secondLocal = await read(browser),
    g4 = secondLocal[key]
  const deferred = await browser.worker.evaluate(() => globalThis.localFilterFixture.flush())
  assert.equal(deferred.kind, "deferred", "native manual shares debounce and spacing")
  assert(deferred.notBefore >= first.observed.nativeInvocations[0] + 5000)
  await waitForPacing(browser)
  const manual = await browser.worker.evaluate(() => globalThis.localFilterFixture.flush())
  assert(["pushed", "idle"].includes(manual.kind), "manual and automatic race converge")
  await driverWait(browser, o => o.syncWrites.length === 2 && o.pendingTimers === 0, "manual race")
  await settle(browser)
  const second = await driverRecord(browser, "driver-native-second-burst-manual-race-spacing")
  equal(second.observed.syncWrites, [{ [syncBase]: g2 }, { [syncBase]: g4 }], "manual race produces one second complete set")
  assert(second.observed.nativeInvocations[1] - second.observed.nativeInvocations[0] >= 5000, "actual native invocations at least five seconds apart")
  assertDriverIdle(second.observed)
  await browser.worker.evaluate(() => globalThis.localFilterFixture.holdNextSyncSet())
  equal(await send(browser), ok, "held-pass triggering real edit")
  await driverWait(browser, o => o.syncWrites.length === 3 && o.heldSet, "held native set begins")
  assert.equal(await browser.worker.evaluate(() => globalThis.localFilterFixture.isSetHeld()), true)
  const held = await read(browser),
    count = (await effects(browser)).reads.length
  const queued = send(browser, { ...request, desired: { mode: "deny", on: true } })
  await browser.page.waitForTimeout(150)
  assert.equal((await effects(browser)).reads.length, count, "real queued edit performs no reads while native set held")
  await browser.worker.evaluate(() => globalThis.localFilterFixture.releaseSyncSet())
  equal(await queued, ok, "real queued edit resolves after prior acknowledgement")
  const queuedLocal = await read(browser)
  equal(queuedLocal.sync.pushed[key], held[key].gen, "held set only acknowledges captured generation")
  assert.notEqual(queuedLocal[key].gen, held[key].gen)
  await driverWait(browser, o => o.syncWrites.length === 4 && o.pendingTimers === 0, "queued real edit follow-up")
  await settle(browser)
  const heldRound = await driverRecord(browser, "driver-native-held-set-and-queued-real-edit")
  equal(heldRound.observed.syncWrites.slice(2), [{ [syncBase]: held[key] }, { [syncBase]: queuedLocal[key] }], "held and queued generations each sent exactly once")
  const times = heldRound.observed.nativeInvocations
  assert(
    times.every((time, i) => i === 0 || time - times[i - 1] >= 5000),
    "all actual invocation spacing"
  )
  assertDriverIdle(heldRound.observed)
  await browser.worker.evaluate(base => globalThis.localFilterFixture.syncRemove(base), syncBase)
  await driverWait(browser, o => o.syncWrites.length === 5 && o.pendingTimers === 0, "vanished-base restoration")
  await settle(browser)
  const restoration = await driverRecord(browser, "driver-native-area-event-restores-vanished-base")
  equal(restoration.observed.syncWrites[4], { [syncBase]: queuedLocal[key] }, "restoration preserves exact generation")
  assertDriverIdle(restoration.observed)
  await browser.page.waitForTimeout(300)
  assert.equal((await effects(browser)).syncWrites.length, 5, "own native events do not resend")
  await browser.worker.evaluate(() => globalThis.localFilterFixture.dispose())
  equal(await send(browser, { ...request, desired: { mode: "deny", on: false } }), { fixtureError: "Error: Writer disposed" }, "disposed native owner refuses new edit")
  const before = await read(browser)
  driverDurable = { ...before, [key]: { ...before[key], gen: "restart-pending", at: 1234567, data: { ...before[key].data, on: false } } }
  await browser.worker.evaluate(text => globalThis.localFilterFixture.seed(JSON.parse(text)), JSON.stringify(driverDurable))
  driverRemoteDurable = await syncRead(browser)
} finally {
  await browser.context.close()
}
browser = await open()
try {
  equal(await read(browser), driverDurable, "clean full browser restart retains pending driver generation")
  equal(await syncRead(browser), driverRemoteDurable, "clean full browser restart retains native sync state")
  const createdAt = await browser.worker.evaluate(() => globalThis.localFilterFixture.createdAt())
  const createdBy = await browser.worker.evaluate(() => globalThis.localFilterFixture.createdBy())
  await startDriver(browser)
  const manual = await browser.worker.evaluate(() => globalThis.localFilterFixture.flush())
  assert.equal(manual.kind, "deferred", "clean restart first manual barrier")
  assert(manual.notBefore >= createdAt + 5000 && manual.notBefore <= createdBy + 5000, "restart boundary uses the core's actual construction time")
  await driverWait(browser, o => o.syncWrites.length === 1 && o.pendingTimers === 0, "restart automatic barrier")
  const restarted = await driverRecord(browser, "driver-native-clean-restart-first-set-barrier")
  assert(restarted.observed.nativeInvocations[0] >= createdAt + 5000)
  equal(restarted.observed.syncWrites, [{ [syncBase]: driverDurable[key] }], "restart reconstructs exact pending batch")
  assertDriverIdle(restarted.observed)
} finally {
  await browser.context.close()
}
for (const failure of ["sync-set", "acknowledgement"]) {
  browser = await open()
  try {
    await seedJoined(browser, flushLocal, flushRemote)
    const createdAt = await browser.worker.evaluate(() => globalThis.localFilterFixture.createdAt())
    let quota
    if (failure === "sync-set") await browser.worker.evaluate(() => globalThis.localFilterFixture.fillSyncBeforeNextSet())
    else {
      quota = { syntheticAcknowledgementRejection: true }
      await browser.worker.evaluate(() => globalThis.localFilterFixture.rejectNextAcknowledgement())
    }
    await startDriver(browser)
    const expected = failure === "sync-set" ? "sync-set-failed" : "acknowledgement-failed"
    await driverWait(browser, o => o.automaticResults.some(entry => entry.result.kind === expected), "observed " + failure + " result")
    const failed = await driverRecord(browser, "driver-" + (failure === "sync-set" ? "native-genuine-" : "synthetic-") + failure + "-held-or-stopped")
    const outcome = failed.observed.automaticResults.find(entry => entry.result.kind === expected).result
    assert.equal(outcome.error.name, "Error", "original native Error remains unclassified")
    assert.deepEqual(outcome.error.fields.sort(), ["message", "stack"])
    assert(failed.observed.nativeInvocations[0] >= createdAt + 5000)
    equal(failed.observed.syncWrites, [flushItems], "failing pass attempted complete native batch once")
    if (failure === "acknowledgement") {
      equal(outcome.source.kind, "set", "native sync acceptance precedes local failure")
      equal(failed.fullSyncSnapshot, { ...flushRemote, ...flushItems }, "native accepted batch remains for readback repair")
      failed.quota = quota
      await browser.worker.evaluate(() => globalThis.localFilterFixture.localRemove("fixture-quota-padding"))
    } else await browser.worker.evaluate(() => globalThis.localFilterFixture.syncRemove(Array.from({ length: 12 }, (_, i) => `fixture-sync-occupancy:${i}`)))
    await startDriver(browser)
    await browser.worker.evaluate(() => globalThis.localFilterFixture.syncSeed({ "fixture-independent-event": true }))
    const beforeEdit = await read(browser)
    equal(await send(browser, { ...request, desired: { mode: "deny", on: true } }), ok, "ordinary real edit remains available after automatic stop")
    await browser.page.waitForTimeout(5200)
    const stopped = await driverRecord(browser, "driver-native-" + failure + "-stop-survives-start-event-edit")
    equal(stopped.observed.syncWrites, [flushItems], "held or generic error never automatically retries early")
    assertDriverIdle(stopped.observed)
    const current = stopped.fullReadback[key]
    assert.notEqual(current.gen, beforeEdit[key].gen)
    if (failure === "acknowledgement") {
      await browser.worker.evaluate(async text => {
        const f = globalThis.localFilterFixture
        await f.seed(JSON.parse(text))
        await f.freshOwner()
        f.clearEffects()
        await f.start()
      }, JSON.stringify(flushLocal))
      await driverWait(browser, o => o.automaticResults.some(entry => entry.result.kind === "reconciled"), "fresh experimental owner repairs accepted generation")
      const repaired = await driverRecord(browser, "driver-native-fresh-owner-readback-repair-without-resend")
      equal(repaired.observed.syncWrites, [], "fresh owner repairs accepted native generations during barrier")
      equal(repaired.fullReadback.sync, flushAck, "fresh owner repairs full raw history")
      assertDriverIdle(repaired.observed)
    }
    await browser.worker.evaluate(() => globalThis.localFilterFixture.dispose())
  } finally {
    await browser.context.close()
  }
}

result.limits.push(
  "Clean restart proves resolved native persistence and desired-state retry convergence. It does not prove power-loss atomicity, uncertain in-flight set behavior, Firefox, or production integration."
)
await writeFile(join(evidence, "native-result.json"), evidenceJson(result) + "\n")
console.log(
  JSON.stringify(
    {
      extensionId,
      version: result.version,
      stages: result.rounds.map(round => round.stage),
      nativeIncognito: result.nativeIncognito,
      desiredStateRetryConverged: result.desiredStateRetryConverged,
      evidence
    },
    null,
    2
  )
)
