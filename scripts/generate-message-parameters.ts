import { readFileSync, writeFileSync } from "node:fs"

type Entry = { readonly message: string; readonly placeholders?: Readonly<Record<string, { readonly content: string }>> }

const cataloguePath = new URL("../src/public/_locales/en/messages.json", import.meta.url)
const parametersPath = new URL("../src/shared/i18n/parameters.ts", import.meta.url)
const catalogue: Record<string, Entry> = JSON.parse(readFileSync(cataloguePath, "utf8"))

const entries = Object.entries(catalogue).map(([key, entry]) => [key, Object.entries(entry.placeholders ?? {})
  .sort(([, a], [, b]) => Number(a.content.slice(1)) - Number(b.content.slice(1)))
  .map(([name]) => JSON.stringify(name))] as const)
// Every key is in the type; only messages with placeholders carry runtime data, so page bundles stay small.
const text = `// Generated from src/public/_locales/en/messages.json by scripts/generate-message-parameters.ts.
export type MessageParameters = {
${entries.map(([key, names]) => `  ${JSON.stringify(key)}: readonly [${names.join(", ")}]`).join("\n")}
}
export const messagePlaceholders: { readonly [K in keyof MessageParameters]?: MessageParameters[K] } = {
${entries.filter(([, names]) => names.length).map(([key, names]) => `  ${JSON.stringify(key)}: [${names.join(", ")}],`).join("\n")}
}
`
if (process.argv.includes("--check")) {
  if (readFileSync(parametersPath, "utf8") !== text) {
    console.error("src/shared/i18n/parameters.ts is out of date. Run bun scripts/generate-message-parameters.ts")
    process.exit(1)
  }
} else writeFileSync(parametersPath, text)
