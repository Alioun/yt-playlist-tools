import { readFileSync, writeFileSync } from "node:fs"

type Entry = { readonly message: string; readonly placeholders?: Readonly<Record<string, { readonly content: string }>> }

const cataloguePath = new URL("../src/public/_locales/en/messages.json", import.meta.url)
const parametersPath = new URL("../src/shared/i18n/parameters.ts", import.meta.url)
const source = readFileSync(cataloguePath, "utf8")
const catalogue: Record<string, Entry> = JSON.parse(source)

// Page scripts can't carry a table of every message's placeholder order, so each message numbers its
// placeholders in name order and createSiteI18n sorts the names it's given. Only the numbering changes.
const numbered = Object.fromEntries(Object.entries(catalogue).map(([key, entry]) => {
  if (!entry.placeholders) return [key, entry]
  const names = Object.keys(entry.placeholders).sort()
  return [key, { ...entry, placeholders: Object.fromEntries(Object.entries(entry.placeholders).map(([name, value]) => [name, { ...value, content: `$${names.indexOf(name) + 1}` }])) }]
})) as Record<string, Entry>
const numberedText = `${JSON.stringify(numbered, null, 2)}\n`

const entries = Object.entries(numbered).map(([key, entry]) => [key, Object.keys(entry.placeholders ?? {}).sort().map(name => JSON.stringify(name))] as const)
const text = `// Generated from src/public/_locales/en/messages.json by scripts/generate-message-parameters.ts.
export type MessageParameters = {
${entries.map(([key, names]) => `  ${JSON.stringify(key)}: readonly [${names.join(", ")}]`).join("\n")}
}
export const messagePlaceholders: { readonly [K in keyof MessageParameters]?: MessageParameters[K] } = {
${entries.filter(([, names]) => names.length).map(([key, names]) => `  ${JSON.stringify(key)}: [${names.join(", ")}],`).join("\n")}
}
`
if (process.argv.includes("--check")) {
  const stale = [
    ...source === numberedText ? [] : ["src/public/_locales/en/messages.json numbers some placeholders out of name order."],
    ...readFileSync(parametersPath, "utf8") === text ? [] : ["src/shared/i18n/parameters.ts is out of date."]
  ]
  if (stale.length) {
    console.error(`${stale.join(" ")} Run bun scripts/generate-message-parameters.ts`)
    process.exit(1)
  }
} else {
  if (source !== numberedText) writeFileSync(cataloguePath, numberedText)
  writeFileSync(parametersPath, text)
}
