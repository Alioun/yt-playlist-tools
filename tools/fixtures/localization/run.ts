import { createFirstRunText } from "../../../src/ui/onboarding/text"
import { createBrowserI18n } from "../../../src/ui/backend/browser"
import { matchesRenderedDisclosure } from "../../../src/ui/backend/rendered-disclosure"
import catalogue from "../../../src/public/_locales/en/messages.json"
import { scriptedMessages } from "./scripted"

export function runLocalizationFixture(): readonly string[] {
  const calls: { name: string; substitutions: string[] }[] = []
  const port = scriptedMessages()
  const i18n = createBrowserI18n(
    {
      i18n: {
        getUILanguage: () => "en",
        getMessage(name: string, substitutions?: string | string[]) {
          calls.push({ name, substitutions: typeof substitutions === "string" ? [substitutions] : (substitutions ?? []) })
          return port.getMessage(name, substitutions)
        }
      }
    },
    catalogue
  )
  const constructionCalls = calls.length
  const text = createFirstRunText(i18n)
  const pseudo = createFirstRunText(createBrowserI18n({ i18n: scriptedMessages({ pseudo: true }) }, catalogue))
  const output = [
    { case: "construction", nativeMessages: constructionCalls, authorityOperations: 0 },
    { case: "named", output: i18n.message("copy_list_three", { third: "C", first: "A", second: "B" }), native: calls.at(-1) },
    { case: "counts", zero: text.copy.pick.continue(0), one: text.copy.pick.continue(1), many: text.copy.pick.continue(11), agree: text.copy.consent.agree(2) },
    {
      case: "disclosure",
      chrome: matchesRenderedDisclosure("chrome", text.disclosure),
      firefox: matchesRenderedDisclosure("firefox", text.disclosure),
      pseudo: matchesRenderedDisclosure("chrome", pseudo.disclosure),
      provisional: text.disclosure.items[3]?.provisional
    },
    { case: "pseudo", heading: pseudo.copy.pick.heading, preservedValue: pseudo.copy.finish.chooseFor("TITLE_A"), englishHeading: text.copy.pick.heading }
  ]
  return output.map(line => JSON.stringify(line))
}

if (import.meta.main) for (const line of runLocalizationFixture()) console.log(line)
