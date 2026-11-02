import type { SetupDestination } from "../../shared/contracts/first-run"
import type { Site } from "../../shared/contracts/vocabulary"
import type { AccountKey } from "../../shared/model/validation"
import type { PickerPurpose } from "../picker"

export type HostRequest =
  | { readonly kind: "choose"; readonly acct: AccountKey; readonly site: Site; readonly destination: SetupDestination; readonly purpose: PickerPurpose }
  | { readonly kind: "manage"; readonly acct: AccountKey }
