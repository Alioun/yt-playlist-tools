import type { BrowserStartingOwner } from "../../../src/background/adapters/starting-owner"
import type { BackendPorts, ReadOnlyLocal } from "../../../src/ui/backend/backend"
import type { BrowserBackendPort } from "../../../src/ui/backend/browser"

function uiBoundary(owner: BrowserStartingOwner, local: ReadOnlyLocal) {
  // @ts-expect-error The canonical background facade is not the UI's local-storage collaborator.
  const uiLocal: BackendPorts["local"] = owner
  // @ts-expect-error The facade cannot become the browser UI's raw local writer.
  const browserLocal: BrowserBackendPort["storage"]["local"] = owner
  // @ts-expect-error UI local storage remains read-only.
  void local.set({ paused: true })
  void [uiLocal, browserLocal]
}
void uiBoundary
