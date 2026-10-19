// THROWAWAY PROTOTYPE (ticket 09, where things live). Not production code.
// The feature registry: every switchable part of 2.0, and where it lives.
// Every surface reads its names, blurbs and footprints from here so they stay consistent.

export type FeatureId =
  | "autoAdd"
  | "shortcuts"
  | "quickSave"
  | "queueButton"
  | "watchButton"
  | "cardMenu"
  | "musicQuickActions"
  | "musicShortcuts"
  | "sync";

export type Group = "youtube" | "music" | "everywhere";

/** How a feature shows itself. Shown as a tag so the user knows what changes YouTube's look. */
export type Footprint = "background" | "keys" | "buttons" | "right-click";

export const footprintLabel: Record<Footprint, string> = {
  background: "Doesn't change the page",
  keys: "Keys only, doesn't change the page",
  buttons: "Adds buttons to the page",
  "right-click": "Changes right-click on the page",
};

export interface FeatureDef {
  id: FeatureId;
  group: Group;
  name: string;
  blurb: string;
  footprint: Footprint;
  /** Needs a signed-in YouTube account with a setup to work. */
  needsAccount: boolean;
  /** Existed in 1.4.5 and carries over for upgraders. */
  carriedOver: boolean;
  /** Where it shows up, in one line each (used by the map surface and notes). */
  lives: string[];
}

export const features: FeatureDef[] = [
  {
    id: "autoAdd",
    group: "youtube",
    name: "Auto-add",
    blurb: "Adds the videos you watch to your chosen playlists once you've watched enough of them.",
    footprint: "background",
    needsAccount: true,
    carriedOver: true,
    lives: [
      "Popup › YouTube › Auto-add: switch, Pause / Resume, this account's playlists, each with its options (takes, percentage, channel filter)",
      "Popup › This video (watch page, Shorts, miniplayer): the status line, each playlist's outcome, Don't auto-add this video, allow or deny this channel",
      "Settings › YouTube › Auto-add: the same playlists (for any account with a setup), the default required percentage, feedback",
      "Toolbar badge: a tick when this tab's video was added (provisional)",
      "On the page: nothing, apart from its toast",
    ],
  },
  {
    id: "shortcuts",
    group: "youtube",
    name: "Playlist shortcuts",
    // Ticket 08's first-run copy.
    blurb: "Keys that save the video you're pointing at or watching. Alt+W saves to Watch later.",
    footprint: "keys",
    needsAccount: true,
    carriedOver: true,
    lives: [
      "Popup › YouTube: each shortcut's key and label, with this account's playlist for it",
      "Settings › YouTube › Playlist shortcuts: add and remove shortcuts, record keys, labels; works on YouTube Music too",
      "On the page: nothing, apart from its toast",
    ],
  },
  {
    id: "quickSave",
    group: "youtube",
    name: "Quick-save on thumbnails",
    blurb: "A save button on video thumbnails: one click saves to your quick-save playlist, and ▾ picks another.",
    footprint: "buttons",
    needsAccount: true,
    carriedOver: false,
    lives: [
      "On the page: a hover button at the thumbnail's top-left, under the queue button; Shorts shelves too",
      "Popup and Settings: this account's quick-save playlist, or ask each time",
    ],
  },
  {
    id: "queueButton",
    group: "youtube",
    name: "Queue button on thumbnails",
    blurb: "A button on video thumbnails that adds the video to the end of the queue.",
    footprint: "buttons",
    needsAccount: false,
    carriedOver: false,
    lives: ["On the page: a hover button at the thumbnail's top-left", "Settings › YouTube › Queue button"],
  },
  {
    id: "watchButton",
    group: "youtube",
    name: "Watch-page button",
    blurb: "A button under the video showing its auto-add status, with Save to any playlist, Don't auto-add this video and this channel's filter.",
    footprint: "buttons",
    needsAccount: true,
    carriedOver: false,
    lives: [
      "On the page: in YouTube's action row under the video, after Save; on Shorts, in the action column",
      "Settings › YouTube › Watch-page button",
    ],
  },
  {
    id: "cardMenu",
    group: "youtube",
    name: "Right-click for the video menu",
    blurb: "Right-clicking a video opens YouTube's own ⋮ menu. Hold Shift for the browser's menu.",
    footprint: "right-click",
    needsAccount: false,
    carriedOver: false,
    lives: ["On the page: right-click on a video card", "Settings › YouTube › Right-click: links keep the browser's menu"],
  },
  {
    id: "musicQuickActions",
    group: "music",
    name: "Quick actions",
    blurb: "Play next, Add to queue and more, one click away on songs, albums and playlists.",
    footprint: "buttons",
    needsAccount: false,
    carriedOver: false,
    lives: [
      "On the page: hover buttons on song rows (left of YouTube Music's like and ⋮), card overlays, queue items; always-visible Play next / Add to queue in album and playlist headers",
      "The playing song: its queue-panel item, the keys, and (opt-in) Save beside the player bar's like button; never depends on the player bar",
      "Popup › YouTube Music › Playing now: Save (one click) and the picker",
      "Settings › YouTube Music › Quick actions: six button checkboxes, the quick-save playlist, feedback",
    ],
  },
  {
    id: "musicShortcuts",
    group: "music",
    name: "Quick-action shortcuts",
    blurb: "A key for each quick action. It acts on the song under the pointer, else the one playing.",
    footprint: "keys",
    needsAccount: false,
    carriedOver: false,
    lives: [
      "Settings › YouTube Music › Quick-action shortcuts: one key per action (Alt+N, Alt+Q, Alt+P, Alt+Shift+P, Alt+L, Alt+R), the quick-save playlist, feedback",
      "Popup: a key cheat sheet on the YouTube Music tab",
    ],
  },
  {
    id: "sync",
    group: "everywhere",
    name: "Settings sync",
    blurb: "Keeps your setup the same in every browser signed in to the same browser account.",
    footprint: "background",
    needsAccount: false,
    carriedOver: false,
    lives: ["Settings › Everywhere › Settings sync", "First run"],
  },
];

export const featureById = Object.fromEntries(features.map((f) => [f.id, f])) as Record<FeatureId, FeatureDef>;

export const groupLabel: Record<Group, string> = {
  youtube: "YouTube",
  music: "YouTube Music",
  everywhere: "Everywhere",
};

export const byGroup = (g: Group) => features.filter((f) => f.group === g);

/** Inline buttons the user picks (ticket 26). "Save on the player bar" is the sixth checkbox, stored separately. */
export type MusicButton = "playNext" | "addToQueue" | "save" | "like" | "remove";
/** Keys (ticket 26): one per action, plus the picker. */
export type MusicKeyAction = MusicButton | "savePicker";

export const musicButtons: { id: MusicButton; name: string; where: string; defaultOn: boolean }[] = [
  { id: "playNext", name: "Play next", where: "Songs, albums and playlists (not queue items)", defaultOn: true },
  { id: "addToQueue", name: "Add to queue", where: "Songs, albums and playlists (not queue items)", defaultOn: true },
  { id: "save", name: "Save to playlist", where: "Songs: one click to the quick-save playlist, ▾ opens the picker", defaultOn: false },
  { id: "like", name: "Like", where: "Songs, where YouTube Music shows no like button of its own", defaultOn: false },
  { id: "remove", name: "Remove from queue", where: "Queue items only", defaultOn: false },
];

export const musicKeyNames: Record<MusicKeyAction, string> = {
  playNext: "Play next",
  addToQueue: "Add to queue",
  save: "Save to playlist (quick-save)",
  savePicker: "Save to playlist… (picker)",
  like: "Like / unlike",
  remove: "Remove from queue",
};
