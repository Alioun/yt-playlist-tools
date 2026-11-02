import type { FeatureStatus } from "../../../shared/contracts/tab-view"
import type { ItemInfo, ItemKind } from "../../../shared/contracts"
import type { Settings } from "../../../shared/model"
import { musicUnsupported, type MusicFamily } from "../../core/items-music"
import { quickActions, withdrawn, type QuickAction } from "../../music/actions"

/** YouTube Music's own menu order, then §21's four, so switching one on never moves a known button (YM-QA-11, YM-MORE-6). */
export const buttonOrder = ["next", "queue", "save", "like", "remove", "library", "mix", "album", "artist"] as const satisfies readonly QuickAction[]
export type ButtonAction = typeof buttonOrder[number]
const songs: readonly ItemKind[] = ["song", "video", "episode", "upload"]

/**
 * The buttons an item gets, in order (YM-QA-1 to YM-QA-6, YM-MORE-2): switched on, offered by the item's own ⋮,
 * allowed signed out or not, and never a second copy of a control YouTube Music already draws there. A header
 * gets only Play next and Add to queue (YM-QA-9). An action this tab can't run draws nothing (YM-FAIL-4).
 */
export function offeredButtons(item: ItemInfo, family: MusicFamily, buttons: Settings["musicActions"]["buttons"],
  signedIn: boolean, status: FeatureStatus | undefined): ButtonAction[] {
  return buttonOrder.filter(action => {
    if (!buttons[action] || withdrawn(status, action) || !signedIn && quickActions[action].account) return false
    if (family === "header" && action !== "next" && action !== "queue") return false
    if ((action === "save" || action === "like") && !songs.includes(item.kind)) return false
    if (action === "like" && (family === "responsive-row" || item.hasOwnLike)) return false
    const move = family === "queue-item" && (action === "next" || action === "queue")
    return musicUnsupported(item, family, move ? "move" : quickActions[action].item) === undefined
  })
}
