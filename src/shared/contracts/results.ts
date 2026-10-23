import { isJsonValue } from "./json"

export type JobFailureReason =
  | "signedOut" | "accountChanged" | "unavailable" | "unconfirmed" | "failed"
export type JobFailure = {
  ok: false
  reason: JobFailureReason
  http?: number
  status?: string
}
export type ChangeResult =
  | { ok: true }
  | { refused: "private" | "sync-full" | "update-needed" | "invalid" }
export type Origin =
  | { kind: "tab"; tabId: number; incognito: boolean }
  | { kind: "ui"; windowId: number; incognito: boolean }
  | { kind: "background" }
  | { kind: "sync" }

const failureReasons = {
  signedOut: true, accountChanged: true, unavailable: true, unconfirmed: true, failed: true
} satisfies Record<JobFailureReason, true>
const refusals = {
  private: true, "sync-full": true, "update-needed": true, invalid: true
} satisfies Record<Extract<ChangeResult, { refused: string }>["refused"], true>

export function isJobFailure(value: unknown): value is JobFailure {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || !isJsonValue(value)) return false
    const ok: unknown = Object.getOwnPropertyDescriptor(value, "ok")?.value
    const reason: unknown = Object.getOwnPropertyDescriptor(value, "reason")?.value
    if (ok !== false || typeof reason !== "string" || !Object.hasOwn(failureReasons, reason)) return false
    for (const key of Object.keys(value)) {
      const field: unknown = Object.getOwnPropertyDescriptor(value, key)?.value
      switch (key) {
        case "ok":
        case "reason": break
        case "http":
          if (typeof field !== "number" || !Number.isInteger(field) || field < 100 || field > 599) return false
          break
        case "status":
          if (typeof field !== "string") return false
          break
        default: return false
      }
    }
    return true
  } catch {
    return false
  }
}

export function isChangeResult(value: unknown): value is ChangeResult {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || !isJsonValue(value) || Object.keys(value).length !== 1) return false
    const ok: unknown = Object.getOwnPropertyDescriptor(value, "ok")?.value
    const refused: unknown = Object.getOwnPropertyDescriptor(value, "refused")?.value
    return ok === true || typeof refused === "string" && Object.hasOwn(refusals, refused)
  } catch {
    return false
  }
}
