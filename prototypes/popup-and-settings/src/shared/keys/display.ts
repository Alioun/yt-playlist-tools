// THROWAWAY PROTOTYPE (ticket 15). Keys shown in each platform's style (ticket 08): macOS uses ⌃⌥⇧⌘ ("⌥⇧P");
// elsewhere Ctrl+Alt+Shift+Win (Super on Linux)+Key, in that order ("Alt+Shift+P").
export type Os = "mac" | "windows" | "linux";

const order = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const mac: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };

/** "Alt+Shift+P" -> ["Alt", "Shift", "P"] (or ["⌥", "⇧", "P"] on macOS). Empty for no key. */
export function keyParts(key: string, os: Os): string[] {
  if (!key) return [];
  const parts = key.split("+");
  // "Alt+Shift" (modifiers still held while recording) has no key yet.
  const k = (order as readonly string[]).includes(parts[parts.length - 1]) ? null : parts.pop()!;
  const mods = order.filter((m) => parts.includes(m));
  const tail = k === null ? [] : [k];
  if (os === "mac") return [...mods.map((m) => mac[m]), ...tail];
  return [...mods.map((m) => (m === "Meta" ? (os === "linux" ? "Super" : "Win") : m)), ...tail];
}

/** One string, for copy: "Alt+Shift+P" or "⌥⇧P". */
export const keyText = (key: string, os: Os) => (os === "mac" ? keyParts(key, os).join("") : keyParts(key, os).join("+"));

/** Builds our stored form from a keydown. */
export function keyFromEvent(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  // Character first for plain letters and digits (ticket 08), else the key's name.
  let k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key;
  const names: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", " ": "Space", PageDown: "Page Down", PageUp: "Page Up" };
  k = names[k] ?? (k.length === 1 ? k.toUpperCase() : k);
  return [...mods, k].join("+");
}

/** Ticket 08's built-in clash notes: YouTube's, YouTube Music's and the browsers' own keys. */
export function clashNote(key: string, browser: "chrome" | "firefox"): string | null {
  const yt: Record<string, string> = { K: "Play/pause", J: "Back 10 seconds", L: "Forward 10 seconds", M: "Mute", F: "Full screen", C: "Captions", I: "Miniplayer", T: "Theatre mode" };
  const ytm: Record<string, string> = { Q: "Toggle queue", J: "Next song", K: "Previous song", L: "Seek forward", "+": "Volume up", Space: "Play/pause" };
  const chrome: Record<string, string> = { "Alt+D": "go to the address bar", "Ctrl+D": "bookmark the page", "Ctrl+S": "save the page", "Alt+E": "open Chrome's menu", F5: "reload" };
  const firefox: Record<string, string> = { "Ctrl+D": "bookmark the page", "Ctrl+S": "save the page", "Alt+H": "open the Help menu", F5: "reload" };
  if (yt[key]) return `YouTube uses ${key} for ${yt[key]}. This shortcut replaces it on YouTube.`;
  if (ytm[key]) return `YouTube Music uses ${key} for ${ytm[key]}. This shortcut replaces it on YouTube Music.`;
  const b = browser === "chrome" ? chrome : firefox;
  if (b[key]) return `${browser === "chrome" ? "Chrome" : "Firefox"} uses ${key} to ${b[key]}. This shortcut replaces it on YouTube pages.`;
  return null;
}
