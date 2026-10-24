import {
  decodeFilter, decodeSettings, decodeSetup, defaultSetup, isPercent, isPlaylistId,
  isSetupEmpty, normalizeSettingsForWrite, normalizeSetupForWrite
} from "../../shared/model"
import type {
  AccountKey, AutoAddPlaylist, DocumentKey, Filter, PlaylistId, Settings, Setup, ShortcutId
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
