import { mount, unmount } from "svelte"
import type { I18n } from "../../shared/i18n"
import type { PickerModel } from "../../shared/picker/model.svelte"
import themeCss from "../lib/theme.css?inline"
import PickerPanel from "./PickerPanel.svelte"
import { createPickerText } from "./text"
import { pickerHelpUrl, type PickerEvent, type PickerHelp } from "./types"

/** The in-page picker's view for `popovers.js` (UI-PICK-13): the extension's PickerPanel with the theme inlined into the host. */
export const pagePicker = {
  css: themeCss,
  pickedPrivate: (i18n: I18n) => createPickerText(i18n).label("pickedPrivate"),
  mount(target: HTMLElement, props: {
    readonly picker: PickerModel
    readonly purpose: "save" | "quickSave" | "shortcut"
    readonly i18n: I18n
    readonly os: "macos" | "windows" | "linux"
    onoutcome(event: PickerEvent): void
    onrequestclose(): void
  }): () => void {
    const component = mount(PickerPanel, { target, props: {
      picker: props.picker, text: createPickerText(props.i18n), purpose: { kind: props.purpose }, platform: props.os,
      onoutcome: props.onoutcome, onrequestclose: () => props.onrequestclose(),
      onhelp: (action: PickerHelp) => { target.ownerDocument.defaultView?.open(pickerHelpUrl[action], "_blank", "noopener") }
    } })
    return () => { void unmount(component) }
  }
}
