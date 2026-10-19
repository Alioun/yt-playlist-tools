// THROWAWAY PROTOTYPE (ticket 27). Everything the mock holds, in memory. The behaviour follows ticket 26
// (with ticket 28's moves and ticket 08's keys); nothing here talks to YouTube Music.
import { SONGS, COLLECTIONS, MY_PLAYLISTS, MEMBERSHIP, INITIAL_QUEUE, AUTOPLAY, type Song } from "./data";
import type { ActionId, ButtonState, ClusterSettings, ItemView } from "../kit/model";
import { show, update, undoCurrent } from "../kit/toaster.svelte";
import { copy } from "../kit/copy";
import { PickerModel } from "../popovers/picker-model.svelte";
import { SvelteSet } from "svelte/reactivity";

export type Variant = "A" | "B" | "C";
export const VARIANTS: { id: Variant; name: string; blurb: string }[] = [
  { id: "A", name: "In the row (recommended)", blurb: "Buttons join the row on hover or focus, in its own layout, exactly like YouTube Music's like and ⋮: the title narrows, nothing is covered, nothing is reserved at rest." },
  { id: "B", name: "Reserved slot", blurb: "Ticket 09's idea: every row keeps an empty slot for the buttons, so nothing moves on hover, but every title is shorter all the time." },
  { id: "C", name: "Floating pill", blurb: "Ticket 26's first idea: a pill floats over the row's trailing end. Nothing reflows, but in narrow rows it covers the title." },
];

export type Scene = "home" | "search" | "album" | "playlist" | "playing" | "states";
export const SCENES: { id: Scene; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "album", label: "Album" },
  { id: "playlist", label: "Playlist" },
  { id: "playing", label: "Now playing" },
  { id: "states", label: "States sheet" },
];

interface QEntry {
  qid: string;
  songId: string;
  autoplay?: boolean;
}

const params = new URLSearchParams(location.search);
const flag = (k: string, d: boolean) => (params.has(k) ? params.get(k) !== "0" : d);

export const ui = $state({
  scene: (params.get("scene") as Scene) || "home",
  variant: (params.get("variant") as Variant) || "A",
  player: (params.get("player") as "classic" | "wiz") || "classic",
  fullscreen: flag("fullscreen", false),
  panel: flag("panel", true),
  chrome: flag("chrome", true),
  /** Force-show the cluster on one row for screenshots (the row key). */
  forceHover: params.get("hover") || "",
  forceFocus: params.get("focus") || "",
});

export const settings: ClusterSettings & { barSave: boolean; feedback: boolean; keysOn: boolean } = $state({
  buttons: {
    playNext: flag("b-playNext", true),
    addToQueue: flag("b-addToQueue", true),
    save: flag("b-save", false),
    like: flag("b-like", false),
    remove: flag("b-remove", false),
  },
  barSave: flag("barSave", false),
  quickSave: params.get("quickSave") === "none" ? null : { id: "pl-fav", title: "Favourites" },
  keys: { playNext: "Alt+N", addToQueue: "Alt+Q", save: "Alt+P", picker: "Alt+Shift+P", like: "Alt+L", remove: "Alt+R" },
  signedIn: flag("signedIn", true),
  casting: flag("casting", false),
  broken: {},
  feedback: true,
  keysOn: flag("keys", true),
});

export const sim = $state({
  failNext: false,
  slow: false,
  membershipUnknown: false,
  privateWindow: false,
  notWorking: flag("notWorking", false),
});

let qseq = 0;
const nq = () => `q${++qseq}`;
export const queue = $state({
  entries: [...INITIAL_QUEUE.map((songId) => ({ qid: nq(), songId })), ...AUTOPLAY.map((songId) => ({ qid: nq(), songId, autoplay: true }))] as QEntry[],
  current: 0,
});
export const liked = $state<Record<string, boolean>>({ s4: true });
export const membership = $state<Record<string, string[]>>(structuredClone(MEMBERSHIP));
export const states = $state<Record<string, ButtonState>>({});
/** Rows whose title is squeezed below 48 px while our buttons show (measured by SongRow). */
export const narrowRows = new SvelteSet<string>();
export const pointed = $state({ pointerKey: "", pointerAt: 0, focusKey: "", focusAt: 0, hoverKey: "" });

export const picker = $state({
  open: false,
  anchor: null as HTMLElement | { getBoundingClientRect(): DOMRect } | null,
  centred: false,
  returnFocus: null as HTMLElement | null,
  songId: "",
  model: null as PickerModel | null,
});

// ---------------------------------------------------------------------------------------------------------------
// Items

export function playingSong(): Song | null {
  const e = queue.entries[queue.current];
  return e ? SONGS[e.songId] : null;
}

/** The ItemView the itemInfo job would answer for a key. */
export function itemFor(key: string): ItemView | null {
  const [kind, rest] = key.split(":");
  if (kind === "row") {
    const songId = rest.split("@")[0];
    const s = SONGS[songId];
    return { key, kind: s.video ? "video" : "song", title: s.title, offered: offered("song"), hasOwnLike: true, liked: !!liked[songId], nameInTip: narrowRows.has(key) };
  }
  if (kind === "card" || kind === "header") {
    const c = COLLECTIONS[rest];
    return { key, kind: c.kind, title: c.title, offered: offered("collection"), count: c.songs.length };
  }
  if (kind === "q") {
    const i = queue.entries.findIndex((e) => e.qid === rest);
    if (i < 0) return null;
    const e = queue.entries[i];
    const s = SONGS[e.songId];
    return {
      key,
      kind: s.video ? "video" : "song",
      title: s.title,
      offered: { ...offered("song"), remove: !e.autoplay },
      hasOwnLike: false,
      liked: !!liked[e.songId],
      queue: { playing: i === queue.current, autoplay: e.autoplay },
    };
  }
  if (kind === "bar") {
    const s = playingSong();
    if (!s) return null;
    return { key, kind: "song", title: s.title, offered: offered("song"), hasOwnLike: true, liked: !!liked[s.id] };
  }
  return null;
}

/** YouTube Music's own ⋮ menu: Save and Like are sign-in prompts when signed out (they count as not offered). */
function offered(kind: "song" | "collection"): ItemView["offered"] {
  if (kind === "collection") return { playNext: true, addToQueue: true };
  return { playNext: true, addToQueue: true, save: settings.signedIn, like: settings.signedIn, remove: false };
}

export function songIdOf(key: string): string | null {
  const [kind, rest] = key.split(":");
  if (kind === "row") return rest.split("@")[0];
  if (kind === "q") return queue.entries.find((e) => e.qid === rest)?.songId ?? null;
  if (kind === "bar") return queue.entries[queue.current]?.songId ?? null;
  return null;
}

export const clusterSettings = (): ClusterSettings => ({
  ...settings,
  broken: sim.notWorking ? { playNext: true, addToQueue: true } : {},
});

// ---------------------------------------------------------------------------------------------------------------
// Effects

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => wait(sim.slow ? 1600 : 450);

function setState(key: string, a: ActionId, s: ButtonState, hold = 1500) {
  states[`${key}/${a}`] = s;
  if (s === "done" || s === "failed") setTimeout(() => states[`${key}/${a}`] === s && delete states[`${key}/${a}`], hold);
}
export const stateOf = (key: string): Partial<Record<ActionId, ButtonState>> =>
  Object.fromEntries(Object.entries(states).filter(([k]) => k.startsWith(key + "/")).map(([k, v]) => [k.split("/")[1], v]));

function failOnce() {
  if (!sim.failNext) return false;
  sim.failNext = false;
  return true;
}

function confirm(text: string, undo?: () => Promise<boolean>) {
  if (!settings.feedback) return;
  show({ kind: "confirm", text, action: undo ? { label: "Undo", run: undo, isUndo: true } : undefined });
}

/** Play next / Add to queue on a song, album or playlist (not a queue item: those move). */
async function insert(key: string, a: "playNext" | "addToQueue", viaKey: boolean) {
  const item = itemFor(key)!;
  if (settings.casting) return show({ kind: "neutral", text: copy.casting });
  const songIds = key.startsWith("card:") || key.startsWith("header:") ? COLLECTIONS[key.split(":")[1]].songs : [songIdOf(key)!];
  if (!viaKey || key !== "bar") setState(key, a, "busy");
  await latency();
  if (failOnce()) {
    setState(key, a, "failed");
    return show({ kind: "failure", text: copy.failQueue(item.title) });
  }
  const userEnd = queue.entries.findIndex((e) => e.autoplay);
  const empty = queue.entries.filter((e) => !e.autoplay).length === 0;
  const added = songIds.map((songId) => ({ qid: nq(), songId }));
  if (empty) {
    queue.entries.splice(0, 0, ...added);
    queue.current = 0;
    setState(key, a, "done");
    return confirm(copy.playing(item.title));
  }
  const at = a === "playNext" ? queue.current + 1 : userEnd < 0 ? queue.entries.length : userEnd;
  queue.entries.splice(at, 0, ...added);
  setState(key, a, "done");
  const block = songIds.length > 1 || item.kind === "album" || item.kind === "playlist" ? { count: item.count } : undefined;
  confirm(a === "playNext" ? copy.playNext(item.title, block) : copy.addToQueue(item.title, block), async () => {
    await wait(300);
    // Removes the inserted entries that are still waiting; one that already started stays (ticket 26).
    const cur = queue.entries[queue.current]?.qid;
    queue.entries = queue.entries.filter((e) => !added.some((x) => x.qid === e.qid) || e.qid === cur);
    queue.current = Math.max(0, queue.entries.findIndex((e) => e.qid === cur));
    return true;
  });
}

/** Ticket 28: Play next / Add to queue on a queue item move it; Undo moves it back. */
async function move(key: string, a: "playNext" | "addToQueue") {
  const qid = key.split(":")[1];
  const item = itemFor(key)!;
  if (settings.casting) return show({ kind: "neutral", text: copy.casting });
  const from = queue.entries.findIndex((e) => e.qid === qid);
  if (from === queue.current) return show({ kind: "neutral", text: copy.playingAlready });
  if (queue.entries[from].autoplay) return show({ kind: "neutral", text: copy.autoplayCantMove });
  const userEnd = (() => {
    const i = queue.entries.findIndex((e) => e.autoplay);
    return i < 0 ? queue.entries.length : i;
  })();
  const to = a === "playNext" ? (from > queue.current ? queue.current + 1 : queue.current) : userEnd - 1;
  if (to === from) return show({ kind: "neutral", text: a === "playNext" ? copy.alreadyNext(item.title) : copy.alreadyEnd(item.title) });
  setState(key, a, "busy");
  await latency();
  if (failOnce()) {
    setState(key, a, "failed");
    return show({ kind: "failure", text: copy.failMove(item.title) });
  }
  const cur = queue.entries[queue.current].qid;
  const [e] = queue.entries.splice(from, 1);
  queue.entries.splice(to, 0, e);
  queue.current = queue.entries.findIndex((x) => x.qid === cur);
  // No done state: the item has moved away from under the pointer (YouTube Music re-renders the rows). The toast confirms.
  delete states[`${key}/${a}`];
  confirm(a === "playNext" ? copy.movedNext(item.title) : copy.movedEnd(item.title), async () => {
    await wait(300);
    const i = queue.entries.findIndex((x) => x.qid === qid);
    if (i < 0) return false;
    const cur2 = queue.entries[queue.current].qid;
    const [m] = queue.entries.splice(i, 1);
    queue.entries.splice(Math.min(from, queue.entries.length), 0, m);
    queue.current = queue.entries.findIndex((x) => x.qid === cur2);
    return true;
  });
}

async function remove(key: string) {
  const qid = key.split(":")[1];
  const item = itemFor(key)!;
  const from = queue.entries.findIndex((e) => e.qid === qid);
  setState(key, "remove", "busy");
  await latency();
  if (failOnce()) {
    setState(key, "remove", "failed");
    return show({ kind: "failure", text: copy.failRemove(item.title) });
  }
  const cur = queue.entries[queue.current]?.qid;
  const [e] = queue.entries.splice(from, 1);
  queue.current = Math.max(0, queue.entries.findIndex((x) => x.qid === cur));
  confirm(copy.removed(item.title), async () => {
    await wait(300);
    const cur2 = queue.entries[queue.current]?.qid;
    queue.entries.splice(Math.min(from, queue.entries.length), 0, e);
    queue.current = Math.max(0, queue.entries.findIndex((x) => x.qid === cur2));
    return true;
  });
}

async function save(key: string, anchor: HTMLElement | null, viaKey: boolean) {
  const item = itemFor(key)!;
  const songId = songIdOf(key);
  if (!songId) return show({ kind: "neutral", text: copy.saveSongsOnly });
  if (!settings.signedIn) return show({ kind: "neutral", text: copy.signInSave });
  const target = settings.quickSave;
  if (!target) return openPicker(key, anchor, "choose");
  setState(key, "save", "busy");
  let pending: number | undefined;
  const slowTimer = viaKey && !anchor ? setTimeout(() => (pending = show({ kind: "pending", text: copy.saving(item.title, target.title) })), 1000) : undefined;
  await latency();
  clearTimeout(slowTimer);
  const out = (spec: Parameters<typeof show>[0]) => (pending !== undefined ? update(pending, spec) : show(spec));
  if (failOnce()) {
    setState(key, "save", "failed");
    return out({ kind: "failure", text: copy.failSave(item.title, target.title) });
  }
  const list = (membership[songId] ??= []);
  if (list.includes(target.id)) {
    setState(key, "save", "done");
    return out({ kind: "neutral", text: copy.alreadyIn(item.title, target.title) });
  }
  list.push(target.id);
  setState(key, "save", "done");
  if (!settings.feedback && pending === undefined) return;
  out({
    kind: "confirm",
    text: copy.saved(item.title, target.title),
    action: {
      label: "Undo",
      isUndo: true,
      run: async () => {
        await wait(300);
        membership[songId] = (membership[songId] ?? []).filter((x) => x !== target.id);
        return true;
      },
    },
  });
}

async function like(key: string, viaKey: boolean) {
  const songId = songIdOf(key);
  const item = itemFor(key);
  if (!songId || !item) return show({ kind: "neutral", text: copy.likeSongsOnly });
  if (!settings.signedIn) return show({ kind: "neutral", text: copy.signInLike });
  const before = !!liked[songId];
  setState(key, "like", "busy");
  await latency();
  if (failOnce()) {
    setState(key, "like", "failed");
    return show({ kind: "failure", text: copy.failLike(item.title) });
  }
  liked[songId] = !before;
  delete states[`${key}/like`];
  // No toast on click: the icon is the feedback. A key press does get one (ticket 26).
  if (viaKey)
    confirm(before ? copy.unliked(item.title) : copy.liked(item.title), async () => {
      await wait(250);
      liked[songId] = before;
      return true;
    });
}

export function act(key: string, a: ActionId, el: HTMLElement | null, viaKey = false) {
  const isQueue = key.startsWith("q:");
  // On the playing song (its queue item, or a key with nothing pointed at) Play next and Add to queue insert a copy,
  // as YouTube Music's own menu does; on any other queue item they move it (ticket 28).
  const playing = isQueue && queue.entries[queue.current]?.qid === key.slice(2);
  if (a === "playNext" || a === "addToQueue") return isQueue && !playing ? move(key, a) : insert(key, a, viaKey);
  if (a === "remove") return remove(key);
  if (a === "save") return save(key, el, viaKey);
  if (a === "like") return like(key, viaKey);
}

// ---------------------------------------------------------------------------------------------------------------
// The picker

export function preloadPicker() {
  // In the extension this injects popovers.js on hover intent (tickets 17 and 24). The mock has it loaded already.
}

export function openPicker(key: string, anchor: HTMLElement | { getBoundingClientRect(): DOMRect } | null, mode: "normal" | "choose" = "normal") {
  const songId = songIdOf(key);
  if (!songId) return show({ kind: "neutral", text: copy.saveSongsOnly });
  if (!settings.signedIn) return show({ kind: "neutral", text: copy.signInSave });
  const s = SONGS[songId];
  const m = new PickerModel({
    tick: async (id) => {
      await latency();
      if (failOnce()) return "failed";
      const list = (membership[songId] ??= []);
      if (list.includes(id)) return "already";
      list.push(id);
      return "added";
    },
    untick: async (id) => {
      await latency();
      if (failOnce()) return "failed";
      membership[songId] = (membership[songId] ?? []).filter((x) => x !== id);
      return "removed";
    },
    pin: (id) => {
      const p = m.rows.find((r) => r.id === id)!;
      settings.quickSave = { id, title: p.title };
    },
    create: async (title, privacy) => {
      await wait(700);
      if (failOnce()) return null;
      const id = `pl-${Date.now()}`;
      (membership[songId] ??= []).push(id);
      return { id, title, privacy, count: 1 };
    },
    chosen: (id) => {
      const p = m.rows.find((r) => r.id === id)!;
      if (!sim.privateWindow) settings.quickSave = { id, title: p.title };
      picker.open = false;
      show({
        kind: "confirm",
        text: sim.privateWindow ? copy.saved(s.title, p.title) : copy.savedFirst(s.title, p.title),
        action: { label: "Undo", isUndo: true, run: async () => ((membership[songId] = (membership[songId] ?? []).filter((x) => x !== id)), true) },
      });
    },
  });
  m.rows = MY_PLAYLISTS.map((p) => ({ ...p }));
  m.mode = mode;
  m.quickSaveId = settings.quickSave?.id ?? null;
  m.privateWindow = sim.privateWindow;
  m.song = { title: s.title, byline: `${s.artist} • ${s.album}`, art: s.art };
  m.membership = "loading";
  setTimeout(() => {
    if (sim.membershipUnknown) m.membership = "unknown";
    else {
      m.membership = "known";
      m.contains = Object.fromEntries((membership[songId] ?? []).map((id) => [id, true]));
    }
  }, 350);
  picker.model = m;
  picker.songId = songId;
  picker.centred = !anchor;
  picker.anchor = anchor ?? centredAnchor();
  picker.returnFocus = anchor instanceof HTMLElement ? (anchor.querySelector("button:last-of-type") as HTMLElement) : null;
  picker.open = true;
}

/** Ticket 26: opened by key with no button, the picker sits centred above the player. */
function centredAnchor() {
  return {
    getBoundingClientRect() {
      const bar = document.querySelector("[data-player-bar]")?.getBoundingClientRect();
      const y = bar ? bar.top : innerHeight;
      return new DOMRect(innerWidth / 2, y, 0, 0);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Keys (ticket 08's engine, simplified): Alt+N/Q/P/Shift+P/L/R and Alt+U.

/** The pointed-at item: pointer or keyboard focus, whichever moved last; else the playing song. */
export function pointedAt(): string {
  const p = pointed.pointerKey && pointed.pointerAt >= pointed.focusAt ? pointed.pointerKey : "";
  const f = pointed.focusKey && pointed.focusAt > pointed.pointerAt ? pointed.focusKey : "";
  return p || f || "bar";
}

export function onKey(e: KeyboardEvent) {
  if (!settings.keysOn || e.repeat || e.isComposing) return;
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.composedPath()[0] as HTMLElement;
  if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
  const k = e.key.toLowerCase();
  const map: Record<string, ActionId | "picker" | "undo"> = e.shiftKey ? { p: "picker" } : { n: "playNext", q: "addToQueue", p: "save", l: "like", r: "remove", u: "undo" };
  const action = map[k] ?? map[e.code.replace("Key", "").toLowerCase()];
  if (!action) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (action === "undo") return void undoCurrent();
  if (picker.open) return; // keys are off while the picker is open (ticket 26)
  const key = pointedAt();
  if (key === "bar" && !playingSong()) return show({ kind: "neutral", text: copy.nothingPlaying });
  if (sim.notWorking && (action === "playNext" || action === "addToQueue"))
    return show({ kind: "failure", text: copy.noticeKey(action === "playNext" ? "Play next" : "Add to queue", action === "playNext" ? "Alt+N" : "Alt+Q") });
  const item = itemFor(key);
  if (!item) return;
  if (action === "remove" && !key.startsWith("q:")) return show({ kind: "neutral", text: copy.pointAtQueue });
  if ((action === "save" || action === "like" || action === "picker") && (item.kind === "album" || item.kind === "playlist"))
    return show({ kind: "neutral", text: action === "like" ? copy.likeSongsOnly : copy.saveSongsOnly });
  const el = document.querySelector<HTMLElement>(`[data-cluster="${CSS.escape(key)}"]`);
  if (action === "picker") {
    const split = el?.querySelector<HTMLElement>(".split");
    return openPicker(key, split ?? null);
  }
  if (action === "save" && !settings.quickSave) return openPicker(key, el?.querySelector<HTMLElement>(".split") ?? null, "choose");
  act(key, action, el, true);
}
