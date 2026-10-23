import type { Key } from "../model"
import type { Binding, KeyFacts, MatchContext, Modifiers, PathDescriptor, ShortcutTarget } from "./types"

const nonTypingInputs = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "image", "color", "file"])
const typingRoles = new Set(["textbox", "searchbox", "combobox", "spinbutton"])
const printableCodes = new Set([
  "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma", "Equal", "Minus", "Period", "Quote", "Semicolon", "Slash",
  "IntlBackslash", "IntlRo", "IntlYen"
])

export function modifiers(facts: KeyFacts): Modifiers {
  return { ctrl: facts.ctrlKey, alt: facts.altKey, shift: facts.shiftKey, meta: facts.metaKey }
}

export function sameModifiers(left: Modifiers, right: Modifiers): boolean {
  return left.ctrl === right.ctrl && left.alt === right.alt && left.shift === right.shift && left.meta === right.meta
}

export function isASCIICharacter(char: string): boolean {
  return /^[a-z0-9]$/i.test(char)
}

function compareCharacters(left: string | undefined, right: string | undefined): boolean | undefined {
  if (left === undefined || right === undefined || !isASCIICharacter(left) || !isASCIICharacter(right)) return undefined
  return left.toLowerCase() === right.toLowerCase()
}

export function keyMatches(key: Readonly<Key>, facts: KeyFacts): boolean {
  if (facts.altGraph || !sameModifiers(key, modifiers(facts))) return false
  return compareCharacters(key.char, facts.key) ?? key.code === facts.code
}

function overlapsCharacter(character: Readonly<Key>, physical: Readonly<Key>): boolean {
  if (character.char === undefined || !isASCIICharacter(character.char)) return false
  const compared = compareCharacters(character.char, physical.char)
  if (compared !== undefined) return compared
  // Layouts can place ASCII characters on any printable position, but not on named keys.
  return /^(?:Key[A-Z]|Digit[0-9])$/.test(physical.code) || printableCodes.has(physical.code) ||
    (/^Numpad[0-9]$/.test(physical.code) && /^[0-9]$/.test(character.char))
}

export function keysOverlap(left: Readonly<Key>, right: Readonly<Key>): boolean {
  return sameModifiers(left, right) && (left.code === right.code ||
    overlapsCharacter(left, right) || overlapsCharacter(right, left))
}

export function sameTarget(left: ShortcutTarget, right: ShortcutTarget): boolean {
  if (left.kind === "playlist") return right.kind === "playlist" && left.id === right.id
  if (left.kind === "music") return right.kind === "music" && left.action === right.action
  return left.kind === right.kind
}

export function isTyping(path: readonly PathDescriptor[]): boolean {
  return path.some(node => {
    const tag = node.tagName?.toLowerCase()
    return (tag === "input" && !nonTypingInputs.has(node.inputType?.toLowerCase() ?? "text")) ||
      tag === "textarea" || tag === "select" || node.isContentEditable === true || node.contentEditable === true ||
      node.contentEditable === "" || node.contentEditable === "true" || node.contentEditable === "plaintext-only" ||
      (node.role?.toLowerCase().split(/\s+/).some(role => typingRoles.has(role)) ?? false)
  })
}

export function isComposing(facts: KeyFacts): boolean {
  return facts.isComposing === true || facts.keyCode === 229
}

export function match(facts: KeyFacts, bindings: readonly Binding[], context: MatchContext): Binding | null {
  if (facts.repeat || isComposing(facts) || context.menuOpen || context.dialogOpen || isTyping(context.path)) return null
  const binding = bindings.find(candidate => keyMatches(candidate.key, facts))
  return binding && !context.pending.some(target => sameTarget(target, binding.target)) ? binding : null
}
