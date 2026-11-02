import type { AutoAddState } from "../contracts/this-video"
import type { I18n } from "../i18n"
import { list } from "./list"

/**
 * UI-YT-18's pill label and status line for auto-add's state. The status line is the button's tooltip, its menu's
 * first row and the popup's This video line (UI-POP-12). A null label is the icon-only button.
 */
export function watchStateText(state: AutoAddState, input: { readonly name: (playlist: string) => string; readonly title: string | null }, i18n: I18n):
  { readonly label: string | null; readonly status: string } {
  const names = (ids: readonly string[]) => list(ids.map(input.name), i18n)
  switch (state.kind) {
    case "counting": {
      const percent = i18n.number(state.goal)
      const label = i18n.message("watchState_counting_label", { percent })
      return { label, status: state.watched === null ? label : i18n.message("watchState_counting_status", { percent, watched: i18n.number(state.watched) }) }
    }
    case "partly": {
      const percent = i18n.number(state.goal)
      return { label: i18n.message("watchState_partly_label", { percent }),
        status: i18n.message("watchState_partly_status", { added: names(state.added), pending: names(state.pending), percent }) }
    }
    case "added": return { label: i18n.message("watchState_added_label"), status: i18n.message("watchState_added_status", { targets: names(state.playlists) }) }
    case "already-in": {
      const text = i18n.message("watchState_alreadyIn", { targets: names(state.playlists) })
      return { label: text, status: text }
    }
    case "failed": return { label: i18n.message("watchState_failed_label"), status: state.offline ? i18n.message("watchState_failed_offline", { targets: names(state.playlists) })
      : input.title ? i18n.message("watchState_failed_named", { title: input.title }) : i18n.message("watchState_failed_untitled") }
    case "skipped": return { label: i18n.message("watchState_skipped_label"), status: i18n.message("watchState_skipped_status") }
    case "paused": return { label: i18n.message("watchState_paused_label"), status: i18n.message("watchState_paused_status") }
    case "live": return { label: i18n.message("watchState_live_label"), status: i18n.message("watchState_live_status") }
    case "cant-measure": return { label: i18n.message("watchState_cantMeasure_label"), status: i18n.message("watchState_cantMeasure_status") }
    case "not-tracked": return { label: null, status: i18n.message("watchState_untracked") }
  }
}
