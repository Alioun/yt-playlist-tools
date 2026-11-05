import type { browser } from "wxt/browser"
import type { BrowserBackendPort, BrowserLocalizationPort } from "../../../src/ui/backend/browser"
import type { FirstRunPermissionsPort } from "../../../src/background/adapters/first-run"
import type { createFirstRunReceiver } from "../../../src/background/router/first-run"
import type { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"

function nativeCompatibility(native: typeof browser) {
  const backend: BrowserBackendPort = native
  const localization: BrowserLocalizationPort = native
  const permissions: FirstRunPermissionsPort = native.permissions
  void [backend, localization, permissions]
}
void nativeCompatibility

function autoAddOwnerCompatibility(owner: ReturnType<typeof createLocalFilterWriter>) {
  const canonical: Parameters<typeof createFirstRunReceiver>[0]["owner"] = owner
  const read: typeof owner.readAutoAddChoice = canonical.readAutoAddChoice
  const change: typeof owner.changeAutoAddChoice = canonical.changeAutoAddChoice
  void [read, change]
}
void autoAddOwnerCompatibility
