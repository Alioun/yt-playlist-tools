import type { I18n } from "../../shared/i18n"
import type { PageFeatureId } from "./features"

export function createFeatureExamples(i18n: I18n) {
  return {
    byId: {
      "auto-add": i18n.message("feature_example_auto_add"),
      "shortcuts": i18n.message("feature_example_shortcuts"),
      "quick-save": i18n.message("feature_example_quick_save"),
      "queue-button": i18n.message("feature_example_queue_button"),
      "watch-button": i18n.message("feature_example_watch_button"),
      "card-menu": i18n.message("feature_example_card_menu"),
      "browser-menu": i18n.message("feature_example_browser_menu"),
      "gather": i18n.message("feature_example_gather"),
      "music-actions": i18n.message("feature_example_music_actions"),
      "music-keys": i18n.message("feature_example_music_keys"),
      "any-tab-keys": i18n.message("feature_example_any_tab_keys")
    } satisfies Record<PageFeatureId, string>,
    text: {
      label: i18n.message("feature_preview_label"),
      video: i18n.message("feature_preview_video"),
      playlist: i18n.message("feature_preview_playlist"),
      save: i18n.message("quickSave_more"),
      queue: i18n.message("queueButton_idle"),
      playNext: i18n.message("feature_preview_play_next"),
      yourKey: i18n.message("feature_preview_your_key")
    }
  }
}
