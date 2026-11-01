import { sha256 } from "../../shared/i18n/identity"
import type { BrowserKind } from "../onboarding/features"
import type { DisclosureText } from "../onboarding/text"

export const FIRST_RUN_DISCLOSURE_VERSION = 1
// These fixed digests derive from the frozen version 1 source, independently of this catalogue.
// A catalogue edit needs a separately approved identity and version decision.
const expected = {
  "chrome": "3fbe7cb9447bb8fc45151f740d96b220206c9cdb223539988286ec913e7d3bf9",
  "firefox": "688356ffa3a3674b6800aafb2c81beaf2effc58bdd674549c71b247e51a6379d"
} as const
const mark = (parts: DisclosureText["items"][number]["parts"]) => parts.map(part => part.kind === "strong" ? `[[strong]]${part.text}[[/strong]]` : part.text).join("")

export function matchesRenderedDisclosure(browser: BrowserKind, text: DisclosureText): boolean {
  try {
    const canonical = text.canonical(browser)
    const shown = [text.headings["first-run"], text.intro, ...text.items.map(item => mark(item.parts)), text.closing[browser], text.policyLabel, text.policyUrl]
    return sha256(JSON.stringify(canonical)) === expected[browser] && sha256(JSON.stringify(shown)) === expected[browser]
      && text.items.length === 6 && text.items[3]?.provisional === "ticket-25-cookie"
  } catch { return false }
}
