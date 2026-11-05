import type { ChangeResult, MembershipRow, PlaylistRow, Privacy, SetVideoId, Site } from "../contracts"
import type { Key, PlaylistId } from "../model"
import type { CreateFailure, ItemPort, Listing, Mark, PickerSource, Undo } from "./source"

export type Mode = "save" | "choose" | "many"
/** `marks: false` reads no membership, so rows show no check marks and no "Couldn't check" line (YM-PICK-6, R191). */
export type PickerOptions = { readonly marks?: boolean } & (
  | { readonly source: PickerSource<ItemPort>; readonly site: Site; readonly mode: "save" }
  | { readonly source: PickerSource; readonly site: Site; readonly mode: "choose" }
  | { readonly source: PickerSource<null>; readonly site: Site; readonly mode: "many" }
)

export type Refusal = Extract<ChangeResult, { refused: string }>["refused"]
export type TitleProblem = "required" | "too-long" | "angle-brackets"
export type Saved = "added" | "already-in" | "created"
export type RowStatus =
  | { readonly kind: "idle" | "added" | "already-in" | "save-failed" | "removed" | "remove-failed" }
  | { readonly kind: "refused"; readonly reason: Refusal }
  /** A first pick whose save is confirmed and whose choice was refused. Ticking the row again retries only the choice. */
  | { readonly kind: "unchosen"; readonly save: Saved; readonly reason: Refusal; readonly undo: "offered" | "failed" | "none" }
export type PickerRow = {
  readonly id: PlaylistId
  /** Null only for a chosen playlist the list no longer has. */
  readonly title: string | null
  readonly privacy: Privacy | null
  readonly count: number | null
  readonly thumb: string | null
  /** "new": created by this picker and not listed yet. "gone": chosen, but missing from the list. */
  readonly listed: "listed" | "new" | "gone"
  /** A membership fact in save mode, the choice in choose and many modes. */
  readonly check: "on" | "off" | "loading"
  readonly busy: boolean
  readonly status: RowStatus
  readonly key: Key | null
  readonly pinned: boolean
  readonly mark: Mark | null
}
export type MembershipStatus = { readonly kind: "none" | "checking" | "unreadable" } | { readonly kind: "known"; readonly count: number }
export type ListStatus = { readonly at: number | null; readonly refreshing: boolean; readonly refreshable: boolean }
export type Creation = "available" | "private" | "noTab" | "signedOut" | "noChannel"
export type CreateState = { readonly kind: "idle" | "pending" } | { readonly kind: "failed"; readonly reason: CreateFailure }
export type TitleCheck = { readonly problem: TitleProblem | null; readonly duplicate: boolean }

export type Closed = { readonly kind: "closed" }
export type Ignored = { readonly kind: "ignored"; readonly reason: "absent" | "busy" | "unchanged" }
export type Unavailable = { readonly kind: "unavailable"; readonly reason: Exclude<Creation, "available"> | "mode" }
export type Refused = { readonly kind: "refused"; readonly reason: Refusal }
export type Changed = { readonly kind: "changed" }
/**
 * A choose-mode pick, reported only after the item's save, if any, and the choice have both answered.
 * A choice skipped as "unauthorized" never started, because consent or the account's authority lapsed after the save.
 */
export type Picked = {
  readonly kind: "picked"
  readonly id: PlaylistId
  readonly save: Saved | null
  readonly undo: Undo | null
  readonly choice: ChangeResult | { readonly skipped: "private" | "unauthorized" }
}
type Skip = Closed | Ignored
export type TickOutcome = { readonly kind: "added" | "already-in" | "failed" } | Picked | Changed | Refused | Unavailable | Skip
export type UntickOutcome = { readonly kind: "removed"; readonly undo: Undo } | { readonly kind: "failed" } | Changed | Refused | Unavailable | Skip
export type PinOutcome = { readonly kind: "pinned" } | Refused | Unavailable | Skip
export type RefreshOutcome = { readonly kind: "refreshed" | "failed" } | Unavailable | Closed
export type SettingOutcome = { readonly kind: "saved" } | Refused | Skip
export type UndoOutcome = { readonly kind: "undone" | "failed" } | Skip
export type CreateOutcome =
  | { readonly kind: "created"; readonly id: PlaylistId; readonly choice: ChangeResult | null }
  | { readonly kind: "invalid"; readonly problem: TitleProblem }
  | { readonly kind: "failed"; readonly reason: CreateFailure }
  | Picked
  | Refused
  | Unavailable
  | Skip

type Entry = {
  readonly id: PlaylistId
  readonly title: string | null
  readonly privacy?: Privacy | undefined
  readonly count?: number | undefined
  readonly thumb?: string | undefined
  readonly listed: PickerRow["listed"]
}
type RowState = { readonly busy: boolean; readonly status: RowStatus; readonly check?: boolean | undefined }

const WATCH_LATER = "WL"
const FRESH_MS = 5 * 60 * 1000
const TITLE_LIMIT = 150
const titleOrder = new Intl.Collator()
const IDLE: RowStatus = { kind: "idle" }
const ADDED: RowStatus = { kind: "added" }
const CLOSED: Closed = { kind: "closed" }
const ABSENT: Ignored = { kind: "ignored", reason: "absent" }
const BUSY: Ignored = { kind: "ignored", reason: "busy" }
const UNCHANGED: Ignored = { kind: "ignored", reason: "unchanged" }
const PRIVATE: Unavailable = { kind: "unavailable", reason: "private" }
const NO_TAB: Unavailable = { kind: "unavailable", reason: "noTab" }
const FAILED = { kind: "failed" } as const
const SKIPPED = { skipped: "private" } as const
const UNAUTHORIZED = { skipped: "unauthorized" } as const

/** YT-NEW-02 and YM-PICK-10: required, trimmed, at most 150 characters (code points), no < or >. */
export function titleProblem(title: string): TitleProblem | null {
  const trimmed = title.trim()
  if (trimmed === "") return "required"
  if (/[<>]/.test(trimmed)) return "angle-brackets"
  return [...trimmed].length > TITLE_LIMIT ? "too-long" : null
}

export class PickerModel {
  readonly site: Site
  readonly mode: Mode
  query = $state("")
  /** The new-playlist form's input. A failed creation keeps it; a created playlist clears the title. */
  readonly form = $state<{ title: string; privacy: Privacy }>({ title: "", privacy: "PRIVATE" })
  readonly #options: PickerOptions
  readonly #entries = new Map<PlaylistId, SetVideoId>()
  readonly #unchosen = new Map<PlaylistId, { readonly save: Saved; readonly undo: Undo | null }>()
  #seq = 0
  #listingSeq = 0
  #membersSeq = 0
  #sortSeq = 0
  #fetched = false
  #picking = false
  #pinning = false
  #closed = $state(false)
  #tab = $state(true)
  #listing = $state.raw<Listing | null>(null)
  #members = $state.raw<readonly MembershipRow[] | null>(null)
  #base = $state.raw<"listing" | "members">("listing")
  #membership = $state.raw<"none" | "checking" | "read" | "unreadable">("none")
  #refreshing = $state.raw<Promise<RefreshOutcome> | null>(null)
  #rowStates = $state.raw<ReadonlyMap<PlaylistId, RowState>>(new Map())
  #chosen = $state.raw<ReadonlySet<PlaylistId>>(new Set())
  #quickSave = $state.raw<PlaylistId | null>(null)
  #created = $state.raw<readonly PlaylistRow[]>([])
  #sortAZ = $state(false)
  #creating = $state.raw<CreateState>({ kind: "idle" })
  #ordered = $derived.by(() => this.#order())
  readonly totalRows = $derived(this.#ordered.length)

  readonly rows: readonly PickerRow[] = $derived.by(() => {
    const query = this.query.trim().toLowerCase()
    return query ? this.#ordered.filter(row => row.title?.toLowerCase().includes(query)) : this.#ordered
  })
  readonly membership: MembershipStatus = $derived.by(() => {
    if (this.#membership !== "read") return { kind: this.#membership }
    const members = new Set(this.#members?.filter(row => row.contains).map(row => row.id))
    for (const [id, state] of this.#rowStates) {
      if (state.check === true) members.add(id)
      else if (state.check === false) members.delete(id)
    }
    return { kind: "known", count: members.size }
  })
  readonly list: ListStatus = $derived({
    at: this.#listing?.at ?? null,
    refreshing: this.#refreshing !== null,
    refreshable: this.#tab
  })
  readonly creation: Creation = $derived.by(() => {
    const { source } = this.#options
    if (source.creation !== "available") return source.creation
    if (!this.#tab) return "noTab"
    return source.private && source.item === null ? "private" : "available"
  })
  readonly titleCheck: TitleCheck = $derived.by(() => {
    const title = this.form.title.trim()
    return { problem: titleProblem(title), duplicate: title !== "" && this.#ordered.some(row => row.title === title) }
  })

  constructor(options: PickerOptions) {
    const { source } = options
    this.site = options.site
    this.mode = options.mode
    this.#options = options
    this.#tab = source.tab
    this.#sortAZ = source.sortAZ
    this.#quickSave = source.quickSave
    this.#chosen = new Set(source.chosen)
    this.form.privacy = source.privacy ?? "PRIVATE"
    void this.#open(source)
    if (source.item && options.marks !== false) void this.#readMembership(source.item)
  }

  get closed(): boolean {
    return this.#closed
  }
  get sortAZ(): boolean {
    return this.#sortAZ
  }
  get creating(): CreateState {
    return this.#creating
  }
  get pins(): "available" | "private" | "none" {
    if (this.mode === "many") return "none"
    return this.#options.source.private ? "private" : "available"
  }

  async tick(id: PlaylistId): Promise<TickOutcome> {
    const skip = this.#skip(id)
    if (skip) return skip
    const options = this.#options
    switch (options.mode) {
      case "save":
        return this.#save(options.source.item, id)
      case "choose":
        return this.#pick(options.source.item, id)
      case "many":
        return this.#toggle(id, true)
    }
  }

  async untick(id: PlaylistId): Promise<UntickOutcome> {
    const skip = this.#skip(id)
    if (skip) return skip
    const options = this.#options
    if (options.mode !== "save") return this.#toggle(id, false)
    if (this.#find(id)?.check !== "on") return UNCHANGED
    this.#mark(id, { busy: true, status: IDLE, check: false })
    const answer = await options.source.item.remove(id, this.#entries.get(id) ?? null)
    if (this.#closed) return CLOSED
    if (answer.kind === "failed") {
      this.#mark(id, { busy: false, status: { kind: "remove-failed" }, check: true })
      return FAILED
    }
    this.#entries.delete(id)
    this.#mark(id, { busy: false, status: { kind: "removed" } })
    return { kind: "removed", undo: answer.undo }
  }

  async pin(id: PlaylistId): Promise<PinOutcome> {
    const skip = this.#skip(id)
    if (skip) return skip
    if (this.pins !== "available") return this.pins === "private" ? PRIVATE : { kind: "unavailable", reason: "mode" }
    if (this.#quickSave === id) return UNCHANGED
    if (this.#pinning) return BUSY
    this.#pinning = true
    this.#mark(id, { busy: true })
    const answer = await this.#options.source.pin(id)
    this.#pinning = false
    if (this.#closed) return CLOSED
    if ("refused" in answer) return this.#refuse(id, answer.refused)
    this.#quickSave = id
    this.#mark(id, { busy: false })
    return { kind: "pinned" }
  }

  refresh(): Promise<RefreshOutcome> {
    if (this.#closed) return Promise.resolve(CLOSED)
    if (!this.#tab) return Promise.resolve(NO_TAB)
    let refreshing = this.#refreshing
    if (!refreshing) {
      this.#fetched = true
      refreshing = this.#readFresh()
      this.#refreshing = refreshing
    }
    return refreshing
  }

  async create(title: string, privacy: Privacy): Promise<CreateOutcome> {
    if (this.#closed) return CLOSED
    if (this.#creating.kind === "pending" || this.#picking) return BUSY
    this.form.title = title
    this.form.privacy = privacy
    const problem = titleProblem(title)
    if (problem) return { kind: "invalid", problem }
    if (this.creation !== "available") return { kind: "unavailable", reason: this.creation }
    const options = this.#options
    const item = options.mode === "many" ? null : options.source.item
    const playlist = { title: title.trim(), privacy }
    this.#creating = { kind: "pending" }
    this.#picking = options.mode === "choose"
    try {
      const answer = await (item ? item.create(playlist) : options.source.create(playlist))
      const firstPick = options.mode === "choose" && item !== null
      if (this.#closed && !firstPick) return CLOSED
      if (answer.kind === "failed") {
        this.#creating = answer
        return answer
      }
      this.#creating = { kind: "idle" }
      this.form.title = ""
      this.#created = [...this.#created, { id: answer.id, title: playlist.title, privacy }]
      if (!options.source.private && !this.#closed) void options.source.savePrivacy(privacy)
      switch (options.mode) {
        case "save":
          this.#mark(answer.id, { status: ADDED, check: true })
          return { kind: "created", id: answer.id, choice: null }
        case "choose":
          this.#mark(answer.id, { busy: true, ...(item && { check: true }) })
          return await this.#choose(answer.id, item ? "created" : null, answer.undo)
        case "many": {
          this.#mark(answer.id, { busy: true })
          const choice = await options.source.choose(answer.id, true)
          if (this.#closed) return CLOSED
          this.#settle(answer.id, true, choice)
          return { kind: "created", id: answer.id, choice }
        }
        default: {
          const exhaustive: never = options
          return exhaustive
        }
      }
    } finally {
      if (options.mode === "choose") this.#picking = false
    }
  }

  async setSortAZ(on: boolean): Promise<SettingOutcome> {
    if (this.#closed) return CLOSED
    if (on === this.#sortAZ) return UNCHANGED
    const before = this.#sortAZ
    const seq = ++this.#sortSeq
    this.#sortAZ = on
    const answer = await this.#options.source.saveSortAZ(on)
    if (this.#closed) return CLOSED
    if ("ok" in answer) return { kind: "saved" }
    if (seq === this.#sortSeq) this.#sortAZ = before
    return { kind: "refused", reason: answer.refused }
  }

  /** Runs the Undo of a first pick whose save is confirmed and whose choice was refused. */
  async undo(id: PlaylistId): Promise<UndoOutcome> {
    const skip = this.#skip(id)
    if (skip) return skip
    const saved = this.#unchosen.get(id)
    const status = this.#find(id)?.status
    if (!saved?.undo || status?.kind !== "unchosen" || status.undo !== "offered") return UNCHANGED
    this.#mark(id, { busy: true })
    const answer = await saved.undo()
    if (this.#closed) return CLOSED
    if (answer.kind === "failed") {
      this.#mark(id, { busy: false, status: { ...status, undo: "failed" } })
      return FAILED
    }
    this.#unchosen.delete(id)
    this.#entries.delete(id)
    this.#mark(id, { busy: false, status: { kind: "removed" } })
    return { kind: "undone" }
  }

  /**
   * Answers that arrive later change nothing, and no method starts another effect. The one exception is a first pick
   * already under way: it still finishes its save and its choice for this source's account while `authorized()` holds.
   */
  close(): void {
    this.#closed = true
  }

  async #open(source: PickerSource) {
    const seq = ++this.#seq
    const listing = await source.cachedList()
    if (this.#closed) return
    if (listing) this.#takeListing(seq, listing)
    if (this.#fetched || !this.#tab) return
    if (listing === null || source.now() - listing.at > FRESH_MS) void this.refresh()
  }

  async #readMembership(item: ItemPort) {
    const seq = ++this.#seq
    this.#membership = "checking"
    const answer = await item.membership()
    if (this.#closed) return
    if (answer.kind === "unreadable") {
      this.#membership = "unreadable"
      return
    }
    this.#membersSeq = seq
    this.#members = answer.rows
    if (seq > this.#listingSeq) this.#base = "members"
    this.#membership = "read"
  }

  async #readFresh(): Promise<RefreshOutcome> {
    const seq = ++this.#seq
    const answer = await this.#options.source.freshList()
    if (this.#closed) return CLOSED
    this.#refreshing = null
    switch (answer.kind) {
      case "listed":
        this.#takeListing(seq, answer.listing)
        return { kind: "refreshed" }
      case "noTab":
        this.#tab = false
        return NO_TAB
      case "failed":
        return FAILED
    }
  }

  #takeListing(seq: number, listing: Listing) {
    if (seq < this.#listingSeq) return
    this.#listingSeq = seq
    this.#listing = listing
    if (seq > this.#membersSeq) this.#base = "listing"
  }

  async #save(item: ItemPort, id: PlaylistId): Promise<TickOutcome> {
    this.#mark(id, { busy: true, status: IDLE })
    const answer = await item.add(id)
    if (this.#closed) return CLOSED
    if (answer.kind === "failed") {
      this.#mark(id, { busy: false, status: { kind: "save-failed" } })
      return FAILED
    }
    if (answer.kind === "added") this.#entries.set(id, answer.entry)
    this.#mark(id, { busy: false, status: { kind: answer.kind }, check: true })
    return { kind: answer.kind }
  }

  async #pick(item: ItemPort | null, id: PlaylistId): Promise<TickOutcome> {
    if (this.#picking) return BUSY
    if (item === null && this.#options.source.private) return PRIVATE
    if (item === null && this.#chosen.has(id)) return UNCHANGED
    const saved = this.#unchosen.get(id)
    this.#picking = true
    this.#mark(id, { busy: true, status: IDLE })
    try {
      if (item === null) return await this.#choose(id, null, null)
      if (saved) return await this.#choose(id, saved.save, saved.undo)
      const answer = await item.add(id)
      if (answer.kind === "failed") {
        this.#mark(id, { busy: false, status: { kind: "save-failed" } })
        return FAILED
      }
      if (answer.kind === "added") this.#entries.set(id, answer.entry)
      this.#mark(id, { busy: true, check: true })
      return await this.#choose(id, answer.kind, answer.kind === "added" ? answer.undo : null)
    } finally {
      this.#picking = false
    }
  }

  async #choose(id: PlaylistId, save: Picked["save"], undo: Undo | null): Promise<Picked | Refused | Closed> {
    const { source } = this.#options
    const choice = source.private ? SKIPPED : save !== null && !source.authorized() ? UNAUTHORIZED : await source.choose(id, true)
    if (this.#closed && save === null) return CLOSED
    if ("refused" in choice) {
      if (save === null) return this.#refuse(id, choice.refused)
      this.#unchosen.set(id, { save, undo })
      this.#mark(id, { busy: false, status: { kind: "unchosen", save, reason: choice.refused, undo: undo ? "offered" : "none" } })
      return { kind: "picked", id, save, undo, choice }
    }
    this.#unchosen.delete(id)
    if ("ok" in choice) this.#chosen = new Set([id])
    this.#mark(id, { busy: false, status: save === null ? IDLE : save === "already-in" ? { kind: "already-in" } : ADDED })
    return { kind: "picked", id, save, undo, choice }
  }

  async #toggle(id: PlaylistId, on: boolean): Promise<Changed | Refused | Unavailable | Skip> {
    if (this.#options.source.private) return PRIVATE
    if (this.#chosen.has(id) === on) return UNCHANGED
    this.#mark(id, { busy: true, status: IDLE })
    const answer = await this.#options.source.choose(id, on)
    if (this.#closed) return CLOSED
    return this.#settle(id, on, answer)
  }

  #settle(id: PlaylistId, on: boolean, answer: ChangeResult): Changed | Refused {
    if ("refused" in answer) return this.#refuse(id, answer.refused)
    const chosen = new Set(this.#chosen)
    if (on) chosen.add(id)
    else chosen.delete(id)
    this.#chosen = chosen
    this.#mark(id, { busy: false, status: IDLE })
    return { kind: "changed" }
  }

  #refuse(id: PlaylistId, reason: Refusal): Refused {
    this.#mark(id, { busy: false, status: { kind: "refused", reason } })
    return { kind: "refused", reason }
  }

  #skip(id: PlaylistId): Skip | null {
    if (this.#closed) return CLOSED
    const row = this.#find(id)
    if (!row) return ABSENT
    return row.busy ? BUSY : null
  }

  #find(id: PlaylistId): PickerRow | undefined {
    return this.#ordered.find(row => row.id === id)
  }

  #mark(id: PlaylistId, change: Partial<RowState>) {
    const states = new Map(this.#rowStates)
    states.set(id, { busy: false, status: IDLE, ...states.get(id), ...change })
    this.#rowStates = states
  }

  #order(): readonly PickerRow[] {
    const listing = this.#listing?.rows ?? []
    const listed = new Map(listing.map(row => [row.id, row]))
    const members = this.#base === "members" ? this.#members : null
    const base: Entry[] = members
      ? members.map(row => {
          const known = listed.get(row.id)
          return {
            id: row.id,
            title: row.title,
            privacy: row.privacy ?? known?.privacy,
            count: row.count ?? known?.count,
            thumb: known?.thumb,
            listed: "listed" as const
          }
        })
      : listing.map(row => ({ ...row, listed: "listed" as const }))
    const present = new Set(base.map(entry => entry.id))
    const entries: Entry[] = [...this.#created.filter(row => !present.has(row.id)).map(row => ({ ...row, listed: "new" as const })), ...base]
    if (this.mode !== "save" && this.#listing) {
      const shown = new Set(entries.map(entry => entry.id))
      for (const id of this.#chosen) if (!shown.has(id)) entries.push({ id, title: null, listed: "gone" })
    }
    if (this.site === "www") {
      const index = entries.findIndex(entry => entry.id === WATCH_LATER)
      if (index > 0) entries.unshift(...entries.splice(index, 1))
    }
    if (this.#sortAZ) {
      entries.sort((a, b) => Number(a.title === null) - Number(b.title === null) || titleOrder.compare(a.title ?? "", b.title ?? ""))
    }
    const marks: ReadonlyMap<PlaylistId, Mark> = this.mode === "save" ? new Map() : this.#options.source.marks
    if (this.mode === "many") entries.sort((a, b) => Number(marks.has(b.id)) - Number(marks.has(a.id)))
    const facts = this.#membership === "read" && this.#members ? new Map(this.#members.map(row => [row.id, row.contains])) : null
    return entries.map(entry => this.#view(entry, marks.get(entry.id) ?? null, facts))
  }

  #view(entry: Entry, mark: Mark | null, facts: ReadonlyMap<PlaylistId, boolean> | null): PickerRow {
    const state = this.#rowStates.get(entry.id)
    return {
      id: entry.id,
      title: entry.title,
      privacy: entry.privacy ?? null,
      count: entry.count ?? null,
      thumb: entry.thumb ?? null,
      listed: entry.listed,
      check: this.#check(entry.id, state, facts),
      busy: state?.busy ?? false,
      status: state?.status ?? IDLE,
      key: this.#options.source.keys.get(entry.id) ?? null,
      pinned: this.mode !== "many" && this.#quickSave === entry.id,
      mark
    }
  }

  #check(id: PlaylistId, state: RowState | undefined, facts: ReadonlyMap<PlaylistId, boolean> | null): PickerRow["check"] {
    if (this.mode !== "save") return this.#chosen.has(id) ? "on" : "off"
    if (state?.check !== undefined) return state.check ? "on" : "off"
    if (this.#membership === "checking") return "loading"
    return facts?.get(id) ? "on" : "off"
  }
}
