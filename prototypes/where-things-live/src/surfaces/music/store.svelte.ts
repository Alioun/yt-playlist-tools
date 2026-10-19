// THROWAWAY PROTOTYPE (ticket 09). Local UI state for the mock YouTube Music page.
import { app, blockReason, healthOf } from "$lib/state.svelte";
import type { MusicButton } from "$lib/ia";

export type MusicPage = "home" | "album" | "playing";

export const ui = $state({
  page: "home" as MusicPage,
  /** Classic player bar, or the A/B-tested layout without one (ticket 21). */
  playerBar: true,
  /** Show hover buttons without hovering (for screenshots). */
  showAll: false,
  /** Button state: key -> busy | done | failed. */
  busy: {} as Record<string, "busy" | "done" | "failed">,
  /** The playlist picker. */
  picker: {
    open: false,
    songId: "",
    /** Choose mode: no quick-save playlist yet; the pick becomes it. */
    choose: false,
    /** Position inside the page, or null = centred above the player (opened by a key). */
    at: null as { x: number; y: number } | null,
  },
  /** The page element, to anchor the picker. */
  pageEl: null as HTMLElement | null,
});

/** The YouTube Music section switch and nothing blocking: otherwise nothing of ours is on the page. */
/**
 * blockReason covers consent, the section switch and music.youtube.com access (ticket 10).
 * Ticket 18: when YouTube Music changed what quick actions rely on, their buttons aren't drawn either.
 */
export const musicOn = () => blockReason("musicQuickActions") === null && healthOf("musicQuickActions") !== "broken";

/** Whether one inline button is drawn (ticket 26: Save and Like not drawn signed out). */
export function buttonOn(b: MusicButton): boolean {
  const qa = app.features.musicQuickActions;
  if (!musicOn() || !qa.on || !qa.buttons[b]) return false;
  if ((b === "save" || b === "like") && !app.env.signedIn) return false;
  return true;
}

/**
 * Width of a row's trailing slot: the duration, or our buttons on hover, whichever is wider.
 * Reserved up front so the buttons never cover the title and nothing reflows on hover (ticket 26).
 */
export function slotWidth(context: "row" | "queue", allowLike = true): number {
  const w: [boolean, number][] =
    context === "queue"
      ? [
          [buttonOn("save"), 54],
          [buttonOn("like"), 32],
          [buttonOn("remove"), 32],
        ]
      : [
          [buttonOn("playNext"), 32],
          [buttonOn("addToQueue"), 32],
          [buttonOn("save"), 54],
          [allowLike && buttonOn("like"), 32],
        ];
  const on = w.filter(([v]) => v).map(([, px]) => px);
  return Math.max(48, on.reduce((a, b) => a + b, 0) + Math.max(0, on.length - 1) * 4 + 8);
}

export const playerBarSaveOn = () =>
  musicOn() && app.features.musicQuickActions.on && app.features.musicQuickActions.playerBarSave && app.env.signedIn;

export const keysOn = () => blockReason("musicShortcuts") === null && app.features.musicShortcuts.on;

export function flash(key: string, result: "done" | "failed" = "done") {
  ui.busy[key] = "busy";
  setTimeout(() => {
    ui.busy[key] = result;
    setTimeout(() => delete ui.busy[key], 1500);
  }, 350);
}

/** Opens the picker anchored under an element (or centred when el is null). */
export function openPicker(songId: string, choose: boolean, el: HTMLElement | null) {
  let at: { x: number; y: number } | null = null;
  if (el && ui.pageEl) {
    const r = el.getBoundingClientRect();
    const p = ui.pageEl.getBoundingClientRect();
    const width = 300;
    const height = 380;
    let x = r.right - p.left - width;
    let y = r.bottom - p.top + 6;
    if (x < 8) x = 8;
    if (y + height > p.height - 8) y = Math.max(8, r.top - p.top - height - 6);
    at = { x, y };
  }
  ui.picker = { open: true, songId, choose, at };
}

export function closePicker() {
  ui.picker.open = false;
}
