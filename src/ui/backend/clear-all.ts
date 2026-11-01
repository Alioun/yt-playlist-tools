import { clearAllText, clearAllCheckboxText, type ClearAllAnswer } from "../../shared/contracts/clear-all"
import { STORAGE_SCHEMA_VERSION, decodeDevice, decodeSyncState } from "../../shared/model"
import type { I18n } from "../../shared/i18n"
import type { Backend } from "./backend"

export type ClearAllAvailability =
  | { readonly kind: "supported"; readonly checkbox: boolean }
  /** Ticked, the clear still erases this browser only (R174). */
  | { readonly kind: "newer-layout"; readonly localClear: true; readonly checkbox: boolean; readonly tickedPolicy: "local-only" }
  | { readonly kind: "unknown"; readonly localClear: true }
const record = (raw: unknown): raw is Readonly<Record<string, unknown>> => raw !== null && typeof raw === "object" && !Array.isArray(raw)
// A newer layout can't be decoded, so DATA-38's visibility reads only the two raw facts it names, without normalizing anything.
function syncedBefore(records: Readonly<Record<string, unknown>>): boolean {
  return record(records.device) && records.device.syncOn === true || record(records.sync) && typeof records.sync.joined === "string"
}
export function clearAllAvailability(records: Readonly<Record<string, unknown>>): ClearAllAvailability {
  if (typeof records.schema === "number" && records.schema > STORAGE_SCHEMA_VERSION)
    return { kind: "newer-layout", localClear: true, checkbox: syncedBefore(records), tickedPolicy: "local-only" }
  if (records.schema !== STORAGE_SCHEMA_VERSION && records.schema !== undefined) return { kind: "unknown", localClear: true }
  try {
    const on = records.device === undefined ? false : decodeDevice(records.device).syncOn
    const before = records.sync === undefined ? false : decodeSyncState(records.sync).joined !== null
    return { kind: "supported", checkbox: on || before }
  } catch { return { kind: "unknown", localClear: true } }
}
export function clearAllNotice(answer: ClearAllAnswer, i18n: I18n): string | null {
  return answer.kind === "clear-result" && answer.synced === "kept-newer-layout" ? i18n.message("clearAll_syncedKeptNewer") : null
}

export type ClearAllConfirmationState =
  | { readonly kind: "closed" }
  | { readonly kind: "editing"; readonly alsoSynced: boolean }
  | { readonly kind: "reviewing"; readonly alsoSynced: boolean }
  | { readonly kind: "reviewed"; readonly alsoSynced: boolean; readonly review: string }
  | { readonly kind: "submitting"; readonly alsoSynced: boolean }
  | { readonly kind: "answered"; readonly answer: ClearAllAnswer }
  | { readonly kind: "unconfirmed" }

export function createClearAllConfirmation(backend: Pick<Backend, "clearAll">, availability: ClearAllAvailability) {
  let state: ClearAllConfirmationState = { kind: "closed" }
  let epoch = 0
  let submission: Promise<ClearAllAnswer | undefined> | undefined
  const button = (alsoSynced: boolean) => alsoSynced ? "Clear here and everywhere" : "Clear"
  return {
    text: clearAllText, checkboxText: clearAllCheckboxText, cancelText: "Cancel",
    availability,
    state: () => state,
    button: () => button("alsoSynced" in state && state.alsoSynced),
    open() { if (state.kind === "submitting") return; epoch++; state = { kind: "editing", alsoSynced: false }; submission = undefined },
    async select(alsoSynced: boolean) {
      if (state.kind !== "editing" && state.kind !== "reviewed") return
      if (alsoSynced && (availability.kind === "unknown" || !availability.checkbox)) return
      const previous = state
      epoch++
      state = { kind: "editing", alsoSynced }
      if (previous.kind === "reviewed") await backend.clearAll({ action: "cancel", review: previous.review })
    },
    async review(): Promise<void> {
      if (state.kind !== "editing") return
      const alsoSynced = state.alsoSynced, current = ++epoch
      state = { kind: "reviewing", alsoSynced }
      const response = await backend.clearAll({ action: "review", alsoSynced })
      if (current !== epoch) return
      state = response.kind === "answered" && response.result.kind === "reviewed" && response.result.alsoSynced === alsoSynced
        ? { kind: "reviewed", alsoSynced, review: response.result.review } : { kind: "unconfirmed" }
    },
    confirm(): Promise<ClearAllAnswer | undefined> {
      if (state.kind === "submitting" && submission) return submission
      if (state.kind !== "reviewed") return Promise.resolve(undefined)
      const { review, alsoSynced } = state, current = ++epoch
      state = { kind: "submitting", alsoSynced }
      submission = backend.clearAll({ action: "confirm", review, alsoSynced }).then(response => {
        if (current !== epoch) return undefined
        if (response.kind !== "answered") { state = { kind: "unconfirmed" }; return undefined }
        state = { kind: "answered", answer: response.result }
        return response.result
      })
      return submission
    },
    async cancel() {
      if (state.kind === "submitting") return
      const previous = state
      epoch++
      state = { kind: "closed" }
      if (previous.kind === "reviewed") await backend.clearAll({ action: "cancel", review: previous.review })
    }
  }
}
