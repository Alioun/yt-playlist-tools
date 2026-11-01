import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import type { JobInvocation, JobOf } from "../../shared/contracts/jobs"
import type { Tabs } from "../tabs/ports"
import type { PlaylistCacheOwner, PlaylistCacheCapture } from "../store/playlist-cache"
import type { Playlists, AbsorbScope } from "./playlists"

declare const service: Playlists
declare const owner: PlaylistCacheOwner
declare const acct: AccountKey
declare const video: VideoId
declare const playlist: PlaylistId
declare const tabs: Pick<Tabs, "serve" | "runIn">
declare const privateScope: Extract<AbsorbScope, { kind: "caller-owned" }>
declare const accountA: AccountKey & { readonly fixture: "A" }
declare const accountB: AccountKey & { readonly fixture: "B" }
declare const capturedA: PlaylistCacheCapture<typeof accountA>
const pinned: JobInvocation<JobOf<"playlists">> = { job: { kind: "playlists" }, acct }
const creation: JobInvocation<JobOf<"create">> = { job: { kind: "create", title: "Created", privacy: "PRIVATE", videoId: video }, acct }
// @ts-expect-error Playlist jobs must pin the authenticated account.
const unpinned: JobInvocation<JobOf<"playlists">> = { job: { kind: "playlists" } }
// @ts-expect-error A channel resolver is account-free and cannot take an account body claim.
const claimed: JobInvocation<JobOf<"resolveChannel">> = { job: { kind: "resolveChannel", input: "@channel" }, acct }
// @ts-expect-error A private or no-Setup scope has no persistence capture.
void owner.absorbPlaylistCache(privateScope.capture, { kind: "membership", acct, site: "www", at: 1, rows: [] })
// @ts-expect-error A capture for a known account subtype cannot absorb a different account subtype.
void owner.absorbPlaylistCache(capturedA, { kind: "list", acct: accountB, site: "www", at: 1, rows: [] })
// @ts-expect-error Created cache facts require the confirmed playlist ID, not a video ID.
void owner.absorbPlaylistCache(capturedA, { kind: "created", acct: accountA, site: "www", at: 1, row: { id: video, title: "Created", privacy: "PRIVATE" } })
// @ts-expect-error Account strings require model validation.
void service.list("AAAAAAAAAAAAAAAA", { site: "www", req: { windowId: 1, incognito: false, activeTabId: 1 } })
// @ts-expect-error Tabs selection must use its actual authenticated Requester shape.
void tabs.serve(pinned, { site: "www", req: { windowId: 1 }, account: { kind: "account", acct, signedIn: true } })
void [pinned, creation, unpinned, claimed]
// @ts-expect-error A membership row cannot use a video ID as its playlist ID.
void owner.absorbPlaylistCache(capturedA, { kind: "membership", acct: accountA, site: "www", at: 1, rows: [{ id: video, title: "Invalid", contains: true }] })
// @ts-expect-error Playlist metadata counts are numbers, never arbitrary payloads.
void owner.absorbPlaylistCache(capturedA, { kind: "list", acct: accountA, site: "www", at: 1, rows: [{ id: playlist, title: "Invalid", count: "many" }] })
// @ts-expect-error A membership absorption requires the actual contains field.
void owner.absorbPlaylistCache(capturedA, { kind: "membership", acct: accountA, site: "www", at: 1, rows: [{ id: playlist, title: "Missing membership fact" }] })
