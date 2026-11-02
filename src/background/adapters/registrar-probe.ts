import { isBuildId } from "../../shared/contracts/vocabulary"
import { siteBundles } from "../../shared/features/registration"
import { pagePresenceEvent } from "../../shared/rpc/page-channel"
import type { ProbePort } from "../registrar/ports"

type Injection<Args extends unknown[], Result> = {
  readonly target: { readonly tabId: number; readonly frameIds: number[] }
  readonly world: "ISOLATED" | "MAIN"
  readonly func: (...args: Args) => Result
  readonly args?: Args
}
export type ProbeBrowser = { readonly scripting: {
  executeScript<Args extends unknown[], Result>(injection: Injection<Args, Result>): Promise<readonly { readonly frameId: number; readonly documentId?: string; readonly result?: unknown }[]>
} }

function isolatedInventory(): { documentId: string; loaded: [string, string][] } {
  const scope = globalThis as { __pp?: { loaded?: unknown; documentId?: string } }
  scope.__pp ??= {}
  scope.__pp.documentId ??= crypto.randomUUID()
  const loaded = scope.__pp.loaded instanceof Map ? [...scope.__pp.loaded].filter((entry): entry is [string, string] =>
    typeof entry[0] === "string" && typeof entry[1] === "string") : []
  return { documentId: scope.__pp.documentId, loaded }
}
function pageHalfPresent(event: string, build: string): boolean {
  return !document.dispatchEvent(new CustomEvent(event, { detail: build, cancelable: true }))
}

// Pages record each file by its bundle name ("core-www"); the Registrar registers and injects them by file ("core-www.js").
const fileOf = (name: string) => name.endsWith(".js") ? name : `${name}.js`

/**
 * Reads which of our files run in a tab's top document, at which build (06 ARC-MAN-13). The isolated world
 * answers from `__pp.loaded`; the page half answers the cancelable presence event for its build.
 */
export function nativeRegistrarProbe(browser: ProbeBrowser): ProbePort {
  return { async inspect({ tabId, site, build }) {
    try {
      const [isolated] = await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "ISOLATED", func: isolatedInventory })
      const [main] = await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "MAIN", func: pageHalfPresent, args: [pagePresenceEvent, build] })
      const inventory: unknown = isolated?.result
      if (!isolated || !main || inventory === null || typeof inventory !== "object") return { kind: "unavailable", reason: "not-observed" }
      const { documentId, loaded } = inventory as ReturnType<typeof isolatedInventory>
      const nativeDocument = "documentId" in isolated && typeof isolated.documentId === "string" ? isolated.documentId : documentId
      const files = loaded.flatMap(([file, fileBuild]) => isBuildId(fileBuild) ? [{ file: fileOf(file), build: fileBuild }] : [])
      if (main.result === true) files.push({ file: fileOf(siteBundles[site].page), build })
      return { kind: "observed", documentId: nativeDocument, loaded: files }
    } catch { return { kind: "unavailable", reason: "inaccessible" } }
  } }
}
