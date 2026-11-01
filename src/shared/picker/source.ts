import type { ChangeResult, MembershipRow, PlaylistRow, Privacy, SetVideoId } from "../contracts"
import type { Key, PlaylistId, Setup } from "../model"

/** The account's playlists in the site's Save-dialog order, stamped with when they were fetched (ms). */
export type Listing = { readonly rows: readonly PlaylistRow[]; readonly at: number }
export type ListAnswer = { readonly kind: "listed"; readonly listing: Listing } | { readonly kind: "noTab" | "failed" }
export type MembershipAnswer = { readonly kind: "read"; readonly rows: readonly MembershipRow[] } | { readonly kind: "unreadable" }
/** The owner's Undo for a confirmed change. The caller decides where it is offered. */
export type Undo = () => Promise<{ readonly kind: "undone" | "failed" }>
export type AddAnswer =
  | { readonly kind: "added"; readonly entry: SetVideoId; readonly undo: Undo }
  | { readonly kind: "already-in" | "failed" }
export type RemoveAnswer = { readonly kind: "removed"; readonly undo: Undo } | { readonly kind: "failed" }
/** YT-NEW-07's rows, as the source recognised them. */
export type CreateFailure = "rateLimited" | "publicCap" | "noChannel" | "notAllowed" | "failed"
export type CreateAnswer =
  | { readonly kind: "created"; readonly id: PlaylistId; readonly undo: Undo | null }
  | { readonly kind: "failed"; readonly reason: CreateFailure }
export type NewPlaylist = { readonly title: string; readonly privacy: Privacy }
export type Mark = Setup["marks"][string]

/** The item a picker saves. Present in save mode and in choose mode opened for an item. */
export interface ItemPort {
  membership(): Promise<MembershipAnswer>
  add(id: PlaylistId): Promise<AddAnswer>
  /** `entry` is the entry this picker's own tick added, else null for whatever the Save dialog removes. */
  remove(id: PlaylistId, entry: SetVideoId | null): Promise<RemoveAnswer>
  /** Creates the playlist with the item already in it, in one request. */
  create(playlist: NewPlaylist): Promise<CreateAnswer>
}

/**
 * Everything a picker reads or changes for one account and one open. An account or source change
 * is a new source and a new model. Every method resolves with an answer and never rejects.
 */
export interface PickerSource<Item extends ItemPort | null = ItemPort | null> {
  readonly item: Item
  /** The window is private, so the owner refuses account-setup writes and the last visibility. */
  readonly private: boolean
  /** A tab can serve fresh data for this account. */
  readonly tab: boolean
  readonly creation: "available" | "signedOut" | "noChannel"
  readonly sortAZ: boolean
  /** This device's last visibility for new playlists. */
  readonly privacy: Privacy | null
  readonly quickSave: PlaylistId | null
  /** The setting this picker chooses for: one playlist in choose mode, the auto-add list in many mode. */
  readonly chosen: readonly PlaylistId[]
  /** Keys of playlist shortcuts that are live on the site now. */
  readonly keys: ReadonlyMap<PlaylistId, Key>
  readonly marks: ReadonlyMap<PlaylistId, Mark>
  now(): number
  cachedList(): Promise<Listing | null>
  freshList(): Promise<ListAnswer>
  /** Creates an empty playlist. */
  create(playlist: NewPlaylist): Promise<CreateAnswer>
  pin(id: PlaylistId): Promise<ChangeResult>
  choose(id: PlaylistId, on: boolean): Promise<ChangeResult>
  saveSortAZ(on: boolean): Promise<ChangeResult>
  savePrivacy(privacy: Privacy): Promise<ChangeResult>
}
