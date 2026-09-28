import { createFetchHandler } from "./handler"

/**
 * Process entry point for the token broker. All request handling lives in
 * ./handler.ts so it can be unit tested without binding a port.
 */

const PORT = Number(process.env.PORT) || 3847

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set")
  process.exit(1)
}

// Comma-separated. Chrome: the extension id. Firefox: the sha1 the options page
// shows in the mozoauth2 redirect URI.
const ALLOWED_EXTENSION_IDS = (process.env.ALLOWED_EXTENSION_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)

if (ALLOWED_EXTENSION_IDS.length === 0) {
  console.warn(
    "ALLOWED_EXTENSION_IDS is not set: this broker will exchange tokens for " +
      "ANY extension. Set it to your extension ids to stop third parties " +
      "using your Google client."
  )
}

const server = Bun.serve({
  port: PORT,
  fetch: createFetchHandler({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    allowedExtensionIds: ALLOWED_EXTENSION_IDS
  })
})

console.log(`Auth server running on http://localhost:${server.port}`)
