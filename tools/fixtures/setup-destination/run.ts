import { createLocalFilterWriter, createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { expectDestination, type SetupDestinationChange } from "../../../src/background/store/setup-edit"
import { accountRemovalLocalName, type AccountRemovalHost, type RemovalLocalKey } from "../../../src/background/store/account-removal-execution"
import { syncJoinLocalName, type SyncJoinHost } from "../../../src/background/store/sync-join-execution"
import { isInterimCanonicalKey, isInterimSourceKey, type StoreStartupHost } from "../../../src/background/store/interim-persistence"
import { isAccountKey, isPlaylistId, isShortcutId, type PlaylistId } from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"

export async function runSetupDestinationFixture(api = { create: createLocalFilterWriter, starting: createStartingLocalFilterWriter }) {
  let assertions = 0,
    cases = 0
  const observations: unknown[] = []
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown) =>
    JSON.stringify(value, (_, item: unknown) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item))
  function check(value: unknown, label: string): asserts value {
    assertions++
    if (!value) throw Error(label)
  }
  function equal(actual: unknown, expected: unknown, label: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(`${label}: ${stable(actual)} != ${stable(expected)}`)
  }
  function brand<T>(guard: (value: unknown) => value is T, value: string): T {
    if (!guard(value)) throw Error(`fixture ${value}`)
    return value
  }
  function object(value: unknown): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
  }
  async function turns() {
    for (let i = 0; i < 60; i++) await Promise.resolve()
  }
  function gate() {
    let open = () => {}
    const held = new Promise<void>(done => {
      open = done
    })
    return { held, open }
  }
  const A = brand(isAccountKey, "AAAAAAAAAAAAAAAA"),
    B = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
  const one = brand(isPlaylistId, "PL_one"),
    two = brand(isPlaylistId, "PL_two"),
    music = brand(isPlaylistId, "PL_music")
  const s1 = brand(isShortcutId, "short1"),
    s2 = brand(isShortcutId, "short2")
  const SA = `doc:setup:${A}`,
    SB = `doc:setup:${B}`
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const stamp = { v: 1, gen: "g0", at: 1, by: "fixture", envelopeFuture: { keep: [1] } }
  const device = {
    id: "fixture",
    consent: { v: 1, at: 1 },
    syncOn: false,
    upgradeNote: null,
    claimNotice: null,
    newPlaylistVisibility: null,
    pickerSortAZ: false,
    detailedLog: false,
    recentAdds: true,
    legacyCleared: true,
    future: [0]
  }
  const seed = (on = false): Record<string, JsonValue> => ({
    schema: 1,
    device: { ...device, syncOn: on },
    unclaimed: null,
    "doc:settings": {
      ...stamp,
      data: {
        shortcuts: {
          list: [
            { id: s1, key: null, label: "One", watchLaterOnEveryAccount: false },
            { id: s2, key: null, label: "Two", watchLaterOnEveryAccount: false }
          ]
        }
      }
    },
    [SB]: { ...stamp, data: { quickSave: two, targets: { [s1]: two } } },
    sync: { joined: on ? "history" : null, pushed: on ? { "doc:settings": "g0", [SB]: "g0" } : {}, status: on ? "ok" : "off", editedSinceOff: false, everEdited: true }
  })
  const sessionSeed = (): JsonObject => ({
    [`skips:${A}`]: { abcdefghijk: [one] },
    [`skips:${B}`]: { bcdefghijkl: [two] },
    [`cooldown:${A}`]: 1,
    [`cooldown:${B}`]: 2,
    recent: [
      { acct: A, playlist: one, video: "abcdefghijk", at: 1 },
      { acct: B, playlist: two, video: "bcdefghijkl", at: 2 }
    ],
    shown: { v: 1, global: { keep: true }, accounts: { [A]: { removed: true }, [B]: { kept: true } } },
    gather: { v: 1, global: {}, accounts: { [A]: { tabs: [1] }, [B]: { tabs: [2] } } },
    unrelated: ["kept"]
  })
  function harness(initial: Record<string, JsonValue>, initialSession = sessionSeed()) {
    let records = copy(initial),
      remote: Record<string, JsonValue> = { "s:meta": { v: 1, id: "history", created: 0 } }
    let session = copy(initialSession),
      boundary: (kind: string) => Promise<void> = async () => {},
      returned: (kind: string) => void = () => {},
      listener: (() => void) | undefined
    let removalFailure: string | undefined,
      rejectSet = false
    const failure = { synthetic: "removal-interruption" }
    for (const [key, value] of Object.entries(records)) if (key.startsWith("doc:")) remote[`s:${key.slice(4)}`] = copy(value)
    const effects: unknown[] = [],
      events: unknown[] = [],
      settingsEvents: unknown[] = []
    let generations = 0,
      clockReads = 0,
      setMode: "ok" | "ignored" = "ok",
      beforeRead: (() => Promise<void>) | undefined,
      snapshotWait: (() => Promise<void>) | undefined
    const removal: Extract<AccountRemovalHost, { kind: "fixture" }> = {
      kind: "fixture",
      async removeLocal(keys: readonly RemovalLocalKey[]) {
        await boundary("local-remove")
        for (const key of keys) {
          const acct = key.kind === "continuation" ? A : key.kind === "document" ? key.key.acct : key.acct
          const name = accountRemovalLocalName(key, acct)
          effects.push({ remove: name })
          if (removalFailure === name) throw failure
          delete records[name]
        }
        returned("local-remove")
      },
      session: {
        async get() {
          await boundary("session-get")
          return copy(session)
        },
        async set(items) {
          await boundary("session-set")
          effects.push({ sessionSet: copy(items) })
          session = { ...session, ...copy(items) }
          returned("session-set")
        },
        async remove(keys) {
          await boundary("session-remove")
          for (const key of keys) {
            effects.push({ sessionRemove: key })
            delete session[`${key.kind}:${key.acct}`]
          }
          returned("session-remove")
        }
      }
    }
    const join: Extract<SyncJoinHost, { kind: "fixture" }> = {
      kind: "fixture",
      session: removal.session,
      async removeLocal(keys) {
        await boundary("join-remove")
        for (const key of keys) delete records[syncJoinLocalName(key)]
      }
    }
    const startup: StoreStartupHost = {
      context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
      async readInterimSnapshot() {
        if (snapshotWait) await snapshotWait()
        const saved = copy(records)
        return {
          source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
          canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
          checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
          historicalAuthorization: { kind: "unknown" as const },
          priorCredentialPresence: { kind: "unknown" as const }
        }
      },
      async readSnapshot() {
        if (snapshotWait) await snapshotWait()
        return {
          schema: records.schema,
          device: records.device,
          settingsDocument: records["doc:settings"],
          unclaimed: records.unclaimed,
          legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false },
          interimKeysPresent: []
        }
      },
      async removeLocal() {
        throw Error("unexpected removal")
      },
      async deleteDatabase() {
        throw Error("unexpected database")
      },
      async removeSession() {
        throw Error("unexpected session")
      }
    }
    const deps = {
      startup,
      removal,
      join,
      claim: { kind: "unavailable" as const },
      local: {
        async get(keys: readonly string[] | null) {
          effects.push("get")
          await boundary("local-get")
          if (beforeRead) await beforeRead()
          return copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
        },
        async set(items: Readonly<Record<string, JsonValue>>) {
          await boundary("local-set")
          effects.push({ set: copy(items) })
          if (rejectSet) throw failure
          if (setMode === "ok") records = { ...records, ...copy(items) }
          returned("local-set")
        }
      },
      sync: {
        async get() {
          effects.push("sync-get")
          await boundary("sync-get")
          return copy(remote)
        },
        async set(items: Readonly<Record<string, JsonValue>>) {
          await boundary("sync-set")
          effects.push({ syncSet: copy(items) })
          remote = { ...remote, ...copy(items) }
          returned("sync-set")
        },
        subscribe(changed: () => void) {
          effects.push("sync-subscribe")
          listener = changed
          return () => {
            effects.push("sync-unsubscribe")
            listener = undefined
          }
        }
      },
      syncClock: {
        now() {
          clockReads++
          return 0
        },
        wallNow() {
          clockReads++
          return 1000000
        },
        after(ms: number) {
          effects.push({ timer: ms })
          return () => {}
        }
      },
      onSyncResult() {},
      now() {
        effects.push("now")
        return 100
      },
      generation() {
        effects.push("generation")
        return `G${++generations}`
      }
    }
    return {
      deps,
      effects,
      events,
      settingsEvents,
      records: () => copy(records),
      mutate(fn: (value: Record<string, JsonValue>) => void) {
        fn(records)
      },
      session: () => copy(session),
      remote: () => copy(remote),
      setRemote(value: typeof remote) {
        remote = copy(value)
      },
      fire() {
        listener?.()
      },
      boundary(fn: typeof boundary) {
        boundary = fn
      },
      returned(fn: typeof returned) {
        returned = fn
      },
      rejectRemoval(name: string) {
        removalFailure = name
      },
      rejectSets() {
        rejectSet = true
      },
      failure,
      ignoreSets() {
        setMode = "ignored"
      },
      readBefore(fn: typeof beforeRead) {
        beforeRead = fn
      },
      snapshot(fn: typeof snapshotWait) {
        snapshotWait = fn
      },
      stats: () => ({
        generations,
        clockReads,
        sets: effects.filter(effect => typeof effect === "object" && effect !== null && "set" in effect).length,
        reads: effects.filter(effect => effect === "get").length
      })
    }
  }
  const quick = (expected: SetupDestinationChange["expected"], playlist: PlaylistId | null, acct = A): SetupDestinationChange => ({ acct, destination: { kind: "quick-save" }, expected, playlist })
  function removable(on: boolean, destination: SetupDestinationChange["destination"] = { kind: "quick-save" }): JsonObject {
    const records = seed(on)
    records.device = { ...device, syncOn: on }
    records.lastAccount = A
    records[SA] = {
      ...stamp,
      data: {
        label: { name: "Remove this label", handle: "@removed" },
        marks: { [one]: "full" },
        ...(destination.kind === "shortcut"
          ? { targets: { [destination.shortcut]: one } }
          : { [destination.kind === "quick-save" ? "quickSave" : destination.kind === "music-save" ? "musicSave" : "gather"]: one })
      }
    }
    records[`doc:filter:${A}:PL_deleted`] = { ...stamp, gen: "deleted-filter", deleted: true }
    records[`cache:${A}`] = { synthetic: "remove" }
    records[`cache:${B}`] = { synthetic: "keep" }
    for (let shard = 0; shard < 16; shard++) {
      records[`progress:${A}:${shard}`] = { synthetic: "remove", shard }
      records[`progress:${B}:${shard}`] = { synthetic: "keep", shard }
    }
    records.sync = {
      joined: on ? "history" : null,
      status: on ? "ok" : "off",
      editedSinceOff: false,
      everEdited: true,
      pushed: on ? { "doc:settings": "g0", [SA]: "g0", [SB]: "g0", [`doc:filter:${A}:PL_deleted`]: "deleted-filter" } : {}
    }
    return records
  }

  {
    cases++
    const h = harness(seed()),
      hold = gate()
    h.snapshot(() => hold.held)
    const owner = api.starting(h.deps)
    owner.subscribeSetup(event => h.events.push(event))
    owner.subscribe(event => h.settingsEvents.push(event))
    await turns()
    const before = copy(h.effects)
    equal(await owner.readSetup(A), { kind: "unavailable", reason: "startup" }, "pending startup read is held")
    equal(await owner.changeSetupDestination(origin, quick({ setup: "none" }, one)), { kind: "unavailable", reason: "startup" }, "pending startup edit is held")
    equal(h.effects, before, "held startup calls create no effects")
    hold.open()
    equal(await owner.ready(), "ok", "real startup releases the owner")
    const raw = h.records(),
      noneRead = await owner.readSetup(A)
    equal(noneRead, { kind: "value", view: { kind: "none", acct: A } }, "absent setup reads as none")
    equal(h.records(), raw, "read never creates a document")
    check(noneRead.kind === "value", "none read")
    const privateBefore = h.stats()
    equal(
      await owner.changeSetupDestination({ ...origin, incognito: true }, quick(expectDestination(noneRead.view, { kind: "quick-save" }), one)),
      { kind: "result", result: { refused: "private" } },
      "private window refuses the setup write"
    )
    equal(h.stats(), privateBefore, "private refusal reads, stamps and clocks nothing")
    equal(
      await owner.changeSetupDestination({ kind: "ui", windowId: -1, incognito: false }, quick({ setup: "none" }, one)),
      { kind: "result", result: { refused: "invalid" } },
      "malformed origin refused"
    )
    equal(
      await owner.changeSetupDestination(origin, { ...quick({ setup: "none" }, one), destination: { kind: "label" } } as never),
      { kind: "result", result: { refused: "invalid" } },
      "malformed change refused"
    )
    equal(h.stats(), privateBefore, "boundary refusals have no effects")
    const created = await owner.changeSetupDestination(origin, quick(expectDestination(noneRead.view, { kind: "quick-save" }), one))
    check(created.kind === "committed", "fresh quick-save choice commits")
    equal(
      h.records()[SA],
      { v: 1, gen: `G${h.stats().generations}`, at: 100, by: "fixture", data: { label: null, autoAdd: [], targets: {}, quickSave: one, musicSave: null, gather: null, marks: {} } },
      "stored setup is exact and stamped by the latest generation"
    )
    equal(h.stats().generations - privateBefore.generations, 1, "a real change allocates exactly one generation")
    equal(h.events, [{ kind: "setup-changed", source: "local", acct: A }], "one precise Setup event after confirmation")
    equal(h.settingsEvents, [], "Settings subscribers see no Setup event")
    const liveRead = await owner.readSetup(A)
    check(liveRead.kind === "value" && liveRead.view.kind === "live", "live setup reads")
    const target = await owner.changeSetupDestination(origin, {
      acct: A,
      destination: { kind: "shortcut", shortcut: s1 },
      expected: expectDestination(liveRead.view, { kind: "shortcut", shortcut: s1 }),
      playlist: two
    })
    check(target.kind === "committed" && target.view.kind === "live" && target.view.setup.targets[s1] === two, "shortcut choice commits for this account")
    const seen = await owner.readSetup(A)
    check(seen.kind === "value" && seen.view.kind === "live", "seen")
    const independent = [
      owner.changeSetupDestination(origin, { acct: A, destination: { kind: "music-save" }, expected: expectDestination(seen.view, { kind: "music-save" }), playlist: music }),
      owner.changeSetupDestination(origin, { acct: A, destination: { kind: "gather" }, expected: expectDestination(seen.view, { kind: "gather" }), playlist: one })
    ]
    const same = [
      owner.changeSetupDestination(origin, quick(expectDestination(seen.view, { kind: "quick-save" }), two)),
      owner.changeSetupDestination(origin, quick(expectDestination(seen.view, { kind: "quick-save" }), music))
    ]
    const settled = await Promise.all([...independent, ...same])
    equal(
      settled.map(result => result.kind),
      ["committed", "committed", "committed", "stale"],
      "queued edits apply per destination and the second same-field capture is stale"
    )
    equal(settled[3], { kind: "stale", reason: "destination" }, "stale queued capture names its reason")
    const stored = h.records()
    equal(
      (stored[SA] as { data: unknown }).data,
      { label: null, autoAdd: [], targets: { [s1]: two }, quickSave: two, musicSave: music, gather: one, marks: {} },
      "final setup holds every committed choice"
    )
    equal(stored[SB], seed()[SB], "second account and its sibling target are untouched")
    equal(h.events.length, 5, "one event per confirmed commit")
    check(
      h.events.every(event => stable(event) === stable({ kind: "setup-changed", source: "local", acct: A })),
      "events name the edited account only"
    )
    const second = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: two }, one, B))
    check(second.kind === "committed" && second.view.acct === B, "second account edits its own setup")
    equal((h.records()[SB] as { data: { targets: unknown } }).data.targets, { [s1]: two }, "second account keeps its sibling shortcut target")
    equal(h.events.at(-1), { kind: "setup-changed", source: "local", acct: B }, "second account event")
    h.mutate(records => {
      records["doc:settings"] = { ...stamp, gen: "g1", data: { shortcuts: { list: [{ id: s2, key: null, label: "Two", watchLaterOnEveryAccount: false }] } } }
    })
    const beforeStale = h.stats()
    equal(
      await owner.changeSetupDestination(origin, { acct: A, destination: { kind: "shortcut", shortcut: s1 }, expected: { setup: "live", playlist: two }, playlist: one }),
      { kind: "stale", reason: "shortcut" },
      "a deleted shortcut row is never recreated"
    )
    equal(h.stats().sets, beforeStale.sets, "stale shortcut writes nothing")
    const orphan = await owner.readSetup(A)
    check(orphan.kind === "value" && orphan.view.kind === "live" && !Object.hasOwn(orphan.view.setup.targets, s1), "orphaned target is hidden from the view")
    observations.push({ case: "starting-owner", records: h.records(), events: h.events, results: settled })
    await owner.dispose()
  }
  {
    cases++
    const h = harness(seed()),
      owner = api.create(h.deps)
    owner.subscribeSetup(event => h.events.push(event))
    h.ignoreSets()
    equal(await owner.changeSetupDestination(origin, quick({ setup: "none" }, one)), { kind: "unconfirmed", cause: { kind: "readback" } }, "ignored write is unconfirmed")
    equal(h.events, [], "no event for unconfirmed work")
    const after = h.stats()
    equal(await owner.readSetup(A), { kind: "unavailable", reason: "stale" }, "uncertain owner refuses reads")
    equal(await owner.changeSetupDestination(origin, quick({ setup: "none" }, one)), { kind: "unavailable", reason: "stale" }, "uncertain owner refuses edits")
    equal(h.stats(), after, "uncertainty closes all later effects")
    observations.push({ case: "unconfirmed", records: h.records() })
    await owner.dispose()
  }
  {
    cases++
    const h = harness(seed()),
      owner = api.create(h.deps),
      hold = gate()
    owner.subscribeSetup(event => h.events.push(event))
    h.readBefore(() => hold.held)
    const reading = owner.readSetup(A),
      editing = owner.changeSetupDestination(origin, quick({ setup: "none" }, one))
    await turns()
    const disposal = owner.dispose()
    hold.open()
    await reading
    const result = await editing
    check(result.kind === "unavailable" && result.reason === "disposed", "queued edit stops at disposal")
    await disposal
    equal(h.stats().sets, 0, "disposed owner never writes")
    equal(h.events, [], "disposed owner emits nothing")
    equal(await owner.changeSetupDestination(origin, quick({ setup: "none" }, one)), { kind: "unavailable", reason: "disposed" }, "disposed owner refuses new edits")
  }
  for (const variant of ["withdrawn", "withdrawing", "newer-layout", "pending-upgrade"] as const) {
    cases++
    const records = seed()
    if (variant === "withdrawn") records.device = { ...device, consent: null }
    if (variant === "withdrawing") records["consent:state"] = { v: 1, generation: 2, state: { kind: "withdrawing", prior: { v: 1, at: 1 } } }
    if (variant === "newer-layout") records.schema = 2
    if (variant === "pending-upgrade") records.device = { ...device, upgradeNote: { state: "pending", details: {}, opened: false, seen: false, reopened: false } }
    const h = harness(records),
      owner = api.create(h.deps)
    const result = await owner.changeSetupDestination(origin, quick({ setup: "none" }, one))
    check(result.kind === "unavailable", `held authority refuses the edit ${variant}`)
    equal(h.stats().sets + h.stats().generations, 0, `held authority has no write or stamp ${variant}`)
    observations.push({ case: variant, result })
    await owner.dispose()
  }
  {
    cases++
    const h = harness(seed(true)),
      owner = api.create(h.deps)
    await owner.startSync()
    await turns()
    const start = h.effects.length
    const result = await owner.changeSetupDestination(origin, quick({ setup: "none" }, one))
    check(result.kind === "committed", "sync-on setup edit commits locally")
    const during = h.effects.slice(start)
    check(during.includes("sync-get"), "sync-on edit reads the synced inventory for admission")
    check(!during.some(effect => typeof effect === "object" && effect !== null && "syncSet" in effect), "the edit itself never pushes")
    check(
      during.some(effect => typeof effect === "object" && effect !== null && "timer" in effect),
      "the existing sync flush is armed"
    )
    observations.push({ case: "sync-on", records: h.records() })
    await owner.dispose()
  }
  for (const on of [false, true]) {
    for (const destination of [{ kind: "quick-save" }, { kind: "music-save" }, { kind: "gather" }, { kind: "shortcut", shortcut: s1 }] satisfies SetupDestinationChange["destination"][]) {
      cases++
      const initial = removable(on, destination),
        h = harness(initial),
        owner = api.create(h.deps),
        initialSession = h.session()
      owner.subscribeSetup(event => h.events.push(event))
      owner.subscribe(event => h.settingsEvents.push(event))
      const beforePrivate = h.stats()
      equal(
        await owner.changeSetupDestination({ ...origin, incognito: true }, { acct: A, destination, expected: { setup: "live", playlist: one }, playlist: null }),
        { kind: "result", result: { refused: "private" } },
        "private last-choice clear refuses"
      )
      equal(h.stats(), beforePrivate, "private removal reads and clocks nothing")
      const result = await owner.changeSetupDestination(origin, { acct: A, destination, expected: { setup: "live", playlist: one }, playlist: null })
      equal(result, { kind: "committed", view: { kind: "none", acct: A } }, "last-choice clear confirms an absent Setup")
      equal(await owner.readSetup(A), { kind: "value", view: { kind: "none", acct: A } }, "removed Setup reads as absent")
      const after = h.records(),
        stored = after[SA]
      check(on ? object(stored) && stored.deleted === true && !Object.hasOwn(stored, "data") : !Object.hasOwn(after, SA), "last-choice clear removes label and leaves only the required tombstone")
      const filter = after[`doc:filter:${A}:PL_deleted`]
      check(on ? object(filter) && filter.deleted === true : filter === undefined, "existing deleted filter follows the removal scope")
      check(!Object.hasOwn(after, `cache:${A}`), "last-choice clear removes the account cache")
      for (let shard = 0; shard < 16; shard++) check(!Object.hasOwn(after, `progress:${A}:${shard}`), "last-choice clear removes every account progress shard")
      check(after.lastAccount === null, "last-choice clear clears only the matching last account")
      for (const [name, value] of Object.entries(initial)) {
        if ([SA, `doc:filter:${A}:PL_deleted`, `cache:${A}`, "sync", "device", "lastAccount"].includes(name) || name.startsWith(`progress:${A}:`)) continue
        equal(JSON.stringify(after[name]), JSON.stringify(value), `last-choice clear keeps unrelated bytes ${name}`)
      }
      const expectedSession = copy(initialSession)
      delete expectedSession[`skips:${A}`]
      delete expectedSession[`cooldown:${A}`]
      expectedSession.recent = [{ acct: B, playlist: two, video: "bcdefghijkl", at: 2 }]
      expectedSession.shown = { v: 1, global: { keep: true }, accounts: { [B]: { kept: true } } }
      expectedSession.gather = { v: 1, global: {}, accounts: { [B]: { tabs: [2] } } }
      equal(h.session(), expectedSession, "last-choice clear scopes session deletion to one account")
      check(!Object.hasOwn(after, "pending:account-removal"), "last-choice clear retires the existing continuation")
      equal(h.events, [{ kind: "setup-changed", source: "local", acct: A }], "last-choice clear emits once after all cleanup")
      equal(h.settingsEvents, [], "last-choice clear does not notify Settings subscribers")
      check(!h.effects.some(effect => object(effect) && "syncSet" in effect), "last-choice clear leaves replication to the existing flush")
      equal(await owner.changeSetupDestination(origin, { acct: A, destination, expected: { setup: "none" }, playlist: null }), { kind: "unchanged" }, "repeated clear is a no-op")
      equal(h.events.length, 1, "repeated clear emits no duplicate event")
      observations.push({ case: "last-choice", on, destination: destination.kind, result, session: h.session() })
      await owner.dispose()
    }
  }
  for (const on of [false, true]) {
    cases++
    const input = removable(on),
      name = `doc:filter:${A}:PL_kept`,
      filter = { ...stamp, data: { mode: "deny", on: false, channels: [], future: ["keep"] } }
    input[name] = filter
    if (object(input.sync) && object(input.sync.pushed)) input.sync.pushed[name] = "g0"
    const h = harness(input),
      beforeSession = h.session(),
      owner = api.create(h.deps)
    const result = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))
    check(result.kind === "committed" && result.view.kind === "live" && result.view.setup.quickSave === null, "live kept filters keep the cleared Setup")
    equal(h.records()[name], filter, "kept filter remains exact")
    equal(h.records()[`cache:${A}`], input[`cache:${A}`], "kept filter preserves the account cache")
    equal(h.session(), beforeSession, "kept filter preserves the account session")
    await owner.dispose()
  }
  for (const addition of ["destination", "kept-filter", "same-destination", "settings"] as const) {
    cases++
    const input = removable(false)
    const initialSetup = input[SA]
    if (addition === "settings" && object(initialSetup) && object(initialSetup.data)) initialSetup.data.targets = { gone01: two }
    const h = harness(input),
      owner = api.create(h.deps)
    let injected = false,
      reads = 0
    owner.subscribeSetup(event => h.events.push(event))
    h.boundary(async kind => {
      if (kind === "local-get") reads++
      if ((addition === "settings" ? kind !== "local-get" || reads !== 2 : kind !== "session-get") || injected) return
      injected = true
      h.mutate(records => {
        if (addition === "settings")
          records["doc:settings"] = { ...stamp, gen: "new-row", data: { shortcuts: { list: [{ id: "gone01", key: null, label: "Restored", watchLaterOnEveryAccount: false }] } } }
        else if (addition === "kept-filter") records[`doc:filter:${A}:PL_kept`] = { ...stamp, data: {} }
        else {
          const setup = records[SA]
          if (object(setup) && object(setup.data)) setup.data[addition === "destination" ? "musicSave" : "quickSave"] = two
        }
      })
    })
    const result = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))
    check(injected && result.kind !== "committed", "concurrent account choices prevent accepting removal")
    equal(h.stats().sets, 0, "concurrent choices are detected before the removal journal is accepted")
    equal(h.events, [], "concurrent refusal emits nothing")
    check(Object.hasOwn(h.records(), SA), "concurrent choice keeps its Setup")
    if (addition === "kept-filter") check(Object.hasOwn(h.records(), `doc:filter:${A}:PL_kept`), "concurrent kept filter survives")
    else if (addition === "settings") {
      const setup = h.records()[SA]
      check(object(setup) && object(setup.data) && object(setup.data.targets) && setup.data.targets.gone01 === two, "concurrent shortcut membership keeps its account target")
    } else {
      const setup = h.records()[SA]
      check(object(setup) && object(setup.data) && setup.data[addition === "destination" ? "musicSave" : "quickSave"] === two, "concurrent destination survives")
    }
    await owner.dispose()
  }
  for (const on of [false, true]) {
    cases++
    const h = harness(removable(on)),
      owner = api.create(h.deps)
    owner.subscribeSetup(event => h.events.push(event))
    h.rejectRemoval(`cache:${A}`)
    const result = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))
    check(
      result.kind === "removal" && result.result.kind === "failed" && result.result.stage === "local-cleanup" && result.result.error === h.failure,
      "interrupted cleanup keeps its exact stage and rejection"
    )
    equal(h.events, [], "acknowledged document deletion alone emits no completed edit")
    check(Object.hasOwn(h.records(), "pending:account-removal"), "interruption retains the existing removal continuation")
    equal(await owner.readSetup(A), { kind: "unavailable", reason: "stale" }, "interrupted removal holds the owner")
    await owner.dispose()
    const restart = harness(h.records(), h.session())
    restart.setRemote(h.remote())
    const resumed = api.create(restart.deps)
    equal(await resumed.readSetup(A), { kind: "value", view: { kind: "none", acct: A } }, "restart completes the accepted removal")
    check(!Object.hasOwn(restart.records(), "pending:account-removal") && !Object.hasOwn(restart.records(), `cache:${A}`), "restart retires the continuation after cleanup")
    equal(restart.records()[SB], h.records()[SB], "restart preserves the other account")
    observations.push({ case: "removal-restart", on, result: result.result.kind })
    await resumed.dispose()
  }
  for (const mode of ["ignored", "rejected"] as const) {
    cases++
    const h = harness(removable(false)),
      owner = api.create(h.deps)
    owner.subscribeSetup(event => h.events.push(event))
    if (mode === "ignored") h.ignoreSets()
    else h.rejectSets()
    const result = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))
    check(
      result.kind === "removal" && (mode === "ignored" ? result.result.kind === "unconfirmed" : result.result.kind === "failed"),
      "removal acceptance reports ignored and rejected writes truthfully"
    )
    check(Object.hasOwn(h.records(), SA) && Object.hasOwn(h.records(), `cache:${A}`), "unaccepted removal does not clear choices or cache")
    equal(h.events, [], "unaccepted removal emits nothing")
    await owner.dispose()
  }
  for (const on of [false, true]) {
    for (const cancellation of ["disposed", "withdrawn"] as const) {
      cases++
      const control = harness(removable(on)),
        live = api.create(control.deps),
        boundaries: string[] = []
      control.boundary(async kind => {
        boundaries.push(kind)
      })
      equal((await live.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))).kind, "committed", "await-boundary control completes removal")
      await live.dispose()
      for (let cutoff = 1; cutoff <= boundaries.length; cutoff++) {
        const h = harness(removable(on)),
          owner = api.create(h.deps)
        owner.subscribeSetup(event => h.events.push(event))
        let seen = 0,
          disposal: Promise<void> | undefined
        const cancel = () => {
          if (++seen !== cutoff) return
          if (cancellation === "disposed") disposal = owner.dispose()
          else
            h.mutate(records => {
              records.device = { ...device, syncOn: on, consent: null }
            })
        }
        h.boundary(async kind => {
          if (kind.endsWith("get")) cancel()
        })
        h.returned(() => cancel())
        const result = await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null))
        check(seen >= cutoff && result.kind !== "committed", `removal never confirms after ${cancellation} at awaited boundary ${cutoff}, sync ${on}`)
        equal(h.events, [], "interrupted removal never emits a completed edit")
        await (disposal ?? owner.dispose())
      }
      observations.push({ case: "removal-awaits", on, cancellation, boundaries: boundaries.length })
    }
  }
  for (const on of [false, true]) {
    for (const newer of ["local-settings", "remote-settings", "other-account"] as const) {
      cases++
      const input = seed(on)
      input[SA] = { ...stamp, data: { quickSave: one, targets: { [s1]: one, gone01: two }, marks: { WL: "full", PL_unknown: "missing" } } }
      input.sync = { joined: on ? "history" : null, pushed: on ? { "doc:settings": "g0", [SA]: "g0", [SB]: "g0" } : {}, status: on ? "ok" : "off", editedSinceOff: false }
      if (newer === "local-settings") input["doc:settings"] = { ...stamp, v: 2, gen: "future-settings", data: { opaque: [0, { retain: true }] } }
      if (newer === "other-account") input[SB] = { ...stamp, v: 3, gen: "future-account", data: { opaque: ["unreadable"] } }
      const h = harness(input),
        owner = api.create(h.deps),
        remote = h.remote()
      if (newer === "remote-settings") remote["s:settings"] = { ...stamp, v: 4, gen: "future-remote-settings", data: { opaque: [true] } }
      if (newer === "other-account") {
        const supported = seed(on)[SB]
        check(supported !== undefined, "fixture account counterpart exists")
        remote[`s:setup:${B}`] = supported
      }
      if (newer === "local-settings") delete remote["s:settings"]
      h.setRemote(remote)
      const before = h.records(),
        remoteBefore = h.remote()
      for (const destination of [{ kind: "quick-save" }, { kind: "music-save" }, { kind: "gather" }, { kind: "shortcut", shortcut: s1 }] satisfies SetupDestinationChange["destination"][]) {
        const read = await owner.readSetup(A)
        check(read.kind === "value", "unrelated newer document does not hide the supported Setup")
        const result = await owner.changeSetupDestination(origin, { acct: A, destination, expected: expectDestination(read.view, destination), playlist: two })
        check(result.kind === "committed" && result.view.kind === "live", "unrelated newer document does not block supported Setup fields")
        if (newer === "local-settings") {
          equal(result.view.setup.targets.gone01, two, "unreadable Settings keeps unknown targets")
          equal(result.view.setup.marks, { WL: "full", PL_unknown: "missing" }, "unreadable Settings keeps unknown marks")
        }
      }
      equal(JSON.stringify(h.records()["doc:settings"]), JSON.stringify(before["doc:settings"]), "Setup edit preserves local Settings bytes")
      equal(JSON.stringify(h.records()[SB]), JSON.stringify(before[SB]), "Setup edit preserves different account bytes")
      equal(JSON.stringify(h.remote()), JSON.stringify(remoteBefore), "Setup edits preserve the complete remote inventory")
      await owner.dispose()
    }
  }
  for (const on of [false, true]) {
    for (const newer of ["settings", "other-account"] as const) {
      cases++
      const input = removable(on),
        name = newer === "settings" ? "doc:settings" : SB
      input[name] = { ...stamp, v: 3, gen: "future-unrelated", data: { unknown: ["keep exact"] } }
      const h = harness(input),
        owner = api.create(h.deps),
        before = JSON.stringify(input[name])
      equal(
        await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, null)),
        { kind: "committed", view: { kind: "none", acct: A } },
        "last-choice removal ignores unrelated newer documents"
      )
      equal(JSON.stringify(h.records()[name]), before, "last-choice removal preserves unrelated newer bytes")
      await owner.dispose()
    }
  }
  for (const on of [false, true]) {
    cases++
    const input = seed(on)
    input[SA] = { ...stamp, v: 2, data: { opaque: ["future-setup"] } }
    const h = harness(input),
      owner = api.create(h.deps),
      before = h.records()
    owner.subscribeSetup(event => h.events.push(event))
    equal(await owner.changeSetupDestination(origin, quick({ setup: "live", playlist: one }, two)), { kind: "result", result: { refused: "update-needed" } }, "the edited newer Setup remains refused")
    equal(JSON.stringify(h.records()), JSON.stringify(before), "refusal preserves newer Setup raw bytes")
    equal(h.events, [], "newer Setup refusal emits nothing")
    await owner.dispose()
  }
  for (const mode of ["manual", "automatic", "ignored", "rejected", "unsubscribed", "disposed"] as const) {
    cases++
    const input = seed(true)
    input[SA] = { ...stamp, data: { quickSave: one } }
    input.sync = { joined: "history", pushed: { "doc:settings": "g0", [SA]: "g0", [SB]: "g0" }, status: "ok", editedSinceOff: false, everEdited: true }
    const h = harness(input),
      owner = api.create(h.deps),
      incoming = { ...stamp, gen: "incoming", at: 2, data: { quickSave: two } }
    const remote = h.remote()
    remote[`s:setup:${A}`] = incoming
    h.setRemote(remote)
    const unsubscribe = owner.subscribeSetup(event => h.events.push(event))
    owner.subscribe(event => h.settingsEvents.push(event))
    if (mode === "ignored") h.ignoreSets()
    if (mode === "rejected") h.rejectSets()
    const entered = gate(),
      hold = gate()
    let held = false,
      disposal: Promise<void> | undefined
    h.boundary(async kind => {
      if (kind === "local-set" && !held) {
        held = true
        entered.open()
        await hold.held
      }
    })
    const receiving = mode === "automatic" ? owner.startSync() : owner.receiveSyncDocument({ kind: "setup", acct: A })
    await entered.held
    equal(h.events, [], "sync event waits for adoption readback")
    if (mode === "unsubscribed") unsubscribe()
    if (mode === "disposed") disposal = owner.dispose()
    hold.open()
    const result = await receiving
    if (mode === "manual" || mode === "automatic") {
      equal(h.events, [{ kind: "setup-changed", source: "sync", acct: A }], "confirmed sync adoption emits only the changed account")
      equal(h.records()[SA], incoming, "sync event follows the actual incoming bytes")
      if (mode === "manual") check(result !== undefined && result.kind === "adopted", "manual receive confirms adoption")
      else {
        h.fire()
        await owner.readSetup(A)
      }
      equal(await owner.receiveSyncDocument({ kind: "setup", acct: A }), { kind: "idle" }, "unchanged receive stays idle")
      equal(h.events.length, 1, "unchanged automatic and manual receives emit no duplicate event")
    } else equal(h.events, [], "failed, unconfirmed or disposed sync adoption emits nothing")
    equal(h.settingsEvents, [], "Setup adoption preserves Settings-only subscribers")
    observations.push({ case: "sync-event", mode, events: h.events })
    await (disposal ?? owner.dispose())
  }
  {
    cases++
    const input = seed(false)
    input["doc:settings"] = { ...stamp, gen: "settings0", data: { theme: "light" } }
    input[SA] = { ...stamp, gen: "setup0", data: { quickSave: one } }
    input[SB] = { ...stamp, gen: "sibling0", data: { quickSave: two } }
    const h = harness(input),
      owner = api.create(h.deps),
      remote = h.remote()
    remote["s:settings"] = { ...stamp, gen: "settings1", at: 3, data: { theme: "dark" } }
    remote[`s:setup:${A}`] = { ...stamp, gen: "setup1", at: 3, data: { quickSave: two } }
    h.setRemote(remote)
    owner.subscribeSetup(event => h.events.push(event))
    owner.subscribe(event => h.settingsEvents.push(event))
    const prepared = await owner.beginSyncJoin(origin).result
    check(prepared.kind === "choice-required", "independent history requires the existing join choice")
    equal(h.events, [], "join preparation emits no Setup adoption")
    const joined = await owner.applySyncJoin(origin, { kind: "choice", review: prepared.review, choice: "use-synced" })
    check(joined.kind === "committed", "existing join confirms remote documents")
    equal(h.events, [{ kind: "setup-changed", source: "sync", acct: A }], "join completion emits only the changed Setup")
    equal(h.settingsEvents, [{ kind: "settings-changed", source: "sync" }], "join preserves Settings subscriptions")
    equal(h.records()[SA], remote[`s:setup:${A}`], "join event follows confirmed selected bytes")
    await owner.dispose()
  }
  return { cases, assertions, observations, production: "not-connected" as const }
}
