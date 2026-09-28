/**
 * Keyboard-shortcut encoding shared by the popup (which records) and the
 * content script (which matches).
 *
 * These used to live apart, and drifted: the popup wrote "Control" while the
 * matcher looked up `event["controlKey"]`, which does not exist -- KeyboardEvent
 * spells it `ctrlKey`. Every Ctrl shortcut silently never fired, and because
 * the "no extra modifiers" check used the same bad lookup, a bare "S" shortcut
 * fired while Ctrl was held. One module, one format, one set of tests.
 *
 * Wire format is unchanged for backwards compatibility with settings saved by
 * earlier versions: modifiers in a fixed order, then the key, joined by "+",
 * e.g. "Control+Shift+S".
 */

export const MODIFIERS = ["Control", "Alt", "Shift", "Meta"] as const
export type Modifier = (typeof MODIFIERS)[number]

/** Maps our wire name to the actual KeyboardEvent property. */
const MODIFIER_PROP: Record<Modifier, "ctrlKey" | "altKey" | "shiftKey" | "metaKey"> = {
  Control: "ctrlKey",
  Alt: "altKey",
  Shift: "shiftKey",
  Meta: "metaKey"
}

/** Keys that are only modifiers -- never the "real" key of a shortcut. */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"])

export interface ParsedShortcut {
  key: string
  modifiers: Modifier[]
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

/** Builds the wire string from a keydown event. Returns null for a bare modifier. */
export function formatShortcut(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}): string | null {
  if (isModifierKey(event.key)) return null

  const parts: string[] = MODIFIERS.filter(
    (modifier) => event[MODIFIER_PROP[modifier]]
  )
  parts.push(event.key.toUpperCase())
  return parts.join("+")
}

/**
 * Parses the wire string. Handles a literal "+" as the key, which a naive
 * split would turn into an empty, unmatchable key ("Shift++" -> ["Shift","",""]).
 */
export function parseShortcut(shortcut: string): ParsedShortcut | null {
  if (!shortcut) return null

  const segments = shortcut.split("+")

  // A trailing empty segment means the key itself was "+": the join produced
  // "...+" + "+" so the final two segments are ["", ""].
  let key: string
  if (segments.length >= 2 && segments.at(-1) === "" && segments.at(-2) === "") {
    key = "+"
    segments.splice(-2, 2)
  } else {
    key = segments.pop() ?? ""
  }

  if (!key) return null

  const modifiers = MODIFIERS.filter((modifier) =>
    segments.some((segment) => segment.toLowerCase() === modifier.toLowerCase())
  )

  return { key, modifiers }
}

/**
 * True when the event matches exactly -- every required modifier held, and no
 * extra ones. Comparison is case-insensitive because the recorder uppercases
 * the key while the event reports it in its natural case.
 */
export function matchesShortcut(
  event: {
    key: string
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    metaKey: boolean
  },
  parsed: ParsedShortcut | null
): boolean {
  if (!parsed) return false
  if (event.key.toLowerCase() !== parsed.key.toLowerCase()) return false

  return MODIFIERS.every(
    (modifier) =>
      parsed.modifiers.includes(modifier) === Boolean(event[MODIFIER_PROP[modifier]])
  )
}
