import { isLibraryEndpoint, isLikeEndpoint, isNavigationEndpoint, isQueueInsertEndpoint, isQueueItemId, isRemoveFromQueueEndpoint, isAddToPlaylistEndpoint } from "../../../shared/contracts"
import type { ItemInfo, Job, JobInvocation, JobResult, NowPlaying, QueueItemId } from "../../../shared/contracts"
import type { TabAddReport, TabAddRequest, UndoHandle } from "../../../shared/contracts/tab-actions"
import type { TabView } from "../../../shared/contracts/tab-view"
import { isPlaylistId, isVideoId, type PlaylistId, type VideoId } from "../../../shared/model"
import type { TabActions, Unanswered } from "../../core/actions"
import type { MusicResolution } from "../../core/items-music"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../feedback/session"
import type { OpenPicker, Popovers } from "../../popovers/types"
import { createMusicQuick } from "./quick"
import { clock, labels, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error(`Invalid specimen ${JSON.stringify(value)}`)
  return value
}
export const song = checked(isVideoId, "getLucky001")
export const lady = checked(isVideoId, "lady0000001")
export const favourites = checked(isPlaylistId, "PL_alpha")
const queued = checked(isQueueItemId, 7)
const playingId = checked(isQueueItemId, 3)

const endpoints = (video: VideoId) => ({
  next: checked(isQueueInsertEndpoint, { queueAddEndpoint: { queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO", queueTarget: { videoId: video } } }),
  end: checked(isQueueInsertEndpoint, { queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { videoId: video } } }),
  save: checked(isAddToPlaylistEndpoint, { addToPlaylistEndpoint: { videoId: video } }),
  like: checked(isLikeEndpoint, { likeEndpoint: { status: "LIKE", target: { videoId: video } } }),
  library: { inLibrary: false, endpoint: checked(isLibraryEndpoint, { feedbackEndpoint: { feedbackToken: "add" } }) },
  mix: checked(isNavigationEndpoint, { watchEndpoint: { videoId: video, playlistId: `RDAMVM${video}` } }),
  album: checked(isNavigationEndpoint, { browseEndpoint: { browseId: "MPREb_album", browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" } } } }),
  artist: checked(isNavigationEndpoint, { browseEndpoint: { browseId: "UCartist", browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" } } } })
})
const remove = checked(isRemoveFromQueueEndpoint, { removeFromQueueEndpoint: { videoId: lady } })

/** "Get Lucky" as a song row. */
export const songRow: ItemInfo = {
  kind: "song", type: { kind: "unclassified" }, title: "Get Lucky", videoId: song,
  selected: false, autoplay: false, hasOwnLike: true, likeState: "not-liked", endpoints: endpoints(song)
}
/** "Random Access Memories", an album card. */
export const album: ItemInfo = {
  kind: "album", type: { kind: "unclassified" }, title: "Random Access Memories", selected: false, autoplay: false, hasOwnLike: false, likeState: null,
  endpoints: { next: checked(isQueueInsertEndpoint, { queueAddEndpoint: { queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO", queueTarget: { playlistId: "OLAK5uy_album" } } }),
    end: checked(isQueueInsertEndpoint, { queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { playlistId: "OLAK5uy_album" } } }) }
}
/** "Lady", queued and waiting. */
export const ladyQueued: ItemInfo = {
  kind: "song", type: { kind: "unclassified" }, title: "Lady", videoId: lady, queueItemId: queued,
  selected: false, autoplay: false, hasOwnLike: false, likeState: "not-liked", endpoints: { ...endpoints(lady), remove }
}
/** "Get Lucky" as the playing song's queue item. */
export const playingItem: ItemInfo = { ...songRow, queueItemId: playingId, selected: true, hasOwnLike: false, endpoints: { ...endpoints(song), remove } }
export const nowPlaying: NowPlaying = { videoId: song, title: "Get Lucky", artist: "Daft Punk", pos: 12, len: 248 }

const nothing = { tab: [], session: [] }
const handle: UndoHandle = { kind: "add", id: "engine:1" }
export const savedReport: TabAddReport = { kind: "report", outcomes: { [favourites]: { kind: "added" } }, feedback: true, undo: handle, titles: { [favourites]: "Favourites" },
  toast: { tone: "confirmation", auto: false, message: { kind: "saved", playlists: [favourites] }, action: { kind: "undo" }, remember: nothing } }

type Answer = (job: Job, target: Element | undefined) => unknown
/** A YouTube Music tab: the jobs the engine sends and how the page answers, the add flow, the toaster and the picker. */
export function musicWorld(options: { view?: TabView; resolution?: MusicResolution; answers?: Partial<Record<Job["kind"], Answer>>;
  add?: () => Promise<TabAddReport | Unanswered>; popovers?: Popovers | null } = {}) {
  const timers = clock()
  const onError = () => {}
  const root = new Scope({ document, onError })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "music", i18n, labels, initial: { undoKey, features: [] },
    now: timers.now, onError, onCosmetic: () => {} })
  const jobs: { readonly job: Job; readonly acct?: string; readonly target?: Element }[] = []
  const adds: TabAddRequest[] = [], undos: UndoHandle[] = [], opened: OpenPicker[] = [], visited: string[] = [], logs: string[] = []
  let casting = false
  let queue = 100
  const defaults: Partial<Record<Job["kind"], Answer>> = {
    castState: () => ({ casting }),
    nowPlaying: () => nowPlaying,
    queueInsert: () => ({ ids: [queue++] }),
    queueRemoveIds: job => ({ removed: job.kind === "queueRemoveIds" ? job.ids.length : 0 }),
    queueMove: () => ({ from: 5, moved: true }),
    queueRemove: () => ({ index: 4 }),
    queueReinsert: () => ({ id: 42 }),
    like: () => null,
    library: () => ({ inLibrary: true }),
    navigate: () => ({ navigated: true }),
    itemInfo: () => playingItem
  }
  const page = {
    async run<J extends Job>(invocation: JobInvocation<J>, context?: { target?: Element }): Promise<JobResult<J>> {
      jobs.push({ job: invocation.job, ...(invocation.acct ? { acct: invocation.acct } : {}), ...(context?.target ? { target: context.target } : {}) })
      const answer = options.answers?.[invocation.job.kind] ?? defaults[invocation.job.kind]
      const data = answer ? answer(invocation.job, context?.target) : undefined
      if (data !== null && typeof data === "object" && "ok" in data && data.ok === false) return data as JobResult<J>
      return { ok: true, data, route: "test" } as JobResult<J>
    }
  }
  const actions = {
    add: async (request: TabAddRequest) => { adds.push(request); return options.add ? options.add() : savedReport },
    undo: async (undone: UndoHandle) => { undos.push(undone); return { kind: "undone" } },
    playlists: async () => ({ kind: "cached", listing: { rows: [{ id: favourites, title: "Favourites" }], at: 0 } }),
    need: async () => true
  } as unknown as TabActions
  const popovers: Popovers = { openPicker(request) { opened.push(request) }, openWatchMenu() {}, isOpen: () => false, close() {} }
  let view: TabView = options.view ?? wireView("music")
  const queueElement = document.createElement("ytmusic-player-queue-item")
  queueElement.setAttribute("selected", "")
  document.body.append(queueElement)
  const quick = createMusicQuick({
    owner: root, document, page, actions, i18n,
    items: { resolve: async () => options.resolution ?? { kind: "current-song", song: nowPlaying, queueDisposition: "insert-copy" } },
    view: () => view, feedback: () => feedback.use(root),
    popovers: async () => options.popovers === undefined ? popovers : options.popovers,
    location: { href: "https://music.youtube.com/watch?v=getLucky001", assign: (url: string) => { visited.push(url) }, reload: () => { visited.push("reload") } },
    log: line => { logs.push(line) }
  })
  return {
    quick, jobs, adds, undos, opened, visited, logs, timers, root, keys, feedback, queueElement,
    sent: (kind: Job["kind"]): unknown[] => jobs.filter(entry => entry.job.kind === kind).map(entry => entry.job),
    toast: () => feedback.read()?.feedback.toaster.read() ?? null,
    cast(on: boolean) { casting = on },
    publish(next: TabView) { view = next },
    dispose() { root.dispose(); keys.dispose(); timers.restore(); document.body.replaceChildren() }
  }
}
export type MusicWorld = ReturnType<typeof musicWorld>
export const queueItemId = (value: number): QueueItemId => checked(isQueueItemId, value)
export const playlistOf = (value: string): PlaylistId => checked(isPlaylistId, value)
