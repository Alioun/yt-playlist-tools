import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { buildAmoMetadata, nextRelease } from "../../scripts/amo-metadata"

const root = resolve(import.meta.dir, "../..")
const fromRepo = (path: string) => existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function runCli(...args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "amo-metadata-"))
  directories.push(directory)
  const out = join(directory, "amo-metadata.json")
  const ran = spawnSync(process.execPath, ["scripts/amo-metadata.ts", ...args, "--out", out], { cwd: root, encoding: "utf8" })
  return { status: ran.status, stdout: ran.stdout, metadata: existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : undefined }
}

test("the first beta's metadata is complete, so a strict release run passes the AMO step", () => {
  const { status, metadata, stdout } = runCli("--version", "1.99.1", "--kind", "minor", "--channel", "beta", "--previous", "1.4.5", "--strict")
  expect(stdout).not.toContain("::error::")
  expect(status).toBe(0)
  expect(metadata.version.approval_notes).toBe(
    "Pre-release 1.99.1 of 2.0.0, self-distributed to beta testers. Same build instructions, in SOURCE_CODE_REVIEW.md in the sources zip."
  )
  expect(metadata.version.release_notes["en-US"]).toStartWith("The first beta of Perchling for YouTube™ 2.0")
})

test("release notes go to AMO as a locale object, never a plain string", () => {
  const { metadata } = buildAmoMetadata({ version: "2.0.0", kind: "major", channel: "stable", previous: "1.99.3", read: fromRepo })
  expect(metadata.version.release_notes).toEqual({ "en-US": expect.stringContaining("YouTube Playlist Tools is now Perchling for YouTube™") })
})

test("maintainer comments never reach AMO", () => {
  const { metadata } = buildAmoMetadata({ version: "2.0.0", kind: "major", channel: "stable", previous: "1.99.3", read: fromRepo })
  expect(metadata.version.approval_notes).toStartWith("What this is\n")
  expect(metadata.version.approval_notes).not.toContain("<!--")
  expect(metadata.version.approval_notes).not.toContain("PROVISIONAL")
  expect(metadata.version.approval_notes).toContain("tabs.query({ windowId, url })")
})

test("the full notes are refused until the reviewer test account is filled in", () => {
  const { template, problems } = buildAmoMetadata({ version: "2.0.0", kind: "major", channel: "stable", previous: "1.99.3", read: fromRepo })
  expect(template).toBe("full")
  expect(problems).toEqual(["store/notes/reviewer-full.md has no value for {email}, {password}, {code1}, {code2}"])

  const strict = runCli("--version", "2.0.0", "--kind", "major", "--channel", "stable", "--previous", "1.99.3", "--strict")
  expect(strict.status).toBe(1)
  expect(strict.stdout).toContain("::error::store/notes/reviewer-full.md has no value for {email}")

  const dryRun = runCli("--version", "2.0.0", "--kind", "major", "--channel", "stable", "--previous", "1.99.3")
  expect(dryRun.status).toBe(0)
  expect(dryRun.stdout).toContain("::warning::")
})

test("a hotfix takes its first sentence from its own file and names the release it follows", () => {
  const read = (path: string) => path === "store/notes/hotfix/2.0.1.md"
    ? "<!-- for reviewers -->\nFixes auto-add after a YouTube change to the watch page's player data.\nIgnored second line."
    : path === "store/release-notes/2.0.1.md" ? "- Auto-add works again after a YouTube change." : fromRepo(path)
  const { template, metadata, problems } = buildAmoMetadata({ version: "2.0.1", kind: "patch", channel: "stable", previous: "2.0.0", read })
  expect(template).toBe("hotfix")
  expect(metadata.version.approval_notes).toStartWith(
    "Fixes auto-add after a YouTube change to the watch page's player data. No permission, data or listing changes. Same build instructions as 2.0.0, in SOURCE_CODE_REVIEW.md in the sources zip."
  )
  expect(problems).toEqual(["store/notes/reviewer-hotfix.md has no value for {email}, {password}, {code1}, {code2}"])
})

test("a hotfix without its fix file or release notes is reported", () => {
  const { problems } = buildAmoMetadata({ version: "2.0.2", kind: "patch", channel: "stable", previous: "2.0.1", read: fromRepo })
  expect(problems).toContain("store/release-notes/2.0.2.md is missing")
  expect(problems).toContain("store/notes/hotfix/2.0.2.md is missing")
  expect(problems.some(problem => problem.includes("{fix}"))).toBe(true)
})

test("a beta names the release it precedes", () => {
  expect(nextRelease("1.99.7")).toBe("2.0.0")
  expect(nextRelease("2.0.901")).toBe("2.1.0")
  expect(nextRelease("2.3.912")).toBe("2.4.0")
  expect(nextRelease("2.0.1")).toBeUndefined()
})
