import {
  decodeFilter, decodeSettings, decodeSetup, defaultSetup, isPercent, isPlaylistId,
  isSetupEmpty, isShortcutId, normalizeSettingsForWrite, normalizeSetupForWrite
} from "../../shared/model"
import type {
  AccountKey, AutoAddPlaylist, ClaimNoticeDetails, ClaimShortcutOutcome, DocumentKey, Filter, PlaylistId, Settings, Setup, ShortcutId, Unclaimed
} from "../../shared/model"

type Snapshot<T> = T extends object
  ? { readonly [P in keyof T]: Snapshot<T[P]> }
  : T

export type AccountBodies = {
  setup: Setup
  filters: Record<string, Filter>
}
export type AccountSnapshot =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly bodies: Snapshot<AccountBodies> }

export type AccountChoice =
  | { readonly kind: "auto-add"; readonly playlist: PlaylistId; readonly chosen: boolean }
  | { readonly kind: "takes"; readonly playlist: PlaylistId; readonly takes: AutoAddPlaylist["takes"] }
  | { readonly kind: "percentage"; readonly playlist: PlaylistId; readonly pct: number | null }
  | { readonly kind: "shortcut-target"; readonly shortcut: ShortcutId; readonly playlist: PlaylistId | null }
  | { readonly kind: "save-target"; readonly field: "quickSave" | "musicSave" | "gather"; readonly playlist: PlaylistId | null }

export type SetupRemoval = {
  readonly acct: AccountKey
  readonly documents: readonly Extract<DocumentKey, { kind: "setup" | "filter" }>[]
  readonly cacheKey: string
  readonly progressKeys: readonly string[]
  readonly clearAccountSession: true
  readonly clearLastAccountIfMatches: true
}
export type AccountChoiceResult =
  | { kind: "unchanged" }
  | { kind: "invalid"; reason: "missing-auto-add" | "missing-shortcut" | "invalid-percentage" }
  | { kind: "save"; acct: AccountKey; bodies: AccountBodies }
  | { kind: "remove"; removal: SetupRemoval }

function removalFor(acct: AccountKey, filters: Snapshot<AccountBodies["filters"]>): SetupRemoval {
  const documents: SetupRemoval["documents"][number][] = [{ kind: "setup", acct }]
  for (const playlist of Object.keys(filters)) {
    if (!isPlaylistId(playlist)) throw new TypeError("Invalid filter playlist ID")
    documents.push({ kind: "filter", acct, playlist })
  }
  return {
    acct, documents, cacheKey: `cache:${acct}`,
    progressKeys: Array.from({ length: 16 }, (_, shard) => `progress:${acct}:${shard}`),
    clearAccountSession: true, clearLastAccountIfMatches: true
  }
}

function finishChoice(input: {
  acct: AccountKey
  setup: Setup
  filters: Snapshot<AccountBodies["filters"]>
  settings: Snapshot<Settings>
  additionalChosenPlaylists: ReadonlySet<PlaylistId>
}): Extract<AccountChoiceResult, { kind: "save" | "remove" }> {
  const setup = normalizeSetupForWrite(input.setup, {
    shortcutIds: new Set(input.settings.shortcuts.list.map(shortcut => shortcut.id)),
    additionalChosenPlaylists: input.additionalChosenPlaylists
  })
  const selected = new Set(setup.autoAdd.map(entry => entry.pl))
  const hasKeptFilters = Object.keys(input.filters).some(playlist => !selected.has(playlist))
  if (isSetupEmpty(setup, hasKeptFilters)) return { kind: "remove", removal: removalFor(input.acct, input.filters) }
  return {
    kind: "save", acct: input.acct,
    bodies: { setup, filters: Object.fromEntries(Object.entries(input.filters).map(([playlist, filter]) => [playlist, decodeFilter(filter)])) }
  }
}

export function changeAccountChoice(input: {
  readonly acct: AccountKey
  readonly current: AccountSnapshot
  readonly settings: Snapshot<Settings>
  readonly additionalChosenPlaylists: ReadonlySet<PlaylistId>
  readonly choice: AccountChoice
}): AccountChoiceResult {
  const { choice } = input
  const current = input.current.kind === "present" ? input.current.bodies.setup : undefined
  let setup: Setup
  switch (choice.kind) {
    case "auto-add": {
      const exists = current?.autoAdd.some(entry => entry.pl === choice.playlist) ?? false
      if (exists === choice.chosen) return { kind: "unchanged" }
      setup = current === undefined ? defaultSetup() : decodeSetup(current)
      setup.autoAdd = choice.chosen
        ? [...setup.autoAdd, { pl: choice.playlist, takes: "videos" }]
        : setup.autoAdd.filter(entry => entry.pl !== choice.playlist)
      break
    }
    case "takes":
    case "percentage": {
      const entry = current?.autoAdd.find(entry => entry.pl === choice.playlist)
      if (entry === undefined) return { kind: "invalid", reason: "missing-auto-add" }
      if (choice.kind === "percentage" && choice.pct !== null && !isPercent(choice.pct)) {
        return { kind: "invalid", reason: "invalid-percentage" }
      }
      if (choice.kind === "takes" ? entry.takes === choice.takes : (entry.pct ?? null) === choice.pct) {
        return { kind: "unchanged" }
      }
      setup = decodeSetup(current)
      setup.autoAdd = setup.autoAdd.map(entry => {
        if (entry.pl !== choice.playlist) return entry
        if (choice.kind === "takes") return { ...entry, takes: choice.takes }
        const next = { ...entry }
        if (choice.pct === null) delete next.pct
        else next.pct = choice.pct
        return next
      })
      break
    }
    case "shortcut-target": {
      if (!input.settings.shortcuts.list.some(shortcut => shortcut.id === choice.shortcut)) {
        return { kind: "invalid", reason: "missing-shortcut" }
      }
      if ((current?.targets[choice.shortcut] ?? null) === choice.playlist) return { kind: "unchanged" }
      setup = current === undefined ? defaultSetup() : decodeSetup(current)
      if (choice.playlist === null) delete setup.targets[choice.shortcut]
      else setup.targets[choice.shortcut] = choice.playlist
      break
    }
    case "save-target": {
      if ((current?.[choice.field] ?? null) === choice.playlist) return { kind: "unchanged" }
      setup = current === undefined ? defaultSetup() : decodeSetup(current)
      setup[choice.field] = choice.playlist
      break
    }
    default: {
      const exhaustive: never = choice
      return exhaustive
    }
  }
  return finishChoice({
    ...input, setup,
    filters: input.current.kind === "present" ? input.current.bodies.filters : {}
  })
}

export function planSetupRemoval(input: {
  readonly acct: AccountKey
  readonly current: AccountSnapshot
}): { kind: "unchanged" } | { kind: "remove"; removal: SetupRemoval } {
  return input.current.kind === "absent"
    ? { kind: "unchanged" }
    : { kind: "remove", removal: removalFor(input.acct, input.current.bodies.filters) }
}

export function removeSharedShortcut(input: {
  readonly settings: Snapshot<Settings>
  readonly shortcut: ShortcutId
  readonly accounts: readonly {
    readonly acct: AccountKey
    readonly current: AccountSnapshot
    readonly additionalChosenPlaylists: ReadonlySet<PlaylistId>
  }[]
}):
  | { kind: "unchanged" }
  | {
    kind: "removed"
    settings: Settings
    accounts: readonly Extract<AccountChoiceResult, { kind: "save" | "remove" }>[]
  } {
  if (!input.settings.shortcuts.list.some(shortcut => shortcut.id === input.shortcut)) return { kind: "unchanged" }
  const decoded = decodeSettings(input.settings)
  const settings = normalizeSettingsForWrite({
    ...decoded, shortcuts: { ...decoded.shortcuts, list: decoded.shortcuts.list.filter(shortcut => shortcut.id !== input.shortcut) }
  })
  const accounts: Extract<AccountChoiceResult, { kind: "save" | "remove" }>[] = []
  for (const account of input.accounts) {
    if (account.current.kind === "absent" || !Object.hasOwn(account.current.bodies.setup.targets, input.shortcut)) continue
    const setup = decodeSetup(account.current.bodies.setup)
    delete setup.targets[input.shortcut]
    accounts.push(finishChoice({ ...account, setup, filters: account.current.bodies.filters, settings }))
  }
  return { kind: "removed", settings, accounts }
}

export type ClaimMergeNotice = {
  readonly acct: AccountKey
  readonly dropped: number
  readonly claim: Readonly<ClaimNoticeDetails>
}
export type ClaimAccountEffect =
  | { readonly kind: "empty-absent" }
  | { readonly kind: "remove"; readonly removal: SetupRemoval }
  | {
    readonly kind: "retain"
    readonly setup: { readonly kind: "unchanged" } | { readonly kind: "save"; readonly data: Setup }
    readonly filtersToAdd: readonly { readonly playlist: PlaylistId; readonly data: Filter }[]
  }
export type ClaimMergeResult =
  | { readonly kind: "absent" | "empty-source" | "no-match" }
  | { readonly kind: "matched"; readonly account: ClaimAccountEffect; readonly notice: ClaimMergeNotice }

export function mergeUnclaimedChoices(input: {
  readonly acct: AccountKey
  readonly unclaimed: Snapshot<Unclaimed> | undefined
  readonly current: AccountSnapshot
  readonly settings: Snapshot<Settings>
  readonly ownedPlaylistIds: ReadonlySet<PlaylistId>
}): ClaimMergeResult {
  const source = input.unclaimed
  if (source === undefined) return { kind: "absent" }
  const sources = new Set([...source.autoAdd, ...Object.keys(source.filters)])
  if (source.shortcutPlaylist !== null) sources.add(source.shortcutPlaylist)
  if (sources.size === 0) return { kind: "empty-source" }
  const owned = (playlist: string) => isPlaylistId(playlist) && input.ownedPlaylistIds.has(playlist)
  if (![...sources].some(owned)) return { kind: "no-match" }
  const current = input.current.kind === "present" ? input.current.bodies : undefined
  const setup = current ? decodeSetup(current.setup) : defaultSetup()
  const selected = new Set(setup.autoAdd.map(entry => entry.pl))
  let autoAddAdded = 0
  for (const playlist of source.autoAdd) {
    if (!owned(playlist) || selected.has(playlist)) continue
    setup.autoAdd.push({ pl: playlist, takes: "videos" })
    selected.add(playlist)
    autoAddAdded++
  }
  const filtersToAdd: { playlist: PlaylistId; data: Filter }[] = []
  for (const [playlist, data] of Object.entries(source.filters)) {
    if (isPlaylistId(playlist) && owned(playlist) && !Object.hasOwn(current?.filters ?? {}, playlist)) {
      filtersToAdd.push({ playlist, data: decodeFilter(data) })
    }
  }
  let shortcut: ClaimShortcutOutcome
  if (source.shortcutPlaylist === null) shortcut = { kind: "not-carried" }
  else if (!owned(source.shortcutPlaylist)) shortcut = { kind: "not-owned" }
  else if (!isShortcutId(source.originalShortcutId)) shortcut = { kind: "skipped", reason: "missing-provenance" }
  else if (!input.settings.shortcuts.list.some(row => row.id === source.originalShortcutId)) {
    shortcut = { kind: "skipped", reason: "deleted-original" }
  } else if (Object.hasOwn(setup.targets, source.originalShortcutId)) {
    shortcut = setup.targets[source.originalShortcutId] === source.shortcutPlaylist
      ? { kind: "already-set", shortcut: source.originalShortcutId }
      : { kind: "skipped", reason: "target-filled" }
  } else {
    Object.defineProperty(setup.targets, source.originalShortcutId, {
      value: source.shortcutPlaylist, enumerable: true, configurable: true, writable: true
    })
    shortcut = { kind: "filled", shortcut: source.originalShortcutId }
  }
  const notice: ClaimMergeNotice = {
    acct: input.acct, dropped: [...sources].filter(playlist => !owned(playlist)).length,
    claim: { autoAddAdded, filtersAdded: filtersToAdd.length, shortcut }
  }
  const shortcutIds = new Set(input.settings.shortcuts.list.map(row => row.id))
  const liveTargets = Object.fromEntries(Object.entries(setup.targets).filter(([id]) => shortcutIds.has(id)))
  const hasKeptFilters = [...Object.keys(current?.filters ?? {}), ...filtersToAdd.map(filter => filter.playlist)]
    .some(playlist => !selected.has(playlist))
  if (isSetupEmpty({ ...setup, targets: liveTargets }, hasKeptFilters)) {
    return { kind: "matched", notice, account: current
      ? { kind: "remove", removal: removalFor(input.acct, current.filters) }
      : { kind: "empty-absent" } }
  }
  const changed = !current || autoAddAdded > 0 || shortcut.kind === "filled"
  if (!changed) return { kind: "matched", notice, account: { kind: "retain", setup: { kind: "unchanged" }, filtersToAdd } }
  const additionalChosenPlaylists = new Set<string>()
  if (input.settings.shortcuts.list.some(row => row.watchLaterOnEveryAccount && !Object.hasOwn(liveTargets, row.id))) {
    additionalChosenPlaylists.add("WL")
  }
  return { kind: "matched", notice, account: {
    kind: "retain", filtersToAdd,
    setup: { kind: "save", data: normalizeSetupForWrite(setup, { shortcutIds, additionalChosenPlaylists }) }
  } }
}
