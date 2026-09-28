import * as store from "@/lib/storage"

/**
 * Default URL of the token broker that holds the Google client secret.
 * Override at build time with WXT_AUTH_SERVER_URL in .env.
 */
export const AUTH_SERVER_URL =
  import.meta.env.WXT_AUTH_SERVER_URL || "http://localhost:3847"

/**
 * The broker to actually talk to.
 *
 * AUTH_SERVER_URL is baked in at build time, which is no help to someone
 * running a published build who wants to self-host: they cannot rebuild it.
 * So the settings panel can store a URL that wins over it, and this is the
 * only thing auth code should call.
 *
 * The trailing slash is stripped because every call site appends "/auth/...",
 * and a pasted URL usually has one.
 */
export async function getAuthServerURL(): Promise<string> {
  const override = (await store.authServerURL.getValue()).trim()
  return (override || AUTH_SERVER_URL).replace(/\/+$/, "")
}
