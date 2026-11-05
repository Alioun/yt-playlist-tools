/**
 * Builds the AMO metadata file both submit paths read: `wxt submit`
 * (FIREFOX_AMO_METADATA_FILE) and `web-ext sign --amo-metadata`. Both merge
 * the `version` object into the version they create (REL-CI-30).
 *
 * Usage: bun scripts/amo-metadata.ts --version V --kind K --channel C --out F [--previous P] [--strict]
 *
 * With --strict (a release build) a missing notes file or an unfilled
 * placeholder fails; otherwise it's a warning, so a dry run still goes green.
 * The reviewer test account's placeholders in the reviewer notes are the one
 * exception: a later, owner-gated step fills them, so they pass through as
 * they are and are only listed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

export type Template = "full" | "hotfix" | "beta"

export type AmoMetadataInput = {
  version: string
  kind: string
  channel: string
  /** The release this one follows, as release-meta.sh reports it. */
  previous?: string
  read: (path: string) => string | undefined
}

export type AmoMetadata = {
  version: {
    release_notes?: { "en-US": string }
    approval_notes?: string
  }
}

export type AmoMetadataResult = {
  template: Template
  metadata: AmoMetadata
  problems: string[]
  /** Reviewer test-account placeholders left in approval_notes for the owner-gated step to fill. */
  deferred: string[]
}

const placeholder = /\{([a-z][a-z0-9]*(?: [a-z0-9]+)*)\}/g
const testAccount: ReadonlySet<string> = new Set(["{email}", "{password}", "{code1}", "{code2}"])

export function templateFor(channel: string, kind: string): Template {
  return channel === "beta" ? "beta" : kind === "patch" ? "hotfix" : "full"
}

/** The release a beta precedes: 1.99.N comes before 2.0.0, X.Y.9NN before X.(Y+1).0 (REL-CI-04). */
export function nextRelease(version: string): string | undefined {
  if (/^1\.99\.\d+$/.test(version)) return "2.0.0"
  const later = /^(\d+)\.(\d+)\.9\d\d$/.exec(version)
  return later ? `${later[1]}.${Number(later[2]) + 1}.0` : undefined
}

/** Maintainer comments in the notes files never reach AMO. */
function withoutComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->\n?/g, "").trim()
}

function fill(text: string, values: Record<string, string | undefined>): { text: string; unfilled: string[] } {
  const unfilled = new Set<string>()
  const filled = text.replace(placeholder, (whole, name: string) => {
    const value = values[name]
    if (value === undefined) unfilled.add(whole)
    return value ?? whole
  })
  return { text: filled, unfilled: [...unfilled] }
}

export function buildAmoMetadata({ version, kind, channel, previous, read }: AmoMetadataInput): AmoMetadataResult {
  const template = templateFor(channel, kind)
  const problems: string[] = []
  const deferred: string[] = []

  function load(path: string): string | undefined {
    const text = read(path)
    if (text === undefined) problems.push(`${path} is missing`)
    return text === undefined ? undefined : withoutComments(text)
  }

  const releaseNotesPath = `store/release-notes/${version}.md`
  const approvalNotesPath = `store/notes/reviewer-${template}.md`
  const fixPath = `store/notes/hotfix/${version}.md`

  const releaseNotes = load(releaseNotesPath)
  const approvalNotes = load(approvalNotesPath)
  const fix = template === "hotfix" ? load(fixPath)?.split("\n")[0]?.trim() || undefined : undefined

  const values = {
    version,
    "next release": nextRelease(version),
    "previous version": previous,
    fix
  }

  const filled: AmoMetadata["version"] = {}
  for (const [path, text, key] of [
    [releaseNotesPath, releaseNotes, "release_notes"],
    [approvalNotesPath, approvalNotes, "approval_notes"]
  ] as const) {
    if (text === undefined) continue
    const result = fill(text, values)
    const later = key === "approval_notes" ? result.unfilled.filter(name => testAccount.has(name)) : []
    const unfilled = result.unfilled.filter(name => !later.includes(name))
    if (unfilled.length > 0) problems.push(`${path} has no value for ${unfilled.join(", ")}`)
    deferred.push(...later)
    // AMO's v5 API wants a locale object here and rejects a plain string (REL-CI-31).
    if (key === "release_notes") filled.release_notes = { "en-US": result.text }
    else filled.approval_notes = result.text
  }

  return { template, metadata: { version: filled }, problems, deferred }
}

function main(): number {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      kind: { type: "string" },
      channel: { type: "string" },
      previous: { type: "string" },
      out: { type: "string" },
      strict: { type: "boolean", default: false }
    }
  })

  const { version, kind, channel, previous, out, strict } = values
  if (!version || !kind || !channel || !out) {
    console.error("usage: amo-metadata.ts --version V --kind K --channel C --out F [--previous P] [--strict]")
    return 2
  }

  const result = buildAmoMetadata({
    version,
    kind,
    channel,
    previous,
    read: path => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
  })

  for (const problem of result.problems) console.log(`::${strict ? "error" : "warning"}::${problem}`)
  if (result.deferred.length > 0) console.log(`::notice::Left for the reviewer test-account step: ${result.deferred.join(", ")}`)
  writeFileSync(out, JSON.stringify(result.metadata, null, 2) + "\n")
  console.log(`Wrote ${out} (reviewer notes: ${result.template})`)
  return strict && result.problems.length > 0 ? 1 : 0
}

if (import.meta.main) process.exit(main())
