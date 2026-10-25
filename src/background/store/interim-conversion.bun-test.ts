import { expect, test } from "bun:test"
import { decodeDocument, decodeFilter, decodeSettings, decodeSetup, defaultDevice, defaultSettings, defaultSetup } from "../../shared/model"
import { isJsonValue } from "../../shared/contracts/json"
import { convertLegacy } from "./legacy"
import { planInterimConversion } from "./interim-conversion"
import type { MigrationContext } from "./legacy-startup"
import type { HistoricalFact, InterimConversionContext, InterimConversionInput, InterimConversionPlan } from "./interim-conversion"

export function exerciseInterimConversion(plan: typeof planInterimConversion, dependencies: {
  decodeDocument: typeof decodeDocument
  decodeFilter: typeof decodeFilter
  decodeSettings: typeof decodeSettings
  decodeSetup: typeof decodeSetup
  defaultDevice: typeof defaultDevice
  defaultSettings: typeof defaultSettings
  defaultSetup: typeof defaultSetup
  isJsonValue: typeof isJsonValue
  convertLegacy: typeof convertLegacy
}) {
  const assertions: string[] = []
  function check(value: unknown, label: string): asserts value {
    if (!value) throw new Error(label)
    assertions.push(label)
  }
  function equal(actual: unknown, expected: unknown, label: string): void {
    function same(a: unknown, b: unknown): boolean {
      if (Object.is(a, b)) return true
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
      const keys = Reflect.ownKeys(a)
      if (keys.length !== Reflect.ownKeys(b).length) return false
      return keys.every(key => {
        const ad = Object.getOwnPropertyDescriptor(a, key)
        const bd = Object.getOwnPropertyDescriptor(b, key)
        return ad && bd && "value" in ad && "value" in bd && same(ad.value, bd.value)
      })
    }
    check(same(actual, expected), label)
  }
  function freeze<T>(value: T, seen = new Set<object>()): T {
    if (value !== null && typeof value === "object" && !seen.has(value)) {
      seen.add(value)
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor && "value" in descriptor) freeze(descriptor.value, seen)
      }
      Object.freeze(value)
    }
    return value
  }
  const A = "AAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBB", C = "CCCCCCCCCCCCCCCC", D = "DDDDDDDDDDDDDDDD"
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa", unlabeled = "UCbbbbbbbbbbbbbbbbbbbbbb", spare = "UCcccccccccccccccccccccc"
  const emptyBody = () => ({ playlists: [], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null })
  const bodyA = {
    playlists: ["PL_TWO", "PL_ONE"], shortcutPlaylistId: "WL",
    filters: {
      PL_ONE: { mode: "allow", enabled: true, channels: [channel] },
      PL_KEPT: { mode: "deny", enabled: false, channels: [channel, unlabeled] },
      PL_ORPHAN: { mode: "allow", enabled: false, channels: [] }
    },
    labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" }, [spare]: { title: "Unreferenced retained label" } },
    cachedPlaylists: [{ id: "PL_ONE", title: "Synthetic cached title" }], cachedAt: 7
  }
  const bodyB = { ...emptyBody(), playlists: ["PL_B"], shortcutPlaylistId: "PL_TARGET_B" }
  const source = {
    accountBodies: { [`account:${A}`]: bodyA, [`account:${B}`]: bodyB, [`account:${D}`]: { ...emptyBody(), cachedPlaylists: [{ id: "PL_ONLY_CACHE", title: "Never an account label" }], cachedAt: 9 } },
    savedAccountKeys: [A, C], sessionConsent: 1, sessionGeneration: "", legacyClaimed: false,
    globals: { playlists: ["PL_GLOBAL"], addToPlaylistID: "PL_GLOBAL_TARGET", watchLaterShortcut: "Control+Shift+S", requiredWatchPercentage: 82, toastEnabled: false, preventDuplicates: false, queueButtonEnabled: true, cardContextMenu: true }
  }
  const input: InterimConversionInput = { schema: 1, source, canonical: { documents: {}, caches: {}, device: undefined, unclaimed: undefined }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }
  const paths = ["doc:settings", `doc:setup:${A}`, `doc:filter:${A}:PL_ONE`, `doc:filter:${A}:PL_KEPT`, `doc:filter:${A}:PL_ORPHAN`, `doc:setup:${B}`]
  const context: InterimConversionContext = { deviceId: "synthetic-device", at: 123, platform: { browser: "firefox", os: "linux" }, commands: [], interimShortcutId: "conv01", documentGenerations: Object.fromEntries(paths.map((path, index) => [path, `generation-${index}`])) }
  const snapshotBefore = JSON.stringify(input), contextBefore = JSON.stringify(context)
  freeze(input); freeze(context)
  const result = plan(input, context)
  check(result.kind === "inactive-proposal", "main fixture is an inactive proposal")
  const stamp = (index: number, data: unknown) => ({ v: 1, gen: `generation-${index}`, at: 123, by: "synthetic-device", data })
  const expectedSettings = dependencies.defaultSettings()
  expectedSettings.autoAdd = { on: true, feedback: false, pct: 82, toolbarTick: true, toolbarPaused: true }
  expectedSettings.shortcuts = { on: true, feedback: false, music: true, preset: false, picker: null, list: [{ id: "conv01", key: { code: "KeyS", char: "s", ctrl: true, alt: false, shift: true, meta: false }, label: "", watchLaterOnEveryAccount: false }] }
  const expectedDocuments = [
    { kind: "settings", path: "doc:settings", document: stamp(0, expectedSettings) },
    { kind: "setup", path: `doc:setup:${A}`, document: stamp(1, { label: null, autoAdd: [{ pl: "PL_TWO", takes: "videos" }, { pl: "PL_ONE", takes: "videos" }], targets: { conv01: "WL" }, quickSave: null, musicSave: null, gather: null, marks: {} }) },
    { kind: "filter", path: `doc:filter:${A}:PL_ONE`, document: stamp(2, { mode: "allow", on: true, channels: [[channel, "Synthetic channel", "@synthetic"]] }) },
    { kind: "filter", path: `doc:filter:${A}:PL_KEPT`, document: stamp(3, { mode: "deny", on: false, channels: [[channel, "Synthetic channel", "@synthetic"], [unlabeled, ""]] }) },
    { kind: "filter", path: `doc:filter:${A}:PL_ORPHAN`, document: stamp(4, { mode: "allow", on: false, channels: [] }) },
    { kind: "setup", path: `doc:setup:${B}`, document: stamp(5, { label: null, autoAdd: [{ pl: "PL_B", takes: "videos" }], targets: { conv01: "PL_TARGET_B" }, quickSave: null, musicSave: null, gather: null, marks: {} }) }
  ]
  equal(result.documents, expectedDocuments, "complete canonical candidates preserve order, WL, shared identity, filters and unlabeled channels")
  equal(result.caches, [{ path: `cache:${A}`, data: { listAt: 7, playlists: [{ id: "PL_ONE", title: "Synthetic cached title" }], order: {}, created: [], labelAt: null } }], "complete cache candidates exclude cache-only and index-only accounts")
  equal(result.note, { historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" }, cleanup: { kind: "not-attempted" }, percentage: { kind: "saved", value: 82 }, feedback: { kind: "saved", value: false }, freshAgreementRequired: true, globals: { kind: "unclaimed-source", source: source.globals } }, "complete truthful local note retains inactive global controls")
  check(result.retention.source === input.source, "retention is the exact original source")
  equal(Object.keys(result).sort(), ["activation", "caches", "documents", "kind", "note", "retention"], "proposal exposes no activation, cleanup or writer authority")
  equal(result.activation, "requires-fresh-agreement-and-future-executor", "activation requires a later executor and agreement")
  const decoded = result.documents.map(candidate => {
    const value = candidate.kind === "settings" ? dependencies.decodeDocument(candidate.document, dependencies.decodeSettings) : candidate.kind === "setup" ? dependencies.decodeDocument(candidate.document, dependencies.decodeSetup) : dependencies.decodeDocument(candidate.document, dependencies.decodeFilter)
    equal(value, { kind: "value", document: candidate.document }, `real canonical decoder ${candidate.path}`)
    return value
  })
  check(dependencies.isJsonValue({ documents: result.documents, caches: result.caches, note: result.note, source: result.retention.source }), "complete proposal data is strict JSON")
  const receipt = { source: result.retention.source, note: result.note }
  equal(JSON.parse(JSON.stringify(receipt)), receipt, "JSON receipt preserves every valid source and note field")
  equal(plan(input, context), result, "planning is deterministic")
  equal(JSON.stringify(input), snapshotBefore, "frozen input remains exact")
  equal(JSON.stringify(context), contextBefore, "frozen context remains exact")

  const observations: { label: string; result: InterimConversionPlan }[] = []
  function observe(label: string, snapshot: InterimConversionInput, ctx = context) {
    const before = JSON.stringify(snapshot)
    const planned = plan(freeze(snapshot), freeze(ctx))
    equal(JSON.stringify(snapshot), before, `${label} preserves the complete snapshot`)
    observations.push({ label, result: planned })
    return planned
  }
  function refused(label: string, snapshot: InterimConversionInput, path?: string, reason?: string, ctx = context) {
    const planned = observe(label, snapshot, ctx)
    check(planned.kind === "blocked", `${label} is blocked`)
    check(planned.retention.source === snapshot.source, `${label} retains original evidence`)
    equal(Object.keys(planned).sort(), ["blockers", "kind", "retention"], `${label} returns no partial candidate batch`)
    if (path) check(planned.blockers.some(blocker => blocker.path === path && (reason === undefined || blocker.reason === reason)), `${label} reports exact conflict path and reason`)
    return planned
  }
  function globalsCase(globals: unknown): InterimConversionInput { return { ...input, source: { ...source, globals } } }
  for (const field of ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"] as const) {
    const marker = field === "savedAccountKeys" ? [] : field === "sessionConsent" ? 0 : field === "sessionGeneration" ? "" : false
    const planned = observe(`presence ${field}`, { ...input, source: { accountBodies: {}, globals: {}, [field]: marker } })
    check(planned.kind === "inactive-proposal", `empty or false ${field} recognizes interim schema 1`)
    equal(planned.documents, [], `${field} alone invents no canonical choices`)
  }
  const accountMarker = observe("empty account family", { ...input, source: { accountBodies: { [`account:${A}`]: emptyBody() }, globals: {} } })
  check(accountMarker.kind === "inactive-proposal" && accountMarker.documents.length === 0, "account family recognizes without inventing an account")
  equal(observe("schema is not interim evidence", { ...input, source: { accountBodies: {}, globals: {} } }), { kind: "not-interim" }, "schema 1 alone is not interim")
  let hookCalls = 0
  const poisoned = Object.defineProperty({ ...input, schema: 2 }, "source", { get() { hookCalls++; throw new Error("source getter invoked") }, enumerable: true })
  equal(plan(poisoned, context), { kind: "newer-layout", version: 2 }, "newer schema short circuits poisoned fields")
  equal(hookCalls, 0, "newer schema invokes no later getter")
  for (const history of [{ kind: "unknown" }, { kind: "known", value: false }, { kind: "known", value: true }] satisfies HistoricalFact[]) {
    const planned = observe(`history ${JSON.stringify(history)}`, { ...globalsCase({}), historicalAuthorization: history, priorCredentialPresence: history })
    check(planned.kind === "inactive-proposal", "each history variant is representable")
    equal(planned.note.historicalAuthorization, history, "authorization history remains distinct")
    equal(planned.note.priorCredentialPresence, history, "credential history remains independently explicit")
    equal(planned.note.percentage, { kind: "interim-fallback", value: 50 }, "interim absent percentage always defaults to 50")
    equal(planned.note.feedback, { kind: "interim-fallback", value: true }, "interim absent feedback stays on")
  }
  for (const value of [0, 82, 100]) {
    const planned = observe(`saved percentage ${value}`, globalsCase({ requiredWatchPercentage: value }))
    check(planned.kind === "inactive-proposal", "saved integer percentage accepted")
    equal(planned.note.percentage, { kind: "saved", value }, "explicit saved percentage is not defaulted")
  }
  const keyless = observe("keyless target", globalsCase({ watchLaterShortcut: "" }))
  check(keyless.kind === "inactive-proposal", "keyless targets survive")
  const keylessSettings = keyless.documents.find(candidate => candidate.kind === "settings")
  check(keylessSettings?.kind === "settings", "keyless targets have Settings")
  equal(keylessSettings.document.data.shortcuts.list, [{ id: "conv01", key: null, label: "", watchLaterOnEveryAccount: false }], "keyless row retains target association")
  for (const fact of [undefined, null, { from: "1.5.0", autoAdd: ["PL_PENDING"], shortcutPlaylist: "PL_OLD", originalShortcutId: "orig01", filters: {}, at: 3 }]) {
    const snapshot = { ...input, source: { ...source, legacyClaimed: true }, canonical: { ...input.canonical, unclaimed: fact, device: dependencies.defaultDevice("synthetic-device") } }
    const planned = observe(`recovery with unclaimed ${fact === undefined ? "absent" : fact === null ? "consumed" : "pending"}`, snapshot)
    check(planned.kind === "inactive-proposal", "global recovery does not require changing canonical authority")
    equal(planned.note.globals, { kind: "explicit-review-required", source: source.globals }, "agreement or account presence never restores retained globals")
    check(!JSON.stringify(planned.note).includes("originalShortcutId"), "note assigns no original shortcut provenance")
  }
  const reserved = { from: "1.5.0", autoAdd: [], shortcutPlaylist: "PL_OLD", originalShortcutId: "conv01", filters: {}, at: 3 }
  refused("deleted original reservation", { ...input, canonical: { ...input.canonical, unclaimed: reserved } }, "canonical.unclaimed.originalShortcutId", "reserved-original-shortcut-id")
  for (const path of ["doc:settings", `doc:setup:${A}`, `doc:filter:${A}:PL_KEPT`]) {
    const candidate = result.documents.find(value => value.path === path)
    check(candidate, "collision fixture has a real candidate")
    for (const state of ["live", "tombstone", "newer", "invalid"] as const) {
      const raw = state === "live" ? candidate.document : state === "tombstone" ? { v: 1, gen: "later", at: 1, by: "other", deleted: true } : state === "newer" ? { v: 2, gen: "future", at: 1, by: "other", data: {} } : { bad: true }
      const planned = refused(`${state} ${path}`, { ...input, canonical: { ...input.canonical, documents: { [path]: raw } } })
      check(planned.blockers.some(value => value.path === path && value.reason === state), "collision has the exact live/tombstone/newer/invalid reason")
    }
  }
  const unrelated = observe("unrelated canonical account", { ...input, canonical: { ...input.canonical, documents: { [`doc:setup:${C}`]: { v: 1, gen: "existing", at: 0, by: "other", data: dependencies.defaultSetup() } } } })
  equal(unrelated, result, "unrelated canonical setup need not block")
  refused("existing affected cache", { ...input, canonical: { ...input.canonical, caches: { [`cache:${A}`]: { untouched: true } } } }, `cache:${A}`, "existing-cache")
  refused("17 character account", { ...input, source: { ...source, accountBodies: { "account:AAAAAAAAAAAAAAAAA": bodyA } } })
  refused("101 character playlist", { ...input, source: { ...source, accountBodies: { [`account:${A}`]: { ...bodyA, playlists: ["P".repeat(101)] } } } })
  refused("unknown source extension", { ...input, source: Object.assign({}, source, { future: false }) })
  refused("unknown account extension", { ...input, source: { ...source, accountBodies: { [`account:${A}`]: { ...bodyA, future: false } } } })
  refused("unsupported extra control", globalsCase({ requestedNewFeature: true }))
  for (const value of [null, "82", 82.5, -1, 101]) refused(`malformed percentage ${JSON.stringify(value)}`, globalsCase({ requiredWatchPercentage: value }))
  for (const value of [null, "true", 1]) refused(`malformed feedback ${JSON.stringify(value)}`, globalsCase({ toastEnabled: value }))
  for (const raw of ["Shift++", "Control+Alt+S", "Tab"]) refused(`unsupported shortcut ${raw}`, globalsCase({ watchLaterShortcut: raw }), "source.globals.watchLaterShortcut", "unsupported-shortcut-encoding")
  refused("key-only association", { ...input, source: { accountBodies: {}, sessionConsent: 1, globals: { watchLaterShortcut: "Shift+S" } } }, "source.globals.watchLaterShortcut", "key-without-account-target")
  for (const label of [{ title: "🙂".repeat(101) }, { title: "kept", handle: "x".repeat(31) }]) {
    refused("writer would truncate label", { ...input, source: { ...source, accountBodies: { [`account:${A}`]: { ...bodyA, labels: { [channel]: label } } } } })
  }
  for (const ctx of [{ ...context, interimShortcutId: "short" }, { ...context, at: -1 }, { ...context, documentGenerations: {} }, { ...context, documentGenerations: { ...context.documentGenerations, "doc:settings": "" } }]) refused("invalid supplied stamp or identity", input, undefined, undefined, ctx)
  const crossedHistory = observe("independent unknown authorization and known credential presence", { ...input, priorCredentialPresence: { kind: "known", value: true } })
  check(crossedHistory.kind === "inactive-proposal", "independent history facts are accepted")
  equal(crossedHistory.note.historicalAuthorization, { kind: "unknown" }, "known credential presence does not establish authorization")
  equal(crossedHistory.note.priorCredentialPresence, { kind: "known", value: true }, "known credential presence remains known")
  refused("unknown top-level snapshot field", Object.assign({}, input, { extension: false }))
  refused("unknown canonical snapshot field", { ...input, canonical: Object.assign({}, input.canonical, { extension: false }) })
  refused("unrepresentable raw account name", { ...input, source: { ...source, accountBodies: { "account:__proto__": bodyA } } })
  refused("own unusual canonical path", { ...input, canonical: { ...input.canonical, documents: JSON.parse('{"__proto__":null}') } })
  const duplicateChoices = observe("duplicate source choices", { ...input, source: { ...source, accountBodies: { [`account:${A}`]: { ...bodyA, playlists: ["PL_ONE", "PL_ONE"] } } } })
  check(duplicateChoices.kind === "inactive-proposal", "duplicate choices are representable without normalization")
  const duplicateSetup = duplicateChoices.documents.find(candidate => candidate.kind === "setup")
  check(duplicateSetup?.kind === "setup", "duplicate choices have their original setup")
  equal(duplicateSetup.document.data.autoAdd, [{ pl: "PL_ONE", takes: "videos" }, { pl: "PL_ONE", takes: "videos" }], "duplicate choices are never silently deduplicated")
  const reservedOther = { ...dependencies.defaultSetup(), targets: { conv01: "PL_OLD" } }
  refused("existing unrelated shortcut ID reservation", { ...input, canonical: { ...input.canonical, documents: { [`doc:setup:${C}`]: { v: 1, gen: "reserved", at: 0, by: "other", data: reservedOther } } } }, `doc:setup:${C}`, "reserved-shortcut-id")
  const exactLabel = observe("maximum code point label", { ...input, source: { ...source, accountBodies: { [`account:${A}`]: { ...bodyA, labels: { [channel]: { title: "🙂".repeat(100), handle: "x".repeat(30) } } } } } })
  check(exactLabel.kind === "inactive-proposal", "writer boundary accepts exactly 100 title code points and 30 handle code points")
  const unusual = JSON.parse('{"__proto__":{"keep":"exact"},"constructor":false}')
  const unusualSource = { ...source, globals: unusual }
  refused("own unusual global keys", { ...input, source: unusualSource })
  equal(Object.getPrototypeOf(unusual), Object.prototype, "own __proto__ never mutates a prototype")
  const nullBodies = Object.assign(Object.create(null), source.accountBodies)
  equal(observe("null prototype body map", { ...input, source: { ...source, accountBodies: nullBodies } }), result, "plain null prototype maps remain safe")
  const malformed: unknown[] = [undefined, [,], { nested: undefined }, { toJSON() { hookCalls++; return {} } }]
  const cycle: { self?: unknown } = {}; cycle.self = cycle
  malformed.push(cycle, Object.defineProperty({}, "value", { enumerable: true, get() { hookCalls++; return 1 } }))
  for (let index = 0; index < malformed.length; index++) {
    const snapshot = { ...input, source: { ...source, accountBodies: malformed[index] } }
    const planned = plan(snapshot, context)
    check(planned.kind === "blocked" && planned.retention.source === snapshot.source, `malformed evidence ${index} stays original without JSON roundtrip`)
    check(!Object.hasOwn(planned, "documents"), "malformed evidence produces no partial batch")
  }
  const sourceAccessor = Object.defineProperty({ ...input }, "source", { enumerable: true, get() { hookCalls++; throw new Error("source accessor invoked") } })
  const contextAccessor = Object.defineProperty({ ...context }, "commands", { enumerable: true, get() { hookCalls++; throw new Error("context accessor invoked") } })
  check(plan(sourceAccessor, context).kind === "blocked", "snapshot source accessor is refused without invocation")
  check(plan(input, contextAccessor).kind === "blocked", "context accessor is refused without invocation")
  equal(hookCalls, 0, "no getter or toJSON hook was invoked")
  for (const authorized of [false, true]) {
    const legacy = dependencies.convertLegacy({ presentKeys: authorized ? ["refreshToken"] : [], values: {}, refreshTokenWasNonempty: authorized })
    equal(legacy.pct.value, authorized ? 0 : 50, "original known legacy fallback is unchanged")
    equal(dependencies.convertLegacy({ presentKeys: authorized ? ["refreshToken", "requiredWatchPercentage"] : ["requiredWatchPercentage"], values: { requiredWatchPercentage: 82 }, refreshTokenWasNonempty: authorized }).pct.value, 82, "original legacy saved percentage stays explicit")
  }
  return { assertions, result, decoded, receipt, observations, hookCalls }
}

const dependencies = { decodeDocument, decodeFilter, decodeSettings, decodeSetup, defaultDevice, defaultSettings, defaultSetup, isJsonValue, convertLegacy }

test("interim conversion preserves complete proposals and refuses unsafe mappings with exact source retention", () => {
  const observation = exerciseInterimConversion(planInterimConversion, dependencies)
  expect(observation.assertions.length).toBeGreaterThan(200)
  expect(observation.hookCalls).toBe(0)
})

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type ExpectedInput = {
  readonly schema: unknown
  readonly source: { readonly accountBodies: unknown; readonly savedAccountKeys?: unknown; readonly sessionConsent?: unknown; readonly sessionGeneration?: unknown; readonly legacyClaimed?: unknown; readonly globals: unknown }
  readonly canonical: { readonly documents: unknown; readonly caches: unknown; readonly device: unknown; readonly unclaimed: unknown }
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
}
type ExpectedContext = Pick<MigrationContext, "deviceId" | "at" | "platform" | "commands"> & { readonly interimShortcutId: string; readonly documentGenerations: Readonly<Record<string, string>> }
const exactApi: Equal<typeof planInterimConversion, (input: ExpectedInput, context: ExpectedContext) => InterimConversionPlan> = true
void exactApi

function exactPublicApi(input: InterimConversionInput, context: InterimConversionContext): InterimConversionPlan {
  const plan = planInterimConversion(input, context)
  // @ts-expect-error A proposal never exposes an executable write batch.
  plan.write
  // @ts-expect-error Legacy shortcut identity is not conversion provenance.
  context.shortcutId
  return plan
}
void exactPublicApi
