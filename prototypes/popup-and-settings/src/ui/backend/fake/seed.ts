// THROWAWAY PROTOTYPE (ticket 15). Seeds the fake storage document from `?s=<scenario>`. This stands in for the popup's
// one `storage.local.get` (ticket 24): the first view paints from this object alone. Prototype-only weight; the real
// popup reads `device`, `sync` and `doc:settings`.
import type { Doc, Setup } from "$shared/model/types";

const WL = "WL";

const aliounSetup = (): Setup => ({
  autoAdd: ["PLmv", "PLtalks", "PLkids"],
  options: { PLtalks: { takes: "videos", percent: 90 }, PLkids: { takes: "both", percent: null } },
  filters: {
    PLkids: { on: true, mode: "allow", channels: ["tiny", "bricks", "field"] },
    PLmv: { on: true, mode: "deny", channels: ["loud"] },
    PLcook: { on: true, mode: "deny", channels: ["loud", "night"] }, // kept: Cooking is no longer ticked
  },
  shortcutTargets: { k2: "PLfav" },
  quickSave: WL,
  musicQuickSave: "PLjazz",
});

export function baseDoc(): Doc {
  return {
    scenario: "on-video",
    env: {
      browser: "chrome",
      os: "windows",
      activeSite: "youtube",
      ytPage: "watch",
      youtubeOpen: true,
      musicOpen: true,
      access: { youtube: true, music: true },
      signedIn: true,
      readingAccount: false,
      account: "alioun",
      privateWindow: false,
      staleTab: false,
      installedApp: false,
      cachedAgo: "2 hours ago",
      casting: false,
    },
    theme: "system",
    consent: "accepted",
    consentAt: "19 October 2026",
    upgrade: null,
    upgradeDetails: null,
    unclaimed: null,
    claimNotice: null,
    remoteReset: false,
    sync: {
      on: false,
      status: "ok",
      joinedBefore: false,
      remoteHasSettings: false,
      largest: "Music videos' channel filter uses 39 KB",
      lastSynced: "a minute ago",
    },
    health: {},
    musicSection: true,
    features: {
      autoAdd: { on: true, percent: 50, feedback: true, toolbarTick: false, paused: false },
      shortcuts: {
        on: true,
        list: [
          { id: "k1", label: "", key: "Alt+W", watchLaterEverywhere: true },
          { id: "k2", label: "Keepers", key: "Alt+K" },
          { id: "k3", label: "Recipes", key: "" },
        ],
        pickerKey: "Alt+Shift+P",
        onMusic: true,
        feedback: true,
      },
      quickSave: { on: true, onShorts: true, feedback: true },
      queueButton: { on: true, feedback: true },
      watchButton: { on: false, onShorts: false },
      cardMenu: { on: false, linksKeepMenu: false },
      musicQuickActions: {
        on: true,
        buttons: { playNext: true, addToQueue: true, save: true, like: false, remove: false },
        playerBarSave: false,
        feedback: true,
      },
      musicShortcuts: {
        on: false,
        keys: { playNext: "Alt+N", addToQueue: "Alt+Q", save: "Alt+P", savePicker: "Alt+Shift+P", like: "Alt+L", remove: "Alt+R" },
        feedback: true,
      },
    },
    undoKey: "Alt+U",
    accounts: {
      alioun: { id: "alioun", name: "Alioun", handle: "@alioun", hue: 182 },
      studio: { id: "studio", name: "Alioun Studio", handle: "@alioun-studio", hue: 60, brand: true },
    },
    setups: { alioun: aliounSetup() },
    titles: {
      WL: "Watch later",
      PLmv: "Music videos",
      PLtalks: "Talks to watch",
      PLkids: "Kids – approved",
      PLfav: "All-time favourites",
      PLjazz: "Late-night jazz",
      PLcook: "Cooking",
      PLold: "Old stuff",
      PLref: "B-roll references",
      PLrev: "To review",
    },
    marks: {},
    thisVideo: {
      id: "v1",
      title: "How a compiler turns components into DOM updates",
      channel: "byte",
      kind: "video",
      progress: 34,
      lengthLabel: "18:42",
      inPlaylists: ["PLweb"],
      outcomes: {},
      skipped: false,
    },
    playing: {
      id: "m1",
      title: "Midnight Overpass",
      artist: "Lumen Drive",
      album: "Afterglow Avenue",
      hue: 280,
      inPlaylists: ["PLsynth"],
    },
    showing: null,
    detailedLog: false,
    lastCheck: null,
  };
}

export interface Scenario {
  id: string;
  group: string;
  name: string;
  hint: string;
  apply: (d: Doc) => void;
}

const freshInstall = (d: Doc) => {
  for (const f of Object.values(d.features)) (f as { on: boolean }).on = false;
  d.setups = {};
  d.consent = "pending";
  d.consentAt = null;
};

export const scenarios: Scenario[] = [
  { id: "on-video", group: "Where you are", name: "On a video", hint: "A YouTube watch page, 34 % watched", apply: () => {} },
  {
    id: "partly-added",
    group: "Where you are",
    name: "Partly auto-added",
    hint: "Added to two playlists; Talks to watch waits for 90 %",
    apply: (d) => {
      d.thisVideo!.progress = 62;
      d.thisVideo!.outcomes = { PLmv: "added", PLkids: "filtered" };
      d.thisVideo!.inPlaylists = ["PLweb", "PLmv"];
    },
  },
  {
    id: "home",
    group: "Where you are",
    name: "On YouTube's home",
    hint: "No video; nothing to track",
    apply: (d) => {
      d.env.ytPage = "home";
      d.thisVideo = null;
    },
  },
  {
    id: "short",
    group: "Where you are",
    name: "On a Short",
    hint: "Only Kids – approved takes Shorts",
    apply: (d) => {
      d.env.ytPage = "shorts";
      d.thisVideo = {
        id: "s3",
        title: "This CSS trick blew my mind",
        channel: "byte",
        kind: "short",
        progress: 80,
        lengthLabel: "0:45",
        inPlaylists: [],
        outcomes: {},
        skipped: false,
      };
    },
  },
  {
    id: "music",
    group: "Where you are",
    name: "On YouTube Music",
    hint: "A song playing; the YouTube Music tab is preselected",
    apply: (d) => {
      d.env.activeSite = "music";
    },
  },
  {
    id: "installed-app",
    group: "Where you are",
    name: "Installed YouTube Music app",
    hint: "Popup opened from the app window's title bar (ticket 21)",
    apply: (d) => {
      d.env.activeSite = "music";
      d.env.installedApp = true;
    },
  },
  {
    id: "fresh",
    group: "Consent and upgrade",
    name: "Just installed, Not now",
    hint: "First run closed without agreeing: every feature off",
    apply: freshInstall,
  },
  {
    id: "upgrade-pending",
    group: "Consent and upgrade",
    name: "Upgraded from 1.4.5",
    hint: "The upgrade note hasn't been accepted: carried-over features are paused",
    apply: (d) => {
      freshInstall(d);
      d.upgrade = "pending";
      d.features.autoAdd.on = true;
      d.features.shortcuts.on = true;
      d.features.shortcuts.list = [{ id: "k1", label: "", key: "Alt+S" }];
      d.features.autoAdd.percent = 0;
      d.features.autoAdd.feedback = false;
      d.unclaimed = { autoAdd: ["PLmv", "PLtalks", "PLx_typo"], shortcutTarget: "PLmv" };
      d.features.shortcuts.list = [{ id: "k1", label: "", key: "Ctrl+S" }];
      d.upgradeDetails = {
        from: "1.4.5",
        autoAdd: { kept: 3, dropped: 1 },
        pct: { value: 0, wasUnset: true },
        feedback: false,
        shortcut: { raw: "Control+S", key: "Ctrl+S", playlist: true, note: "ctrl-never-fired" },
        credentialsDeleted: true,
      };
    },
  },
  {
    id: "upgrade-set",
    group: "Consent and upgrade",
    name: "Upgraded from 1.4.5 (values set)",
    hint: "1.4.5 had 70 % and a bare K key, which clashes with YouTube's Play/pause",
    apply: (d) => {
      freshInstall(d);
      d.upgrade = "pending";
      d.features.autoAdd.on = true;
      d.features.shortcuts.on = true;
      d.features.autoAdd.percent = 70;
      d.features.autoAdd.feedback = true;
      d.features.shortcuts.list = [{ id: "k1", label: "", key: "K" }];
      d.unclaimed = { autoAdd: ["PLmv", "PLtalks"], shortcutTarget: "PLfav" };
      d.upgradeDetails = {
        from: "1.4.5",
        autoAdd: { kept: 2, dropped: 0 },
        pct: { value: 70, wasUnset: false },
        feedback: true,
        shortcut: { raw: "K", key: "K", playlist: true, note: "ok", clash: "YouTube uses K for Play/pause. This shortcut replaces it on YouTube." },
        credentialsDeleted: true,
      };
    },
  },
  {
    id: "unclaimed",
    group: "Consent and upgrade",
    name: "1.x setup unclaimed",
    hint: "Agreed, but signed in as an account that doesn't own the 1.x playlists",
    apply: (d) => {
      d.env.account = "studio";
      d.setups = {};
      d.unclaimed = { autoAdd: ["PLmv", "PLtalks"], shortcutTarget: "PLmv" };
      d.thisVideo!.outcomes = {};
    },
  },
  {
    id: "claimed",
    group: "Consent and upgrade",
    name: "1.x setup claimed",
    hint: "Alioun owned the 1.x playlists and took them over; one was left out",
    apply: (d) => {
      d.claimNotice = { account: "alioun", dropped: 1 };
    },
  },
  {
    id: "no-tab",
    group: "Connection",
    name: "No YouTube tab",
    hint: "Saved data from 2 hours ago; Open YouTube",
    apply: (d) => {
      d.env.activeSite = "other";
      d.env.youtubeOpen = false;
      d.env.musicOpen = false;
      d.thisVideo = null;
      d.playing = null;
    },
  },
  {
    id: "no-access",
    group: "Connection",
    name: "No site access (Firefox)",
    hint: "Site access to YouTube withheld or revoked",
    apply: (d) => {
      d.env.browser = "firefox";
      d.env.access = { youtube: false, music: false };
      d.env.os = "linux";
    },
  },
  {
    id: "no-music-access",
    group: "Connection",
    name: "No YouTube Music access (Chrome)",
    hint: "Chrome asks for YouTube Music separately, from the click that turns a music feature on",
    apply: (d) => {
      d.env.activeSite = "music";
      d.env.access.music = false;
    },
  },
  {
    id: "youtube-changed",
    group: "Connection",
    name: "YouTube changed something",
    hint: "Ticket 18: the queue button isn't working; auto-add partly works",
    apply: (d) => {
      d.health = {
        queueButton: { status: "broken" },
        autoAdd: { status: "partly", gap: "it can't follow some videos' progress" },
      };
    },
  },
  {
    id: "missing",
    group: "Connection",
    name: "A playlist is missing or full",
    hint: "Old stuff was deleted but is still chosen; All-time favourites is full",
    apply: (d) => {
      d.setups.alioun!.autoAdd.push("PLold");
      d.marks = { PLold: "missing", PLfav: "full" };
    },
  },
  {
    id: "reading-account",
    group: "Account",
    name: "Reading the account",
    hint: "Header placeholder, never a signed-out flash",
    apply: (d) => {
      d.env.readingAccount = true;
    },
  },
  {
    id: "signed-out",
    group: "Account",
    name: "Not signed in",
    hint: "The YouTube tab has nobody signed in",
    apply: (d) => {
      d.env.signedIn = false;
    },
  },
  {
    id: "two-setups",
    group: "Account",
    name: "Two account setups",
    hint: "The header becomes a Showing picker (never 'switch')",
    apply: (d) => {
      d.setups.studio = {
        autoAdd: ["PLref"],
        options: {},
        filters: {},
        shortcutTargets: { k2: "PLrev" },
        quickSave: "PLref",
        musicQuickSave: null,
      };
    },
  },
  {
    id: "new-account",
    group: "Account",
    name: "A new account",
    hint: "Signed in as a brand account seen for the first time: playlists unticked",
    apply: (d) => {
      d.env.account = "studio";
    },
  },
  {
    id: "private-window",
    group: "Account",
    name: "Private window",
    hint: "Setups in use but read-only; shared switches stay editable",
    apply: (d) => {
      d.env.privateWindow = true;
    },
  },
  {
    id: "stale-tab",
    group: "Account",
    name: "Account changed in another tab",
    hint: "This tab stops saving until it reloads",
    apply: (d) => {
      d.env.staleTab = true;
    },
  },
  {
    id: "synced-account",
    group: "Account",
    name: "An account only synced here",
    hint: "Alioun Studio's setup came by sync; its playlists aren't loaded here",
    apply: (d) => {
      d.sync.on = true;
      d.setups.studio = {
        autoAdd: ["PLref", "PLrev", "PLlaunch"],
        options: {},
        filters: {},
        shortcutTargets: {},
        quickSave: null,
        musicQuickSave: null,
        notLoadedHere: true,
      };
      d.showing = "studio";
    },
  },
  {
    id: "paused",
    group: "Where you are",
    name: "Auto-add paused",
    hint: "Paused until you resume or restart the browser",
    apply: (d) => {
      d.features.autoAdd.paused = true;
    },
  },
  {
    id: "sync-on",
    group: "Sync",
    name: "Sync on",
    hint: "Settings sync on and up to date",
    apply: (d) => {
      d.sync.on = true;
      d.sync.joinedBefore = true;
    },
  },
  {
    id: "sync-join",
    group: "Sync",
    name: "Turning sync on (both have settings)",
    hint: "Switching sync on asks once which side to keep",
    apply: (d) => {
      d.sync.remoteHasSettings = true;
    },
  },
  {
    id: "sync-full",
    group: "Sync",
    name: "Synced settings are full",
    hint: "A change that doesn't fit is refused; Remove kept filters frees room",
    apply: (d) => {
      d.sync.on = true;
      d.sync.joinedBefore = true;
      d.sync.status = "full";
    },
  },
  {
    id: "sync-update",
    group: "Sync",
    name: "Another browser has a newer version",
    hint: "Update Playlist Pigeon in this browser to keep syncing",
    apply: (d) => {
      d.sync.on = true;
      d.sync.joinedBefore = true;
      d.sync.status = "update";
    },
  },
  {
    id: "sync-reset",
    group: "Sync",
    name: "Reset from another browser",
    hint: "Clear all data with 'delete synced settings' ticked elsewhere",
    apply: (d) => {
      freshInstall(d);
      d.consent = "accepted";
      d.remoteReset = true;
      d.sync.on = true;
      d.sync.joinedBefore = true;
    },
  },
  {
    id: "first-install",
    group: "Consent and upgrade",
    name: "Just installed (first run)",
    hint: "A new install before first run is answered; on Chrome, YouTube Music access isn't granted yet",
    apply: (d) => {
      freshInstall(d);
      if (d.env.browser === "chrome") d.env.access.music = false;
    },
  },
];

export function seed(id: string | null): Doc {
  const d = baseDoc();
  const s = scenarios.find((x) => x.id === id) ?? scenarios[0];
  s.apply(d);
  d.scenario = s.id;
  return d;
}
