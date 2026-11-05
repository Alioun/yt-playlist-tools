import { browser } from "wxt/browser"
import type { BuildId, DiagnosticVocabulary, Site } from "../../../shared/contracts"
import { createSiteI18n } from "../../../shared/i18n"
import { createDomPageChannel } from "../../../shared/rpc/page-channel"
import { pageGlobal } from "../../global"
import { startSiteCore, type AnySiteCore, type SiteCoreOptions } from "../core"
import { nativeExtLinkRuntime } from "./extlink-runtime"

/**
 * Installs this build's core on `globalThis.__pp.core`, once per document. An older build's core in the same
 * world retires itself when the new PageLink announces its build (ARC-MAN-17).
 */
export function startNativeCore<S extends Site>(site: S, build: BuildId, vocabulary: DiagnosticVocabulary, items: SiteCoreOptions<S, unknown>["items"]): void {
  const global = pageGlobal()
  const existing = global.core
  if (existing && !existing.disposed && existing.build === build) return
  const core: unknown = startSiteCore<S, unknown>({
    site, build, vocabulary, items, document,
    channel: createDomPageChannel(document),
    runtime: nativeExtLinkRuntime(browser.runtime),
    i18n: createSiteI18n(browser.i18n)
  })
  global.core = core as AnySiteCore
  global.loaded.set(`core-${site}`, build)
}
