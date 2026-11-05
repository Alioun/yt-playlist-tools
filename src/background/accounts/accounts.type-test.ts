import type { AccountKey, AccountLabel, PlaylistId } from "../../shared/model"
import type { JobInvocation, JobOf, JobResult } from "../../shared/contracts/jobs"
import type { RouteId } from "../../shared/contracts/identifiers"
import type { TabContext } from "../tabs/ports"
import type { AccountLabelsOwner, AccountLabelWrite } from "../store/account-label"
import type { PlaylistCacheCapture } from "../store/playlist-cache"
import type { Accounts, Claiming, LiveLabel, SeenAccount } from "./accounts"

declare const accounts: Accounts
declare const owner: AccountLabelsOwner
declare const context: TabContext
declare const acct: AccountKey
declare const playlist: PlaylistId
declare const route: RouteId
declare const live: Extract<LiveLabel, { kind: "label" }>
declare const write: AccountLabelWrite
declare const seen: SeenAccount
declare const accountA: AccountKey & { readonly fixture: "A" }
declare const accountB: AccountKey & { readonly fixture: "B" }
declare const captureA: PlaylistCacheCapture<typeof accountA>
const pinned: JobInvocation<JobOf<"accountLabel">> = { job: { kind: "accountLabel" }, acct }
void accounts.onSeen(context)
void owner.seeAccountLabel({ acct, private: false, at: 1 })
void owner.completeAccountLabel(captureA, { acct: accountA, label: { name: "Known" } })
// @ts-expect-error Raw account strings require validated account-key authority.
void owner.seeAccountLabel({ acct: "AAAAAAAAAAAAAAAA", private: false, at: 1 })
// @ts-expect-error Private contexts cannot enter the persistent seen-account operation.
void owner.seeAccountLabel({ acct, private: true, at: 1 })
// @ts-expect-error Body-supplied identity, privacy and tab ID are not a TabContext.
void accounts.onSeen({ acct, private: false, tabId: 1 })
// @ts-expect-error Live caller-owned labels contain no owner persistence capture.
void owner.completeAccountLabel(live.capture, { acct, label: live.label })
// @ts-expect-error A known account-A capture cannot complete for known account B.
void owner.completeAccountLabel(captureA, { acct: accountB, label: { name: "Wrong account" } })
// @ts-expect-error The account-label job always pins the authenticated account.
const unpinned: JobInvocation<JobOf<"accountLabel">> = { job: { kind: "accountLabel" } }
// @ts-expect-error Playlist rows are not account-label results.
const wrongJob: JobResult<JobOf<"accountLabel">> = { ok: true, data: [{ id: playlist, title: "Playlist" }], route }
// @ts-expect-error The real owner result must be narrowed before claiming confirmation.
const optimistic: Extract<AccountLabelWrite, { kind: "committed" | "current" }> = write
// @ts-expect-error A result with held claiming is not the complete Accounts service.
const fakeClaim: { readonly kind: "owner"; readonly result: { readonly kind: "committed" } } = seen.claim
// @ts-expect-error Claiming must explicitly declare its unavailable or connected state.
const omittedClaim: Claiming = {}
// @ts-expect-error Label display data never establishes playlist ownership.
const owned: { readonly ownedPlaylistIds: ReadonlySet<PlaylistId> } = live.label
// @ts-expect-error Account labels require a name, not an arbitrary playlist title.
const titleLabel: AccountLabel = { title: "Playlist" }
void [pinned, unpinned, wrongJob, optimistic, fakeClaim, omittedClaim, owned, titleLabel]
