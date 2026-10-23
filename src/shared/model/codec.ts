export class DecodeError extends TypeError {
  constructor(readonly path: string, expected: string) {
    super(`${path}: expected ${expected}`)
    this.name = "DecodeError"
  }
}

export type Decoder<T> = (raw: unknown, path?: string) => T

export function isRecord(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false
  const prototype: unknown = Object.getPrototypeOf(raw)
  return prototype === Object.prototype || prototype === null
}

export function checked<T>(guard: (raw: unknown) => raw is T, expected: string): Decoder<T> {
  return (raw, path = "value") => {
    if (!guard(raw)) throw new DecodeError(path, expected)
    return raw
  }
}

export const text = checked((raw): raw is string => typeof raw === "string", "a string")
export const nonempty = checked((raw): raw is string => typeof raw === "string" && raw.length > 0, "a nonempty string")
export const boolean = checked((raw): raw is boolean => typeof raw === "boolean", "a boolean")
export const natural = checked((raw): raw is number => typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0, "a nonnegative safe integer")
export const positive = checked((raw): raw is number => typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0, "a positive safe integer")

export function oneOf<const T extends string | number>(...choices: T[]): Decoder<T> {
  return checked((raw): raw is T => choices.some(choice => choice === raw), choices.join(" | "))
}

export function optional<T>(decode: Decoder<T>): Decoder<T | undefined> {
  return (raw, path) => raw === undefined ? undefined : decode(raw, path)
}
export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (raw, path) => raw === null ? null : decode(raw, path)
}

export function object<T extends object>(
  fields: { [P in keyof T]-?: Decoder<T[P]> },
  defaults: () => Partial<NoInfer<T>> = () => ({})
): Decoder<T> {
  return (raw, path = "value") => {
    if (raw === undefined) raw = {}
    if (!isRecord(raw)) throw new DecodeError(path, "an object")
    const result: Record<string, unknown> = { ...raw }
    const fallback = defaults()
    for (const key in fields) {
      const value = Object.hasOwn(raw, key) ? raw[key] : fallback[key]
      const decoded = fields[key](value, `${path}.${key}`)
      if (decoded === undefined) delete result[key]
      else Object.defineProperty(result, key, { value: decoded, enumerable: true, writable: true, configurable: true })
    }
    // Every declared field has passed its decoder; extra fields remain untouched.
    return result as T
  }
}

export function list<T>(decode: Decoder<T>, max = Infinity): Decoder<T[]> {
  return (raw, path = "value") => {
    if (!Array.isArray(raw) || raw.length > max) throw new DecodeError(path, `an array of at most ${max} entries`)
    return Array.from(raw, (entry: unknown, index) => decode(entry, `${path}[${index}]`))
  }
}

export function dictionary<T>(key: (raw: unknown) => boolean, decode: Decoder<T>): Decoder<Record<string, T>> {
  return (raw, path = "value") => {
    if (!isRecord(raw)) throw new DecodeError(path, "an object map")
    const entries = Object.entries(raw).map(([id, value]) => {
      if (!key(id)) throw new DecodeError(`${path}.${id}`, "a valid map key")
      return [id, decode(value, `${path}.${id}`)]
    })
    return Object.fromEntries(entries)
  }
}
