import type { I18n } from "../../shared/i18n"
import type { KeySettingRefusal } from "../../shared/contracts/key-settings"
import type { Refusal, ShortcutWarning } from "../../shared/keys/types"
import { list } from "../../shared/copy"

export function keyRecorderText(i18n: I18n) {
  return {
    noKey: i18n.message("recorder_noKey"),
    pressKeys: i18n.message("recorder_pressKeys"),
    escToCancel: i18n.message("recorder_escToCancel"),
    saving: i18n.message("recorder_saving"),
    conflictLabel: i18n.message("recorder_conflictLabel"),
    useHere: i18n.message("recorder_useHere"),
    cancel: i18n.message("recorder_cancel"),
    commandsUnavailable: i18n.message("recorder_commandsUnavailable"),
    record: (title: string) => i18n.message("recorder_record", { title }),
    clear: (title: string) => i18n.message("recorder_clear", { title }),
    conflict: (key: string, others: readonly string[]) => i18n.message(others.length > 1 ? "recorder_conflict_other" : "recorder_conflict_one", { key, others: list(others, i18n) }),
    refusal(refusal: Refusal): string {
      switch (refusal) {
        case "plain-enter-space":
          return i18n.message("recorder_refused_enterSpace")
        case "ctrl-alt":
          return i18n.message("recorder_refused_ctrlAlt")
        case "reserved":
          return i18n.message("recorder_refused_reserved")
        case "unsupported-key":
          return i18n.message("recorder_refused_other")
      }
    },
    answer(reason: KeySettingRefusal): string {
      switch (reason) {
        case "stale":
          return i18n.message("recorder_answer_stale")
        case "missing-target":
          return i18n.message("recorder_answer_missingTarget")
        case "limit":
          return i18n.message("shortcuts_limit")
        case "expired":
          return i18n.message("recorder_answer_expired")
        case "sync-full":
          return i18n.message("recorder_answer_syncFull")
        case "update-needed":
          return i18n.message("recorder_answer_updateNeeded")
        case "unconfirmed":
          return i18n.message("recorder_answer_unconfirmed")
        case "rejected":
          return i18n.message("recorder_answer_rejected")
        case "invalid":
          return i18n.message("recorder_answer_invalid")
        case "unavailable":
          return i18n.message("recorder_answer_unavailable")
      }
    },
    warning(warning: ShortcutWarning, key: string, browser: "Chrome" | "Firefox"): string {
      switch (warning.kind) {
        case "command":
          return i18n.message("recorder_clash_command", { key, command: warning.command })
        case "browser":
          return i18n.message("recorder_clash_browser", { browser, key, action: warning.action })
        case "site":
          return i18n.message("recorder_clash_site", {
            site: i18n.message(warning.site === "www" ? "site_www" : "site_music"),
            key,
            action: warning.action
          })
      }
    }
  }
}
export type KeyRecorderText = ReturnType<typeof keyRecorderText>
