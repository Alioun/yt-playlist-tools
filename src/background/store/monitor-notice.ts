import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { isSite, isFeatureId } from "../../shared/contracts/vocabulary"
import { objectShape } from "../../shared/contracts/object-shape"
import { MONITOR_DELIVERY_LEASE_MS } from "../monitor/thresholds"

export type MonitorNoticeChange = {
  readonly action: "claim" | "acknowledge" | "release"
  readonly token: string
  readonly keys: readonly [string, ...string[]]
}
export function isMonitorNoticeKey(value: unknown): value is string {
  if (typeof value !== "string") return false
  const [prefix, site, feature, ...extra] = value.split(":")
  return !extra.length && prefix === "monitor" && isSite(site) && isFeatureId(feature)
}
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
export function noticeClaimToken(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{16}:[1-9][0-9]*$/.test(value) }
export function noticeClaims(global: JsonObject): ReadonlyMap<string, { token: string; until: number }> | undefined {
  const raw = global.monitorPending
  if (raw === undefined) return new Map()
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return
  const result = new Map<string, { token: string; until: number }>()
  for (const [key, row] of Object.entries(raw)) {
    if (!isMonitorNoticeKey(key) || !objectShape(row, { token: noticeClaimToken, until: natural }) || !noticeClaimToken(row.token) || !natural(row.until)) return
    result.set(key, { token: row.token, until: row.until })
  }
  return result
}
export function applyMonitorNotice(global: JsonObject, edit: MonitorNoticeChange, now: number): JsonObject | undefined {
  if (!natural(now) || !noticeClaimToken(edit.token) || !edit.keys.length || !edit.keys.every(isMonitorNoticeKey)) return
  const claims = noticeClaims(global)
  if (!claims || global.once !== undefined && (!Array.isArray(global.once) || !global.once.every(value => typeof value === "string"))) return
  const once = new Set(Array.isArray(global.once) ? global.once.filter((value): value is string => typeof value === "string") : [])
  const pending = new Map(claims)
  for (const key of edit.keys) {
    const claim = pending.get(key)
    if (edit.action === "claim") {
      if (!once.has(key) && (!claim || claim.until <= now || claim.token === edit.token)) pending.set(key, { token: edit.token, until: now + MONITOR_DELIVERY_LEASE_MS })
    } else if (claim?.token === edit.token) {
      pending.delete(key)
      if (edit.action === "acknowledge") once.add(key)
    }
  }
  const result: unknown = { ...global, monitorPending: Object.fromEntries(pending), once: [...once] }
  if (!isJsonValue(result) || result === null || typeof result !== "object" || Array.isArray(result)) return
  return result
}
