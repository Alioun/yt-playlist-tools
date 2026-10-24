import type { Key, UpgradeDetails } from "../../shared/model"
import { isKey } from "../../shared/model"
import { shortcutWarnings } from "../../shared/keys"
import type { BrowserCommand, Platform, ShortcutWarning } from "../../shared/keys"

const namedKeys = [
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  "Delete", "Insert", "Backspace", "Enter", "Space", "CapsLock", "NumLock", "ScrollLock",
  "Pause", "PrintScreen", "ContextMenu", "Help", "Convert", "KanaMode", "Lang1", "Lang2", "Lang3",
  "Lang4", "Lang5", "NonConvert", "BrowserBack", "BrowserFavorites", "BrowserForward", "BrowserHome",
  "BrowserRefresh", "BrowserSearch", "BrowserStop", "Eject", "LaunchApp1", "LaunchApp2", "LaunchMail",
  "MediaPlayPause", "MediaSelect", "MediaStop", "MediaTrackNext", "MediaTrackPrevious", "Power", "Sleep",
  "WakeUp", "AudioVolumeDown", "AudioVolumeMute", "AudioVolumeUp", "Again", "Copy", "Cut", "Find", "Open",
  "Paste", "Props", "Select", "Undo", "Abort", "Resume", "Suspend", "Turbo"
]
const modifierNames = ["Control", "Alt", "Shift", "Meta"]

function convert(raw: string): Key | null {
  const tokens = raw.split("+")
  const last = tokens.pop() ?? ""
  if (tokens.some(token => !modifierNames.includes(token))) return null
  const held = new Set(tokens)
  const modifiers = { ctrl: held.has("Control"), alt: held.has("Alt"), shift: held.has("Shift"), meta: held.has("Meta") }
  if (modifiers.ctrl && modifiers.alt) return null
  let code: string | undefined
  let char: string | undefined
  if (/^[a-z]$/i.test(last)) {
    char = last.toLowerCase()
    code = `Key${last.toUpperCase()}`
  } else if (/^[0-9]$/.test(last)) {
    char = last
    code = `Digit${last}`
  } else if (last === " ") code = "Space"
  else if (/^F(?:[1-9]|1[0-2])$/i.test(last)) code = last.toUpperCase()
  else code = namedKeys.find(name => name.toUpperCase() === last.toUpperCase())
  if (code === undefined || ((code === "Enter" || code === "Space") && held.size === 0)) return null
  const key = { code, ...(char === undefined ? {} : { char }), ...modifiers }
  return isKey(key) ? key : null
}

const warningIds: Readonly<Record<string, string>> = {
  "Play/pause": "play-pause", "Seek backward": "seek-backward", "Seek forward": "seek-forward",
  "Mute": "mute", "Fullscreen": "fullscreen", "Captions": "captions", "Miniplayer": "miniplayer",
  "Theater mode": "theater", "Increase volume": "volume-up", "Decrease volume": "volume-down",
  "Next video": "next-video", "Previous video": "previous-video", "Next song": "next-song",
  "Previous song": "previous-song", "Shuffle": "shuffle", "Repeat": "repeat", "Toggle queue": "queue",
  "Toggle queue / expanded player": "queue-player", "Search": "search", "Navigation sequence": "navigation",
  "Keyboard shortcuts": "keyboard-shortcuts", "Like current song": "like", "Dislike current song": "dislike",
  "Seek forward 1 s": "seek-forward-1s", "Seek backward 1 s": "seek-backward-1s",
  "bookmark this page": "bookmark", "save this page": "save-page", "go to the address bar": "address-bar",
  "reload this page": "reload", "open a browser menu": "browser-menu"
}

function warningId(warning: ShortcutWarning): string {
  switch (warning.kind) {
    case "command": return `command:${warning.command}`
    case "browser": return `browser:${warningIds[warning.action]}`
    case "site": return `site:${warning.site}:${warningIds[warning.action]}`
  }
}

export function legacyShortcut(raw: string, playlist: boolean, context: {
  platform: Platform
  commands: readonly BrowserCommand[]
}): UpgradeDetails["shortcut"] {
  const key = raw === "" ? null : convert(raw)
  const note = raw === "" ? playlist ? "no-key" : "none"
    : key === null ? "unconvertible"
    : !playlist ? "no-playlist"
    : key.ctrl ? "ctrl-never-fired" : "ok"
  const warning = key === null ? undefined : shortcutWarnings(key, { ...context, sites: ["www", "music"] })[0]
  return { raw, key, playlist, note, ...(warning === undefined ? {} : { clash: warningId(warning) }) }
}
