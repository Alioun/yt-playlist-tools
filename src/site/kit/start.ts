import type { Site } from "../../shared/contracts"
import { pageGlobal } from "../global"
import { installKit } from "./install"

/** Installs the kit once per page, after its site's core (ARC-MAN-09), with the linked Svelte namespaces. */
export function startKit(site: Site, namespaces: unknown, lib: object): void {
  const global = pageGlobal()
  const core = global.core
  if (!core || core.site !== site || core.disposed || global.kit) return
  global.svelte = namespaces
  global.kit = installKit(core, lib)
  global.loaded.set(`kit-${site}`, core.build)
}
