import type { AccountCache, CachePlaylist, CreatedPlaylist } from "./account-cache"
import type { PlaylistId } from "./validation"
import type { MembershipRow } from "../contracts/jobs"

declare const playlist: PlaylistId
declare const membership: MembershipRow
const valid: CachePlaylist = { id: playlist, title: "Playlist", count: 3, thumb: "https://img.test/one.jpg" }
const created: CreatedPlaylist = { id: playlist, title: "Created", privacy: "PRIVATE", at: 1 }
// @ts-expect-error A membership result cannot be a persisted cache row.
const membershipCache: CachePlaylist = membership
// @ts-expect-error Membership bits never belong to persisted playlist facts.
const contains: CachePlaylist = { id: playlist, title: "Playlist", contains: true }
// @ts-expect-error Occurrence identifiers never belong to persisted playlist facts.
const occurrences: CachePlaylist = { id: playlist, title: "Playlist", setVideoIds: ["entry"] }
// @ts-expect-error Video identifiers never belong to persisted created rows.
const watched: CreatedPlaylist = { id: playlist, title: "Created", privacy: "PRIVATE", at: 1, videoId: "aaaaaaaaaaa" }
// @ts-expect-error Cache IDs require the existing model's validated brand.
const unvalidated: CachePlaylist = { id: "PL_unvalidated", title: "Playlist" }
// @ts-expect-error AccountCache never includes membership history.
const history: AccountCache = { listAt: null, playlists: [], order: {}, created: [], labelAt: null, membership: [] }
void [valid, created, membershipCache, contains, occurrences, watched, unvalidated, history]
