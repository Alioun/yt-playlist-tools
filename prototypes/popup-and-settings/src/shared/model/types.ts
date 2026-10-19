// THROWAWAY PROTOTYPE (ticket 15). The fake "storage.local" document every page paints from. Shapes follow tickets
// 08, 11, 12, 16 and 26 loosely; they're for the prototype, not the real schema.

export type AccountId = "alioun" | "studio" | "kids";
export type FeatureId =
  | "autoAdd"
  | "shortcuts"
  | "quickSave"
  | "queueButton"
  | "watchButton"
  | "cardMenu"
  | "musicQuickActions"
  | "musicShortcuts";
export type Site = "youtube" | "music";
export type Health = "working" | "partly" | "broken";
export type Takes = "videos" | "shorts" | "both";
export type Privacy = "private" | "unlisted" | "public";
export type MusicButton = "playNext" | "addToQueue" | "save" | "like" | "remove";
export type MusicKeyAction = "playNext" | "addToQueue" | "save" | "savePicker" | "like" | "remove";

export interface AccountLabel {
  id: AccountId;
  name: string;
  handle: string | null; // null = no channel (ticket 12: can't create playlists)
  hue: number; // avatar colour
  brand?: boolean;
}

export interface ChannelFilter {
  on: boolean;
  mode: "allow" | "deny";
  channels: string[]; // channel ids
}

export interface PlaylistOptions {
  takes: Takes;
  percent: number | null; // null = the shared default
}

/** Ticket 11: an account setup holds only choices that name the account's playlists. */
export interface Setup {
  autoAdd: string[];
  options: Record<string, PlaylistOptions>;
  filters: Record<string, ChannelFilter>; // kept filters included (playlists no longer ticked)
  shortcutTargets: Record<string, string>; // shortcut id -> playlist id
  quickSave: string | null; // YouTube thumbnail quick-save; null = choose mode
  musicQuickSave: string | null; // YouTube Music Save to playlist; null = choose mode
  /** Ticket 16: a setup that came by sync, whose playlists this browser hasn't loaded yet. */
  notLoadedHere?: boolean;
}

export interface Shortcut {
  id: string;
  label: string; // "" = none (shows the playlist title, ticket 08)
  key: string; // "" = no key
  watchLaterEverywhere?: boolean;
}

export interface Env {
  browser: "chrome" | "firefox";
  os: "mac" | "windows" | "linux";
  activeSite: Site | "other";
  ytPage: "watch" | "shorts" | "home" | "miniplayer";
  youtubeOpen: boolean;
  musicOpen: boolean;
  access: Record<Site, boolean>;
  signedIn: boolean;
  readingAccount: boolean;
  account: AccountId; // the tab's account
  privateWindow: boolean;
  staleTab: boolean;
  installedApp: boolean;
  cachedAgo: string;
  casting: boolean;
}

export interface ThisVideo {
  id: string;
  title: string;
  channel: string; // channel id
  kind: "video" | "short";
  progress: number; // % actually watched
  lengthLabel: string;
  /** Playlists that already hold the video (membership, ticket 12). */
  inPlaylists: string[];
  /** Auto-add outcomes so far, by playlist. */
  outcomes: Record<string, "added" | "already" | "filtered" | "skipped" | "failed">;
  skipped: boolean; // "Don't auto-add this video" (session skip)
  live?: boolean;
}

export interface PlayingSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  hue: number;
  inPlaylists: string[];
  ad?: boolean;
}

export interface UpgradeDetails {
  from: string;
  autoAdd: { kept: number; dropped: number };
  pct: { value: number; wasUnset: boolean };
  feedback: boolean;
  shortcut: {
    raw: string;
    key: string | null;
    playlist: boolean;
    note: "ok" | "ctrl-never-fired" | "unconvertible" | "no-playlist" | "none";
    clash?: string;
  };
  credentialsDeleted: boolean;
}

export interface Doc {
  scenario: string;
  env: Env;
  theme: "system" | "light" | "dark";
  consent: "accepted" | "pending";
  /** Ticket 19 §4.3: one versioned consent of our own, per browser, never synced. */
  consentAt: string | null;
  upgrade: null | "pending" | "accepted";
  /** Ticket 19 §2.6: what the 1.4.5 migration carried, written before consent. Only stored values. */
  upgradeDetails: null | UpgradeDetails;
  unclaimed: null | { autoAdd: string[]; shortcutTarget: string | null };
  claimNotice: null | { account: AccountId; dropped: number };
  remoteReset: boolean;
  sync: {
    on: boolean;
    status: "looking" | "ok" | "full" | "update";
    joinedBefore: boolean;
    remoteHasSettings: boolean;
    largest: string;
    lastSynced: string;
  };
  health: Partial<Record<FeatureId, { status: Health; gap?: string }>>;
  /** The YouTube Music section's own switch (map Q20–21). */
  musicSection: boolean;
  features: {
    autoAdd: { on: boolean; percent: number; feedback: boolean; toolbarTick: boolean; paused: boolean };
    shortcuts: {
      on: boolean;
      list: Shortcut[];
      pickerKey: string;
      onMusic: boolean;
      feedback: boolean;
    };
    quickSave: { on: boolean; onShorts: boolean; feedback: boolean };
    queueButton: { on: boolean; feedback: boolean };
    watchButton: { on: boolean; onShorts: boolean };
    cardMenu: { on: boolean; linksKeepMenu: boolean };
    musicQuickActions: { on: boolean; buttons: Record<MusicButton, boolean>; playerBarSave: boolean; feedback: boolean };
    musicShortcuts: { on: boolean; keys: Record<MusicKeyAction, string>; feedback: boolean };
  };
  /** Ticket 08: one undo key shared by both shortcut features. */
  undoKey: string;
  accounts: Partial<Record<AccountId, AccountLabel>>;
  setups: Partial<Record<AccountId, Setup | null>>;
  /** Cached titles of chosen playlists, so the first view can name them without the full list. */
  titles: Record<string, string>;
  /** Ticket 12's Missing / Full marks. */
  marks: Record<string, "missing" | "full">;
  thisVideo: ThisVideo | null;
  playing: PlayingSong | null;
  /** The popup's "Showing" picker: null = follow the tab's account. */
  showing: AccountId | null;
  detailedLog: boolean;
  lastCheck: null | { when: string; result: string };
}
