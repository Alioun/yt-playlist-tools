/**
 * Puts the reviewer test account into a version's AMO reviewer notes
 * (REL-STORE-21, REL-STORE-24, REL-STORE-25). The only code that reads
 * AMO_REVIEWER_LOGIN.
 *
 * Usage:
 *   bun amo-reviewer-notes.ts check <metadata file>
 *     Checks the notes and, if they ask for the test account, the login. No network.
 *   bun amo-reviewer-notes.ts fill <version> <metadata file>
 *     Checks the same, then sets the version's approval_notes on AMO to the
 *     filled notes.
 *
 * <metadata file> is the build's amo-metadata.json. Its approval_notes carry
 * {email}, {password}, {code1} and {code2}, or none of them (the beta template).
 * AMO_REVIEWER_LOGIN is four lines: e-mail, password, backup code, backup code.
 * fill also reads FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET.
 *
 * It prints one fixed line, never any part of the login, the notes or AMO's
 * answer. It writes no file and spawns nothing. The owner's approval (G28)
 * covers this exact file: .audit/2.0-build/ci-reviewer-credentials-design.md.
 */
import { createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"

const API = "https://addons.mozilla.org/api/v5"
const USAGE = "usage: amo-reviewer-notes.ts check <metadata file> | fill <version> <metadata file>"
const FIELDS = ["email", "password", "code1", "code2"] as const

type Login = Record<(typeof FIELDS)[number], string>
type Outcome = { line: string; exit: 0 | 1 | 2 }

const done = (detail: string): Outcome => ({ line: `reviewer-notes: ${detail}`, exit: 0 })
const failed = (code: string): Outcome => ({ line: `::error::reviewer-notes: ${code}`, exit: 1 })

/** The template's approval_notes, "" when it has none, undefined when unreadable. */
function readNotes(path: string): string | undefined {
  try {
    const notes: unknown = JSON.parse(readFileSync(path, "utf8"))?.version?.approval_notes
    return notes === undefined ? "" : typeof notes === "string" ? notes : undefined
  } catch {
    return undefined
  }
}

/** The login, or the fixed failure that names what's wrong with it. */
function parseLogin(raw: string | undefined): Login | Outcome {
  if (!raw) return failed("login-missing (AMO_REVIEWER_LOGIN is not set)")
  const lines = raw.replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n")
  if (lines.length !== 4) return failed(`login-malformed (expected 4 lines, got ${lines.length})`)
  const [email = "", password = "", code1 = "", code2 = ""] = lines
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failed("login-malformed (line 1 is not an e-mail address)")
  // Google's passwords can't start or end with a space, and GitHub masks each line trimmed.
  if (!password || password.trim() !== password) return failed("login-malformed (line 2 is empty or padded)")
  const backupCode = /^\d{4} ?\d{4}$/
  if (!backupCode.test(code1)) return failed("login-malformed (line 3 is not an 8-digit backup code)")
  if (!backupCode.test(code2)) return failed("login-malformed (line 4 is not an 8-digit backup code)")
  if (code1.replace(" ", "") === code2.replace(" ", "")) return failed("login-malformed (lines 3 and 4 are the same code)")
  return { email, password, code1, code2 }
}

/** One pass, so a value is never read as a placeholder or a `$` pattern. */
function fill(notes: string, login: Login): string {
  return notes.replace(new RegExp(`\\{(${FIELDS.join("|")})\\}`, "g"), (_, field: keyof Login) => login[field])
}

/** A short-lived JWT, as AMO's API keys docs describe (the same as amo-version.ts). */
function jwt(issuer: string, secret: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: issuer, jti: randomUUID(), iat: now, exp: now + 60 })}`
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`
}

async function upload(version: string, notes: string, env: NodeJS.ProcessEnv): Promise<Outcome> {
  const { FIREFOX_EXTENSION_ID: addon, FIREFOX_JWT_ISSUER: issuer, FIREFOX_JWT_SECRET: secret } = env
  if (!addon || !issuer || !secret) {
    return failed("amo-keys-missing (FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set)")
  }
  let response: Response
  try {
    // The "v" prefix looks the version up by number; AMO finds the GUID only with its braces.
    response = await fetch(`${API}/addons/addon/${encodeURIComponent(addon)}/versions/v${version}/`, {
      method: "PATCH",
      headers: { Authorization: `JWT ${jwt(issuer, secret)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approval_notes: notes })
    })
  } catch {
    return failed("upload-failed (no answer from AMO)")
  }
  if (!response.ok) return failed(`upload-failed (AMO answered ${response.status})`)
  const stored: unknown = await response.json().then(
    (body: { approval_notes?: unknown } | null) => body?.approval_notes,
    () => undefined
  )
  if (stored === undefined) return done(`filled (AMO version ${version}; its answer does not show the notes)`)
  return stored === notes ? done(`filled (AMO version ${version}, confirmed)`) : failed("upload-unconfirmed (AMO kept different notes)")
}

/** `check <file>`, or `fill <version> <file>`, which alone has a version. */
function parseArgs([command, ...rest]: string[]): { version?: string; path: string } | undefined {
  if (command === "check" && rest.length === 1 && rest[0]) return { path: rest[0] }
  const [version = "", path = ""] = rest
  if (command === "fill" && rest.length === 2 && /^\d+\.\d+\.\d+$/.test(version) && path) return { version, path }
  return undefined
}

async function run(args: string[], env: NodeJS.ProcessEnv): Promise<Outcome> {
  const parsed = parseArgs(args)
  if (!parsed) return { line: USAGE, exit: 2 }
  const { version, path } = parsed

  const notes = readNotes(path)
  if (notes === undefined) return failed("notes-unreadable (the metadata file is missing, not JSON, or its approval_notes is not text)")
  const missing = FIELDS.filter(field => !notes.includes(`{${field}}`))
  if (missing.length === FIELDS.length) return done("skipped (the notes have no test-account placeholders)")
  if (missing.length) return failed(`template-incomplete (the notes lack ${missing.map(field => `{${field}}`).join(", ")})`)

  const login = parseLogin(env.AMO_REVIEWER_LOGIN)
  if ("exit" in login) return login
  return version === undefined ? done("ready") : upload(version, fill(notes, login), env)
}

const outcome = await run(process.argv.slice(2), process.env).catch(() => failed("internal-error"))
if (outcome.exit === 2) console.error(outcome.line)
else console.log(outcome.line)
process.exitCode = outcome.exit
