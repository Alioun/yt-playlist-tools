import { isShortcutId } from "../model"
import type { Key, Settings } from "../model"
import { keysOverlap, sameTarget } from "./match"
import type { Binding, Conflict, ShortcutTarget, Site } from "./types"

const musicActions = ["next", "queue", "save", "picker", "like", "remove", "library", "mix", "album", "artist"] satisfies (keyof Settings["musicKeys"]["keys"])[]

function sitesFor(target: ShortcutTarget): readonly Site[] {
  if (target.kind === "picker") return ["www"]
  if (target.kind === "music") return ["music"]
  return ["www", "music"]
}

function allBindings(settings: Readonly<Settings>): Binding[] {
  const bindings: Binding[] = []
  if (settings.undoKey) bindings.push({ target: { kind: "undo" }, key: settings.undoKey })
  for (const shortcut of settings.shortcuts.list) {
    if (shortcut.key) bindings.push({ target: { kind: "playlist", id: shortcut.id }, key: shortcut.key })
  }
  if (settings.shortcuts.picker) bindings.push({ target: { kind: "picker" }, key: settings.shortcuts.picker })
  for (const action of musicActions) {
    const key = settings.musicKeys.keys[action]
    if (key) bindings.push({ target: { kind: "music", action }, key })
  }
  return bindings
}

export function bindingsForSite(settings: Readonly<Settings>, context: { site: Site; undoAvailable: boolean }): Binding[] {
  if (context.site === "music" && !settings.musicSection) return []
  const playlistsOn = settings.shortcuts.on && (context.site === "www" || settings.shortcuts.music)
  const musicOn = context.site === "music" && settings.musicKeys.on
  return allBindings(settings).filter(binding => {
    switch (binding.target.kind) {
      case "playlist": return playlistsOn
      case "picker": return context.site === "www" && playlistsOn
      case "music": return musicOn
      case "undo": return context.undoAvailable || playlistsOn || musicOn
    }
  })
}

export function findConflicts(settings: Readonly<Settings>, target: ShortcutTarget, key: Readonly<Key>): Conflict[] {
  const sites = sitesFor(target)
  return allBindings(settings).flatMap(binding => {
    if (sameTarget(target, binding.target) || !keysOverlap(key, binding.key)) return []
    const sharedSites = sitesFor(binding.target).filter(site => sites.includes(site))
    return sharedSites.length ? [{ target: binding.target, sites: sharedSites }] : []
  })
}

function setKey(settings: Readonly<Settings>, target: ShortcutTarget, key: Readonly<Key> | null): Settings {
  const value = key === null ? null : { ...key }
  switch (target.kind) {
    case "undo": return { ...settings, undoKey: value }
    case "picker": return { ...settings, shortcuts: { ...settings.shortcuts, picker: value } }
    case "music": return { ...settings, musicKeys: { ...settings.musicKeys, keys: { ...settings.musicKeys.keys, [target.action]: value } } }
    case "playlist": return {
      ...settings,
      shortcuts: { ...settings.shortcuts, list: settings.shortcuts.list.map(shortcut => shortcut.id === target.id ? { ...shortcut, key: value } : shortcut) }
    }
  }
}

export type Assignment =
  | { kind: "missing-target" }
  | { kind: "conflict"; conflicts: readonly Conflict[] }
  | { kind: "assigned"; settings: Settings; cleared: readonly ShortcutTarget[] }

export function assignKey(settings: Readonly<Settings>, target: ShortcutTarget, key: Readonly<Key> | null, replaceConflicts = false): Assignment {
  if (target.kind === "playlist" && !settings.shortcuts.list.some(shortcut => shortcut.id === target.id)) return { kind: "missing-target" }
  const conflicts = key === null ? [] : findConflicts(settings, target, key)
  if (conflicts.length && !replaceConflicts) return { kind: "conflict", conflicts }
  let next = setKey(settings, target, key)
  for (const conflict of conflicts) next = setKey(next, conflict.target, null)
  return { kind: "assigned", settings: next, cleared: conflicts.map(conflict => conflict.target) }
}

function alt(char: string, shift = false): Key {
  return { char, code: `Key${char.toUpperCase()}`, ctrl: false, alt: true, shift, meta: false }
}

const musicPresets = [
  { action: "next", key: alt("n") }, { action: "queue", key: alt("q") },
  { action: "save", key: alt("p") }, { action: "picker", key: alt("p", true) },
  { action: "like", key: alt("l") }, { action: "remove", key: alt("r") }
] satisfies { action: keyof Settings["musicKeys"]["keys"]; key: Key }[]

export type PresetRequest = { feature: "shortcuts"; shortcutId: string } | { feature: "music-keys" }
export type PresetConflict = { target: ShortcutTarget; key: Readonly<Key>; conflicts: readonly Conflict[] }
export type PresetResult = { kind: "applied" | "unchanged"; settings: Readonly<Settings>; blocked: readonly PresetConflict[] }

export function applyPresets(settings: Readonly<Settings>, request: PresetRequest): PresetResult {
  const blocked: PresetConflict[] = []
  if (request.feature === "shortcuts" ? settings.shortcuts.preset : settings.musicKeys.preset) {
    return { kind: "unchanged", settings, blocked }
  }
  let next: Readonly<Settings> = settings
  const offer = (target: ShortcutTarget, key: Key) => {
    const result = assignKey(next, target, key)
    if (result.kind === "conflict") blocked.push({ target, key: { ...key }, conflicts: result.conflicts })
    if (result.kind === "assigned") next = result.settings
  }
  if (request.feature === "shortcuts") {
    if (!isShortcutId(request.shortcutId) || settings.shortcuts.list.some(shortcut => shortcut.id === request.shortcutId)) {
      throw new TypeError("A new six-character shortcut ID is required")
    }
    if (settings.shortcuts.list.length >= 20) throw new RangeError("At most 20 playlist shortcuts are allowed")
    next = { ...next, shortcuts: { ...next.shortcuts, preset: true, list: [
      ...next.shortcuts.list, { id: request.shortcutId, key: null, label: "", watchLaterOnEveryAccount: true }
    ] } }
    offer({ kind: "playlist", id: request.shortcutId }, alt("w"))
    if (next.shortcuts.picker === null) offer({ kind: "picker" }, alt("p", true))
  } else {
    next = { ...next, musicKeys: { ...next.musicKeys, preset: true } }
    for (const preset of musicPresets) {
      if (next.musicKeys.keys[preset.action] === null) offer({ kind: "music", action: preset.action }, preset.key)
    }
  }
  return { kind: "applied", settings: next, blocked }
}
