// THROWAWAY PROTOTYPE (ticket 09). The quick actions on the mock YouTube Music page, per ticket 26.
// Buttons and simulated keys call the same functions. State is the shared `app.music` plus the tab account's setup.
import {
  app,
  toast,
  tabSetup,
  ensureSetup,
  playlistTitle,
  healthOf,
  shortcutTarget,
  shortcutName,
  shortcutsOnMusic,
  accountName,
  type Shortcut,
} from "$lib/state.svelte";
import { musicKeyNames, type MusicKeyAction } from "$lib/ia";
import { songs, albums, type Song, type Album } from "$lib/data";
import { ui, openPicker, flash, keysOn } from "./store.svelte";

export type Item = { kind: "song"; song: Song } | { kind: "album"; album: Album };

/** click = a quick-action button; key = a quick-action shortcut; shortcut = a playlist shortcut (ticket 08). */
export type Source = "click" | "key" | "shortcut";

/** Titles in double quotes, cut at 40 characters (ticket 26 copy rule). */
export const q = (t: string) => `"${t.length > 40 ? t.slice(0, 39) + "…" : t}"`;

export const songById = (id: string) => songs.find((s) => s.id === id)!;

/** The songs YouTube Music's own menu would insert for an album or playlist. */
export function songsOf(album: Album): Song[] {
  if (album.kind === "Playlist") return songs.slice(0, 6);
  const own = songs.filter((s) => s.album === album.title);
  if (album.kind === "Single") return own;
  // Fake data is thin: pad albums to 5 tracks so the page and the toasts agree.
  return [...own, ...songs.filter((s) => s.album !== album.title)].slice(0, 5);
}

const STALE = "Your YouTube account changed in another tab. Reload this page to keep saving here.";

/** Confirmations obey the right feature's "Show feedback"; failures and hints always show (ticket 26). */
function confirm(source: Source, text: string, undo?: () => void) {
  const show =
    source === "key"
      ? app.features.musicShortcuts.toast
      : source === "shortcut"
        ? app.features.shortcuts.toast
        : app.features.musicQuickActions.toast;
  if (!show) return;
  hint(text, undo);
}

function hint(text: string, undo?: () => void, failed = false) {
  toast("music", text, undo ? "Undo" : undefined, { failed, onaction: undo });
}

/** Runs a toast's action (Undo, Details, …) and closes it (ticket 26: the toast closes once Undo succeeds). */
export function runAction(toastId: number) {
  const t = app.toasts.find((x) => x.id === toastId);
  app.toasts = app.toasts.filter((x) => x.id !== toastId);
  t?.onaction?.();
}

function itemSongs(item: Item): Song[] {
  return item.kind === "song" ? [item.song] : songsOf(item.album);
}

function blockedQueue(): boolean {
  if (app.env.casting) {
    hint("Not available while casting");
    return true;
  }
  return false;
}

function insert(item: Item, at: "next" | "end", source: Source, busyKey?: string) {
  if (blockedQueue()) return;
  const list = itemSongs(item).map((s) => s.id);
  const m = app.music;
  if (m.queue.length === 0) {
    m.queue = [...list];
    m.nowPlaying = list[0];
    if (busyKey) flash(busyKey);
    return confirm(source, `Playing ${q(songById(list[0]).title)}`);
  }
  const pos = at === "next" ? m.queue.indexOf(m.nowPlaying) + 1 : m.queue.length;
  m.queue.splice(pos, 0, ...list);
  if (busyKey) flash(busyKey);
  const undo = () => {
    // Remove the inserted block if it's still where we put it.
    const same = list.every((id, i) => m.queue[pos + i] === id);
    if (same) m.queue.splice(pos, list.length);
  };
  const what =
    item.kind === "song" ? q(item.song.title) : `${list.length} songs from ${q(item.album.title)}`;
  if (at === "next") confirm(source, `${what} will play next`, undo);
  else confirm(source, `Added ${what} to the queue`, undo);
}

export const playNext = (item: Item, source: Source = "click", busyKey?: string) => insert(item, "next", source, busyKey);
export const addToQueue = (item: Item, source: Source = "click", busyKey?: string) => insert(item, "end", source, busyKey);

/** Remove one entry (by queue position) from the queue. */
export function removeFromQueue(index: number, source: Source = "click", busyKey?: string) {
  const m = app.music;
  const id = m.queue[index];
  if (!id) return hint("Point at a song in the queue to remove it");
  m.queue.splice(index, 1);
  if (busyKey) flash(busyKey);
  confirm(source, `Removed ${q(songById(id).title)} from the queue`, () => m.queue.splice(index, 0, id));
}

function saveBlocked(what: "save" | "like"): boolean {
  if (!app.env.signedIn) {
    hint(what === "save" ? "Sign in to YouTube Music to save songs" : "Sign in to YouTube Music to like songs");
    return true;
  }
  if (app.env.staleTab) {
    hint(STALE, undefined, true);
    return true;
  }
  return false;
}

function addTo(song: Song, playlistId: string, source: Source, suffix = "") {
  const m = app.music;
  const list = (m.inPlaylists[song.id] ??= []);
  if (list.includes(playlistId)) return hint(`${q(song.title)} is already in ${playlistTitle(playlistId)}`);
  list.push(playlistId);
  confirm(source, `Saved ${q(song.title)} to ${playlistTitle(playlistId)}${suffix}`, () => {
    const l = m.inPlaylists[song.id];
    const i = l.indexOf(playlistId);
    if (i >= 0) l.splice(i, 1);
  });
}

/** The main part of the Save split button: one click to the quick-save playlist, else choose mode. */
export function save(song: Song, source: Source = "click", anchor: HTMLElement | null = null, busyKey?: string) {
  if (saveBlocked("save")) {
    if (busyKey) flash(busyKey, "failed");
    return;
  }
  const target = tabSetup()?.musicQuickSave;
  if (!target) return openPicker(song.id, true, anchor);
  if (busyKey) flash(busyKey);
  addTo(song, target, source);
}

/** The ▾ part: the picker for one-off saves. */
export function openSavePicker(song: Song, anchor: HTMLElement | null = null) {
  if (saveBlocked("save")) return;
  const choose = !tabSetup()?.musicQuickSave;
  openPicker(song.id, choose, anchor);
}

/** A pick in the picker. Choose mode: the pick saves and becomes the quick-save playlist. */
export function pickInPicker(playlistId: string) {
  const song = songById(ui.picker.songId);
  if (ui.picker.choose) {
    if (!app.env.privateWindow) ensureSetup(app.env.account).musicQuickSave = playlistId;
    ui.picker.open = false;
    return addTo(song, playlistId, "click", app.env.privateWindow ? "" : ". One click now saves there.");
  }
  const list = (app.music.inPlaylists[song.id] ??= []);
  const i = list.indexOf(playlistId);
  // Unticking removes the song (PROVISIONAL in ticket 26). Rows show their own result; no toast in the picker.
  if (i >= 0) list.splice(i, 1);
  else list.push(playlistId);
}

export function pinQuickSave(playlistId: string) {
  if (app.env.privateWindow) return;
  ensureSetup(app.env.account).musicQuickSave = playlistId;
}

/** Like toggles; a click shows no toast (the icon is the feedback), a key does. */
export function like(song: Song, source: Source = "click", busyKey?: string) {
  if (saveBlocked("like")) {
    if (busyKey) flash(busyKey, "failed");
    return;
  }
  const m = app.music;
  const was = m.liked.includes(song.id);
  if (was) m.liked = m.liked.filter((x) => x !== song.id);
  else m.liked.push(song.id);
  if (source === "key") {
    confirm(source, `${was ? "Unliked" : "Liked"} ${q(song.title)}`, () => {
      if (was) m.liked.push(song.id);
      else m.liked = m.liked.filter((x) => x !== song.id);
    });
  }
}

// ---------- playlist shortcuts and the undo key on YouTube Music (ticket 08) ----------

/** A playlist shortcut pressed on YouTube Music: saves the pointed-at song, else the playing one. */
export function playlistShortcut(s: Shortcut, song: Song | null) {
  if (!shortcutsOnMusic()) return;
  if (!song) return hint("Nothing is playing");
  if (saveBlocked("save")) return;
  const target = shortcutTarget(app.env.account, s);
  if (!target) return hint(`${shortcutName(s)} has no playlist on ${accountName(app.env.account)} yet. Choose one in the popup.`);
  addTo(song, target, "shortcut");
}

/** The shared undo key: undoes the toast on screen, if it has an Undo. */
export function undoKey() {
  const t = app.toasts.find((x) => x.site === "music" && x.action === "Undo" && x.onaction);
  if (!t) return hint("Nothing to undo.");
  runAction(t.id);
}

// ---------- simulated keys (ticket 26: pointed-at item, else the playing song) ----------

export type KeySim = { label: string; run: () => void };

const playing = () => (app.music.queue.length ? songById(app.music.nowPlaying) : null);

/** Ticket 18: while YouTube Music's internals are broken, quick-action keys answer with the failure toast. */
function quickKey(action: MusicKeyAction, fn: () => void) {
  return () => {
    if (!keysOn()) return;
    if (healthOf("musicQuickActions") === "broken" || healthOf("musicShortcuts") === "broken") {
      const name = musicKeyNames[action].replace(/ \(.*\)$/, "");
      const key = app.features.musicShortcuts.keys[action];
      return hint(`${name}${key ? ` (${key})` : ""} isn't working right now because YouTube Music changed something. Use its ⋮ menu for now.`, undefined, true);
    }
    fn();
  };
}

export function keySims(): KeySim[] {
  const k = app.features.musicShortcuts.keys;
  const smallFires = albums.find((a) => a.title === "Small Fires")!;
  const paper = songById("m2");
  const onPlaying = (fn: (s: Song) => void) => () => {
    const s = playing();
    if (!s) return hint("Nothing is playing");
    fn(s);
  };
  return [
    { label: `${k.save}, pointer on nothing: saves the playing song`, run: quickKey("save", onPlaying((s) => save(s, "key"))) },
    { label: `${k.savePicker}, pointer on nothing: the picker, centred`, run: quickKey("savePicker", onPlaying((s) => openSavePicker(s, null))) },
    { label: `${k.addToQueue}, pointer on ${q(paper.title)}`, run: quickKey("addToQueue", () => addToQueue({ kind: "song", song: paper }, "key")) },
    {
      label: `${k.playNext}, pointer on the ${q(smallFires.title)} card`,
      run: quickKey("playNext", () => playNext({ kind: "album", album: smallFires }, "key")),
    },
    { label: `${k.like}, pointer on nothing: likes the playing song`, run: quickKey("like", onPlaying((s) => like(s, "key"))) },
    {
      label: `${k.like}, pointer on the ${q(smallFires.title)} card`,
      run: quickKey("like", () => hint("Like works on songs, not albums or playlists")),
    },
    { label: `${k.remove}, pointer on nothing`, run: quickKey("remove", () => hint("Point at a song in the queue to remove it")) },
  ];
}

/** Playlist shortcuts (from YouTube) and the undo key, as pressed on YouTube Music. */
export function shortcutSims(): KeySim[] {
  const paper = songById("m2");
  const sims: KeySim[] = [];
  if (shortcutsOnMusic()) {
    for (const s of app.features.shortcuts.list.filter((x) => x.key).slice(0, 3)) {
      sims.push({ label: `${s.key}, pointer on ${q(paper.title)}`, run: () => playlistShortcut(s, paper) });
    }
    const first = app.features.shortcuts.list.find((x) => x.key);
    if (first) sims.push({ label: `${first.key}, pointer on nothing: the playing song`, run: () => playlistShortcut(first, playing()) });
  }
  if (app.undoKey && (shortcutsOnMusic() || keysOn())) sims.push({ label: `Press ${app.undoKey} (undo)`, run: undoKey });
  return sims;
}
