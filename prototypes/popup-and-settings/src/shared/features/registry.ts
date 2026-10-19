// THROWAWAY PROTOTYPE (ticket 15). The feature registry: every switchable part of 2.0 with the copy every surface
// shows. One place, so the popup, settings and first run never disagree on a name.
import type { FeatureId } from "../model/types";

/** Ticket 09's footprint tags, with ticket 19's wording for keys-only features. */
export type Footprint = "none" | "keys" | "buttons" | "right-click";
export const footprintLabel: Record<Footprint, string> = {
  none: "Doesn't change the page",
  keys: "Keys only, doesn't change the page",
  buttons: "Adds buttons to the page",
  "right-click": "Changes right-click on the page",
};

export interface FeatureDef {
  id: FeatureId;
  site: "youtube" | "music";
  name: string;
  /** Even shorter, for the popup's row when the feature is off. */
  short: string;
  footprint: Footprint;
  /** Carried over from 1.4.5 (shown as "Kept from 1.4.5" on the upgrade note). */
  kept?: boolean;
}

export const features: FeatureDef[] = [
  {
    id: "autoAdd",
    site: "youtube",
    name: "Auto-add",
    short: "Files what you watch into playlists",
    footprint: "none",
    kept: true,
  },
  {
    id: "shortcuts",
    site: "youtube",
    name: "Playlist shortcuts",
    short: "Keys that save to a playlist",
    footprint: "keys",
    kept: true,
  },
  {
    id: "quickSave",
    site: "youtube",
    name: "Quick-save on thumbnails",
    short: "A save button on thumbnails",
    footprint: "buttons",
  },
  {
    id: "queueButton",
    site: "youtube",
    name: "Queue button on thumbnails",
    short: "A queue button on thumbnails",
    footprint: "buttons",
  },
  {
    id: "watchButton",
    site: "youtube",
    name: "Watch-page button",
    short: "A status button under the video",
    footprint: "buttons",
  },
  {
    id: "cardMenu",
    site: "youtube",
    name: "Right-click for the video menu",
    short: "Right-click opens YouTube's ⋮ menu",
    footprint: "right-click",
  },
  {
    id: "musicQuickActions",
    site: "music",
    name: "Quick actions",
    short: "Play next and more, one click away",
    footprint: "buttons",
  },
  {
    id: "musicShortcuts",
    site: "music",
    name: "Quick-action shortcuts",
    short: "A key for each quick action",
    footprint: "keys",
  },
];

/** One line per feature for settings and first run. Kept apart from `features` so the popup, which shows only the
 *  short line, doesn't carry them in its first view (ticket 24). */
export { blurbs } from "./blurbs";

export const feature = Object.fromEntries(features.map((f) => [f.id, f])) as Record<FeatureId, FeatureDef>;
export const featuresOf = (site: "youtube" | "music") => features.filter((f) => f.site === site);

/** Ticket 26's six button checkboxes (the sixth, Save on the player bar, is stored apart). */
export const musicButtons = [
  { id: "playNext", name: "Play next", where: "Songs, albums and playlists; moves a queued song up" },
  { id: "addToQueue", name: "Add to queue", where: "Songs, albums and playlists; moves a queued song to the end" },
  { id: "save", name: "Save to playlist", where: "Songs: one click to the quick-save playlist, ▾ for the picker" },
  { id: "like", name: "Like", where: "Songs, where YouTube Music shows no like button of its own" },
  { id: "remove", name: "Remove from queue", where: "Queue items" },
] as const;

export const musicKeyNames = {
  playNext: "Play next",
  addToQueue: "Add to queue",
  save: "Save to playlist",
  savePicker: "Save to playlist…",
  like: "Like or unlike",
  remove: "Remove from queue",
} as const;

export const BRAND = {
  name: "Playlist Pigeon",
  full: "Playlist Pigeon for YouTube™",
  formerly: "YouTube Playlist Tools",
  version: "2.0.0",
  attribution:
    "YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.",
  notAffiliated: "Not affiliated with or endorsed by YouTube or Google.",
};
