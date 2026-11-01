import { browserRegistrarPorts, type RegistrarBrowser } from "../adapters/registrar"
import { nativeRegistrarProbe, type ProbeBrowser } from "../adapters/registrar-probe"
import type { OwnerPort, OwnerSnapshot, Registrar, ScriptingPort } from "../registrar/ports"
import { createRegistrar } from "../registrar/registrar"
import type { StoreLifecycle } from "../store/store-lifecycle"
import type { BuildId } from "../../shared/contracts"
import { features } from "../../shared/features/registry"
import { decodeSettings } from "../../shared/model/decodeSettings"
import { defaultSettings } from "../../shared/model/defaults"

/**
 * The Registrar's view of the store (ARC-MAN-11): consent, a known layout and the shared settings, read from
 * the owner's tab projection. `refresh` re-reads after anything that may change them.
 */
export function registrarOwner(lifecycle: StoreLifecycle) {
  let snapshot: OwnerSnapshot = { kind: "held", revision: 0 }
  let revision = 0
  const listeners = new Set<() => void>()
  async function read(): Promise<Omit<Extract<OwnerSnapshot, { kind: "ok" }>, "revision"> | undefined> {
    const owner = lifecycle.owner()
    if (!owner) return undefined
    const projection = await owner.readTabProjection({ private: false, account: { kind: "unknown" } })
    if (projection.kind === "projection" && projection.projection.settings.kind === "value") {
      return { kind: "ok", consent: true, schemaOk: true, settings: decodeSettings(projection.projection.settings.settings) }
    }
    const schemaOk = !(projection.kind === "unavailable" && projection.reason === "newer-layout")
    return { kind: "ok", consent: false, schemaOk, settings: defaultSettings() }
  }
  async function refresh(): Promise<void> {
    const next = await read().catch(() => undefined)
    const same = next === undefined ? snapshot.kind === "held"
      : snapshot.kind === "ok" && JSON.stringify({ ...snapshot, revision: 0 }) === JSON.stringify({ ...next, revision: 0 })
    if (same) return
    snapshot = next === undefined ? { kind: "held", revision: ++revision } : { ...next, revision: ++revision }
    for (const listener of [...listeners]) { try { listener() } catch {} }
  }
  const port: OwnerPort = {
    async ready() {
      const state = await lifecycle.ready()
      if (state.kind === "active") await state.owner.ready().catch(() => undefined)
      await refresh()
      return state.kind === "active" && snapshot.kind === "ok" ? "ok" : "held"
    },
    current: () => snapshot,
    subscribe(changed) {
      listeners.add(changed)
      return () => { listeners.delete(changed) }
    }
  }
  return { port, refresh }
}

export function composeRegistrar(native: RegistrarBrowser & ProbeBrowser, build: BuildId, owner: OwnerPort): { registrar: Registrar; scripting: ScriptingPort } {
  const ports = browserRegistrarPorts({
    browser: native, build, registry: features, owner, probe: nativeRegistrarProbe(native),
    backgroundError: error => console.warn("[Perchling] registration", error.fact)
  })
  return { registrar: createRegistrar(ports), scripting: ports.scripting }
}
