import type { Site } from "../contracts"
import type { DueNotice, PageFeatureId } from "../contracts/tab-view"
import type { PlaylistId } from "../model"
import type { ToastPlan } from "../rules/outcomes"
import type { I18n, SimpleMessageKey } from "../i18n"
import { feedbackMessages, type FeedbackValues } from "./messages"

export type Titles = {
  video?: string
  playlists?: Readonly<Partial<Record<PlaylistId, string>>>
  channel?: string
  shortcut?: string
  account?: string
}

const characters = new Intl.Segmenter("und", { granularity: "grapheme" })
const limit = 40

export function cut(title: string): string {
  const parts = [...characters.segment(title)]
  return parts.length > limit ? `${parts.slice(0, limit).map(part => part.segment).join("")}…` : title
}

export { list } from "./list"
import { list } from "./list"

export function toastText(plan: ToastPlan, titles: Titles, site: Site, i18n: I18n): string {
  const known = (text: string | undefined) => text !== undefined && text.trim() !== "" ? text : undefined
  const video = known(titles.video)
  const playlist = (id: PlaylistId) => {
    const title = known(titles.playlists?.[id])
    return title === undefined ? i18n.message("copy_missingPlaylist") : cut(title)
  }
  const names = (ids: readonly PlaylistId[]) => list(ids.map(playlist), i18n)
  const messages = feedbackMessages[`${site}_${plan.auto ? "auto" : "manual"}_${video === undefined ? "untitled" : "named"}`]
  const values: FeedbackValues = {
    video: video === undefined ? "" : cut(video), targets: "", target: "", success: "", saved: "", filtered: "",
    shortcut: known(titles.shortcut) ?? i18n.message("copy_shortcut"),
    account: known(titles.account) ?? i18n.message("copy_account"),
    channel: known(titles.channel) ?? i18n.message("copy_channel")
  }
  const message = plan.message
  switch (message.kind) {
    case "pending":
    case "saved":
    case "first-pick":
    case "already-in":
    case "filtered":
    case "unknown-channel": return messages[message.kind](i18n, { ...values, targets: names(message.playlists) })
    case "removed":
    case "shortcut-set": return messages[message.kind](i18n, { ...values, target: playlist(message.playlist) })
    case "undo-failed":
    case "no-playlist": return messages[message.kind](i18n, values)
    case "saved-filtered": return messages[`saved-filtered_${i18n.plural(message.saved)}_${i18n.plural(message.filtered)}`](i18n, {
      ...values, saved: i18n.number(message.saved), filtered: i18n.number(message.filtered)
    })
    case "failed": return messages[`failed_${message.failure}_${i18n.plural(message.playlists.length)}`](i18n, { ...values, targets: names(message.playlists) })
    case "saved-failed": return messages[`saved-failed_${message.failure}_${i18n.plural(message.playlists.length)}`](i18n, {
      ...values, success: names(message.saved), targets: names(message.playlists)
    })
  }
}

const featureKeys = {
  "auto-add": "notice_feature_auto_add",
  "shortcuts": "notice_feature_shortcuts",
  "quick-save": "notice_feature_quick_save",
  "queue-button": "notice_feature_queue_button",
  "watch-button": "notice_feature_watch_button",
  "card-menu": "notice_feature_card_menu",
  "gather": "notice_feature_gather",
  "music-actions": "notice_feature_music_actions",
  "music-keys": "notice_feature_music_keys",
} satisfies Record<PageFeatureId, SimpleMessageKey>

export function siteFeedbackText(i18n: I18n) {
  return {
    actions: { undo: i18n.message("toast_action_undo"), "try-again": i18n.message("toast_action_try_again"),
      settings: i18n.message("toast_action_settings"), choose: i18n.message("toast_action_choose"),
      "sign-in": i18n.message("toast_action_sign_in"), reload: i18n.message("toast_action_reload") },
    nothingToUndo: i18n.message("toast_nothingToUndo"), details: i18n.message("toast_details"), dismiss: i18n.message("toast_dismiss")
  }
}

export function noticeText(input: { readonly due: DueNotice; readonly site: Site; readonly unavailableActionNames: readonly string[] }, i18n: I18n): string {
  if (input.site === "www" && input.due.features.length === 1 && input.due.features[0] === "watch-button") return i18n.message("notice_watch")
  const names = input.site === "music" && input.unavailableActionNames.length ? input.unavailableActionNames : input.due.features.map(id => i18n.message(featureKeys[id]))
  const features = list(names, i18n)
  if (input.site === "music") return names.length === 1 ? i18n.message("notice_music_one", { features }) : i18n.message("notice_music_other", { features })
  return names.length === 1 ? i18n.message("notice_www_one", { features }) : i18n.message("notice_www_other", { features })
}

export type QueueButtonLabel = "idle" | "busy" | "added" | "unconfirmed" | "failed"
export type QueueButtonToast = "added" | "unconfirmed" | "failed"

const queueLabelKeys = {
  idle: "queueButton_idle",
  busy: "queueButton_busy",
  added: "queueButton_added",
  unconfirmed: "queueButton_unconfirmed",
  failed: "queueButton_failed",
} satisfies Record<QueueButtonLabel, SimpleMessageKey>

export function queueButtonText(i18n: I18n) {
  return {
    label: (state: QueueButtonLabel) => i18n.message(queueLabelKeys[state]),
    toast(kind: QueueButtonToast, title: string | undefined): string {
      const known = title !== undefined && title.trim() !== "" ? cut(title.trim()) : undefined
      switch (kind) {
        case "added": return known === undefined ? i18n.message("queueButton_toast_added_untitled") : i18n.message("queueButton_toast_added_named", { title: known })
        case "unconfirmed": return known === undefined ? i18n.message("queueButton_toast_unconfirmed_untitled") : i18n.message("queueButton_toast_unconfirmed_named", { title: known })
        case "failed": return known === undefined ? i18n.message("queueButton_toast_failed_untitled") : i18n.message("queueButton_toast_failed_named", { title: known })
      }
    }
  }
}
export type QueueButtonText = ReturnType<typeof queueButtonText>
export { musicHintText, wwwHintText, type MusicHint, type WwwHint } from "./hints"

export function autoAddText(i18n: I18n) {
  return {
    cantMeasure(title: string | undefined): string {
      const known = title !== undefined && title.trim() !== "" ? cut(title.trim()) : undefined
      return known === undefined ? i18n.message("autoAdd_cantMeasure_untitled") : i18n.message("autoAdd_cantMeasure_named", { title: known })
    }
  }
}
export type AutoAddText = ReturnType<typeof autoAddText>
