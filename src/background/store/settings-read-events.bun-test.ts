import { expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError, type SettingsRead } from "./local-filter-writer"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import type { JsonValue } from "../../shared/contracts/json"
import { isInterimSourceKey, isInterimCanonicalKey, type StoreStartupHost } from "./interim-persistence"

export async function settingsAcceptance(api: { create: typeof createLocalFilterWriter; starting: typeof createStartingLocalFilterWriter; Error: typeof StartupReadinessError }, acct: AccountKey, playlist: PlaylistId) {
  let checks = 0
  const observations: unknown[] = []
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function equal(actual: unknown, expected: unknown, label: string) { checks++; function same(a: unknown, b: unknown): boolean {
      if (Object.is(a, b)) return true
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
      const keys = Reflect.ownKeys(a)
      return keys.length === Reflect.ownKeys(b).length && keys.every(key => Object.hasOwn(b, key) && same(Object.getOwnPropertyDescriptor(a, key)?.value, Object.getOwnPropertyDescriptor(b, key)?.value))
    }
    if (!same(actual, expected)) throw Error(label) }
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function gate() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  async function turns() { for (let i = 0; i < 40; i++) await Promise.resolve() }
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const stamp = { v: 1, gen: "g0", at: 1, by: "fixture", envelopeFuture: { keep: [1] } }
  const device = { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: null,
    claimNotice: { acct, dropped: 0, extension: "saved-notice" }, newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true, future: [0] }
  const seed = (on = false) => ({ schema: 1, device: { ...device, syncOn: on }, unclaimed: null,
    "doc:settings": { ...stamp, data: { future: { nested: [0, { keep: true }] }, shortcuts: { list: [{ id: "orig01", key: null, label: "  Renamed  ", watchLaterOnEveryAccount: true }] } } },
    [`doc:setup:${acct}`]: { ...stamp, data: { autoAdd: [{ pl: playlist }] } },
    sync: { joined: "history", pushed: { "doc:settings": "g0", [`doc:setup:${acct}`]: "g0" }, status: on ? "ok" : "off", editedSinceOff: false, extension: { keep: [1] } } })
  function harness(initial: Record<string, unknown> = seed()) {
    let records = copy(initial), remote: Record<string, unknown> = { "s:meta": { v: 1, id: "history", created: 0 } }
    if (Object.hasOwn(records, "doc:settings")) remote["s:settings"] = copy(records["doc:settings"])
    if (Object.hasOwn(records, `doc:setup:${acct}`)) remote[`s:setup:${acct}`] = copy(records[`doc:setup:${acct}`])
    const effects: unknown[] = [], batches: unknown[] = [], events: unknown[] = [], auto: unknown[] = []
    const listeners = new Set<() => void>(), timers: { due: number; run: () => void; canceled: boolean }[] = []
    let mono = 0, wall = 1000000, generations = 0, sets = 0, syncSets = 0, reads = 0
    let beforeRead: (() => Promise<void>) | undefined, afterRead: (() => Promise<void>) | undefined, beforeSet: (() => Promise<void>) | undefined
    let snapshotWait: (() => Promise<void>) | undefined, snapshotError: unknown
    let setMode: "ok" | "reject" | "partial" | "committed-reject" = "ok", readFailure = false, authorityChange = false, rejectSync = false
    let syncReadHook: (() => void) | undefined
    const original = { name: "SyntheticOpaque", message: "original" }
    const selected = (keys: readonly string[] | null) => copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
    const startup: StoreStartupHost = {
      context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
      async readInterimSnapshot() {
        effects.push("interim-snapshot"); if (snapshotWait) await snapshotWait(); if (snapshotError) throw snapshotError
        const saved = copy(records)
        return { source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
          canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
          checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
          historicalAuthorization: { kind: "unknown" as const }, priorCredentialPresence: { kind: "unknown" as const } }
      },
      async readSnapshot() {
        effects.push("startup-snapshot"); if (snapshotWait) await snapshotWait(); if (snapshotError) throw snapshotError
        return { schema: records.schema, device: records.device, settingsDocument: records["doc:settings"], unclaimed: records.unclaimed,
          legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: Object.hasOwn(records, "sessionConsent") ? ["sessionConsent"] : [] }
      }, async removeLocal() { throw Error("unexpected removal") }, async deleteDatabase() { throw Error("unexpected database") }, async removeSession() { throw Error("unexpected session") }
    }
    const deps = { startup,
      local: { async get(keys: readonly string[] | null) {
        reads++; effects.push({ get: keys }); if (beforeRead) await beforeRead()
        if (readFailure && sets) throw original
        const value = selected(keys); if (afterRead) await afterRead(); return value
      }, async set(items: Readonly<Record<string, JsonValue>>) {
        sets++; effects.push({ set: copy(items) }); batches.push(copy(items)); if (beforeSet) await beforeSet()
        if (setMode === "reject") throw original
        if (setMode !== "partial") records = { ...records, ...copy(items) }
        if (authorityChange) records.device = { ...device, consent: null }
        if (setMode === "committed-reject") throw original
      } },
      claim: { kind: "unavailable" as const },
      sync: { async get() { effects.push("sync-get"); syncReadHook?.(); return copy(remote) },
        async set(items: Readonly<Record<string, JsonValue>>) { syncSets++; effects.push({ syncSet: copy(items) }); if (rejectSync) throw original; remote = { ...remote, ...copy(items) } },
        subscribe(fn: () => void) { effects.push("sync-subscribe"); listeners.add(fn); return () => { effects.push("sync-unsubscribe"); listeners.delete(fn) } } },
      syncClock: { now: () => mono, wallNow: () => wall, after(ms: number, run: () => void) { const entry = { due: mono + ms, run, canceled: false }; timers.push(entry); effects.push({ timer: ms }); return () => { entry.canceled = true } } },
      onSyncResult(result: unknown) { auto.push(copy(result)) }, now() { effects.push("now"); return 100 }, generation() { effects.push("generation"); return `g${++generations}` }
    }
    return { deps, effects, batches, events, auto, original, timers, stats: () => ({ sets, syncSets, reads, generations, listeners: listeners.size }),
      records: () => copy(records), remote: () => copy(remote), setRemote(value: typeof remote) { remote = copy(value) }, time(m: number, w = 1000000 + m) { mono = m; wall = w },
      readBefore(fn: typeof beforeRead) { beforeRead = fn }, readAfter(fn: typeof afterRead) { afterRead = fn }, setBefore(fn: typeof beforeSet) { beforeSet = fn },
      snapshot(fn: typeof snapshotWait) { snapshotWait = fn }, failStartup(error: unknown) { snapshotError = error }, setMode(value: typeof setMode) { setMode = value }, failRead() { readFailure = true }, changeAuthority() { authorityChange = true }, failSync(value: boolean) { rejectSync = value },
      syncRead(fn: typeof syncReadHook) { syncReadHook = fn }, fire() { for (const fn of [...listeners]) fn() },
      async runDue() { for (const timer of timers) if (!timer.canceled && timer.due <= mono) { timer.canceled = true; timer.run() }; await turns() } }
  }
  function viewValues(view: SettingsRead) { check(view.kind === "value", "Settings value available"); return [view.settings.theme, view.settings.autoAdd.pct] }
  {
    const h = harness(), owner = api.starting(h.deps), hold = gate(); h.snapshot(() => hold.promise)
    owner.subscribe(event => h.events.push(event)); await turns()
    const before = copy(h.effects)
    equal(await owner.read("settings"), { kind: "unavailable", reason: "startup" }, "pending startup read inert")
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "pending startup write inert")
    equal(h.effects, before, "pre-ready Settings calls create no effects")
    hold.resolve(); equal(await owner.ready(), "ok", "real startup release")
    const raw = h.records(), beforeRead = h.stats(), first = await owner.read("settings")
    equal(viewValues(first), ["system", 50], "partial settings read defaults in memory")
    equal(h.stats(), { ...beforeRead, reads: beforeRead.reads + 1 }, "read is exactly one local load")
    equal(h.effects.at(-1), { get: null }, "read validates the complete retained authority inventory")
    equal(h.records(), raw, "read does not materialize omissions")
    if (first.kind !== "value") throw Error("value")
    Object.getOwnPropertyDescriptor(first.settings, "future")?.value.nested.push("changed")
    Object.defineProperty(first.settings.autoAdd, "pct", { value: 99, enumerable: true })
    equal(viewValues(await owner.read("settings")), ["system", 50], "owner snapshots detached")
    const beforeNoop = h.stats()
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "system" }), { kind: "unchanged" }, "literal no-op")
    equal(h.stats(), { ...beforeNoop, reads: beforeNoop.reads + 1 }, "no-op avoids generation and writes")
    equal(h.records(), raw, "no-op retains labels omissions envelope and history")
    const stop = owner.subscribe(() => { throw Error("observer throw") })
    owner.subscribe(async () => { throw Error("observer reject") })
    equal(await owner.changeSharedSetting({ ...origin, incognito: true }, { kind: "theme", value: "dark" }), { kind: "committed" }, "private shared settings allowed despite observer failures")
    equal(h.events, [{ kind: "settings-changed", source: "local" }], "one confirmed local event")
    equal(viewValues(await owner.read("settings")), ["dark", 50], "event read sees committed state")
    equal(h.records().device, raw.device, "Settings edit preserves exact saved notice and Device")
    equal(h.records().unclaimed, null, "Settings edit preserves consumed null")
    equal(await owner.changeSharedSetting({ ...origin, incognito: true }, { kind: "default-percentage", value: 100 }), { kind: "committed" }, "private percentage hundred admitted")
    equal(viewValues(await owner.read("settings")), ["dark", 100], "private hundred visible by read")
    equal(await owner.changeSharedSetting({ ...origin, incognito: true }, { kind: "default-percentage", value: 0 }), { kind: "committed" }, "private percentage zero admitted")
    equal(viewValues(await owner.read("settings")), ["dark", 0], "private zero visible by read")
    stop(); stop(); await owner.dispose(); observations.push({ label: "read-private-local", ...h.stats(), records: h.records(), events: h.events, effects: h.effects })
  }
  for (const mode of ["partial", "reject", "committed-reject", "read-fail", "authority"] as const) {
    const h = harness(), owner = api.starting(h.deps); await owner.ready(); owner.subscribe(event => h.events.push(event))
    if (mode === "read-fail") h.failRead(); else if (mode === "authority") h.changeAuthority(); else h.setMode(mode)
    const result = await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" })
    check(result.kind === "failed" || result.kind === "unconfirmed", "failed or uncertain local edit is truthful")
    if (result.kind === "failed") check(result.error === h.original, "owner retains exact failure")
    equal(h.events, [], "failed and unconfirmed writes emit nothing")
    const before = h.stats()
    equal(await owner.read("settings"), { kind: "unavailable", reason: "stale" }, "uncertainty closes reads")
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "light" }), { kind: "unavailable", reason: "stale" }, "uncertainty closes writes")
    equal(await owner.claim(), { kind: "unavailable", reason: "stale" }, "uncertainty closes claim")
    equal(await owner.flushSync(), { kind: "unavailable" }, "uncertainty closes sync")
    equal(h.stats(), before, "closed owner performs zero effects")
    await owner.dispose(); observations.push({ label: mode, result, records: h.records(), effects: h.effects })
  }
  {
    const h = harness(), owner = api.starting(h.deps); await owner.ready(); const hold = gate(), entered = gate()
    h.setBefore(async () => { entered.resolve(); await hold.promise }); owner.subscribe(event => h.events.push(event))
    const writing = owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }); await entered.promise
    const before = h.stats(), reading = owner.read("settings"); await turns()
    equal(h.events, [], "held set cannot emit early"); equal(h.stats(), before, "read shares held edit lane")
    hold.resolve(); equal(await writing, { kind: "committed" }, "held edit confirmed"); equal(viewValues(await reading), ["dark", 50], "same-lane read follows commit")
    equal(h.events.length, 1, "held edit emits once after confirmation"); await owner.dispose()
    observations.push({ label: "held-write", effects: h.effects, events: h.events })
  }
  {
    const h = harness(), owner = api.starting(h.deps); await owner.ready(); const hold = gate(), entered = gate()
    h.readBefore(async () => { if (h.stats().sets) { entered.resolve(); await hold.promise } }); owner.subscribe(event => h.events.push(event))
    const writing = owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }); await entered.promise; await turns()
    equal(h.events, [], "held readback cannot emit early")
    hold.resolve(); equal(await writing, { kind: "committed" }, "readback completes commit"); equal(h.events.length, 1, "readback event once"); await owner.dispose()
  }
  for (const stage of ["startup", "read", "write"] as const) {
    const h = harness(), hold = gate(), entered = gate()
    if (stage === "startup") h.snapshot(async () => { entered.resolve(); await hold.promise })
    const owner = api.starting(h.deps); owner.subscribe(event => h.events.push(event))
    let pending: Promise<unknown> = owner.ready()
    if (stage !== "startup") {
      await owner.ready()
      if (stage === "read") { h.readAfter(async () => { entered.resolve(); await hold.promise }); pending = owner.read("settings") }
      else { h.setBefore(async () => { entered.resolve(); await hold.promise }); pending = owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }) }
    }
    await entered.promise; let drained = false; const disposing = owner.dispose().then(() => { drained = true }); await turns()
    equal(drained, false, "dispose drains accepted IO")
    equal(await owner.read("settings"), { kind: "unavailable", reason: "disposed" }, "disposed reads closed immediately")
    hold.resolve()
    if (stage === "startup") { let rejected = false; try { await pending } catch (error) { rejected = error instanceof api.Error }; check(rejected, "disposed startup never releases") }
    else if (stage === "read") equal(await pending, { kind: "unavailable", reason: "disposed" }, "pending read invalidated on dispose")
    else check((await pending as { kind: string }).kind === "unconfirmed", "disposed write cannot announce confirmation")
    await disposing; equal(h.events, [], "dispose clears pending notifications")
  }
  {
    const h = harness({ ...seed(), sessionConsent: true }), owner = api.create(h.deps)
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "startup" }, "preinitialized Settings writer never converts interim inventory")
    equal(h.stats().sets, 0, "interim inventory receives no canonical write")
    await owner.dispose()
  }
  for (const kind of ["fresh", "preconsent", "newer", "failed", "interim"] as const) {
    const initial: Record<string, unknown> = kind === "fresh" ? { schema: 1 } : kind === "newer" ? { schema: 2 } : kind === "interim" ? { schema: 1, sessionConsent: true } : { ...seed(), device: { ...device, consent: null } }
    const h = harness(initial); if (kind === "failed") h.failStartup(h.original)
    const owner = api.starting(h.deps)
    if (kind === "failed" || kind === "interim") { try { await owner.ready(); throw Error("failed startup released") } catch (error) { check(kind === "failed" ? error === h.original : error instanceof api.Error, "startup failure stays latched") } }
    else await owner.ready()
    const before = h.stats(), view = await owner.read("settings")
    if (kind === "fresh" || kind === "preconsent") equal(viewValues(view), ["system", 50], "preconsent local reads allowed")
    else { equal(view, { kind: "unavailable", reason: kind === "newer" ? "newer-layout" : "startup" }, "failed and newer readiness never admits schema shortcut"); equal(h.stats(), before, "closed read performs no IO") }
    check((await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" })).kind === "unavailable", "preconsent or unavailable writes refused")
    equal(h.stats().syncSets, 0, "readiness and consent create no sync work"); await owner.dispose()
  }
  {
    const initial = seed(true); initial.sync.pushed = { [`doc:setup:${acct}`]: "g0" } as typeof initial.sync.pushed
    const h = harness(initial), owner = api.create(h.deps); owner.subscribe(event => h.events.push(event))
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "system" }), { kind: "unchanged" }, "sync no-op is literal")
    equal(h.records(), initial, "no-op does not repair pushed")
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "committed" }, "new generation edit with old-generation repair")
    equal((h.records().sync as { pushed: unknown }).pushed, { [`doc:setup:${acct}`]: "g0", "doc:settings": "g0" }, "repair acknowledges only exact old generation")
    equal(Object.keys(h.batches[0] as object), ["doc:settings", "sync"], "repair and edit one confirmed local batch")
    h.time(5000); check((await owner.flushSync()).kind === "pushed", "existing flush pushes pending Settings")
    equal((h.records().sync as { pushed: unknown }).pushed, { [`doc:setup:${acct}`]: "g0", "doc:settings": "g1" }, "flush acknowledges exact sent generation")
    equal(h.events.length, 1, "bookkeeping-only pushes emit no Settings event"); await owner.dispose(); observations.push({ label: "repair-and-flush", records: h.records(), effects: h.effects, events: h.events })
  }
  for (const kind of ["adopted", "equal", "conflict", "partial", "deleted", "newer", "pending", "postflight", "failure"] as const) {
    const initial = seed(true)
    if (kind === "pending") initial.sync.pushed["doc:settings"] = "older"
    const h = harness(initial), owner = api.create(h.deps); owner.subscribe(event => h.events.push(event))
    const incoming = { ...stamp, gen: kind === "conflict" ? "g0" : "remote", at: 2, data: { theme: "light", autoAdd: { pct: 100 }, future: { remote: [null, { keep: true }] } }, envelopeFuture: { keep: [2] } }
    h.setRemote({ ...h.remote(), "s:settings": kind === "equal" ? initial["doc:settings"] : kind === "partial" ? { v: 1, gen: "remote", at: 2, by: "fixture", n: 2 } : kind === "deleted" ? { ...stamp, gen: "remote", at: 2, deleted: true } : kind === "newer" ? { ...incoming, v: 2 } : incoming })
    if (kind === "failure") h.setMode("reject")
    if (kind === "postflight") h.syncRead(() => { if (h.stats().sets) h.setRemote({ ...h.remote(), "s:meta": { v: 1, id: "different", created: 0 } }) })
    const result = await owner.receiveSyncDocument({ kind: "settings" })
    if (kind === "adopted") {
      check(result.kind === "adopted", "incoming adopted after complete checks")
      equal(h.events, [{ kind: "settings-changed", source: "sync" }], "confirmed adopted event")
      equal(h.records()["doc:settings"], incoming, "incoming raw envelope and partial data preserved")
      equal(viewValues(await owner.read("settings")), ["light", 100], "adoption invalidates reader")
      equal(await owner.receiveSyncDocument({ kind: "settings" }), { kind: "idle" }, "repeat adoption idle")
      equal(h.events.length, 1, "idle adoption emits nothing")
    } else { check(result.kind !== "adopted", "incomplete conflicting or unconfirmed receive not adopted"); equal(h.events, [], "receive failures and refusals emit no event") }
    await owner.dispose(); observations.push({ label: `incoming-${kind}`, result, records: h.records(), effects: h.effects, events: h.events })
  }
  {
    const initial = seed(true), h = harness(initial), owner = api.create(h.deps)
    h.failSync(true); h.time(5000)
    // A real edit establishes a pending generation before the opaque failure.
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "committed" }, "Settings edit before R155 failure")
    const failed = await owner.flushSync(); check(failed.kind === "deferred", "quiet deadline still applies")
    h.time(7000); const rejected = await owner.flushSync(); check(rejected.kind === "sync-set-failed" && rejected.error === h.original, "opaque failure retains identical error")
    const durable = h.records(); await owner.dispose()
    const restart = harness(durable); restart.setRemote(h.remote()); const second = api.starting(restart.deps); restart.time(100000, 1100000); await second.ready(); await second.startSync()
    const held = restart.stats(), unsubscribe = second.subscribe(() => { void second.read("settings") })
    restart.time(160000, 1160000)
    await second.read("settings"); equal(await second.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unchanged" }, "no-op during recovery cannot wake retry")
    unsubscribe(); unsubscribe(); await restart.runDue()
    equal(restart.stats().syncSets, held.syncSets, "reads subscriptions and no-op grant no R155 retry")
    equal(restart.timers.filter(timer => !timer.canceled).length, 0, "recovery creates no retry timer")
    check((await second.flushSync()).kind === "pushed", "later eligible external event pushes current generation once")
    equal(restart.stats().syncSets, held.syncSets + 1, "one recovery attempt")
    const saved = restart.records().sync
    check(saved && typeof saved === "object" && "opaqueWrite" in saved, "diagnostic remains local")
    equal((saved.opaqueWrite as { gate: unknown }).gate, null, "successful exact acknowledgement clears only gate")
    await second.dispose(); observations.push({ label: "R155-read-noop-restart", durable, records: restart.records(), effects: restart.effects })
  }
  for (const uncertain of [false, true]) {
    const initial = { ...seed(), device: { ...device, claimNotice: null }, unclaimed: { from: "1.5.0", autoAdd: [playlist], shortcutPlaylist: null, originalShortcutId: "orig01", filters: {}, at: 1 } }
    const h = harness(initial), entered = gate(), held = gate()
    const authority = { acct, lease: "lease", browserSession: "session", consentGeneration: "consent", signedIn: true, incognito: false } as const
    const owner = api.starting({ ...h.deps, claim: { kind: "fixture", authority: { async read() { return { kind: "ready", authority } } }, session: { async takeLookup() { return true } },
      ownership: { async lookup() { entered.resolve(); await held.promise; return { kind: "fixture-owned", authority, lineage: "local-migration-only", ownedPlaylistIds: new Set([playlist]) } } } } })
    await owner.ready(); if (uncertain) h.setMode("partial")
    const claim = owner.claim(); await entered.promise
    const before = h.stats(), edit = owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), read = owner.read("settings")
    await turns(); equal(h.stats(), before, "Settings edit and read cannot enter held claim lane")
    held.resolve(); const claimed = await claim, notice = h.records().device
    if (uncertain) {
      check(claimed.kind === "unconfirmed", "partial claim establishes global uncertainty")
      equal(await edit, { kind: "unavailable", reason: "stale" }, "queued Settings edit cannot cross claim uncertainty")
      equal(await read, { kind: "unavailable", reason: "stale" }, "queued Settings read cannot cross claim uncertainty")
    } else {
      check(claimed.kind === "committed", "claim commits before queued Settings edit")
      equal(await edit, { kind: "committed" }, "same owner executes queued Settings edit")
      equal(viewValues(await read), ["dark", 50], "queued read follows both transactions")
      equal(h.records().device, notice, "queued Settings edit preserves claim notice byte for byte")
      equal(h.records().unclaimed, null, "queued Settings edit preserves consumed null")
    }
    await owner.dispose(); observations.push({ label: `claim-Settings-${uncertain}`, claimed, records: h.records(), effects: h.effects })
  }
  {
    const h = harness(), owner = api.create(h.deps), held = gate()
    const observer = () => { h.events.push("active") }
    const stop = owner.subscribe(observer); owner.subscribe(observer); stop(); stop()
    owner.subscribe(() => held.promise)
    equal(await owner.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "committed" }, "pending observer promise cannot block committed edit")
    equal(h.events, ["active"], "duplicate subscriptions have independent idempotent lifetimes")
    held.resolve(); await owner.dispose()
  }
  {
    const initial = seed(true), h = harness(initial), old = gate(), entered = gate()
    const incoming = { ...stamp, gen: "remote", at: 2, data: { theme: "light" } }
    h.setRemote({ ...h.remote(), "s:settings": incoming })
    let gets = 0
    const owner = api.create({ ...h.deps, sync: { ...h.deps.sync, async get() { const result = await h.deps.sync.get(); if (++gets === 3) { entered.resolve(); await old.promise }; return result } } })
    owner.subscribe(event => h.events.push(event))
    const adopting = owner.receiveSyncDocument({ kind: "settings" }); await entered.promise
    equal(h.events, [], "held remote postflight emits no early adoption event")
    old.resolve(); check((await adopting).kind === "adopted", "complete remote postflight confirms adoption")
    equal(h.events, [{ kind: "settings-changed", source: "sync" }], "postflight emits one adopted event")
    await owner.dispose()
  }
  {
    const initial = seed(true)
    initial.sync = { ...initial.sync, opaqueWrite: { gate: { kind: "held", notBefore: 1060000 }, diagnostic: { name: "Original", message: "opaque" } } } as typeof initial.sync
    const h = harness(initial), owner = api.create(h.deps)
    await owner.startSync(); h.time(59000)
    const entered = gate(), held = gate()
    h.readBefore(async () => { entered.resolve(); await held.promise })
    const reading = owner.read("settings"); await entered.promise
    const edit = owner.changeSharedSetting(origin, { kind: "theme", value: "dark" })
    h.time(61000); h.readBefore(undefined); held.resolve(); await reading
    equal(await edit, { kind: "committed" }, "early queued edit may persist after deadline")
    h.time(63000); await h.runDue()
    equal(h.stats().syncSets, 0, "early queued edit remains ineligible for R155 despite finishing after deadline")
    const before = h.stats().syncSets
    h.time(64000); check((await owner.flushSync()).kind === "pushed", "later external event after queued edit uses fresh admission")
    equal(h.stats().syncSets, before + 1, "one later attempt after early queued edit")
    await owner.dispose(); observations.push({ label: "queued-R155-event", records: h.records(), effects: h.effects })
  }
  return { checks, observations }
}

test("Settings reads, private edits and confirmed invalidations share startup and owner lifetime", async () => {
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_kept"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("fixture brands")
  expect((await settingsAcceptance({ create: createLocalFilterWriter, starting: createStartingLocalFilterWriter, Error: StartupReadinessError }, acct, playlist)).checks).toBeGreaterThan(100)
})

export async function followAcceptance(follow: typeof import("../../../tools/fixtures/claim-transaction/run").followSettings, create: typeof createLocalFilterWriter) {
  let checks = 0
  const published: unknown[] = []
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function gate() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  let records: Record<string, unknown> = { schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false }, "doc:settings": { v: 1, gen: "g0", at: 1, by: "fixture", data: {} } }
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const owner = create({ local: { async get(keys) { return copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key)))) }, async set(items) { records = { ...records, ...copy(items) } } },
    claim: { kind: "unavailable" }, sync: { async get() { throw Error("follow read sync") }, async set() { throw Error("follow pushed") }, subscribe() { throw Error("follow native subscription") } },
    syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("follow timer") } }, onSyncResult() { throw Error("follow sync result") }, now: () => 100, generation: () => "g1" })
  const old = gate(), entered = gate()
  let first = true
  const wrapper = { subscribe: owner.subscribe, async read(view: "settings") {
    const value = await owner.read(view)
    if (first) { first = false; entered.resolve(); await old.promise }
    return value
  } }
  const consumer = follow(wrapper, view => published.push(copy(view)))
  await entered.promise
  const result = await owner.changeSharedSetting({ kind: "ui", windowId: 1, incognito: true }, { kind: "theme", value: "dark" })
  check(result.kind === "committed", "real follow edit committed")
  expect(records.sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
  await consumer.settled()
  check(published.length === 1 && (published[0] as { settings: { theme: string } }).settings.theme === "dark", "live invalidation publishes fresh read before held initial")
  old.resolve(); await consumer.initial
  check(published.length === 1 && (published[0] as { settings: { theme: string } }).settings.theme === "dark", "stale initial read cannot overwrite live value")
  consumer.dispose(); consumer.dispose()
  await owner.changeSharedSetting({ kind: "ui", windowId: 1, incognito: false }, { kind: "default-percentage", value: 0 })
  check(published.length === 1, "unsubscribe stops future reads and publications")
  const pending = gate(), read = gate(), after: unknown[] = []
  const unmount = follow({ subscribe: owner.subscribe, async read(view) { const value = await owner.read(view); read.resolve(); await pending.promise; return value } }, view => after.push(view))
  await read.promise; unmount.dispose(); pending.resolve(); await unmount.initial
  check(after.length === 0, "unmounted consumer discards pending completion")
  check(Object.hasOwn(records, "sync"), "real Settings edits persist history")
  expect(records.sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
  await owner.dispose()
  return { checks, published, records }
}

test("actual command follow consumer rejects stale initial reads and unmounted completions", async () => {
  const command = await import("../../../tools/fixtures/claim-transaction/run")
  await command.fixtureRun
  expect((await followAcceptance(command.followSettings, createLocalFilterWriter)).checks).toBe(6)
})
