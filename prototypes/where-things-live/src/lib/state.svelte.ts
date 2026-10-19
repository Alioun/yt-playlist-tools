// THROWAWAY PROTOTYPE (ticket 09, where things live). In-memory state only; no extension APIs.
// One shared store, so a switch flipped in Settings, the popup or first run shows up on the YouTube mocks at once.
//
// Account model follows ticket 11: an account setup holds only the choices that name that account's
// playlists (auto-add playlists + filters, each shortcut's playlist, the two quick-save playlists).
// Everything else (switches, keys, labels, threshold, YouTube Music choices, theme) is shared.

import { featureById, musicKeyNames, type FeatureId, type MusicKeyAction, type MusicButton } from "./ia";
import { playlistsByAccount, watchVideo, watchVideoIn, songs, accounts, WATCH_LATER, type AccountId, type Playlist } from "./data";

export type Surface = "map" | "popup" | "settings" | "first-run" | "upgrade" | "youtube" | "music";

export const surfaces: { id: Surface; name: string }[] = [
  { id: "map", name: "Map: where everything lives" },
  { id: "popup", name: "Toolbar popup" },
  { id: "settings", name: "Settings page" },
  { id: "first-run", name: "First run" },
  { id: "upgrade", name: "1.4.5 upgrade note" },
  { id: "youtube", name: "YouTube (home, watch, Shorts)" },
  { id: "music", name: "YouTube Music" },
];

export type ChannelFilter = { enabled: boolean; mode: "allow" | "deny"; channels: string[] };

/** A playlist shortcut: key and label are shared by every account; its playlist is per account (tickets 08, 11). */
export interface Shortcut {
  id: string;
  label: string;
  /** "" = no key (cleared; the shortcut is inert but kept). */
  key: string;
  /** Ticket 08: choosing Watch later makes it this shortcut's playlist on every account without its own choice. */
  watchLaterEverywhere?: boolean;
}

/** Ticket 08: up to 20 playlist shortcuts. */
export const MAX_SHORTCUTS = 20;

/** Ticket 18: working, partly working or not working. */
export type Health = "working" | "partly" | "broken";

/** One account's setup (ticket 11): only choices that name the account's playlists. */
export interface Setup {
  autoAdd: string[];
  filters: Record<string, ChannelFilter>;
  /**
   * Ticket 07's per-playlist options, beside the channel filter: what it takes (default Videos) and an optional
   * override of the required percentage (null = the shared default).
   */
  playlistOptions: Record<string, PlaylistOptions>;
  /** shortcut id -> playlist id */
  shortcutTargets: Record<string, string>;
  /** YouTube thumbnail quick-save playlist; null = choose mode (the first save asks and that pick sticks). */
  quickSave: string | null;
  /** YouTube Music's own quick-save playlist (ticket 26); null = choose mode. */
  musicQuickSave: string | null;
}

export type Takes = "videos" | "shorts" | "both";
export interface PlaylistOptions {
  takes: Takes;
  percent: number | null;
}
export const takesLabel: Record<Takes, string> = { videos: "Videos", shorts: "Shorts", both: "Videos and Shorts" };

/** 1.4.5's auto-add playlists and shortcut playlist, waiting to be claimed (ticket 11). */
export interface UnclaimedSetup {
  autoAdd: string[];
  shortcutTarget: string;
}

export type YtPage = "home" | "watch" | "shorts";
export type ActiveSite = "youtube" | "music" | "other";

const baselineSetup = (): Setup => ({
  autoAdd: ["PLmv", "PLtalks", "PLkids"],
  filters: {
    PLkids: { enabled: true, mode: "allow", channels: ["tiny", "bricks", "field"] },
    PLmv: { enabled: true, mode: "deny", channels: ["loud"] },
  },
  // "Talks to watch" waits for 90 % (ticket 07's override), so the watch page shows "partly added" between 50 and 90.
  playlistOptions: { PLtalks: { takes: "videos", percent: 90 }, PLkids: { takes: "both", percent: null } },
  // k1 (Alt+W) saves to Watch later on every account (ticket 08's preset), so only k2 is chosen per account.
  shortcutTargets: { k2: "PLfav" },
  quickSave: WATCH_LATER,
  musicQuickSave: "PLjazz",
});

export const app = $state({
  surface: "map" as Surface,
  scenario: "normal" as ScenarioId,

  /** The browser around the extension. */
  env: {
    activeSite: "youtube" as ActiveSite,
    ytPage: "watch" as YtPage,
    /** Some youtube.com tab is open somewhere (requests are routed through it). */
    youtubeOpen: true,
    musicOpen: true,
    /** Site access to www.youtube.com (ticket 10: Firefox can withhold or revoke it; Chrome "on click"). */
    hostAccess: true,
    /**
     * Site access to music.youtube.com. Firefox: same grant as youtube.com. Chrome: an optional permission,
     * requested from the click that first switches on a YouTube Music feature (ticket 10).
     */
    musicAccess: true,
    signedIn: true,
    /** The account the tab is signed in to (ticket 11: DATASYNC_ID). */
    account: "alioun" as AccountId,
    /** The account header shows a placeholder while the account is read (never a signed-out flash). */
    readingAccount: false,
    /** A private/incognito window (only if the user allowed the extension there). */
    privateWindow: false,
    /** The account changed in another tab; this tab stops writing until reloaded (ticket 11 guard). */
    staleTab: false,
    browser: "firefox" as "firefox" | "chrome",
    /** Popup opened from the installed YouTube Music app window. */
    installedApp: false,
    /** When the cached data was last refreshed, for the no-tab state. */
    cachedAgo: "2 hours ago",
    /** Casting from YouTube Music (Chrome): queue actions dim (ticket 26). */
    casting: false,
    /** The watch video keeps playing in YouTube's miniplayer while browsing (ticket 07: it still counts). */
    miniplayer: false,
  },

  /** Ticket 07: "Pause auto-add" stops it in every tab until Resume or a browser restart (memory only). */
  autoAddPaused: false,

  /** Ticket 08: Alt+U undoes the toast on screen. One key, part of both shortcut features, on both sites. */
  undoKey: "Alt+U",

  /**
   * Ticket 16: settings sync. The switch (features.sync.on) is per browser and never syncs. Feature switches and
   * account setups sync. `remoteHasSettings` = a synced copy exists and this browser has settings of its own,
   * so switching on asks once.
   */
  sync: {
    status: "ok" as "joining" | "ok" | "full" | "update-needed",
    joinedBefore: false,
    remoteHasSettings: false,
    askJoin: false,
    largest: "Music videos' channel filter uses 39 KB",
  },
  /** Ticket 16: accounts whose setup arrived by sync but whose playlists aren't cached in this browser yet. */
  notLoaded: {} as Partial<Record<AccountId, boolean>>,
  /** Ticket 16: shown once after Clear All Data with "delete synced settings" ticked in another browser. */
  remoteResetNotice: false,

  /** Ticket 18: each feature's status in this tab. Missing = working. */
  health: {} as Partial<Record<FeatureId, { status: Health; gap?: string }>>,
  /** Ticket 18: the in-page "not working" notice shows once per browser session per feature and site. */
  noticeShown: {} as Record<string, boolean>,
  /** Ticket 18: Diagnostics' detailed console log (this device only, off by default) and the last Check now. */
  detailedLog: false,
  lastCheck: null as null | { when: string; result: string },

  consent: "accepted" as "accepted" | "pending" | "declined",
  /** A 1.4.5 upgrader who hasn't accepted the note yet. */
  upgradePending: false,
  /** 1.4.5's playlists before an account claims them. */
  unclaimed: null as UnclaimedSetup | null,
  /** Shown once in the popup after an account claims the 1.x setup. */
  claimNotice: null as { account: AccountId; dropped: number } | null,

  /** The YouTube Music section's own switch (map Q20–Q21). Off: nothing runs on music.youtube.com; choices inside are kept. */
  sites: { music: true },

  /** Shared feature switches and options (ticket 11: shared by every account). */
  features: {
    /**
     * No "prevent duplicates": 2.0 never adds a second copy (ticket 12). No global Shorts switch: each playlist
     * says what it takes (ticket 07). `threshold` is the shared default required percentage.
     */
    autoAdd: { on: true, threshold: 50, toast: true, badge: true },
    /**
     * Ticket 08: keys are caught inside YouTube and YouTube Music pages, never as browser commands.
     * Turning the feature on presets Alt+W → Watch later; "Keepers" is one the user added.
     * The picker key opens the playlist picker on YouTube; the undo key (shared, app.undoKey) undoes the toast on screen.
     */
    shortcuts: {
      on: true,
      onMusic: true,
      toast: true,
      pickerKey: "Alt+Shift+P",
      list: [
        { id: "k1", label: "", key: "Alt+W", watchLaterEverywhere: true },
        { id: "k2", label: "Keepers", key: "Alt+K" },
      ] as Shortcut[],
    },
    quickSave: { on: true, onShorts: true, toast: true },
    queueButton: { on: true, toast: false },
    watchButton: { on: true, onShorts: true },
    cardMenu: { on: false, linksKeepBrowserMenu: true },
    musicQuickActions: {
      on: true,
      buttons: { playNext: true, addToQueue: true, save: false, like: false, remove: false } as Record<MusicButton, boolean>,
      /** Save (split button) immediately left of YouTube Music's own like button, only where a player bar exists. */
      playerBarSave: false,
      toast: true,
    },
    musicShortcuts: {
      on: false,
      keys: {
        playNext: "Alt+N",
        addToQueue: "Alt+Q",
        save: "Alt+P",
        savePicker: "Alt+Shift+P",
        like: "Alt+L",
        remove: "Alt+R",
      } as Record<MusicKeyAction, string>,
      toast: true,
    },
    sync: { on: false },
  },

  /** Per-account setups. null = seen, but no choice made yet (nothing stored, ticket 11). */
  setups: { alioun: baselineSetup(), studio: null } as Record<AccountId, Setup | null>,

  /** The account's playlists (cached copy of YouTube's list; "New playlist" adds here). */
  playlists: structuredClone(playlistsByAccount) as Record<AccountId, Playlist[]>,

  /**
   * Ticket 12's Missing / Full marks on chosen playlists, shown with Remove wherever that feature's playlists
   * are chosen (popup and Settings). Demo: "Old stuff" was deleted but is still an auto-add playlist;
   * "All-time favourites" (a shortcut's playlist) is full.
   */
  marks: {} as Record<string, "missing" | "full">,
  /** Last-known titles of playlists that are no longer listed. */
  goneTitles: { PLold: "Old stuff" } as Record<string, string>,

  /** PROPOSAL (new capability, needs the user's go-ahead): recent adds in the popup, for toasts that were missed. */
  recent: [
    { id: 1, text: 'Auto-added "Rainy café jazz for focus" to Late-night jazz', outcome: "added", when: "12 min ago", undo: true },
    { id: 2, text: 'Couldn\'t auto-add "Neon highways" to Old stuff: it doesn\'t exist anymore', outcome: "failed", when: "40 min ago", undo: false },
    { id: 3, text: 'Didn\'t auto-add "REACTING to the WORST kitchen gadgets": LOUD REACTS is filtered out of Music videos', outcome: "filtered", when: "1 h ago", undo: false },
  ] as { id: number; text: string; outcome: "added" | "already" | "filtered" | "skipped" | "failed"; when: string; undo: boolean }[],

  /** The popup's account header can show another account's setup (never switches YouTube's account). null = follow the tab. */
  popupAccount: null as AccountId | null,
  /** Which account's setup the settings page is showing. null = the popup's current account. */
  settingsAccount: null as AccountId | null,

  theme: "system" as "light" | "dark" | "system",

  /** The mock watch page. */
  watch: {
    progress: 34,
    added: [] as string[],
    failed: [] as string[],
    skipped: false,
    /** Playlists the current video is in (membership). */
    inPlaylists: [...watchVideoIn],
  },

  /** The mock YouTube Music tab. */
  music: {
    nowPlaying: songs[0].id,
    queue: songs.slice(0, 6).map((s) => s.id),
    liked: ["m4"] as string[],
    /** song id -> playlist ids it's in */
    inPlaylists: { m1: ["PLsynth"], m3: ["PLjazz"] } as Record<string, string[]>,
  },

  /** Mock in-page toasts (bottom-left, one at a time, like YouTube's own). onaction runs when the action is clicked. */
  toasts: [] as {
    id: number;
    site: "youtube" | "music";
    text: string;
    action?: string;
    failed?: boolean;
    sticky?: boolean;
    onaction?: () => void;
  }[],

  /** Popup open over the YouTube mocks. */
  popupOpen: false,

  /** The mocked browser permission prompt (site access), or null. */
  permissionPrompt: null as { site: "youtube" | "music"; then?: () => void } | null,
});

// ---------- accounts ----------

export const setupOf = (account: AccountId) => app.setups[account];
/** The tab's own account setup (what in-page features use). */
export const tabSetup = () => (app.env.signedIn ? app.setups[app.env.account] : null);
/** Accounts that have a setup (the header picker appears only when there are 2+, ticket 11). */
export const accountsWithSetup = () => (Object.keys(app.setups) as AccountId[]).filter((a) => app.setups[a]);
/** The account the popup is showing: a picked one, else the tab's (null when signed out and nothing picked). */
export const popupAccount = (): AccountId | null => app.popupAccount ?? (app.env.signedIn ? app.env.account : null);
export const settingsAccount = (): AccountId => app.settingsAccount ?? popupAccount() ?? accountsWithSetup()[0] ?? "alioun";
export const accountName = (a: AccountId) => accounts[a].name;

/** Get the account's setup, creating it on the first choice (ticket 11: nothing stored before that). */
export function ensureSetup(account: AccountId): Setup {
  if (!app.setups[account]) {
    app.setups[account] = { autoAdd: [], filters: {}, playlistOptions: {}, shortcutTargets: {}, quickSave: null, musicQuickSave: null };
  }
  return app.setups[account]!;
}

/** Ticket 11: setups are read-only in a private window. */
export const setupReadOnly = () => app.env.privateWindow;

export function removeSetup(account: AccountId) {
  app.setups[account] = null;
  if (app.popupAccount === account) app.popupAccount = null;
  if (app.settingsAccount === account) app.settingsAccount = null;
}

// ---------- playlists ----------

export const playlistsFor = (account: AccountId): Playlist[] => app.playlists[account];
export const playlistTitle = (id: string | null, account: AccountId = app.env.account) =>
  id === null || id === "ask"
    ? "Not chosen yet"
    : (app.playlists[account].find((p) => p.id === id)?.title ?? app.goneTitles[id] ?? "a playlist that's no longer available");

/** Ticket 12: list copy "Music", "Music and Learning", "Music, Learning and Watch later", "Music, Learning and 2 more". */
export function listText(ids: string[], account: AccountId = app.env.account): string {
  const t = ids.map((id) => playlistTitle(id, account));
  if (t.length <= 1) return t[0] ?? "";
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  if (t.length === 3) return `${t[0]}, ${t[1]} and ${t[2]}`;
  return `${t[0]}, ${t[1]} and ${t.length - 2} more`;
}

/** Remove a chosen playlist everywhere this account uses it (the Remove next to a Missing / Full mark). */
export function removeChosenPlaylist(account: AccountId, playlistId: string) {
  const s = app.setups[account];
  if (!s) return;
  s.autoAdd = s.autoAdd.filter((p) => p !== playlistId);
  for (const k of Object.keys(s.shortcutTargets)) if (s.shortcutTargets[k] === playlistId) delete s.shortcutTargets[k];
  if (s.quickSave === playlistId) s.quickSave = null;
  if (s.musicQuickSave === playlistId) s.musicQuickSave = null;
  delete app.marks[playlistId];
}

let newId = 0;
export function createPlaylist(account: AccountId, title: string, privacy: Playlist["privacy"]): string {
  const id = `PLnew${++newId}`;
  app.playlists[account].push({ id, title, privacy, count: 0, hue: (newId * 67) % 360 });
  return id;
}

// ---------- playlist shortcuts and keys (ticket 08) ----------

/** The shortcut's playlist on this account: its own choice, else Watch later when chosen "everywhere". */
export function shortcutTarget(account: AccountId, s: Shortcut): string | null {
  return app.setups[account]?.shortcutTargets[s.id] ?? (s.watchLaterEverywhere ? WATCH_LATER : null);
}

/** Choosing Watch later applies on every account without its own choice; any other playlist is per account. */
export function setShortcutTarget(account: AccountId, s: Shortcut, pid: string | null) {
  const st = app.setups[account];
  if (pid === WATCH_LATER) {
    s.watchLaterEverywhere = true;
    if (st) delete st.shortcutTargets[s.id];
  } else if (!pid) {
    if (st) delete st.shortcutTargets[s.id];
  } else ensureSetup(account).shortcutTargets[s.id] = pid;
}

/** {Shortcut} in copy: its label, else this account's playlist title, else its key (tickets 08, 11). */
export function shortcutName(s: Shortcut, account: AccountId = app.env.account): string {
  if (s.label) return s.label;
  const t = shortcutTarget(account, s);
  return t ? playlistTitle(t, account) : s.key || "A shortcut";
}

let shortcutSeq = 10;
/** Adds a shortcut at the end (no key yet; the recorder starts at once in the UI). Null at the limit of 20. */
export function addShortcut(): Shortcut | null {
  if (app.features.shortcuts.list.length >= MAX_SHORTCUTS) return null;
  const s: Shortcut = { id: `k${++shortcutSeq}`, label: "", key: "" };
  app.features.shortcuts.list.push(s);
  return s;
}

/** Removes a shortcut everywhere (key, label, its playlist on every account); returns Undo (ticket 08: no confirm). */
export function removeShortcut(id: string): () => void {
  const list = app.features.shortcuts.list;
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return () => {};
  const [removed] = list.splice(i, 1);
  const targets: [AccountId, string][] = [];
  for (const a of Object.keys(app.setups) as AccountId[]) {
    const t = app.setups[a]?.shortcutTargets[id];
    if (t) {
      targets.push([a, t]);
      delete app.setups[a]!.shortcutTargets[id];
    }
  }
  return () => {
    list.splice(i, 0, removed);
    for (const [a, t] of targets) ensureSetup(a).shortcutTargets[id] = t;
  };
}

/** The key of the playlist shortcut that saves to this playlist on this account (the picker shows it). */
export function keyForPlaylist(account: AccountId, pid: string): string | null {
  if (!app.features.shortcuts.on) return null;
  return app.features.shortcuts.list.find((s) => s.key && shortcutTarget(account, s) === pid)?.key ?? null;
}

export type KeySite = "youtube" | "music" | "both";
export interface KeyOwner {
  id: string;
  name: string;
  site: KeySite;
  key: string;
  clear: () => void;
}

/** Every key the extension uses, with its site: one key, one shortcut, per site (ticket 08). */
export function keyOwners(): KeyOwner[] {
  const f = app.features;
  const scSite: KeySite = f.shortcuts.onMusic ? "both" : "youtube";
  const owners: KeyOwner[] = f.shortcuts.list.map((s) => ({
    id: `shortcut:${s.id}`,
    name: shortcutName(s),
    site: scSite,
    key: s.key,
    clear: () => (s.key = ""),
  }));
  owners.push({ id: "picker", name: "Save to playlist… (picker)", site: "youtube", key: f.shortcuts.pickerKey, clear: () => (f.shortcuts.pickerKey = "") });
  owners.push({ id: "undo", name: "Undo", site: "both", key: app.undoKey, clear: () => (app.undoKey = "") });
  for (const [a, k] of Object.entries(f.musicShortcuts.keys) as [MusicKeyAction, string][])
    owners.push({ id: `music:${a}`, name: `${musicKeyNames[a]} (YouTube Music)`, site: "music", key: k, clear: () => (f.musicShortcuts.keys[a] = "") });
  return owners;
}

// ---------- settings sync (ticket 16) ----------

/** Switching sync on: the join (ask once if both sides have settings, else wait up to 10 s for a synced copy). */
export function startSync() {
  if (app.sync.remoteHasSettings) {
    app.sync.askJoin = true;
    return;
  }
  app.features.sync.on = true;
  app.sync.status = "joining";
  app.sync.joinedBefore = true;
  setTimeout(() => {
    if (app.sync.status === "joining") app.sync.status = "ok";
  }, 1500);
}

/** The join question: "Use synced settings" (default), "Use this browser's settings", or Cancel (sync stays off). */
export function answerJoin(choice: "synced" | "local" | "cancel") {
  app.sync.askJoin = false;
  if (choice === "cancel") return;
  app.sync.remoteHasSettings = false;
  app.features.sync.on = true;
  app.sync.joinedBefore = true;
  app.sync.status = "ok";
}

/** Ticket 16's status line under the Settings sync switch, or null when it's off. */
export function syncStatusLine(): { text: string; problem: boolean } | null {
  if (!app.features.sync.on) return null;
  const browser = app.env.browser === "firefox" ? "Firefox's" : "Chrome's";
  switch (app.sync.status) {
    case "joining":
      return { text: "Looking for synced settings from your other browsers…", problem: false };
    case "full":
      return { text: `Synced settings are full. ${app.sync.largest}: remove some, or turn off sync in this browser to keep more here.`, problem: true };
    case "update-needed":
      return { text: "Update Playlist Tools in this browser to keep syncing.", problem: true };
    default:
      return { text: `Synced through ${browser} own sync.`, problem: false };
  }
}

/** "Remove kept filters": filters of playlists the account no longer auto-adds to (ticket 16). */
export function removeKeptFilters() {
  for (const a of Object.keys(app.setups) as AccountId[]) {
    const s = app.setups[a];
    if (!s) continue;
    for (const pid of Object.keys(s.filters)) if (!s.autoAdd.includes(pid)) delete s.filters[pid];
  }
  if (app.sync.status === "full") app.sync.status = "ok";
}

/** Ticket 16: Clear All Data resets this browser; the synced copy only if `alsoSynced` is ticked. */
export function clearAllData(alsoSynced: boolean) {
  app.setups = { alioun: null, studio: null };
  for (const id of Object.keys(app.features) as FeatureId[]) app.features[id].on = false;
  app.consent = "pending";
  app.sync.status = "ok";
  app.sync.joinedBefore = alsoSynced ? false : app.sync.joinedBefore;
  app.marks = {};
  app.recent = [];
  app.notLoaded = {};
}

// ---------- feature health (ticket 18) ----------

export const healthOf = (id: FeatureId): Health => app.health[id]?.status ?? "working";

/** The status line under a feature's switch in the popup and Settings (ticket 18's copy), or null when working. */
export function healthLine(id: FeatureId): string | null {
  const h = app.health[id];
  if (!h || h.status === "working") return null;
  const site = featureById[id].group === "music" ? "YouTube Music" : "YouTube";
  return h.status === "broken"
    ? `Not working right now: ${site} changed something it relies on.`
    : `Partly working: ${h.gap ?? "some of it can't be done right now"}.`;
}

/** Switched-on features that aren't working (in this tab). */
export const brokenFeatures = () =>
  (Object.keys(app.features) as FeatureId[]).filter((id) => app.features[id].on && healthOf(id) === "broken");
/** Switched-on features that are partly working. */
export const partlyFeatures = () =>
  (Object.keys(app.features) as FeatureId[]).filter((id) => app.features[id].on && healthOf(id) === "partly");

/** Ticket 18's popup strip, or null. */
export function breakageStrip(): string | null {
  const b = brokenFeatures();
  if (b.length === 1) return `${featureById[b[0]].name} isn't working in this tab because YouTube changed something.`;
  if (b.length > 1) return `${b.length} features aren't working in this tab.`;
  const p = partlyFeatures();
  if (p.length === 1) return `${featureById[p[0]].name} is partly working in this tab.`;
  if (p.length > 1) return `${p.length} features are partly working in this tab.`;
  return null;
}

/** Opens Settings at Diagnostics (the notice's and the strip's "Details"). */
export function openDiagnostics() {
  go("settings");
  setTimeout(() => document.getElementById("settings-diagnostics")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

const noticeCopy: Partial<Record<FeatureId, string>> = {
  autoAdd: "Auto-add isn't working right now because YouTube changed something. Videos you watch aren't being added for now.",
  shortcuts: "Playlist shortcuts aren't working right now because YouTube changed something. Use YouTube's own Save for now.",
  quickSave: "Quick-save isn't working right now because YouTube changed something. Use YouTube's own Save for now.",
  queueButton: "The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now.",
  cardMenu: "The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now.",
  watchButton: "The watch-page button isn't working right now because YouTube changed something.",
  musicQuickActions: "Quick actions aren't working right now because YouTube Music changed something. Use its ⋮ menu for now.",
  musicShortcuts: "Quick-action shortcuts aren't working right now because YouTube Music changed something. Use its ⋮ menu for now.",
};

/**
 * Ticket 18's in-page notice: once per browser session per feature and site, when the feature would act.
 * A sticky failure toast with Details. Several features found at once share one notice.
 */
export function maybeBreakageNotice(site: "youtube" | "music") {
  const ids = brokenFeatures().filter((id) => featureById[id].group === (site === "music" ? "music" : "youtube") && running(id));
  const fresh = ids.filter((id) => !app.noticeShown[`${site}:${id}`]);
  if (!fresh.length) return;
  for (const id of fresh) app.noticeShown[`${site}:${id}`] = true;
  const text =
    fresh.length === 1
      ? noticeCopy[fresh[0]]!
      : `${fresh.map((id) => featureById[id].name).join(" and ")} aren't working right now because ${site === "music" ? "YouTube Music" : "YouTube"} changed something.`;
  toast(site, text, "Details", { failed: true, sticky: true, onaction: openDiagnostics });
}

/** Ticket 18's diagnostics report: plain text, shown in full before Copy, with no IDs, titles, names or settings values. */
export function diagnosticsReport(): string {
  const on = (Object.keys(app.features) as FeatureId[]).filter((id) => app.features[id].on);
  const lines = [
    "Playlist Tools 2.0.0 (build 2026-10-19)",
    `Browser: ${app.env.browser === "firefox" ? "Firefox 152" : "Chrome 155"}, Linux`,
    "YouTube client: 2.20261017.01.00 (en) · YouTube Music client: 1.20261015.03.00 (en)",
    `Features on: ${on.map((id) => featureById[id].name).join(", ") || "none"}`,
    `Site access: YouTube ${app.env.hostAccess ? "yes" : "no"}, YouTube Music ${app.env.musicAccess ? "yes" : "no"}`,
    `Signed in in this tab: ${app.env.signedIn ? "yes" : "no"}`,
    "Status:",
    ...on.map((id) => `  ${featureById[id].name}: ${{ working: "working", partly: "partly working", broken: "not working" }[healthOf(id)]}`),
    "Breakage signals this session:",
    ...(brokenFeatures().length || partlyFeatures().length
      ? [...brokenFeatures(), ...partlyFeatures()].map((id) => `  ${id}: unrecognised response shape {status, contents[]?} (watch-list W${id.length})`)
      : ["  none"]),
    `Last Check now: ${app.lastCheck ? `${app.lastCheck.when}, ${app.lastCheck.result}` : "not run"}`,
  ];
  return lines.join("\n");
}

/** Ticket 18's Check now: read-only probes in a serving tab, only when clicked. */
export function checkNow() {
  const bad = brokenFeatures().length + partlyFeatures().length;
  app.lastCheck = {
    when: "just now",
    result: !app.env.youtubeOpen ? "no YouTube tab to check in" : bad ? `${bad} problem${bad === 1 ? "" : "s"} found` : "everything answered as expected",
  };
}

// ---------- feature state ----------

export type BlockReason = "consent" | "no-access" | "site-off";

export const blockReasonText: Record<BlockReason, string> = {
  consent: "Waiting for your OK",
  "no-access": "Needs site access",
  "site-off": "YouTube Music is switched off",
};

/** Site access per site (ticket 10). Firefox grants both together. */
export const hasAccess = (site: "youtube" | "music") => (site === "youtube" ? app.env.hostAccess : app.env.musicAccess);

/** Why a switched-on feature isn't loaded on pages right now, or null. */
export function blockReason(id: FeatureId): BlockReason | null {
  const def = featureById[id];
  if (app.consent !== "accepted") return "consent";
  if (id === "sync") return null;
  if (def.group === "youtube" && !app.env.hostAccess) return "no-access";
  if (def.group === "music" && !app.sites.music) return "site-off";
  if (def.group === "music" && !app.env.musicAccess) return "no-access";
  return null;
}

/**
 * A mock of the browser's own permission prompt. Ticket 10: permissions.request must run in the click
 * handler; on Chrome, YouTube Music access is requested from the click that first switches on a YouTube Music
 * feature (first run included). Firefox grants youtube.com and music.youtube.com together.
 */
export function requestAccess(site: "youtube" | "music", then?: () => void) {
  if (hasAccess(site)) return then?.();
  app.permissionPrompt = { site, then };
}

export function answerPermissionPrompt(allow: boolean) {
  const p = app.permissionPrompt;
  app.permissionPrompt = null;
  if (!p || !allow) return;
  if (p.site === "youtube" || app.env.browser === "firefox") {
    app.env.hostAccess = true;
    app.env.musicAccess = true;
  } else app.env.musicAccess = true;
  p.then?.();
}

/** Switch a feature on from a click: asks for site access first when its site needs it (ticket 10). */
export function switchOn(id: FeatureId) {
  const g = featureById[id].group;
  if (g === "music") requestAccess("music", () => (app.features[id].on = true));
  else if (g === "youtube") requestAccess("youtube", () => (app.features[id].on = true));
  else if (id === "sync") startSync();
  else app.features[id].on = true;
}

/**
 * On, and nothing blocks it: in-page mocks draw a feature's controls only when this is true.
 * Signed-out or setup-less accounts still get the controls; they answer when used (ticket 11),
 * except auto-add, which stays silent, and YouTube Music's Save/Like, which aren't drawn signed out (ticket 26).
 */
export const running = (id: FeatureId) => app.features[id].on && blockReason(id) === null;

/** Playlist shortcuts on YouTube Music: the feature, its "on YouTube Music too" option and the section switch. */
export const shortcutsOnMusic = () => running("shortcuts") && app.features.shortcuts.onMusic && app.sites.music;

// ---------- auto-add: per-playlist options, pause, status (ticket 07) ----------

/** What's playing in this tab: a Short on the Shorts page, else a video (watch page or miniplayer). */
export const currentKind = (): "videos" | "shorts" => (app.env.ytPage === "shorts" ? "shorts" : "videos");
export const optionsFor = (pid: string, account: AccountId = app.env.account): PlaylistOptions =>
  app.setups[account]?.playlistOptions[pid] ?? { takes: "videos", percent: null };
/** The playlist's required percentage: its override, else the shared default. */
export const goalFor = (pid: string, account: AccountId = app.env.account) =>
  optionsFor(pid, account).percent ?? app.features.autoAdd.threshold;
const takes = (pid: string, kind: "videos" | "shorts", account: AccountId) => {
  const t = optionsFor(pid, account).takes;
  return t === "both" || t === kind;
};
/** The tab account's auto-add playlists that take what's playing. */
export const autoAddTargets = (account: AccountId = app.env.account) =>
  (app.setups[account]?.autoAdd ?? []).filter((p) => takes(p, currentKind(), account));

/** Auto-add tracks only when on, unpaused, signed in, not stale, and some playlist takes what's playing (tickets 07, 11). */
export const autoAddTracking = () =>
  running("autoAdd") && app.env.signedIn && !app.env.staleTab && !app.autoAddPaused && autoAddTargets().length > 0;

/** Moves the mock playhead; auto-add adds to every playlist whose required percentage has been reached. */
export function setProgress(p: number) {
  app.watch.progress = p;
  fireAutoAdd(watchVideo.channel);
}

export type AutoAddStateKind = "off" | "not-tracked" | "paused" | "skipped" | "counting" | "partly" | "done";

/**
 * One state per playback, from ticket 07's table (draft copy; ticket 14 owns the final words).
 * `missing` says why nothing is tracked; the popup shows it, the page shows nothing.
 */
export function autoAddState(channelKey: string = watchVideo.channel): {
  kind: AutoAddStateKind;
  text: string;
  action?: "Resume" | "Undo";
  missing?: string;
} {
  if (!running("autoAdd")) return { kind: "off", text: "" };
  if (!app.env.signedIn) return { kind: "not-tracked", text: "", missing: "You're not signed in, so auto-add is idle here." };
  const setup = tabSetup();
  if (!setup || setup.autoAdd.length === 0)
    return { kind: "not-tracked", text: "", missing: `${accountName(app.env.account)} has no auto-add playlists yet.` };
  const targets = autoAddTargets();
  if (!targets.length)
    return {
      kind: "not-tracked",
      text: "",
      missing: currentKind() === "shorts" ? "No auto-add playlist takes Shorts." : "No auto-add playlist takes videos.",
    };
  if (app.autoAddPaused) return { kind: "paused", text: "Auto-add paused", action: "Resume" };
  const st = targets.map((p) => ({ p, s: videoStatus(p, channelKey) }));
  const pending = st.filter((x) => x.s === "will-add").map((x) => x.p);
  const of = (s: VideoStatus) => st.filter((x) => x.s === s).map((x) => x.p);
  if (app.watch.skipped && of("skipped").length && !pending.length)
    return { kind: "skipped", text: "Not auto-adding this video", action: "Undo" };
  if (!pending.length) {
    if (of("added").length) return { kind: "done", text: `Auto-added to ${listText(of("added"))}` };
    if (of("already").length) return { kind: "done", text: `Already in ${listText(of("already"))}` };
    if (of("failed").length) return { kind: "done", text: `Couldn't auto-add to ${listText(of("failed"))}` };
    return { kind: "done", text: `Filtered out of ${listText(of("filtered"))}` };
  }
  const goal = Math.min(...pending.map((p) => goalFor(p)));
  const added = [...of("added"), ...of("already")];
  if (added.length) return { kind: "partly", text: `Added to ${listText(added)} · ${listText(pending)} at ${goal} %` };
  return { kind: "counting", text: `Auto-adds at ${goal} % · ${app.watch.progress} % watched` };
}

/** "Don't auto-add this video" (ticket 07): the session skip on every auto-add playlist; Undo clears it. */
export function toggleSkip() {
  app.watch.skipped = !app.watch.skipped;
  if (!app.watch.skipped) fireAutoAdd(watchVideo.channel);
}

/** "Pause auto-add" / Resume (ticket 07): every tab, until Resume or the browser restarts. */
export function togglePause() {
  app.autoAddPaused = !app.autoAddPaused;
}

/** What an explicit save (shortcut, quick-save, watch-page button) answers when it can't save. */
export function saveBlockedMessage(): string | null {
  if (!app.env.signedIn) return "Sign in to YouTube to save videos.";
  if (app.env.staleTab) return "Your YouTube account changed in another tab. Reload this page to keep saving here.";
  return null;
}

// ---------- toasts ----------

let toastId = 0;
/**
 * One at a time, newest replaces the previous (tickets 12 and 26). Failures get an error look, never colour alone.
 * `onaction` runs when the action ("Undo", "Settings", "Choose", "Sign in", "Reload") is clicked.
 */
export function toast(
  site: "youtube" | "music",
  text: string,
  action?: string,
  opts: { failed?: boolean; sticky?: boolean; onaction?: () => void } = {},
) {
  const id = ++toastId;
  app.toasts = [{ id, site, text, action, ...opts }];
  // Ticket 18's breakage notice stays until dismissed: it describes a lasting state.
  if (!opts.sticky)
    setTimeout(() => {
      app.toasts = app.toasts.filter((t) => t.id !== id);
    }, 6000);
}

export const dismissToast = (id: number) => (app.toasts = app.toasts.filter((t) => t.id !== id));

/** Ticket 12's "Settings" toast action: opens Settings at the feature whose playlist choice needs fixing. */
export function openSettingsAt(feature: FeatureId) {
  go("settings");
  setTimeout(() => document.getElementById(`feature-${feature}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

const cut = (s: string) => (s.length > 40 ? s.slice(0, 40) + "…" : s);

// ---------- the watch page's video ----------

/** The status of the current watch-page video for one auto-add playlist: ticket 12's outcomes, plus "will-add" before it fires. */
export type VideoStatus = "will-add" | "added" | "already" | "filtered" | "skipped" | "failed";

export function videoStatus(playlistId: string, channelKey: string, account: AccountId = app.env.account): VideoStatus {
  const setup = app.setups[account];
  if (app.watch.failed.includes(playlistId)) return "failed";
  if (app.watch.added.includes(playlistId)) return "added";
  if (app.watch.inPlaylists.includes(playlistId)) return "already";
  const f = setup?.filters[playlistId];
  if (f && f.enabled) {
    const listed = f.channels.includes(channelKey);
    if ((f.mode === "allow" && !listed) || (f.mode === "deny" && listed)) return "filtered";
  }
  if (app.watch.skipped) return "skipped";
  return "will-add";
}

export const videoStatusText: Record<VideoStatus, string> = {
  "will-add": "Will be added",
  added: "Added",
  already: "Already in it",
  filtered: "Filtered out by its channel filter",
  skipped: "Not auto-adding this video",
  failed: "Couldn't add",
};

/** Simulates auto-add firing on the mock watch page (or "Add now"), with ticket 12's toast copy. */
export function fireAutoAdd(channelKey: string, now = false, title = watchVideo.title) {
  const setup = tabSetup();
  if (!setup || (!autoAddTracking() && !now)) return;
  const targets = autoAddTargets().filter((p) => {
    const s = videoStatus(p, channelKey);
    return (s === "will-add" && (now || goalFor(p) <= app.watch.progress)) || (now && s === "skipped");
  });
  if (targets.length === 0) return;
  const failed = targets.filter((p) => app.marks[p]);
  const ok = targets.filter((p) => !app.marks[p]);
  app.watch.added.push(...ok);
  app.watch.inPlaylists.push(...ok);
  app.watch.failed.push(...failed);
  const t = cut(title);
  const rec = (text: string, outcome: "added" | "failed", undo: boolean) =>
    app.recent.unshift({ id: Date.now() + Math.random(), text, outcome, when: "just now", undo });
  if (failed.length) {
    const f = failed[0];
    const why = app.marks[f] === "full" ? "it's full" : "it doesn't exist anymore";
    const text = ok.length
      ? `Auto-added "${t}" to ${listText(ok)}. Couldn't add it to ${playlistTitle(f)}: ${why}.`
      : `Couldn't auto-add "${t}": ${playlistTitle(f)} ${app.marks[f] === "full" ? "is full" : "doesn't exist anymore"}.`;
    rec(text, "failed", false);
    // Failures always show, even with feedback off (ticket 12).
    toast("youtube", text, "Settings", { failed: true, onaction: () => openSettingsAt("autoAdd") });
  } else {
    const text = `Auto-added "${t}" to ${listText(ok)}`;
    rec(text, "added", true);
    if (app.features.autoAdd.toast) toast("youtube", text, "Undo");
  }
}

/** Saves the watch-page video to one playlist (shortcut, quick-save, picker), with ticket 12's copy. */
export function saveVideo(playlistId: string, title = watchVideo.title, feature: FeatureId = "shortcuts") {
  const blocked = saveBlockedMessage();
  if (blocked) return toast("youtube", blocked, app.env.signedIn ? "Reload" : "Sign in", { failed: true });
  const t = cut(title);
  if (app.marks[playlistId]) {
    const why = app.marks[playlistId] === "full" ? "is full" : "doesn't exist anymore";
    const choose = feature === "quickSave";
    return toast("youtube", `Couldn't save "${t}": ${playlistTitle(playlistId)} ${why}.`, choose ? "Choose" : "Settings", {
      failed: true,
      onaction: choose ? undefined : () => openSettingsAt(feature),
    });
  }
  if (title === watchVideo.title && app.watch.inPlaylists.includes(playlistId))
    return toast("youtube", `"${t}" is already in ${playlistTitle(playlistId)}`);
  if (title === watchVideo.title) app.watch.inPlaylists.push(playlistId);
  const show = feature === "quickSave" ? app.features.quickSave.toast : app.features.shortcuts.toast;
  if (show) toast("youtube", `Saved "${t}" to ${playlistTitle(playlistId)}`, "Undo");
}

/**
 * The toolbar icon's badge (ticket 10 uses it for missing site access):
 * "!" when the user has to act (consent, site access, a Missing or Full playlist), else a per-tab tick
 * when this tab's video was auto-added (provisional, auto-add's "tick on the toolbar icon" option).
 */
export function toolbarBadge(): string | null {
  if (app.consent !== "accepted" || !app.env.hostAccess) return "!";
  const musicOn = app.sites.music && (app.features.musicQuickActions.on || app.features.musicShortcuts.on);
  if (musicOn && !app.env.musicAccess) return "!";
  if (Object.keys(app.marks).length) return "!";
  // Ticket 18: amber "!" while a feature isn't working in this tab (missing access, above, takes priority).
  if (brokenFeatures().length) return "!";
  if (app.features.autoAdd.badge && running("autoAdd") && app.env.activeSite === "youtube" && app.watch.added.length) return "✓";
  return null;
}

// ---------- scenarios (the popup's states and the flows) ----------

export type ScenarioId =
  | "normal"
  | "home"
  | "shorts"
  | "music"
  | "installed-app"
  | "other-site"
  | "no-tab"
  | "no-access"
  | "no-music-access"
  | "missing-playlist"
  | "youtube-changed"
  | "sync-join"
  | "sync-full"
  | "sync-update"
  | "synced-account"
  | "sync-reset-elsewhere"
  | "reading-account"
  | "signed-out"
  | "new-account"
  | "private-window"
  | "stale-tab"
  | "consent-pending"
  | "upgrade-pending"
  | "unclaimed-1x"
  | "claimed-1x";

export const scenarios: { id: ScenarioId; name: string; hint: string; group: string }[] = [
  { id: "normal", group: "Where you are", name: "On a video", hint: "Active tab: a YouTube watch page" },
  { id: "home", group: "Where you are", name: "On YouTube's home", hint: "Active tab: youtube.com, no video" },
  { id: "shorts", group: "Where you are", name: "On a Short", hint: "Active tab: a YouTube Short" },
  { id: "music", group: "Where you are", name: "On YouTube Music", hint: "Active tab: music.youtube.com, a song playing" },
  { id: "installed-app", group: "Where you are", name: "Installed YouTube Music app", hint: "Popup opened from the app window's title bar" },
  { id: "other-site", group: "Where you are", name: "Another site", hint: "Active tab elsewhere; YouTube open in another tab" },
  { id: "no-tab", group: "Connection", name: "No YouTube tab", hint: "No youtube.com or YouTube Music tab anywhere" },
  { id: "no-access", group: "Connection", name: "No site access (Firefox)", hint: "Firefox: site access to youtube.com withheld or revoked; it covers YouTube Music too" },
  { id: "no-music-access", group: "Connection", name: "No YouTube Music access (Chrome)", hint: "Chrome: YouTube Music is optional site access, asked for from the click that switches a YouTube Music feature on" },
  { id: "youtube-changed", group: "Connection", name: "YouTube changed something", hint: "Ticket 18: the queue button isn't working and auto-add is partly working in this tab" },
  { id: "missing-playlist", group: "Connection", name: "A playlist is missing or full", hint: "\"Old stuff\" was deleted but is still an auto-add playlist; \"All-time favourites\" is full (ticket 12's marks)" },
  { id: "reading-account", group: "Account", name: "Reading the account", hint: "Header placeholder, never a signed-out flash" },
  { id: "signed-out", group: "Account", name: "Not signed in", hint: "The YouTube tab has nobody signed in" },
  { id: "new-account", group: "Account", name: "A different account", hint: "Signed in as a brand account seen for the first time" },
  { id: "private-window", group: "Account", name: "Private window", hint: "Setups are in use but read-only" },
  { id: "stale-tab", group: "Account", name: "Account changed in another tab", hint: "This tab stops saving until it reloads" },
  { id: "sync-join", group: "Sync", name: "Turning sync on (both have settings)", hint: "Ticket 16: switching Settings sync on asks once: Use synced settings or Use this browser's settings" },
  { id: "sync-full", group: "Sync", name: "Synced settings are full", hint: "Ticket 16: a change that doesn't fit is refused; Remove kept filters frees room" },
  { id: "sync-update", group: "Sync", name: "Another browser has a newer version", hint: "Ticket 16: Update {Name} in this browser to keep syncing" },
  { id: "synced-account", group: "Sync", name: "An account only synced here", hint: "Ticket 16: Alioun Studio's setup came by sync; its playlists aren't loaded in this browser yet" },
  { id: "sync-reset-elsewhere", group: "Sync", name: "Reset from another browser", hint: "Ticket 16: Clear All Data with 'delete synced settings' ticked in another browser" },
  { id: "consent-pending", group: "Consent and upgrade", name: "Waiting for consent", hint: "First run closed without agreeing" },
  { id: "upgrade-pending", group: "Consent and upgrade", name: "Upgraded from 1.4.5", hint: "The upgrade note hasn't been accepted yet" },
  { id: "unclaimed-1x", group: "Consent and upgrade", name: "1.x setup unclaimed", hint: "Accepted, but signed in as an account that doesn't own the 1.x playlists" },
  { id: "claimed-1x", group: "Consent and upgrade", name: "1.x setup claimed", hint: "Accepted; Alioun owns the 1.x playlists and took them over" },
];

/** 1.4.5's carried-over playlists: two Alioun owns, one that's gone (half-typed ID). */
export const legacy: UnclaimedSetup = { autoAdd: ["PLmv", "PLtalks", "PLx_typo"], shortcutTarget: "PLmv" };

let upgradeDemo = false;

export function applyScenario(id: ScenarioId) {
  app.scenario = id;
  app.popupOpen = false;
  const e = app.env;
  Object.assign(e, {
    activeSite: "youtube",
    ytPage: "watch",
    youtubeOpen: true,
    musicOpen: true,
    hostAccess: true,
    musicAccess: true,
    signedIn: true,
    account: "alioun",
    readingAccount: false,
    privateWindow: false,
    staleTab: false,
    installedApp: false,
  });
  app.consent = "accepted";
  app.upgradePending = false;
  app.claimNotice = null;
  app.popupAccount = null;
  app.permissionPrompt = null;
  app.watch.failed = [];
  app.health = {};
  app.noticeShown = {};
  app.toasts = [];
  app.notLoaded = {};
  app.remoteResetNotice = false;
  Object.assign(app.sync, { status: "ok", remoteHasSettings: false, askJoin: false });
  // Baseline: sync off in this browser; the sync scenarios switch it on.
  app.features.sync.on = id === "sync-full" || id === "sync-update" || id === "synced-account";
  if (upgradeDemo) {
    // Leaving an upgrade or marks scenario: back to the configured baseline.
    app.setups = { alioun: baselineSetup(), studio: null };
    app.unclaimed = null;
    app.marks = {};
    app.features.shortcuts.list = baselineShortcuts();
    upgradeDemo = false;
  }
  switch (id) {
    case "home":
      e.ytPage = "home";
      break;
    case "shorts":
      e.ytPage = "shorts";
      break;
    case "music":
      e.activeSite = "music";
      break;
    case "installed-app":
      e.activeSite = "music";
      e.installedApp = true;
      e.browser = "chrome";
      break;
    case "other-site":
      e.activeSite = "other";
      break;
    case "no-tab":
      e.activeSite = "other";
      e.youtubeOpen = false;
      e.musicOpen = false;
      break;
    case "no-access":
      e.hostAccess = false;
      e.musicAccess = false;
      e.browser = "firefox";
      break;
    case "no-music-access":
      e.browser = "chrome";
      e.musicAccess = false;
      e.activeSite = "music";
      break;
    case "sync-join":
      app.sync.remoteHasSettings = true;
      app.sync.joinedBefore = true;
      break;
    case "sync-full":
      app.sync.status = "full";
      app.sync.joinedBefore = true;
      break;
    case "sync-update":
      app.sync.status = "update-needed";
      app.sync.joinedBefore = true;
      break;
    case "synced-account":
      upgradeDemo = true;
      app.sync.joinedBefore = true;
      app.setups.studio = {
        autoAdd: ["PLref", "PLrev", "PLx_old"],
        filters: {},
        playlistOptions: {},
        shortcutTargets: {},
        quickSave: null,
        musicQuickSave: null,
      };
      app.notLoaded = { studio: true };
      break;
    case "sync-reset-elsewhere":
      app.remoteResetNotice = true;
      break;
    case "youtube-changed":
      app.health = {
        queueButton: { status: "broken" },
        autoAdd: { status: "partly", gap: "it can't follow some videos' progress" },
      };
      break;
    case "missing-playlist":
      upgradeDemo = true;
      app.setups.alioun!.autoAdd.push("PLold");
      app.marks = { PLold: "missing", PLfav: "full" };
      break;
    case "reading-account":
      e.readingAccount = true;
      break;
    case "signed-out":
      e.signedIn = false;
      break;
    case "new-account":
      e.account = "studio";
      break;
    case "private-window":
      e.privateWindow = true;
      break;
    case "stale-tab":
      e.staleTab = true;
      break;
    case "consent-pending":
      app.consent = "pending";
      break;
    case "upgrade-pending":
      startUpgradeDemo();
      app.consent = "pending";
      app.upgradePending = true;
      break;
    case "unclaimed-1x":
      startUpgradeDemo();
      e.account = "studio";
      break;
    case "claimed-1x":
      startUpgradeDemo();
      claimLegacy("alioun");
      break;
  }
}

function startUpgradeDemo() {
  upgradeDemo = true;
  app.setups = { alioun: null, studio: null };
  app.unclaimed = structuredClone(legacy);
  // Ticket 08: an upgrader's list holds only their own 1.x shortcut (its key carries over), no Watch later preset.
  app.features.shortcuts.list = [{ id: "k1", label: "", key: "Ctrl+Shift+S" }];
}

const baselineShortcuts = (): Shortcut[] => [
  { id: "k1", label: "", key: "Alt+W", watchLaterEverywhere: true },
  { id: "k2", label: "Keepers", key: "Alt+K" },
];

/** Ticket 11: the first signed-in account owning any 1.x playlist claims it; IDs it doesn't own are dropped. */
export function claimLegacy(account: AccountId) {
  const u = app.unclaimed;
  if (!u) return;
  const owned = new Set(playlistsFor(account).map((p) => p.id));
  const keep = u.autoAdd.filter((p) => owned.has(p));
  if (keep.length === 0 && !owned.has(u.shortcutTarget)) return;
  const s = ensureSetup(account);
  for (const p of keep) if (!s.autoAdd.includes(p)) s.autoAdd.push(p);
  const first = app.features.shortcuts.list[0];
  if (first && !s.shortcutTargets[first.id] && owned.has(u.shortcutTarget)) s.shortcutTargets[first.id] = u.shortcutTarget;
  app.claimNotice = { account, dropped: u.autoAdd.length - keep.length };
  app.unclaimed = null;
}

export function discardLegacy() {
  app.unclaimed = null;
}

/** Accepting the consent (first run or upgrade note). */
export function acceptConsent() {
  app.consent = "accepted";
  app.upgradePending = false;
  if (app.unclaimed && app.env.signedIn && !app.env.privateWindow) claimLegacy(app.env.account);
}

export function go(surface: Surface) {
  app.surface = surface;
  app.popupOpen = false;
  const url = new URL(location.href);
  url.searchParams.set("surface", surface);
  history.replaceState(null, "", url);
}

/** The extension's own theme (popup, settings, first run, upgrade note). In-page UI follows YouTube instead. */
export function extThemeClass(): string {
  if (app.theme === "dark") return "dark";
  if (app.theme === "system" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches)
    return "dark";
  return "";
}

/** For the "full state" readout. */
export const snapshot = () => JSON.parse(JSON.stringify({ ...app, toasts: undefined, playlists: "(omitted)" }));
