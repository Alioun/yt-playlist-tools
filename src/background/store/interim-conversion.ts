import { isJsonValue } from "../../shared/contracts/json"
import { DecodeError, boolean, isRecord, natural, nonempty, text } from "../../shared/model/codec"
import { defaultSettings, defaultSetup } from "../../shared/model/defaults"
import { decodeDevice } from "../../shared/model/decodeDevice"
import { decodeFilter } from "../../shared/model/decodeFilter"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { decodeSetup } from "../../shared/model/decodeSetup"
import { readStoredUnclaimed } from "../../shared/model/decodeUnclaimed"
import { decodeDocument, decodeStamp, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION } from "../../shared/model/documents"
import { isKey } from "../../shared/model/keys"
import { isAccountKey, isPercent, isShortcutId, parseDocumentKey } from "../../shared/model/validation"
import type { ShortcutId } from "../../shared/model/validation"
import type { InterimProfileInspection } from "./interim-profile"
import type { Filter, Settings, Setup, Stamped } from "../../shared/model/types"
import { inspectInterimProfile } from "./interim-profile"
import { legacyShortcut } from "./legacy-shortcut"
import type { MigrationContext } from "./legacy-startup"

export type HistoricalFact =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly value: boolean }

export type InterimConversionInput = {
  readonly schema: unknown
  readonly source: {
    readonly accountBodies: unknown
    readonly savedAccountKeys?: unknown
    readonly sessionConsent?: unknown
    readonly sessionGeneration?: unknown
    readonly legacyClaimed?: unknown
    readonly globals: unknown
  }
  readonly canonical: {
    readonly documents: unknown
    readonly caches: unknown
    readonly device: unknown
    readonly unclaimed: unknown
  }
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
}
export type InterimConversionContext = Pick<MigrationContext, "deviceId" | "at" | "platform" | "commands"> & {
  readonly interimShortcutId: string
  readonly documentGenerations: Readonly<Record<string, string>>
}

export type InterimConversionBlocker = {
  readonly kind: "invalid" | "unsupported" | "collision"
  readonly path: string
  readonly reason: string
}
export type InterimDocumentCandidate =
  | { readonly kind: "settings"; readonly path: "doc:settings"; readonly document: Stamped<Settings> }
  | { readonly kind: "setup"; readonly path: string; readonly document: Stamped<Setup> }
  | { readonly kind: "filter"; readonly path: string; readonly document: Stamped<Filter> }
export type InterimCacheCandidate = {
  readonly path: string
  readonly data: {
    readonly listAt: number | null
    readonly playlists: readonly { readonly id: string; readonly title: string }[]
    readonly order: Record<string, never>
    readonly created: readonly never[]
    readonly labelAt: null
  }
}
export type InterimConversionNote = {
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
  readonly cleanup: { readonly kind: "not-attempted" }
  readonly percentage: { readonly kind: "saved"; readonly value: number } | { readonly kind: "interim-fallback"; readonly value: 50 }
  readonly feedback: { readonly kind: "saved"; readonly value: boolean } | { readonly kind: "interim-fallback"; readonly value: true }
  readonly freshAgreementRequired: true
  readonly globals:
    | { readonly kind: "explicit-review-required"; readonly source: unknown }
    | { readonly kind: "unclaimed-source"; readonly source: unknown }
}

export type ReviewInspection =
  | { readonly kind: "not-inspected" }
  | { readonly kind: "inspected"; readonly value: InterimProfileInspection }
export type InterimReviewFacts = {
  readonly accounts: ReviewInspection
  readonly globals: ReviewInspection
  readonly conversionShortcut:
    | { readonly kind: "not-validated" }
    | { readonly kind: "validated-context"; readonly id: ShortcutId }
}

type Retention = { readonly kind: "keep-original-source"; readonly source: InterimConversionInput["source"] }
export type InterimConversionPlan =
  | { readonly kind: "newer-layout"; readonly version: number }
  | { readonly kind: "not-interim" }
  | { readonly kind: "blocked"; readonly blockers: readonly InterimConversionBlocker[]; readonly retention: Retention; readonly reviewFacts: InterimReviewFacts }
  | {
    readonly kind: "inactive-proposal"
    readonly reviewFacts: InterimReviewFacts
    readonly documents: readonly InterimDocumentCandidate[]
    readonly caches: readonly InterimCacheCandidate[]
    readonly retention: Retention
    readonly note: InterimConversionNote
    readonly activation: "requires-fresh-agreement-and-future-executor"
  }

const sourceFields = ["accountBodies", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed", "globals"]
const globalFields = ["playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "channelFilters", "channelLabels", "cachedPlaylists", "preventDuplicates", "queueButtonEnabled", "cardContextMenu"]

function dataRecord(raw: unknown, path: string, allowed?: readonly string[]): Record<string, unknown> {
  if (!isRecord(raw)) throw new DecodeError(path, "a plain data object")
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new DecodeError(path, "enumerable string data properties")
    }
    if (allowed && !allowed.includes(key)) throw new DecodeError(`${path}.${key}`, "a supported field")
  }
  return raw
}

function jsonRecord(raw: unknown, path: string, allowed?: readonly string[]): Record<string, unknown> {
  const record = dataRecord(raw, path, allowed)
  if (!isJsonValue(record)) throw new DecodeError(path, "JSON data without hooks, holes, cycles or undefined")
  return record
}

function historicalFact(raw: unknown, path: string): HistoricalFact {
  const value = jsonRecord(raw, path)
  if (value.kind === "unknown" && Object.keys(value).length === 1) return { kind: "unknown" }
  if (value.kind === "known" && Object.keys(value).length === 2 && typeof value.value === "boolean") return { kind: "known", value: value.value }
  throw new DecodeError(path, "an explicit known or unknown historical fact")
}

function validateContext(context: InterimConversionContext): ShortcutId {
  dataRecord(context, "context", ["deviceId", "at", "platform", "commands", "interimShortcutId", "documentGenerations"])
  if (!isJsonValue(context)) throw new DecodeError("context", "JSON data")
  nonempty(context.deviceId, "context.deviceId")
  natural(context.at, "context.at")
  if (!isShortcutId(context.interimShortcutId)) throw new DecodeError("context.interimShortcutId", "a six-character shortcut ID")
  const platform = dataRecord(context.platform, "context.platform", ["browser", "os"])
  if (!["chrome", "firefox"].includes(String(platform.browser)) || !["macos", "windows", "linux"].includes(String(platform.os))) throw new DecodeError("context.platform", "a supported platform")
  if (!Array.isArray(context.commands)) throw new DecodeError("context.commands", "browser commands")
  for (const command of context.commands) {
    dataRecord(command, "context.commands", ["key", "command"])
    if (!isKey(command.key)) throw new DecodeError("context.commands.key", "a supported key")
    nonempty(command.command, "context.commands.command")
  }
  const generations = dataRecord(context.documentGenerations, "context.documentGenerations")
  for (const [path, gen] of Object.entries(generations)) {
    if (!parseDocumentKey(path)) throw new DecodeError(`context.documentGenerations.${path}`, "an exact canonical document path")
    nonempty(gen, `context.documentGenerations.${path}`)
  }
  return context.interimShortcutId
}

function stamp<T>(path: string, data: T, context: InterimConversionContext): Stamped<T> {
  const envelope = {
    v: DOCUMENT_VERSION, gen: Object.hasOwn(context.documentGenerations, path) ? context.documentGenerations[path] : undefined,
    at: context.at, by: context.deviceId
  }
  return { ...decodeStamp(envelope, `context.stamp.${path}`), data }
}

export function planInterimConversion(input: InterimConversionInput, context: InterimConversionContext): InterimConversionPlan {
  const blockers: InterimConversionBlocker[] = []
  let reviewFacts: InterimReviewFacts = { accounts: { kind: "not-inspected" }, globals: { kind: "not-inspected" }, conversionShortcut: { kind: "not-validated" } }
  // Retention references the caller's evidence. Malformed evidence must stay in its original store.
  const blocked = (): InterimConversionPlan => ({ kind: "blocked", blockers, reviewFacts, retention: { kind: "keep-original-source", source: input !== null && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "source")?.value : undefined } })
  try {
    if (!isRecord(input)) throw new DecodeError("input", "an explicit snapshot")
    const schemaProperty = Object.getOwnPropertyDescriptor(input, "schema")
    if (schemaProperty && !("value" in schemaProperty)) throw new DecodeError("schema", "a data property")
    const schema: unknown = schemaProperty?.value
    if (schema !== undefined && (typeof schema !== "number" || !Number.isSafeInteger(schema) || schema < 1)) throw new DecodeError("schema", "a positive schema version")
    if (typeof schema === "number" && schema > STORAGE_SCHEMA_VERSION) return { kind: "newer-layout", version: schema }
    dataRecord(input, "input", ["schema", "source", "canonical", "historicalAuthorization", "priorCredentialPresence"])
    const source = jsonRecord(input.source, "source", sourceFields)
    const bodies = dataRecord(source.accountBodies, "source.accountBodies")
    const globals = dataRecord(source.globals, "source.globals", globalFields)
    const interim = Object.keys(bodies).some(key => key.startsWith("account:")) ||
      ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].some(key => Object.hasOwn(source, key))
    if (!interim) return { kind: "not-interim" }
    const authorization = historicalFact(input.historicalAuthorization, "historicalAuthorization")
    const credentials = historicalFact(input.priorCredentialPresence, "priorCredentialPresence")
    const conversionShortcut = validateContext(context)
    reviewFacts = { ...reviewFacts, conversionShortcut: { kind: "validated-context", id: conversionShortcut } }
    const canonical = dataRecord(input.canonical, "canonical", ["documents", "caches", "device", "unclaimed"])
    const canonicalDocuments = jsonRecord(canonical.documents, "canonical.documents")
    const canonicalCaches = jsonRecord(canonical.caches, "canonical.caches")
    for (const path of Object.keys(canonicalCaches)) {
      if (!path.startsWith("cache:") || !isAccountKey(path.slice(6))) throw new DecodeError(`canonical.caches.${path}`, "a canonical cache path")
    }
    if (canonical.device !== undefined) {
      if (!isJsonValue(canonical.device)) throw new DecodeError("canonical.device", "JSON data")
      decodeDevice(canonical.device)
    }
    if (canonical.unclaimed !== undefined && !isJsonValue(canonical.unclaimed)) throw new DecodeError("canonical.unclaimed", "JSON data")
    const unclaimed = readStoredUnclaimed(canonical.unclaimed)
    const accountDocuments = Object.fromEntries(Object.entries(canonicalDocuments).filter(([path]) => path !== "doc:settings"))
    const inspection = inspectInterimProfile({
      accountBodies: bodies, canonicalDocuments: accountDocuments,
      ...Object.fromEntries(["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]])),
      ...(authorization.kind === "known" ? { historicalAuthorization: authorization.value } : {})
    })
    reviewFacts = { ...reviewFacts, accounts: { kind: "inspected", value: inspection } }
    blockers.push(...inspection.issues.map(issue => ({ kind: issue.kind, path: issue.field, reason: issue.reason })))
    const percentage: InterimConversionNote["percentage"] = Object.hasOwn(globals, "requiredWatchPercentage")
      ? { kind: "saved", value: (() => {
        if (!isPercent(globals.requiredWatchPercentage)) throw new DecodeError("source.globals.requiredWatchPercentage", "an integer percentage from 0 to 100")
        return globals.requiredWatchPercentage
      })() } : { kind: "interim-fallback", value: 50 }
    const feedback: InterimConversionNote["feedback"] = Object.hasOwn(globals, "toastEnabled")
      ? { kind: "saved", value: boolean(globals.toastEnabled, "source.globals.toastEnabled") } : { kind: "interim-fallback", value: true }
    for (const field of ["preventDuplicates", "queueButtonEnabled", "cardContextMenu"]) {
      if (Object.hasOwn(globals, field)) boolean(globals[field], `source.globals.${field}`)
    }
    // Validate retained global choices with the same body contract, without converting or claiming them.
    const globalInspection = inspectInterimProfile({ accountBodies: { "account:GLOBAL_SOURCE___": {
      playlists: Object.hasOwn(globals, "playlists") ? globals.playlists : [],
      shortcutPlaylistId: Object.hasOwn(globals, "addToPlaylistID") ? globals.addToPlaylistID : "",
      filters: Object.hasOwn(globals, "channelFilters") ? globals.channelFilters : {},
      labels: Object.hasOwn(globals, "channelLabels") ? globals.channelLabels : {},
      cachedPlaylists: Object.hasOwn(globals, "cachedPlaylists") ? globals.cachedPlaylists : [], cachedAt: null
    } }, canonicalDocuments: {} })
    reviewFacts = { ...reviewFacts, globals: { kind: "inspected", value: globalInspection } }
    blockers.push(...globalInspection.issues.map(issue => ({ kind: issue.kind, path: `source.globals.${issue.field}`, reason: issue.reason })))
    const rawKey = Object.hasOwn(globals, "watchLaterShortcut") ? text(globals.watchLaterShortcut, "source.globals.watchLaterShortcut") : ""
    const hasTarget = inspection.accounts.some(account => account.body.kind === "inspection" && account.body.facts.shortcut !== null)
    const key = legacyShortcut(rawKey, hasTarget, context).key
    if (rawKey !== "" && key === null) blockers.push({ kind: "unsupported", path: "source.globals.watchLaterShortcut", reason: "unsupported-shortcut-encoding" })
    if (rawKey !== "" && !hasTarget) blockers.push({ kind: "unsupported", path: "source.globals.watchLaterShortcut", reason: "key-without-account-target" })
    let settingsState: ReturnType<typeof decodeDocument<Settings>>
    try { settingsState = decodeDocument(canonicalDocuments["doc:settings"], decodeSettings) }
    catch (error) {
      if (!(error instanceof DecodeError)) throw error
      blockers.push({ kind: "collision", path: "doc:settings", reason: "invalid" })
      return blocked()
    }
    if (hasTarget) {
      for (const [path, raw] of Object.entries(accountDocuments)) {
        if (parseDocumentKey(path)?.kind !== "setup") continue
        try {
          const existing = decodeDocument(raw, decodeSetup)
          if (existing.kind === "value" && Object.hasOwn(existing.document.data.targets, context.interimShortcutId)) {
            blockers.push({ kind: "collision", path, reason: "reserved-shortcut-id" })
          }
        } catch (error) {
          if (!(error instanceof DecodeError)) throw error
          blockers.push({ kind: "collision", path, reason: "invalid" })
        }
      }
    }
    if (hasTarget && unclaimed.kind === "pending" && unclaimed.data.originalShortcutId === context.interimShortcutId) {
      blockers.push({ kind: "collision", path: "canonical.unclaimed.originalShortcutId", reason: "reserved-original-shortcut-id" })
    }
    const documents: InterimDocumentCandidate[] = []
    const caches: InterimCacheCandidate[] = []
    const accounts = inspection.accounts.filter(account => account.identity.kind === "representable" && account.body.kind === "inspection" && account.body.facts.choices === "present")
    const needsSettings = accounts.length > 0 || Object.hasOwn(globals, "requiredWatchPercentage") || Object.hasOwn(globals, "toastEnabled")
    if (needsSettings) {
      if (settingsState.kind !== "absent") blockers.push({ kind: "collision", path: "doc:settings", reason: settingsState.kind === "value" ? "live" : settingsState.kind === "deleted" ? "tombstone" : "newer" })
      const settings = defaultSettings()
      settings.autoAdd = { ...settings.autoAdd, on: accounts.some(account => account.body.kind === "inspection" && account.body.facts.playlists.length > 0), pct: percentage.value, feedback: feedback.value }
      settings.shortcuts = { ...settings.shortcuts, on: hasTarget && key !== null, feedback: feedback.value,
        list: hasTarget ? [{ id: context.interimShortcutId, key, label: "", watchLaterOnEveryAccount: false }] : [] }
      documents.push({ kind: "settings", path: "doc:settings", document: stamp("doc:settings", settings, context) })
    }
    for (const account of accounts) {
      if (account.identity.kind !== "representable" || account.body.kind !== "inspection") continue
      const { key: acct } = account.identity
      const facts = account.body.facts
      const setup = defaultSetup()
      setup.autoAdd = facts.playlists.map(pl => ({ pl, takes: "videos" }))
      if (facts.shortcut) setup.targets = { [context.interimShortcutId]: facts.shortcut.playlist }
      const path = `doc:setup:${acct}`
      documents.push({ kind: "setup", path, document: stamp(path, setup, context) })
      for (const filter of facts.filters) {
        const channels: Filter["channels"] = filter.channels.map(channel => {
          const label = facts.labels.find(value => value.channel === channel)
          return label?.handle === undefined ? [channel, label?.title ?? ""] : [channel, label.title, label.handle]
        })
        if (channels.some(channel => Array.from(channel[1]).length > 100 || (channel[2] !== undefined && Array.from(channel[2]).length > 30))) {
          blockers.push({ kind: "unsupported", path: `doc:filter:${acct}:${filter.playlist}`, reason: "writer-would-truncate-label" })
        }
        const filterPath = `doc:filter:${acct}:${filter.playlist}`
        documents.push({ kind: "filter", path: filterPath, document: stamp(filterPath, { mode: filter.mode, on: filter.on, channels }, context) })
      }
      if (facts.cache.at !== null || facts.cache.playlists.length > 0) {
        const cachePath = `cache:${acct}`
        if (Object.hasOwn(canonicalCaches, cachePath)) blockers.push({ kind: "collision", path: cachePath, reason: "existing-cache" })
        caches.push({ path: cachePath, data: { listAt: facts.cache.at, playlists: facts.cache.playlists, order: {}, created: [], labelAt: null } })
      }
    }
    for (const candidate of documents) {
      try {
        const raw = Object.hasOwn(canonicalDocuments, candidate.path) ? canonicalDocuments[candidate.path] : undefined
        const existing = candidate.kind === "settings" ? decodeDocument(raw, decodeSettings) : candidate.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter)
        if (candidate.kind !== "settings" && existing.kind !== "absent") blockers.push({ kind: "collision", path: candidate.path, reason: existing.kind === "value" ? "live" : existing.kind === "deleted" ? "tombstone" : "newer" })
        const decoded = candidate.kind === "settings" ? decodeDocument(candidate.document, decodeSettings) : candidate.kind === "setup" ? decodeDocument(candidate.document, decodeSetup) : decodeDocument(candidate.document, decodeFilter)
        if (decoded.kind !== "value" || !isJsonValue(decoded.document)) throw new DecodeError(candidate.path, "a JSON canonical document")
      } catch (error) {
        if (!(error instanceof DecodeError)) throw error
        blockers.push({ kind: "collision", path: candidate.path, reason: "invalid" })
      }
    }
    if (blockers.length) return blocked()
    return {
      kind: "inactive-proposal", reviewFacts, documents, caches, retention: { kind: "keep-original-source", source: input.source },
      note: { historicalAuthorization: authorization, priorCredentialPresence: credentials, cleanup: { kind: "not-attempted" }, percentage, feedback, freshAgreementRequired: true,
        globals: { kind: source.legacyClaimed === true && Object.keys(globals).length > 0 ? "explicit-review-required" : "unclaimed-source", source: globals } },
      activation: "requires-fresh-agreement-and-future-executor"
    }
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    blockers.push({ kind: "invalid", path: error.path, reason: error.message.slice(error.path.length + 2) })
    return blocked()
  }
}
