import type { AccountKey, PlaylistId } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
import type { AutoAddChoiceChange, AutoAddEdit, AutoAddReadAnswer } from "../../shared/contracts/auto-add-choice"
import type { createLocalFilterWriter } from "./local-filter-writer"

function typedChoices(owner: ReturnType<typeof createLocalFilterWriter>, ui: Extract<Origin, { kind: "ui" }>, acct: AccountKey,
  playlist: PlaylistId, request: AutoAddChoiceChange, read: Extract<AutoAddReadAnswer, { kind: "value" }>) {
  void owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist })
  void owner.changeAutoAddChoice(ui, request)
  // @ts-expect-error negative: auto-add-invalid-variant. Each edit changes one defined field.
  const variant: AutoAddEdit = { kind: "replace", autoAdd: [] }
  // @ts-expect-error negative: auto-add-whole-array. A caller cannot replace the account array.
  owner.changeAutoAddChoice(ui, { ...request, autoAdd: [] })
  // @ts-expect-error negative: auto-add-setup-replacement. A caller cannot replace Setup.
  owner.changeAutoAddChoice(ui, { ...request, setup: { autoAdd: [] } })
  // @ts-expect-error negative: auto-add-account-brand. Raw identities require validation.
  owner.changeAutoAddChoice(ui, { ...request, acct: "AAAAAAAAAAAAAAAA" })
  // @ts-expect-error negative: auto-add-playlist-brand. Raw playlists require validation.
  owner.changeAutoAddChoice(ui, { ...request, playlist: "PL_one" })
  // @ts-expect-error negative: auto-add-lifetime-brand. The owner supplies the capture token.
  owner.changeAutoAddChoice(ui, { ...request, lifetime: "00000000-0000-4000-8000-000000000001" })
  // @ts-expect-error negative: auto-add-no-origin. The owner requires the authenticated native UI origin.
  owner.changeAutoAddChoice(request)
  // @ts-expect-error negative: auto-add-tab-origin. A content tab cannot call the UI owner operation.
  owner.changeAutoAddChoice({ kind: "tab", tabId: 1, incognito: false }, request)
  // @ts-expect-error negative: auto-add-mixed-fields. Takes cannot carry a selection field.
  const mixed: AutoAddEdit = { kind: "takes", expected: "videos", takes: "both", chosen: true }
  // @ts-expect-error negative: auto-add-invalid-takes. Takes uses the existing canonical vocabulary.
  const takes: AutoAddEdit = { kind: "takes", expected: "videos", takes: "all" }
  // @ts-expect-error negative: auto-add-missing-expectation. Every edit compares its own field.
  const expectation: AutoAddEdit = { kind: "percentage", pct: null }
  void [variant, mixed, takes, expectation, read]
}
void typedChoices
