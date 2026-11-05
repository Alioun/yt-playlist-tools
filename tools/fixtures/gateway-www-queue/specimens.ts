import { createGateway } from "../../../src/page/gateway"
import { wwwGateway } from "../../../src/page/gateway/www"
import { scriptedPage, syntheticIdentity } from "../../../src/page/gateway.specimens"
import type { WwwQueuePort } from "../../../src/page/gateway/www-queue"
import type { AttemptContext, Dispatch, GatewayRequestPort, HttpAnswer } from "../../../src/page/gateway/port"
import { isQueueListId, isRouteId, isSetVideoId } from "../../../src/shared/contracts"
import type { BreakageSignal, JobOf } from "../../../src/shared/contracts"
import type { PageJobData, PageJobResult } from "../../../src/shared/contracts/page"
import { isVideoId } from "../../../src/shared/model/validation"
import { Clock, check, checked, deferred, drain, same } from "../gateway-playlists/specimens"

export { Clock, check, checked, deferred, drain, same, syntheticIdentity }
export const videoA = checked(isVideoId, "queueVideoA"),
  videoB = checked(isVideoId, "queueVideoB")
export const listA = checked(isQueueListId, "TLPQsyntheticA"),
  listB = checked(isQueueListId, "TLPQsyntheticB")
export const entry = (setVideoId: string) => checked(isSetVideoId, setVideoId)
export const undoOf = (setVideoId: string) => ({ listId: listA, setVideoId: entry(setVideoId) })
const routeIds = {
  queueAdd: "command.queueAdd",
  queueUndo: "command.queueUndo",
  queueAddList: "command.queueAddList",
  openCardMenu: "page-ui.openCardMenu"
} as const
export function success<K extends keyof typeof routeIds>(kind: K, data: PageJobData<JobOf<K>>): PageJobResult<JobOf<K>> {
  return { ok: true, data, route: checked(isRouteId, routeIds[kind]) }
}
export type Entry = { videoId: string; setVideoId: string }
export type Call = { endpoint: Record<string, unknown>; context: AttemptContext }
export type QueueState = {
  listId: string | undefined
  entries: Entry[]
  readable: boolean
  miniplayer: boolean | undefined
  resolver: boolean
  connected: boolean
  menu: unknown
  serial: number
  cancels: number
  faults: Set<"panel" | "action" | "menu" | "resolve">
}
export interface ScriptWorld {
  readonly state: QueueState
  add(videoId: string, listId?: string): string
  remove(setVideoId: string): void
  replace(listId: string, entries: Entry[]): void
  emit(detail: unknown): void
}
export type Script = (call: Call, world: ScriptWorld) => Dispatch

export function cardCommand(videoId = videoA) {
  return {
    commandMetadata: { webCommandMetadata: { sendPost: true } },
    signalServiceEndpoint: {
      signal: "CLIENT_SIGNAL",
      actions: [
        {
          addToPlaylistCommand: {
            openMiniplayer: true,
            videoId,
            listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
            onCreateListCommand: { createPlaylistServiceEndpoint: { videoIds: [videoId], params: "CAQ%3D" } },
            videoIds: [videoId]
          }
        }
      ]
    }
  }
}
export function card(videoId = videoA) {
  return {
    videoId,
    title: { simpleText: "Queue card" },
    menu: {
      menuRenderer: {
        items: [
          { menuServiceItemRenderer: { text: { simpleText: "Save" }, serviceEndpoint: { addToPlaylistServiceEndpoint: { videoId } } } },
          { menuServiceItemRenderer: { text: { simpleText: "Add to queue" }, serviceEndpoint: cardCommand(videoId) } }
        ]
      }
    }
  }
}
export function panelData(listId: string, entries: Entry[]) {
  return { playlistId: listId, contents: entries.map(entry => ({ playlistPanelVideoRenderer: { videoId: entry.videoId, playlistSetVideoId: entry.setVideoId } })) }
}
export function answer(body: unknown, http = 200): HttpAnswer {
  return { http, body }
}
export function added(setVideoId: string, extra: Record<string, unknown> = {}) {
  return { status: "STATUS_SUCCEEDED", playlistEditResults: [{ playlistEditVideoAddedResultData: { setVideoId } }], actions: [{ refreshPlaylistCommand: {} }], ...extra }
}
export const noisyToast = { addToToastAction: { item: { notificationActionRenderer: {} } } }
export const toastAction = { actionName: "yt-open-popup-action", args: [{ openPopupAction: { popupType: "TOAST" } }] }
export const menuAction = { actionName: "yt-open-popup-action", args: [{ openPopupAction: { popupType: "DROPDOWN" } }] }

export type QueueWorld = ReturnType<typeof queueWorld>
export function queueWorld(options: { signedIn?: boolean | "missing"; card?: unknown } = {}) {
  const page = scriptedPage({ targetData: options.card ?? card() })
  if (options.signedIn === false) {
    page.config.LOGGED_IN = false
    page.config.DATASYNC_ID = "Vvisitor||"
  }
  if (options.signedIn === "missing") {
    delete page.config.LOGGED_IN
    delete page.config.DATASYNC_ID
  }
  const clock = new Clock(),
    calls: Call[] = [],
    scripts: Script[] = [],
    signals: BreakageSignal[] = []
  const actions = new Set<(detail: unknown) => void>()
  const menuTargets: Element[] = []
  const state: QueueState = {
    listId: undefined,
    entries: [],
    readable: true,
    miniplayer: false,
    resolver: true,
    connected: true,
    menu: "clicked",
    serial: 0,
    cancels: 0,
    faults: new Set()
  }
  const world = {
    page,
    clock,
    calls,
    scripts,
    signals,
    state,
    menuTargets,
    add(videoId: string, listId = state.listId ?? listA): string {
      if (state.listId !== listId) {
        state.listId = listId
        state.entries = []
      }
      const setVideoId = `entry-${++state.serial}`
      state.entries.push({ videoId, setVideoId })
      return setVideoId
    },
    remove(setVideoId: string) {
      state.entries = state.entries.filter(entry => entry.setVideoId !== setVideoId)
    },
    replace(listId: string, entries: Entry[]) {
      state.listId = listId
      state.entries = entries
    },
    emit(detail: unknown) {
      for (const seen of [...actions]) seen(detail)
    },
    get listeners() {
      return actions.size
    },
    get timers() {
      return clock.count
    }
  }
  const port: WwwQueuePort = {
    has: () => state.resolver,
    resolve(endpoint, context) {
      if (state.faults.has("resolve")) throw new Error(syntheticIdentity)
      if (!state.resolver) return { kind: "not-sent", cause: "missing" }
      const call = { endpoint, context }
      calls.push(call)
      const script = scripts.shift()
      check(script, "Missing deterministic queue script")
      const dispatch = script(call, world)
      return dispatch.kind === "pending"
        ? {
            ...dispatch,
            cancel() {
              state.cancels++
              dispatch.cancel()
            }
          }
        : dispatch
    },
    panel() {
      if (state.faults.has("panel")) throw new Error(syntheticIdentity)
      if (!state.readable) return undefined
      return [state.listId ? panelData(state.listId, state.entries) : { contents: [] }, undefined, undefined]
    },
    miniplayer: () => state.miniplayer,
    connected: () => state.connected,
    onAction(seen) {
      if (state.faults.has("action")) throw new Error(syntheticIdentity)
      const own = (detail: unknown) => seen(detail)
      actions.add(own)
      return () => {
        actions.delete(own)
      }
    },
    openMenu(target) {
      if (state.faults.has("menu")) throw new Error(syntheticIdentity)
      menuTargets.push(target)
      return state.menu
    }
  }
  const unused: GatewayRequestPort = {
    has: () => true,
    send() {
      throw new Error("Queue jobs must not use the request port")
    }
  }
  const gateway = createGateway({ site: wwwGateway, page: page.port, requests: unused, queue: port, clock, signals: signal => signals.push(signal) })
  return Object.assign(world, { port, gateway })
}
export function pending(apply: (world: ScriptWorld, call: Call) => HttpAnswer | undefined | void, late?: ReturnType<typeof deferred<HttpAnswer>>): Script {
  return (call, world) => {
    const value = apply(world, call)
    if (late) return { kind: "pending", answer: late.promise, cancel() {} }
    return { kind: "pending", answer: value ? Promise.resolve(value) : new Promise<HttpAnswer>(() => {}), cancel() {} }
  }
}
export async function settle(world: QueueWorld, ms: number, step = 50): Promise<void> {
  await drain()
  for (let spent = 0; spent < ms; spent += step) {
    world.clock.advance(step)
    await drain()
  }
}
export function scrubbed(value: unknown): boolean {
  return !JSON.stringify(value).includes(syntheticIdentity)
}
