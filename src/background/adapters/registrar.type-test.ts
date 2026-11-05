import type { BuildId } from "../../shared/contracts/vocabulary"
import { browserRegistrarPorts, type BrowserRegistrarBindings, type RegistrarBrowser } from "./registrar"
import type { RegistrarPorts } from "../registrar/ports"

declare const native: typeof import("wxt/browser").browser
declare const bindings: BrowserRegistrarBindings
declare const build: BuildId

export const nativeBrowserCompatibility = native satisfies RegistrarBrowser
export const nativePortCompatibility = browserRegistrarPorts(bindings) satisfies RegistrarPorts

export function requiredNativeBindings() {
  const { probe: _probe, ...withoutProbe } = bindings
  // @ts-expect-error The native adapter has no successful default probe.
  browserRegistrarPorts(withoutProbe)
  const { owner: _owner, ...withoutOwner } = bindings
  // @ts-expect-error Startup readiness must be bound by the composition owner.
  browserRegistrarPorts(withoutOwner)
  // @ts-expect-error WXT runtime alone cannot implement scripting, tabs and access.
  const runtimeOnly: RegistrarBrowser = { runtime: native.runtime }
  // @ts-expect-error An arbitrary build string is not validated.
  browserRegistrarPorts({ ...bindings, build: "unknown-build" })
  const validated = browserRegistrarPorts({ ...bindings, build })
  void [validated, runtimeOnly, _probe, _owner]
}
