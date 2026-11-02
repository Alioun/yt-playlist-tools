import type { FeatureStatus, PageFeatureId } from "../../../shared/contracts/tab-view"
import type { I18n, SimpleMessageKey } from "../../../shared/i18n"
import { display } from "../../../shared/keys/policy"
import type { Key, MusicAction } from "../../../shared/model"
import type { MusicAction as ItemAction } from "../../core/items-music"
import type { SiteView } from "../../core/feature-host"

/** A quick action by its settings name (YM-FEAT-2, YM-FEAT-3). `picker` is Save to playlist…, the picker. */
export type QuickAction = MusicAction | "picker"
type Spec = { readonly item: ItemAction; readonly name: SimpleMessageKey; readonly queueEdit: boolean; readonly account: boolean }

/**
 * Each action's item check, its name, and whether casting stops it or it needs a signed-in account (YM-CAST-2,
 * YM-ACC-5). It's its own file so a feature file can read it without the kit's engine.
 */
export const quickActions: Readonly<Record<QuickAction, Spec>> = {
  next: { item: "next", name: "musicAction_next", queueEdit: true, account: false },
  queue: { item: "end", name: "musicAction_end", queueEdit: true, account: false },
  save: { item: "save", name: "picker_saveMusicTitle", queueEdit: false, account: true },
  picker: { item: "save", name: "musicAction_savePicker", queueEdit: false, account: true },
  like: { item: "like", name: "musicAction_like", queueEdit: false, account: true },
  remove: { item: "remove", name: "musicAction_removeQueue", queueEdit: true, account: false },
  library: { item: "library", name: "musicAction_library", queueEdit: false, account: true },
  mix: { item: "mix", name: "musicAction_mix", queueEdit: true, account: false },
  album: { item: "album", name: "musicAction_album", queueEdit: false, account: false },
  artist: { item: "artist", name: "musicAction_artist", queueEdit: false, account: false }
}

export function statusOf(view: SiteView<"music">, feature: PageFeatureId): FeatureStatus | undefined {
  return view.statuses.find(status => status.feature === feature)
}
/** Whether a status withdraws this action here: its feature isn't working, or the action is unavailable (YM-FAIL-4). */
export function withdrawn(status: FeatureStatus | undefined, action: QuickAction): boolean {
  return status?.state === "not-working" || status?.state === "partly-working" && status.actions.includes(action === "picker" ? "save" : action)
}
/**
 * The answer a key gets while its feature isn't working, or its action is unavailable in this tab: always shown,
 * so a key never does nothing silently (YM-KEY-12, R50, R68). Null means the key can act.
 */
export function brokenKeyText(status: FeatureStatus | undefined, action: QuickAction, key: Key, i18n: I18n, os: "macos" | "windows" | "linux"): string | null {
  if (!withdrawn(status, action)) return null
  const name = i18n.message(quickActions[action].name)
  return status?.state === "not-working" ? i18n.message("musicFail_keyBroken", { action: name, key: display(key, os) })
    : i18n.message("musicFail_keyUnavailable", { action: name })
}
