import type { FirstRunText } from "./text"
import { featureOf, inCatalogueOrder, type PageFeatureId } from "./features"
import type {
  AgreementRefusal, FeatureApplication, FirstRunOwner, PermissionGrant, PermissionNeeds, SyncedChoicesLookup
} from "./owner"

export type Step = "pick" | "consent" | "not-now" | "finish"
export type SyncLookupState = "off" | "looking" | "found" | "not-found" | "update-needed" | "failed" | "stopped"
export type AgreementState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "failed"; readonly reason: AgreementRefusal }
  | { readonly kind: "agreed"; readonly applications: readonly FeatureApplication[] }

// An agreement counts only when the owner confirms exactly the features this attempt asked for.
function confirms(applications: readonly FeatureApplication[], selected: readonly PageFeatureId[]): boolean {
  const confirmed = new Set(applications.map(item => item.feature))
  return confirmed.size === applications.length && confirmed.size === selected.length && selected.every(id => confirmed.has(id))
}

const noPermissions: Promise<PermissionGrant> = Promise.resolve({ music: false, browserMenu: false })

export function createFirstRun(owner: FirstRunOwner, text: FirstRunText) {
  let step = $state<Step>("pick")
  let picked = $state<readonly PageFeatureId[]>([])
  let fromSync = $state<readonly PageFeatureId[]>([])
  let syncOn = $state(false)
  let lookup = $state<SyncLookupState>("off")
  let agreement = $state<AgreementState>({ kind: "idle" })
  let active: SyncedChoicesLookup | undefined
  let attempts = 0
  let disposed = false

  function stopLookup(next: SyncLookupState) {
    active?.cancel()
    active = undefined
    lookup = next
  }

  async function startLookup() {
    const current = owner.lookupSyncedChoices()
    active = current
    lookup = "looking"
    let result: Awaited<SyncedChoicesLookup["result"]>
    try {
      result = await current.result
    } catch {
      result = { kind: "failed" }
    }
    if (active !== current) return
    active = undefined
    if (result.kind === "found") {
      const synced = inCatalogueOrder(result.features)
      fromSync = synced
      picked = inCatalogueOrder([...picked, ...synced])
    }
    lookup = result.kind === "unavailable" ? "failed" : result.kind
  }

  function needs(): PermissionNeeds {
    return {
      music: owner.browser === "chrome" && picked.some(id => featureOf(id).needsMusicAccess),
      browserMenu: picked.includes("browser-menu")
    }
  }

  return {
    get step() { return step },
    get picked() { return picked },
    get fromSync() { return fromSync },
    get syncOn() { return syncOn },
    get lookup() { return lookup },
    get agreement() { return agreement },
    get asksMusicAccess() { return needs().music },
    toggle(id: PageFeatureId, on: boolean) {
      if (disposed || step !== "pick") return
      picked = inCatalogueOrder(on ? [...picked, id] : picked.filter(other => other !== id))
      if (!on) fromSync = fromSync.filter(other => other !== id)
    },
    setSync(on: boolean) {
      if (disposed || step !== "pick" || on === syncOn) return
      syncOn = on
      if (on) void startLookup()
      else {
        stopLookup("off")
        fromSync = []
      }
    },
    continue() {
      if (disposed || step !== "pick") return
      if (lookup === "looking") stopLookup("stopped")
      step = "consent"
    },
    changeFeatures() {
      if (!disposed && step === "consent" && agreement.kind !== "pending") step = "pick"
    },
    notNow() {
      if (!disposed && step === "consent" && agreement.kind !== "pending") step = "not-now"
    },
    back() {
      if (!disposed && step === "not-now") step = "consent"
    },
    // Called straight from the Agree click: the permission prompt must start before anything is awaited (FT-40).
    agree(): Promise<void> | undefined {
      if (disposed || step !== "consent" || agreement.kind === "pending") return undefined
      const wanted = needs()
      const permissions = wanted.music || wanted.browserMenu ? owner.requestPermissions(wanted) : noPermissions
      agreement = { kind: "pending" }
      const attempt = ++attempts
      const selected = [...picked]
      return (async () => {
        let next: AgreementState
        try {
          const outcome = await owner.agree({ attempt, selected, syncOn, permissions, displayed: text.disclosure })
          if (outcome.attempt !== attempt) next = { kind: "failed", reason: "unconfirmed" }
          else if (outcome.kind === "not-agreed") next = { kind: "failed", reason: outcome.reason }
          else if (!confirms(outcome.applications, selected)) next = { kind: "failed", reason: "unconfirmed" }
          else next = { kind: "agreed", applications: outcome.applications }
        } catch {
          next = { kind: "failed", reason: "rejected" }
        }
        if (disposed) return
        agreement = next
        if (next.kind === "agreed") step = "finish"
      })()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopLookup(lookup === "looking" ? "stopped" : lookup)
    }
  }
}

export type FirstRunFlow = ReturnType<typeof createFirstRun>
