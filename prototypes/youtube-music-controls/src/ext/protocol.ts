// THROWAWAY PROTOTYPE (ticket 27, rough dev build). The page channel between the isolated world and the gateway
// (ticket 17's PageChannel): CustomEvents carrying JSON strings; item jobs are dispatched on the item's element.
export const REQ = "pp27:req";
export const RES = "pp27:res";

export type ItemKind = "song" | "video" | "episode" | "album" | "playlist" | "artist" | "unknown";

export interface ItemInfo {
  kind: ItemKind;
  title: string;
  offered: { playNext?: boolean; addToQueue?: boolean; save?: boolean; like?: boolean; remove?: boolean };
  hasOwnLike: boolean;
  liked: boolean;
  /** What the queue jobs need, read from YouTube Music's own menu item. */
  target?: { videoId?: string; playlistId?: string };
  queue?: { itemId: string; playing: boolean; autoplay: boolean };
  count?: number;
  /** The menu items, by endpoint key, for the report. */
  menu: string[];
}

export type Job =
  | { job: "probe" }
  | { job: "itemInfo" }
  | { job: "queueInsert"; target: { videoId?: string; playlistId?: string }; position: "INSERT_AFTER_CURRENT_VIDEO" | "INSERT_AT_END" }
  | { job: "queueRemoveIds"; itemIds: string[] }
  | { job: "queueRemove"; itemId: string }
  | { job: "queueMove"; itemId: string; to: "next" | "end" | number }
  | { job: "queueReinsert"; videoId: string; index: number }
  | { job: "nowPlaying" }
  | { job: "castState" };
