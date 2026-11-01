import { DecodeError, decodeDocument, decodeFilter, decodeSetup, decodeSyncMeta, decodeSyncState, documentKey, parseDocumentKey,
  type AccountKey, type DocumentKey, type Tombstone } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import { readSyncDocument, type RawSyncItem } from "./sync-codec"

export const TOMBSTONE_LIFETIME = 30 * 24 * 60 * 60 * 1000

type AccountDocumentKey = Extract<DocumentKey, { kind: "setup" | "filter" }>
type Observed = { readonly local: Readonly<Record<string, unknown>>; readonly sync: Readonly<Record<string, unknown>>; readonly wall: number }

export type LocalTombstoneExpiry = {
  readonly documents: readonly AccountDocumentKey[]
  readonly pushed: readonly string[]
}

const expired = (stamp: Tombstone, wall: number) => wall - stamp.at >= TOMBSTONE_LIFETIME

function accountKey(name: string): AccountDocumentKey | undefined {
  const key = parseDocumentKey(name)
  return key && key.kind !== "settings" && documentKey(key) === name ? key : undefined
}

function localTombstone(key: AccountDocumentKey, raw: unknown): Tombstone | undefined {
  try {
    const document = key.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter)
    return document.kind === "deleted" ? document.document : undefined
  } catch (error) {
    if (error instanceof DecodeError) return undefined
    throw error
  }
}

function sameHistory({ local, sync }: Observed): Record<string, string> | undefined {
  try {
    const history = decodeSyncState(local.sync), meta = decodeSyncMeta(sync["s:meta"])
    return history.joined !== null && meta.v === 1 && meta.id === history.joined && meta.reset !== true ? history.pushed : undefined
  } catch (error) {
    if (error instanceof DecodeError) return undefined
    throw error
  }
}

// Reads only the pass's own snapshot, so a pass with nothing to expire costs no storage access.
export function hasExpiryCandidate({ local, wall }: Omit<Observed, "sync">): boolean {
  let pushed: Record<string, string>
  try { pushed = decodeSyncState(local.sync).pushed } catch (error) {
    if (error instanceof DecodeError) return false
    throw error
  }
  return Object.keys(pushed).some(name => accountKey(name) && !Object.hasOwn(local, name)) || Object.keys(local).some(name => {
    const key = accountKey(name), stamp = key?.kind === "setup" ? localTombstone(key, local[name]) : undefined
    return stamp !== undefined && pushed[name] === stamp.gen && expired(stamp, wall)
  })
}

// G18: a Setup tombstone expires 30 days after its edit time, and its account's Filter tombstones go with it.
// Only acknowledged tombstones expire, and only when sync holds the same deletion or nothing, never a live record.
export function planLocalTombstoneExpiry(observed: Observed): LocalTombstoneExpiry {
  const pushed = sameHistory(observed)
  if (!pushed) return { documents: [], pushed: [] }
  const { local, wall } = observed, items: RawSyncItem[] = Object.entries(observed.sync).map(([key, value]) => ({ key, value }))
  const remoteGone = (key: AccountDocumentKey, age: boolean) => {
    const remote = readSyncDocument({ key, items })
    return remote.kind === "absent" || remote.kind === "deleted" && (!age || expired(remote.document, wall))
  }
  const acknowledged = (key: AccountDocumentKey) => {
    const stamp = localTombstone(key, local[documentKey(key)])
    return stamp && pushed[documentKey(key)] === stamp.gen ? stamp : undefined
  }
  const keys = Object.keys(local).flatMap(name => accountKey(name) ?? [])
  const documents: AccountDocumentKey[] = [], expiring = new Set<AccountKey>()
  for (const setup of keys) {
    if (setup.kind !== "setup") continue
    const stamp = acknowledged(setup)
    if (!stamp || !expired(stamp, wall) || !remoteGone(setup, true)) continue
    const filters = keys.filter(key => key.kind === "filter" && key.acct === setup.acct)
    if (!filters.every(filter => acknowledged(filter) && remoteGone(filter, false))) continue
    documents.push(setup, ...filters)
    expiring.add(setup.acct)
  }
  // A restart between the local removal and the history write leaves these entries without their documents.
  const dangling = Object.keys(pushed).filter(name => {
    const key = accountKey(name)
    return key && !Object.hasOwn(local, name) && remoteGone(key, false) &&
      (expiring.has(key.acct) || !Object.hasOwn(local, documentKey({ kind: "setup", acct: key.acct })))
  })
  return { documents, pushed: [...documents.map(documentKey), ...dangling] }
}

// The synced copies this browser no longer holds: an expired Setup tombstone with its account's Filter tombstones,
// each with the chunks of its own generation. Older generations' chunks stay under ARC-MOD-21's ownership rule.
export function planSyncTombstoneCleanup(observed: Observed): readonly string[] {
  const pushed = sameHistory(observed)
  if (!pushed) return []
  const { local, sync, wall } = observed, items: RawSyncItem[] = Object.entries(sync).map(([key, value]) => ({ key, value }))
  const held = (key: AccountDocumentKey) => Object.hasOwn(local, documentKey(key)) || Object.hasOwn(pushed, documentKey(key))
  const remote = Object.keys(sync).flatMap(item => item.startsWith("s:") ? accountKey(`doc:${item.slice(2)}`) ?? [] : [])
  const removed: string[] = []
  for (const setup of remote) {
    if (setup.kind !== "setup" || held(setup)) continue
    const head = readSyncDocument({ key: setup, items })
    if (head.kind !== "deleted" || !expired(head.document, wall)) continue
    const group = [setup, ...remote.filter(key => key.kind === "filter" && key.acct === setup.acct)]
    const tombstones = group.flatMap(key => {
      const result = readSyncDocument({ key, items })
      return result.kind === "deleted" && !held(key) ? [{ baseKey: `s:${documentKey(key).slice(4)}`, gen: result.document.gen }] : []
    })
    if (tombstones.length !== group.length) continue
    for (const { baseKey, gen } of tombstones) removed.push(...Object.keys(sync).filter(item => item === baseKey || item.startsWith(`${baseKey}@${gen}.`)))
  }
  return removed.sort()
}

export function withoutPushed(history: JsonObject, names: readonly string[]): JsonObject {
  const pushed = history.pushed
  if (pushed === null || typeof pushed !== "object" || Array.isArray(pushed)) throw new TypeError("Missing pushed history")
  return { ...history, pushed: Object.fromEntries(Object.entries(pushed).filter(([name]) => !names.includes(name))) }
}
