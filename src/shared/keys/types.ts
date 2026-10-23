import type { Key, Settings } from "../model"

export type Site = "www" | "music"
export type Platform = { browser: "chrome" | "firefox"; os: "macos" | "windows" | "linux" }
export type Modifiers = Readonly<Pick<Key, "ctrl" | "alt" | "shift" | "meta">>

export type KeyFacts = {
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  readonly altGraph: boolean
  readonly isComposing?: boolean
  readonly keyCode?: number
  readonly repeat?: boolean
}

export type PathDescriptor = {
  readonly tagName?: string
  readonly inputType?: string
  readonly isContentEditable?: boolean
  readonly contentEditable?: string | boolean
  readonly role?: string
}

export type ShortcutTarget =
  | { readonly kind: "playlist"; readonly id: string }
  | { readonly kind: "picker" }
  | { readonly kind: "music"; readonly action: keyof Settings["musicKeys"]["keys"] }
  | { readonly kind: "undo" }

export type Binding = { readonly target: ShortcutTarget; readonly key: Readonly<Key> }
export type MatchContext = {
  readonly path: readonly PathDescriptor[]
  readonly menuOpen: boolean
  readonly dialogOpen: boolean
  readonly pending: readonly ShortcutTarget[]
}

export type Conflict = { readonly target: ShortcutTarget; readonly sites: readonly Site[] }
export type BrowserCommand = { readonly key: Readonly<Key>; readonly command: string }
export type ShortcutWarning =
  | { readonly kind: "site"; readonly site: Site; readonly action: string }
  | { readonly kind: "browser"; readonly action: string }
  | { readonly kind: "command"; readonly command: string }

export type Refusal = "plain-enter-space" | "ctrl-alt" | "reserved" | "unsupported-key"
export type RecorderState =
  | { readonly kind: "idle"; readonly key: Readonly<Key> | null }
  | { readonly kind: "recording"; readonly key: Readonly<Key> | null; readonly modifiers: Modifiers; readonly refusal: Refusal | null }
  | { readonly kind: "conflict"; readonly key: Readonly<Key> | null; readonly candidate: Readonly<Key>; readonly conflicts: readonly Conflict[] }

export type RecorderEvent =
  | { readonly kind: "start" }
  | { readonly kind: "clear" }
  | { readonly kind: "keydown" | "keyup"; readonly facts: KeyFacts }
  | { readonly kind: "blur" }
  | { readonly kind: "close" }
  | { readonly kind: "cancel" }
  | { readonly kind: "use-here" }

export type RecorderOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "commit"; readonly key: Readonly<Key> | null; readonly clear: readonly ShortcutTarget[] }

export type RecorderStep = {
  readonly state: RecorderState
  readonly consume: boolean
  readonly outcome: RecorderOutcome
}

export type RecorderContext = {
  readonly settings: Readonly<Settings>
  readonly target: ShortcutTarget
  readonly platform: Platform
}
