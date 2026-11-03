import { isJsonValue, type JsonValue } from "../../shared/contracts/json"
import { DecodeError, isRecord, type Decoder } from "../../shared/model/codec"
import { decodeFilter } from "../../shared/model/decodeFilter"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { decodeSetup } from "../../shared/model/decodeSetup"
import { readStoredUnclaimed } from "../../shared/model/decodeUnclaimed"
import { decodeDocument, type DecodedDocument } from "../../shared/model/documents"
import type { Filter, Settings, Shortcut } from "../../shared/model/types"
import { parseDocumentKey, type AccountKey, type PlaylistId, type ShortcutId } from "../../shared/model/validation"
import type { InterimConversionInput, InterimConversionPlan, ReviewInspection } from "./interim-conversion"
import { sameSyncJson } from "./sync-write-admission"

export type RecoveryItemId = {
  readonly captureId: string
  readonly sourceKey: string
  readonly path: readonly (string | number)[]
}
export type RecoveryIntent = "none" | "restore" | "discard"
export type RecoveryObservation = {
  readonly captureId: string
  readonly schema: unknown
  readonly conversion: InterimConversionPlan
  readonly canonical: InterimConversionInput["canonical"]
}
export type RecoveryReviewReader = {
  read(current: RecoveryObservation): RecoveryReviewRead
  select(input: { readonly current: RecoveryObservation; readonly item: RecoveryItemId; readonly intent: RecoveryIntent }): RecoverySelectionResult
}

type DocumentFact = {
  readonly path: string
  readonly presence: "missing" | "present"
  readonly state: { readonly kind: "absent" | "invalid" } | { readonly kind: "live" | "tombstone"; readonly generation: string } | { readonly kind: "newer"; readonly version: number }
}
type UnknownComparison = { readonly kind: "unknown"; readonly reason: "destination-unresolved" | "allocation-unvalidated" }
type Source = { readonly kind: "account-body"; readonly account: AccountKey } | { readonly kind: "global" }
type PlaylistChoice = {
  readonly playlist: string
  readonly takes: "videos" | "shorts" | "both"
  readonly percentage: { readonly kind: "shared-default" } | { readonly kind: "override"; readonly value: number }
}
type SharedRow = { readonly kind: "present"; readonly row: Shortcut } | { readonly kind: "missing" | "unknown" }
type TargetFact = { readonly kind: "present"; readonly playlist: string; readonly currentChoiceMatch: boolean } | { readonly kind: "absent" | "unknown" }
type RowBase = {
  readonly id: RecoveryItemId
  readonly intent: RecoveryIntent
  readonly inactive: true
  readonly restoration: "not-proven"
  readonly source: Source
}
type UnresolvedDestination = {
  readonly kind: "unresolved-account"
  readonly expected: "setup.autoAdd" | "filter-with-parent-setup" | "setup.targets-with-original-shared-row"
}
export type RecoveryItem = RowBase &
  (
    | {
        readonly kind: "playlist"
        readonly facts: { readonly playlist: PlaylistId; readonly takes: "videos"; readonly percentage: "shared-default" }
        readonly destination: UnresolvedDestination | { readonly kind: "account-playlist"; readonly account: AccountKey; readonly path: string; readonly field: readonly ["autoAdd"] }
        readonly comparison: UnknownComparison | { readonly kind: "playlist"; readonly setup: DocumentFact; readonly currentChoices: readonly PlaylistChoice[]; readonly currentChoiceMatch: boolean }
      }
    | {
        readonly kind: "filter"
        readonly facts: { readonly playlist: PlaylistId; readonly mode: Filter["mode"]; readonly on: boolean; readonly channels: Filter["channels"]; readonly kept: boolean }
        readonly destination: UnresolvedDestination | { readonly kind: "account-filter"; readonly account: AccountKey; readonly path: string; readonly parentPath: string }
        readonly comparison:
          | UnknownComparison
          | {
              readonly kind: "filter"
              readonly filter: DocumentFact
              readonly parentSetup: DocumentFact
              readonly current: { readonly kind: "live"; readonly value: Filter; readonly currentChoiceMatch: boolean } | { readonly kind: "unavailable" }
            }
      }
    | {
        readonly kind: "shortcut"
        readonly facts: { readonly playlist: PlaylistId; readonly originalAssociation: "not-supplied" }
        readonly destination:
          | UnresolvedDestination
          | { readonly kind: "unallocated-account"; readonly account: AccountKey }
          | {
              readonly kind: "account-target"
              readonly account: AccountKey
              readonly path: string
              readonly field: readonly ["targets", ShortcutId]
              readonly settingsPath: "doc:settings"
              readonly rowId: ShortcutId
              readonly association: "conversion-allocation"
            }
        readonly comparison:
          | UnknownComparison
          | {
              readonly kind: "shortcut"
              readonly setup: DocumentFact
              readonly settings: DocumentFact
              readonly row: SharedRow
              readonly sharedRowDependency: "present" | "missing" | "conflicting-settings"
              readonly target: TargetFact
            }
      }
  )

type RetainedEvidence =
  | { readonly kind: "not-inspected"; readonly scope: "accounts" | "globals" }
  | { readonly kind: "index-only"; readonly account: AccountKey; readonly positions: readonly number[] }
  | {
      readonly kind: "rejected"
      readonly scope: "accounts" | "globals"
      readonly bodyPosition: number | null
      readonly identity: "representable" | "invalid" | "unsupported"
      readonly body: "invalid" | "unsupported" | "index-only" | "inspection"
    }
  | { readonly kind: "supporting-evidence"; readonly source: Source; readonly cacheOnly: boolean; readonly cachedPlaylists: number; readonly cachedAt: number | null; readonly labels: number }
  | { readonly kind: "index"; readonly position: number; readonly identity: "representable" | "invalid" | "unsupported"; readonly duplicateOf: number | null }
type OriginalTarget = {
  readonly account: AccountKey
  readonly path: string
  readonly field: readonly ["targets", string]
  readonly setup: DocumentFact
  readonly target: TargetFact
}
type CanonicalUnclaimed =
  | { readonly kind: "absent" | "consumed" | "invalid" }
  | {
      readonly kind: "pending"
      readonly from: "1.4.5" | "1.5.0"
      readonly playlists: readonly string[]
      readonly filters: readonly string[]
      readonly shortcutPlaylist: string | null
      readonly original: { readonly kind: "not-supplied" } | { readonly kind: "record-association"; readonly id: string; readonly row: SharedRow; readonly targets: readonly OriginalTarget[] }
    }
export type RecoveryReviewView = {
  readonly captureId: string
  readonly execution: "unavailable"
  readonly items: readonly RecoveryItem[]
  readonly retainedEvidence: readonly RetainedEvidence[]
  readonly blockers: readonly { readonly kind: "invalid" | "unsupported" | "collision"; readonly path: string; readonly reason: string }[]
  readonly sharedSettings: { readonly document: DocumentFact; readonly rows: readonly Shortcut[] }
  readonly canonicalUnclaimed: CanonicalUnclaimed
}
type HeldReason = "not-interim" | "newer-layout" | "unrepresentable-source" | "invalid-comparison"
export type RecoveryReviewRead =
  | { readonly kind: "review"; readonly view: RecoveryReviewView }
  | { readonly kind: "stale"; readonly view: RecoveryReviewView }
  | { readonly kind: "held"; readonly reason: HeldReason }
export type RecoverySelectionResult =
  | { readonly kind: "draft"; readonly view: RecoveryReviewView }
  | { readonly kind: "refused"; readonly reason: "held" | "stale" | "unknown-item"; readonly current: RecoveryReviewRead }

type Snapshot = { readonly kind: "snapshot"; readonly json: JsonValue } | { readonly kind: "held"; readonly reason: HeldReason }

function dataRecord(raw: unknown): raw is Record<string, unknown> {
  return (
    isRecord(raw) &&
    Reflect.ownKeys(raw).every(key => {
      const d = Object.getOwnPropertyDescriptor(raw, key)
      return typeof key === "string" && d && "value" in d && d.enumerable
    })
  )
}
function ownValue(raw: unknown, key: string): unknown {
  return raw !== null && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, key)?.value : undefined
}
function copyJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copyJson) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyJson(child)]))
}
function selectedField(record: Record<string, unknown>, key: string): JsonValue | undefined {
  if (!Object.hasOwn(record, key)) return { kind: "missing" }
  const value = record[key]
  if (value === undefined) return { kind: "undefined" }
  return isJsonValue(value) ? { kind: "json", value } : undefined
}
function snapshot(current: RecoveryObservation): Snapshot {
  const conversion = ownValue(current, "conversion")
  const kind = ownValue(conversion, "kind")
  if (kind === "not-interim" || kind === "newer-layout") return { kind: "held", reason: kind }
  const source = ownValue(ownValue(conversion, "retention"), "source")
  if (!isJsonValue(source)) return { kind: "held", reason: "unrepresentable-source" }
  if (!dataRecord(current) || typeof current.captureId !== "string" || !isJsonValue(conversion) || !dataRecord(current.canonical)) return { kind: "held", reason: "invalid-comparison" }
  const schema = selectedField(current, "schema"),
    device = selectedField(current.canonical, "device"),
    unclaimed = selectedField(current.canonical, "unclaimed")
  const canonical = { ...current.canonical, device, unclaimed }
  const json = { captureId: current.captureId, schema, conversion, canonical }
  if (!isJsonValue(json)) return { kind: "held", reason: "invalid-comparison" }
  return { kind: "snapshot", json: copyJson(json) }
}

type Compared<T> = { readonly fact: DocumentFact; readonly decoded: DecodedDocument<T> | { readonly kind: "invalid" } }
function compareDocument<T>(documents: Record<string, unknown>, path: string, decoder: Decoder<T>): Compared<T> {
  const presence = Object.hasOwn(documents, path) ? "present" : "missing"
  try {
    const decoded = decodeDocument(ownValue(documents, path), decoder)
    const state: DocumentFact["state"] =
      decoded.kind === "value"
        ? { kind: "live", generation: decoded.document.gen }
        : decoded.kind === "deleted"
          ? { kind: "tombstone", generation: decoded.document.gen }
          : decoded.kind === "newer-version"
            ? { kind: "newer", version: decoded.version }
            : { kind: "absent" }
    return { fact: { path, presence, state }, decoded }
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    return { fact: { path, presence, state: { kind: "invalid" } }, decoded: { kind: "invalid" } }
  }
}
function displayRow(row: Shortcut): Shortcut {
  const key = row.key
  return {
    id: row.id,
    label: row.label,
    watchLaterOnEveryAccount: row.watchLaterOnEveryAccount,
    key: key === null ? null : { code: key.code, ctrl: key.ctrl, alt: key.alt, shift: key.shift, meta: key.meta, ...(key.char === undefined ? {} : { char: key.char }) }
  }
}
function displayFilter(value: Filter): Filter {
  return { mode: value.mode, on: value.on, channels: value.channels.map(([id, title, handle]) => (handle === undefined ? [id, title] : [id, title, handle])) }
}
function sharedRow(settings: Compared<Settings>, id: string): SharedRow {
  if (settings.decoded.kind === "absent") return { kind: "missing" }
  if (settings.decoded.kind !== "value") return { kind: "unknown" }
  const row = settings.decoded.document.data.shortcuts.list.find(row => row.id === id)
  return row ? { kind: "present", row: displayRow(row) } : { kind: "missing" }
}
function unclaimedFact(raw: unknown, settings: Compared<Settings>, documents: Record<string, unknown>): CanonicalUnclaimed {
  try {
    const decoded = readStoredUnclaimed(raw)
    if (decoded.kind !== "pending") return decoded
    const data = decoded.data
    return {
      kind: "pending",
      from: data.from,
      playlists: [...data.autoAdd],
      filters: Object.keys(data.filters),
      shortcutPlaylist: data.shortcutPlaylist,
      original:
        data.originalShortcutId === undefined
          ? { kind: "not-supplied" }
          : {
              kind: "record-association",
              id: data.originalShortcutId,
              row: sharedRow(settings, data.originalShortcutId),
              targets: Object.keys(documents).flatMap(path => {
                const key = parseDocumentKey(path),
                  originalId = data.originalShortcutId
                if (key?.kind !== "setup" || originalId === undefined) return []
                const setup = compareDocument(documents, path, decodeSetup)
                const targets = setup.decoded.kind === "value" ? setup.decoded.document.data.targets : null
                const value = targets && Object.hasOwn(targets, originalId) ? targets[originalId] : undefined
                return [
                  {
                    account: key.acct,
                    path,
                    field: ["targets", originalId],
                    setup: setup.fact,
                    target:
                      typeof value === "string"
                        ? { kind: "present", playlist: value, currentChoiceMatch: value === data.shortcutPlaylist }
                        : targets || setup.decoded.kind === "absent"
                          ? { kind: "absent" }
                          : { kind: "unknown" }
                  } satisfies OriginalTarget
                ]
              })
            }
    }
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    return { kind: "invalid" }
  }
}
function blockerPath(path: string): string {
  return parseDocumentKey(path) ||
    /^(source\.)?(globals\.)?(accountBodies\[\d+\]|savedAccountKeys\[\d+\])(?:\.[A-Za-z]+(?:\[\d+\])?)*$/.test(path) ||
    ["schema", "input", "source", "source.accountBodies", "source.globals", "canonical", "canonical.documents", "canonical.caches", "canonical.unclaimed.originalShortcutId"].includes(path) ||
    /^source\.globals\.(requiredWatchPercentage|toastEnabled|watchLaterShortcut|preventDuplicates|queueButtonEnabled|cardContextMenu)$/.test(path)
    ? path
    : "retained-evidence"
}

function project(initial: RecoveryObservation): RecoveryReviewView {
  const conversion = initial.conversion
  if (conversion.kind !== "blocked" && conversion.kind !== "inactive-proposal") throw new Error("review requires inspected conversion")
  const reviewFacts = conversion.reviewFacts
  const documents = isRecord(initial.canonical.documents) ? initial.canonical.documents : {}
  const settings = compareDocument(documents, "doc:settings", decodeSettings)
  const items: RecoveryItem[] = [],
    retainedEvidence: RetainedEvidence[] = []
  const unknown: UnknownComparison = { kind: "unknown", reason: "destination-unresolved" }
  function inventory(inspection: ReviewInspection, scope: "accounts" | "globals"): void {
    if (inspection.kind === "not-inspected") {
      retainedEvidence.push({ kind: "not-inspected", scope })
      return
    }
    if (scope === "accounts")
      for (const index of inspection.value.index) retainedEvidence.push({ kind: "index", position: index.position, identity: index.identity.kind, duplicateOf: index.duplicateOf })
    for (const account of inspection.value.accounts) {
      if (scope === "accounts" && account.body.kind === "index-only" && account.identity.kind === "representable") {
        retainedEvidence.push({ kind: "index-only", account: account.identity.key, positions: [...account.indexPositions] })
        continue
      }
      if (account.body.kind !== "inspection" || account.identity.kind !== "representable") {
        retainedEvidence.push({ kind: "rejected", scope, bodyPosition: account.bodyPosition, identity: account.identity.kind, body: account.body.kind })
        continue
      }
      const source: Source = scope === "accounts" ? { kind: "account-body", account: account.identity.key } : { kind: "global" }
      const facts = account.body.facts
      if (facts.cache.playlists.length || facts.cache.at !== null || facts.labels.length)
        retainedEvidence.push({
          kind: "supporting-evidence",
          source,
          cacheOnly: facts.choices === "empty",
          cachedPlaylists: facts.cache.playlists.length,
          cachedAt: facts.cache.at,
          labels: facts.labels.length
        })
      const setupPath = `doc:setup:${account.identity.key}`
      const setup = scope === "accounts" ? compareDocument(documents, setupPath, decodeSetup) : null
      const id = (globalKey: string, path: readonly (string | number)[], accountPath = path): RecoveryItemId => ({
        captureId: initial.captureId,
        sourceKey: scope === "accounts" ? `account:${account.identity.kind === "representable" ? account.identity.key : ""}` : globalKey,
        path: [...(scope === "accounts" ? accountPath : path)]
      })
      const base = { intent: "none", inactive: true, restoration: "not-proven", source } satisfies Omit<RowBase, "id">
      facts.playlists.forEach((playlist, index) => {
        const currentChoices: PlaylistChoice[] =
          setup?.decoded.kind === "value"
            ? setup.decoded.document.data.autoAdd.map(choice => ({
                playlist: choice.pl,
                takes: choice.takes,
                percentage: choice.pct === undefined ? { kind: "shared-default" } : { kind: "override", value: choice.pct }
              }))
            : []
        items.push({
          ...base,
          id: id("playlists", [index], ["playlists", index]),
          kind: "playlist",
          facts: { playlist, takes: "videos", percentage: "shared-default" },
          destination:
            source.kind === "account-body" ? { kind: "account-playlist", account: source.account, path: setupPath, field: ["autoAdd"] } : { kind: "unresolved-account", expected: "setup.autoAdd" },
          comparison: setup
            ? {
                kind: "playlist",
                setup: setup.fact,
                currentChoices,
                currentChoiceMatch: currentChoices.some(choice => choice.playlist === playlist && choice.takes === "videos" && choice.percentage.kind === "shared-default")
              }
            : unknown
        })
      })
      for (const filter of facts.filters) {
        const channels: Filter["channels"] = filter.channels.map(channel => {
          const label = facts.labels.find(label => label.channel === channel)
          return label?.handle === undefined ? [channel, label?.title ?? ""] : [channel, label.title, label.handle]
        })
        const value: Filter = { mode: filter.mode, on: filter.on, channels }
        const path = `doc:filter:${account.identity.key}:${filter.playlist}`
        const canonical = setup ? compareDocument(documents, path, decodeFilter) : null
        const current = canonical?.decoded.kind === "value" ? canonical.decoded.document.data : null
        items.push({
          ...base,
          id: id("channelFilters", [filter.playlist], ["filters", filter.playlist]),
          kind: "filter",
          facts: { playlist: filter.playlist, ...value, kept: filter.kept },
          destination:
            source.kind === "account-body" ? { kind: "account-filter", account: source.account, path, parentPath: setupPath } : { kind: "unresolved-account", expected: "filter-with-parent-setup" },
          comparison:
            setup && canonical
              ? {
                  kind: "filter",
                  filter: canonical.fact,
                  parentSetup: setup.fact,
                  current: current
                    ? { kind: "live", value: displayFilter(current), currentChoiceMatch: isJsonValue(current) && isJsonValue(value) && sameSyncJson(current, value) }
                    : { kind: "unavailable" }
                }
              : unknown
        })
      }
      if (facts.shortcut) {
        const playlist = facts.shortcut.playlist,
          allocation = reviewFacts.conversionShortcut
        const row = allocation.kind === "validated-context" ? sharedRow(settings, allocation.id) : null
        const targets = setup?.decoded.kind === "value" ? setup.decoded.document.data.targets : null
        const targetValue = targets && allocation.kind === "validated-context" ? targets[allocation.id] : undefined
        const target: TargetFact =
          targets && allocation.kind === "validated-context"
            ? typeof targetValue === "string" && Object.hasOwn(targets, allocation.id)
              ? { kind: "present", playlist: targetValue, currentChoiceMatch: targetValue === playlist }
              : { kind: "absent" }
            : { kind: "unknown" }
        items.push({
          ...base,
          id: id("addToPlaylistID", [], ["shortcutPlaylistId"]),
          kind: "shortcut",
          facts: { playlist, originalAssociation: "not-supplied" },
          destination:
            source.kind === "global"
              ? { kind: "unresolved-account", expected: "setup.targets-with-original-shared-row" }
              : allocation.kind === "validated-context"
                ? {
                    kind: "account-target",
                    account: source.account,
                    path: setupPath,
                    field: ["targets", allocation.id],
                    settingsPath: "doc:settings",
                    rowId: allocation.id,
                    association: "conversion-allocation"
                  }
                : { kind: "unallocated-account", account: source.account },
          comparison:
            setup && row
              ? {
                  kind: "shortcut",
                  setup: setup.fact,
                  settings: settings.fact,
                  row,
                  sharedRowDependency: settings.decoded.kind !== "value" && settings.decoded.kind !== "absent" ? "conflicting-settings" : row.kind === "present" ? "present" : "missing",
                  target
                }
              : source.kind === "global"
                ? unknown
                : { kind: "unknown", reason: "allocation-unvalidated" }
        })
      }
    }
  }
  inventory(reviewFacts.accounts, "accounts")
  inventory(reviewFacts.globals, "globals")
  return {
    captureId: initial.captureId,
    execution: "unavailable",
    items,
    retainedEvidence,
    blockers: conversion.kind === "blocked" ? conversion.blockers.map(blocker => ({ kind: blocker.kind, path: blockerPath(blocker.path), reason: blocker.reason })) : [],
    sharedSettings: { document: settings.fact, rows: settings.decoded.kind === "value" ? settings.decoded.document.data.shortcuts.list.map(displayRow) : [] },
    canonicalUnclaimed: unclaimedFact(initial.canonical.unclaimed, settings, documents)
  }
}
function sameItem(a: RecoveryItemId, b: RecoveryItemId): boolean {
  return a.captureId === b.captureId && a.sourceKey === b.sourceKey && a.path.length === b.path.length && a.path.every((part, index) => part === b.path[index])
}

export function openInterimRecoveryReview(initial: RecoveryObservation): RecoveryReviewReader {
  const baseline = snapshot(initial)
  if (baseline.kind === "held") {
    const held: RecoveryReviewRead = { kind: "held", reason: baseline.reason }
    return { read: () => ({ ...held }), select: () => ({ kind: "refused", reason: "held", current: { ...held } }) }
  }
  const baselineJson = baseline.json
  const view = project(initial)
  const intents = new Map<number, RecoveryIntent>()
  let stale = false
  function display(): RecoveryReviewView {
    const result = structuredClone(view)
    return { ...result, items: result.items.map((item, index) => ({ ...item, intent: intents.get(index) ?? "none" })) }
  }
  function read(current: RecoveryObservation): RecoveryReviewRead {
    if (!stale) {
      const observed = snapshot(current)
      if (observed.kind !== "snapshot" || !sameSyncJson(baselineJson, observed.json)) {
        stale = true
        intents.clear()
      }
    }
    return { kind: stale ? "stale" : "review", view: display() }
  }
  return {
    read,
    select(input): RecoverySelectionResult {
      const current = read(input.current)
      if (current.kind !== "review") return { kind: "refused", reason: current.kind === "stale" ? "stale" : "held", current }
      const index = view.items.findIndex(item => sameItem(item.id, input.item))
      if (index < 0) return { kind: "refused", reason: "unknown-item", current }
      intents.set(index, input.intent)
      return { kind: "draft", view: display() }
    }
  }
}
