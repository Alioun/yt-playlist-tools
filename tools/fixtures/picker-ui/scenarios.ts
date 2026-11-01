import type { PlaylistRow } from "../../../src/shared/contracts"
import type { Key, PlaylistId } from "../../../src/shared/model"
import { isAccountKey, isPlaylistId } from "../../../src/shared/model"
import type { ItemPort, PickerSource } from "../../../src/shared/picker/source"
import { PickerModel } from "../../../src/shared/picker/model.svelte"
import type { ChooserContext } from "../../../src/ui/picker/types"

export const scenarios = [
  "save", "choose", "many", "empty-search", "empty-list", "failed-list", "create-validation",
  "marks", "no-tab", "long-title", "signed-out", "no-channel", "create-failure", "membership-pending",
  "choice-refusal", "private", "sort-refusal", "keyboard", "chooser"
] as const
export type Scenario = typeof scenarios[number]
export const stamp = 1_800_000_000_000

export function scenario(value: string | null): Scenario {
  return scenarios.find(name => name === value) ?? "save"
}
export function id(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("Invalid synthetic playlist ID")
  return value
}
export function chooserContext(): ChooserContext {
  const account = "synthetic_acct_1"
  if (!isAccountKey(account)) throw new Error("Invalid synthetic account key")
  return { account, site: "www", private: false, purpose: { kind: "gather", accountName: "Synthetic account" } }
}

function common(name: Scenario, thumb: string) {
  const alpha = id("PLalpha")
  const beta = id("PLbeta")
  const watchLater = id("WL")
  const rows: readonly PlaylistRow[] = name === "empty-list" || name === "failed-list" ? [] : [
    { id: watchLater, title: "Watch later", privacy: "PRIVATE", thumb },
    { id: alpha, title: name === "long-title" ? "Synthetic playlist with a deliberately long title that wraps across several lines and includes 世界の音楽 for layout inspection" : "Synthetic Alpha", privacy: "PRIVATE", count: 1, thumb },
    { id: beta, title: "Synthetic Beta", privacy: "UNLISTED", count: 214, thumb },
    { id: id("PLpublic"), title: "Synthetic Public", privacy: "PUBLIC", count: 0 }
  ]
  const key: Key = { code: "KeyW", char: "w", alt: true, ctrl: false, meta: false, shift: false }
  const calls: { readonly operation: string; readonly id?: PlaylistId }[] = []
  let created = 0
  const source: PickerSource<null> = {
    item: null, private: name === "private", tab: name !== "no-tab",
    creation: name === "signed-out" ? "signedOut" : name === "no-channel" ? "noChannel" : "available",
    sortAZ: false, privacy: null, quickSave: alpha, chosen: name === "marks" ? [alpha, beta] : [beta],
    keys: new Map([[watchLater, key]]), marks: name === "marks" ? new Map([[alpha, "missing"], [beta, "full"]]) : new Map(),
    now: () => stamp,
    cachedList: async () => name === "failed-list" ? null : { rows, at: stamp },
    freshList: async () => {
      calls.push({ operation: "freshList" })
      if (name === "no-tab") return { kind: "noTab" }
      if (name === "failed-list") return { kind: "failed" }
      return { kind: "listed", listing: { rows, at: stamp } }
    },
    create: async () => {
      calls.push({ operation: "create" })
      return name === "create-failure" ? { kind: "failed", reason: "rateLimited" } : { kind: "created", id: id(`PLsynthetic${++created}`), undo: null }
    },
    pin: async playlist => { calls.push({ operation: "pin", id: playlist }); return { ok: true } },
    choose: async playlist => {
      calls.push({ operation: "choose", id: playlist })
      return name === "choice-refusal" ? { refused: "sync-full" } : { ok: true }
    },
    saveSortAZ: async () => { calls.push({ operation: "saveSortAZ" }); return name === "sort-refusal" ? { refused: "invalid" } : { ok: true } },
    savePrivacy: async () => { calls.push({ operation: "savePrivacy" }); return { ok: true } }
  }
  return { source, rows, calls }
}

export function choiceSource(name: Scenario, thumb: string) { return common(name, thumb) }

export function itemSource(name: Scenario, thumb: string) {
  const base = common(name, thumb)
  let resolveMembership = () => {}
  const membership = new Promise<Awaited<ReturnType<ItemPort["membership"]>>>(resolve => {
    resolveMembership = () => resolve({ kind: "read", rows: base.rows.map(row => ({ ...row, contains: row.id === "PLbeta" })) })
  })
  if (name !== "membership-pending") resolveMembership()
  const item: ItemPort = {
    membership: () => membership,
    add: async playlist => { base.calls.push({ operation: "add", id: playlist }); return { kind: "already-in" } },
    remove: async playlist => { base.calls.push({ operation: "remove", id: playlist }); return { kind: "removed", undo: async () => ({ kind: "undone" }) } },
    create: playlist => base.source.create(playlist)
  }
  const source: PickerSource<ItemPort> = { ...base.source, item }
  return { ...base, source, answerMembership: () => resolveMembership() }
}

export function makePicker(name: Scenario, thumb: string) {
  const many = name === "many" || name === "marks"
  if (many) return new PickerModel({ source: choiceSource(name, thumb).source, site: "www", mode: "many" })
  if (name === "choose" || name === "choice-refusal" || name === "private" || name === "chooser") {
    return new PickerModel({ source: choiceSource(name, thumb).source, site: "www", mode: "choose" })
  }
  const picker = new PickerModel({ source: itemSource(name, thumb).source, site: "www", mode: "save" })
  if (name === "empty-search") picker.query = "Synthetic absent match"
  if (name === "create-validation") picker.form.title = "<Synthetic invalid title>"
  return picker
}
