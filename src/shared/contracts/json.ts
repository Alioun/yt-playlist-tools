export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }
export type JsonParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false }

type Visit = { kind: "value"; value: unknown } | { kind: "leave"; value: object }

export function isJsonValue(value: unknown): value is JsonValue {
  const pending: Visit[] = [{ kind: "value", value }]
  const active = new Set<object>()
  const complete = new Set<object>()
  try {
    while (pending.length > 0) {
      const visit = pending.pop()
      if (!visit) break
      if (visit.kind === "leave") {
        active.delete(visit.value)
        complete.add(visit.value)
        continue
      }
      const current = visit.value
      if (current === null || typeof current === "boolean" || typeof current === "string") continue
      if (typeof current === "number") {
        if (!Number.isFinite(current)) return false
        continue
      }
      if (typeof current !== "object") return false
      if (active.has(current)) return false
      if (complete.has(current)) continue

      const array = Array.isArray(current)
      const prototype: unknown = Object.getPrototypeOf(current)
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false
      const keys = Reflect.ownKeys(current)
      const length: unknown = array ? Object.getOwnPropertyDescriptor(current, "length")?.value : undefined
      if (array && (typeof length !== "number" || keys.length !== length + 1)) return false

      active.add(current)
      pending.push({ kind: "leave", value: current })
      for (const key of keys) {
        if (typeof key !== "string") return false
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor || !("value" in descriptor)) return false
        if (array && key === "length") continue
        if (!descriptor.enumerable) return false
        if (array) {
          const index = Number(key)
          if (typeof length !== "number" || !Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) return false
        }
        const child: unknown = descriptor.value
        pending.push({ kind: "value", value: child })
      }
    }
    return true
  } catch {
    return false
  }
}

export function parseJsonText(text: unknown): JsonParseResult {
  if (typeof text !== "string") return { ok: false }
  try {
    const value: unknown = JSON.parse(text)
    return isJsonValue(value) ? { ok: true, value } : { ok: false }
  } catch {
    return { ok: false }
  }
}
