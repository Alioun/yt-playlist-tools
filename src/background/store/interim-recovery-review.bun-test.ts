import { expect, test } from "bun:test"
import { defaultSettings, defaultSetup } from "../../shared/model/defaults"
import { isAccountKey, type AccountKey } from "../../shared/model/validation"
import { planInterimConversion } from "./interim-conversion"
import type { InterimConversionContext, InterimConversionInput } from "./interim-conversion"
import { openInterimRecoveryReview } from "./interim-recovery-review"
import type { RecoveryItemId, RecoveryIntent, RecoveryObservation, RecoveryReviewRead, RecoveryReviewReader, RecoverySelectionResult } from "./interim-recovery-review"

export function exerciseInterimRecoveryReview(open: typeof openInterimRecoveryReview = openInterimRecoveryReview, plan = planInterimConversion) {
  const assertions: string[] = [],
    observations: { label: string; value: unknown }[] = []
  function check(value: unknown, label: string): asserts value {
    if (!value) throw new Error(label)
    assertions.push(label)
  }
  function equal(actual: unknown, expected: unknown, label: string) {
    function same(a: unknown, b: unknown): boolean {
      if (Object.is(a, b)) return true
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
      const keys = Reflect.ownKeys(a)
      return (
        keys.length === Reflect.ownKeys(b).length &&
        keys.every(key => {
          const left = Object.getOwnPropertyDescriptor(a, key),
            right = Object.getOwnPropertyDescriptor(b, key)
          return left && right && "value" in left && "value" in right && same(left.value, right.value)
        })
      )
    }
    check(same(actual, expected), label)
  }
  function freeze<T>(value: T): T {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key)
        if (d && "value" in d) freeze(d.value)
      }
      Object.freeze(value)
    }
    return value
  }
  function acct(value: string): AccountKey {
    if (!isAccountKey(value)) throw new Error("bad fixture account")
    return value
  }
  const A = acct("AAAAAAAAAAAAAAAA"),
    B = acct("BBBBBBBBBBBBBBBB"),
    C = acct("CCCCCCCCCCCCCCCC"),
    D = acct("DDDDDDDDDDDDDDDD")
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa",
    unlabeled = "UCbbbbbbbbbbbbbbbbbbbbbb"
  const empty = () => ({ playlists: [], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null })
  const source = {
    accountBodies: {
      [`account:${A}`]: {
        ...empty(),
        playlists: ["PL_SAME", "PL_SAME"],
        shortcutPlaylistId: "WL",
        filters: { PL_KEPT: { mode: "deny", enabled: false, channels: [channel, unlabeled] } },
        labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" } }
      },
      [`account:${C}`]: { ...empty(), playlists: ["PL_SAME"], shortcutPlaylistId: "WL" },
      [`account:${D}`]: { ...empty(), cachedPlaylists: [{ id: "PL_CACHE", title: "Never an account label" }], cachedAt: 4 }
    },
    savedAccountKeys: [B, B],
    legacyClaimed: true,
    globals: {
      playlists: ["PL_GLOBAL"],
      addToPlaylistID: "WL",
      channelFilters: { PL_ORPHAN: { mode: "allow", enabled: false, channels: [channel] } },
      channelLabels: { [channel]: { title: "Global channel" } }
    }
  }
  const input: InterimConversionInput = {
    schema: 1,
    source,
    canonical: { documents: {}, caches: {}, device: undefined, unclaimed: undefined },
    historicalAuthorization: { kind: "unknown" },
    priorCredentialPresence: { kind: "unknown" }
  }
  const context: InterimConversionContext = {
    deviceId: "synthetic",
    at: 123,
    platform: { browser: "firefox", os: "linux" },
    commands: [],
    interimShortcutId: "conv01",
    documentGenerations: { "doc:settings": "settings", [`doc:setup:${A}`]: "setup-A", [`doc:setup:${C}`]: "setup-C", [`doc:filter:${A}:PL_KEPT`]: "filter" }
  }
  const observation = (value = input, ctx = context): RecoveryObservation => ({ captureId: "capture-1", schema: value.schema, conversion: plan(value, ctx), canonical: value.canonical })
  const mutableDraft = observation(structuredClone(input))
  const mutableDraftBefore = JSON.stringify(mutableDraft)
  const mutableDraftReader = open(mutableDraft),
    mutableDraftRead = mutableDraftReader.read(mutableDraft)
  check(mutableDraftRead.kind === "review", "mutable synthetic capture opens without writes")
  const mutableFilter = mutableDraftRead.view.items.find(item => item.kind === "filter")
  check(mutableFilter, "mutable synthetic capture has a filter choice")
  mutableDraftReader.select({ current: mutableDraft, item: mutableFilter.id, intent: "discard" })
  equal(JSON.stringify(mutableDraft), mutableDraftBefore, "discard selection performs no hidden source write or deletion")
  const current = observation()
  const before = JSON.stringify({ input, context, current })
  freeze(input)
  freeze(context)
  freeze(current)
  const reader = open(current),
    opened = reader.read(current)
  check(opened.kind === "review", "valid retained evidence opens a review")
  const absent = (path: string) => ({ path, presence: "missing", state: { kind: "absent" } })
  const settingsAbsent = absent("doc:settings")
  const sourceA = { kind: "account-body", account: A },
    global = { kind: "global" }
  const base = { intent: "none", inactive: true, restoration: "not-proven" }
  const id = (sourceKey: string, path: (string | number)[]): RecoveryItemId => ({ captureId: "capture-1", sourceKey, path })
  function playlist(account: AccountKey, index: number) {
    return {
      ...base,
      id: id(`account:${account}`, ["playlists", index]),
      source: { kind: "account-body", account },
      kind: "playlist",
      facts: { playlist: "PL_SAME", takes: "videos", percentage: "shared-default" },
      destination: { kind: "account-playlist", account, path: `doc:setup:${account}`, field: ["autoAdd"] },
      comparison: { kind: "playlist", setup: absent(`doc:setup:${account}`), currentChoices: [], currentChoiceMatch: false }
    }
  }
  function shortcut(account: AccountKey) {
    return {
      ...base,
      id: id(`account:${account}`, ["shortcutPlaylistId"]),
      source: { kind: "account-body", account },
      kind: "shortcut",
      facts: { playlist: "WL", originalAssociation: "not-supplied" },
      destination: { kind: "account-target", account, path: `doc:setup:${account}`, field: ["targets", "conv01"], settingsPath: "doc:settings", rowId: "conv01", association: "conversion-allocation" },
      comparison: { kind: "shortcut", setup: absent(`doc:setup:${account}`), settings: settingsAbsent, row: { kind: "missing" }, sharedRowDependency: "missing", target: { kind: "unknown" } }
    }
  }
  const accountFilter = {
    ...base,
    id: id(`account:${A}`, ["filters", "PL_KEPT"]),
    source: sourceA,
    kind: "filter",
    facts: {
      playlist: "PL_KEPT",
      mode: "deny",
      on: false,
      channels: [
        [channel, "Synthetic channel", "@synthetic"],
        [unlabeled, ""]
      ],
      kept: true
    },
    destination: { kind: "account-filter", account: A, path: `doc:filter:${A}:PL_KEPT`, parentPath: `doc:setup:${A}` },
    comparison: { kind: "filter", filter: absent(`doc:filter:${A}:PL_KEPT`), parentSetup: absent(`doc:setup:${A}`), current: { kind: "unavailable" } }
  }
  const expected = {
    captureId: "capture-1",
    execution: "unavailable",
    items: [
      playlist(A, 0),
      playlist(A, 1),
      accountFilter,
      shortcut(A),
      playlist(C, 0),
      shortcut(C),
      {
        ...base,
        id: id("playlists", [0]),
        source: global,
        kind: "playlist",
        facts: { playlist: "PL_GLOBAL", takes: "videos", percentage: "shared-default" },
        destination: { kind: "unresolved-account", expected: "setup.autoAdd" },
        comparison: { kind: "unknown", reason: "destination-unresolved" }
      },
      {
        ...base,
        id: id("channelFilters", ["PL_ORPHAN"]),
        source: global,
        kind: "filter",
        facts: { playlist: "PL_ORPHAN", mode: "allow", on: false, channels: [[channel, "Global channel"]], kept: true },
        destination: { kind: "unresolved-account", expected: "filter-with-parent-setup" },
        comparison: { kind: "unknown", reason: "destination-unresolved" }
      },
      {
        ...base,
        id: id("addToPlaylistID", []),
        source: global,
        kind: "shortcut",
        facts: { playlist: "WL", originalAssociation: "not-supplied" },
        destination: { kind: "unresolved-account", expected: "setup.targets-with-original-shared-row" },
        comparison: { kind: "unknown", reason: "destination-unresolved" }
      }
    ],
    retainedEvidence: [
      { kind: "index", position: 0, identity: "representable", duplicateOf: null },
      { kind: "index", position: 1, identity: "representable", duplicateOf: 0 },
      { kind: "supporting-evidence", source: sourceA, cacheOnly: false, cachedPlaylists: 0, cachedAt: null, labels: 1 },
      { kind: "supporting-evidence", source: { kind: "account-body", account: D }, cacheOnly: true, cachedPlaylists: 1, cachedAt: 4, labels: 0 },
      { kind: "index-only", account: B, positions: [0, 1] },
      { kind: "supporting-evidence", source: global, cacheOnly: false, cachedPlaylists: 0, cachedAt: null, labels: 1 }
    ],
    blockers: [],
    sharedSettings: { document: settingsAbsent, rows: [] },
    canonicalUnclaimed: { kind: "absent" }
  }
  equal(
    opened.view.items.map(item => item.intent),
    Array(9).fill("none"),
    "nothing is preselected"
  )
  check(
    opened.view.items.every(item => item.source.kind !== "global" || (item.destination.kind === "unresolved-account" && item.comparison.kind === "unknown")),
    "global account is never guessed from inspection or saved accounts"
  )
  check(
    opened.view.items.every(item => item.kind !== "shortcut" || item.facts.originalAssociation === "not-supplied"),
    "conversion allocation never proves original shortcut association"
  )
  equal(opened.view, expected, "complete literal review distinguishes all source occurrences and unresolved globals")
  observations.push({
    label: "complete opening",
    value: { before: { source, canonical: { documents: {}, caches: {}, device: { kind: "undefined" }, unclaimed: { kind: "undefined" } } }, conversion: current.conversion, opened }
  })
  check(!JSON.stringify(opened.view).includes("GLOBAL_SOURCE___") && !JSON.stringify(opened.view).includes("commands"), "display never exposes adapter account or browser commands")
  const duplicateId = id(`account:${A}`, ["playlists", 1]),
    filterId = id(`account:${A}`, ["filters", "PL_KEPT"])
  const restored = reader.select({ current, item: duplicateId, intent: "restore" })
  check(restored.kind === "draft", "single duplicate selection is a draft")
  equal(
    restored.view.items.map(item => item.intent),
    ["none", "restore", "none", "none", "none", "none", "none", "none", "none"],
    "one duplicate restore never co-selects siblings"
  )
  equal(restored.view, { ...expected, items: expected.items.map((item, index) => ({ ...item, intent: index === 1 ? "restore" : "none" })) }, "complete literal restore draft")
  const discarded = reader.select({ current, item: filterId, intent: "discard" })
  check(discarded.kind === "draft", "discard is only a draft")
  equal(
    discarded.view,
    { ...expected, items: expected.items.map((item, index) => ({ ...item, intent: index === 1 ? "restore" : index === 2 ? "discard" : "none" })) },
    "complete literal discard draft retains every inactive row"
  )
  equal(JSON.stringify({ input, context, current }), before, "restore and discard drafts preserve complete source and canonical evidence")
  const cleared = reader.select({ current, item: duplicateId, intent: "none" })
  check(cleared.kind === "draft", "restore intent clears")
  equal(cleared.view, { ...expected, items: expected.items.map((item, index) => ({ ...item, intent: index === 2 ? "discard" : "none" })) }, "clearing restore affects only exact occurrence")
  equal(reader.select({ current, item: filterId, intent: "none" }), { kind: "draft", view: expected }, "clearing discard deletes nothing")
  equal(open(current).read(current), { kind: "review", view: expected }, "new explicit open resets every intent")
  equal(
    reader.select({ current, item: { ...duplicateId, captureId: "another" }, intent: "restore" }),
    { kind: "refused", reason: "unknown-item", current: { kind: "review", view: expected } },
    "unknown capture cannot transfer intent"
  )
  observations.push({
    label: "draft transitions",
    value: { restored, discarded, cleared, after: { source, canonical: { documents: {}, caches: {}, device: { kind: "undefined" }, unclaimed: { kind: "undefined" } } } }
  })

  const withDocuments = (documents: unknown, unclaimed: unknown = undefined) => observation({ ...input, canonical: { ...input.canonical, documents, unclaimed } })
  const stamp = (data: unknown) => ({ v: 1, gen: "canonical", at: 0, by: "other", data })
  const setup = { ...defaultSetup(), autoAdd: [{ pl: "PL_SAME", takes: "videos" }], targets: { conv01: "WL" } }
  const filter = {
    mode: "deny",
    on: false,
    channels: [
      [channel, "Synthetic channel", "@synthetic"],
      [unlabeled, ""]
    ]
  }
  const settings = defaultSettings()
  settings.shortcuts.list = [{ id: "conv01", key: null, label: "Allocated row", watchLaterOnEveryAccount: false }]
  const liveDocs = { "doc:settings": stamp(settings), [`doc:setup:${A}`]: stamp(setup), [`doc:filter:${A}:PL_KEPT`]: stamp(filter) }
  const matching = withDocuments(liveDocs),
    matchRead = open(matching).read(matching)
  check(matchRead.kind === "review", "colliding canonical choices are still reviewable")
  const matchPlaylist = matchRead.view.items[0],
    matchFilter = matchRead.view.items[2],
    matchShortcut = matchRead.view.items[3]
  check(matchPlaylist?.comparison.kind === "playlist" && matchPlaylist.comparison.currentChoiceMatch, "same current playlist is only a current-choice match")
  check(
    matchFilter?.comparison.kind === "filter" && matchFilter.comparison.current.kind === "live" && matchFilter.comparison.current.currentChoiceMatch,
    "same current filter is only a current-choice match"
  )
  check(
    matchShortcut?.comparison.kind === "shortcut" && matchShortcut.comparison.target.kind === "present" && matchShortcut.comparison.target.currentChoiceMatch,
    "same current target is only a current-choice match"
  )
  check(
    matchRead.view.items.every(item => item.restoration === "not-proven"),
    "matching bytes never prove restoration"
  )
  observations.push({ label: "same current content without receipt", value: { canonical: liveDocs, read: matchRead } })

  const collisionPaths = ["doc:settings", `doc:setup:${A}`, `doc:filter:${A}:PL_KEPT`]
  for (const path of collisionPaths)
    for (const state of ["live", "tombstone", "newer", "invalid"] as const) {
      const raw =
        state === "live"
          ? path === "doc:settings"
            ? stamp(settings)
            : path.startsWith("doc:setup:")
              ? stamp(setup)
              : stamp(filter)
          : state === "tombstone"
            ? { v: 1, gen: "canonical", at: 0, by: "other", deleted: true }
            : state === "newer"
              ? { v: 2, gen: "canonical", at: 0, by: "other", data: { unknown: true } }
              : { bad: true }
      const value = withDocuments({ [path]: raw }),
        read = open(value).read(value)
      check(value.conversion.kind === "blocked" && read.kind === "review", `${state} ${path} preserves review beside whole refusal`)
      check(
        read.view.blockers.some(blocker => blocker.path === path && blocker.reason === state),
        `${state} ${path} keeps whole converter blocker`
      )
      const fact = {
        path,
        presence: "present",
        state: state === "live" || state === "tombstone" ? { kind: state, generation: "canonical" } : state === "newer" ? { kind: "newer", version: 2 } : { kind: "invalid" }
      }
      const row = read.view.items[path === "doc:settings" ? 3 : path.startsWith("doc:filter:") ? 2 : 0]
      check(row, "collision row remains visible")
      if (path === "doc:settings") {
        check(row.comparison.kind === "shortcut", "shortcut includes Settings")
        equal(
          row.comparison,
          {
            kind: "shortcut",
            setup: absent(`doc:setup:${A}`),
            settings: fact,
            row: state === "live" ? { kind: "present", row: settings.shortcuts.list[0] } : { kind: "unknown" },
            sharedRowDependency: state === "live" ? "present" : "conflicting-settings",
            target: { kind: "unknown" }
          },
          `complete ${state} Settings comparison`
        )
      } else if (path.startsWith("doc:setup:")) {
        check(row.comparison.kind === "playlist", "playlist includes Setup")
        equal(
          row.comparison,
          {
            kind: "playlist",
            setup: fact,
            currentChoices: state === "live" ? [{ playlist: "PL_SAME", takes: "videos", percentage: { kind: "shared-default" } }] : [],
            currentChoiceMatch: state === "live"
          },
          `complete ${state} Setup comparison`
        )
        const retainedFilter = read.view.items[2]
        check(retainedFilter?.comparison.kind === "filter", "filter includes parent Setup")
        equal(retainedFilter.comparison.parentSetup, fact, "parent tombstone protects otherwise absent filter path")
      } else {
        check(row.comparison.kind === "filter", "filter has canonical comparison")
        equal(
          row.comparison,
          { kind: "filter", filter: fact, parentSetup: absent(`doc:setup:${A}`), current: state === "live" ? { kind: "live", value: filter, currentChoiceMatch: true } : { kind: "unavailable" } },
          `complete ${state} Filter comparison`
        )
      }
      const completeItems = expected.items.map((item, index) => {
        if (path === "doc:settings" && (index === 3 || index === 5))
          return {
            ...item,
            comparison: {
              kind: "shortcut",
              setup: absent(`doc:setup:${index === 3 ? A : C}`),
              settings: fact,
              row: state === "live" ? { kind: "present", row: settings.shortcuts.list[0] } : { kind: "unknown" },
              sharedRowDependency: state === "live" ? "present" : "conflicting-settings",
              target: { kind: "unknown" }
            }
          }
        if (path === `doc:setup:${A}`) {
          if (index === 0 || index === 1)
            return {
              ...item,
              comparison: {
                kind: "playlist",
                setup: fact,
                currentChoices: state === "live" ? [{ playlist: "PL_SAME", takes: "videos", percentage: { kind: "shared-default" } }] : [],
                currentChoiceMatch: state === "live"
              }
            }
          if (index === 2) return { ...item, comparison: { kind: "filter", filter: absent(`doc:filter:${A}:PL_KEPT`), parentSetup: fact, current: { kind: "unavailable" } } }
          if (index === 3)
            return {
              ...item,
              comparison: {
                kind: "shortcut",
                setup: fact,
                settings: settingsAbsent,
                row: { kind: "missing" },
                sharedRowDependency: "missing",
                target: state === "live" ? { kind: "present", playlist: "WL", currentChoiceMatch: true } : { kind: "unknown" }
              }
            }
        }
        if (path === `doc:filter:${A}:PL_KEPT` && index === 2)
          return {
            ...item,
            comparison: {
              kind: "filter",
              filter: fact,
              parentSetup: absent(`doc:setup:${A}`),
              current: state === "live" ? { kind: "live", value: filter, currentChoiceMatch: true } : { kind: "unavailable" }
            }
          }
        return item
      })
      const completeBlockers = [
        ...(path !== "doc:settings" && (state === "newer" || state === "invalid")
          ? [{ kind: state === "newer" ? "unsupported" : "invalid", path: "retained-evidence", reason: state === "newer" ? "newer-document-version" : "invalid-canonical-document" }]
          : []),
        ...(path === `doc:setup:${A}` && (state === "invalid" || state === "live") ? [{ kind: "collision", path, reason: state === "live" ? "reserved-shortcut-id" : "invalid" }] : []),
        { kind: "collision", path, reason: state }
      ]
      equal(
        read.view,
        {
          ...expected,
          items: completeItems,
          blockers: completeBlockers,
          sharedSettings: { document: path === "doc:settings" ? fact : settingsAbsent, rows: path === "doc:settings" && state === "live" ? settings.shortcuts.list : [] }
        },
        `complete literal ${state} ${path} review`
      )
      check(!Object.hasOwn(read.view, "documents") && read.view.execution === "unavailable", "collision yields no partial install or replacement operation")
      observations.push({ label: `${state} ${path}`, value: { canonical: { [path]: raw }, conversion: value.conversion, read } })
    }
  const futureSettings = { ...settings, shortcuts: { ...settings.shortcuts, list: settings.shortcuts.list.map(row => ({ ...row, privateExtension: "must-not-display" })) } }
  const futureFilter = { ...filter, privateExtension: "must-not-display" }
  const privateRaw = withDocuments({ "doc:settings": stamp(futureSettings), [`doc:filter:${A}:PL_KEPT`]: stamp(futureFilter) })
  const privateRead = open(privateRaw).read(privateRaw)
  check(privateRead.kind === "review" && !JSON.stringify(privateRead.view).includes("must-not-display"), "unknown canonical payload stays in private comparison rather than display")
  const nullDocument = withDocuments({ [`doc:setup:${A}`]: null }),
    nullRead = open(nullDocument).read(nullDocument)
  check(nullRead.kind === "review" && nullRead.view.items[0]?.comparison.kind === "playlist", "own null document is reviewable")
  equal(nullRead.view.items[0].comparison.setup, { path: `doc:setup:${A}`, presence: "present", state: { kind: "absent" } }, "own null presence survives decoder absence")

  for (const lifetime of ["absent", "consumed", "pending", "invalid"] as const) {
    const unclaimed =
      lifetime === "absent"
        ? undefined
        : lifetime === "consumed"
          ? null
          : lifetime === "invalid"
            ? { invalid: true }
            : { from: "1.5.0", autoAdd: ["PL_PENDING"], shortcutPlaylist: "WL", originalShortcutId: "orig01", filters: {}, at: 0 }
    const value = withDocuments({}, unclaimed),
      read = open(value).read(value)
    check(read.kind === "review", `${lifetime} Unclaimed remains separate from retained items`)
    equal(
      read.view.canonicalUnclaimed,
      lifetime === "pending"
        ? {
            kind: "pending",
            from: "1.5.0",
            playlists: ["PL_PENDING"],
            filters: [],
            shortcutPlaylist: "WL",
            original: { kind: "record-association", id: "orig01", row: { kind: "missing" }, targets: [] }
          }
        : { kind: lifetime },
      `complete ${lifetime} Unclaimed classification`
    )
    const globals = read.view.items.filter(item => item.source.kind === "global")
    equal(globals, lifetime === "invalid" ? [] : expected.items.slice(6), "Unclaimed consumption never consumes retained globals")
    if (lifetime === "invalid")
      equal(
        read.view.retainedEvidence,
        [
          { kind: "not-inspected", scope: "accounts" },
          { kind: "not-inspected", scope: "globals" }
        ],
        "early invalid canonical evidence never invents source inspections"
      )
    observations.push({ label: `${lifetime} independent Unclaimed`, value: read })
  }
  const pending = { from: "1.5.0", autoAdd: [], shortcutPlaylist: "WL", originalShortcutId: "orig01", filters: {}, at: 0 }
  const originalRow = { id: "orig01", key: { code: "KeyR", char: "r", ctrl: false, alt: false, shift: true, meta: false }, label: "Renamed original", watchLaterOnEveryAccount: false }
  const replacement = { ...originalRow, id: "copy01" }
  for (const provenance of ["renamed-original", "deleted-equal-replacement", "missing-provenance", "filled-target", "already-set-target", "reserved-original"] as const) {
    const rows = provenance === "deleted-equal-replacement" ? [replacement] : [originalRow]
    const canonicalSettings = { ...defaultSettings(), shortcuts: { ...defaultSettings().shortcuts, list: rows } }
    const target = provenance === "filled-target" ? "PL_OTHER" : provenance === "already-set-target" ? "WL" : undefined
    const docs = { "doc:settings": stamp(canonicalSettings), [`doc:setup:${A}`]: stamp({ ...defaultSetup(), targets: target ? { orig01: target } : {} }) }
    const record = provenance === "missing-provenance" ? { from: "1.5.0", autoAdd: [], shortcutPlaylist: "WL", filters: {}, at: 0 } : pending
    const ctx = provenance === "reserved-original" ? { ...context, interimShortcutId: "orig01" } : context
    const value = observation({ ...input, canonical: { ...input.canonical, documents: docs, unclaimed: record } }, ctx),
      read = open(value).read(value)
    check(read.kind === "review" && read.view.canonicalUnclaimed.kind === "pending", "pending original remains independently classified")
    equal(
      read.view.canonicalUnclaimed.original,
      provenance === "missing-provenance"
        ? { kind: "not-supplied" }
        : {
            kind: "record-association",
            id: "orig01",
            row: provenance === "deleted-equal-replacement" ? { kind: "missing" } : { kind: "present", row: originalRow },
            targets: [
              {
                account: A,
                path: `doc:setup:${A}`,
                field: ["targets", "orig01"],
                setup: { path: `doc:setup:${A}`, presence: "present", state: { kind: "live", generation: "canonical" } },
                target: target ? { kind: "present", playlist: target, currentChoiceMatch: target === "WL" } : { kind: "absent" }
              }
            ]
          },
      `${provenance} never guesses original association`
    )
    const globalShortcut = read.view.items[8]
    check(globalShortcut?.kind === "shortcut", "retained global shortcut stays visible")
    equal(globalShortcut, expected.items[8], "pending original is never assigned to retained global shortcut")
    const accountShortcut = read.view.items[3]
    check(accountShortcut?.kind === "shortcut" && accountShortcut.comparison.kind === "shortcut", "account target uses validated allocation")
    const allocated = provenance === "reserved-original" ? "orig01" : "conv01"
    equal(
      accountShortcut.destination,
      { kind: "account-target", account: A, path: `doc:setup:${A}`, field: ["targets", allocated], settingsPath: "doc:settings", rowId: allocated, association: "conversion-allocation" },
      "conversion allocation names only intended target field"
    )
    if (provenance === "reserved-original")
      check(
        read.view.blockers.some(b => b.reason === "reserved-original-shortcut-id"),
        "pending original allocation remains reserved"
      )
    observations.push({ label: provenance, value: { canonical: { documents: docs, unclaimed: record }, conversion: value.conversion, read } })
  }

  const baseline = withDocuments(liveDocs)
  const changes: { label: string; value: RecoveryObservation }[] = [
    { label: "generation", value: withDocuments({ ...liveDocs, "doc:settings": { ...liveDocs["doc:settings"], gen: "changed" } }) },
    { label: "unknown extension", value: withDocuments({ ...liveDocs, "doc:settings": { ...liveDocs["doc:settings"], future: { preserve: true } } }) },
    { label: "tombstone", value: withDocuments({ ...liveDocs, [`doc:setup:${A}`]: { v: 1, gen: "canonical", at: 0, by: "other", deleted: true } }) },
    { label: "source entry", value: observation({ ...input, source: { ...source, globals: { ...source.globals, playlists: ["PL_CHANGED"] } }, canonical: baseline.canonical }) },
    { label: "missing source key", value: observation({ ...input, source: { accountBodies: source.accountBodies, globals: source.globals }, canonical: baseline.canonical }) },
    { label: "schema", value: { ...baseline, schema: undefined } },
    { label: "allocated shortcut", value: observation({ ...input, canonical: baseline.canonical }, { ...context, interimShortcutId: "conv02" }) },
    { label: "Unclaimed lifetime", value: withDocuments(liveDocs, null) },
    { label: "capture identity", value: { ...baseline, captureId: "capture-2" } },
    { label: "cache extension", value: { ...baseline, canonical: { ...baseline.canonical, caches: { supporting: true } } } }
  ]
  for (const change of changes) {
    const reading = open(baseline),
      selecting = open(baseline)
    reading.select({ current: baseline, item: duplicateId, intent: "restore" })
    selecting.select({ current: baseline, item: filterId, intent: "discard" })
    const stale = reading.read(change.value),
      refused = selecting.select({ current: change.value, item: duplicateId, intent: "restore" })
    check(stale.kind === "stale", `stale review detects ${change.label}`)
    check(
      stale.view.items.every(item => item.intent === "none" && item.inactive),
      "staleness invalidates every draft while retaining inactive items"
    )
    equal(refused, { kind: "refused", reason: "stale", current: stale }, `${change.label} selection returns complete stale view`)
    equal(reading.read(baseline), stale, "A to B to A stays latched stale")
    equal(reading.select({ current: baseline, item: duplicateId, intent: "restore" }), { kind: "refused", reason: "stale", current: stale }, "stale source IDs never transfer an intent")
    observations.push({ label: `stale ${change.label}`, value: { current: change.value, stale, refused, returnedToOriginal: reading.read(baseline) } })
  }
  const mutable = structuredClone(baseline),
    mutableReader = open(mutable)
  if (mutable.conversion.kind === "blocked" || mutable.conversion.kind === "inactive-proposal") {
    const bodies = mutable.conversion.retention.source.accountBodies
    if (bodies !== null && typeof bodies === "object") Object.defineProperty(bodies, `account:${A}`, { value: { changed: true }, enumerable: true })
  }
  const mutated = mutableReader.read(mutable)
  check(mutated.kind === "stale", "private snapshot detects in-place retained source changes")
  equal(
    mutated.view.items.map(item => item.id),
    expected.items.map(item => item.id),
    "private display keeps original capture locations after source rewrite"
  )
  // A returned display is not the reader's mutable state.
  const isolated = open(current),
    exposed = isolated.read(current)
  if (exposed.kind === "review") Object.defineProperty(exposed.view.items[0], "intent", { value: "restore" })
  equal(isolated.read(current), { kind: "review", view: expected }, "caller mutation of display cannot select an item")

  let hooks = 0
  for (const kind of ["not-interim", "newer-layout"] as const) {
    const conversion = kind === "not-interim" ? { kind } : { kind, version: 2 }
    const early = Object.defineProperty({ captureId: "early", schema: 2, conversion, canonical: input.canonical }, "canonical", {
      enumerable: true,
      get() {
        hooks++
        throw new Error("unsafe later canonical getter")
      }
    })
    equal(open(early).read(early), { kind: "held", reason: kind }, "early held conversion never reads later fields")
  }
  const malformed: unknown[] = [
    undefined,
    [,],
    { nested: undefined },
    {
      toJSON() {
        hooks++
        return {}
      }
    }
  ]
  const cycle: { self?: unknown } = {}
  cycle.self = cycle
  malformed.push(
    cycle,
    Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        hooks++
        return 1
      }
    })
  )
  for (const value of malformed) {
    const badInput = { ...input, source: { ...source, accountBodies: value } },
      bad = observation(badInput)
    const held = open(bad)
    equal(held.read(bad), { kind: "held", reason: "unrepresentable-source" }, "unsafe raw source holds without normalizing or dropping evidence")
    equal(
      held.select({ current: bad, item: duplicateId, intent: "discard" }),
      { kind: "refused", reason: "held", current: { kind: "held", reason: "unrepresentable-source" } },
      "held source cannot be selected"
    )
    check((bad.conversion.kind === "blocked" || bad.conversion.kind === "inactive-proposal") && bad.conversion.retention.source === badInput.source, "malformed evidence remains the original object")
  }
  const unsafeComparison = {
    ...current,
    canonical: {
      ...current.canonical,
      documents: Object.defineProperty({}, "value", {
        enumerable: true,
        get() {
          hooks++
          return 1
        }
      })
    }
  }
  equal(open(unsafeComparison).read(unsafeComparison), { kind: "held", reason: "invalid-comparison" }, "unsafe comparison holds without invoking getters")
  const invalidBody = observation({ ...input, source: { ...source, accountBodies: { [`account:${A}`]: { rawRejected: "do-not-display" }, "account:unrepresentable-identity-value": empty() } } })
  const rejected = open(invalidBody).read(invalidBody)
  check(rejected.kind === "review" && rejected.view.retainedEvidence.some(e => e.kind === "rejected"), "rejected body and identity stay non-actionable retained summaries")
  check(
    !JSON.stringify(rejected.view).includes("do-not-display") && !JSON.stringify(rejected.view).includes("unrepresentable-identity-value"),
    "rejected payload and raw invalid identity never reach display"
  )
  equal(hooks, 0, "no getter or toJSON hook was invoked")
  equal(JSON.stringify({ input, context, current }), before, "whole retained source and canonical snapshot remain unchanged after all exercises")
  return {
    assertions,
    observations,
    opening: opened,
    drafts: { restored, discarded, cleared },
    after: { source, canonical: { documents: {}, caches: {}, device: { kind: "undefined" }, unclaimed: { kind: "undefined" } } },
    hooks
  }
}

test("read-only interim recovery review retains exact items, independent drafts and complete stale baselines", () => {
  const result = exerciseInterimRecoveryReview()
  expect(result.assertions.length).toBeGreaterThan(200)
  expect(result.hooks).toBe(0)
})

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const exactIdentity: Equal<RecoveryItemId, { readonly captureId: string; readonly sourceKey: string; readonly path: readonly (string | number)[] }> = true
const exactIntent: Equal<RecoveryIntent, "none" | "restore" | "discard"> = true
const exactObservation: Equal<
  RecoveryObservation,
  { readonly captureId: string; readonly schema: unknown; readonly conversion: ReturnType<typeof planInterimConversion>; readonly canonical: InterimConversionInput["canonical"] }
> = true
const exactReaderKeys: Equal<keyof RecoveryReviewReader, "read" | "select"> = true
const exactOpen: Equal<typeof openInterimRecoveryReview, (initial: RecoveryObservation) => RecoveryReviewReader> = true
const exactRead: Equal<RecoveryReviewReader["read"], (current: RecoveryObservation) => RecoveryReviewRead> = true
const exactSelect: Equal<
  RecoveryReviewReader["select"],
  (input: { readonly current: RecoveryObservation; readonly item: RecoveryItemId; readonly intent: RecoveryIntent }) => RecoverySelectionResult
> = true
void exactIdentity
void exactIntent
void exactObservation
void exactReaderKeys
void exactOpen
void exactRead
void exactSelect
function noExecutor(initial: RecoveryObservation, item: RecoveryItemId) {
  const reader = openInterimRecoveryReview(initial)
  // @ts-expect-error Review has no restore executor.
  reader.restore()
  // @ts-expect-error Review has no discard executor.
  reader.discard()
  // @ts-expect-error Review has no write port.
  reader.write()
  const read = reader.read(initial),
    selected = reader.select({ current: initial, item, intent: "discard" })
  // @ts-expect-error Read results contain no executable batch.
  read.batch.execute()
  // @ts-expect-error Draft results contain no executable batch.
  selected.batch.execute()
  if (read.kind === "review") {
    // @ts-expect-error Display views never contain canonical write candidates.
    read.view.documents
  }
}
void noExecutor
