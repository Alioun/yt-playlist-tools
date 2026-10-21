/**
 * Asks AMO about one version of this add-on, so a re-run never uploads the
 * same version twice (AMO version numbers are unique across channels,
 * REL-CI-05).
 *
 * Usage:
 *   bun scripts/amo-version.ts exists <version>
 *     Prints "true" or "false".
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

type Version = { file: { url: string; status: string } | null }

/** The version's details, or null if AMO has no such version. */
async function getVersion(version: string): Promise<Version | null> {
  // The "v" prefix forces a lookup by version number rather than by id.
  const response = await get(`${API}/addons/addon/${encodeURIComponent(addonId)}/versions/v${version}/`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`AMO answered ${response.status}: ${await response.text()}`)
  return (await response.json()) as Version
}

const [command, version, dir, timeoutMinutes = "30"] = process.argv.slice(2)

if (command === "exists" && version) {
  console.log((await getVersion(version)) ? "true" : "false")
} else if (command === "download" && version && dir) {
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
  mkdirSync(dir, { recursive: true })
  const path = join(dir, decodeURIComponent(new URL(details.file.url).pathname.split("/").pop()!))
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  console.log(`Downloaded ${path}`)
} else {
  console.error("usage: amo-version.ts exists <version> | download <version> <dir> [timeout minutes]")
  process.exit(2)
}
