import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { isAccountKey } from "../../../src/shared/model/validation"
import { createScriptedBackend } from "../../../src/ui/backend/scripted"
import type { ExtensionPage } from "../../../src/ui/shell/start"
import { englishI18n } from "../localization/scripted"

/**
 * The production popup's page over a synthetic account whose setup holds the given label.
 * A second setup turns the header's account into the menu of which setup to show (UI-POP-07).
 */
export function popupPage(label: { readonly name: string; readonly handle?: string }, secondSetup: boolean): ExtensionPage {
  const acct = "AAAAAAAAAAAAAAAA",
    other = "BBBBBBBBBBBBBBBB",
    build = "reported-issues"
  if (!isAccountKey(acct) || !isBuildId(build)) throw Error("Invalid fixture identifiers")
  const stamped = (label: { readonly name: string; readonly handle?: string }) => ({ v: 1, gen: "g", at: 1, by: "device", data: { label } })
  const scripted = createScriptedBackend({
    build,
    deadline: (ms, expire) => {
      const timer = setTimeout(expire, ms)
      return () => clearTimeout(timer)
    },
    records: {
      schema: 1,
      device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false },
      [`doc:setup:${acct}`]: stamped(label),
      ...(secondSetup ? { [`doc:setup:${other}`]: stamped({ name: "Bea" }) } : {})
    },
    answers: [],
    respond: {
      "ui.accountInView": () => ({ kind: "account", source: "active", tabId: 4, signedIn: true, acct }),
      "ui.status": () => ({ kind: "status", paused: false, tab: { kind: "site", site: "www", tabId: 4, signedIn: true, acct }, health: [] })
    }
  })
  return {
    backend: scripted.backend,
    i18n: englishI18n(),
    platform: { browser: "firefox", os: "windows" },
    private: false,
    windowId: 1,
    version: "2.0.0",
    beta: false,
    open() {},
    openSettings() {},
    openFirstRun() {},
    commands: { read: async () => ({ kind: "unavailable" }), named: async () => null },
    canonical: async () => englishI18n(),
    applyTheme() {}
  }
}
