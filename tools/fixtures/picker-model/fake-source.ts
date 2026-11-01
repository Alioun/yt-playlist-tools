import type { ChangeResult, Privacy, SetVideoId } from "../../../src/shared/contracts"
import { isSetVideoId } from "../../../src/shared/contracts/identifiers"
import type { Key, PlaylistId } from "../../../src/shared/model"
import { isPlaylistId } from "../../../src/shared/model/validation"
import type {
  AddAnswer, CreateAnswer, ItemPort, ListAnswer, Listing, Mark, MembershipAnswer, PickerSource, RemoveAnswer, Undo
} from "../../../src/shared/picker/source"

export type Answers = {
  cachedList: Listing | null
  freshList: ListAnswer
  membership: MembershipAnswer
  add: AddAnswer
  remove: RemoveAnswer
  createWithItem: CreateAnswer
  create: CreateAnswer
  pin: ChangeResult
  choose: ChangeResult
  saveSortAZ: ChangeResult
  savePrivacy: ChangeResult
}
export type Port = keyof Answers
export type Facts = {
  private: boolean
  tab: boolean
  creation: PickerSource["creation"]
  sortAZ: boolean
  privacy: Privacy | null
  quickSave: PlaylistId | null
  chosen: readonly PlaylistId[]
  keys: ReadonlyMap<PlaylistId, Key>
  marks: ReadonlyMap<PlaylistId, Mark>
  now: number
  /** Consent and the account's authority. Tests flip it to model a lapse while a pick runs. */
  authorized: boolean
}
type Call = { readonly port: Port; readonly args: readonly unknown[]; readonly resolve: (value: unknown) => void; settled: boolean }

export const NOW = 1_800_000_000_000

export function playlist(id: string): PlaylistId {
  if (!isPlaylistId(id)) throw new Error(`Not a playlist ID: ${id}`)
  return id
}

export function entry(id: string): SetVideoId {
  if (!isSetVideoId(id)) throw new Error(`Not an entry ID: ${id}`)
  return id
}

export function undoing(kind: "undone" | "failed" = "undone"): Undo {
  return () => Promise.resolve({ kind })
}

/** Resolves after every answer already given has run through the model's awaits. */
export function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Records every port call and leaves it pending until the test answers it. */
export class Ledger {
  readonly #calls: Call[] = []

  port<P extends Port>(port: P): (...args: unknown[]) => Promise<Answers[P]> {
    return (...args) => new Promise<Answers[P]>(resolve => {
      this.#calls.push({ port, args, resolve: value => resolve(value as Answers[P]), settled: false })
    })
  }

  calls(port: Port): (readonly unknown[])[] {
    return this.#calls.filter(call => call.port === port).map(call => call.args)
  }

  pending(port: Port): number {
    return this.#calls.filter(call => call.port === port && !call.settled).length
  }

  /** Answers the oldest pending call to `port` and returns its arguments. */
  answer<P extends Port>(port: P, value: Answers[P]): readonly unknown[] {
    const call = this.#calls.find(item => item.port === port && !item.settled)
    if (!call) throw new Error(`No pending ${port} call`)
    call.settled = true
    call.resolve(value)
    return call.args
  }
}

function facts(overrides: Partial<Facts>): Facts {
  return {
    private: false, tab: true, creation: "available", sortAZ: false, privacy: null,
    quickSave: null, chosen: [], keys: new Map(), marks: new Map(), now: NOW, authorized: true, ...overrides
  }
}

function sourceFields(ledger: Ledger, facts: Facts) {
  return {
    private: facts.private, tab: facts.tab, creation: facts.creation, sortAZ: facts.sortAZ,
    privacy: facts.privacy, quickSave: facts.quickSave, chosen: facts.chosen, keys: facts.keys, marks: facts.marks,
    now: () => facts.now,
    authorized: () => facts.authorized,
    cachedList: ledger.port("cachedList"),
    freshList: ledger.port("freshList"),
    create: ledger.port("create"),
    pin: ledger.port("pin"),
    choose: ledger.port("choose"),
    saveSortAZ: ledger.port("saveSortAZ"),
    savePrivacy: ledger.port("savePrivacy")
  }
}

/** A source for a picker opened for an item: the in-page popovers and the popup's sheet. */
export function itemSource(overrides: Partial<Facts> = {}): { source: PickerSource<ItemPort>; ledger: Ledger; facts: Facts } {
  const ledger = new Ledger()
  const known = facts(overrides)
  const item: ItemPort = {
    membership: ledger.port("membership"),
    add: ledger.port("add"),
    remove: ledger.port("remove"),
    create: ledger.port("createWithItem")
  }
  return { source: { ...sourceFields(ledger, known), item }, ledger, facts: known }
}

/** A source for settings' and the first-run page's choosers, which have no item. */
export function chooserSource(overrides: Partial<Facts> = {}): { source: PickerSource<null>; ledger: Ledger; facts: Facts } {
  const ledger = new Ledger()
  const known = facts(overrides)
  return { source: { ...sourceFields(ledger, known), item: null }, ledger, facts: known }
}
