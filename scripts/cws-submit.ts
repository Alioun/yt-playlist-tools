/**
 * Uploads a zip to the Chrome Web Store (API v2) and submits it for review.
 *
 * Usage: bun scripts/cws-submit.ts <chrome zip> <version>
 *
 * `wxt submit` (publish-browser-extension 6.1.1 and 6.2.0) fails any upload
 * that isn't SUCCEEDED at once, but v2 may answer IN_PROGRESS and expects
 * fetchStatus to be polled. This does that. A version already submitted or
 * published is left alone, so a re-run is safe.
 *
 * Reads CHROME_PUBLISHER_ID, CHROME_EXTENSION_ID,
 * CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL, CHROME_SERVICE_ACCOUNT_PRIVATE_KEY and
 * CHROME_PUBLISH_TYPE (DEFAULT_PUBLISH or STAGED_PUBLISH). Never sets
 * skipReview (REL-CI-35).
 */
import { createSign } from "node:crypto"

const API = "https://chromewebstore.googleapis.com"
const SCOPE = "https://www.googleapis.com/auth/chromewebstore"
const POLL_SECONDS = 10
const UPLOAD_TIMEOUT_MINUTES = 10

const {
  CHROME_PUBLISHER_ID,
  CHROME_EXTENSION_ID,
  CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL,
  CHROME_SERVICE_ACCOUNT_PRIVATE_KEY,
  CHROME_PUBLISH_TYPE = "DEFAULT_PUBLISH"
} = process.env

const [zip, version] = process.argv.slice(2)
if (!zip || !version) {
  console.error("usage: cws-submit.ts <chrome zip> <version>")
  process.exit(2)
}
if (
  !CHROME_PUBLISHER_ID ||
  !CHROME_EXTENSION_ID ||
  !CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL ||
  !CHROME_SERVICE_ACCOUNT_PRIVATE_KEY
) {
  console.error("the CHROME_* publisher, extension and service-account variables must be set")
  process.exit(2)
}

const item = `publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}`

/** Exchanges a signed service-account JWT for an access token. */
async function accessToken(): Promise<string> {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })}`
  // Tolerate a PEM pasted with literal \n, as the secret sometimes is.
  const key = CHROME_SERVICE_ACCOUNT_PRIVATE_KEY!.replaceAll("\\n", "\n")
  const signature = createSign("RSA-SHA256").update(body).sign(key, "base64url")
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${body}.${signature}`
    })
  })
  if (!response.ok) throw new Error(`token exchange failed with ${response.status}: ${await response.text()}`)
  return ((await response.json()) as { access_token: string }).access_token
}

const token = await accessToken()

async function call<T>(method: string, url: string, body?: BodyInit, contentType?: string): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(contentType && { "Content-Type": contentType }) },
    body
  })
  if (!response.ok) throw new Error(`${method} ${url} failed with ${response.status}: ${await response.text()}`)
  return (await response.json()) as T
}

type Revision = { state?: string; distributionChannels?: { crxVersion?: string }[] }
type Status = {
  lastAsyncUploadState?: string
  submittedItemRevisionStatus?: Revision
  publishedItemRevisionStatus?: Revision
}

const fetchStatus = () => call<Status>("GET", `${API}/v2/${item}:fetchStatus`)
const has = (revision: Revision | undefined) =>
  revision?.distributionChannels?.some((channel) => channel.crxVersion === version) ?? false

const before = await fetchStatus()
if (has(before.submittedItemRevisionStatus) || has(before.publishedItemRevisionStatus)) {
  console.log(`Version ${version} is already submitted or published; nothing to do.`)
  process.exit(0)
}

console.log(`Uploading ${zip}`)
const upload = await call<{ uploadState?: string; crxVersion?: string }>(
  "POST",
  `${API}/upload/v2/${item}:upload`,
  Bun.file(zip),
  "application/zip"
)

let state = upload.uploadState
const deadline = Date.now() + UPLOAD_TIMEOUT_MINUTES * 60_000
while (state === "IN_PROGRESS") {
  if (Date.now() > deadline) throw new Error(`the upload was still processing after ${UPLOAD_TIMEOUT_MINUTES} minutes`)
  console.log("The upload is processing; checking again shortly")
  await Bun.sleep(POLL_SECONDS * 1000)
  state = (await fetchStatus()).lastAsyncUploadState
}
if (state !== "SUCCEEDED") throw new Error(`the upload ended as ${state ?? "no state"}`)
if (upload.crxVersion && upload.crxVersion !== version) {
  throw new Error(`the store read version ${upload.crxVersion} from the zip, expected ${version}`)
}

console.log(`Submitting for review (${CHROME_PUBLISH_TYPE})`)
const published = await call<{ state?: string; warningInfo?: { warnings?: { reason: string; description: string }[] } }>(
  "POST",
  `${API}/v2/${item}:publish`,
  JSON.stringify({ publishType: CHROME_PUBLISH_TYPE }),
  "application/json"
)
for (const warning of published.warningInfo?.warnings ?? []) {
  console.log(`::warning::${warning.reason}: ${warning.description}`)
}
console.log(`Submitted version ${version}: ${published.state ?? "no state returned"}`)
