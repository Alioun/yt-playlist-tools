// THROWAWAY PROTOTYPE (ticket 14). The kit's toaster (ticket 17: site/kit/toaster/): the hand-written toast (ticket 24: ~3 KB, not svelte-sonner), shared later with
// YouTube Music's skin (ticket 27). Rules:
// - one on screen, bottom left; the newest replaces the one showing (ticket 12);
// - 6 s, and the timer runs only while the tab is visible and the pointer or focus isn't on the toast;
// - raised while the tab is hidden, it waits; only one waits: the newest failure, else the newest confirmation;
// - fullscreen: a toast answering the user's own click or key shows inside the fullscreen player; a toast the user
//   didn't ask for (auto-add, the "not working" notice) waits until fullscreen ends;
// - a sticky notice (ticket 18) stays until dismissed; a newer toast sets it aside, and it comes back afterwards.

export type Toast = {
  id: number;
  text: string;
  failure?: boolean;
  sticky?: boolean;
  /** Raised without a click or key: auto-add and notices. Carries the mark (look A) and waits out fullscreen. */
  unprompted?: boolean;
  /** "Saving … to …": turns into the outcome in place. */
  pending?: boolean;
  action?: { label: string; run: () => void };
  undo?: () => Promise<boolean>;
  undoing?: boolean;
};

const DURATION = 6000;
let seq = 0;

export const toasts = $state({
  current: null as Toast | null,
  held: null as Toast | null,
  behind: null as Toast | null,
  hover: false,
  focus: false,
  /** The element our layer lives in while a toast shows in fullscreen. */
  fullscreenEl: null as Element | null,
  /** Prototype: a stand-in for document.fullscreenElement (the mock's simulated fullscreen). */
  simFullscreen: null as Element | null,
  /** Prototype: pretend the tab is hidden. */
  simHidden: false,
  /** Toasts the user didn't ask for carry the extension's small mark (variant A; B drops it). */
  mark: true,
});

export const isHidden = () => toasts.simHidden || document.visibilityState === "hidden";
export const fullscreenEl = () => document.fullscreenElement ?? toasts.simFullscreen;

let timer: ReturnType<typeof setTimeout> | undefined;
let remaining = DURATION;
let startedAt = 0;

function stopTimer() {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
  remaining -= performance.now() - startedAt;
}

function runTimer() {
  stopTimer();
  const t = toasts.current;
  if (!t || t.sticky || t.pending || t.undoing) return;
  if (isHidden() || toasts.hover || toasts.focus) return;
  startedAt = performance.now();
  timer = setTimeout(() => dismiss(t.id), Math.max(remaining, 800));
}

function hold(t: Toast) {
  if (!toasts.held || t.failure || !toasts.held.failure) toasts.held = t;
}

function put(t: Toast) {
  const prev = toasts.current;
  if (prev?.sticky && !t.sticky) toasts.behind = prev;
  toasts.current = t;
  remaining = DURATION;
  toasts.fullscreenEl = fullscreenEl() && !t.unprompted ? fullscreenEl() : null;
  runTimer();
}

export function showToast(t: Omit<Toast, "id">): number {
  const toast: Toast = { id: ++seq, ...t };
  if (isHidden() || (fullscreenEl() && toast.unprompted)) hold(toast);
  else put(toast);
  return toast.id;
}

/** Turn a pending toast into its outcome in place (ticket 12's "Saving … to …"). */
export function updateToast(id: number, next: Omit<Toast, "id">) {
  if (toasts.current?.id === id) {
    toasts.current = { id, ...next };
    remaining = DURATION;
    runTimer();
  } else if (toasts.held?.id === id) toasts.held = { id, ...next };
}

export function dismiss(id: number) {
  if (toasts.current?.id !== id) return;
  stopTimer();
  toasts.current = null;
  toasts.fullscreenEl = null;
  if (toasts.behind) {
    const b = toasts.behind;
    toasts.behind = null;
    put(b);
  }
}

export async function runUndo(t: Toast) {
  if (!t.undo || t.undoing) return;
  toasts.current = { ...t, undoing: true };
  stopTimer();
  const ok = await t.undo();
  if (toasts.current?.id !== t.id) return;
  if (ok) dismiss(t.id);
  else updateToast(t.id, { text: "Couldn't undo.", failure: true });
}

/** Alt+U (ticket 08): Undo on the toast showing in this tab, else "Nothing to undo." */
export function undoKey() {
  const t = toasts.current;
  if (t?.undo) return runUndo(t);
  showToast({ text: "Nothing to undo." });
}

export function setHover(on: boolean) {
  toasts.hover = on;
  on ? stopTimer() : runTimer();
}
export function setFocus(on: boolean) {
  toasts.focus = on;
  on ? stopTimer() : runTimer();
}

/** Re-evaluate after the tab's visibility or fullscreen changes. */
export function recheck() {
  if (isHidden()) return stopTimer();
  const fs = fullscreenEl();
  if (fs && toasts.current?.unprompted) {
    stopTimer();
    hold(toasts.current);
    toasts.current = null;
  }
  if (!fs && toasts.fullscreenEl) toasts.fullscreenEl = null;
  if (toasts.held && !(fs && toasts.held.unprompted)) {
    const h = toasts.held;
    toasts.held = null;
    put(h);
    return;
  }
  runTimer();
}

export function listenPage(): () => void {
  document.addEventListener("visibilitychange", recheck);
  document.addEventListener("fullscreenchange", recheck);
  return () => {
    document.removeEventListener("visibilitychange", recheck);
    document.removeEventListener("fullscreenchange", recheck);
  };
}
