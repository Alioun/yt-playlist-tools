import type { Key, Settings } from "../model"
import { findConflicts } from "../keys/bindings"
import type { ShortcutTarget } from "../keys/types"
import type { ConflictObservation } from "./key-settings"

export function keyForWire(key: Readonly<Key> | null): Key | null {
  return key === null ? null : { code: key.code, ctrl: key.ctrl, alt: key.alt, shift: key.shift, meta: key.meta, ...(key.char === undefined ? {} : { char: key.char }) }
}

export function keyAt(settings: Readonly<Settings>, target: ShortcutTarget): Readonly<Key> | null | undefined {
  switch (target.kind) {
    case "undo":
      return settings.undoKey
    case "picker":
      return settings.shortcuts.picker
    case "music":
      return settings.musicKeys.keys[target.action]
    case "playlist":
      return settings.shortcuts.list.find(row => row.id === target.id)?.key
  }
}
export function sameKey(left: Readonly<Key> | null | undefined, right: Readonly<Key> | null | undefined): boolean {
  return (
    left === right ||
    (!!left && !!right && left.code === right.code && left.char === right.char && left.ctrl === right.ctrl && left.alt === right.alt && left.shift === right.shift && left.meta === right.meta)
  )
}
export function conflictObservations(settings: Readonly<Settings>, target: ShortcutTarget, key: Readonly<Key>): ConflictObservation[] {
  return findConflicts(settings, target, key).flatMap(conflict => {
    const key = keyAt(settings, conflict.target)
    const value = key ? keyForWire(key) : null
    return value ? [{ target: conflict.target, key: value, sites: conflict.sites }] : []
  })
}
