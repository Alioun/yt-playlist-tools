import { boolean, checked, list, nullable, object, oneOf, text, DecodeError } from "./codec"
import { defaultSettings } from "./defaults"
import { decodeKey } from "./keys"
import type { Settings, Shortcut } from "./types"
import { isPercent, isShortcutId } from "./validation"

const base = defaultSettings()
const key = nullable(decodeKey)
const percent = checked(isPercent, "an integer percentage from 0 to 100")
const shortcut = object<Shortcut>({
  id: checked(isShortcutId, "a six-character shortcut ID"), key, label: text, watchLaterOnEveryAccount: boolean
})
const shortcuts = list(shortcut, 20)

const decode = object<Settings>({
  theme: oneOf("system", "light", "dark"), undoKey: key,
  autoAdd: object({ on: boolean, feedback: boolean, pct: percent, toolbarTick: boolean, toolbarPaused: boolean }, () => base.autoAdd),
  shortcuts: object({
    on: boolean, feedback: boolean, music: boolean, preset: boolean, picker: key,
    list: (raw, path) => {
      const entries = shortcuts(raw, path)
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new DecodeError(path ?? "settings.shortcuts.list", "unique shortcut IDs")
      return entries
    }
  }, () => base.shortcuts),
  quickSave: object({ on: boolean, feedback: boolean, shortsShelves: boolean }, () => base.quickSave),
  queueButton: object({ on: boolean, feedback: boolean }, () => base.queueButton),
  watchButton: object({ on: boolean, feedback: boolean, shorts: boolean }, () => base.watchButton),
  cardMenu: object({ on: boolean, keepLinkMenu: boolean }, () => base.cardMenu),
  browserMenu: object({ on: boolean, feedback: boolean }, () => base.browserMenu),
  musicSection: boolean,
  musicActions: object({
    on: boolean, feedback: boolean, preset: boolean,
    buttons: object({ next: boolean, queue: boolean, save: boolean, like: boolean, remove: boolean, bar: boolean,
      library: boolean, mix: boolean, album: boolean, artist: boolean }, () => base.musicActions.buttons)
  }, () => base.musicActions),
  musicKeys: object({
    on: boolean, feedback: boolean, preset: boolean,
    keys: object({ next: key, queue: key, save: key, picker: key, like: key, remove: key,
      library: key, mix: key, album: key, artist: key }, () => base.musicKeys.keys)
  }, () => base.musicKeys),
  anyTabKeys: object({ on: boolean, feedback: boolean }, () => base.anyTabKeys),
  gather: object({
    on: boolean, feedback: boolean, to: oneOf("player", "queue", "playlist"),
    order: oneOf("newest", "oldest", "english", "non-english", "left-to-right", "right-to-left", "shuffled"),
    close: boolean,
    auto: object({ unvisited: boolean, after: oneOf("1h", "1d", "1w"), background: boolean,
      count: boolean, n: oneOf(5, 10, 15, 20, 30, 50) }, () => base.gather.auto)
  }, () => base.gather)
}, defaultSettings)

export function decodeSettings(raw?: unknown): Settings {
  return decode(raw, "settings")
}
