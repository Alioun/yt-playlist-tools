import { isRecentEntry, type DeviceSettingAnswer, type DeviceSettingChange, type FilterSettingAnswer, type PageMessages, type RecentEntry, type UiFeatureHealth, type UiTabFacts } from "../../shared/contracts/ui-pages"
import type { LocalFilterChange, LocalFilterWriteResult } from "../store/local-filter-writer"
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

type UiOrigin = { readonly kind: "ui"; readonly windowId: number; readonly incognito: boolean }
export type PageStatusSource = (ui: UiRequester) => Promise<{ readonly tab: UiTabFacts; readonly health: readonly UiFeatureHealth[] } | undefined>
export type PageReceiverPorts = {
  readonly owner: {
    readSession(): Promise<SessionRead>
    changeSession(change: SessionChange): Promise<SessionWrite>
    changeDeviceSetting(origin: UiOrigin, change: DeviceSettingChange): Promise<DeviceSettingAnswer>
    change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
    prepareAccountRemoval(origin: UiOrigin, acct: AccountKey): Promise<RemovalPreparation>
    removeAccountSetup(origin: UiOrigin, confirmation: RemovalConfirmation): Promise<RemovalResult>
    exportSettings(origin: UiOrigin): Promise<SettingsFileRead>
    prepareSettingsImport(origin: UiOrigin, text: unknown): Promise<SettingsImportPreparation>
    importSettings(origin: UiOrigin, input: { readonly confirmation: SettingsImportConfirmation; readonly replace: "confirmed" }): Promise<SettingsImportResult>
    markUpgradeNote(flag: UpgradeNoteFlag): Promise<UpgradeNoteFlagResult>
    readAgreement(origin: UiOrigin): Promise<import("../store/consent-agreement").AgreementRead>
    agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult>
  }
  readonly readAccess: () => Promise<AgreementAccess | undefined>
  readonly withdraw: (origin: SettingsPageOrigin, expected: { readonly v: number; readonly at: number }) => Promise<WithdrawalResult>
  /** The version a settings file names (DATA-53). */
  readonly version: () => string
  /** Raw `storage.session` reads, for the recent adds the session planner keeps but doesn't decode. */
  readonly session: { get(key: "recentAdds"): Promise<unknown> }
  readonly status: PageStatusSource
  readonly now: () => number
}
export type PageContext = { readonly ui: UiRequester; readonly current: () => Promise<UiRequester | undefined> }
const unavailable = (reason: UiUnavailable["reason"]): UiUnavailable => ({ kind: "unavailable", reason })

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
  const settingsPage = (context: PageContext) => context.ui.ui.page === "settings"
  async function changeSession(edit: SessionChange["edits"][0]): Promise<SessionWrite | undefined> {
    const read = await ports.owner.readSession()
    if (read.kind !== "memory") return
    return ports.owner.changeSession({ revision: read.revision, now: ports.now(), edits: [edit] })
  }
  return {
    async "ui.status"(_payload, context) {
      const [read, facts] = await Promise.all([ports.owner.readSession(), ports.status(context.ui)])
      if (read.kind !== "memory" || !facts) return unavailable("owner")
      return await context.current() ? { kind: "status", paused: read.memory.paused, tab: facts.tab, health: facts.health } : unavailable("operation")
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
      try { raw = await ports.session.get("recentAdds") } catch { return unavailable("owner") }
      const rows = Array.isArray(raw) ? raw : []
      const entries = rows.flatMap(row => recentEntry(row, payload.acct) ?? []).slice(0, 50)
      return await context.current() ? { kind: "recent", entries } : unavailable("operation")
    },
    async "ui.filter"({ change }, context): Promise<FilterSettingAnswer> {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "private" }
      const request: LocalFilterChange = change.clearListed
        ? { acct: change.acct, playlist: change.playlist, desired: change.desired, clearListedChannels: "confirmed", expectedGeneration: change.expectedGeneration }
        : { acct: change.acct, playlist: change.playlist, desired: change.desired, clearListedChannels: "not-confirmed" }
      const answer = await ports.owner.change(context.ui.ui.origin, request)
      if (answer.kind === "unconfirmed") return { kind: "refused", reason: "unconfirmed" }
      if (answer.kind === "unavailable") return { kind: "refused", reason: answer.reason === "newer-layout" ? "update-needed" : "unavailable" }
      return "ok" in answer.result ? { kind: "confirmed" } : { kind: "refused", reason: answer.result.refused }
    },
    async "ui.withdraw"({ expected }, context) {
      if (!settingsPage(context)) return unavailable("operation")
      const result = await ports.withdraw({ kind: "ui", page: "settings", origin: context.ui.ui.origin }, expected)
      switch (result.kind) {
        case "withdrawn": return { kind: "withdrawn" }
        case "unchanged": return { kind: "refused", reason: "not-agreed" }
        case "unconfirmed": return { kind: "refused", reason: "unconfirmed" }
        case "failed": return { kind: "refused", reason: "failed" }
        default: return { kind: "refused", reason: "unavailable" }
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
        case "committed": return { kind: "removed" }
        case "unchanged": return { kind: "unchanged" }
        case "result": return { kind: "refused", reason: result.result.refused }
        case "unconfirmed": return { kind: "refused", reason: "unconfirmed" }
        case "failed": return { kind: "refused", reason: "failed" }
        default: return { kind: "refused", reason: "unavailable" }
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
        if (prepared.kind === "refused") return { kind: "refused", reason: prepared.reason === "private" ? "private" : prepared.reason === "invalid" ? "invalid-file" : prepared.reason === "update-needed" ? "newer-format" : "failed" }
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
        const result = await ports.owner.agree(origin, { review: read.review, displayedVersion: change.displayedVersion, access: Promise.resolve(access),
          choice: change.syncOn ? { kind: "upgrade-note", selected: change.selected, syncOn: true, join: { kind: "prepare" }, percentage: change.percentage }
            : { kind: "upgrade-note", selected: change.selected, syncOn: false, percentage: change.percentage } })
        return projectAgreement({ kind: "first-run-agree", displayedVersion: change.displayedVersion, attempt: change.attempt, selected: change.selected, syncOn: change.syncOn }, result, access)
      } catch { return refusal("rejected") }
    },
    async "ui.device"(payload, context) {
      const origin = context.ui.ui.origin
      const answer = await ports.owner.changeDeviceSetting(origin, payload.change)
      if (answer.kind === "confirmed" && answer.change.field === "recentAdds" && answer.change.value === false) await changeSession({ kind: "recent-adds-clear" })
      return answer
    }
  }
}
