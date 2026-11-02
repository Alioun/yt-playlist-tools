import type { MessageParameters } from "./parameters"

export type MessageKey = keyof MessageParameters
export type MessageValues<K extends MessageKey> = { readonly [Name in MessageParameters[K][number]]: string }
export type SimpleMessageKey = { [K in MessageKey]: keyof MessageValues<K> extends never ? K : never }[MessageKey]
type Exact<Actual, Expected> = Actual & Record<Exclude<keyof Actual, keyof Expected>, never>
type Arguments<K extends MessageKey, P extends MessageValues<K>> = keyof MessageValues<K> extends never
  ? [] : [values: Exact<P, MessageValues<K>>]

export type NativeMessagePort = {
  getMessage(name: string, substitutions?: string | string[]): string
}
export type RichPart = { readonly kind: "text" | "strong"; readonly text: string }
type Entry = { readonly message: string; readonly placeholders?: Readonly<Record<string, { readonly content: string }>> }

export function richParts(text: string): readonly RichPart[] {
  const parts: RichPart[] = []
  let remaining = text
  while (remaining.length) {
    const start = remaining.indexOf("[[strong]]")
    if (start < 0) {
      if (remaining.includes("[[/strong]]")) throw new Error("Invalid localization emphasis")
      parts.push({ kind: "text", text: remaining })
      break
    }
    const before = remaining.slice(0, start)
    if (before.includes("[[/strong]]")) throw new Error("Invalid localization emphasis")
    if (before) parts.push({ kind: "text", text: before })
    const end = remaining.indexOf("[[/strong]]", start + 10)
    if (end < 0) throw new Error("Invalid localization emphasis")
    const strong = remaining.slice(start + 10, end)
    if (strong.includes("[[strong]]")) throw new Error("Invalid localization emphasis")
    parts.push({ kind: "strong", text: strong })
    remaining = remaining.slice(end + 11)
  }
  return parts
}

export type MessageCatalogue = Readonly<Record<MessageKey, Entry>>

export function createI18n(native: NativeMessagePort, catalogue: MessageCatalogue, locale = "en") {
  return localized(native, key => Object.entries(catalogue[key].placeholders ?? {})
    .sort(([, a], [, b]) => Number(a.content.slice(1)) - Number(b.content.slice(1))).map(([name]) => name),
  key => catalogue[key].message, locale)
}

/**
 * For page scripts, which can't carry the whole catalogue. The catalogue numbers each message's placeholders
 * in name order (scripts/generate-message-parameters.ts), so the sorted value names are the substitution order.
 * Canonical English text isn't available here.
 */
export function createSiteI18n(native: NativeMessagePort, locale = "en"): I18n {
  return localized(native, (_key, values) => Object.keys(values).sort(), () => { throw new Error("Canonical text is for extension pages") }, locale)
}

function localized(native: NativeMessagePort, placeholderNames: (key: MessageKey, values: object) => readonly string[], canonicalText: (key: SimpleMessageKey) => string, locale: string) {
  const plurals = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 })
  function message<K extends MessageKey, const P extends MessageValues<K>>(key: K, ...args: Arguments<K, P>): string {
    const values: object = args[0] ?? {}
    const placeholders = placeholderNames(key, values)
    if (Object.keys(values).length !== placeholders.length) throw new Error(`Invalid localization values ${key}`)
    const substitutions = placeholders.map(name => {
      const value: unknown = Reflect.get(values, name)
      if (typeof value !== "string" || !Object.hasOwn(values, name)) throw new Error(`Invalid localization value ${key}.${name}`)
      return value
    })
    const result = native.getMessage(key, substitutions)
    if (!result) throw new Error(`Missing localization message ${key}`)
    return result
  }
  function nativeText(key: SimpleMessageKey): string {
    const result = native.getMessage(key)
    if (!result) throw new Error(`Missing localization message ${key}`)
    return result
  }
  return {
    message,
    canonical: canonicalText,
    rich(key: SimpleMessageKey): readonly RichPart[] { return richParts(nativeText(key)) },
    plural(count: number): "one" | "other" { return plurals.select(count) === "one" ? "one" : "other" },
    number(value: number): string { return numbers.format(value) },
    date(value: Date | number, options?: Intl.DateTimeFormatOptions): string { return new Intl.DateTimeFormat(locale, options).format(value) },
    time(value: Date | number, options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }): string { return new Intl.DateTimeFormat(locale, options).format(value) },
    relative(value: number, unit: Intl.RelativeTimeFormatUnit): string { return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit) }
  }
}

export type I18n = ReturnType<typeof localized>
