import { createLocalFilterWriter, createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { readFirstEditProvenance } from "../../../src/background/store/first-edit-provenance"
import { accountRemovalLocalName, pendingAccountRemovalKey, type AccountRemovalHost } from "../../../src/background/store/account-removal-execution"
import { isInterimSourceKey, isInterimCanonicalKey } from "../../../src/background/store/interim-persistence"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import type { ClaimHost } from "../../../src/background/store/local-claim-writer"
import type { LocalFilterChange } from "../../../src/background/store/local-filter-writer"

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function json(value: unknown): JsonObject {
  if (!object(value)) throw Error("Expected synthetic JSON object")
  return value
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
function literal(text: string): JsonObject {
  return json(JSON.parse(text))
}
const M0 = literal('{"joined":null,"pushed":{},"status":"off","editedSinceOff":true,"everEdited":true}')
const H0 = literal('{"joined":"H","pushed":{"doc:settings":"old"},"status":"off","editedSinceOff":false,"future":{"keep":[1,null]},"__proto__":{"keep":true},"toJSON":"inert"}')
const HR = literal(
  '{"joined":"H","pushed":{"doc:settings":"old","doc:setup:BBBBBBBBBBBBBBBB":"ack-old"},"status":"ok","editedSinceOff":false,"everEdited":false,"opaqueWrite":{"gate":{"kind":"held","notBefore":1060000,"futureGate":[null,false]},"diagnostic":{"name":"SyntheticFailure","message":"synthetic original diagnostic","futureDiagnostic":{"keep":true}},"futureOpaque":[1]},"future":{"keep":[1,null]},"__proto__":{"keep":true},"toJSON":"inert"}'
)
const HT = literal('{"joined":"H","pushed":{},"status":"off","editedSinceOff":true,"everEdited":true,"future":{"keep":[1,null]}}')
const HC = literal('{"joined":"H","pushed":{},"status":"off","editedSinceOff":true,"everEdited":false}')
const BASE = literal(
  '{"schema":1,"device":{"id":"fixture","consent":{"v":1,"at":1},"syncOn":false,"upgradeNote":null,"claimNotice":null,"newPlaylistVisibility":null,"pickerSortAZ":false,"detailedLog":false,"recentAdds":true,"legacyCleared":true,"extension":{"keep":true}},"doc:settings":{"v":1,"gen":"settings-old","at":1,"by":"fixture","data":{"theme":"system","extension":{"keep":true}},"extension":"retained"},"doc:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"setup-old","at":1,"by":"fixture","data":{"autoAdd":[{"pl":"PL_selected","takes":"both"}]},"extension":{"keep":true}}}'
)
const DARK = literal(
  '{"v":1,"gen":"edit-1","at":100,"by":"fixture","data":{"theme":"dark","undoKey":{"char":"u","code":"KeyU","ctrl":false,"alt":true,"shift":false,"meta":false},"autoAdd":{"on":false,"feedback":true,"pct":50,"toolbarTick":true,"toolbarPaused":true},"shortcuts":{"on":false,"feedback":true,"music":true,"preset":false,"picker":null,"list":[]},"quickSave":{"on":false,"feedback":true,"shortsShelves":false},"queueButton":{"on":false,"feedback":true},"watchButton":{"on":false,"feedback":true,"shorts":false},"cardMenu":{"on":false,"keepLinkMenu":false},"browserMenu":{"on":false,"feedback":true},"musicSection":true,"musicActions":{"on":false,"feedback":true,"preset":false,"buttons":{"next":true,"queue":true,"save":false,"like":false,"remove":false,"bar":false,"library":false,"mix":false,"album":false,"artist":false}},"musicKeys":{"on":false,"feedback":true,"preset":false,"keys":{"next":null,"queue":null,"save":null,"picker":null,"like":null,"remove":null,"library":null,"mix":null,"album":null,"artist":null}},"anyTabKeys":{"on":false,"feedback":true},"gather":{"on":false,"feedback":true,"to":"player","order":"newest","close":false,"auto":{"unvisited":false,"after":"1d","background":false,"count":false,"n":10}},"extension":{"keep":true}},"extension":"retained"}'
)
const REPAIRED = literal(
  '{"joined":"H","pushed":{"doc:settings":"old","doc:setup:BBBBBBBBBBBBBBBB":"ack-current"},"status":"ok","editedSinceOff":false,"everEdited":true,"opaqueWrite":{"gate":{"kind":"held","notBefore":1060000,"futureGate":[null,false]},"diagnostic":{"name":"SyntheticFailure","message":"synthetic original diagnostic","futureDiagnostic":{"keep":true}},"futureOpaque":[1]},"future":{"keep":[1,null]},"__proto__":{"keep":true},"toJSON":"inert"}'
)

function account(raw: string): AccountKey {
  if (!isAccountKey(raw)) throw Error("Invalid synthetic account")
  return raw
}
function playlistId(raw: string): PlaylistId {
  if (!isPlaylistId(raw)) throw Error("Invalid synthetic playlist")
  return raw
}
const acct = account("AAAAAAAAAAAAAAAA"),
  playlist = playlistId("PL_selected"),
  other = "BBBBBBBBBBBBBBBB"
const setup = `doc:setup:${acct}`,
  filter = `doc:filter:${acct}:${playlist}`,
  unrelated = `doc:setup:${other}`
const origin = { kind: "ui", windowId: 1, incognito: false } as const
const request: LocalFilterChange = { acct, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" }
type Mode = "exact" | "reject-before" | "reject-after" | "ignored" | "partial" | "divergent" | "read-failed"
type Operation = "settings" | "filter" | "claim" | "remove"

export async function runFirstEditOwnerFixture(api = { create: createLocalFilterWriter, starting: createStartingLocalFilterWriter }) {
  let assertions = 0
  const observations: unknown[] = []
  const stable = (value: unknown): string =>
    JSON.stringify(value, (_, item: unknown) =>
      item instanceof Error
        ? { name: item.name, message: item.message }
        : item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item
    )
  function check(value: unknown, label: string): asserts value {
    assertions++
    if (!value) throw Error(label)
  }
  function equal(actual: unknown, expected: unknown, label: string) {
    check(stable(actual) === stable(expected), label)
  }
  function deferred() {
    let resolve = () => {}
    const promise = new Promise<void>(done => {
      resolve = done
    })
    return { promise, resolve }
  }
  function seed(history: JsonValue | undefined, on = false, op: Operation = "settings") {
    const local = copy(BASE)
    json(local.device).syncOn = on
    if (history !== undefined) local.sync = copy(history)
    if (op === "claim") {
      delete local[setup]
      local.unclaimed = { from: "1.5.0", autoAdd: [playlist], shortcutPlaylist: null, filters: {}, at: 1 }
    }
    if (on) json(local["doc:settings"]).gen = "old"
    return local
  }
  function harness(initial: JsonObject, mode: Mode = "exact") {
    let local = copy(initial),
      session: JsonObject = { paused: true },
      remote: JsonObject = { "s:meta": { v: 1, id: "H", created: 1 }, unknown: { retained: true }, "s:filter:AAAAAAAAAAAAAAAA:PL_selected@old.0": "retained chunk" }
    if (json(local.device).syncOn === true) remote["s:settings"] = copy(local["doc:settings"]!)
    let generation = 0,
      stamps = 0,
      syncReads = 0,
      syncSets = 0,
      lookups = 0,
      subscriptions = 0,
      clockReads = 0,
      wallReads = 0,
      sets = 0,
      reads = 0,
      mono = 0
    const returned: JsonObject[] = []
    const batches: unknown[] = [],
      io: unknown[] = [],
      events: unknown[] = [],
      automatic: unknown[] = [],
      timers: { cancelled: boolean; run: () => void; ms: number }[] = []
    const error = { name: "SyntheticFailure", message: "original marker" }
    let readHook = async (_n: number) => {},
      setHook = async (_items: Readonly<Record<string, JsonValue>>) => {},
      removalHook = async (_name: string, _after: boolean) => {},
      callback: (() => void) | undefined
    const authority = { acct, lease: "synthetic-lease", browserSession: "synthetic-session", consentGeneration: "synthetic-consent", signedIn: true, incognito: false } as const
    const claim: ClaimHost = {
      kind: "fixture",
      authority: {
        async read() {
          return { kind: "ready", authority }
        }
      },
      session: {
        async takeLookup() {
          return true
        }
      },
      ownership: {
        async lookup(active) {
          lookups++
          return { kind: "fixture-owned", authority: active, lineage: "local-migration-only", ownedPlaylistIds: new Set([playlist]) }
        }
      }
    }
    const removal: AccountRemovalHost = {
      kind: "fixture",
      async removeLocal(keys) {
        for (const key of keys) {
          const name = accountRemovalLocalName(key, acct)
          io.push({ kind: "remove", name, before: copy(local) })
          await removalHook(name, false)
          delete local[name]
          await removalHook(name, true)
        }
      },
      session: {
        async get() {
          return copy(session)
        },
        async set(items) {
          batches.push({ area: "session", items: copy(items) })
          session = { ...session, ...copy(items) }
        },
        async remove(keys) {
          for (const key of keys) delete session[`${key.kind}:${key.acct}`]
        }
      }
    }
    const deps = {
      claim,
      removal,
      local: {
        async get(keys: readonly string[] | null) {
          io.push({ kind: "get", keys })
          await readHook(++reads)
          if (sets && mode === "read-failed") throw error
          const value = json(copy(keys === null ? local : Object.fromEntries(keys.filter(key => Object.hasOwn(local, key)).map(key => [key, local[key]]))))
          returned.push(value)
          return value
        },
        async set(items: Readonly<Record<string, JsonValue>>) {
          sets++
          batches.push({ area: "local", items: copy(items), before: copy(local) })
          await setHook(items)
          if (mode === "reject-before") throw error
          if (mode !== "ignored") {
            const entries = Object.entries(copy(items))
            for (const [key, value] of mode === "partial" ? entries.slice(0, 1) : entries) Object.defineProperty(local, key, { value, enumerable: true, writable: true, configurable: true })
          }
          if (mode === "divergent") local.unrelated = { changed: true }
          if (mode === "reject-after") throw error
        }
      },
      sync: {
        async get() {
          syncReads++
          if (json(local.device).syncOn !== true) throw Error("Off sync read")
          return copy(remote)
        },
        async set(items: Readonly<Record<string, JsonValue>>) {
          syncSets++
          remote = { ...remote, ...copy(items) }
        },
        subscribe(fn: () => void) {
          subscriptions++
          callback = fn
          return () => {
            subscriptions--
          }
        }
      },
      now() {
        stamps++
        return 100
      },
      generation() {
        return `edit-${++generation}`
      },
      syncClock: {
        now() {
          clockReads++
          return mono
        },
        wallNow() {
          wallReads++
          return 1000000 + mono
        },
        after(ms: number, run: () => void) {
          const timer = { ms, run, cancelled: false }
          timers.push(timer)
          return () => {
            timer.cancelled = true
          }
        }
      },
      onSyncResult(result: unknown) {
        automatic.push(result)
      }
    }
    const startup = {
      context: { deviceId: "fixture", settingsGen: "startup", at: 1, shortcutId: "orig01", platform: { browser: "chrome" as const, os: "linux" as const }, commands: [] },
      async readInterimSnapshot() {
        const saved = copy(local)
        return {
          source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
          canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
          checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
          historicalAuthorization: { kind: "unknown" as const },
          priorCredentialPresence: { kind: "unknown" as const }
        }
      },
      async readSnapshot() {
        return {
          schema: local.schema,
          device: copy(local.device),
          settingsDocument: copy(local["doc:settings"]),
          unclaimed: local.unclaimed,
          legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false },
          interimKeysPresent: []
        }
      },
      async removeLocal() {
        throw Error("Startup removal forbidden")
      },
      async deleteDatabase() {
        throw Error("Database forbidden")
      },
      async removeSession() {
        throw Error("Startup session removal forbidden")
      }
    }
    return {
      deps,
      startup,
      error,
      events,
      timers,
      automatic,
      io,
      batches,
      returned,
      state: () => copy({ local, session, remote }),
      raw: () => local,
      counts: () => ({ generation, stamps, syncReads, syncSets, lookups, subscriptions, clockReads, wallReads, sets, reads }),
      readHook(fn: typeof readHook) {
        readHook = fn
      },
      setHook(fn: typeof setHook) {
        setHook = fn
      },
      removalHook(fn: typeof removalHook) {
        removalHook = fn
      },
      foreign(fn: (records: JsonObject, sync: JsonObject) => void) {
        fn(local, remote)
      },
      time(n: number) {
        mono = n
      },
      callback() {
        callback?.()
      }
    }
  }
  async function action(writer: ReturnType<typeof api.create>, op: Operation) {
    if (op === "settings") return writer.changeSharedSetting(origin, { kind: "theme", value: "dark" })
    if (op === "filter") return writer.change(origin, request)
    if (op === "claim") return writer.claim()
    const prepared = await writer.prepareAccountRemoval(origin, acct)
    return prepared.kind === "confirmation-required" ? writer.removeAccountSetup(origin, prepared.confirmation) : prepared
  }
  function report(name: string, input: unknown, h: ReturnType<typeof harness>, result: unknown) {
    const state = h.state(),
      raw = json(state.local)
    observations.push({
      name,
      input: copy(input),
      requestedActions: { settings: { kind: "theme", value: "dark" }, filter: copy(request), claim: "claim", remove: { acct, confirmation: "actual-owner-object" } },
      result,
      state,
      provenance: readFirstEditProvenance(Object.hasOwn(raw, "sync") ? { kind: "present", raw: raw.sync } : { kind: "absent" }),
      batches: copy(h.batches),
      io: copy(h.io),
      counts: h.counts(),
      events: h.events,
      automatic: h.automatic,
      timers: h.timers.map(({ ms, cancelled }) => ({ ms, cancelled })),
      forbiddenEffects: []
    })
  }
  const offCases = [
    { id: "absent", raw: undefined, expected: M0 },
    { id: "old-false", raw: H0, expected: { ...H0, editedSinceOff: true, everEdited: true } },
    { id: "old-true", raw: { ...H0, editedSinceOff: true }, expected: { ...H0, editedSinceOff: true, everEdited: true } },
    { id: "false", raw: { ...H0, everEdited: false }, expected: { ...H0, editedSinceOff: true, everEdited: true } },
    { id: "true-off-false", raw: { ...H0, everEdited: true }, expected: { ...H0, editedSinceOff: true, everEdited: true } },
    { id: "already-true", raw: HT, expected: HT },
    { id: "held", raw: { ...HR, status: "off" }, expected: { ...HR, status: "off", editedSinceOff: true, everEdited: true } },
    {
      id: "pending",
      raw: { ...HR, status: "off", opaqueWrite: { ...json(HR.opaqueWrite), gate: { kind: "pending", notBefore: 1060000, futureGate: [null, false] } } },
      expected: { ...HR, status: "off", editedSinceOff: true, everEdited: true, opaqueWrite: { ...json(HR.opaqueWrite), gate: { kind: "pending", notBefore: 1060000, futureGate: [null, false] } } }
    }
  ]
  for (const op of ["settings", "filter", "claim", "remove"] as const) {
    for (const item of offCases) {
      const initial = seed(item.raw, false, op),
        h = harness(initial),
        writer = api.create(h.deps)
      const result = await action(writer, op)
      check(result.kind === (op === "filter" ? "result" : "committed"), "actual changed document commits")
      equal(h.raw().sync, item.expected, "actual edit persists complete true history")
      if (op === "settings") equal(h.raw()["doc:settings"], DARK, "complete deterministic Settings envelope")
      if (item.id === "already-true") check(!h.batches.some(batch => object(batch) && object(batch.items) && Object.hasOwn(batch.items, "sync")), "already correct edit omits history patch")
      if (op === "remove") {
        equal(h.counts().generation, 0, "local removal has zero document generations")
        check(!Object.hasOwn(h.raw(), pendingAccountRemovalKey), "removal retires after true provenance")
      }
      equal([h.counts().syncReads, h.counts().syncSets], [0, 0], "off edits never access sync")
      await writer.dispose()
      const serialized = JSON.stringify(h.state()),
        restarted = harness(json(JSON.parse(serialized).local)),
        fresh = api.starting({ ...restarted.deps, startup: restarted.startup })
      equal(await fresh.ready(), "ok", "edited state restarts ready")
      equal(restarted.raw().sync, item.expected, "restart preserves edit truth")
      equal(restarted.batches, [], "restart writes no provenance")
      await fresh.dispose()
      report(`${op}-${item.id}`, initial, h, result)
    }
    for (const raw of [null, HC, { ...H0, everEdited: "false" }, { ...H0, opaqueWrite: { gate: { kind: "future", notBefore: 1 }, diagnostic: null } }]) {
      const initial = seed(raw, false, op),
        h = harness(initial),
        writer = api.create(h.deps),
        result = await action(writer, op)
      check(result.kind === "unavailable" || result.kind === "invalid", "invalid history refuses before edit or removal acceptance")
      equal(h.batches, [], "invalid history has no writes")
      equal(h.state().local, initial, "invalid history unchanged")
      await writer.dispose()
      report(`${op}-invalid`, initial, h, result)
    }
  }
  for (const op of ["settings", "filter", "remove"] as const)
    for (const flag of ["old", false, true] as const)
      for (const off of [false, true]) {
        const history: JsonObject = { ...HR, editedSinceOff: off }
        if (flag === "old") delete history.everEdited
        else history.everEdited = flag
        if (flag === false && off) continue
        const initial = seed(history, true, op),
          h = harness(initial)
        h.foreign((local, remote) => {
          local[unrelated] = { v: 1, gen: "ack-current", at: 1, by: "fixture", data: { gather: "PL_other" } }
          remote[`s:setup:${other}`] = copy(local[unrelated]!)
        })
        const writer = api.create(h.deps),
          result = await action(writer, op)
        check(result.kind === (op === "filter" ? "result" : "committed"), "synced edit commits")
        equal(h.raw().sync, { ...REPAIRED, editedSinceOff: off }, "repairs compose before provenance without changing off bit")
        check(
          h.batches.some(batch => object(batch) && object(batch.items) && Object.hasOwn(batch.items, "sync") && Object.keys(batch.items).some(key => key.startsWith("doc:"))),
          "synced history shares document batch"
        )
        equal(h.counts().syncSets, 0, "edit does not transmit")
        await writer.dispose()
        report(`${op}-on-${flag}-${off}`, initial, h, result)
      }
  for (const op of ["settings", "filter"] as const)
    for (const raw of [undefined, H0, { ...H0, everEdited: false }, HT]) {
      const initial = seed(raw),
        h = harness(initial),
        writer = api.create(h.deps)
      const result =
        op === "settings" ? await writer.changeSharedSetting(origin, { kind: "theme", value: "system" }) : await writer.change(origin, { ...request, desired: { mode: "deny", on: false } })
      check(result.kind === (op === "settings" ? "unchanged" : "result"), "no-op accepted")
      equal(h.batches, [], "no-op writes no provenance or repair")
      equal(h.state().local, initial, "no-op preserves exact absence or raw history")
      equal(h.counts().generation, 0, "no-op has no generation")
      const invalid = await writer.changeSharedSetting(origin, { kind: "default-percentage", value: 101 })
      equal(invalid, { kind: "result", result: { refused: "invalid" } }, "invalid setting refused")
      await writer.dispose()
      report(`${op}-noop`, initial, h, result)
    }
  for (const kind of ["existing", "skipped-empty"] as const) {
    const initial = seed(H0, false, "claim")
    if (kind === "existing") initial[setup] = copy(BASE[setup]!)
    else initial.unclaimed = { from: "1.5.0", autoAdd: [], shortcutPlaylist: playlist, filters: {}, at: 1 }
    const h = harness(initial),
      writer = api.create(h.deps),
      result = await writer.claim()
    check(result.kind === "committed", "non-edit claim commits notice and consumption")
    equal(h.raw().sync, H0, "committed non-edit claim preserves provenance")
    equal(h.counts().generation, 0, "non-edit claim has no generation")
    const notice = await writer.readClaimNotice()
    check(notice.kind === "pending", "real saved claim notice")
    equal(await writer.acknowledgeClaimNotice(origin, notice.notice), { kind: "committed", write: { kind: "resolved" } }, "notice acknowledgement commits")
    equal(h.raw().sync, H0, "notice acknowledgement preserves provenance")
    await writer.dispose()
    report(`claim-${kind}`, initial, h, result)
  }
  for (const op of ["settings", "filter", "remove"] as const)
    for (const blocker of ["quota", "future", "incomplete", "conflict", "reset"]) {
      const initial = seed({ joined: "H", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false }, true, op),
        h = harness(initial)
      h.foreign((local, remote) => {
        const target = op === "settings" ? "s:settings" : op === "filter" ? `s:filter:${acct}:${playlist}` : `s:setup:${acct}`
        if (blocker === "quota") remote.unknown = "x".repeat(98304)
        if (blocker === "future") remote[target] = { v: 2, gen: "future", at: 1, by: "fixture", data: {} }
        if (blocker === "incomplete") remote[target] = null
        if (blocker === "conflict") remote["s:settings"] = { ...json(local["doc:settings"]), gen: "unacknowledged" }
        if (blocker === "reset") json(remote["s:meta"]).reset = true
      })
      const writer = api.create(h.deps),
        result = await action(writer, op)
      check(result.kind === "unavailable" || result.kind === "result", "sync admission refuses blocker")
      equal(h.batches, [], "refused admission writes neither documents history nor acceptance")
      equal(h.raw(), initial, "refused admission preserves full local state")
      await writer.dispose()
      report(`${op}-${blocker}`, initial, h, result)
    }
  for (const mode of ["reject-before", "reject-after", "ignored", "partial", "divergent", "read-failed"] as const) {
    const initial = seed(undefined),
      h = harness(initial, mode),
      writer = api.create(h.deps)
    let result: unknown, caught: unknown
    try {
      result = await writer.change(origin, request)
    } catch (error) {
      caught = error
      check(error === h.error, "Filter preserves original rejection identity")
      result = { rejectedOriginal: true, error }
    }
    if (mode.startsWith("reject")) check(caught === h.error, "attempted rejected Filter rejects")
    else equal(result, { kind: "unconfirmed", cause: mode === "read-failed" ? { kind: "read-failed", error: h.error } : { kind: "readback" } }, "uncertain Filter cannot report ok")
    const before = h.counts(),
      count = h.batches.length
    for (const blocked of await Promise.all([
      writer.read("settings"),
      writer.readClaimNotice(),
      writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }),
      writer.change(origin, request),
      writer.claim(),
      writer.prepareAccountRemoval(origin, acct),
      writer.removeAccountSetup(origin, { kind: "account-removal-confirmation" }),
      writer.receiveSyncDocument({ kind: "settings" }),
      writer.flushSync()
    ]))
      equal(blocked.kind, "unavailable", "uncertain Filter closes all owner ingress")
    await writer.startSync()
    writer.subscribe(event => h.events.push(event))
    h.callback()
    for (const timer of h.timers) timer.run()
    equal(h.batches.length, count, "uncertain Filter cannot mutate again")
    equal(h.counts(), before, "barrier blocks new reads clocks and subscriptions")
    await writer.dispose()
    report(`filter-${mode}`, initial, h, result)
  }
  for (const uncertain of [false, true]) {
    const h = harness(seed(undefined), uncertain ? "ignored" : "exact"),
      writer = api.create(h.deps),
      entered = deferred(),
      release = deferred()
    h.setHook(async () => {
      entered.resolve()
      await release.promise
    })
    const first = writer.change(origin, request)
    await entered.promise
    const requested: LocalFilterChange = { ...request, desired: { mode: "allow", on: false } },
      settings = { kind: "theme", value: "dark" } as const
    const queued = writer.change(origin, requested),
      queuedSetting = writer.changeSharedSetting(origin, settings),
      queuedRead = writer.read("settings")
    Object.defineProperty(requested.desired, "on", { value: true })
    Object.defineProperty(settings, "value", { value: "light" })
    release.resolve()
    const result = await first,
      second = await queued,
      setting = await queuedSetting,
      read = await queuedRead
    if (uncertain) {
      equal(result.kind, "unconfirmed", "ignored first edit is uncertain")
      for (const item of [second, setting, read]) equal(item.kind, "unavailable", "queued ingress sees barrier")
    } else {
      equal(second, { kind: "result", result: { ok: true } }, "queued distinct Filter commits")
      equal(json(json(h.raw()[filter]).data).on, false, "queued nested request captured before await")
      equal(json(json(h.raw()["doc:settings"]).data).theme, "dark", "queued setting captured before await")
      const batches = h.batches.filter(object).map(batch => json(batch.items))
      equal(batches.filter(batch => Object.hasOwn(batch, "sync")).length, 1, "second edit observes first true history without redundant patch")
    }
    await writer.dispose()
    report(`queued-${uncertain}`, {}, h, { result, second, setting, read })
  }
  for (const afterSet of [false, true]) {
    const h = harness(seed(undefined)),
      writer = api.create(h.deps),
      entered = deferred(),
      release = deferred()
    if (afterSet)
      h.setHook(async () => {
        entered.resolve()
        await release.promise
      })
    else
      h.readHook(async n => {
        if (n === 1) {
          entered.resolve()
          await release.promise
        }
      })
    const editing = writer.change(origin, request)
    await entered.promise
    const draining = writer.dispose()
    release.resolve()
    const result = await editing
    await draining
    equal(result, afterSet ? { kind: "unconfirmed", cause: { kind: "authority" } } : { kind: "unavailable", reason: "stale" }, "disposal truthfully reports write authority")
    equal(h.counts().sets, afterSet ? 1 : 0, "pre-set disposal writes nothing")
    report(`dispose-${afterSet}`, {}, h, result)
  }
  for (const on of [false, true])
    for (const boundary of ["before-delete", "after-delete", "before-history", "after-history", "before-retire", "after-retire"] as const) {
      if (on && (boundary === "before-delete" || boundary === "after-delete")) continue
      const initial = seed(on ? { joined: "H", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false } : undefined, on, "remove"),
        h = harness(initial)
      let interrupted = false
      const interrupt = () => {
        interrupted = true
        throw h.error
      }
      h.removalHook(async (name, after) => {
        if (
          !interrupted &&
          ((boundary === "before-delete" && name === setup && !after) ||
            (boundary === "after-delete" && name === setup && after) ||
            (boundary === "before-retire" && name === pendingAccountRemovalKey && !after) ||
            (boundary === "after-retire" && name === pendingAccountRemovalKey && after))
        )
          interrupt()
      })
      h.setHook(async items => {
        if (!interrupted && Object.hasOwn(items, "sync") && boundary === "before-history") {
          if (on)
            h.foreign(local => {
              for (const [name, value] of Object.entries(items)) if (name.startsWith("doc:")) local[name] = copy(value)
            })
          interrupt()
        }
      })
      if (boundary === "after-history")
        h.readHook(async () => {
          if (!interrupted && object(h.raw().sync) && json(h.raw().sync).everEdited === true && Object.hasOwn(h.raw(), pendingAccountRemovalKey)) interrupt()
        })
      const writer = api.create(h.deps),
        result = await action(writer, "remove")
      check(interrupted, "real removal reached selected interruption")
      const saved = h.state(),
        bytes = JSON.stringify(saved),
        pending = Object.hasOwn(h.raw(), pendingAccountRemovalKey)
      if (boundary === "before-delete") check(!Object.hasOwn(h.raw(), "sync"), "before first deletion provenance remains absent")
      if (boundary === "before-history" || boundary === "after-delete") {
        check(pending, "pending held before provenance")
        check(on ? json(h.raw().sync).everEdited === false : !Object.hasOwn(h.raw(), "sync"), "no premature provenance")
      }
      await writer.dispose()
      const reloaded = json(JSON.parse(bytes)),
        resumed = harness(json(reloaded.local))
      resumed.foreign((_local, remote) => {
        for (const key of Object.keys(remote)) delete remote[key]
        Object.assign(remote, json(reloaded.remote))
      })
      const fresh = api.starting({ ...resumed.deps, startup: resumed.startup })
      equal(await fresh.ready(), "ok", "pending removal completes before readiness")
      check(object(resumed.raw().sync) && json(resumed.raw().sync).everEdited === true, "resumed absent or fixed documents promote true before retirement")
      check(!Object.hasOwn(resumed.raw(), pendingAccountRemovalKey), "resumed removal retires only after provenance")
      if (on) equal(json(resumed.raw()[setup]).gen, json(json(saved.local)[setup]).gen, "restart reuses fixed tombstone generation")
      equal(resumed.counts().generation, 0, "restart allocates no generation")
      equal(resumed.counts().syncSets, 0, "pending removal transmits nothing")
      await fresh.dispose()
      observations.push({
        name: `restart-${on}-${boundary}`,
        input: initial,
        result,
        saved,
        bytes,
        pending,
        resumed: resumed.state(),
        mutations: h.batches,
        resumedBatches: resumed.batches,
        io: h.io,
        resumedIo: resumed.io,
        counts: resumed.counts()
      })
    }
  for (const adoption of ["settings", "setup", "filter"] as const) {
    const raw: JsonObject = { joined: "H", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false },
      initial = seed(raw, true),
      h = harness(initial)
    if (adoption === "filter") initial[filter] = { v: 1, gen: "old-filter", at: 1, by: "fixture", data: {} }
    h.foreign((local, remote) => {
      if (adoption === "filter") local[filter] = copy(initial[filter]!)
      const name = adoption === "settings" ? "doc:settings" : adoption === "setup" ? setup : filter
      json(local.sync).pushed = { [name]: json(local[name]).gen! }
      remote[`s:${name.slice(4)}`] = { ...json(local[name]), gen: "incoming", at: 200 }
    })
    const writer = api.create(h.deps),
      result = await writer.receiveSyncDocument(adoption === "settings" ? { kind: "settings" } : adoption === "setup" ? { kind: "setup", acct } : { kind: "filter", acct, playlist })
    equal(result.kind, "adopted", "incoming document adopted")
    equal(json(h.raw().sync).everEdited, false, "incoming adoption preserves literal false provenance")
    h.time(10000)
    await writer.flushSync()
    equal(json(h.raw().sync).everEdited, false, "flush acknowledgement preserves literal false provenance")
    await writer.dispose()
    report(`adopt-${adoption}`, initial, h, result)
  }
  for (const op of ["settings", "filter", "remove"] as const) {
    const raw = { joined: "H", pushed: { "doc:settings": "old" }, status: "ok", editedSinceOff: false, everEdited: true },
      initial = seed(raw, true, op),
      h = harness(initial),
      writer = api.create(h.deps)
    const result = await action(writer, op)
    check(result.kind === (op === "filter" ? "result" : "committed"), "already true synced edit commits")
    equal(h.raw().sync, raw, "no repairs and true provenance preserve exact history")
    check(!h.batches.some(batch => object(batch) && object(batch.items) && Object.hasOwn(batch.items, "sync")), "no redundant synced history set")
    await writer.dispose()
    report(`${op}-true-no-repair`, initial, h, result)
  }
  for (const alias of [false, true]) {
    const initial = seed(H0),
      h = harness(initial),
      writer = api.create(h.deps)
    h.readHook(async n => {
      if (n !== 4) return
      if (alias) json(json(h.returned[2]!.sync).future).keep = [999]
      else
        h.foreign(local => {
          local.concurrent = { changed: true }
        })
    })
    const result = await writer.change(origin, request)
    if (alias) {
      equal(result, { kind: "result", result: { ok: true } }, "returned-object mutation cannot change detached baseline")
      equal(h.raw().sync, { ...H0, editedSinceOff: true, everEdited: true }, "persisted patch does not alias port-returned history")
    } else {
      equal(result, { kind: "unavailable", reason: "stale" }, "full preflight refuses concurrent inventory change")
      equal(h.batches, [], "stale full baseline writes nothing")
    }
    await writer.dispose()
    report(`baseline-${alias}`, initial, h, result)
  }
  {
    const initial = seed({ joined: "H", pushed: { "doc:settings": "old" }, status: "ok", editedSinceOff: false }, true),
      h = harness(initial, "ignored"),
      writer = api.create(h.deps)
    await writer.startSync()
    check(h.counts().subscriptions === 1 && h.timers.length > 0, "real active driver has subscription and ticket")
    equal(await writer.change(origin, request), { kind: "unconfirmed", cause: { kind: "readback" } }, "active ignored Filter is unconfirmed")
    equal(h.counts().subscriptions, 0, "uncertainty deactivates subscription")
    check(
      h.timers.every(timer => timer.cancelled),
      "uncertainty cancels driver tickets"
    )
    const before = h.counts()
    h.callback()
    for (const timer of h.timers) timer.run()
    await writer.startSync()
    await writer.flushSync()
    equal(h.counts(), before, "stale timer and subscription callbacks cannot cross global barrier")
    await writer.dispose()
    report("active-filter-barrier", initial, h, { kind: "unconfirmed" })
  }
  {
    const initial = seed(undefined),
      h = harness(initial),
      writer = api.create(h.deps)
    equal(await writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "committed" }, "real Settings edit commits")
    equal(await writer.changeSharedSetting(origin, { kind: "theme", value: "system" }), { kind: "committed" }, "edit back to defaults commits")
    equal(h.raw().sync, M0, "edit back to defaults retains true provenance")
    await writer.dispose()
    report("back-to-defaults", initial, h, { kind: "committed" })
  }
  return {
    fixture: "synthetic-Store-capability",
    production: "not-connected",
    positiveInitialization: "pending",
    falseHistories: "literal proven-state test inputs only",
    assertions,
    cases: observations.length,
    observations
  }
}

if (import.meta.main) console.log(JSON.stringify(await runFirstEditOwnerFixture()))
