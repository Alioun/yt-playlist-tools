import type { Key } from "../model"
import { keyMatches } from "./match"
import type { BrowserCommand, Modifiers, Platform, ShortcutWarning, Site } from "./types"

type BrowserRule = { key: Key; action: string; reserved: boolean }
const noModifiers: Modifiers = { ctrl: false, alt: false, shift: false, meta: false }

function chord(code: string, held: Partial<Modifiers> = {}): Key {
  const char = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit[0-9]$/.test(code) ? code.slice(5) : undefined
  return { code, ...(char === undefined ? {} : { char }), ...noModifiers, ...held }
}

function browserRules(platform: Platform): BrowserRule[] {
  const primary = platform.os === "macos" ? { meta: true } : { ctrl: true }
  const rules: BrowserRule[] = []
  const add = (codes: readonly string[], held: Partial<Modifiers>, reserved: boolean, action: string) => {
    for (const code of codes) rules.push({ key: chord(code, held), action, reserved })
  }
  add(["KeyT", "KeyN", "KeyW"], primary, true, "tab or window control")
  add(platform.browser === "chrome" ? ["KeyN", "KeyT", "KeyW"] : ["KeyW", "KeyP"], { ...primary, shift: true }, true, "tab or window control")
  if (platform.browser === "chrome") {
    add(["Tab", "PageUp", "PageDown"], { ctrl: true }, true, "switch tabs")
    add(["Tab"], { ctrl: true, shift: true }, true, "switch tabs")
    if (platform.os !== "macos") {
      add(["F4"], { alt: true }, true, "close the window")
      add(["F4"], { ctrl: true }, true, "close the tab")
      add(["KeyA", "KeyB", "KeyI", "KeyN", "KeyR", "KeyT"], { alt: true, shift: true }, true, "browser control")
    }
    if (platform.os === "macos") add(["KeyQ"], { meta: true }, true, "quit")
    if (platform.os === "linux") add(["KeyQ"], { ctrl: true }, true, "quit")
  } else {
    add(["KeyQ"], platform.os === "macos" ? { meta: true } : { ctrl: true, shift: platform.os === "windows" }, true, "quit")
  }
  add(["KeyD"], primary, false, "bookmark this page")
  add(["KeyS"], primary, false, "save this page")
  add(["KeyL"], primary, false, "go to the address bar")
  add(["KeyR"], primary, false, "reload this page")
  add(["F5"], {}, false, "reload this page")
  if (platform.os !== "macos") {
    add(["KeyD"], { alt: true }, false, "go to the address bar")
    add(platform.browser === "chrome" ? ["KeyE", "KeyF"] : ["KeyF", "KeyE", "KeyV", "KeyS", "KeyB", "KeyT", "KeyH"], { alt: true }, false, "open a browser menu")
  }
  return rules
}

function matchesKey(rule: Readonly<Key>, key: Readonly<Key>): boolean {
  return keyMatches(rule, { key: key.char ?? "", code: key.code, ctrlKey: key.ctrl, altKey: key.alt, shiftKey: key.shift, metaKey: key.meta, altGraph: false })
}

export function isReserved(key: Readonly<Key>, platform: Platform): boolean {
  return browserRules(platform).some(rule => rule.reserved && matchesKey(rule.key, key))
}

const youtubeKeys = [
  ["KeyK", "Play/pause"], ["Space", "Play/pause"], ["KeyJ", "Seek backward"], ["KeyL", "Seek forward"],
  ["KeyM", "Mute"], ["KeyF", "Fullscreen"], ["KeyC", "Captions"], ["KeyI", "Miniplayer"],
  ["KeyT", "Theater mode"], ["ArrowLeft", "Seek backward"], ["ArrowRight", "Seek forward"],
  ["ArrowUp", "Increase volume"], ["ArrowDown", "Decrease volume"]
] satisfies [string, string][]

const musicKeys = [
  ["Space", "Play/pause"], ["Semicolon", "Play/pause"], ["KeyJ", "Next song"], ["KeyK", "Previous song"],
  ["KeyL", "Seek forward"], ["KeyH", "Seek backward"], ["KeyS", "Shuffle"], ["KeyR", "Repeat"],
  ["Equal", "Increase volume"], ["Minus", "Decrease volume"], ["KeyM", "Mute"], ["KeyQ", "Toggle queue"],
  ["Escape", "Toggle queue / expanded player"], ["KeyF", "Fullscreen"], ["Slash", "Search"], ["KeyG", "Navigation sequence"]
] satisfies [string, string][]

export function shortcutWarnings(key: Readonly<Key>, context: { sites: readonly Site[]; platform: Platform; commands: readonly BrowserCommand[] }): ShortcutWarning[] {
  const warnings: ShortcutWarning[] = []
  for (const site of context.sites) {
    const table = site === "www" ? youtubeKeys : musicKeys
    for (const [code, action] of table) {
      if (matchesKey(chord(code), key)) warnings.push({ kind: "site", site, action })
    }
    if (site === "music" && key.shift && !key.ctrl && !key.alt && !key.meta && ["Equal", "Minus", "Slash"].includes(key.code)) {
      warnings.push({ kind: "site", site, action: key.code === "Slash" ? "Keyboard shortcuts" : key.code === "Equal" ? "Like current song" : "Dislike current song" })
    }
    if (site === "music") {
      const shifted = [
        ["KeyN", "Next song"], ["KeyP", "Previous song"], ["KeyL", "Seek forward 1 s"], ["KeyH", "Seek backward 1 s"],
        ["ArrowLeft", "Seek backward"], ["ArrowRight", "Seek forward"]
      ] satisfies [string, string][]
      for (const [code, action] of shifted) {
        if (matchesKey(chord(code, { shift: true }), key)) warnings.push({ kind: "site", site, action })
      }
      const fineSeek = [["ArrowLeft", "Seek backward 1 s"], ["ArrowRight", "Seek forward 1 s"]] satisfies [string, string][]
      for (const [code, action] of fineSeek) {
        if (matchesKey(chord(code, { ctrl: true, shift: true }), key)) warnings.push({ kind: "site", site, action })
      }
    }
  }
  for (const rule of browserRules(context.platform)) {
    if (!rule.reserved && matchesKey(rule.key, key)) warnings.push({ kind: "browser", action: rule.action })
  }
  for (const command of context.commands) {
    if (matchesKey(command.key, key)) warnings.push({ kind: "command", command: command.command })
  }
  return warnings
}

const names: Readonly<Record<string, string>> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", PageDown: "Page Down", PageUp: "Page Up",
  Space: "Space", Escape: "Esc", Backquote: "`", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Comma: ",", Equal: "=", Minus: "-", Period: ".", Quote: "'", Semicolon: ";", Slash: "/"
}

export function displayModifiers(held: Modifiers, os: Platform["os"]): string {
  const labels = os === "macos" ? ["⌃", "⌥", "⇧", "⌘"] : ["Ctrl", "Alt", "Shift", os === "linux" ? "Super" : "Win"]
  return labels.filter((_, index) => [held.ctrl, held.alt, held.shift, held.meta][index]).join(os === "macos" ? "" : "+")
}

export function display(key: Readonly<Key>, os: Platform["os"]): string {
  const held = displayModifiers(key, os)
  const label = key.char?.toUpperCase() ?? names[key.code] ?? key.code.replace(/^Key|^Digit/, "")
  return `${held}${held && os !== "macos" ? "+" : ""}${label}`
}
