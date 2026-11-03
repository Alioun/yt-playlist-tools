import { decodeSettings, isPercent, normalizeSettingsForWrite } from "../../shared/model"
import type { Settings } from "../../shared/model"

type Snapshot<T> = T extends object ? { readonly [P in keyof T]: Snapshot<T[P]> } : T

import type { SharedSettingChange, SharedOptionChange } from "../../shared/contracts/shared-settings"
export type { SharedSettingChange, SharedOptionChange, SharedOptionValues } from "../../shared/contracts/shared-settings"

export type SharedSettingResult =
  | { readonly kind: "unchanged" }
  | { readonly kind: "invalid"; readonly reason: "invalid-percentage" | "invalid-option" }
  | { readonly kind: "changed"; readonly settings: Settings }

export function changeSharedSetting(input: { readonly current: Snapshot<Settings>; readonly change: SharedSettingChange }): SharedSettingResult {
  const { current, change } = input
  if (change === null || typeof change !== "object") return { kind: "invalid", reason: "invalid-option" }
  let settings: Settings
  switch (change.kind) {
    case "theme":
      if (change.value !== "system" && change.value !== "light" && change.value !== "dark") return { kind: "invalid", reason: "invalid-option" }
      if (current.theme === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.theme = change.value
      break
    case "default-percentage":
      if (!isPercent(change.value)) return { kind: "invalid", reason: "invalid-percentage" }
      if (current.autoAdd.pct === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.autoAdd.pct = change.value
      break
    case "option":
      return changeOption(current, change)
    default: {
      const exhaustive: never = change
      void exhaustive
      return { kind: "invalid", reason: "invalid-option" }
    }
  }
  return { kind: "changed", settings: normalizeSettingsForWrite(settings) }
}

function changeOption(current: Snapshot<Settings>, change: SharedOptionChange): SharedSettingResult {
  let settings: Settings
  switch (change.field) {
    case "autoAdd.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.autoAdd.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.autoAdd.feedback = change.value
      break
    case "shortcuts.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.shortcuts.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.shortcuts.feedback = change.value
      break
    case "quickSave.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.quickSave.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.quickSave.feedback = change.value
      break
    case "queueButton.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.queueButton.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.queueButton.feedback = change.value
      break
    case "watchButton.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.watchButton.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.watchButton.feedback = change.value
      break
    case "browserMenu.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.browserMenu.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.browserMenu.feedback = change.value
      break
    case "musicActions.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.feedback = change.value
      break
    case "musicKeys.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicKeys.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicKeys.feedback = change.value
      break
    case "anyTabKeys.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.anyTabKeys.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.anyTabKeys.feedback = change.value
      break
    case "gather.feedback":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.feedback === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.feedback = change.value
      break
    case "autoAdd.toolbarTick":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.autoAdd.toolbarTick === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.autoAdd.toolbarTick = change.value
      break
    case "autoAdd.toolbarPaused":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.autoAdd.toolbarPaused === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.autoAdd.toolbarPaused = change.value
      break
    case "quickSave.shortsShelves":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.quickSave.shortsShelves === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.quickSave.shortsShelves = change.value
      break
    case "watchButton.shorts":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.watchButton.shorts === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.watchButton.shorts = change.value
      break
    case "cardMenu.keepLinkMenu":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.cardMenu.keepLinkMenu === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.cardMenu.keepLinkMenu = change.value
      break
    case "musicActions.buttons.next":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.next === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.next = change.value
      break
    case "musicActions.buttons.queue":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.queue === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.queue = change.value
      break
    case "musicActions.buttons.save":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.save === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.save = change.value
      break
    case "musicActions.buttons.like":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.like === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.like = change.value
      break
    case "musicActions.buttons.remove":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.remove === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.remove = change.value
      break
    case "musicActions.buttons.library":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.library === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.library = change.value
      break
    case "musicActions.buttons.mix":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.mix === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.mix = change.value
      break
    case "musicActions.buttons.album":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.album === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.album = change.value
      break
    case "musicActions.buttons.artist":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.artist === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.artist = change.value
      break
    case "musicActions.buttons.bar":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.musicActions.buttons.bar === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.musicActions.buttons.bar = change.value
      break
    case "gather.to":
      if (change.value !== "player" && change.value !== "queue" && change.value !== "playlist") return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.to === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.to = change.value
      break
    case "gather.order":
      if (
        change.value !== "newest" &&
        change.value !== "oldest" &&
        change.value !== "english" &&
        change.value !== "non-english" &&
        change.value !== "left-to-right" &&
        change.value !== "right-to-left" &&
        change.value !== "shuffled"
      )
        return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.order === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.order = change.value
      break
    case "gather.close":
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.close === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.close = change.value
      break
    case "gather.auto.unvisited":
    case "gather.auto.background":
    case "gather.auto.count": {
      if (typeof change.value !== "boolean") return { kind: "invalid", reason: "invalid-option" }
      const trigger = change.field === "gather.auto.unvisited" ? "unvisited" : change.field === "gather.auto.background" ? "background" : "count"
      if (current.gather.auto[trigger] === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.auto[trigger] = change.value
      break
    }
    case "gather.auto.after":
      if (change.value !== "1h" && change.value !== "1d" && change.value !== "1w") return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.auto.after === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.auto.after = change.value
      break
    case "gather.auto.n":
      if (change.value !== 5 && change.value !== 10 && change.value !== 15 && change.value !== 20 && change.value !== 30 && change.value !== 50) return { kind: "invalid", reason: "invalid-option" }
      if (current.gather.auto.n === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.gather.auto.n = change.value
      break
    default: {
      const exhaustive: never = change
      void exhaustive
      return { kind: "invalid", reason: "invalid-option" }
    }
  }
  return { kind: "changed", settings: normalizeSettingsForWrite(settings) }
}
