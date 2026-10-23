export type Stamp = { v: number; gen: string; at: number; by: string }
export type Stamped<T> = Stamp & { data: T }
export type Tombstone = Stamp & { deleted: true }

export type Key = {
  char?: string
  code: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export type Shortcut = {
  id: string
  key: Key | null
  label: string
  watchLaterOnEveryAccount: boolean
}
export type MusicAction = "next" | "queue" | "save" | "like" | "remove" | "library" | "mix" | "album" | "artist"
export type GatherOrder = "newest" | "oldest" | "english" | "non-english" | "left-to-right" | "right-to-left" | "shuffled"
export type Settings = {
  theme: "system" | "light" | "dark"
  undoKey: Key | null
  autoAdd: { on: boolean; feedback: boolean; pct: number; toolbarTick: boolean; toolbarPaused: boolean }
  shortcuts: {
    on: boolean; feedback: boolean; music: boolean; preset: boolean
    picker: Key | null
    list: Shortcut[]
  }
  quickSave: { on: boolean; feedback: boolean; shortsShelves: boolean }
  queueButton: { on: boolean; feedback: boolean }
  watchButton: { on: boolean; feedback: boolean; shorts: boolean }
  cardMenu: { on: boolean; keepLinkMenu: boolean }
  browserMenu: { on: boolean; feedback: boolean }
  musicSection: boolean
  musicActions: {
    on: boolean; feedback: boolean; preset: boolean
    buttons: Record<MusicAction | "bar", boolean>
  }
  musicKeys: {
    on: boolean; feedback: boolean; preset: boolean
    keys: Record<MusicAction | "picker", Key | null>
  }
  anyTabKeys: { on: boolean; feedback: boolean }
  gather: {
    on: boolean; feedback: boolean
    to: "player" | "queue" | "playlist"
    order: GatherOrder
    close: boolean
    auto: {
      unvisited: boolean; after: "1h" | "1d" | "1w"
      background: boolean
      count: boolean; n: 5 | 10 | 15 | 20 | 30 | 50
    }
  }
}

export type AccountLabel = { name: string; handle?: string; avatar?: string }
export type AutoAddPlaylist = { pl: string; takes: "videos" | "shorts" | "both"; pct?: number }
export type Setup = {
  label: AccountLabel | null
  autoAdd: AutoAddPlaylist[]
  targets: Record<string, string>
  quickSave: string | null
  musicSave: string | null
  gather: string | null
  marks: Record<string, "missing" | "full">
}
export type Filter = {
  mode: "allow" | "deny"
  on: boolean
  channels: [id: string, title: string, handle?: string][]
}

export type UpgradeDetails = {
  from: "1.4.5" | "1.5.0"
  autoAdd: { kept: number; dropped: number }
  pct: { value: number; wasUnset: boolean; authorised: boolean }
  feedback: boolean
  shortcut: {
    raw: string
    key: Key | null
    playlist: boolean
    note: "ok" | "ctrl-never-fired" | "unconvertible" | "no-playlist" | "no-key" | "none"
    clash?: string
  }
  credentialsDeleted: boolean
}
export type Device = {
  id: string
  consent: { v: number; at: number } | null
  syncOn: boolean
  upgradeNote: {
    state: "pending" | "done"
    details: UpgradeDetails
    opened: boolean
    seen: boolean
    reopened: boolean
  } | null
  claimNotice: { acct: string; dropped: number } | null
  lastAccount: string | null
  newPlaylistVisibility: "PRIVATE" | "UNLISTED" | "PUBLIC" | null
  pickerSortAZ: boolean
  detailedLog: boolean
  recentAdds: boolean
  legacyCleared: boolean
}
export type Unclaimed = {
  from: "1.4.5" | "1.5.0"
  autoAdd: string[]
  shortcutPlaylist: string | null
  filters: Record<string, Filter>
  at: number
}
