import {
  DOCUMENT_VERSION,
  DecodeError,
  decodeDocument,
  decodeFilter,
  decodeSettings,
  decodeSetup,
  decodeLastAccount,
  decodeSyncState,
  defaultSettings,
  documentKey,
  isAccountKey,
  isPlaylistId,
  isSetupEmpty,
  parseDocumentKey,
  type AccountKey,
  type Device,
  type DocumentKey,
  type Filter,
  type Settings,
  type Setup,
  LAST_ACCOUNT_KEY
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ImportPlan } from "../../shared/settings-file"
import { filterShape, settingsShape, setupShape, type project } from "../../shared/settings-file/shape"
import { planSetupRemoval, type SetupRemoval } from "./accounts"
import { planAccountSessionRemoval, type RemovalSessionEffect } from "./account-removal-session"
import { readConsentDevice, type ConsentStateV1 } from "./consent-withdrawal"
import { prepareFirstEditHistory, type FirstEditHistoryPatch } from "./first-edit-provenance"
import { planSyncWrite, type SyncWritePlan } from "./sync-write-admission"
import { materializeDocumentBody, prepareDocumentBody, type PrepareBodyInput } from "./write-preparation"

type AccountDocumentKey = Exclude<DocumentKey, { kind: "settings" }>
type Presence = { readonly kind: "absent" } | { readonly kind: "present"; readonly document: JsonObject }
export type ImportDocumentChange =
  | { readonly kind: "put"; readonly key: DocumentKey; readonly before: Presence; readonly document: JsonObject }
  | { readonly kind: "remove"; readonly key: AccountDocumentKey; readonly before: Extract<Presence, { kind: "present" }> }
type Put = Extract<ImportDocumentChange, { kind: "put" }>
type AdmittedSync = Extract<SyncWritePlan, { kind: "planned" }>
export type ImportSyncFacts = { readonly kind: "off" } | { readonly kind: "on"; readonly records: JsonObject }
export type SettingsImportPlanInput = {
  readonly parsed: ImportPlan
  readonly local: JsonObject
  readonly session: JsonObject
  readonly sync: ImportSyncFacts
  readonly at: number
  readonly generation: (key: DocumentKey) => string
}
export type ImportAccountCleanup = Pick<SetupRemoval, "acct" | "cacheKey" | "progressKeys" | "clearAccountSession" | "clearLastAccountIfMatches">
export type SettingsImportPlan = {
  readonly kind: "planned"
  readonly execution: "requires-owner-continuation"
  readonly documents: {
    readonly changes: readonly [ImportDocumentChange, ...ImportDocumentChange[]]
    readonly history: Exclude<FirstEditHistoryPatch, { kind: "unavailable" }>
    readonly sync: { readonly kind: "off" } | { readonly kind: "on"; readonly admission: AdmittedSync }
  }
  readonly cleanup: {
    readonly accounts: readonly ImportAccountCleanup[]
    readonly sessionEffects: readonly RemovalSessionEffect[]
    readonly lastAccount: { readonly kind: "unchanged" } | { readonly kind: "clear"; readonly acct: AccountKey }
  }
  readonly capture: {
    readonly local: JsonObject
    readonly session: JsonObject
    readonly sync: ImportSyncFacts
    readonly binding: {
      readonly deviceId: string
      readonly consent: Device["consent"]
      readonly consentControl: ConsentStateV1 | null
      readonly joined: string | null
    }
  }
  readonly expected: { readonly local: JsonObject; readonly session: JsonObject }
}
export type SettingsImportPlanResult =
  | SettingsImportPlan
  | { readonly kind: "refused"; readonly reason: "invalid" | "update-needed" | "sync-full" }
  | { readonly kind: "unavailable"; readonly reason: "inventory" | "device" | "history" | "session" | "sync-facts" | "stamp" }

function object(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
function copy(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copy) : copyObject(value)
}
function copyObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

type BodyShape = Parameters<typeof project>[0]
// Dictionaries replace their members. Rows retain extensions only when their domain identity survives.
function replaceKnown(shape: BodyShape, before: JsonValue | undefined, incoming: JsonValue): JsonValue {
  switch (shape.kind) {
    case "value":
      return incoming
    case "nullable":
      return incoming === null ? null : replaceKnown(shape.item, before, incoming)
    case "optional":
      return replaceKnown(shape.item, before, incoming)
    case "dictionary":
      return incoming
    case "object": {
      if (!object(incoming)) throw new TypeError("Import object body")
      const previous = object(before) ? before : {},
        result = { ...previous, ...incoming }
      for (const [key, child] of Object.entries(shape.fields)) {
        if (!Object.hasOwn(incoming, key)) {
          delete result[key]
          continue
        }
        const value = incoming[key]
        if (value === undefined) throw new TypeError("Import body field")
        Object.defineProperty(result, key, { value: replaceKnown(child, previous[key], value), enumerable: true, configurable: true, writable: true })
      }
      return result
    }
    case "list": {
      if (!Array.isArray(incoming)) throw new TypeError("Import list body")
      const previous = Array.isArray(before) ? before : []
      const identity = shape.item.kind === "object" ? (Object.hasOwn(shape.item.fields, "id") ? "id" : Object.hasOwn(shape.item.fields, "pl") ? "pl" : null) : null
      return incoming.map(row => {
        const old =
          shape.item.kind === "channel" && Array.isArray(row)
            ? previous.find(candidate => Array.isArray(candidate) && candidate[0] === row[0])
            : identity !== null && object(row)
              ? previous.find(candidate => object(candidate) && candidate[identity] === row[identity])
              : undefined
        return replaceKnown(shape.item, old, row)
      })
    }
    case "channel": {
      if (!Array.isArray(incoming)) throw new TypeError("Import channel body")
      if (!Array.isArray(before) || before.length <= 3) return incoming
      return incoming.length === 2 ? [...incoming, null, ...before.slice(3)] : [...incoming, ...before.slice(3)]
    }
  }
}

function supported(key: DocumentKey, raw: JsonObject) {
  switch (key.kind) {
    case "settings":
      return decodeDocument(raw, decodeSettings)
    case "setup":
      return decodeDocument(raw, decodeSetup)
    case "filter":
      return decodeDocument(raw, decodeFilter)
  }
}
function prepare(input: PrepareBodyInput, previous: Presence): JsonObject | undefined {
  const raw = materializeDocumentBody(input)
  if (raw.kind !== "prepared") return
  const before = previous.kind === "present" ? previous.document.data : undefined
  const shape = input.kind === "settings" ? settingsShape : input.kind === "setup" ? setupShape : filterShape
  const data = replaceKnown(shape, before, raw.data)
  const prepared =
    input.kind === "settings"
      ? prepareDocumentBody({ kind: "settings", data: decodeSettings(data) })
      : input.kind === "filter"
        ? prepareDocumentBody({ kind: "filter", data: decodeFilter(data) })
        : prepareDocumentBody({ kind: "setup", data: decodeSetup(data), context: input.context })
  return prepared.kind === "prepared" ? prepared.data : undefined
}

export function planSettingsImport(input: SettingsImportPlanInput): SettingsImportPlanResult {
  const invalid = { kind: "refused", reason: "invalid" } satisfies SettingsImportPlanResult
  if (!object(input.local) || !object(input.session) || Object.keys(Object.prototype).length > 0) return { kind: "unavailable", reason: "inventory" }
  if (
    input.parsed.kind !== "import-plan" ||
    input.parsed.provenance !== "fresh-edit-required" ||
    input.parsed.accountCount !== input.parsed.accounts.length ||
    input.parsed.replacement.sharedSettings !== "replace" ||
    input.parsed.replacement.includedAccounts !== "replace-setup-and-all-filters" ||
    input.parsed.replacement.absentAccounts !== "keep"
  )
    return invalid
  const local = copyObject(input.local),
    session = copyObject(input.session)
  const ready = readConsentDevice(local)
  if (ready.kind !== "supported") return { kind: "unavailable", reason: "device" }
  const deviceId = ready.device.id
  if (ready.device.syncOn !== (input.sync.kind === "on") || (input.sync.kind === "on" && !object(input.sync.records))) return { kind: "unavailable", reason: "sync-facts" }
  if (!Number.isSafeInteger(input.at) || input.at < 0) return { kind: "unavailable", reason: "stamp" }
  const sync: ImportSyncFacts = input.sync.kind === "off" ? { kind: "off" } : { kind: "on", records: copyObject(input.sync.records) }
  let joined: string | null = null
  try {
    if (Object.hasOwn(local, "sync")) {
      const state = decodeSyncState(local.sync)
      if (sync.kind === "off" ? state.status !== "off" : state.joined === null || !["ok", "full", "update-needed"].includes(state.status)) return { kind: "unavailable", reason: "history" }
      joined = state.joined
    } else if (sync.kind === "on") return { kind: "unavailable", reason: "history" }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "unavailable", reason: "history" }
    throw error
  }

  const addressed = new Map<string, { key: DocumentKey; before: Presence }>()
  const accountKeys = new Set<AccountKey>()
  for (const entry of input.parsed.accounts) {
    if (!isAccountKey(entry.account) || accountKeys.has(entry.account)) return invalid
    accountKeys.add(entry.account)
    const playlists = new Set<string>()
    for (const filter of entry.filters) {
      if (!isPlaylistId(filter.playlist) || playlists.has(filter.playlist)) return invalid
      playlists.add(filter.playlist)
    }
  }
  const keys: DocumentKey[] = [{ kind: "settings" }]
  for (const entry of input.parsed.accounts) {
    keys.push({ kind: "setup", acct: entry.account })
    for (const name of Object.keys(local).sort()) {
      if (name.startsWith(`doc:setup:${entry.account}:`) || name === `doc:filter:${entry.account}` || name.startsWith(`doc:filter:${entry.account}:`)) {
        const key = parseDocumentKey(name)
        if (!key || key.kind !== "filter" || key.acct !== entry.account || documentKey(key) !== name) return { kind: "unavailable", reason: "inventory" }
        keys.push(key)
      }
    }
    for (const filter of entry.filters) keys.push({ kind: "filter", acct: entry.account, playlist: filter.playlist })
  }
  try {
    for (const key of keys) {
      const name = documentKey(key)
      if (addressed.has(name)) continue
      let before: Presence = { kind: "absent" }
      if (Object.hasOwn(local, name)) {
        const raw = local[name]
        if (!object(raw)) return { kind: "unavailable", reason: "inventory" }
        const decoded = supported(key, raw)
        if (decoded.kind === "newer-version") return { kind: "refused", reason: "update-needed" }
        if (decoded.kind !== "value" && decoded.kind !== "deleted") return { kind: "unavailable", reason: "inventory" }
        before = { kind: "present", document: raw }
      }
      addressed.set(name, { key, before })
    }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "unavailable", reason: "inventory" }
    throw error
  }

  const generations = new Set<string>()
  for (const [name, value] of Object.entries(local)) if (parseDocumentKey(name) && object(value) && typeof value.gen === "string") generations.add(value.gen)
  if (sync.kind === "on") for (const [name, value] of Object.entries(sync.records)) if (name.startsWith("s:") && object(value) && typeof value.gen === "string") generations.add(value.gen)
  function put(key: DocumentKey, before: Presence, data: JsonObject | null): Put | undefined {
    let gen: string
    try {
      gen = input.generation(key)
    } catch {
      return
    }
    if (typeof gen !== "string" || gen.length === 0 || generations.has(gen)) return
    generations.add(gen)
    const document: JsonObject = { ...(before.kind === "present" ? before.document : {}), v: DOCUMENT_VERSION, gen, at: input.at, by: deviceId }
    if (data === null) {
      delete document.data
      document.deleted = true
    } else {
      delete document.deleted
      document.data = data
    }
    return { kind: "put", key, before, document }
  }
  const settingsBefore = addressed.get("doc:settings")
  if (!settingsBefore) return invalid
  try {
    let current = defaultSettings()
    if (settingsBefore.before.kind === "present") {
      const decoded = decodeDocument(settingsBefore.before.document, decodeSettings)
      if (decoded.kind === "value") current = decoded.document.data
    }
    const incoming = input.parsed.settings
    const settings: Settings = {
      ...incoming,
      shortcuts: { ...incoming.shortcuts, preset: incoming.shortcuts.preset || current.shortcuts.preset },
      musicActions: { ...incoming.musicActions, preset: incoming.musicActions.preset || current.musicActions.preset },
      musicKeys: { ...incoming.musicKeys, preset: incoming.musicKeys.preset || current.musicKeys.preset }
    }
    const settingsData = prepare({ kind: "settings", data: settings }, settingsBefore.before)
    if (!settingsData) return invalid
    const normalizedSettings = decodeSettings(settingsData)
    const first = put({ kind: "settings" }, settingsBefore.before, settingsData)
    if (!first) return { kind: "unavailable", reason: "stamp" }
    const changes: [ImportDocumentChange, ...ImportDocumentChange[]] = [first]
    const allWrites: Put[] = [first]
    const cleanups: ImportAccountCleanup[] = [],
      sessionEffects: RemovalSessionEffect[] = []
    let expectedSession = copyObject(session)
    for (const entry of input.parsed.accounts) {
      const setupKey: DocumentKey = { kind: "setup", acct: entry.account }
      const setupBefore = addressed.get(documentKey(setupKey))
      if (!setupBefore) return invalid
      const context = {
        shortcutIds: new Set(normalizedSettings.shortcuts.list.map(row => row.id)),
        additionalChosenPlaylists: new Set(normalizedSettings.shortcuts.list.some(row => row.watchLaterOnEveryAccount && !Object.hasOwn(entry.setup.targets, row.id)) ? ["WL"] : [])
      }
      const setupData = prepare({ kind: "setup", data: entry.setup, context }, setupBefore.before)
      if (!setupData) return invalid
      const setup: Setup = decodeSetup(setupData)
      const removed = isSetupEmpty(setup, entry.filters.length > 0)
      const filters = new Map(entry.filters.map(filter => [filter.playlist, filter.filter]))
      if (removed) {
        const removal = planSetupRemoval({ acct: entry.account, current: { kind: "present", bodies: { setup, filters: {} } } })
        if (removal.kind !== "remove") return invalid
        const { acct, cacheKey, progressKeys, clearAccountSession, clearLastAccountIfMatches } = removal.removal
        if (Object.keys(local).some(name => name.startsWith(`progress:${acct}:`) && !progressKeys.includes(name))) return { kind: "unavailable", reason: "inventory" }
        cleanups.push({ acct, cacheKey, progressKeys, clearAccountSession, clearLastAccountIfMatches })
        const plan = planAccountSessionRemoval(acct, expectedSession)
        if (plan.kind !== "supported") return { kind: "unavailable", reason: "session" }
        sessionEffects.push(...plan.effects)
        expectedSession = plan.expected
      }
      for (const member of addressed.values()) {
        const key = member.key
        if (key.kind === "settings" || key.acct !== entry.account) continue
        let data: JsonObject | null
        if (key.kind === "setup") data = removed ? null : setupData
        else {
          const filter: Filter | undefined = filters.get(key.playlist)
          if (filter === undefined) data = null
          else {
            const prepared = prepare({ kind: "filter", data: filter }, member.before)
            if (!prepared) return invalid
            data = prepared
          }
        }
        if (data === null && member.before.kind === "absent") continue
        if (data === null && sync.kind === "off") {
          if (member.before.kind === "present") changes.push({ kind: "remove", key, before: member.before })
        } else {
          const change = put(key, member.before, data)
          if (!change) return { kind: "unavailable", reason: "stamp" }
          changes.push(change)
          allWrites.push(change)
        }
      }
    }
    let syncPlan: SettingsImportPlan["documents"]["sync"] = { kind: "off" }
    let effectiveHistory = local.sync
    if (sync.kind === "on") {
      const admission = planSyncWrite({
        local,
        sync: sync.records,
        intent: { kind: "changed-batch", documents: [{ key: first.key, document: first.document }, ...allWrites.slice(1).map(({ key, document }) => ({ key, document }))] }
      })
      if (admission.kind === "refused") return admission
      if (admission.kind !== "planned") return { kind: "unavailable", reason: "sync-facts" }
      syncPlan = { kind: "on", admission }
      if (!object(effectiveHistory) || !object(effectiveHistory.pushed)) return { kind: "unavailable", reason: "history" }
      effectiveHistory = { ...effectiveHistory, pushed: { ...effectiveHistory.pushed, ...Object.fromEntries(admission.repairs.map(record => [record.name, record.gen])) } }
    }
    const preparedHistory = prepareFirstEditHistory({ history: Object.hasOwn(local, "sync") ? { kind: "present", raw: effectiveHistory } : { kind: "absent" }, syncOn: sync.kind === "on" })
    if (preparedHistory.kind === "unavailable") return { kind: "unavailable", reason: "history" }
    const history: SettingsImportPlan["documents"]["history"] =
      preparedHistory.kind === "unchanged" && syncPlan.kind === "on" && syncPlan.admission.repairs.length > 0 && object(effectiveHistory) ? { kind: "set", sync: effectiveHistory } : preparedHistory
    const expectedLocal = copyObject(local)
    for (const change of changes) {
      const name = documentKey(change.key)
      if (change.kind === "put") expectedLocal[name] = change.document
      else delete expectedLocal[name]
    }
    if (history.kind === "set") expectedLocal.sync = history.sync
    else if (sync.kind === "on" && effectiveHistory !== undefined) expectedLocal.sync = effectiveHistory
    for (const cleanup of cleanups) for (const name of [cleanup.cacheKey, ...cleanup.progressKeys]) delete expectedLocal[name]
    const storedLast = decodeLastAccount(local)
    const last = cleanups.find(cleanup => cleanup.acct === storedLast)
    const lastAccount: SettingsImportPlan["cleanup"]["lastAccount"] = last ? { kind: "clear", acct: last.acct } : { kind: "unchanged" }
    if (last) expectedLocal[LAST_ACCOUNT_KEY] = null
    return {
      kind: "planned",
      execution: "requires-owner-continuation",
      documents: { changes, history, sync: syncPlan },
      cleanup: { accounts: cleanups, sessionEffects, lastAccount },
      capture: { local, session, sync, binding: { deviceId: ready.device.id, consent: ready.device.consent, consentControl: ready.control, joined } },
      expected: { local: expectedLocal, session: expectedSession }
    }
  } catch (error) {
    if (error instanceof DecodeError || error instanceof TypeError) return invalid
    throw error
  }
}
