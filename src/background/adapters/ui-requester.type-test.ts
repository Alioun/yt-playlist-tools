import type { browser } from "wxt/browser"
import type { UiRequesterPorts, UiRequester } from "./ui-requester"
import type { Requester } from "../tabs/ports"

function nativeCompatibility(native: typeof browser, requester: Requester) {
  const ports: UiRequesterPorts = native
  // @ts-expect-error negative: body-derived-requester. Only native authentication creates the private brand.
  const forged: UiRequester = { ui: { kind: "ui", page: "popup", origin: { kind: "ui", windowId: 1, incognito: false } }, requester, principal: "payload", verified: true }
  void [ports, forged]
}
void nativeCompatibility
