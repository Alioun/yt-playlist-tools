import type { NativeBrowser } from "../adapters/browser"
import { createGatherBrowser, type GatherBrowser } from "../adapters/gather-browser"
import { authenticateTab, runtimeTransport, tabTarget, timerDeadline, type RuntimePort } from "../adapters/runtime"
import type { NativeSender } from "../adapters/sender-origin"
import type { AddFlow } from "../add-flow/add-flow"
import { createGather, type Destination, type Gather, type GatherResult, type GatherState, type GatherTarget, type Scope } from "../gather/gather"
import { lastLine, progressLine, resultLine, undoLine, waitingLine, type CopyContext, type GatherSummary } from "../gather/copy"
import { createGatherTriggers, type WakeReason } from "../gather/triggers"
import type { Registrar } from "../registrar/ports"
import type { GatherRoutes } from "../router/ui-playlists"
import type { StartingOwner } from "../store/store-lifecycle"
import type { StatusProducer } from "../tab-view/producer"
import type { Requester, TabContext, TabNativePort, Tabs } from "../tabs/ports"
import { readTabStatuses } from "./page-status"
import type { BuildId, JobOf } from "../../shared/contracts"
import { tabAskContract, tabGatherContract, type TabAskMessages, type TabGatherMessages } from "../../shared/contracts/tab-actions"
import type { TabHello } from "../../shared/contracts/tabs"
import { gatherPush, isGatherPushShown, type GatherLine, type GatherPush, type UiGatherAnswer, type UiGathers } from "../../shared/contracts/ui-gather"
import type { I18n } from "../../shared/i18n"
import { cacheRows } from "../../shared/model/account-cache"
import { defaultSettings } from "../../shared/model/defaults"
import { isPlaylistId, type AccountKey, type PlaylistId, type Settings, type Setup } from "../../shared/model"
import { videoOf, type GatherAccess, type GatherLanguage } from "../../shared/rules/gather"
import { createRpc, createRpcCaller } from "../../shared/rpc/rpc"
import { siteBundles } from "../../shared/features/registration"

type Owner = Pick<StartingOwner, "readSession" | "changeSession" | "readSetup" | "readPlaylistCache">
type Health = Record<Destination, "working" | "not-working">
const working: Health = { player: "working", queue: "working", playlist: "working" }

/**
 * Gather tabs in the background (ARC-MOD-40, ARC-MSG-16): the controller over the browser's tabs, its three triggers,
 * the `ui.gather*` routes and where a result shows. A gather the popup started answers in the popup's row; once the popup
 * has closed, and for every automatic gather, a playlist gather's toast shows in the tab it saved from, and the gathering
 * window's focused tab gets the toolbar's 3 s ✓ or ✕ (YT-GT-31). Show feedback hides only confirmations.
 */
export function composeGather(deps: {
  readonly native: Pick<NativeBrowser, "tabs" | "windows" | "i18n" | "permissions"> & { readonly runtime: RuntimePort }
  readonly senders: Parameters<typeof authenticateTab>[0]
  readonly browser: "chrome" | "firefox"
  readonly build: BuildId
  readonly owner: Owner
  readonly tabs: Tabs
  readonly nativeTabs: Pick<TabNativePort, "query" | "get">
  readonly addFlow: AddFlow
  readonly settings: (incognito: boolean) => Promise<Settings | null>
  readonly registrar: Pick<Registrar, "ensure">
  readonly statuses: StatusProducer
  readonly consented: () => boolean
  readonly i18n: I18n
  readonly flash: (tabId: number, ok: boolean, title: string) => void
  readonly log?: (line: string) => void
}) {
  const { native, i18n } = deps
  const log = deps.log ?? (line => console.info(`[Perchling] ${line}`))
  const port = createGatherBrowser({ tabs: native.tabs, windows: native.windows } as unknown as GatherBrowser, { unloadedReopen: deps.browser === "firefox" })
  let settings: Settings["gather"] = defaultSettings().gather
  let access: GatherAccess = { www: false, music: false, musicSection: false }
  let health: Health = working
  let disposed = false
  const running = new Set<number>()
  // Automatic failure toasts are limited as auto-add's are (YT-GT-29): each kind once per browser session.
  const shownOnce = new Set<string>()

  async function readAccess(all: Settings): Promise<GatherAccess> {
    const has = (match: string) => native.permissions.contains({ origins: [match] }).catch(() => false)
    return { www: await has(siteBundles.www.match), music: await has(siteBundles.music.match), musicSection: all.musicSection }
  }
  // Gather's status follows its destinations (YT-GT-36): not working without YouTube's player, partly working without the queue or the playlist route.
  async function readHealth(all: Settings): Promise<Health> {
    const session = await deps.owner.readSession().catch(() => null)
    if (session?.kind !== "memory") return working
    const found = [...session.memory.tabs].find(([, record]) => record.site === "www")
    if (!found) return working
    const statuses = await readTabStatuses({ statuses: deps.statuses, tab: tabId => deps.nativeTabs.get(tabId), build: deps.build }, all, found[0], found[1], false).catch(() => [])
    const status = statuses.find(row => row.feature === "gather")
    if (!status || status.state === "working") return working
    return { player: status.state === "not-working" ? "not-working" : "working", queue: status.jobs.includes("queueAddList") ? "not-working" : "working",
      playlist: status.jobs.some(job => job === "addBatch" || job === "removeBatch" || job === "membership") ? "not-working" : "working" }
  }
  async function prepare(incognito: boolean): Promise<Settings | null> {
    const all = await deps.settings(incognito)
    if (!all) return null
    settings = all.gather
    access = await readAccess(all)
    health = await readHealth(all)
    return all
  }

  async function setupOf(acct: AccountKey): Promise<Setup | null> {
    const read = await deps.owner.readSetup(acct).catch(() => null)
    return read?.kind === "value" && read.view.kind === "live" ? read.view.setup as Setup : null
  }
  async function titleOf(acct: AccountKey, playlist: PlaylistId, incognito: boolean): Promise<string> {
    if (playlist === "WL") return i18n.message("picker_watchLater")
    const read = await deps.owner.readPlaylistCache({ acct, private: incognito }).catch(() => null)
    const row = read?.kind === "cache" && read.cache ? cacheRows(read.cache, "www").find(entry => entry.id === playlist) : undefined
    return row?.title || i18n.message("picker_gatherTitle")
  }
  async function accountName(acct: AccountKey | null): Promise<string> {
    const setup = acct ? await setupOf(acct) : null
    return setup?.label?.name || i18n.message("copy_account")
  }
  const context = async (acct: AccountKey | null): Promise<CopyContext> => ({ i18n, account: await accountName(acct), now: Date.now() })

  async function target(req: Requester): Promise<GatherTarget> {
    const view = await deps.tabs.accountInView(req)
    if (view.kind !== "account") return { kind: "no-tab" }
    const acct = view.acct
    if (acct === null) return { kind: "signed-out" }
    const playlist = (await setupOf(acct))?.gather
    if (!isPlaylistId(playlist)) return { kind: "choose", acct }
    return { kind: "playlist", acct, playlist, title: await titleOf(acct, playlist, req.incognito) }
  }

  async function language(title: string): Promise<GatherLanguage> {
    try {
      const detected = await native.i18n.detectLanguage(title)
      const [top] = detected.languages
      if (!detected.isReliable || !top || top.language === "und") return "no-answer"
      return top.language === "en" || top.language.startsWith("en-") ? "english" : "other"
    } catch { return "no-answer" }
  }

  async function push(payload: GatherPush): Promise<boolean> {
    if (disposed) return false
    try { return isGatherPushShown(await native.runtime.sendMessage(gatherPush(deps.build, payload))) } catch { return false }
  }
  async function ask<K extends keyof TabAskMessages>(tabId: number, kind: K, payload: TabAskMessages[K]["payload"]) {
    const caller = createRpcCaller<TabAskMessages>(tabTarget(native.tabs, tabId), { build: deps.build, deadline: timerDeadline, contract: tabAskContract })
    try { return await caller.call(kind, payload) } finally { caller.dispose() }
  }
  async function focusedTab(windowId: number): Promise<number | null> {
    try {
      const focused = await native.windows.getLastFocused()
      if (focused.id !== windowId || !focused.focused) return null
      const [shown] = await native.tabs.query({ active: true, windowId })
      return typeof shown?.id === "number" ? shown.id : null
    } catch { return null }
  }

  function logResult(result: GatherResult): void {
    const how = result.auto ? "by itself" : "from the popup"
    switch (result.kind) {
      case "playlist": log(`gather ${how}: saved ${result.saved}, already in ${result.already}, failed ${result.failed.length}, closed ${result.closed}`); break
      case "player": case "queue": log(`gather ${how} into ${result.kind}: ${result.count} videos, closed ${result.closed}`); break
      default: log(`gather ${how}: ${result.kind}`)
    }
  }
  // Where a result shows once nothing else can show it (YT-GT-31).
  async function delivered(result: GatherResult): Promise<void> {
    logResult(result)
    const copy = await context(result.kind === "playlist" ? result.acct : null)
    const row = resultLine(result, copy)
    if (!row) return
    const shown = await push({ windowId: result.windowId, running: false, line: row })
    if (shown && !result.auto) return
    const failure = row.tone === "failure"
    if (!failure && !settings.feedback) return
    if (result.auto && failure) {
      if (result.kind === "playlist" && result.failed.some(({ failure }) => failure === "rate-limited")) return
      const key = result.kind === "playlist" ? [...new Set(result.failed.map(({ failure }) => failure))].sort().join(",") : result.kind
      if (shownOnce.has(key)) return
      shownOnce.add(key)
    }
    if (result.kind === "playlist" && result.served !== undefined) {
      const toast = resultLine(result, copy, "toast")
      if (toast) {
        const tabId = result.served
        void deps.registrar.ensure(tabId, { core: true, kit: true })
          .then(() => ask(tabId, "bg.gatherToast", { text: toast.text, tone: failure ? "failure" : "confirmation", auto: result.auto === true, undo: result.undo }))
          .catch(() => {})
      }
    }
    const tabId = await focusedTab(result.windowId)
    if (tabId !== null) deps.flash(tabId, !failure, row.text)
  }

  const gather: Gather = createGather({
    native: port, addFlow: deps.addFlow, tabs: deps.tabs,
    session: { read: () => deps.owner.readSession(), change: change => deps.owner.changeSession(change) },
    settings: () => settings,
    access: () => access,
    target,
    health: to => health[to],
    language,
    random: Math.random,
    clock: { now: () => Date.now(), after: timerDeadline },
    observe(event) {
      if (event.kind === "progress") void push({ windowId: event.windowId, running: true, line: progressLine(event.done, event.total, i18n) })
      else if (event.kind === "result") void delivered(event.result).catch(() => {})
      else if (event.kind === "undo") log(`gather undo: ${event.result.kind}`)
      // The Monitor's site signals carry the player's no-effect once they reach the background; until then it's logged.
      else log("gather into YouTube's player: no list within 10 s")
    }
  })

  // ARC-ACC-73's serving tab for automatic gathering: the focused window's active youtube.com tab, then the gathering
  // window's, then other normal windows', most recently used first. At most 3 candidates and one injected core.
  async function serving(windowId: number, exclude: ReadonlySet<number>) {
    const queried = await deps.nativeTabs.query("www")
    if (queried.kind !== "tabs") return null
    let focused: number | null = null
    try { const window = await native.windows.getLastFocused(); if (window.focused && typeof window.id === "number") focused = window.id } catch {}
    const eligible = queried.tabs.filter(tab => !tab.incognito && !tab.discarded && !tab.frozen && !exclude.has(tab.tabId))
    const recent = [...eligible].sort((x, y) => y.lastAccessed - x.lastAccessed)
    const order = [...new Set([...eligible.filter(tab => tab.windowId === focused && tab.active), ...recent.filter(tab => tab.windowId === windowId), ...recent]
      .map(tab => tab.tabId))].slice(0, 3)
    let injected = false
    for (const tabId of order) {
      const [known] = await deps.tabs.known({ kind: "tab", tabId })
      let acct: AccountKey | null = known && !known.privateTab ? known.acct : null
      if (!known) {
        if (injected) continue
        injected = true
        const answer = await deps.tabs.runIn<JobOf<"account">>(tabId, { job: { kind: "account" } },
          { site: "www", req: { windowId, incognito: false, activeTabId: null }, account: { kind: "any" } })
        acct = answer.kind === "result" && answer.result.ok && answer.result.data.signedIn ? answer.result.data.acct : null
      }
      if (acct === null) continue
      const setup = await setupOf(acct)
      const playlist = setup?.gather
      // A gather playlist marked Missing or Full stops automatic gathering for its account (YT-GT-29).
      if (!isPlaylistId(playlist) || setup?.marks[playlist]) continue
      return { tabId, acct, playlist, title: await titleOf(acct, playlist, false) }
    }
    return null
  }

  const triggers = createGatherTriggers({
    async settings() {
      if (!deps.consented()) return null
      const all = await prepare(false)
      return all?.gather ?? null
    },
    access: async () => access,
    native: port,
    session: { read: () => deps.owner.readSession() },
    serving,
    gather,
    clock: { now: () => Date.now(), after: timerDeadline },
    waiting: waiting => { void push({ windowId: null, running: false, line: waiting ? waitingLine(i18n) : null }) }
  })

  async function undone(state: GatherState, id: string, incognito: boolean): Promise<{ count: number; title: string } | null> {
    const own = state.last.find(result => result.kind === "playlist" && result.undo === id)
    if (own?.kind === "playlist") return { count: own.saved, title: own.title }
    const record = state.history.find(entry => entry.kind !== "sent" && entry.record.id === id)
    if (!record || record.kind === "sent") return null
    return { count: record.kind === "undo" ? record.record.added.length : 0, title: await titleOf(record.record.acct, record.record.playlist, incognito) }
  }
  // The newest gather, from the canonical record in a normal window and from memory in a private one (DATA-58).
  async function summary(state: GatherState, scope: Scope): Promise<GatherSummary | null> {
    const [record] = state.history
    if (scope === "normal" && record) {
      if (record.kind === "sent") return { id: record.record.id, at: record.record.at, auto: record.record.auto, count: record.record.count, destination: { kind: record.to }, undo: false }
      const own = state.last.find(result => result.kind === "playlist" && result.undo === record.record.id)
      const count = own?.kind === "playlist" ? own.saved : record.kind === "undo" ? record.record.added.length : 0
      return { id: record.record.id, at: record.record.at, auto: record.record.auto, count, undo: state.undoable.includes(record.record.id),
        destination: { kind: "playlist", title: own?.kind === "playlist" ? own.title : await titleOf(record.record.acct, record.record.playlist, false) } }
    }
    const result = state.last.find(entry => entry.kind === "playlist" || entry.kind === "player" && entry.confirmed || entry.kind === "queue" && entry.outcome === "confirmed")
    if (!result) return null
    if (result.kind === "playlist") return { id: result.undo ?? result.id, at: result.at, auto: result.auto === true, count: result.saved, undo: result.undo !== null, destination: { kind: "playlist", title: result.title } }
    if (result.kind === "player" || result.kind === "queue") return { id: result.id, at: result.at, auto: false, count: result.count, undo: false, destination: { kind: result.kind } }
    return null
  }

  async function ready(req: Requester): Promise<"ready" | "off" | "unavailable"> {
    if (disposed || !deps.consented()) return "unavailable"
    const all = await prepare(req.incognito)
    if (!all) return "unavailable"
    return all.gather.on ? "ready" : "off"
  }
  const answer = (line: GatherLine | null, result: GatherResult): UiGatherAnswer =>
    line ? { kind: "line", line } : { kind: result.kind === "busy" ? "busy" : result.kind === "off" ? "off" : "unavailable" }

  const routes: GatherRoutes = {
    async gather(req, payload) {
      const state = await ready(req)
      if (state !== "ready") return { kind: state }
      if (running.has(req.windowId)) return { kind: "busy" }
      running.add(req.windowId)
      try {
        const result = payload.retry ? await gather.retry(payload.retry, req) : await gather.now(req)
        const copy = await context(result.kind === "choose" ? result.acct : result.kind === "playlist" ? result.acct : null)
        return answer(resultLine(result, copy), result)
      } finally { running.delete(req.windowId) }
    },
    async undo(req, payload) {
      const state = await ready(req)
      if (state !== "ready") return { kind: state }
      const before = await undone(await gather.last(req.incognito ? "private" : "normal"), payload.id, req.incognito)
      return { kind: "line", line: undoLine(await gather.undo(payload.id, req), before, i18n) }
    },
    async gathers(req): Promise<UiGathers> {
      const state = await ready(req)
      if (state !== "ready") return { kind: state }
      const scope: Scope = req.incognito ? "private" : "normal"
      if (scope === "normal" && triggers.waiting()) return { kind: "gathers", running: running.has(req.windowId), line: waitingLine(i18n) }
      const last = await summary(await gather.last(scope), scope)
      return { kind: "gathers", running: running.has(req.windowId), line: last ? lastLine(last, await context(null)) : null }
    }
  }

  // A gather toast's Undo, from the tab it saved from, as that tab's account (UI-TOAST-17).
  const tabRpc = createRpc<TabGatherMessages, NativeSender>(runtimeTransport(native.runtime), { build: deps.build, deadline: timerDeadline, contract: tabGatherContract })
  const unhandle = tabRpc.handle({ authenticate: authenticateTab(deps.senders), handlers: {
    async "tab.gatherUndo"({ acct, request }, tab) {
      const [known] = await deps.tabs.known({ kind: "tab", tabId: tab.origin.tabId })
      if (!known || known.acct !== acct || known.privateTab !== tab.origin.incognito || await ready({ windowId: tab.windowId, incognito: tab.origin.incognito, activeTabId: tab.origin.tabId }) !== "ready") {
        return { text: i18n.message("gather_undoFailed"), tone: "failure" }
      }
      const req: Requester = { windowId: tab.windowId, incognito: tab.origin.incognito, activeTabId: tab.origin.tabId }
      const before = await undone(await gather.last(req.incognito ? "private" : "normal"), request.id, req.incognito)
      const result = await gather.undo(request.id, req)
      if (result.kind === "undone") { void push({ windowId: null, running: false, line: null }); return null }
      return { text: undoLine(result, before, i18n).text, tone: "failure" }
    }
  } })

  return {
    routes,
    // Every tab.hello wakes trigger 1's check; a video tab's starts or joins its window's burst while trigger 2 or 3 is on.
    hello(context: TabContext, hello: TabHello): void {
      if (disposed || !deps.consented()) return
      void (async () => {
        const all = await prepare(false)
        const auto = all?.gather.auto
        if (!all?.gather.on || !auto || !(auto.unvisited || auto.background || auto.count)) return
        if (!context.tab.incognito && context.tab.site === "www" && (auto.background || auto.count)) {
          const read = await port.read(context.tab.tabId)
          if (read.kind === "tab" && videoOf(read.tab.url, access)) {
            triggers.seen({ tabId: context.tab.tabId, windowId: read.tab.windowId, incognito: read.tab.incognito, hidden: hello.hidden, fresh: hello.fresh })
          }
        }
        triggers.woke("hello")
      })().catch(() => {})
    },
    woke(reason: WakeReason): void { if (!disposed) triggers.woke(reason) },
    dispose() {
      if (disposed) return
      disposed = true
      for (const stop of [() => triggers.dispose(), () => gather.dispose(), unhandle, () => tabRpc.dispose()]) { try { stop() } catch {} }
    }
  }
}
