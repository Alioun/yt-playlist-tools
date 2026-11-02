import type { Site } from "../../shared/contracts"
import type { Platform } from "../../shared/keys"
import type { AccountKey, PlaylistId } from "../../shared/model"
import type {
  CreateOutcome, PickerModel, PinOutcome, RefreshOutcome, SettingOutcome, TickOutcome, UndoOutcome, UntickOutcome
} from "../../shared/picker/model.svelte"
import type { PickerSource } from "../../shared/picker/source"
import type { PickerText } from "./text"

export type PickerPurpose =
  | { readonly kind: "save" | "quickSave" | "shortcut" | "many" }
  | { readonly kind: "gather"; readonly accountName: string }
  | { readonly kind: "named"; readonly title: string; readonly subtitle: string | null }

export type PickerEvent =
  | { readonly kind: "tick"; readonly id: PlaylistId; readonly outcome: TickOutcome }
  | { readonly kind: "untick"; readonly id: PlaylistId; readonly outcome: UntickOutcome }
  | { readonly kind: "undo"; readonly id: PlaylistId; readonly outcome: UndoOutcome }
  | { readonly kind: "pin"; readonly id: PlaylistId; readonly outcome: PinOutcome }
  | { readonly kind: "refresh"; readonly outcome: RefreshOutcome }
  | { readonly kind: "sort"; readonly outcome: SettingOutcome }
  | { readonly kind: "create"; readonly outcome: CreateOutcome }

export type CloseRequest = { readonly reason: "escape" | "dismiss" | "trigger" | "button" }
export type PickerHelp = "openYouTube" | "createChannel"
/** Where New playlist's links go when creating can't be used here (UI-PICK-11, YT-NEW-07). */
export const pickerHelpUrl: Readonly<Record<PickerHelp, string>> = {
  openYouTube: "https://www.youtube.com/", createChannel: "https://www.youtube.com/create_channel"
}

export type PickerPanelProps = {
  readonly picker: PickerModel
  readonly text: PickerText
  readonly purpose: PickerPurpose
  readonly platform: Platform["os"]
  readonly watchLaterEveryAccount?: boolean
  readonly onoutcome: (event: PickerEvent) => void
  readonly onpending?: (outcome: Promise<PickerEvent>) => void
  readonly onrequestclose: (request: CloseRequest) => void
  readonly onhelp?: (action: PickerHelp) => void
}

export type ChooserContext = {
  readonly account: AccountKey
  readonly site: Site
  readonly private: boolean
  readonly purpose: PickerPurpose & { readonly kind: "quickSave" | "gather" | "named" }
}
export type CurrentPlaylist =
  | { readonly kind: "none" }
  | { readonly kind: "playlist"; readonly id: PlaylistId; readonly title: string | null }
export type ChooserAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "disabled"; readonly explanation: string }
export type ChooserRequest =
  | { readonly kind: "open" }
  | { readonly kind: "close"; readonly reason: CloseRequest["reason"] }
export type ChooserRelease = {
  readonly kind: "released"
  readonly reason: "caller" | "context" | "unmount" | "disabled"
  readonly context: ChooserContext
  readonly picker: PickerModel
  readonly pending: readonly Promise<PickerEvent>[]
}
export type PlaylistChooserProps = {
  readonly open: boolean
  readonly context: ChooserContext
  readonly current: CurrentPlaylist
  readonly label: string
  readonly availability: ChooserAvailability
  readonly createSource: (context: ChooserContext) => PickerSource
  readonly text: PickerText
  readonly platform: Platform["os"]
  readonly watchLaterEveryAccount?: boolean
  readonly onrequest: (request: ChooserRequest) => void
  readonly onoutcome: (event: PickerEvent) => void
  readonly onrelease: (event: ChooserRelease) => void
  readonly onhelp?: (action: PickerHelp) => void
}
