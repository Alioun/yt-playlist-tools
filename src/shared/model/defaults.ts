import type { Device, Filter, Settings, Setup } from "./types"

export function defaultSettings(): Settings {
  return {
    theme: "system",
    undoKey: { char: "u", code: "KeyU", ctrl: false, alt: true, shift: false, meta: false },
    autoAdd: { on: false, feedback: true, pct: 50, toolbarTick: true, toolbarPaused: true },
    shortcuts: { on: false, feedback: true, music: true, preset: false, picker: null, list: [] },
    quickSave: { on: false, feedback: true, shortsShelves: false },
    queueButton: { on: false, feedback: true },
    watchButton: { on: false, feedback: true, shorts: false },
    cardMenu: { on: false, keepLinkMenu: false },
    browserMenu: { on: false, feedback: true },
    musicSection: true,
    musicActions: {
      on: false, feedback: true, preset: false,
      buttons: { next: true, queue: true, save: false, like: false, remove: false, bar: false,
        library: false, mix: false, album: false, artist: false }
    },
    musicKeys: {
      on: false, feedback: true, preset: false,
      keys: { next: null, queue: null, save: null, picker: null, like: null, remove: null,
        library: null, mix: null, album: null, artist: null }
    },
    anyTabKeys: { on: false, feedback: true },
    gather: {
      on: false, feedback: true, to: "player", order: "newest", close: false,
      auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 }
    }
  }
}

export function defaultSetup(): Setup {
  return { label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {} }
}

export function defaultFilter(): Filter {
  return { mode: "deny", on: false, channels: [] }
}

export function defaultDevice(id: string): Device {
  if (typeof id !== "string" || id.length === 0) throw new TypeError("A device ID is required")
  return {
    id, consent: null, syncOn: false, upgradeNote: null, claimNotice: null, lastAccount: null,
    newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: false
  }
}

export const defaults = {
  settings: defaultSettings,
  setup: defaultSetup,
  filter: defaultFilter,
  device: defaultDevice
}
