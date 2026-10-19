// THROWAWAY PROTOTYPE (ticket 14). A stand-in for the tab view and the background (tickets 16, 17): everything the
// in-page controls know, held in memory with fake data.
// The same module runs in the hi-fi mock and in the rough dev build on real YouTube; no request ever leaves the page.
// Copy follows ticket 12 (adds, toasts), ticket 07 (auto-add states) and ticket 18 (not working), final wording here.

export type Health = "working" | "partly" | "broken";
export type Privacy = "private" | "unlisted" | "public";
export type Playlist = { id: string; title: string; privacy: Privacy; key?: string; count: number };
export type AutoAddKind =
  | "counting"
  | "partly"
  | "added"
  | "already"
  | "failed"
  | "skipped"
  | "paused"
  | "live"
  | "cantMeasure"
  | "notTracked";
export type QueueState = "idle" | "busy" | "added" | "unconfirmed" | "failed";
export type SaveState = "idle" | "busy" | "done" | "saved" | "failed";
export type Video = { id: string; title: string; channel?: string; short?: boolean };
export type FeatureId = "autoAdd" | "shortcuts" | "quickSave" | "queue" | "watchButton" | "cardMenu";

export const FEATURE_NAMES: Record<FeatureId, string> = {
  autoAdd: "Auto-add",
  shortcuts: "Playlist shortcuts",
  quickSave: "Quick-save",
  queue: "The Add to queue button",
  watchButton: "The watch-page button",
  cardMenu: "The right-click menu",
};

/** The placeholder product name (ticket 22 is open). */
export const PRODUCT = "Playlist Pigeon";

export const view = $state({
  /** Prototype variant: A = recommended, B = pure YouTube (no marks, labelled fallback), C = compact. */
  look: "A" as "A" | "B" | "C",
  signedIn: true,
  account: "Alioun",
  features: {
    autoAdd: true,
    shortcuts: true,
    quickSave: true,
    quickSaveOnShorts: true,
    queue: true,
    watchButton: true,
    watchButtonOnShorts: true,
    cardMenu: true,
  },
  feedback: { autoAdd: true, shortcuts: true, quickSave: true, queue: true },
  health: {
    autoAdd: "working",
    shortcuts: "working",
    quickSave: "working",
    queue: "working",
    watchButton: "working",
    cardMenu: "working",
  } as Record<FeatureId, Health>,
  /** This account's quick-save playlist; null = choose mode (tickets 12, 26). */
  quickSave: "PLmusic" as string | null,
  playlists: [
    { id: "WL", title: "Watch later", privacy: "private", key: "Alt+W", count: 41 },
    { id: "PLmusic", title: "Music videos", privacy: "public", count: 212 },
    { id: "PLtalks", title: "Talks to watch", privacy: "unlisted", count: 18 },
    { id: "PLwood", title: "Woodworking ideas", privacy: "private", count: 64 },
    { id: "PLkids", title: "Kids – approved", privacy: "private", count: 93 },
    { id: "PLrecipes", title: "Recipes to try this winter", privacy: "public", count: 27 },
    { id: "PLhistory", title: "History", privacy: "private", count: 1204 },
    { id: "PLsynth", title: "Synthwave for focus", privacy: "public", count: 77 },
  ] as Playlist[],
  /** What the fake add flow answers. */
  outcome: {
    save: "ok" as "ok" | "already" | "fail" | "missing" | "refused",
    queue: "confirmed" as "confirmed" | "unconfirmed" | "fail",
    latency: 700,
    membershipMs: 800,
    membershipOk: true,
  },
  /** Right-click: links inside cards (thumbnail and title) keep the browser's menu. */
  linksKeepBrowserMenu: false,
  /** Our Add to queue steps aside on cards where YouTube draws its own hover Add to queue (live: signed-out lockups). */
  queueDefers: true,
  /** The watch page's auto-add state (ticket 07). */
  autoAdd: { kind: "counting" as AutoAddKind, progress: 32, before: "counting" as AutoAddKind },
  /** Channel filters of the auto-add playlists, for "this channel" in the watch-page menu. */
  filters: {
    PLmusic: { mode: "deny", channels: ["Loud Ads Inc."] },
    PLtalks: null,
    PLkids: { mode: "allow", channels: ["Tiny Science", "Brick by Brick", "Kitchen Lab"] },
  } as Record<string, null | { mode: "allow" | "deny"; channels: string[] }>,
  /** The video the watch page is on when the page doesn't tell us (the mock). */
  watchVideo: { id: "mockwatch01", title: "How a compiler turns components into DOM updates", channel: "Byte Sized" } as Video,
  /** Fake membership: which playlists hold each video. */
  membership: { mockvideo01: ["PLhistory"], mockwatch01: ["PLhistory"] } as Record<string, string[]>,
  /** Per page view: buttons' own states. */
  queued: {} as Record<string, QueueState>,
  saving: {} as Record<string, SaveState>,
  /** Prototype simulation toggles. */
  sim: { hidden: false },
  /** Set while our picker or menu is open (keys are ignored then, ticket 08). */
  openLayer: null as null | "picker" | "watchMenu",
  /** Session memory (ticket 12/18): notices already shown, refusals shown once. */
  noticed: [] as FeatureId[],
  log: [] as string[],
});

export const playlistById = (id: string) => view.playlists.find((p) => p.id === id);
export const titleOf = (id: string) => playlistById(id)?.title ?? "a playlist that's no longer available";

/** Ticket 12: titles cut at 40 characters with "…". */
export const cut = (t: string, n = 40) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
export const q = (t: string) => `"${cut(t)}"`;
/** Ticket 12: "Music", "Music and Learning", "Music, Learning and Watch later", "Music, Learning and 2 more". */
export function listOf(ids: string[]) {
  const names = ids.map((id) => cut(titleOf(id)));
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function log(line: string) {
  view.log.unshift(`${new Date().toLocaleTimeString()} ${line}`);
  view.log.length = Math.min(view.log.length, 30);
}

/** For popovers.js, which carries its own Svelte copy: plain snapshots of the view, pushed on every change. */
export const snapshot = () => $state.snapshot(view);
export function watchView(fn: (snap: ReturnType<typeof snapshot>) => void): () => void {
  return $effect.root(() => {
    $effect(() => fn($state.snapshot(view)));
  });
}

/** A feature draws only while on and not "not working" (ticket 18: a feature that isn't working draws nothing). */
export const draws = (f: FeatureId) => !!view.features[f] && view.health[f] !== "broken";

/** Auto-add playlists for the watch page's video, with ticket 07's per-playlist goals. */
export const AUTO = [
  { id: "PLmusic", goal: 50 },
  { id: "PLtalks", goal: 90 },
  { id: "PLkids", goal: 50, filtered: true },
];
