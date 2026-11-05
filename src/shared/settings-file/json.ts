import { parseJsonText, type JsonValue } from "../contracts/json"
import { unsafeKey } from "./shape"

// JSON.parse has already checked syntax. Retain member occurrences before it can hide duplicates.
export function parseFileJson(text: unknown): JsonValue | undefined {
  const parsed = parseJsonText(text)
  if (!parsed.ok || typeof text !== "string") return undefined
  const stack: (Set<string> | null)[] = []
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g
  for (const match of text.matchAll(tokens)) {
    const token = match[0]
    if (token === "{") stack.push(new Set())
    else if (token === "[") stack.push(null)
    else if (token === "}" || token === "]") stack.pop()
    else {
      let after = match.index + token.length
      while (after < text.length && /\s/.test(text.charAt(after))) after++
      if (text.charAt(after) !== ":") continue
      const key: unknown = JSON.parse(token)
      const members = stack.at(-1)
      if (typeof key !== "string" || !members || unsafeKey(key) || members.has(key)) return undefined
      members.add(key)
    }
  }
  return parsed.value
}
