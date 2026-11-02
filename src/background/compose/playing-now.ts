import type { NativeBrowser } from "../adapters/browser"
import type { Registrar } from "../registrar/ports"
import type { Requester, Tabs } from "../tabs/ports"
import type { Actions } from "./actions"
import { candidate, tabOrder, type NativeTab } from "./any-tab"
import { isMusicAdFailure, type JobOf } from "../../shared/contracts"
import type { PlayingNow } from "../../shared/contracts/playing-now"
import { siteBundles } from "../../shared/features/registration"

/**
 * The popup's Playing now (03 §17), read once when the popup opens and never polled (YM-POP-14). It reads the
 * focused window's active YouTube Music tab, else the one playing audio, else the most recently used (YM-POP-11).
 * A tab with no feature on gets only the site core, which draws nothing and stays inert (YM-FEAT-6, FT-16).
 */
export function composePlayingNow(deps: {
  readonly native: Pick<NativeBrowser, "tabs" | "permissions">
  readonly tabs: Pick<Tabs, "runIn" | "known">
  readonly registrar: Pick<Registrar, "ensure">
  readonly actions: Pick<Actions, "settings">
  readonly consented: () => boolean
}) {
  const { native } = deps
  return async function playingNow(req: Requester): Promise<PlayingNow> {
    if (!deps.consented()) return { kind: "unavailable" }
    const settings = await deps.actions.settings(req.incognito)
    if (!settings) return { kind: "unavailable" }
    if (!settings.musicSection) return { kind: "off" }
    if (!await native.permissions.contains({ origins: [siteBundles.music.match] }).catch(() => false)) return { kind: "no-access" }
    const raw: NativeTab[] = await native.tabs.query({ url: siteBundles.music.match }).catch(() => [])
    const tabs = raw.flatMap(tab => { const value = candidate(tab); return value ? [value] : [] })
    for (const tabId of tabOrder(tabs, { windowId: req.windowId, incognito: req.incognito })) {
      try { await deps.registrar.ensure(tabId, { core: true }) } catch { continue }
      const [known] = await deps.tabs.known({ kind: "tab", tabId })
      if (known && known.acct === null) return { kind: "signed-out", tabId }
      const outcome = await deps.tabs.runIn<JobOf<"nowPlaying">>(tabId, { job: { kind: "nowPlaying" } }, { site: "music", req, account: { kind: "any" } })
      if (outcome.kind !== "result") continue
      const { result } = outcome
      if (result.ok) return result.data === null ? { kind: "nothing-playing", tabId } : { kind: "song", tabId, song: result.data }
      if (isMusicAdFailure(result)) return { kind: "ad-playing", tabId }
    }
    return { kind: "no-tab" }
  }
}
