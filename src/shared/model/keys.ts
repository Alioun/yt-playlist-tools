import { checked, isRecord, object, optional, boolean, text } from "./codec"
import type { Key } from "./types"

const namedCodes = new Set([
  "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma", "Equal", "IntlBackslash", "IntlRo", "IntlYen",
  "Minus", "Period", "Quote", "Semicolon", "Slash", "Backspace", "CapsLock", "ContextMenu", "Enter", "Space", "Tab",
  "Convert", "KanaMode", "Lang1", "Lang2", "Lang3", "Lang4", "Lang5", "NonConvert", "Delete", "End", "Help", "Home",
  "Insert", "PageDown", "PageUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "NumLock", "Escape", "Fn", "FnLock",
  "PrintScreen", "ScrollLock", "Pause", "BrowserBack", "BrowserFavorites", "BrowserForward", "BrowserHome",
  "BrowserRefresh", "BrowserSearch", "BrowserStop", "Eject", "LaunchApp1", "LaunchApp2", "LaunchMail",
  "MediaPlayPause", "MediaSelect", "MediaStop", "MediaTrackNext", "MediaTrackPrevious", "Power", "Sleep", "WakeUp",
  "AudioVolumeDown", "AudioVolumeMute", "AudioVolumeUp", "Again", "Copy", "Cut", "Find", "Open", "Paste", "Props",
  "Select", "Undo", "Abort", "Resume", "Suspend", "Turbo", "Hyper", "Super"
])

function isPhysicalCode(raw: unknown): raw is string {
  return typeof raw === "string" && (namedCodes.has(raw) ||
    /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad(?:[0-9]|Add|Backspace|Clear|ClearEntry|Comma|Decimal|Divide|Enter|Equal|Hash|MemoryAdd|MemoryClear|MemoryRecall|MemoryStore|MemorySubtract|Multiply|ParenLeft|ParenRight|Star|Subtract))$/.test(raw))
}

export function isKey(raw: unknown): raw is Key {
  return isRecord(raw) && isPhysicalCode(raw.code) &&
    (raw.char === undefined || typeof raw.char === "string") &&
    typeof raw.ctrl === "boolean" && typeof raw.alt === "boolean" &&
    typeof raw.shift === "boolean" && typeof raw.meta === "boolean"
}

export const decodeKey = object<Key>({
  char: optional(text),
  code: checked(isPhysicalCode, "a physical non-modifier key code"),
  ctrl: boolean, alt: boolean, shift: boolean, meta: boolean
})
