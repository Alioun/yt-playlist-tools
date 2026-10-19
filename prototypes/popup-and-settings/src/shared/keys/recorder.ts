// THROWAWAY PROTOTYPE (ticket 15), shaped on ticket 17's `shared/keys` recorder: ticket 08's rules as a pure step
// function, so the popup, settings and onboarding record keys the same way.
import { keyFromEvent } from "./display";

export interface KeyFacts {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export type RecorderStep =
  | { kind: "wait"; held: string } // modifiers alone, or IME input: keep waiting, show what's held
  | { kind: "cancel"; moveFocus: boolean } // Esc keeps the old key; Tab cancels and moves focus
  | { kind: "refuse"; hint: string } // stays recording, with a hint
  | { kind: "key"; key: string };

const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS", "Hyper", "Super"]);

export function recorder(e: KeyFacts): RecorderStep {
  if (e.isComposing || e.keyCode === 229) return { kind: "wait", held: "" };
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return { kind: "cancel", moveFocus: false };
  if (e.key === "Tab") return { kind: "cancel", moveFocus: true };
  const held = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean).join("+");
  if (MODIFIERS.has(e.key)) return { kind: "wait", held };
  if (e.ctrlKey && e.altKey) return { kind: "refuse", hint: "Ctrl+Alt can't be used: many keyboards type characters with it." };
  if ((e.key === "Enter" || e.key === " ") && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey)
    return { kind: "refuse", hint: "Enter and Space can't be used alone: they press buttons." };
  return { kind: "key", key: keyFromEvent(e as unknown as KeyboardEvent) };
}

/** Keys the browser keeps for itself never reach the page, so they can't be shortcuts (ticket 08). */
export function reserved(key: string, browser: "chrome" | "firefox"): boolean {
  const both = ["Ctrl+T", "Ctrl+N", "Ctrl+W", "Ctrl+Shift+W", "Ctrl+Shift+T", "Ctrl+Shift+N", "Alt+F4", "Ctrl+Tab", "Ctrl+Page Up", "Ctrl+Page Down"];
  const firefox = ["Ctrl+Shift+P"];
  return both.includes(key) || (browser === "firefox" && firefox.includes(key));
}
