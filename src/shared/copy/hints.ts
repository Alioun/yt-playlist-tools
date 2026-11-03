import type { ItemKind } from "../contracts/media"
import type { I18n, SimpleMessageKey } from "../i18n"

export type MusicHintAction = "save" | "playlist-shortcut" | "next" | "end" | "remove" | "move" | "like" | "library" | "mix" | "album" | "artist"
export type MusicHint =
  | {
      readonly kind: "unsupported-item"
      readonly reason: "queue-only" | "autoplay" | "songs-only" | "action-unavailable"
      readonly action: MusicHintAction
      readonly item: { readonly kind: ItemKind }
    }
  | { readonly kind: "no-queue-target" | "nothing-playing" | "ad-playing" | "unrecognised-item" | "casting" }
export type WwwHint = { readonly kind: "unsupported-item"; readonly reason: "playlist" | "mix" | "channel" | "post" | "ad" } | { readonly kind: "no-pointed-item" | "unrecognised-item" }

const actionNames = {
  save: "musicAction_save",
  "playlist-shortcut": "musicAction_save",
  next: "musicAction_next",
  end: "musicAction_end",
  remove: "musicAction_remove",
  move: "musicAction_move",
  like: "musicAction_like",
  library: "musicAction_library",
  mix: "musicAction_mix",
  album: "musicAction_album",
  artist: "musicAction_artist"
} satisfies Record<MusicHintAction, SimpleMessageKey>
const kindNames = {
  song: "musicKind_song",
  video: "musicKind_video",
  episode: "musicKind_episode",
  upload: "musicKind_upload",
  album: "musicKind_album",
  playlist: "musicKind_playlist",
  artist: "musicKind_artist",
  other: "musicKind_other"
} satisfies Record<ItemKind, SimpleMessageKey>

export function musicHintText(hint: MusicHint, i18n: I18n): string {
  switch (hint.kind) {
    case "no-queue-target":
      return i18n.message("musicHint_queueOnly")
    case "nothing-playing":
      return i18n.message("musicHint_nothingPlaying")
    case "ad-playing":
      return i18n.message("musicHint_adPlaying")
    case "unrecognised-item":
      return i18n.message("hint_unrecognisedItem")
    case "casting":
      return i18n.message("musicHint_casting")
    case "unsupported-item":
      switch (hint.reason) {
        case "queue-only":
          return i18n.message("musicHint_queueOnly")
        case "autoplay":
          return i18n.message("musicHint_autoplay")
        case "songs-only":
          return i18n.message("musicHint_songsOnly")
        case "action-unavailable":
          return i18n.message("musicHint_unavailable", {
            action: i18n.message(actionNames[hint.action]),
            kind: i18n.message(kindNames[hint.item.kind])
          })
      }
  }
}

export function wwwHintText(hint: WwwHint, i18n: I18n): string {
  switch (hint.kind) {
    case "no-pointed-item":
      return i18n.message("wwwHint_pointAtVideo")
    case "unrecognised-item":
      return i18n.message("hint_unrecognisedItem")
    case "unsupported-item":
      return i18n.message(hint.reason === "ad" ? "wwwHint_ads" : "wwwHint_videosOnly")
  }
}
