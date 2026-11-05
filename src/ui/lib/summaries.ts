import type { I18n } from "../../shared/i18n"
import { display } from "../../shared/keys/policy"
import type { Platform } from "../../shared/keys/types"
import type { MusicAction, Settings } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import { isPlaylistId, type PlaylistId } from "../../shared/model/validation"
import type { PageSetup } from "../../shared/model/page-view"
import type { PageFeatureId } from "../onboarding/features"

export type SummaryFacts = {
  readonly settings: Snapshot<Settings>
  readonly setup: PageSetup | undefined
  readonly account: string
  readonly signedIn: boolean
  readonly paused: boolean
  readonly os: Platform["os"]
  readonly title: (id: PlaylistId | null) => string | null
}
export const musicButtons: readonly (MusicAction | "bar")[] = ["next", "queue", "save", "like", "remove", "bar", "library", "mix", "album", "artist"]
export const musicActionName = {
  next: "musicButton_next",
  queue: "musicButton_queue",
  save: "musicButton_save",
  like: "musicButton_like",
  remove: "musicButton_remove",
  bar: "musicButton_bar",
  library: "musicButton_library",
  mix: "musicButton_mix",
  album: "musicButton_album",
  artist: "musicButton_artist"
} as const
export const musicWhere = {
  next: "musicWhere_next",
  queue: "musicWhere_queue",
  save: "musicWhere_save",
  like: "musicWhere_like",
  remove: "musicWhere_remove",
  bar: "musicWhere_bar",
  library: "musicWhere_library",
  mix: "musicWhere_mix",
  album: "musicWhere_album",
  artist: "musicWhere_artist"
} as const
export const gatherOrderName = {
  newest: "gatherOrder_newest",
  oldest: "gatherOrder_oldest",
  english: "gatherOrder_english",
  "non-english": "gatherOrder_nonEnglish",
  "left-to-right": "gatherOrder_leftToRight",
  "right-to-left": "gatherOrder_rightToLeft",
  shuffled: "gatherOrder_shuffled"
} as const

const playlist = (value: string | null | undefined): PlaylistId | null => (isPlaylistId(value) ? value : null)

/** A feature row's one-line summary (UI-POP-22, UI-POP-18). */
export function summary(i18n: I18n, feature: PageFeatureId, facts: SummaryFacts): string {
  const { settings, setup } = facts
  switch (feature) {
    case "auto-add": {
      if (facts.paused) return i18n.message("summary_autoAdd_paused")
      if (!facts.signedIn && !setup) return i18n.message("summary_autoAdd_signedOut")
      const count = setup?.setup.autoAdd.length ?? 0
      if (count === 0) return i18n.message("summary_autoAdd_none", { account: facts.account })
      return i18n.message(i18n.plural(count) === "one" ? "summary_autoAdd_one" : "summary_autoAdd_other", { count: i18n.number(count), percent: i18n.number(settings.autoAdd.pct) })
    }
    case "shortcuts": {
      const keyed = settings.shortcuts.list.filter(row => row.key !== null)
      if (keyed.length === 0) return i18n.message("summary_shortcuts_none")
      const shown = keyed.slice(0, 3).map(row => `${display(row.key!, facts.os)} ${row.label}`.trim())
      return [...shown, ...(keyed.length > 3 ? [i18n.message("summary_more", { count: i18n.number(keyed.length - 3) })] : [])].join(" · ")
    }
    case "quick-save": {
      const title = facts.title(playlist(setup?.setup.quickSave))
      return title ? i18n.message("summary_quickSave_set", { playlist: title }) : i18n.message("summary_quickSave_unset")
    }
    case "queue-button":
      return i18n.message("summary_queue")
    case "watch-button":
      return i18n.message("summary_watch")
    case "card-menu":
      return i18n.message("summary_cardMenu")
    case "browser-menu":
      return i18n.message("summary_browserMenu")
    case "gather": {
      const order = i18n.message(gatherOrderName[settings.gather.order])
      const base =
        settings.gather.to === "player"
          ? i18n.message("summary_gather_player", { order })
          : settings.gather.to === "queue"
            ? i18n.message("summary_gather_queue", { order })
            : i18n.message("summary_gather_playlist", { playlist: facts.title(playlist(setup?.setup.gather)) ?? i18n.message("summary_gather_noPlaylist"), order })
      const auto = settings.gather.auto.unvisited || settings.gather.auto.background || settings.gather.auto.count
      return auto ? i18n.message("summary_gather_auto", { summary: base }) : base
    }
    case "music-actions": {
      const chosen = musicButtons.filter(button => settings.musicActions.buttons[button]).map(button => i18n.message(musicActionName[button]))
      return chosen.length ? chosen.join(", ") : i18n.message("summary_quickActions_none")
    }
    case "music-keys": {
      const keys = Object.values(settings.musicKeys.keys).filter((key): key is NonNullable<typeof key> => key !== null)
      if (!keys.length) return i18n.message("summary_noKey")
      const shown = keys.slice(0, 3).map(key => display(key, facts.os))
      return [...shown, ...(keys.length > 3 ? [i18n.message("summary_more", { count: i18n.number(keys.length - 3) })] : [])].join(" ")
    }
    case "any-tab-keys":
      return ""
  }
}
