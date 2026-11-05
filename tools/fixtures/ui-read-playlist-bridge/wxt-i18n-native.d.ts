import type { browser } from "@wxt-dev/browser"

declare global {
  namespace I18n {
    type Static = Omit<typeof browser.i18n, "getMessage">
  }
}
