import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash, createHmac } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Credential-free (G28): every value below is a fake, and each child process
// gets an environment built from scratch, so no real secret can reach it.

const root = resolve(import.meta.dir, "../..")
const script = join(root, "scripts/amo-reviewer-notes.ts")

type Step = { name?: string; if?: unknown; env?: Record<string, string>; run?: string }
type Job = { env?: Record<string, string>; steps: Step[] }
const workflowText = readFileSync(join(root, ".github/workflows/release.yml"), "utf8")
const workflow = Bun.YAML.parse(workflowText) as { env: Record<string, string>; jobs: Record<string, Job> }
const submitAmo = workflow.jobs["submit-amo"]!
const loginSteps = submitAmo.steps.filter(step => step.env && "AMO_REVIEWER_LOGIN" in step.env)
const [checkStep, fillStep] = loginSteps as [Step, Step]

// The password carries JSON escapes, a `$&` replacement pattern and a placeholder.
const login = {
  email: "dummy-reviewer@example.invalid",
  password: 'dummy-reviewer-password-0000"\\$&{code1}',
  code1: "0000 1111",
  code2: "2222 3333"
}
const rawLogin = `${login.email}\n${login.password}\n${login.code1}\n${login.code2}\n`
const jwtIssuer = "dummy-jwt-issuer-0000"
const jwtSecret = "dummy-jwt-secret-0000"
const sensitive = { ...login, rawLogin: rawLogin.trim(), jwtSecret }

/** A value as a log could carry it: raw, JSON-escaped once or twice, URL-encoded, or inside base64 at any byte offset, each also without its spaces. */
function forms(value: string): string[] {
  return [value, value.replaceAll(" ", "")].flatMap(plain => {
    const json = JSON.stringify(plain).slice(1, -1)
    const url = encodeURIComponent(plain)
    const bytes = Buffer.from(plain)
    const base64 = [0, 1, 2].flatMap(offset => {
      const whole = bytes.subarray(offset, offset + Math.floor((bytes.length - offset) / 3) * 3)
      return [whole.toString("base64"), whole.toString("base64url")]
    })
    return [plain, json, JSON.stringify(json).slice(1, -1), url, url.replaceAll("%20", "+"), ...base64]
  }).filter(form => form.length >= 8)
}

/** The names of the sensitive values in `text`, in any of their forms. Never the values. */
function leaks(text: string): string[] {
  return Object.entries(sensitive)
    .filter(([, value]) => forms(value).some(form => text.includes(form)))
    .map(([name]) => name)
}

const fullNotes = [
  "**Test account:**",
  "- {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check.",
  "- Any Google account with a YouTube channel also works."
].join("\n")
const filledNotes = [
  "**Test account:**",
  `- ${login.email} / ${login.password}, with backup codes ${login.code1}, ${login.code2} for Google's sign-in check.`,
  "- Any Google account with a YouTube channel also works."
].join("\n")
const betaNotes = "Pre-release 1.99.2 of 2.0.0, self-distributed to testers. Same build instructions."

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A runner workspace: the checkout's script, the artifact's metadata, and a `bun` that preloads the fake AMO. */
function workspace(notes?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-"))
  directories.push(dir)
  for (const sub of ["scripts", "dist", "_temp", "_shims"]) mkdirSync(join(dir, sub))
  copyFileSync(script, join(dir, "scripts/amo-reviewer-notes.ts"))
  copyFileSync(join(import.meta.dir, "fixtures/fake-amo.ts"), join(dir, "_shims/fake-amo.ts"))
  writeFileSync(
    join(dir, "_shims/bun"),
    `#!/bin/sh\nexec "${process.execPath}" --preload "${join(dir, "_shims/fake-amo.ts")}" "$@"\n`,
    { mode: 0o755 }
  )
  if (notes !== undefined) {
    const metadata = { version: { release_notes: { "en-US": "Release notes." }, approval_notes: notes } }
    writeFileSync(join(dir, "dist/amo-metadata.json"), JSON.stringify(metadata, null, 2) + "\n")
  }
  return dir
}

type Options = { login?: string | null; mode?: string; digest?: string; amoKeys?: boolean }

/** Runs a step's real `run:` block under `bash -e -x`, so stderr traces every command line it spawns. */
function runStep(step: Step, dir: string, { login = rawLogin, mode = "store", digest, amoKeys = true }: Options = {}) {
  const env: Record<string, string> = {
    PATH: `${join(dir, "_shims")}:/usr/bin:/bin`,
    HOME: dir,
    GITHUB_WORKSPACE: dir,
    RUNNER_TEMP: join(dir, "_temp"),
    VERSION: "2.0.0",
    REVIEWER_NOTES_SHA256: digest ?? submitAmo.env!.REVIEWER_NOTES_SHA256!,
    FAKE_AMO_LOG: join(dir, "amo-requests.jsonl"),
    FAKE_AMO_MODE: mode
  }
  if (login !== null) env.AMO_REVIEWER_LOGIN = login
  if (amoKeys) Object.assign(env, { FIREFOX_JWT_ISSUER: jwtIssuer, FIREFOX_JWT_SECRET: jwtSecret })
  if (amoKeys && step.env?.FIREFOX_EXTENSION_ID === "${{ env.AMO_GUID }}") env.FIREFOX_EXTENSION_ID = workflow.env.AMO_GUID!
  const result = spawnSync("bash", ["-e", "-x", "-c", step.run!], { cwd: dir, env, encoding: "utf8", timeout: 20000 })
  const log = join(dir, "amo-requests.jsonl")
  const requests = existsSync(log)
    ? readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as Record<string, string>)
    : []
  return { exit: result.status, stdout: result.stdout, trace: result.stderr, requests }
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort()
}

describe("the leak check", () => {
  test("finds each value in every form a log could carry it", () => {
    for (const [name, value] of Object.entries(sensitive)) {
      const carried = [
        value,
        JSON.stringify({ notes: value }),
        JSON.stringify(JSON.stringify({ notes: value })),
        `curl --data-raw '${JSON.stringify(JSON.stringify(value))}'`,
        new URLSearchParams({ notes: value }).toString(),
        `https://example.invalid/?notes=${encodeURIComponent(value)}`,
        ...["", "a", "ab"].map(prefix => Buffer.from(`${prefix}${value} and more`).toString("base64")),
        ...["", "a", "ab"].map(prefix => Buffer.from(`${prefix}${value} and more`).toString("base64url")),
        `logged as ${value.replaceAll(" ", "")}`
      ]
      for (const text of carried) expect({ name, found: leaks(text).includes(name) }).toEqual({ name, found: true })
    }
  })
})

describe("the release workflow", () => {
  test("only submit-amo's two reviewer-notes steps receive AMO_REVIEWER_LOGIN, each through its own env", () => {
    expect(workflowText.split("secrets.AMO_REVIEWER_LOGIN").length - 1).toBe(2)
    expect(loginSteps.map(step => [step.name, step.env!.AMO_REVIEWER_LOGIN])).toEqual([
      ["Check the reviewer test account", "${{ secrets.AMO_REVIEWER_LOGIN }}"],
      ["Put the reviewer test account into the reviewer notes", "${{ secrets.AMO_REVIEWER_LOGIN }}"]
    ])
  })

  test("no workflow- or job-level env holds a secret, where every step would see it", () => {
    const dir = join(root, ".github/workflows")
    const wide = readdirSync(dir).flatMap(file => {
      const parsed = Bun.YAML.parse(readFileSync(join(dir, file), "utf8")) as { env?: Record<string, string>; jobs: Record<string, Job> }
      return [[file, parsed.env] as const, ...Object.entries(parsed.jobs).map(([id, job]) => [`${file} > ${id}`, job.env] as const)]
        .flatMap(([at, env]) => Object.entries(env ?? {}).filter(([, value]) => String(value).includes("secrets")).map(([name]) => `${at} > ${name}`))
    })
    expect(wide).toEqual([])
  })

  test("the steps never put the login on a command line", () => {
    for (const step of loginSteps) {
      expect(step.run).not.toContain("AMO_REVIEWER_LOGIN")
      expect(step.run).not.toContain("secrets.")
    }
  })

  test("both steps stay off until the owner approves G28", () => {
    expect(loginSteps.map(step => step.if)).toEqual([false, false])
  })

  test("the login is checked before anything is submitted, and filled in once AMO has the version", () => {
    const at = (name: string) => submitAmo.steps.findIndex(step => step.name === name)
    expect(at("Check the reviewer test account")).toBeLessThan(at("Is this version already on AMO?"))
    expect(at("Check the reviewer test account")).toBeLessThan(at("Submit to AMO (listed)"))
    expect(at("Put the reviewer test account into the reviewer notes")).toBeGreaterThan(at("Check AMO has the version with its sources"))
  })

  // A change to the script is a change to approved secret-handling code: it
  // needs the owner's approval again before this pin moves.
  test("REVIEWER_NOTES_SHA256 pins the script as it is", () => {
    expect(createHash("sha256").update(readFileSync(script)).digest("hex")).toBe(submitAmo.env!.REVIEWER_NOTES_SHA256!)
  })

  test("the script imports only Node built-ins and has no way to spawn a process", () => {
    const source = readFileSync(script, "utf8")
    const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(source).map(found => found.path)
    expect(imports).toEqual(["node:crypto", "node:fs"])
    expect(source).not.toMatch(/\bBun\.|child_process|process\.(binding|dlopen)/)
  })
})

describe("the check step", () => {
  test("passes a well-formed login without touching AMO, and prints nothing of it", () => {
    const run = runStep(checkStep, workspace(fullNotes))
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: ready\n", requests: [] })
    expect(run.trace).toContain("+ bun --no-env-file amo-reviewer-notes.ts check")
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("skips the beta template, which asks for no account, even with no login set", () => {
    const run = runStep(checkStep, workspace(betaNotes), { login: null })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: skipped (the notes have no test-account placeholders)\n" })
  })

  test("accepts a login stored with Windows line endings", () => {
    const run = runStep(checkStep, workspace(fullNotes), { login: rawLogin.replaceAll("\n", "\r\n") })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: ready\n" })
  })

  const malformed: [string, string, string][] = [
    ["a missing login", "", "login-missing (AMO_REVIEWER_LOGIN is not set)"],
    ["three lines", `${login.email}\n${login.password}\n${login.code1}\n`, "login-malformed (expected 4 lines, got 3)"],
    ["five lines", `${rawLogin}${login.code1}\n`, "login-malformed (expected 4 lines, got 5)"],
    ["an e-mail without a domain", `dummy-reviewer\n${login.password}\n${login.code1}\n${login.code2}\n`, "login-malformed (line 1 is not an e-mail address)"],
    ["a padded password", `${login.email}\n ${login.password}\n${login.code1}\n${login.code2}\n`, "login-malformed (line 2 is empty or padded)"],
    ["an empty password", `${login.email}\n\n${login.code1}\n${login.code2}\n`, "login-malformed (line 2 is empty or padded)"],
    ["a short first code", `${login.email}\n${login.password}\n0000 111\n${login.code2}\n`, "login-malformed (line 3 is not an 8-digit backup code)"],
    ["a lettered second code", `${login.email}\n${login.password}\n${login.code1}\ndummy-code\n`, "login-malformed (line 4 is not an 8-digit backup code)"],
    ["one code twice", `${login.email}\n${login.password}\n${login.code1}\n00001111\n`, "login-malformed (lines 3 and 4 are the same code)"]
  ]
  test.each(malformed)("fails %s with a fixed line that quotes none of it", (_, value, code) => {
    const run = runStep(checkStep, workspace(fullNotes), { login: value })
    expect(run).toMatchObject({ exit: 1, stdout: `::error::reviewer-notes: ${code}\n`, requests: [] })
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("fails a template that asks for only part of the account", () => {
    const run = runStep(checkStep, workspace("- {email} / {password}"))
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: template-incomplete (the notes lack {code1}, {code2})\n" })
  })

  test("fails when the artifact has no readable metadata", () => {
    const run = runStep(checkStep, workspace())
    expect(run).toMatchObject({
      exit: 1,
      stdout: "::error::reviewer-notes: notes-unreadable (the metadata file is missing, not JSON, or its approval_notes is not text)\n"
    })
  })

  test("refuses to run a script that isn't the pinned one", () => {
    const run = runStep(checkStep, workspace(fullNotes), { digest: "f".repeat(64) })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::amo-reviewer-notes.ts is not the approved version (G28)\n", requests: [] })
    expect(run.trace).not.toContain("+ bun ")
  })
})

describe("the fill step", () => {
  test("sends AMO the filled notes once, as a signed PATCH of that version", () => {
    const run = runStep(fillStep, workspace(fullNotes))
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(run.trace).toContain("+ bun --no-env-file amo-reviewer-notes.ts fill 2.0.0")
    expect(leaks(run.stdout + run.trace)).toEqual([])

    expect(run.requests).toHaveLength(1)
    const [request] = run.requests as [Record<string, string>]
    expect(request.method).toBe("PATCH")
    expect(request.url).toBe("https://addons.mozilla.org/api/v5/addons/addon/%7Bcc70cd21-2cc6-444b-bd89-496909346091%7D/versions/v2.0.0/")
    expect(request.contentType).toBe("application/json")
    expect(JSON.parse(request.body!)).toEqual({ approval_notes: filledNotes })
    expect(leaks(request.body!)).toEqual(["email", "password", "code1", "code2"])

    const [scheme, token = ""] = request.authorization!.split(" ")
    const [header = "", payload = "", signature] = token.split(".")
    expect(scheme).toBe("JWT")
    expect(createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")).toBe(signature!)
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ iss: jwtIssuer })
  })

  test("the build's metadata never holds the login, and filling leaves it in no file", () => {
    const dir = workspace()
    mkdirSync(join(dir, "store/notes"), { recursive: true })
    mkdirSync(join(dir, "store/release-notes"))
    writeFileSync(join(dir, "store/notes/reviewer-full.md"), fullNotes + "\n")
    writeFileSync(join(dir, "store/release-notes/2.0.0.md"), "Release notes.\n")
    // Without --strict: a release build fails on the four placeholders until amo-metadata.ts lets them through.
    const build = spawnSync(
      process.execPath,
      ["--no-env-file", join(root, "scripts/amo-metadata.ts"), "--version", "2.0.0", "--kind", "major", "--channel", "stable", "--out", "dist/amo-metadata.json"],
      { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: dir, AMO_REVIEWER_LOGIN: rawLogin }, encoding: "utf8" }
    )
    expect(build.status).toBe(0)
    const archived = readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")
    expect(JSON.parse(archived).version.approval_notes).toBe(fullNotes)
    expect(leaks(archived + build.stdout + build.stderr)).toEqual([])

    const run = runStep(fillStep, dir)
    expect(run.exit).toBe(0)
    expect(JSON.parse(run.requests[0]!.body!)).toEqual({ approval_notes: filledNotes })
    expect(readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")).toBe(archived)
    // HOME is the workspace too, so this covers Bun's caches. Only the fake AMO's own log may hold the login.
    const leaked = files(dir)
      .filter(file => file !== "amo-requests.jsonl")
      .flatMap(file => leaks(readFileSync(join(dir, file), "latin1")).map(name => `${file}: ${name}`))
    expect(leaked).toEqual([])
    expect(leaks(readFileSync(join(dir, "amo-requests.jsonl"), "latin1"))).toContain("email")
  })

  const answers: [string, string, 0 | 1, string][] = [
    ["stores the notes without echoing them", "store-silently", 0, "reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)"],
    ["answers 200 with a cut-off body that quotes the notes", "garble", 0, "reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)"],
    ["keeps other notes", "keep-other", 1, "::error::reviewer-notes: upload-unconfirmed (AMO kept different notes)"],
    ["rejects the notes, quoting them", "reject", 1, "::error::reviewer-notes: upload-failed (AMO answered 400)"],
    ["drops the connection with an error that quotes the request", "unreachable", 1, "::error::reviewer-notes: upload-failed (no answer from AMO)"],
    ["gives an answer that throws, quoting the request", "explode", 1, "::error::reviewer-notes: internal-error"]
  ]
  test.each(answers)("when AMO %s, prints only a fixed line", (_, mode, exit, line) => {
    const run = runStep(fillStep, workspace(fullNotes), { mode })
    expect(run).toMatchObject({ exit, stdout: `${line}\n` })
    expect(run.requests).toHaveLength(1)
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("a missing login fails before any request", () => {
    const run = runStep(fillStep, workspace(fullNotes), { login: null })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: login-missing (AMO_REVIEWER_LOGIN is not set)\n", requests: [] })
  })

  test("missing AMO keys fail before any request, naming only the variables", () => {
    const run = runStep(fillStep, workspace(fullNotes), { amoKeys: false })
    expect(run).toMatchObject({
      exit: 1,
      stdout: "::error::reviewer-notes: amo-keys-missing (FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set)\n",
      requests: []
    })
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("leaves the beta's notes alone", () => {
    const run = runStep(fillStep, workspace(betaNotes), { login: null })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: skipped (the notes have no test-account placeholders)\n", requests: [] })
  })

  test("a version that isn't a release number is a usage error, before anything is read", () => {
    const run = spawnSync(process.execPath, ["--no-env-file", script, "fill", "2.0", "dist/amo-metadata.json"], {
      cwd: workspace(fullNotes),
      env: { PATH: "/usr/bin:/bin", AMO_REVIEWER_LOGIN: rawLogin },
      encoding: "utf8"
    })
    expect(run.status).toBe(2)
    expect(run.stdout).toBe("")
    expect(run.stderr).toBe("usage: amo-reviewer-notes.ts check <metadata file> | fill <version> <metadata file>\n")
  })
})
