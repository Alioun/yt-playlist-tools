/**
 * Asks AMO about one version of this add-on, so a re-run never uploads the
 * same version twice (AMO version numbers are unique across channels,
 * REL-CI-05).
 *
 * Usage:
 *   bun scripts/amo-version.ts status <version>
 *     Prints "missing", "no-source" (created, but its sources upload never
 *     finished) or "present".
 *   bun scripts/amo-version.ts attach-source <version> <sources zip>
 *     Uploads the sources of a version that has none.
 *   bun scripts/amo-version.ts download <version> <dir> [timeout minutes]
 *     Waits for the version's file to be signed, then downloads the .xpi.
 *
 * Reads FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET.
 */
import { createHmac, randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const API = "https://addons.mozilla.org/api/v5"

const { FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER, FIREFOX_JWT_SECRET } = process.env
if (!FIREFOX_EXTENSION_ID || !FIREFOX_JWT_ISSUER || !FIREFOX_JWT_SECRET) {
  console.error("FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set")
  process.exit(2)
}

// AMO finds a GUID-style ID only with its braces (checked 2026-10-21).
const addonId = FIREFOX_EXTENSION_ID

/** A short-lived JWT, as AMO's API keys docs describe. */
function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: FIREFOX_JWT_ISSUER,
    jti: randomUUID(),
    iat: now,
    exp: now + 60
  })}`
  const signature = createHmac("sha256", FIREFOX_JWT_SECRET!).update(body).digest("base64url")
  return `${body}.${signature}`
}

function get(url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `JWT ${jwt()}` } })
}

// `source` is only returned to the add-on's authors, and is null when none was uploaded.
type Version = { source: string | null; file: { url: string; status: string } | null }

function versionUrl(version: string): string {
  // The "v" prefix forces a lookup by version number rather than by id.
  return `${API}/addons/addon/${encodeURIComponent(addonId)}/versions/v${version}/`
}

/** The version's details, or null if AMO has no such version. */
async function getVersion(version: string): Promise<Version | null> {
  const response = await get(versionUrl(version))
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`AMO answered ${response.status}: ${await response.text()}`)
  return (await response.json()) as Version
}

// `path` is the sources zip for attach-source, the download dir for download.
const [command, version, path, timeoutMinutes = "30"] = process.argv.slice(2)

if (command === "status" && version) {
  const details = await getVersion(version)
  if (!details) console.log("missing")
  else if (!("source" in details)) throw new Error("AMO didn't return `source`; are these the add-on author's API keys?")
  else console.log(details.source ? "present" : "no-source")
} else if (command === "attach-source" && version && path) {
  // Sources can't be sent as JSON; AMO wants multipart form data.
  const form = new FormData()
  form.set("source", Bun.file(path))
  const response = await fetch(versionUrl(version), {
    method: "PATCH",
    headers: { Authorization: `JWT ${jwt()}` },
    body: form
  })
  if (!response.ok) throw new Error(`attaching sources failed with ${response.status}: ${await response.text()}`)
  console.log(`Attached ${path} to version ${version}`)
} else if (command === "download" && version && path) {
  const deadline = Date.now() + Number(timeoutMinutes) * 60_000
  let details = await getVersion(version)
  while (details?.file?.status !== "public") {
    if (!details) throw new Error(`AMO has no version ${version}`)
    if (details.file?.status === "disabled") throw new Error(`AMO rejected version ${version}`)
    if (Date.now() > deadline) throw new Error(`version ${version} wasn't signed within ${timeoutMinutes} minutes`)
    console.log(`Waiting for version ${version} to be signed (status: ${details.file?.status ?? "no file"})`)
    await Bun.sleep(30_000)
    details = await getVersion(version)
  }
  const response = await get(details.file.url)
  if (!response.ok) throw new Error(`downloading ${details.file.url} failed with ${response.status}`)
  mkdirSync(path, { recursive: true })
  const xpi = join(path, decodeURIComponent(new URL(details.file.url).pathname.split("/").pop()!))
  writeFileSync(xpi, Buffer.from(await response.arrayBuffer()))
  console.log(`Downloaded ${xpi}`)
} else {
  console.error(
    "usage: amo-version.ts status <version> | attach-source <version> <zip> | download <version> <dir> [timeout minutes]"
  )
  process.exit(2)
}
