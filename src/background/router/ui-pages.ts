import {
  isRecentEntry,
  type DeviceSettingAnswer,
  type DeviceSettingChange,
  type FilterSettingAnswer,
  type PageMessages,
  type RecentEntry,
  type UiDiagnostics,
  type UiFeatureHealth,
  type UiSync,
  type UiTabFacts
} from "../../shared/contracts/ui-pages"
import type { SyncJoinOperation, SyncJoinPreparation, SyncJoinResult, SyncJoinReview, SyncJoinSide } from "../store/sync-join-execution"
import type { FilterChannelChange, KeptFiltersResult, LocalFilterChange, LocalFilterWriteResult } from "../store/local-filter-writer"
import type { RemovalConfirmation, RemovalPreparation, RemovalResult } from "../store/account-removal-execution"
import type { SettingsImportConfirmation, SettingsImportPreparation, SettingsImportResult } from "../store/settings-import-execution"
import type { SettingsFileRead } from "../store/settings-file-read"
import type { SettingsPageOrigin, WithdrawalResult } from "../store/store-lifecycle"
import { exportFile } from "../../shared/settings-file"
import type { AgreementAccess, AgreementInput, AgreementResult } from "../store/consent-agreement"
import type { UpgradeNoteFlag, UpgradeNoteFlagResult } from "../store/upgrade-note-flag"
import { projectAgreement } from "./first-run-results"
import type { UiUnavailable } from "../../shared/contracts/ui-playlists"
import type { AccountKey } from "../../shared/model/validation"
import type { RpcHandlers } from "../../shared/rpc/rpc"
import type { UiRequester } from "../adapters/ui-requester"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"
import type { ClaimNoticeAcknowledgement, ClaimNoticeRead, NormalUiOrigin } from "../store/claim-notice"
import type { UnclaimedDiscard } from "../store/local-filter-writer"
import type { ClaimNotice } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import type { ExactRecoveryResult, HeldJobSelection, HeldWorkRead, HeldWorkView, WithdrawnWorkReview } from "../store/consent-recovery"
import type { UiPausedJob } from "../../shared/contracts/ui-pages"
import { isAccountKey } from "../../shared/model/validation"

/** The paused jobs Privacy & data can continue, named for the user; work the store can't recover shows nothing to continue (R167). */
function pausedJobs(work: readonly HeldWorkView[]): { readonly job: UiPausedJob; readonly selection: HeldJobSelection }[] {
  return work.flatMap((view, index) => {
    if (view.kind === "unsupported") return []
    const id = String(index + 1)
    const job: UiPausedJob["job"] =
      view.kind === "account-removal"
        ? "removal"
        : view.kind === "sync-reset"
          ? "sync"
          : view.kind === "key-settings" || view.kind === "feature-settings"
            ? "settings"
            : view.kind === "settings-import"
              ? "import"
              : "migration"
    const acct = view.kind === "account-removal" && isAccountKey(view.record.acct) ? view.record.acct : null
    return [{ job: { id, job, acct }, selection: view.selection }]
  })
}

// A join that read changed storage, an incomplete copy or a reset history can simply be tried again (SYNC-08, SYNC-13).
const changedJoin = new Set(["stale", "changed-generation", "incomplete", "ambiguous-history", "reset", "inventory"])
function syncAnswer(result: Exclude<SyncJoinPreparation, { kind: "automatic" | "choice-required" }> | SyncJoinResult): UiSync {
  switch (result.kind) {
    case "committed":
      return { kind: "on" }
    case "cancelled":
      return { kind: "off" }
    case "unconfirmed":
      return { kind: "refused", reason: "unconfirmed" }
    case "failed":
      return { kind: "refused", reason: "failed" }
    case "unavailable":
      return { kind: "refused", reason: changedJoin.has(result.reason) ? "changed" : "failed" }
    case "refused": {
      if (result.reason !== "sync-full") return { kind: "refused", reason: result.reason === "update-needed" ? "update-needed" : "failed" }
      const largest = result.quota?.largest
      return {
        kind: "refused",
        reason: "sync-full",
        largest: largest && (largest.kind === "settings" || largest.kind === "setup" || largest.kind === "filter") ? { kind: largest.kind, bytes: largest.bytes } : null
      }
    }
  }
}

type UiOrigin = { readonly kind: "ui"; readonly windowId: number; readonly incognito: boolean }
export type PageStatusSource = (ui: UiRequester) => Promise<{ readonly tab: UiTabFacts; readonly health: readonly UiFeatureHealth[] } | undefined>
export type PageReceiverPorts = {
  readonly owner: {
    readSession(): Promise<SessionRead>
    changeSession(change: SessionChange): Promise<SessionWrite>
    changeDeviceSetting(origin: UiOrigin, change: DeviceSettingChange): Promise<DeviceSettingAnswer>
    change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
    changeFilterChannel(origin: UiOrigin, change: FilterChannelChange): Promise<LocalFilterWriteResult>
    removeKeptFilters(origin: UiOrigin): Promise<KeptFiltersResult>
    prepareAccountRemoval(origin: UiOrigin, acct: AccountKey): Promise<RemovalPreparation>
    removeAccountSetup(origin: UiOrigin, confirmation: RemovalConfirmation): Promise<RemovalResult>
    exportSettings(origin: UiOrigin): Promise<SettingsFileRead>
    prepareSettingsImport(origin: UiOrigin, text: unknown): Promise<SettingsImportPreparation>
    importSettings(origin: UiOrigin, input: { readonly confirmation: SettingsImportConfirmation; readonly replace: "confirmed" }): Promise<SettingsImportResult>
    markUpgradeNote(flag: UpgradeNoteFlag): Promise<UpgradeNoteFlagResult>
    readAgreement(origin: UiOrigin): Promise<import("../store/consent-agreement").AgreementRead>
    agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult>
    readClaimNotice(): Promise<ClaimNoticeRead>
    acknowledgeClaimNotice(origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>): Promise<ClaimNoticeAcknowledgement>
    discardUnclaimed(origin: UiOrigin): Promise<UnclaimedDiscard>
    readWithdrawnWork(origin: UiOrigin): Promise<HeldWorkRead>
    recoverWithdrawnWork(origin: UiOrigin, input: { readonly review: WithdrawnWorkReview; readonly job: HeldJobSelection }): Promise<ExactRecoveryResult>
    beginSyncJoin(origin: UiOrigin): SyncJoinOperation
    applySyncJoin(
      origin: UiOrigin,
      input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }
    ): Promise<SyncJoinResult>
    cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
    resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
    /** Starts listening and pushing once a join commits; the store starts sync only at its own start (SYNC-06). */
    startSync(): Promise<void>
  }
  readonly readAccess: () => Promise<AgreementAccess | undefined>
  readonly withdraw: (origin: SettingsPageOrigin, expected: { readonly v: number; readonly at: number }) => Promise<WithdrawalResult>
  /** The version a settings file names (DATA-53). */
  readonly version: () => string
  /** Raw `storage.session` reads, for the recent adds the session planner keeps but doesn't decode. */
  readonly session: { get(key: "recentAdds"): Promise<unknown> }
  readonly status: PageStatusSource
  /** The Monitor's session evidence for Diagnostics, and Check now (HEALTH-22, HEALTH-23). Without it the route answers unavailable. */
  readonly diagnostics?: (ui: UiRequester, check: boolean) => Promise<UiDiagnostics>
  readonly now: () => number
}
export type PageContext = { readonly ui: UiRequester; readonly current: () => Promise<UiRequester | undefined> }
const unavailable = (reason: UiUnavailable["reason"]): UiUnavailable => ({ kind: "unavailable", reason })

function filterAnswer(answer: LocalFilterWriteResult): FilterSettingAnswer {
  if (answer.kind === "unconfirmed") return { kind: "refused", reason: "unconfirmed" }
  if (answer.kind === "unavailable") return { kind: "refused", reason: answer.reason === "newer-layout" ? "update-needed" : "unavailable" }
  return "ok" in answer.result ? { kind: "confirmed" } : { kind: "refused", reason: answer.result.refused }
}

function recentEntry(raw: unknown, acct: AccountKey): RecentEntry | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return
  const row = raw as Record<string, unknown>
  if (row.acct !== acct) return
  const videos = row.kind === "gather" ? row.videos : row.kind === "single" ? [row.video] : undefined
  const entry = { at: row.at, source: row.source, playlists: row.playlists, videos, gather: row.kind === "gather" }
  return isRecentEntry(entry) ? structuredClone(entry) : undefined
}

/** The page routes the popup and settings need besides the store's own changes (06 §6.8.3). */
export function createPageReceiver(ports: PageReceiverPorts): RpcHandlers<PageMessages, PageContext> {
  // A confirmation stays with the principal that asked for it, so another page can't confirm it (ARC-MSG-04).
  const removals = new Map<string, { readonly principal: string; readonly confirmation: RemovalConfirmation }>()
  const imports = new Map<string, { readonly principal: string; readonly confirmation: SettingsImportConfirmation }>()
  const remember = <T>(store: Map<string, { readonly principal: string; readonly confirmation: T }>, principal: string, confirmation: T) => {
    if (store.size >= 32) store.delete(store.keys().next().value!)
    const token = crypto.randomUUID()
    store.set(token, { principal, confirmation })
    return token
  }
  // The join question waits on the page that asked it; a page that never answers lets its review go once 32 newer ones arrive.
  const joins = new Map<string, { readonly principal: string; readonly review: SyncJoinReview; readonly operation: SyncJoinOperation }>()
  function rememberJoin(principal: string, review: SyncJoinReview, operation: SyncJoinOperation) {
    if (joins.size >= 32) {
      const [oldest, entry] = joins.entries().next().value!
      joins.delete(oldest)
      entry.operation.cancel()
    }
    const token = crypto.randomUUID()
    joins.set(token, { principal, review, operation })
    return token
  }
  function takeJoin(token: string | null, principal: string) {
    const saved = token === null ? undefined : joins.get(token)
    if (token !== null) joins.delete(token)
    return saved && saved.principal === principal ? saved : undefined
  }
  async function joined(result: SyncJoinResult): Promise<UiSync> {
    if (result.kind === "committed") void ports.owner.startSync().catch(() => {})
    return syncAnswer(result)
  }
  const settingsPage = (context: PageContext) => context.ui.ui.page === "settings"
  // A Continue resumes only the job the same page read, against the review it read (R167).
  const paused = new Map<string, { readonly review: WithdrawnWorkReview; readonly selections: ReadonlyMap<string, HeldJobSelection> }>()
  async function readPaused(context: PageContext) {
    const read = await ports.owner.readWithdrawnWork(context.ui.ui.origin)
    if (read.kind !== "held") {
      paused.delete(context.ui.principal)
      return read.kind === "none" ? [] : undefined
    }
    const jobs = pausedJobs(read.work)
    if (paused.size >= 32 && !paused.has(context.ui.principal)) paused.delete(paused.keys().next().value!)
    paused.set(context.ui.principal, { review: read.review, selections: new Map(jobs.map(entry => [entry.job.id, entry.selection])) })
    return jobs.map(entry => entry.job)
  }
  async function changeSession(edit: SessionChange["edits"][0]): Promise<SessionWrite | undefined> {
    const read = await ports.owner.readSession()
    if (read.kind !== "memory") return
    return ports.owner.changeSession({ revision: read.revision, now: ports.now(), edits: [edit] })
  }
  return {
    async "ui.status"(_payload, context) {
      const [read, facts] = await Promise.all([ports.owner.readSession(), ports.status(context.ui)])
      if (read.kind !== "memory" || !facts) return unavailable("owner")
      return (await context.current()) ? { kind: "status", paused: read.memory.paused, tab: facts.tab, health: facts.health } : unavailable("operation")
    },
    async "ui.pause"(payload, context) {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "unavailable" }
      const write = await changeSession({ kind: "pause", paused: payload.paused })
      if (!write || write.kind === "unavailable") return { kind: "refused", reason: "unavailable" }
      if (write.kind !== "committed") return { kind: "refused", reason: "unconfirmed" }
      return { kind: "paused", paused: write.memory.paused }
    },
    async "ui.recentAdds"(payload, context) {
      let raw: unknown
      try {
        raw = await ports.session.get("recentAdds")
      } catch {
        return unavailable("owner")
      }
      const rows = Array.isArray(raw) ? raw : []
      const entries = rows.flatMap(row => recentEntry(row, payload.acct) ?? []).slice(0, 50)
      return (await context.current()) ? { kind: "recent", entries } : unavailable("operation")
    },
    async "ui.filter"({ change }, context): Promise<FilterSettingAnswer> {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const request: LocalFilterChange = change.clearListed
        ? { acct: change.acct, playlist: change.playlist, desired: change.desired, clearListedChannels: "confirmed", expectedGeneration: change.expectedGeneration }
        : { acct: change.acct, playlist: change.playlist, desired: change.desired, clearListedChannels: "not-confirmed" }
      return filterAnswer(await ports.owner.change(context.ui.ui.origin, request))
    },
    async "ui.filterChannel"({ change }, context): Promise<FilterSettingAnswer> {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const { clearListed, expectedGeneration, ...rest } = change
      const request: FilterChannelChange = clearListed ? { ...rest, clearListedChannels: "confirmed", expectedGeneration } : { ...rest, clearListedChannels: "not-confirmed" }
      return filterAnswer(await ports.owner.changeFilterChannel(context.ui.ui.origin, request))
    },
    async "ui.removeKeptFilters"(_payload, context) {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const answer = await ports.owner.removeKeptFilters(context.ui.ui.origin)
      if (answer.kind === "removed") return answer
      return { kind: "refused", reason: answer.kind === "unconfirmed" ? "unconfirmed" : "unavailable" }
    },
    async "ui.diagnostics"({ check }, context) {
      if (!ports.diagnostics) return unavailable("collaborator")
      const answer = await ports.diagnostics(context.ui, check)
      return (await context.current()) ? answer : unavailable("operation")
    },
    async "ui.withdraw"({ expected }, context) {
      if (!settingsPage(context)) return unavailable("operation")
      const result = await ports.withdraw({ kind: "ui", page: "settings", origin: context.ui.ui.origin }, expected)
      switch (result.kind) {
        case "withdrawn":
          return { kind: "withdrawn" }
        case "unchanged":
          return { kind: "refused", reason: "not-agreed" }
        case "unconfirmed":
          return { kind: "refused", reason: "unconfirmed" }
        case "failed":
          return { kind: "refused", reason: "failed" }
        default:
          return { kind: "refused", reason: "unavailable" }
      }
    },
    async "ui.removeSetup"(payload, context) {
      if (!settingsPage(context)) return unavailable("operation")
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const origin = context.ui.ui.origin
      if (payload.action === "prepare") {
        const prepared = await ports.owner.prepareAccountRemoval(origin, payload.acct)
        if (prepared.kind === "confirmation-required") return { kind: "confirm", token: remember(removals, context.ui.principal, prepared.confirmation), scope: prepared.scope.kind }
        if (prepared.kind === "unchanged") return { kind: "unchanged" }
        return prepared.kind === "result" ? { kind: "refused", reason: prepared.result.refused } : { kind: "refused", reason: prepared.kind === "failed" ? "failed" : "unavailable" }
      }
      const saved = removals.get(payload.token)
      removals.delete(payload.token)
      if (!saved || saved.principal !== context.ui.principal) return unavailable("operation")
      const result = await ports.owner.removeAccountSetup(origin, saved.confirmation)
      switch (result.kind) {
        case "committed":
          return { kind: "removed" }
        case "unchanged":
          return { kind: "unchanged" }
        case "result":
          return { kind: "refused", reason: result.result.refused }
        case "unconfirmed":
          return { kind: "refused", reason: "unconfirmed" }
        case "failed":
          return { kind: "refused", reason: "failed" }
        default:
          return { kind: "refused", reason: "unavailable" }
      }
    },
    async "ui.exportSettings"(_payload, context) {
      if (!settingsPage(context)) return unavailable("operation")
      const read = await ports.owner.exportSettings(context.ui.ui.origin)
      if (read.kind !== "source") return { kind: "refused" }
      const file = exportFile({ source: read.source, version: ports.version(), date: new Date(ports.now()).toISOString().slice(0, 10) })
      return file.kind === "exported" ? { kind: "file", filename: file.file.filename, text: file.file.text } : { kind: "refused" }
    },
    async "ui.importSettings"(payload, context) {
      if (!settingsPage(context)) return unavailable("operation")
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const origin = context.ui.ui.origin
      if (payload.action === "prepare") {
        const prepared = await ports.owner.prepareSettingsImport(origin, payload.text)
        if (prepared.kind === "confirmation-required") return { kind: "confirm", token: remember(imports, context.ui.principal, prepared.confirmation), accounts: prepared.scope.accounts.length }
        if (prepared.kind === "refused")
          return {
            kind: "refused",
            reason: prepared.reason === "private" ? "private" : prepared.reason === "invalid" ? "invalid-file" : prepared.reason === "update-needed" ? "newer-format" : "failed"
          }
        return { kind: "refused", reason: "unavailable" }
      }
      const saved = imports.get(payload.token)
      imports.delete(payload.token)
      if (!saved || saved.principal !== context.ui.principal) return unavailable("operation")
      const result = await ports.owner.importSettings(origin, { confirmation: saved.confirmation, replace: "confirmed" })
      return result.kind === "committed" ? { kind: "imported" } : { kind: "refused", reason: result.kind === "unavailable" ? "unavailable" : "failed" }
    },
    async "ui.noteSeen"(_payload, context) {
      if (context.ui.ui.page !== "onboarding") return { kind: "unavailable" }
      const result = await ports.owner.markUpgradeNote("seen")
      return { kind: result === "set" || result === "unchanged" ? "noted" : "unavailable" }
    },
    async "ui.noteAgree"({ change }, context) {
      const refusal = (reason: "invalid" | "unavailable" | "update-needed" | "rejected") => ({ kind: "not-agreed", attempt: change.attempt, reason }) as const
      if (context.ui.ui.page !== "onboarding" || context.ui.requester.incognito) return refusal("unavailable")
      const origin = context.ui.ui.origin
      try {
        const read = await ports.owner.readAgreement(origin)
        if (read.kind !== "review") return refusal(read.kind === "invalid" ? "invalid" : "unavailable")
        if (read.version !== change.displayedVersion) return refusal("update-needed")
        if (read.presentation.kind !== "canonical" || read.presentation.note?.state !== "pending") return refusal("unavailable")
        const access = await ports.readAccess()
        if (!access) return refusal("unavailable")
        const result = await ports.owner.agree(origin, {
          review: read.review,
          displayedVersion: change.displayedVersion,
          access: Promise.resolve(access),
          choice: change.syncOn
            ? { kind: "upgrade-note", selected: change.selected, syncOn: true, join: { kind: "prepare" }, percentage: change.percentage }
            : { kind: "upgrade-note", selected: change.selected, syncOn: false, percentage: change.percentage }
        })
        if (result.kind === "joined") void ports.owner.startSync().catch(() => {})
        return projectAgreement({ kind: "first-run-agree", displayedVersion: change.displayedVersion, attempt: change.attempt, selected: change.selected, syncOn: change.syncOn }, result, access)
      } catch {
        return refusal("rejected")
      }
    },
    async "ui.heldAgree"(payload, context) {
      if (context.ui.ui.page !== "onboarding") return { kind: "refused", reason: "unavailable" }
      const origin = context.ui.ui.origin
      const read = await ports.owner.readAgreement(origin)
      if (read.kind !== "review") return { kind: "refused", reason: "unavailable" }
      if (read.presentation.kind !== "held") return { kind: "not-held" }
      const paused = pausedJobs(read.presentation.work).length
      if (payload.action === "read") return { kind: "held", paused }
      if (payload.displayedVersion !== read.version) return { kind: "refused", reason: "update-needed" }
      const access = await ports.readAccess()
      if (!access) return { kind: "refused", reason: "unavailable" }
      const result = await ports.owner.agree(origin, { review: read.review, displayedVersion: payload.displayedVersion, choice: { kind: "disclosure" }, access: Promise.resolve(access) })
      if (result.kind === "committed") return { kind: "agreed", paused }
      if (result.kind === "unconfirmed" || result.kind === "failed") return { kind: "refused", reason: result.kind }
      return { kind: "refused", reason: result.kind === "unavailable" && result.reason === "newer-consent" ? "update-needed" : "unavailable" }
    },
    async "ui.pausedWork"(payload, context) {
      if (!settingsPage(context)) return { kind: "refused", reason: "unavailable" }
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      if (payload.action === "read") {
        const jobs = await readPaused(context)
        return jobs ? { kind: "work", jobs } : { kind: "refused", reason: "unavailable" }
      }
      const saved = paused.get(context.ui.principal),
        selection = saved?.selections.get(payload.id)
      if (!saved || !selection) return { kind: "refused", reason: "unavailable" }
      const result = await ports.owner.recoverWithdrawnWork(context.ui.ui.origin, { review: saved.review, job: selection })
      const jobs = (await readPaused(context)) ?? []
      const kind = result.kind
      if (kind === "recovered" || kind === "key-settings-recovered" || kind === "feature-settings-recovered") return { kind: "continued", jobs }
      return { kind: "refused", reason: kind === "authorized-pending" || kind === "key-settings-pending" || kind === "feature-settings-pending" ? "unconfirmed" : "failed" }
    },
    // SYNC-25: the switch and the join question work from a private window too.
    async "ui.sync"(payload, context) {
      if (!settingsPage(context)) return unavailable("operation")
      const origin = context.ui.ui.origin,
        principal = context.ui.principal
      switch (payload.action) {
        case "join": {
          const operation = ports.owner.beginSyncJoin(origin)
          const prepared = await operation.result
          if (prepared.kind === "automatic") return joined(await ports.owner.applySyncJoin(origin, { kind: "automatic", review: prepared.review }))
          if (prepared.kind === "choice-required") return { kind: "choose", token: rememberJoin(principal, prepared.review, operation) }
          // Switching on again is the explicit action an interrupted join waits for before it finishes.
          if (prepared.kind === "unavailable" && prepared.reason === "pending-join") return joined(await ports.owner.resumeSyncJoin(origin))
          return syncAnswer(prepared)
        }
        case "choose": {
          const saved = takeJoin(payload.token, principal)
          if (!saved) return unavailable("operation")
          return joined(await ports.owner.applySyncJoin(origin, { kind: "choice", review: saved.review, choice: payload.choice }))
        }
        case "cancel": {
          takeJoin(payload.token, principal)?.operation.cancel()
          return syncAnswer(await ports.owner.cancelSyncJoin(origin))
        }
        case "off":
          return syncAnswer(await ports.owner.cancelSyncJoin(origin))
      }
    },
    async "ui.claimSeen"({ acct }, context) {
      const origin = context.ui.ui.origin
      if (origin.incognito) return { kind: "unavailable" }
      const read = await ports.owner.readClaimNotice()
      if (read.kind !== "pending" || read.notice.acct !== acct) return { kind: "unavailable" }
      const result = await ports.owner.acknowledgeClaimNotice({ ...origin, incognito: false }, read.notice)
      return { kind: result.kind === "committed" || result.kind === "unchanged" ? "noted" : "unavailable" }
    },
    async "ui.discardUnclaimed"(_payload, context) {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const result = await ports.owner.discardUnclaimed(context.ui.ui.origin)
      return result.kind === "discarded" || result.kind === "absent" ? { kind: result.kind } : { kind: "refused", reason: result.kind === "failed" ? "failed" : "unavailable" }
    },
    async "ui.device"(payload, context) {
      const origin = context.ui.ui.origin
      const answer = await ports.owner.changeDeviceSetting(origin, payload.change)
      if (answer.kind === "confirmed" && answer.change.field === "recentAdds" && answer.change.value === false) await changeSession({ kind: "recent-adds-clear" })
      return answer
    }
  }
}
