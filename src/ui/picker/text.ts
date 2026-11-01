import type { Privacy, Site } from "../../shared/contracts"
import type { I18n, SimpleMessageKey } from "../../shared/i18n"
import type { PickerRow, Refusal, Saved, TitleProblem } from "../../shared/picker/model.svelte"
import type { CreateFailure } from "../../shared/picker/source"
import type { PickerPurpose } from "./types"

const labels = {
  refresh: "picker_refresh", sort: "picker_sort", search: "picker_search", close: "picker_close",
  listLabel: "picker_listLabel", newPlaylist: "picker_newPlaylist", title: "picker_title",
  visibility: "picker_visibility", cancel: "picker_cancel", create: "picker_create",
  remove: "picker_remove", busy: "picker_busy", alreadyIn: "picker_alreadyIn",
  couldNotSave: "picker_couldNotSave", couldNotRemove: "picker_couldNotRemove", removed: "picker_removed",
  emptyList: "picker_emptyList", emptySearch: "picker_emptySearch", listUnavailable: "picker_listUnavailable",
  noSavedList: "picker_noSavedList", noTab: "picker_noTab", loadingList: "picker_loadingList",
  refreshFailed: "picker_refreshFailed", privatePin: "picker_privatePin", privateGather: "picker_privateGather",
  titleUnavailable: "picker_titleUnavailable", missing: "picker_missing", full: "picker_full",
  newRow: "picker_newRow", goneRow: "picker_goneRow", pin: "picker_pin", pinned: "picker_pinned",
  createChoiceRefused: "picker_createChoiceRefused", pickedPrivate: "picker_pickedPrivate",
  undo: "toast_action_undo", tryAgain: "toast_action_try_again", undoFailed: "feedback_www_manual_untitled_undo_failed",
  openYouTube: "picker_openYouTube", createChannel: "picker_createChannel",
  sortPending: "picker_sortPending", sortRefused: "picker_sortRefused", noneChosen: "picker_noneChosen"
} satisfies Record<string, SimpleMessageKey>

export function createPickerText(i18n: I18n) {
  function label(key: keyof typeof labels): string { return i18n.message(labels[key]) }
  const privacy = {
    PRIVATE: i18n.message("picker_private"), UNLISTED: i18n.message("picker_unlisted"), PUBLIC: i18n.message("picker_public")
  } satisfies Record<Privacy, string>
  const refusal = {
    private: i18n.message("picker_refused_private"), "sync-full": i18n.message("picker_refused_sync_full"),
    "update-needed": i18n.message("picker_refused_update_needed"), invalid: i18n.message("picker_refused_invalid")
  } satisfies Record<Refusal, string>
  const problems = {
    required: i18n.message("picker_required"), "too-long": i18n.message("picker_tooLong"),
    "angle-brackets": i18n.message("picker_angleBrackets")
  } satisfies Record<TitleProblem, string>
  const failures = {
    rateLimited: i18n.message("picker_create_rateLimited"), publicCap: i18n.message("picker_create_publicCap"),
    noChannel: i18n.message("picker_create_noChannel"), notAllowed: i18n.message("picker_create_notAllowed"),
    failed: i18n.message("picker_create_failed")
  } satisfies Record<CreateFailure, string>
  const unavailable = {
    signedOut: i18n.message("picker_creation_signedOut"), noTab: i18n.message("picker_creation_noTab"),
    noChannel: i18n.message("picker_creation_noChannel"), private: i18n.message("picker_creation_private")
  }

  function rowDetails(row: PickerRow, site: Site): string {
    if (row.listed === "new") return label("newRow")
    if (row.listed === "gone") return label("goneRow")
    if (row.count === null) return row.privacy === null ? i18n.message("picker_unknownPrivacy") : privacy[row.privacy]
    const count = i18n.number(row.count)
    const one = i18n.plural(row.count) === "one"
    if (site === "music") {
      switch (row.privacy) {
        case "PRIVATE": return one ? i18n.message("picker_privateSongs_one", { count }) : i18n.message("picker_privateSongs_other", { count })
        case "UNLISTED": return one ? i18n.message("picker_unlistedSongs_one", { count }) : i18n.message("picker_unlistedSongs_other", { count })
        case "PUBLIC": return one ? i18n.message("picker_publicSongs_one", { count }) : i18n.message("picker_publicSongs_other", { count })
        case null: return one ? i18n.message("picker_songs_one", { count }) : i18n.message("picker_songs_other", { count })
      }
    }
    switch (row.privacy) {
      case "PRIVATE": return one ? i18n.message("picker_privateVideos_one", { count }) : i18n.message("picker_privateVideos_other", { count })
      case "UNLISTED": return one ? i18n.message("picker_unlistedVideos_one", { count }) : i18n.message("picker_unlistedVideos_other", { count })
      case "PUBLIC": return one ? i18n.message("picker_publicVideos_one", { count }) : i18n.message("picker_publicVideos_other", { count })
      case null: return one ? i18n.message("picker_videos_one", { count }) : i18n.message("picker_videos_other", { count })
    }
  }

  return {
    label, privacy, refusal, problems, failures, unavailable, rowDetails,
    heading(purpose: PickerPurpose, site: Site): { title: string; subtitle: string | null } {
      switch (purpose.kind) {
        case "save": return { title: i18n.message(site === "music" ? "picker_saveMusicTitle" : "picker_saveTitle"), subtitle: null }
        case "quickSave": return {
          title: i18n.message(site === "music" ? "picker_quickMusicTitle" : "picker_quickTitle"),
          subtitle: i18n.message(site === "music" ? "picker_quickMusicSubtitle" : "picker_quickSubtitle")
        }
        case "shortcut": return { title: i18n.message("picker_shortcutTitle"), subtitle: null }
        case "gather": return { title: i18n.message("picker_gatherTitle"), subtitle: i18n.message("picker_gatherSubtitle", { account: purpose.accountName }) }
        case "many": return { title: i18n.message("picker_manyTitle"), subtitle: null }
        case "named": return { title: purpose.title, subtitle: purpose.subtitle }
      }
    },
    rowTitle(row: Pick<PickerRow, "id" | "title">, everyAccount = false): string {
      if (row.id === "WL" && everyAccount) return i18n.message("picker_watchLaterEveryAccount")
      return row.title ?? label("titleUnavailable")
    },
    checking: (site: Site) => i18n.message(site === "music" ? "picker_checkingSong" : "picker_checkingVideo"),
    unreadable: (site: Site) => i18n.message(site === "music" ? "picker_unreadableSong" : "picker_unreadableVideo"),
    known(count: number) { return i18n.message(i18n.plural(count) === "one" ? "picker_known_one" : "picker_known_other", { count: i18n.number(count) }) },
    savedList(at: number) { return i18n.message("picker_savedList", { time: i18n.date(at, { dateStyle: "medium", timeStyle: "short" }) }) },
    duplicate: (playlist: string) => i18n.message("picker_duplicate", { playlist }),
    pickSaved(save: Saved, site: Site, playlist: string): string {
      if (save === "already-in") return i18n.message(site === "music" ? "feedback_music_manual_untitled_already_in" : "feedback_www_manual_untitled_already_in", { targets: playlist })
      return i18n.message(site === "music" ? "feedback_music_manual_untitled_saved" : "feedback_www_manual_untitled_saved", { targets: playlist })
    },
    chooserName: (label: string, playlist: string) => i18n.message("picker_chooserName", { label, playlist }),
    pinName: (playlist: string, pinned: boolean) => i18n.message(pinned ? "picker_pinnedFor" : "picker_pinFor", { playlist }),
    removeName: (playlist: string) => i18n.message("picker_removeChoice", { playlist }),
    shortcutLabel: (key: string) => i18n.message("picker_shortcutLabel", { key })
  }
}

export type PickerText = ReturnType<typeof createPickerText>
