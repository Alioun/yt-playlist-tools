import { decodeDocument, decodeSettings, decodeSetup, DOCUMENT_VERSION, parseDocumentKey, documentKey, isShortcutId,
  type AccountKey, type ShortcutId, type Shortcut } from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { type JsonObject } from "../../shared/contracts/json"
import { isKeySettingChange, type KeySettingChange, type KeySettingAnswer, type KeySettingRefusal } from "../../shared/contracts/key-settings"
import { conflictObservations, planKeySetting, sameKey } from "./key-settings"
import type { SettingsMutationDependencies } from "./feature-settings-mutation"
import { executeKeySettingsMutation } from "./key-settings-mutation"
import { planSyncWrite, sameSyncJson, type SyncWritePlanInput } from "./sync-write-admission"
import { prepareFirstEditHistory } from "./first-edit-provenance"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { commitKeySettings, readKeySettingsProgress, keySettingsProgressKey, type AcceptedKeySettings } from "./key-settings-progress"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"

type UndoTarget = { readonly acct: AccountKey; readonly playlist: string; readonly revision: number }
type UndoCapture = { readonly principal: string; readonly row: Shortcut; readonly index: number; readonly previous: string | undefined;
  readonly next: string | undefined; readonly targets: readonly UndoTarget[]; readonly expires: number; readonly reset: number;
  readonly authority: JsonObject; consumed: boolean }
export type KeySettingsExecutionResult = { readonly answer: KeySettingAnswer; readonly settingsChanged: boolean; readonly accounts: readonly AccountKey[];
  readonly uncertain: boolean }
type Dependencies = SettingsMutationDependencies & {
  readonly monotonic: () => number; readonly allocate: () => string; readonly resetRevision: () => number; readonly accountRevision: (acct: AccountKey) => number
}
const result = (answer: KeySettingAnswer): KeySettingsExecutionResult => ({ answer, settingsChanged: false, accounts: [], uncertain: false })
const refused = (reason: KeySettingRefusal) => result({ kind: "refused", reason })

function project(write: LocalSettingsWriteResult): KeySettingsExecutionResult {
  if (write.kind === "result") return refused(write.result.refused === "sync-full" || write.result.refused === "update-needed" ? write.result.refused : "invalid")
  if (write.kind === "unavailable") return refused(write.reason === "stale" ? "stale" : "unavailable")
  if (write.kind === "failed") return { ...refused("rejected"), uncertain: write.stage === "set" }
  return { ...refused("unconfirmed"), uncertain: true }
}
function authorityOf(records: JsonObject): JsonObject | undefined {
  const read = readConsentDevice(records)
  if (read.kind !== "supported" || !read.device.consent || read.control && read.control.state.kind !== "agreed") return
  return { schema: records.schema!, device: read.device.id, consent: read.device.consent, syncOn: read.device.syncOn,
    control: records["consent:state"] ?? null }
}
function sameRow(left: Shortcut, right: Readonly<Shortcut>): boolean {
  return left.id === right.id && sameKey(left.key, right.key) && left.label === right.label && left.watchLaterOnEveryAccount === right.watchLaterOnEveryAccount
}
function withoutMarker(records: JsonObject): JsonObject {
  const copy = structuredClone(records); delete copy[keySettingsProgressKey]; return copy
}

export function createKeySettingsExecution(deps: Dependencies) {
  const undos = new Map<string, UndoCapture>()
  let lastTime = -1
  function time(): number | undefined {
    const now = deps.monotonic()
    if (!Number.isFinite(now) || now < 0 || now < lastTime) { undos.clear(); lastTime = now; return }
    lastTime = now
    for (const [id, capture] of undos) if (capture.consumed || now >= capture.expires) undos.delete(id)
    return now
  }
  function revoke() { undos.clear() }
  function invalidateAccount(acct: AccountKey) {
    for (const [id, capture] of undos) if (capture.targets.some(target => target.acct === acct)) undos.delete(id)
  }
  async function ordinary(change: Exclude<KeySettingChange, { kind: "shortcut-remove" | "shortcut-undo" }>): Promise<KeySettingsExecutionResult> {
    const planning: { value?: ReturnType<typeof planKeySetting> } = {}
    const write = await executeKeySettingsMutation(deps, (current, records) => {
      const read = readKeySettingsProgress(records[keySettingsProgressKey])
      if (read.kind !== "absent" && (read.kind !== "valid" || read.record.state !== "terminal")) return { kind: "invalid", reason: "invalid-option" }
      const plan = planKeySetting({ current, records, change, retired: read.kind === "valid" ? read.record.retired : [], allocate: deps.allocate })
      planning.value = plan
      return plan.kind === "answer" ? plan.answer.kind === "confirmed" ? { kind: "unchanged" } : { kind: "invalid", reason: "invalid-option" }
        : { kind: "changed", settings: plan.settings }
    })
    const plan = planning.value
    if (plan?.kind === "answer" && (write.kind === "result" && write.result.refused === "invalid" || write.kind === "unchanged")) return result(plan.answer)
    if (write.kind !== "committed" && write.kind !== "unchanged") return project(write)
    if (!plan || plan.kind !== "edit") return refused("unconfirmed")
    return { answer: plan.added ? { kind: "added", id: plan.added } : { kind: "confirmed", change, status: write.kind === "committed" ? "changed" : "unchanged" },
      settingsChanged: write.kind === "committed", accounts: [], uncertain: false }
  }

  async function batch(change: Extract<KeySettingChange, { kind: "shortcut-remove" | "shortcut-undo" }>, principal: string): Promise<KeySettingsExecutionResult> {
    const now = time()
    if (now === undefined) return refused("expired")
    const capture = change.kind === "shortcut-undo" ? undos.get(change.receipt) : undefined
    if (change.kind === "shortcut-undo" && (!capture || capture.consumed || capture.principal !== principal || capture.reset !== deps.resetRevision())) return refused("expired")
    if (capture) { capture.consumed = true; undos.delete(change.kind === "shortcut-undo" ? change.receipt : "") }
    try {
      const records = await deps.local.get(null)
      if (deps.disposed() || !consentObject(records)) return refused("unavailable")
      const authority = deps.authority(records), consent = readConsentDevice(records), currentAuthority = authorityOf(records)
      if (authority.kind !== "ready" || consent.kind !== "supported" || !consent.device.consent || !currentAuthority) return refused("unavailable")
      if (capture && !sameSyncJson(capture.authority, currentAuthority)) return refused("stale")
      const view = readSettingsView(records["doc:settings"])
      if (view.kind !== "value") return refused(view.kind === "newer-version" ? "update-needed" : "invalid")
      const old = readKeySettingsProgress(records[keySettingsProgressKey])
      if (old.kind !== "absent" && (old.kind !== "valid" || old.record.state !== "terminal")) return refused(old.kind === "newer-version" ? "update-needed" : "unavailable")
      const settings = decodeSettings(view.settings)
      const row = change.kind === "shortcut-remove" ? settings.shortcuts.list.find(row => row.id === change.id) : capture?.row
      if (!row || !isShortcutId(row.id)) return refused("missing-target")
      const shortcut = row.id
      const index = settings.shortcuts.list.findIndex(row => row.id === shortcut)
      if (change.kind === "shortcut-remove") {
        if (!sameRow(row, change.expected)) return refused("stale")
        settings.shortcuts.list.splice(index, 1)
      } else {
        if (!capture || index !== -1 || settings.shortcuts.list.length >= 20) return refused("stale")
        if (row.key && conflictObservations(settings, { kind: "playlist", id: shortcut }, row.key).length) return refused("stale")
        const previous = settings.shortcuts.list.findIndex(row => row.id === capture.previous)
        const next = settings.shortcuts.list.findIndex(row => row.id === capture.next)
        const position = next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(capture.index, settings.shortcuts.list.length)
        settings.shortcuts.list.splice(position, 0, structuredClone(row))
      }
      const accounts: AccountKey[] = [], targets: UndoTarget[] = [], effect: JsonObject = {}
      const documents: Extract<SyncWritePlanInput["intent"], { kind: "changed-batch" }>["documents"][number][] = []
      function envelope(name: string, data: JsonObject): JsonObject | undefined {
        const raw = records[name]
        if (!consentObject(raw)) return
        const value = { ...raw, v: DOCUMENT_VERSION, gen: deps.generation(), at: deps.now(), by: authority.kind === "ready" ? authority.device.id : "", data }
        if ("deleted" in value) delete value.deleted
        return value
      }
      if (!consentObject(settings)) return refused("invalid")
      const settingDocument = envelope("doc:settings", settings)
      if (!settingDocument) return refused("invalid")
      effect["doc:settings"] = settingDocument; documents.push({ key: { kind: "settings" }, document: settingDocument })
      const seen = new Set<AccountKey>()
      for (const [name, raw] of Object.entries(records)) {
        if (!name.startsWith("doc:setup:")) continue
        const key = parseDocumentKey(name)
        if (!key || key.kind !== "setup" || documentKey(key) !== name || !consentObject(raw)) return refused("invalid")
        const decoded = decodeDocument(raw, decodeSetup)
        if (decoded.kind === "newer-version") return refused("update-needed")
        if (decoded.kind === "deleted") continue
        if (decoded.kind !== "value" || !consentObject(raw.data) || !consentObject(raw.data.targets)) return refused("invalid")
        seen.add(key.acct)
        const stored = raw.data.targets[shortcut], restore = capture?.targets.find(target => target.acct === key.acct)
        if (change.kind === "shortcut-remove" ? stored === undefined : !restore) continue
        if (restore && (stored !== undefined || deps.accountRevision(key.acct) !== restore.revision)) return refused("stale")
        const desired = { ...raw.data.targets }
        if (change.kind === "shortcut-remove") {
          if (typeof stored !== "string") return refused("invalid")
          targets.push({ acct: key.acct, playlist: stored, revision: deps.accountRevision(key.acct) }); delete desired[shortcut]
        } else if (restore) desired[shortcut] = restore.playlist
        const data = { ...raw.data, targets: desired }, document = envelope(name, data)
        if (!document || decodeDocument(document, decodeSetup).kind !== "value") return refused("invalid")
        effect[name] = document; documents.push({ key, document }); accounts.push(key.acct)
      }
      if (capture?.targets.some(target => !seen.has(target.acct) || deps.accountRevision(target.acct) !== target.revision)) return refused("stale")
      if (authority.device.syncOn) {
        const sync = await deps.sync.get()
        for (const name of Object.keys(sync)) {
          if (!name.startsWith("s:setup:")) continue
          const key = parseDocumentKey(`doc:${name.slice(2)}`)
          if (key?.kind === "setup" && !Object.hasOwn(records, documentKey(key))) return refused("unavailable")
        }
        const first = documents[0]
        if (!first) return refused("invalid")
        const admission = planSyncWrite({ local: records, sync, intent: { kind: "changed-batch", documents: [first, ...documents.slice(1)] } })
        if (admission.kind === "unavailable") return refused("unavailable")
        if (admission.kind === "refused") return refused(admission.reason)
        if (admission.kind === "planned" && authority.history) {
          if (!consentObject(records.sync)) return refused("unavailable")
          const repaired = deps.repairHistory(records.sync, admission.repairs)
          if (repaired) effect.sync = repaired
        }
      }
      const history = prepareFirstEditHistory({ history: Object.hasOwn(records, "sync") ? { kind: "present", raw: effect.sync ?? records.sync } : { kind: "absent" }, syncOn: authority.device.syncOn })
      if (history.kind === "unavailable") return refused("unavailable")
      if (history.kind === "set") effect.sync = history.sync
      const checked = time()
      if (capture && (checked === undefined || checked >= capture.expires || capture.reset !== deps.resetRevision())) return refused("expired")
      const retired = new Set<ShortcutId>(old.kind === "valid" ? old.record.retired : []); retired.add(shortcut)
      const record: AcceptedKeySettings = { v: 1, kind: "key-settings-progress", id: deps.generation(), deviceId: authority.device.id,
        original: consent.device.consent, retired: [...retired], state: "accepted", operation: change.kind === "shortcut-remove" ? "remove" : "restore",
        shortcut, before: withoutMarker(records), effect }
      const write = await commitKeySettings({ local: deps.local, stopped: deps.disposed }, records, record)
      if (write.kind !== "committed") return project(write)
      if (change.kind === "shortcut-remove") {
        const issued = time()
        if (issued === undefined) return { ...refused("expired"), settingsChanged: true, accounts }
        const receipt = `undo:${crypto.randomUUID()}`
        const original = decodeSettings(view.settings)
        undos.set(receipt, { principal, row: structuredClone(row), index, previous: original.shortcuts.list[index - 1]?.id,
          next: original.shortcuts.list[index + 1]?.id, targets, expires: issued + 6000, reset: deps.resetRevision(), authority: currentAuthority, consumed: false })
        return { answer: { kind: "removed", id: shortcut, receipt, undoForMs: 6000 }, settingsChanged: true, accounts, uncertain: false }
      }
      return { answer: { kind: "confirmed", change, status: "changed" }, settingsChanged: true, accounts, uncertain: false }
    } catch { return { ...refused("unconfirmed"), uncertain: true } }
  }
  return {
    revoke, invalidateAccount,
    async change(change: KeySettingChange, principal: string | undefined): Promise<KeySettingsExecutionResult> {
      if (!isKeySettingChange(change) || deps.disposed()) return refused("invalid")
      if (change.kind !== "shortcut-remove" && change.kind !== "shortcut-undo") return ordinary(change)
      return principal ? batch(change, principal) : refused("unavailable")
    }
  }
}
