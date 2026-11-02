import type { FeatureId } from "../../shared/contracts"
import type { I18n } from "../../shared/i18n"
import type { PlaylistId, ShortcutId, VideoId } from "../../shared/model"
import type { PickerModel } from "../../shared/picker/model.svelte"

/** Where the picker opens (YT-PK-12, UI-PICK-15). */
export type PickerAnchor =
  | { readonly kind: "below"; readonly element: Element }
  | { readonly kind: "on"; readonly element: Element }
  | { readonly kind: "beside"; readonly element: Element }
  | { readonly kind: "player"; readonly element: Element }
  | { readonly kind: "window" }
/** Choose mode sets the quick-save playlist, or with `shortcut` that shortcut's playlist (YT-PK-09). */
export type PickerMode = { readonly kind: "save" } | { readonly kind: "choose"; readonly shortcut: ShortcutId | null }
export type OpenPicker = {
  readonly video: VideoId
  readonly title?: string
  readonly anchor: PickerAnchor
  readonly mode: PickerMode
  /** The feature whose Show feedback governs the picker's toasts (YT-PK-09's list). */
  readonly opener: FeatureId
}
/** `popovers.js`'s interface on `__pp.popovers` (06 §6.4.2's Popovers). */
export interface Popovers {
  openPicker(request: OpenPicker): void
  isOpen(): boolean
  close(): void
}

/** What the picker view reports. The popovers act on a choose-mode pick and on an untick. */
export type PickerViewEvent = { readonly kind: string; readonly id?: PlaylistId; readonly outcome: { readonly kind: string } }
/** The picker's view, handed in by the `popovers.js` entrypoint so site code never imports the UI layer. */
export type PickerRenderer = {
  readonly css: string
  pickedPrivate(i18n: I18n): string
  mount(target: HTMLElement, props: {
    readonly picker: PickerModel
    readonly purpose: "save" | "quickSave" | "shortcut"
    readonly i18n: I18n
    readonly os: "macos" | "windows" | "linux"
    onoutcome(event: PickerViewEvent): void
    onrequestclose(): void
  }): () => void
}
