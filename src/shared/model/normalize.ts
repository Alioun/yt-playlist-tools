import { decodeFilter } from "./decodeFilter"
import { decodeSettings } from "./decodeSettings"
import { decodeSetup } from "./decodeSetup"
import type { Filter, Settings, Setup } from "./types"

function cut(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("")
}

export function normalizeSettingsForWrite(settings: Settings): Settings {
  const value = decodeSettings(settings)
  return {
    ...value,
    shortcuts: { ...value.shortcuts, list: value.shortcuts.list.map(shortcut => ({ ...shortcut, label: cut(shortcut.label.trim(), 40).trim() })) }
  }
}

export function normalizeFilterForWrite(filter: Filter): Filter {
  const value = decodeFilter(filter)
  return {
    ...value,
    channels: value.channels.map(channel => {
      const result = channel.slice() as Filter["channels"][number]
      result[1] = cut(channel[1], 100)
      if (channel[2] !== undefined) result[2] = cut(channel[2], 30)
      else if (result.length === 3) result.pop()
      return result
    })
  }
}

export type SetupContext = {
  shortcutIds: ReadonlySet<string>
  additionalChosenPlaylists?: ReadonlySet<string>
}

export function normalizeSetupForWrite(setup: Setup, context: SetupContext): Setup {
  const value = decodeSetup(setup)
  const targets = Object.fromEntries(Object.entries(value.targets).filter(([id]) => context.shortcutIds.has(id)))
  const playlists = new Set(context.additionalChosenPlaylists)
  for (const entry of value.autoAdd) playlists.add(entry.pl)
  for (const playlist of Object.values(targets)) playlists.add(playlist)
  for (const playlist of [value.quickSave, value.musicSave, value.gather]) {
    if (playlist !== null) playlists.add(playlist)
  }
  const label = value.label === null ? null : {
    ...value.label, name: cut(value.label.name, 100),
    ...(value.label.handle === undefined ? {} : { handle: cut(value.label.handle, 30) })
  }
  return {
    ...value, label, targets,
    marks: Object.fromEntries(Object.entries(value.marks).filter(([playlist]) => playlists.has(playlist)))
  }
}

export function isSetupEmpty(setup: Setup, hasKeptFilters: boolean): boolean {
  return !hasKeptFilters && setup.autoAdd.length === 0 && Object.keys(setup.targets).length === 0 &&
    setup.quickSave === null && setup.musicSave === null && setup.gather === null
}
