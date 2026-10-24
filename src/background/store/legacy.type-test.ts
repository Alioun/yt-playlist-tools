import type { decodeUnclaimed, Filter, Settings, Stamped, Device, Unclaimed } from "../../shared/model"
import type { CanonicalUpgrade, MigrationContext, planLegacyStartup, StartupPlan, StartupSnapshot } from "./legacy-startup"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T

export type MigrationContractProofs = [
  Check<Equal<Unclaimed, {
    from: "1.4.5" | "1.5.0"
    autoAdd: string[]
    shortcutPlaylist: string | null
    originalShortcutId?: string
    filters: Record<string, Filter>
    at: number
  }>>,
  Check<Equal<typeof decodeUnclaimed, (raw: unknown) => Unclaimed>>,
  Check<Equal<{} extends Pick<Unclaimed, "originalShortcutId"> ? true : false, true>>,
  Check<Equal<Unclaimed["originalShortcutId"], string | undefined>>,
  Check<Equal<CanonicalUpgrade, { "doc:settings": Stamped<Settings>; device: Device; unclaimed: Unclaimed }>>,
  Check<Equal<typeof planLegacyStartup, (input: StartupSnapshot, context: MigrationContext) => StartupPlan>>
]

export type StoredClaimProofs = [
  Check<Equal<typeof import("../../shared/model").readStoredUnclaimed, (raw: unknown) => import("../../shared/model").StoredUnclaimed>>,
  Check<Equal<import("../../shared/model").StoredUnclaimed, { kind: "absent" } | { kind: "consumed" } | { kind: "pending"; data: Unclaimed }>>
]
