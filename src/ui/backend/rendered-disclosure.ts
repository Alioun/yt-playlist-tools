import { sha256 } from "../../shared/i18n/identity"
import type { BrowserKind } from "../onboarding/features"
import type { DisclosureText } from "../onboarding/text"

export const FIRST_RUN_DISCLOSURE_VERSION = 1
// These fixed digests derive from the frozen version 1 source, independently of this catalogue.
// A catalogue edit needs a separately approved identity and version decision.
const expected = {
  "chrome": "d0cb6ba0a32a5b8e458807bbb11ebd0eb63211eec0ac4191d09dc7eb1aaff615",
  "firefox": "2ce3147d10d7f7df939e4cf28f90765f3838fa89ec8e42b2d5f8241af40feef8"
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
