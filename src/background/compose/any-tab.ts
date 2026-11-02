import type { NativeBrowser } from "../adapters/browser"
import { tabTarget, timerDeadline } from "../adapters/runtime"
import type { Registrar } from "../registrar/ports"
import type { Tabs } from "../tabs/ports"
import type { Actions } from "./actions"
import type { BuildId, JobOf, VideoInfo } from "../../shared/contracts"
import { tabAskContract, type TabAddReport, type TabAskMessages } from "../../shared/contracts/tab-actions"
import { toastText } from "../../shared/copy"
import type { I18n } from "../../shared/i18n"
import { isVideoId, type PlaylistId, type VideoId } from "../../shared/model"
import { createRpcCaller } from "../../shared/rpc/rpc"

export type CandidateTab = {
  readonly id: number; readonly windowId: number; readonly incognito: boolean; readonly active: boolean
  readonly audible: boolean; readonly discarded: boolean; readonly lastAccessed: number
}
type NativeTab = {
  readonly id?: number; readonly windowId?: number; readonly incognito?: boolean; readonly active?: boolean
  readonly audible?: boolean; readonly discarded?: boolean; readonly lastAccessed?: number
}
type MenuInfo = { readonly menuItemId: string | number; readonly linkUrl?: string; readonly pageUrl?: string }

const watchLater = "WL" as PlaylistId
export const menuIds = { parent: "pp-save", quickSave: "pp-save-quick", watchLater: "pp-save-later", choose: "pp-save-choose" } as const
export const flashMs = 3_000

/**
 * YT-ANY-04's tab order, in the focused window's kind with discarded tabs skipped: the focused window's active
 * tab, then tabs playing audio, then the most recently used.
 */
export function tabOrder(tabs: readonly CandidateTab[], focused: { readonly windowId: number; readonly incognito: boolean }): number[] {
  const eligible = tabs.filter(tab => tab.incognito === focused.incognito && !tab.discarded)
  const recent = [...eligible].sort((a, b) => b.lastAccessed - a.lastAccessed)
  const ordered = [...eligible.filter(tab => tab.windowId === focused.windowId && tab.active), ...recent.filter(tab => tab.audible), ...recent]
  return [...new Set(ordered.map(tab => tab.id))]
}
/** The video a link or page address names: `/watch?v=` or `/shorts/` on youtube.com. */
export function videoOfUrl(url: string | undefined): VideoId | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "www.youtube.com") return null
    const id = parsed.pathname === "/watch" ? parsed.searchParams.get("v") : parsed.pathname.startsWith("/shorts/") ? parsed.pathname.slice(8).split("/")[0] : null
    return isVideoId(id) ? id : null
  } catch { return null }
}
function candidate(tab: NativeTab): CandidateTab | null {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") return null
  return { id: tab.id, windowId: tab.windowId, incognito: tab.incognito === true, active: tab.active === true, audible: tab.audible === true,
    discarded: tab.discarded === true, lastAccessed: typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0 }
}
function confirmed(answer: TabAddReport): boolean {
  return answer.kind === "report" && Object.values(answer.outcomes).some(outcome => outcome.kind === "added" || outcome.kind === "already-in")
}

/**
 * Keys from any tab (YT-ANY) and Save from the browser's menu (YT-BM). Neither registers page code: a use injects
 * the page half, core and kit into the one tab it acts in, runs an explicit add there as that tab's account, and
 * asks that tab to show the answer.
 */
export function composeAnyTab(deps: {
  readonly native: NativeBrowser
  readonly build: BuildId
  readonly actions: Pick<Actions, "addInTab" | "settings">
  readonly tabs: Pick<Tabs, "runIn" | "known">
  readonly registrar: Pick<Registrar, "ensure">
  readonly consented: () => boolean
  readonly i18n: I18n
  /** Whether the composition root already listens for menu clicks, which it does from the worker's first turn when it can. */
  readonly menuClicksHeard: boolean
}) {
  const { native, actions, i18n } = deps
  let listening = deps.menuClicksHeard
  let disposed = false

  async function inject(tabId: number): Promise<boolean> {
    try { await deps.registrar.ensure(tabId, { core: true, kit: true }); return true } catch { return false }
  }
  async function currentVideo(tab: CandidateTab): Promise<VideoInfo | null> {
    const outcome = await deps.tabs.runIn<JobOf<"videoInfo">>(tab.id, { job: { kind: "videoInfo" } },
      { site: "www", req: { windowId: tab.windowId, incognito: tab.incognito, activeTabId: tab.id }, account: { kind: "any" } })
    return outcome.kind === "result" && outcome.result.ok ? outcome.result.data : null
  }
  async function ask<K extends keyof TabAskMessages>(tabId: number, kind: K, payload: TabAskMessages[K]["payload"]) {
    const caller = createRpcCaller<TabAskMessages>(tabTarget(native.tabs, tabId), { build: deps.build, deadline: timerDeadline, contract: tabAskContract })
    try { return await caller.call(kind, payload) } finally { caller.dispose() }
  }
  // The ✓ or ✕ on the focused tab's toolbar icon for 3 s, over anything else there, with the answer as its tooltip (YT-ANY-06).
  async function flash(tabId: number | undefined, ok: boolean, text: string) {
    if (tabId === undefined) return
    try {
      const before = await native.action.getTitle({ tabId })
      await native.action.setBadgeBackgroundColor({ tabId, color: ok ? "#14a39a" : "#c62828" })
      await native.action.setBadgeText({ tabId, text: ok ? "✓" : "✕" })
      await native.action.setTitle({ tabId, title: text })
      setTimeout(() => {
        void native.action.setBadgeText({ tabId, text: "" }).catch(() => {})
        void native.action.setTitle({ tabId, title: before }).catch(() => {})
      }, flashMs)
    } catch {}
  }
  function answerText(answer: TabAddReport, title: string | null): string {
    if (answer.kind === "report" && answer.toast) {
      return toastText(answer.toast, { ...(title ? { video: title } : {}), playlists: { [watchLater]: i18n.message("picker_watchLater"), ...answer.titles } }, "www", i18n)
    }
    return answer.kind === "signed-out" ? i18n.message("feedback_www_manual_untitled_failed_signed_out_one") : i18n.message("site_addUnanswered")
  }

  async function command(name: string): Promise<void> {
    // The two YouTube Music keys belong to YouTube Music's own work (03 §22).
    if (disposed || name !== "watch-later-current-video" || !deps.consented()) return
    const focused = await native.windows.getLastFocused().catch(() => null)
    if (!focused || typeof focused.id !== "number") return
    const settings = await actions.settings(focused.incognito)
    if (!settings?.anyTabKeys.on) return
    const raw = await native.tabs.query({ url: "https://www.youtube.com/*" }).catch(() => [] as NativeTab[])
    const [shown] = await native.tabs.query({ active: true, windowId: focused.id }).catch(() => [] as NativeTab[])
    const tabs = raw.flatMap(tab => { const value = candidate(tab); return value ? [value] : [] })
    for (const tabId of tabOrder(tabs, { windowId: focused.id, incognito: focused.incognito })) {
      const tab = tabs.find(entry => entry.id === tabId)
      if (!tab || !await inject(tabId)) continue
      const info = await currentVideo(tab)
      if (!info) continue
      const answer = await actions.addInTab({ tabId, incognito: tab.incognito, site: "www" },
        { site: "www", video: info.videoId, via: "picker", opener: "any-tab-keys", playlist: watchLater, ...(info.title ? { title: info.title } : {}) })
      void ask(tabId, "bg.toast", { answer, video: info.videoId, title: info.title || null, opener: "any-tab-keys" })
      await flash(shown?.id, confirmed(answer), answerText(answer, info.title || null))
      return
    }
    await flash(shown?.id, false, i18n.message("anyTab_noVideoTab"))
  }

  async function clicked(info: MenuInfo, tab: NativeTab | undefined): Promise<void> {
    const target = tab ? candidate(tab) : null
    if (disposed || !target || !deps.consented() || !Object.values(menuIds).includes(String(info.menuItemId) as never)) return
    const settings = await actions.settings(target.incognito)
    if (!settings?.browserMenu.on || !await inject(target.id)) return
    const linked = videoOfUrl(info.linkUrl)
    const current = linked ? null : await currentVideo(target)
    const video = linked ?? current?.videoId ?? videoOfUrl(info.pageUrl)
    if (!video) return
    const title = current?.title || null
    if (info.menuItemId === menuIds.choose) {
      const [known] = await deps.tabs.known({ kind: "tab", tabId: target.id })
      if (known && known.acct === null) {
        void ask(target.id, "bg.toast", { answer: { kind: "signed-out" }, video, title, opener: "browser-menu" })
        return
      }
      await ask(target.id, "bg.picker", { video, title, choose: false, opener: "browser-menu" })
      return
    }
    const named = title ? { title } : {}
    const answer = await actions.addInTab({ tabId: target.id, incognito: target.incognito, site: "www" }, info.menuItemId === menuIds.quickSave
      ? { site: "www", video, via: "quick-save", opener: "browser-menu", ...named }
      : { site: "www", video, via: "picker", opener: "browser-menu", playlist: watchLater, ...named })
    // With no quick-save playlist the item opens choose mode (YT-BM-03).
    if (answer.kind === "choose") await ask(target.id, "bg.picker", { video, title, choose: true, opener: "browser-menu" })
    else await ask(target.id, "bg.toast", { answer, video, title, opener: "browser-menu" })
  }
  const onClicked = (info: MenuInfo, tab?: NativeTab) => { void clicked(info, tab) }

  /** Shows Save to ▸ while the feature is on, consent stands and the optional permission is held (YT-BM-02, YT-BM-07). */
  async function reconcileMenu(): Promise<void> {
    const menus = native.contextMenus
    if (disposed || !menus) return
    const settings = deps.consented() ? await actions.settings(false) : null
    const granted = await native.permissions.contains({ permissions: ["contextMenus"] }).catch(() => false)
    try {
      await menus.removeAll()
      if (disposed || !settings?.browserMenu.on || !granted) return
      if (!listening) { menus.onClicked.addListener(onClicked); listening = true }
      const documentUrlPatterns = ["https://www.youtube.com/*"]
      menus.create({ id: menuIds.parent, title: i18n.message("browserMenu_saveTo"), contexts: ["link", "page", "video"], documentUrlPatterns })
      for (const [id, title] of [[menuIds.quickSave, "browserMenu_quickSave"], [menuIds.watchLater, "picker_watchLater"], [menuIds.choose, "browserMenu_choose"]] as const) {
        menus.create({ id, parentId: menuIds.parent, title: i18n.message(title), contexts: ["link", "page", "video"], documentUrlPatterns })
      }
    } catch {}
  }

  return {
    command, clicked, reconcileMenu,
    dispose() {
      disposed = true
      if (listening && !deps.menuClicksHeard) { try { native.contextMenus?.onClicked.removeListener(onClicked) } catch {} }
    }
  }
}
