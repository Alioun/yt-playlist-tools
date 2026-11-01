import {
  decodeFilter, decodeSettings, decodeSetup, isChannelId, isPlaylistId, isShortcutId,
  normalizeFilterForWrite, normalizeSettingsForWrite, normalizeSetupForWrite,
  type AutoAddPlaylist, type ChannelId, type Filter, type PlaylistId, type Settings, type Setup, type ShortcutId
} from "../model"
import { filterShape, project, settingsShape, setupShape } from "./shape"

export type FileSetup = Omit<Setup, "autoAdd" | "targets" | "quickSave" | "musicSave" | "gather" | "marks"> & {
  autoAdd: (Omit<AutoAddPlaylist, "pl"> & { pl: PlaylistId })[]
  targets: Record<ShortcutId, PlaylistId>
  quickSave: PlaylistId | null
  musicSave: PlaylistId | null
  gather: PlaylistId | null
  marks: Record<PlaylistId, "missing" | "full">
}
export type FileFilter = Omit<Filter, "channels"> & { channels: [id: ChannelId, title: string, handle?: string][] }

function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new TypeError("settings-file-identity")
  return value
}
function shortcut(value: string): ShortcutId {
  if (!isShortcutId(value)) throw new TypeError("settings-file-identity")
  return value
}
function channel(value: string): ChannelId {
  if (!isChannelId(value)) throw new TypeError("settings-file-identity")
  return value
}

export function settingsData(raw: unknown, strict: boolean): Settings {
  return normalizeSettingsForWrite(decodeSettings(project(settingsShape, raw, strict)))
}

export function setupData(raw: unknown, settings: Settings, strict: boolean): FileSetup {
  const decoded = decodeSetup(project(setupShape, raw, strict))
  const setup = normalizeSetupForWrite(decoded, {
    shortcutIds: new Set(settings.shortcuts.list.map(entry => entry.id)),
    additionalChosenPlaylists: new Set(settings.shortcuts.list.some(entry =>
      entry.watchLaterOnEveryAccount && !Object.hasOwn(decoded.targets, entry.id)) ? ["WL"] : [])
  })
  return {
    label: setup.label,
    autoAdd: setup.autoAdd.map(entry => ({ pl: playlist(entry.pl), takes: entry.takes,
      ...(entry.pct === undefined ? {} : { pct: entry.pct }) })),
    targets: Object.fromEntries(Object.entries(setup.targets).map(([id, pl]) => [shortcut(id), playlist(pl)])),
    quickSave: setup.quickSave === null ? null : playlist(setup.quickSave),
    musicSave: setup.musicSave === null ? null : playlist(setup.musicSave),
    gather: setup.gather === null ? null : playlist(setup.gather),
    marks: Object.fromEntries(Object.entries(setup.marks).map(([pl, mark]) => [playlist(pl), mark]))
  }
}

export function filterData(raw: unknown, strict: boolean): FileFilter {
  const filter = normalizeFilterForWrite(decodeFilter(project(filterShape, raw, strict)))
  return {
    mode: filter.mode, on: filter.on,
    channels: filter.channels.map(([id, title, handle]) => handle === undefined ? [channel(id), title] : [channel(id), title, handle])
  }
}
