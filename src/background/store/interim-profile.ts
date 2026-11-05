import { decodeDocument } from "../../shared/model/documents"
import { decodeFilter } from "../../shared/model/decodeFilter"
import { decodeSetup } from "../../shared/model/decodeSetup"
import { DecodeError, boolean, checked, isRecord, list, natural, nullable, oneOf, text } from "../../shared/model/codec"
import { isAccountKey, isChannelId, isPlaylistId, parseDocumentKey } from "../../shared/model/validation"
import type { AccountKey, ChannelId, PlaylistId } from "../../shared/model/validation"
import type { Filter } from "../../shared/model/types"

export type InterimProfileInput = {
  readonly accountBodies: unknown
  readonly savedAccountKeys?: unknown
  readonly canonicalDocuments: unknown
  readonly sessionConsent?: unknown
  readonly sessionGeneration?: unknown
  readonly legacyClaimed?: unknown
  readonly historicalAuthorization?: unknown
}

type Issue = { kind: "invalid" | "unsupported"; field: string; reason: string }
type AccountIdentity = { kind: "representable"; key: AccountKey } | { kind: "invalid" | "unsupported" }
type BodyFacts = {
  playlists: PlaylistId[]
  shortcut: { playlist: PlaylistId; provenance: "not-supplied" } | null
  filters: { playlist: PlaylistId; mode: Filter["mode"]; on: boolean; channels: ChannelId[]; kept: boolean }[]
  labels: { channel: ChannelId; title: string; handle?: string; referenced: boolean }[]
  cache: { playlists: { id: PlaylistId; title: string }[]; at: number | null }
  choices: "present" | "empty"
}
type BodyInspection = { kind: "index-only" } | { kind: "invalid" | "unsupported" } | { kind: "inspection"; facts: BodyFacts }
type AccountInspection = {
  bodyPosition: number | null
  identity: AccountIdentity
  indexPositions: number[]
  body: BodyInspection
  overlaps: { position: number; kind: "live" | "tombstone" | "newer-version"; document: "setup" | "filter" }[]
}

export type InterimProfileInspection = {
  kind: "inspection" | "invalid" | "unsupported"
  accounts: AccountInspection[]
  index: { position: number; identity: AccountIdentity; duplicateOf: number | null }[]
  issues: Issue[]
  markers: {
    consent: number | "not-supplied"
    generation: "present" | "not-supplied"
    legacyClaimed: boolean | "not-supplied"
  }
  historicalAuthorization: "unknown" | "known-authorized" | "known-unauthorized"
}

const playlist = checked(isPlaylistId, "canonical playlist ID")
const channel = checked(isChannelId, "canonical channel ID")

function identity(raw: unknown, field: string, issues: Issue[]): AccountIdentity {
  if (isAccountKey(raw)) return { kind: "representable", key: raw }
  const kind = typeof raw === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? "unsupported" : "invalid"
  issues.push({ kind, field, reason: kind === "unsupported" ? "account-key-not-representable" : "invalid-account-key" })
  return { kind }
}

function record(raw: unknown, field: string): Record<string, unknown> {
  if (!isRecord(raw)) throw new DecodeError(field, "object")
  return raw
}

function unknownFields(raw: Record<string, unknown>, known: readonly string[], field: string, issues: Issue[]): void {
  Object.keys(raw)
    .filter(key => !known.includes(key))
    .forEach((_, position) => {
      issues.push({ kind: "unsupported", field: `${field}.unknown[${position}]`, reason: "unknown-field" })
    })
}

function inspectBody(raw: unknown, field: string, issues: Issue[]): BodyInspection {
  const start = issues.length
  try {
    const body = record(raw, field)
    unknownFields(body, ["playlists", "shortcutPlaylistId", "filters", "labels", "cachedPlaylists", "cachedAt"], field, issues)
    const playlists = list(playlist)(body.playlists, `${field}.playlists`)
    const shortcut =
      body.shortcutPlaylistId === ""
        ? null
        : {
            playlist: playlist(body.shortcutPlaylistId, `${field}.shortcutPlaylistId`),
            provenance: "not-supplied" as const
          }
    const filters = Object.entries(record(body.filters, `${field}.filters`)).map(([id, rawFilter], position) => {
      const path = `${field}.filters[${position}]`
      const pl = playlist(id, `${path}.playlist`)
      const filter = record(rawFilter, path)
      unknownFields(filter, ["mode", "enabled", "channels"], path, issues)
      return {
        playlist: pl,
        mode: oneOf("allow", "deny")(filter.mode, `${path}.mode`),
        on: boolean(filter.enabled, `${path}.enabled`),
        channels: list(channel)(filter.channels, `${path}.channels`),
        kept: !playlists.includes(pl)
      }
    })
    const labels = Object.entries(record(body.labels, `${field}.labels`)).map(([id, rawLabel], position) => {
      const path = `${field}.labels[${position}]`
      const ch = channel(id, `${path}.channel`)
      const label = record(rawLabel, path)
      unknownFields(label, ["title", "handle"], path, issues)
      return {
        channel: ch,
        title: text(label.title, `${path}.title`),
        ...(label.handle === undefined ? {} : { handle: text(label.handle, `${path}.handle`) }),
        referenced: filters.some(filter => filter.channels.includes(ch))
      }
    })
    const cached = list((value, path = field) => {
      const entry = record(value, path)
      unknownFields(entry, ["id", "title"], path, issues)
      return { id: playlist(entry.id, `${path}.id`), title: text(entry.title, `${path}.title`) }
    })(body.cachedPlaylists, `${field}.cachedPlaylists`)
    const at = nullable(natural)(body.cachedAt, `${field}.cachedAt`)
    if (issues.length !== start) return { kind: "unsupported" }
    return {
      kind: "inspection",
      facts: {
        playlists,
        shortcut,
        filters,
        labels,
        cache: { playlists: cached, at },
        choices: playlists.length || shortcut || filters.length ? "present" : "empty"
      }
    }
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    issues.push({ kind: "invalid", field: error.path, reason: error.message.slice(error.path.length + 2) })
    return { kind: "invalid" }
  }
}

// This inspects explicit noncredential snapshots. It grants no conversion or removal authority.
export function inspectInterimProfile(input: InterimProfileInput): InterimProfileInspection {
  const issues: Issue[] = []
  const accounts: AccountInspection[] = []
  const index: InterimProfileInspection["index"] = []
  const markers: InterimProfileInspection["markers"] = {
    consent: "not-supplied",
    generation: "not-supplied",
    legacyClaimed: "not-supplied"
  }
  let historicalAuthorization: InterimProfileInspection["historicalAuthorization"] = "unknown"
  if (!isRecord(input)) return { kind: "invalid", accounts, index, issues: [{ kind: "invalid", field: "input", reason: "invalid-field" }], markers, historicalAuthorization }
  unknownFields(input, ["accountBodies", "savedAccountKeys", "canonicalDocuments", "sessionConsent", "sessionGeneration", "legacyClaimed", "historicalAuthorization"], "input", issues)
  const byRawKey = new Map<string, AccountInspection>()
  if (!isRecord(input.accountBodies)) issues.push({ kind: "invalid", field: "accountBodies", reason: "invalid-field" })
  else
    Object.entries(input.accountBodies).forEach(([key, raw], position) => {
      const field = `accountBodies[${position}]`
      const acct = key.startsWith("account:") ? identity(key.slice(8), `${field}.key`, issues) : identity(undefined, `${field}.key`, issues)
      const entry: AccountInspection = { bodyPosition: position, identity: acct, indexPositions: [], body: inspectBody(raw, field, issues), overlaps: [] }
      accounts.push(entry)
      if (key.startsWith("account:")) byRawKey.set(key.slice(8), entry)
    })
  if (input.savedAccountKeys !== undefined) {
    if (!Array.isArray(input.savedAccountKeys)) issues.push({ kind: "invalid", field: "savedAccountKeys", reason: "invalid-field" })
    else {
      const firstPosition = new Map<unknown, number>()
      Array.from(input.savedAccountKeys, (raw: unknown, position) => {
        const acct = identity(raw, `savedAccountKeys[${position}]`, issues)
        const duplicateOf = firstPosition.get(raw) ?? null
        index.push({ position, identity: acct, duplicateOf })
        if (duplicateOf === null) firstPosition.set(raw, position)
        if (typeof raw !== "string") return
        let entry = byRawKey.get(raw)
        if (!entry) {
          entry = { bodyPosition: null, identity: acct, indexPositions: [], body: { kind: "index-only" }, overlaps: [] }
          accounts.push(entry)
          byRawKey.set(raw, entry)
        }
        entry.indexPositions.push(position)
      })
    }
  }
  if (!isRecord(input.canonicalDocuments)) issues.push({ kind: "invalid", field: "canonicalDocuments", reason: "invalid-field" })
  else
    Object.entries(input.canonicalDocuments).forEach(([key, raw], position) => {
      const field = `canonicalDocuments[${position}]`
      const parsed = parseDocumentKey(key)
      if (!parsed || parsed.kind === "settings") {
        issues.push({ kind: "invalid", field, reason: "expected-account-document-key" })
        return
      }
      try {
        const decoded = parsed.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter)
        if (decoded.kind === "absent") return
        const entry = byRawKey.get(parsed.acct)
        if (entry) entry.overlaps.push({ position, kind: decoded.kind === "value" ? "live" : decoded.kind === "deleted" ? "tombstone" : "newer-version", document: parsed.kind })
        if (decoded.kind === "newer-version") issues.push({ kind: "unsupported", field, reason: "newer-document-version" })
      } catch (error) {
        if (!(error instanceof DecodeError)) throw error
        issues.push({ kind: "invalid", field, reason: "invalid-canonical-document" })
      }
    })
  try {
    if (input.sessionConsent !== undefined) markers.consent = oneOf(-1, 0, 1)(input.sessionConsent, "sessionConsent")
    if (input.sessionGeneration !== undefined) {
      text(input.sessionGeneration, "sessionGeneration")
      markers.generation = "present"
    }
    if (input.legacyClaimed !== undefined) markers.legacyClaimed = boolean(input.legacyClaimed, "legacyClaimed")
    if (input.historicalAuthorization !== undefined) historicalAuthorization = boolean(input.historicalAuthorization, "historicalAuthorization") ? "known-authorized" : "known-unauthorized"
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    issues.push({ kind: "invalid", field: error.path, reason: "invalid-field" })
  }
  return { kind: issues.some(issue => issue.kind === "invalid") ? "invalid" : issues.length ? "unsupported" : "inspection", accounts, index, issues, markers, historicalAuthorization }
}
