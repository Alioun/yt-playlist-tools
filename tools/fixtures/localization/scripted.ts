import catalogue from "../../../src/public/_locales/en/messages.json"
import { createI18n, type MessageKey } from "../../../src/shared/i18n"
import { createFirstRunText } from "../../../src/ui/onboarding/text"

export type MessageOverrides = Readonly<Partial<Record<MessageKey, string | null>>>
type Entry = { readonly message: string; readonly placeholders?: Readonly<Record<string, { readonly content: string }>> }

export function stretch(message: string): string {
  return message
    .split(/(\$[a-z_]+\$|\[\[\/?strong\]\])/gi)
    .map(part => {
      if (/^\$[a-z_]+\$$|^\[\[\/?strong\]\]$/i.test(part)) return part
      const stretched = part.replace(/[A-Za-z]+/g, word => word + "ː".repeat(Math.ceil(word.length * 0.4)))
      return stretched + "ː".repeat(Math.max(0, Math.ceil(part.length * 1.4) - stretched.length))
    })
    .join("")
}

export function scriptedMessages({ pseudo = false, overrides = {} }: { readonly pseudo?: boolean; readonly overrides?: MessageOverrides } = {}) {
  return {
    getUILanguage: () => "en",
    getMessage(name: string, substitutions?: string | string[]): string {
      if (!Object.hasOwn(catalogue, name)) return ""
      const entry: Entry | undefined = Object.entries(catalogue).find(([key]) => key === name)?.[1]
      if (!entry) return ""
      const override = Object.entries(overrides).find(([key]) => key === name)?.[1]
      if (override === null) return ""
      const message = override ?? entry.message
      const values = typeof substitutions === "string" ? [substitutions] : (substitutions ?? [])
      return (pseudo ? stretch(message) : message).replace(/\$([a-z_]+)\$/gi, (_, name: string) => {
        const placeholder = entry.placeholders?.[name.toLowerCase()]
        return placeholder ? (values[Number(placeholder.content.slice(1)) - 1] ?? "") : ""
      })
    }
  }
}

export function englishI18n() {
  return createI18n(scriptedMessages(), catalogue)
}
export function englishFirstRunText() {
  return createFirstRunText(englishI18n())
}
export function pseudoFirstRunText() {
  return createFirstRunText(createI18n(scriptedMessages({ pseudo: true }), catalogue))
}
