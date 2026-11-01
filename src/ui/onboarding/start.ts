import { createFirstRunOwner, type FirstRunServices } from "../backend/first-run-owner"
import type { ExtensionPage } from "../shell/start"
import { createFirstRunText } from "./text"

/**
 * The first-run page over the real backend. Until the page's own services land (B39), it reads the account in
 * view only to tell a signed-out tab apart, has no playlist titles or picker, and sends destinations to Settings.
 */
export function startFirstRun(page: ExtensionPage) {
  const services: FirstRunServices = {
    account: { async read() {
      const answer = await page.backend.call("ui.accountInView", {})
      return answer.kind === "answered" && answer.result.kind === "account" && "signedIn" in answer.result && !answer.result.signedIn
        ? { kind: "signed-out" } : { kind: "no-tab" }
    } },
    playlists: { title: async () => undefined },
    chooser: { choose: async () => ({ kind: "unavailable" }) },
    open: () => page.openSettings()
  }
  const text = createFirstRunText(page.i18n)
  return { text, owner: createFirstRunOwner(page.backend, services, page.platform, text) }
}
