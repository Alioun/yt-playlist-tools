// THROWAWAY PROTOTYPE (ticket 09). Local UI state and helpers for the mock YouTube pages.
import {
  app,
  tabSetup,
  toast,
  playlistTitle,
  saveBlockedMessage,
  saveVideo,
  ensureSetup,
  shortcutTarget,
  shortcutName,
  healthOf,
  maybeBreakageNotice,
  dismissToast,
} from "$lib/state.svelte";
import { accounts, watchVideo, shorts, type Video } from "$lib/data";

/** The video this tab is on: the watch page's, or the open Short (none on home). */
export const currentVideo = (): Video | null =>
  app.env.ytPage === "watch" ? watchVideo : app.env.ytPage === "shorts" ? shorts[0] : null;

export const yt = $state({
  /** Prototype aid: show our hover buttons on every card without hovering. */
  showHover: false,
  /** An open right-click menu. */
  menu: null as null | { kind: "youtube" | "browser"; x: number; y: number; title: string },
  /**
   * An open "Save to…" picker for a thumbnail. choose = no quick-save playlist yet: the pick saves and
   * becomes the quick-save playlist (tickets 12/26); otherwise it's a one-off save from the ▾ part.
   */
  picker: null as null | { video: Video; x: number; y: number; choose: boolean },
});

/** Ticket 12: a blocked explicit save answers with a failure toast and the way out. */
export function blockedToast(): boolean {
  const blocked = saveBlockedMessage();
  if (!blocked) return false;
  toast("youtube", blocked, app.env.signedIn ? "Reload" : "Sign in", { failed: true });
  return true;
}

/** Ticket 26's toast copy rule: titles cut at 40 characters. */
export const short = (t: string) => (t.length > 40 ? t.slice(0, 40) + "…" : t);

/** Quick-save's one-click target for this tab's account, or null (choose mode). */
export const quickSaveTarget = () => tabSetup()?.quickSave ?? null;

/** True when a save to this playlist will go through (for the button's done tick). */
export const willSave = (playlistId: string) => !saveBlockedMessage() && !app.marks[playlistId];

/** The first pick in choose mode: saves, and becomes the quick-save playlist. */
export function chooseQuickSave(video: Video, playlistId: string) {
  if (blockedToast()) return;
  ensureSetup(app.env.account).quickSave = playlistId;
  if (video.id === watchVideo.id && !app.watch.inPlaylists.includes(playlistId)) app.watch.inPlaylists.push(playlistId);
  toast("youtube", `Saved "${short(video.title)}" to ${playlistTitle(playlistId)}. One click now saves there.`, "Undo");
}

/** A playlist shortcut pressed on the watch page or a Short (ticket 08: Watch later can apply on every account). */
export function pressShortcut(id: string) {
  const sc = app.features.shortcuts.list.find((s) => s.id === id);
  const video = currentVideo();
  if (!sc) return;
  // Ticket 18: a feature that isn't working does nothing in this tab; its notice shows once.
  if (healthOf("shortcuts") === "broken") return maybeBreakageNotice("youtube");
  if (!video) return toast("youtube", "Open a video or point at a thumbnail to use a playlist shortcut.");
  if (blockedToast()) return;
  const target = shortcutTarget(app.env.account, sc);
  if (!target) {
    return toast(
      "youtube",
      `${shortcutName(sc)} has no playlist on ${accounts[app.env.account].name} yet. Choose one in the popup.`,
    );
  }
  saveVideo(target, video.title, "shortcuts");
}

/** The picker key (ticket 08): opens the playlist picker for the current video, like quick-save's ▾. */
export function pressPickerKey() {
  if (healthOf("shortcuts") === "broken") return maybeBreakageNotice("youtube");
  const video = currentVideo();
  if (!video) return toast("youtube", "Open a video or point at a thumbnail to use a playlist shortcut.");
  if (blockedToast()) return;
  // With no button under it, the picker opens near the top centre of the page.
  yt.picker = { video, x: Math.max(16, window.innerWidth / 2 - 300), y: 240, choose: false };
}

/** The undo key (ticket 08): runs the on-screen toast's Undo, then dismisses it. */
export function pressUndoKey() {
  const t = app.toasts.find((x) => x.site === "youtube" && x.action === "Undo");
  if (!t) return toast("youtube", "Nothing to undo.");
  t.onaction?.();
  dismissToast(t.id);
}
