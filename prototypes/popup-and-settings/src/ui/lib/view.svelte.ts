// THROWAWAY PROTOTYPE (ticket 15). The views' state over the Backend seam (ticket 17): one `load()` paints the
// first view, `watch()` keeps it current, every write is a `change()`. Components read `ui.s` and never mutate it.
import type { AccountInView, Backend, Change, ChangeResult, UiArgs, UiCall, UiResult, UiSnapshot } from "$ui/backend/backend";
import type { AccountId, FeatureId, PlayingSong, Shortcut, Site, ThisVideo } from "$shared/model/types";

type TabState = { state: "waiting" } | { state: "ready"; video: ThisVideo | null; playing: PlayingSong | null };

export const ui = $state({
  s: undefined as unknown as UiSnapshot,
  account: { state: "reading" } as { state: "reading" } | ({ state: "ready" } & AccountInView),
  /** The account in view, when picked in the header or settings (glossary: never switches YouTube's account). */
  picked: null as AccountId | null,
  tab: { state: "waiting" } as TabState,
  /** The last refused change, for an inline explanation (ticket 16's "full", ticket 11's private window). */
  refused: null as null | { reason: "private" | "sync-full" | "update-needed" | "invalid"; at: number },
  /** The consent question raised by switching a feature on before agreeing (store rule, ticket 03). */
  consentAsk: null as null | { feature: FeatureId },
});

let backend: Backend;

export async function start(b: Backend) {
  backend = b;
  ui.s = await b.load();
  ui.picked = ui.s.showing;
  b.watch((e) => {
    ui.s = e.snapshot;
    readYouTube();
  });
  readYouTube();
}

/**
 * The account and This video / Playing now come from the YouTube tab, so they're read only after consent (ticket 19
 * §2.4: before Agree nothing is read from YouTube, not even who's signed in). Until then the views show stored data.
 */
let accountAsked = false;
function readYouTube() {
  if (ui.s.consent !== "accepted") return;
  if (!accountAsked) {
    accountAsked = true;
    backend.call("accountInView", {}).then((a) => {
      ui.account = { state: "ready", ...a };
    });
  }
  backend.call("thisTab", {}).then((t) => {
    ui.tab = { state: "ready", ...t };
  });
}

/** Before consent: nothing has been read from YouTube yet. */
export const beforeConsent = () => ui.s.consent !== "accepted";

export async function act(c: Change): Promise<ChangeResult> {
  const r = await backend.change(c);
  if (!r.ok) ui.refused = { reason: r.refused, at: Date.now() };
  return r;
}

export const call = <K extends UiCall>(kind: K, args: UiArgs<K>): Promise<UiResult<K>> => backend.call(kind, args);
export const access = {
  has: (site: Site) => backend.access.has(site),
  request: (site: Site) => backend.access.request(site),
};

// ---------- theme ----------

export function applyTheme(forced: string | null) {
  const pref = forced === "light" || forced === "dark" ? forced : ui.s.theme;
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// ---------- accounts (ticket 11) ----------

/** The account in view: picked, else the tab's (null when signed out or still reading). */
export function accountInView(): AccountId | null {
  if (ui.picked) return ui.picked;
  return ui.account.state === "ready" ? ui.account.acct : null;
}
/** The tab's own account: what This video and Playing now act as, whatever account is in view (ticket 11). */
export function tabAccount(): AccountId | null {
  return ui.account.state === "ready" ? ui.account.acct : null;
}
export const accountsWithSetup = () => (Object.keys(ui.s.setups) as AccountId[]).filter((a) => ui.s.setups[a]);
export const labelOf = (a: AccountId) => ui.s.accounts[a] ?? { id: a, name: "Unnamed account", handle: null, hue: 255 };
export const setupOf = (a: AccountId | null) => (a ? (ui.s.setups[a] ?? null) : null);
/** Ticket 11: setups are read-only in a private window; shared settings stay editable. */
export const setupsReadOnly = () => ui.s.env.privateWindow;
export const titleOf = (id: string | null | undefined) =>
  !id ? "Not chosen yet" : (ui.s.titles[id] ?? "a playlist that's no longer available");

// ---------- features ----------

export const isMusic = (id: FeatureId) => id === "musicQuickActions" || id === "musicShortcuts";

/** Why a feature that's on isn't running right now. */
export function heldBy(id: FeatureId): null | "consent" | "access" | "section" | "paused" {
  if (ui.s.consent !== "accepted") return "consent";
  if (isMusic(id) && !ui.s.musicSection) return "section";
  if (!ui.s.env.access[isMusic(id) ? "music" : "youtube"]) return "access";
  if (id === "autoAdd" && ui.s.features.autoAdd.paused) return "paused";
  return null;
}

/**
 * Switching a feature on: consent first if it's missing; then, on Chrome, YouTube Music's site access is asked for
 * from this very click (ticket 10); then the change.
 */
export async function setFeature(id: FeatureId, on: boolean) {
  if (!on) return act({ kind: "feature", id, on: false });
  if (ui.s.consent !== "accepted") {
    ui.consentAsk = { feature: id };
    return;
  }
  if (isMusic(id) && !ui.s.env.access.music) {
    const ok = await access.request("music");
    if (!ok) return;
  }
  return act({ kind: "feature", id, on: true });
}

export async function agreeAndTurnOn(id: FeatureId) {
  ui.consentAsk = null;
  if (isMusic(id) && !ui.s.env.access.music && !(await access.request("music"))) {
    await act({ kind: "consent", accepted: true });
    return;
  }
  await act({ kind: "consent", accepted: true, turnOn: [id] });
}

// ---------- auto-add (tickets 07, 12) ----------

export const autoAddFor = (a: AccountId | null) => setupOf(a)?.autoAdd ?? [];
export const optionsOf = (a: AccountId | null, pid: string) =>
  setupOf(a)?.options[pid] ?? { takes: "videos" as const, percent: null };
export const goalOf = (a: AccountId | null, pid: string) => optionsOf(a, pid).percent ?? ui.s.features.autoAdd.percent;

export type VideoTone = "muted" | "progress" | "done" | "paused" | "warn";

/** Ticket 07's status line for This video. */
export function thisVideoStatus(v: ThisVideo): { text: string; tone: VideoTone; action?: "Resume" | "Undo"; goals: number[] } {
  const a = tabAccount();
  const none = { goals: [] as number[] };
  if (!ui.s.features.autoAdd.on) return { text: "Auto-add is off", tone: "muted", ...none };
  if (!ui.s.env.signedIn) return { text: "Not signed in, so auto-add is idle here", tone: "muted", ...none };
  if (ui.s.env.staleTab) return { text: "Stopped: the account changed in another tab", tone: "warn", ...none };
  if (ui.s.features.autoAdd.paused) return { text: "Auto-add paused", tone: "paused", action: "Resume", ...none };
  if (v.live) return { text: "Live streams aren't auto-added", tone: "muted", ...none };
  const takes = (pid: string) => {
    const t = optionsOf(a, pid).takes;
    return t === "both" || (v.kind === "short" ? t === "shorts" : t === "videos");
  };
  const all = autoAddFor(a);
  const lists = all.filter(takes);
  if (!all.length) return { text: `${a ? labelOf(a).name : "This account"} has no auto-add playlists yet`, tone: "muted", ...none };
  if (!lists.length)
    return { text: v.kind === "short" ? "No auto-add playlist takes Shorts" : "No auto-add playlist takes videos", tone: "muted", ...none };
  if (v.skipped) return { text: "Not auto-adding this video", tone: "paused", action: "Undo", ...none };
  const pending = lists.filter((p) => !v.outcomes[p]);
  const added = lists.filter((p) => v.outcomes[p] === "added" || v.outcomes[p] === "already");
  const goals = [...new Set(lists.map((p) => goalOf(a, p)))];
  if (!pending.length) {
    if (added.length) return { text: `Auto-added to ${listOf(added.map(titleOf))}`, tone: "done", goals };
    return { text: "Filtered out of every auto-add playlist", tone: "muted", goals };
  }
  const goal = Math.min(...pending.map((p) => goalOf(a, p)));
  if (added.length)
    return { text: `Added to ${listOf(added.map(titleOf))} · ${listOf(pending.map(titleOf))} at ${goal} %`, tone: "progress", goals };
  return { text: `Auto-adds at ${goal} % · ${v.progress} % watched`, tone: "progress", goals };
}

/** Ticket 12's list copy: "Music", "Music and Learning", "Music, Learning and Watch later", "Music, Learning and 2 more". */
export function listOf(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  if (titles.length === 3) return `${titles[0]}, ${titles[1]} and ${titles[2]}`;
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}

// ---------- shortcuts (ticket 08) ----------

export const MAX_SHORTCUTS = 20;

export function shortcutTarget(a: AccountId | null, s: Shortcut): string | null {
  return setupOf(a)?.shortcutTargets[s.id] ?? (s.watchLaterEverywhere ? "WL" : null);
}

/** {Shortcut} in copy: its label, else this account's playlist title, else its key. */
export function shortcutName(s: Shortcut, a: AccountId | null = accountInView()): string {
  if (s.label) return s.label;
  const t = shortcutTarget(a, s);
  return t ? titleOf(t) : s.key || "New shortcut";
}

// ---------- sync (ticket 16) ----------

export function syncLine(): { text: string; problem: boolean } | null {
  if (!ui.s.sync.on) return null;
  switch (ui.s.sync.status) {
    case "looking":
      return { text: "Looking for synced settings from your other browsers…", problem: false };
    case "full":
      return { text: `Synced settings are full. ${ui.s.sync.largest}: remove some, or turn off sync in this browser to keep more here.`, problem: true };
    case "update":
      return { text: "Update Playlist Pigeon in this browser to keep syncing.", problem: true };
    default:
      return { text: `Synced ${ui.s.sync.lastSynced}`, problem: false };
  }
}

// ---------- health (ticket 18) ----------

export const healthOf = (id: FeatureId) => ui.s.health[id]?.status ?? "working";
export function healthLine(id: FeatureId): string | null {
  const h = ui.s.health[id];
  if (!h || h.status === "working") return null;
  const site = isMusic(id) ? "YouTube Music" : "YouTube";
  return h.status === "broken" ? `Not working right now: ${site} changed something it relies on.` : `Partly working: ${h.gap}.`;
}
