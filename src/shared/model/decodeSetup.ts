import { checked, dictionary, list, nullable, object, oneOf, optional, text } from "./codec"
import { defaultSetup } from "./defaults"
import type { AccountLabel, AutoAddPlaylist, Setup } from "./types"
import { isPercent, isPlaylistId, isShortcutId } from "./validation"

const playlist = checked(isPlaylistId, "a playlist ID")
const label = object<AccountLabel>({ name: text, handle: optional(text), avatar: optional(text) })
const autoAdd = object<AutoAddPlaylist>({
  pl: playlist, takes: oneOf("videos", "shorts", "both"),
  pct: optional(checked(isPercent, "an integer percentage from 0 to 100"))
}, () => ({ takes: "videos" }))
const decode = object<Setup>({
  label: nullable(label), autoAdd: list(autoAdd), targets: dictionary(isShortcutId, playlist),
  quickSave: nullable(playlist), musicSave: nullable(playlist), gather: nullable(playlist),
  marks: dictionary(isPlaylistId, oneOf("missing", "full"))
}, defaultSetup)

export function decodeSetup(raw?: unknown): Setup {
  return decode(raw, "setup")
}
