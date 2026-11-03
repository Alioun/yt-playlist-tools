import type { NativeBrowser } from "../adapters/browser"
import type { Registrar } from "../registrar/ports"
import type { Requester, Tabs } from "../tabs/ports"
import type { Actions } from "./actions"
import { candidate, tabOrder, type NativeTab } from "./any-tab"
import { isMusicAdFailure, type JobOf } from "../../shared/contracts"
import type { PlayingNow } from "../../shared/contracts/playing-now"
import type { UiAddAnswer, UiAddPayload, UiAddUndoAnswer, UiAddUndoPayload, UiMembershipAnswer, UiMembershipPayload, UiRemoveAnswer, UiRemovePayload } from "../../shared/contracts/ui-add"
import { toastText } from "../../shared/copy"
import type { I18n } from "../../shared/i18n"
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
    if (!(await native.permissions.contains({ origins: [siteBundles.music.match] }).catch(() => false))) return { kind: "no-access" }
    const raw: NativeTab[] = await native.tabs.query({ url: siteBundles.music.match }).catch(() => [])
    const tabs = raw.flatMap(tab => {
      const value = candidate(tab)
      return value ? [value] : []
    })
    for (const tabId of tabOrder(tabs, { windowId: req.windowId, incognito: req.incognito })) {
      try {
        await deps.registrar.ensure(tabId, { core: true })
      } catch {
        continue
      }
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

/**
 * Playing now's Save (`ui.add`): AddFlow runs it in the tab the row read, as the account it was read with, and the
 * row shows its answer in YM-SAVE's words (YM-POP-3, YM-POP-5). It never falls back to another tab.
 */
export function createPlayingSave(deps: { readonly actions: Pick<Actions, "addFromPopup">; readonly i18n: I18n; readonly consented: () => boolean }) {
  return async function save(req: Requester, payload: UiAddPayload): Promise<UiAddAnswer> {
    if (!deps.consented()) return { kind: "unavailable" }
    const report = await deps.actions.addFromPopup({ tabId: payload.tabId, incognito: req.incognito, site: payload.request.site }, payload.acct, payload.request)
    if (report.kind !== "report") return report.kind === "stopped" ? { kind: "failed", text: deps.i18n.message("playing_failed") } : report
    const outcomes = Object.values(report.outcomes)
    const kind = outcomes.some(outcome => outcome.kind === "added") ? "added" : outcomes.some(outcome => outcome.kind === "already-in") ? "already-in" : "failed"
    const titles = { ...(payload.request.title ? { video: payload.request.title } : {}), playlists: report.titles }
    const text = report.toast ? toastText(report.toast, titles, "music", deps.i18n) : deps.i18n.message("playing_failed")
    return kind === "added" && report.undo ? { kind, text, undo: report.undo } : { kind, text }
  }
}

/** Undo of Playing now's save, in the tab it saved in, while that tab still shows the same account (YM-POP-3). */
export function createPlayingUndo(deps: { readonly actions: Pick<Actions, "undoFromPopup">; readonly i18n: I18n; readonly consented: () => boolean }) {
  return async function undo(req: Requester, payload: UiAddUndoPayload): Promise<UiAddUndoAnswer> {
    if (!deps.consented()) return { kind: "unavailable" }
    const report = await deps.actions.undoFromPopup({ tabId: payload.tabId, incognito: req.incognito, site: payload.site ?? "music" }, payload.acct, payload.handle)
    switch (report.kind) {
      case "undone":
      case "expired":
      case "no-tab":
      case "account-changed":
        return { kind: report.kind }
      case "failed":
        return { kind: "failed", text: deps.i18n.message("feedback_www_manual_untitled_undo_failed") }
      default:
        return { kind: "unavailable" }
    }
  }
}

/** The popup picker sheet's untick and membership read, in the tab its row names, as that tab's account (UI-POP-14, YM-POP-4). */
export function createPopupItem(deps: { readonly actions: Pick<Actions, "removeFromPopup" | "membershipFromPopup">; readonly consented: () => boolean }) {
  return {
    async remove(req: Requester, payload: UiRemovePayload): Promise<UiRemoveAnswer> {
      if (!deps.consented()) return { kind: "unavailable" }
      return deps.actions.removeFromPopup({ tabId: payload.tabId, incognito: req.incognito, site: payload.request.site }, payload.acct, payload.request)
    },
    async membership(req: Requester, payload: UiMembershipPayload): Promise<UiMembershipAnswer> {
      if (!deps.consented()) return { kind: "unavailable" }
      return deps.actions.membershipFromPopup({ tabId: payload.tabId, incognito: req.incognito, site: payload.site }, payload.acct, payload.video, req)
    }
  }
}
