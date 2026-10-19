// THROWAWAY PROTOTYPE (ticket 27, rough dev build). pp-music-page: the page-world half, a much-reduced stand-in for
// ticket 17's gateway. It reads YouTube Music's own `data` on the targeted element (itemInfo) and runs the queue
// jobs the way tickets 21 and 28 found: the menu handler's get_queue + ADD_ITEMS, queue.removeItem, and the queue
// panel's own reorder drop. No toasts of YouTube Music's are triggered: we never run response commands.
import { REQ, RES, type ItemInfo, type ItemKind } from "./protocol";

/* eslint-disable @typescript-eslint/no-explicit-any */
const app = () => document.querySelector("ytmusic-app") as any;
const R = (e: any) => e?.playlistPanelVideoRenderer ?? e?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer ?? e;
const idOf = (e: any) => String(R(e)?.navigationEndpoint?.watchEndpoint?.index);
const text = (t: any): string => t?.runs?.map((r: any) => r.text).join("") ?? t?.simpleText ?? "";
const epKey = (ep: any) => Object.keys(ep ?? {}).find((k) => k !== "clickTrackingParams" && k !== "commandMetadata");
const ITEM_SEL = "ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer, ytmusic-player-queue-item, ytmusic-responsive-header-renderer";

function readMenu(items: any[], info: ItemInfo) {
  for (const it of items ?? []) {
    const r: any = Object.values(it)[0];
    const ep = r?.serviceEndpoint ?? r?.navigationEndpoint ?? r?.defaultServiceEndpoint;
    const k = epKey(ep);
    info.menu.push(k ?? Object.keys(it)[0]);
    if (k === "queueAddEndpoint") {
      const q = ep.queueAddEndpoint;
      if (q.queueInsertPosition === "INSERT_AFTER_CURRENT_VIDEO") info.offered.playNext = true;
      if (q.queueInsertPosition === "INSERT_AT_END") info.offered.addToQueue = true;
      info.target ??= { videoId: q.queueTarget?.videoId, playlistId: q.queueTarget?.playlistId };
    }
    if (k === "removeFromQueueEndpoint") info.offered.remove = true;
    if (k === "addToPlaylistEndpoint") info.offered.save = true;
    if (k === "likeEndpoint") info.offered.like = true;
  }
}

function kindOfType(t?: string): ItemKind {
  if (t === "MUSIC_VIDEO_TYPE_ATV") return "song";
  if (t === "MUSIC_VIDEO_TYPE_PODCAST_EPISODE") return "episode";
  if (t) return "video";
  return "song";
}
function kindOfPage(p?: string): ItemKind {
  if (p === "MUSIC_PAGE_TYPE_ALBUM") return "album";
  if (p === "MUSIC_PAGE_TYPE_PLAYLIST") return "playlist";
  if (p === "MUSIC_PAGE_TYPE_ARTIST" || p === "MUSIC_PAGE_TYPE_USER_CHANNEL") return "artist";
  return "unknown";
}

function itemInfo(target: Element): ItemInfo {
  const el = target.closest(ITEM_SEL) as any;
  if (!el?.data) throw new Error("no data");
  const d = el.data;
  const info: ItemInfo = { kind: "unknown", title: "", offered: {}, hasOwnLike: false, liked: false, menu: [] };
  const tag = el.tagName.toLowerCase();
  if (tag === "ytmusic-responsive-list-item-renderer") {
    const run = d.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
    info.title = text(d.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
    const we = run?.navigationEndpoint?.watchEndpoint ?? d.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;
    if (d.playlistItemData?.videoId || we) info.kind = kindOfType(we?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType);
    else info.kind = kindOfPage(d.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType);
    readMenu(d.menu?.menuRenderer?.items, info);
    const like = d.menu?.menuRenderer?.topLevelButtons?.find((b: any) => b.likeButtonRenderer)?.likeButtonRenderer;
    info.hasOwnLike = !!like;
    info.liked = like?.likeStatus === "LIKE";
  } else if (tag === "ytmusic-two-row-item-renderer") {
    info.title = text(d.title);
    const ne = d.navigationEndpoint;
    info.kind = ne?.watchEndpoint ? kindOfType(ne.watchEndpoint.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType) : kindOfPage(ne?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType);
    readMenu(d.menu?.menuRenderer?.items, info);
  } else if (tag === "ytmusic-player-queue-item") {
    const r = R(d);
    info.title = text(r.title);
    info.kind = "song";
    readMenu(r.menu?.menuRenderer?.items, info);
    info.queue = { itemId: String(r.navigationEndpoint?.watchEndpoint?.index), playing: !!r.selected, autoplay: !!el.closest("#automix-contents") };
    info.target = { videoId: r.videoId };
  } else if (tag === "ytmusic-responsive-header-renderer") {
    info.title = text(d.title);
    const sub = text(d.subtitle);
    info.kind = /playlist/i.test(sub) ? "playlist" : "album";
    for (const b of d.buttons ?? []) if (b.menuRenderer) readMenu(b.menuRenderer.items, info);
    const m = text(d.secondSubtitle).match(/(\d[\d,.]*)\s+(songs?|tracks?|episodes?)/i);
    if (m) info.count = parseInt(m[1].replace(/[,.]/g, ""), 10);
  }
  return info;
}

async function queueInsert(target: { videoId?: string; playlistId?: string }, position: string) {
  const a = app();
  const queue = a.queue;
  const store = queue.store;
  const before = queue.getItems().length;
  if (before === 0) {
    a.handleNavigationEndpoint({ watchEndpoint: target.videoId ? { videoId: target.videoId } : { playlistId: target.playlistId } });
    return { started: true, count: 0, ids: [] as string[] };
  }
  const state = store.getState().queue;
  const body: any = { queueContextParams: state.queueContextParams, queueInsertPosition: position };
  if (target.playlistId && !target.videoId) body.playlistId = target.playlistId;
  else body.videoIds = [target.videoId];
  const response = await a.networkManager.fetch("/music/get_queue", body);
  if (response?.queueContextParams) store.dispatch({ type: "SET_QUEUE_CONTEXT_PARAMS", payload: response.queueContextParams });
  const items = (response?.queueDatas ?? []).map((d: any) => d.content);
  if (!items.length) throw new Error("empty answer");
  const index = position === "INSERT_AFTER_CURRENT_VIDEO" ? queue.getCurrentItemIndex() + 1 : queue.getItems().length;
  store.dispatch({ type: "ADD_ITEMS", payload: { nextQueueItemId: store.getState().queue.nextQueueItemId, index, items, shouldAssignIds: true } });
  const after = queue.getItems();
  if (after.length !== before + items.length) throw new Error("no-effect: the queue didn't grow");
  return { started: false, count: items.length, ids: after.slice(index, index + items.length).map(idOf), index };
}

function queueRemoveIds(ids: string[]) {
  const q = app().queue;
  const cur = idOf(q.getItems()[q.getCurrentItemIndex()]);
  let n = 0;
  for (const id of ids) {
    if (id === cur) continue; // an entry that already started playing stays (ticket 26)
    if (q.getItems().some((e: any) => idOf(e) === id)) {
      q.removeItem(id);
      n++;
    }
  }
  return { removed: n };
}

function queueRemove(itemId: string) {
  const q = app().queue;
  const items = q.getItems();
  const index = items.findIndex((e: any) => idOf(e) === itemId);
  if (index < 0) throw new Error("not in the queue");
  const videoId = R(items[index]).videoId;
  q.removeItem(itemId);
  if (q.getItems().some((e: any) => idOf(e) === itemId)) throw new Error("no-effect: still there");
  return { index, videoId };
}

function queueMove(itemId: string, to: "next" | "end" | number) {
  const a = app();
  const panel = document.querySelector("ytmusic-player-queue#queue") as any;
  const store = a.queue.store;
  const items = panel?.data;
  if (!panel || items !== store.getState().queue.items) throw new Error("the queue panel's data is stale");
  const from = items.findIndex((e: any) => idOf(e) === itemId);
  const cur = a.queue.getCurrentItemIndex();
  if (from < 0) throw new Error("not in the queue");
  if (from === cur) return { result: "playing", from, to: from };
  const toIdx = to === "next" ? (from > cur ? cur + 1 : cur) : to === "end" ? items.length - 1 : Math.min(to, items.length - 1);
  if (toIdx === from) return { result: "already", from, to: from };
  const parent = document.createElement("div");
  for (let i = 0; i <= toIdx; i++) parent.append(document.createElement("div"));
  const dragEl: any = parent.children[toIdx];
  dragEl.data = items[from].playlistPanelVideoRenderer ?? items[from].playlistPanelVideoWrapperRenderer;
  panel.dispatchEvent(new CustomEvent("ytmusic-reorderable-list-drop", { detail: { dragEl }, bubbles: true, composed: true }));
  if (idOf(a.queue.getItems()[toIdx]) !== itemId) throw new Error("no-effect: not where it should be");
  return { result: "moved", from, to: toIdx };
}

async function queueReinsert(videoId: string, index: number) {
  const r = await queueInsert({ videoId }, "INSERT_AT_END");
  if (r.ids[0] !== undefined) queueMove(r.ids[0], index);
  return { ok: true };
}

function nowPlaying() {
  const q = app()?.queue;
  const items = q?.getItems?.() ?? [];
  const r = R(items[q?.getCurrentItemIndex?.() ?? -1]);
  return r ? { title: text(r.title), videoId: r.videoId } : null;
}

function probe() {
  const a = app();
  const q = a?.queue;
  return {
    app: !!a,
    fetch: typeof a?.networkManager?.fetch === "function",
    queue: ["getItems", "getCurrentItemIndex", "removeItem"].every((k) => typeof q?.[k] === "function"),
    store: typeof q?.store?.dispatch === "function",
    panel: !!document.querySelector("ytmusic-player-queue#queue"),
    wiz: a?.hasAttribute("is-miniplayer-enabled") ?? false,
    signedIn: (window as any).ytcfg?.get?.("LOGGED_IN") ?? null,
  };
}

async function handle(msg: any, target: Element) {
  switch (msg.job) {
    case "probe":
      return probe();
    case "itemInfo":
      return itemInfo(target);
    case "queueInsert":
      return queueInsert(msg.target, msg.position);
    case "queueRemoveIds":
      return queueRemoveIds(msg.itemIds);
    case "queueRemove":
      return queueRemove(msg.itemId);
    case "queueMove":
      return queueMove(msg.itemId, msg.to);
    case "queueReinsert":
      return queueReinsert(msg.videoId, msg.index);
    case "nowPlaying":
      return nowPlaying();
    case "castState":
      return app()?.queue?.store?.getState?.().castStatus?.castConnectionData?.castConnectionState ?? "unknown";
  }
  throw new Error("unknown job " + msg.job);
}

document.addEventListener(REQ, async (e: Event) => {
  let msg: any;
  try {
    msg = JSON.parse((e as CustomEvent).detail);
  } catch {
    return;
  }
  const reply = (r: object) => document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify({ id: msg.id, ...r }) }));
  try {
    reply({ ok: true, result: await handle(msg, e.target as Element) });
  } catch (err: any) {
    reply({ ok: false, error: String(err?.message ?? err) });
  }
});
