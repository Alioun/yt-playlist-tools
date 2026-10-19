// THROWAWAY PROTOTYPE (ticket 27). The shapes the kit's controls draw from. Shared by the mock and the dev build.

/** The quick actions, in YouTube Music's own ⋮-menu order (ticket 26). */
export const ACTION_ORDER = ["playNext", "addToQueue", "save", "like", "remove"] as const;
export type ActionId = (typeof ACTION_ORDER)[number];

export const ACTION_LABEL: Record<ActionId, string> = {
  playNext: "Play next",
  addToQueue: "Add to queue",
  save: "Save to playlist",
  like: "Like",
  remove: "Remove from queue",
};

/** Idle, busy (spinner), done (check for 1.5 s), failed (error icon for 1.5 s), unconfirmed (hourglass). */
export type ButtonState = "idle" | "busy" | "done" | "failed" | "unconfirmed";

/** Where a cluster is drawn. Each place has its own size and surface, copied from YouTube Music's own buttons there. */
export type Place = "row" | "queue" | "card" | "header" | "bar" | "wiz";

export type ItemKind = "song" | "video" | "episode" | "album" | "playlist" | "artist";

/** What the itemInfo job (ticket 17) answers for the pointed-at item, read from YouTube Music's own `data`. */
export interface ItemView {
  key: string;
  kind: ItemKind;
  title: string;
  /** Actions YouTube Music's own ⋮ menu offers for this item (the ticket 26 rule). */
  offered: Partial<Record<ActionId, boolean>>;
  /** YouTube Music already draws a like button for this item (rows' top-level like, the player bar's like). */
  hasOwnLike?: boolean;
  liked?: boolean;
  queue?: { playing?: boolean; autoplay?: boolean };
  /** Song count for albums and playlists, when known. */
  count?: number;
  /** The row is so narrow that its title is squeezed out while our buttons show: tooltips then name the song. */
  nameInTip?: boolean;
}

export interface ClusterSettings {
  /** The user's button choices (ticket 26 defaults: Play next and Add to queue). */
  buttons: Record<ActionId, boolean>;
  /** The account's quick-save playlist; null means choose mode. */
  quickSave: { id: string; title: string } | null;
  keys: Partial<Record<ActionId | "picker", string>>;
  signedIn: boolean;
  casting: boolean;
  /** Actions that aren't working in this tab (ticket 18): no buttons drawn for them. */
  broken: Partial<Record<ActionId, boolean>>;
}

/** Which buttons a cluster shows for an item at a place. Order is fixed; the user can't reorder (ticket 26). */
export function visibleActions(place: Place, item: ItemView, s: ClusterSettings): ActionId[] {
  const out: ActionId[] = [];
  for (const a of ACTION_ORDER) {
    if (s.broken[a]) continue;
    if (place === "bar" || place === "wiz") {
      // Only Save goes on the player bar (ticket 26), and only with its own switch.
      continue;
    }
    if (!s.buttons[a]) continue;
    if (!item.offered[a]) continue;
    if ((a === "save" || a === "like") && !s.signedIn) continue;
    if ((a === "save" || a === "like") && !(item.kind === "song" || item.kind === "video" || item.kind === "episode")) continue;
    if (a === "like" && item.hasOwnLike) continue;
    if (a === "remove" && place !== "queue") continue;
    if ((a === "playNext" || a === "addToQueue") && place === "queue" && (item.queue?.playing || item.queue?.autoplay)) continue;
    if (place === "header" && !(a === "playNext" || a === "addToQueue")) continue;
    out.push(a);
  }
  return out;
}

/** Tooltip text: YouTube Music's own name for the action, plus its key when one is set (ticket 26). */
export function tipFor(a: ActionId | "picker", s: ClusterSettings, opts: { liked?: boolean; title?: string } = {}): string {
  let label: string;
  if (a === "picker") label = "Save to playlist…";
  else if (a === "save") label = s.quickSave ? `Save to ${s.quickSave.title}` : "Save to playlist…";
  else if (a === "like") label = opts.liked ? "Unlike" : "Like";
  else label = ACTION_LABEL[a];
  if (s.casting && (a === "playNext" || a === "addToQueue")) return "Not available while casting";
  if (opts.title) label = `${label}: ${opts.title.length > 40 ? opts.title.slice(0, 40).trimEnd() + "…" : opts.title}`;
  const key = s.keys[a === "save" && !s.quickSave ? "picker" : a];
  return key ? `${label} (${key})` : label;
}
