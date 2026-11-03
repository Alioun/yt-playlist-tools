import { resolveSenderOrigin } from "../../adapters/sender-origin"
import { changeFeatureSetting, changeSharedSetting, type SharedSettingsOwner } from "../shared-settings"
import { isFeatureSettingChange, isSharedSettingChange } from "../../../shared/contracts/shared-settings"
import { isKeySettingChange } from "../../../shared/contracts/key-settings"
import type { ChangeAnswer } from "../../../shared/contracts/first-run"
import { uiContract, type UiMessages } from "../../../shared/contracts/ui"
import type {
  CreationId,
  ListOperationId,
  UiPlaylistPayload,
  UiPlaylistAnswer,
  UiPlaylistOpen,
  UiListRefresh,
  UiUnavailable,
  UiCreationAnswer,
  UiCreationPayload
} from "../../../shared/contracts/ui-playlists"
import { isChangePayload, isLookupPayload } from "../../../shared/contracts/first-run"
import { objectShape } from "../../../shared/contracts/object-shape"
import { CONTRACT_VERSION, inspectMessageHeader } from "../../../shared/contracts/protocol"
import type { Site } from "../../../shared/contracts/vocabulary"
import type { AccountKey } from "../../../shared/model/validation"
import { createRpc, type RpcOptions, type RpcReceiver } from "../../../shared/rpc/rpc"
import type { Transport } from "../../../shared/rpc/transport"
import { authenticateUiRequester, type UiRequester, type UiRequesterPorts } from "../../adapters/ui-requester"
import type { NativeSender } from "../../adapters/sender-origin"
import type { UiContext } from "../../adapters/runtime"
import type { Creation, Playlists, ListOpen } from "../../playlists/playlists"
import type { Requester, Tabs } from "../../tabs/ports"
import type { PlayingNow } from "../../../shared/contracts/playing-now"
import type { UiAddAnswer, UiAddPayload } from "../../../shared/contracts/ui-add"
import type { UiGatherAnswer, UiGatherMessages, UiGathers } from "../../../shared/contracts/ui-gather"
import type { createLocalFilterWriter } from "../../store/local-filter-writer"
import { createFirstRunReceiver, type FirstRunReceiverPorts, type FirstRunCanonicalOwner } from "../first-run"
import { listing, listRefresh, creationAnswer, jobOutcome, cacheStatus } from "./wire"
import { createClearAllReceiver } from "../clear-all"
import type { StoreLifecycle } from "../../store/store-lifecycle"
import { createPageReceiver, type PageReceiverPorts, type PageContext } from "../ui-pages"
import type { PageMessages } from "../../../shared/contracts/ui-pages"

type Owner = FirstRunCanonicalOwner & Pick<ReturnType<typeof createLocalFilterWriter>, "readTabProjection" | "readSession">
type Services = { readonly kind: "ready"; readonly tabs: Tabs; readonly playlists: Playlists } | { readonly kind: "unavailable" }
export type UiRouterPorts = {
  readonly lifecycle?: Pick<StoreLifecycle, "clearAll">
  readonly sharedSettings?: SharedSettingsOwner
  readonly native: UiRequesterPorts
  readonly owner: Owner
  readonly services: Services
  readonly firstRun: Pick<FirstRunReceiverPorts, "lookup" | "readAccess" | "startSync">
  readonly transport: Transport<NativeSender>
  readonly rpc: Omit<RpcOptions<UiMessages>, "contract">
  /** Reads the popup's Playing now from the YouTube Music tab it picks (YM-POP-10, YM-POP-11). */
  readonly playingNow?: (requester: Requester) => Promise<PlayingNow>
  /** Playing now's Save, in the tab the row read (ARC-ACC-68), and its Undo. */
  readonly add?: (requester: Requester, payload: UiAddPayload) => Promise<UiAddAnswer>
  readonly addUndo?: (requester: Requester, payload: import("../../../shared/contracts/ui-add").UiAddUndoPayload) => Promise<import("../../../shared/contracts/ui-add").UiAddUndoAnswer>
  /** The popup picker sheet's untick and membership read (UI-POP-14, YM-POP-4). */
  readonly item?: {
    remove(requester: Requester, payload: import("../../../shared/contracts/ui-add").UiRemovePayload): Promise<import("../../../shared/contracts/ui-add").UiRemoveAnswer>
    membership(requester: Requester, payload: import("../../../shared/contracts/ui-add").UiMembershipPayload): Promise<import("../../../shared/contracts/ui-add").UiMembershipAnswer>
  }
  /** The popup's This video and its Don't auto-add (UI-POP-12, UI-POP-14). */
  readonly thisVideo?: {
    thisTab(requester: Requester): Promise<import("../../../shared/contracts/this-video").ThisTab>
    skip(requester: Requester, request: import("../../../shared/contracts/this-video").ThisVideoSkip): Promise<import("../../../shared/contracts/this-video").ThisVideoSkipAnswer>
  }
  /** Gather tabs' calls (ARC-MSG-16), for the authenticated requester's window. */
  readonly gather?: GatherRoutes
  /** Every UI message wakes automatic gathering's unvisited check, which runs at most once a minute (ARC-MSG-16). */
  readonly woke?: () => void
}
export type GatherRoutes = {
  gather(requester: Requester, payload: UiGatherMessages["ui.gather"]["payload"]): Promise<UiGatherAnswer>
  undo(requester: Requester, payload: UiGatherMessages["ui.gatherUndo"]["payload"]): Promise<UiGatherAnswer>
  gathers(requester: Requester): Promise<UiGathers>
}
type ClearContext = Parameters<ReturnType<typeof createClearAllReceiver>["receiver"]["handlers"]["ui.clearAll"]>[1]
type Context =
  | { readonly kind: "clear-all"; readonly ui: ClearContext }
  | { readonly kind: "shared-settings"; readonly ui: UiContext; readonly principal: string | undefined; readonly current: () => Promise<boolean> }
  | { readonly kind: "first-run"; readonly ui: UiContext }
  | { readonly kind: "playlists"; readonly ui: UiRequester; readonly current: () => Promise<UiRequester | undefined> }
type Operation = { readonly principal: string; readonly creation: Creation; readonly acct: AccountKey; readonly site: Site; active: boolean; answer: Promise<UiCreationAnswer> | undefined }
type ListAuthority = { readonly setup: string; readonly reset: number; readonly account: number; readonly view: string }
type ListWork = { readonly generation: number; readonly answer: Promise<UiListRefresh | UiUnavailable>; settled: boolean; terminal: UiListRefresh | UiUnavailable | undefined }
type ListOperation = {
  readonly principal: string
  readonly requester: string
  readonly acct: AccountKey
  readonly site: Site
  readonly explicit: boolean
  readonly opened: Promise<UiPlaylistAnswer>
  active: boolean
  authority: ListAuthority | undefined
  work: ListWork | null
}
type PlaylistContext = Extract<Context, { kind: "playlists" }>
type RequestEntry = { readonly text: string; readonly kind: "pending"; readonly answer: Promise<unknown> } | { readonly kind: "completed" }
const unavailable = (reason: UiUnavailable["reason"]): UiUnavailable => ({ kind: "unavailable", reason })

export function createUiRouter(ports: UiRouterPorts) {
  let active = true
  const operations = new Map<CreationId, Operation>()
  const lists = new Map<ListOperationId, ListOperation>()
  const releasedLists = new Set<ListOperationId>()
  let listsClosed = false
  const retired = new Set<string>()
  const requests = new Map<string, RequestEntry>()
  let creationClosed = false
  const firstRun = createFirstRunReceiver({ sender: ports.native, owner: ports.owner, ...ports.firstRun })
  const clearAll = createClearAllReceiver({ native: ports.native, lifecycle: ports.lifecycle })
  const pages = ports.pages ? createPageReceiver(ports.pages) : undefined
  function page<K extends keyof PageMessages>(kind: K, payload: PageMessages[K]["payload"], context: Context): Promise<PageMessages[K]["result"]> | PageMessages[K]["result"] {
    if (context.kind !== "playlists") throw Error("Wrong authenticated UI context")
    if (!active) return unavailable("disposed")
    if (!pages) return unavailable("collaborator")
    const scoped: PageContext = { ui: context.ui, current: context.current }
    return pages[kind](payload, scoped)
  }
  async function gate(ui: UiRequester): Promise<UiUnavailable | undefined> {
    if (!active) return unavailable("disposed")
    if (ports.services.kind !== "ready") return unavailable("collaborator")
    const read = await ports.owner.readTabProjection({ private: ui.requester.incognito, account: { kind: "unknown" } })
    if (!active) return unavailable("disposed")
    return read.kind === "projection" && read.projection.settings.kind === "value" ? undefined : unavailable("owner")
  }
  function requireUi(context: Context): UiRequester {
    if (context.kind !== "playlists") throw Error("Wrong authenticated UI context")
    return context.ui
  }
  async function create(payload: UiCreationPayload, ui: UiRequester): Promise<UiCreationAnswer> {
    if (!active) return unavailable("disposed")
    const key = JSON.stringify([ui.principal, payload.operation])
    const existing = operations.get(payload.operation)
    if (payload.action === "release") {
      if (existing && existing.principal !== ui.principal) return unavailable("operation")
      if (existing) {
        existing.active = false
        operations.delete(payload.operation)
      }
      if (retired.size >= 4096) creationClosed = true
      else retired.add(key)
      return { kind: "released", operation: payload.operation }
    }
    if (payload.action === "status" || (payload.action === "submit" && existing?.answer)) {
      if (!existing || !existing.active || existing.principal !== ui.principal) return unavailable("operation")
      const result = existing.answer ? await existing.answer : ({ kind: "idle", operation: payload.operation } satisfies UiCreationAnswer)
      return active && existing.active ? result : unavailable("disposed")
    }
    const held = await gate(ui)
    if (held) return held
    if (ports.services.kind !== "ready") return unavailable("collaborator")
    if (retired.has(key)) return unavailable("operation")
    if (payload.action === "open") {
      if (creationClosed) return unavailable("capacity")
      if (existing)
        return existing.principal === ui.principal && existing.acct === payload.acct && existing.site === payload.site ? { kind: "opened", operation: payload.operation } : unavailable("operation")
      // Re-read after the asynchronous gate. Concurrent opens must share the same handle.
      if (operations.has(payload.operation)) return create(payload, ui)
      if (operations.size >= 1024) return unavailable("capacity")
      operations.set(payload.operation, {
        principal: ui.principal,
        acct: payload.acct,
        site: payload.site,
        active: true,
        creation: ports.services.playlists.create(payload.acct, { site: payload.site, req: ui.requester }),
        answer: undefined
      })
      return { kind: "opened", operation: payload.operation }
    }
    const operation = operations.get(payload.operation)
    if (!operation || !operation.active || operation.principal !== ui.principal) return unavailable("operation")
    if (payload.action === "submit" && !operation.answer) {
      const playlist = { title: payload.title, privacy: payload.privacy, ...(payload.videoId === undefined ? {} : { videoId: payload.videoId }) }
      const answer = Promise.resolve()
        .then(() => operation.creation.submit(playlist))
        .then(creationAnswer, () => unavailable("owner"))
      operation.answer = answer
      void answer.then(result => {
        if (operation.active && operation.answer === answer && result.kind === "invalid") operation.answer = undefined
      })
    }
    const answer = operation.answer
    if (!answer) return { kind: "idle", operation: payload.operation }
    const result = await answer
    if (!active || !operation.active) return unavailable("disposed")
    // A confirmed creation remains a fact even if its readback stopped the owner.
    return result
  }
  async function listAuthority(ui: UiRequester, acct: AccountKey): Promise<ListAuthority | UiUnavailable> {
    if (!active || ports.services.kind !== "ready") return unavailable("disposed")
    const projection = await ports.owner.readTabProjection({ private: ui.requester.incognito, account: { kind: "signed-in", acct } })
    if (projection.kind !== "projection" || projection.projection.settings.kind !== "value" || projection.projection.account.kind !== "signed-in") return unavailable("owner")
    const session = await ports.owner.readSession()
    if (session.kind !== "memory") return unavailable("owner")
    const view = await ports.services.tabs.accountInView(ui.requester)
    if (!active || view.kind === "unavailable") return unavailable("owner")
    return { setup: JSON.stringify(projection.projection.account.setup), reset: session.revision.reset, account: session.revision.accounts.get(acct) ?? 0, view: JSON.stringify(view) }
  }
  async function nativeListCurrent(operation: ListOperation, context: PlaylistContext): Promise<boolean> {
    const ui = await context.current()
    return active && operation.active && ui !== undefined && ui.principal === operation.principal && JSON.stringify(ui.requester) === operation.requester
  }
  async function listCurrent(operation: ListOperation, context: PlaylistContext): Promise<UiUnavailable | undefined> {
    if (!active || !operation.active) return unavailable("disposed")
    const ui = await context.current()
    if (!ui || ui.principal !== operation.principal || JSON.stringify(ui.requester) !== operation.requester) return unavailable("operation")
    const authority = await listAuthority(ui, operation.acct)
    if ("kind" in authority) return authority
    if (!operation.authority || JSON.stringify(authority) !== JSON.stringify(operation.authority)) return unavailable("operation")
    if (!(await nativeListCurrent(operation, context))) return unavailable("operation")
    return active && operation.active ? undefined : unavailable("disposed")
  }
  function listWork(operation: ListOperation, generation: number, answer: Promise<UiListRefresh | UiUnavailable>): ListWork {
    const work: ListWork = { generation, answer, settled: false, terminal: undefined }
    operation.work = work
    void answer.then(
      result => {
        work.terminal = result
        work.settled = true
      },
      () => {
        work.terminal = unavailable("owner")
        work.settled = true
      }
    )
    return work
  }
  function projectRefresh(answer: Extract<ListOpen, { kind: "open" }>): Promise<UiListRefresh | UiUnavailable> {
    return answer.refresh === null ? Promise.resolve(unavailable("operation")) : answer.refresh.then(listRefresh, () => unavailable("owner"))
  }
  function withheldList(operation: ListOperationId, work: ListWork, answer: UiListRefresh | UiUnavailable): UiPlaylistAnswer | undefined {
    if (answer.kind !== "listed" || (answer.cache.kind !== "unconfirmed" && answer.cache.kind !== "failed")) return undefined
    return { kind: "refreshed", operation, generation: work.generation, refresh: { kind: "withheld", confirmed: true, cache: answer.cache } }
  }
  async function playlists(payload: UiPlaylistPayload, context: PlaylistContext): Promise<UiPlaylistAnswer> {
    const ui = context.ui,
      existing = lists.get(payload.operation)
    if (!active) return unavailable("disposed")
    if (existing && (existing.principal !== ui.principal || existing.requester !== JSON.stringify(ui.requester))) return unavailable("operation")
    if (payload.action === "release") {
      if (existing) {
        existing.active = false
        existing.authority = undefined
        existing.work = null
        lists.delete(payload.operation)
      }
      if (releasedLists.size >= 4096) listsClosed = true
      else releasedLists.add(payload.operation)
      return { kind: "released", operation: payload.operation }
    }
    if (releasedLists.has(payload.operation)) return unavailable("operation")
    if (payload.action === "open") {
      if (existing) {
        if (existing.acct !== payload.acct || existing.site !== payload.site || existing.explicit !== payload.refresh) return unavailable("operation")
        const answer = await existing.opened
        return answer.kind === "open" ? ((await listCurrent(existing, context)) ?? answer) : answer
      }
      if (listsClosed || lists.size >= 1024) return unavailable("capacity")
      const opened = Promise.resolve()
        .then(async (): Promise<UiPlaylistAnswer> => {
          if (!operation.active || !active) return unavailable("disposed")
          const held = await gate(ui)
          if (held) return held
          const authority = await listAuthority(ui, operation.acct)
          if ("kind" in authority) return authority
          operation.authority = authority
          if (!operation.active || !active || ports.services.kind !== "ready") return unavailable("disposed")
          const answer = await ports.services.playlists.list(operation.acct, { site: operation.site, req: ui.requester, refresh: payload.refresh })
          if (answer.kind === "unavailable") return { kind: "unavailable", read: cacheStatus(answer.read) }
          const refresh = answer.refresh === null ? null : projectRefresh(answer)
          if (!active || !operation.active) return unavailable("disposed")
          if (refresh !== null) listWork(operation, 0, refresh)
          // The service has just authorized this cached snapshot. A refresh readback may stop the owner independently.
          if (!(await nativeListCurrent(operation, context))) return unavailable("operation")
          return {
            kind: "open",
            operation: payload.operation,
            cached: listing(answer.cached),
            freshness: answer.freshness,
            refresh: answer.refresh === null ? null : { kind: "pending", generation: 0 }
          } satisfies UiPlaylistOpen
        })
        .catch(() => unavailable("owner"))
      const operation: ListOperation = {
        principal: ui.principal,
        requester: JSON.stringify(ui.requester),
        acct: payload.acct,
        site: payload.site,
        explicit: payload.refresh,
        active: true,
        opened,
        authority: undefined,
        work: null
      }
      lists.set(payload.operation, operation)
      return opened
    }
    if (!existing || !existing.active) return unavailable("operation")
    const opened = await existing.opened
    if (opened.kind !== "open") return opened
    const held = await listCurrent(existing, context)
    if (held) {
      const work = existing.work
      if (held.reason === "owner" && work?.generation === payload.generation && work.terminal) {
        const withheld = withheldList(payload.operation, work, work.terminal)
        if (withheld && (await nativeListCurrent(existing, context))) return withheld
      }
      return held
    }
    let work = existing.work
    if (payload.action === "refresh" && work?.generation !== payload.generation) {
      if (payload.generation !== (work?.generation ?? 0) + 1 || (work && !work.settled)) return unavailable("operation")
      const answer = Promise.resolve()
        .then(async (): Promise<UiListRefresh | UiUnavailable> => {
          const current = await listCurrent(existing, context)
          if (current) return current
          if (ports.services.kind !== "ready") return unavailable("collaborator")
          const result = await ports.services.playlists.list(existing.acct, { site: existing.site, req: ui.requester, refresh: true })
          return result.kind === "open" ? projectRefresh(result) : unavailable("owner")
        })
        .catch(() => unavailable("owner"))
      work = listWork(existing, payload.generation, answer)
    }
    if (!work || work.generation !== payload.generation) return unavailable("operation")
    const answer = await work.answer
    const current = await listCurrent(existing, context)
    if (current) {
      // A stopped owner cannot authorize refreshed rows. The confirmed-read and persistence facts remain separate.
      if (current.reason === "owner") {
        const withheld = withheldList(payload.operation, work, answer)
        if (withheld && (await nativeListCurrent(existing, context))) return withheld
      }
      return current
    }
    if (answer.kind === "unavailable") return answer
    return { kind: "refreshed", operation: payload.operation, generation: work.generation, refresh: answer }
  }
  const receiver: RpcReceiver<UiMessages, NativeSender, Context> = {
    async authenticate({ sender, request }) {
      if (!active) return { kind: "rejected" }
      if (request.kind === "ui.clearAll") {
        const result = await clearAll.receiver.authenticate({ sender, request })
        return active && result.kind === "accepted" ? { kind: "accepted", context: { kind: "clear-all", ui: result.context } } : { kind: "rejected" }
      }
      if (request.kind === "ui.change" && (isFeatureSettingChange(request.payload.change) || isSharedSettingChange(request.payload.change) || isKeySettingChange(request.payload.change))) {
        const resolved = await resolveSenderOrigin(ports.native, { sender, popupWindowId: request.payload.windowId })
        if (!active || resolved.kind !== "ui" || resolved.page === "onboarding" || (resolved.page !== "popup" && request.payload.windowId !== undefined)) return { kind: "rejected" }
        const principal = typeof sender.documentId === "string" && sender.documentId.length > 0 ? JSON.stringify([sender.id, sender.documentId, resolved.page, resolved.origin]) : undefined
        return {
          kind: "accepted",
          context: {
            kind: "shared-settings",
            ui: resolved,
            principal,
            current: async () => {
              const current = await resolveSenderOrigin(ports.native, { sender, popupWindowId: request.payload.windowId })
              return active && current.kind === "ui" && current.page === resolved.page && JSON.stringify(current.origin) === JSON.stringify(resolved.origin)
            }
          }
        }
      }
      if (request.kind === "ui.change" || request.kind === "ui.syncedChoices") {
        const result = await firstRun.receiver.authenticate({ sender, request })
        return active && result.kind === "accepted" ? { kind: "accepted", context: { kind: "first-run", ui: result.context } } : { kind: "rejected" }
      }
      const result = await authenticateUiRequester(ports.native, { sender, windowId: request.payload.windowId })
      return active && result.kind === "accepted"
        ? {
            kind: "accepted",
            context: {
              kind: "playlists",
              ui: result.context,
              current: async () => {
                const checked = await authenticateUiRequester(ports.native, { sender, windowId: request.payload.windowId })
                return active && checked.kind === "accepted" ? checked.context : undefined
              }
            }
          }
        : { kind: "rejected" }
    },
    handlers: {
      "ui.clearAll"(payload, context) {
        if (context.kind !== "clear-all") throw Error("Wrong authenticated clear context")
        return clearAll.receiver.handlers["ui.clearAll"](payload, context.ui)
      },
      async "ui.change"(payload, context): Promise<ChangeAnswer> {
        const change = payload.change
        if (context.kind === "shared-settings") {
          const ready = active && ports.sharedSettings && (await context.current())
          if (isFeatureSettingChange(change)) {
            const outcome = ready && ports.sharedSettings ? await changeFeatureSetting(ports.sharedSettings, context.ui, change) : ({ kind: "refused", reason: "unavailable" } as const)
            return { kind: "feature-setting", outcome: (await context.current()) ? outcome : { kind: "refused", reason: "unavailable" } }
          }
          if (isSharedSettingChange(change)) {
            const outcome = ready && ports.sharedSettings ? await changeSharedSetting(ports.sharedSettings, context.ui, change) : ({ kind: "refused", reason: "unavailable" } as const)
            return { kind: "shared-setting", outcome: (await context.current()) ? outcome : { kind: "refused", reason: "unavailable" } }
          }
          if (isKeySettingChange(change)) {
            const outcome =
              ready && ports.sharedSettings ? await ports.sharedSettings.changeKeySetting(context.ui.origin, change, context.principal) : ({ kind: "refused", reason: "unavailable" } as const)
            return { kind: "key-setting", outcome: (await context.current()) ? outcome : { kind: "refused", reason: "unavailable" } }
          }
          throw Error("Invalid shared change")
        }
        if (context.kind !== "first-run" || !isChangePayload(payload)) throw Error("Invalid first-run change")
        return firstRun.receiver.handlers["ui.change"](payload, context.ui)
      },
      "ui.syncedChoices"(payload, context) {
        if (context.kind !== "first-run" || !isLookupPayload(payload)) throw Error("Invalid first-run lookup")
        return firstRun.receiver.handlers["ui.syncedChoices"](payload, context.ui)
      },
      async "ui.accountInView"(_payload, context) {
        const ui = requireUi(context),
          held = await gate(ui)
        if (held) return held
        if (ports.services.kind !== "ready") return unavailable("collaborator")
        const answer = await ports.services.tabs.accountInView(ui.requester)
        return (await gate(ui)) ?? structuredClone(answer)
      },
      "ui.playlists"(payload, context) {
        if (context.kind !== "playlists") throw Error("Wrong authenticated UI context")
        return playlists(payload, context)
      },
      "ui.create"(payload, context) {
        return create(payload, requireUi(context))
      },
      "ui.status": (payload, context) => page("ui.status", payload, context),
      "ui.pause": (payload, context) => page("ui.pause", payload, context),
      "ui.recentAdds": (payload, context) => page("ui.recentAdds", payload, context),
      "ui.device": (payload, context) => page("ui.device", payload, context),
      "ui.filter": (payload, context) => page("ui.filter", payload, context),
      "ui.filterChannel": (payload, context) => page("ui.filterChannel", payload, context),
      "ui.removeKeptFilters": (payload, context) => page("ui.removeKeptFilters", payload, context),
      "ui.diagnostics": (payload, context) => page("ui.diagnostics", payload, context),
      "ui.withdraw": (payload, context) => page("ui.withdraw", payload, context),
      "ui.removeSetup": (payload, context) => page("ui.removeSetup", payload, context),
      "ui.exportSettings": (payload, context) => page("ui.exportSettings", payload, context),
      "ui.importSettings": (payload, context) => page("ui.importSettings", payload, context),
      "ui.noteSeen": (payload, context) => page("ui.noteSeen", payload, context),
      "ui.noteAgree": (payload, context) => page("ui.noteAgree", payload, context),
      "ui.claimSeen": (payload, context) => page("ui.claimSeen", payload, context),
      "ui.discardUnclaimed": (payload, context) => page("ui.discardUnclaimed", payload, context),
      "ui.pausedWork": (payload, context) => page("ui.pausedWork", payload, context),
      "ui.sync": (payload, context) => page("ui.sync", payload, context),
      async "ui.playingNow"(_payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.playingNow) return { kind: "unavailable" }
        const answer = await ports.playingNow(ui.requester)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.remove"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.item) return { kind: "unavailable" }
        const answer = await ports.item.remove(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.membership"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.item) return { kind: "unavailable" }
        const answer = await ports.item.membership(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.addUndo"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.addUndo) return { kind: "unavailable" }
        const answer = await ports.addUndo(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.thisTab"(_payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.thisVideo) return { kind: "unavailable" }
        const answer = await ports.thisVideo.thisTab(ui.requester)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.skip"({ windowId: _window, ...request }, context) {
        const ui = requireUi(context)
        if (!active || !ports.thisVideo) return { kind: "refused", reason: "unavailable" }
        const answer = await ports.thisVideo.skip(ui.requester, request)
        return active ? answer : { kind: "refused", reason: "unavailable" }
      },
      async "ui.add"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.add) return { kind: "unavailable" }
        const answer = await ports.add(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.gather"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.gather) return { kind: "unavailable" }
        const answer = await ports.gather.gather(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.gatherUndo"(payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.gather) return { kind: "unavailable" }
        const answer = await ports.gather.undo(ui.requester, payload)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.gathers"(_payload, context) {
        const ui = requireUi(context)
        if (!active || !ports.gather) return { kind: "unavailable" }
        const answer = await ports.gather.gathers(ui.requester)
        return active ? answer : { kind: "unavailable" }
      },
      async "ui.resolveChannel"(payload, context) {
        const ui = requireUi(context),
          held = await gate(ui)
        if (held) return held
        if (ports.services.kind !== "ready") return unavailable("collaborator")
        const result = await ports.services.playlists.resolveChannel(payload.input, ui.requester)
        return !active ? unavailable("disposed") : jobOutcome(result)
      }
    }
  }
  const transport: Transport<NativeSender> = {
    send: ports.transport.send,
    listen(receive) {
      return ports.transport.listen(delivery => {
        const message = delivery.message,
          sender = delivery.sender
        if (
          !active ||
          inspectMessageHeader(message, ports.rpc.build).kind !== "ok" ||
          !objectShape(message, {
            v: v => v === CONTRACT_VERSION,
            build: v => v === ports.rpc.build,
            id: v => typeof v === "string" && v.length > 0,
            kind: v => typeof v === "string" && Object.hasOwn(uiContract, v),
            payload: () => true
          })
        )
          return undefined
        try {
          ports.woke?.()
        } catch {}
        const key = JSON.stringify([sender.id, sender.url, sender.documentId ?? null, sender.tab?.id ?? null, message.id])
        const text = JSON.stringify(message),
          previous = requests.get(key)
        if (previous) return previous.kind === "pending" && previous.text === text ? previous.answer : Promise.resolve(undefined)
        if (requests.size >= 4096) return Promise.resolve(undefined)
        const answer = receive(delivery)
        if (answer !== undefined) {
          const entry: RequestEntry = { text, kind: "pending", answer }
          requests.set(key, entry)
          const complete = () => {
            if (active && requests.get(key) === entry) requests.set(key, { kind: "completed" })
          }
          void answer.then(complete, complete)
        }
        return answer
      })
    }
  }
  const rpc = createRpc(transport, { ...ports.rpc, contract: uiContract })
  const unhandle = rpc.handle(receiver)
  return {
    dispose() {
      if (!active) return
      active = false
      for (const operation of operations.values()) operation.active = false
      operations.clear()
      retired.clear()
      requests.clear()
      for (const operation of lists.values()) {
        operation.active = false
        operation.authority = undefined
        operation.work = null
      }
      lists.clear()
      releasedLists.clear()
      clearAll.dispose()
      firstRun.dispose()
      unhandle()
      rpc.dispose()
    }
  }
}
