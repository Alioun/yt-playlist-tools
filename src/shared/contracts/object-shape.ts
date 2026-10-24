import { isJsonValue } from "./json"
import type { JsonObject } from "./json"

type Check = (value: unknown) => boolean

export function objectShape(
  value: unknown, required: Record<string, Check>, optional: Record<string, Check> = {}
): value is JsonObject {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || !isJsonValue(value)) return false
    for (const key of Object.keys(required)) {
      const check: unknown = Object.getOwnPropertyDescriptor(required, key)?.value
      if (!Object.hasOwn(value, key) || typeof check !== "function" || !check(Object.getOwnPropertyDescriptor(value, key)?.value)) return false
    }
    return Object.keys(value).every(key => {
      if (Object.hasOwn(required, key)) return true
      const check: unknown = Object.getOwnPropertyDescriptor(optional, key)?.value
      return typeof check === "function" && check(Object.getOwnPropertyDescriptor(value, key)?.value)
    })
  } catch { return false }
}
