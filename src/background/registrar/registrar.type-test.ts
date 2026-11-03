import type { BuildId } from "../../shared/contracts/vocabulary"
import type { RegisteredScript } from "../../shared/features/registration"
import { createRegistrar } from "./registrar"
import type { OwnerPort, ProbePort, Registrar, RegistrarPorts, ScriptingPort, TabsPort } from "./ports"

declare const ports: RegistrarPorts
declare const registrar: Registrar
declare const owner: OwnerPort
declare const scripting: ScriptingPort
declare const tabs: TabsPort
declare const build: BuildId

type Check<T extends true> = T
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
export type RegistrarProofs = [
  Check<Equal<ReturnType<typeof createRegistrar>, Registrar>>,
  Check<Equal<ReturnType<Registrar["reconcile"]>, Promise<void>>>,
  Check<Equal<ReturnType<Registrar["ensure"]>, Promise<void>>>,
  Check<Equal<Parameters<ScriptingPort["register"]>[0], readonly RegisteredScript[]>>
]

export function intendedLineNegatives() {
  void registrar.ensure(1, { core: true })
  void registrar.ensure(1, { core: true, kit: true })
  void registrar.ensure(1, { popovers: true })
  const requested: { core?: boolean; kit?: boolean; popovers?: boolean } = { core: true }
  void registrar.ensure(1, requested)
  // @ts-expect-error Ensure accepts boolean requests, not string flags.
  void registrar.ensure(1, { core: "true" })
  // @ts-expect-error Ensure cannot enable a feature.
  void registrar.ensure(1, { feature: "auto-add" })
  // @ts-expect-error The request cannot override its authoritative site.
  void registrar.ensure(1, { core: true, site: "music" })
  // @ts-expect-error The build identity is not a free string.
  createRegistrar({ ...ports, build: "unvalidated" })
  const { probe: _probe, ...withoutProbe } = ports
  // @ts-expect-error Native and fake callers must both provide a real-shaped probe port.
  createRegistrar(withoutProbe)
  const { owner: _owner, ...withoutOwner } = ports
  // @ts-expect-error No empty owner fallback exists.
  createRegistrar(withoutOwner)
  // @ts-expect-error Registrar owns no feature settings writes.
  owner.enableFeature("auto-add")
  // @ts-expect-error Pacing cannot activate a tab.
  tabs.update(1, { active: true })
  // @ts-expect-error Registrar cannot reload a tab.
  tabs.reload(1)
  // @ts-expect-error Only the four owned registration IDs can be removed.
  void scripting.unregister(["unrelated"])
  // @ts-expect-error A registration cannot opt into subframes.
  const frames: RegisteredScript["allFrames"] = true
  const probe: ProbePort = {
    async inspect() {
      // @ts-expect-error Execution acknowledgements cannot replace a document inventory.
      const invalid: Awaited<ReturnType<ProbePort["inspect"]>> = { kind: "observed", build }
      return invalid
    }
  }
  void [frames, probe, _probe, _owner]
}
