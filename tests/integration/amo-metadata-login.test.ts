import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Kept out of the G28 proof, which runs only code-owned files. Every value is a fake.
const root = resolve(import.meta.dir, "../..")
const notes = ["**Test account:**", "- {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check.", "- Any Google account with a YouTube channel also works."].join("\n")
const login = ["dummy-reviewer@example.invalid", "dummy-reviewer-password-0000", "0000 1111", "2222 3333"]

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

// Without --strict: a release build fails on the four placeholders until amo-metadata.ts lets them through.
test("the release build keeps the reviewer notes' placeholders, even with a login in its environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "amo-metadata-login-"))
  directories.push(dir)
  for (const sub of ["store/notes", "store/release-notes", "dist", "_home"]) mkdirSync(join(dir, sub), { recursive: true })
  writeFileSync(join(dir, "store/notes/reviewer-full.md"), notes + "\n")
  writeFileSync(join(dir, "store/release-notes/2.0.0.md"), "Release notes.\n")
  const build = spawnSync(
    process.execPath,
    ["--no-env-file", join(root, "scripts/amo-metadata.ts"), "--version", "2.0.0", "--kind", "major", "--channel", "stable", "--out", "dist/amo-metadata.json"],
    { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: join(dir, "_home"), AMO_REVIEWER_LOGIN: login.join("\n") + "\n" }, encoding: "utf8" }
  )
  expect(build.status).toBe(0)
  const archived = readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")
  expect(JSON.parse(archived).version.approval_notes).toBe(notes)
  const output = archived + build.stdout + build.stderr
  expect(login.map((_, line) => ({ line, found: output.includes(login[line]!) || output.includes(login[line]!.replaceAll(" ", "")) }))).toEqual(login.map((_, line) => ({ line, found: false })))
})
