import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { checkUtf8, firstInvalidUtf8 } from "../../scripts/check-utf8"

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function build(files: Record<string, string | Uint8Array>) {
  const directory = await mkdtemp(join(tmpdir(), "check-utf8-"))
  directories.push(directory)
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(directory, path, ".."), { recursive: true })
    await writeFile(join(directory, path), content)
  }
  return directory
}

describe("check:utf8", () => {
  test("agrees with a strict UTF-8 decoder on valid text and on random bytes", () => {
    const strict = new TextDecoder("utf-8", { fatal: true })
    const valid = (bytes: Uint8Array) => {
      try {
        strict.decode(bytes)
        return true
      } catch {
        return false
      }
    }
    expect(firstInvalidUtf8(new TextEncoder().encode("Save · Später · 保存 · 🎵"))).toBeUndefined()
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 256
    for (let run = 0; run < 5000; run++) {
      const bytes = Uint8Array.from({ length: 1 + (run % 6) }, () => (run % 3 === 0 ? 0x80 + (random() % 0x80) : random()))
      expect(firstInvalidUtf8(bytes) === undefined).toBe(valid(bytes))
    }
  })

  test("names the first bad byte: overlong, surrogate, truncated and out-of-range sequences fail", () => {
    for (const [bytes, offset] of [
      [[0x61, 0xc0, 0x80], 1],
      [[0xed, 0xa0, 0x80], 0],
      [[0x61, 0x62, 0xe2, 0x82], 2],
      [[0xf4, 0x90, 0x80, 0x80], 0],
      [[0x80], 0]
    ] as const) {
      expect(firstInvalidUtf8(Uint8Array.from(bytes))).toBe(offset)
    }
  })

  test("a build with non-ASCII UTF-8 passes, and a Latin-1 byte in any text file fails with its file", async () => {
    const good = await build({ "content-scripts/www.js": 'const dot = "·"', "popup.html": "<p>Später</p>", "brand/icon.png": Uint8Array.of(0xff, 0xd8) })
    expect(checkUtf8([good])).toEqual([])
    const bad = await build({ "chunks/popup.js": Uint8Array.of(0x61, 0xb7, 0x62), "a.css": "a{}" })
    expect(checkUtf8([good, bad])).toEqual([`${join(bad, "chunks/popup.js")}: invalid UTF-8 at byte 1`])
  })

  test("the CLI fails on a bad build and passes on a good one", async () => {
    const script = resolve(import.meta.dir, "../../scripts/check-utf8.ts")
    const run = (directory: string) => spawnSync(process.execPath, ["--no-env-file", script, directory], { encoding: "utf8", timeout: 10000 })
    const bad = run(await build({ "background.js": Uint8Array.of(0xfe) }))
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain("background.js: invalid UTF-8 at byte 0")
    expect(run(await build({ "background.js": "ok" })).status).toBe(0)
    const missing = run(join(tmpdir(), "check-utf8-missing-build"))
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain("check-utf8-missing-build: no such build directory")
  }, 15000)
})
