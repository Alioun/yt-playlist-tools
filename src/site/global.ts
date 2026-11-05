import type { BuildId, Site } from "../shared/contracts"
import type { AnySiteCore, SiteCore } from "./core/core"
import type { Kit } from "./kit/install"
import type { Popovers } from "./popovers/types"

/**
 * `globalThis.__pp` in the isolated world (ARC-MOD-16). Every isolated script of ours in a frame shares it.
 * `loaded` names each file that ran, with its build, for the Registrar's probe. `documentId` identifies the
 * document where the browser reports no document ID of its own.
 */
export type PageGlobal = {
  core?: AnySiteCore
  kit?: Kit
  svelte?: unknown
  /** Installed by `popovers.js` (ARC-MOD-16, ARC-MOD-17). */
  popovers?: Popovers
  /** Opens waiting for `popovers.js`, which wakes them once it installs (each bundle has its own module state). */
  popoverWaiters?: Set<(popovers: Popovers) => void>
  loaded: Map<string, BuildId>
  documentId?: string
}

export function pageGlobal(): PageGlobal {
  const existing: unknown = Reflect.get(globalThis, "__pp")
  if (existing !== null && typeof existing === "object" && Reflect.get(existing, "loaded") instanceof Map) return existing as PageGlobal
  const created: PageGlobal = { ...(existing !== null && typeof existing === "object" ? existing : {}), loaded: new Map() }
  Reflect.set(globalThis, "__pp", created)
  return created
}

export function coreFor<S extends Site>(site: S): SiteCore<S> | undefined {
  const core = pageGlobal().core
  return core && core.site === site && !core.disposed ? core as unknown as SiteCore<S> : undefined
}
