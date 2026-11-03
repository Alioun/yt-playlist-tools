import { isKey } from "../../shared/model/keys"
import type { Key } from "../../shared/model/types"
import type { BrowserCommand } from "../../shared/keys"
import type { CommandKeys } from "./controller"

export type NativeCommands = { getAll(): Promise<readonly { readonly name?: string; readonly shortcut?: string }[]> }
const symbols: Readonly<Record<string, "ctrl" | "alt" | "shift" | "meta">> = { "⌃": "ctrl", "⌥": "alt", "⇧": "shift", "⌘": "meta" }
const words: Readonly<Record<string, "ctrl" | "alt" | "shift" | "meta">> = {
  ctrl: "ctrl",
  macctrl: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  command: "meta",
  cmd: "meta",
  meta: "meta",
  super: "meta",
  search: "meta"
}
const named: Readonly<Record<string, string>> = {
  comma: "Comma",
  period: "Period",
  space: "Space",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
  delete: "Delete",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  ",": "Comma",
  ".": "Period",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight"
}
function code(token: string): { code: string; char?: string } | undefined {
  if (/^[a-z]$/i.test(token)) return { code: `Key${token.toUpperCase()}`, char: token.toLowerCase() }
  if (/^[0-9]$/.test(token)) return { code: `Digit${token}`, char: token }
  if (/^f([1-9]|1[0-2])$/i.test(token)) return { code: token.toUpperCase() }
  const mapped = named[token.toLowerCase()] ?? named[token]
  return mapped ? { code: mapped } : undefined
}
/** A browser command's shortcut as the browser shows it, "Alt+Shift+P" or "⌥⇧P", as a key; else null (UI-SET-23). */
export function parseCommandShortcut(text: string): Key | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const key: Key = { code: "", ctrl: false, alt: false, shift: false, meta: false }
  let rest = trimmed
  if (!trimmed.includes("+")) {
    while (rest.length > 1 && symbols[rest[0]!]) {
      key[symbols[rest[0]!]!] = true
      rest = rest.slice(1)
    }
  } else {
    const parts = trimmed.split("+")
    rest = parts.pop() ?? ""
    for (const part of parts) {
      const modifier = words[part.trim().toLowerCase()]
      if (!modifier) return null
      key[modifier] = true
    }
  }
  const main = code(rest.trim())
  if (!main) return null
  const parsed = { ...key, ...main }
  return isKey(parsed) ? parsed : null
}
export function createCommandKeys(native: NativeCommands | undefined): CommandKeys & { readonly named: () => Promise<readonly { readonly name: string; readonly key: Key | null }[] | null> } {
  async function named() {
    if (!native) return null
    try {
      return (await native.getAll()).flatMap(row => (row.name ? [{ name: row.name, key: parseCommandShortcut(row.shortcut ?? "") }] : []))
    } catch {
      return null
    }
  }
  return {
    named,
    async read() {
      const rows = await named()
      if (!rows) return { kind: "unavailable" }
      const keys: BrowserCommand[] = rows.flatMap(row => (row.key ? [{ key: row.key, command: row.name }] : []))
      return { kind: "available", keys }
    }
  }
}
