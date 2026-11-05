// Chrome refuses a content script that isn't valid UTF-8. Under Rolldown, WXT no longer asks for ASCII-only output, so built files carry raw non-ASCII text.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const textFile = /\.(?:js|mjs|css|html|json)$/

/** The byte offset of the first malformed UTF-8 sequence, or undefined when the bytes are valid UTF-8. */
export function firstInvalidUtf8(bytes: Uint8Array): number | undefined {
  for (let at = 0; at < bytes.length;) {
    const lead = bytes[at]!
    const [length, low, high] =
      lead < 0x80
        ? [1, 0, 0]
        : lead >= 0xc2 && lead <= 0xdf
          ? [2, 0x80, 0xbf]
          : lead === 0xe0
            ? [3, 0xa0, 0xbf]
            : lead === 0xed
              ? [3, 0x80, 0x9f]
              : lead >= 0xe1 && lead <= 0xef
                ? [3, 0x80, 0xbf]
                : lead === 0xf0
                  ? [4, 0x90, 0xbf]
                  : lead === 0xf4
                    ? [4, 0x80, 0x8f]
                    : lead >= 0xf1 && lead <= 0xf3
                      ? [4, 0x80, 0xbf]
                      : [0, 0, 0]
    if (length === 0 || at + length > bytes.length) return at
    if (length > 1 && (bytes[at + 1]! < low || bytes[at + 1]! > high)) return at
    for (let next = at + 2; next < at + length; next++) if (bytes[next]! < 0x80 || bytes[next]! > 0xbf) return at
    at += length
  }
  return undefined
}

export function checkUtf8(directories: readonly string[]): string[] {
  return directories.flatMap(directory =>
    !existsSync(directory)
      ? [`${directory}: no such build directory`]
      : readdirSync(directory, { recursive: true, withFileTypes: true })
          .filter(entry => entry.isFile() && textFile.test(entry.name))
          .map(entry => join(entry.parentPath, entry.name))
          .sort()
          .flatMap(file => {
            const offset = firstInvalidUtf8(readFileSync(file))
            return offset === undefined ? [] : [`${file}: invalid UTF-8 at byte ${offset}`]
          })
  )
}

if (import.meta.main) {
  const directories = process.argv.slice(2)
  if (directories.length === 0) {
    console.error("Usage: bun scripts/check-utf8.ts <build directory>...")
    process.exit(1)
  }
  const problems = checkUtf8(directories)
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log(`Built text files are valid UTF-8: ${directories.join(", ")}`)
}
