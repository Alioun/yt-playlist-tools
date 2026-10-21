/**
 * Builds the AMO metadata file both submit paths read: `wxt submit`
 * (FIREFOX_AMO_METADATA_FILE) and `web-ext sign --amo-metadata`. Both merge
 * the `version` object into the version they create (REL-CI-30).
 *
 * Usage: bun scripts/amo-metadata.ts --version V --kind K --channel C --out F [--strict]
 *
 * With --strict (a release build) a missing notes file fails; otherwise it's a
 * warning, so a dry run still goes green.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    kind: { type: "string" },
    channel: { type: "string" },
    out: { type: "string" },
    strict: { type: "boolean", default: false }
  }
})

const { version, kind, channel, out, strict } = values
if (!version || !kind || !channel || !out) {
  console.error("usage: amo-metadata.ts --version V --kind K --channel C --out F [--strict]")
  process.exit(2)
}

// Betas get the beta template, patches the hotfix one, everything else the full one.
const template = channel === "beta" ? "beta" : kind === "patch" ? "hotfix" : "full"
const files = {
  releaseNotes: `store/release-notes/${version}.md`,
  approvalNotes: `store/notes/reviewer-${template}.md`
}

let missing = false
function read(path: string): string | undefined {
  if (existsSync(path)) return readFileSync(path, "utf8").trim()
  console.log(`::${strict ? "error" : "warning"}::${path} is missing`)
  missing = true
  return undefined
}

const releaseNotes = read(files.releaseNotes)
const approvalNotes = read(files.approvalNotes)

const metadata = {
  version: {
    // AMO's v5 API wants a locale object here and rejects a plain string (REL-CI-31).
    ...(releaseNotes && { release_notes: { "en-US": releaseNotes } }),
    ...(approvalNotes && { approval_notes: approvalNotes })
  }
}

writeFileSync(out, JSON.stringify(metadata, null, 2) + "\n")
console.log(`Wrote ${out} (reviewer notes: ${template})`)
if (strict && missing) process.exit(1)
