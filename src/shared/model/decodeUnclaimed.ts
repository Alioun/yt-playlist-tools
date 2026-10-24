import { checked, DecodeError, dictionary, list, natural, nullable, object, oneOf, optional } from "./codec"
import { decodeFilter } from "./decodeFilter"
import type { Unclaimed } from "./types"
import { isPlaylistId, isShortcutId } from "./validation"

const decode = object<Unclaimed>({
  from: oneOf("1.4.5", "1.5.0"),
  autoAdd: list((raw, path) => {
    if (!isPlaylistId(raw)) throw new DecodeError(path ?? "unclaimed.autoAdd", "a playlist ID")
    return raw
  }),
  shortcutPlaylist: nullable((raw, path) => {
    if (!isPlaylistId(raw)) throw new DecodeError(path ?? "unclaimed.shortcutPlaylist", "a playlist ID")
    return raw
  }),
  originalShortcutId: optional(checked(isShortcutId, "a six-character shortcut ID")),
  filters: dictionary(isPlaylistId, decodeFilter), at: natural
})

export function decodeUnclaimed(raw: unknown): Unclaimed {
  return decode(raw, "unclaimed")
}

export type StoredUnclaimed =
  | { kind: "absent" }
  | { kind: "consumed" }
  | { kind: "pending"; data: Unclaimed }

export function readStoredUnclaimed(raw: unknown): StoredUnclaimed {
  if (raw === undefined) return { kind: "absent" }
  if (raw === null) return { kind: "consumed" }
  return { kind: "pending", data: decodeUnclaimed(raw) }
}
