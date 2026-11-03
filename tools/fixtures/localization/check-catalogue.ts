import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import catalogue from "../../../src/public/_locales/en/messages.json"
import { messagePlaceholders } from "../../../src/shared/i18n/parameters"
import { richParts } from "../../../src/shared/i18n"

const fail = (code: string): never => {
  throw new Error(code)
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
type Entry = { readonly message: string; readonly placeholders?: Readonly<Record<string, { readonly content: string }>> }

if (!equal(readdirSync(fileURLToPath(new URL("../../../src/public/_locales", import.meta.url))).sort(), ["en"])) fail("E_SHIPPED_LOCALES")
const placeholders: Readonly<Record<string, readonly string[]>> = messagePlaceholders
const parameterizedKeys = Object.entries(catalogue)
  .filter(([, value]) => Object.keys((value as Entry).placeholders ?? {}).length)
  .map(([key]) => key)
if (!equal(parameterizedKeys.sort(), Object.keys(placeholders).sort())) fail("E_MESSAGE_KEYS")
let parameterized = 0,
  rich = 0
for (const [key, value] of Object.entries(catalogue)) {
  const entry: Entry = value
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || !entry.message) fail(`E_MESSAGE:${key}`)
  const names = [...new Set([...entry.message.matchAll(/\$([a-z_]+)\$/gi)].map(match => match[1]?.toLowerCase()))].sort()
  const declared = Object.keys(entry.placeholders ?? {}).sort()
  if (!equal(names, declared)) fail(`E_PLACEHOLDER_NAMES:${key}`)
  const metadata = Object.hasOwn(placeholders, key) ? placeholders[key] : []
  if (!metadata || !equal([...metadata].sort(), declared)) fail(`E_PARAMETER_TYPES:${key}`)
  const positions = Object.values(entry.placeholders ?? {})
    .map(value => value.content)
    .sort()
  if (
    !equal(
      positions,
      declared.map((_, index) => `$${index + 1}`)
    )
  )
    fail(`E_PLACEHOLDER_POSITIONS:${key}`)
  if (/<\/?[a-z][^>]*>/i.test(entry.message)) fail(`E_HTML:${key}`)
  if (declared.length) parameterized++
  if (entry.message.includes("[[strong]]")) {
    richParts(entry.message)
    if (declared.length) fail(`E_RICH_VALUES:${key}`)
    rich++
  }
}
const renderers = readFileSync(new URL("../../../src/shared/copy/messages.ts", import.meta.url), "utf8")
for (const match of renderers.matchAll(/i18n\.message\("([^"]+)"/g)) if (!Object.hasOwn(catalogue, match[1] ?? "")) fail("E_FEEDBACK_KEY")
console.log(JSON.stringify({ messages: Object.keys(catalogue).length, parameterized, rich, shippedLocales: ["en"] }))
