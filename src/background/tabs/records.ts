import { isAccountKey } from "../../shared/model/validation"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { objectShape } from "../../shared/contracts/object-shape"
import { isSite, type Site } from "../../shared/contracts/vocabulary"
import type { AccountData } from "../../shared/contracts/jobs"

export const TAB_LIMIT = 200
export type TabRecord = Readonly<AccountData & {
  site: Site
  hidden?: boolean
  fresh?: boolean
  at?: number
  seenAt?: number
}>

export function isTabId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
export function isTabRecord(value: unknown): value is TabRecord {
  const optional = {
    hidden: (v: unknown) => typeof v === "boolean",
    fresh: (v: unknown) => typeof v === "boolean",
    at: (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0,
    seenAt: (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0
  }
  return objectShape(value, { site: isSite, signedIn: v => v === true, acct: isAccountKey }, optional) ||
    objectShape(value, { site: isSite, signedIn: v => v === false, acct: v => v === null }, optional)
}
export function parseTabRecords(raw: unknown): ReadonlyMap<number, TabRecord> | undefined {
  if (raw === undefined) return new Map()
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !isJsonValue(raw)) return
  const rows = new Map<number, TabRecord>()
  for (const [key, value] of Object.entries(raw)) {
    const tabId = Number(key)
    if (!isTabId(tabId) || String(tabId) !== key || !isTabRecord(value)) return
    rows.set(tabId, value)
  }
  return rows.size <= TAB_LIMIT ? rows : undefined
}
export function tabRecordsJson(rows: ReadonlyMap<number, TabRecord>): JsonObject {
  return Object.fromEntries([...rows].map(([id, row]) => [String(id), { ...row }]))
}
export function sameTabRecord(left: TabRecord | undefined, right: TabRecord): boolean {
  return left !== undefined && left.site === right.site && left.acct === right.acct && left.signedIn === right.signedIn &&
    left.hidden === right.hidden && left.fresh === right.fresh && left.at === right.at && left.seenAt === right.seenAt
}
export function replaceTab(rows: ReadonlyMap<number, TabRecord>, tabId: number, row: TabRecord): ReadonlyMap<number, TabRecord> {
  const next = new Map(rows)
  next.set(tabId, row)
  const oldest = [...next].sort(([aId, a], [bId, b]) => (a.seenAt ?? a.at ?? 0) - (b.seenAt ?? b.at ?? 0) || aId - bId)
  for (const [id] of oldest.slice(0, Math.max(0, next.size - TAB_LIMIT))) next.delete(id)
  return next
}
