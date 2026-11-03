import type { DisclosureText } from "./text"
import type { BrowserKind, PageFeatureId } from "./features"

export type SyncedChoices =
  | { readonly kind: "found"; readonly features: readonly PageFeatureId[] }
  | { readonly kind: "not-found" }
  | { readonly kind: "update-needed" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" }

export type SyncedChoicesLookup = {
  readonly result: Promise<SyncedChoices>
  cancel(): void
}

export type PermissionNeeds = { readonly music: boolean; readonly browserMenu: boolean }
export type PermissionGrant = { readonly music: boolean; readonly browserMenu: boolean }

export type AgreementRequest = {
  readonly displayed: DisclosureText
  readonly attempt: number
  readonly selected: readonly PageFeatureId[]
  readonly syncOn: boolean
  readonly permissions: Promise<PermissionGrant>
}

// First run's Agree never turns a ticked feature off. A denied prompt saves it on and holds it (FT-40, FT-52, R14, R53).
// Playlist shortcuts then runs on YouTube while its "Also on YouTube Music" stays saved on and held.
export type FeatureApplication =
  | { readonly feature: Exclude<PageFeatureId, "shortcuts">; readonly state: "enabled" | "held-site-access" | "held-browser-menu" }
  | { readonly feature: "shortcuts"; readonly state: "enabled"; readonly alsoOnMusic: "enabled" | "held-site-access" }

export type AgreementRefusal = "sync-full" | "update-needed" | "invalid" | "rejected" | "unconfirmed" | "unavailable" | "join-required"

// Only a read-back-confirmed commit maps to "agreed". A resolved write that was never confirmed is "unconfirmed".
export type AgreementOutcome =
  | { readonly kind: "agreed"; readonly attempt: number; readonly applications: readonly FeatureApplication[] }
  | { readonly kind: "not-agreed"; readonly attempt: number; readonly reason: AgreementRefusal }

export type AccountLabel = { readonly name: string; readonly handle?: string }

export type YouTubeState = { readonly kind: "no-access" } | { readonly kind: "no-tab" } | { readonly kind: "signed-out" } | { readonly kind: "account"; readonly account: AccountLabel }

export type PlaylistPurpose = "auto-add" | "shortcut" | "quick-save" | "music-quick-save"
export type PlaylistSelection = { readonly kind: "none" } | { readonly kind: "chosen"; readonly titles: readonly string[] }

export type PlaylistTarget =
  | { readonly purpose: "shortcut"; readonly key: string; readonly selection: PlaylistSelection }
  | { readonly purpose: Exclude<PlaylistPurpose, "shortcut">; readonly selection: PlaylistSelection }

export type SetupRow = {
  readonly feature: PageFeatureId
  readonly held?: "site-access" | "browser-menu-permission"
  readonly alsoOnMusicHeld?: true
  readonly target?: PlaylistTarget
}

export type SetupView =
  | { readonly kind: "ready"; readonly youtube: YouTubeState; readonly musicAccess: "granted" | "missing" | "not-needed"; readonly rows: readonly SetupRow[] }
  | { readonly kind: "unavailable" }

export type ChoiceRequest = { readonly feature: PageFeatureId; readonly purpose: PlaylistPurpose }
export type ChoiceFailure = "picker-unavailable" | "private" | "rejected" | "unconfirmed" | "unavailable"
export type ChoiceOutcome = { readonly kind: "confirmed"; readonly selection: PlaylistSelection } | { readonly kind: "cancelled" } | { readonly kind: "failed"; readonly reason: ChoiceFailure }

export type AccessSite = "www" | "music"
export type Destination = "youtube" | "sign-in" | "settings"

export type FirstRunOwner = {
  readonly browser: BrowserKind
  lookupSyncedChoices(): SyncedChoicesLookup
  requestPermissions(needs: PermissionNeeds): Promise<PermissionGrant>
  agree(request: AgreementRequest): Promise<AgreementOutcome>
  readSetup(): Promise<SetupView>
  requestSiteAccess(site: AccessSite): Promise<boolean>
  choosePlaylist(request: ChoiceRequest): Promise<ChoiceOutcome>
  open(destination: Destination): void
}
