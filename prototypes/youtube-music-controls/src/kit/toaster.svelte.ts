// THROWAWAY PROTOTYPE (ticket 27). The toaster's rules (tickets 12, 18, 26):
// - one toast at a time, the newest replaces the one showing;
// - 6 s, held while the pointer or focus is on it, and while the tab is hidden;
// - answers to a click or key show in fullscreen (YouTube Music fullscreens <html>, so the toast is already inside);
// - the sticky "not working" notice stays until dismissed, and waits while the tab is hidden or fullscreen;
// - Undo runs in place: busy, then the toast closes, or it reads "Couldn't undo.".
import type { IconName } from "./icons";

export type ToastKind = "confirm" | "neutral" | "failure" | "pending" | "notice";
export interface ToastAction {
  label: string;
  /** Resolve true when it worked. Undo closes the toast on success and says "Couldn't undo." on failure. */
  run: () => Promise<boolean> | boolean;
  isUndo?: boolean;
}
export interface ToastSpec {
  kind: ToastKind;
  text: string;
  action?: ToastAction;
  icon?: IconName;
}
interface Live extends ToastSpec {
  id: number;
  busy?: boolean;
}

export const toaster = $state({
  current: null as Live | null,
  /** A notice waiting for the tab to be visible and out of fullscreen. */
  waiting: null as Live | null,
  hover: false,
  focus: false,
  log: [] as string[],
});

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let remaining = 6000;
let startedAt = 0;
let isFullscreen = () => typeof document !== "undefined" && !!document.fullscreenElement;
/** The mock fakes fullscreen without the Fullscreen API. */
export function setFullscreenProbe(fn: () => boolean) {
  isFullscreen = fn;
}

const DURATION = 6000;

function arm() {
  clearTimeout(timer);
  const t = toaster.current;
  if (!t || t.kind === "notice" || t.kind === "pending" || t.busy) return;
  if (toaster.hover || toaster.focus || (typeof document !== "undefined" && document.hidden)) return;
  startedAt = Date.now();
  timer = setTimeout(() => dismiss(t.id), remaining);
}

function pause() {
  clearTimeout(timer);
  if (startedAt) remaining = Math.max(1200, remaining - (Date.now() - startedAt));
  startedAt = 0;
}

export function show(spec: ToastSpec): number {
  const t: Live = { ...spec, id: ++seq };
  toaster.log = [`${new Date().toLocaleTimeString()} · ${spec.kind}: ${spec.text}${spec.action ? ` [${spec.action.label}]` : ""}`, ...toaster.log].slice(0, 30);
  if (spec.kind === "notice" && (isFullscreen() || (typeof document !== "undefined" && document.hidden))) {
    toaster.waiting = t;
    return t.id;
  }
  toaster.current = t;
  remaining = DURATION;
  startedAt = 0;
  arm();
  return t.id;
}

/** Turn a pending toast ("Saving … to …") into its outcome, in place. */
export function update(id: number, spec: ToastSpec) {
  if (toaster.current?.id !== id) return show(spec);
  toaster.current = { ...spec, id };
  remaining = DURATION;
  arm();
  return id;
}

export function dismiss(id?: number) {
  if (id !== undefined && toaster.current?.id !== id) return;
  clearTimeout(timer);
  toaster.current = null;
  toaster.hover = false;
  toaster.focus = false;
}

export async function runAction() {
  const t = toaster.current;
  if (!t?.action || t.busy) return false;
  t.busy = true;
  pause();
  let ok = false;
  try {
    ok = await t.action.run();
  } catch {
    ok = false;
  }
  if (toaster.current?.id !== t.id) return ok;
  if (t.action.isUndo) {
    if (ok) dismiss(t.id);
    else {
      toaster.current = { kind: "failure", text: "Couldn't undo.", id: t.id };
      remaining = DURATION;
      arm();
    }
  } else {
    t.busy = false;
    dismiss(t.id);
  }
  return ok;
}

/** Alt+U (ticket 08): Undo on the toast showing in this tab, else "Nothing to undo.". */
export function undoCurrent() {
  const t = toaster.current;
  if (t?.action?.isUndo) return runAction();
  show({ kind: "neutral", text: "Nothing to undo." });
  return Promise.resolve(false);
}

export function setHover(v: boolean) {
  toaster.hover = v;
  v ? pause() : arm();
}
export function setFocus(v: boolean) {
  toaster.focus = v;
  v ? pause() : arm();
}

/** Call when visibility or fullscreen changes. */
export function environmentChanged() {
  if (typeof document !== "undefined" && document.hidden) return pause();
  if (toaster.waiting && !isFullscreen()) {
    const w = toaster.waiting;
    toaster.waiting = null;
    toaster.current = w;
  }
  arm();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", environmentChanged);
  document.addEventListener("fullscreenchange", environmentChanged);
}
