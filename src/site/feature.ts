import type { Site } from "../shared/contracts"
import type { CoreServices } from "./core/core"
import type { FeatureDefinition } from "./core/feature-host"
import { coreFor, pageGlobal } from "./global"
import type { Kit } from "./kit/install"

/**
 * A feature file's whole job (ARC-REG-04): hand its definition to the site core, with the services it needs
 * built from the core's and, for kit features, the kit's. Running a file twice defines the feature once.
 */
export function definePageFeature<S extends Site, Needs extends object>(
  file: string, site: S, feature: FeatureDefinition<S, Needs>, bind: (core: CoreServices<S>, kit: Kit | undefined) => Needs
): void {
  const global = pageGlobal()
  const core = coreFor(site)
  if (!core) return
  global.loaded.set(file, core.build)
  core.define({ id: feature.id, start: context => feature.start({ ...bind(context, global.kit), site: context.site, scope: context.scope, view: context.view }) })
}

/**
 * The registry names this file, so it must exist and load for the Registrar, but its feature isn't built yet.
 * It records that it ran and defines nothing, so switching the feature on changes nothing on the page.
 */
export function unbuiltPageFeature(file: string, site: Site): void {
  const core = coreFor(site)
  if (core) pageGlobal().loaded.set(file, core.build)
}
