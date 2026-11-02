import type { ChangeResult } from "../../shared/contracts/results"
import type { Site } from "../../shared/contracts/vocabulary"
import type { AccountKey } from "../../shared/model/validation"
import { createPageSource, shortcutKeys, type PagePickerPurpose } from "../backend/page-source"
import type { PageState } from "../lib/page-state.svelte"

/** A picker source for one account's setup, as the popup's and settings' choosers and lists read it. Lazy parts only. */
export function pickerSource(pageState: PageState, acct: AccountKey, site: Site, purpose: PagePickerPurpose) {
  const setup = pageState.ready?.setups.find(entry => entry.acct === acct)?.setup ?? null
  const device = pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null
  const settings = pageState.settings
  const backend = pageState.page.backend
  const confirmed = (answer: Awaited<ReturnType<typeof backend.call<"ui.device">>>): ChangeResult =>
    answer.kind === "answered" && answer.result.kind === "confirmed" ? { ok: true }
      : { refused: answer.kind === "answered" && answer.result.kind === "refused" && answer.result.reason === "private" ? "private" : "invalid" }
  return createPageSource(backend, {
    acct, site, private: pageState.private, tab: pageState.tab, signedIn: pageState.signedIn, agreed: pageState.agreed, setup,
    sortAZ: device?.pickerSortAZ ?? false, privacy: device?.newPlaylistVisibility ?? null,
    keys: settings ? shortcutKeys(settings, setup) : new Map(), purpose,
    device: {
      saveSortAZ: async value => confirmed(await backend.call("ui.device", { change: { field: "pickerSortAZ", value } })),
      savePrivacy: async value => confirmed(await backend.call("ui.device", { change: { field: "newPlaylistVisibility", value } }))
    }
  })
}
